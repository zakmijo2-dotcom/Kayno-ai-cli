import http from 'node:http';
import { exec } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readJson, writeJson } from '../util.js';
import { CACHE_DIR } from '../config.js';
import { join } from 'node:path';
import { fetchJson } from '../http.js';
import { getToken, setToken } from './store.js';

export const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
export const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
export const GOOGLE_USERINFO = 'https://www.googleapis.com/oauth2/v1/userinfo?alt=json';

const GEMINI_CLI_OAUTH_SRC =
  'https://raw.githubusercontent.com/google-gemini/gemini-cli/main/packages/core/src/code_assist/oauth2.ts';

const SCOPES = [
  'https://www.googleapis.com/auth/cloud-platform',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
];

async function loadGeminiCliCreds() {
  const cacheFile = join(CACHE_DIR, 'google-client.json');
  const cached = readJson(cacheFile, null);
  if (cached?.clientId && cached?.clientSecret) return cached;
  if (process.env.GEMINI_CLI_CLIENT_ID && process.env.GEMINI_CLI_CLIENT_SECRET) {
    return {
      clientId: process.env.GEMINI_CLI_CLIENT_ID,
      clientSecret: process.env.GEMINI_CLI_CLIENT_SECRET,
    };
  }
  try {
    const res = await fetch(GEMINI_CLI_OAUTH_SRC, { signal: AbortSignal.timeout(15000) });
    if (res.ok) {
      const src = await res.text();
      const idMatch = src.match(/([0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com)/);
      const secretMatch = src.match(/'(GOCSPX-[A-Za-z0-9_-]+)'/);
      if (idMatch && secretMatch) {
        const creds = { clientId: idMatch[1], clientSecret: secretMatch[1], source: 'gemini-cli-oss' };
        writeJson(cacheFile, creds);
        return creds;
      }
    }
  } catch {}
  throw new Error(
    `Google OAuth client credentials not found.\n` +
      `Set them once with:\n` +
      `  nova config set auth.google.clientId "<client-id>"\n` +
      `  nova config set auth.google.clientSecret "<client-secret>"\n` +
      `or env: GEMINI_CLI_CLIENT_ID / GEMINI_CLI_CLIENT_SECRET\n` +
      `(the public desktop-app credentials ship in google-gemini/gemini-cli, Apache-2.0)`
  );
}

async function credsFor(kind) {
  const section = loadConfig().auth?.[kind] || {};
  if (section.clientId && section.clientSecret) {
    return { clientId: section.clientId, clientSecret: section.clientSecret };
  }
  if (process.env.NOVA_CLIENT_ID && process.env.NOVA_CLIENT_SECRET) {
    return { clientId: process.env.NOVA_CLIENT_ID, clientSecret: process.env.NOVA_CLIENT_SECRET };
  }
  return loadGeminiCliCreds();
}

function startCallbackServer(timeoutMs = 5 * 60 * 1000) {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
    setTimeout(() => {
      try { server.close(); } catch {}
      reject(new Error('OAuth timeout: no browser callback within 5 minutes'));
    }, timeoutMs).unref();
  });
}

export async function oauthLogin(kind) {
  const { clientId, clientSecret } = await credsFor(kind);
  const state = randomUUID();
  const { server, port } = await startCallbackServer();
  const redirectUri = `http://127.0.0.1:${port}`;

  const authUrl = new URL(GOOGLE_AUTH_URL);
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', SCOPES.join(' '));
  authUrl.searchParams.set('access_type', 'offline');
  authUrl.searchParams.set('prompt', 'consent');
  authUrl.searchParams.set('state', state);

  console.log(`\nOpening browser for Google sign-in (${kind})...`);
  console.log('If it does not open automatically, visit:\n');
  console.log(authUrl.toString() + '\n');
  openBrowser(authUrl.toString());

  const code = await new Promise((resolve) => {
    server.on('request', (req, res2) => {
      const u = new URL(req.url, 'http://localhost');
      if (u.searchParams.get('state') !== state) {
        res2.writeHead(400).end('bad state');
        return;
      }
      res2.writeHead(200, { 'content-type': 'text/html' });
      res2.end('<h2>NOVA authorized ✔ — you can close this tab.</h2>');
      resolve(u.searchParams.get('code'));
    });
  });
  if (!code) throw new Error('No authorization code received');

  const tokenRes = await fetchJson(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }).toString(),
  });

  let email = '';
  try {
    const info = await fetchJson(
      `${GOOGLE_USERINFO}&access_token=${encodeURIComponent(tokenRes.access_token)}`
    );
    email = info.email || '';
  } catch {}

  setToken(kind, {
    kind: 'google-oauth',
    accessToken: tokenRes.access_token,
    refreshToken: tokenRes.refresh_token || getToken(kind)?.refreshToken || '',
    expiry: Date.now() + ((tokenRes.expires_in || 3600) - 60) * 1000,
    email,
  });
  try { server.close(); } catch {}
  return email;
}

export async function ensureAccessToken(kind) {
  const t = getToken(kind);
  if (!t || (!t.accessToken && !t.refreshToken)) {
    throw new Error(
      `No OAuth credentials stored for "${kind}". Run: nova auth login ${kind}`
    );
  }
  if (t.accessToken && Date.now() < (t.expiry || 0)) return t.accessToken;
  if (!t.refreshToken) {
    throw new Error(`Token for "${kind}" expired and no refresh_token stored. Re-run: nova auth login ${kind}`);
  }
  return refreshGoogleToken(kind);
}

export async function refreshGoogleToken(kind) {
  const t = getToken(kind);
  const { clientId, clientSecret } = await credsFor(kind);
  const res = await fetchJson(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: t.refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
    }).toString(),
  });
  setToken(kind, {
    ...t,
    accessToken: res.access_token,
    expiry: Date.now() + ((res.expires_in || 3600) - 60) * 1000,
  });
  return getToken(kind).accessToken;
}

function openBrowser(url) {
  const cmd =
    process.platform === 'darwin'
      ? `open "${url}"`
      : process.platform === 'win32'
        ? `start "" "${url}"`
        : `xdg-open "${url}"`;
  exec(cmd, () => {});
}
