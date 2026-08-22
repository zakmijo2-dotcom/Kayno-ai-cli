import { fetchJson } from '../http.js';
import { getToken, setToken } from './store.js';
import { ensureAccessToken } from './google.js';
import { loadConfig } from '../config.js';

export function antigravityConfig() {
  const cfg = loadConfig();
  const section = cfg.auth?.antigravity || {};
  return {
    baseUrl: cfg.providers?.antigravity?.baseUrl || section.baseUrl || 'https://daily-cloudcode-pa.googleapis.com',
    project: section.project || '',
  };
}

export async function antigravityImportToken({ accessToken, refreshToken }) {
  if (!accessToken && !refreshToken) throw new Error('Provide --access <token> and/or --refresh <token>');
  setToken('antigravity', {
    kind: 'google-oauth',
    accessToken: accessToken || '',
    refreshToken: refreshToken || '',
    expiry: accessToken ? Date.now() + 55 * 60 * 1000 : 0,
    source: 'manual-import',
  });
}

export async function antigravityAccessToken() {
  const t = getToken('antigravity');
  const { baseUrl } = antigravityConfig();
  try {
    return await ensureAccessToken('antigravity');
  } catch (err) {
    if (!t?.accessToken) throw err;
    throw new Error(
      `Antigravity auth unavailable (${err.message}). Re-login or import tokens:\n` +
        `  nova auth login antigravity\n` +
        `  nova auth import antigravity --access <token> --refresh <token>\n` +
        `Backend in use: ${baseUrl}`
    );
  }
}
