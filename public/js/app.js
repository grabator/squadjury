// SquadJury app shell: router, the match clock, the floating tab bar, splash and intro.

import { t } from './i18n.js';
import { $, html, raw, ICONS, esc, sheet, haptic, reduceMotion } from './ui.js';
import { nowMs } from './api.js';
import { store, refreshState } from './store.js';

const routes = [
  [/^\/$/, () => import('./views/judge.js'), 'fit'],
  [/^\/leaderboard\/?$/, () => import('./views/leaderboard.js')],
  [/^\/post\/?$/, () => import('./views/post.js'), 'fit-post'],
  [/^\/squad\/?$/, () => import('./views/squad.js')],
  [/^\/me\/?$/, () => import('./views/me.js')],
  [/^\/t\/([A-Za-z0-9_-]{4,20})\/?$/, () => import('./views/team.js')],
  [/^\/(how|rules|privacy)\/?$/, () => import('./views/pages.js')],
  [/^\/admin\/?$/, () => import('./views/admin.js')],
];

let current = null;

export function navigate(path, { replace = false } = {}) {
  if (path === location.pathname + location.search) return render();
  history[replace ? 'replaceState' : 'pushState']({}, '', path);
  render();
}

let renderId = 0;
async function render() {
  const id = ++renderId;
  const path = location.pathname;
  const app = $('#app');
  let mod, params = [], mode = '';
  for (const [re, load, m] of routes) {
    const hit = path.match(re);
    if (hit) { mod = await load(); params = hit.slice(1); mode = m || ''; break; }
  }
  if (!mod) mod = await import('./views/pages.js'), (params = ['404']);
  if (id !== renderId) return; // a newer navigation started while this one was loading
  current?.unmount?.();
  current = mod;
  renderTabs();
  app.className = mode;
  app.innerHTML = '';
  const view = document.createElement('div');
  view.className = 'view';
  app.append(view);
  try {
    await mod.mount(view, ...params);
  } catch (e) {
    if (leaving) return; // the page is being replaced, its requests were cut off
    console.error(e);
    view.innerHTML = html`<div class="empty"><h2>${t('err.generic')}</h2><button class="btn" onclick="location.reload()">${t('err.tryAgain')}</button></div>`.s;
  }
  if (id !== renderId) return;
  app.querySelector('.footer')?.remove();
  if (!mode) app.insertAdjacentHTML('beforeend', footerHtml());
  if (!history.state?.keepScroll) window.scrollTo(0, 0);
}

/** Footer: desktop only. On phones these links live under Me, About. */
function footerHtml() {
  return html`<footer class="footer"><nav aria-label="About">
      <a href="/how">${t('page.how')}</a><a href="/rules">${t('page.rules')}</a><a href="/privacy">${t('page.privacy')}</a></nav>
      <p>${t('footer.fan')}</p></footer>`.s;
}

// ============================================================ tab bar

let lastRank = null;
function renderTabs() {
  const s = store.state;
  const path = location.pathname;
  const mine = s.mine;
  const rank = mine?.place?.rank ?? null;
  let moved = false;
  try {
    const seen = sessionStorage.getItem('sj-rank');
    moved = rank != null && seen != null && String(rank) !== seen && !path.startsWith('/leaderboard');
    if (path.startsWith('/leaderboard') && rank != null) sessionStorage.setItem('sj-rank', String(rank));
    if (seen == null && rank != null) sessionStorage.setItem('sj-rank', String(rank));
  } catch {}
  lastRank = rank;
  const items = [
    { href: '/', icon: ICONS.judge, label: t('nav.judge'), on: path === '/' },
    { href: '/leaderboard', icon: ICONS.board, label: t('nav.leaderboard'), on: path.startsWith('/leaderboard'), dot: moved },
    mine
      ? { href: '/squad', icon: ICONS.shirt, label: t('nav.mySquad'), on: path.startsWith('/squad'), fab: true, badge: mine.avg != null ? mine.avg.toFixed(1) : null }
      : { href: '/post', icon: ICONS.post, label: t('nav.post'), on: path.startsWith('/post'), fab: true },
    { href: '/me', icon: ICONS.me, label: t('nav.me'), on: path.startsWith('/me') },
  ];
  const nav = $('#tabs');
  const glider = nav.querySelector('.glider') || Object.assign(document.createElement('span'), { className: 'glider' });
  nav.innerHTML = items
    .map((i) => {
      const badge = i.badge ? html`<span class="badge" aria-label="score ${i.badge}">${i.badge}</span>` : '';
      const icon = i.fab ? html`<span class="bubble">${raw(i.icon)}${badge}</span>` : html`${raw(i.icon)}${badge}`;
      return html`<a class="tab ${i.fab ? 'fab' : ''}" href="${i.href}" ${raw(i.on ? 'aria-current="page"' : '')}>${icon}<span>${i.label}</span>${i.dot ? raw('<span class="dot" aria-label="your rank changed"></span>') : ''}</a>`.s;
    })
    .join('');
  nav.prepend(glider);
  requestAnimationFrame(() => moveGlider(nav, glider));
}

