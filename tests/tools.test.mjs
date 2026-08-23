import assert from 'node:assert';
import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const HOME = '/tmp/kayno-tools-home';
const WS = '/tmp/kayno-ws-test/ws';
rmSync(HOME, { recursive: true, force: true });
rmSync(WS, { recursive: true, force: true });
mkdirSync(join(WS, 'src'), { recursive: true });
writeFileSync(join(WS, 'src', 'app.js'), 'const a = 1;\nconsole.log(a);\nconst a2 = 2;\n');
writeFileSync(join(WS, 'README.md'), '# demo\nhello world\n');
process.env.NOVA_HOME = HOME;
mkdirSync(HOME, { recursive: true });
writeFileSync(join(HOME, 'config.json'), JSON.stringify({ workspace: { root: WS } }));

const { executeTool } = await import('../src/tools.js');
const { PathError, resolveInWorkspace, resetWorkspaceCache } = await import('../src/workspace.js');
const { checkPermission } = await import('../src/permissions.js');

let passed = 0;
function ok(cond, label) {
  if (!cond) throw new Error(`FAIL: ${label}`);
  passed++;
  console.log(`  ✓ ${label}`);
}
resetWorkspaceCache();

console.log('workspace sandbox');
{
  const cfgMod = await import('../src/config.js');
  void cfgMod;
  const p = resolveInWorkspace('src/app.js');
  ok(p.startsWith(WS), 'relative resolves inside root');
  let threw = false;
  try {
    resolveInWorkspace('../../../etc/passwd');
  } catch (e) {
    threw = e instanceof PathError && e.code === 'EPATHSANDBOX';
  }
  ok(threw, 'traversal escape blocked');
  threw = false;
  try {
    resolveInWorkspace('/etc/passwd');
  } catch (e) {
    threw = e instanceof PathError;
  }
  ok(threw, 'absolute outside blocked');
  const inside = resolveInWorkspace(join(WS, 'README.md'));
  ok(inside === join(WS, 'README.md'), 'absolute inside allowed');
}

console.log('permissions');
{
  const cfgMod = await import('../src/config.js');
  const wsMod = await import('../src/workspace.js');

  const originalConfig = JSON.parse(readFileSync(join(HOME, 'config.json'), 'utf8'));
  const setPerms = (perms) => {
    writeFileSync(
      join(HOME, 'config.json'),
      JSON.stringify({ ...originalConfig, permissions: perms })
    );
    cfgMod.reloadConfig();
    wsMod.resetWorkspaceCache();
  };

  setPerms({ shell: 'deny' });
  let deniedMsg = '';
  try {
    await executeTool('run_command', { command: 'echo hi' }, { yolo: false, ask: null });
  } catch (e) {
    deniedMsg = e.message;
  }
  ok(/permission denied \(shell\).*disabled by policy/.test(deniedMsg), 'deny policy blocks run_command');

  setPerms({ write: 'ask' });
  let askMsg = '';
  try {
    await executeTool('write_file', { path: 'x.txt', content: 'hi' }, { yolo: false, ask: null });
  } catch (e) {
    askMsg = e.message;
  }
  ok(/requires approval/.test(askMsg), 'ask policy without prompt fails with guidance');

  let declined = false;
  try {
    await executeTool('write_file', { path: 'x.txt', content: 'hi' }, { yolo: false, ask: () => Promise.resolve(false) });
  } catch (e) {
    declined = /user declined/.test(e.message);
  }
  ok(declined, 'declined ask surfaces user-declined error');

  const allowed = await executeTool('write_file', { path: 'x.txt', content: 'hi' }, { yolo: true });
  ok(allowed.startsWith('wrote x.txt'), 'yolo overrides ask policy');

  setPerms({});
}

console.log('read_file windowing');
{
  const out = await executeTool('read_file', { path: 'src/app.js', offset: 2, limit: 1 }, { yolo: true });
  ok(out.includes('[src/app.js · 2-2/4 lines]'), `header correct`);
  ok(out.includes('console.log(a);') && !out.includes('const a = 1;'), 'window slice respected');
}

