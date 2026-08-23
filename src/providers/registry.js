export const CATEGORIES = ['api-key', 'oauth', 'free', 'local', 'aggregator', 'upstream'];
const CATEGORY_SET = new Set(CATEGORIES);

const def = (d) => d;

export const PROVIDER_DEFS = [
  def({ id: 'openai', name: 'OpenAI', type: 'openai', category: 'upstream', baseUrl: 'https://api.openai.com/v1', env: 'OPENAI_API_KEY', defaultModel: 'gpt-4.1', aliases: [] }),
  def({ id: 'anthropic', name: 'Anthropic Claude', type: 'anthropic', category: 'upstream', baseUrl: 'https://api.anthropic.com', env: 'ANTHROPIC_API_KEY', defaultModel: 'claude-sonnet-4-5', aliases: ['claude'] }),
  def({ id: 'google-gemini', name: 'Google Gemini (API key)', type: 'gemini', category: 'upstream', baseUrl: 'https://generativelanguage.googleapis.com/v1beta', env: 'GEMINI_API_KEY', defaultModel: 'gemini-2.5-pro', aliases: ['gemini', 'google', 'google-ai'] }),
  def({ id: 'google-code-assist', name: 'Google Code Assist (Gemini CLI OAuth)', type: 'codeassist', category: 'oauth', auth: 'google-oauth', oauth: true, defaultModel: 'gemini-2.5-pro', aliases: ['gca', 'gemini-cli', 'code-assist'] }),
  def({ id: 'antigravity', name: 'Antigravity (Google IDE backend)', type: 'codeassist', category: 'oauth', auth: 'antigravity', oauth: true, baseUrl: 'https://daily-cloudcode-pa.googleapis.com', defaultModel: 'gemini-3-pro-preview', aliases: ['anti', 'ag'] }),
  def({ id: 'vertex-ai', name: 'Google Vertex AI (gcloud ADC)', type: 'vertex', category: 'upstream', auth: 'gcloud', defaultModel: 'gemini-2.5-pro', aliases: ['vertex'] }),
  def({ id: 'deepseek', name: 'DeepSeek (official API)', type: 'openai', category: 'upstream', baseUrl: 'https://api.deepseek.com', env: 'DEEPSEEK_API_KEY', defaultModel: 'deepseek-chat', aliases: [] }),
  def({ id: 'groq', name: 'Groq', type: 'openai', category: 'aggregator', baseUrl: 'https://api.groq.com/openai/v1', env: 'GROQ_API_KEY', defaultModel: 'llama-3.3-70b-versatile', aliases: [] }),
  def({ id: 'mistral', name: 'Mistral AI', type: 'openai', category: 'upstream', baseUrl: 'https://api.mistral.ai/v1', env: 'MISTRAL_API_KEY', defaultModel: 'mistral-large-latest', aliases: [] }),
  def({ id: 'xai', name: 'xAI Grok', type: 'openai', category: 'upstream', baseUrl: 'https://api.x.ai/v1', env: 'XAI_API_KEY', defaultModel: 'grok-4', aliases: ['grok'] }),
  def({ id: 'openrouter', name: 'OpenRouter (400+ models)', type: 'openai', category: 'aggregator', baseUrl: 'https://openrouter.ai/api/v1', env: 'OPENROUTER_API_KEY', defaultModel: 'anthropic/claude-sonnet-4.5', aliases: ['or'] }),
  def({ id: 'together', name: 'Together AI', type: 'openai', category: 'aggregator', baseUrl: 'https://api.together.xyz/v1', env: 'TOGETHER_API_KEY', defaultModel: 'meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8', aliases: ['together-ai'] }),
  def({ id: 'fireworks', name: 'Fireworks AI', type: 'openai', category: 'aggregator', baseUrl: 'https://api.fireworks.ai/inference/v1', env: 'FIREWORKS_API_KEY', defaultModel: 'accounts/fireworks/models/llama4-maverick-instruct-basic', aliases: ['fw'] }),
  def({ id: 'perplexity', name: 'Perplexity', type: 'openai', category: 'upstream', baseUrl: 'https://api.perplexity.ai', env: 'PERPLEXITY_API_KEY', defaultModel: 'sonar-pro', aliases: ['pplx'] }),
  def({ id: 'cohere', name: 'Cohere', type: 'openai', category: 'upstream', baseUrl: 'https://api.cohere.ai/compatibility/v1', env: 'CO_API_KEY', defaultModel: 'command-a-03-2025', aliases: ['co'] }),
  def({ id: 'huggingface', name: 'Hugging Face Router', type: 'openai', category: 'aggregator', baseUrl: 'https://router.huggingface.co/v1', env: 'HF_TOKEN', defaultModel: 'meta-llama/Llama-3.3-70B-Instruct', aliases: ['hf'] }),
  def({ id: 'cerebras', name: 'Cerebras', type: 'openai', category: 'aggregator', baseUrl: 'https://api.cerebras.ai/v1', env: 'CEREBRAS_API_KEY', defaultModel: 'llama3.3-70b', aliases: [] }),
  def({ id: 'sambanova', name: 'SambaNova', type: 'openai', category: 'aggregator', baseUrl: 'https://api.sambanova.ai/v1', env: 'SAMBANOVA_API_KEY', defaultModel: 'Meta-Llama-3.3-70B-Instruct', aliases: ['sbn'] }),
  def({ id: 'nebius', name: 'Nebius AI Studio', type: 'openai', category: 'aggregator', baseUrl: 'https://api.studio.nebius.com/v1', env: 'NEBIUS_API_KEY', defaultModel: 'meta-llama/Meta-Llama-3.1-70B-Instruct', aliases: [] }),
  def({ id: 'deepinfra', name: 'DeepInfra', type: 'openai', category: 'aggregator', baseUrl: 'https://api.deepinfra.com/v1/openai', env: 'DEEPINFRA_API_TOKEN', defaultModel: 'meta-llama/Llama-3.3-70B-Instruct', aliases: [] }),
  def({ id: 'hyperbolic', name: 'Hyperbolic', type: 'openai', category: 'aggregator', baseUrl: 'https://api.hyperbolic.xyz/v1', env: 'HYPERBOLIC_API_KEY', defaultModel: 'meta-llama/Llama-3.3-70B-Instruct', aliases: [] }),
  def({ id: 'novita', name: 'Novita AI', type: 'openai', category: 'aggregator', baseUrl: 'https://api.novita.ai/v3/openai', env: 'NOVITA_API_KEY', defaultModel: 'meta-llama/llama-3.3-70b-instruct', aliases: [] }),
  def({ id: 'lambda', name: 'Lambda', type: 'openai', category: 'aggregator', baseUrl: 'https://api.lambda.ai/v1', env: 'LAMBDA_API_KEY', defaultModel: 'llama3.3-70b-instruct-fp8', aliases: [] }),
  def({ id: 'upstage', name: 'Upstage Solar', type: 'openai', category: 'upstream', baseUrl: 'https://api.upstage.ai/v1/solar', env: 'UPSTAGE_API_KEY', defaultModel: 'solar-pro', aliases: ['solar'] }),
  def({ id: 'nvidia-nim', name: 'NVIDIA NIM', type: 'openai', category: 'aggregator', baseUrl: 'https://integrate.api.nvidia.com/v1', env: 'NVIDIA_API_KEY', defaultModel: 'meta/llama-3.3-70b-instruct', aliases: ['nvidia', 'nim'] }),
  def({ id: 'ai21', name: 'AI21 Labs', type: 'openai', category: 'upstream', baseUrl: 'https://api.ai21.com/studio/v1', env: 'AI21_API_KEY', defaultModel: 'jamba-1.5-large', aliases: [] }),
  def({ id: 'writer', name: 'Writer Palmyra', type: 'openai', category: 'upstream', baseUrl: 'https://api.writer.com/v1', env: 'WRITER_API_KEY', defaultModel: 'palmyra-x-004', aliases: [] }),
  def({ id: 'reka', name: 'Reka AI', type: 'openai', category: 'upstream', baseUrl: 'https://api.reka.ai/v1', env: 'REKA_API_KEY', defaultModel: 'reka-core', aliases: [] }),
  def({ id: 'scaleway', name: 'Scaleway Generative APIs', type: 'openai', category: 'aggregator', baseUrl: 'https://api.scaleway.ai/v1', env: 'SCW_SECRET_KEY', defaultModel: 'qwen2.5-72b-instruct', aliases: [] }),
  def({ id: 'ovhcloud', name: 'OVHcloud AI Endpoints', type: 'openai', category: 'aggregator', baseUrl: 'https://oai.endpoints.kepler.ai.cloud.ovh.net/v1', env: 'OVHCLOUD_API_KEY', defaultModel: 'Llama-3.3-70B-Instruct', aliases: ['ovh'] }),
  def({ id: 'github-models', name: 'GitHub Models', type: 'openai', category: 'aggregator', baseUrl: 'https://models.github.ai/inference', env: 'GITHUB_TOKEN', defaultModel: 'openai/gpt-4.1-mini', aliases: ['gh-models', 'github'] }),
  def({ id: 'azure-openai', name: 'Azure OpenAI (configure baseUrl)', type: 'openai', category: 'upstream', baseUrl: '', env: 'AZURE_OPENAI_API_KEY', defaultModel: '', note: 'Set providers.azure-openai.baseUrl to https://<res>.openai.azure.com/openai/deployments/<dep>', aliases: ['azure'] }),
  def({ id: 'moonshot', name: 'Moonshot Kimi (CN)', type: 'openai', category: 'upstream', baseUrl: 'https://api.moonshot.cn/v1', env: 'MOONSHOT_API_KEY', defaultModel: 'kimi-k2-0711-preview', aliases: ['kimi', 'moonshot-cn'] }),
  def({ id: 'moonshot-intl', name: 'Moonshot Kimi (Intl)', type: 'openai', category: 'upstream', baseUrl: 'https://api.moonshot.ai/v1', env: 'MOONSHOT_INTL_API_KEY', defaultModel: 'kimi-k2-turbo-preview', aliases: ['kimi-intl'] }),
  def({ id: 'zhipu', name: 'Zhipu GLM', type: 'openai', category: 'upstream', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', env: 'ZHIPU_API_KEY', defaultModel: 'glm-4.6', aliases: ['glm', 'chatglm', 'bigmodel'] }),
  def({ id: 'minimax', name: 'MiniMax', type: 'openai', category: 'upstream', baseUrl: 'https://api.minimax.chat/v1', env: 'MINIMAX_API_KEY', defaultModel: 'abab6.5s-chat', aliases: ['mm'] }),
  def({ id: 'stepfun', name: 'StepFun', type: 'openai', category: 'upstream', baseUrl: 'https://api.stepfun.com/v1', env: 'STEPFUN_API_KEY', defaultModel: 'step-2-16k', aliases: [] }),
  def({ id: 'yi', name: '01.AI Yi', type: 'openai', category: 'upstream', baseUrl: 'https://api.lingyiwanwu.com/v1', env: 'YI_API_KEY', defaultModel: 'yi-lightning', aliases: ['01ai', 'lingyiwanwu'] }),
  def({ id: 'baichuan', name: 'Baichuan', type: 'openai', category: 'upstream', baseUrl: 'https://api.baichuan-ai.com/v1', env: 'BAICHUAN_API_KEY', defaultModel: 'Baichuan4', aliases: [] }),
  def({ id: 'siliconflow', name: 'SiliconFlow', type: 'openai', category: 'aggregator', baseUrl: 'https://api.siliconflow.cn/v1', env: 'SILICONFLOW_API_KEY', defaultModel: 'Qwen/Qwen2.5-72B-Instruct', aliases: ['sf'] }),
  def({ id: 'volcengine-doubao', name: 'Volcengine Doubao (Ark)', type: 'openai', category: 'upstream', baseUrl: 'https://ark.cn-beijing.volces.com/api/v3', env: 'ARK_API_KEY', defaultModel: 'doubao-pro-32k', aliases: ['doubao', 'ark'] }),
  def({ id: 'baidu-qianfan', name: 'Baidu Qianfan (v2 OpenAI-compat)', type: 'openai', category: 'upstream', baseUrl: 'https://qianfan.baidubce.com/v2', env: 'QIANFAN_API_KEY', defaultModel: 'ernie-4.0-8k', aliases: ['qianfan', 'ernie'] }),
  def({ id: 'glhf', name: 'GLHF', type: 'openai', category: 'aggregator', baseUrl: 'https://glhf.chat/api/openai/v1', env: 'GLHF_API_KEY', defaultModel: 'hf:mistralai/Mixtral-8x7B-Instruct-v0.1', aliases: [] }),
  def({ id: 'arcee', name: 'Arcee AI', type: 'openai', category: 'upstream', baseUrl: 'https://api.arcee.ai/api/v1', env: 'ARCEE_API_KEY', defaultModel: 'arcee-afm', aliases: [] }),
  def({ id: 'inference-net', name: 'Inference.net', type: 'openai', category: 'aggregator', baseUrl: 'https://api.inference.net/v1', env: 'INFERENCE_NET_API_KEY', defaultModel: 'meta-llama/llama-3.3-70b-instruct/fp-8', aliases: [] }),
  def({ id: 'parasail', name: 'Parasail', type: 'openai', category: 'aggregator', baseUrl: 'https://api.parasail.io/v1', env: 'PARASAIL_API_KEY', defaultModel: 'deepseek-ai/DeepSeek-V3', aliases: [] }),
  def({ id: 'targon', name: 'Targon', type: 'openai', category: 'aggregator', baseUrl: 'https://api.targon.com/v1', env: 'TARGON_API_KEY', defaultModel: '', aliases: [] }),
  def({ id: 'databricks', name: 'Databricks Serving (set baseUrl)', type: 'openai', category: 'aggregator', baseUrl: '', env: 'DATABRICKS_TOKEN', defaultModel: '', note: 'baseUrl = https://<workspace>.databricks.com/serving-endpoints', aliases: ['dbx'] }),
  def({ id: 'qwen-dashscope-intl', name: 'Qwen / DashScope International', type: 'openai', category: 'upstream', baseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1', env: 'DASHSCOPE_INTL_API_KEY', defaultModel: 'qwen-max', aliases: ['qwen', 'dashscope-intl'] }),
  def({ id: 'qwen-dashscope-cn', name: 'Qwen / DashScope China', type: 'openai', category: 'upstream', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', env: 'DASHSCOPE_CN_API_KEY', defaultModel: 'qwen-max', aliases: ['qwen-cn', 'dashscope-cn'] }),
  def({ id: 'deepseek-web', name: 'DeepSeek Web bridge (deepseek-free-api)', type: 'openai', category: 'free', free: true, auth: 'session-token', baseUrl: 'http://127.0.0.1:8000/v1', env: 'DEEPSEEK_WEB_TOKEN', defaultModel: 'deepseek-chat', note: 'Run github.com/VincentZyc/deepseek-free-api locally; token = web session token', aliases: ['dsweb'] }),
  def({ id: 'qwen-web', name: 'Qwen Web bridge (qwen-free-api)', type: 'openai', category: 'free', free: true, auth: 'session-token', baseUrl: 'http://127.0.0.1:8001/v1', env: 'QWEN_WEB_TOKEN', defaultModel: 'qwen-max', note: 'Run github.com/LLM-Red-Team/qwen-free-api locally; token = web token', aliases: ['qwen-free'] }),
  def({ id: 'ollama', name: 'Ollama (local)', type: 'openai', category: 'local', local: true, noKeyNeeded: true, baseUrl: 'http://localhost:11434/v1', defaultModel: 'llama3.2', aliases: [] }),
  def({ id: 'lmstudio', name: 'LM Studio (local)', type: 'openai', category: 'local', local: true, noKeyNeeded: true, baseUrl: 'http://localhost:1234/v1', defaultModel: '', aliases: ['lm-studio'] }),
  def({ id: 'vllm', name: 'vLLM (local/self-hosted)', type: 'openai', category: 'local', local: true, noKeyNeeded: true, baseUrl: 'http://localhost:8002/v1', defaultModel: '', aliases: [] }),
  def({ id: 'llamacpp', name: 'llama.cpp server', type: 'openai', category: 'local', local: true, noKeyNeeded: true, baseUrl: 'http://localhost:8080/v1', defaultModel: '', aliases: ['llama-cpp'] }),
  def({ id: 'jan', name: 'Jan (local)', type: 'openai', category: 'local', local: true, noKeyNeeded: true, baseUrl: 'http://127.0.0.1:1337/v1', defaultModel: '', aliases: [] }),
  def({ id: 'gpt4all', name: 'GPT4All (local)', type: 'openai', category: 'local', local: true, noKeyNeeded: true, baseUrl: 'http://localhost:4891/v1', defaultModel: '', aliases: [] }),
  def({ id: 'textgen-webui', name: 'text-generation-webui', type: 'openai', category: 'local', local: true, noKeyNeeded: true, baseUrl: 'http://localhost:5000/v1', defaultModel: '', aliases: ['oobabooga', 'textgen'] }),
  def({ id: 'koboldcpp', name: 'KoboldCpp', type: 'openai', category: 'local', local: true, noKeyNeeded: true, baseUrl: 'http://localhost:5001/v1', defaultModel: '', aliases: [] }),
  def({ id: 'custom', name: 'Custom provider (define in config)', type: 'openai', category: 'api-key', baseUrl: '', env: 'CUSTOM_API_KEY', defaultModel: '', aliases: [] }),
];

const VALID_TYPES = new Set(['openai', 'anthropic', 'gemini', 'vertex', 'codeassist']);

export function normalizeProvider(d) {
  const auth = d.auth ?? (d.oauth ? 'oauth-google' : d.local || d.noKeyNeeded ? 'none' : d.free ? 'session-token' : 'api-key');
  return Object.freeze({
    id: d.id,
    name: d.name ?? d.id,
    type: VALID_TYPES.has(d.type) ? d.type : 'openai',
    category: CATEGORY_SET.has(d.category) ? d.category : d.oauth ? 'oauth' : d.local ? 'local' : d.free ? 'free' : 'api-key',
    auth,
    baseUrl: d.baseUrl ?? '',
    env: d.env ?? '',
    defaultModel: d.defaultModel ?? '',
    aliases: Array.isArray(d.aliases) ? d.aliases : [],
    free: !!d.free,
    local: !!d.local || !!d.noKeyNeeded,
    enabled: d.enabled !== false,
    oauth: !!d.oauth,
    noKeyNeeded: !!d.noKeyNeeded,
    note: d.note ?? '',
    docs: d.docs ?? '',
  });
}

const REGISTRY = new Map();
const ALIAS_INDEX = new Map();
for (const raw of PROVIDER_DEFS) {
  const p = normalizeProvider(raw);
  REGISTRY.set(p.id, p);
  for (const a of p.aliases) ALIAS_INDEX.set(a.toLowerCase(), p.id);
}

export function hasProvider(id) {
  return REGISTRY.has(id);
}

export function getRegisteredProvider(id) {
  if (REGISTRY.has(id)) return REGISTRY.get(id);
  const canonical = ALIAS_INDEX.get(String(id).toLowerCase());
  return canonical ? REGISTRY.get(canonical) : null;
}

export function resolveAlias(idOrAlias) {
  const key = String(idOrAlias ?? '').toLowerCase();
  if (REGISTRY.has(key)) return key;
  return ALIAS_INDEX.get(key) ?? key;
}

export function listRegistered() {
  return [...REGISTRY.values()];
}

export function registeredByCategory(category) {
  return listRegistered().filter((p) => p.category === category);
}

export function searchRegistered(query) {
  const q = String(query ?? '').toLowerCase().trim();
  if (!q) return listRegistered();
  return listRegistered().filter(
    (p) =>
      p.id.toLowerCase().includes(q) ||
      p.name.toLowerCase().includes(q) ||
      p.aliases.some((a) => a.toLowerCase().includes(q))
  );
}

export function registryStats() {
  const byCategory = {};
  for (const cat of CATEGORIES) byCategory[cat] = 0;
  for (const p of REGISTRY.values()) byCategory[p.category]++;
  return { total: REGISTRY.size, byCategory };
}
