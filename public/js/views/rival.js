// Rival radar: šansa da pobijediš rivala sljedeće kolo, njegov vjerovatni kapiten, razlike u timovima i sezona jedan na jedan.
import { S, league, picksOf, teamOf, historyOf, setLeague } from '../state.js';
import { duelOdds, compareSquads, predictCaptain, captainOptions, fmt, pct, plural } from '../model.js';
import { esc, pbtn, leaguePick } from '../ui.js';
import { tr } from '../i18n.js';

export const prefetch = () => { league().catch(() => {}); };
export const title = 'Rival';
let rivalId = null;

export async function render() {
  const { ix } = S;
  const L = await league().catch(() => null);
  const rows = L?.standings?.results || [];
  const others = rows.filter((r) => r.entry !== S.id);
  if (!others.length) return `<div class="head"><div><h1>Rival radar</h1><p class="sub">${tr('Izaberi ligu, pa menadžera iz nje kao rivala', 'Pick a league, then a manager from it as your rival')}</p></div><div class="pick2">${leaguePick(S.leagues, S.leagueId)}</div></div><section class="g card"><p class="muted">${S.leagues.length ? tr('U ovoj ligi nema drugih menadžera.', 'There are no other managers in this league.') : tr('Za rival radar treba bar jedna klasična liga sa još nekim menadžerom.', 'Rival radar needs at least one classic league with another manager in it.')}</p></section>`;
  const myRow = rows.find((r) => r.entry === S.id);
  if (!rivalId || !others.some((r) => r.entry === rivalId)) rivalId = (rows.find((r) => myRow && r.rank === myRow.rank - 1) || others[0]).entry;
  const rr = others.find((r) => r.entry === rivalId);
  const [rp, rh] = await Promise.all([picksOf(rivalId, S.lastGw), historyOf(rivalId)]);
  const them = teamOf(rp);
  const myCap = captainOptions(ix, S.xi)[0]?.e.id || S.captain;
  const theirCap = predictCaptain(ix, them.xi, them.captain);
  const odds = duelOdds(ix, { xi: S.xi, captain: myCap }, { xi: them.xi, captain: theirCap?.e.id || them.captain }, 2500);
  const cmp = compareSquads(ix, { xi: S.xi }, { xi: them.xi });
  // sezona jedan na jedan
  const theirBy = new Map(rh.current.map((h) => [h.event, h.points]));
  let w = 0, d = 0, l = 0;
  for (const h of S.history.current) { const t = theirBy.get(h.event); if (t == null) continue; if (h.points > t) w++; else if (h.points === t) d++; else l++; }
  // savjet
  const diffCap = cmp.onlyMine.find((x) => x.e.id !== theirCap?.e.id && x.xp >= (cmp.onlyMine[0]?.xp || 0) * 0.85);
  const tip = odds.win >= 0.55 ? tr(`Ti si favorit. Najsigurnije je da kapiten bude isti kao njegov (${esc(theirCap?.e.web_name || '')}), pa tvoje prednosti ostaju na tvojim igračima koje on nema.`, `You are the favourite. The safest call is the same captain as theirs (${esc(theirCap?.e.web_name || '')}), so your edge stays with the players they don't have.`)
    : tr(`On je favorit. Da ga stigneš, tvoj kapiten može biti igrač kojeg on nema${diffCap ? ', npr. <b>' + esc(diffCap.e.web_name) + '</b>' : ''}. Tako svaki njegov bod računaš duplo.`, `They are the favourite. To catch them, captain a player they don't own${diffCap ? ', e.g. <b>' + esc(diffCap.e.web_name) + '</b>' : ''}. That way every point he scores counts double for you.`);
  const list = (arr) => arr.length ? arr.map((x) => `<div class="li"><span class="k">${esc(ix.teams.get(x.e.team).short_name)}</span><span>${pbtn(x.e)}</span><span class="chg vi">${fmt(x.xp)}</span></div>`).join('') : `<p class="muted">${tr('Nema.', 'None.')}</p>`;
  return `<div class="head"><div><h1>Rival radar</h1><p class="sub">${tr(`Kolo ${ix.nextGw}: izaberi ligu i rivala, pa vidi šta će vjerovatno uraditi i kako ga prestići`, `Gameweek ${ix.nextGw}: pick a league and a rival, then see what they will probably do and how to overtake them`)}</p></div>
      <div class="pick2">${leaguePick(S.leagues, S.leagueId)}<label class="field">Rival<select id="rival">${others.map((r) => `<option value="${r.entry}"${r.entry === rivalId ? ' selected' : ''}>${esc(r.entry_name)} (${r.rank}.)</option>`).join('')}</select></label></div></div>
    <div class="grid3">
      <section class="g card"><p class="sub">${tr('Šansa da ga pobijediš u kolu', 'Chance to beat them in gameweek')} ${ix.nextGw}</p><p class="big" style="margin-top:4px;color:${odds.win >= 0.5 ? 'var(--green)' : '#ff6aa6'}">${pct(odds.win)}</p>
        <div class="odds" style="margin-top:10px" aria-hidden="true"><i style="width:${pct(odds.win)};background:var(--green)"></i><i style="width:${pct(odds.draw)};background:rgba(255,255,255,.4)"></i><i style="width:${pct(odds.lose)};background:var(--pink)"></i></div>
        <p class="sub" style="margin-top:8px">${tr(`Procjena: ti oko ${Math.round(odds.meanA)}, ${esc(rr.entry_name)} oko ${Math.round(odds.meanB)} bodova. Kolo je „odigrano” 2.500 puta.`, `Estimate: you about ${Math.round(odds.meanA)}, ${esc(rr.entry_name)} about ${Math.round(odds.meanB)} points. The gameweek was "played" 2,500 times.`)}</p></section>
      <section class="g card"><p class="sub">${tr('Njegov vjerovatni kapiten', 'Their likely captain')}</p><p class="big" style="margin-top:4px">${theirCap ? pbtn(theirCap.e) : '–'}</p><p class="sub">${theirCap ? tr(`oko ${pct(theirCap.sure)} sigurno, ${fmt(theirCap.xp)} predviđenih bodova`, `about ${pct(theirCap.sure)} sure, ${fmt(theirCap.xp)} predicted points`) : ''}</p><p class="muted" style="margin-top:8px">${theirCap && theirCap.e.id === them.captain ? tr('Bio mu je kapiten i prošlo kolo, a i dalje ima dobar raspored.', 'He was their captain last gameweek too, and still has good fixtures.') : tr('Po procjeni je njegov najbolji izbor za ovo kolo.', 'By the model, their best pick for this gameweek.')}</p></section>
      <section class="g card"><p class="sub">${tr('Sezona jedan na jedan (po kolima)', 'Season head to head (by gameweek)')}</p><p class="big" style="margin-top:4px">${w} : ${l}</p><p class="sub">${tr(`${w} ${plural(w, ['kolo', 'kola', 'kola'], [''])} bolje ti, ${l} on${d ? ', ' + d + ' neriješeno' : ''}. Ukupno: ti ${S.history.current.at(-1)?.total_points ?? 0}, on ${rr.total}.`, `You won ${w}, they won ${l}${d ? ', ' + d + ' drawn' : ''}. Total: you ${S.history.current.at(-1)?.total_points ?? 0}, them ${rr.total}.`)}</p></section>
    </div>
    <section class="g card mt"><h2 class="ct">${tr('Kako ga prestići', 'How to overtake them')}</h2><p class="muted" style="margin-top:6px">${tip}</p></section>
    <div class="grid3 mt">
      <section class="g card"><h2 class="ct">${tr('Samo ti imaš', 'Only you have')}</h2><p class="sub">${tr('Ovi igrači ti donose prednost', 'These players give you the edge')}</p><div class="list" style="margin-top:10px">${list(cmp.onlyMine)}</div></section>
      <section class="g card"><h2 class="ct">${tr('Samo on ima', 'Only they have')}</h2><p class="sub">${tr('Ovi igrači su tvoja opasnost', 'These players are your danger')}</p><div class="list" style="margin-top:10px">${list(cmp.onlyTheirs)}</div></section>
      <section class="g card"><h2 class="ct">${tr('Imate obojica', 'You both have')}</h2><p class="sub">${tr('Ovi se međusobno poništavaju (osim kapitena)', 'These cancel each other out (except the captain)')}</p><div class="list" style="margin-top:10px">${list(cmp.shared)}</div></section>
    </div>`;
}

export function bind(rerender) {
  const sel = document.getElementById('rival');
  if (sel) sel.onchange = () => { rivalId = +sel.value; rerender(); };
  const lg = document.getElementById('lg-sel');
  if (lg) lg.onchange = () => { setLeague(+lg.value); rivalId = null; rerender(); };
}
