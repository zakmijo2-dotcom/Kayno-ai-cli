import { postStream } from '../../http.js';

export async function* streamGeminiCore({ url, headers, body, signal, unwrap, label = 'stream:gemini' }) {
  for await (const evt of await postStream(url, body, headers, signal, { label })) {
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
    const usage = unwrap ? evt.response?.usageMetadata : evt.usageMetadata;
    if (usage) yield { type: 'usage', usage };
  }
}

export function toGeminiContents(messages) {
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
      const fr = {
        functionResponse: {
          name: m.name || 'tool',
          response: { result: String(m.content).slice(0, 60000) },
        },
      };
      const prev = contents.at(-1);
      if (prev && prev.role === 'user' && !prev.parts.some((p) => p.text)) {
        prev.parts.push(fr);
      } else {
        contents.push({ role: 'user', parts: [fr] });
      }
    }
  }
  for (const c of contents) if (!c.parts.length) c.parts.push({ text: '(empty)' });
  return { contents, sysText: sysText.trim() };
}

function geminiTools(tools) {
  return [
    {
      functionDeclarations: tools.map((t) => ({
        name: t.function.name,
        description: t.function.description,
        parameters: t.function.parameters,
      })),
    },
  ];
}
export { geminiTools };

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
