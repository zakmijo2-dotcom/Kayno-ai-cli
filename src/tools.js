import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { resolveInWorkspace, workspaceRoot } from './workspace.js';
import { checkPermission } from './permissions.js';
import { truncate } from './util.js';
import { gitStatus, gitDiff, gitLog } from './git.js';
import { unifiedDiff } from './diff.js';
import { diagnosticsForFiles, projectDiagnostics } from './diagnostics-engine.js';

const READ_CAP_BYTES = 48 * 1024;
const GREP_IGNORE = new Set([
  'node_modules', '.git', 'dist', 'build', 'out', 'coverage',
  '__pycache__', '.venv', 'venv', '.nova', '.nova', '.cache', 'target',
]);

function schema(name, description, properties, required = []) {
  return {
    type: 'function',
    function: { name, description, parameters: { type: 'object', properties, required } },
  };
}

export const TOOL_SCHEMAS = [
  schema('read_file', 'Read a text file inside the workspace. Supports line windowing.',
    {
      path: { type: 'string' },
      offset: { type: 'integer', description: '1-based start line (default 1)' },
      limit: { type: 'integer', description: 'Max lines (default 400, hard cap 2000)' },
    }, ['path']),
  schema('write_file', 'Create or overwrite a file with full content. Prefer edit_file to modify existing files.',
    { path: { type: 'string' }, content: { type: 'string' } }, ['path', 'content']),
  schema('edit_file', 'Replace an exact string in a file. old_string must be unique unless expected_count given.',
    {
      path: { type: 'string' },
      old_string: { type: 'string' },
      new_string: { type: 'string' },
      expected_count: { type: 'integer', description: 'Expected occurrences (default 1)' },
    }, ['path', 'old_string', 'new_string']),
  schema('patch_file', 'Apply a unified diff (@@ hunks) to a file.',
    { path: { type: 'string' }, patch: { type: 'string' } }, ['path', 'patch']),
  schema('grep', 'Regex search across workspace text files (skips node_modules/.git/binaries).',
    {
      pattern: { type: 'string', description: 'Regular expression' },
      path: { type: 'string', description: 'Limit to subdirectory' },
      case_insensitive: { type: 'boolean' },
      max_results: { type: 'integer', description: 'Default 100, cap 300' },
    }, ['pattern']),
  schema('glob', 'Find files by glob pattern, e.g. "src/**/*.js".',
    { pattern: { type: 'string' }, path: { type: 'string', description: 'Base dir (default root)' } }, ['pattern']),
  schema('list_dir', 'List directory entries with sizes/types (one level).',
    { path: { type: 'string', description: 'Default "."' } }, []),
  schema('run_command', 'Run shell command (bash -lc) in workspace root; captures output; timeout clamped 5s..600s.',
    { command: { type: 'string' }, timeout_ms: { type: 'integer' } }, ['command']),
  schema('fetch_url', 'HTTP GET a URL and return response text (max 512KB).',
    { url: { type: 'string' } }, ['url']),
  schema('git_status', 'Git working tree status: branch + changed files + counts.', {}, []),
  schema('git_diff', 'Unified diff of changes (worktree by default, or staged).',
    { staged: { type: 'boolean', description: 'Use --cached' } }, []),
  schema('run_diagnostics', 'Run available linters/type-checks on given files (node --check, tsc, py_compile) and project-level checks.',
    { files: { type: 'array', items: { type: 'string' }, description: 'Files to check (default: project-level checks only)' } }, []),
];

