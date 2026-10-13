// Leaderboard: one clean list. The live gameweek, past gameweeks (final top 10) and the season.
// Your row is marked in yellow and stays pinned above the menu when it is off screen.

import { t } from '../i18n.js';
import { html, raw, $, $$, errText, sheet, ICONS } from '../ui.js';
import { api } from '../api.js';
import { store } from '../store.js';
import { myLeagues, openLeagueSheet, inviteSheet, settingsSheet, membersText } from '../leagues.js';

const PAGE = 50;
let root, timer, observer, tab, updatedAt = 0, ageTimer, shown = PAGE, last = null, scope = null, leagues = [];

export async function mount(el) {
  root = el;
  const q = new URLSearchParams(location.search);
  tab = q.get('tab') || (q.get('gw') ? `gw${q.get('gw')}` : 'live');
  scope = q.get('league')?.toUpperCase() || null;
  shown = PAGE;
  el.innerHTML = html`<div class="lb-head"><h1 class="title">${t('lb.title')}</h1><span class="updated" id="lbmeta"></span></div>
    <div class="scope-row" id="lbscope"></div>
    <div id="lghead"></div>
    <div class="lb-tabs" id="lbtabs"></div>
    <div id="lbbody" role="tabpanel"><div class="skeleton" style="height:420px"></div></div>
    <div id="sticky"></div>`.s;
  await renderScope();
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
/** Three tabs that never grow: the live gameweek, past gameweeks (picked from a list) and the season. */
function renderTabs(gameweeks, open) {
  gwCache = gameweeks;
  const past = gameweeks.filter((g) => g.status === 'locked').map((g) => g.id).sort((a, b) => b - a);
  const onPast = tab.startsWith('gw');
  const tabs = [];
  if (open) tabs.push({ id: 'live', label: t('lb.live', { gw: open }), on: tab === 'live' });
  if (past.length) tabs.push({ id: onPast ? tab : `gw${past[0]}`, label: t('lb.past'), on: onPast });
  tabs.push({ id: 'season', label: t('lb.season'), on: tab === 'season' });
  const box = $('#lbtabs', root);
  box.innerHTML = `<div class="tablist" role="tablist" aria-label="${t('lb.title')}">${tabs.map((x) => html`<button type="button" role="tab" class="lb-tab" data-tab="${x.id}" aria-selected="${String(x.on)}">${x.label}</button>`.s).join('')}</div>`
    + (onPast ? html`<button type="button" class="gw-pick" id="gwpick" aria-haspopup="dialog" aria-label="${t('lb.pickGw')}: GW${tab.slice(2)}">GW${tab.slice(2)}<svg viewBox="0 0 12 8" aria-hidden="true"><path d="M1 1.5l5 5 5-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></button>`.s : '');
  const go = (next) => {
    tab = next;
    shown = PAGE;
    syncUrl();
    $('#lbbody', root).innerHTML = '<div class="skeleton" style="height:420px"></div>';
    load();
  };
  $$('.lb-tab', box).forEach((b) => b.addEventListener('click', () => go(b.dataset.tab)));
  // A sheet with every finished gameweek as a tile, the current one marked.
  $('#gwpick', box)?.addEventListener('click', () => {
    const cur = +tab.slice(2);
    const sh = sheet(html`<h2>${t('lb.pickGw')}</h2><p>${t('lb.pickGwText')}</p>
      <div class="gw-grid">${past.map((g) => html`<button type="button" class="gw-tile" data-gw="${g}" ${raw(g === cur ? 'aria-current="true"' : '')}>${g}</button>`)}</div>`, { label: t('lb.pickGw') });
    sh.el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-gw]');
      if (!b) return;
      sh.close();
      if (+b.dataset.gw !== cur) go(`gw${b.dataset.gw}`);
    });
  });
}

function syncUrl() {
  const q = new URLSearchParams();
  if (scope) q.set('league', scope);
  if (tab !== 'live') q.set('tab', tab);
  history.replaceState({ keepScroll: true }, '', `/leaderboard${q.toString() ? `?${q}` : ''}`);
}

