import { postStream } from '../../http.js';
import { resolveApiKey } from '../catalog.js';

export async function* streamOpenAI({ provider, model, messages, system, tools, temperature, signal, maxTokens }) {
  const key = resolveApiKey(provider);
  const url = `${provider.baseUrl.replace(/\/$/, '')}/chat/completions`;
  const body = {
    model,
    temperature,
    stream: true,
    messages: system ? [{ role: 'system', content: system }, ...messages] : messages,
  };
  if (maxTokens) body.max_tokens = maxTokens;
  if (tools.length) {
    body.tools = tools;
    body.tool_choice = 'auto';
  }
  const headers = { authorization: `Bearer ${key || 'no-key'}` };
  applyExtraHeaders(headers, provider);
  for await (const evt of await postStream(url, body, headers, signal, { label: `stream:${provider.id}` })) {
    const choice = evt.choices?.[0];
    if (!choice) continue;
    const delta = choice.delta || {};
    if (delta.content) yield { type: 'text', text: delta.content };
    if (delta.reasoning_content) yield { type: 'thinking', text: delta.reasoning_content };
    for (const tc of delta.tool_calls || []) {
      if (tc.index === undefined && tc.id) tc.index = 0;
      yield { type: 'tool_delta', index: tc.index ?? 0, id: tc.id, name: tc.function?.name, argsChunk: tc.function?.arguments || '' };
    }
    if ((choice.finish_reason === 'stop' || choice.finish_reason === 'tool_calls') && evt.usage) {
      yield { type: 'usage', usage: evt.usage };
    }
  }
}

function applyExtraHeaders(headers, provider) {
  if (provider.id === 'openrouter') {
    headers['http-referer'] = 'https://github.com/zakmijo2-dotcom/Kayno-ai-cli';
    headers['x-title'] = 'Kayno mij CLI';
  }
}
