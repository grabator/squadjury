// Zanimljivosti kola: kako su igrači ranije igrali protiv protivnika iz ovog kola (Premier liga, FPL podaci po utakmicama).
import { S } from '../state.js';
import { fixturesFor, fmt, pl, dayShort, time, POS_BS } from '../model.js';
import { esc, pbtn, shirt, kit, $ } from '../ui.js';

export const title = 'Zanimljivosti';
let H = null;
const f = { club: 0, pos: 'att', sort: 'ga', min: 3 };
const data = () => (H ??= fetch('/data/h2h.json').then((r) => { if (!r.ok) throw new Error('Rekordi trenutno nisu dostupni.'); return r.json(); }).catch((e) => { H = null; throw e; }));
export const prefetch = () => { data().catch(() => {}); };

const season = (h, i) => h.seasonNames[i].replace('-', '/');
const POS = { att: [3, 4], fwd: [4], mid: [3], def: [1, 2], all: [1, 2, 3, 4] };
const SORT = {
  ga: (r) => r.g + r.a + r.apps / 1000,
  g: (r) => r.g + r.apps / 1000,
  ppg: (r) => r.pts / r.apps,
  apps: (r) => r.apps + (r.g + r.a) / 100
};
const line = (r) => `${r.apps} ${pl(r.apps, 'utakmica', 'utakmice', 'utakmica')}, ${r.g} ${pl(r.g, 'gol', 'gola', 'golova')}, ${r.a} ${pl(r.a, 'asistencija', 'asistencije', 'asistencija')}`;

/** Rekord igrača protiv kluba (po imenu kao u FPL-u), ili null ako nikad nisu igrali. */
function rec(h, e, opp) {
  const k = h.teams.indexOf(opp.name);
  const row = k < 0 ? null : (h.p[e.id] || []).find((x) => x[0] === k);
  if (!row) return null;
  const [, apps, mins, g, a, pts, , last] = row;
  return { e, opp, apps, mins, g, a, pts, last };
}

export async function render() {
  const h = await data();
  const { ix } = S, gw = ix.nextGw;
  // utakmice kola: svaki par jednom
  const fxs = [], seen = new Set();
  for (const t of ix.teams.values()) for (const x of fixturesFor(ix, t.id, gw, 1)) if (x.home && !seen.has(x.id)) { seen.add(x.id); fxs.push({ id: x.id, home: t, away: ix.teams.get(x.opp), kickoff: x.kickoff }); }
  fxs.sort((a, b) => String(a.kickoff).localeCompare(String(b.kickoff)));
  const oppOf = new Map(fxs.flatMap((x) => [[x.home.id, x.away], [x.away.id, x.home]]));
  // svi rekordi igrača čiji klub igra ovo kolo
  const all = [];
  for (const e of ix.players.values()) {
    const opp = oppOf.get(e.team);
    if (!opp || e.status === 'u') continue;
    const r = rec(h, e, opp);
    if (r) all.push(r);
  }
  const att = all.filter((r) => r.e.element_type >= 3);
  const best = (arr, key, min = 3) => arr.filter((r) => r.apps >= min).sort((a, b) => key(b) - key(a))[0];
  const picks = [
    ['Najviše golova', best(att, (r) => r.g + r.apps / 1000), (r) => `${r.g} ${pl(r.g, 'gol', 'gola', 'golova')}`],
    ['Najviše asistencija', best(att, (r) => r.a + r.apps / 1000), (r) => `${r.a} ${pl(r.a, 'asistencija', 'asistencije', 'asistencija')}`],
    ['Najviše bodova po utakmici', best(all, (r) => r.pts / r.apps, 4), (r) => `${fmt(r.pts / r.apps)} po utakmici`],
    ['Gol ili asistencija skoro svaki put', best(att, (r) => (r.g + r.a) / r.apps, 4), (r) => `${r.g + r.a} u ${r.apps} ${pl(r.apps, 'utakmici', 'utakmice', 'utakmica')}`],
    ['Ovaj protivnik mu ne leži', att.filter((r) => r.apps >= 5 && r.g === 0 && r.a === 0).sort((a, b) => b.apps - a.apps)[0], (r) => `0 u ${r.apps} ${pl(r.apps, 'utakmici', 'utakmice', 'utakmica')}`],
    ['Najbolji iz tvog tima', best(all.filter((r) => S.ids.includes(r.e.id)), (r) => r.pts / r.apps, 2), (r) => `${fmt(r.pts / r.apps)} bod. po utakmici`]
  ].filter(([, r]) => r);
  const card = ([k, r, big]) => `<button type="button" class="g fact" data-pid="${r.e.id}"><span class="sub">${k}</span><span class="fact-p"><span class="shirt">${shirt(ix.teams.get(r.e.team), r.e.element_type === 1)}</span><span><b>${esc(r.e.web_name)}</b><span class="sub">vs ${esc(r.opp.name)}</span></span></span><span class="fact-big">${big(r)}</span><span class="sub">${line(r)}</span></button>`;
  const clubs = [...new Set(fxs.flatMap((x) => [x.home, x.away]))].sort((a, b) => a.name.localeCompare(b.name));
  return `<div class="head"><div><h1>Zanimljivosti kola ${gw}</h1><p class="sub">Kako su igrači ranije igrali protiv protivnika iz ovog kola. Premier liga od sezone ${season(h, 0)} do kola ${h.upTo} sezone ${season(h, h.seasonNames.length - 1)}, za sve klubove u kojima su igrali.</p></div></div>
    <section aria-labelledby="h-facts"><h2 id="h-facts" class="sr">Izdvojeno</h2><div class="facts">${picks.map(card).join('')}</div></section>
    <section class="g card mt kf" aria-label="Filteri">
      <label class="field">Klub<select id="k-club"><option value="0">Svi klubovi</option>${clubs.map((t) => `<option value="${t.id}"${f.club === t.id ? ' selected' : ''}>${esc(t.name)}</option>`).join('')}</select></label>
      <div class="field"><span>Pozicija</span><div class="seg" role="group" aria-label="Pozicija">${[['att', 'Vezni i napad'], ['fwd', 'Napad'], ['mid', 'Vezni'], ['def', 'Odbrana i golmani'], ['all', 'Svi']].map(([v, t]) => `<button type="button" data-kpos="${v}" aria-pressed="${f.pos === v}">${t}</button>`).join('')}</div></div>
      <label class="field">Poredaj po<select id="k-sort"><option value="ga">golovima i asistencijama</option><option value="g">golovima</option><option value="ppg">bodovima po utakmici</option><option value="apps">broju utakmica</option></select></label>
      <label class="field">Najmanje utakmica<select id="k-min">${[1, 2, 3, 5, 8].map((n) => `<option value="${n}"${f.min === n ? ' selected' : ''}>${n}</option>`).join('')}</select></label>
    </section>
    <div id="k-list" class="kgrid mt"></div>
    <p class="sub mt">Izvor: javni FPL podaci po utakmicama (github.com/vaastav/Fantasy-Premier-League). Računaju se samo utakmice u kojima je igrač ušao u igru. Podaci se osvježavaju jednom po kolu.</p>`;
}