/** Everyone, then one chip per league, then + League. Scrolls sideways when there are many. */
async function renderScope() {
  try { leagues = await myLeagues(); } catch { leagues = []; }
  if (scope && !leagues.some((l) => l.code === scope)) scope = null;
  const chips = [{ id: '', label: t('league.everyone') }, ...leagues.map((l) => ({ id: l.code, label: l.name }))];
  const box = $('#lbscope', root);
  box.innerHTML = html`<div class="scopes" role="group" aria-label="${t('league.leagues')}">
      ${chips.map((c) => html`<button type="button" class="scope" data-scope="${c.id}" aria-pressed="${String((scope || '') === c.id)}">${c.label}</button>`)}
      <button type="button" class="scope add" id="lgadd">${raw(ICONS.plus)}${t('league.add')}</button></div>`.s;
  $$('[data-scope]', box).forEach((b) => b.addEventListener('click', () => setScope(b.dataset.scope || null)));
  $('#lgadd', box).addEventListener('click', async () => {
    const l = await openLeagueSheet();
    if (l) { await renderScope(); setScope(l.code); }
  });
  // Bring the chosen league into view only when it is hidden; Everyone stays first.
  const on = $('[aria-pressed="true"]', box), list = $('.scopes', box);
  if (on && scope && (on.offsetLeft + on.offsetWidth > list.clientWidth + list.scrollLeft)) list.scrollLeft = on.offsetLeft - 16;
  renderLeagueHead();
}

function setScope(code) {
  scope = code;
  shown = PAGE;
  $$('[data-scope]', root).forEach((b) => b.setAttribute('aria-pressed', String((scope || '') === b.dataset.scope)));
  renderLeagueHead();
  syncUrl();
  $('#lbbody', root).innerHTML = '<div class="skeleton" style="height:420px"></div>';
  load();
}

function renderLeagueHead() {
  const box = $('#lghead', root);
  const l = leagues.find((x) => x.code === scope);
  if (!l) { box.innerHTML = ''; return; }
  box.innerHTML = html`<div class="lg-head"><div class="lg-title"><b>${l.name}</b><span>${membersText(l.members)}</span></div>
    <button type="button" class="btn btn-sm" id="lginvite">${raw(ICONS.users)}${t('league.invite')}</button>
    <button type="button" class="icon-btn" id="lgmore" aria-label="${t('league.settings')}">${raw(ICONS.dots)}</button></div>`.s;
  $('#lginvite', box).onclick = () => inviteSheet(l);
  $('#lgmore', box).onclick = () => settingsSheet(l.code, async (changed) => {
    await renderScope();
    setScope(changed ? changed.code : null);
  });
}

