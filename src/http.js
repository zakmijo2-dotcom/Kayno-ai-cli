const DEFAULT_TIMEOUT = 300000;

export async function fetchJson(url, opts = {}, timeoutMs = DEFAULT_TIMEOUT) {
  const res = await fetch(url, {
    ...opts,
    signal: opts.signal || AbortSignal.timeout(timeoutMs),
  });
  const text = await res.text();
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status} ${res.statusText}: ${truncate(text, 600)}`);
    err.status = res.status;
    throw err;
  }
  return JSON.parse(text);
}

export async function postStream(url, body, headers, signal) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'text/event-stream', ...headers },
    body: JSON.stringify(body),
    signal: signal || AbortSignal.timeout(DEFAULT_TIMEOUT),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const err = new Error(`HTTP ${res.status} ${res.statusText}${text ? `: ${truncate(text, 800)}` : ''}`);
    err.status = res.status;
    throw err;
  }
  if (!res.body) throw new Error('empty response body');
  return sseIterator(res.body);
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

function truncate(s, n) {
  s = String(s ?? '');
  return s.length > n ? s.slice(0, n) + '…' : s;
}
