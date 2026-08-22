import { createInterface } from 'node:readline/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { c, truncate } from './util.js';
import { loadConfig, setConfigValue, getConfigValue, paths } from './config.js';
import {
  allProviders,
  getProvider,
  searchProviders,
  syncFromModelsDev,
  resolveApiKey,
  PRESETS,
} from './providers/catalog.js';
import { loadAuth, getToken, setToken, maskSecret } from './auth/store.js';
import { oauthLogin } from './auth/google.js';
import { antigravityImportToken } from './auth/antigravity.js';
import { Session } from './session.js';
import { runTurn, runPluginCommand, resetPlugins } from './engine.js';
import { discoverSkills } from './skills/index.js';
import { loadPlugins } from './plugins/index.js';

const VERSION = '0.1.0';

export async function main(argv) {
  const [cmd, ...rest] = argv;
  switch (cmd || 'chat') {
    case 'chat':
      return cmdChat(rest);
    case 'ask':
      return cmdAsk(rest);
    case 'providers':
      return cmdProviders(rest);
    case 'models':
      return cmdModels(rest);
    case 'auth':
      return cmdAuth(rest);
    case 'skills':
      return cmdSkills(rest);
    case 'plugins':
      return cmdPlugins(rest);
    case 'config':
      return cmdConfig(rest);
    case 'sessions':
      return cmdSessions(rest);
    case '--version':
    case '-v':
    case 'version':
      console.log(`mij ${VERSION}`);
      return 0;
    case 'help':
    case '--help':
    case '-h':
      printHelp();
      return 0;
    default:
      console.error(`Unknown command: ${cmd}. Try mij help`);
      return 1;
  }
}

function parseFlags(args) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '-p' || a === '--provider') flags.provider = args[++i];
    else if (a === '-m' || a === '--model') flags.model = args[++i];
    else if (a === '-t' || a === '--temperature') flags.temperature = Number(args[++i]);
    else if (a === '--yolo' || a === '-y') flags.yolo = true;
    else if (a === '--no-tools') flags.tools = false;
    else if (a === '--no-stream') flags.stream = false;
    else if (a === '--profile') flags.profile = args[++i];
    else if (a === '-s' || a === '--system') flags.systemOverride = args[++i];
    else if (a === '-c' || a === '--continue') flags.continueLast = true;
    else positional.push(a);
  }
  return { flags, positional };
}

async function resolveTarget(flags) {
  const base = loadConfig();
  const providerId = flags.provider || base.provider;
  let provider = getProvider(providerId);
  if (!provider) throw new Error(`Unknown provider "${providerId}". See: mij providers list`);
  if (base.providers?.[providerId]?.baseUrl && !provider.baseUrl) {
    provider = { ...provider, baseUrl: base.providers[providerId].baseUrl };
  }
  const model =
    flags.model ||
    base.providers?.[providerId]?.model ||
    base.model ||
    provider.defaultModel ||
    '';
  const cfg = {
    ...base,
    temperature: flags.temperature ?? base.temperature,
    yolo: flags.yolo ?? base.yolo,
    tools: flags.tools ?? base.tools,
    stream: flags.stream ?? base.stream,
    profile: flags.profile ?? base.profile,
    systemOverride: flags.systemOverride ?? base.systemOverride,
  };
  return { cfg, provider, model };
}

function requireModel(model) {
  if (!model) throw new Error('No model configured. Use -m <model> or: mij config set model <name>');
  return model;
}

