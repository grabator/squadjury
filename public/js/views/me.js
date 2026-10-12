// Me: stats, trophies, squads by gameweek, verdicts this gameweek, profile settings.

import { t } from '../i18n.js';
import { html, raw, $, sheet, toast, errText } from '../ui.js';
import { api } from '../api.js';
import { store, refreshState } from '../store.js';
import { ensureUser, pickNickname } from '../auth.js';
import { navigate } from '../app.js';

export async function mount(el) {
  const s = store.state;
  if (!s.user?.nickname) {
    el.innerHTML = html`<div class="page-head"><h1 class="title">${t('me.title')}</h1></div>
      <div class="empty"><img class="big" src="/img/logo/mark.svg" alt="" width="88" height="88"><p>${t('me.signedOut')}</p>
      <button class="btn btn-go" id="signin">${t('auth.google')}</button></div>`.s;
    $('#signin', el).onclick = async () => { if (await ensureUser()) mount(el); };
    return;
  }
  const prof = await api('/api/me/profile');
  const st = prof.stats;
  const medal = (r) => (r === 1 ? '🥇' : r === 2 ? '🥈' : '🥉');
  el.innerHTML = html`<div class="squad-wrap">
    <div class="page-head" style="display:flex;justify-content:space-between;align-items:flex-end;gap:10px">
      <div><h1 class="title">${s.user.nickname}</h1>${s.user.x ? html`<p class="sub"><a href="https://x.com/${s.user.x}" target="_blank" rel="noopener">@${s.user.x}</a></p>` : ''}</div>
      <button class="btn btn-ghost" id="edit" style="min-height:40px">${t('me.profile')}</button>
    </div>
    <div class="stats">
      <div class="stat"><span class="num">${st.average ?? '-'}</span><span>${t('me.average')}</span></div>
      <div class="stat"><span class="num">${st.gameweeks}</span><span>${t('me.gameweeks')}</span></div>
      <div class="stat"><span class="num">${st.best ? `#${st.best}` : '-'}</span><span>${t('me.best')}</span></div>
      <div class="stat"><span class="num">${st.top10}</span><span>${t('me.top10')}</span></div>
    </div>
    ${st.trophies.length ? html`<h2 class="section-h">${t('me.trophies')}</h2><div class="trophies">${st.trophies.map((x) => html`<span>${medal(x.rank)} GW${x.gw}</span>`)}</div>` : ''}
    <h2 class="section-h">${t('me.squads')}</h2>
    ${prof.squads.length
      ? html`<ul class="list">${prof.squads.map((q) => html`<li><a href="/t/${q.key}"><span><b>GW${q.gw}</b>${q.live ? html` <span class="tag">live</span>` : ''}<br><small style="color:var(--faint)">${t('lb.votes', { n: q.votes })}${q.rank ? `, #${q.rank}` : ''}</small></span><span class="num">${q.avg != null ? q.avg.toFixed(1) : '-'}</span></a></li>`)}</ul>`
      : html`<p class="sub">${s.gw ? t('squad.none', { gw: s.gw.id }) : ''}</p>`}
    <h2 class="section-h">${t('me.verdicts')}</h2>
    ${prof.verdicts.length
      ? html`<ul class="list" id="verdicts">${prof.verdicts.map((v) => html`<li><button class="item" data-key="${v.key}" data-score="${v.score}" data-nick="${v.nickname}"><span>${v.nickname}<br><small style="color:var(--faint)">${t('me.change')}</small></span><span class="num">${v.score}</span></button></li>`)}</ul>`
      : html`<p class="sub">${t('me.verdictsEmpty')}</p>`}
    <div style="display:grid;gap:10px;margin-top:28px">
      ${s.user.admin ? html`<a class="btn" href="/admin">${t('me.admin')}</a>` : ''}
      <button class="btn btn-ghost" id="logout">${t('me.logout')}</button>
      <button class="btn btn-danger" id="delete">${t('me.delete')}</button>
    </div>
  </div>`.s;

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
  $('#verdicts', el)?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-key]');
    if (!b) return;
    const sh = sheet(html`<h2>${b.dataset.nick}</h2><p>${t('me.change')}</p>
      <div class="verdicts">${Array.from({ length: 10 }, (_, i) => html`<button class="vbtn ${+b.dataset.score === i + 1 ? 'chosen' : ''}" data-s="${i + 1}" aria-label="${t('judge.score', { n: i + 1 })}">${i + 1}</button>`)}</div>`);
    sh.el.addEventListener('click', async (ev) => {
      const v = ev.target.closest('[data-s]');
      if (!v) return;
      try {
        await api('/api/votes', { method: 'POST', body: { key: b.dataset.key, score: +v.dataset.s } });
        sh.close();
        toast(t('me.saved'));
        mount(el);
      } catch (err) {
        toast(errText(err), { bad: true });
      }
    });
  });
}
