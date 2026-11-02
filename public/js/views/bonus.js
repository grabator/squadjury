// Bonus: bonus bodovi po utakmicama (3, 2, 1), utakmica prikazana kao TV traka sa rezultatom.
import { S, live, liveFix } from '../state.js';
import { bonusByFixture, POS_BS } from '../model.js';
import { esc, pbtn, shirt, photo, scorePlate } from '../ui.js';
import { tr } from '../i18n.js';

export const title = tr('Bonus', 'Bonus');
let gwSel = null, scope = 'all';

export async function render() {
  const { ix } = S, last = S.lastGw, gw = gwSel && gwSel <= last ? gwSel : last;
  const [lv, lf] = await Promise.all([live(gw), liveFix(gw).catch(() => null)]);
  const mine = new Set([...(S.xi || []), ...(S.bench || [])]);
  let fx = bonusByFixture(lv).map((x) => ({ ...x, f: lf?.get(x.fid) })).sort((a, b) => String(a.f?.kickoff_time || '').localeCompare(String(b.f?.kickoff_time || '')) || a.fid - b.fid);
  if (scope === 'mine') fx = fx.filter((x) => x.rows.some((r) => mine.has(r.id)));
  const total = [...mine].reduce((s, id) => s + (fx.flatMap((x) => x.rows).find((r) => r.id === id)?.bonus || 0), 0);
  const block = (x) => {
    const f = x.f, hm = f && ix.teams.get(f.team_h), aw = f && ix.teams.get(f.team_a);
    const score = f && f.team_h_score != null ? `${f.team_h_score}<i>-</i>${f.team_a_score}` : '<i>v</i>';
    const st = !f ? '' : f.finished || f.finished_provisional ? tr('Kraj', 'FT') : f.started ? `${f.minutes || 0}'` : '';
    const bug = hm && aw ? `<span class="bug" role="img" aria-label="${esc(hm.name)} ${f.team_h_score ?? ''} ${esc(aw.name)} ${f.team_a_score ?? ''}">${scorePlate(hm, 'h')}<span class="mid sc">${score}</span>${scorePlate(aw, 'a')}</span>${st ? `<span class="tab">${st}</span>` : ''}` : '';
    return `<section class="bx sb${x.rows.some((r) => mine.has(r.id)) ? ' has-me' : ''}">${bug}
      ${x.confirmed ? '' : `<p class="bx-pr">${tr('Procjena iz BPS-a, FPL još nije potvrdio', 'Projected from BPS, not yet confirmed by FPL')}</p>`}
      <div class="bx-rows">${x.rows.map((r) => { const e = ix.players.get(r.id); if (!e) return ''; const t = ix.teams.get(e.team); return `<div class="bx-r${mine.has(r.id) ? ' me' : ''}"><span class="bx-b b${r.bonus}" aria-label="${tr('bonus', 'bonus')} ${r.bonus}">${r.bonus}</span><span class="dc-ph pat-bg" aria-hidden="true"><span class="shirt">${shirt(t, e.element_type === 1)}${photo(e)}</span></span><span class="bx-n">${pbtn(e)}<span class="sub">${esc(t.short_name)} · ${POS_BS[e.element_type]}${mine.has(r.id) ? ` · <b class="dc-my">${tr('tvoj', 'yours')}</b>` : ''}</span></span><span class="bx-bps"><b>${r.bps}</b><small>BPS</small></span></div>`; }).join('')}</div></section>`;
  };
  const seg = `<div class="seg dc-seg" role="group" aria-label="${tr('Prikaz', 'Show')}"><button type="button" data-scope="all" aria-pressed="${scope === 'all'}">${tr('Sve utakmice', 'All matches')}</button><button type="button" data-scope="mine" aria-pressed="${scope === 'mine'}">${tr('Sa mojim igračima', 'With my players')}</button></div>`;
  return `<div class="dcv bxv">
    <div class="tvbn"><h1>${tr('Bonus', 'Bonus')}</h1><div class="lv-gw"><button type="button" class="gwnav" data-gw="${gw - 1}" ${gw <= 1 ? 'disabled' : ''} aria-label="${tr('Prethodno kolo', 'Previous gameweek')}">‹</button><b>${tr('Kolo', 'GW')} ${gw}</b><button type="button" class="gwnav" data-gw="${gw + 1}" ${gw >= last ? 'disabled' : ''} aria-label="${tr('Sljedeće kolo', 'Next gameweek')}">›</button></div></div>
    <p class="sub dc-info">${tr('U svakoj utakmici tri igrača sa najviše BPS bodova dobiju 3, 2 i 1 bonus.', 'In every match the three players with the most BPS get 3, 2 and 1 bonus.')}${total ? ` <b class="dc-my">${tr('Tvoji igrači', 'Your players')}: +${total}</b>` : ''}</p>
    ${seg}
    <div class="bx-grid">${fx.map(block).join('') || `<p class="muted">${tr('Još nema bonusa u ovom kolu.', 'No bonus points this gameweek yet.')}</p>`}</div>
  </div>`;
}

export function bind(rerender) {
  const root = document.querySelector('.dcv'); if (!root) return;
  root.addEventListener('click', (ev) => {
    const g = ev.target.closest('[data-gw]'); if (g && !g.disabled) { gwSel = +g.dataset.gw; rerender(true); return; }
    const sc = ev.target.closest('[data-scope]'); if (sc) { scope = sc.dataset.scope; rerender(true); }
  });
}