export function bind() {
  const { ix } = S;
  data().then((h) => {
    const box = $('#k-list');
    if (!box) return;
    const gw = ix.nextGw, fxs = [], seen = new Set();
    for (const t of ix.teams.values()) for (const x of fixturesFor(ix, t.id, gw, 1)) if (x.home && !seen.has(x.id)) { seen.add(x.id); fxs.push({ id: x.id, home: t, away: ix.teams.get(x.opp), kickoff: x.kickoff }); }
    fxs.sort((a, b) => String(a.kickoff).localeCompare(String(b.kickoff)));
    const top = (team, opp) => [...ix.players.values()].filter((e) => e.team === team.id && e.status !== 'u' && POS[f.pos].includes(e.element_type))
      .map((e) => rec(h, e, opp)).filter((r) => r && r.apps >= f.min).sort((a, b) => SORT[f.sort](b) - SORT[f.sort](a)).slice(0, 5);
    const met = (team, opp) => [...ix.players.values()].some((e) => e.team === team.id && rec(h, e, opp));
    const side = (team, opp) => { const rows = top(team, opp); return `<div class="kside"><p class="kclub"><i class="kd" style="background:${kit(team)[0]}"></i>${esc(team.name)} <span class="sub">vs ${esc(opp.name)}</span></p>${rows.length ? rows.map((r, i) => `<div class="krow${S.ids.includes(r.e.id) ? ' mine' : ''}"><span class="kn">${i + 1}</span><span class="shirt">${shirt(team, r.e.element_type === 1)}</span><span class="kmain">${pbtn(r.e)} <span class="sub">${POS_BS[r.e.element_type]}</span><span class="sub kl">${r.apps} ${pl(r.apps, 'utakmica', 'utakmice', 'utakmica')} · ${fmt(r.pts / r.apps)} bod. po utakmici</span></span><span class="kga" title="Golovi i asistencije">${r.g}<small>G</small> ${r.a}<small>A</small></span></div>`).join('') : `<p class="muted">${met(team, opp) ? `Nema igrača sa bar ${f.min} ${pl(f.min, 'utakmicom', 'utakmice', 'utakmica')} protiv ovog kluba.` : `Sadašnji igrači nisu igrali protiv ovog kluba u Premier ligi (od ${season(h, 0)}).`}</p>`}</div>`; };
    const draw = () => {
      const list = f.club ? fxs.filter((x) => x.home.id === f.club || x.away.id === f.club) : fxs;
      box.innerHTML = list.map((x) => { const d = new Date(x.kickoff); return `<section class="g card kfx"><h2 class="ct">${esc(x.home.name)} – ${esc(x.away.name)}</h2><p class="sub">${x.kickoff ? dayShort(d) + ' ' + time(d) : ''}</p><div class="kpair">${side(x.home, x.away)}${side(x.away, x.home)}</div></section>`; }).join('') || '<p class="muted">Nema utakmica u ovom kolu.</p>';
    };
    $('#k-club').onchange = (ev) => { f.club = +ev.target.value; draw(); };
    $('#k-sort').value = f.sort; $('#k-sort').onchange = (ev) => { f.sort = ev.target.value; draw(); };
    $('#k-min').onchange = (ev) => { f.min = +ev.target.value; draw(); };
    document.querySelectorAll('[data-kpos]').forEach((b) => { b.onclick = () => { f.pos = b.dataset.kpos; document.querySelectorAll('[data-kpos]').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); draw(); }; });
    draw();
  }).catch(() => {});
}
