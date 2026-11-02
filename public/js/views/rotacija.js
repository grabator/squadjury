// Rotacija: parovi igrača koji se smjenjuju kroz 6 kola (svako kolo igra onaj sa lakšim rasporedom i više predviđenih bodova).
import { S } from '../state.js';
import { xp, fmt, price, fixturesFor, rotationPair, rotationPairs, POS_BS } from '../model.js';
import { esc, shirt, photo } from '../ui.js';
import { tr } from '../i18n.js';

export const title = tr('Rotacija', 'Rotation pairs');
const N = 6;
let posA = 2, posB = 2, scope = 'mine', pa = null, pb = null;
const POS = [[1, tr('GOL', 'GK')], [2, tr('ODB', 'DEF')], [3, tr('VEZ', 'MID')], [4, tr('NAP', 'FWD')]];

// kartica para: dva reda (igrači), 6 kola; zlatni okvir je igrač koji igra to kolo
function pairCard(ix, r, i) {
  const row = (e, k) => `<div class="rp-row"><span class="rp-pl"><span class="shirt">${shirt(ix.teams.get(e.team), e.element_type === 1)}${photo(e)}</span><span><b>${esc(e.web_name)}</b><span class="sub">${POS_BS[e.element_type]} · ${esc(ix.teams.get(e.team).short_name)} · £${price(e)}m${S.ids.includes(e.id) ? ' · ' + tr('tvoj', 'yours') : ''}</span></span></span>${r.pick.map((p) => {
    const fx = fixturesFor(ix, e.team, p.gw, 1), on = p.use === e.id;
    const lab = fx.length ? fx.map((f) => `${ix.teams.get(f.opp).short_name}${f.home ? '' : tr(' (g)', ' (a)')}`).join(' + ') : tr('–', '–');
    return `<span class="rp-c d${fx[0]?.fdr || 'x'}${on ? ' on' : ''}" title="${tr('Kolo', 'Gameweek')} ${p.gw}: ${esc(lab)}, ${fmt(k ? p.xb : p.xa)} ${tr('pred.', 'pred.')}${on ? ', ' + tr('igra', 'starts') : ''}"><b>${esc(lab)}</b><small>${fmt(k ? p.xb : p.xa)}</small></span>`;
  }).join('')}</div>`;
  return `<section class="rp g">${i != null ? `<span class="rp-n">${i + 1}</span>` : ''}<div class="rp-head"><span class="rp-sp"></span>${r.gws.map((g) => `<span>${tr('K', 'GW')}${g}</span>`).join('')}</div>${row(r.a, 0)}${row(r.b, 1)}
    <p class="rp-f"><span><b class="g">${r.green}/${r.gws.length}</b> ${tr('lakih kola', 'easy gameweeks')}</span><span><b>${fmt(r.total)}</b> ${tr('pred. bodova', 'pred. points')}</span></p></section>`;
}

