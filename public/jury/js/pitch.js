// Tim na terenu kao u FPL Manageru: kartice sa slikom igrača (ili dresom), protivnikom i imenom, teren u perspektivi.

import { html, raw } from './ui.js';
import { kitFor, shirtSvg, fixtureLabel, POS } from './fpl.js';
import { t } from './i18n.js';

let uid = 0;

/** Display name that fits a plate on a 360 px screen: long names keep the surname. */
function shortName(name, max = 12) {
  if (!name) return '?';
  if (name.length <= max) return name;
  const last = name.split(/\s+/).pop();
  if (last.length <= max) return last;
  const part = last.split('-').pop();
  return part.length <= max ? part : part.slice(0, max);
}

// protivnik u kolu: skraćenica, doma ili gost i težina (1 do 5) za boju
function opponent(fpl, teamId, gw) {
  for (const f of fpl.fixtures) {
    if (f.event !== gw) continue;
    if (f.team_h === teamId) return { opp: fpl.teamsById.get(f.team_a)?.short_name, home: true, fdr: f.dh || 3 };
    if (f.team_a === teamId) return { opp: fpl.teamsById.get(f.team_h)?.short_name, home: false, fdr: f.da || 3 };
  }
  return null;
}
const photo = (p) => (p?.code ? `<img class="ph" src="https://resources.premierleague.com/premierleague25/photos/players/110x140/${p.code}.png" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : '');

/** Kartica igrača kao u FPL Manageru: lijevo slika (ili dres) u okviru sa šarom, desno protivnik i doma/gost, ime na traci ispod. */
function playerCell(fpl, pick, gw, { captain, vice, row, col, editable, index }) {
  const p = pick.id != null ? fpl.byId.get(pick.id) : null;
  const kit = p ? kitFor(fpl, p) : ['#34445f', '#ffffff', 'solid'];
  const name = p?.web_name ?? pick.name ?? '?';
  const fx = p ? opponent(fpl, p.team, gw) : null;
  const isC = p && p.id === captain, isV = p && p.id === vice;
  const label = p
    ? `${name}, ${fpl.teamsById.get(p.team)?.name ?? ''}, ${POS[p.element_type]}${isC ? `, ${t('judge.captain')}` : isV ? `, ${t('judge.vice')}` : ''}${fx ? `, ${fixtureLabel(fpl, p.team, gw)}` : ''}`
    : `${t('post.pick', { pos: POS[pick.pos] || 'player' })}`;
  const right = p
    ? (fx ? `<b class="sj-o d${fx.fdr}">${fx.opp}</b><span class="sj-ha">${t(fx.home ? 'pitch.home' : 'pitch.away')}</span>` : `<span class="sj-ha">${t('pitch.none')}</span>`) + `<span class="sj-pos">${POS[p.element_type]}</span>`
    : `<span class="sj-ha">${POS[pick.pos] || ''}</span>`;
  const inner = html`<span class="sj-card" aria-hidden="true"><span class="sj-ph"><span class="shirt">${raw(shirtSvg(kit, `${uid}-${index}`))}${raw(photo(p))}</span>${!p && editable ? raw('<span class="plus">+</span>') : ''}</span><span class="sj-r">${raw(right)}</span><span class="sj-n">${isC ? raw('<i class="sj-b">C</i>') : isV ? raw('<i class="sj-b v">V</i>') : ''}<span class="sj-nn">${shortName(name)}</span></span></span>`;
  const cls = `pl${p ? '' : ' missing'}${isC ? ' cap' : ''}`;
  const style = `--row:${row};--col:${col}`;
  if (editable) {
    return html`<div class="${cls}" style="${style}"><button type="button" class="pick" data-index="${index}" aria-label="${label}">${inner}</button></div>`;
  }
  return html`<div class="${cls}" style="${style}" role="listitem" aria-label="${label}" data-id="${p ? p.id : ''}">${inner}</div>`;
}

// Lines of a real pitch seen from above: touchline, halfway line, both boxes and six yard boxes.
const LINES = `<svg class="lines tv" viewBox="0 0 390 478" preserveAspectRatio="none" aria-hidden="true"><polygon class="grass" points="52,0 338,0 390,478 0,478"/>${[0, 1, 2, 3, 4].map((k) => { const y1 = k * 95.6, y2 = (k + 0.5) * 95.6, w1 = 52 * (1 - y1 / 478), w2 = 52 * (1 - y2 / 478); return `<polygon class="band" points="${w1.toFixed(1)},${y1.toFixed(1)} ${(390 - w1).toFixed(1)},${y1.toFixed(1)} ${(390 - w2).toFixed(1)},${y2.toFixed(1)} ${w2.toFixed(1)},${y2.toFixed(1)}"/>`; }).join('')}<g class="ln"><polygon points="52,0 338,0 390,478 0,478"/><polygon points="122,0 268,0 272,66 118,66"/><polygon points="160,0 230,0 231,24 159,24"/><path d="M140 478 Q195 420 250 478"/></g></svg><div class="pboard" aria-hidden="true"><span>Squad</span><img src="/img/brand/mark.svg" alt=""><span>Jury</span></div>`;

function rowsOf(fpl, picks) {
  const withIdx = picks.map((p, index) => ({ ...p, index, pos: p.pos ?? fpl.byId.get(p.id)?.element_type }));
  const xi = withIdx.filter((p) => !p.bench);
  const bench = withIdx.filter((p) => p.bench);
  const rows = [1, 2, 3, 4].map((pos) => xi.filter((p) => p.pos === pos));
  const unknown = xi.filter((p) => !p.pos);
  if (unknown.length) rows[2].push(...unknown);
  return { xi, bench, rows, unknown };
}

/** "3-5-2" for a complete starting XI, or an empty string. */
export function formationOf(fpl, picks) {
  const { xi, rows, unknown } = rowsOf(fpl, picks);
  return xi.length === 11 && !unknown.length && rows[0].length === 1 ? rows.slice(1).map((r) => r.length).join('-') : '';
}

/**
 * picks: [{ id, bench, pos? , name? }] in FPL order (XI first, then bench).
 * Returns HTML for the pitch with rows GK, DEF, MID, FWD and the bench.
 */
export function squadHtml(fpl, { picks, captain, vice, gw }, { editable = false } = {}) {
  uid++;
  const { bench, rows } = rowsOf(fpl, picks);
  const ctx = { captain, vice, editable };
  const lines = rows
    .filter((r) => r.length)
    .map((r, ri) => html`<div class="line" role="list">${r.map((p, ci) => playerCell(fpl, p, gw, { ...ctx, row: ri, col: ci, index: p.index }))}</div>`);
  return html`
    <div class="squad">
      <div class="pitch">${raw(LINES)}${lines}</div>
      <div class="bench"><span class="bl">${t('judge.bench')}</span><div class="brow" role="list" aria-label="${t('judge.bench')}">${bench.map((p, ci) => playerCell(fpl, p, gw, { ...ctx, row: 5, col: ci, index: p.index }))}</div></div>
    </div>`;
}
