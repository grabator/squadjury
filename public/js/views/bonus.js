// Bonus: utakmice kola po danima. Lijevo golovi i asistencije po timu, desno bonus bodovi (3, 2, 1) i BPS.
import { S, live, liveFix } from '../state.js';
import { bonusByFixture, matchSheets } from '../model.js';
import { tr } from '../i18n.js';
import { byDay, dayHead, matchCard, nm, moreList } from './match.js';
import { esc } from '../ui.js';

export const title = tr('Bonus', 'Bonus');
let gwSel = null, scope = 'all';

const BALL = '<svg class="mc-ball" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 7.2l3.4 2.5-1.3 4h-4.2l-1.3-4zM12 7.2V2.4M15.4 9.7l4.4-1.6M14.1 13.7l2.8 3.9M9.9 13.7l-2.8 3.9M8.6 9.7L4.2 8.1"/></svg>';

// događaji jednog tima: golovi (lopta za svaki), asistencije (A), autogolovi (AG), crveni karton
function events(rows, mine) {
  const out = [];
  for (const r of rows) if (r.g) out.push(`<p class="mc-ev">${nm(r.e, mine)}<span class="mc-ic">${BALL.repeat(r.g)}</span><span class="sr">${r.g} ${tr('gol', 'goal')}</span></p>`);
  for (const r of rows) if (r.a) out.push(`<p class="mc-ev">${nm(r.e, mine)}<span class="mc-ic">${'<b class="mc-a">A</b>'.repeat(r.a)}</span><span class="sr">${r.a} ${tr('asistencija', 'assist')}</span></p>`);
  for (const r of rows) if (r.og) out.push(`<p class="mc-ev">${nm(r.e, mine)}<span class="mc-ic"><b class="mc-a og">${tr('AG', 'OG')}</b></span><span class="sr">${tr('autogol', 'own goal')}</span></p>`);
  for (const r of rows) if (r.rc) out.push(`<p class="mc-ev">${nm(r.e, mine)}<span class="mc-ic"><b class="mc-rc" title="${tr('Crveni karton', 'Red card')}"></b></span><span class="sr">${tr('crveni karton', 'red card')}</span></p>`);
  return out.join('');
}

