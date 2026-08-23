import { readJson } from './util.js';
import { CACHE_DIR } from './config.js';
import { join } from 'node:path';

const FALLBACK_CONTEXT = 128_000;

export function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(String(text).length / 4);
}

export function messageTokens(msg) {
  const content =
    typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content ?? '');
  const toolCalls = (msg.tool_calls ?? [])
    .map((t) => JSON.stringify(t.function?.arguments ?? '') + t.function?.name)
    .join('');
  return estimateTokens(content) + estimateTokens(toolCalls) + 4;
}

export function conversationTokens(messages) {
  return messages.reduce((sum, m) => sum + messageTokens(m), 0);
}

export function getModelCaps(providerId, modelId) {
  const cache = readJson(join(CACHE_DIR, 'models-dev.json'), {});
  const entry = cache[providerId];
  const model = modelId && entry?.models ? entry.models[modelId] : null;
  const partial = modelId ? modelId.split('/').pop() : '';
  const fuzzy = !model && entry?.models
    ? Object.entries(entry.models).find(([k]) => k === partial || k.startsWith(partial))?.[1]
    : null;
  const m = model || fuzzy || {};
  const input = m.modalities?.input ?? [];
  return {
    contextLimit: m.limit?.context ?? FALLBACK_CONTEXT,
    outputLimit: m.limit?.output ?? 8192,
    tools: m.tool_call !== false,
    reasoning: !!m.reasoning,
    vision: input.includes('image'),
    known: !!(model || fuzzy),
  };
}

function roleWeight(msg) {
  if (msg.role === 'system') return Infinity;
  if (msg.role === 'user') return 3;
  if (msg.role === 'tool') return 2;
  return 2;
}

export function pruneConversation(messages, { tokenBudget, keepLast = 12 }) {
  if (conversationTokens(messages) <= tokenBudget) return messages;

  const head = [];
  let idx = 0;
  while (idx < messages.length) {
    const m = messages[idx];
    if (m.role === 'tool') {
      head.push(m);
      idx++;
      continue;
    }
    break;
  }

  const tailStart = Math.max(idx, messages.length - keepLast);
  const tail = messages.slice(tailStart);

  const middle = messages.slice(head.length, tailStart);
  const keptMiddle = [];
  for (const m of middle) {
    if (m.role === 'assistant') {
      if (Array.isArray(m.tool_calls) && m.tool_calls.length) continue;
      keptMiddle.push(m);
    } else if (m.role === 'tool') {
      continue;
    } else {
      keptMiddle.push(m);
    }
  }
  const summary = {
    role: 'user',
    content: `[earlier conversation pruned to fit context window]`,
  };
  const keptTailOfMiddle = keptMiddle.slice(-4);
  return [...head, summary, ...keptTailOfMiddle, ...tail];
}

export function usageTotals(events) {
  let input = 0;
  let output = 0;
  for (const e of events) {
    if (e.type === 'usage' && e.usage) {
      input += e.usage.prompt_tokens ?? e.usage.input_tokens ?? 0;
      output += e.usage.completion_tokens ?? e.usage.output_tokens ?? 0;
    }
  }
  return { input, output };
}
