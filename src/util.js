import { readFileSync, writeFileSync, mkdirSync, existsSync, chmodSync } from 'node:fs';
import { dirname } from 'node:path';

const noColor = process.env.NO_COLOR || !process.stdout.isTTY;
export const RESET = '\x1b[0m';
export const BOLD = '\x1b[1m';
export const DIM = '\x1b[2m';

function paint(code, s) {
  return noColor ? String(s) : `${code}${s}${RESET}`;
}

export const c = {
  bold: (s) => paint(BOLD, s),
  dim: (s) => paint(DIM, s),
  red: (s) => paint('\x1b[31m', s),
  green: (s) => paint('\x1b[32m', s),
  yellow: (s) => paint('\x1b[33m', s),
  blue: (s) => paint('\x1b[34m', s),
  magenta: (s) => paint('\x1b[35m', s),
  cyan: (s) => paint('\x1b[36m', s),
};

export function readJson(file, fallback) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

export function writeJson(file, data) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
}

export function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

export function expandEnv(str) {
  return String(str ?? '').replace(/\$\{([A-Z0-9_]+)\}/gi, (_, k) => process.env[k] ?? '');
}

export function truncate(s, n = 2000) {
  s = String(s ?? '');
  return s.length > n ? s.slice(0, n) + `\n... [truncated ${s.length - n} chars]` : s;
}

const SECRET_PATTERNS = [
  [/sk-[A-Za-z0-9_-]{8,}/g, 'sk-***'],
  [/ghp_[A-Za-z0-9]{20,}/g, 'ghp_***'],
  [/github_pat_[A-Za-z0-9_]{20,}/g, 'github_pat_***'],
  [/GOCSPX-[A-Za-z0-9_-]+/g, 'GOCSPX-***'],
  [/Bearer\s+[A-Za-z0-9._-]{10,}/gi, 'Bearer ***'],
  [/(access_token|refresh_token|api[_-]?key|authorization)(["'\s:=]+)[^\s"'&]+/gi, '$1$2***'],
];

export function redact(s) {
  let out = String(s ?? '');
  for (const [re, replacement] of SECRET_PATTERNS) {
    out = out.replace(re, replacement);
  }
  return out;
}
