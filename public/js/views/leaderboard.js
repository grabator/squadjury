// Leaderboard: one clean list. The live gameweek, past gameweeks (final top 10) and the season.
// Your row is marked in yellow and stays pinned above the menu when it is off screen.

import { t } from '../i18n.js';
import { html, $, $$, errText } from '../ui.js';
import { api } from '../api.js';
import { store } from '../store.js';

const PAGE = 50;
let root, timer, observer, tab, updatedAt = 0, ageTimer, shown = PAGE, last = null;

export async function mount(el) {
  root = el;
  const q = new URLSearchParams(location.search);
  tab = q.get('tab') || (q.get('gw') ? `gw${q.get('gw')}` : 'live');
  shown = PAGE;
  el.innerHTML = html`<div class="lb-head"><h1 class="title">${t('lb.title')}</h1><span class="updated" id="lbmeta"></span></div>
    <div class="lb-tabs" role="tablist" id="lbtabs" aria-label="${t('lb.title')}"></div>
    <div id="lbbody" role="tabpanel"><div class="skeleton" style="height:420px"></div></div>
    <div id="sticky"></div>`.s;
  await load();
  timer = setInterval(() => tab === 'live' && document.visibilityState === 'visible' && load(true), 20000);
  ageTimer = setInterval(age, 5000);
}

export function unmount() {
  clearInterval(timer);
  clearInterval(ageTimer);
  observer?.disconnect();
}

function age() {
  const m = $('#lbmeta', root);
  if (!m) return;
  if (tab !== 'live' || !updatedAt) { m.textContent = ''; return; }
  const s = Math.round((Date.now() - updatedAt) / 1000);
  m.textContent = s < 5 ? t('lb.justNow') : t('lb.ago', { s });
}

let gwCache = null;
function renderTabs(gameweeks, open) {
  gwCache = gameweeks;
  const tabs = [];
  if (open) tabs.push({ id: 'live', label: t('lb.live', { gw: open }) });
  for (const g of gameweeks) if (g.status === 'locked') tabs.push({ id: `gw${g.id}`, label: t('lb.gw', { gw: g.id }) });
  tabs.push({ id: 'season', label: t('lb.season') });
  const box = $('#lbtabs', root);
  box.innerHTML = tabs.map((x) => html`<button type="button" role="tab" class="lb-tab" data-tab="${x.id}" aria-selected="${String(x.id === tab)}">${x.label}</button>`.s).join('');
  $$('.lb-tab', box).forEach((b) =>
    b.addEventListener('click', () => {
      tab = b.dataset.tab;
      shown = PAGE;
      history.replaceState({ keepScroll: true }, '', tab === 'live' ? '/leaderboard' : `/leaderboard?tab=${tab}`);
      $('#lbbody', root).innerHTML = '<div class="skeleton" style="height:420px"></div>';
      load();
    }),
  );
  box.querySelector('[aria-selected="true"]')?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
}

async function load(quiet = false) {
  const body = $('#lbbody', root);
  try {
    if (tab === 'season') {
      if (!gwCache) gwCache = (await api('/api/leaderboard')).gameweeks;
      renderTabs(gwCache, store.state.gw?.id);
      age();
      return renderSeason(await api('/api/season'));
    }
    const gw = tab.startsWith('gw') ? +tab.slice(2) : '';
    const lb = await api(`/api/leaderboard${gw ? `?gw=${gw}` : ''}`);
    if (!quiet || !gwCache) renderTabs(lb.gameweeks, lb.live ? lb.gw : store.state.gw?.id);
    last = lb;
    renderBoard(lb);
    updatedAt = Date.now();
    age();
  } catch (e) {
    body.innerHTML = html`<div class="empty"><h2>${t('err.generic')}</h2><p>${errText(e)}</p><button class="btn" id="retry">${t('err.tryAgain')}</button></div>`.s;
    $('#retry', body).onclick = () => load();
  }
}

