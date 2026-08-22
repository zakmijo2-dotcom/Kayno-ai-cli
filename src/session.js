import { join } from 'node:path';
import { SESSIONS_DIR } from './config.js';
import { readJson, writeJson, ensureDir } from './util.js';
import { readdirSync } from 'node:fs';

let counter = 0;

export class Session {
  constructor({ id = null, title = 'new', messages = [] } = {}) {
    this.id = id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.title = title.slice(0, 60);
    this.messages = messages;
    this.createdAt = Date.now();
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
    });
  }

  static list() {
    ensureDir(SESSIONS_DIR);
    return readdirSync(SESSIONS_DIR)
      .filter((f) => f.endsWith('.json'))
      .map((f) => {
        const s = readJson(join(SESSIONS_DIR, f), null);
        return s ? { id: s.id, title: s.title, at: s.createdAt, turns: s.messages.length } : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.at - a.at);
  }

  static load(id) {
    const data = readJson(join(SESSIONS_DIR, `${id}.json`), null);
    if (!data) throw new Error(`Session not found: ${id}`);
    return new Session(data);
  }
}
