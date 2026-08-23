export const COMMANDS = [
  { cmd: '/help', desc: 'show commands and shortcuts', aliases: ['/?'] },
  { cmd: '/new', desc: 'start a fresh session', aliases: [] },
  { cmd: '/clear', desc: 'clear current conversation view/history', aliases: [] },
  { cmd: '/history', desc: 'dump raw conversation history', aliases: [] },
  { cmd: '/save <title>', desc: 'persist session with a title', aliases: [] },
  { cmd: '/sessions', desc: 'browse saved sessions (selector)', aliases: ['/sess'] },
  { cmd: '/session <id>', desc: 'resume a saved session', aliases: [] },
  { cmd: '/model [id]', desc: 'pick model (selector when no arg)', aliases: ['/m'] },
  { cmd: '/provider [id]', desc: 'switch provider (selector when no arg)', aliases: ['/p'] },
  { cmd: '/system [query]', desc: 'preview assembled system prompt', aliases: ['/sys'] },
  { cmd: '/skills', desc: 'list discovered skills', aliases: [] },
  { cmd: '/reload', desc: 'reload plugins', aliases: [] },
  { cmd: '/mcp', desc: 'connect MCP servers from mcp.json', aliases: [] },
  { cmd: '/compact [threshold]', desc: 'summarize old turns to free context', aliases: [] },
  { cmd: '/tokens', desc: 'token usage per session', aliases: ['/tok'] },
  { cmd: '/cost', desc: 'estimated session cost', aliases: [] },
  { cmd: '/undo', desc: 'revert last file changes (checkpoint)', aliases: ['Ctrl+Z'] },
  { cmd: '/redo', desc: 're-apply undone changes', aliases: ['Ctrl+R'] },
  { cmd: '/diff', desc: 'working-tree diff (git)', aliases: [] },
  { cmd: '/export [file]', desc: 'export chat to markdown file', aliases: [] },
  { cmd: '/share [file]', desc: 'export + print transcript snapshot', aliases: [] },
  { cmd: '/image @path', desc: 'attach image in message (@photo.png)', aliases: [] },
  { cmd: '/exit', desc: 'quit', aliases: ['/quit', '/q'] },
];

export function commandItems() {
  return COMMANDS.map((c) => ({
    label: c.cmd,
    hint: c.desc,
    keywords: c.aliases,
    value: c.cmd,
  }));
}

export function filterCommands(query) {
  const q = String(query ?? '').toLowerCase().trim();
  if (!q.startsWith('/')) return [];
  if (q === '/') return commandItems();
  const base = q.split(/\s+/)[0];
  const items = commandItems();
  const matched = items.filter(
    (it) =>
      it.label.toLowerCase().startsWith(base) ||
      it.keywords.some((k) => k.startsWith(base))
  );
  return matched;
}

export function resolveCommandAlias(cmd) {
  const base = String(cmd).trim().split(/\s+/)[0].toLowerCase();
  for (const c of COMMANDS) {
    if (c.cmd.split(/\s+/)[0] === base || c.aliases.includes(base)) return c.cmd.split(/\s+/)[0];
  }
  return cmd;
}
