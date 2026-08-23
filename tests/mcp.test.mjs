import assert from 'node:assert';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const HOME = '/tmp/kayno-mcp-home';
rmSync(HOME, { recursive: true, force: true });
mkdirSync(HOME, { recursive: true });
process.env.NOVA_HOME = HOME;

const serverScript = join(HERE, 'fixtures', 'mock-mcp-server.mjs');
writeFileSync(
  join(HOME, 'mcp.json'),
  JSON.stringify({
    servers: {
      mock: { command: process.execPath, args: [serverScript] },
      broken: { command: 'definitely-not-a-real-binary-xyz' },
      malformed: { command: process.execPath, args: ['-e', 'process.stdout.write("GARBAGE\\n");setInterval(()=>{},1000)'] },
    },
  })
);

const client = await import('../src/mcp/client.js');

let passed = 0;
function ok(cond, label) {
  if (!cond) throw new Error(`FAIL: ${label}`);
  passed++;
  console.log(`  ✓ ${label}`);
}

console.log('config loading');
{
  const cfg = client.loadMcpConfig();
  ok(cfg.path && Object.keys(cfg.servers).length === 3, 'mcp.json loaded with 3 servers');
}

console.log('connect + discovery');
{
  const results = await client.connectServers();
  const mock = results.find((r) => r.name === 'mock');
  ok(mock?.ok === true && mock.tools === 1, `mock connected with 1 tool (${JSON.stringify(mock)})`);
  ok(results.find((r) => r.name === 'broken')?.ok === false, 'missing binary reported not-ok');
  ok(results.find((r) => r.name === 'malformed')?.ok === false, 'garbage-output server fails gracefully');
}

console.log('tool listing namespacing');
{
  const tools = client.listMcpTools();
  ok(tools.length === 1 && tools[0].function.name === 'mcp__mock__echo', `namespaced tool (${tools.map((t) => t.function.name)})`);
  ok(/Echo back/.test(tools[0].function.description), 'description prefixed with server tag');
}

console.log('tool call round-trip');
{
  const out = await client.callMcpTool('mcp__mock__echo', { text: 'hello-mcp' });
  ok(out === 'echo:hello-mcp', `call result (${out})`);
  let threw = false;
  try {
    await client.callMcpTool('mcp__mock__unknown_tool', {});
  } catch (e) {
    threw = /unknown tool|MCP error/.test(e.message);
  }
  ok(threw, 'server-side error surfaced');
}

client.disconnectAll();

console.log('\nMCP TESTS PASSED');
process.exit(0);
