const isDumb = !process.env.TERM || process.env.TERM === 'dumb';
export const COLOR_ENABLED = !process.env.NO_COLOR && !isDumb;
export const UNICODE =
  !process.env.MIJ_ASCII &&
  !isDumb &&
  (process.env.LANG || '').match(/UTF-8/i) !== null;

export const RESET = '\x1b[0m';
export const BOLD = '\x1b[1m';
export const DIM = '\x1b[2m';
export const ITALIC = '\x1b[3m';
export const UNDERLINE = '\x1b[4m';

function paint(code, s) {
  if (!COLOR_ENABLED) return String(s);
  return `${code}${s}${RESET}`;
}

export const fg = {
  black: (s) => paint('\x1b[30m', s),
  red: (s) => paint('\x1b[31m', s),
  green: (s) => paint('\x1b[32m', s),
  yellow: (s) => paint('\x1b[33m', s),
  blue: (s) => paint('\x1b[34m', s),
  magenta: (s) => paint('\x1b[35m', s),
  cyan: (s) => paint('\x1b[36m', s),
  white: (s) => paint('\x1b[37m', s),
  gray: (s) => paint('\x1b[90m', s),
  brightCyan: (s) => paint('\x1b[96m', s),
};

export const c = {
  bold: (s) => paint(BOLD, s),
  dim: (s) => paint(DIM, s),
  italic: (s) => paint(ITALIC, s),
  underline: (s) => paint(UNDERLINE, s),
  white: fg.white,
  red: fg.red,
  green: fg.green,
  yellow: fg.yellow,
  blue: fg.blue,
  magenta: fg.magenta,
  cyan: fg.cyan,
  gray: fg.gray,
};

export const cursor = {
  hide: () => '\x1b[?25l',
  show: () => '\x1b[?25h',
  up: (n = 1) => (n > 0 ? `\x1b[${n}A` : ''),
  down: (n = 1) => (n > 0 ? `\x1b[${n}B` : ''),
  left: (n = 1) => (n > 0 ? `\x1b[${n}D` : ''),
  right: (n = 1) => (n > 0 ? `\x1b[${n}C` : ''),
  column: (n = 1) => `\x1b[${n}G`,
  to: (row, col) => `\x1b[${row};${col}H`,
};

export const erase = {
  lineEnd: () => '\x1b[K',
  line: () => '\x1b[2K',
  down: () => '\x1b[J',
  screen: () => '\x1b[2J',
};

export function altScreen(on) {
  return on ? '\x1b[?1049h' : '\x1b[?1049l';
}

const SYM_UNICODE = {
  dot: '●',
  diamond: '◆',
  bullet: '›',
  check: '✓',
  cross: '✗',
  warn: '⚠',
  arrowUp: '↑',
  arrowDown: '↓',
  arrowLeft: '←',
  arrowRight: '→',
  ellipsis: '…',
  pointer: '❯',
  sep: '│',
  corner: '╭',
  cornerTL: '╭',
  cornerTR: '╮',
  cornerBL: '╰',
  cornerBR: '╯',
  horiz: '─',
  vert: '│',
  spinner: ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'],
};

const SYM_ASCII = {
  dot: '*',
  diamond: '+',
  bullet: '>',
  check: 'ok',
  cross: 'x',
  warn: '!',
  arrowUp: '^',
  arrowDown: 'v',
  arrowLeft: '<',
  arrowRight: '>',
  ellipsis: '...',
  pointer: '>',
  sep: '|',
  corner: ',',
  cornerTL: '+',
  cornerTR: '+',
  cornerBL: '+',
  cornerBR: '+',
  horiz: '-',
  vert: '|',
  spinner: ['|', '/', '-', '\\'],
};

export function sym(name) {
  const table = UNICODE ? SYM_UNICODE : SYM_ASCII;
  return table[name] ?? '';
}

export function spinnerFrames() {
  return UNICODE ? SYM_UNICODE.spinner : SYM_ASCII.spinner;
}

export function stripAnsi(s) {
  return String(s ?? '')
    .replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '')
    .replace(/\x1b\][^\x07]*(\x07|\x1b\\)/g, '');
}

const WIDE_RANGES = [
  [0x1100, 0x115f],
  [0x2e80, 0xa4cf],
  [0xac00, 0xd7a3],
  [0xf900, 0xfaff],
  [0xfe30, 0xfe6f],
  [0xff00, 0xff60],
  [0xffe0, 0xffe6],
  [0x20000, 0x2fffd],
  [0x30000, 0x3fffd],
];

function charWidth(ch) {
  const cp = ch.codePointAt(0);
  if (cp === 0) return 0;
  for (const [lo, hi] of WIDE_RANGES) {
    if (cp >= lo && cp <= hi) return 2;
  }
  if (cp >= 0x0300 && cp <= 0x036f) return 0;
  return 1;
}

export function visibleWidth(s) {
  let w = 0;
  for (const ch of stripAnsi(String(s ?? ''))) w += charWidth(ch);
  return w;
}

export function truncateVisible(s, maxWidth) {
  const str = String(s ?? '');
  const ell = sym('ellipsis');
  const ellW = visibleWidth(ell);
  if (maxWidth <= 0) return '';
  if (visibleWidth(str) <= maxWidth) return str;
  if (maxWidth <= ellW) {
    const out = [];
    let w = 0;
    for (const ch of str) {
      const cw = charWidth(ch);
      if (w + cw > maxWidth) break;
      out.push(ch);
      w += cw;
    }
    return out.join('');
  }
  const budget = maxWidth - ellW;
  const out = [];
  let w = 0;
  for (const ch of str) {
    const cw = charWidth(ch);
    if (w + cw > budget) break;
    out.push(ch);
    w += cw;
  }
  return out.join('') + ell;
}

export function padVisible(s, width) {
  s = String(s ?? '');
  const w = visibleWidth(s);
  if (w > width) return truncateVisible(s, width);
  return s + ' '.repeat(width - w);
}

export function wrapAnsi(text, width) {
  if (width <= 0) width = 40;
  const lines = [];
  for (const rawLine of String(text ?? '').split('\n')) {
    if (rawLine === '') {
      lines.push('');
      continue;
    }
    let current = '';
    let currentW = 0;
    const words = rawLine.split(/(\s+)/);
    for (const word of words) {
      const ww = visibleWidth(word);
      if (currentW + ww <= width) {
        current += word;
        currentW += ww;
        continue;
      }
      if (ww > width) {
        if (currentW > 0) {
          lines.push(current);
          current = '';
          currentW = 0;
        }
        let chunk = '';
        let chunkW = 0;
        for (const ch of word) {
          const cw = visibleWidth(ch);
          if (chunkW + cw > width) {
            lines.push(chunk);
            chunk = ch;
            chunkW = cw;
          } else {
            chunk += ch;
            chunkW += cw;
          }
        }
        current = chunk;
        currentW = chunkW;
        continue;
      }
      lines.push(current.replace(/\s+$/, ''));
      current = word.replace(/^\s+/, '');
      currentW = visibleWidth(current);
    }
    lines.push(current);
  }
  return lines;
}

export function termWidth(stdout = process.stdout) {
  return stdout.columns > 0 ? stdout.columns : 80;
}

export function termRows(stdout = process.stdout) {
  return stdout.rows > 0 ? stdout.rows : 24;
}
