import { chmodSync } from 'node:fs';

export const RESET = '\x1b[0m';
export const BOLD = '\x1b[1m';
export const DIM = '\x1b[2m';
const noColor = process.env.NO_COLOR || !process.stdout.isTTY;

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
    return JSON.parse(readFileSync2(file));
  } catch {
    return fallback;
  }
}

import { readFileSync as _rf } from 'node:fs';
function readFileSync2(file) {
  return _rf(file, 'utf8');
}

import { mkdirSync, writeFileSync as _wf, existsSync } from 'node:fs';
import { dirname } from 'node:path';

export function writeJson(file, data) {
  mkdirSync(dirname(file), { recursive: true });
  _wf(file, JSON.stringify(data, null, 2) + '\n');
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

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export function makeExecutable(file) {
  try {
    chmodSync(file, 0o755);
  } catch {}
}
