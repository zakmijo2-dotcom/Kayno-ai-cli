import { loadConfig } from '../../config.js';
import { gcloudAccessToken } from '../../auth/gcloud.js';
import { streamGeminiCore, toGeminiContents, geminiTools } from './gemini-core.js';

function vertexUrl({ project, location, model }) {
  return `https://${location}-aiplatform.googleapis.com/v1/projects/${project}/locations/${location}/publishers/google/models/${model}:streamGenerateContent?alt=sse`;
}

export async function* streamVertex({ provider, model, messages, system, tools, temperature, signal }) {
  const cfg = loadConfig();
  const project = cfg.providers?.['vertex-ai']?.project;
  const location = cfg.providers?.['vertex-ai']?.location || 'us-central1';
  if (!project) throw new Error('vertex-ai needs config providers.vertex-ai.project (gcloud project id)');
  const token = await gcloudAccessToken();
  const { contents, sysText } = toGeminiContents(messages);
  const body = { contents, generationConfig: { temperature } };
  const sys = sysText || system;
  if (sys) body.systemInstruction = { parts: [{ text: sys }] };
  if (tools.length) body.tools = geminiTools(tools);
  const url = vertexUrl({ project, location, model });
  yield* streamGeminiCore({ url, headers: { authorization: `Bearer ${token}` }, body, signal, unwrap: false, label: 'stream:vertex' });
}
