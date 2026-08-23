import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { detectProject } from './project.js';
import { truncate } from './util.js';
import { workspaceRoot } from './workspace.js';
import { join as pathJoin, isAbsolute } from 'node:path';

function wsAbs(file) {
  return isAbsolute(file) ? file : pathJoin(workspaceRoot(), file);
}

function run(cmd, args, { cwd = workspaceRoot(), timeout = 60000 } = {}) {
  try {
    const res = spawnSync(cmd, args, { cwd, encoding: 'utf8', timeout });
    return {
      available: res.error?.code !== 'ENOENT',
      exit: res.status,
      out: ((res.stdout ?? '') + (res.stderr ?? '')).trim(),
    };
  } catch {
    return { available: false, exit: null, out: '' };
  }
}

export function detectLinters(cwd = process.cwd()) {
  const proj = detectProject(cwd);
  const has = (p) => existsSync(join(cwd, p));
  const bin = (b) => existsSync(join(cwd, 'node_modules', '.bin', b));
  return {
    node: true,
    tsc: proj.languages.includes('typescript') && bin('tsc'),
    eslint: (has('.eslintrc') || has('.eslintrc.json') || has('.eslintrc.cjs') || has('eslint.config.js') || has('eslint.config.mjs')) && bin('eslint'),
    python: proj.languages.includes('python'),
    go: proj.languages.includes('go'),
    rust: proj.languages.includes('rust'),
  };
}

const EXT_LANG = {
  '.js': 'js', '.mjs': 'js', '.cjs': 'js',
  '.ts': 'ts', '.mts': 'ts', '.cts': 'ts', '.tsx': 'ts', '.jsx': 'js',
  '.py': 'py',
  '.go': 'go',
  '.rs': 'rust',
};

export function diagnosticsForFiles(files, cwd = process.cwd()) {
  const findings = [];
  let ran = 0;
  for (const file of files ?? []) {
    const dot = String(file).lastIndexOf('.');
    if (dot === -1) continue;
    const ext = String(file).slice(dot);
    const lang = EXT_LANG[ext] ?? null;
    if (!lang) continue;
    ran++;
    if (lang === 'js' || lang === 'ts') {
      if (lang === 'ts') {
        const linters = detectLinters(cwd);
        if (linters.tsc) {
          const r = run(join(cwd, 'node_modules', '.bin', 'tsc'), ['--noEmit'], { cwd });
          if (r.exit !== 0 && r.out) findings.push(`tsc: ${truncate(r.out, 2000)}`);
        }
        continue;
      }
      const r = run(process.execPath, ['--check', wsAbs(file)], { cwd });
      if (r.exit !== 0) findings.push(`node --check ${file}:\n${truncate(r.out, 1500)}`);
    } else if (lang === 'py') {
      const r = run('python3', ['-m', 'py_compile', wsAbs(file)], { cwd });
      if (r.exit !== 0) findings.push(`py_compile ${file}:\n${truncate(r.out, 1500)}`);
    }
  }
  return { ran, findings };
}

export function projectDiagnostics(cwd = process.cwd()) {
  const out = [];
  const linters = detectLinters(cwd);
  if (linters.tsc) {
    const r = run(join(cwd, 'node_modules', '.bin', 'tsc'), ['--noEmit'], { cwd, timeout: 120000 });
    out.push({ tool: 'tsc', ok: r.exit === 0, detail: r.exit === 0 ? '' : truncate(r.out, 3000) });
  }
  if (linters.eslint) {
    const r = run(join(cwd, 'node_modules', '.bin', 'eslint'), ['.'], { cwd, timeout: 120000 });
    out.push({ tool: 'eslint', ok: r.exit === 0, detail: r.exit === 0 ? '' : truncate(r.out, 3000) });
  }
  if (linters.go) {
    const r = run('go', ['vet', './...'], { cwd, timeout: 120000 });
    out.push({ tool: 'go vet', ok: r.exit === 0, detail: r.exit === 0 ? '' : truncate(r.out, 3000) });
  }
  return out;
}
