// DefCon: utakmice kola po danima. Lijevo odbrambeni doprinos po timu (+2 ili koliko je falilo), desno odbrane golmana.
import { S, live, liveFix } from '../state.js';
import { matchSheets } from '../model.js';
import { tr } from '../i18n.js';
import { byDay, dayHead, matchCard, nm, moreList } from './match.js';

export const title = 'DefCon';
let gwSel = null, scope = 'all';

const OK = (t) => `<b class="mc-pt ok">${t}</b>`;
const NO = `<b class="mc-pt no" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M7 7l10 10M17 7L7 17"/></svg></b>`;

// odbrambeni doprinos jednog tima: prvo oni sa +2, pa po broju akcija; prikazuju se oni sa bar pola potrebnih akcija
function side(rows, mine) {
  return rows.filter((r) => r.dc && r.dc.v >= r.dc.need / 2).sort((a, b) => b.dc.hit - a.dc.hit || b.dc.v - a.dc.v)
    .map((r) => `<p class="mc-dc${r.dc.hit ? ' hit' : ''}">${r.dc.hit ? OK('+2') : NO}${nm(r.e, mine)}<span class="mc-v">(${r.dc.v})</span><span class="sr">${r.dc.v} ${tr('od', 'of')} ${r.dc.need}${r.dc.hit ? ', +2' : ''}</span></p>`);
}

export async function render() {
  const { ix } = S, last = S.lastGw, gw = gwSel && gwSel <= last ? gwSel : last;
  const [lv, lf] = await Promise.all([live(gw), liveFix(gw).catch(() => null)]), mine = new Set([...(S.xi || []), ...(S.bench || [])]);
  let fx = [...matchSheets(ix, lv).values()].map((x) => ({ ...x, f: lf?.get(x.fid) })).filter((x) => x.f)
    .sort((a, b) => String(a.f.kickoff_time || '').localeCompare(String(b.f.kickoff_time || '')) || a.fid - b.fid);
  if (scope === 'mine') fx = fx.filter((x) => x.rows.some((r) => mine.has(r.e.id)));
  const all = fx.flatMap((x) => x.rows), nHit = all.filter((r) => r.dc?.hit).length, myHit = all.filter((r) => r.dc?.hit && mine.has(r.e.id)).length;

  const card = (x) => {
    const f = x.f, home = x.rows.filter((r) => r.e.team === f.team_h), away = x.rows.filter((r) => r.e.team === f.team_a);
    const h = side(home, mine), a = side(away, mine), n = 5;
    const gks = x.rows.filter((r) => r.e.element_type === 1 && (r.mins >= 45 || r.sv > 0)).sort((p, q) => q.sv - p.sv || q.mins - p.mins)
      .map((r) => { const pts = Math.floor(r.sv / 3); return `<p class="mc-dc${pts ? ' hit' : ''}">${pts ? OK('+' + pts) : NO}${nm(r.e, mine)}<span class="mc-v">(${r.sv})</span><span class="sr">${r.sv} ${tr('odbrana', 'saves')}${pts ? ', +' + pts : ''}</span></p>`; });
    const has = x.rows.some((r) => mine.has(r.e.id) && (r.dc?.hit || (r.e.element_type === 1 && r.sv >= 3)));
    const list = (items) => moreList(items, n, 'mc-list');
    const hits = x.rows.filter((r) => r.dc?.hit).length, sv = x.rows.filter((r) => r.e.element_type === 1 && r.sv >= 3).length;
    const hint = `<span class="mc-hb"><b class="mc-pt ok">+2</b>× ${hits}</span>${sv ? `<span class="mc-hb"><b class="mc-pt ok">+1</b>${tr('odbrane', 'saves')}</span>` : ''}`;
    return matchCard(ix, f, { cls: 'dcm' + (has ? ' has-me' : ''), hint, body: `
      <div class="mc-body">
        <div class="mc-dcs"><h3>${tr('Odbrambeni doprinos', 'Defensive contributions')}</h3>
          <div class="mc-evs"><div class="mc-side h">${list(h)}</div><div class="mc-side a">${list(a)}</div>${!h.length && !a.length ? `<p class="mc-none">${tr('Niko nije bio blizu', 'Nobody came close')}</p>` : ''}</div>
        </div>
        <aside class="mc-pan"><h3>${tr('Odbrane', 'Saves')}</h3>${gks.length ? `<div class="mc-list">${gks.join('')}</div>` : `<p class="mc-none">-</p>`}</aside>
      </div>` });
  };
  const seg = `<div class="seg dc-seg" role="group" aria-label="${tr('Prikaz', 'Show')}"><button type="button" data-scope="all" aria-pressed="${scope === 'all'}">${tr('Sve utakmice', 'All matches')}</button><button type="button" data-scope="mine" aria-pressed="${scope === 'mine'}">${tr('Sa mojim igračima', 'With my players')}</button></div>`;
  return `<div class="dcv">
    <div class="tvbn"><h1>DefCon</h1><div class="lv-gw"><button type="button" class="gwnav" data-gw="${gw - 1}" ${gw <= 1 ? 'disabled' : ''} aria-label="${tr('Prethodno kolo', 'Previous gameweek')}">‹</button><b>${tr('Kolo', 'GW')} ${gw}</b><button type="button" class="gwnav" data-gw="${gw + 1}" ${gw >= last ? 'disabled' : ''} aria-label="${tr('Sljedeće kolo', 'Next gameweek')}">›</button></div></div>
    <p class="sub dc-info">${tr('Odbrambeni igrači trebaju 10 akcija (otklanjanja, blokade, presjeci, startovi), vezni i napadači 12 (plus povrati lopte) za +2. Broj u zagradi je broj akcija. Golman dobija +1 za svake 3 odbrane.', 'Defenders need 10 actions (clearances, blocks, interceptions, tackles), midfielders and forwards 12 (plus recoveries) for +2. The number in brackets is the action count. Goalkeepers get +1 for every 3 saves.')}${nHit ? ` <b class="dc-my">${nHit} × +2${myHit ? `, ${tr('tvojih', 'yours')} ${myHit}` : ''}</b>` : ''}</p>
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
