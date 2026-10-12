// All your verdicts for one gameweek, 20 per page with Previous and Next.

import { t } from '../i18n.js';
import { html, $ } from '../ui.js';
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
  const r = await api(`/api/me/verdicts?gw=${+q.get('gw') || ''}&page=${+q.get('page') || 1}&size=20`);
  const link = (p) => `/me/verdicts?gw=${r.gw}&page=${p}`;
  // Page numbers around the current one, so the bar stays short.
  const nums = [];
  for (let p = Math.max(1, r.page - 2); p <= Math.min(r.pages, r.page + 2); p++) nums.push(p);
  el.innerHTML = html`<div>
    <p style="margin:0 0 8px"><a href="/me" class="link-btn" style="padding:0">${t('pager.back')}</a></p>
    <div class="page-head"><h1 class="title">${t('me.verdictsGw', { gw: r.gw })}</h1><p class="sub">${t('lb.votes', { n: r.total })}</p></div>
    ${r.items.length ? html`<ul class="list" id="vl">${verdictRows(r.items)}</ul>` : html`<p class="sub">${t('me.verdictsEmpty')}</p>`}
    ${r.pages > 1 ? html`<nav class="pager" aria-label="${t('pager.label')}">
      ${r.page > 1 ? html`<a class="btn btn-sm btn-ghost" href="${link(r.page - 1)}">${t('pager.prev')}</a>` : html`<span></span>`}
      <span class="pages">${nums.map((p) => (p === r.page ? html`<span aria-current="page">${p}</span>` : html`<a href="${link(p)}">${p}</a>`))}</span>
      ${r.page < r.pages ? html`<a class="btn btn-sm btn-ghost" href="${link(r.page + 1)}">${t('pager.next')}</a>` : html`<span></span>`}
    </nav>` : ''}
  </div>`.s;
  const list = $('#vl', el);
  if (list) wireVerdicts(list, { open: r.open, onChange: () => mount(el) });
}
