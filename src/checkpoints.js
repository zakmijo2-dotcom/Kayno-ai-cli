import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { resolveInWorkspace, workspaceRoot } from './workspace.js';

const MAX_KEEP = 40;
const MAX_FILE_BYTES = 512 * 1024;
const MAX_FILES_PER_CKPT = 20;

function checkpointDir() {
  return join(workspaceRoot(), '.mij', 'checkpoints');
}

function ensureDir() {
  mkdirSync(checkpointDir(), { recursive: true });
}

export function beginTurnCheckpoint(meta = {}) {
  return {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    at: Date.now(),
    meta,
    ops: [],
    open: true,
  };
}

export class TurnCheckpoint {
  constructor(meta = {}) {
    this.ckpt = beginTurnCheckpoint(meta);
  }

  recordFile(absPath) {
    if (!this.ckpt.open) return false;
    if (this.ckpt.ops.length >= MAX_FILES_PER_CKPT) return false;
    let abs;
    try {
      abs = resolveInWorkspace(String(absPath));
    } catch {
      return false;
    }
    if (this.ckpt.ops.some((o) => o.path === abs)) return true;
    let st = null;
    try {
      st = statSync(abs);
    } catch {}
    if (st && !st.isFile()) return false;
    let before = null;
    const beforeExists = !!st;
    if (beforeExists && st.size <= MAX_FILE_BYTES) {
      try {
        before = readFileSync(abs, 'utf8');
      } catch {}
    }
    this.ckpt.ops.push({ path: abs, beforeExists, before });
    return true;
  }

  noteShell(command) {
    if (this.ckpt.open) {
      this.ckpt.meta.shell = [...(this.ckpt.meta.shell ?? []), String(command ?? '').slice(0, 200)].slice(-5);
    }
  }

  finalize() {
    if (!this.ckpt.open) return null;
    this.ckpt.open = false;
    for (const op of this.ckpt.ops) {
      let after = null;
      let afterExists = false;
      try {
        const st = statSafe(op.path);
        afterExists = !!st?.isFile();
        if (afterExists && st.size <= MAX_FILE_BYTES) after = readFileSync(op.path, 'utf8');
      } catch {}
      if (!afterExists && op.beforeExists === false) {
        op.skip = true;
        continue;
      }
      op.afterExists = afterExists;
      op.after = after;
      if (op.before === after && op.beforeExists === afterExists) op.skip = true;
    }
    this.ckpt.ops = this.ckpt.ops.filter((o) => !o.skip);
    if (this.ckpt.ops.length === 0) return null;
    persist(this.ckpt);
    return this.ckpt.id;
  }

  discard() {
    this.ckpt.open = false;
    this.ckpt.ops = [];
  }
}

function statSafe(p) {
  try {
    return statSync(p);
  } catch {
    return null;
  }
}


export function listCheckpoints(limit = MAX_KEEP) {
  ensureDir();
  return readdirSync(checkpointDir())
    .filter((f) => f.endsWith('.json') && !f.startsWith('redo-'))
    .sort()
    .slice(-limit)
    .reverse();
}

function loadCkpt(file) {
  try {
    return JSON.parse(readFileSync(join(checkpointDir(), file), 'utf8'));
  } catch {
    return null;
  }
}

function persist(ckpt, { fresh = true } = {}) {
  ensureDir();
  if (fresh) {
    for (const f of readdirSync(checkpointDir())) {
      if (f.startsWith('redo-')) {
        try {
          unlinkSync(join(checkpointDir(), f));
        } catch {}
      }
    }
  }
  writeFileSync(join(checkpointDir(), `${ckpt.id}.json`), JSON.stringify(ckpt));
}

export function applyOp(op, direction) {
  const content = direction === 'undo' ? op.before : op.after;
  const existed = direction === 'undo' ? op.beforeExists : op.afterExists;
  if (!existed) {
    if (existsSync(op.path)) unlinkSync(op.path);
    return `removed ${op.path}`;
  }
  mkdirSync(dirname(op.path), { recursive: true });
  writeFileSync(op.path, content ?? '');
  return `${direction === 'undo' ? 'restored' : 'reapplied'} ${op.path}`;
}

export function undoLast() {
  const files = listCheckpoints();
  if (!files.length) return { changed: false, reason: 'no checkpoints' };
  const file = files[0];
  const ckpt = loadCkpt(file);
  if (!ckpt) return { changed: false, reason: 'unreadable checkpoint' };
  const results = ckpt.ops.slice().reverse().map((op) => applyOp(op, 'undo'));
  unlinkSync(join(checkpointDir(), file));
  const redoFile = join(checkpointDir(), `redo-${ckpt.id}.json`);
  writeFileSync(redoFile, JSON.stringify(ckpt));
  return { changed: true, id: ckpt.id, results };
}

export function redoLast() {
  ensureDir();
  const redoFiles = readdirSync(checkpointDir())
    .filter((f) => f.startsWith('redo-') && f.endsWith('.json'))
    .sort();
  if (!redoFiles.length) return { changed: false, reason: 'nothing to redo' };
  const lastRedo = redoFiles.at(-1);
  const ckpt = loadCkpt(lastRedo);
  if (!ckpt) return { changed: false, reason: 'unreadable redo checkpoint' };
  const results = ckpt.ops.map((op) => applyOp(op, 'redo'));
  unlinkSync(join(checkpointDir(), lastRedo));
  persist(ckpt, { fresh: false });
  return { changed: true, id: ckpt.id, results };
}
