import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { c } from './util.js';
import { loadConfig, paths, NOVA_HOME } from './config.js';
import { loadAuth } from './auth/store.js';
import { allProviders, resolveApiKey, getProvider } from './providers/catalog.js';
import { isGitRepo } from './git.js';
import { detectProject } from './project.js';

function check(label, ok, detail = '') {
  const mark = ok ? c.green('ok  ') : c.yellow('warn');
  console.log(` ${mark} ${label}${detail ? c.dim(' — ' + detail) : ''}`);
  return ok;
}

export async function runDoctor() {
  console.log(c.bold('Nova doctor\n'));

  const nodeMajor = Number(process.version.slice(1).split('.')[0]);
  check('node >= 18', nodeMajor >= 18, process.version);

  let cfgOk = true;
  let cfg = null;
  try {
    cfg = loadConfig();
    check('config readable', true, paths().config);
  } catch (e) {
    cfgOk = false;
    check('config readable', false, `${e.message} (${paths().config})`);
  }

  if (cfgOk && cfg) {
    const provider = getProvider(cfg.provider);
    if (!provider) {
      check('default provider', false, `"${cfg.provider}" unknown (nova providers list)`);
    } else {
      const hasAuth =
        provider.oauth
          ? !!loadAuth().tokens?.google-oauth || !!loadAuth().tokens?.antigravity
          : !!resolveApiKey(provider);
      check(
        'default provider auth',
        hasAuth,
        `${provider.id}${provider.oauth ? ' (oauth)' : ''}${hasAuth ? '' : ' — no key yet'}`
      );
    }
    check('model set', !!cfg.model || !!(cfg.providers?.[cfg.provider]?.model), cfg.model || '(empty)');
  }

  try {
    const auth = loadAuth();
    const n = Object.keys(auth.tokens ?? {}).length;
    check('stored credentials', true, `${n} entr${n === 1 ? 'y' : 'ies'}`);
  } catch {
    check('stored credentials', false, 'auth.json unreadable');
  }

  const cacheFile = join(NOVA_HOME, 'cache', 'models-dev.json');
  let cacheInfo = 'not synced (nova providers sync)';
  let cacheOk = false;
  if (existsSync(cacheFile)) {
    const ageDays = (Date.now() - statSync(cacheFile).mtimeMs) / 86400000;
    cacheOk = true;
    cacheInfo = ageDays < 30 ? `${Math.round(ageDays)}d old` : `stale (${Math.round(ageDays)}d) — nova providers sync`;
  }
  check('models.dev catalog', cacheOk, cacheInfo);

  check('workspace', existsSync(process.cwd()), process.cwd());
  check('git available', isGitRepo() || true, isGitRepo() ? 'repo detected' : 'not a repo');

  const proj = detectProject();
  const summary = [
    proj.languages.join('+') || '-',
    proj.packageManager,
    proj.agentsFile,
  ].filter(Boolean).join(' · ');
  check('project detected', proj.languages.length > 0, summary);

  try {
    const { detectLinters } = await import('./diagnostics-engine.js');
    const l = detectLinters();
    const avail = Object.entries(l).filter(([, v]) => v).map(([k]) => k);
    check('linters', true, avail.length ? avail.join(', ') : 'none detected (node --check always available)');
  } catch {}

  const total = allProviders().length;
  console.log('');
  console.log(c.dim(`${total} providers known · home: ${NOVA_HOME}`));
}
