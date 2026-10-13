// Admin: reported and hidden squads. Restore, delete, or ban the owner.

import { html, $, toast, errText } from '../ui.js';
import { api } from '../api.js';
import { loadFpl } from '../fpl.js';
import { store } from '../store.js';
import { squadHtml } from '../pitch.js';
import { navigate } from '../app.js';

export async function mount(el) {
  if (!store.state.user?.admin) {
    el.innerHTML = html`<div class="empty"><h2>Admins only</h2></div>`.s;
    return;
  }
  const fpl = await loadFpl();
  const [{ teams }, { backups }] = await Promise.all([api('/api/admin/reports'), api('/api/admin/backups')]);
  const day = (ms) => new Date(ms).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const kb = (n) => (n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`);
  el.innerHTML = html`<section class="admin-backup">
      <div class="page-head"><h1 class="title">Backups</h1>
        <p class="sub">${backups[0] ? html`Latest: <b>${day(backups[0].uploaded)}</b>, ${backups[0].rows} rows, ${kb(backups[0].size)}` : 'No backup yet'}. Every Monday at 04:17 UTC, the last 8 are kept.</p></div>
      <button class="btn" id="backup-now">Backup now</button>
      ${backups.length ? html`<ul class="list" style="margin-top:12px">${backups.map((b) => html`<li><span class="item"><span>${b.key.replace('backups/', '')}</span><span class="sub" style="margin:0">${kb(b.size)}</span></span></li>`)}</ul>` : ''}
    </section>
    <div class="page-head" style="margin-top:28px"><h1 class="title">Reports</h1><p class="sub">${teams.length} squads reported or hidden</p></div>
    <div style="display:grid;gap:16px">${teams.map((tm) => html`
      <article class="jcard" data-key="${tm.key}">
        <div class="jcard-head"><div class="who"><b>${tm.nickname}</b><span>GW${tm.gw}</span></div></div>
        <p class="sub">${tm.reports} reports${tm.hidden ? ', hidden' : ''}</p>
        ${tm.image ? html`<div class="shot" style="max-width:280px;margin:8px 0"><img src="${tm.image}" alt="Reported screenshot"></div>` : ''}
        ${squadHtml(fpl, tm)}
        <div class="row" style="margin-top:12px">
          <button class="btn" data-act="restore">Restore</button>
          <button class="btn btn-danger" data-act="delete">Delete squad</button>
          <button class="btn btn-danger" data-act="ban" data-owner="${tm.owner}">Ban owner</button>
        </div>
      </article>`)}</div>`.s;
  $('#backup-now', el).onclick = async (e) => {
    e.target.disabled = true;
    try {
      const { backup } = await api('/api/admin/backup', { method: 'POST' });
      toast(`Backup saved: ${backup.rows} rows`);
      navigate('/admin', { replace: true });
    } catch (err) {
      e.target.disabled = false;
      toast(errText(err), { bad: true });
    }
  };
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
