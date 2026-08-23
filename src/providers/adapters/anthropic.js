import { postStream } from '../../http.js';
import { resolveApiKey } from '../catalog.js';

export async function* streamAnthropic({ provider, model, messages, system, tools, temperature, signal, maxTokens }) {
  const key = resolveApiKey(provider);
  if (!key) {
    throw new Error(
      `No API key for anthropic. Set ANTHROPIC_API_KEY or run: nova auth set-key anthropic <key>`
    );
  }
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
  const body = {
    model,
    max_tokens: maxTokens ?? 8192,
    temperature,
    stream: true,
    system: system || undefined,
    messages: converted,
  };
  if (tools.length) {
    body.tools = tools.map((t) => ({
      name: t.function.name,
      description: t.function.description,
      input_schema: t.function.parameters,
    }));
  }
  const toolBuf = new Map();
  for await (const evt of await postStream(
    url,
    body,
    { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    signal,
    { label: `stream:${provider.id}` }
  )) {
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
