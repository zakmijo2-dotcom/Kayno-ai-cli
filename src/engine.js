import { buildSystemPrompt } from './prompts/system.js';
import { discoverSkills, matchSkills } from './skills/index.js';
import { loadPlugins, runHooks } from './plugins/index.js';
import { TOOL_SCHEMAS, executeTool } from './tools.js';
import { streamChat } from './providers/client.js';
import { createPlainEmitter } from './tui/events.js';
import { getModelCaps, conversationTokens, estimateTokens, pruneConversation } from './context.js';

let pluginsCache = null;
export async function getPlugins() {
  if (!pluginsCache) pluginsCache = await loadPlugins();
  return pluginsCache;
}
export function resetPlugins() {
  pluginsCache = null;
}

function isAbort(err) {
  return (
    err?.name === 'AbortError' ||
    /This operation was aborted|aborted/i.test(String(err?.message ?? ''))
  );
}

export function parseExitCode(resultStr) {
  const m = /^exit=(\d+)/.exec(String(resultStr ?? '').trim());
  return m ? Number(m[1]) : null;
}

export async function runTurn({
  session,
  input,
  cfg,
  provider,
  model,
  quiet = false,
  ask = null,
  emit = null,
  signal = null,
}) {
  if (!emit) {
    if (quiet) emit = () => {};
    else emit = createPlainEmitter({ stream: process.stdout });
  }

  const skills = cfg.skills !== false ? matchSkills(input, discoverSkills()) : [];
  const system = buildSystemPrompt({
    profile: cfg.profile || 'coder',
    skills,
    systemOverride: cfg.systemOverride || '',
  });
  const toolsEnabled = cfg.tools !== false;
  const toolSchemas = toolsEnabled ? TOOL_SCHEMAS : [];

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
  const startedAt = Date.now();
  let finalText = '';
  let aborted = false;
  let sawThinking = false;

  const caps = getModelCaps(provider.id, model);
  const budgetPct = Math.min(Math.max(Number(cfg.contextBudgetPct) || 60, 20), 90);
  const tokenBudget = Math.floor((caps.contextLimit * budgetPct) / 100);

  emit({ type: 'turn_start', input, provider: provider.id, model });

  for (let i = 0; i < maxTurns; i++) {
    if (signal?.aborted) {
      aborted = true;
      break;
    }
    const pending = new Map();
    let text = '';
    let usage = null;
    const bufferOnly = cfg.stream === false;

    let requestMessages = ctx.messages;
    if (conversationTokens(requestMessages) + estimateTokens(ctx.system || system) > tokenBudget) {
      requestMessages = pruneConversation(requestMessages, { tokenBudget });
    }

    try {
      for await (const evt of streamChat({
        provider,
        model,
        messages: requestMessages,
        system: ctx.system || system,
        tools: [...toolSchemas, ...plugins.tools.map(normalizePluginTool)],
        temperature: cfg.temperature ?? 0.7,
        signal,
      })) {
        if (evt.type === 'text') {
          text += evt.text;
          if (!bufferOnly) emit({ type: 'text_delta', text: evt.text });
          await runHooks(plugins.hooks, 'onDelta', { text: evt.text });
        } else if (evt.type === 'thinking') {
          if (!bufferOnly) {
            if (!sawThinking) {
              sawThinking = true;
              emit({ type: 'thinking_start' });
            }
            emit({ type: 'thinking_delta', length: evt.text.length });
          }
        } else if (evt.type === 'tool_delta') {
          const cur = pending.get(evt.index) || { id: evt.id || null, name: evt.name || '', args: '' };
          if (evt.id) cur.id = evt.id;
          if (evt.name) cur.name = evt.name;
          cur.args += evt.argsChunk || '';
          pending.set(evt.index, cur);
          emit({ type: 'tool_delta', index: evt.index, bytes: (cur.args || '').length });
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
      if (bufferOnly && text) emit({ type: 'text_delta', text });
    } catch (err) {
      if (isAbort(err)) {
        aborted = true;
        break;
      }
      emit({ type: 'error', message: err.message, status: err.status });
      throw err;
    }

    if (usage) emit({ type: 'usage', usage });

    const toolCalls = [...pending.values()].filter((t) => t.name);

    if (text && sawThinking) {
      emit({ type: 'thinking_end' });
    }

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
      if (signal?.aborted) {
        aborted = true;
        break;
      }
      const id = call.id || `call_${Math.random().toString(36).slice(2)}`;
      let argsObj = {};
      try {
        argsObj = JSON.parse(call.args || '{}');
      } catch {}
      emit({ type: 'tool_start', id, name: call.name, args: argsObj });
      let result;
      const toolStart = Date.now();
      try {
        if (ask) emit({ type: 'confirmation_required', id, name: call.name, args: argsObj });
        result = await executeTool(call.name, argsObj, { yolo: !!cfg.yolo, ask });
        emit({
          type: 'tool_complete',
          id,
          name: call.name,
          args: argsObj,
          summaryLen: String(result).length,
          exitCode: parseExitCode(result),
          durationMs: Date.now() - toolStart,
        });
      } catch (err) {
        result = `TOOL ERROR: ${err.message}`;
        emit({
          type: 'tool_error',
          id,
          name: call.name,
          args: argsObj,
          message: err.message,
          durationMs: Date.now() - toolStart,
        });
      }
      session.push('tool', String(result), { tool_call_id: id, name: call.name });
    }
    if (aborted) break;

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

  emit({
    type: 'turn_complete',
    finalText,
    aborted,
    durationMs: Date.now() - startedAt,
    tokens: conversationTokens(session.messages),
    contextLimit: caps.contextLimit,
  });

  await runHooks(plugins.hooks, 'afterResponse', {
    provider: provider.id,
    model,
    text: finalText,
    turns: session.messages.length,
  });
  await runHooks(plugins.hooks, 'onTurnEnd', { ok: !aborted });
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

