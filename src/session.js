import { join } from 'node:path';
import { SESSIONS_DIR } from './config.js';
import { readJson, writeJson, ensureDir } from './util.js';
import { readdirSync, statSync, unlinkSync } from 'node:fs';

export class Session {
  constructor({ id = null, title = 'new', messages = [], usage = [] } = {}) {
    this.id = id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.title = title.slice(0, 60);
    this.messages = messages;
    this.usage = Array.isArray(usage) ? usage : [];
    this.createdAt = Date.now();
  }

  recordUsage(u) {
    this.usage = this.usage ?? [];
    this.usage.push({ ...u, at: Date.now() });
    if (this.usage.length > 500) this.usage = this.usage.slice(-400);
  }

  usageTotals() {
    return (this.usage ?? []).reduce(
      (acc, u) => ({
        input: acc.input + (u.input ?? 0),
        output: acc.output + (u.output ?? 0),
        cached: acc.cached + (u.cached ?? 0),
      }),
      { input: 0, output: 0, cached: 0 }
    );
  }

  push(role, content, extra = {}) {
    this.messages.push({ role, content, ...extra });
    if (this.messages.length > 400) this.messages = this.messages.slice(-300);
  }

  save() {
    ensureDir(SESSIONS_DIR);
    writeJson(join(SESSIONS_DIR, `${this.id}.json`), {
      id: this.id,
      title: this.title,
      createdAt: this.createdAt,
      messages: this.messages,
      usage: this.usage ?? [],
    });
  }

  static list(limit = 50) {
    ensureDir(SESSIONS_DIR);
    const files = readdirSync(SESSIONS_DIR)
      .filter((f) => f.endsWith('.json'))
      .map((f) => {
        const full = join(SESSIONS_DIR, f);
        let mtime = 0;
        try {
          mtime = statSync(full).mtimeMs;
        } catch {}
        return { f, full, mtime };
      })
      .sort((a, b) => b.mtime - a.mtime)
      .slice(0, limit);
    return files
      .map(({ full }) => {
        const s = readJson(full, null);
        return s ? { id: s.id, title: s.title, at: s.createdAt, turns: s.messages.length } : null;
      })
      .filter(Boolean);
  }

  static remove(id) {
    if (!/^[-a-zA-Z0-9]+$/.test(String(id))) return false;
    try {
      unlinkSync(join(SESSIONS_DIR, `${id}.json`));
      return true;
    } catch {
      return false;
    }
  }

  static search(query, limit = 20) {
    const q = String(query ?? '').toLowerCase().trim();
    if (!q) return Session.list(limit);
    const results = [];
    for (const meta of Session.list(100)) {
      if (
        meta.title.toLowerCase().includes(q) ||
        meta.id.includes(q)
      ) {
        results.push(meta);
        if (results.length >= limit) continue;
      }
    }
    if (results.length < limit) {
      for (const meta of Session.list(100)) {
        if (results.some((r) => r.id === meta.id)) continue;
        try {
          const full = readJson(join(SESSIONS_DIR, `${meta.id}.json`), null);
          const hit = (full?.messages ?? []).some((m) =>
            typeof m.content === 'string' && m.content.toLowerCase().includes(q)
          );
          if (hit) results.push({ ...meta, matchedInBody: true });
          if (results.length >= limit) break;
        } catch {}
      }
    }
    return results.slice(0, limit);
  }

  touch() {
    this.createdAt = Date.now();
  }

  static latest() {
    const l = Session.list(1);
    if (!l.length) return null;
    try {
      return Session.load(l[0].id);
    } catch {
      return null;
    }
  }

  static load(id) {
    const data = readJson(join(SESSIONS_DIR, `${id}.json`), null);
    if (!data) throw new Error(`Session not found: ${id}`);
    return new Session(data);
  }
}
