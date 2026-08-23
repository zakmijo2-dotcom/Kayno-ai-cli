import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolveInWorkspace } from '../workspace.js';

export function exportTranscript(session, fileName) {
  const name = String(fileName ?? '').trim() || `kayno-chat-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.md`;
  const lines = [`# Kayno session — ${session.title || session.id}`, '', `_Exported ${new Date().toLocaleString()}_`, ''];
  for (const m of session.messages) {
    if (m.role === 'tool') {
      lines.push(`<details><summary>tool: ${m.name ?? ''}</summary>`, '', '```', String(m.content ?? '').slice(0, 4000), '```', '</details>', '');
      continue;
    }
    const body = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
    lines.push(`**${m.role === 'user' ? 'User' : m.role === 'assistant' ? 'Kayno' : m.role}**`, '', body, '');
  }
  const abs = resolveInWorkspace(name, { createOk: true });
  writeFileSync(abs, lines.join('\n') + '\n');
  return abs;
}
