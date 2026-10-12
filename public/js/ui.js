// Small DOM helpers: escaping, sheets, toasts and haptics.

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

export function toast(msg, { bad = false, ms = 2800 } = {}) {
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
  el.textContent = msg;
  box.append(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 260); }, ms);
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

// One icon family: thin lines on a 24 grid, used only where a word alone is not enough.
const ic = (body) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
export const ICONS = {
  judge: ic('<path d="M4 20h10M9.5 4.5l5 5M7 7l6.5-3 3.5 3.5L14 14zM12.5 12.5L19 19"/>'),
  board: ic('<path d="M5 20V11M12 20V5M19 20v-6"/>'),
  post: ic('<path d="M12 15V4M7.5 8.5L12 4l4.5 4.5M5 14v5h14v-5"/>'),
  shirt: ic('<path d="M8 3l-5 3 2 4 2-1v11h10V9l2 1 2-4-5-3a4 4 0 0 1-8 0z"/>'),
  me: ic('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'),
  x: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.8 3h3.1l-6.8 7.8L22 21h-6.2l-4.9-6.4L5.3 21H2.2l7.3-8.3L2 3h6.4l4.4 5.8zm-1.1 16.2h1.7L7.4 4.7H5.6z"/></svg>',
  share: ic('<path d="M12 3v12M7.5 7.5L12 3l4.5 4.5M5 13v7h14v-7"/>'),
  link: ic('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>'),
  download: ic('<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>'),
  upload: ic('<path d="M12 16V4M7 9l5-5 5 5M4 20h16"/>'),
  shot: ic('<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="12" cy="12" r="3.2"/>'),
  pitch: ic('<rect x="4" y="3" width="16" height="18" rx="1.5"/><path d="M4 12h16"/><circle cx="12" cy="12" r="2.5"/>'),
  flag: ic('<path d="M5 21V4h11l-2 4 2 4H5"/>'),
  check: ic('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
  alert: ic('<path d="M12 7v6M12 16.5v.5"/><circle cx="12" cy="12" r="9"/>'),
  calendar: ic('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>'),
};
