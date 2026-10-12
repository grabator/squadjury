// Leaderboard: a podium for the top 3, then the table. Live gameweek, past gameweeks
// (top 10), champions and the season table. Pull down to refresh on phones.

import { t } from '../i18n.js';
import { html, raw, $, $$, errText, ICONS, reduceMotion, avatar, haptic } from '../ui.js';
import { api } from '../api.js';
import { store } from '../store.js';
import { loadFpl } from '../fpl.js';

let root, timer, observer, tab, updatedAt = 0, ageTimer;

export async function mount(el) {
  root = el;
  const q = new URLSearchParams(location.search);
  tab = q.get('tab') || (q.get('gw') ? `gw${q.get('gw')}` : 'live');
  el.innerHTML = html`<div class="ptr" id="ptr" aria-hidden="true">${raw(ICONS.refresh)}</div>
    <div class="lb-head"><h1 class="title">${t('lb.title')}</h1><span id="lbmeta"></span></div>
    <div class="lb-tabs" role="tablist" id="lbtabs" aria-label="${t('lb.title')}"></div>
    <div id="lbbody" role="tabpanel"><div class="skeleton" style="height:420px"></div></div>
    <div id="sticky"></div>`.s;
  await load();
  timer = setInterval(() => tab === 'live' && document.visibilityState === 'visible' && load(true), 20000);
  ageTimer = setInterval(age, 5000);
  pullToRefresh();
}

export function unmount() {
  clearInterval(timer);
  clearInterval(ageTimer);
  observer?.disconnect();
  window.removeEventListener('touchstart', ptr.start);
  window.removeEventListener('touchmove', ptr.move);
  window.removeEventListener('touchend', ptr.end);
}

function age() {
  const m = $('#lbmeta', root);
  if (!m) return;
  if (tab !== 'live' || !updatedAt) { m.innerHTML = ''; return; }
  const s = Math.round((Date.now() - updatedAt) / 1000);
  m.innerHTML = html`<span class="live-badge"><i></i>LIVE</span> <span class="updated">${s < 5 ? t('lb.justNow') : t('lb.ago', { s })}</span>`.s;
}

function tabsHtml(gameweeks, open) {
  const tabs = [];
  if (open) tabs.push({ id: 'live', label: raw(`<span class="live-dot" aria-hidden="true"></span>${html`${t('lb.live', { gw: open })}`.s}`) });
  for (const g of gameweeks) if (g.status === 'locked') tabs.push({ id: `gw${g.id}`, label: t('lb.gw', { gw: g.id }) });
  tabs.push({ id: 'champions', label: raw(`${ICONS.trophy.replace('<svg', '<svg style="width:16px;height:16px"')}${html`${t('lb.champions')}`.s}`) }, { id: 'season', label: t('lb.season') });
  return tabs.map((x) => html`<button type="button" role="tab" class="lb-tab" data-tab="${x.id}" aria-selected="${String(x.id === tab)}">${x.label}</button>`.s).join('');
}

async function load(quiet = false) {
  const body = $('#lbbody', root);
  try {
    if (tab === 'champions') return renderChampions(await api('/api/champions'), await gwList());
    if (tab === 'season') return renderSeason(await api('/api/season'), await gwList());
    const gw = tab.startsWith('gw') ? +tab.slice(2) : '';
    const lb = await api(`/api/leaderboard${gw ? `?gw=${gw}` : ''}`);
    renderTabs(lb.gameweeks, lb.live ? lb.gw : store.state.gw?.id);
    renderBoard(lb, quiet);
    updatedAt = Date.now();
    age();
  } catch (e) {
    body.innerHTML = html`<div class="empty"><h2>${t('err.generic')}</h2><p>${errText(e)}</p><button class="btn" id="retry">${t('err.tryAgain')}</button></div>`.s;
    $('#retry', body).onclick = () => load();
  }
}

let gwCache = null;
async function gwList() {
  if (!gwCache) gwCache = (await api('/api/leaderboard')).gameweeks;
  renderTabs(gwCache, store.state.gw?.id);
  age();
  return gwCache;
}

function renderTabs(gameweeks, open) {
  gwCache = gameweeks;
  const box = $('#lbtabs', root);
  box.innerHTML = tabsHtml(gameweeks, open);
  $$('.lb-tab', box).forEach((b) =>
    b.addEventListener('click', () => {
      tab = b.dataset.tab;
      history.replaceState({ keepScroll: true }, '', tab === 'live' ? '/leaderboard' : `/leaderboard?tab=${tab}`);
      $('#lbbody', root).innerHTML = '<div class="skeleton" style="height:420px"></div>';
      load();
    }),
  );
  box.querySelector('[aria-selected="true"]')?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
}