async function cmdChat(args) {
  const { flags, positional } = parseFlags(args);
  const { cfg, provider, model: initialModel } = await resolveTarget(flags);
  requireModel(initialModel);
  const session = new Session();
  const state = { cfg, provider, model: initialModel, session };

  banner(cfg, provider, state.model);
  if (!cfg.yolo && !provider.noKeyNeeded) checkKeyHint(provider);

  const queue = [];
  let waiter = null;
  let closed = false;
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: process.stdout.isTTY });
  rl.on('line', (l) => {
    if (waiter) {
      const w = waiter;
      waiter = null;
      w(l);
    } else queue.push(l);
  });
  rl.on('close', () => {
    closed = true;
    if (waiter) {
      const w = waiter;
      waiter = null;
      w(null);
    }
  });
  const nextLine = () =>
    queue.length
      ? Promise.resolve(queue.shift())
      : closed
        ? Promise.resolve(null)
        : new Promise((res) => {
            waiter = res;
          });
  state.ask = async (q) => {
    process.stdout.write(q);
    const ans = await nextLine();
    const v = String(ans ?? '').trim().toLowerCase();
    return v === 'y' || v === 'yes';
  };

  repl: while (true) {
    process.stdout.write(c.cyan('mij❯ '));
    let line = await nextLine();
    if (line === null || line === undefined) break repl;
    line = String(line).trim();
    if (!line) continue;
    if (line === '/exit' || line === '/quit' || line.toLowerCase() === 'exit') break;
    if (line.startsWith('/')) {
      const handled = await slashCommand(line, { state });
      if (handled === 'EXIT') break repl;
      if (handled) continue;
    }
    try {
      process.stdout.write('\n');
      await runTurn({
        session,
        input: line,
        cfg: state.cfg,
        provider: state.provider,
        model: state.model,
        ask: state.ask,
      });
      console.log('\n');
      session.save();
    } catch (err) {
      console.error(`${c.red('error:')} ${err.message}\n`);
    }
  }
  session.save();
  rl.close();
  return 0;
}

async function cmdAsk(args) {
  const { flags, positional } = parseFlags(args);
  const prompt = positional.join(' ').trim();
  if (!prompt) {
    console.error('usage: mij ask "your question" [-p provider] [-m model]');
    return 1;
  }
  const { cfg, provider, model } = await resolveTarget(flags);
  requireModel(model);
  const session = new Session();
  if (!flags.yolo && !process.stdin.isTTY) {
    let piped = '';
    for await (const chunk of process.stdin) piped += chunk;
    if (piped.trim()) {
      await runTurn({
        session,
        input: `${piped.slice(0, 100000)}\n\n${prompt}`,
        cfg: { ...cfg, yolo: true },
        provider,
        model,
        quiet: false,
      });
      return 0;
    }
  }
  await runTurn({ session, input: prompt, cfg, provider, model });
  console.log('');
  return 0;
}

async function slashCommand(line, ctxx) {
  const { state } = ctxx;
  const { cfg, provider, model, session } = state;
  const [cmdRaw, ...rest] = line.split(/\s+/);
  const cmd = cmdRaw.toLowerCase();

  if (await runPluginCommand(cmd)) return true;

  switch (cmd) {
    case '/help':
      printReplHelp();
      return true;    case '/new': {
      Object.assign(session, new Session());
      console.log(c.dim('started fresh session'));
      return true;
    }
    case '/clear':
      session.messages = [];
      console.log(c.dim('history cleared'));
      return true;
    case '/history':
      console.log(
        session.messages
          .map((m) => `${c.bold(m.role)}: ${truncate(typeof m.content === 'string' ? m.content : JSON.stringify(m.content), 200)}`)
          .join('\n')
      );
      return true;
    case '/save': {
      session.title = rest.join(' ') || session.title;
      session.save();
      console.log(c.green(`saved session ${session.id}`));
      return true;
    }
    case '/model': {
      if (!rest[0]) {
        console.log(`provider=${state.provider.id} model=${state.model}`);
        return true;
      }
      state.cfg.model = rest[0];
      state.model = rest[0];
      console.log(c.green(`model → ${rest[0]} (session)`), c.dim('(persist with: mij config set model ...)'));
      return true;
    }
    case '/provider': {
      const p = getProvider(rest[0]);
      if (!p) {
        console.log(c.yellow(`unknown provider ${rest[0]}`));
        return true;
      }
      state.provider = p;
      if (p.defaultModel && !state.model) state.model = p.defaultModel;
      console.log(c.green(`provider → ${p.name}`));
      return true;
    }
    case '/system': {
      const { buildSystemPrompt } = await import('./prompts/system.js');
      const { discoverSkills, matchSkills } = await import('./skills/index.js');
      const active = matchSkills(rest.join(' ') || '(preview)', discoverSkills(), 3);
      console.log(buildSystemPrompt({ profile: cfg.profile, skills: active, systemOverride: cfg.systemOverride }));
      return true;
    }
    case '/skills': {
      const skills = discoverSkills();
      console.log(skills.map((s) => `${c.cyan(s.name)} ${c.dim(`[${s.scope}]`)} — ${s.description}`).join('\n'));
      return true;
    }
    case '/reload':
      resetPlugins();
      await loadPlugins();
      console.log(c.green('plugins reloaded'));
      return true;
    case '/exit':
      return 'EXIT';
    default:
      console.log(c.yellow(`unknown command ${cmd} (/help)`));
      return true;
  }
}

