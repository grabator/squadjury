// Admin: reported and hidden squads. Restore, delete, or ban the owner.

import { html, $, toast, errText } from '../ui.js';
import { api } from '../api.js';
import { loadFpl } from '../fpl.js';
import { store } from '../store.js';
import { squadHtml } from '../pitch.js';

export async function mount(el) {
  if (!store.state.user?.admin) {
    el.innerHTML = html`<div class="empty"><h2>Admins only</h2></div>`.s;
    return;
  }
  const fpl = await loadFpl();
  const { teams } = await api('/api/admin/reports');
  el.innerHTML = html`<div class="page-head"><h1 class="title">Reports</h1><p class="sub">${teams.length} squads reported or hidden</p></div>
    <div style="display:grid;gap:16px">${teams.map((tm) => html`
      <article class="jcard" data-key="${tm.key}">
        <div class="jcard-head"><div class="owner"><b>${tm.nickname}</b></div><span class="gwchip">GW${tm.gw}</span></div>
        <p class="sub">${tm.reports} reports${tm.hidden ? ', hidden' : ''}</p>
        ${tm.image ? html`<div class="shot" style="max-width:280px;margin:8px 0"><img src="${tm.image}" alt="Reported screenshot"></div>` : ''}
        ${squadHtml(fpl, tm)}
        <div class="row" style="margin-top:12px">
          <button class="btn" data-act="restore">Restore</button>
          <button class="btn btn-danger" data-act="delete">Delete squad</button>
          <button class="btn btn-danger" data-act="ban" data-owner="${tm.owner}">Ban owner</button>
        </div>
      </article>`)}</div>`.s;
  el.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const card = b.closest('[data-key]');
    try {
      if (b.dataset.act === 'ban') await api(`/api/admin/users/${b.dataset.owner}/ban`, { method: 'POST' });
      else await api(`/api/admin/teams/${card.dataset.key}`, { method: 'POST', body: { action: b.dataset.act } });
      toast('Done');
      card.remove();
    } catch (err) {
      toast(errText(err), { bad: true });
    }
  });
}
