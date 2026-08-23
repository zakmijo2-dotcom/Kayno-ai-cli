import assert from 'node:assert';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';

const HOME = '/tmp/kayno-compaction-home';
rmSync(HOME, { recursive: true, force: true });
process.env.NOVA_HOME = HOME;
mkdirSync(HOME, { recursive: true });

const { extractUsage, estimateCost, formatCost, estimateTokens } = await import('../src/context.js');
const { buildCompactionPayload, applyCompaction, compactSession, extractPinnedArtifacts } = await import('../src/commands/compact.js');
const { Session } = await import('../src/session.js');

let passed = 0;
function ok(cond, label) {
  if (!cond) throw new Error(`FAIL: ${label}`);
  passed++;
  console.log(`  ✓ ${label}`);
}

console.log('usage extraction');
{
  const oa = extractUsage({ prompt_tokens: 100, completion_tokens: 50, prompt_tokens_details: { cached_tokens: 40 } });
  ok(oa.input === 100 && oa.output === 50 && oa.cached === 40, 'openai shape w/ cached detail');
  const an = extractUsage({ input_tokens: 200, output_tokens: 80, cache_read_input_tokens: 60 });
  ok(an.input === 200 && an.output === 80 && an.cached === 60, 'anthropic shape');
  const empty = extractUsage(undefined);
  ok(empty.input === 0 && empty.output === 0 && empty.cached === 0, 'missing usage safe');
}

console.log('cost estimation');
{
  const rate = { input: 2.5, output: 10, cache_read: 1.25 };
  const dollars = estimateCost(rate, { input: 1_000_000, cached: 400_000, output: 100_000 });
  ok(Math.abs(dollars - 3.0) < 1e-9, `exact cost math ($${dollars})`);
  ok(estimateCost(null, { input: 5 }) === null, 'no pricing → null');
  ok(formatCost(0.005) === '$0.0050' && formatCost(3) === '$3.00', 'cost formatting');
  void estimateTokens;
}

console.log('compaction payload');
{
  const big = [];
  big.push({ role: 'user', content: 'TASK: fix the auth bug in the login flow' });
  big.push({ role: 'assistant', tool_calls: [{ id: '1', function: { name: 'edit_file', arguments: '{}' } }], content: '' });
  big.push({ role: 'tool', content: 'edited src/auth.js · 1 replacement · near line 42', tool_call_id: '1', name: 'edit_file' });
  big.push({ role: 'assistant', content: 'fixed it partially' });
  for (let i = 0; i < 40; i++) {
    big.push({ role: 'user', content: `filler message ${i} ${'x'.repeat(400)}` });
    big.push({ role: 'assistant', content: `reply ${i} ${'y'.repeat(200)}` });
  }
  big.push({ role: 'user', content: 'now run the tests please' });

  const under = buildCompactionPayload({ messages: [{ role: 'user', content: 'tiny' }], thresholdTokens: 6000 });
  ok(under === null, 'under threshold → null');

  const payload = buildCompactionPayload({ messages: big, thresholdTokens: 1000 });
  ok(payload !== null && payload.removedCount > 10, 'over threshold builds payload');
  ok(payload.prompt.includes('fix the auth bug'), 'original task preserved in summary prompt');
  ok(payload.prompt.includes('src/auth.js'), 'pinned file artifact present');
  ok(payload.tail.at(-1).content.startsWith('now run the tests'), 'recent tail kept verbatim');

  const summarized = applyCompaction(big, payload, 'SUMMARY TEXT');
  ok(summarized[0].compacted === true && summarized[0].content.includes('SUMMARY TEXT'), 'summary marker first');
  ok(summarized.length < big.length, 'history shrunk');
  ok(conversationTokensOf(summarized) < conversationTokensOf(big), 'tokens reduced');
}
function conversationTokensOf(msgs) {
  return msgs.reduce((n, m) => n + Math.ceil(String(m.content ?? '').length / 4), 0);
}

console.log('compactSession end-to-end (mocked summarizer)');
{
  const session = new Session({ title: 't' });
  session.messages.push({ role: 'user', content: 'goal: build feature X' });
  for (let i = 0; i < 30; i++) {
    session.messages.push({ role: 'user', content: `u${i} ${'a'.repeat(500)}` });
    session.messages.push({ role: 'assistant', content: `w${i} ${'b'.repeat(300)}` });
  }
  let savedCalls = 0;
  session.save = () => savedCalls++;
  const res = await compactSession({
    session,
    summarize: async (prompt) => {
      assert(prompt.includes('ORIGINAL TASK'), 'summarizer receives structured prompt');
      return 'THE SUMMARY';
    },
    thresholdTokens: 800,
  });
  ok(res.changed === true && res.removedMessages > 10, `compacted (${res.removedMessages} removed)`);
  ok(savedCalls === 1, 'session persisted after compaction');
  ok(session.messages[0].content.includes('THE SUMMARY'), 'summary injected');
}

console.log('session usage persistence');
{
  const s = new Session({ title: 'usage' });
  s.recordUsage({ input: 100, output: 30, cached: 20 });
  s.recordUsage({ input: 50, output: 10, cached: 0 });
  s.save();
  const loaded = Session.load(s.id);
  const t = loaded.usageTotals();
  ok(t.input === 150 && t.output === 40 && t.cached === 20, 'usage totals survive round-trip');
}

console.log('\nCOMPACTION TESTS PASSED');
process.exit(0);
