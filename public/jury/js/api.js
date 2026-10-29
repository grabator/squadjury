// Thin fetch wrapper for the SquadJury API.

let fakeNow = null;
try {
  // Development only: ?now=2026-10-17T12:00:00Z simulates time (the server ignores it in production).
  const q = new URLSearchParams(location.search).get('now');
  if (q) sessionStorage.setItem('sj-now', q);
  fakeNow = sessionStorage.getItem('sj-now');
} catch {}

export class ApiError extends Error {
  constructor(status, data) {
    super(data?.error || `http_${status}`);
    this.status = status;
    this.code = data?.error || `http_${status}`;
    this.data = data;
  }
}

export async function api(path, { method = 'GET', body, form, signal } = {}) {
  const headers = {};
  if (fakeNow) headers['x-sj-now'] = fakeNow;
  let payload;
  if (form) payload = form;
  else if (body !== undefined) {
    headers['content-type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(path, { method, headers, body: payload, credentials: 'same-origin', signal });
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    throw new ApiError(0, { error: 'offline' });
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}

/** Retries a write a few times with backoff (for optimistic verdicts). */
export async function withRetry(fn, tries = 4) {
  let wait = 600;
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (e) {
      const retryable = e.status === 0 || e.status >= 500 || e.status === 429;
      if (!retryable || i >= tries - 1) throw e;
      await new Promise((r) => setTimeout(r, wait));
      wait *= 2;
    }
  }
}

export const nowMs = () => (fakeNow ? Date.parse(fakeNow) : Date.now());
