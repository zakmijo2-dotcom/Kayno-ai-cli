import { isAbsolute, resolve, sep, relative } from 'node:path';
import { statSync } from 'node:fs';
import { loadConfig } from './config.js';

let cachedRoot = null;
let cachedExtra = null;

export function workspaceRoot() {
  if (cachedRoot) return cachedRoot;
  const cfg = loadConfig();
  const configured = cfg.workspace?.root;
  cachedRoot = configured
    ? resolve(configured.replace(/^~(?=$|\/|\\)/, process.env.HOME || ''))
    : process.cwd();
  return cachedRoot;
}

export function extraRoots() {
  if (cachedExtra) return cachedExtra;
  const cfg = loadConfig();
  cachedExtra = (cfg.workspace?.extraRoots ?? [])
    .map((p) => resolve(String(p).replace(/^~(?=$|\/|\\)/, process.env.HOME || '')))
    .filter(Boolean);
  return cachedExtra;
}

export function resetWorkspaceCache() {
  cachedRoot = null;
  cachedExtra = null;
}

function isInside(root, abs) {
  const rel = relative(root, abs);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

export class PathError extends Error {
  constructor(abs) {
    super(`path outside workspace sandbox: ${abs} (root: ${workspaceRoot()})`);
    this.name = 'PathError';
    this.code = 'EPATHSANDBOX';
  }
}

export function resolveInWorkspace(inputPath, { mustExist = false, createOk = false } = {}) {
  if (typeof inputPath !== 'string' || inputPath.trim() === '') {
    throw new Error('path required');
  }
  let abs;
  if (isAbsolute(inputPath)) {
    abs = resolve(inputPath);
  } else {
    abs = resolve(workspaceRoot(), inputPath);
  }
  const allowed =
    isInside(workspaceRoot(), abs) || extraRoots().some((r) => isInside(r, abs));
  if (!allowed) throw new PathError(abs);
  if (mustExist) {
    try {
      statSync(abs);
    } catch {
      throw new Error(`not found: ${abs}`);
    }
  }
  void createOk;
  return abs;
}
