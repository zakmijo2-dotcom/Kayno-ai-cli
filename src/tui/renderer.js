import {
  cursor,
  erase,
  stripAnsi,
  wrapAnsi,
  truncateVisible,
  termWidth,
  termRows,
  spinnerFrames,
  c,
  sym,
} from './ansi.js';

export function computeInputView(editor, width, maxRows = 5) {
  const w = Math.max(8, Math.min(width - 6, 120));
  const rows = [];
  const meta = [];
  editor.lines.forEach((line, li) => {
    let segs = wrapAnsi(line, w);
    if (segs.length === 0) segs = [''];
    let startCol = 0;
    segs.forEach((seg, si) => {
      rows.push(seg);
      meta.push({ logical: li, sub: si, startCol });
      startCol += seg.length;
      if (si < segs.length - 1 && line[startCol] === ' ') startCol += 0;
    });
  });
  const offset = Math.max(0, rows.length - maxRows);
  const visibleRows = rows.slice(-maxRows);
  const visibleMeta = meta.slice(offset);

  let cursorScreenRow = visibleMeta.findIndex(
    (m) => m.logical === editor.row
  );
  if (cursorScreenRow === -1) cursorScreenRow = visibleMeta.length - 1;
  const m = visibleMeta[cursorScreenRow];
  let cursorColIdx = 2;
  if (m) {
    const segLen = visibleRows[cursorScreenRow]?.length ?? 0;
    const colInto = Math.min(Math.max(0, editor.col - m.startCol), segLen);
    cursorColIdx = 2 + colInto;
  }
  return {
    visibleRows,
    visibleMeta,
    offset,
    totalRows: rows.length,
    cursorScreenRow,
    cursorColIdx,
    maxedOut: offset > 0 ? offset : 0,
  };
}

export class Renderer {
  constructor({ out = process.stdout } = {}) {
    this.out = out;
    this.width = termWidth(out);
    this.rows = termRows(out);
    this.enabled = false;
    this.liveLines = 0;
    this.chromeLines = 0;
    this.spinnerIndex = 0;
    this.lastLiveKey = '';
    this.lastChromeKey = '';
  }

  start() {
    this.enabled = true;
    this.width = termWidth(this.out);
    this.rows = termRows(this.out);
    this.out.write(cursor.hide());
  }

  stop() {
    if (!this.enabled) return;
    this.enabled = false;
    this.eraseDynamic();
    this.out.write(cursor.show());
  }

  resize() {
    const w = termWidth(this.out);
    const r = termRows(this.out);
    if (w === this.width && r === this.rows) return false;
    this.width = w;
    this.rows = r;
    this.lastLiveKey = '';
    this.lastChromeKey = '';
    return true;
  }

  dynamicHeight() {
    return this.liveLines + this.chromeLines;
  }

  eraseDynamic() {
    const n = this.dynamicHeight();
    if (n > 0) {
      this.out.write('\r' + cursor.up(n) + erase.down());
    }
    this.liveLines = 0;
    this.chromeLines = 0;
  }

  printTranscript(text) {
    const wasEnabled = this.enabled;
    if (wasEnabled) this.eraseDynamic();
    for (const line of wrapAnsi(text, Math.max(20, this.width - 1))) {
      this.out.write(line + '\n');
    }
    return wasEnabled;
  }

  buildLiveLines({ thinking, text }) {
    const width = Math.max(20, this.width - 1);
    const budget = Math.max(2, Math.min(12, this.rows - 9));
    const frames = spinnerFrames();
    const frame = c.gray(frames[this.spinnerIndex % frames.length]);
    const lines = [];
    if (thinking) {
      lines.push(c.cyan(`${sym('dot')} Thinking`) + ` ${frame}`);
    } else if (text !== undefined && text !== '') {
      lines.push(c.cyan(sym('dot')) + ` ${frame}`);
    }
    if (text && String(text).trim()) {
      const wrapped = [];
      for (const l of String(text).split('\n')) wrapped.push(...wrapAnsi(l, width));
      const overflow = wrapped.length - budget;
      if (overflow > 0) {
        lines.push(c.gray(` ${sym('arrowUp')} ${overflow} lines above`));
        lines.push(...wrapped.slice(-budget));
      } else {
        lines.push(...wrapped);
      }
    }
    return lines;
  }

  buildChromeLines({ statusText, inputView, overlayLines }) {
    const width = this.width;
    const out = [];
    const hz = c.gray(sym('horiz').repeat(Math.max(10, width - 1)));
    out.push(hz);
    out.push(truncateVisible(statusText, width - 1));
    out.push(hz);
    for (const [i, row] of inputView.visibleRows.entries()) {
      const meta = inputView.visibleMeta[i];
      const isFirstOverall = i === 0 && inputView.offset === 0;
      const prefix =
        meta.logical === 0 && meta.sub === 0
          ? `${c.magenta(sym('bullet'))} `
          : meta.sub === 0
            ? '  '
            : '  ';
      void isFirstOverall;
      out.push(prefix + row);
    }
    if (inputView.maxedOut > 0) {
      out.splice(3, 0, c.gray(` ${sym('arrowUp')} ${inputView.maxedOut} earlier lines (Ctrl+U clears)`));
    }
    if (overlayLines && overlayLines.length) {
      out.push(...overlayLines);
    }
    return out;
  }

  repaint({ live, chrome }) {
    if (!this.enabled) return;
    const liveLines = live ? this.buildLiveLines(live) : [];
    const chromeLines = this.buildChromeLines(chrome);

    const liveKey = JSON.stringify(liveLines.map(stripAnsi));
    const chromeKey = JSON.stringify(chromeLines.map(stripAnsi));
    const changed = liveKey !== this.lastLiveKey || chromeKey !== this.lastChromeKey;
    if (!changed) {
      this.placeCursor(chrome);
      return;
    }

    this.eraseDynamic();
    if (liveLines.length) {
      this.out.write(liveLines.join('\n') + '\n');
      this.liveLines = liveLines.length;
    }
    this.out.write(chromeLines.join('\n') + '\n');
    this.chromeLines = chromeLines.length;
    this.lastLiveKey = liveKey;
    this.lastChromeKey = chromeKey;
    this.placeCursor(chrome);
  }

  placeCursor(chrome) {
    const { inputView, overlayOpen } = chrome;
    if (overlayOpen || !inputView) return;
    const belowCursor =
      (this.chromeLines - 3 - inputView.visibleRows.length >= 0
        ? this.chromeLines - 3 - inputView.visibleRows.length
        : 0) +
      (inputView.visibleRows.length - 1 - inputView.cursorScreenRow);
    if (belowCursor > 0) this.out.write(cursor.up(belowCursor));
    this.out.write('\r' + cursor.right(Math.min(inputView.cursorColIdx, this.width - 1)));
  }

  flash(message) {
    if (!this.enabled) return;
    this.printTranscript(message);
  }
}
