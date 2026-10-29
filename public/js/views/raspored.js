// Raspored: protivnici tvog tima za 8 kola, klubovi po lakoći rasporeda, promjene rasporeda, dupla i prazna kola.
import { S } from '../state.js';
import { fixturesFor, fixtureEase, fixtureSwings, specialGws, fmt } from '../model.js';
import { esc, pbtn, kit } from '../ui.js';
import { tr } from '../i18n.js';

export const title = tr('Raspored', 'Fixtures');
const N = 8;

const cell = (ix, teamId, gw) => {
  const fx = fixturesFor(ix, teamId, gw, 1);
  if (!fx.length) return `<td><span class="fdr none">${tr('prazno', 'blank')}</span></td>`;
  const one = (f) => `<span class="fdr d${f.fdr}" title="${esc(ix.teams.get(f.opp).name)}${f.home ? tr(', kod kuće', ', home') : tr(', u gostima', ', away')}">${ix.teams.get(f.opp).short_name} (${f.home ? tr('D', 'H') : tr('G', 'A')})</span>`;
  return fx.length > 1 ? `<td><span class="two">${fx.map(one).join('')}</span></td>` : `<td>${one(fx[0])}</td>`;
};

export async function render() {
  const { ix } = S, from = ix.nextGw, gws = [];
  for (let g = from; g < from + N && g <= ix.lastGw; g++) gws.push(g);
  const head = `<tr><th scope="col"><span class="sr">${tr('Klub', 'Club')}</span></th>${gws.map((g) => `<th scope="col">${tr('K', 'GW')}${g}</th>`).join('')}</tr>`;
  const squad = S.ids.map((id) => ix.players.get(id));
  const mine = squad.map((e) => `<tr><td>${pbtn(e)}</td>${gws.map((g) => cell(ix, e.team, g)).join('')}</tr>`).join('');
  const teams = [...ix.teams.values()].map((t) => ({ t, ease: fixtureEase(ix, t.id, from, 5) })).sort((a, b) => a.ease - b.ease);
  const all = teams.map(({ t, ease }) => `<tr><td><span class="dot" style="background:${kit(t)[0]};margin-right:8px"></span>${esc(t.name)}</td>${gws.map((g) => cell(ix, t.id, g)).join('')}</tr>`).join('');
  const sw = fixtureSwings(ix).slice(0, 5);
  const sp = specialGws(ix, from, 12);
  const dbl = sp.filter((x) => x.kind === 'duplo'), blank = sp.filter((x) => x.kind === 'prazno');
  return `<div class="head"><div><h1>${tr('Raspored', 'Fixtures')}</h1><p class="sub">${tr(`Protivnici za narednih ${gws.length} kola. Zeleno lako, sivo srednje, crveno teško, (D) kod kuće, (G) u gostima.`, `Opponents for the next ${gws.length} gameweeks. Green easy, grey medium, red hard, (H) home, (A) away.`)}</p></div></div>
    <section class="g card"><h2 class="ct">${tr('Tvoj tim', 'Your team')}</h2><div class="scroll-x" tabindex="0" style="margin-top:10px"><table class="ticker"><caption class="sr">${tr('Protivnici tvojih igrača po kolima', 'Your players\' opponents by gameweek')}</caption><thead>${head}</thead><tbody>${mine}</tbody></table></div></section>
    <div class="grid2 mt">
      <section class="g card"><h2 class="ct">${tr('Svi klubovi', 'All clubs')}</h2><p class="sub" style="margin-top:4px">${tr('Poredani od najlakšeg rasporeda u narednih 5 kola', 'Sorted from the easiest run over the next 5 gameweeks')}</p><div class="scroll-x" tabindex="0" style="margin-top:10px"><table class="ticker"><caption class="sr">${tr('Protivnici svih klubova po kolima', 'Every club\'s opponents by gameweek')}</caption><thead>${head}</thead><tbody>${all}</tbody></table></div></section>
      <div class="stack">
        <section class="g card"><h2 class="ct">${tr('Raspored se olakšava', 'Fixtures turning')}</h2><p class="sub" style="margin-top:4px">${tr('Klubovi kojima za 2 kola kreću lakši protivnici. Dobro vrijeme da kupiš njihove igrače.', 'Clubs whose opponents get easier in 2 gameweeks. A good time to buy their players.')}</p><div class="list" style="margin-top:10px">${sw.length ? sw.map((s) => `<div class="li"><span class="dot" style="background:${kit(s.team)[0]}"></span><b>${esc(s.team.name)}</b><span class="chg up">${fmt(s.now)} → ${fmt(s.later)}</span></div>`).join('') : `<p class="muted">${tr('Trenutno nema klubova sa velikom promjenom rasporeda.', 'No club has a big fixture swing right now.')}</p>`}</div></section>
        <section class="g card"><h2 class="ct">${tr('Dupla i prazna kola', 'Double and blank gameweeks')}</h2><div class="list" style="margin-top:10px">${dbl.length || blank.length ? [...dbl, ...blank].sort((a, b) => a.gw - b.gw).map((x) => `<div class="li"><span class="k">${tr('Kolo', 'GW')} ${x.gw}</span><b>${esc(x.team.name)}</b><span class="chg ${x.kind === 'duplo' ? 'up' : 'dn'}">${x.kind === 'duplo' ? tr('dvije utakmice', 'two matches') : tr('bez utakmice', 'no match')}</span></div>`).join('') : `<p class="muted">${tr('U narednih 12 kola zasad nema duplih ni praznih kola. FPL ih objavi kad se pomjere utakmice.', 'No double or blank gameweeks in the next 12 so far. FPL announces them when matches are moved.')}</p>`}</div></section>
      </div>
    </div>`;
}
