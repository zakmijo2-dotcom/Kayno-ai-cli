import { createKeyDecoder, InputEditor, applyKeyToEditor } from './input.js';
import { Renderer, computeInputView } from './renderer.js';
import { createTerminalIO } from './terminal.js';
import { c, sym, stripAnsi, truncateVisible, visibleWidth } from './ansi.js';
import { commonPrefix } from './selectors.js';
import { relativeTime } from './selectors.js';
import { filterCommands, resolveCommandAlias, COMMANDS } from './keymap.js';
import { formatToolLine, formatStatusSegments, toolMeta, argSummary } from './components.js';
import { compactSession } from '../commands/compact.js';
import { extractUsage, estimateCost, formatCost } from '../context.js';
import { isGitRepo, currentBranch } from '../git.js';

const FLUSH_MS = 66;

export async function startTui({ cfg, provider, model, session, runTurn, deps }) {
  const io = createTerminalIO();
  const renderer = new Renderer({ out: process.stdout });
  const decoder = createKeyDecoder();
  const editor = new InputEditor();

  const S = {
    running: false,
    abort: null,
    exit: false,
    liveText: '',
    thinking: false,
    spinnerIndex: 0,
    overlay: null,
    overlayIndex: 0,
    statusFlash: '',
    usageText: '',
    curProvider: provider,
    curModel: model,
    pendingConfirm: null,
    stashedConfirm: null,
    lastUsage: null,
    lastCost: null,
  };

  let flushTimer = null;
  let spinnerTimer = null;
  let eofResolve = null;
  const eofPromise = new Promise((r) => (eofResolve = r));
  const catalogMod = await import('../providers/catalog.js');
  const modelsMod = await import('../providers/models.js');

  function scheduleRepaint() {
    if (flushTimer) return;
    flushTimer = setTimeout(() => {
      flushTimer = null;
      repaint();
    }, FLUSH_MS);
  }

  function startSpinner() {
    stopSpinner();
    spinnerTimer = setInterval(() => {
      S.spinnerIndex = (S.spinnerIndex + 1) % 12;
      if (S.running) repaint();
    }, 90);
  }
  function stopSpinner() {
    if (spinnerTimer) clearInterval(spinnerTimer);
    spinnerTimer = null;
  }

  function shortCwd() {
    const cwd = process.cwd();
    const home = process.env.HOME || '';
    return home && cwd.startsWith(home) ? '~' + cwd.slice(home.length) : cwd;
  }

  let gitBranch = null;
  try {
    if (isGitRepo()) gitBranch = currentBranch();
  } catch {}

  function usageSegment() {
    const t = session.usageTotals?.();
    if (!t || (!t.input && !t.output)) return '';
    const cost = S.lastCost != null ? S.lastCost : null;
    return `in:${t.input} out:${t.output}${t.cached ? ` cached:${t.cached}` : ''}${cost != null ? ' · ' + formatCost(cost) : ''}`;
  }

  function statusLine() {
    const base = formatStatusSegments({
      cwdShort: shortCwd(),
      providerName: S.curProvider.name,
      model: S.curModel,
      profile: cfg.profile,
      toolsOn: cfg.tools !== false,
      sessionTitle: session.title,
      usageText: S.usageText,
      branch: gitBranch,
    });
    return S.statusFlash ? `${c.yellow(S.statusFlash)} ${base}` : base;
  }

  function overlayLines() {
    const o = S.overlay;
    if (!o) return null;
    const lines = [c.gray(sym('horiz').repeat(Math.max(10, renderer.width - 1)))];
    if (!o.items.length) lines.push(c.gray(` ${sym('bullet')} no matches`));
    o.items.slice(0, 9).forEach((item, i) => {
      const sel = i === S.overlayIndex;
      const pointer = sel ? c.cyan(sym('pointer')) : ' ';
      const label = sel ? c.bold(item.label) : item.label;
      const hintW = item.hint ? visibleWidth(item.hint) : 0;
      const maxLabel = Math.max(8, renderer.width - hintW - 10);
      const shownLabel = truncateVisible(stripAnsi(label), maxLabel);
      const padLen = Math.max(2, renderer.width - visibleWidth(shownLabel) - hintW - 6);
      lines.push(` ${pointer} ${shownLabel}${item.hint ? ' '.repeat(padLen) + c.dim(item.hint) : ''}`);
    });
    lines.push(c.gray(sym('horiz').repeat(Math.max(10, renderer.width - 1))));
    return lines;
  }

  function repaint() {
    const inputView = computeInputView(editor, renderer.width, 5);
    const showLive = S.streaming || S.liveText || S.thinking;
    renderer.repaint({
      live: showLive ? { thinking: S.thinking && !S.liveText, text: S.liveText } : null,
      chrome: {
        statusText: statusLine(),
        inputView,
        overlayLines: overlayLines(),
        overlayOpen: !!S.overlay,
      },
    });
  }

  function commitTranscript(text) {
    renderer.printTranscript(text);
    repaint();
  }

  function sysLine(text) {
    commitTranscript(c.gray(`${sym('diamond')} ${text}`));
  }

  function humanSize(n) {
    if (n == null) return '';
    if (n < 1024) return `${n} B`;
    if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / 1048576).toFixed(1)} MB`;
  }

  function errorToCard(err) {
    const msg = String(err?.message ?? err);
    if (/aborted|AbortError|This operation was aborted/i.test(msg)) {
      return [c.yellow(`${sym('warn')} cancelled`)];
    }
    let title = 'Provider error';
    const hints = [];
    const pid = S.curProvider?.id ?? provider.id;
    if (err?.status === 401 || /\b401\b|unauthorized|invalid[ _]api[ _]key/i.test(msg)) {
      title = 'Auth error';
      hints.push('mij auth status');
      hints.push(`mij auth set-key ${pid} <key>`);
    } else if (err?.status === 404 || /\b404\b/.test(msg)) {
      title = 'Not found';
      hints.push('check model id (/model)');
    } else if (/ENOTFOUND|ECONNREFUSED|fetch failed|EAI_AGAIN/i.test(msg)) {
      title = 'Network error';
      hints.push('check connection or provider baseUrl');
    }
    return [
      `${c.red(sym('cross'))} ${c.bold(title)}`,
      ...msg.split('\n').slice(0, 5).map((l) => `  ${c.gray(truncateVisible(l, Math.max(40, renderer.width - 6)))}`),
      ...hints.map((h) => `  ${c.cyan(sym('bullet'))} ${h}`),
    ];
  }

  function makeAsk() {
    return (_question) =>
      new Promise((resolve) => {
        if (S.stashedConfirm !== null) {
          const pre = S.stashedConfirm;
          S.stashedConfirm = null;
          resolve(pre);
          return;
        }
        S.pendingConfirm = { resolve };
      });
  }

  async function executeTurn(input) {
    S.running = true;
    S.abort = new AbortController();
    S.liveText = '';
    S.thinking = false;
    S.usageText = '';
    startSpinner();
    let assistantBuf = '';

    try {
      await runTurn({
        session,
        input,
        cfg,
        provider: S.curProvider,
        model: S.curModel,
        signal: S.abort.signal,
        ask: cfg.yolo ? null : makeAsk(),
        emit: (evt) => handleEngineEvent(evt, (v) => (assistantBuf = v), () => assistantBuf),
      });
      if (assistantBuf.trim()) commitTranscript(assistantBuf.replace(/^\n+/, ''));
    } catch (err) {
      const abortedTurn = /aborted|AbortError|operation was aborted/i.test(String(err?.message ?? err));
      if (abortedTurn && assistantBuf.trim()) {
        commitTranscript(assistantBuf.replace(/^\n+/, '') + '\n');
        assistantBuf = '';
        S.liveText = '';
      }
      commitTranscript(errorToCard(err).join('\n'));
    } finally {
      S.running = false;
      S.streaming = false;
      S.thinking = false;
      S.liveText = '';
      S.statusFlash = '';
      S.cancelRequested = false;
      S.stashedConfirm = null;
      stopSpinner();
      S.abort = null;
      try { session.save(); } catch {}
      repaint();
    }
  }

  function handleEngineEvent(evt, setBuf, getBuf) {
    switch (evt.type) {
      case 'turn_start':
        S.streaming = true;
        break;
      case 'confirmation_required': {
        const meta = toolMeta(evt.name);
        const target = argSummary(evt.name, evt.args ?? {});
        commitTranscript(
          [
            `  ${c.bold(sym('diamond'))} ${c.bold(meta.label)}`,
            target ? `  ${c.cyan(truncateVisible(target, Math.max(40, renderer.width - 6)))}` : '',
            `  ${c.yellow('Allow this operation?')} ${c.dim('[y/N]')}`,
          ]
            .filter(Boolean)
            .join('\n')
        );
        break;
      }
      case 'thinking_start':
        S.thinking = true;
        scheduleRepaint();
        break;
      case 'thinking_end':
        S.thinking = false;
        break;
      case 'text_delta':
        setBuf(getBuf() + evt.text);
        S.liveText = getBuf();
        S.thinking = false;
        scheduleRepaint();
        break;
      case 'tool_start':
        if (getBuf().trim()) {
          commitTranscript(getBuf().replace(/^\n+/, ''));
          setBuf('');
          S.liveText = '';
        }
        commitTranscript(
          formatToolLine({
            name: evt.name,
            args: evt.args ?? {},
            status: 'running',
            detail: `${c.cyan(sym('dot'))} running${sym('ellipsis')}`,
          }).join('\n')
        );
        break;
      case 'tool_complete': {
        const dur = evt.durationMs != null ? ` · ${(evt.durationMs / 1000).toFixed(2)}s` : '';
        const detail =
          evt.name === 'run_command'
            ? c.green(`${sym('check')} exit ${evt.exitCode ?? 0}${dur}`)
            : c.green(`${sym('check')} ${humanSize(evt.summaryLen)}${dur}`);
        commitTranscript(
          formatToolLine({ name: evt.name, args: evt.args ?? {}, status: 'done', detail }).join('\n')
        );
        break;
      }
      case 'tool_error':
        commitTranscript(
          formatToolLine({
            name: evt.name,
            args: evt.args ?? {},
            status: 'error',
            detail: c.red(`${sym('cross')} ${truncateVisible(evt.message ?? 'failed', 80)}`),
          }).join('\n')
        );
        break;
      case 'status':
        if (evt.text) S.statusFlash = evt.text;
        break;
      case 'turn_complete': {
        void evt;
        break;
      }
      case 'turn_complete': {
        if (evt.aborted) {
          sysLine('turn cancelled');
          break;
        }
        if (evt.note) {
          S.statusFlash = evt.note;
          setTimeout(() => {
            S.statusFlash = '';
            repaint();
          }, 4000);
        }
        if (evt.usage) {
          S.lastUsage = evt.usage;
          S.lastCost = evt.cost;
        }
        repaint();
        break;
      }
      default:
        break;
    }
  }

  function openOverlay(kind, items, onSelect) {
    S.overlay = { kind, items, onSelect };
    S.overlayIndex = 0;
    repaint();
  }
  function closeOverlay() {
    S.overlay = null;
    S.overlayIndex = 0;
  }
  function clampIdx(i, len) {
    return len === 0 ? 0 : Math.max(0, Math.min(i, len - 1));
  }

  async function activateOverlayItem() {
    const o = S.overlay;
    if (!o) return;
    const item = o.items[S.overlayIndex];
    if (!item) return;
    closeOverlay();
    if (o.kind === 'commands') {
      const baseCmd = item.label.split(/\s+/)[0];
      if (/<.*>/.test(item.label)) {
        editor.setText(baseCmd + ' ');
        repaint();
        return;
      }
      editor.setText('');
      await onSubmit(baseCmd);
      return;
    }
    if (o.onSelect) await o.onSelect(item);
    repaint();
  }

  function setModel(m) {
    S.curModel = m;
    cfg.model = m;
    sysLine(`model → ${m}`);
    repaint();
  }

  async function showModelSelector() {
    const ids = catalogMod.providerModelIds(S.curProvider.id);
    const items = [];
    for (const m of ids) {
      items.push({ label: m, hint: m === S.curModel ? 'current' : '', value: m });
    }
    items.push({ label: `${sym('ellipsis')} custom id (/model <id>)`, hint: '', value: '__custom__' });
    openOverlay('models', items, (item) => {
      if (item.value === '__custom__') {
        sysLine('usage: /model <model-id>');
        repaint();
        return;
      }
      setModel(item.value);
    });
  }

  function switchProvider(p) {
    S.curProvider = p;
    if (p.defaultModel && !cfg.providers?.[p.id]?.model) {
      S.curModel = p.defaultModel;
      cfg.model = p.defaultModel;
    }
    sysLine(`provider → ${p.name} · ${S.curModel}`);
    if (!p.oauth && !p.noKeyNeeded && !catalogMod.resolveApiKey(p)) {
      sysLine(`no key yet — mij auth set-key ${p.id} <key>`);
    }
    repaint();
  }

  async function showProviderSelector() {
    const authStore = await import('../auth/store.js');
    const list = catalogMod.allProviders().slice(0, 80);
    const items = list.map((p) => {
      let ready;
      if (p.oauth) ready = authStore.getToken(p.authKind || p.id) ? 'oauth ok' : 'login needed';
      else if (p.noKeyNeeded) ready = 'local';
      else ready = catalogMod.resolveApiKey(p) ? 'ready' : p.baseUrl ? 'needs key' : 'needs baseUrl';
      return { label: p.id, hint: `${ready} · ${truncateVisible(p.name, 30)}`, raw: p };
    });
    openOverlay('providers', items, (item) => switchProvider(item.raw));
  }

  async function showSessionSelector() {
    const { Session } = await import('../session.js');
    const sessions = Session.list().slice(0, 12);
    if (!sessions.length) {
      sysLine('no saved sessions yet');
      return;
    }
    const items = sessions.map((s) => ({
      label: truncateVisible(s.title === 'new' ? s.id : s.title, 44),
      hint: relativeTime(s.at),
      value: s.id,
    }));
    openOverlay('sessions', items, (item) => resumeSession(item.value));
  }

  function resumeSession(id) {
    import('../session.js').then(({ Session }) => {
      try {
        const loaded = Session.load(id);
        session.id = loaded.id;
        session.title = loaded.title;
        session.messages = loaded.messages;
        session.createdAt = loaded.createdAt;
        commitTranscript(c.green(`resumed "${loaded.title}" (${loaded.messages.length} messages)`));
        repaint();
      } catch (err) {
        commitTranscript(errorToCard(err).join('\n'));
      }
    });
  }

  async function dispatchSlash(raw) {
    const firstTok = raw.split(/\s+/)[0];
    const resolved = resolveCommandAlias(firstTok.toLowerCase());
    const rest = raw.slice(firstTok.length).trim();
    switch (resolved) {
      case '/help':
        printHelpBlock();
        return true;
      case '/new':
        Object.assign(session, {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          title: 'new',
          messages: [],
          createdAt: Date.now(),
        });
        sysLine('fresh session started');
        return true;
      case '/clear':
        session.messages = [];
        sysLine('history cleared');
        return true;
      case '/history':
        if (!session.messages.length) sysLine('(empty)');
        for (const m of session.messages) {
          const body = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
          commitTranscript(`${c.bold(m.role)}: ${truncateVisible(body, Math.max(40, renderer.width - 8))}`);
        }
        return true;
      case '/save':
        session.title = rest || session.title || 'untitled';
        session.save();
        sysLine(`saved: ${session.title}`);
        return true;
      case '/sessions':
        await showSessionSelector();
        return true;
      case '/session':
        if (rest) resumeSession(rest.trim());
        else await showSessionSelector();
        return true;
      case '/model':
        if (rest) setModel(rest);
        else await showModelSelector();
        return true;
      case '/provider': {
        if (rest) {
          const p = catalogMod.getProvider(rest);
          if (p) switchProvider(p);
          else commitTranscript(c.red(`unknown provider "${rest}"`));
        } else await showProviderSelector();
        return true;
      }
      case '/system': {
        const { buildSystemPrompt } = await import('../prompts/system.js');
        const { discoverSkills, matchSkills } = await import('../skills/index.js');
        const active = matchSkills(rest || '(preview)', discoverSkills(), 3);
        commitTranscript(
          buildSystemPrompt({ profile: cfg.profile, skills: active, systemOverride: cfg.systemOverride })
        );
        return true;
      }
      case '/skills': {
        const { discoverSkills } = await import('../skills/index.js');
        for (const s of discoverSkills()) {
          commitTranscript(`${c.cyan(s.name)} ${c.dim(`[${s.scope}]`)} — ${s.description || ''}`);
        }
        return true;
      }
      case '/git': {
        const g = await import('../git.js');
        if (rest[0] === 'diff') commitTranscript(g.gitDiff({ staged: rest.includes('--staged') }));
        else if (rest[0] === 'log') commitTranscript(g.gitLog({ n: Number(rest[1]) || 10 }));
        else if (g.isGitRepo()) {
          const st = g.gitStatus();
          commitTranscript(
            `branch: ${c.bold(st.branch)} · +${st.counts.added} ~${st.counts.modified} -${st.counts.deleted}\n${st.files.join('\n') || '(clean)'}`
          );
          gitBranch = st.branch;
        } else sysLine('not a git repository');
        repaint();
        return true;
      }
      case '/compact': {
        const { compactSession: cs } = await import('../commands/compact.js');
        const { completeOnce } = await import('../providers/client.js');
        sysLine('compacting…');
        try {
          const res = await cs({
            session,
            summarize: (prompt) =>
              completeOnce({
                provider: S.curProvider,
                model: S.curModel,
                messages: [{ role: 'user', content: prompt }],
                system: '',
                tools: [],
                temperature: 0.2,
              }),
            thresholdTokens: Number(rest) || 6000,
          });
          if (res.changed) {
            commitTranscript(c.green(`compacted ✓ removed ${res.removedMessages} msgs · freed ~${res.removedTokens} tok · pinned ${res.pinnedFiles} file refs`));
          } else {
            sysLine(res.reason ?? 'nothing to compact');
          }
        } catch (err) {
          commitTranscript(errorToCard(err).join('\n'));
        }
        repaint();
        return true;
      }
      case '/tokens': {
        const t = session.usageTotals?.() ?? { input: 0, output: 0, cached: 0 };
        const turns = (session.usage ?? []).length;
        const ctxNow = session.messages.reduce(
          (n, m) => n + Math.ceil(String(typeof m.content === 'string' ? m.content : '').length / 4),
          0
        );
        commitTranscript(
          [
            c.bold('Token usage'),
            `turns with usage: ${turns}`,
            `in: ${t.input} · out: ${t.output} · cached: ${t.cached}`,
            `current context ≈ ${ctxNow} tok`,
          ].join('\n')
        );
        return true;
      }
      case '/cost': {
        const { modelCost } = await import('../providers/models.js');
        const { estimateCost: ec, formatCost: fc } = await import('../context.js');
        const rate = modelCost(S.curProvider.id, S.curModel);
        if (!rate) {
          sysLine(`pricing unavailable for ${S.curProvider.id}/${S.curModel}`);
          return true;
        }
        const t = session.usageTotals?.() ?? {};
        const total = ec(rate, t);
        commitTranscript(
          `est. cost this session: ${c.bold(fc(total))} ${c.dim(`(in \$${rate.input}/Mtok · out \$${rate.output}/Mtok)`)}`
        );
        return true;
      }
      case '/reload': {
        const eng = await import('../engine.js');
        eng.resetPlugins();
        await eng.getPlugins();
        sysLine('plugins reloaded');
        return true;
      }
      case '/exit':
        S.exit = true;
        if (eofResolve) eofResolve();
        return true;
      default:
        return false;
    }
  }

  function printHelpBlock() {
    const lines = COMMANDS.map((cmd) => `  ${c.cyan(cmd.cmd.padEnd(16))} ${c.dim(cmd.desc)}`);
    commitTranscript(
      [
        c.bold('Commands'),
        ...lines,
        '',
        c.dim('Enter send · Ctrl+J newline · Up/Down history · Tab complete'),
        c.dim('Ctrl+C cancel/quit · Ctrl+L clear · Ctrl+U clear line · Esc close selector'),
      ].join('\n')
    );
  }

  async function onSubmit(raw) {
    const text = raw.trim();
    if (!text) return;
    if (session.title === 'new') session.title = truncateVisible(stripAnsi(text), 48) || 'new';
    if (text.startsWith('/')) {
      const pluginHandled = await deps.runPluginCommand(text.split(/\s+/)[0]).catch(() => false);
      if (pluginHandled) {
        repaint();
        return;
      }
      const handled = await dispatchSlash(text);
      if (!handled) commitTranscript(c.yellow(`unknown command ${text.split(/\s+/)[0]} — try /help`));
      return;
    }
    commitTranscript(`${c.bold(c.blue('You'))}\n${c.magenta(sym('bullet'))} ${text}`);
    await executeTurn(text);
  }

  async function handleToken(token) {
    if (S.running && !S.pendingConfirm) {
      const early = token.type === 'char' ? String(token.value).toLowerCase() : '';
      if (early === 'y' || early === 'n') {
        S.stashedConfirm = early === 'y';
        return;
      }
    }
    if (S.pendingConfirm) {
      const t = token.type === 'char' ? String(token.value).toLowerCase() : token.type;
      if (t === 'y' || t === 'Y') {
        const p = S.pendingConfirm;
        S.pendingConfirm = null;
        p.resolve(true);
        return;
      }
      if (t === 'n' || t === 'enter' || t === 'escape' || t === 'ctrl+c') {
        const p = S.pendingConfirm;
        S.pendingConfirm = null;
        p.resolve(false);
        return;
      }
      return;
    }
    switch (token.type) {
      case 'ctrl+c':
        if (S.running && S.abort) {
          if (S.cancelRequested) {
            S.exit = true;
            if (eofResolve) eofResolve();
            return;
          }
          S.cancelRequested = true;
          S.statusFlash = 'cancelling… press Ctrl+C again to quit';
          S.abort.abort();
          repaint();
          setTimeout(() => {
            S.cancelRequested = false;
          }, 2500);
        } else {
          S.exit = true;
          if (eofResolve) eofResolve();
        }
        return;
      case 'ctrl+d':
        if (editor.isEmpty()) {
          S.exit = true;
          if (eofResolve) eofResolve();
        }
        return;
      case 'ctrl+l':
        process.stdout.write('\x1b[2J\x1b[H');
        renderer.invalidate();
        repaint();
        return;
      case 'escape':
        if (S.overlay) {
          closeOverlay();
          repaint();
        }
        return;
      case 'up':
        if (S.overlay) {
          S.overlayIndex = clampIdx(S.overlayIndex - 1, S.overlay.items.length);
          repaint();
          return;
        }
        break;
      case 'down':
        if (S.overlay) {
          S.overlayIndex = clampIdx(S.overlayIndex + 1, S.overlay.items.length);
          repaint();
          return;
        }
        break;
      case 'enter':
        if (S.overlay) {
          void activateOverlayItem().catch((err) => commitTranscript(errorToCard(err).join('\n')));
          return;
        }
        break;
      case 'tab':
        if (editor.text.startsWith('/') && !editor.text.includes(' ')) {
          const items = filterCommands(editor.text);
          if (items.length) {
            const prefix = commonPrefix(items.map((i) => i.label));
            if (prefix.length > editor.text.length) {
              editor.setText(prefix);
            } else if (items.length === 1) {
              const lbl = items[0].label;
              editor.setText(/<.*>/.test(lbl) ? lbl.split(/\s+/)[0] + ' ' : lbl + ' ');
            }
            syncPalette();
            repaint();
            return;
          }
        }
        return;
      default:
        break;
    }

    const result = applyKeyToEditor(editor, token, { multiline: true });
    if (result.action === 'submit') {
      if (S.running) {
        S.statusFlash = 'busy…';
        repaint();
        setTimeout(() => {
          S.statusFlash = '';
          repaint();
        }, 900);
        return;
      }
      const text = editor.submit();
      closeOverlay();
      repaint();
      void onSubmit(text).catch((err) => commitTranscript(errorToCard(err).join('\n')));
      return;
    }
    if (result.action === 'changed' || result.action === 'moved') {
      if (editor.text.startsWith('/') && !editor.text.includes(' ')) syncPalette();
      else if (S.overlay?.kind === 'commands') closeOverlay();
      repaint();
    }
  }

  function syncPalette() {
    const items = filterCommands(editor.text.split(/\s+/)[0]);
    if (S.overlay?.kind === 'commands') {
      S.overlay.items = items;
      S.overlayIndex = clampIdx(S.overlayIndex, items.length);
    } else if (!S.overlay) {
      openOverlay('commands', items, null);
    }
  }

  function installConsoleBridge() {
    const origLog = console.log;
    const origError = console.error;
    let inBridge = false;
    console.log = (...a) => {
      if (inBridge) return;
      inBridge = true;
      try {
        const s = a.map(String).join(' ');
        commitTranscript(c.dim(truncateVisible(s, 200)));
      } finally {
        inBridge = false;
      }
    };
    console.error = (...a) => {
      if (inBridge) {
        process.stderr.write(a.map(String).join(' ') + '\n');
        return;
      }
      inBridge = true;
      try {
        const s = a.map(String).join(' ');
        commitTranscript(c.yellow(truncateVisible(s, 240)));
      } finally {
        inBridge = false;
      }
    };
    return () => {
      console.log = origLog;
      console.error = origError;
    };
  }

  function cleanup() {
    stopSpinner();
    if (flushTimer) clearTimeout(flushTimer);
    renderer.stop();
    io.stop();
    restoreConsole();
  }

  let restoreConsole = () => {};
  let stdinEndHandler = null;

  try {
    renderer.start();
    restoreConsole = installConsoleBridge();
    io.start();

    renderer.printTranscript(
      [
        `${c.bold(c.magenta('Kayno'))} ${c.dim('v0.1.0')} ${c.gray(sym('sep'))} ${provider.name} ${c.gray('/')} ${c.bold(model)}`,
        c.dim(`/help commands · Ctrl+C cancel · Ctrl+D quit${cfg.yolo ? ' · YOLO' : ''}`),
      ].join('\n')
    );

    io.on('resize', () => {
      renderer.resize();
      repaint();
    });

    io.on('data', (chunk) => {
      decoder.push(chunk);
      decoder.flush();
    });

    (async () => {
      while (!S.exit) {
        const token = await decoder.next();
        try {
          await handleToken(token);
        } catch (err) {
          process.stderr.write(`mij: key handler error: ${err?.message}\n`);
        }
      }
      if (eofResolve) eofResolve();
    })();

    stdinEndHandler = () => {
      S.exit = true;
      if (eofResolve) eofResolve();
    };
    process.stdin.on('end', stdinEndHandler);
    process.stdin.on('close', stdinEndHandler);

    if (deps.onMissingKey) deps.onMissingKey(provider);

    await eofPromise;

    session.save();
    cleanup();
    if (stdinEndHandler) {
      process.stdin.off('end', stdinEndHandler);
      process.stdin.off('close', stdinEndHandler);
    }
    return 0;
  } catch (err) {
    cleanup();
    if (stdinEndHandler) {
      process.stdin.off('end', stdinEndHandler);
      process.stdin.off('close', stdinEndHandler);
    }
    process.stderr.write(`mij: ${err?.stack || err}\n`);
    return 1;
  }
}
