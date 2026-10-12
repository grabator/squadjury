// Me: player card, stats, badges, squads by gameweek, verdicts, settings and About.

import { t } from '../i18n.js';
import { html, raw, $, sheet, toast, errText, ICONS, avatar } from '../ui.js';
import { api } from '../api.js';
import { store, refreshState } from '../store.js';
import { ensureUser, pickNickname } from '../auth.js';
import { navigate } from '../app.js';
import { soundOn, setSound, chime } from '../sound.js';

const aboutHtml = () => html`<h2 class="section-h">${t('me.about')}</h2>
  <div class="about-links list">
    <a href="/how"><span>${t('page.how')}</span>${raw(ICONS.skip.replace('<svg', '<svg style="width:16px;height:16px;opacity:.6"'))}</a>
    <a href="/rules"><span>${t('page.rules')}</span>${raw(ICONS.skip.replace('<svg', '<svg style="width:16px;height:16px;opacity:.6"'))}</a>
    <a href="/privacy"><span>${t('page.privacy')}</span>${raw(ICONS.skip.replace('<svg', '<svg style="width:16px;height:16px;opacity:.6"'))}</a>
  </div>
  <p class="fan-note">${t('footer.fan')}</p>`;

const soundHtml = () => html`<label class="switch"><span>${raw(ICONS.sound.replace('<svg', '<svg style="width:20px;height:20px;display:inline;vertical-align:-4px;margin-right:8px"'))}${t('me.sound')}</span><input type="checkbox" id="sound" ${raw(soundOn() ? 'checked' : '')}></label>`;

function wireSound(el) {
  $('#sound', el)?.addEventListener('change', (e) => { setSound(e.target.checked); if (e.target.checked) chime(); });
}

/** Badges: earned ones in colour, the rest grey, so there is always something to chase. */
function badgesHtml(prof, s) {
  const st = prof.stats;
  const wins = st.trophies.filter((x) => x.rank === 1).length;
  const list = [
    { on: prof.squads.length > 0, icon: ICONS.post, label: t('badge.first'), c: 'var(--accent)' },
    { on: s.judged >= 5 || prof.verdicts.length >= 5, icon: ICONS.judge, label: t('badge.juror'), c: 'var(--light)' },
    { on: st.top10 > 0, icon: ICONS.star, label: t('badge.top10'), c: 'var(--live)' },
    { on: wins > 0, icon: ICONS.trophy, label: t('badge.champ'), c: 'var(--gold)' },
  ];
  return html`<div class="badges">${list.map((b) => html`<div class="bdg ${b.on ? 'on' : ''}" style="--mc:${b.c}"><span class="medal">${raw(b.icon)}</span>${b.label}</div>`)}</div>`;
}

export async function mount(el) {
  const s = store.state;
  if (!s.user?.nickname) {
    el.innerHTML = html`<div class="playercard"><img src="/img/logo/mark.svg" alt="" width="64" height="64" style="width:64px;border-radius:16px">
        <div><h1>${t('me.title')}</h1><p class="sub">${t('me.signedOut')}</p></div></div>
      <button class="btn btn-go btn-block" id="signin">${t('auth.google')}</button>
      <div style="margin-top:16px">${soundHtml()}</div>
      ${aboutHtml()}`.s;
    $('#signin', el).onclick = async () => { if (await ensureUser()) mount(el); };
    wireSound(el);
    return;
  }
  const prof = await api('/api/me/profile');
  const st = prof.stats;
  const medal = (r) => (r === 1 ? '🥇' : r === 2 ? '🥈' : '🥉');
  el.innerHTML = html`<div class="squad-wrap">
    <div class="playercard">
      ${avatar(s.user.nickname, 'xl')}
      <div style="min-width:0"><h1>${s.user.nickname}</h1>
        ${s.user.x ? html`<p class="sub"><a href="https://x.com/${s.user.x}" target="_blank" rel="noopener">@${s.user.x}</a></p>` : html`<p class="sub">${t('me.juror')}</p>`}
        <button class="btn btn-ghost btn-sm" id="edit" style="margin-top:8px">${t('me.profile')}</button></div>
    </div>
    <div class="stats">
      <div class="stat"><span class="num" style="color:var(--accent)">${st.average ?? '-'}</span><span>${t('me.average')}</span></div>
      <div class="stat"><span class="num">${st.gameweeks}</span><span>${t('me.gameweeks')}</span></div>
      <div class="stat"><span class="num" style="color:var(--gold)">${st.best ? `#${st.best}` : '-'}</span><span>${t('me.best')}</span></div>
      <div class="stat"><span class="num">${st.top10}</span><span>${t('me.top10')}</span></div>
    </div>
    <h2 class="section-h">${t('me.badges')}</h2>
    ${badgesHtml(prof, s)}
    ${st.trophies.length ? html`<div class="row" style="gap:6px;margin-top:6px">${st.trophies.map((x) => html`<span class="tag" style="font-size:13px;padding:4px 10px">${medal(x.rank)} GW${x.gw}</span>`)}</div>` : ''}
    <h2 class="section-h">${t('me.squads')}</h2>
    ${prof.squads.length
      ? html`<ul class="list">${prof.squads.map((q) => html`<li><a href="/t/${q.key}"><span><b>GW${q.gw}</b>${q.live ? html` <span class="tag tag-live">live</span>` : ''}<br><small style="color:var(--text-3)">${t('lb.votes', { n: q.votes })}${q.rank ? `, #${q.rank}` : ''}</small></span><span class="num">${q.avg != null ? q.avg.toFixed(1) : '-'}</span></a></li>`)}</ul>`
      : html`<p class="sub">${s.gw ? t('squad.none', { gw: s.gw.id }) : ''}</p>`}
    <h2 class="section-h">${t('me.verdicts')}</h2>
    ${prof.verdicts.length
      ? html`<ul class="list" id="verdicts">${prof.verdicts.map((v) => html`<li><button class="item" data-key="${v.key}" data-score="${v.score}" data-nick="${v.nickname}"><span style="display:flex;align-items:center;gap:10px">${avatar(v.nickname)}<span>${v.nickname}${v.demo ? html` <span class="tag tag-demo">${t('judge.exampleShort')}</span>` : ''}<br><small style="color:var(--text-3)">${t('me.change')}</small></span></span><span class="num" style="color:hsl(${(v.score - 1) * 15.5} 92% 60%)">${v.score}</span></button></li>`)}</ul>`
      : html`<p class="sub">${t('me.verdictsEmpty')}</p>`}
    <h2 class="section-h">${t('me.settings')}</h2>
    ${soundHtml()}
    ${aboutHtml()}
    <div style="display:grid;gap:10px;margin-top:22px">
      ${s.user.admin ? html`<a class="btn" href="/admin">${t('me.admin')}</a>` : ''}
      <button class="btn btn-ghost" id="logout">${t('me.logout')}</button>
      <button class="btn btn-danger" id="delete">${t('me.delete')}</button>
    </div>
  </div>`.s;

  wireSound(el);
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
      <div class="verdicts">${Array.from({ length: 10 }, (_, i) => html`<button class="vbtn ${+b.dataset.score === i + 1 ? 'chosen' : ''}" style="--n:${i + 1}" data-s="${i + 1}" aria-label="${t('judge.score', { n: i + 1 })}">${i + 1}</button>`)}</div>`);
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
