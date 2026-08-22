import { buildSystemPrompt } from './prompts/system.js';
import { discoverSkills, matchSkills } from './skills/index.js';
import { loadPlugins, runHooks } from './plugins/index.js';
import { TOOL_SCHEMAS, executeTool } from './tools.js';
import { streamChat } from './providers/client.js';
import { Session } from './session.js';
import { c } from './util.js';

let pluginsCache = null;
export async function getPlugins() {
  if (!pluginsCache) pluginsCache = await loadPlugins();
  return pluginsCache;
}
export function resetPlugins() {
  pluginsCache = null;
}

export async function runTurn({ session, input, cfg, provider, model, quiet = false, ask = null }) {
  const skills = cfg.skills !== false ? matchSkills(input, discoverSkills()) : [];
  const system = buildSystemPrompt({
    profile: cfg.profile || 'coder',
    skills,
    systemOverride: cfg.systemOverride || '',
  });

  const toolsEnabled = cfg.tools !== false;
  let toolSchemas = toolsEnabled ? TOOL_SCHEMAS : [];

  session.push('user', input);

  const plugins = await getPlugins();
  const ctx = await runHooks(plugins.hooks, 'beforeRequest', {
    provider: provider.id,
    model,
    messages: session.messages,
    system,
    meta: {},
  });

  const maxTurns = cfg.maxTurns || 16;
  let finalText = '';

  for (let i = 0; i < maxTurns; i++) {
    const pending = new Map();
    let text = '';
    let usage = null;

    try {
      for await (const evt of streamChat({
        provider,
        model,
        messages: ctx.messages,
        system: ctx.system || system,
        tools: [...toolSchemas, ...plugins.tools.map(normalizePluginTool)],
        temperature: cfg.temperature ?? 0.7,
      })) {
        if (evt.type === 'text') {
          text += evt.text;
          if (!quiet) process.stdout.write(evt.text);
          await runHooks(plugins.hooks, 'onDelta', { text: evt.text });
        } else if (evt.type === 'tool_delta') {
          const cur = pending.get(evt.index) || { id: evt.id || null, name: evt.name || '', args: '' };
          if (evt.id) cur.id = evt.id;
          if (evt.name) cur.name = evt.name;
          cur.args += evt.argsChunk || '';
          pending.set(evt.index, cur);
        } else if (evt.type === 'tool_complete') {
          pending.set(pending.size + 1000, {
            id: evt.id,
            name: evt.name,
            args: evt.arguments || '{}',
          });
        } else if (evt.type === 'usage') {
          usage = evt.usage;
        }
      }
    } catch (err) {
      if (!quiet) console.error(`\n${c.red('provider error:')} ${err.message}`);
      throw err;
    }

    const toolCalls = [...pending.values()].filter((t) => t.name);

    if (toolCalls.length === 0) {
      finalText = text;
      break;
    }

    session.push('assistant', text, {
      tool_calls: toolCalls.map((t) => ({
        id: t.id || `call_${Math.random().toString(36).slice(2)}`,
        type: 'function',
        function: { name: t.name, arguments: t.args },
      })),
    });

    for (const call of toolCalls) {
      const id = call.id || `call_${Math.random().toString(36).slice(2)}`;
      let result;
      try {
        const args = safeParse(call.args);
        result = await executeTool(call.name, args, { yolo: !!cfg.yolo, ask });
        if (!quiet) console.log(c.dim(`\n[tool:${call.name}] ${String(result).slice(0, 400)}${String(result).length > 400 ? '…' : ''}`));
      } catch (err) {
        result = `TOOL ERROR: ${err.message}`;
        if (!quiet) console.error(c.red(`\n[tool:${call.name}] error: ${err.message}`));
      }
      session.push('tool', String(result), { tool_call_id: id, name: call.name });
    }

    ctx.messages = session.messages;
    const updated = await runHooks(plugins.hooks, 'beforeRequest', {
      provider: provider.id,
      model,
      messages: session.messages,
      system: ctx.system || system,
      meta: ctx.meta || {},
    });
    ctx.messages = updated.messages;
    ctx.system = updated.system;
  }

  await runHooks(plugins.hooks, 'afterResponse', {
    provider: provider.id,
    model,
    text: finalText,
    turns: session.messages.length,
  });
  await runHooks(plugins.hooks, 'onTurnEnd', { ok: true });
  return finalText;
}

function normalizePluginTool(t) {
  if (t.function && t.type === 'function') return t;
  return {
    type: 'function',
    function: {
      name: t.name,
      description: t.description || '',
      parameters: t.parameters || { type: 'object', properties: {} },
    },
  };
}

export async function runPluginCommand(name) {
  const plugins = await getPlugins();
  const cmd = plugins.commands.get(name.replace(/^\//, '').toLowerCase());
  if (!cmd) return false;
  try {
    await cmd.fn();
  } catch (err) {
    console.error(`[plugin ${cmd.plugin}] command error: ${err.message}`);
  }
  return true;
}

function safeParse(s, fallback = {}) {
  try {
    return JSON.parse(s || '{}');
  } catch {
    return fallback;
  }
}

export { Session };
