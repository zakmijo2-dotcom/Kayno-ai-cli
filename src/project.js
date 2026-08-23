import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { readJson } from './util.js';

let cache = { cwd: '', profile: null };

export function detectProject(cwd = process.cwd()) {
  if (cache.cwd === cwd && cache.profile) return cache.profile;

  const p = {
    cwd,
    languages: [],
    packageManager: null,
    name: null,
    entry: null,
    testCommand: null,
    startCommand: null,
    docs: [],
    agentsFile: null,
    frameworks: [],
  };

  const pkgPath = join(cwd, 'package.json');
  if (existsSync(pkgPath)) {
    const pkg = readJson(pkgPath, {});
    p.languages.push('javascript');
    if (
      existsSync(join(cwd, 'tsconfig.json')) ||
      Object.keys(pkg.devDependencies ?? {}).some((d) => d === 'typescript')
    ) {
      p.languages.push('typescript');
    }
    p.name = pkg.name ?? null;
    p.entry = pkg.main ?? (Array.isArray(pkg.bin) ? null : pkg.bin) ?? null;
    p.testCommand = pkg.scripts?.test ?? null;
    p.startCommand = pkg.scripts?.start ?? null;
    if (pkg.dependencies?.react || pkg.dependencies?.vue || pkg.dependencies?.svelte) {
      p.frameworks.push(
        pkg.dependencies?.react ? 'react' : pkg.dependencies?.vue ? 'vue' : 'svelte'
      );
    }
    if (pkg.dependencies?.next) p.frameworks.push('next');
    if (pkg.dependencies?.express || pkg.dependencies?.fastify || pkg.dependencies?.hono) {
      p.frameworks.push('node-server');
    }
  }

  if (existsSync(join(cwd, 'pyproject.toml')) || existsSync(join(cwd, 'requirements.txt'))) {
    p.languages.push('python');
    p.testCommand = p.testCommand ?? 'pytest';
  }
  if (existsSync(join(cwd, 'go.mod'))) {
    p.languages.push('go');
    p.testCommand = p.testCommand ?? 'go test ./...';
  }
  if (existsSync(join(cwd, 'Cargo.toml'))) {
    p.languages.push('rust');
    p.testCommand = p.testCommand ?? 'cargo test';
  }
  if (existsSync(join(cwd, 'composer.json'))) p.languages.push('php');
  if (existsSync(join(cwd, 'Gemfile'))) p.languages.push('ruby');
  if (readdirSafe(cwd).some((f) => f.endsWith('.csproj'))) p.languages.push('csharp');

  if (existsSync(join(cwd, 'package-lock.json'))) p.packageManager = 'npm';
  else if (existsSync(join(cwd, 'yarn.lock'))) p.packageManager = 'yarn';
  else if (existsSync(join(cwd, 'pnpm-lock.yaml'))) p.packageManager = 'pnpm';
  else if (existsSync(join(cwd, 'bun.lockb'))) p.packageManager = 'bun';
  else if (p.languages.includes('python') && existsSync(join(cwd, 'uv.lock'))) p.packageManager = 'uv';
  else if (p.languages.includes('javascript')) p.packageManager = 'npm';

  for (const d of ['README.md', 'README', 'readme.md']) {
    if (existsSync(join(cwd, d))) {
      p.docs.push(d);
      break;
    }
  }
  for (const a of ['KAYNO.md', 'AGENTS.md', 'CLAUDE.md', 'NOVA.md']) {
    if (existsSync(join(cwd, a))) {
      p.agentsFile = a;
      break;
    }
  }

  cache = { cwd, profile: p };
  return p;
}

function readdirSafe(dir) {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

export function projectContextLines(cwd = process.cwd(), maxLines = 12) {
  const p = detectProject(cwd);
  const lines = [];
  if (p.name || p.languages.length) {
    lines.push(`project: ${p.name ?? '(unnamed)'} · lang: ${p.languages.join('+') || 'unknown'}${p.frameworks.length ? ` · ${p.frameworks.join(',')}` : ''}`);
  }
  if (p.packageManager) lines.push(`package manager: ${p.packageManager}`);
  if (p.testCommand) lines.push(`tests: \`${p.testCommand}\``);
  if (p.startCommand) lines.push(`start: \`${p.startCommand}\``);
  if (p.agentsFile) lines.push(`instructions file: ${p.agentsFile} (follow it)`);
  if (!lines.length) lines.push('project: no manifests detected (generic directory)');
  return lines.slice(0, maxLines);
}
