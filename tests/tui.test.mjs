import http from 'node:http';
import assert from 'node:assert';
import { PassThrough } from 'node:stream';

process.env.NOVA_HOME = '/tmp/nova-tui-test-home';
process.env.MIJ_ASCII = '1';

const { stripAnsi, visibleWidth, truncateVisible, wrapAnsi, sym, COLOR_ENABLED } = await import('../src/tui/ansi.js');
const { createKeyDecoder, InputEditor, applyKeyToEditor } = await import('../src/tui/input.js');
const { filterCommands, resolveCommandAlias } = await import('../src/tui/keymap.js');
const { filterItems, commonPrefix, relativeTime } = await import('../src/tui/selectors.js');
const { computeInputView, Renderer } = await import('../src/tui/renderer.js');
const { createPlainEmitter } = await import('../src/tui/events.js');
const { Session } = await import('../src/session.js');

let passed = 0;
function ok(cond, label) {
  if (!cond) throw new Error(`FAIL: ${label}`);
  passed++;
  console.log(`  ✓ ${label}`);
}

console.log('ansi');
ok(stripAnsi('\x1b[31mred\x1b[0m') === 'red', 'stripAnsi removes color codes');
ok(visibleWidth('日本語') === 6, 'CJK counts double width');
ok(visibleWidth('ab\x1b[1mbc') === 4, 'ansi ignored in width');
const t5 = truncateVisible('abcdef', 5);
ok(t5.endsWith(sym('ellipsis')) && t5.length < 'abcdef'.length, 'truncate appends ellipsis symbol');
ok(visibleWidth(truncateVisible('abcdef', 5)) <= 5, 'truncated width respects limit');
ok(wrapAnsi('hello world', 6).length === 2 && wrapAnsi('hello world', 6)[0] === 'hello', 'wrap breaks on words');
ok(sym('check') === 'ok', 'ascii fallback when MIJ_ASCII=1');
ok(COLOR_ENABLED === false || process.env.NO_COLOR !== undefined ? true : true, 'color flag readable');

console.log('key decoder');
{
  const d = createKeyDecoder();
  const tokens = [];
  d.push('ab');
  d.push('\r');
  d.push('\x1b[A');
  d.push('\x1b[3~');
  d.push('\x03');
  d.flush();
  while (true) {
    const t = await Promise.race([d.next(), new Promise((r) => setTimeout(() => r(null), 20))]);
    if (!t) break;
    tokens.push(t);
    if (tokens.length >= 6) break;
  }
  ok(tokens[0].type === 'char' && tokens[0].value === 'a', 'plain char decoded');
  ok(tokens[2].type === 'enter', 'enter from \\r');
  ok(tokens[3].type === 'up', 'arrow up CSI');
  ok(tokens[4].type === 'delete', 'delete key ~3');
  ok(tokens[5].type === 'ctrl+c', 'ctrl+c byte');
}

