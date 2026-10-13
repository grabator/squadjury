// SquadJury app shell: router, the deadline in the header and the menu.

import { t } from './i18n.js';
import { $, html, raw, ICONS, sheet } from './ui.js';
import { nowMs } from './api.js';
import { store, refreshState } from './store.js';

const routes = [
  [/^\/$/, () => import('./views/judge.js'), 'fit'],
  [/^\/leaderboard\/?$/, () => import('./views/leaderboard.js')],
  [/^\/post\/?$/, () => import('./views/post.js'), 'fit-post'],
  [/^\/squad\/?$/, () => import('./views/squad.js')],
  [/^\/me\/?$/, () => import('./views/me.js')],
  [/^\/me\/verdicts\/?$/, () => import('./views/verdicts.js')],
  [/^\/t\/([A-Za-z0-9_-]{4,20})\/?$/, () => import('./views/team.js')],
  [/^\/r\/([A-Za-z0-9_-]{4,20})\/?$/, () => import('./views/rate.js')],
  [/^\/l\/([A-Za-z0-9]{6})\/?$/, () => import('./views/league.js')],
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

// ============================================================ menu

function renderTabs() {
  const s = store.state;
  const path = location.pathname;
  const mine = s.mine;
  const rank = mine?.place?.rank;
  const items = [
    { href: '/', icon: ICONS.judge, label: t('nav.judge'), on: path === '/' },
    { href: '/leaderboard', icon: ICONS.board, label: t('nav.leaderboard'), on: path.startsWith('/leaderboard') },
    mine
      ? { href: '/squad', icon: ICONS.shirt, label: t('nav.mySquad'), on: path.startsWith('/squad'), badge: rank ? `#${rank}` : null }
      : { href: '/post', icon: ICONS.post, label: t('nav.post'), on: path.startsWith('/post') },
    { href: '/me', icon: ICONS.me, label: t('nav.me'), on: path.startsWith('/me') },
  ];
  $('#tabs').innerHTML = items
    .map((i) => html`<a class="tab" href="${i.href}" ${raw(i.on ? 'aria-current="page"' : '')}>${raw(i.icon)}<span>${i.label}</span>${i.badge ? html`<span class="badge" aria-label="${t('lb.title')} ${i.badge}">${i.badge}</span>` : ''}</a>`.s)
    .join('');
}

// ============================================================ match clock

const clock = { text: '', locked: false };

/** "5d 01h", "3h 12m", or "42m 05s" in the final hour. */
function left(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const p2 = (n) => String(n).padStart(2, '0');
  if (d) return `${d}d ${p2(h)}h`;
  if (h) return `${h}h ${p2(m)}m`;
  return `${m}m ${p2(sec)}s`;
}

function tickClock() {
  const el = $('#clock');
  const s = store.state;
  if (!s.loaded || !el) return;
  let text, hot = false;
  if (!s.gw) text = html`${t('clock.season')}`.s;
  else {
    const ms = s.gw.deadline - nowMs();
    if (ms <= 0) {
      text = html`GW${s.gw.id} <b>${t('clock.locked')}</b>`.s;
      if (!clock.locked) {
        clock.locked = true;
        // The next gameweek opens as soon as the server sees the deadline pass.
        setTimeout(() => refreshState().finally(() => { clock.locked = false; render(); }), 2000);
      }
    } else {
      hot = ms < 3600e3;
      text = html`${t('clock.closes', { gw: s.gw.id })} <b>${left(ms)}</b>`.s;
    }
  }
  if (text === clock.text) return;
  clock.text = text;
  el.innerHTML = text;
  el.classList.toggle('hot', hot);
  el.setAttribute('aria-label', el.textContent);
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

// Remember which link brought a new visitor here (channel and squad), for the first sign in.
(function rememberRef() {
  const m = location.pathname.match(/^\/(r|t)\/([A-Za-z0-9_-]{4,20})/);
  const lg = location.pathname.match(/^\/l\/([A-Za-z0-9]{6})/);
  const src = new URLSearchParams(location.search).get('s');
  if (!m && !lg && !src) return;
  try {
    if (!sessionStorage.getItem('sj-ref')) sessionStorage.setItem('sj-ref', JSON.stringify({ key: m?.[2] || null, league: lg?.[1] || null, s: src || null }));
  } catch {}
})();

(async function boot() {
  // Squad data is needed by almost every screen: fetch it while the state loads.
  if (!location.pathname.startsWith('/admin')) import('./fpl.js').then((m) => m.loadFpl()).catch(() => {});
  // On the Judge screen the first squads are fetched alongside, not after, the rest.
  if (location.pathname === '/') import('./views/judge.js').then((m) => m.prefetch()).catch(() => {});
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
  // First visit: a short intro that says what this is.
  import('./intro.js').then((m) => m.showIntro()).catch(() => {});
  if ('serviceWorker' in navigator && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
})();