function rowHtml(r, { pending = false } = {}) {
  const sub = pending
    ? r.needsVotes ? t('lb.needs', { n: r.needsVotes }) : t('lb.needsJudge', { n: r.needsJudged })
    : r.x ? `@${r.x}` : '';
  const place = !pending && r.rank <= 3 ? `p${r.rank}` : '';
  return html`<li class="${r.mine ? 'me' : ''} ${place}" data-key="${r.key}">
    <a href="/t/${r.key}"><span class="pos">${pending ? '-' : r.rank}</span>
      <span class="who"><b>${r.nickname}${r.mine ? ` (${t('lb.you')})` : ''}${r.demo ? html`<span class="tag">${t('judge.exampleShort')}</span>` : ''}</b>${sub ? html`<span>${sub}</span>` : ''}</span>
      <span class="score"><span class="num">${r.votes ? r.avg.toFixed(1) : '-'}</span><small>${t('lb.votes', { n: r.votes })}</small></span></a></li>`;
}

function renderBoard(lb) {
  const body = $('#lbbody', root);
  const list = lb.ranked.slice(0, shown);
  const ranked = lb.ranked.length
    ? html`<ol class="board" aria-label="${lb.live ? t('lb.live', { gw: lb.gw }) : t('lb.top10')}">${list.map((r) => rowHtml(r))}</ol>
      ${lb.ranked.length > shown ? html`<button class="btn btn-ghost more" id="more">${t('lb.more')}</button>` : ''}`
    : html`<div class="empty"><span class="ycard"></span><h2>${t('lb.emptyTitle')}</h2><p>${t('lb.empty')}</p><a class="btn btn-go" href="/">${t('nav.judge')}</a></div>`;
  const pending = lb.pending?.length
    ? html`<h2 class="board-sub">${t('lb.waiting')}</h2><ol class="board pending">${lb.pending.map((r) => rowHtml(r, { pending: true }))}</ol>`
    : '';
  body.innerHTML = html`${!lb.live ? html`<p class="sub" style="margin:0 0 10px">${t('lb.final')}: ${t('lb.top10')}, GW${lb.gw}</p>` : ''}${ranked}${pending}`.s;
  $('#more', body)?.addEventListener('click', () => { shown += PAGE; renderBoard(last); });
  sticky(lb.me, body);
}

/** Your row pinned above the menu while the real one is off screen. */
function sticky(me, body) {
  observer?.disconnect();
  const box = $('#sticky', root);
  box.innerHTML = '';
  if (!me) return;
  const row = $('.board li.me', body);
  const pill = html`<div class="stickyme"><a href="/t/${me.key}"><span class="pos">${me.rank ?? '-'}</span><span>${t('lb.you')}: ${me.nickname}</span><span class="num">${me.votes ? me.avg.toFixed(1) : '-'}</span></a></div>`.s;
  if (!row) { box.innerHTML = pill; return; }
  observer = new IntersectionObserver(([e]) => { box.innerHTML = e.isIntersecting ? '' : pill; });
  observer.observe(row);
}

function renderSeason({ season }) {
  $('#sticky', root).innerHTML = '';
  $('#lbbody', root).innerHTML = season.length
    ? html`<ol class="board">${season.map((r) => html`<li class="${r.mine ? 'me' : ''} ${r.place <= 3 ? `p${r.place}` : ''}"><div class="r">
        <span class="pos">${r.place}</span>
        <span class="who"><b>${r.nickname}${r.demo ? html`<span class="tag">${t('judge.exampleShort')}</span>` : ''}</b><span>${t('lb.seasonCols', { wins: r.wins || 0, best: r.best })}</span></span>
        <span class="score"><span class="num">${r.top10}</span><small>${t('lb.top10')}</small></span></div></li>`)}</ol>`.s
    : html`<div class="empty"><h2>${t('lb.season')}</h2><p>${t('lb.seasonEmpty')}</p></div>`.s;
}
