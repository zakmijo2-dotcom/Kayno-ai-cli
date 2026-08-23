import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const TOTAL_BUDGET = 6000;

const PRIORITY_FILES = ['AGENT.md', 'SKILL.md'];

export function collectRules(cwd = process.cwd(), budget = TOTAL_BUDGET) {
  const found = [];

  for (const name of PRIORITY_FILES) {
    const p = join(cwd, name);
    if (existsSync(p)) {
      found.push({ path: p, source: name, priority: found.length });
      break;
    }
  }

  const skillsDir = join(cwd, '.mij', 'skills');
  if (existsSync(skillsDir)) {
    try {
      for (const f of readdirSync(skillsDir).filter((f2) => f2.endsWith('.md')).sort()) {
        found.push({ path: join(skillsDir, f), source: `.mij/skills/${f}`, priority: 50 + found.length });
      }
    } catch {}
  }

  const copilot = join(cwd, '.github', 'copilot-instructions.md');
  if (existsSync(copilot)) {
    found.push({ path: copilot, source: '.github/copilot-instructions.md', priority: 90 });
  }

  let remaining = budget;
  const rules = [];
  for (const entry of found) {
    if (remaining <= 0) break;
    let content = '';
    try {
      content = readFileSync(entry.path, 'utf8').trim();
    } catch {
      continue;
    }
    if (!content) continue;
    const capped =
      content.length > remaining ? content.slice(0, Math.max(0, remaining - 20)) + '\n…[truncated]' : content;
    remaining -= capped.length + 1;
    rules.push({ ...entry, content: capped, truncated: content.length > capped.length });
  }
  return rules;
}

export function rulesToPrompt(rules) {
  if (!rules.length) return '';
  return rules
    .map((r) => `<!-- ${r.source}${r.truncated ? ' (truncated)' : ''} -->\n${r.content}`)
    .join('\n\n');
}