function moveGlider(nav, glider) {
  const on = nav.querySelector('.tab[aria-current="page"]');
  if (!on || on.classList.contains('fab')) { glider.style.opacity = '0'; return; }
  const n = nav.getBoundingClientRect(), r = on.getBoundingClientRect();
  const w = Math.min(r.width - 10, 84);
  glider.style.opacity = '1';
  glider.style.width = `${w}px`;
  glider.style.transform = `translateX(${r.left - n.left + (r.width - w) / 2}px)`;
}
addEventListener('resize', () => { const nav = $('#tabs'); const g = nav?.querySelector('.glider'); if (g) moveGlider(nav, g); });
document.addEventListener('pointerdown', (e) => { if (e.target.closest('.tab')) haptic(10); });

// ============================================================ match clock

const clock = { phase: null, text: '' };

function clockParts(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const p2 = (n) => String(n).padStart(2, '0');
  if (d) return [[String(d), 'd'], [p2(h), 'h'], [p2(m), 'm']];
  return [[p2(h), ':'], [p2(m), ':'], [p2(sec), '']];
}

function renderDigits(el, parts) {
  // Each digit is its own span, so only the digits that change roll in.
  const chars = [];
  for (const [num, unit] of parts) {
    for (const ch of num) chars.push({ ch, cls: '' });
    if (unit === ':') chars.push({ ch: ':', cls: 'sep' });
    else if (unit) chars.push({ ch: unit, cls: 'u' });
  }
  if (el.children.length !== chars.length) {
    el.innerHTML = chars.map((c) => `<span class="${c.cls}">${esc(c.ch)}</span>`).join('');
    return;
  }
  chars.forEach((c, i) => {
    const span = el.children[i];
    if (span.textContent !== c.ch) {
      span.textContent = c.ch;
      span.className = c.cls;
      if (!reduceMotion()) { void span.offsetWidth; span.classList.add('roll'); }
    }
  });
}

function tickClock() {
  const el = $('#clock');
  const s = store.state;
  if (!s.loaded || !el) return;
  if (!s.gw) {
    el.dataset.phase = 'locked';
    el.innerHTML = html`<span class="lbl"><small>${t('clock.season')}</small></span>`.s;
    return setBanner(null);
  }
  const left = s.gw.deadline - nowMs();
  if (left <= 0) {
    if (clock.phase !== 'locked') {
      clock.phase = 'locked';
      el.dataset.phase = 'locked';
      el.innerHTML = html`<span class="lock-anim" style="width:24px;height:24px;color:var(--hot)">${raw(ICONS.lock)}</span><span class="lbl"><small>GW${s.gw.id}</small><span class="digits" style="font-size:15px">${t('clock.locked')}</span></span>`.s;
      setBanner(null);
      // The next gameweek opens as soon as the server sees the deadline pass.
      setTimeout(() => refreshState().finally(() => { clock.phase = null; render(); }), 2200);
    }
    return;
  }
  const phase = left < 3600e3 ? 'hot' : left < 24 * 3600e3 ? 'soon' : 'calm';
  if (!el.querySelector('.digits') || clock.phase !== phase || clock.gw !== s.gw.id) {
    el.innerHTML = html`<svg class="ring" viewBox="0 0 26 26" aria-hidden="true"><circle class="track" cx="13" cy="13" r="10"/><circle class="fill" cx="13" cy="13" r="10" stroke-dasharray="62.83" stroke-dashoffset="62.83"/></svg>
      <span class="lbl"><small>${t('clock.closes', { gw: s.gw.id })}</small><span class="digits" aria-hidden="true"></span></span>`.s;
    clock.phase = phase;
    clock.gw = s.gw.id;
  }
  el.dataset.phase = phase;
  renderDigits(el.querySelector('.digits'), clockParts(left));
  const span = s.prevDeadline ? s.gw.deadline - s.prevDeadline : 7 * 864e5;
  const done = Math.min(1, Math.max(0, 1 - left / span));
  el.querySelector('.fill').style.strokeDashoffset = String(62.83 * (1 - done));
  const label = `${t('clock.closes', { gw: s.gw.id })} ${clockParts(left).map(([n, u]) => n + (u === ':' ? '' : u)).join(' ')}`;
  if (clock.text !== label && left % 60000 < 1000) el.setAttribute('aria-label', label);
  clock.text = label;
  setBanner(left < 600e3 ? left : null);
}

