// Pravi public/data/h2h.json: učinak svakog igrača ove sezone protiv svakog kluba u Premier ligi,
// iz javnog skupa FPL podataka po kolima (github.com/vaastav/Fantasy-Premier-League, sezone od 2016/17).
// Igrači se kroz sezone vežu preko FPL koda igrača (code), a ključ u izlazu je FPL id ove sezone.
// Pokretanje: node scripts/h2h.mjs   (jednom po kolu je dovoljno)
import { writeFileSync } from 'node:fs';

const BASE = 'https://raw.githubusercontent.com/vaastav/Fantasy-Premier-League/master/data';
const SEASONS = ['2016-17', '2017-18', '2018-19', '2019-20', '2020-21', '2021-22', '2022-23', '2023-24', '2024-25', '2025-26', '2026-27'];
const CURRENT = SEASONS.at(-1);

async function text(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.text();
}
/** CSV sa navodnicima (imena mogu imati zarez). Vraća niz objekata po zaglavlju. */
function csv(src) {
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (q) {
      if (c === '"' && src[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && src[i + 1] === '\n') i++; row.push(cell); cell = ''; if (row.length > 1) rows.push(row); row = []; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const head = rows.shift();
  return rows.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]])));
}

const master = csv(await text(`${BASE}/master_team_list.csv`));
const teamNames = async (season) => {
  const m = master.filter((t) => t.season === season);
  if (m.length) return new Map(m.map((t) => [+t.team, t.team_name]));
  const t = csv(await text(`${BASE}/${season}/teams.csv`));
  return new Map(t.map((x) => [+x.id, x.name]));
};

// sadašnji igrači: kod -> id ove sezone
const now = csv(await text(`${BASE}/${CURRENT}/players_raw.csv`));
const idByCode = new Map(now.map((p) => [p.code, +p.id]));

// isti klub se kroz sezone zove malo drugačije; koristimo ime kao u FPL-u ove sezone
const ALIAS = { Hull: 'Hull City', Ipswich: 'Ipswich Town', Coventry: 'Coventry City' };
const teams = [], teamIdx = new Map();
const tix = (raw) => { const name = ALIAS[raw] || raw; if (!teamIdx.has(name)) { teamIdx.set(name, teams.length); teams.push(name); } return teamIdx.get(name); };
const agg = new Map(); // id -> Map(oppIdx -> [apps, mins, goals, assists, points, starts, lastSeasonIdx])
let lastRound = 0;

for (const [si, season] of SEASONS.entries()) {
  const [names, players, gws] = await Promise.all([teamNames(season), text(`${BASE}/${season}/players_raw.csv`).then(csv), text(`${BASE}/${season}/gws/merged_gw.csv`).then(csv)]);
  const codeById = new Map(players.map((p) => [+p.id, p.code]));
  let n = 0;
  for (const g of gws) {
    const mins = +g.minutes;
    if (!(mins > 0)) continue;
    const id = idByCode.get(codeById.get(+g.element));
    const opp = names.get(+g.opponent_team);
    if (id == null || !opp) continue;
    if (!agg.has(id)) agg.set(id, new Map());
    const m = agg.get(id), k = tix(opp);
    const a = m.get(k) || [0, 0, 0, 0, 0, 0, si];
    a[0]++; a[1] += mins; a[2] += +g.goals_scored || 0; a[3] += +g.assists || 0; a[4] += +g.total_points || 0;
    a[5] += g.starts != null && g.starts !== '' ? +g.starts : mins >= 60 ? 1 : 0;
    a[6] = Math.max(a[6], si);
    m.set(k, a); n++;
    if (season === CURRENT) lastRound = Math.max(lastRound, +g.round || +g.GW || 0);
  }
  console.log(season, n, 'nastupa');
}

const p = {};
for (const [id, m] of agg) p[id] = [...m].map(([k, a]) => [k, ...a]);
const out = { source: 'github.com/vaastav/Fantasy-Premier-League', seasons: [SEASONS[0], CURRENT], upTo: lastRound, built: new Date().toISOString().slice(0, 10), teams, cols: ['opp', 'apps', 'mins', 'goals', 'assists', 'points', 'starts', 'lastSeason'], seasonNames: SEASONS, p };
const file = new URL('../public/data/h2h.json', import.meta.url);
writeFileSync(file, JSON.stringify(out));
console.log('timova', teams.length, 'igrača', agg.size, 'zadnje kolo ove sezone', lastRound);
console.log(teams.join(', '));
