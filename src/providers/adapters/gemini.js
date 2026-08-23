import { resolveApiKey } from '../catalog.js';
import { streamGeminiCore, toGeminiContents, geminiTools } from './gemini-core.js';

export async function* streamGemini({ provider, model, messages, system, tools, temperature, signal }) {
  const key = resolveApiKey(provider);
  if (!key) {
    throw new Error(
      `No API key for ${provider.id}. Set ${provider.env || 'GEMINI_API_KEY'} or run: nova auth set-key ${provider.id} <key>`
    );
  }
  const { contents, sysText } = toGeminiContents(messages);
  const body = { contents, generationConfig: { temperature } };
  const sys = sysText || system;
  if (sys) body.systemInstruction = { parts: [{ text: sys }] };
  if (tools.length) body.tools = geminiTools(tools);
  const url = `${provider.baseUrl.replace(/\/$/, '')}/models/${model}:streamGenerateContent?alt=sse`;
  yield* streamGeminiCore({ url, headers: { 'x-goog-api-key': key }, body, signal, unwrap: false, label: `stream:${provider.id}` });
}