/** Big "locks in" strip during the last 10 minutes. */
function setBanner(left) {
  let b = $('.final-banner');
  if (left == null) {
    if (b) { b.remove(); document.documentElement.style.setProperty('--banner', '0px'); }
    return;
  }
  if (!b) {
    b = document.createElement('div');
    b.className = 'final-banner';
    b.setAttribute('role', 'status');
    $('.topbar').after(b);
    document.documentElement.style.setProperty('--banner', '36px');
  }
  const [m, s] = [Math.floor(left / 60000), Math.floor((left % 60000) / 1000)];
  b.textContent = t('clock.final', { gw: store.state.gw.id, time: `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` });
}

function ics(gw, deadline) {
  const fmt = (ms) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const body = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//SquadJury//EN', 'BEGIN:VEVENT',
    `UID:gw${gw}-deadline@squadjury.com`, `DTSTAMP:${fmt(Date.now())}`,
    `DTSTART:${fmt(deadline - 3600e3)}`, `DTEND:${fmt(deadline)}`,
    `SUMMARY:GW${gw} FPL deadline: last call on SquadJury`,
    'DESCRIPTION:Post your squad and give your verdicts before the deadline. https://squadjury.com',
    'BEGIN:VALARM', 'TRIGGER:-PT0M', 'ACTION:DISPLAY', 'DESCRIPTION:FPL deadline in 1 hour', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([body], { type: 'text/calendar' }));
  a.download = `squadjury-gw${gw}-deadline.ics`;
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

function openClockSheet() {
  const s = store.state;
  if (!s.gw) return;
  const d = new Date(s.gw.deadline);
  const when = d.toLocaleString(undefined, { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
  const sh = sheet(
    html`<h2>GW${s.gw.id} ${t('clock.deadline')}</h2>
      <p class="big-time">${d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</p>
      <p>${when}. ${t('clock.sheetText')}</p>
      <button class="btn btn-go btn-block" id="ics">${raw(ICONS.calendar)}${t('clock.addCal')}</button>`,
    { label: t('clock.deadline') },
  );
  $('#ics', sh.el).onclick = () => { ics(s.gw.id, s.gw.deadline); sh.close(); };
}

// ============================================================ splash and intro

function splash() {
  try {
    if (reduceMotion() || sessionStorage.getItem('sj-splash')) return;
    sessionStorage.setItem('sj-splash', '1');
  } catch { return; }
  const el = document.createElement('div');
  el.className = 'splash';
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = '<img src="/img/logo/mark.svg" alt="">';
  document.body.append(el);
  setTimeout(() => el.remove(), 1100);
}

function intro() {
  try {
    if (localStorage.getItem('sj-intro') || navigator.webdriver) return;
  } catch { return; }
  import('./views/intro.js').then((m) => m.showIntro()).catch(() => {});
}

// ============================================================ wiring

// Internal links go through the router.
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href]');
  if (!a || e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || a.target === '_blank') return;
  const url = new URL(a.href, location.href);
  if (url.origin !== location.origin || url.pathname.startsWith('/u/') || a.hasAttribute('download')) return;
  e.preventDefault();
  navigate(url.pathname + url.search);
});
addEventListener('popstate', render);

function offlineBanner() {
  let b = $('.offline');
  if (navigator.onLine) return b?.remove();
  if (!b) {
    b = document.createElement('div');
    b.className = 'offline';
    b.setAttribute('role', 'status');
    b.textContent = t('err.offline');
    document.body.append(b);
  }
}
addEventListener('online', offlineBanner);
addEventListener('offline', offlineBanner);

store.subscribe(() => { renderTabs(); tickClock(); });

let leaving = false;
addEventListener('beforeunload', () => { leaving = true; });
addEventListener('pageshow', () => { leaving = false; });

(async function boot() {
  splash();
  // Squad data is needed by almost every screen: fetch it while the state loads.
  if (!location.pathname.startsWith('/admin')) import('./fpl.js').then((m) => m.loadFpl()).catch(() => {});
  $('#clock').addEventListener('click', openClockSheet);
  try {
    await refreshState();
  } catch {
    store.set({ loaded: true });
  }
  tickClock();
  setInterval(tickClock, 1000);
  offlineBanner();
  await render();
  intro();
  if ('serviceWorker' in navigator && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
})();

export const _lastRank = () => lastRank;
