import assert from 'node:assert';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const WS = '/tmp/nova-rules-ws';
rmSync(WS, { recursive: true, force: true });
mkdirSync(join(WS, '.nova', 'skills'), { recursive: true });
mkdirSync(join(WS, '.github'), { recursive: true });

process.env.NOVA_HOME = '/tmp/nova-rules-home';
writeFileSync(WS + '/config.json', JSON.stringify({ workspace: { root: WS }, rules: true }));
const { resetWorkspaceCache } = await import('../src/workspace.js');
resetWorkspaceCache();
process.chdir(WS);

const { collectRules, rulesToPrompt } = await import('../src/rules.js');
const { buildSystemPrompt } = await import('../src/prompts/system.js');

let passed = 0;
function ok(cond, label) {
  if (!cond) throw new Error(`FAIL: ${label}`);
  passed++;
  console.log(`  ✓ ${label}`);
}

console.log('priority order');
{
  writeFileSync(join(WS, 'AGENT.md'), '# AGENT rules win');
  writeFileSync(join(WS, 'SKILL.md'), '# SKILL loses to AGENT');
  writeFileSync(join(WS, '.nova', 'skills', 'a.md'), '- skill rule A');
  writeFileSync(join(WS, '.nova', 'skills', 'b.md'), '- skill rule B');
  writeFileSync(join(WS, '.github', 'copilot-instructions.md'), 'copilot instruction');

  const rules = collectRules();
  ok(rules.length === 4, `all sources found (${rules.length})`);
  ok(rules[0].source === 'AGENT.md', 'AGENT.md first');
  ok(!rules.some((r) => r.source === 'SKILL.md'), 'SKILL.md skipped when AGENT.md exists (priority break)');
  ok(
    rules.filter((r) => r.source.startsWith('.nova/skills')).every((r) => r.priority < 90),
    'skill files before copilot'
  );
  const prompt = rulesToPrompt(rules);
  ok(prompt.indexOf('skill rule A') < prompt.indexOf('copilot instruction'), 'order preserved in prompt');
}

console.log('missing files + empty dir');
{
  rmSync(join(WS, 'AGENT.md'));
  rmSync(join(WS, '.github', 'copilot-instructions.md'));
  rmSync(join(WS, '.nova', 'skills'), { recursive: true, force: true });
  const empty = collectRules();
  ok(empty.length === 1 && empty[0].source === 'SKILL.md', 'falls back to SKILL.md alone');
}

console.log('budget truncation');
{
  mkdirSync(join(WS, '.nova', 'skills'), { recursive: true });
  writeFileSync(join(WS, 'SKILL.md'), 'x'.repeat(4000));
  writeFileSync(join(WS, '.nova', 'skills', 'big.md'), 'y'.repeat(5000));
  const rules = collectRules(WS, 3000);
  const totalLen = rules.reduce((n, r) => n + r.content.length, 0);
  ok(totalLen <= 3200, `budget respected (${totalLen})`);
  ok(rules.some((r) => r.truncated), 'truncation flagged');
}

console.log('system prompt integration');
{
  writeFileSync(join(WS, 'SKILL.md'), 'ALWAYS use tabs for indentation.');
  resetWorkspaceCache?.();
  const prompt = buildSystemPrompt({ profile: 'coder', rulesText: rulesToPrompt(collectRules()) });
  ok(prompt.includes('# PROJECT RULES') && prompt.includes('tabs for indentation'), 'rules injected into system prompt');
}

console.log('\nRULES TESTS PASSED');
process.exit(0);
