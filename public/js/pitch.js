// Renders a squad on our own pitch: generic shirts in club colours, names and fixtures.

import { html, raw } from './ui.js';
import { kitFor, shirtSvg, fixtureLabel, POS } from './fpl.js';
import { t } from './i18n.js';

let uid = 0;

/** Short display name that fits a card on a 360 px screen. */
function shortName(name, max = 11) {
  if (!name) return '?';
  return name.length <= max ? name : name.split(/[\s-]/).pop().slice(0, max);
}

function playerCell(fpl, pick, gw, { captain, vice, row, col, editable, index }) {
  const p = pick.id != null ? fpl.byId.get(pick.id) : null;
  const kit = p ? kitFor(fpl, p) : ['#34445f', '#ffffff', 'solid'];
  const name = p?.web_name ?? pick.name ?? '?';
  const fix = p ? fixtureLabel(fpl, p.team, gw) : POS[pick.pos] || '';
  const isC = p && p.id === captain, isV = p && p.id === vice;
  const label = p
    ? `${name}, ${fpl.teamsById.get(p.team)?.name ?? ''}, ${POS[p.element_type]}${isC ? `, ${t('judge.captain')}` : isV ? `, ${t('judge.vice')}` : ''}`
    : `${t('post.pick', { pos: POS[pick.pos] || 'player' })}`;
  const inner = html`
    <span class="shirt">${raw(shirtSvg(kit, `${uid}-${index}`))}${!p && editable ? raw('<span class="plus" aria-hidden="true">+</span>') : ''}${isC ? raw('<span class="armband c" aria-hidden="true">C</span>') : ''}${isV ? raw('<span class="armband v" aria-hidden="true">V</span>') : ''}</span>
    <span class="card"><span class="name">${shortName(name)}</span><span class="fix">${fix}</span></span>`;
  const cls = `pl${p ? '' : ' missing'}`;
  const style = `--row:${row};--col:${col};--kit:${kit[0] === '#ffffff' ? kit[1] : kit[0]}`;
  if (editable) {
    return html`<div class="${cls}" style="${style}"><button type="button" class="pick" data-index="${index}" aria-label="${label}">${inner}</button></div>`;
  }
  return html`<div class="${cls}" style="${style}" role="listitem" aria-label="${label}">${inner}</div>`;
}

/**
 * picks: [{ id, bench, pos? , name? }] in FPL order (XI first, then bench).
 * Returns HTML for the pitch with rows GK, DEF, MID, FWD and the bench.
 */
export function squadHtml(fpl, { picks, captain, vice, gw }, { editable = false } = {}) {
  uid++;
  const withIdx = picks.map((p, index) => ({ ...p, index, pos: p.pos ?? fpl.byId.get(p.id)?.element_type }));
  const xi = withIdx.filter((p) => !p.bench);
  const bench = withIdx.filter((p) => p.bench);
  const rows = [1, 2, 3, 4].map((pos) => xi.filter((p) => p.pos === pos));
  const unknown = xi.filter((p) => !p.pos);
  if (unknown.length) rows[2].push(...unknown);
  const ctx = { captain, vice, editable };
  const lines = rows
    .filter((r) => r.length)
    .map((r, ri) => html`<div class="line" role="list">${r.map((p, ci) => playerCell(fpl, p, gw, { ...ctx, row: ri, col: ci, index: p.index }))}</div>`);
  return html`
    <div class="squad">
      <div class="pitch">${lines}</div>
      <div class="bench" role="list" aria-label="${t('judge.bench')}">${bench.map((p, ci) => playerCell(fpl, p, gw, { ...ctx, row: 5, col: ci, index: p.index }))}</div>
    </div>`;
}
