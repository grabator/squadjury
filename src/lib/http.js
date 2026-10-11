// Small HTTP helpers for the Worker.

export class HttpError extends Error {
  constructor(status, code, extra = {}) {
    super(code);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

export const fail = (status, code, extra) => {
  throw new HttpError(status, code, extra);
};

export function json(data, init = {}) {
  const headers = new Headers(init.headers);
  headers.set('content-type', 'application/json; charset=utf-8');
  if (!headers.has('cache-control')) headers.set('cache-control', 'no-store');
  return new Response(JSON.stringify(data), { ...init, headers });
}

export async function readJson(req, max = 64 * 1024) {
  const len = +req.headers.get('content-length') || 0;
  if (len > max) fail(413, 'too_large');
  try {
    const text = await req.text();
    if (text.length > max) fail(413, 'too_large');
    return text ? JSON.parse(text) : {};
  } catch (e) {
    if (e instanceof HttpError) throw e;
    fail(400, 'bad_json');
  }
}

export function getCookie(req, name) {
  const header = req.headers.get('cookie') || '';
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

export function setCookie(name, value, { maxAge, secure = true } = {}) {
  let c = `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax`;
  if (secure) c += '; Secure';
  if (maxAge != null) c += `; Max-Age=${maxAge}`;
  return c;
}

/** Rejects cross-site writes: the Origin of a POST must be this site. */
export function checkOrigin(req) {
  if (req.method === 'GET' || req.method === 'HEAD') return;
  const origin = req.headers.get('origin');
  if (!origin) return; // non-browser clients; cookies are SameSite=Lax anyway
  if (origin !== new URL(req.url).origin) fail(403, 'bad_origin');
}

export function clientIp(req) {
  return req.headers.get('cf-connecting-ip') || req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'local';
}

/** Fixed window rate limit backed by D1. Throws 429 when over. */
export async function rateLimit(env, key, limit, windowSec, now) {
  const window = Math.floor(now / 1000 / windowSec);
  const row = await env.DB.prepare(
    `INSERT INTO rate (key, window, count) VALUES (?1, ?2, 1)
     ON CONFLICT(key) DO UPDATE SET count = CASE WHEN window = ?2 THEN count + 1 ELSE 1 END, window = ?2
     RETURNING count`,
  )
    .bind(key, window)
    .first();
  if (row.count > limit) fail(429, 'slow_down', { retryAfter: windowSec });
}

export const randomKey = (bytes = 9) => {
  const b = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

export async function sha256(text) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
