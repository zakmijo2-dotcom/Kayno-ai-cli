import assert from 'node:assert';
import { mkdirSync, rmSync, existsSync } from 'node:fs';

const HOME = '/tmp/nova-sessions-test';
rmSync(HOME, { recursive: true, force: true });
process.env.NOVA_HOME = HOME;
mkdirSync(HOME, { recursive: true });

const { Session } = await import('../src/session.js');

let passed = 0;
function ok(cond, label) {
  if (!cond) throw new Error(`FAIL: ${label}`);
  passed++;
  console.log(`  ✓ ${label}`);
}

console.log('session lifecycle');
{
  const s = new Session({ title: 'auth bug' });
  s.push('user', 'fix the login flow please');
  s.push('assistant', 'here is the fix');
  s.save();
  ok(existsSync(`${HOME}/sessions/${s.id}.json`), 'session persisted');

  const loaded = Session.load(s.id);
  ok(loaded.messages.length === 2 && loaded.title === 'auth bug', 'round-trip load');

  const latest = Session.latest();
  ok(latest.id === s.id, 'latest() finds it');

  const byTitle = Session.search('auth');
  ok(byTitle.length === 1 && byTitle[0].id === s.id, 'search matches title');

  const byBody = Session.search('login flow');
  ok(byBody.length === 1 && byBody[0].matchedInBody, 'search matches message body');

  ok(Session.search('zzz-nonexistent').length === 0, 'no false matches');

  ok(Session.remove(s.id) === true, 'remove returns true');
  ok(!existsSync(`${HOME}/sessions/${s.id}.json`), 'file deleted');
  ok(Session.remove(s.id) === false, 'double-remove safe');

  let threw = false;
  try {
    Session.load('../evil');
  } catch (e) {
    threw = true;
  }
  ok(threw, 'path traversal in load blocked');
}

console.log('\nSESSION TESTS PASSED');
process.exit(0);
