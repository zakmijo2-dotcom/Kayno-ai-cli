import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';
import { SKILLS_DIR } from '../config.js';

export function parseFrontmatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  const meta = {};
  let body = text;
  if (m) {
    body = text.slice(m[0].length);
    for (const line of m[1].split(/\r?\n/)) {
      const kv = line.match(/^([a-zA-Z_-]+):\s*(.*)$/);
      if (!kv) continue;
      const key = kv[1].trim();
      const val = kv[2].trim();
      if (val.startsWith('[') && val.endsWith(']')) {
        meta[key] = val
          .slice(1, -1)
          .split(',')
          .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
          .filter(Boolean);
      } else {
        meta[key] = val.replace(/^['"]|['"]$/g, '');
      }
    }
  }
  return { meta, body };
}

export function discoverSkills() {
  const dirs = [
    { dir: SKILLS_DIR, scope: 'global' },
    { dir: join(process.cwd(), '.nova', 'skills'), scope: 'project' },
  ];
  const pkgRoot = (import.meta.dirname ?? '').split('/').slice(0, -2).join('/');
  if (pkgRoot) dirs.push({ dir: join(pkgRoot, 'skills'), scope: 'builtin' });
  const found = new Map();
  for (const { dir, scope } of dirs) {
    if (!existsSync(dir)) continue;
    walk(dir, 0, (file) => {
      if (basename(file) !== 'SKILL.md' && !basename(file).endsWith('.skill.md')) return;
      try {
        const raw = readFileSync(file, 'utf8');
        const { meta, body } = parseFrontmatter(raw);
        const name = meta.name || basename(file).replace(/\.skill\.md$/, '');
        found.set(name.toLowerCase(), {
          name,
          description: meta.description || '',
          triggers: Array.isArray(meta.triggers)
            ? meta.triggers
            : String(meta.triggers || '')
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean),
          path: file,
          body: body.trim(),
          scope,
        });
      } catch {}
    });
  }
  return [...found.values()];
}

function walk(dir, depth, cb) {
  if (depth > 4) return;
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const e of entries) {
    const full = join(dir, e);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) walk(full, depth + 1, cb);
    else cb(full);
  }
}

export function matchSkills(query, skills, max = 2, threshold = 1) {
  const q = query.toLowerCase();
  const words = new Set(q.split(/[^a-z0-9_+-]+/).filter(Boolean));
  const scored = [];
  for (const s of skills) {
    let score = 0;
    for (const t of s.triggers) {
      const tl = t.toLowerCase();
      if (words.has(tl)) score += 3;
      else if (q.includes(tl)) score += 2;
    }
    const descTerms = s.description
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 4);
    for (const w of words) if (descTerms.includes(w)) score += 1;
    if (score >= threshold) scored.push({ skill: s, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, max).map((x) => x.skill);
}
