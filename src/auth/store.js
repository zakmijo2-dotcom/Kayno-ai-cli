import { readJson, writeJson } from '../util.js';
import { AUTH_FILE } from '../config.js';

export function loadAuth() {
  return readJson(AUTH_FILE, { tokens: {} });
}

export function saveAuth(auth) {
  writeJson(AUTH_FILE, auth);
}

export function getToken(providerId) {
  return loadAuth().tokens?.[providerId] || null;
}

export function setToken(providerId, token) {
  const auth = loadAuth();
  auth.tokens = auth.tokens || {};
  if (token === null) delete auth.tokens[providerId];
  else auth.tokens[providerId] = { ...auth.tokens[providerId], ...token, updatedAt: Date.now() };
  saveAuth(auth);
}

export function maskSecret(s = '') {
  if (!s) return '(none)';
  if (s.length <= 12) return s.slice(0, 3) + '****';
  return s.slice(0, 8) + '...' + s.slice(-4);
}
