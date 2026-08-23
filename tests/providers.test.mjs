import assert from 'node:assert';
import http from 'node:http';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';

const HOME = '/tmp/kayno-prov-home';
rmSync(HOME, { recursive: true, force: true });
process.env.NOVA_HOME = HOME;
mkdirSync(`${HOME}/cache`, { recursive: true });
writeFileSync(
  `${HOME}/cache/models-dev.json`,
  JSON.stringify({
    openai: {
      models: {
        'gpt-4o': {
          limit: { context: 128000, output: 16384 },
          tool_call: true,
          reasoning: false,
          modalities: { input: ['text', 'image'] },
        },
        o1: { limit: { context: 200000, output: 100000 }, tool_call: false, reasoning: true },
      },
    },
    anthropic: {
      models: {
        'claude-sonnet-4-5': {
          limit: { context: 200000, output: 64000 },
          tool_call: true,
          reasoning: true,
          modalities: { input: ['text', 'image'] },
        },
      },
    },
  })
);
writeFileSync(
  `${HOME}/config.json`,
  JSON.stringify({ provider: 'openai', providers: { 'google-gemini': { capabilities: { contextLimit: 999999 } } } })
);



const registry = await import('../src/providers/registry.js');
const catalog = await import('../src/providers/catalog.js');
const caps = await import('../src/providers/capabilities.js');
const models = await import('../src/providers/models.js');
const client = await import('../src/providers/client.js');

let passed = 0;
function ok(cond, label) {
  if (!cond) throw new Error(`FAIL: ${label}`);
  passed++;
  console.log(`  ✓ ${label}`);
}

console.log('registry integrity');
{
  const ids = new Set();
  for (const p of registry.listRegistered()) {
    ids.add(p.id);
    assert(p.id && p.name && registry.CATEGORIES.includes(p.category), `bad def ${p.id}`);
    assert(['openai', 'anthropic', 'gemini', 'vertex', 'codeassist'].includes(p.type), `bad type ${p.id}`);
  }
  ok(ids.size === registry.PROVIDER_DEFS.length, `${ids.size} unique provider ids`);

  const mustExist = [
    'openai', 'anthropic', 'google-gemini', 'google-code-assist', 'antigravity',
    'deepseek', 'qwen-dashscope-intl', 'zhipu', 'groq', 'mistral', 'together',
    'fireworks', 'cerebras', 'siliconflow', 'ollama', 'lmstudio', 'vllm',
    'openrouter', 'moonshot', 'xai',
  ];
  ok(mustExist.every((id) => registry.hasProvider(id)), 'all must-not-break providers present');

  const byCat = registry.registryStats().byCategory;
  ok(byCat.oauth === 2 && byCat.free === 2 && byCat.local === 8, `categories sane: ${JSON.stringify(byCat)}`);
}

console.log('alias resolution');
{
  ok(registry.resolveAlias('gemini') === 'google-gemini', 'gemini alias');
  ok(registry.resolveAlias('claude') === 'anthropic', 'claude alias');
  ok(registry.resolveAlias('kimi') === 'moonshot', 'kimi alias');
  ok(registry.resolveAlias('glm') === 'zhipu', 'glm alias');
  ok(registry.resolveAlias('doubao') === 'volcengine-doubao', 'doubao alias');
  ok(registry.resolveAlias('lm-studio') === 'lmstudio', 'lm-studio alias');
  ok(catalog.getProvider('gemini').id === 'google-gemini', 'getProvider resolves aliases');
  ok(catalog.getProvider('antigravity').category === 'oauth', 'antigravity is oauth category');
}

console.log('capabilities');
{
  const c1 = caps.getCapabilities('openai', 'gpt-4o');
  ok(c1.contextLimit === 128000 && c1.tools === true && c1.vision === true, 'caps from catalog record');
  const c2 = caps.getCapabilities('openai', 'o1');
  ok(c2.reasoning === true && c2.tools === false && c2.contextLimit === 200000, 'reasoning/no-tools flags');
  const c3 = caps.getCapabilities('unknown-provider-x', 'm');
  ok(c3.providerKnown === false && c3.contextLimit > 0, 'unknown provider fallback safe');
  const c4 = caps.getCapabilities('google-gemini', 'gemini-2.5-pro');
  ok(c4.contextLimit === 999999, 'config override wins over catalog');
  ok(caps.supportsTools('anthropic', 'claude-sonnet-4-5') === true, 'supportsTools helper');
}

console.log('model registry');
{
  const oa = models.modelsFor('openai');
  ok(oa.some((m) => m.id === 'gpt-4o') && oa.some((m) => m.id === 'o1'), 'modelsFor lists provider models');
  const found = models.findModel('openai/gpt-4o');
  ok(found && found.provider === 'openai' && found.id === 'gpt-4o', 'findModel provider/model form');
  ok(models.findModel('nonexistent/model-zzz') === null, 'findModel miss returns null');
  const hits = models.searchModels('gpt-4o', 10);
  ok(hits.length >= 1, 'searchModels finds gpt-4o');
  ok(models.providerModelIds('google-gemini')[0] === 'gemini-2.5-pro', 'providerModelIds default first');
}

console.log('adapter dispatch + capability gating');
{
  ok(typeof client.adapterFor('openai') === 'function', 'adapterFor openai');
  ok(client.adapterFor('martian') === null, 'adapterFor unknown type null');

  let receivedBody = null;
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (d) => (body += d));
    req.on('end', () => {
      receivedBody = JSON.parse(body);
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: 'pong' } }] })}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
    });
  });
  await new Promise((r) => server.listen(4630, r));

  const text = await client.completeOnce({
    provider: { id: 'mock-oai', name: 'Mock', type: 'openai', baseUrl: 'http://127.0.0.1:4630/v1', env: '', noKeyNeeded: true },
    model: 'test-m',
    messages: [{ role: 'user', content: 'ping' }],
    system: '',
    tools: [],
    temperature: 0,
  });
  ok(text === 'pong', 'shared openai adapter streams text');

  await (async () => {
    const openaiDef = { ...catalog.getProvider('openai'), baseUrl: 'http://127.0.0.1:4630/v1', noKeyNeeded: true };
    let t = '';
    for await (const evt of client.streamChat({
      provider: openaiDef,
      model: 'o1',
      messages: [{ role: 'user', content: 'x' }],
      tools: [{ type: 'function', function: { name: 'x', description: '', parameters: {} } }],
      temperature: 0,
    })) {
      if (evt.type === 'text') t += evt.text;
    }
    ok(
      t === 'pong' && receivedBody.tools === undefined && receivedBody.model === 'o1',
      'tools stripped when model lacks tool support'
    );

    receivedBody = null;
    for await (const evt of client.streamChat({
      provider: openaiDef,
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'x' }],
      tools: [{ type: 'function', function: { name: 'x', description: '', parameters: {} } }],
      temperature: 0,
    })) {}
    ok(receivedBody?.tools?.length === 1, 'tools kept when model supports them');
  })();

  server.close();
}

console.log('\nPROVIDER TESTS PASSED');
process.exit(0);