function banner(cfg, provider, model) {
  console.log(`${c.bold(c.magenta('⚡ MIJ'))} ${c.dim(VERSION)} — ${provider.name} / ${c.bold(model)}`);
  console.log(c.dim(`tools=${cfg.tools !== false ? 'on' : 'off'} yolo=${!!cfg.yolo} profile=${cfg.profile} · /help for commands · /exit to quit\n`));
}

function printReplHelp() {
  console.log(`/help /new /clear /history /save <title> /model <m> /provider <id> /system <query> /skills /reload /exit`);
}

function checkKeyHint(provider) {
  const key = resolveApiKey(provider);
  const stored = getToken(provider.id)?.apiKey;
  if (!key && !stored) {
    console.log(
      c.yellow(`⚠ no API key for ${provider.id}. Fix with:\n`) +
        c.dim(`   export ${provider.env}=<key>   OR   mij auth set-key ${provider.id}\n`)
    );
  }
}

async function cmdProviders(args) {
  const [sub, q] = args;
  if (sub === 'sync') {
    const n = await syncFromModelsDev();
    console.log(c.green(`synced ${n} providers from models.dev into cache`));
    return 0;
  }
  if (sub === 'search') {
    const results = searchProviders(q || '');
    printProviderTable(results);
    return 0;
  }
  if (sub === 'info') {
    const p = getProvider(q);
    if (!p) {
      console.error(`no provider "${q}"`);
      return 1;
    }
    console.log(JSON.stringify(p, null, 2));
    return 0;
  }
  const list = sub === '--all' ? allProviders() : PRESETS;
  printProviderTable(list);
  console.log(c.dim(`\n${PRESETS.length} builtin presets · ${allProviders().length} total after models.dev sync (mij providers sync)\n`));
  return 0;
}

function printProviderTable(list) {
  const cfg = loadConfig();
  for (const p of list) {
    const hasKey = p.oauth ? !!getToken(p.authKind || p.id) : !!(resolveApiKey(p) || p.noKeyNeeded);
    const mark = p.oauth ? 'oauth' : p.noKeyNeeded ? 'local' : hasKey ? c.green('ready') : c.yellow('needs key');
    const cur = cfg.provider === p.id ? c.bold(' *') : '';
    console.log(`${cur.padEnd(2)} ${c.cyan(p.id.padEnd(24))} ${mark.padEnd(16)} ${c.dim(p.name)}${p.defaultModel ? c.dim(' · ' + p.defaultModel) : ''}`);
  }
}

async function cmdModels(args) {
  const [, q] = args;
  console.log(c.dim('Tip: use the provider dashboard or `mij providers info <id>`; OpenAI-compatible providers accept any model id.\n'));
  const list = searchProviders(q || '');
  for (const p of list.slice(0, 30)) {
    if (p.defaultModel) console.log(`${c.cyan(p.id.padEnd(24))} ${p.defaultModel}`);
  }
  return 0;
}

async function cmdAuth(args) {
  const [sub, target, ...vals] = args;
  const flags = {};
  for (let i = 0; i < vals.length; i++) {
    if (vals[i] === '--access') flags.access = vals[++i];
    if (vals[i] === '--refresh') flags.refresh = vals[++i];
  }
  if (sub === 'login') {
    if (target === 'antigravity') {
      const email = await oauthLogin('antigravity').catch(async (e) => {
        console.error(c.red(e.message));
        return null;
      });
      if (email) console.log(c.green(`✓ logged in as ${email}`));
      return email ? 0 : 1;
    }
    const kind = target === 'gemini-oauth' || target === 'google-code-assist' ? 'google-oauth' : target || 'google-oauth';
    const email = await oauthLogin(kind);
    console.log(c.green(`✓ logged in as ${email || '(unknown email)'}`));
    return 0;
  }
  if (sub === 'logout') {
    setToken(target || 'google-oauth', null);
    console.log(`logged out ${target}`);
    return 0;
  }
  if (sub === 'set-key') {
    const [pid, key] = vals.length ? [target, vals[0]] : [null, target];
    if (!pid || !key) {
      console.error('usage: mij auth set-key <provider> <api-key>');
      return 1;
    }
    setToken(pid, { apiKey: key });
    console.log(c.green(`saved API key for ${pid}`));
    return 0;
  }
  if (sub === 'import') {
    await antigravityImportToken({ accessToken: flags.access, refreshToken: flags.refresh });
    console.log(c.green('imported antigravity tokens'));
    return 0;
  }
  const auth = loadAuth();
  console.log(c.bold('Stored credentials:'));
  for (const [k, v] of Object.entries(auth.tokens || {})) {
    console.log(`  ${c.cyan(k)}: ${maskSecret(v.apiKey || v.accessToken || '')}${v.email ? c.dim(` (${v.email})`) : ''}`);
  }
  return 0;
}