// Rank changes since the last load, per gameweek (shown as small arrows).
function deltas(lb) {
  const key = `sj-ranks-${lb.gw}`;
  let prev = {};
  try { prev = JSON.parse(sessionStorage.getItem(key) || '{}'); } catch {}
  const now = Object.fromEntries(lb.ranked.map((r) => [r.key, r.rank]));
  try { sessionStorage.setItem(key, JSON.stringify(now)); } catch {}
  return (r) => (prev[r.key] ? prev[r.key] - r.rank : 0);
}

function rowHtml(r, { pending = false, delta = 0 } = {}) {
  const sub = pending
    ? r.needsVotes ? t('lb.needs', { n: r.needsVotes }) : t('lb.needsJudge', { n: r.needsJudged })
    : t('lb.votes', { n: r.votes });
  const d = delta > 0 ? html`<span class="delta up" aria-label="up ${delta}">▲${delta}</span>` : delta < 0 ? html`<span class="delta down" aria-label="down ${-delta}">▼${-delta}</span>` : '';
  return html`<li class="${r.mine ? 'me' : ''} ${pending ? 'pending' : ''}" data-key="${r.key}">
    <a href="/t/${r.key}"><span class="pos">${pending ? '-' : r.rank}</span>${avatar(r.nickname)}
      <span class="who"><b>${r.nickname}${r.mine ? ` (${t('lb.you')})` : ''}</b><small>${sub}${r.demo ? html` <span class="tag tag-demo">${t('judge.exampleShort')}</span>` : ''}</small>
        ${!pending && r.votes ? html`<span class="bar" aria-hidden="true"><i style="width:${r.avg * 10}%"></i></span>` : ''}</span>
      <span class="score"><span class="num">${r.votes ? r.avg.toFixed(1) : '-'}</span>${d}</span></a></li>`;
}

function podiumHtml(top) {
  const order = [top[1], top[0], top[2]].filter(Boolean);
  return html`<div class="podium" aria-label="Top 3">${order.map((r) => html`
    <a class="pod p${r.rank}" href="/t/${r.key}">
      ${r.rank === 1 ? raw(ICONS.trophy.replace('<svg', '<svg style="width:22px;height:22px;color:var(--gold)"')) : ''}
      ${avatar(r.nickname)}
      <span class="nm">${r.nickname}</span>
      <span class="block"><span class="place">#${r.rank}</span><span class="num">${r.avg.toFixed(1)}</span><small>${t('lb.votes', { n: r.votes })}</small></span>
    </a>`)}</div>`;
}

function renderBoard(lb, quiet) {
  const body = $('#lbbody', root);
  const delta = deltas(lb);
  // FLIP: remember where rows were, then animate them to their new places.
  const before = new Map($$('.board li', body).map((li) => [li.dataset.key, li.getBoundingClientRect().top]));
  const top = lb.ranked.slice(0, 3);
  const rest = lb.ranked.slice(top.length === 3 ? 3 : 0);
  const ranked = lb.ranked.length
    ? html`${top.length === 3 ? podiumHtml(top) : ''}<ol class="board" aria-label="${lb.live ? t('lb.live', { gw: lb.gw }) : t('lb.top10')}">${rest.map((r) => rowHtml(r, { delta: quiet ? delta(r) : 0 }))}</ol>`
    : html`<div class="empty"><h2>${t('lb.emptyTitle')}</h2><p>${t('lb.empty')}</p><a class="btn btn-go" href="/">${t('nav.judge')}</a></div>`;
  const pending = lb.pending?.length
    ? html`<h2 class="board-sub">${t('lb.waiting')}</h2><ol class="board">${lb.pending.map((r) => rowHtml(r, { pending: true }))}</ol>`
    : '';
  body.innerHTML = html`${!lb.live ? html`<p class="sub" style="margin-bottom:6px">${t('lb.final')}: ${t('lb.top10')}, GW${lb.gw}</p>` : ''}${ranked}${pending}`.s;
  if (quiet && !reduceMotion()) {
    for (const li of $$('.board li', body)) {
      const old = before.get(li.dataset.key);
      if (old == null) continue;
      const dy = old - li.getBoundingClientRect().top;
      if (!dy) continue;
      li.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: 500, easing: 'cubic-bezier(.34,1.56,.64,1)' });
    }
  }
  sticky(lb.me, body);
}

