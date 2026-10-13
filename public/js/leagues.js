// Private leagues on the client: the create / join sheet, the invite sheet with code and link,
// and the settings sheet (rename, new code, members, leave).

import { t } from './i18n.js';
import { html, raw, $, $$, sheet, toast, errText, ICONS } from './ui.js';
import { api } from './api.js';
import { store } from './store.js';
import { signIn } from './auth.js';
import { channelsHtml, wireChannels } from './views/common.js';

export const leagueUrl = (code, s) => `${location.origin}/l/${code}${s ? `?s=${s}` : ''}`;
export const prettyCode = (code) => `${code.slice(0, 3)} ${code.slice(3)}`;
export const membersText = (n) => (n === 1 ? t('league.member1') : t('league.members', { n }));

let mineCache = null;
/** Leagues of the signed in user (cached until something changes). */
export async function myLeagues(force = false) {
  if (!store.state.user?.nickname) return [];
  if (!mineCache || force) mineCache = (await api('/api/leagues/mine')).leagues;
  return mineCache;
}
export const forgetLeagues = () => { mineCache = null; };

async function needAccount() {
  if (store.state.user?.nickname) return true;
  return signIn({ title: t('league.signIn'), text: t('league.signInText') });
}

/** Draws the league link preview in the browser and stores it (owner only, quietly). */
export async function uploadLeagueOg(league) {
  try {
    const { renderLeagueImage } = await import('./share.js');
    const blob = await renderLeagueImage(league);
    const fd = new FormData();
    fd.set('og', blob, 'league.jpg');
    await api(`/api/leagues/${league.code}/og`, { method: 'PUT', form: fd });
  } catch {}
}

/** The + League sheet: create a league or join one with a code. Resolves the league, or null. */
export async function openLeagueSheet() {
  if (!(await needAccount())) return null;
  return new Promise((resolve) => {
    let result = null;
    const sh = sheet(html`<h2>${t('league.sheetTitle')}</h2><p>${t('league.sheetText')}</p>
      <form class="lg-card" id="lg-create" novalidate>
        <h3><span class="lg-ico">${raw(ICONS.plus)}</span>${t('league.create')}</h3>
        <div class="field"><label for="lg-name">${t('league.nameLabel')}</label>
          <input id="lg-name" name="name" maxlength="30" required autocomplete="off" placeholder="${t('league.namePlaceholder')}" aria-describedby="lg-name-h lg-name-e">
          <span class="hint lg-count" id="lg-name-h"><span>${t('league.createHint')}</span><span id="lg-n">0/30</span></span>
          <span class="err" id="lg-name-e" role="alert"></span></div>
        <button class="btn btn-go btn-block" type="submit">${t('league.createGo')}</button>
      </form>
      <form class="lg-card" id="lg-join" novalidate>
        <h3><span class="lg-ico">${raw(ICONS.users)}</span>${t('league.join')}</h3>
        <div class="field"><label for="lg-code">${t('league.codeLabel')}</label>
          <div class="code-boxes" aria-hidden="true">${Array.from({ length: 6 }, () => html`<span></span>`)}</div>
          <input id="lg-code" class="code-input" name="code" required autocomplete="off" autocapitalize="characters" spellcheck="false" inputmode="text" aria-describedby="lg-code-h lg-code-e">
          <span class="hint" id="lg-code-h">${t('league.codeHint')}</span>
          <span class="err" id="lg-code-e" role="alert"></span></div>
        <button class="btn btn-block" type="submit">${t('league.joinGo')}</button>
      </form>`, { label: t('league.sheetTitle'), onClose: () => resolve(result) });
    const el = sh.el;
    const name = $('#lg-name', el);
    name.addEventListener('input', () => { $('#lg-n', el).textContent = `${name.value.length}/30`; $('#lg-name-e', el).textContent = ''; });
    // The code shows in six boxes; a pasted link or "K7P 2QX" is cleaned to the six characters.
    const code = $('#lg-code', el);
    const boxes = $$('.code-boxes span', el);
    const paint = () => {
      const m = code.value.match(/\/l\/([A-Za-z0-9]{6})/);
      const clean = (m ? m[1] : code.value).replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 6);
      if (code.value !== clean) code.value = clean;
      boxes.forEach((b, i) => { b.textContent = clean[i] || ''; b.classList.toggle('on', i === Math.min(clean.length, 5) && document.activeElement === code); });
      $('#lg-code-e', el).textContent = '';
    };
    code.addEventListener('input', paint);
    code.addEventListener('focus', paint);
    code.addEventListener('blur', paint);
    $('.code-boxes', el).addEventListener('click', () => code.focus());

    $('#lg-create', el).addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = e.submitter || $('#lg-create button', el);
      btn.disabled = true;
      try {
        const { league } = await api('/api/leagues', { method: 'POST', body: { name: name.value } });
        result = league;
        forgetLeagues();
        uploadLeagueOg(league);
        showInvite(sh, league, { created: true, onGo: () => { sh.close(); } });
      } catch (err) {
        $('#lg-name-e', el).textContent = errText(err);
        btn.disabled = false;
      }
    });
    $('#lg-join', el).addEventListener('submit', async (e) => {
      e.preventDefault();
      if (code.value.length !== 6) { $('#lg-code-e', el).textContent = t('err.league_code_format'); return; }
      try {
        const { league } = await api('/api/leagues/join', { method: 'POST', body: { code: code.value } });
        result = league;
        forgetLeagues();
        toast(t('league.joined', { name: league.name }));
        sh.close();
      } catch (err) {
        $('#lg-code-e', el).textContent = errText(err);
      }
    });
  });
}

