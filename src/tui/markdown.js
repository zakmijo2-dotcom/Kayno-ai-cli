import { c, sym } from './ansi.js';

const KEYWORDS = {
  js: 'const let var function return if else for while class new await async import export from try catch throw typeof null true false undefined this extends static get set of in do switch case break continue default delete yield',
  ts: 'const let var function return if else for while class new await async import export from try catch throw typeof interface type enum implements private public protected readonly null true false undefined this extends static as satisfies keyof infer never unknown any string number boolean void',
  py: 'def return if elif else for while class import from as with try except raise lambda None True False and or not in is pass yield global nonlocal assert del async await match case',
  go: 'func return if else for range while package import var const type struct interface map chan go defer select switch case break continue default nil true false',
  rust: 'fn return if else for while loop let mut pub use mod struct enum impl trait match Some None Ok Err self super crate where async move ref dyn',
  sh: 'if then else fi for while do done case esac function echo export local return exit source set',
  json: 'true false null',
  sql: 'SELECT FROM WHERE INSERT UPDATE DELETE JOIN LEFT RIGHT INNER ON GROUP BY ORDER LIMIT OFFSET CREATE TABLE ALTER DROP VALUES SET AND OR NOT NULL',
};
const LANG_ALIAS = {
  javascript: 'js', js: 'js', jsx: 'js', mjs: 'js', cjs: 'js', node: 'js',
  typescript: 'ts', ts: 'ts', tsx: 'ts',
  python: 'py', py: 'py',
  golang: 'go', go: 'go',
  rust: 'rust', rs: 'rust',
  bash: 'sh', sh: 'sh', shell: 'sh', zsh: 'sh', console: 'sh',
  json: 'json', sql: 'sql', java: 'java', c: 'c', cpp: 'cpp', cs: 'cs', ruby: 'rb', rb: 'rb',
};

function kwList(lang) {
  const key = LANG_ALIAS[String(lang || '').toLowerCase()] ?? '';
  const set = KEYWORDS[key];
  return set ? new Set(set.split(' ')) : null;
}

