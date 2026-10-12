// First visit intro: four short animated screens that say what SquadJury is and how it works.
// Shown once to signed out visitors; "How it works" can play it again.

import { t } from './i18n.js';
import { html, raw, $, $$ } from './ui.js';
import { shirtSvg } from './fpl.js';
import { store } from './store.js';

const KEY = 'sj-intro';
const SKIP_PATHS = /^\/(admin|privacy|rules)/;

const seen = () => { try { return localStorage.getItem(KEY) === '1'; } catch { return true; } };
const markSeen = () => { try { localStorage.setItem(KEY, '1'); } catch {} };

let n = 0;
const shirt = (kit) => shirtSvg(kit, `in${n++}`);
const KITS = [['#d71920', '#ffffff', 'solid'], ['#0057b8', '#ffffff', 'stripes'], ['#ffffff', '#132257', 'solid'], ['#6cabdd', '#ffffff', 'solid']];
const GK = ['#a7e83a', '#1a1a1a', 'solid'];

/** A small pitch with 11 shirts in a 4-4-2. */
function miniPitch() {
  const rows = [[GK], [0, 1, 2, 3], [3, 0, 1, 2], [1, 3]];
  let i = 0;
  return html`<div class="in-pitch">${rows.map((r) => html`<div class="in-line">${r.map((k) => html`<span class="in-shirt" style="--d:${(i++ * 0.04).toFixed(2)}s">${raw(shirt(Array.isArray(k) ? k : KITS[k]))}</span>`)}</div>`)}</div>`;
}

const STAGES = [
  // 1. The question every manager asks, and the answer.
  () => html`<div class="in-posts">
      <div class="in-post" style="--d:0.1s"><i>FT</i><span>${t('intro.post1')}</span></div>
      <div class="in-post" style="--d:0.35s"><i>BB</i><span>${t('intro.post2')}</span></div>
      <div class="in-post" style="--d:0.6s"><i>MW</i><span>${t('intro.post3')}</span></div>
      <div class="in-card in-stamp"><small>JURY</small><b>8.4</b></div>
    </div>`,
  // 2. Judge: tap 8, the yellow card lands.
  () => html`<div class="in-judge">
      ${miniPitch()}
      <div class="in-vrow">${Array.from({ length: 10 }, (_, i) => html`<span class="${i === 7 ? 'in-pick' : ''}">${i + 1}</span>`)}</div>
      <span class="in-finger" aria-hidden="true"></span>
      <div class="in-card in-verdict"><small>VERDICT</small><b>8</b></div>
    </div>`,
  // 3. Post: a screenshot is read, 15 of 15.
  () => html`<div class="in-post-shot">
      <div class="in-phone">${miniPitch()}<span class="in-scan"></span></div>
      <div class="in-found"><b>15/15</b><span>${t('intro.found')}</span></div>
    </div>`,
  // 4. Leaderboard: your row climbs to the top.
  () => html`<div class="in-board">
      ${[['DeadlineDave', '8.5'], ['TripleCaptain', '8.3'], ['WildcardWendy', '8.1']].map(([name, sc], i) => html`<div class="in-row" style="--r:${i}"><span class="pos"><i>${i + 1}</i><i>${i + 2}</i></span><span class="nm">${name}</span><span class="sc">${sc}</span></div>`)}
      <div class="in-row me"><span class="pos"><i>4</i><i>1</i></span><span class="nm">${t('intro.you')}</span><span class="sc"><i>7.9</i><i>8.7</i></span></div>
    </div>`,
];

/** Opens the intro. `force` plays it even if it was seen before. */
export function showIntro({ force = false } = {}) {
  if (!force && (seen() || store.state.user || SKIP_PATHS.test(location.pathname))) return;
  if ($('.intro')) return;
  const prev = document.activeElement;
  const root = document.createElement('div');
  root.className = 'intro';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', t('intro.label'));
  root.innerHTML = html`
    <div class="in-top"><picture><source srcset="/img/logo/logo-white.svg" media="(prefers-color-scheme: dark)"><img src="/img/logo/logo.svg" alt="SquadJury" width="100" height="28"></picture>
      <button class="in-skip" data-skip>${t('intro.skip')}</button></div>
    <div class="in-slide" aria-live="polite"></div>
    <div class="in-bottom">
      <div class="in-dots" aria-hidden="true">${STAGES.map(() => html`<i></i>`)}</div>
      <div class="in-actions"></div>
    </div>`.s;
  document.body.append(root);
  document.body.style.overflow = 'hidden';
  let i = 0;

  const close = (to) => {
    markSeen();
    root.classList.add('closing');
    document.removeEventListener('keydown', onKey);
    setTimeout(() => root.remove(), 220);
    document.body.style.overflow = '';
    if (to && to !== location.pathname) import('./app.js').then((m) => m.navigate(to));
    else prev?.focus?.();
  };

  const go = (k) => {
    i = Math.max(0, Math.min(STAGES.length - 1, k));
    const last = i === STAGES.length - 1;
    $('.in-slide', root).innerHTML = html`
      <div class="in-stage">${STAGES[i]()}</div>
      <h2 class="in-title">${t(`intro.t${i + 1}`)}</h2>
      <p class="in-text">${t(`intro.p${i + 1}`)}</p>`.s;
    $$('.in-dots i', root).forEach((d, j) => d.classList.toggle('on', j === i));
    $('.in-actions', root).innerHTML = last
      ? html`<a class="btn btn-ghost" href="/post" data-go="/post">${t('intro.post')}</a><a class="btn btn-go" href="/" data-go="/">${t('intro.start')}</a>`.s
      : html`${i ? html`<button class="btn btn-ghost" data-back>${t('intro.back')}</button>` : ''}<button class="btn btn-go" data-next>${t('intro.next')}</button>`.s;
    $('[data-next], [data-go="/"]', root)?.focus();
  };

  root.addEventListener('click', (e) => {
    if (e.target.closest('[data-skip]')) return close();
    if (e.target.closest('[data-next]')) return go(i + 1);
    if (e.target.closest('[data-back]')) return go(i - 1);
    const a = e.target.closest('[data-go]');
    if (a) { e.preventDefault(); e.stopPropagation(); close(a.dataset.go); }
  });

  // Swipe between screens.
  let sx = null, sy = 0;
  root.addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
  root.addEventListener('touchend', (e) => {
    if (sx == null) return;
    const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
    sx = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) go(i + (dx < 0 ? 1 : -1));
  });

  const onKey = (e) => {
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowRight') go(i + 1);
    else if (e.key === 'ArrowLeft') go(i - 1);
    else if (e.key === 'Tab') {
      const f = $$('button, a[href]', root);
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    }
  };
  document.addEventListener('keydown', onKey);
  go(0);
}
