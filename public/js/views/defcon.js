// DefCon: igrači koji su u kolu dobili +2 za odbrambeni doprinos i oni kojima je falilo malo.
import { S, live } from '../state.js';
import { defConList } from '../model.js';
import { esc, pbtn, shirt, photo } from '../ui.js';
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
  const lv = await live(gw), mine = new Set([...(S.xi || []), ...(S.bench || [])]);
  const all = defConList(ix, lv), f = (rows) => rows.filter((r) => (scope !== 'mine' || mine.has(r.e.id)) && (!pos || r.e.element_type === pos));
  const hit = f(all.hit), near = f(all.near);
  const seg = `<div class="seg dc-seg" role="group" aria-label="${tr('Prikaz', 'Show')}"><button type="button" data-scope="all" aria-pressed="${scope === 'all'}">${tr('Svi', 'All')}</button><button type="button" data-scope="mine" aria-pressed="${scope === 'mine'}">${tr('Moj tim', 'My team')}</button></div><div class="seg dc-seg" role="group" aria-label="${tr('Pozicija', 'Position')}">${[[0, tr('Sve', 'All')], [2, POS_SH[2]], [3, POS_SH[3]], [4, POS_SH[4]]].map(([k, l]) => `<button type="button" data-pos="${k}" aria-pressed="${pos === k}">${l}</button>`).join('')}</div>`;
  return `<div class="dcv">
    <div class="tvbn"><h1>DefCon</h1><div class="lv-gw"><button type="button" class="gwnav" data-gw="${gw - 1}" ${gw <= 1 ? 'disabled' : ''} aria-label="${tr('Prethodno kolo', 'Previous gameweek')}">‹</button><b>${tr('Kolo', 'GW')} ${gw}</b><button type="button" class="gwnav" data-gw="${gw + 1}" ${gw >= last ? 'disabled' : ''} aria-label="${tr('Sljedeće kolo', 'Next gameweek')}">›</button></div></div>
    <p class="sub dc-info">${tr('Odbrambeni doprinos: odbrambeni igrači trebaju 10 akcija (otklanjanja, blokade, presjeci, startovi), vezni i napadači 12 (plus povrati lopte). Ko dostigne, dobija +2.', 'Defensive contribution: defenders need 10 actions (clearances, blocks, interceptions, tackles), midfielders and forwards 12 (plus recoveries). Reaching it gives +2.')}</p>
    <div class="dc-segs">${seg}</div>
    <section class="dc-sec" aria-labelledby="dc-h1"><h2 id="dc-h1" class="dc-h"><span class="dc-dot ok"></span>${tr('Dobili +2', 'Got +2')} <span class="sub">${hit.length}</span></h2>
      <div class="dm-grid">${hit.map((r) => card(ix, r, mine)).join('') || `<p class="muted">${scope === 'mine' ? tr('Niko iz tvog tima nije dobio DefCon u ovom kolu.', 'Nobody in your team got DefCon this gameweek.') : tr('Još niko nije dobio DefCon u ovom kolu.', 'Nobody has got DefCon this gameweek yet.')}</p>`}</div></section>
    <section class="dc-sec" aria-labelledby="dc-h2"><h2 id="dc-h2" class="dc-h"><span class="dc-dot"></span>${tr('Bili blizu', 'Came close')} <span class="sub">${tr('fali do 3', 'up to 3 short')} · ${near.length}</span></h2>
      <div class="dm-grid">${near.map((r) => card(ix, r, mine)).join('') || `<p class="muted">${tr('Nema igrača kojima je falilo malo.', 'No near misses.')}</p>`}</div></section>
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
