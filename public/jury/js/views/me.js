// Me: your numbers, your verdicts (by gameweek, 10 at a time), your squads, settings and About.

import { t } from '../i18n.js';
import { badgeRowHtml, openBadgesSheet, toastBadges } from '../badges.js';
import { html, raw, $, sheet, toast, errText, ICONS, pagerHtml, pagedList } from '../ui.js';
import { api } from '../api.js';
import { store, refreshState } from '../store.js';
import { ensureUser, pickNickname } from '../auth.js';
import { navigate } from '../app.js';
import { soundOn, setSound } from '../sound.js';
import { myLeagues, openLeagueSheet, membersText } from '../leagues.js';

const aboutHtml = () => html`<h2 class="section-h">${t('me.about')}</h2>
  <ul class="list about-links">
    <li><a href="/jury/how">${t('page.how')}</a></li>
    <li><a href="/jury/rules">${t('page.rules')}</a></li>
    <li><a href="/jury/privacy">${t('page.privacy')}</a></li>
  </ul>
  <p class="fan-note">${t('footer.fan')}</p>`;

const settingsHtml = () => html`<h2 class="section-h">${t('me.settings')}</h2>
  <label class="switch"><span>${t('me.sound')}<br><small style="color:var(--ink-2)">${t('me.soundHint')}</small></span><input type="checkbox" id="sound" ${raw(soundOn() ? 'checked' : '')}></label>`;

/** Rows of verdicts: owner on the left, your score on the right. */
export const verdictRows = (items) => html`${items.map((v) => html`<li><button class="item" data-key="${v.key}" data-score="${v.score}" data-nick="${v.nickname}">
  <span>${v.nickname}${v.demo ? html` <span class="tag">${t('judge.exampleShort')}</span>` : ''}</span><span class="vscore">${v.score}</span></button></li>`)}`;

/** Tap a verdict: change it while the gameweek is open, or open the squad. */
export function wireVerdicts(box, { open, onChange }) {
  box.addEventListener('click', (e) => {
    const b = e.target.closest('[data-key]');
    if (!b) return;
    if (!open) return navigate(`/t/${b.dataset.key}`);
    const sh = sheet(html`<h2>${b.dataset.nick}</h2><p>${t('me.change')}</p>
      <div class="verdicts" style="margin-bottom:14px">${Array.from({ length: 10 }, (_, i) => html`<button class="vbtn ${+b.dataset.score === i + 1 ? 'chosen' : ''}" data-s="${i + 1}" aria-label="${t('judge.score', { n: i + 1 })}">${i + 1}</button>`)}</div>
      <a class="btn btn-ghost btn-block" href="/t/${b.dataset.key}">${t('me.openSquad')}</a>`);
    sh.el.addEventListener('click', async (ev) => {
      if (ev.target.closest('a')) return sh.close();
      const v = ev.target.closest('[data-s]');
      if (!v) return;
      try {
        await api('/api/votes', { method: 'POST', body: { key: b.dataset.key, score: +v.dataset.s } });
        sh.close();
        toast(t('me.saved'));
        onChange?.();
      } catch (err) {
        toast(errText(err), { bad: true });
      }
    });
  });
}

function wireCommon(el) {
  $('#sound', el)?.addEventListener('change', (e) => setSound(e.target.checked));
}

