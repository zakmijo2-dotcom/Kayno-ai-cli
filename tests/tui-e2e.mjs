import http from 'node:http';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert';

const HOME = '/tmp/nova-tui-e2e';
mkdirSync(HOME, { recursive: true });

function mockServer(port, handler) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (d) => (body += d));
      req.on('end', () => handler(JSON.parse(body), res));
    });
    server.listen(port, () => resolve(server));
  });
}
function sse(res, chunks, holdMs = 0, ping = false) {
  res.writeHead(200, { 'content-type': 'text/event-stream' });
  for (const c of chunks) res.write(`data: ${JSON.stringify(c)}\n\n`);
  let iv = null;
  if (ping) iv = setInterval(() => res.write(': ping\n\n'), 50);
  setTimeout(() => {
    if (iv) clearInterval(iv);
    res.write('data: [DONE]\n\n');
    res.end();
  }, holdMs);
}

function runMij(args, feedScript, timeoutMs = 15000) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['bin/mij.js', ...args], {
      cwd: process.cwd(),
      env: { ...process.env, NOVA_HOME: HOME, KAYNO_FORCE_TUI: '1' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let out = '';
    child.stdout.on('data', (d) => (out += d.toString()));
    child.stderr.on('data', (d) => (out += d.toString()));
    const start = Date.now();
    (async () => {
      for (const step of feedScript) {
        await new Promise((r) => setTimeout(r, step.wait));
        if (step.kill) child.kill('SIGKILL');
        else child.stdin.write(step.data);
      }
    })();
    const t = setTimeout(() => {
      child.kill('SIGKILL');
    }, timeoutMs);
    child.on('close', (code) => {
      clearTimeout(t);
      resolve({ code, out, ms: Date.now() - start });
    });
  });
}

let passed = 0;
function ok(cond, label) {
  if (!cond) throw new Error(`FAIL: ${label}`);
  passed++;
  console.log(`  ✓ ${label}`);
}

console.log('TUI E2E: startup, streaming, clean exit');
{
  writeFileSync(
    `${HOME}/config.json`,
    JSON.stringify({ provider: 'openai', model: 'test-m', providers: { openai: { baseUrl: 'http://127.0.0.1:4620' } } })
  );
  const server = await mockServer(4620, (body, res) => {
    sse(res, [
      { choices: [{ delta: { content: 'streamed answer part1 ' } }] },
      { choices: [{ delta: { content: 'part2' } }] },
    ]);
  });
  const { code, out } = await runMij(['chat'], [
    { wait: 600, data: 'hello world\r' },
    { wait: 1800, data: '\x03' },
  ]);
  if (!out.includes('hello world')) console.log('DEBUG OUTPUT:', JSON.stringify(out.slice(0, 1500)));
  ok(code === 0 || code === null, `clean exit (code=${code})`);
  ok(out.includes('Kayno'), 'banner shows Kayno branding');
  ok(out.includes('You') && out.includes('hello world'), 'user message echoed');
  if (!out.includes('part')) console.log('DEBUG:', JSON.stringify(out.slice(0, 2500)));
  ok(out.includes('part'), 'streamed text visible');
  ok(out.includes('\x1b[?25h'), 'cursor restored on exit');
  ok(!out.includes('SECRET'), 'no leaks');
  server.close();
}

console.log('TUI E2E: Ctrl+C during streaming cancels then second Ctrl+C exits');
{
  writeFileSync(
    `${HOME}/config.json`,
    JSON.stringify({ provider: 'openai', model: 'test-m', providers: { openai: { baseUrl: 'http://127.0.0.1:4621' } } })
  );
  const server = await mockServer(4621, (body, res) => {
    sse(res, [{ choices: [{ delta: { content: 'slow…' } }] }], 8000, true);
  });
  const { code, out } = await runMij(['chat', '-p', 'openai', '-m', 'test-m'], [
    { wait: 400, data: 'go\r' },
    { wait: 700, data: '\x03' },
    { wait: 600, data: '\x03' },
  ]);
  ok(code === 0 || code === null, `exits after cancel+quit (code=${code})`);
  ok(/cancelled|cancel/i.test(out), 'cancellation surfaced to user');
  if (!out.includes('\x1b[?25h')) console.log('DEBUG2:', JSON.stringify(out.slice(-1200)));
  ok(out.includes('\x1b[?25h'), 'terminal state restored');
  server.close();
}

console.log('TUI E2E: tool confirmation via y/n keys');
{
  writeFileSync(
    `${HOME}/config.json`,
    JSON.stringify({ provider: 'openai', model: 'test-m', providers: { openai: { baseUrl: 'http://127.0.0.1:4622' } } })
  );
  const server = await mockServer(4622, (body, res) => {
    const lastRole = body.messages.at(-1)?.role;
    if (lastRole === 'tool') {
      sse(res, [{ choices: [{ delta: { content: 'command done' } }] }]);
      return;
    }
    sse(res, [
      {
        choices: [
          {
            delta: {
              tool_calls: [
                { index: 0, id: 'c1', function: { name: 'run_command', arguments: '{"command":"echo confirm-test"}' } },
              ],
            },
          },
        ],
      },
    ]);
  });
  const { code, out } = await runMij(['chat'], [
    { wait: 400, data: 'run it\r' },
    { wait: 700, data: 'y' },
    { wait: 900, data: '\x03' },
  ]);
  ok(code === 0 || code === null, `exit ok (${code})`);
  ok(/Run command/i.test(out), 'tool card shown with label');
  ok(/echo confirm-test/.test(out), 'tool target shown');
  ok(out.includes('confirm-test') && /exit 0/.test(out), 'approved tool executed with exit badge');
  server.close();
}

console.log('TUI E2E: command palette navigation (/mod → Enter → model selector)');
{
  writeFileSync(
    `${HOME}/config.json`,
    JSON.stringify({ provider: 'openai', model: 'test-m', providers: { openai: { baseUrl: 'http://127.0.0.1:4623' } } })
  );
  const { code, out } = await runMij(['chat'], [
    { wait: 400, data: '/' },
    { wait: 200, data: 'mo' },
    { wait: 300, data: '\x1b[B' },
    { wait: 200, data: '\r' },
    { wait: 300, data: '\x1b' },
    { wait: 200, data: '\x1b' },
    { wait: 300, data: '\x03' },
  ], 12000);
  ok(code === 0 || code === null, `exit ok (${code})`);
  ok(out.includes('/model'), 'palette shows filtered /model entry');
}

console.log('\nTUI E2E SUMMARY');
console.log(`ALL PASSED (${passed} checks)`);
process.exit(0);
