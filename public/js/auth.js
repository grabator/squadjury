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

/** Opens the sign in sheet. Resolves true once signed in with a nickname. */
export function signIn({ title = t('judge.signInToJudge'), text = t('judge.signInText') } = {}) {
  return new Promise((resolve) => {
    const st = store.state;
    let done = false;
    const s = sheet(
      html`<h2>${title}</h2><p>${text}</p>
        <div class="gsi" id="gsi"></div>
        ${!st.googleClientId ? html`<p class="hint">${t('auth.notConfigured')}</p>` : ''}
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
          <button class="btn btn-go btn-block" type="submit">${edit ? t('auth.save') : t('auth.continue')}</button>
        </form>`,
      { label: t('auth.nickTitle'), onClose: () => resolve(saved) },
    );
    $('#nickf', s.el).addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target;
      try {
        await api('/api/me', { method: 'PATCH', body: { nickname: f.nickname.value.trim(), x: f.x.value.trim() } });
        saved = true;
        await refreshState();
        s.close();
        if (edit) toast(t('me.saved'));
      } catch (err) {
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
