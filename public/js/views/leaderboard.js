// Leaderboard: live gameweek, past gameweeks (top 10), champions and the season table.

import { t } from '../i18n.js';
import { html, raw, $, $$, errText, ICONS, reduceMotion } from '../ui.js';
import { api } from '../api.js';
import { store } from '../store.js';

let root, timer, observer, tab;

export async function mount(el) {
  root = el;
  const q = new URLSearchParams(location.search);
  tab = q.get('tab') || (q.get('gw') ? `gw${q.get('gw')}` : 'live');
  el.innerHTML = html`<div class="page-head"><h1 class="title">${t('lb.title')}</h1></div>
    <div class="lb-tabs" role="tablist" id="lbtabs" aria-label="${t('lb.title')}"></div>
    <div id="lbbody" role="tabpanel"><div class="skeleton" style="height:420px"></div></div>
    <div id="sticky"></div>`.s;
  await load();
  timer = setInterval(() => tab === 'live' && document.visibilityState === 'visible' && load(true), 20000);
}

export function unmount() {
  clearInterval(timer);
  observer?.disconnect();
}

function tabsHtml(gameweeks, open) {
  const tabs = [];
  if (open) tabs.push({ id: 'live', label: raw(`<span class="live-dot" aria-hidden="true"></span>${html`${t('lb.live', { gw: open })}`.s}`) });
  for (const g of gameweeks) if (g.status === 'locked') tabs.push({ id: `gw${g.id}`, label: t('lb.gw', { gw: g.id }) });
  tabs.push({ id: 'champions', label: t('lb.champions') }, { id: 'season', label: t('lb.season') });
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
  } catch (e) {
    body.innerHTML = html`<div class="empty"><h2>${t('err.generic')}</h2><p>${errText(e)}</p></div>`.s;
  }
}

let gwCache = null;
async function gwList() {
  if (!gwCache) gwCache = (await api('/api/leaderboard')).gameweeks;
  renderTabs(gwCache, store.state.gw?.id);
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

function rowHtml(r, { pending = false } = {}) {
  const sub = pending
    ? r.needsVotes ? t('lb.needs', { n: r.needsVotes }) : t('lb.needsJudge', { n: r.needsJudged })
    : t('lb.votes', { n: r.votes });
  return html`<li class="${r.rank && r.rank <= 3 ? `p${r.rank}` : ''} ${r.mine ? 'me' : ''} ${pending ? 'pending' : ''}" data-key="${r.key}">
    <a href="/t/${r.key}"><span class="pos">${pending ? '-' : r.rank}</span>
      <span class="who"><b>${r.nickname}${r.mine ? ` (${t('lb.you')})` : ''}</b><small>${sub}${r.demo ? html` <span class="tag tag-demo">${t('judge.example')}</span>` : ''}</small></span>
      <span class="score"><span class="num">${r.votes ? r.avg.toFixed(1) : '-'}</span></span></a></li>`;
}

function renderBoard(lb, quiet) {
  const body = $('#lbbody', root);
  // FLIP: remember where rows were, then animate them to their new places.
  const before = new Map($$('.board li', body).map((li) => [li.dataset.key, li.getBoundingClientRect().top]));
  const ranked = lb.ranked.length
    ? html`<ol class="board" aria-label="${lb.live ? t('lb.live', { gw: lb.gw }) : t('lb.top10')}">${lb.ranked.map((r) => rowHtml(r))}</ol>`
    : html`<p class="sub" style="padding:24px 0">${t('lb.empty')}</p>`;
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
      li.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: 450, easing: 'cubic-bezier(.2,.8,.2,1)' });
    }
  }
  sticky(lb.me, body);
}

/** "You: #34" pinned at the bottom when your row is off screen. */
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

function renderChampions({ champions }) {
  $('#sticky', root).innerHTML = '';
  $('#lbbody', root).innerHTML = champions.length
    ? html`<div class="champs">${champions.map((c) => html`
        <a class="champ" href="/t/${c.key}"><span>${raw(ICONS.trophy.replace('<svg', '<svg class="trophy" style="color:var(--gold)"'))}</span>
          <span><span class="gw">GW${c.gw}</span><br><b>${c.nickname}</b> ${c.demo ? html`<span class="tag tag-demo">${t('judge.example')}</span>` : ''}<br><small style="color:var(--faint)">${t('lb.votes', { n: c.votes })}</small></span>
          <span class="num">${c.avg.toFixed(1)}</span></a>`)}</div>`.s
    : html`<p class="sub" style="padding:24px 0">${t('lb.championsEmpty')}</p>`.s;
}

function renderSeason({ season }) {
  $('#sticky', root).innerHTML = '';
  $('#lbbody', root).innerHTML = season.length
    ? html`<ol class="board">${season.map((r) => html`<li class="${r.place <= 3 ? `p${r.place}` : ''} ${r.mine ? 'me' : ''}"><div class="r">
        <span class="pos">${r.place}</span>
        <span class="who"><b>${r.nickname}</b><small>${t('lb.seasonCols', { top10: r.top10, best: r.best })}${r.demo ? html` <span class="tag tag-demo">${t('judge.example')}</span>` : ''}</small></span>
        <span class="score"><span class="num">${r.top10}</span><small>${t('lb.top10')}</small></span></div></li>`)}</ol>`.s
    : html`<p class="sub" style="padding:24px 0">${t('lb.seasonEmpty')}</p>`.s;
}
