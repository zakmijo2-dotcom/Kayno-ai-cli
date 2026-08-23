import { c, sym, visibleWidth, truncateVisible } from './ansi.js';

export function toolMeta(name) {
  const meta = {
    read_file: { label: 'Read file', verb: 'read' },
    write_file: { label: 'Write file', verb: 'write' },
    edit_file: { label: 'Edit file', verb: 'edit' },
    patch_file: { label: 'Patch file', verb: 'patch' },
    grep: { label: 'Search', verb: 'search' },
    glob: { label: 'Find files', verb: 'find' },
    list_dir: { label: 'List directory', verb: 'scan' },
    run_command: { label: 'Run command', verb: 'run' },
    fetch_url: { label: 'Fetch URL', verb: 'fetch' },
    git_status: { label: 'Git status', verb: 'git' },
    git_diff: { label: 'Git diff', verb: 'git' },
  };
  return (
    meta[name] || { label: name.replace(/_/g, ' '), verb: 'run' }
  );
}

export function argSummary(name, args = {}) {
  switch (name) {
    case 'read_file':
    case 'write_file':
    case 'edit_file':
    case 'patch_file':
      return args.path ?? '';
    case 'list_dir':
      return args.path || '.';
    case 'grep':
      return '/' + String(args.pattern ?? '') + '/';
    case 'glob':
      return args.pattern ?? '';
    case 'run_command':
      return args.command ?? '';
    case 'fetch_url':
      return args.url ?? '';
    case 'git_status':
    case 'git_diff':
      return '';
    default:
      try {
        const s = JSON.stringify(args);
        return s.length > 60 ? s.slice(0, 57) + sym('ellipsis') : s;
      } catch {
        return '';
      }
  }
}

export function formatToolLine({ name, args, status, detail }) {
  const meta = toolMeta(name);
  const icon =
    status === 'running'
      ? c.cyan(sym('dot'))
      : status === 'error'
        ? c.red(sym('cross'))
        : c.green(sym('check'));
  const title = `${c.bold(sym('diamond'))} ${meta.label}`;
  const target = c.dim(truncateVisible(argSummary(name, args), 80));
  const head = `  ${title}`;
  const lines = [];
  if (target) lines.push(head + ' ' + target);
  else lines.push(head);
  lines.push(`    ${icon} ${detail ?? ''}`);
  return lines;
}

export function formatUserBlock(text) {
  return [`${c.bold(c.blue('You'))}`, ...wrapPrefixed(text, `${c.dim(sym('bullet'))} `, 2)];
}

export function formatAssistantHeader() {
  return `${c.bold(c.magenta('Kayno'))}`;
}

function wrapPrefixed(text, prefix, indent) {
  const out = [];
  let first = true;
  for (const line of String(text).split('\n')) {
    out.push((first ? prefix : ' '.repeat(indent)) + line);
    first = false;
  }
  return out;
}

export function formatStatusSegments({ cwdShort, providerName, model, profile, toolsOn, sessionTitle, usageText, branch }) {
  const segs = [
    c.gray(branch ? `${cwdShort} (${branch})` : cwdShort),
    c.cyan(providerName),
    model ? c.white(model) : '',
    c.yellow(profile),
    c.dim(`tools:${toolsOn ? 'on' : 'off'}`),
  ];
  if (sessionTitle && sessionTitle !== 'new') segs.push(c.green(sessionTitle));
  if (usageText) segs.push(c.gray(usageText));
  return segs.filter(Boolean).join(` ${c.gray(sym('sep'))} `);
}