/** "You: #34" pinned above the tab bar when your row is off screen. */
function sticky(me, body) {
  observer?.disconnect();
  const box = $('#sticky', root);
  box.innerHTML = '';
  if (!me) return;
  const row = $('.board li.me', body) || $('.pod', body)?.closest('.podium')?.querySelector(`[href="/t/${me.key}"]`);
  const pill = html`<div class="stickyme"><a href="/t/${me.key}"><span class="pos">${me.rank ?? '-'}</span><span>${t('lb.you')}: ${me.nickname}</span><span class="num">${me.votes ? me.avg.toFixed(1) : '-'}</span></a></div>`.s;
  if (!row) { box.innerHTML = pill; return; }
  observer = new IntersectionObserver(([e]) => { box.innerHTML = e.isIntersecting ? '' : pill; });
  observer.observe(row);
}

async function renderChampions({ champions }) {
  $('#sticky', root).innerHTML = '';
  let fpl = null;
  try { fpl = await loadFpl(); } catch {}
  const date = (gw) => {
    const e = fpl?.events.find((x) => x.id === gw);
    return e ? new Date(e.deadline_time).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '';
  };
  $('#lbbody', root).innerHTML = champions.length
    ? html`<div class="champs">${champions.map((c) => html`
        <a class="champ" href="/t/${c.key}"><span>${raw(ICONS.trophy.replace('<svg', '<svg class="trophy"'))}</span>
          <span><span class="gw">GW${c.gw} ${t('lb.champion')}</span><br><b>${c.nickname}</b> ${c.demo ? html`<span class="tag tag-demo">${t('judge.exampleShort')}</span>` : ''}<br><small>${date(c.gw)}, ${t('lb.votes', { n: c.votes })}</small></span>
          <span class="num">${c.avg.toFixed(1)}</span></a>`)}</div>`.s
    : html`<div class="empty"><h2>${t('lb.champions')}</h2><p>${t('lb.championsEmpty')}</p></div>`.s;
}

function renderSeason({ season }) {
  $('#sticky', root).innerHTML = '';
  $('#lbbody', root).innerHTML = season.length
    ? html`<ol class="board">${season.map((r) => html`<li class="${r.mine ? 'me' : ''}"><div class="r">
        <span class="pos" style="${r.place <= 3 ? `color:var(--${['gold', 'silver', 'bronze'][r.place - 1]})` : ''}">${r.place}</span>${avatar(r.nickname)}
        <span class="who"><b>${r.nickname}</b><small>${r.wins ? `🥇×${r.wins} · ` : ''}${t('lb.seasonCols', { top10: r.top10, best: r.best })}${r.demo ? html` <span class="tag tag-demo">${t('judge.exampleShort')}</span>` : ''}</small></span>
        <span class="score"><span class="num">${r.top10}</span><small>${t('lb.top10')}</small></span></div></li>`)}</ol>`.s
    : html`<div class="empty"><h2>${t('lb.season')}</h2><p>${t('lb.seasonEmpty')}</p></div>`.s;
}

// Pull to refresh (phones): drag down from the top of the page.
const ptr = {};
function pullToRefresh() {
  let y0 = null, dy = 0;
  const el = $('#ptr', root);
  ptr.start = (e) => { if (window.scrollY <= 0 && !e.target.closest('.lb-tabs')) { y0 = e.touches[0].clientY; dy = 0; } };
  ptr.move = (e) => {
    if (y0 == null) return;
    dy = Math.max(0, e.touches[0].clientY - y0);
    el.style.height = `${Math.min(70, dy * 0.5)}px`;
    el.classList.toggle('ready', dy > 110);
  };
  ptr.end = async () => {
    if (y0 == null) return;
    y0 = null;
    if (dy > 110) {
      haptic(15);
      el.classList.add('spin');
      el.style.height = '44px';
      await load(true);
      el.classList.remove('spin');
    }
    el.classList.remove('ready');
    el.style.height = '0';
  };
  window.addEventListener('touchstart', ptr.start, { passive: true });
  window.addEventListener('touchmove', ptr.move, { passive: true });
  window.addEventListener('touchend', ptr.end);
}