/** Fills a sheet with the invite: big code, link and share buttons. */
function showInvite(sh, league, { created = false, onGo } = {}) {
  sh.el.innerHTML = html`<div class="grab" aria-hidden="true"></div>
    <div class="lg-invite">
      ${created ? html`<p class="lg-done"><span class="ycard" aria-hidden="true"></span>${t('league.created')}</p>` : html`<h2>${t('league.inviteTitle')}</h2>`}
      <p class="lg-name">${league.name}</p>
      <p class="sub" style="margin:0 0 14px">${t('league.inviteText')}</p>
      <div class="lg-code-big"><span class="lg-code-txt"><span class="lbl">${t('league.code')}</span><b>${prettyCode(league.code)}</b></span>
        <button type="button" class="btn btn-sm" id="cp-code">${raw(ICONS.copy)}${t('league.copyCode')}</button></div>
      <div class="lg-link"><span>${leagueUrl(league.code).replace(/^https?:\/\//, '')}</span>
        <button type="button" class="btn btn-sm" id="cp-link">${raw(ICONS.link)}${t('league.copyLink')}</button></div>
      ${channelsHtml()}
      ${onGo ? html`<button type="button" class="btn btn-go btn-block" id="lg-go" style="margin-top:14px">${t('league.go')}</button>` : ''}
    </div>`.s;
  const el = sh.el;
  const copy = async (text, msg) => { try { await navigator.clipboard.writeText(text); toast(msg); } catch { toast(text); } };
  $('#cp-code', el).onclick = () => copy(league.code, t('league.codeCopied'));
  $('#cp-link', el).onclick = () => copy(leagueUrl(league.code, 'copy'), t('league.linkCopied'));
  wireChannels(el, { url: (ch) => leagueUrl(league.code, ch), text: (link) => t('league.inviteMsg', { name: league.name, link, code: league.code }) });
  $('#lg-go', el)?.addEventListener('click', onGo);
  setTimeout(() => ($('#lg-go', el) || $('#cp-code', el)).focus(), 30);
}

/** Invite sheet for an existing league. */
export function inviteSheet(league) {
  const sh = sheet(html`<span></span>`, { label: t('league.inviteTitle') });
  showInvite(sh, league);
  return sh;
}

/** Settings: rename and new code (owner), members (owner can remove), leave. onChange(league|null). */
export async function settingsSheet(code, onChange) {
  const { league } = await api(`/api/leagues/${code}`);
  const owner = league.isOwner;
  const sh = sheet(html`<h2>${t('league.settings')}</h2><p class="sub" style="margin-top:-4px">${league.name} · ${membersText(league.members)}</p>
    ${owner ? html`<form id="lg-rename" class="field" novalidate><label for="lg-rn">${t('league.rename')}</label>
        <div class="lg-rename"><input id="lg-rn" maxlength="30" value="${league.name}" autocomplete="off" aria-describedby="lg-rn-e"><button class="btn" type="submit">${t('league.renameGo')}</button></div>
        <span class="err" id="lg-rn-e" role="alert"></span></form>
      <div class="lg-setrow"><div><b>${t('league.newCode')}</b><span>${t('league.newCodeText')}</span></div><button class="btn btn-sm" id="lg-newcode">${t('league.newCode')}</button></div>` : ''}
    <h3 class="section-h" style="margin-top:18px">${t('league.membersTitle')}</h3>
    <ul class="list lg-members">${league.memberList.map((m) => html`<li><span class="item"><span>${m.nickname}${m.owner ? html` <span class="tag">${t('league.owner')}</span>` : ''}</span>
      ${owner && !m.owner ? html`<button class="link-btn" data-kick="${m.id}" data-nick="${m.nickname}">${t('league.kick')}</button>` : ''}</span></li>`)}</ul>
    <button class="btn btn-danger btn-block" id="lg-leave" style="margin-top:16px">${t('league.leave')}</button>
    <p class="hint" style="text-align:center;margin-top:6px">${t('league.leaveText')}</p>`, { label: t('league.settings') });
  const el = sh.el;
  $('#lg-rename', el)?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const { league: l } = await api(`/api/leagues/${code}/rename`, { method: 'POST', body: { name: $('#lg-rn', el).value } });
      forgetLeagues();
      uploadLeagueOg(l);
      sh.close();
      onChange?.(l);
    } catch (err) { $('#lg-rn-e', el).textContent = errText(err); }
  });
  $('#lg-newcode', el)?.addEventListener('click', async () => {
    try {
      const { league: l } = await api(`/api/leagues/${code}/new-code`, { method: 'POST' });
      forgetLeagues();
      uploadLeagueOg(l);
      toast(t('league.newCodeDone', { code: prettyCode(l.code) }), { ms: 4000 });
      sh.close();
      onChange?.(l);
    } catch (err) { toast(errText(err), { bad: true }); }
  });
  el.querySelectorAll('[data-kick]').forEach((b) => b.addEventListener('click', async () => {
    try {
      await api(`/api/leagues/${code}/kick`, { method: 'POST', body: { userId: +b.dataset.kick } });
      b.closest('li').remove();
      toast(t('league.kicked'));
    } catch (err) { toast(errText(err), { bad: true }); }
  }));
  $('#lg-leave', el).addEventListener('click', async () => {
    try {
      await api(`/api/leagues/${code}/leave`, { method: 'POST' });
      forgetLeagues();
      toast(t('league.left'));
      sh.close();
      onChange?.(null);
    } catch (err) { toast(errText(err), { bad: true }); }
  });
}