async function cmdSkills(args) {
  const [sub, name] = args;
  const skills = discoverSkills();
  if (sub === 'show') {
    const s = skills.find((x) => x.name.toLowerCase() === (name || '').toLowerCase());
    if (!s) {
      console.error('not found. mij skills list');
      return 1;
    }
    console.log(s.body);
    return 0;
  }
  console.log(c.bold(`${skills.length} skills discovered (global: ~/.nova/skills · project: ./.nova/skills):\n`));
  for (const s of skills) {
    console.log(`${c.cyan(s.name.padEnd(20))} ${s.triggers.length ? c.dim('triggers: ' + s.triggers.join(', ')) : ''}`);
    if (s.description) console.log(`${' '.repeat(22)}${c.dim(s.description.slice(0, 90))}`);
  }
  return 0;
}

async function cmdPlugins(args) {
  const reg = await loadPlugins();
  console.log(c.bold(`${reg.plugins.length} plugins loaded:\n`));
  for (const p of reg.plugins) {
    const cmds = [...Object.keys(p.commands || {})].join(', ');
    const hooks = ['beforeRequest', 'afterResponse', 'onDelta'].filter((h) => p[h]);
    console.log(`${c.cyan(p.name)} ${c.dim(p.version + ' [' + p.scope + ']')} — ${p.description || ''}`);
    if (cmds) console.log(`  commands: ${cmds}`);
    if (hooks.length) console.log(`  hooks: ${hooks.join(', ')}`);
  }
  console.log(c.dim('\nInstall: put a folder/file in ~/.nova/plugins/ or ./.nova/plugins/ exporting {name, setup(){...}}'));
  return 0;
}

async function cmdConfig(args) {
  const [sub, key, value] = args;
  if (sub === 'path') {
    console.log(paths().config);
    return 0;
  }
  if (sub === 'set') {
    if (!key || value === undefined) {
      console.error('usage: mij config set <dot.key> <value>');
      return 1;
    }
    setConfigValue(key, value);
    console.log(c.green(`${key} = ${value}`));
    return 0;
  }
  if (sub === 'get') {
    console.log(JSON.stringify(key ? getConfigValue(key) : loadConfig(), null, 2));
    return 0;
  }
  console.log(JSON.stringify(loadConfig(), null, 2));
  return 0;
}

async function cmdSessions(args) {
  const [sub, id] = args;
  const list = Session.list();
  if (sub === 'rm') return 0;
  console.log(list
    .slice(0, 25)
    .map((s) => `${c.dim(new Date(s.at).toLocaleString())}  ${c.cyan(s.id)}  turns=${s.turns}  ${s.title}`)
    .join('\n') || '(none yet)');
  return 0;
}

function printHelp() {
  console.log(`
${c.bold(c.magenta('NOVA'))} — multi-provider AI agent CLI (zero dependencies)

${c.bold('Usage')}
  mij chat [-p provider] [-m model] [--yolo] [--no-tools] [--profile coder|assistant|raw] [-s "system"]
  mij ask "question" [-p provider] [-m model]          one-shot mode (reads stdin too)
  mij providers [list|--all|search <q>|info <id>|sync] list/sync catalog (models.dev adds hundreds)
  mij models [search]
  mij auth login google | antigravity                  OAuth flows
  mij auth import antigravity --access T --refresh T   paste tokens captured elsewhere
  mij auth set-key <provider> <key>                    store API key
  mij auth status                                      show stored creds
  mij skills [list|show <name>]                        SKILL.md system
  mij plugins                                          extensions/plugins
  mij config [get|set <k> <v>|path]
  mij sessions                                         recent chats

${c.bold('Examples')}
  mij chat -p antigravity -m gemini-3-pro-preview
  mij chat -p google-code-assist -m gemini-2.5-pro     # OAuth like Gemini CLI
  mij ask -p openrouter -m anthropic/claude-sonnet-4.5 "explain this repo"
  cat file.py | mij ask -p deepseek -m deepseek-chat "review this"
`);
}
