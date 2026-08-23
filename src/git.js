import { spawnSync } from 'node:child_process';
import { truncate } from './util.js';

function git(args, { maxBuffer = 1024 * 1024 } = {}) {
  const res = spawnSync('git', args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    timeout: 15000,
    maxBuffer,
  });
  return res;
}

export function isGitRepo() {
  const res = git(['rev-parse', '--is-inside-work-tree']);
  return res.status === 0 && res.stdout.trim() === 'true';
}

export function currentBranch() {
  const res = git(['rev-parse', '--abbrev-ref', 'HEAD']);
  if (res.status !== 0) return '';
  return res.stdout.trim();
}

export function gitStatus() {
  if (!isGitRepo()) return null;
  const branchRes = git(['rev-parse', '--abbrev-ref', 'HEAD']);
  const statusRes = git(['status', '--porcelain']);
  const lines = statusRes.stdout.split('\n').filter(Boolean);
  return {
    repo: true,
    branch: branchRes.status === 0 ? branchRes.stdout.trim() : '',
    files: lines.slice(0, 100),
    counts: {
      modified: lines.filter((l) => l.startsWith(' M') || l.startsWith('M ')).length,
      added: lines.filter((l) => l.startsWith('??') || l.startsWith('A ')).length,
      deleted: lines.filter((l) => l.startsWith(' D') || l.startsWith('D ')).length,
    },
  };
}

export function gitDiff({ staged = false, context = 3, maxBytes = 32 * 1024 } = {}) {
  const args = ['diff', '--unified', String(context)];
  if (staged) args.push('--cached');
  const res = git(args, { maxBuffer: 4 * 1024 * 1024 });
  if (res.status !== 0 && res.stderr) throw new Error(res.stderr.trim());
  return truncate(res.stdout || '(no changes)', maxBytes);
}

export function gitLog({ n = 20, file } = {}) {
  const args = ['log', `--oneline`, `-n`, String(n)];
  if (file) args.push('--', file);
  const res = git(args);
  if (res.status !== 0) throw new Error(res.stderr.trim() || 'git log failed');
  return res.stdout.trim() || '(no commits)';
}
