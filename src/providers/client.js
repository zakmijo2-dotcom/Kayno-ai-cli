import { postStream } from '../http.js';
import { resolveApiKey } from './catalog.js';
import { ensureAccessToken } from '../auth/google.js';
import { antigravityAccessToken, antigravityConfig } from '../auth/antigravity.js';
import { gcloudAccessToken, vertexUrl } from '../auth/gcloud.js';

export async function* streamChat(opts) {
  const { provider, model, messages = [], system = '', tools = [], temperature = 0.7, signal } = opts;
  switch (provider.type) {
    case 'openai':
      return yield* streamOpenAI({ ...opts });
    case 'anthropic':
      return yield* streamAnthropic({ ...opts });
    case 'gemini':
      return yield* streamGemini({ ...opts });
    case 'vertex':
      return yield* streamVertex({ ...opts });
    case 'codeassist':
      return yield* streamCodeAssist({ ...opts });
    default:
      throw new Error(`Unsupported provider type "${provider.type}" for ${provider.id}`);
  }
}

export async function* streamOpenAI({ provider, model, messages, system, tools, temperature, signal }) {
  const key = resolveApiKey(provider);
  const url = `${provider.baseUrl.replace(/\/$/, '')}/chat/completions`;
  const body = {
    model,
    temperature,
    stream: true,
    messages: system ? [{ role: 'system', content: system }, ...messages] : messages,
  };
  if (tools.length) {
    body.tools = tools;
    body.tool_choice = 'auto';
  }
  const headers = { authorization: `Bearer ${key || 'no-key'}` };
  applyExtraHeaders(headers, provider);
  for await (const evt of await postStream(url, body, headers, signal)) {
    const choice = evt.choices?.[0];
    if (!choice) continue;
    const delta = choice.delta || {};
    if (delta.content) yield { type: 'text', text: delta.content };
    if (delta.reasoning_content) yield { type: 'thinking', text: delta.reasoning_content };
    for (const tc of delta.tool_calls || []) {
      if (tc.index === undefined && tc.id) tc.index = 0;
      yield { type: 'tool_delta', index: tc.index ?? 0, id: tc.id, name: tc.function?.name, argsChunk: tc.function?.arguments || '' };
    }
    if (choice.finish_reason === 'stop' || choice.finish_reason === 'tool_calls') {
      if (evt.usage) yield { type: 'usage', usage: evt.usage };
    }
  }
}

function applyExtraHeaders(headers, provider) {
  if (provider.id === 'openrouter') {
    headers['http-referer'] = 'https://github.com/nova-ai-cli';
    headers['x-title'] = 'Kayno mij CLI';
  }
}

export async function* streamAnthropic({ provider, model, messages, system, tools, temperature, signal }) {
  const key = resolveApiKey(provider);
  if (!key)
    throw new Error(
      `No API key for anthropic. Set ANTHROPIC_API_KEY or run: nova auth set-key anthropic <key>`
    );
  const url = `${provider.baseUrl.replace(/\/$/, '')}/v1/messages`;
  const converted = messages.map((m) => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content:
      typeof m.content === 'string'
        ? m.content
        : Array.isArray(m.content)
          ? m.content
          : JSON.stringify(m.content),
  }));
  const body = { model, max_tokens: 8192, temperature, stream: true, system: system || undefined, messages: converted };
  if (tools.length) {
    body.tools = tools.map((t) => ({
      name: t.function.name,
      description: t.function.description,
      input_schema: t.function.parameters,
    }));
  }
  const toolBuf = new Map();
  for await (const evt of await postStream(url, body, {
    'x-api-key': key,
    'anthropic-version': '2023-06-01',
  }, signal)) {
    if (evt.type === 'content_block_start' && evt.content_block?.type === 'tool_use') {
      toolBuf.set(evt.index, { id: evt.content_block.id, name: evt.content_block.name, args: '' });
    } else if (evt.type === 'input_json_delta') {
      const b = toolBuf.get(evt.index);
      if (b) b.args += evt.partial_json || '';
    } else if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta') {
      yield { type: 'text', text: evt.delta.text };
    } else if (evt.type === 'content_block_stop' && toolBuf.has(evt.index)) {
      const b = toolBuf.get(evt.index);
      yield { type: 'tool_complete', id: b.id, name: b.name, arguments: b.args || '{}' };
      toolBuf.delete(evt.index);
    } else if (evt.type === 'message_start' && evt.message?.usage) {
      yield { type: 'usage', usage: evt.message.usage };
    }
  }
}

export async function* streamGeminiCore({ url, headers, body, signal, unwrap }) {
  for await (const evt of await postStream(url, body, headers, signal)) {
    const cands = (unwrap ? evt.response?.candidates : evt.candidates) || [];
    const cand = cands[0];
    for (const part of cand?.content?.parts || []) {
      if (part.text) yield { type: 'text', text: part.text };
      if (part.functionCall) {
        yield {
          type: 'tool_complete',
          id: `fc_${Math.random().toString(36).slice(2, 10)}`,
          name: part.functionCall.name,
          arguments: JSON.stringify(part.functionCall.args || {}),
        };
      }
    }
    if (unwrap ? evt.response?.usageMetadata : evt.usageMetadata) {
      yield { type: 'usage', usage: (unwrap ? evt.response : evt).usageMetadata };
    }
  }
}

