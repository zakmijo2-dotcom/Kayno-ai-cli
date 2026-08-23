import { c, sym, stripAnsi, truncateVisible, visibleWidth } from './ansi.js';
import { filterItems } from './selectors.js';

export function fuzzyScore(text, query) {
  const t = String(text).toLowerCase();
  const q = String(query).toLowerCase().trim();
  if (!q) return 1;
  if (t.includes(q)) return 100 - t.indexOf(q);
  let ti = 0;
  let score = 0;
  for (const ch of q) {
    const idx = t.indexOf(ch, ti);
    if (idx === -1) return -1;
    score += idx === ti ? 3 : 1;
    ti = idx + 1;
  }
  return score;
}

export function fuzzyFilter(items, query) {
  const scored = [];
  for (const item of items) {
    const hay = `${item.label} ${item.hint ?? ''} ${(item.keywords ?? []).join(' ')}`;
    const s = fuzzyScore(hay, query);
    if (s >= 0) scored.push({ item, s });
  }
  scored.sort((a, b) => b.s - a.s);
  return scored.map((x) => x.item);
}

export class ModalManager {
  constructor() {
    this.stack = [];
  }

  get current() {
    return this.stack.at(-1) ?? null;
  }

  get open() {
    return this.stack.length > 0;
  }

  push(modal) {
    const m = {
      kind: 'list',
      title: '',
      items: [],
      query: '',
      selected: 0,
      scroll: 0,
      widthPct: 0.62,
      minW: 46,
      footer: '',
      input: null,
      info: [],
      preview: null,
      onSubmitText: null,
      onSelectItem: null,
      onKey: null,
      onClose: null,
      ...modal,
    };
    this.stack.push(m);
    return m;
  }

  pop() {
    const m = this.stack.pop();
    if (m?.onClose) m.onClose();
    return m;
  }

  closeAll() {
    while (this.stack.length) this.pop();
  }

  visibleItems() {
    const m = this.current;
    if (!m) return [];
    if (m.input && m.fuzzy !== false) return fuzzyFilter(m.items, m.input.value);
    if (m.query) return fuzzyFilter(m.items, m.query);
    return m.items;
  }

  move(delta) {
    const m = this.current;
    if (!m) return false;
    const n = this.visibleItems().length;
    if (!n) return false;
    m.selected = Math.max(0, Math.min(m.selected + delta, n - 1));
    return true;
  }

  page(delta) {
    return this.move(delta * 6);
  }

  selected() {
    const m = this.current;
    if (!m) return null;
    return this.visibleItems()[m.selected] ?? null;
  }
}

export function frameModal(modal, { width, rows, items }) {
  const boxW = Math.max(modal.minW ?? 46, Math.floor(width * (modal.widthPct ?? 0.62)));
  const maxItemRows = Math.max(3, Math.min(items.length || 1, Math.floor(rows * 0.55)));
  const lines = [];

  const titleTxt = ` ${truncateVisible(stripAnsi(modal.title || ''), boxW - 6)} `;
  lines.push(c.gray(sym('cornerTL') + sym('horiz').repeat(2)) + c.bold(` ${titleTxt}`) + c.gray(sym('horiz').repeat(Math.max(2, boxW - visibleWidth(titleTxt) - 4))) + c.gray(sym('cornerTR')));

  if (modal.input) {
    const val = modal.input.value ?? '';
    const shown = truncateVisible(val, boxW - 10);
    const masked = modal.input.mask ? '•'.repeat(visibleWidth(shown)) : shown;
    lines.push(c.gray(sym('vert')) + ' ' + c.cyan(sym('bullet')) + ' ' + masked);
  }

  for (const line of modal.info ?? []) lines.push(c.gray(sym('vert')) + ' ' + line);

  if (items.length === 0) {
    lines.push(c.gray(sym('vert')) + ` ${c.dim('(no matches)')}`);
  }
  const windowStart = clampWindow(modal.selected, items.length, maxItemRows);
  items.slice(windowStart, windowStart + maxItemRows).forEach((item, i) => {
    const idx = windowStart + i;
    const sel = idx === modal.selected;
    const pointer = sel ? c.cyan(sym('pointer')) : ' ';
    const label = sel ? c.bold(item.label) : item.label;
    const badge = item.badge
      ? ' ' +
        (item.badgeColor ? item.badgeColor(item.badge) : c.dim(item.badge))
      : '';
    const hint = item.hint ? c.dim(truncateVisible(item.hint, Math.max(6, boxW - visibleWidth(label) - visibleWidth(badge) - 14))) : '';
    lines.push(c.gray(sym('vert')) + ` ${pointer} ${truncateVisible(stripAnsi(label), boxW - 12)}${badge} ${hint}` + c.gray(sym('vert')));
  });
  if (items.length > maxItemRows) {
    lines.push(c.gray(sym('vert')) + c.dim(` ${sym('arrowUp')}${sym('arrowDown')} ${windowStart + 1}-${Math.min(items.length, windowStart + maxItemRows)} / ${items.length}`));
  }

  for (const pl of modal.previewLines ?? []) {
    lines.push(c.gray(sym('vert')) + ' ' + pl.slice(0, boxW - 4));
  }

  if (modal.footer) {
    lines.push(c.gray(sym('vert')) + ' ' + c.dim(truncateVisible(modal.footer, boxW - 6)));
  }

  lines.push(c.gray(sym('cornerBL') + sym('horiz').repeat(Math.max(2, boxW - 2)) + sym('cornerBR')));
  return lines;
}

function clampWindow(selected, total, size) {
  if (total <= size) return 0;
  return Math.max(0, Math.min(selected - Math.floor(size / 2), total - size));
}