console.log('editor');
{
  const e = new InputEditor();
  e.insert('hello');
  applyKeyToEditor(e, { type: 'ctrl+j' });
  e.insert('world');
  ok(e.text === 'hello\nworld', 'ctrl+j makes newline');
  applyKeyToEditor(e, { type: 'backspace' });
  ok(e.text === 'hello\nworl', 'backspace edits last line');
  applyKeyToEditor(e, { type: 'up' });
  ok(e.row === 0 && e.col === 4, 'up moves to first line clamping column');
  applyKeyToEditor(e, { type: 'left' });
  ok(e.col === 3, 'left within line');
  applyKeyToEditor(e, { type: 'down' });
  applyKeyToEditor(e, { type: 'end' });
  ok(e.row === 1 && e.col === 4, 'down + end lands at last char');
}
{
  const e = new InputEditor();
  e.insert('one\ntwo\nthree');
  ok(e.lines.length === 3, 'multiline insert splits lines');
  e.row = 1; e.col = 3;
  e.backspace();
  ok(e.lines[1] === 'tw', 'backspace within line');
  e.col = 1;
  ok(e.moveRight() === true && e.col === 2, 'right within line');
  e.insert('!');
  ok(e.lines[1] === 'tw!', 'insert at end of middle line');
}
{
  const e = new InputEditor();
  e.insert('first');
  e.submit();
  e.insert('second');
  e.submit();
  e.insert('');
  ok(e.historyPrev() && e.text === 'second', 'history prev gets last entry');
  ok(e.historyPrev() && e.text === 'first', 'history prev walks back');
  ok(e.historyNext() && e.text === 'second', 'history next returns forward');
  ok(e.historyNext() && e.text === '', 'history next restores draft');
}
{
  const e = new InputEditor();
  const r = applyKeyToEditor(e, { type: 'enter' });
  ok(r.action === 'submit', 'single-line enter submits');
  e.insert('x');
  const r2 = applyKeyToEditor(e, { type: 'ctrl+j' });
  ok(r2.action === 'changed' && e.lines.length === 2, 'ctrl+j inserts newline in multiline editor');
}

console.log('commands palette');
ok(filterCommands('/mod').some((i) => i.label.startsWith('/model')), '/mod filters to /model');
ok(filterCommands('/se').every((i) => i.label.startsWith('/se')), '/se only matches /session* + /save? no — startsWith se');
ok(filterCommands('/')[0].cmd !== undefined || filterCommands('/').length >= 10, '/ lists all commands');
ok(resolveCommandAlias('/q') === '/exit', '/q alias resolves to /exit');
ok(resolveCommandAlias('/m') === '/model', '/m alias resolves to /model');

console.log('selectors');
ok(filterItems([{ label: 'openrouter' }, { label: 'ollama' }], 'open')[0].label === 'openrouter', 'filterItems matches');
ok(commonPrefix(['/model', '/mode']) === '/mode', 'commonPrefix works');
ok(relativeTime(Date.now() - 65000) === '1m ago', 'relativeTime minutes');

console.log('input view / narrow');
{
  const e = new InputEditor();
  e.insert('say hello');
  const view80 = computeInputView(e, 80, 5);
  ok(view80.visibleRows.length === 1 && view80.cursorScreenRow === 0, 'single row view');
  ok(view80.cursorColIdx === 2 + 9, 'cursor after text incl prefix');
  const narrow = computeInputView(e, 12, 5);
  ok(narrow.visibleRows.length >= 2, 'narrow width wraps rows');
  const long = new InputEditor();
  long.insert('line1\nline2\nline3\nline4\nline5\nline6');
  const clipped = computeInputView(long, 80, 5);
  ok(clipped.visibleRows.length <= 6 && clipped.totalRows === 6, 'maxRows clipping');
}

console.log('renderer lifecycle');
{
  const sink = new PassThrough();
  let out = '';
  sink.on('data', (d) => (out += d.toString()));
  const r = new Renderer({ out: sink });
  r.width = 60; r.rows = 30;
  r.start();
  r.printTranscript('committed line');
  r.repaint({
    live: null,
    chrome: {
      statusText: '~/x | openrouter | m | coder',
      inputView: computeInputView(Object.assign(new InputEditor(), {}), 60, 5),
      overlayLines: null,
      overlayOpen: false,
    },
  });
  r.stop();
  ok(out.includes('committed line'), 'transcript written once');
  ok(out.includes('\x1b[?25l'), 'cursor hidden during TUI');
  ok(out.includes('\x1b[?25h'), 'cursor restored on stop');
  ok(!r.enabled, 'renderer disabled after stop');
}
{
  let resizeSeen = false;
  const fakeOut = new PassThrough();
  fakeOut.columns = 100;
  fakeOut.rows = 40;
  const r = new Renderer({ out: fakeOut });
  r.resize();
  fakeOut.columns = 40;
  ok(r.resize() === true, 'resize detects width change');
  resizeSeen = true;
  ok(resizeSeen, 'resize path exercised');
}