export async function* streamGemini({ provider, model, messages, system, tools, temperature, signal }) {
  const key = resolveApiKey(provider);
  if (!key)
    throw new Error(
      `No API key for ${provider.id}. Set ${provider.env || 'GEMINI_API_KEY'} or run: nova auth set-key ${provider.id} <key>`
    );
  const { contents, sysText } = toGeminiContents(messages);
  const body = {
    contents,
    generationConfig: { temperature },
  };
  if (sysText) body.systemInstruction = { parts: [{ text: sysText }] };
  else if (system) body.systemInstruction = { parts: [{ text: system }] };
  if (tools.length) {
    body.tools = [
      {
        functionDeclarations: tools.map((t) => ({
          name: t.function.name,
          description: t.function.description,
          parameters: t.function.parameters,
        })),
      },
    ];
  }
  const url = `${provider.baseUrl.replace(/\/$/, '')}/models/${model}:streamGenerateContent?alt=sse`;
  yield* streamGeminiCore({ url, headers: { 'x-goog-api-key': key }, body, signal, unwrap: false });
}

export async function* streamVertex({ provider, model, messages, system, tools, temperature, signal }) {
  const cfg = (await import('../config.js')).loadConfig();
  const project = cfg.providers?.['vertex-ai']?.project;
  const location = cfg.providers?.['vertex-ai']?.location || 'us-central1';
  const token = await gcloudAccessToken();
  const { contents, sysText } = toGeminiContents(messages);
  const body = { contents, generationConfig: { temperature } };
  if (sysText || system) body.systemInstruction = { parts: [{ text: sysText || system }] };
  if (tools.length) {
    body.tools = [
      {
        functionDeclarations: tools.map((t) => ({
          name: t.function.name,
          description: t.function.description,
          parameters: t.function.parameters,
        })),
      },
    ];
  }
  const url = vertexUrl({ project, location, model, stream: true });
  yield* streamGeminiCore({ url, headers: { authorization: `Bearer ${token}` }, body, signal, unwrap: false });
}

export async function* streamCodeAssist({ provider, model, messages, system, tools, temperature, signal }) {
  let token;
  try {
    token =
      provider.authKind === 'antigravity'
        ? await antigravityAccessToken()
        : await ensureAccessToken('google-oauth');
  } catch (err) {
    throw err;
  }
  const baseUrl = (
    provider.id === 'antigravity' ? antigravityConfig().baseUrl : provider.baseUrl
  ).replace(/\/$/, '');
  const cfg = (await import('../config.js')).loadConfig();
  const { contents, sysText } = toGeminiContents(messages);

  const loadBody = {
    cloudaicompanionProject: antigravityConfig().project || undefined,
    metadata: { pluginType: provider.id === 'antigravity' ? 'ANTIGRAVITY_IDE' : 'GEMINI_CLI' },
  };
  try {
    await fetch(`${baseUrl}/v1internal:loadCodeAssist`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(loadBody),
      signal: AbortSignal.timeout(20000),
    });
  } catch {}

  const body = {
    model,
    contents,
    generationConfig: { temperature },
    requestMetadata: { pluginType: provider.id === 'antigravity' ? 'ANTIGRAVITY_IDE' : 'GEMINI_CLI' },
  };
  const proj = antigravityConfig().project || cfg.providers?.[provider.id]?.project;
  if (proj) body.project = proj;
  if (sysText || system) body.systemInstruction = { parts: [{ text: sysText || system }] };
  if (tools.length) {
    body.tools = [
      {
        functionDeclarations: tools.map((t) => ({
          name: t.function.name,
          description: t.function.description,
          parameters: t.function.parameters,
        })),
      },
    ];
  }
  const url = `${baseUrl}/v1internal:streamGenerateContent?alt=sse`;
  yield* streamGeminiCore({ url, headers: { authorization: `Bearer ${token}` }, body, signal, unwrap: true });
}

export async function completeOnce(opts) {
  let text = '';
  for await (const evt of streamChat(opts)) {
    if (evt.type === 'text') text += evt.text;
  }
  return text;
}

function toGeminiContents(messages) {
  const contents = [];
  let sysText = '';
  for (const m of messages) {
    if (m.role === 'system') {
      sysText += (typeof m.content === 'string' ? m.content : '') + '\n';
      continue;
    }
    if (m.role === 'user') {
      contents.push({ role: 'user', parts: textParts(m.content) });
    } else if (m.role === 'assistant') {
      const parts = [];
      if (typeof m.content === 'string' && m.content) parts.push({ text: m.content });
      for (const tc of m.tool_calls || []) {
        parts.push({
          functionCall: { name: tc.function.name, args: safeParse(tc.function.arguments) },
        });
      }
      if (parts.length) contents.push({ role: 'model', parts });
    } else if (m.role === 'tool') {
      const prev = contents.at(-1);
      const fr = {
        functionResponse: {
          name: m.name || 'tool',
          response: { result: String(m.content).slice(0, 60000) },
        },
      };
      if (prev && prev.role === 'user') prev.parts.push(fr);
      else contents.push({ role: 'user', parts: [fr] });
    }
  }
  for (const c of contents) if (c.parts.length === 0) c.parts.push({ text: '(empty)' });
  return { contents, sysText: sysText.trim() };
}

function textParts(content) {
  if (typeof content === 'string') return [{ text: content }];
  return [{ text: JSON.stringify(content) }];
}

function safeParse(s, fallback = {}) {
  try {
    return JSON.parse(s);
  } catch {
    return fallback;
  }
}
