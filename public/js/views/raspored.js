// Raspored: protivnici tvog tima za 8 kola, klubovi po lakoći rasporeda, promjene rasporeda, dupla i prazna kola.
import { S } from '../state.js';
import { fixturesFor, fixtureEase, fixtureSwings, specialGws, fmt } from '../model.js';
import { esc, pbtn, kit } from '../ui.js';

export const title = 'Raspored';
const N = 8;

const cell = (ix, teamId, gw) => {
  const fx = fixturesFor(ix, teamId, gw, 1);
  if (!fx.length) return '<td><span class="fdr none">prazno</span></td>';
  const one = (f) => `<span class="fdr d${f.fdr}" title="${esc(ix.teams.get(f.opp).name)}${f.home ? ', kod kuće' : ', u gostima'}">${ix.teams.get(f.opp).short_name} (${f.home ? 'D' : 'G'})</span>`;
  return fx.length > 1 ? `<td><span class="two">${fx.map(one).join('')}</span></td>` : `<td>${one(fx[0])}</td>`;
};

export async function render() {
  const { ix } = S, from = ix.nextGw, gws = [];
  for (let g = from; g < from + N && g <= ix.lastGw; g++) gws.push(g);
  const head = `<tr><th scope="col"><span class="sr">Klub</span></th>${gws.map((g) => `<th scope="col">K${g}</th>`).join('')}</tr>`;
  const squad = S.ids.map((id) => ix.players.get(id));
  const mine = squad.map((e) => `<tr><td>${pbtn(e)}</td>${gws.map((g) => cell(ix, e.team, g)).join('')}</tr>`).join('');
  const teams = [...ix.teams.values()].map((t) => ({ t, ease: fixtureEase(ix, t.id, from, 5) })).sort((a, b) => a.ease - b.ease);
  const all = teams.map(({ t, ease }) => `<tr><td><span class="dot" style="background:${kit(t)[0]};margin-right:8px"></span>${esc(t.name)}</td>${gws.map((g) => cell(ix, t.id, g)).join('')}</tr>`).join('');
  const sw = fixtureSwings(ix).slice(0, 5);
  const sp = specialGws(ix, from, 12);
  const dbl = sp.filter((x) => x.kind === 'duplo'), blank = sp.filter((x) => x.kind === 'prazno');
  return `<div class="head"><div><h1>Raspored</h1><p class="sub">Protivnici za narednih ${gws.length} kola. Zeleno lako, sivo srednje, crveno teško, (D) kod kuće, (G) u gostima.</p></div></div>
    <section class="g card"><h2 class="ct">Tvoj tim</h2><div class="scroll-x" tabindex="0" style="margin-top:10px"><table class="ticker"><caption class="sr">Protivnici tvojih igrača po kolima</caption><thead>${head}</thead><tbody>${mine}</tbody></table></div></section>
    <div class="grid2 mt">
      <section class="g card"><h2 class="ct">Svi klubovi</h2><p class="sub" style="margin-top:4px">Poredani od najlakšeg rasporeda u narednih 5 kola</p><div class="scroll-x" tabindex="0" style="margin-top:10px"><table class="ticker"><caption class="sr">Protivnici svih klubova po kolima</caption><thead>${head}</thead><tbody>${all}</tbody></table></div></section>
      <div class="stack">
        <section class="g card"><h2 class="ct">Raspored se olakšava</h2><p class="sub" style="margin-top:4px">Klubovi kojima za 2 kola kreću lakši protivnici. Dobro vrijeme da kupiš njihove igrače.</p><div class="list" style="margin-top:10px">${sw.length ? sw.map((s) => `<div class="li"><span class="dot" style="background:${kit(s.team)[0]}"></span><b>${esc(s.team.name)}</b><span class="chg up">${fmt(s.now)} → ${fmt(s.later)}</span></div>`).join('') : '<p class="muted">Trenutno nema klubova sa velikom promjenom rasporeda.</p>'}</div></section>
        <section class="g card"><h2 class="ct">Dupla i prazna kola</h2><div class="list" style="margin-top:10px">${dbl.length || blank.length ? [...dbl, ...blank].sort((a, b) => a.gw - b.gw).map((x) => `<div class="li"><span class="k">Kolo ${x.gw}</span><b>${esc(x.team.name)}</b><span class="chg ${x.kind === 'duplo' ? 'up' : 'dn'}">${x.kind === 'duplo' ? 'dvije utakmice' : 'bez utakmice'}</span></div>`).join('') : `<p class="muted">U narednih 12 kola zasad nema duplih ni praznih kola. FPL ih objavi kad se pomjere utakmice.</p>`}</div></section>
      </div>
    </div>`;
}
