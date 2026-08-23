import { log } from './logger.js';

const DEFAULT_TIMEOUT = 300000;
const DEFAULT_RETRIES = 3;

function truncate(s, n) {
  s = String(s ?? '');
  return s.length > n ? s.slice(0, n) + '…' : s;
}

function isRetryable(status) {
  return status === 408 || status === 429 || (status >= 500 && status <= 599);
}

function isNetworkError(err) {
  const msg = String(err?.message ?? err);
  return (
    err?.name === 'AbortError' ||
    /fetch failed|ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|UND_ERR|socket|network/i.test(msg)
  );
}

export function sleep(ms, signal = null) {
  if (signal?.aborted) return Promise.reject(abortError());
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      if (signal) signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    function onAbort() {
      clearTimeout(t);
      reject(abortError());
    }
    if (signal) signal.addEventListener('abort', onAbort, { once: true });
  });
}

function abortError() {
  const e = new Error('This operation was aborted');
  e.name = 'AbortError';
  return e;
}

function backoffDelay(attempt, res) {
  const retryAfter = res?.headers?.get?.('retry-after');
  if (retryAfter) {
    const secs = Number(retryAfter);
    if (!Number.isNaN(secs)) return Math.min(60_000, secs * 1000);
    const date = Date.parse(retryAfter);
    if (!Number.isNaN(date)) return Math.min(60_000, Math.max(0, date - Date.now()));
  }
  return Math.min(30_000, 800 * 2 ** attempt) + Math.floor(Math.random() * 250);
}

async function fetchWithRetry(url, opts, { retries = DEFAULT_RETRIES, timeoutMs = DEFAULT_TIMEOUT, label = '' } = {}) {
  let lastErr = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    let res;
    try {
      res = await fetch(url, { ...opts, signal: opts.signal || AbortSignal.timeout(timeoutMs) });
    } catch (err) {
      if (opts.signal?.aborted || err.name === 'AbortError') throw err;
      lastErr = err;
      if (attempt < retries && isNetworkError(err)) {
        const delay = backoffDelay(attempt);
        log.warn(`${label} network error (${err.message}), retry ${attempt + 1}/${retries} in ${delay}ms`);
        await sleep(delay, opts.signal);
        continue;
      }
      throw err;
    }
    if (res.ok) return res;
    if (attempt < retries && isRetryable(res.status)) {
      const delay = backoffDelay(attempt, res);
      log.warn(`${label} HTTP ${res.status}, retry ${attempt + 1}/${retries} in ${Math.round(delay)}ms`);
      let bodyText = '';
      try {
        bodyText = await res.text();
      } catch {}
      await sleep(delay);
      continue;
    }
    return res;
  }
  throw lastErr || new Error(`${label} request failed after ${retries} retries`);
}

export async function fetchJson(url, opts = {}, { timeoutMs = DEFAULT_TIMEOUT, retries = DEFAULT_RETRIES, label = 'request' } = {}) {
  const res = await fetchWithRetry(url, opts, { retries, timeoutMs, label });
  const text = await res.text();
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status} ${res.statusText}: ${truncate(text, 600)}`);
    err.status = res.status;
    err.retryable = isRetryable(res.status);
    throw err;
  }
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error(`invalid JSON from ${url}: ${truncate(text, 200)}`);
  }
}

export async function postStream(url, body, headers, signal, { retries = 2, label = 'stream' } = {}) {
  let attempt = -1;
  while (attempt < retries) {
    attempt++;
    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'text/event-stream', ...headers },
        body: JSON.stringify(body),
        signal: signal || AbortSignal.timeout(DEFAULT_TIMEOUT),
      });
    } catch (err) {
      if (signal?.aborted || err.name === 'AbortError') throw err;
      if (attempt < retries && isNetworkError(err)) {
        const delay = backoffDelay(attempt);
        log.warn(`${label} network error (${err.message}), retry ${attempt + 1}/${retries} in ${delay}ms`);
        await sleep(delay, signal);
        continue;
      }
      throw err;
    }
    if (res.ok) {
      if (!res.body) throw new Error('empty response body');
      return sseIterator(res.body);
    }
    const text = await res.text().catch(() => '');
    if (attempt < retries && isRetryable(res.status)) {
      const delay = Math.min(backoffDelay(Math.max(0, attempt - 1), { headers: res.headers }), 20_000);
      log.warn(`${label} HTTP ${res.status}, retry ${attempt + 1}/${retries} in ${Math.round(delay)}ms`);
      await sleep(delay, signal);
      continue;
    }
    const err = new Error(`HTTP ${res.status} ${res.statusText}${text ? `: ${truncate(text, 800)}` : ''}`);
    err.status = res.status;
    err.retryable = isRetryable(res.status);
    throw err;
  }
  throw new Error(`${label}: exhausted retries`);
}

async function* sseIterator(body) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, idx).replace(/\r$/, '');
      buffer = buffer.slice(idx + 1);
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;
      try {
        yield JSON.parse(payload);
      } catch {}
    }
  }
}
