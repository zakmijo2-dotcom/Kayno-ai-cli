import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';

const WS = '/tmp/nova-diag-ws';
rmSync(WS, { recursive: true, force: true });
mkdirSync(join(WS, 'src'), { recursive: true });
process.env.NOVA_HOME = WS;
writeFileSync(WS + '/config.json', JSON.stringify({ workspace: { root: WS }, selfHeal: true }));

const { executeTool, TOOL_SCHEMAS } = await import('../src/tools.js');
const { resetWorkspaceCache } = await import('../src/workspace.js');
resetWorkspaceCache();

let passed = 0;
function ok(cond, label) {
  if (!cond) throw new Error(`FAIL: ${label}`);
  passed++;
  console.log(`  ✓ ${label}`);
}

console.log('run_diagnostics tool');
{
  ok(TOOL_SCHEMAS.some((t) => t.function.name === 'run_diagnostics'), 'schema registered');

  writeFileSync(join(WS, 'broken.js'), 'const x = {\n  bad syntax here!!!\n');
  const res = await executeTool('run_diagnostics', { files: ['broken.js'] }, { yolo: true });
  ok(!res.includes('DIAGNOSTICS CLEAN'), 'broken syntax flagged');
  ok(/node --check broken\.js/.test(res), 'node --check ran and reported');

  writeFileSync(join(WS, 'good.js'), 'const x = 1;\nconsole.log(x);\n');
  const clean = await executeTool('run_diagnostics', { files: ['good.js'] }, { yolo: true });
  if (!clean.includes('DIAGNOSTICS CLEAN')) console.log('DBG:', JSON.stringify(clean));
  ok(clean.includes('DIAGNOSTICS CLEAN'), `clean file passes`);

  const none = await executeTool('run_diagnostics', { files: [] }, { yolo: true });
  ok(none.includes('files checked: 0'), 'no files → project-level only');
}

console.log('self-heal loop (engine, mocked provider)');
{
  const { runTurn } = await import('../src/engine.js');

  let step = 0;
  function mockServer(handler) {
    return new Promise((resolve) => {
      const server = http.createServer((req, res) => {
        let body = '';
        req.on('data', (d) => (body += d));
        req.on('end', () => handler(JSON.parse(body), res));
      });
      server.listen(4650, () => resolve(server));
    });
  }
  const http = await import('node:http');

  const server = await mockServer((body, res) => {
    step++;
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    const last = body.messages.at(-1);
    if (step === 1) {
      sseWrite(res, [
        toolCall('c1', 'write_file', JSON.stringify({ path: 'src/mod.js', content: 'const a = {\n' })),
      ]);
    } else if (last?.role === 'user' && /auto-diagnostics/.test(last.content ?? '')) {
      sseWrite(res, [
        toolCall('cN', 'edit_file', JSON.stringify({
          path: 'src/mod.js',
          old_string: 'const a = {',
          new_string: 'const a = {};',
        })),
      ]);
    } else {
      sseWrite(res, [{ choices: [{ delta: { content: 'fixed and verified' } }] }]);
    }
  });

  function sseWrite(res, chunks) {
    for (const c of chunks) res.write(`data: ${JSON.stringify(c)}\n\n`);
    res.write('data: [DONE]\n\n');
    res.end();
  }
  function toolCall(id, name, args) {
    return {
      choices: [{ delta: { tool_calls: [{ index: 0, id, function: { name, arguments: args } }] } }],
    };
  }

  const events = [];
  const { Session } = await import('../src/session.js');
  const session = new Session();
  await runTurn({
    session,
    input: 'create src/mod.js',
    cfg: { tools: true, yolo: true, stream: true, profile: 'coder', maxTurns: 8, temperature: 0 },
    provider: { id: 'mock', type: 'openai', baseUrl: 'http://127.0.0.1:4650', env: '', noKeyNeeded: true },
    model: 'm',
    emit: (e) => events.push(e),
  });

  const statuses = events.filter((e) => e.type === 'status').map((e) => e.text ?? '');
  ok(statuses.some((x) => /diagnostics/.test(x)), `diagnostics status emitted (${statuses.join(' | ')})`);
  ok(readFileSync(join(WS, 'src', 'mod.js'), 'utf8').includes('const a = {};'), 'file actually fixed');
  server.close();
}

console.log('\nDIAGNOSTICS TESTS PASSED');
process.exit(0);
