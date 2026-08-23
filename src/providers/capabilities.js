import { readJson } from '../util.js';
import { CACHE_DIR, loadConfig } from '../config.js';
import { join } from 'node:path';
import { statSync } from 'node:fs';
import { getRegisteredProvider } from './registry.js';

const FALLBACK_CONTEXT = 128_000;
const FALLBACK_OUTPUT = 8_192;

let cacheMeta = null;

function loadModelCatalog() {
  const file = join(CACHE_DIR, 'models-dev.json');
  try {
    const mtime = statSync(file).mtimeMs;
    if (cacheMeta?.mtime === mtime) return cacheMeta.data;
    const data = readJson(file, {});
    cacheMeta = { mtime, data };
    return data;
  } catch {
    return {};
  }
}

function findRecord(entry, modelId) {
  if (!entry?.models || !modelId) return null;
  if (entry.models[modelId]) return entry.models[modelId];
  const partial = String(modelId).split('/').pop();
  for (const [key, value] of Object.entries(entry.models)) {
    if (key === partial || key.startsWith(partial)) return value;
  }
  return null;
}

export function getCapabilities(providerId, modelId) {
  const provider = getRegisteredProvider(providerId);
  if (!provider) {
    return Object.freeze({
      contextLimit: FALLBACK_CONTEXT,
      outputLimit: FALLBACK_OUTPUT,
      tools: true,
      reasoning: false,
      vision: false,
      streaming: true,
      known: false,
      providerKnown: false,
    });
  }

  const catalog = loadModelCatalog();
  const record = findRecord(catalog[providerId], modelId);

  const caps = {
    contextLimit: FALLBACK_CONTEXT,
    outputLimit: FALLBACK_OUTPUT,
    tools: true,
    reasoning: false,
    vision: false,
    streaming: true,
    known: !!record,
    providerKnown: true,
  };

  if (record) {
    caps.contextLimit = record.limit?.context ?? caps.contextLimit;
    caps.outputLimit = record.limit?.output ?? caps.outputLimit;
    caps.tools = record.tool_call !== false;
    caps.reasoning = !!record.reasoning;
    caps.vision = (record.modalities?.input ?? []).includes('image');
  }

  const cfg = loadConfig();
  const overrides = cfg.providers?.[providerId]?.capabilities ?? {};
  for (const key of ['contextLimit', 'outputLimit', 'tools', 'reasoning', 'vision', 'streaming']) {
    if (overrides[key] !== undefined) caps[key] = overrides[key];
  }

  return Object.freeze(caps);
}

export function supportsTools(providerId, modelId) {
  return getCapabilities(providerId, modelId).tools;
}

export function supportsReasoning(providerId, modelId) {
  return getCapabilities(providerId, modelId).reasoning;
}

export function supportsVision(providerId, modelId) {
  return getCapabilities(providerId, modelId).vision;
}

export function supportsStreaming(providerId, modelId) {
  return getCapabilities(providerId, modelId).streaming;
}

export function contextLimit(providerId, modelId) {
  return getCapabilities(providerId, modelId).contextLimit;
}
