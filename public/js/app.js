// SquadJury app shell: router, top bar countdown, tab bar, footer.

import { t } from './i18n.js';
import { $, html, raw, ICONS, fmtCountdown, esc } from './ui.js';
import { nowMs } from './api.js';
import { store, refreshState } from './store.js';

const routes = [
  [/^\/$/, () => import('./views/judge.js')],
  [/^\/leaderboard\/?$/, () => import('./views/leaderboard.js')],
  [/^\/post\/?$/, () => import('./views/post.js')],
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
  let mod, params = [];
  for (const [re, load] of routes) {
    const m = path.match(re);
    if (m) { mod = await load(); params = m.slice(1); break; }
  }
  if (!mod) mod = await import('./views/pages.js'), (params = ['404']);
  if (id !== renderId) return; // a newer navigation started while this one was loading
  current?.unmount?.();
  current = mod;
  renderTabs();
  app.innerHTML = '';
  const view = document.createElement('div');
  view.className = 'view';
  app.append(view);
  try {
    await mod.mount(view, ...params);
  } catch (e) {
    console.error(e);
    view.innerHTML = html`<div class="empty"><h2>${t('err.generic')}</h2><button class="btn" onclick="location.reload()">${t('err.tryAgain')}</button></div>`.s;
  }
  if (id !== renderId) return;
  app.querySelector('.footer')?.remove();
  app.insertAdjacentHTML('beforeend', footerHtml());
  if (!history.state?.keepScroll) window.scrollTo(0, 0);
}

function footerHtml() {
  return html`<footer class="footer"><nav aria-label="About">
      <a href="/how">${t('page.how')}</a><a href="/rules">${t('page.rules')}</a><a href="/privacy">${t('page.privacy')}</a></nav>
      <p>${t('footer.fan')}</p></footer>`.s;
}

function renderTabs() {
  const s = store.state;
  const path = location.pathname;
  const mine = s.mine;
  const items = [
    { href: '/', icon: ICONS.judge, label: t('nav.judge'), on: path === '/' },
    { href: '/leaderboard', icon: ICONS.board, label: t('nav.leaderboard'), on: path.startsWith('/leaderboard') },
    mine
      ? { href: '/squad', icon: ICONS.shirt, label: t('nav.mySquad'), on: path.startsWith('/squad'), badge: mine.avg != null ? mine.avg.toFixed(1) : null }
      : { href: '/post', icon: ICONS.post, label: t('nav.post'), on: path.startsWith('/post') },
    { href: '/me', icon: ICONS.me, label: t('nav.me'), on: path.startsWith('/me') },
  ];
  $('#tabs').innerHTML = items
    .map((i) => html`<a class="tab" href="${i.href}" ${raw(i.on ? 'aria-current="page"' : '')}>${raw(i.icon)}<span>${i.label}</span>${i.badge ? html`<span class="badge" aria-label="score ${i.badge}">${i.badge}</span>` : ''}</a>`.s)
    .join('');
}

function tickClock() {
  const el = $('#clock');
  const s = store.state;
  if (!s.loaded) return;
  if (!s.gw) {
    el.textContent = t('clock.season');
    el.classList.remove('urgent');
    return;
  }
  const left = s.gw.deadline - nowMs();
  if (left <= 0) {
    el.textContent = t('clock.closed');
    // The next gameweek opens as soon as the server sees the deadline pass.
    if (!tickClock.refreshing) {
      tickClock.refreshing = true;
      setTimeout(() => refreshState().finally(() => { tickClock.refreshing = false; render(); }), 1500);
    }
    return;
  }
  el.innerHTML = `${esc(t('clock.closes', { gw: s.gw.id }))} <b>${esc(fmtCountdown(left))}</b>`;
  el.classList.toggle('urgent', left < 3600e3);
}

// Internal links go through the router.
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href]');
  if (!a || e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || a.target === '_blank') return;
  const url = new URL(a.href, location.href);
  if (url.origin !== location.origin || url.pathname.startsWith('/img/') || a.hasAttribute('download')) return;
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

(async function boot() {
  try {
    await refreshState();
  } catch {
    store.set({ loaded: true });
  }
  tickClock();
  setInterval(tickClock, 1000);
  offlineBanner();
  await render();
  if ('serviceWorker' in navigator && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
})();
