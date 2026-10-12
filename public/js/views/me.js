// Me: your numbers, your verdicts (by gameweek, 10 at a time), your squads, settings and About.

import { t } from '../i18n.js';
import { html, raw, $, $$, sheet, toast, errText } from '../ui.js';
import { api } from '../api.js';
import { store, refreshState } from '../store.js';
import { ensureUser, pickNickname } from '../auth.js';
import { navigate } from '../app.js';
import { soundOn, setSound } from '../sound.js';

const SQUADS_PAGE = 10;

const aboutHtml = () => html`<h2 class="section-h">${t('me.about')}</h2>
  <ul class="list about-links">
    <li><a href="/how">${t('page.how')}</a></li>
    <li><a href="/rules">${t('page.rules')}</a></li>
    <li><a href="/privacy">${t('page.privacy')}</a></li>
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
    el.innerHTML = html`<div class="profile-head"><span class="ycard"></span><div><h1>${t('me.title')}</h1><p class="sub">${t('me.signedOut')}</p></div></div>
      <button class="btn btn-go btn-block" id="signin">${t('auth.google')}</button>
      ${settingsHtml()}${aboutHtml()}`.s;
    $('#signin', el).onclick = async () => { if (await ensureUser()) mount(el); };
    wireCommon(el);
    return;
  }
  const [prof, cur] = await Promise.all([api('/api/me/profile'), api('/api/me/verdicts?size=10')]);
  const st = prof.stats;
  const older = cur.gws.filter((g) => g.gw !== cur.gw);
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

    <h2 class="section-h">${cur.gw ? t('me.verdictsGw', { gw: cur.gw }) : t('me.verdictsAll')}</h2>
    ${cur.total
      ? html`<ul class="list" id="cur">${verdictRows(cur.items)}</ul>
        ${cur.total > cur.items.length ? html`<a class="show-all" href="/me/verdicts?gw=${cur.gw}">${t('me.showAll', { n: cur.total })}</a>` : ''}`
      : html`<p class="sub">${t('me.verdictsEmpty')}</p>`}
    ${older.map((g) => html`<details class="gw-group" data-gw="${g.gw}"><summary>GW${g.gw}<small>${t('lb.votes', { n: g.count })}</small></summary><ul class="list"><li><span class="item"><span class="skeleton" style="width:60%;height:14px"></span></span></li></ul></details>`)}

    <h2 class="section-h">${t('me.squads')}</h2>
    <div id="squads"></div>

    ${settingsHtml()}
    ${aboutHtml()}
    <div style="display:grid;gap:10px;margin-top:22px">
      ${s.user.admin ? html`<a class="btn" href="/admin">${t('me.admin')}</a>` : ''}
      <button class="btn btn-ghost" id="logout">${t('me.logout')}</button>
      <button class="btn btn-danger" id="delete">${t('me.delete')}</button>
    </div>
  </div>`.s;

  wireCommon(el);
  const curBox = $('#cur', el);
  if (curBox) wireVerdicts(curBox, { open: cur.open, onChange: () => mount(el) });
  for (const d of $$('.gw-group', el)) {
    d.addEventListener('toggle', async () => {
      if (!d.open || d.dataset.loaded) return;
      d.dataset.loaded = '1';
      const r = await api(`/api/me/verdicts?gw=${d.dataset.gw}&size=10`);
      const list = $('.list', d);
      list.innerHTML = verdictRows(r.items).s;
      if (r.total > r.items.length) d.insertAdjacentHTML('beforeend', html`<a class="show-all" href="/me/verdicts?gw=${r.gw}">${t('me.showAll', { n: r.total })}</a>`.s);
      wireVerdicts(list, { open: r.open });
    });
  }
  squadsList($('#squads', el), prof.squads, 1);

  $('#edit', el).onclick = async () => { if (await pickNickname('', { edit: true })) mount(el); };
  $('#logout', el).onclick = async () => {
    await api('/api/auth/logout', { method: 'POST' });
    await refreshState();
    navigate('/');
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
        navigate('/');
      } catch (e) {
        toast(errText(e), { bad: true });
      }
    };
  };
}

/** Your squads, one row per gameweek, ten per page. */
function squadsList(box, squads, page) {
  if (!squads.length) {
    box.innerHTML = html`<p class="sub">${store.state.gw ? t('squad.none', { gw: store.state.gw.id }) : ''}</p>`.s;
    return;
  }
  const pages = Math.ceil(squads.length / SQUADS_PAGE);
  const items = squads.slice((page - 1) * SQUADS_PAGE, page * SQUADS_PAGE);
  box.innerHTML = html`<ul class="list">${items.map((q) => html`<li><a href="/t/${q.key}">
      <span><b>GW${q.gw}</b>${q.live ? html` <span class="tag">${t('me.live')}</span>` : ''}<br><small>${t('lb.votes', { n: q.votes })}${q.rank ? ` · #${q.rank}` : ''}</small></span>
      <span class="num">${q.avg != null ? q.avg.toFixed(1) : '-'}</span></a></li>`)}</ul>
    ${pages > 1 ? html`<div class="pager"><button class="btn btn-sm btn-ghost" data-p="${page - 1}" ${raw(page === 1 ? 'disabled' : '')}>${t('pager.prev')}</button>
      <span class="sub" style="margin:0">${page} / ${pages}</span>
      <button class="btn btn-sm btn-ghost" data-p="${page + 1}" ${raw(page === pages ? 'disabled' : '')}>${t('pager.next')}</button></div>` : ''}`.s;
  box.querySelectorAll('[data-p]').forEach((b) => b.addEventListener('click', () => squadsList(box, squads, +b.dataset.p)));
}
