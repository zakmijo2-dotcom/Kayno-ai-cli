import { readJson, writeJson, expandEnv } from '../util.js';
import { CACHE_DIR, loadConfig } from '../config.js';
import { join } from 'node:path';

import { getToken, loadAuth } from '../auth/store.js';
import {
  PROVIDER_DEFS,
  normalizeProvider,
  getRegisteredProvider,
  resolveAlias,
  registryStats,
  CATEGORIES,
} from './registry.js';
import { providerModelIds } from './models.js';

export { PROVIDER_DEFS as PRESETS };
export { registryStats, CATEGORIES, resolveAlias };

let mergedMeta = null;

function invalidateMerged() {
  mergedMeta = null;
}

function cacheFile() {
  return join(CACHE_DIR, 'models-dev.json');
}

function loadCache() {
  try {
    const mtime = statSync(cacheFile()).mtimeMs;
    if (mergedMeta?.mtime === mtime && mergedMeta.data) return mergedMeta.data;
    const data = readJson(cacheFile(), {});
    return data;
  } catch {
    return {};
  }
}

export function allProviders() {
  const cfg = loadConfig();
  const mtime = (() => {
    try {
      return statSync(cacheFile()).mtimeMs;
    } catch {
      return 0;
    }
  })();

  if (mergedMeta?.mtime === mtime && mergedMeta.merged) return mergedMeta.merged;

  const map = new Map();
  for (const p of __staticList()) map.set(p.id, p);

  for (const [id, entry] of Object.entries(loadCache())) {
    if (map.has(id)) continue;
    const type =
      entry.api === 'anthropic' ? 'anthropic' : entry.api === 'google' ? 'gemini' : 'openai';
    map.set(
      id,
      normalizeProvider({
        id,
        name: entry.name || id,
        type,
        category: 'api-key',
        baseUrl: '',
        env: `${id.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_API_KEY`,
        defaultModel: firstModel(entry.models),
      })
    );
  }

  for (const [id, over] of Object.entries(cfg.providers ?? {})) {
    const base = map.get(id) || normalizeProvider({ id, name: id });
    map.set(id, { ...base, ...over, id });
  }

  const merged = [...map.values()];
  mergedMeta = { mtime, merged };
  return merged;
}

function __staticList() {
  if (!__staticList.cache) {
    __staticList.cache = PROVIDER_DEFS.map(normalizeProvider);
  }
  return __staticList.cache;
}
__staticList.cache = null;

function firstModel(models) {
  if (!models) return '';
  const ids = Object.keys(models);
  return ids.includes('default') ? 'default' : ids[0] || '';
}

export function getProvider(id) {
  const canonicalId = resolveAlias(id);
  const all = allProviders();
  let hit = all.find((p) => p.id === canonicalId);
  if (!hit && canonicalId !== id) hit = all.find((p) => p.id === String(id).toLowerCase());
  if (!hit) {
    const cfg = loadConfig();
    const over = cfg.providers?.[id];
    if (over) return { ...normalizeProvider({ id, name: id }), ...over, id };
  }
  return hit ?? null;
}

export function searchProviders(q) {
  const query = String(q ?? '').toLowerCase().trim();
  if (!query) return allProviders();
  return allProviders().filter(
    (p) =>
      p.id.toLowerCase().includes(query) ||
      p.name.toLowerCase().includes(query) ||
      (p.aliases ?? []).some((a) => a.toLowerCase().includes(query))
  );
}

export async function syncFromModelsDev() {
  const res = await fetch('https://models.dev/api.json', {
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`models.dev fetch failed: HTTP ${res.status}`);
  const json = await res.json();
  writeJson(cacheFile(), json);
  invalidateMerged();
  return Object.keys(json).length;
}

export function resolveApiKey(provider) {
  if (!provider) return null;
  if (provider.oauth || provider.noKeyNeeded) return null;
  const cfg = loadConfig();
  const override = cfg.providers?.[provider.id]?.apiKey;
  if (override) return expandEnv(override);
  if (provider.env && process.env[provider.env]) return process.env[provider.env];
  const stored = loadAuth().tokens?.[provider.id]?.apiKey;
  return stored ? expandEnv(stored) : null;
}

export function hasUsableAuth(provider) {
  if (!provider) return false;
  if (provider.local || provider.noKeyNeeded) return true;
  if (provider.oauth) {
    const kind = provider.auth === 'antigravity' ? 'antigravity' : 'google-oauth';
    return !!getToken(kind);
  }
  return !!resolveApiKey(provider);
}

export function invalidateCatalog() {
  invalidateMerged();
}

export { providerModelIds };
