import assert from 'node:assert';

process.env.NOVA_HOME = '/tmp/nova-context-home';
const { mkdirSync, writeFileSync } = await import('node:fs');
mkdirSync('/tmp/nova-context-home/cache', { recursive: true });
writeFileSync(
  '/tmp/nova-context-home/cache/models-dev.json',
  JSON.stringify({
    openai: {
      models: {
        'gpt-4o': {
          limit: { context: 128000, output: 16384 },
          tool_call: true,
          reasoning: false,
          modalities: { input: ['text', 'image'] },
        },
        o1: {
          limit: { context: 200000, output: 100000 },
          tool_call: false,
          reasoning: true,
          modalities: { input: ['text'] },
        },
      },
    },
  })
);
const { estimateTokens, messageTokens, conversationTokens, pruneConversation, getModelCaps } =
  await import('../src/context.js');

let passed = 0;
function ok(cond, label) {
  if (!cond) throw new Error(`FAIL: ${label}`);
  passed++;
  console.log(`  ✓ ${label}`);
}

console.log('token estimation');
ok(estimateTokens('') === 0, 'empty is 0');
ok(estimateTokens('abcd') === 1, '~4 chars per token');
ok(messageTokens({ role: 'user', content: 'x'.repeat(400) }) >= 100, 'message tokens computed');
const conv = [
  { role: 'user', content: 'a'.repeat(800) },
  { role: 'assistant', content: 'b'.repeat(800) },
];
ok(conversationTokens(conv) >= 380, 'conversation sums');

console.log('pruning preserves integrity');
{
  const messages = [
    { role: 'user', content: 'q1 '.repeat(5000) },
    { role: 'assistant', tool_calls: [{ id: '1', function: { name: 'read_file', arguments: '{}' } }], content: '' },
    { role: 'tool', content: 'data', tool_call_id: '1' },
    { role: 'user', content: 'q2' },
    { role: 'assistant', content: 'a2' },
    ...Array.from({ length: 30 }, (_, i) => ({ role: 'user', content: `m${i} `.repeat(2000) })),
    { role: 'assistant', content: 'recent answer' },
  ];
  const pruned = pruneConversation(messages, { tokenBudget: 3000, keepLast: 6 });
  ok(pruned.length < messages.length, 'pruned shrinks conversation');
  ok(!pruned.some((m) => m.role === 'tool' && !pruned.some((p, i) =>
    p.role === 'assistant' && Array.isArray(p.tool_calls) &&
    pruned[i + 1] === m
  )) || !pruned.some((m) => m.role === 'tool'), 'no orphaned tool results');
  ok(pruned.at(-1).content === 'recent answer', 'tail preserved');
  ok(pruned.some((m) => String(m.content ?? '').includes('pruned to fit')), 'prune marker present');
  ok(conversationTokens(pruned) < conversationTokens(messages), 'tokens reduced');
}

console.log('model caps');
{
  const caps = getModelCaps('openai', 'gpt-4o');
  ok(caps.contextLimit === 128000 && caps.tools === true && caps.vision === true, 'caps from catalog');
  const capsO1 = getModelCaps('openai', 'o1');
  ok(capsO1.reasoning === true && capsO1.tools === false, 'reasoning/tool flags');
  const unknown = getModelCaps('totally-unknown-provider', 'whatever');
  ok(unknown.contextLimit > 0 && unknown.known === false, 'unknown falls back safely');
}

console.log('\nCONTEXT TESTS PASSED');
process.exit(0);