export async function render() {
  const { ix } = S, from = ix.nextGw;
  const mine = new Set(S.nextIds || S.ids);
  const ok = (e) => e.status !== 'u' && e.minutes > 0;
  // za svaku poziciju: najboljih 30 po lakoći rasporeda i bodovima + tvoji igrači te pozicije
  const poolOf = (pos) => { const top = [...ix.players.values()].filter((e) => ok(e) && e.element_type === pos).sort((a, b) => xp(ix, b, from, N) - xp(ix, a, from, N)).slice(0, 30); return [...new Map([...top, ...[...mine].map((id) => ix.players.get(id)).filter((e) => e && e.element_type === pos)].map((e) => [e.id, e])).values()]; };
  const best = rotationPairs(ix, poolOf(posA), poolOf(posB), { mine: scope === 'mine' ? mine : null, from, n: N, limit: 8 });
  // uporedi svoja dva igrača (bilo koja pozicija)
  const all = [...ix.players.values()].filter(ok).sort((a, b) => b.total_points - a.total_points).slice(0, 220);
  const list = [...new Map([...[...mine].map((id) => ix.players.get(id)).filter(Boolean), ...all].map((e) => [e.id, e])).values()];
  const myOut = [...mine].map((id) => ix.players.get(id)).filter((e) => e && e.element_type > 1);
  if (!list.some((e) => e.id === pa)) pa = myOut[0]?.id;
  if (!list.some((e) => e.id === pb) || pb === pa) pb = myOut.find((e) => e.id !== pa && e.team !== ix.players.get(pa)?.team)?.id;
  const opt = (sel) => list.map((e) => `<option value="${e.id}"${e.id === sel ? ' selected' : ''}>${esc(e.web_name)} · ${POS_BS[e.element_type]} · ${esc(ix.teams.get(e.team).short_name)}${mine.has(e.id) ? ' ★' : ''}</option>`).join('');
  const own = pa && pb ? rotationPair(ix, ix.players.get(pa), ix.players.get(pb), from, N) : null;
  return `<div class="head"><div><h1>${tr('Rotacija', 'Rotation pairs')}</h1><p class="sub">${tr(`Dva igrača koji se smjenjuju kroz narednih ${N} kola: svako kolo igra onaj sa lakšim protivnikom (zlatni okvir). Zeleno je lak protivnik, crveno težak.`, `Two players who swap over the next ${N} gameweeks: each gameweek the one with the easier opponent starts (gold outline). Green is an easy opponent, red a hard one.`)}</p></div></div>
    <section class="g card"><h2 class="ct">${tr('Tvoj par', 'Your pair')}</h2><p class="sub">${tr('Izaberi bilo koja dva igrača, i iz različitih linija (npr. odbrambeni i napadač). ★ je tvoj igrač.', 'Pick any two players, even from different lines (e.g. a defender and a forward). ★ is your player.')}</p>
      <div class="pick2 rp-pick"><label class="field">${tr('Igrač 1', 'Player 1')}<select id="rp-a">${opt(pa)}</select></label><label class="field">${tr('Igrač 2', 'Player 2')}<select id="rp-b">${opt(pb)}</select></label></div>
      ${own ? pairCard(ix, own) : ''}</section>
    <div class="lbl"><h2 class="ct">${tr('Najbolji parovi', 'Best pairs')}</h2></div>
    <p class="sub" style="margin:-4px 0 10px">${tr(`Parovi sa najviše lakih kola zajedno (zeleno) u narednih ${N}. Izaberi poziciju za svakog igrača, npr. odbrambeni i vezni.`, `Pairs with the most easy gameweeks together (green) over the next ${N}. Pick a position for each player, e.g. a defender and a midfielder.`)}</p>
    <div class="rp-tools"><div class="rp-pos"><span class="sub">${tr('Igrač 1', 'Player 1')}</span><div class="seg" role="group" aria-label="${tr('Pozicija prvog igrača', 'Position of player 1')}">${POS.map(([k, t]) => `<button type="button" data-pa="${k}" aria-pressed="${posA === k}">${t}</button>`).join('')}</div></div>
      <div class="rp-pos"><span class="sub">${tr('Igrač 2', 'Player 2')}</span><div class="seg" role="group" aria-label="${tr('Pozicija drugog igrača', 'Position of player 2')}">${POS.map(([k, t]) => `<button type="button" data-pb="${k}" aria-pressed="${posB === k}">${t}</button>`).join('')}</div></div>
      <div class="seg" role="group" aria-label="${tr('Igrači', 'Players')}">${[['mine', tr('Uz moj tim', 'With my team')], ['all', tr('Svi', 'All')]].map(([k, t]) => `<button type="button" data-scope="${k}" aria-pressed="${scope === k}">${t}</button>`).join('')}</div></div>
    <div class="rp-list">${best.length ? best.map((r, i) => pairCard(ix, r, i)).join('') : `<p class="muted">${tr('Nema parova za ovaj izbor.', 'No pairs for this choice.')}</p>`}</div>`;
}

export function bind(rerender) {
  document.querySelectorAll('[data-pa]').forEach((b) => { b.onclick = () => { posA = +b.dataset.pa; rerender(true); }; });
  document.querySelectorAll('[data-pb]').forEach((b) => { b.onclick = () => { posB = +b.dataset.pb; rerender(true); }; });
  document.querySelectorAll('[data-scope]').forEach((b) => { b.onclick = () => { scope = b.dataset.scope; rerender(true); }; });
  const a = document.getElementById('rp-a'), b = document.getElementById('rp-b');
  if (a) a.onchange = () => { pa = +a.value; rerender(true); };
  if (b) b.onchange = () => { pb = +b.value; rerender(true); };
}
