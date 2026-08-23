import { getCapabilities } from './capabilities.js';
import { streamOpenAI } from './adapters/openai-compat.js';
import { streamAnthropic } from './adapters/anthropic.js';
import { streamGemini } from './adapters/gemini.js';
import { streamVertex } from './adapters/vertex.js';
import { streamCodeAssist } from './adapters/codeassist.js';

const ADAPTERS = {
  openai: streamOpenAI,
  anthropic: streamAnthropic,
  gemini: streamGemini,
  vertex: streamVertex,
  codeassist: streamCodeAssist,
};

export function adapterFor(type) {
  return ADAPTERS[type] ?? null;
}

export async function* streamChat(opts) {
  const provider = opts.provider;
  const adapter = ADAPTERS[provider?.type];
  if (!adapter) {
    throw new Error(`Unsupported provider type "${provider?.type}" for ${provider?.id}`);
  }

  let tools = opts.tools ?? [];
  if (tools.length) {
    const caps = getCapabilities(provider.id, opts.model);
    if (!caps.tools) tools = [];
  }

  yield* adapter({ ...opts, tools });
}

export async function completeOnce(opts) {
  let text = '';
  for await (const evt of streamChat(opts)) {
    if (evt.type === 'text') text += evt.text;
  }
  return text;
}
