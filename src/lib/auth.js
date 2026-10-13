// Sign in with Google (ID token from Google Identity Services) and our own sessions.

import { fail, getCookie, setCookie, randomKey, sha256 } from './http.js';

const SESSION_COOKIE = 'sj_session';
const SESSION_DAYS = 90;
const GOOGLE_CERTS = 'https://www.googleapis.com/oauth2/v3/certs';

const certCache = new Map(); // JWKS url -> { keys, until }

async function jwks(url, now) {
  const hit = certCache.get(url);
  if (hit && hit.until > now) return hit.keys;
  const res = await fetch(url);
  if (!res.ok) fail(502, 'sign_in_unreachable');
  const maxAge = +(res.headers.get('cache-control') || '').match(/max-age=(\d+)/)?.[1] || 3600;
  const keys = (await res.json()).keys;
  certCache.set(url, { keys, until: now + maxAge * 1000 });
  return keys;
}

const b64url = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

/** Verifies an RS256 ID token against a JWKS: signature, audience, issuer and expiry. */
export async function verifyIdToken(token, { jwksUrl, issuers, audience }, now) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) fail(401, 'bad_token');
  let header, payload;
  try {
    header = JSON.parse(new TextDecoder().decode(b64url(parts[0])));
    payload = JSON.parse(new TextDecoder().decode(b64url(parts[1])));
  } catch {
    fail(401, 'bad_token');
  }
  if (header.alg !== 'RS256') fail(401, 'bad_token');
  const jwk = (await jwks(jwksUrl, now)).find((k) => k.kid === header.kid);
  if (!jwk) fail(401, 'bad_token');
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64url(parts[2]), new TextEncoder().encode(parts[0] + '.' + parts[1]));
  if (!ok) fail(401, 'bad_token');
  if (payload.aud !== audience) fail(401, 'bad_token');
  if (!issuers.includes(payload.iss)) fail(401, 'bad_token');
  if (!payload.exp || payload.exp * 1000 < now) fail(401, 'token_expired');
  return payload;
}

/** Verifies a Google ID token (from Google Identity Services). */
export async function verifyGoogleToken(token, clientId, now) {
  if (!clientId) fail(500, 'google_not_configured');
  return verifyIdToken(token, { jwksUrl: GOOGLE_CERTS, issuers: ['accounts.google.com', 'https://accounts.google.com'], audience: clientId }, now);
}

/**
 * Verifies an Apple ID token (Sign in with Apple JS). Ready, but only used once APPLE_CLIENT_ID
 * (the Services ID from Apple Developer) is set. See README, "Sign in with Apple".
 */
export async function verifyAppleToken(token, clientId, now) {
  if (!clientId) fail(404, 'not_found');
  return verifyIdToken(token, { jwksUrl: 'https://appleid.apple.com/auth/keys', issuers: ['https://appleid.apple.com'], audience: clientId }, now);
}

/** A plain check of an email address: something@domain.tld, at most 254 characters. */
export function checkEmail(e) {
  const email = String(e || '').trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/.test(email)) fail(400, 'email_format');
  return email;
}

export async function createSession(env, userId, now, secure) {
  const token = randomKey(32);
  await env.DB.prepare('INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .bind(await sha256(token), userId, now, now + SESSION_DAYS * 864e5)
    .run();
  return setCookie(SESSION_COOKIE, token, { maxAge: SESSION_DAYS * 86400, secure });
}

export async function endSession(env, req, secure) {
  const token = getCookie(req, SESSION_COOKIE);
  if (token) await env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(await sha256(token)).run();
  return setCookie(SESSION_COOKIE, '', { maxAge: 0, secure });
}

/** The signed in user, or null. */
export async function currentUser(env, req, now) {
  const token = getCookie(req, SESSION_COOKIE);
  if (!token) return null;
  const user = await env.DB.prepare(
    `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ? AND s.expires_at > ?`,
  )
    .bind(await sha256(token), now)
    .first();
  if (!user || user.banned) return null;
  return user;
}

export function isAdmin(env, user) {
  if (!user?.email) return false;
  const list = String(env.ADMIN_EMAILS || '').toLowerCase().split(',').map((s) => s.trim()).filter(Boolean);
  return list.includes(user.email.toLowerCase());
}

const BAD_WORDS = ['fuck', 'shit', 'cunt', 'nigg', 'fagg', 'whore', 'slut', 'rape', 'nazi', 'hitler', 'retard', 'kurac', 'picka', 'jebem', 'peder'];

/** Refuses text with offensive words, also when written with digits or separators. */
export function checkText(text, code) {
  const flat = String(text).toLowerCase().replace(/[\s_.-]/g, '').replace(/0/g, 'o').replace(/1/g, 'i').replace(/3/g, 'e').replace(/4/g, 'a').replace(/5/g, 's');
  if (BAD_WORDS.some((w) => flat.includes(w))) fail(400, code);
}

/** Checks a nickname: 3 to 20 letters, digits, _ or -, and nothing offensive. */
export function checkNickname(n) {
  const nick = String(n || '').trim();
  if (!/^[A-Za-z0-9_-]{3,20}$/.test(nick)) fail(400, 'nickname_format');
  checkText(nick, 'nickname_blocked');
  return nick;
}

export function checkXHandle(h) {
  if (h == null || h === '') return null;
  const handle = String(h).trim().replace(/^@/, '');
  if (!/^[A-Za-z0-9_]{1,15}$/.test(handle)) fail(400, 'x_handle_format');
  return handle;
}

/** A free nickname based on the Google name, e.g. "Ahmed Grabus" -> "AhmedG". */
export async function suggestNickname(env, name) {
  const words = String(name || 'Juror').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9 ]/g, '').split(/\s+/).filter(Boolean);
  let base = ((words[0] || 'Juror') + (words[1] ? words[1][0].toUpperCase() : '')).slice(0, 16);
  if (base.length < 3) base = 'Juror';
  for (let i = 0; i < 20; i++) {
    const cand = i ? `${base}${Math.floor(10 + Math.random() * 990)}` : base;
    const taken = await env.DB.prepare('SELECT 1 FROM users WHERE nickname = ?').bind(cand).first();
    if (!taken) return cand;
  }
  return `Juror${Date.now() % 100000}`;
}