export async function executeTool(name, args = {}, opts = {}) {
  await gate(name, args, opts);
  switch (name) {
    case 'read_file': return toolReadFile(args);
    case 'write_file': return toolWriteFile(args);
    case 'edit_file': return toolEditFile(args);
    case 'patch_file': return toolPatchFile(args);
    case 'grep': return toolGrep(args);
    case 'glob': return toolGlob(args);
    case 'list_dir': return toolListDir(args);
    case 'run_command': return toolRunCommand(args);
    case 'fetch_url': return toolFetchUrl(args);
    case 'git_status': return formatGitStatus();
    case 'git_diff': return gitDiff({ staged: !!args.staged });
    case 'run_diagnostics': {
      const perFile = diagnosticsForFiles(Array.isArray(args.files) ? args.files : []);
      const project = projectDiagnostics();
      const lines = [`files checked: ${perFile.ran}`];
      for (const f of perFile.findings) lines.push(`[file] ${f}`);
      for (const p2 of project) {
        lines.push(`[${p2.tool}] ${p2.ok ? 'OK' : 'FAIL\n' + p2.detail}`);
      }
      if (!perFile.findings.length && project.every((x) => x.ok)) {
        lines.push('DIAGNOSTICS CLEAN');
      }
      return lines.join('\n').slice(0, 16 * 1024);
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

async function gate(name, args, { yolo = false, ask = null } = {}) {
  let detail = '';
  if (name === 'write_file') detail = `write ${args.path}`;
  else if (name === 'edit_file') detail = `edit ${args.path}`;
  else if (name === 'patch_file') detail = `patch ${args.path}`;
  else if (name === 'run_command') detail = `run: ${truncate(args.command, 120)}`;
  else if (name === 'fetch_url') detail = `GET ${args.url}`;
  await checkPermission(name, { yolo, ask, detail });
}

function absFor(p) {
  return resolveInWorkspace(String(p ?? ''));
}

function relPath(abs) {
  const rel = relative(workspaceRoot(), abs);
  return rel || abs;
}

function toolReadFile({ path, offset, limit }) {
  const abs = absFor(path);
  const stat = statSync(abs);
  if (stat.isDirectory()) throw new Error(`is a directory: ${path}`);
  if (stat.size > 2 * 1024 * 1024) throw new Error(`file too large (${stat.size}B); use offset/limit`);
  const raw = readFileSync(abs, 'utf8');
  if (raw.includes('\0')) throw new Error(`binary file: ${path}`);
  const lines = raw.split('\n');
  const start = Math.max(1, Number(offset) || 1);
  const maxLines = Math.min(Math.max(1, Number(limit) || 400), 2000);
  let slice = lines.slice(start - 1, start - 1 + maxLines).join('\n');
  if (Buffer.byteLength(slice) > READ_CAP_BYTES) slice = slice.slice(0, READ_CAP_BYTES) + '\n…[cap]';
  return `[${relPath(abs)} · ${start}-${Math.min(start - 1 + maxLines, lines.length)}/${lines.length} lines]\n${slice}`;
}

function toolWriteFile({ path, content }) {
  const abs = resolveInWorkspace(String(path ?? ''), { createOk: true });
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content ?? '');
  return `wrote ${relPath(abs)} (${(content ?? '').length} chars)`;
}

function toolEditFile({ path, old_string, new_string, expected_count }) {
  if (!old_string) throw new Error('old_string required');
  if (old_string === new_string) throw new Error('old_string equals new_string');
  const abs = absFor(path);
  const raw = readFileSync(abs, 'utf8');
  const count = raw.split(old_string).length - 1;
  const want = expected_count == null ? 1 : Number(expected_count);
  if (count === 0) throw new Error(`old_string not found in ${path}`);
  if (count !== want) {
    throw new Error(
      `old_string appears ${count}x but expected_count=${want}; add surrounding context or pass expected_count=${count}`
    );
  }
  const firstLine = raw.slice(0, raw.indexOf(old_string)).split('\n').length;
  writeFileSync(abs, raw.replace(old_string, () => new_string));
  return `edited ${relPath(abs)} · ${count} replacement(s) · near line ${firstLine}`;
}

export function applyUnifiedPatch(original, patch) {
  const lines = patch.replace(/\r\n/g, '\n').split('\n');
  let i = 0;
  while (i < lines.length && !lines[i].startsWith('---')) i++;
  if (i < lines.length && lines[i].startsWith('---')) i++;
  if (i < lines.length && lines[i].startsWith('+++')) i++;

  const result = original.split('\n');
  let applied = 0;
  while (i < lines.length) {
    const hm = lines[i].match(/^@@\s*-(\d+)(?:,(\d+))?\s*\+(\d+)(?:,(\d+))?\s*@@/);
    if (!hm) { i++; continue; }
    const hintOld = Math.max(0, parseInt(hm[1], 10) - 1);
    i++;
    const remove = [];
    const add = [];
    while (
      i < lines.length &&
      !lines[i].startsWith('@@') &&
      !lines[i].startsWith('--- ') &&
      !lines[i].startsWith('+++ ')
    ) {
      const l = lines[i];
      if (l.startsWith('-')) remove.push(l.slice(1));
      else if (l.startsWith('+')) add.push(l.slice(1));
      else if (!l.startsWith('\\ No newline')) {
        const ctx = l.startsWith(' ') ? l.slice(1) : l;
        remove.push(ctx);
        add.push(ctx);
      }
      i++;
    }
    let pos = findBlock(result, remove, hintOld, 0);
    if (pos === -1) pos = findBlock(result, remove, hintOld, 25);
    if (pos === -1) {
      if (remove.length === 0 && add.length > 0) {
        result.splice(Math.min(hintOld, result.length), 0, ...add);
        applied++;
        continue;
      }
      throw new Error(
        `hunk #${applied + 1} context mismatch near line ${hintOld + 1}: expected "${truncate(remove.slice(0, 3).join(' | '), 90)}"`
      );
    }
    result.splice(pos, remove.length, ...add);
    applied++;
  }
  if (applied === 0) throw new Error('no @@ hunks found in patch');
  return { text: result.join('\n'), applied };
}

function findBlock(haystack, needle, hintPos, range) {
  if (needle.length === 0) return Math.min(hintPos, haystack.length);
  for (let off = 0; off <= range; off++) {
    const candidates = off === 0 ? [hintPos] : [hintPos - off, hintPos + off];
    for (const p of candidates) {
      if (p < 0 || p >= haystack.length) continue;
      let match = true;
      for (let j = 0; j < needle.length; j++) {
        if (haystack[p + j] !== needle[j]) { match = false; break; }
      }
      if (match) return p;
    }
  }
  return -1;
}

function toolPatchFile({ path, patch }) {
  if (!patch) throw new Error('patch required');
  const abs = resolveInWorkspace(String(path ?? ''), { createOk: true });
  const original = existsSync(abs) ? readFileSync(abs, 'utf8') : '';
  const { text, applied } = applyUnifiedPatch(original, patch);
  writeFileSync(abs, text);
  return `patched ${relPath(abs)} · ${applied} hunk(s)`;
}

function* walkFiles(baseRel = '') {
  const baseAbs = resolveInWorkspace(baseRel || '.', { createOk: true });
  let entries;
  try {
    entries = readdirSync(baseAbs, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (e.name.startsWith('.') && e.name !== '.github') continue;
    if (GREP_IGNORE.has(e.name)) continue;
    const childRel = baseRel ? `${baseRel}/${e.name}` : e.name;
    let isDir = false;
    try { isDir = e.isDirectory(); } catch {}
    if (isDir) yield* walkFiles(childRel);
    else yield { rel: childRel, abs: join(baseAbs, e.name) };
  }
}

function looksBinary(buf) {
  const n = Math.min(buf.length, 8192);
  for (let i = 0; i < n; i++) if (buf[i] === 0) return true;
  return false;
}

function clipLine(line, max = 160) {
  return line.length > max ? line.slice(0, max) + '…' : line;
}

function toolGrep({ pattern, path = '', case_insensitive = false, max_results = 100 }) {
  if (!pattern) throw new Error('pattern required');
  let re;
  try {
    re = new RegExp(pattern, case_insensitive ? 'i' : '');
  } catch (e) {
    throw new Error(`invalid regex: ${e.message}`);
  }
  const cap = Math.min(Math.max(1, Number(max_results) || 100), 300);
  const results = [];
  let filesSearched = 0;
  for (const f of walkFiles(String(path || ''))) {
    if (results.length >= cap) break;
    let st;
    try { st = statSync(f.abs); } catch { continue; }
    if (!st.isFile() || st.size > 512 * 1024) continue;
    let content;
    try {
      const buf = readFileSync(f.abs);
      if (looksBinary(buf)) continue;
      content = buf.toString('utf8');
    } catch { continue; }
    filesSearched++;
    const lines = content.split('\n');
    for (let ln = 0; ln < lines.length && results.length < cap; ln++) {
      if (re.test(lines[ln])) results.push(`${f.rel}:${ln + 1}:${clipLine(lines[ln])}`);
    }
  }
  return `${results.length} match(es) · ${filesSearched} files${results.length >= cap ? ' (capped)' : ''}\n${results.join('\n')}`;
}

function globToRegExp(pattern) {
  let re = '';
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === '*') {
      if (pattern[i + 1] === '*') {
        re += '.*';
        i++;
        if (pattern[i + 1] === '/') i++;
      } else {
        re += '[^/]*';
      }
    } else if (ch === '?') re += '[^/]';
    else re += ch.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}

function toolGlob({ pattern, path = '' }) {
  if (!pattern) throw new Error('pattern required');
  const re = globToRegExp(pattern);
  const out = [];
  for (const f of walkFiles(String(path || ''))) {
    if (re.test(f.rel) || re.test(f.rel.split('/').pop())) {
      out.push(f.rel);
      if (out.length >= 200) break;
    }
  }
  return `${out.length} file(s)\n${out.join('\n')}`;
}

function toolListDir({ path = '.' }) {
  const abs = resolveInWorkspace(String(path || '.'));
  const entries = readdirSync(abs).slice(0, 500);
  const rows = [];
  for (const e of entries) {
    try {
      const st = statSync(join(abs, e));
      rows.push(`${st.isDirectory() ? '<dir>' : sizeHuman(st.size).padStart(8)}  ${e}${st.isDirectory() ? '/' : ''}`);
    } catch {
      rows.push(`       ??  ${e}`);
    }
  }
  return rows.join('\n');
}

function sizeHuman(n) {
  if (n < 1024) return `${n}B`;
  if (n < 1048576) return `${(n / 1024).toFixed(1)}K`;
  return `${(n / 1048576).toFixed(1)}M`;
}

function toolRunCommand({ command, timeout_ms }) {
  const cmd = String(command || '');
  return runShell(cmd, Math.min(Math.max(Number(timeout_ms) || 120000, 5000), 600000));
}

async function toolFetchUrl({ url }) {
  let parsed;
  try {
    parsed = new URL(String(url));
  } catch {
    throw new Error(`invalid url: ${url}`);
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('only http/https allowed');
  }
  const res = await fetch(parsed, {
    signal: AbortSignal.timeout(30000),
    headers: { 'user-agent': 'nova-cli' },
  });
  const text = await res.text();
  const capped = text.length > 512 * 1024 ? text.slice(0, 512 * 1024) + '\n…[truncated]' : text;
  return `HTTP ${res.status} ${res.headers.get('content-type') ?? ''}\n${capped}`;
}

function formatGitStatus() {
  const st = gitStatus();
  if (!st) return 'not a git repository';
  const head = `branch: ${st.branch || '(detached)'} · +${st.counts.added} ~${st.counts.modified} -${st.counts.deleted}`;
  return `${head}\n${st.files.join('\n') || '(clean)'}`;
}

export function runShell(command, timeoutMs = 120000, cwd = workspaceRoot()) {
  return new Promise((res) => {
    const child = spawn('bash', ['-lc', command], {
      cwd,
      timeout: timeoutMs,
      env: { ...process.env, TERM: process.env.TERM || 'dumb' },
    });
    let out = '';
    child.stdout.on('data', (d) => {
      if (out.length < 256 * 1024) out += d.toString();
    });
    child.stderr.on('data', (d) => {
      if (out.length < 256 * 1024) out += d.toString();
    });
    child.on('error', (e) => res(`spawn error: ${e.message}`));
    child.on('close', (code) => res(`exit=${code ?? 'timeout'}\n${truncate(out.trim(), 128 * 1024)}`));
  });
}

export function buildToolPreview(name, args = {}) {
  const meta = { title: name.replace(/_/g, ' '), target: args.path ?? args.command ?? args.url ?? '' };
  try {
    if (name === 'write_file') {
      const abs = resolveInWorkspace(String(args.path ?? ''));
      const before = existsSync(abs) ? readFileSync(abs, 'utf8') : '';
      return {
        ...meta,
        title: existsSync(abs) ? `Overwrite ${args.path}` : `Create ${args.path}`,
        diffText: unifiedDiff(before, String(args.content ?? ''), 3, args.path),
        infoLines: existsSync(abs) ? [] : [`new file · ${(args.content ?? '').length} chars`],
      };
    }
    if (name === 'edit_file') {
      return {
        ...meta,
        title: `Edit ${args.path}`,
        diffText: unifiedDiff(String(args.old_string ?? ''), String(args.new_string ?? ''), 2, args.path),
      };
    }
    if (name === 'patch_file') {
      return { ...meta, title: `Patch ${args.path}`, diffText: String(args.patch ?? '') };
    }
    if (name === 'run_command') {
      const dangerous = /rm\s+-rf\s+\/|mkfs|dd\s+if=|:\(\)\{|shutdown|reboot/.test(String(args.command ?? ''));
      return { ...meta, title: dangerous ? 'DESTRUCTIVE command' : 'Run command', target: args.command, dangerous };
    }
  } catch {}
  return meta;
}