export async function render() {
  const { ix } = S, last = S.lastGw, gw = gwSel && gwSel <= last ? gwSel : last;
  const [lv, lf] = await Promise.all([live(gw), liveFix(gw).catch(() => null)]);
  const mine = new Set([...(S.xi || []), ...(S.bench || [])]);
  const sheets = matchSheets(ix, lv), bon = new Map(bonusByFixture(lv).map((x) => [x.fid, x]));
  let fx = [...sheets.values()].map((x) => ({ ...x, f: lf?.get(x.fid), b: bon.get(x.fid) })).filter((x) => x.f)
    .sort((a, b) => String(a.f.kickoff_time || '').localeCompare(String(b.f.kickoff_time || '')) || a.fid - b.fid);
  if (scope === 'mine') fx = fx.filter((x) => x.rows.some((r) => mine.has(r.e.id)));
  const total = fx.reduce((s, x) => s + (x.b?.rows || []).filter((r) => mine.has(r.id)).reduce((t, r) => t + r.bonus, 0), 0);

  const card = (x) => {
    const f = x.f, home = x.rows.filter((r) => r.e.team === f.team_h), away = x.rows.filter((r) => r.e.team === f.team_a);
    const bonusIds = new Set((x.b?.rows || []).map((r) => r.id));
    const bRows = (x.b?.rows || []).map((r) => { const e = ix.players.get(r.id); return e ? `<p class="mc-br"><b class="bx-b b${r.bonus}" aria-label="${tr('bonus', 'bonus')} ${r.bonus}">${r.bonus}</b>${nm(e, mine)}<span class="mc-v">${r.bps}</span></p>` : ''; });
    const rest = x.rows.filter((r) => !bonusIds.has(r.e.id)).sort((a, b) => b.bps - a.bps).slice(0, 6)
      .map((r) => `<p class="mc-br"><b class="bx-b b0" aria-hidden="true"></b>${nm(r.e, mine)}<span class="mc-v">${r.bps}</span></p>`);
    const has = x.rows.some((r) => mine.has(r.e.id) && (bonusIds.has(r.e.id) || r.g || r.a));
    const evH = events(home, mine), evA = events(away, mine);
    const top = (x.b?.rows || []).map((r) => { const e = ix.players.get(r.id); return e ? `<span class="mc-hb${mine.has(r.id) ? ' me' : ''}"><b class="bx-b b${r.bonus}">${r.bonus}</b>${esc(e.web_name)}</span>` : ''; }).join('');
    return matchCard(ix, f, { cls: has ? 'has-me' : '', hint: top || `<span class="mc-hb">${tr('Bez bonusa', 'No bonus yet')}</span>`, body: `
      <div class="mc-body">
        <div class="mc-evs"><div class="mc-side h">${evH}</div><div class="mc-side a">${evA}</div>${!evH && !evA ? `<p class="mc-none">${f.started ? tr('Bez golova', 'No goals') : tr('Još nije počela', 'Not started yet')}</p>` : ''}</div>
        <aside class="mc-pan"><h3><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8.5 20h7M10 17h4"/></svg>Bonus${x.b && !x.b.confirmed ? `<em title="${tr('Procjena iz BPS-a, FPL još nije potvrdio', 'Projected from BPS, not yet confirmed by FPL')}">${tr('procjena', 'live')}</em>` : ''}</h3>
          ${bRows.length || rest.length ? moreList([...bRows, ...rest], Math.max(bRows.length, 3), 'mc-list') : `<p class="mc-none">${tr('Još nema', 'None yet')}</p>`}
        </aside>
      </div>` });
  };
  const seg = `<div class="seg dc-seg" role="group" aria-label="${tr('Prikaz', 'Show')}"><button type="button" data-scope="all" aria-pressed="${scope === 'all'}">${tr('Sve utakmice', 'All matches')}</button><button type="button" data-scope="mine" aria-pressed="${scope === 'mine'}">${tr('Sa mojim igračima', 'With my players')}</button></div>`;
  return `<div class="dcv bxv">
    <div class="tvbn"><h1>${tr('Bonus', 'Bonus')}</h1><div class="lv-gw"><button type="button" class="gwnav" data-gw="${gw - 1}" ${gw <= 1 ? 'disabled' : ''} aria-label="${tr('Prethodno kolo', 'Previous gameweek')}">‹</button><b>${tr('Kolo', 'GW')} ${gw}</b><button type="button" class="gwnav" data-gw="${gw + 1}" ${gw >= last ? 'disabled' : ''} aria-label="${tr('Sljedeće kolo', 'Next gameweek')}">›</button></div></div>
    <p class="sub dc-info">${tr('U svakoj utakmici tri igrača sa najviše BPS bodova dobiju 3, 2 i 1 bonus. Broj pored imena je BPS.', 'In every match the three players with the most BPS get 3, 2 and 1 bonus. The number next to the name is BPS.')}${total ? ` <b class="dc-my">${tr('Tvoji igrači', 'Your players')}: +${total}</b>` : ''}</p>
    ${seg}
    <div class="mc-days">${byDay(fx).map((g) => dayHead(g) + `<div class="mc-grid">${g.items.map(card).join('')}</div>`).join('') || `<p class="muted">${tr('Još nema odigranih utakmica u ovom kolu.', 'No matches played this gameweek yet.')}</p>`}</div>
  </div>`;
}

export function bind(rerender) {
  const root = document.querySelector('.dcv'); if (!root) return;
  root.addEventListener('click', (ev) => {
    const g = ev.target.closest('[data-gw]'); if (g && !g.disabled) { gwSel = +g.dataset.gw; rerender(true); return; }
    const sc = ev.target.closest('[data-scope]'); if (sc) { scope = sc.dataset.scope; rerender(true); }
  });
}
