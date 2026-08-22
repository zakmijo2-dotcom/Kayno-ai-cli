import http from 'node:http';
import assert from 'node:assert';
import { Session } from '../src/session.js';
import { runTurn } from '../src/engine.js';
import { discoverSkills, matchSkills, parseFrontmatter } from '../src/skills/index.js';
import { loadPlugins } from '../src/plugins/index.js';
import { PRESETS } from '../src/providers/catalog.js';

const PORT = 4599;

function startMock() {
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (d) => (body += d));
    req.on('end', () => {
      const parsed = JSON.parse(body);
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      if (!parsed.tools || parsed.tools.length === 0) {
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: 'hello ' } }] })}\n\n`);
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: 'from mock' } }] })}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
        return;
      }
      if (parsed.messages.length <= 2) {
        const call = {
          choices: [
            {
              delta: {
                tool_calls: [
                  { index: 0, id: 'call_1', function: { name: 'list_dir', arguments: '{"path":".' } },
                  { index: 0, id: null, function: null, arguments: '' },
                ],
              },
            },
          ],
        };
        call.choices[0].delta.tool_calls[1] = {
          index: 0,
          function: { arguments: '}' },
        };
        res.write(`data: ${JSON.stringify(call)}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
      } else {
        res.write(
          `data: ${JSON.stringify({ choices: [{ delta: { content: `dir has ${parsed.messages.length - 2} msgs` } }] })}\n\n`
        );
        res.write('data: [DONE]\n\n');
        res.end();
      }
    });
  });
  return new Promise((resolve) => server.listen(PORT, () => resolve(server)));
}

async function main() {
  process.env.NOVA_HOME = '/tmp/nova-test-home';
  const mod = await import('../src/config.js');

  const skills = discoverSkills();
  assert.ok(skills.length >= 5, `expected builtin skills, got ${skills.length}`);
  const matched = matchSkills('I found a bug and a stack trace', skills);
  assert.ok(matched.some((s) => s.name === 'debugging'), 'debugging skill should activate');
  const fm = parseFrontmatter('---\nname: x\ntriggers: [a, b]\n---\nbody here');
  assert.equal(fm.meta.name, 'x');
  assert.deepEqual(fm.meta.triggers, ['a', 'b']);
  console.log('✓ skills system');

  const reg = await loadPlugins();
  assert.ok(reg.plugins.some((p) => p.name === 'motd'), 'example plugin loaded');
  console.log('✓ plugins system');

  assert.ok(PRESETS.length >= 50, `need 50+ presets, have ${PRESETS.length}`);
  console.log(`✓ provider catalog (${PRESETS.length} builtin presets)`);

  const server = await startMock();

  const cfg = {
    ...mod.loadConfig(),
    tools: true,
    yolo: true,
    maxTurns: 4,
    profile: 'coder',
    skills: true,
    temperature: 0.5,
  };

  const session = new Session();
  const out = await runTurn({
    session,
    input: 'list the current directory',
    cfg,
    provider: {
      id: 'mock',
      name: 'Mock',
      type: 'openai',
      baseUrl: `http://127.0.0.1:${PORT}`,
      env: '',
      noKeyNeeded: true,
    },
    model: 'mock-1',
    quiet: true,
  });

  assert.match(out, /dir has \d+ msgs/, `tool loop completed, got: ${out}`);
  assert.ok(session.messages.some((m) => m.role === 'tool'), 'tool result recorded');
  assert.ok(session.messages.some((m) => m.tool_calls?.length), 'assistant tool_call recorded');
  console.log('✓ engine tool-calling loop (openai-compatible SSE)');

  const textOnly = await runTurn({
    session: new Session(),
    input: 'hi',
    cfg: { ...cfg, tools: false },
    provider: {
      id: 'mock',
      type: 'openai',
      baseUrl: `http://127.0.0.1:${PORT}`,
      env: '',
      noKeyNeeded: true,
    },
    model: 'mock-1',
    quiet: true,
  });
  assert.equal(textOnly, 'hello from mock');
  console.log('✓ plain streaming chat');

  server.close();
  console.log('\nALL SMOKE TESTS PASSED');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