async function load(quiet = false) {
  const body = $('#lbbody', root);
  try {
    if (scope) return await loadLeague(quiet);
    if (tab === 'season') {
      if (!gwCache) gwCache = (await api('/api/leaderboard')).gameweeks;
      renderTabs(gwCache, store.state.gw?.id);
      age();
      return renderSeason(await api('/api/season'));
    }
    const gw = tab.startsWith('gw') ? +tab.slice(2) : '';
    const lb = await api(`/api/leaderboard${gw ? `?gw=${gw}` : ''}`);
    if (!quiet || !gwCache) renderTabs(lb.gameweeks, store.state.gw?.id);
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
  const how = lb.ranked.length ? html`<p class="lb-how">${t('lb.how')} <a href="/rules">${t('page.rules')}</a></p>` : '';
  body.innerHTML = html`${!lb.live ? html`<p class="sub" style="margin:0 0 10px">${t('lb.final')}: ${t('lb.top10')}, GW${lb.gw}</p>` : ''}${ranked}${how}${pending}`.s;
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

// ============================================================ league tables

async function loadLeague(quiet) {
  if (!gwCache) gwCache = (await api('/api/leaderboard')).gameweeks;
  if (!quiet) renderTabs(gwCache, store.state.gw?.id);
  age();
  const code = scope;
  if (tab === 'season') {
    const r = await api(`/api/leagues/${code}/standings?type=season`);
    if (code !== scope) return;
    return renderLeagueSeason(r);
  }
  const gw = tab.startsWith('gw') ? +tab.slice(2) : '';
  const lb = await api(`/api/leagues/${code}/standings${gw ? `?gw=${gw}` : ''}`);
  if (code !== scope) return;
  updatedAt = Date.now();
  renderLeagueBoard(lb);
}

function leagueEmpty() {
  const l = leagues.find((x) => x.code === scope);
  return html`<div class="empty"><span class="ycard"></span><h2>${t('league.emptyTitle')}</h2><p>${t('league.emptyText')}</p>
    <button class="btn btn-go" id="lgempty">${raw(ICONS.users)}${t('league.inviteFriends')}</button></div>`;
}

function wireEmpty(body) {
  const l = leagues.find((x) => x.code === scope);
  $('#lgempty', body)?.addEventListener('click', () => inviteSheet(l));
}

function renderLeagueBoard(lb) {
  const body = $('#lbbody', root);
  last = lb;
  if (lb.members <= 1) {
    body.innerHTML = leagueEmpty().s;
    $('#sticky', root).innerHTML = '';
    return wireEmpty(body);
  }
  const ranked = lb.ranked.length
    ? html`<ol class="board" aria-label="${t('lb.live', { gw: lb.gw })}">${lb.ranked.map((r) => rowHtml(r))}</ol>`
    : html`<div class="empty"><span class="ycard"></span><h2>${t('lb.emptyTitle')}</h2><p>${t('lb.empty')}</p><a class="btn btn-go" href="/">${t('nav.judge')}</a></div>`;
  const pending = lb.pending.length ? html`<h2 class="board-sub">${t('lb.waiting')}</h2><ol class="board pending">${lb.pending.map((r) => rowHtml(r, { pending: true }))}</ol>` : '';
  const missing = lb.missing.length
    ? html`<h2 class="board-sub">${t('league.notPosted')}</h2><ul class="board pending missing">${lb.missing.map((m) => html`<li class="${m.mine ? 'me' : ''}"><div class="r"><span class="pos">-</span><span class="who"><b>${m.nickname}${m.mine ? ` (${t('lb.you')})` : ''}</b></span>${m.mine && lb.live ? html`<a class="btn btn-sm" href="/post">${t('judge.postSquad')}</a>` : ''}</div></li>`)}</ul>`
    : '';
  body.innerHTML = html`${!lb.live ? html`<p class="sub" style="margin:0 0 10px">${t('lb.final')}, GW${lb.gw}</p>` : ''}${ranked}${pending}${missing}`.s;
  $('#sticky', root).innerHTML = '';
}

function renderLeagueSeason(r) {
  const body = $('#lbbody', root);
  $('#sticky', root).innerHTML = '';
  if (r.members <= 1) { body.innerHTML = leagueEmpty().s; return wireEmpty(body); }
  body.innerHTML = r.season.length
    ? html`<ol class="board">${r.season.map((x) => html`<li class="${x.mine ? 'me' : ''} ${x.place <= 3 ? `p${x.place}` : ''}"><div class="r">
        <span class="pos">${x.place}</span>
        <span class="who"><b>${x.nickname}${x.mine ? ` (${t('lb.you')})` : ''}${x.demo ? html`<span class="tag">${t('judge.exampleShort')}</span>` : ''}</b><span>${t('league.seasonCols', x)}</span></span>
        <span class="score"><span class="num">${x.avg.toFixed(1)}</span><small>${t('judge.juryAvg')}</small></span></div></li>`)}</ol>`.s
    : html`<div class="empty"><h2>${t('lb.season')}</h2><p>${t('lb.seasonEmpty')}</p></div>`.s;
}
