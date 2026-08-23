import { fetchJson } from '../../http.js';
import { ensureAccessToken } from '../../auth/google.js';
import { antigravityAccessToken, antigravityConfig } from '../../auth/antigravity.js';
import { loadConfig } from '../../config.js';
import { log } from '../../logger.js';
import { streamGeminiCore, toGeminiContents, geminiTools } from './gemini-core.js';

export async function* streamCodeAssist({ provider, model, messages, system, tools, temperature, signal }) {
  const isAntigravity = provider.auth === 'antigravity' || provider.id === 'antigravity';
  const token = isAntigravity ? await antigravityAccessToken() : await ensureAccessToken('google-oauth');
  const baseUrl = (
    isAntigravity ? antigravityConfig().baseUrl : provider.baseUrl
  ).replace(/\/$/, '');
  const pluginType = isAntigravity ? 'ANTIGRAVITY_IDE' : 'GEMINI_CLI';

  try {
    await fetch(`${baseUrl}/v1internal:loadCodeAssist`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        cloudaicompanionProject: antigravityConfig().project || undefined,
        metadata: { pluginType },
      }),
      signal: AbortSignal.timeout(20000),
    });
  } catch (err) {
    log.debug(`loadCodeAssist preflight failed (continuing): ${err.message}`);
  }

  const cfg = loadConfig();
  const { contents, sysText } = toGeminiContents(messages);
  const body = {
    model,
    contents,
    generationConfig: { temperature },
    requestMetadata: { pluginType },
  };
  const proj = antigravityConfig().project || cfg.providers?.[provider.id]?.project;
  if (proj) body.project = proj;
  const sys = sysText || system;
  if (sys) body.systemInstruction = { parts: [{ text: sys }] };
  if (tools.length) body.tools = geminiTools(tools);

  const url = `${baseUrl}/v1internal:streamGenerateContent?alt=sse`;
  yield* streamGeminiCore({ url, headers: { authorization: `Bearer ${token}` }, body, signal, unwrap: true, label: `stream:${provider.id}` });
}
