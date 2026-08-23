import { readJson } from '../util.js';
import { CACHE_DIR, loadConfig } from '../config.js';
import { join } from 'node:path';
import { statSync } from 'node:fs';
import { getRegisteredProvider, resolveAlias } from './registry.js';

let indexMeta = null;

function loadIndex() {
  const file = join(CACHE_DIR, 'models-dev.json');
  try {
    const mtime = statSync(file).mtimeMs;
    if (indexMeta?.mtime === mtime) return indexMeta.data;
    const raw = readJson(file, {});
    const index = new Map();
    for (const [providerId, entry] of Object.entries(raw)) {
      const models = [];
      for (const [id, m] of Object.entries(entry.models ?? {})) {
        models.push({
          provider: providerId,
          id,
          name: m.name ?? id,
          contextLimit: m.limit?.context ?? null,
          tools: m.tool_call !== false,
          reasoning: !!m.reasoning,
          vision: (m.modalities?.input ?? []).includes('image'),
          cost: m.cost ?? null,
        });
      }
      index.set(providerId, models);
    }
    indexMeta = { mtime, data: index };
    return index;
  } catch {
    return new Map();
  }
}

export function modelsFor(providerId) {
  return loadIndex().get(resolveAlias(providerId)) ?? [];
}

export function findModel(query) {
  const q = String(query ?? '').trim();
  if (!q) return null;
  const slash = q.indexOf('/');
  if (slash > 0) {
    const providerId = q.slice(0, slash);
    const modelId = q.slice(slash + 1);
    const hit = modelsFor(providerId).find((m) => m.id === modelId || m.id.endsWith('/' + modelId));
    if (hit) return hit;
  }
  for (const models of loadIndex().values()) {
    const exact = models.find((m) => m.id === q);
    if (exact) return exact;
  }
  return null;
}

export function searchModels(query, limit = 25) {
  const q = String(query ?? '').toLowerCase().trim();
  if (!q) return [];
  const out = [];
  for (const models of loadIndex().values()) {
    for (const m of models) {
      if (
        m.id.toLowerCase().includes(q) ||
        m.name.toLowerCase().includes(q)
      ) {
        out.push(m);
        if (out.length >= limit) return out;
      }
    }
  }
  return out;
}

export function modelCount() {
  let n = 0;
  for (const models of loadIndex().values()) n += models.length;
  return n;
}

export function providerModelIds(providerId, limit = 40) {
  const cfg = loadConfig();
  const pid = resolveAlias(providerId);
  const configured = cfg.providers?.[pid]?.model;
  const preset = getRegisteredProvider(pid);
  const ids = [];
  const push = (id) => {
    if (id && !ids.includes(id)) ids.push(id);
  };
  push(configured);
  push(preset?.defaultModel);
  for (const m of modelsFor(pid)) {
    push(m.id);
    if (ids.length >= limit) break;
  }
  return ids.filter(Boolean).slice(0, limit);
}

export function modelCost(providerId, modelId) {
  const hit = findModel(`${providerId}/${modelId}`) ?? findModel(modelId);
  return hit?.cost ?? null;
}
