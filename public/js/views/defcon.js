// DefCon: igrači koji su u kolu dobili +2 za odbrambeni doprinos i oni kojima je falilo malo.
import { S, live, liveFix } from '../state.js';
import { defConByFixture } from '../model.js';
import { esc, pbtn, shirt, photo, scorePlate } from '../ui.js';
import { tr } from '../i18n.js';

export const title = 'DefCon';
let gwSel = null, scope = 'all', pos = 0;
const POS_SH = tr({ 2: 'ODB', 3: 'VEZ', 4: 'NAP' }, { 2: 'DEF', 3: 'MID', 4: 'FWD' });

const card = (ix, r, mine) => {
  const t = ix.teams.get(r.e.team), pct = Math.min(100, Math.round((r.v / r.need) * 100)), miss = r.need - r.v, my = mine.has(r.e.id);
  return `<div class="dm${r.hit ? ' hit' : ''}${my ? ' me' : ''}">
    <span class="dm-ph pat-bg" aria-hidden="true"><span class="shirt">${shirt(t, false)}${photo(r.e)}</span><span class="dm-v"><b>${r.v}</b>/${r.need}</span>${r.hit ? '<em class="dc-ok">+2</em>' : `<em class="dc-miss">-${miss}</em>`}</span>
    <span class="dm-bar" aria-hidden="true"><i style="width:${pct}%"></i></span>
    <span class="dm-n">${pbtn(r.e)}</span><span class="dm-s">${esc(t.short_name)} · ${POS_SH[r.e.element_type]}${my ? ' · ★' : ''}</span>
    <span class="sr">${r.v} ${tr('od', 'of')} ${r.need}${r.hit ? ', +2' : `, ${tr('fali', 'short')} ${miss}`}${my ? ', ' + tr('tvoj igrač', 'your player') : ''}</span>
  </div>`;
};

export async function render() {
  const { ix } = S, last = S.lastGw, gw = gwSel && gwSel <= last ? gwSel : last;
  const [lv, lf] = await Promise.all([live(gw), liveFix(gw).catch(() => null)]), mine = new Set([...(S.xi || []), ...(S.bench || [])]);
  const ok = (r) => (scope !== 'mine' || mine.has(r.e.id)) && (!pos || r.e.element_type === pos);
  const fx = defConByFixture(ix, lv).map((x) => ({ ...x, hit: x.hit.filter(ok), near: x.near.filter(ok), f: lf?.get(x.fid) }))
    .filter((x) => x.hit.length || x.near.length)
    .sort((a, b) => String(a.f?.kickoff_time || '').localeCompare(String(b.f?.kickoff_time || '')) || a.fid - b.fid);
  const nHit = fx.reduce((s, x) => s + x.hit.length, 0), nNear = fx.reduce((s, x) => s + x.near.length, 0);
  const myHit = fx.reduce((s, x) => s + x.hit.filter((r) => mine.has(r.e.id)).length, 0);
  const seg = `<div class="seg dc-seg" role="group" aria-label="${tr('Prikaz', 'Show')}"><button type="button" data-scope="all" aria-pressed="${scope === 'all'}">${tr('Svi', 'All')}</button><button type="button" data-scope="mine" aria-pressed="${scope === 'mine'}">${tr('Moj tim', 'My team')}</button></div><div class="seg dc-seg" role="group" aria-label="${tr('Pozicija', 'Position')}">${[[0, tr('Sve', 'All')], [2, POS_SH[2]], [3, POS_SH[3]], [4, POS_SH[4]]].map(([k, l]) => `<button type="button" data-pos="${k}" aria-pressed="${pos === k}">${l}</button>`).join('')}</div>`;
  const block = (x) => {
    const f = x.f, hm = f && ix.teams.get(f.team_h), aw = f && ix.teams.get(f.team_a);
    const score = f && f.team_h_score != null ? `${f.team_h_score}<i>-</i>${f.team_a_score}` : '<i>v</i>';
    const st = !f ? '' : f.finished || f.finished_provisional ? tr('Kraj', 'FT') : f.started ? `${f.minutes || 0}'` : '';
    const bug = hm && aw ? `<span class="bug" role="img" aria-label="${esc(hm.name)} ${f.team_h_score ?? ''} ${esc(aw.name)} ${f.team_a_score ?? ''}">${scorePlate(hm, 'h')}<span class="mid sc">${score}</span>${scorePlate(aw, 'a')}</span>${st ? `<span class="tab">${st}</span>` : ''}` : '';
    const has = [...x.hit, ...x.near].some((r) => mine.has(r.e.id));
    return `<section class="bx sb dcx${has ? ' has-me' : ''}">${bug}
      ${x.hit.length ? `<h3 class="dcx-h"><span class="dc-dot ok"></span>${tr('Dobili +2', 'Got +2')} <span>${x.hit.length}</span></h3><div class="dm-grid">${x.hit.map((r) => card(ix, r, mine)).join('')}</div>` : ''}
      ${x.near.length ? `<h3 class="dcx-h"><span class="dc-dot"></span>${tr('Bili blizu', 'Came close')} <span>${x.near.length}</span></h3><div class="dm-grid nr">${x.near.map((r) => card(ix, r, mine)).join('')}</div>` : ''}
    </section>`;
  };
  return `<div class="dcv">
    <div class="tvbn"><h1>DefCon</h1><div class="lv-gw"><button type="button" class="gwnav" data-gw="${gw - 1}" ${gw <= 1 ? 'disabled' : ''} aria-label="${tr('Prethodno kolo', 'Previous gameweek')}">‹</button><b>${tr('Kolo', 'GW')} ${gw}</b><button type="button" class="gwnav" data-gw="${gw + 1}" ${gw >= last ? 'disabled' : ''} aria-label="${tr('Sljedeće kolo', 'Next gameweek')}">›</button></div></div>
    <p class="sub dc-info">${tr('Odbrambeni igrači trebaju 10 akcija (otklanjanja, blokade, presjeci, startovi), vezni i napadači 12 (plus povrati lopte). Ko dostigne, dobija +2. "Blizu" znači da je falilo do 3.', 'Defenders need 10 actions (clearances, blocks, interceptions, tackles), midfielders and forwards 12 (plus recoveries). Reaching it gives +2. "Close" means up to 3 short.')}${myHit ? ` <b class="dc-my">${tr('Tvoji igrači', 'Your players')}: ${myHit} × +2</b>` : ''}</p>
    <div class="dc-segs">${seg}</div>
    <p class="dc-sum"><span><span class="dc-dot ok"></span>${nHit} ${tr('dobilo +2', 'got +2')}</span><span><span class="dc-dot"></span>${nNear} ${tr('blizu', 'close')}</span></p>
    <div class="bx-grid">${fx.map(block).join('') || `<p class="muted">${scope === 'mine' ? tr('Niko iz tvog tima nije dobio DefCon niti bio blizu u ovom kolu.', 'Nobody in your team got DefCon or came close this gameweek.') : tr('Još nema DefCon bodova u ovom kolu.', 'No DefCon points this gameweek yet.')}</p>`}</div>
  </div>`;
}

export function bind(rerender) {
  const root = document.querySelector('.dcv'); if (!root) return;
  root.addEventListener('click', (ev) => {
    const g = ev.target.closest('[data-gw]'); if (g && !g.disabled) { gwSel = +g.dataset.gw; rerender(true); return; }
    const sc = ev.target.closest('[data-scope]'); if (sc) { scope = sc.dataset.scope; rerender(true); return; }
    const ps = ev.target.closest('[data-pos]'); if (ps) { pos = +ps.dataset.pos; rerender(true); }
  });
}
