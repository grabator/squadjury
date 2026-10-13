// All your verdicts for one gameweek, 10 per page.

import { t } from '../i18n.js';
import { html, $, pagerHtml } from '../ui.js';
import { api } from '../api.js';
import { store } from '../store.js';
import { ensureUser } from '../auth.js';
import { verdictRows, wireVerdicts } from './me.js';

export async function mount(el) {
  if (!store.state.user?.nickname && !(await ensureUser())) {
    el.innerHTML = html`<div class="empty"><h2>${t('me.title')}</h2><p>${t('me.signedOut')}</p></div>`.s;
    return;
  }
  const q = new URLSearchParams(location.search);
  const r = await api(`/api/me/verdicts?gw=${+q.get('gw') || ''}&page=${+q.get('page') || 1}&size=10`);
  const link = (p) => `/me/verdicts?gw=${r.gw}&page=${p}`;
  el.innerHTML = html`<div>
    <p style="margin:0 0 8px"><a href="/me" class="link-btn" style="padding:0">${t('pager.back')}</a></p>
    <div class="page-head"><h1 class="title">${t('me.verdictsGw', { gw: r.gw })}</h1><p class="sub">${t('lb.votes', { n: r.total })}</p></div>
    ${r.items.length ? html`<ul class="list" id="vl">${verdictRows(r.items)}</ul>` : html`<p class="sub">${t('me.verdictsEmpty')}</p>`}
    ${pagerHtml(r.page, r.pages)}
  </div>`.s;
  el.querySelectorAll('.pgr [data-goto]').forEach((b) => b.addEventListener('click', () => { history.pushState(null, '', link(+b.dataset.goto)); mount(el); scrollTo(0, 0); }));
  const list = $('#vl', el);
  if (list) wireVerdicts(list, { open: r.open, onChange: () => mount(el) });
}
