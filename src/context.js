import { getCapabilities } from './providers/capabilities.js';

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
  const caps = getCapabilities(providerId, modelId);
  return {
    contextLimit: caps.contextLimit,
    outputLimit: caps.outputLimit,
    tools: caps.tools,
    reasoning: caps.reasoning,
    vision: caps.vision,
    known: caps.known,
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

export function extractUsage(raw) {
  const u = raw ?? {};
  const input = u.prompt_tokens ?? u.input_tokens ?? 0;
  const output = u.completion_tokens ?? u.output_tokens ?? 0;
  const cached =
    u.prompt_tokens_details?.cached_tokens ??
    u.cache_read_input_tokens ??
    u.cached_tokens ??
    0;
  return { input, output, cached };
}

export function estimateCost(cost, usage) {
  if (!cost || typeof cost !== 'object') return null;
  const input = Number(cost.input) || 0;
  const output = Number(cost.output) || 0;
  const cachedRate = Number(cost.cache_read ?? cost.input) || input;
  const billedInput = Math.max(0, (usage.input ?? 0) - (usage.cached ?? 0));
  const dollars =
    (billedInput * input +
      (usage.cached ?? 0) * cachedRate +
      (usage.output ?? 0) * output) /
    1_000_000;
  return dollars;
}

export function formatCost(dollars) {
  if (dollars == null) return '';
  if (dollars < 0.01) return `$${dollars.toFixed(4)}`;
  if (dollars < 1) return `$${dollars.toFixed(3)}`;
  return `$${dollars.toFixed(2)}`;
}
