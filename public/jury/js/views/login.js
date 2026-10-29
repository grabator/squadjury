// /login?token=...: the link from the sign in email. /login?google=...: back from Google sign in on a phone
// (the server already started the session). Asks for a nickname the first time, then goes back to where the
// juror started signing in.

import { t } from '../i18n.js';
import { html, $, errText } from '../ui.js';
import { api } from '../api.js';
import { store, refreshState } from '../store.js';
import { pickNickname, signIn } from '../auth.js';
import { navigate } from '../app.js';

let verifying = false, view = null, googleQ = null, googleBusy = false;

export async function mount(el) {
  view = el; // the page can be mounted again while the link is checked: always draw into the latest
  const token = new URLSearchParams(location.search).get('token') || '';
  // Back from Google: remember the answer, because the page can be mounted again after the address is cleaned.
  const q = new URLSearchParams(location.search);
  if (q.get('google')) googleQ = q;
  if (googleQ) return googleBack(el, googleQ);
  // Mounted again without the token (the page re-renders while signing in): leave it be.
  const waiting = html`<div class="empty login-page"><span class="ycard" aria-hidden="true"></span><h1 class="title">${t('auth.linkTitle')}</h1><div class="skeleton" style="height:14px;width:60%;margin:8px auto 0"></div></div>`.s;
  if (!token && (verifying || store.state.user)) {
    el.innerHTML = waiting;
    if (!verifying) navigate('/jury/', { replace: true });
    return;
  }
  verifying = true;
  // The token should not stay in the address bar or the history.
  history.replaceState(null, '', '/jury/login');
  el.innerHTML = waiting;
  try {
    const r = await api('/api/auth/email/verify', { method: 'POST', body: { token } });
    await refreshState();
    if (!r.nickname) await pickNickname(r.suggestion);
    await refreshState();
    let back = '/';
    try { back = sessionStorage.getItem('sj-login-back') || '/'; sessionStorage.removeItem('sj-login-back'); } catch {}
    verifying = false;
    navigate(back.startsWith('/jury/login') ? '/' : back, { replace: true });
  } catch (e) {
    verifying = false;
    el = view;
    el.innerHTML = html`<div class="empty login-page"><span class="ycard" aria-hidden="true"></span>
      <h1 class="title">${t('auth.linkBad')}</h1><p>${errText(e)}</p>
      <button class="btn btn-go" id="again">${t('auth.linkAgain')}</button></div>`.s;
    $('#again', el).onclick = async () => { if (await signIn()) navigate('/jury/', { replace: true }); };
  }
}

/** Back from Google (redirect sign in on phones). */
async function googleBack(el, q) {
  view = el;
  history.replaceState(null, '', '/jury/login');
  const backTo = () => {
    googleQ = null;
    let back = '/';
    try { back = sessionStorage.getItem('sj-login-back') || '/'; sessionStorage.removeItem('sj-login-back'); } catch {}
    navigate(back.startsWith('/jury/login') ? '/' : back, { replace: true });
  };
  if (q.get('google') === 'fail') {
    const code = q.get('e') || 'generic';
    const known = t(`err.${code}`);
    const msg = code === 'google_csrf' ? t('auth.googleCookies') : known.startsWith('err.') ? t('err.generic') : known;
    el.innerHTML = html`<div class="empty login-page"><span class="ycard" aria-hidden="true"></span>
      <h1 class="title">${t('auth.googleFail')}</h1><p>${msg}</p>
      <button class="btn btn-go" id="again">${t('err.tryAgain')}</button></div>`.s;
    $('#again', el).onclick = async () => { googleQ = null; if (await signIn()) backTo(); };
    return;
  }
  el.innerHTML = html`<div class="empty login-page"><span class="ycard" aria-hidden="true"></span><h1 class="title">${t('auth.linkTitle')}</h1><div class="skeleton" style="height:14px;width:60%;margin:8px auto 0"></div></div>`.s;
  if (googleBusy) return; // mounted again while the nickname step is open
  googleBusy = true;
  await refreshState();
  if (store.state.user && !store.state.user.nickname) await pickNickname(q.get('s') || '');
  await refreshState();
  googleBusy = false;
  backTo();
}
