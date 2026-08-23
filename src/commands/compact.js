import { conversationTokens, estimateTokens } from '../context.js';

const KEEP_LAST = 12;
const FIRST_MSG_CAP = 500;
const PIN_TOOLS = new Set(['edit_file', 'write_file', 'patch_file']);

export function extractPinnedArtifacts(messages) {
  const files = [];
  for (const m of messages) {
    if (m.role === 'tool' && PIN_TOOLS.has(m.name ?? '')) {
      const first = String(m.content ?? '').split('\n')[0];
      if (first && !files.includes(first)) files.push(first);
    }
  }
  return files.slice(-12);
}

export function buildCompactionPayload({ messages, thresholdTokens = 6000, keepLast = KEEP_LAST }) {
  const total = conversationTokens(messages);
  if (total <= thresholdTokens) return null;
  if (messages.length <= keepLast + 2) return null;

  const cut = messages.length - keepLast;
  const oldSlice = messages.slice(0, cut);
  const tail = messages.slice(cut);

  const userMsgs = oldSlice.filter((m) => m.role === 'user');
  const original = userMsgs[0]
    ? String(userMsgs[0].content ?? '').slice(0, FIRST_MSG_CAP)
    : '';
  const pinnedFiles = extractPinnedArtifacts(oldSlice);
  const transcript = oldSlice
    .map((m) => {
      const body =
        typeof m.content === 'string' ? m.content : JSON.stringify(m.content ?? '');
      return `${m.role}: ${body.slice(0, 400)}`;
    })
    .join('\n')
    .slice(0, 24000);

  return {
    oldSlice,
    tail,
    removedCount: oldSlice.length,
    removedTokens: total - conversationTokens(tail),
    prompt: [
      'Summarize this coding-agent conversation for a successor agent.',
      'Preserve: (1) the original goal, (2) key decisions and constraints,',
      '(3) files changed and what changed in each, (4) current state, (5) next steps.',
      'Be under 300 words. Plain text.',
      '',
      original ? `ORIGINAL TASK: ${original}` : '',
      pinnedFiles.length ? `FILES TOUCHED:\n${pinnedFiles.map((f) => '- ' + f).join('\n')}` : '',
      'CONVERSATION:',
      transcript,
    ]
      .filter(Boolean)
      .join('\n'),
  };
}

export function applyCompaction(messages, payload, summaryText) {
  if (!payload || !summaryText) return messages;
  const summaryMsg = {
    role: 'assistant',
    content: `[compacted summary of ${payload.removedCount} earlier messages]\n${summaryText}`,
    compacted: true,
  };
  return [summaryMsg, ...payload.tail];
}

export async function compactSession({ session, summarize, thresholdTokens = 6000 }) {
  const payload = buildCompactionPayload({
    messages: session.messages,
    thresholdTokens,
  });
  if (!payload) return { changed: false, reason: 'nothing to compact' };
  const summaryText = await summarize(payload.prompt);
  const before = session.messages.length;
  session.messages = applyCompaction(session.messages, payload, summaryText);
  session.save?.();
  return {
    changed: true,
    removedMessages: before - session.messages.length,
    removedTokens: payload.removedTokens,
    summaryTokens: estimateTokens(summaryText),
    pinnedFiles: extractPinnedArtifacts(payload.oldSlice).length,
  };
}
