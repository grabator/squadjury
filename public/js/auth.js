// Sign in (Google, or a test juror in development) and the nickname step.

import { api } from './api.js';
import { t } from './i18n.js';
import { html, sheet, $, errText, toast } from './ui.js';
import { store, refreshState } from './store.js';

let gsiLoading = null;
function loadGsi() {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (!gsiLoading) {
    gsiLoading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true;
      s.onload = resolve;
      s.onerror = reject;
      document.head.append(s);
    });
  }
  return gsiLoading;
}

let appleLoading = null;
function loadApple() {
  if (window.AppleID?.auth) return Promise.resolve();
  appleLoading ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js';
    s.onload = resolve;
    s.onerror = reject;
    document.head.append(s);
  });
  return appleLoading;
}

/** Opens the sign in sheet. Resolves true once signed in with a nickname. */
export function signIn({ title = t('judge.signInToJudge'), text = t('judge.signInText') } = {}) {
  return new Promise((resolve) => {
    const st = store.state;
    let done = false;
    const s = sheet(
      html`<h2>${title}</h2><p>${text}</p>
        <div class="gsi" id="gsi"></div>
        ${!st.googleClientId ? html`<p class="hint">${t('auth.notConfigured')}</p>` : ''}
        ${st.appleClientId ? html`<button type="button" class="btn btn-block apple-btn" id="apple">${t('auth.apple')}</button>` : ''}
        ${st.emailLogin ? html`<div class="or">${t('auth.or')}</div>
          <form id="mailf" class="field mail-form" novalidate><label for="mail">${t('auth.emailLabel')}</label>
            <input id="mail" name="email" type="email" inputmode="email" autocomplete="email" required placeholder="you@example.com" aria-describedby="mail-e">
            <span class="err" id="mail-e" role="alert"></span>
            <button class="btn btn-block" type="submit">${t('auth.emailGo')}</button></form>
          <div id="mailsent" hidden></div>` : ''}
        ${st.devLogin
          ? html`<div class="or">${t('auth.dev')}</div>
            <form id="devf" class="field"><label for="devn">${t('auth.devName')}</label>
              <input id="devn" name="n" autocomplete="off" value="juror${Math.floor(Math.random() * 900 + 100)}">
              <button class="btn btn-ghost btn-block" type="submit">${t('auth.devGo')}</button></form>`
          : ''}`,
      { label: title, onClose: () => !done && resolve(false) },
    );
    const ref = (() => { try { return JSON.parse(sessionStorage.getItem('sj-ref') || 'null'); } catch { return null; } })();
    const finish = async (data) => {
      done = true;
      s.close();
      const ok = data.nickname ? true : await pickNickname(data.suggestion);
      await refreshState();
      resolve(ok);
    };
    if (st.googleClientId) {
      loadGsi()
        .then(() => {
          window.google.accounts.id.initialize({
            client_id: st.googleClientId,
            callback: async ({ credential }) => {
              try { await finish(await api('/api/auth/google', { method: 'POST', body: { credential, ref } })); }
              catch (e) { toast(errText(e), { bad: true }); }
            },
          });
          window.google.accounts.id.renderButton($('#gsi', s.el), { theme: 'filled_black', size: 'large', shape: 'pill', text: 'continue_with', width: 300 });
        })
        .catch(() => toast(t('err.offline'), { bad: true }));
    }
    // Email me a link: the link signs in on whichever device opens it.
    $('#mailf', s.el)?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target, btn = $('button', f);
      btn.disabled = true;
      try {
        const r = await api('/api/auth/email', { method: 'POST', body: { email: f.email.value, ref } });
        try { sessionStorage.setItem('sj-login-back', location.pathname + location.search); } catch {}
        const box = $('#mailsent', s.el);
        f.hidden = true;
        box.hidden = false;
        box.innerHTML = html`<div class="mail-sent"><span class="ycard" aria-hidden="true"></span><div><b>${t('auth.emailSentTitle')}</b>
          <p>${t('auth.emailSent', { email: f.email.value.trim() })}</p>
          ${r.devLink ? html`<a class="btn btn-sm" href="${r.devLink}">${t('auth.devLink')}</a>` : ''}
          <button type="button" class="link-btn" id="mailagain">${t('auth.emailOther')}</button></div></div>`.s;
        $('#mailagain', box).onclick = () => { box.hidden = true; f.hidden = false; btn.disabled = false; f.email.focus(); };
        $('.mail-sent b', box).setAttribute('tabindex', '-1');
        $('.mail-sent b', box).focus();
      } catch (err) {
        $('#mail-e', s.el).textContent = errText(err);
        btn.disabled = false;
      }
    });
    $('#apple', s.el)?.addEventListener('click', async () => {
      try {
        await loadApple();
        window.AppleID.auth.init({ clientId: st.appleClientId, scope: 'name email', redirectURI: `${location.origin}/login`, usePopup: true });
        const r = await window.AppleID.auth.signIn();
        const name = [r.user?.name?.firstName, r.user?.name?.lastName].filter(Boolean).join(' ');
        await finish(await api('/api/auth/apple', { method: 'POST', body: { idToken: r.authorization.id_token, ref, name } }));
      } catch (err) {
        if (err?.error === 'popup_closed_by_user') return;
        toast(errText(err), { bad: true });
      }
    });
    $('#devf', s.el)?.addEventListener('submit', async (e) => {
      e.preventDefault();
      try { await finish(await api('/api/auth/dev', { method: 'POST', body: { name: e.target.n.value, ref } })); }
      catch (err) { toast(errText(err), { bad: true }); }
    });
  });
}

