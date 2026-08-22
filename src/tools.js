import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve as resolvePath } from 'node:path';

export const TOOL_SCHEMAS = [
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read a text file from disk. Returns full content (truncated at 256KB).',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string', description: 'File path (absolute or relative to cwd)' } },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Create or overwrite a file with the given content.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          content: { type: 'string', description: 'Full file content to write' },
        },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_dir',
      description: 'List files/dirs (1 level) with sizes.',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string', description: 'Directory path, default "."' } },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'run_command',
      description: 'Run a shell command in cwd (bash -lc). Captures stdout/stderr. Timeout 120s.',
      parameters: {
        type: 'object',
        properties: { command: { type: 'string' } },
        required: ['command'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'fetch_url',
      description: 'HTTP GET a URL and return response text (max 512KB).',
      parameters: {
        type: 'object',
        properties: { url: { type: 'string' } },
        required: ['url'],
      },
    },
  },
];

export function toolNames() {
  return TOOL_SCHEMAS.map((t) => t.function.name);
}

export async function executeTool(name, args = {}, { yolo = false, ask = null } = {}) {
  switch (name) {
    case 'read_file': {
      const p = resolvePath(args.path || '.');
      const stat = statSync(p);
      if (stat.size > 256 * 1024) return `File too large (${stat.size} bytes). Read in chunks via run_command.`;
      return readFileSync(p, 'utf8');
    }
    case 'write_file': {
      const p = resolvePath(args.path || '.');
      if (!yolo) {
        const ok = await mustAsk(
          ask,
          `write_file → ${p} (${(args.content || '').length} chars)? [y/N] `
        );
        if (!ok) return 'User declined the write.';
      }
      writeFileSync(p, args.content ?? '');
      return `Wrote ${p} (${(args.content ?? '').length} chars).`;
    }
    case 'list_dir': {
      const p = resolvePath(args.path || '.');
      return readdirSync(p)
        .slice(0, 500)
        .map((e) => {
          let s = '';
          try {
            const st = statSync(join(p, e));
            s = st.isDirectory() ? '<dir>' : `${st.size}b`;
          } catch {}
          return `${s.padEnd(10)} ${e}`;
        })
        .join('\n');
    }
    case 'run_command': {
      const cmd = String(args.command || '');
      if (!yolo) {
        const dangerous = /rm\s+-rf\s+\/|mkfs|dd\s+if=|:\(\)\{|shutdown|reboot/.test(cmd);
        const q = dangerous
          ? `DESTRUCTIVE command detected: "${cmd}". Run it? [y/N] `
          : `run_command: ${cmd}\napprove? [y/N] `;
        const ok = await mustAsk(ask, q);
        if (!ok) return 'User declined this command.';
      }
      return await runShell(cmd);
    }
    case 'fetch_url': {
      const res = await fetch(args.url, { signal: AbortSignal.timeout(30000) });
      const text = await res.text();
      return `HTTP ${res.status}\n` + (text.length > 512 * 1024 ? text.slice(0, 512 * 1024) + '\n…[truncated]' : text);
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

async function mustAsk(ask, q) {
  if (typeof ask !== 'function') {
    throw new Error('confirmation required but no interactive prompt available (use --yolo)');
  }
  return ask(q);
}

function runShell(command) {
  return new Promise((res) => {
    const child = spawn('bash', ['-lc', command], { cwd: process.cwd(), timeout: 120000 });
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (out += d));
    child.on('error', (e) => res(`spawn error: ${e.message}`));
    child.on('close', (code) =>
      res(`exit=${code ?? 'timeout'}\n${out.slice(0, 128 * 1024)}`.trim())
    );
  });
}
