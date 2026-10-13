// Admin: reported and hidden squads. Restore, delete, or ban the owner.

import { html, $, toast, errText, pagedList } from '../ui.js';
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
  const [{ teams }, { backups }, { sources }, { gameweeks: ptsGws }] = await Promise.all([api('/api/admin/reports'), api('/api/admin/backups'), api('/api/admin/sources'), api('/api/admin/points')]);
  const day = (ms) => new Date(ms).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const kb = (n) => (n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`);
  el.innerHTML = html`<section class="admin-backup">
      <div class="page-head"><h1 class="title">Backups</h1>
        <p class="sub">${backups[0] ? html`Latest: <b>${day(backups[0].uploaded)}</b>, ${backups[0].rows} rows, ${kb(backups[0].size)}` : 'No backup yet'}. Every Monday at 04:17 UTC, the last 8 are kept.</p></div>
      <button class="btn" id="backup-now">Backup now</button>
      ${backups.length ? html`<ul class="list" style="margin-top:12px">${backups.map((b) => html`<li><span class="item"><span>${b.key.replace('backups/', '')}</span><span class="sub" style="margin:0">${kb(b.size)}</span></span></li>`)}</ul>` : ''}
    </section>
    <section class="admin-points" style="margin-top:28px">
      <div class="page-head"><h1 class="title">Real points</h1><p class="sub">Fetched every hour once FPL confirms a gameweek. If FPL blocks the server, press Fetch, or run <b>npm run points -- --gw N</b> on your computer.</p></div>
      ${ptsGws.length
        ? html`<ul class="list">${ptsGws.map((g) => html`<li><span class="item"><span><b>GW${g.gw}</b> · ${g.status}${g.tries ? ` (${g.tries} tries)` : ''}<br><small>${g.scored}/${g.squads} squads scored, ${g.verified} verified</small></span>
            <button class="btn btn-sm" data-points="${g.gw}">Fetch</button></span></li>`)}</ul>`
        : html`<p class="sub">No finished gameweek yet.</p>`}
    </section>
    <section class="admin-sources" style="margin-top:28px">
      <div class="page-head"><h1 class="title">Where people come from</h1><p class="sub">Last 30 days. Links carry <b>?s=</b>: wa, vb, ms, x, copy, share, or a creator's name.</p></div>
      ${sources.length
        ? html`<div id="src-list"></div>`
        : html`<p class="sub">No visits counted yet.</p>`}
    </section>
    <div class="page-head" style="margin-top:28px"><h1 class="title">Reports</h1><p class="sub">${teams.length} squads reported or hidden</p></div>
    <div id="rep-list"></div>`.s;
  const reportCard = (tm) => html`
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
      </article>`;
  // Sources: 10 rows a page. Reports: 5 squads a page (each shows the whole squad).
  if ($('#src-list', el)) pagedList($('#src-list', el), sources, (rows) => html`<div class="table-wrap"><table class="src-table"><thead><tr><th scope="col">Source</th><th scope="col">Opens</th><th scope="col">Rate</th><th scope="col">Squad</th><th scope="col">League</th><th scope="col">Sign ups</th></tr></thead>
    <tbody>${rows.map((r) => html`<tr><th scope="row">${r.source}</th><td>${r.opens}</td><td>${r.rate}</td><td>${r.squad}</td><td>${r.league}</td><td><b>${r.signups}</b></td></tr>`)}</tbody></table></div>`, { label: 'Sources' });
  pagedList($('#rep-list', el), teams, (rows) => html`<div style="display:grid;gap:16px">${rows.map(reportCard)}</div>`, { size: 5, label: 'Reports' });
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
  el.querySelectorAll('[data-points]').forEach((btn) => btn.addEventListener('click', async () => {
    btn.disabled = true;
    try {
      const r = await api('/api/admin/points', { method: 'POST', body: { gw: +btn.dataset.points } });
      toast(`GW${r.gw}: ${r.scored} squads scored`);
      navigate('/admin', { replace: true });
    } catch (err) {
      btn.disabled = false;
      toast(err.code === 'fpl_blocked' ? 'FPL blocked the server. Run npm run points on your computer.' : errText(err), { bad: true });
    }
  }));
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
