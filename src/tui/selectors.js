export function filterItems(items, query) {
  const q = String(query ?? '').toLowerCase().trim();
  if (!q) return items.slice();
  return items.filter(
    (it) =>
      it.label.toLowerCase().includes(q) ||
      (it.hint ?? '').toLowerCase().includes(q) ||
      (it.keywords ?? []).some((k) => k.toLowerCase().startsWith(q))
  );
}

export function commonPrefix(labels) {
  if (labels.length === 0) return '';
  let prefix = labels[0];
  for (const l of labels.slice(1)) {
    let i = 0;
    while (i < prefix.length && i < l.length && prefix[i] === l[i]) i++;
    prefix = prefix.slice(0, i);
  }
  return prefix;
}

export function relativeTime(ts, now = Date.now()) {
  const diff = Math.max(0, now - ts);
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(ts).toLocaleDateString();
}
