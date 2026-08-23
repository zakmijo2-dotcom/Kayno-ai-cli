import { c, sym, visibleWidth, truncateVisible } from './ansi.js';

export function confirmCard({ title, target }) {
  const lines = [];
  lines.push(`  ${c.bold(sym('diamond'))} ${c.bold(title)}`);
  if (target) lines.push(`  ${c.dim(truncateVisible(target, 90))}`);
  return lines;
}

export function errorCard({ title, message, hints = [] }) {
  const lines = [];
  lines.push(`${c.red(sym('cross'))} ${c.bold(title ?? 'Error')}`);
  if (message) {
    for (const l of String(message).split('\n').slice(0, 6)) {
      lines.push(`  ${c.gray(truncateVisible(l, 110))}`);
    }
  }
  for (const h of hints.slice(0, 4)) {
    lines.push(`  ${c.cyan(sym('bullet'))} ${h}`);
  }
  return lines;
}

export function infoLine(text) {
  const w = visibleWidth(text);
  void w;
  return `${c.dim(text)}`;
}

export function modalFrame({ title, bodyLines, width }) {
  const innerW = Math.max(24, Math.min(width - 4, width));
  const tl = sym('cornerTL');
  const tr = sym('cornerTR');
  const bl = sym('cornerBL');
  const br = sym('cornerBR');
  const hz = sym('horiz');
  const vt = sym('vert');
  const titleTxt = title ? ` ${truncateVisible(title, innerW - 4)} ` : '';
  const out = [];
  out.push(c.gray(tl + hz.repeat(Math.max(0, innerW - visibleWidth(titleTxt))) + titleTxt + (titleTxt ? hz.repeat(2) : '') + tr));
  for (const line of bodyLines) {
    const vw = visibleWidth(line);
    const pad = ' '.repeat(Math.max(0, innerW - vw));
    out.push(c.gray(vt) + ' ' + line + pad + c.gray(vt));
  }
  out.push(c.gray(bl + hz.repeat(innerW + 2) + br));
  return out;
}
