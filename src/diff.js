function splitLines(text) {
  return String(text ?? '').replace(/\r\n/g, '\n').split('\n');
}

export function unifiedDiff(beforeText, afterText, context = 3, label = 'file') {
  const a = splitLines(beforeText);
  const b = splitLines(afterText);
  const n = a.length;
  const m = b.length;

  const lcs = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const ops = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push([' ', a[i]]);
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      ops.push(['-', a[i++]]);
    } else {
      ops.push(['+', b[j++]]);
    }
  }
  while (i < n) ops.push(['-', a[i++]]);
  while (j < m) ops.push(['+', b[j++]]);

  if (!ops.some(([s]) => s !== ' ')) return '';

  const changeIdx = [];
  ops.forEach(([s], idx) => {
    if (s !== ' ') changeIdx.push(idx);
  });

  const ranges = [];
  let start = Math.max(0, changeIdx[0] - context);
  let end = Math.min(ops.length - 1, changeIdx[0] + context);
  for (const ci of changeIdx.slice(1)) {
    const s2 = Math.max(0, ci - context);
    const e2 = Math.min(ops.length - 1, ci + context);
    if (s2 <= end + 1) {
      end = Math.max(end, e2);
    } else {
      ranges.push([start, end]);
      start = s2;
      end = e2;
    }
  }
  ranges.push([start, end]);

  const out = [`--- a/${label}`, `+++ b/${label}`];
  for (const [rs, re] of ranges) {
    let oldCount = 0;
    let newCount = 0;
    const body = [];
    for (let x = rs; x <= re; x++) {
      const [sign, text] = ops[x];
      body.push(sign + text);
      if (sign === '-') oldCount++;
      else if (sign === '+') newCount++;
      else {
        oldCount++;
        newCount++;
      }
    }
    let oldStart = 0;
    let newStart = 0;
    let accOld = 0;
    let accNew = 0;
    for (let x = 0; x < rs; x++) {
      if (ops[x][0] === '-') accOld++;
      else if (ops[x][0] === '+') accNew++;
      else {
        accOld++;
        accNew++;
      }
    }
    oldStart = accOld;
    newStart = accNew;
    out.push(`@@ -${oldStart + 1},${oldCount} +${newStart + 1},${newCount} @@`);
    out.push(...body);
  }

  return out.join('\n');
}