export async function mount(el) {
  const s = store.state;
  if (!s.user?.nickname) {
    el.innerHTML = html`<div><div class="profile-head"><span class="ycard"></span><div><h1>${t('me.title')}</h1><p class="sub">${t('me.signedOut')}</p></div></div>
      <button class="btn btn-go btn-block" id="signin">${t('auth.google')}</button>
      ${settingsHtml()}${aboutHtml()}</div>`.s;
    $('#signin', el).onclick = async () => { if (await ensureUser()) mount(el); };
    wireCommon(el);
    return;
  }
  const [prof, cur] = await Promise.all([api('/api/me/profile'), api('/api/me/verdicts?size=10')]);
  const st = prof.stats;
  el.innerHTML = html`<div>
    <div class="profile-head"><span class="ycard"></span>
      <div style="min-width:0;flex:1"><h1>${s.user.nickname}</h1>
        <p class="sub" style="margin:2px 0 0">${s.user.x ? html`<a href="https://x.com/${s.user.x}" target="_blank" rel="noopener">@${s.user.x}</a>` : t('me.juror')}</p></div>
      <button class="btn btn-ghost btn-sm" id="edit">${t('me.profile')}</button></div>
    <div class="stats">
      <div class="stat"><span class="num">${st.average ?? '-'}</span><span>${t('me.average')}</span></div>
      <div class="stat"><span class="num">${st.gameweeks}</span><span>${t('me.gameweeks')}</span></div>
      <div class="stat"><span class="num">${st.best ? `#${st.best}` : '-'}</span><span>${t('me.best')}</span></div>
    </div>
    ${badgeRowHtml(prof.badges)}
    ${prof.scouts?.last ? html`<a class="scout-line" href="/jury/leaderboard?tab=gw${prof.scouts.last.gw}&sort=scouts"><b>${t('scout.profile', prof.scouts.last)}</b>${prof.scouts.season ? html`<span>${t('scout.profileSeason', { ...prof.scouts.season, n: prof.scouts.season.gws })}</span>` : ''}</a>` : ''}

    <h2 class="section-h">${t('me.verdictsAll')}</h2>
    <div id="verdicts"></div>

    <h2 class="section-h">${t('league.leagues')}</h2>
    <div id="leagues"><div class="skeleton" style="height:56px"></div></div>

    <h2 class="section-h">${t('me.squads')}</h2>
    <div id="squads"></div>

    ${settingsHtml()}
    ${aboutHtml()}
    <div style="display:grid;gap:10px;margin-top:22px">
      ${s.user.admin ? html`<a class="btn" href="/jury/admin">${t('me.admin')}</a>` : ''}
      <button class="btn btn-ghost" id="logout">${t('me.logout')}</button>
      <button class="btn btn-danger" id="delete">${t('me.delete')}</button>
    </div>
  </div>`.s;

  wireCommon(el);
  verdictsSection($('#verdicts', el), cur);
  squadsList($('#squads', el), prof.squads);
  leaguesList($('#leagues', el));

  $('#badgerow', el)?.addEventListener('click', () => openBadgesSheet(() => $('.badge-row .new-dot', el)?.remove()));
  toastBadges(prof.badges?.list?.filter((b) => b.isNew));
  $('#edit', el).onclick = async () => { if (await pickNickname('', { edit: true })) mount(el); };
  $('#logout', el).onclick = async () => {
    await api('/api/auth/logout', { method: 'POST' });
    await refreshState();
    navigate('/jury/');
  };
  $('#delete', el).onclick = () => {
    const sh = sheet(html`<h2>${t('me.deleteTitle')}</h2><p>${t('me.deleteText')}</p>
      <div class="row"><button class="btn btn-ghost" data-no>${t('post.cancel')}</button><button class="btn btn-danger" data-yes>${t('me.deleteGo')}</button></div>`);
    $('[data-no]', sh.el).onclick = sh.close;
    $('[data-yes]', sh.el).onclick = async () => {
      try {
        await api('/api/me', { method: 'DELETE' });
        sh.close();
        await refreshState();
        navigate('/jury/');
      } catch (e) {
        toast(errText(e), { bad: true });
      }
    };
  };
}

/** Your verdicts: one chip per gameweek, then that gameweek's verdicts 10 at a time. */
function verdictsSection(box, r) {
  const gws = r.gws.length ? r.gws : [];
  const chips = gws.length > 1
    ? html`<div class="h2h-gws" role="group" aria-label="${t('lb.pickGw')}">${gws.map((g) => html`<button type="button" data-vgw="${g.gw}" aria-pressed="${String(g.gw === r.gw)}">GW${g.gw} <small>${g.count}</small></button>`)}</div>`
    : '';
  box.innerHTML = html`${chips}
    ${r.total
      ? html`<p class="sub" style="margin:0 0 6px">${t('me.verdictsGw', { gw: r.gw })} · ${t('lb.votes', { n: r.total })}</p><ul class="list" id="vlist">${verdictRows(r.items)}</ul>${pagerHtml(r.page, r.pages)}`
      : html`<p class="sub">${t('me.verdictsEmpty')}</p>`}`.s;
  const load = async (gw, page) => {
    try { verdictsSection(box, await api(`/api/me/verdicts?gw=${gw}&page=${page}&size=10`)); } catch (e) { toast(errText(e), { bad: true }); }
  };
  box.querySelectorAll('[data-vgw]').forEach((b) => b.addEventListener('click', () => load(+b.dataset.vgw, 1)));
  box.querySelectorAll('.pgr [data-goto]').forEach((b) => b.addEventListener('click', async () => {
    await load(r.gw, +b.dataset.goto);
    box.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }));
  const list = $('#vlist', box);
  if (list) wireVerdicts(list, { open: r.open, onChange: () => load(r.gw, r.page) });
}

/** Your squads, one row per gameweek, ten per page. */
function squadsList(box, squads) {
  if (!squads.length) {
    box.innerHTML = html`<p class="sub">${store.state.gw ? t('squad.none', { gw: store.state.gw.id }) : ''}</p>`.s;
    return;
  }
  pagedList(box, squads, (items) => html`<ul class="list">${items.map((q) => html`<li><a href="/t/${q.key}">
      <span><b>GW${q.gw}</b>${q.live ? html` <span class="tag">${t('me.live')}</span>` : ''}<br><small>${t('lb.votes', { n: q.votes })}${q.rank ? ` · #${q.rank}` : ''}${q.points != null ? ` · ${t('pts.pts', { n: q.points })}` : ''}</small></span>
      <span class="num">${q.avg != null ? q.avg.toFixed(1) : '-'}</span></a></li>`)}</ul>`, { label: t('me.squads') });
}

/** Your leagues, each one opens its table; and a button to create or join one. */
async function leaguesList(box) {
  const leagues = await myLeagues(true).catch(() => []);
  box.innerHTML = html`${leagues.length
    ? html`<ul class="list">${leagues.map((l) => html`<li><a href="/jury/leaderboard?league=${l.code}"><span><b>${l.name}</b><br><small>${membersText(l.members)}${l.isOwner ? ` · ${t('league.owner')}` : ''}</small></span><span class="go" aria-hidden="true">›</span></a></li>`)}</ul>`
    : html`<p class="sub" style="margin:0 0 10px">${t('league.mineEmpty')}</p>`}
    <button class="btn btn-block" id="lg-new" style="margin-top:10px">${raw(ICONS.plus)}${t('league.create')} / ${t('league.join').toLowerCase()}</button>`.s;
  $('#lg-new', box).onclick = async () => {
    const l = await openLeagueSheet();
    if (l) leaguesList(box);
  };
}
