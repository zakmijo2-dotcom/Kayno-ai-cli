import { loadConfig } from './config.js';
import { log } from './logger.js';

export const CATEGORIES = ['read', 'write', 'shell', 'network', 'git', 'mcp'];
export const MODES = ['allow', 'ask', 'deny'];

const DEFAULTS = {
  read: 'allow',
  write: 'ask',
  shell: 'ask',
  network: 'allow',
  git: 'allow',
  mcp: 'ask',
};

const TOOL_CATEGORY = {
  read_file: 'read',
  grep: 'read',
  glob: 'read',
  list_dir: 'read',
  write_file: 'write',
  edit_file: 'write',
  patch_file: 'write',
  run_command: 'shell',
  fetch_url: 'network',
  git_status: 'git',
  git_diff: 'git',
  git_log: 'git',
};

export function toolCategory(name) {
  if (String(name).startsWith('mcp__')) return 'mcp';
  return TOOL_CATEGORY[name] ?? null;
}

export function loadPolicies({ yolo = false } = {}) {
  const cfg = loadConfig();
  const user = cfg.permissions ?? {};
  const policies = {};
  for (const cat of CATEGORIES) {
    let mode = user[cat] ?? DEFAULTS[cat];
    if (!MODES.includes(mode)) mode = DEFAULTS[cat];
    if (yolo) mode = 'allow';
    policies[cat] = mode;
  }
  return policies;
}

export class PermissionDeniedError extends Error {
  constructor(category, tool, reason) {
    super(`permission denied (${category}): ${tool} — ${reason}`);
    this.name = 'PermissionDeniedError';
    this.category = category;
    this.tool = tool;
  }
}

export async function checkPermission(toolName, { yolo = false, ask = null, detail = '' } = {}) {
  const category = toolCategory(toolName);
  if (!category) return { allowed: true, mode: 'allow' };
  const policies = loadPolicies({ yolo });
  const mode = policies[category];
  log.debug(`permission ${category}/${mode} for ${toolName}`);
  if (mode === 'allow') return { allowed: true, mode };
  if (mode === 'deny') {
    throw new PermissionDeniedError(
      category,
      toolName,
      `disabled by policy (mij config set permissions.${category} allow|ask)`
    );
  }
  if (typeof ask === 'function') {
    const ok = await ask(detail || `${toolName}?`);
    if (ok) return { allowed: true, mode: 'ask' };
    throw new PermissionDeniedError(category, toolName, 'user declined');
  }
  throw new PermissionDeniedError(
    category,
    toolName,
    'requires approval and no interactive prompt available (use --yolo or permissions.' + category + '=allow)'
  );
}
