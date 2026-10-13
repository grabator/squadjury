// Leaderboard: one clean list. The live gameweek, past gameweeks (final top 10) and the season.
// Your row is marked in yellow and stays pinned above the menu when it is off screen.

import { t } from '../i18n.js';
import { html, raw, $, $$, errText, sheet, ICONS } from '../ui.js';
import { api } from '../api.js';
import { store } from '../store.js';
import { myLeagues, openLeagueSheet, inviteSheet, settingsSheet, membersText } from '../leagues.js';

const PAGE = 50;
const hasPointsByGw = new Map();
let h2hGw = null, h2hTableKind = 'jury';
let root, timer, observer, tab, updatedAt = 0, ageTimer, shown = PAGE, last = null, scope = null, leagues = [], sortBy = 'jury';

export async function mount(el) {
  root = el;
  const q = new URLSearchParams(location.search);
  tab = q.get('tab') || (q.get('gw') ? `gw${q.get('gw')}` : 'live');
  scope = q.get('league')?.toUpperCase() || null;
  if (q.get('sort')) sortBy = q.get('sort');
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
  if (scope) tabs.push({ id: 'h2h', label: t('h2h.tab'), on: tab === 'h2h' });
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
  if (!scope && tab === 'h2h') tab = 'live';
  h2hGw = null;
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
    if (sortBy === 'scouts' && tab !== 'live' && tab !== 'h2h') return await loadScouts(quiet);
    if (scope) return await loadLeague(quiet);
    if (tab === 'season') {
      if (!gwCache) gwCache = (await api('/api/leaderboard')).gameweeks;
      renderTabs(gwCache, store.state.gw?.id);
      age();
      return renderSeason(await api('/api/season'));
    }
    const gw = tab.startsWith('gw') ? +tab.slice(2) : '';
    if (sortBy === 'duels') {
      const d = await api(`/api/leaderboard/duels${gw ? `?gw=${gw}` : ''}`);
      if (!gwCache) gwCache = (await api('/api/leaderboard')).gameweeks;
      if (!quiet) renderTabs(gwCache, store.state.gw?.id);
      last = d;
      renderDuels(d);
      updatedAt = Date.now();
      age();
      return;
    }
    const lb = await api(`/api/leaderboard${gw ? `?gw=${gw}${sortBy === 'points' ? '&sort=points' : ''}` : ''}`);
    hasPointsByGw.set(lb.gw, !!lb.hasPoints);
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

function rowHtml(r, { pending = false, byPoints = false, pos = null } = {}) {
  const sub = pending
    ? r.needsVotes ? t('lb.needs', { n: r.needsVotes }) : t('lb.needsJudge', { n: r.needsJudged })
    : r.x ? `@${r.x}` : '';
  const shownPos = pos ?? r.rank;
  const place = !pending && shownPos <= 3 ? `p${shownPos}` : '';
  // After the gameweek the real points sit next to the verdict; sorted by points they lead.
  const score = byPoints
    ? html`<span class="num">${r.points ?? '-'}</span><small>${t('pts.jury')} ${r.votes ? r.avg.toFixed(1) : '-'}</small>`
    : html`<span class="num">${r.votes ? r.avg.toFixed(1) : '-'}</span><small>${r.points != null ? t('pts.pts', { n: r.points }) : t('lb.votes', { n: r.votes })}</small>`;
  return html`<li class="${r.mine ? 'me' : ''} ${place}" data-key="${r.key}">
    <a href="/t/${r.key}"><span class="pos">${pending ? '-' : shownPos}</span>
      <span class="who"><b>${r.nickname}${r.mine ? ` (${t('lb.you')})` : ''}${r.demo ? html`<span class="tag">${t('judge.exampleShort')}</span>` : ''}</b>${sub ? html`<span>${sub}</span>` : ''}</span>
      <span class="score">${score}</span></a></li>`;
}

function renderBoard(lb) {
  const body = $('#lbbody', root);
  const list = lb.ranked.slice(0, shown);
  const byPoints = lb.sort === 'points';
  const seg = segHtml(lb.live, lb.hasPoints, byPoints ? 'points' : 'jury');
  const ranked = lb.ranked.length
    ? html`${seg}<ol class="board" aria-label="${lb.live ? t('lb.live', { gw: lb.gw }) : t('lb.top10')}">${list.map((r, i) => rowHtml(r, { byPoints, pos: byPoints ? i + 1 : null }))}</ol>
      ${lb.ranked.length > shown ? html`<button class="btn btn-ghost more" id="more">${t('lb.more')}</button>` : ''}`
    : html`${seg}<div class="empty"><span class="ycard"></span><h2>${t('lb.emptyTitle')}</h2><p>${t('lb.empty')}</p><a class="btn btn-go" href="/">${t('nav.judge')}</a></div>`;
  const pending = lb.pending?.length
    ? html`<h2 class="board-sub">${t('lb.waiting')}</h2><ol class="board pending">${lb.pending.map((r) => rowHtml(r, { pending: true }))}</ol>`
    : '';
  const how = lb.ranked.length ? html`<p class="lb-how">${t('lb.how')} <a href="/rules">${t('page.rules')}</a></p>` : '';
  body.innerHTML = html`${!lb.live ? html`<p class="sub" style="margin:0 0 10px">${t('lb.final')}: ${t('lb.top10')}, GW${lb.gw}</p>` : ''}${ranked}${how}${pending}`.s;
  $('#more', body)?.addEventListener('click', () => { shown += PAGE; renderBoard(last); });
  wireSeg(body);
  sticky(lb.me, body);
}

/** The ways to rank the view: Jury, Duels, Points (after the gameweek) and Scouts (finished gameweeks and season). */
function segHtml(live, hasPoints, on) {
  const opts = [['jury', t('pts.sortJury')]];
  if (!scope && tab !== 'season') opts.push(['duels', t('duel.tab')]);
  if (!scope && !live && hasPoints && tab !== 'season') opts.push(['points', t('pts.sortPoints')]);
  if (!live) opts.push(['scouts', t('scout.tab')]);
  if (opts.length < 2) return '';
  return html`<div class="seg" role="group" aria-label="${t('pts.sortLabel')}">${opts.map(([id, label]) => html`<button type="button" data-sort="${id}" aria-pressed="${String(on === id)}">${label}</button>`)}</div>`;
}

const segStr = (...a) => { const x = segHtml(...a); return x ? x.s : ''; };

function wireSeg(body) {
  body.querySelectorAll('[data-sort]').forEach((b) => b.addEventListener('click', () => {
    if (sortBy === b.dataset.sort) return;
    sortBy = b.dataset.sort;
    load();
  }));
}

/** Squads by duel rating, with their wins and losses. */
function renderDuels(d) {
  const body = $('#lbbody', root);
  const seg = segHtml(d.live, hasPointsByGw.get(d.gw), 'duels');
  const list = d.ranked.length
    ? html`<ol class="board" aria-label="${t('duel.tab')}, GW${d.gw}">${d.ranked.map((r) => html`<li class="${r.mine ? 'me' : ''} ${r.rank <= 3 ? `p${r.rank}` : ''}" data-key="${r.key}">
        <a href="/t/${r.key}"><span class="pos">${r.rank}</span>
        <span class="who"><b>${r.nickname}${r.mine ? ` (${t('lb.you')})` : ''}${r.demo ? html`<span class="tag">${t('judge.exampleShort')}</span>` : ''}</b><span>${r.w}-${r.l} · ${r.pct}%</span></span>
        <span class="score"><span class="num">${r.rating}</span><small>${t('duel.ratingShort')}</small></span></a></li>`)}</ol>`
    : html`<div class="empty"><span class="ycard"></span><h2>${t('lb.emptyTitle')}</h2><p>${t('duel.lbEmpty', { n: d.minDuels })}</p>${d.live ? html`<a class="btn btn-go" href="/">${t('nav.judge')}</a>` : ''}</div>`;
  const me = d.me && !d.ranked.some((r) => r.mine) && d.me.needs
    ? html`<p class="sub" style="margin:10px 2px 0">${t('lb.you')}: ${t('duel.needs', { n: d.me.needs })}</p>` : '';
  body.innerHTML = html`${!d.live ? html`<p class="sub" style="margin:0 0 10px">${t('lb.final')}, GW${d.gw}</p>` : ''}${seg}${list}${me}
    ${d.ranked.length ? html`<p class="lb-how">${t('duel.lbHow', { n: d.minDuels })}</p>` : ''}`.s;
  wireSeg(body);
  $('#sticky', root).innerHTML = '';
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
  const body = $('#lbbody', root);
  body.innerHTML = segStr(false, false, 'jury') + (season.length
    ? html`<ol class="board">${season.map((r) => html`<li class="${r.mine ? 'me' : ''} ${r.place <= 3 ? `p${r.place}` : ''}"><div class="r">
        <span class="pos">${r.place}</span>
        <span class="who"><b>${r.nickname}${r.demo ? html`<span class="tag">${t('judge.exampleShort')}</span>` : ''}</b><span>${t('lb.seasonCols', { wins: r.wins || 0, best: r.best })}</span></span>
        <span class="score"><span class="num">${r.top10}</span><small>${t('lb.top10')}</small></span></div></li>`)}</ol>`.s
    : html`<div class="empty"><h2>${t('lb.season')}</h2><p>${t('lb.seasonEmpty')}</p></div>`.s);
  wireSeg(body);
}

// ============================================================ league tables

async function loadLeague(quiet) {
  if (!gwCache) gwCache = (await api('/api/leaderboard')).gameweeks;
  if (!quiet) renderTabs(gwCache, store.state.gw?.id);
  age();
  const code = scope;
  if (tab === 'h2h') {
    const r = await api(`/api/leagues/${code}/h2h${h2hGw ? `?gw=${h2hGw}` : ''}`);
    if (code !== scope) return;
    return renderH2H(r);
  }
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
  body.innerHTML = html`${!lb.live ? html`<p class="sub" style="margin:0 0 10px">${t('lb.final')}, GW${lb.gw}</p>` : ''}${segHtml(lb.live, false, 'jury')}${ranked}${pending}${missing}`.s;
  wireSeg(body);
  $('#sticky', root).innerHTML = '';
}

function renderLeagueSeason(r) {
  const body = $('#lbbody', root);
  $('#sticky', root).innerHTML = '';
  if (r.members <= 1) { body.innerHTML = leagueEmpty().s; return wireEmpty(body); }
  body.innerHTML = segStr(false, false, 'jury') + (r.season.length
    ? html`<ol class="board">${r.season.map((x) => html`<li class="${x.mine ? 'me' : ''} ${x.place <= 3 ? `p${x.place}` : ''}"><div class="r">
        <span class="pos">${x.place}</span>
        <span class="who"><b>${x.nickname}${x.mine ? ` (${t('lb.you')})` : ''}${x.demo ? html`<span class="tag">${t('judge.exampleShort')}</span>` : ''}</b><span>${t('league.seasonCols', x)}</span></span>
        <span class="score"><span class="num">${x.avg.toFixed(1)}</span><small>${t('judge.juryAvg')}</small></span></div></li>`)}</ol>`.s
    : html`<div class="empty"><h2>${t('lb.season')}</h2><p>${t('lb.seasonEmpty')}</p></div>`.s);
  wireSeg(body);
}

// ============================================================ league head to head

const ycard = () => html`<span class="ycard mini" aria-hidden="true"></span>`;

function matchHtml(m, live, pointsReady) {
  const j = m.jury, pt = m.points;
  const fmt = (v) => (v == null ? '-' : Number.isInteger(v) ? v : v.toFixed(1));
  const line = (x, side) => {
    const juryWon = j.res === side, ptsWon = pt?.res === side;
    return html`<div class="h2h-line ${x?.mine ? 'me' : ''}">
      <span class="h2h-name ${x ? '' : 'avg'}"><b>${x ? x.nickname : t('h2h.average')}</b>${x?.demo ? html`<span class="tag">${t('judge.exampleShort')}</span>` : ''}</span>
      <span class="h2h-cell ${juryWon ? 'win' : ''}">${juryWon ? ycard() : ''}${fmt(j.by === 'rating' && m.away ? (side === 'H' ? j.homeAvg : j.awayAvg) : side === 'H' ? j.home : j.away)}</span>
      <span class="h2h-cell ${ptsWon ? 'win' : ''}">${ptsWon ? ycard() : ''}${pt ? fmt(side === 'H' ? pt.home : pt.away) : '-'}</span></div>`;
  };
  const note = j.by === 'forfeit' ? (j.res === 'N' ? t('h2h.noShowBoth') : t('h2h.noShow'))
    : j.by === 'rating' ? (m.away ? t('h2h.byRating') : t('h2h.vsAverage'))
    : t('h2h.byDuels');
  const ptsNote = pt ? '' : live ? t('h2h.pointsLater') : pointsReady ? '' : t('h2h.pointsWaiting');
  const mine = m.home?.mine ? 'H' : m.away?.mine ? 'A' : null;
  const iWon = mine && !live && (j.res === mine || pt?.res === mine);
  return html`<li class="h2h-match ${mine ? 'me' : ''}">
    <div class="h2h-head" aria-hidden="true"><span></span><span>${t('h2h.jury')}</span><span>${t('h2h.pts')}</span></div>
    ${line(m.home, 'H')}${line(m.away, 'A')}
    <p class="h2h-sub">${t('h2h.jury')}: ${note}${ptsNote ? html` · ${ptsNote}` : ''}</p>
    ${iWon ? html`<button type="button" class="btn btn-sm h2h-share" data-share>${raw(ICONS.share)}${t('h2h.shareWin')}</button>` : ''}
  </li>`;
}

function renderH2H(r) {
  const body = $('#lbbody', root);
  $('#sticky', root).innerHTML = '';
  last = r;
  if (r.members < r.minMembers || !r.gws.length) {
    body.innerHTML = html`<div class="empty"><span class="ycard"></span><h2>${t('h2h.title')}</h2><p>${t('h2h.needMembers', { n: r.minMembers })}</p>
      <button class="btn btn-go" id="lgempty">${raw(ICONS.users)}${t('league.inviteFriends')}</button></div>`.s;
    return wireEmpty(body);
  }
  const table = r.tables[h2hTableKind] || [];
  body.innerHTML = html`<p class="sub" style="margin:0 0 10px">${t('h2h.how')}</p>
    <div class="h2h-gws" role="group" aria-label="${t('lb.pickGw')}">${r.gws.map((g) => html`<button type="button" data-h2hgw="${g}" aria-pressed="${String(g === r.gw)}">GW${g}</button>`)}</div>
    <h2 class="board-sub">${t('h2h.matches', { gw: r.gw })}${r.live ? html` <span class="live-dot">${t('h2h.live')}</span>` : ''}</h2>
    <ul class="h2h-list">${r.matches.map((m) => matchHtml(m, r.live, r.pointsReady))}</ul>
    <h2 class="board-sub">${t('h2h.table')}</h2>
    <div class="seg" role="group" aria-label="${t('h2h.table')}">
      <button type="button" data-h2ht="jury" aria-pressed="${String(h2hTableKind === 'jury')}">${t('h2h.juryTable')}</button>
      <button type="button" data-h2ht="points" aria-pressed="${String(h2hTableKind === 'points')}">${t('h2h.pointsTable')}</button></div>
    ${table.some((x) => x.p)
      ? html`<ol class="board h2h-table">${table.map((x) => html`<li class="${x.mine ? 'me' : ''} ${x.place <= 3 && x.pts ? `p${x.place}` : ''}"><div class="r">
          <span class="pos">${x.place}</span>
          <span class="who"><b>${x.nickname}${x.mine ? ` (${t('lb.you')})` : ''}${x.demo ? html`<span class="tag">${t('judge.exampleShort')}</span>` : ''}</b><span>${t('h2h.wdl', x)}</span></span>
          <span class="score"><span class="num">${x.pts}</span><small>${t('h2h.pts')}</small></span></div></li>`)}</ol>`
      : html`<p class="sub">${h2hTableKind === 'points' ? t('h2h.pointsTableEmpty') : t('h2h.tableEmpty')}</p>`}`.s;
  body.querySelectorAll('[data-h2hgw]').forEach((b) => b.addEventListener('click', () => { h2hGw = +b.dataset.h2hgw; load(); }));
  body.querySelectorAll('[data-h2ht]').forEach((b) => b.addEventListener('click', () => { h2hTableKind = b.dataset.h2ht; renderH2H(last); }));
  body.querySelectorAll('[data-share]').forEach((b) => b.addEventListener('click', async () => {
    const m = r.matches.find((x) => x.home?.mine || x.away?.mine);
    const me = m.home?.mine ? 'H' : 'A';
    const opp = (me === 'H' ? m.away : m.home)?.nickname || t('h2h.average');
    const byPoints = m.points?.res === me;
    const { renderH2HImage, downloadBlob } = await import('../share.js');
    const blob = await renderH2HImage({ gw: r.gw, opp, league: leagues.find((l) => l.code === scope)?.name || '', score: byPoints ? [m.points[me === 'H' ? 'home' : 'away'], m.points[me === 'H' ? 'away' : 'home']] : null, me: store.state.user?.nickname || '' });
    const name = `squadjury-gw${r.gw}-h2h.png`;
    if (navigator.canShare?.({ files: [new File([blob], name, { type: 'image/png' })] })) {
      try { await navigator.share({ files: [new File([blob], name, { type: 'image/png' })], text: t('h2h.shareText', { opp, gw: r.gw }) }); return; } catch (e) { if (e.name === 'AbortError') return; }
    }
    downloadBlob(blob, name);
  }));
}

// ============================================================ scouts

async function loadScouts(quiet) {
  if (!gwCache) gwCache = (await api('/api/leaderboard')).gameweeks;
  if (!quiet) renderTabs(gwCache, store.state.gw?.id);
  age();
  const q = new URLSearchParams();
  if (tab === 'season') q.set('type', 'season');
  else if (tab.startsWith('gw')) q.set('gw', tab.slice(2));
  if (scope) q.set('league', scope);
  const code = scope;
  const r = await api(`/api/scouts?${q}`);
  if (code !== scope) return;
  last = r;
  renderScouts(r);
}

function renderScouts(r) {
  const body = $('#lbbody', root);
  $('#sticky', root).innerHTML = '';
  const seg = segHtml(false, hasPointsByGw.get(r.gw), 'scouts');
  const head = r.type === 'season' ? t('scout.seasonHead') : t('scout.gwHead', { gw: r.gw });
  let main;
  if (r.type === 'gw' && r.status !== 'ready') {
    main = html`<div class="empty"><span class="ycard"></span><h2>${t('scout.title')}</h2><p>${r.status === 'few' ? t('scout.few', { n: r.minTeams }) : t('scout.waiting')}</p></div>`;
  } else if (!r.ranked.length) {
    main = html`<div class="empty"><span class="ycard"></span><h2>${t('scout.title')}</h2><p>${t('scout.empty')}</p></div>`;
  } else {
    main = html`<ol class="board" aria-label="${head}">${r.ranked.map((x) => html`<li class="${x.mine ? 'me' : ''} ${x.rank <= 3 ? `p${x.rank}` : ''}"><div class="r">
      <span class="pos">${x.rank}</span>
      <span class="who"><b>${x.nickname}${x.mine ? ` (${t('lb.you')})` : ''}${x.demo ? html`<span class="tag">${t('judge.exampleShort')}</span>` : ''}</b><span>${r.type === 'season' ? t('scout.gws', { n: x.gws }) : t('lb.votes', { n: x.verdicts })}</span></span>
      <span class="score"><span class="num">${x.score.toFixed(1)}</span><small>${t('scout.short')}</small></span></div></li>`)}</ol>`;
  }
  const me = r.me && r.me.needs ? html`<p class="sub" style="margin:10px 2px 0">${t('lb.you')}: ${t('scout.needs', { n: r.me.needs })}</p>` : '';
  body.innerHTML = html`<p class="sub" style="margin:0 0 10px">${head}</p>${seg}${main}${me}<p class="lb-how">${t('scout.how')} <a href="/how">${t('page.how')}</a></p>`.s;
  wireSeg(body);
}