function highlightLine(line, lang) {
  const kws = kwList(lang);
  if (!kws) return line;
  let out = '';
  let i = 0;
  const n = line.length;
  while (i < n) {
    const ch = line[i];
    if (ch === '"' || ch === "'" || ch === '`') {
      let j = i + 1;
      while (j < n && line[j] !== ch) {
        if (line[j] === '\\') j++;
        j++;
      }
      out += c.green(line.slice(i, Math.min(j + 1, n)));
      i = j + 1;
      continue;
    }
    if ((ch === '/' && line[i + 1] === '/') || ch === '#') {
      out += c.gray(line.slice(i));
      break;
    }
    if (/[A-Za-z_$]/.test(ch)) {
      let j = i;
      while (j < n && /[A-Za-z0-9_$]/.test(line[j])) j++;
      const word = line.slice(i, j);
      out += kws.has(word) ? c.magenta(word) : word;
      i = j;
      continue;
    }
    if (/[0-9]/.test(ch)) {
      let j = i;
      while (j < n && /[0-9a-fx._]/i.test(line[j])) j++;
      out += c.blue(line.slice(i, j));
      i = j;
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

function inline(s) {
  let out = String(s);
  out = out.replace(/`([^`]+)`/g, (_, code) => c.cyan(code));
  out = out.replace(/\*\*([^*]+)\*\*/g, (_, b) => c.bold(b));
  out = out.replace(/(^|\W)\*([^*\s][^*]*)\*(?=\W|$)/g, (_, p, it) => p + c.italic(it));
  return out;
}

export function mdToBlocks(md, width) {
  const blocks = [];
  const lines = String(md ?? '').replace(/\r\n/g, '\n').split('\n');
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const fence = line.match(/^```\s*([A-Za-z0-9+#_-]*)\s*$/);
    if (fence) {
      const lang = fence[1];
      const body = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) {
        body.push(lines[i]);
        i++;
      }
      i++;
      blocks.push({ kind: 'code', lang, body });
      continue;
    }
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      blocks.push({ kind: 'header', level: h[1].length, text: h[2] });
      i++;
      continue;
    }
    const bullet = line.match(/^(\s*)[-*•]\s+(.*)$/);
    if (bullet) {
      blocks.push({ kind: 'bullet', indent: Math.floor(bullet[1].length / 2), text: bullet[2] });
      i++;
      continue;
    }
    const num = line.match(/^\s*(\d+)[.)]\s+(.*)$/);
    if (num) {
      blocks.push({ kind: 'numbered', num: num[1], text: num[2] });
      i++;
      continue;
    }
    if (/^\s*>/.test(line)) {
      blocks.push({ kind: 'quote', text: line.replace(/^\s*>\s?/, '') });
      i++;
      continue;
    }
    if (/^\s*(---+|===+)\s*$/.test(line)) {
      blocks.push({ kind: 'rule' });
      i++;
      continue;
    }
    if (line.trim() === '') {
      blocks.push({ kind: 'blank' });
      i++;
      continue;
    }
    const para = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !/^```/.test(lines[i]) &&
      !/^#{1,4}\s/.test(lines[i]) &&
      !/^(\s*)[-*•]\s/.test(lines[i])
    ) {
      para.push(lines[i]);
      i++;
    }
    blocks.push({ kind: 'para', text: para.join('\n') });
  }
  void width;
  return blocks;
}

export function renderMarkdown(md, width = 80, opts = {}) {
  const w = Math.max(20, width - 2);
  const out = [];
  for (const block of mdToBlocks(md, width)) {
    switch (block.kind) {
      case 'code': {
        out.push(c.gray(`${sym('cornerTL')}${sym('horiz')} ${block.lang || 'code'} `) + c.gray(sym('horiz').repeat(3)));
        for (const l of block.body.slice(0, opts.maxCodeLines ?? 400)) {
          out.push(` ${highlightLine(l, block.lang)}`);
        }
        if (block.body.length > (opts.maxCodeLines ?? 400)) {
          out.push(c.gray(` … +${block.body.length - (opts.maxCodeLines ?? 400)} lines`));
        }
        out.push(c.gray(sym('cornerBL') + sym('horiz').repeat(w > 10 ? 8 : 6)));
        break;
      }
      case 'header':
        out.push('');
        out.push(c.bold(c.magenta('#'.repeat(Math.max(1, 5 - block.level)) + ' ') + c.bold(block.text)));
        break;
      case 'bullet':
        out.push('  '.repeat(block.indent) + c.cyan(sym('bullet')) + ' ' + inline(block.text));
        break;
      case 'numbered':
        out.push(`  ${c.yellow(block.num + '.')} ${inline(block.text)}`);
        break;
      case 'quote':
        out.push(c.gray('│ ') + c.dim(inline(block.text)));
        break;
      case 'rule':
        out.push(c.gray(sym('horiz').repeat(Math.min(w, 40))));
        break;
      case 'blank':
        out.push('');
        break;
      default:
        for (const l of block.text.split('\n')) out.push(inline(l));
    }
  }
  return out;
}

export function renderDiffCard({ title, diffText, width = 80 }) {
  const out = [];
  out.push(c.bold(c.yellow(`${sym('diamond')} ${title}`)));
  const w = Math.max(20, width - 3);
  let added = 0;
  let removed = 0;
  const lines = String(diffText ?? '').split('\n');
  for (const l of lines) {
    if (l.startsWith('+')) added++;
    else if (l.startsWith('-')) removed++;
  }
  out.push(c.dim(` ${sym('arrowUp')} ${added} addition(s) · ${sym('arrowDown')} ${removed} removal(s)`));
  const maxLines = 60;
  let shown = 0;
  for (const raw of lines) {
    if (shown >= maxLines) {
      out.push(c.gray(` … +${lines.length - shown} more lines`));
      break;
    }
    const clipped = raw.length > w ? raw.slice(0, w) + '…' : raw;
    if (clipped.startsWith('+')) out.push(c.green('+' + clip(clipped.slice(1), w - 1)));
    else if (clipped.startsWith('-')) out.push(c.red('-' + clip(clipped.slice(1), w - 1)));
    else if (clipped.startsWith('@@')) out.push(c.cyan(clipped));
    else out.push(c.dim(clipped));
    shown++;
  }
  return out;
}

function clip(s, n) {
  return s.length > n ? s.slice(0, Math.max(0, n - 1)) + '…' : s;
}

export function isDiffText(text) {
  return /^(---\s|\+\+\+\s|diff --git|@@ -)/m.test(String(text ?? '').slice(0, 2000));
}
