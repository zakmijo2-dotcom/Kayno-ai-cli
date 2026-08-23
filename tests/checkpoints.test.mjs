import assert from 'node:assert';
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const WS = '/tmp/nova-ckpt-ws';
const HOME = '/tmp/nova-ckpt-home';
rmSync(WS, { recursive: true, force: true });
process.chdir('/');
rmSync(HOME, { recursive: true, force: true });
process.env.NOVA_HOME = HOME;
mkdirSync(join(WS, 'src'), { recursive: true });
process.env.NOVA_HOME = join(WS, '.nova-home');
mkdirSync(process.env.NOVA_HOME, { recursive: true });
writeFileSync(join(process.env.NOVA_HOME, 'config.json'), JSON.stringify({ workspace: { root: WS } }));

const { TurnCheckpoint, undoLast, redoLast, listCheckpoints } = await import('../src/checkpoints.js');
const { resetWorkspaceCache } = await import('../src/workspace.js');
resetWorkspaceCache();

let passed = 0;
function ok(cond, label) {
  if (!cond) throw new Error(`FAIL: ${label}`);
  passed++;
  console.log(`  ✓ ${label}`);
}

console.log('checkpoint lifecycle');
{
  const appJs = join(WS, 'src', 'app.js');
  writeFileSync(appJs, 'version one\n');

  const ck = new TurnCheckpoint({ provider: 'mock' });
  ok(ck.recordFile('src/app.js') === true, 'file recorded for snapshot');
  writeFileSync(appJs, 'version two — agent edit\n');

  const newFile = join(WS, 'src', 'created.js');
  ck.recordFile('src/created.js');
  writeFileSync(newFile, 'brand new content\n');

  const id = ck.finalize();
  ok(id && listCheckpoints().length === 1, 'checkpoint persisted');

  const undoRes = undoLast();
  ok(undoRes.changed === true, 'undo applied');
  ok(readFileSync(appJs, 'utf8') === 'version one\n', 'modified file reverted');
  ok(!existsSync(newFile), 'created file removed on undo');

  const redoRes = redoLast();
  ok(redoRes.changed === true, 'redo applied');
  ok(readFileSync(appJs, 'utf8').includes('version two'), 'redo restores agent version');
  ok(existsSync(newFile), 'redo recreates created file');
}

console.log('multi-file turn is one unit');
{
  const a = join(WS, 'a.txt');
  const b = join(WS, 'b.txt');
  writeFileSync(a, 'A0');
  writeFileSync(b, 'B0');

  const ck = new TurnCheckpoint({});
  ck.recordFile('a.txt');
  ck.recordFile('b.txt');
  writeFileSync(a, 'A1');
  writeFileSync(b, 'B1');
  ck.finalize();

  undoLast();
  ok(readFileSync(a, 'utf8') === 'A0' && readFileSync(b, 'utf8') === 'B0', 'both files revert together');
}

console.log('edge cases');
{
  const noChange = new TurnCheckpoint({});
  noChange.recordFile('nonexistent-thing.txt');
  ok(noChange.finalize() === null, 'no-op turn produces no checkpoint');

  const manualDel = join(WS, 'manual.txt');
  writeFileSync(manualDel, 'keep me');
  const ck = new TurnCheckpoint({});
  const recorded = ck.recordFile('manual.txt');
  ok(recorded === true, 'manual.txt recorded');
  writeFileSync(manualDel, 'agent changed it');
  const mid = ck.finalize();
  ok(!!mid, `edge checkpoint persisted (${mid})`);
  ok(listCheckpoints()[0] === `${mid}.json`, 'newest checkpoint first in list');

  rmSync(manualDel);
  const u = undoLast();
  ok(u.changed && existsSync(manualDel), 'undo after external deletion restores file');
  ok(readFileSync(manualDel, 'utf8') === 'keep me', 'restored original content');

}


console.log('\nCHECKPOINT TESTS PASSED');
process.exit(0);
