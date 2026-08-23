import assert from 'node:assert';
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';

const WS = '/tmp/kayno-p6-ws';
rmSync(WS, { recursive: true, force: true });
mkdirSync(WS, { recursive: true });
process.env.NOVA_HOME = WS;
writeFileSync(WS + '/config.json', JSON.stringify({ workspace: { root: WS } }));
const { resetWorkspaceCache } = await import('../src/workspace.js');
resetWorkspaceCache();

let passed = 0;
function ok(cond, label) {
  if (!cond) throw new Error(`FAIL: ${label}`);
  passed++;
  console.log(`  ✓ ${label}`);
}

console.log('unified diff');
{
  const { unifiedDiff } = await import('../src/diff.js');
  const d = unifiedDiff('a\nb\nc\n', 'a\nX\nc\n', 1, 'f.txt');
  ok(d.includes('-b') && d.includes('+X') && d.includes('@@'), 'basic diff hunks');
  const same = unifiedDiff('same\n', 'same\n', 3, 'f');
  ok(same === '', 'identical → empty diff');
}

console.log('tool previews');
{
  const { buildToolPreview } = await import('../src/tools.js');
  const p1 = buildToolPreview('write_file', { path: 'newfile.js', content: 'hello\nworld' });
  ok(p1.title.includes('Create newfile.js') && p1.diffText.includes('+hello'), 'create preview shows additions');

  writeFileSync(WS + '/existing.txt', 'old content\n');
  const p2 = buildToolPreview('write_file', { path: 'existing.txt', content: 'new content\n' });
  ok(p2.title.includes('Overwrite existing.txt') && p2.diffText.includes('-old content') && p2.diffText.includes('+new content'), 'overwrite preview shows both sides');

  const p3 = buildToolPreview('edit_file', { path: 'x.js', old_string: 'foo()', new_string: 'bar()' });
  ok(p3.diffText.includes('-foo()') && p3.diffText.includes('+bar()'), 'edit preview diff');

  const p4 = buildToolPreview('run_command', { command: 'rm -rf /' });
  ok(p4.dangerous === true && p4.title.toLowerCase().includes('destructive'), 'dangerous shell flagged');
}

console.log('@image attachments');
{
  const { parseAttachments, buildVisionContent } = await import('../src/attachments.js');
  const pngB64 = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
  writeFileSync(WS + '/pic.png', pngB64);

  const r1 = parseAttachments('describe @pic.png please', { visionSupported: true });
  ok(r1.images.length === 1 && r1.images[0].mime === 'image/png', 'image attached with mime');
  ok(r1.clean === 'describe please', `input cleaned (${r1.clean})`);

  const b64 = Buffer.from(pngB64).toString('base64');
  const content = buildVisionContent('what is this?', [{ mime: 'image/png', b64 }]);
  ok(Array.isArray(content) && content[1].image_url.url.includes(b64), 'vision payload built');

  const noVision = parseAttachments('look @pic.png', { visionSupported: false });
  ok(noVision.images.length === 0 && noVision.errors[0].includes('does not support vision'), 'vision gating message');

  let escaped = false;
  try {
    parseAttachments('steal @../../etc/passwd', { visionSupported: true });
  } catch (e) {
    escaped = true;
    void e;
  }
  const r2 = parseAttachments('steal @../../etc/passwd', { visionSupported: true });
  ok(r2.images.length === 0 || escaped, 'sandbox blocks path traversal attachments');
}

console.log('/export + /share');
{
  const { exportTranscript } = await import('../src/tui/export.js');
  process.chdir(WS);
  const fakeSession = {
    id: 's1',
    title: 'demo',
    messages: [
      { role: 'user', content: 'hello world' },
      { role: 'assistant', content: '**hi** there' },
      { role: 'tool', name: 'read_file', content: 'data' },
    ],
  };
  const out = exportTranscript(fakeSession);
  ok(existsSync(out), 'export file created in workspace');
  const md = readFileSync(out, 'utf8');
  ok(md.includes('# Kayno session — demo') && md.includes('**User**') && md.includes('hello world'), 'markdown structure');
  ok(md.includes('<details>'), 'tool output collapsed');
}

console.log('\nPHASE6 TESTS PASSED');
process.exit(0);
