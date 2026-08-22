import { homedir } from 'node:os';
import { join } from 'node:path';
import { readJson, writeJson, ensureDir, expandEnv } from './util.js';

export const NOVA_HOME = process.env.NOVA_HOME || join(homedir(), '.nova');
export const CONFIG_FILE = join(NOVA_HOME, 'config.json');
export const AUTH_FILE = join(NOVA_HOME, 'auth.json');
export const SESSIONS_DIR = join(NOVA_HOME, 'sessions');
export const SKILLS_DIR = join(NOVA_HOME, 'skills');
export const PLUGINS_DIR = join(NOVA_HOME, 'plugins');
export const CACHE_DIR = join(NOVA_HOME, 'cache');

export function paths() {
  return {
    home: NOVA_HOME,
    config: CONFIG_FILE,
    auth: AUTH_FILE,
    sessions: SESSIONS_DIR,
    skills: SKILLS_DIR,
    plugins: PLUGINS_DIR,
    cache: CACHE_DIR,
  };
}

const DEFAULTS = {
  provider: 'openrouter',
  model: '',
  temperature: 0.7,
  stream: true,
  yolo: false,
  tools: true,
  maxTurns: 16,
  profile: 'coder',
  systemOverride: '',
  providers: {},
  auth: {},
};

let cache = null;

export function loadConfig() {
  if (cache) return cache;
  ensureDir(NOVA_HOME);
  const stored = readJson(CONFIG_FILE, {});
  cache = deepMerge(structuredClone(DEFAULTS), stored);
  return cache;
}

export function saveConfig(cfg) {
  cache = cfg;
  writeJson(CONFIG_FILE, cfg);
}

export function setConfigValue(key, value) {
  const cfg = loadConfig();
  const parts = key.split('.');
  let node = cfg;
  for (let i = 0; i < parts.length - 1; i++) {
    if (typeof node[parts[i]] !== 'object' || node[parts[i]] === null) node[parts[i]] = {};
    node = node[parts[i]];
  }
  node[parts.at(-1)] = coerce(value);
  saveConfig(cfg);
  return cfg;
}

export function getConfigValue(key) {
  const cfg = loadConfig();
  return key
    .split('.')
    .reduce((acc, k) => (acc == null ? acc : acc[k]), cfg);
}

function coerce(v) {
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  return expandEnv(v);
}

function deepMerge(base, over) {
  for (const [k, v] of Object.entries(over || {})) {
    if (v && typeof v === 'object' && !Array.isArray(v) && typeof base[k] === 'object' && base[k] !== null) {
      deepMerge(base[k], v);
    } else {
      base[k] = v;
    }
  }
  return base;
}
