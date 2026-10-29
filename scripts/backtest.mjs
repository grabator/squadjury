// Provjera tačnosti predviđenih bodova na odigranim kolima.
// Za kolo T model vidi samo kola prije T (forma, prosjek, xG/xA, minute, protivnici), pa se predviđanje
// poredi sa stvarnim bodovima. Poredi se: aplikacija (naš model + FPL xP), samo naš model i samo FPL xP.
// Podaci: javni FPL podaci po kolima sa github.com/vaastav/Fantasy-Premier-League.
// Pokretanje: node scripts/backtest.mjs 2026-27 4 6
import { index, xp } from '../public/js/model.js';

const [season = '2026-27', from = '4', to = '6'] = process.argv.slice(2);
const BASE = `https://raw.githubusercontent.com/vaastav/Fantasy-Premier-League/master/data/${season}`;
const get = async (f) => { const r = await fetch(`${BASE}/${f}`); if (!r.ok) throw new Error(`${f}: ${r.status}`); return csv(await r.text()); };

function csv(t) {
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"' && t[i + 1] === '"') { f += '"'; i++; } else if (c === '"') q = false; else f += c; }
    else if (c === '"') q = true; else if (c === ',') { row.push(f); f = ''; } else if (c === '\n') { row.push(f); rows.push(row); row = []; f = ''; } else if (c !== '\r') f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  const h = rows.shift();
  return rows.filter((r) => r.length === h.length).map((r) => Object.fromEntries(h.map((k, i) => [k, r[i]])));
}
const pearson = (a, b) => { const n = a.length, ma = a.reduce((s, x) => s + x, 0) / n, mb = b.reduce((s, x) => s + x, 0) / n; let num = 0, da = 0, db = 0; for (let i = 0; i < n; i++) { num += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; } return num / Math.sqrt(da * db); };
const mae = (p, a) => p.reduce((s, x, i) => s + Math.abs(x - a[i]), 0) / p.length;
const top20 = (p, a) => p.map((x, i) => [x, a[i]]).sort((x, y) => y[0] - x[0]).slice(0, 20).reduce((s, x) => s + x[1], 0) / 20;

const [gws, fx, teamsCsv] = await Promise.all([get('gws/merged_gw.csv'), get('fixtures.csv'), get('teams.csv')]);
const teamId = new Map(teamsCsv.map((t) => [t.name, +t.id])), POS = { GK: 1, DEF: 2, MID: 3, FWD: 4 };
const teams = teamsCsv.map((t) => ({ id: +t.id, name: t.name, short_name: t.short_name }));
const fixtures = fx.filter((f) => f.event).map((f) => ({ id: +f.id, event: +f.event, team_h: +f.team_h, team_a: +f.team_a, team_h_difficulty: +f.team_h_difficulty, team_a_difficulty: +f.team_a_difficulty, kickoff_time: f.kickoff_time }));
const byEl = new Map();
for (const g of gws) { const id = +g.element; if (!byEl.has(id)) byEl.set(id, { id, name: g.name, pos: POS[g.position], rows: [] }); byEl.get(id).rows.push(g); }

const sum = {};
for (let T = +from; T <= +to; T++) {
  const els = [];
  for (const p of byEl.values()) {
    const prev = p.rows.filter((g) => +g.GW < T), cur = p.rows.filter((g) => +g.GW === T);
    const mins = prev.reduce((s, g) => s + +g.minutes, 0);
    if (!cur.length || !mins) continue;
    const pts = prev.reduce((s, g) => s + +g.total_points, 0), apps = prev.filter((g) => +g.minutes > 0).length;
    const form = prev.filter((g) => +g.GW >= T - 4).reduce((s, g) => s + +g.total_points, 0) / 4;
    const fpl = cur.reduce((s, g) => s + +g.xP, 0);
    els.push({ id: p.id, web_name: p.name, team: teamId.get(cur[0].team), element_type: p.pos, now_cost: +cur[0].value, form: String(form), points_per_game: String(apps ? pts / apps : 0), minutes: mins, starts: prev.reduce((s, g) => s + +g.starts, 0),
      expected_goals_per_90: String(prev.reduce((s, g) => s + +g.expected_goals, 0) / mins * 90), expected_assists_per_90: String(prev.reduce((s, g) => s + +g.expected_assists, 0) / mins * 90), status: 'a', chance_of_playing_next_round: null,
      ep_next: String(fpl / cur.length), act: cur.reduce((s, g) => s + +g.total_points, 0), fpl });
  }
  const events = Array.from({ length: 38 }, (_, i) => ({ id: i + 1, finished: i + 1 < T, is_next: i + 1 === T, is_current: i + 1 === T - 1 }));
  const ix = index({ elements: els, teams, events }, fixtures);
  const ixNo = index({ elements: els.map((e) => ({ ...e, ep_next: null })), teams, events }, fixtures);
  const act = els.map((e) => e.act), hasFpl = els.some((e) => e.fpl);
  const v = { aplikacija: els.map((e) => xp(ix, e)), nas_model: els.map((e) => xp(ixNo, ixNo.players.get(e.id))), fpl_xp: els.map((e) => e.fpl) };
  for (const [k, p] of Object.entries(v)) {
    if (k !== 'nas_model' && !hasFpl) continue; // javni podaci za neka kola nemaju FPL xP
    const a = (sum[k] ||= { n: 0, r: 0, mae: 0, top: 0 }); a.n++; a.r += pearson(p, act); a.mae += mae(p, act); a.top += top20(p, act);
  }
  const b = (sum.najbolje_moguce ||= { n: 0, top: 0, avg: 0 }); b.n++; b.top += top20(act, act); b.avg += act.reduce((s, x) => s + x, 0) / act.length;
}
console.log(`Sezona ${season}, kola ${from} do ${to}. r = korelacija sa stvarnim bodovima (1 je savršeno), MAE = prosječna greška u bodovima, top20 = prosječni stvarni bodovi 20 igrača sa najvećom procjenom.`);
for (const [k, a] of Object.entries(sum)) console.log(k.padEnd(16), `kola ${a.n}`, a.r != null ? `r ${(a.r / a.n).toFixed(2)}  MAE ${(a.mae / a.n).toFixed(2)}  top20 ${(a.top / a.n).toFixed(2)}` : `top20 ${(a.top / a.n).toFixed(2)}  prosjek igrača ${(a.avg / a.n).toFixed(2)}`);
