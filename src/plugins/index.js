import { readdirSync, existsSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';
import { PLUGINS_DIR } from '../config.js';

const HOOK_NAMES = ['beforeRequest', 'afterResponse', 'onDelta', 'onTurnEnd'];

export async function loadPlugins() {
  const registry = {
    plugins: [],
    commands: new Map(),
    hooks: Object.fromEntries(HOOK_NAMES.map((h) => [h, []])),
    tools: [],
  };
  const dirs = [
    PLUGINS_DIR,
    join(process.cwd(), '.nova', 'plugins'),
    join(import.meta.dirname ?? '', '..', '..', 'plugins', 'examples'),
  ].filter(Boolean);

  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    for (const entry of safeList(dir)) {
      const full = join(dir, entry);
      if (!isPluginEntry(full)) continue;
      try {
        const mod = await importEntry(full);
        const plugin = normalizePlugin(mod.default || mod, entry);
        registerPlugin(registry, plugin, basename(dir) === 'examples' ? 'builtin-example' : dir.includes('.nova') ? (dir === PLUGINS_DIR ? 'global' : 'project') : 'global');
      } catch (err) {
        console.error(`[plugins] failed to load ${full}: ${err.message}`);
      }
    }
  }
  return registry;
}

function safeList(dir) {
  try {
    return readdirSync(dir).filter((e) => !e.startsWith('.'));
  } catch {
    return [];
  }
}

function isPluginEntry(full) {
  let st;
  try {
    st = statSync(full);
  } catch {
    return false;
  }
  if (st.isFile()) return /\.(m|c)?js$/.test(full);
  if (!st.isDirectory()) return false;
  return ['index.js', 'index.mjs', 'plugin.js', 'plugin.mjs'].some((f) => existsSync(join(full, f)));
}

async function importEntry(full) {
  let target = full;
  let st = statSync(full);
  if (st.isDirectory()) {
    target = ['index.mjs', 'index.js', 'plugin.mjs', 'plugin.js']
      .map((f) => join(full, f))
      .find((f) => existsSync(f));
  }
  return import(target);
}

function normalizePlugin(mod, label) {
  const p = {
    name: mod.name || label,
    version: mod.version || '0.0.0',
    description: mod.description || '',
    commands: {},
  };
  for (const h of HOOK_NAMES) {
    if (typeof mod[h] === 'function') p[h] = mod[h];
  }
  if (typeof mod.setup === 'function') {
    const extra = mod.setup() || {};
    Object.assign(p.commands, extra.commands || {});
    for (const h of HOOK_NAMES) if (typeof extra[h] === 'function') p[h] = extra[h];
    if (Array.isArray(extra.tools)) p.extraTools = extra.tools;
  }
  return p;
}

const RESERVED_TOOLS = new Set([
  'read_file', 'write_file', 'edit_file', 'patch_file', 'grep', 'glob',
  'list_dir', 'run_command', 'fetch_url', 'git_status', 'git_diff',
]);

function registerPlugin(registry, plugin, scope) {
  if (!plugin.name || typeof plugin.name !== 'string') {
    throw new Error('plugin must export a string "name"');
  }
  if (Array.isArray(plugin.extraTools)) {
    plugin.extraTools = plugin.extraTools.filter((t) => {
      const tname = t?.function?.name ?? t?.name;
      if (tname && RESERVED_TOOLS.has(tname)) {
        console.error(`[plugins] ${plugin.name}: tool "${tname}" collides with a built-in; skipped`);
        return false;
      }
      return true;
    });
  }
  registry.plugins.push({ ...plugin, scope });
  for (const h of HOOK_NAMES) if (plugin[h]) registry.hooks[h].push(plugin[h].bind(plugin));
  for (const [cmd, fn] of Object.entries(plugin.commands || {})) {
    if (typeof fn === 'function') registry.commands.set(cmd.toLowerCase(), { fn: fn.bind(plugin), plugin: plugin.name });
  }
  if (Array.isArray(plugin.extraTools)) registry.tools.push(...plugin.extraTools);
}

export async function runHooks(hooks, name, payload) {
  let current = payload;
  for (const hook of hooks[name] || []) {
    try {
      const out = await hook(structuredClone(current));
      if (out && typeof out === 'object') current = { ...current, ...out };
    } catch (err) {
      console.error(`[plugins] ${name} hook error: ${err.message}`);
    }
  }
  return current;
}