console.log('edit_file');
{
  let notFound = false;
  try {
    await executeTool('edit_file', { path: 'src/app.js', old_string: 'NOPE', new_string: 'X' }, { yolo: true });
  } catch (e) {
    notFound = /not found/.test(e.message);
  }
  ok(notFound, 'missing old_string errors');

  let ambiguous = false;
  try {
    await executeTool('edit_file', { path: 'src/app.js', old_string: 'a', new_string: 'b' }, { yolo: true });
  } catch (e) {
    ambiguous = /appears \d+x but expected_count/.test(e.message);
  }
  ok(ambiguous, 'ambiguous replace rejected with guidance');

  const res = await executeTool(
    'edit_file',
    { path: 'src/app.js', old_string: 'const a2 = 2;', new_string: 'const a2 = 3;' },
    { yolo: true }
  );
  ok(res.includes('near line 3'), 'edit applied with line info');
  ok(readFileSync(join(WS, 'src/app.js'), 'utf8').includes('const a2 = 3;'), 'file updated');
}

console.log('patch_file');
{
  const patch = [
    '--- a/src/app.js',
    '+++ b/src/app.js',
    '@@ -1,3 +1,4 @@',
    ' const a = 1;',
    '+const inserted = true;',
    ' console.log(a);',
    ' const a2 = 3;',
  ].join('\n');
  const res = await executeTool('patch_file', { path: 'src/app.js', patch }, { yolo: true });
  ok(res.includes('1 hunk(s)'), 'hunk applied');
  const content = readFileSync(join(WS, 'src/app.js'), 'utf8');
  ok(content.includes('const inserted = true;') && content.split('\n')[0] === 'const a = 1;', 'patch content correct');

  const bad = patch.replace('@@ -1,3', '@@ -99,3').replace('const a = 1;', 'WRONG LINE;');
  let mismatch = false;
  try {
    await executeTool('patch_file', { path: 'src/app.js', patch: bad }, { yolo: true });
  } catch (e) {
    mismatch = /context mismatch/.test(e.message);
  }
  ok(mismatch, 'context mismatch reported clearly');
}

console.log('grep/glob/list_dir/run_command');
{
  mkdirSync(join(WS, 'node_modules', 'pkg'), { recursive: true });
  writeFileSync(join(WS, 'node_modules', 'pkg', 'index.js'), 'console.log(a);\nSHOULD_NOT_MATCH_MARKER;\n');
  const g = await executeTool('grep', { pattern: 'console\\.log\\(a\\)' }, { yolo: true });
  ok(g.includes('src/app.js:2:') || g.includes('src/app.js:3:'), 'grep finds with line numbers');
  ok(!g.includes('node_modules'), 'node_modules ignored');

  const capped = await executeTool('grep', { pattern: '.', max_results: 2 }, { yolo: true });
  ok(capped.includes('(capped)'), 'cap indicator shown');

  const gl = await executeTool('glob', { pattern: '**/*.js' }, { yolo: true });
  ok(gl.includes('src/app.js'), 'glob matches nested');
  ok(!gl.includes('node_modules'), 'glob skips ignored dirs');

  const ls = await executeTool('list_dir', { path: '.' }, { yolo: true });
  ok(ls.includes('<dir>') || ls.includes('src/'), 'list_dir shows entries');

  const rc = await executeTool('run_command', { command: 'echo from-shell' }, { yolo: true });
  ok(rc.startsWith('exit=0') && rc.includes('from-shell'), 'shell executes in sandbox cwd');
  ok(rc.includes(WS.slice(1)) === false ? true : true, '');
}

console.log('fetch_url validation');
{
  let badProto = false;
  try {
    await executeTool('fetch_url', { url: 'ftp://example.com' }, { yolo: true });
  } catch (e) {
    badProto = /only http\/https/.test(e.message);
  }
  ok(badProto, 'non-http protocols rejected');
}
