// Small DOM helpers: escaping, sheets, toasts, confetti, haptics.

import { t } from './i18n.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** Tagged template that escapes interpolations unless they are raw(...) values. */
const RAW = Symbol('raw');
export const raw = (s) => ({ [RAW]: true, s: String(s) });
export function html(strings, ...vals) {
  let out = '';
  for (let i = 0; i < strings.length; i++) {
    out += strings[i];
    if (i >= vals.length) continue;
    const v = vals[i];
    if (v == null || v === false) continue;
    if (Array.isArray(v)) out += v.map((x) => (x && x[RAW] ? x.s : esc(x))).join('');
    else out += v[RAW] ? v.s : esc(v);
  }
  return raw(out);
}

export const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export function haptic(ms = 18) {
  try {
    if (navigator.vibrate && !reduceMotion()) navigator.vibrate(ms);
  } catch {}
}

export function toast(msg, { bad = false, ms = 2800, icon } = {}) {
  let box = $('.toasts');
  if (!box) {
    box = document.createElement('div');
    box.className = 'toasts';
    box.setAttribute('role', 'status');
    box.setAttribute('aria-live', 'polite');
    document.body.append(box);
  }
  const el = document.createElement('div');
  el.className = 'toast' + (bad ? ' bad' : '');
  el.innerHTML = `<span class="ti" aria-hidden="true">${ICONS[icon || (bad ? 'alert' : 'check')]}</span><span></span>`;
  el.lastChild.textContent = msg;
  box.append(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 260); }, ms);
}

