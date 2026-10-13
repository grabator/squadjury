// /login?token=...: the link from the sign in email. Signs in, asks for a nickname the first
// time, then goes back to where the juror asked for the link.

import { t } from '../i18n.js';
import { html, $, errText } from '../ui.js';
import { api } from '../api.js';
import { store, refreshState } from '../store.js';
import { pickNickname, signIn } from '../auth.js';
import { navigate } from '../app.js';

let verifying = false, view = null;

export async function mount(el) {
  view = el; // the page can be mounted again while the link is checked: always draw into the latest
  const token = new URLSearchParams(location.search).get('token') || '';
  // Mounted again without the token (the page re-renders while signing in): leave it be.
  const waiting = html`<div class="empty login-page"><span class="ycard" aria-hidden="true"></span><h1 class="title">${t('auth.linkTitle')}</h1><div class="skeleton" style="height:14px;width:60%;margin:8px auto 0"></div></div>`.s;
  if (!token && (verifying || store.state.user)) {
    el.innerHTML = waiting;
    if (!verifying) navigate('/', { replace: true });
    return;
  }
  verifying = true;
  // The token should not stay in the address bar or the history.
  history.replaceState(null, '', '/login');
  el.innerHTML = waiting;
  try {
    const r = await api('/api/auth/email/verify', { method: 'POST', body: { token } });
    await refreshState();
    if (!r.nickname) await pickNickname(r.suggestion);
    await refreshState();
    let back = '/';
    try { back = sessionStorage.getItem('sj-login-back') || '/'; sessionStorage.removeItem('sj-login-back'); } catch {}
    verifying = false;
    navigate(back.startsWith('/login') ? '/' : back, { replace: true });
  } catch (e) {
    verifying = false;
    el = view;
    el.innerHTML = html`<div class="empty login-page"><span class="ycard" aria-hidden="true"></span>
      <h1 class="title">${t('auth.linkBad')}</h1><p>${errText(e)}</p>
      <button class="btn btn-go" id="again">${t('auth.linkAgain')}</button></div>`.s;
    $('#again', el).onclick = async () => { if (await signIn()) navigate('/', { replace: true }); };
  }
}