/** Nickname (and optional X username) step. Resolves true when saved. */
export function pickNickname(suggestion = '', { edit = false } = {}) {
  return new Promise((resolve) => {
    const u = store.state.user;
    let saved = false;
    const s = sheet(
      html`<h2>${edit ? t('me.profile') : t('auth.nickTitle')}</h2><p>${t('auth.nickText')}</p>
        <form id="nickf" novalidate>
          <div class="field"><label for="nick">${t('auth.nickLabel')}</label>
            <input id="nick" name="nickname" required minlength="3" maxlength="20" pattern="[A-Za-z0-9_-]{3,20}" autocomplete="nickname" value="${u?.nickname || suggestion}" aria-describedby="nick-h nick-e">
            <span class="hint" id="nick-h">${t('auth.nickHint')}</span><span class="err" id="nick-e" role="alert"></span></div>
          <div class="field"><label for="xh">${t('auth.xLabel')}</label>
            <input id="xh" name="x" maxlength="16" placeholder="@username" autocomplete="off" value="${u?.x ? '@' + u.x : ''}" aria-describedby="x-h">
            <span class="hint" id="x-h">${t('auth.xHint')}</span></div>
          ${edit ? html`<div class="field"><label for="fplid">${t('auth.fplLabel')}</label>
            <input id="fplid" name="fplId" inputmode="numeric" maxlength="80" placeholder="1234567" autocomplete="off" value="${u?.fplId ?? ''}" aria-describedby="fpl-h fpl-e">
            <span class="hint" id="fpl-h">${t('auth.fplHint')}</span><span class="err" id="fpl-e" role="alert"></span></div>` : ''}
          <button class="btn btn-go btn-block" type="submit">${edit ? t('auth.save') : t('auth.continue')}</button>
        </form>`,
      { label: t('auth.nickTitle'), onClose: () => resolve(saved) },
    );
    $('#nickf', s.el).addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target;
      try {
        const body = { nickname: f.nickname.value.trim(), x: f.x.value.trim() };
        if (f.fplId) body.fplId = f.fplId.value.trim();
        await api('/api/me', { method: 'PATCH', body });
        saved = true;
        await refreshState();
        s.close();
        if (edit) toast(t('me.saved'));
      } catch (err) {
        if (err.code === 'fpl_id_format') { $('#fpl-e', s.el).textContent = errText(err); f.fplId.focus(); return; }
        $('#nick-e', s.el).textContent = errText(err);
        f.nickname.focus();
      }
    });
  });
}

/** Makes sure someone is signed in and has a nickname before an action. */
export async function ensureUser(opts) {
  const u = store.state.user;
  if (u?.nickname) return true;
  if (u && !u.nickname) return pickNickname('');
  return signIn(opts);
}