/** Animates a number in an element from its current value to `to`. */
export function countUp(el, to, { decimals = 1, ms = 700 } = {}) {
  if (!el) return;
  const from = parseFloat(el.dataset.v ?? el.textContent) || 0;
  el.dataset.v = to;
  if (reduceMotion() || from === to) { el.textContent = Number(to).toFixed(decimals); return; }
  const t0 = performance.now();
  const step = (now) => {
    const k = Math.min(1, (now - t0) / ms);
    const e = 1 - Math.pow(1 - k, 3);
    el.textContent = (from + (to - from) * e).toFixed(decimals);
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/** Avatar: initials on a gradient whose hue comes from the nickname. */
export function avatar(nick, cls = '') {
  const n = String(nick || '?');
  let h = 0;
  for (const ch of n) h = (h * 31 + ch.charCodeAt(0)) % 360;
  const parts = n.replace(/([a-z])([A-Z])/g, '$1 $2').split(/[\s_-]+/).filter(Boolean);
  const ini = ((parts[0]?.[0] || '?') + (parts[1]?.[0] || '')).toUpperCase();
  return raw(`<span class="av ${cls}" style="--h:${h}" aria-hidden="true">${esc(ini)}</span>`);
}

/** Bottom sheet (a centred dialog on wide screens). Returns { el, close }. */
export function sheet(content, { label, onClose } = {}) {
  const prev = document.activeElement;
  const scrim = document.createElement('div');
  scrim.className = 'scrim';
  const el = document.createElement('div');
  el.className = 'sheet';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  if (label) el.setAttribute('aria-label', label);
  el.innerHTML = `<div class="grab" aria-hidden="true"></div>${content.s ?? content}`;
  document.body.append(scrim, el);
  document.body.style.overflow = 'hidden';
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    el.classList.add('closing');
    scrim.style.opacity = '0';
    setTimeout(() => { el.remove(); scrim.remove(); }, reduceMotion() ? 0 : 200);
    document.body.style.overflow = '';
    document.removeEventListener('keydown', onKey);
    prev?.focus?.();
    onClose?.();
  };
  const onKey = (e) => {
    if (e.key === 'Escape') close();
    if (e.key === 'Tab') {
      const f = $$('button, a[href], input, [tabindex]:not([tabindex="-1"])', el).filter((x) => !x.disabled && x.offsetParent);
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    }
  };
  scrim.addEventListener('click', close);
  document.addEventListener('keydown', onKey);
  // Focus the first field, unless the user already moved into the sheet.
  setTimeout(() => { if (!el.contains(document.activeElement)) ($('input, button', el) || el).focus(); }, 30);
  return { el, close };
}

/** A short burst of confetti in the palette colours. */
export function confetti({ x = innerWidth / 2, y = innerHeight * 0.35, n = 110, spread = 120 } = {}) {
  if (reduceMotion()) return;
  const c = document.createElement('canvas');
  c.className = 'confetti';
  const dpr = Math.min(2, devicePixelRatio || 1);
  c.width = innerWidth * dpr;
  c.height = innerHeight * dpr;
  document.body.append(c);
  const g = c.getContext('2d');
  g.scale(dpr, dpr);
  const colors = ['#3cff8f', '#8dffbd', '#ffc94a', '#ff7a2f', '#ffffff', '#e9f1ff'];
  const bits = Array.from({ length: n }, () => ({
    x: x + (Math.random() - 0.5) * spread,
    y,
    vx: (Math.random() - 0.5) * 12,
    vy: -Math.random() * 13 - 4,
    r: Math.random() * Math.PI,
    vr: (Math.random() - 0.5) * 0.3,
    w: 6 + Math.random() * 6,
    h: 4 + Math.random() * 4,
    c: colors[(Math.random() * colors.length) | 0],
  }));
  const t0 = performance.now();
  const step = (now) => {
    const k = (now - t0) / 1000;
    g.clearRect(0, 0, innerWidth, innerHeight);
    for (const b of bits) {
      b.vy += 0.35; b.x += b.vx; b.y += b.vy; b.r += b.vr; b.vx *= 0.99;
      g.save(); g.translate(b.x, b.y); g.rotate(b.r); g.globalAlpha = Math.max(0, 1 - k / 2.4);
      g.fillStyle = b.c; g.fillRect(-b.w / 2, -b.h / 2, b.w, b.h); g.restore();
    }
    if (k < 2.4) requestAnimationFrame(step);
    else c.remove();
  };
  requestAnimationFrame(step);
}

export function fmtCountdown(ms) {
  if (ms <= 0) return '0m';
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (d) return `${d}d ${h}h ${m}m`;
  if (h) return `${h}h ${m}m`;
  return `${m}m ${String(sec).padStart(2, '0')}s`;
}

export const errText = (e) => {
  if (e?.code === 'offline') return t('err.offline');
  const k = `err.${e?.code}`;
  const s = t(k);
  return s === k ? t('err.generic') : s;
};

// One icon family: 24 grid, 2 px stroke, round joins. Shapes with class "f" fill in when active.
const ic = (body) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
export const ICONS = {
  judge: ic('<path class="f" d="M11.4 3.6l5.7 5.7-3.3 3.3-5.7-5.7z"/><path d="M11.4 3.6l5.7 5.7-3.3 3.3-5.7-5.7zM9.6 1.8l9.3 9.3M5.7 8.5l4.6 4.6"/><path d="M12.6 11.4l6.9 6.9"/><path d="M3 21h9"/>'),
  board: ic('<path class="f" d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 4h10v5a5 5 0 0 1-10 0zM8 21h8M12 14v7M17 5h3v1.5A3.5 3.5 0 0 1 16.6 10M7 5H4v1.5A3.5 3.5 0 0 0 7.4 10"/>'),
  post: ic('<rect class="f" x="3" y="7" width="18" height="13" rx="3"/><rect x="3" y="7" width="18" height="13" rx="3"/><circle cx="12" cy="13.5" r="3.5"/><path d="M8.5 7l1.5-2.5h4L15.5 7"/>'),
  shirt: ic('<path class="f" d="M8 3l-5 3 2 5 2-1v11h10V10l2 1 2-5-5-3a4 4 0 0 1-8 0z"/><path d="M8 3l-5 3 2 5 2-1v11h10V10l2 1 2-5-5-3a4 4 0 0 1-8 0z"/>'),
  me: ic('<circle class="f" cx="12" cy="8" r="4"/><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'),
  x: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.8 3h3.1l-6.8 7.8L22 21h-6.2l-4.9-6.4L5.3 21H2.2l7.3-8.3L2 3h6.4l4.4 5.8zm-1.1 16.2h1.7L7.4 4.7H5.6z"/></svg>',
  share: ic('<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/>'),
  download: ic('<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>'),
  upload: ic('<path d="M12 16V4M7 9l5-5 5 5M4 20h16"/>'),
  flag: ic('<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>'),
  trophy: ic('<path d="M7 4h10v5a5 5 0 0 1-10 0zM8 21h8M12 14v7M17 5h3v1.5A3.5 3.5 0 0 1 16.6 10M7 5H4v1.5A3.5 3.5 0 0 0 7.4 10"/>'),
  check: ic('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
  alert: ic('<path d="M12 8v5M12 16.5v.5"/><path d="M10.3 3.9L2.6 17.5A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>'),
  skip: ic('<path d="M5 6l7 6-7 6zM13 6l7 6-7 6z"/>'),
  lock: ic('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),
  calendar: ic('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>'),
  star: ic('<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>'),
  bolt: ic('<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>'),
  sound: ic('<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/>'),
  refresh: ic('<path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/>'),
  plus: ic('<path d="M12 5v14M5 12h14"/>'),
};
