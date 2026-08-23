import { redact } from './util.js';

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 };

function currentLevel() {
  const v = String(process.env.KAYNO_LOG || process.env.NOVA_LOG || '').toLowerCase();
  if (v in LEVELS) return LEVELS[v];
  return LEVELS.warn;
}

function write(level, args) {
  if (LEVELS[level] < currentLevel()) return;
  const line = args
    .map((a) => (typeof a === 'string' ? a : JSON.stringify(a)))
    .join(' ');
  const tag = level === 'warn' ? 'warn' : level;
  process.stderr.write(`[kayno:${tag}] ${redact(line)}\n`);
}

export const log = {
  debug: (...a) => write('debug', a),
  info: (...a) => write('info', a),
  warn: (...a) => write('warn', a),
  error: (...a) => write('error', a),
};

export function isDebug() {
  return currentLevel() <= LEVELS.debug;
}
