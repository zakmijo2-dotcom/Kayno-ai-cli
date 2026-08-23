import assert from 'node:assert';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';

const HOME = '/tmp/kayno-skills-test';
rmSync(HOME, { recursive: true, force: true });
process.env.NOVA_HOME = HOME;
mkdirSync(`${HOME}/skills/low`, { recursive: true });

mkdirSync('/tmp/kayno-skills-proj/.nova/skills/high-pri', { recursive: true });
process.chdir('/tmp/kayno-skills-proj');

writeFileSync(
  `${HOME}/skills/low/SKILL.md`,
  '---\nname: low\ndescription: matches alpha keyword\ntriggers: [alpha]\npriority: 1\n---\nlow body'
);
writeFileSync(
  '/tmp/kayno-skills-proj/.nova/skills/high-pri/SKILL.md',
  '---\nname: high\ndescription: also matches alpha\ntriggers: [alpha]\npriority: 9\n---\nhigh body'
);
mkdirSync(`${HOME}/skills/broken`, { recursive: true });
writeFileSync(
  `${HOME}/skills/broken/SKILL.md`,
  '---\nname: broken\n---\n'
);

const { discoverSkills, matchSkills } = await import('../src/skills/index.js');
const skills = discoverSkills();

let passed = 0;
function ok(cond, label) {
  if (!cond) throw new Error(`FAIL: ${label}`);
  passed++;
  console.log(`  ✓ ${label}`);
}

ok(skills.some((s) => s.name === 'high' && s.scope === 'project'), 'project + global discovered');
ok(skills.find((s) => s.name === 'low').priority === 1, 'priority parsed from frontmatter');

const matched = matchSkills('please handle the alpha task', skills, 2);
ok(matched[0].name === 'high', `higher priority wins (got ${matched.map((m) => m.name)})`);

const none = matchSkills('nothing relevant here xyzzy', skills.filter((s) => s.name !== 'broken'), 2);
ok(none.length === 0, 'no false activation');

console.log('\nSKILLS TESTS PASSED');
process.exit(0);
