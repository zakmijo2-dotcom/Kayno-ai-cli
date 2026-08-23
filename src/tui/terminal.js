import { EventEmitter } from 'node:events';
import { cursor } from './ansi.js';

export function createTerminalIO({ stdin = process.stdin, stdout = process.stdout } = {}) {
  const state = {
    raw: false,
    closed: false,
    onData: null,
    onResize: null,
    wasRaw: false,
  };

  function setRawMode(on) {
    if (!stdin.isTTY || typeof stdin.setRawMode !== 'function') return;
    try {
      if (on && !state.raw) {
        state.wasRaw = stdin.isRaw;
        stdin.setRawMode(true);
        state.raw = true;
      } else if (!on && state.raw) {
        stdin.setRawMode(state.wasRaw ?? false);
        state.raw = false;
      }
    } catch {}
  }

  function start() {
    setRawMode(true);
    state.onData = (chunk) => io.emit('data', chunk);
    state.onResize = () => io.emit('resize');
    stdin.on('data', state.onData);
    stdout.on('resize', state.onResize);
    stdin.resume();
    if (stdin.isTTY) {
      stdout.write('\x1b[?2004h');
    }
  }

  function stop() {
    if (state.closed) return;
    state.closed = true;
    if (state.onData) stdin.off('data', state.onData);
    if (state.onResize) stdout.off('resize', state.onResize);
    setRawMode(false);
    if (stdin.isTTY) {
      stdout.write('\x1b[?2004l');
    }
    stdout.write(cursor.show());
    try {
      stdin.pause();
    } catch {}
  }

  const io = new EventEmitter();
  io.start = start;
  io.stop = stop;
  io.setRawMode = setRawMode;
  io.write = (s) => stdout.write(s);
  io.width = () => (stdout.columns > 0 ? stdout.columns : 80);
  io.rows = () => (stdout.rows > 0 ? stdout.rows : 24);
  return io;
}
