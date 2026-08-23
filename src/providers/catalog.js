import { readJson, writeJson } from '../util.js';
import { CACHE_DIR, loadConfig } from '../config.js';
import { join } from 'node:path';
import { getToken, loadAuth } from '../auth/store.js';

export const PRESETS = [
  { id: 'openai', name: 'OpenAI', type: 'openai', baseUrl: 'https://api.openai.com/v1', env: 'OPENAI_API_KEY', defaultModel: 'gpt-4.1' },
  { id: 'anthropic', name: 'Anthropic Claude', type: 'anthropic', baseUrl: 'https://api.anthropic.com', env: 'ANTHROPIC_API_KEY', defaultModel: 'claude-sonnet-4-5' },
  { id: 'google-gemini', name: 'Google Gemini (API key)', type: 'gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta', env: 'GEMINI_API_KEY', defaultModel: 'gemini-2.5-pro' },
  { id: 'google-code-assist', name: 'Google Code Assist (Gemini CLI OAuth)', type: 'codeassist', baseUrl: 'https://cloudcode-pa.googleapis.com', oauth: true, authKind: 'google-oauth', defaultModel: 'gemini-2.5-pro' },
  { id: 'antigravity', name: 'Antigravity (Google IDE backend)', type: 'codeassist', baseUrl: 'https://daily-cloudcode-pa.googleapis.com', oauth: true, authKind: 'antigravity', defaultModel: 'gemini-3-pro-preview' },
  { id: 'vertex-ai', name: 'Google Vertex AI (gcloud ADC)', type: 'vertex', baseUrl: '', authKind: 'gcloud', defaultModel: 'gemini-2.5-pro' },
  { id: 'deepseek', name: 'DeepSeek (official API)', type: 'openai', baseUrl: 'https://api.deepseek.com', env: 'DEEPSEEK_API_KEY', defaultModel: 'deepseek-chat' },
  { id: 'deepseek-web', name: 'DeepSeek Web bridge (deepseek-free-api)', type: 'openai', baseUrl: 'http://127.0.0.1:8000/v1', env: 'DEEPSEEK_WEB_TOKEN', defaultModel: 'deepseek-chat', note: 'Run github.com/VincentZyc/deepseek-free-api locally; token = web session token' },
  { id: 'qwen-dashscope-intl', name: 'Qwen / DashScope International', type: 'openai', baseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1', env: 'DASHSCOPE_INTL_API_KEY', defaultModel: 'qwen-max' },
  { id: 'qwen-dashscope-cn', name: 'Qwen / DashScope China', type: 'openai', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', env: 'DASHSCOPE_CN_API_KEY', defaultModel: 'qwen-max' },
  { id: 'qwen-web', name: 'Qwen Web bridge (qwen-free-api)', type: 'openai', baseUrl: 'http://127.0.0.1:8001/v1', env: 'QWEN_WEB_TOKEN', defaultModel: 'qwen-max', note: 'Run github.com/LLM-Red-Team/qwen-free-api locally; token = web token' },
  { id: 'groq', name: 'Groq', type: 'openai', baseUrl: 'https://api.groq.com/openai/v1', env: 'GROQ_API_KEY', defaultModel: 'llama-3.3-70b-versatile' },
  { id: 'mistral', name: 'Mistral AI', type: 'openai', baseUrl: 'https://api.mistral.ai/v1', env: 'MISTRAL_API_KEY', defaultModel: 'mistral-large-latest' },
  { id: 'xai', name: 'xAI Grok', type: 'openai', baseUrl: 'https://api.x.ai/v1', env: 'XAI_API_KEY', defaultModel: 'grok-4' },
  { id: 'together', name: 'Together AI', type: 'openai', baseUrl: 'https://api.together.xyz/v1', env: 'TOGETHER_API_KEY', defaultModel: 'meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8' },
  { id: 'fireworks', name: 'Fireworks AI', type: 'openai', baseUrl: 'https://api.fireworks.ai/inference/v1', env: 'FIREWORKS_API_KEY', defaultModel: 'accounts/fireworks/models/llama4-maverick-instruct-basic' },
  { id: 'perplexity', name: 'Perplexity', type: 'openai', baseUrl: 'https://api.perplexity.ai', env: 'PERPLEXITY_API_KEY', defaultModel: 'sonar-pro' },
  { id: 'openrouter', name: 'OpenRouter (400+ models)', type: 'openai', baseUrl: 'https://openrouter.ai/api/v1', env: 'OPENROUTER_API_KEY', defaultModel: 'anthropic/claude-sonnet-4.5' },
  { id: 'cohere', name: 'Cohere', type: 'openai', baseUrl: 'https://api.cohere.ai/compatibility/v1', env: 'CO_API_KEY', defaultModel: 'command-a-03-2025' },
  { id: 'huggingface', name: 'Hugging Face Router', type: 'openai', baseUrl: 'https://router.huggingface.co/v1', env: 'HF_TOKEN', defaultModel: 'meta-llama/Llama-3.3-70B-Instruct' },
  { id: 'cerebras', name: 'Cerebras', type: 'openai', baseUrl: 'https://api.cerebras.ai/v1', env: 'CEREBRAS_API_KEY', defaultModel: 'llama3.3-70b' },
  { id: 'sambanova', name: 'SambaNova', type: 'openai', baseUrl: 'https://api.sambanova.ai/v1', env: 'SAMBANOVA_API_KEY', defaultModel: 'Meta-Llama-3.3-70B-Instruct' },
  { id: 'nebius', name: 'Nebius AI Studio', type: 'openai', baseUrl: 'https://api.studio.nebius.com/v1', env: 'NEBIUS_API_KEY', defaultModel: 'meta-llama/Meta-Llama-3.1-70B-Instruct' },
  { id: 'deepinfra', name: 'DeepInfra', type: 'openai', baseUrl: 'https://api.deepinfra.com/v1/openai', env: 'DEEPINFRA_API_TOKEN', defaultModel: 'meta-llama/Llama-3.3-70B-Instruct' },
  { id: 'hyperbolic', name: 'Hyperbolic', type: 'openai', baseUrl: 'https://api.hyperbolic.xyz/v1', env: 'HYPERBOLIC_API_KEY', defaultModel: 'meta-llama/Llama-3.3-70B-Instruct' },
  { id: 'novita', name: 'Novita AI', type: 'openai', baseUrl: 'https://api.novita.ai/v3/openai', env: 'NOVITA_API_KEY', defaultModel: 'meta-llama/llama-3.3-70b-instruct' },
  { id: 'lambda', name: 'Lambda', type: 'openai', baseUrl: 'https://api.lambda.ai/v1', env: 'LAMBDA_API_KEY', defaultModel: 'llama3.3-70b-instruct-fp8' },
  { id: 'upstage', name: 'Upstage Solar', type: 'openai', baseUrl: 'https://api.upstage.ai/v1/solar', env: 'UPSTAGE_API_KEY', defaultModel: 'solar-pro' },
  { id: 'nvidia-nim', name: 'NVIDIA NIM', type: 'openai', baseUrl: 'https://integrate.api.nvidia.com/v1', env: 'NVIDIA_API_KEY', defaultModel: 'meta/llama-3.3-70b-instruct' },
  { id: 'ai21', name: 'AI21 Labs', type: 'openai', baseUrl: 'https://api.ai21.com/studio/v1', env: 'AI21_API_KEY', defaultModel: 'jamba-1.5-large' },
  { id: 'writer', name: 'Writer Palmyra', type: 'openai', baseUrl: 'https://api.writer.com/v1', env: 'WRITER_API_KEY', defaultModel: 'palmyra-x-004' },
  { id: 'reka', name: 'Reka AI', type: 'openai', baseUrl: 'https://api.reka.ai/v1', env: 'REKA_API_KEY', defaultModel: 'reka-core' },
  { id: 'scaleway', name: 'Scaleway Generative APIs', type: 'openai', baseUrl: 'https://api.scaleway.ai/v1', env: 'SCW_SECRET_KEY', defaultModel: 'qwen2.5-72b-instruct' },
  { id: 'ovhcloud', name: 'OVHcloud AI Endpoints', type: 'openai', baseUrl: 'https://oai.endpoints.kepler.ai.cloud.ovh.net/v1', env: 'OVHCLOUD_API_KEY', defaultModel: 'Llama-3.3-70B-Instruct' },
  { id: 'github-models', name: 'GitHub Models', type: 'openai', baseUrl: 'https://models.github.ai/inference', env: 'GITHUB_TOKEN', defaultModel: 'openai/gpt-4.1-mini' },
  { id: 'azure-openai', name: 'Azure OpenAI (configure baseUrl)', type: 'openai', baseUrl: '', env: 'AZURE_OPENAI_API_KEY', defaultModel: '', note: 'Set providers.azure-openai.baseUrl to https://<res>.openai.azure.com/openai/deployments/<dep>' },
  { id: 'moonshot', name: 'Moonshot Kimi (CN)', type: 'openai', baseUrl: 'https://api.moonshot.cn/v1', env: 'MOONSHOT_API_KEY', defaultModel: 'kimi-k2-0711-preview' },
  { id: 'moonshot-intl', name: 'Moonshot Kimi (Intl)', type: 'openai', baseUrl: 'https://api.moonshot.ai/v1', env: 'MOONSHOT_INTL_API_KEY', defaultModel: 'kimi-k2-turbo-preview' },
  { id: 'zhipu', name: 'Zhipu GLM', type: 'openai', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', env: 'ZHIPU_API_KEY', defaultModel: 'glm-4.6' },
  { id: 'minimax', name: 'MiniMax', type: 'openai', baseUrl: 'https://api.minimax.chat/v1', env: 'MINIMAX_API_KEY', defaultModel: 'abab6.5s-chat' },
  { id: 'stepfun', name: 'StepFun', type: 'openai', baseUrl: 'https://api.stepfun.com/v1', env: 'STEPFUN_API_KEY', defaultModel: 'step-2-16k' },
  { id: 'yi', name: '01.AI Yi', type: 'openai', baseUrl: 'https://api.lingyiwanwu.com/v1', env: 'YI_API_KEY', defaultModel: 'yi-lightning' },
  { id: 'baichuan', name: 'Baichuan', type: 'openai', baseUrl: 'https://api.baichuan-ai.com/v1', env: 'BAICHUAN_API_KEY', defaultModel: 'Baichuan4' },
  { id: 'siliconflow', name: 'SiliconFlow', type: 'openai', baseUrl: 'https://api.siliconflow.cn/v1', env: 'SILICONFLOW_API_KEY', defaultModel: 'Qwen/Qwen2.5-72B-Instruct' },
  { id: 'volcengine-doubao', name: 'Volcengine Doubao (Ark)', type: 'openai', baseUrl: 'https://ark.cn-beijing.volces.com/api/v3', env: 'ARK_API_KEY', defaultModel: 'doubao-pro-32k' },
  { id: 'baidu-qianfan', name: 'Baidu Qianfan (v2 OpenAI-compat)', type: 'openai', baseUrl: 'https://qianfan.baidubce.com/v2', env: 'QIANFAN_API_KEY', defaultModel: 'ernie-4.0-8k' },
  { id: 'glhf', name: 'GLHF', type: 'openai', baseUrl: 'https://glhf.chat/api/openai/v1', env: 'GLHF_API_KEY', defaultModel: 'hf:mistralai/Mixtral-8x7B-Instruct-v0.1' },
  { id: 'arcee', name: 'Arcee AI', type: 'openai', baseUrl: 'https://api.arcee.ai/api/v1', env: 'ARCEE_API_KEY', defaultModel: 'arcee-afm' },
  { id: 'inference-net', name: 'Inference.net', type: 'openai', baseUrl: 'https://api.inference.net/v1', env: 'INFERENCE_NET_API_KEY', defaultModel: 'meta-llama/llama-3.3-70b-instruct/fp-8' },
  { id: 'parasail', name: 'Parasail', type: 'openai', baseUrl: 'https://api.parasail.io/v1', env: 'PARASAIL_API_KEY', defaultModel: 'deepseek-ai/DeepSeek-V3' },
  { id: 'targon', name: 'Targon', type: 'openai', baseUrl: 'https://api.targon.com/v1', env: 'TARGON_API_KEY', defaultModel: '' },
  { id: 'databricks', name: 'Databricks Serving (set baseUrl)', type: 'openai', baseUrl: '', env: 'DATABRICKS_TOKEN', defaultModel: '', note: 'baseUrl = https://<workspace>.databricks.com/serving-endpoints' },
  { id: 'ollama', name: 'Ollama (local)', type: 'openai', baseUrl: 'http://localhost:11434/v1', env: '', defaultModel: 'llama3.2', noKeyNeeded: true },
  { id: 'lmstudio', name: 'LM Studio (local)', type: 'openai', baseUrl: 'http://localhost:1234/v1', env: '', defaultModel: '', noKeyNeeded: true },
  { id: 'vllm', name: 'vLLM (local/self-hosted)', type: 'openai', baseUrl: 'http://localhost:8002/v1', env: '', defaultModel: '', noKeyNeeded: true },
  { id: 'llamacpp', name: 'llama.cpp server', type: 'openai', baseUrl: 'http://localhost:8080/v1', env: '', defaultModel: '', noKeyNeeded: true },
  { id: 'jan', name: 'Jan (local)', type: 'openai', baseUrl: 'http://127.0.0.1:1337/v1', env: '', defaultModel: '', noKeyNeeded: true },
  { id: 'gpt4all', name: 'GPT4All (local)', type: 'openai', baseUrl: 'http://localhost:4891/v1', env: '', defaultModel: '', noKeyNeeded: true },
  { id: 'textgen-webui', name: 'text-generation-webui', type: 'openai', baseUrl: 'http://localhost:5000/v1', env: '', defaultModel: '', noKeyNeeded: true },
  { id: 'koboldcpp', name: 'KoboldCpp', type: 'openai', baseUrl: 'http://localhost:5001/v1', env: '', defaultModel: '', noKeyNeeded: true },
  { id: 'custom', name: 'Custom provider (define in config)', type: 'openai', baseUrl: '', env: 'CUSTOM_API_KEY', defaultModel: '' },
];

export function allProviders() {
  const cfg = loadConfig();
  const cache = readJson(join(CACHE_DIR, 'models-dev.json'), {});
  const map = new Map();
  for (const p of PRESETS) map.set(p.id, { ...p, source: 'builtin' });
  for (const [id, entry] of Object.entries(cache)) {
    if (map.has(id)) continue;
    const type =
      entry.api === 'anthropic' ? 'anthropic' : entry.api === 'google' ? 'gemini' : 'openai';
    map.set(id, {
      id,
      name: entry.name || id,
      type,
      baseUrl: guessBaseUrl(id),
      env: `${id.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_API_KEY`,
      defaultModel: firstModel(entry.models),
      source: 'models.dev',
    });
  }
  for (const [id, over] of Object.entries(cfg.providers || {})) {
    const base = map.get(id) || { id, name: id, type: 'openai', source: 'config' };
    map.set(id, { ...base, ...over });
  }
  return [...map.values()];
}

function guessBaseUrl(id) {
  return '';
}

function firstModel(models) {
  if (!models) return '';
  const ids = Object.keys(models);
  return ids.includes('default') ? 'default' : ids[0] || '';
}

export function getProvider(id) {
  return allProviders().find((p) => p.id === id) || null;
}

export function searchProviders(q) {
  const ql = q.toLowerCase();
  return allProviders().filter(
    (p) => p.id.toLowerCase().includes(ql) || p.name.toLowerCase().includes(ql)
  );
}

export async function syncFromModelsDev() {
  const res = await fetch('https://models.dev/api.json');
  if (!res.ok) throw new Error(`models.dev fetch failed: HTTP ${res.status}`);
  const json = await res.json();
  writeJson(join(CACHE_DIR, 'models-dev.json'), json);
  return Object.keys(json).length;
}

export function resolveApiKey(provider) {
  if (provider.oauth || provider.noKeyNeeded) return null;
  const cfg = loadConfig();
  const override = cfg.providers?.[provider.id]?.apiKey;
  if (override) return expandEnv(override);
  if (provider.env && process.env[provider.env]) return process.env[provider.env];
  const stored = loadAuth().tokens?.[provider.id]?.apiKey;
  return stored ? expandEnv(stored) : null;
}

export function providerModelIds(providerId, limit = 40) {
  const cfg = loadConfig();
  const configured = cfg.providers?.[providerId]?.model;
  const cache = readJson(join(CACHE_DIR, 'models-dev.json'), {});
  const entry = cache[providerId];
  let ids = entry?.models ? Object.keys(entry.models) : [];
  ids = ids.filter((m) => m && m !== 'default');
  const preset = PRESETS.find((p) => p.id === providerId);
  if (preset?.defaultModel && !ids.includes(preset.defaultModel)) ids.unshift(preset.defaultModel);
  if (configured && !ids.includes(configured)) ids.unshift(configured);
  return ids.slice(0, limit);
}