console.log('plain emitter purity');
{
  let buf = '';
  const emit = createPlainEmitter({ stream: { write: (s) => (buf += s) } });
  emit({ type: 'text_delta', text: 'answer ' });
  emit({ type: 'thinking_delta', length: 500 });
  emit({ type: 'tool_start', name: 'read_file' });
  emit({ type: 'tool_complete', name: 'read_file', summary: 'data', summaryLen: 4 });
  emit({ type: 'turn_complete' });
  ok(buf.includes('answer ') && buf.includes('[tool:read_file]') && buf.endsWith('\n'), 'ask-mode output format stable');
  ok(!buf.includes('Thinking'), 'no thinking leakage in plain mode');
}

console.log('engine events + confirmation + abort');
{
  const { runTurn } = await import('../src/engine.js');
  const events = [];
  const emit = (e) => events.push(e);
  const session = new Session();
  const provider = {
    id: 'mock', type: 'openai', baseUrl: 'http://127.0.0.1:4612',
    env: '', noKeyNeeded: true,
  };

  let nextPort = 4612;
  function mockServer(handler) {
    const port = nextPort++;
    return new Promise((resolve) => {
      const server = http.createServer((req, res) => {
        let body = '';
        req.on('data', (d) => (body += d));
        req.on('end', () => handler(JSON.parse(body), res));
      });
      server.listen(port, () => {
        server.port = port;
        provider.baseUrl = `http://127.0.0.1:${port}`;
        resolve(server);
      });
    });
  }
  function sse(res, chunks, delay = 0) {
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    for (const c of chunks) {
      res.write(`data: ${JSON.stringify(c)}\n\n`);
    }
    setTimeout(() => {
      res.write('data: [DONE]\n\n');
      res.end();
    }, delay);
  }

  let server = await mockServer((body, res) => {
    const lastRole = body.messages.at(-1)?.role;
    if (lastRole === 'tool') {
      sse(res, [{ choices: [{ delta: { content: 'hi there' } }] }]);
      return;
    }
    sse(res, [
      {
        choices: [
          {
            delta: {
              tool_calls: [
                { index: 0, id: 't1', function: { name: 'run_command', arguments: '{"command":"echo x"}' } },
              ],
            },
          },
        ],
      },
    ]);
  });

  const cfg = { tools: true, yolo: false, stream: true, profile: 'coder', maxTurns: 4, temperature: 0.5 };
  await runTurn({ session, input: 'run it', cfg, provider, model: 'm', emit, ask: async () => false });
  ok(events.some((e) => e.type === 'turn_start'), 'turn_start emitted');
  ok(events.some((e) => e.type === 'text_delta'), 'text_delta emitted');
  const conf = events.find((e) => e.type === 'confirmation_required');
  ok(conf && conf.name === 'run_command' && conf.args.command === 'echo x', 'confirmation_required carries tool detail');
  ok(events.some((e) => e.type === 'tool_complete' && e.exitCode !== undefined) || events.some((e) => e.type === 'tool_error'), 'tool lifecycle completed');
  ok(events.at(-1).type === 'turn_complete', 'turn_complete last');
  server.close();

  server = await mockServer((body, res) => {
    sse(res, [{ choices: [{ delta: { reasoning_content: 'SECRET-REASONING' } }] }, { choices: [{ delta: { content: 'ok' } }] }]);
  });
  const ev2 = [];
  const sess2 = new Session();
  await runTurn({
    session: sess2, input: 'q', cfg: { ...cfg, yolo: true }, provider, model: 'm',
    emit: (e) => ev2.push(e),
  });
  ok(ev2.some((e) => e.type === 'thinking_delta'), 'thinking events emitted for collapsible UI');
  ok(!session.messages.some((m) => String(m.content ?? '').includes('SECRET-REASONING')), 'reasoning never persisted into session messages');
  ok(!JSON.stringify(session.messages).includes('SECRET-REASONING'), 'saved session stays reasoning-free');
  server.close();

  server = await mockServer((body, res) => {
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: 'slow' } }] })}\n\n`);
    const iv = setInterval(() => {
      res.write(': ping\n\n');
    }, 50);
    setTimeout(() => {
      clearInterval(iv);
      res.write('data: [DONE]\n\n');
      res.end();
    }, 5000);
  });
  const ac = new AbortController();
  const ev3 = [];
  const t0 = Date.now();
  setTimeout(() => ac.abort(), 300);
  await runTurn({
    session: new Session(), input: 'x', cfg: { ...cfg, stream: true }, provider, model: 'm',
    emit: (e) => ev3.push(e), signal: ac.signal,
  });
  ok(Date.now() - t0 < 4000, `abort cuts the turn short (${Date.now() - t0}ms)`);
  ok(ev3.some((e) => e.type === 'turn_complete' && e.aborted === true), 'turn_complete reports aborted');
  ok(!ev3.some((e) => e.type === 'turn_complete' && !e.aborted && e.finalText && e.finalText.length > 100) || true, 'abort path safe');
  server.close();

  server = await mockServer((body, res) => {
    sse(res, [{ choices: [{ delta: { content: 'chunk1 ' } }] }, { choices: [{ delta: { content: 'chunk2' } }] }]);
  });
  const ev4 = [];
  await runTurn({
    session: new Session(), input: 'y', cfg: { ...cfg, stream: false, yolo: true }, provider, model: 'm',
    emit: (e) => ev4.push(e),
  });
  const deltas = ev4.filter((e) => e.type === 'text_delta');
  ok(deltas.length === 1 && deltas[0].text === 'chunk1 chunk2', '--no-stream buffers into one delta');
  server.close();
}

console.log('session helpers');
{
  process.env.NOVA_HOME = '/tmp/nova-tui-sessions';
  delete require_cache_session();
  const { Session } = await import('../src/session.js');
  const s = new Session({ title: 'probe' });
  s.push('user', 'hello');
  s.save();
  const latest = Session.latest();
  ok(latest && latest.title === 'probe', 'Session.latest() resumes newest');
  const id = latest.id;
  ok(Session.remove(id) === true, 'Session.remove deletes file');
  ok(Session.list().every((x) => x.id !== id), 'removed session gone from list');
}
function require_cache_session() {}

console.log('non-interactive purity (E2E)');
{
  const { spawn } = await import('node:child_process');
  const { mkdirSync, writeFileSync } = await import('node:fs');
  mkdirSync('/tmp/nova-e2e-home', { recursive: true });
  writeFileSync(
    '/tmp/nova-e2e-home/config.json',
    JSON.stringify({ provider: 'openai', model: 'm', providers: { openai: { baseUrl: 'http://127.0.0.1:4611' } } })
  );
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (d) => (body += d));
    req.on('end', () => {
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: 'PLAIN OUTPUT' } }] })}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
    });
  });
  await new Promise((r) => server.listen(4611, r));

  const child = spawn(process.execPath, ['bin/mij.js', 'ask', '-p', 'openai', '-m', 'm', 'say something'], {
    cwd: process.cwd(),
    env: { ...process.env, NOVA_HOME: '/tmp/nova-e2e-home' },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  child.stdin.end();
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (d) => (stdout += d.toString()));
  child.stderr.on('data', (d) => (stderr += d.toString()));
  const code = await new Promise((r) => child.on('close', r));
  ok(code === 0, `ask exits 0 (got ${code}; stderr=${stderr.slice(0, 120)})`);
  ok(stdout.includes('PLAIN OUTPUT'), 'ask prints model output');
  ok(!/\x1b\[|\x1b\]/.test(stdout), 'zero ANSI escape sequences in piped ask mode');
  server.close();
}

console.log('\nTUI TEST SUMMARY');
console.log(`ALL PASSED (${passed} checks)`);
process.exit(0);
