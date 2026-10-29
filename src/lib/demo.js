// Demo podaci u istom obliku kao zvanični FPL API.
// Igrači, klubovi, kola i utakmice su pravi (snimak sezone 2026/27), a statistike, timovi menadžera
// i bodovi su izmišljeni, ali uvijek isti (seed) i međusobno usklađeni: bodovi igrača po kolima,
// zbir sezone, forma i bodovi menadžera računaju se iz istih podataka.
import snap from '../data/fpl-snapshot.json' with { type: 'json' };

// trenutno kolo u demu: 8 je završeno, rok za 9 je sljedeći
export const DEMO_CURRENT = 8;

// grube grupe po jačini, samo za demo (pravi API šalje svoje ocjene težine)
const TIER = { ARS: 5, MCI: 5, LIV: 5, CHE: 4, NEW: 4, AVL: 4, TOT: 3, MUN: 3, BHA: 3, CRY: 3, NFO: 3, BOU: 3, BRE: 2, FUL: 2, EVE: 2, LEE: 2, SUN: 1, COV: 1, HUL: 1, IPS: 1 };
const STAR = { 411: 3, 12: 2.2, 154: 2.2, 397: 1.6, 427: 1.5, 366: 1.6, 379: 1.8, 55: 1.4, 165: 1.4, 25: 1.6, 391: 1, 4: 1.1, 356: 1, 1: .8, 499: .9, 452: 1.2, 15: 1.3, 398: 1.2, 439: 1.2, 428: 1.2, 223: 1.1, 70: 1, 368: 1.1, 14: 1.1, 5: .9, 6: .9, 160: 1, 45: .9 };
const INJURED = 379;

function rng(seed) { let s = seed % 2147483647 || 1; return () => (s = (s * 16807) % 2147483647) / 2147483647; }
const r1 = (x) => Math.round(x * 10) / 10;
const r2 = (x) => Math.round(x * 100) / 100;

let cache = null;
function build() {
  if (cache) return cache;
  const teams = snap.teams.map((t) => ({ id: t.id, name: t.name, short_name: t.short_name, strength: TIER[t.short_name] || 2 }));
  const tierOf = (id) => teams[id - 1].strength;
  const fixtures = snap.fixtures.map((f) => {
    const h = tierOf(f.team_h), a = tierOf(f.team_a);
    const fdr = (opp) => Math.max(2, Math.min(5, opp));
    const done = f.event <= DEMO_CURRENT;
    const r = rng(f.id * 31 + 7);
    return {
      id: f.id, event: f.event, kickoff_time: f.kickoff_time, team_h: f.team_h, team_a: f.team_a,
      team_h_difficulty: fdr(a), team_a_difficulty: fdr(h), finished: done,
      team_h_score: done ? Math.floor(r() * (h + 1) / 1.6) : null, team_a_score: done ? Math.floor(r() * (a + 1) / 1.9) : null
    };
  });
  const fxOf = (team, gw) => fixtures.filter((f) => f.event === gw && (f.team_h === team || f.team_a === team));

  // osnovne osobine igrača (kvalitet, minutaža), pa bodovi po kolima iz njih
  const base = snap.players.map((p) => {
    const r = rng(p.id * 7919 + 13);
    const tier = tierOf(p.team), star = STAR[p.id] || 0;
    const q = Math.min(1, (tier / 5) * 0.45 + r() * 0.35 + star * 0.12);
    const share = p.id === INJURED ? 0.8 : Math.min(1, 0.3 + q * 0.7 + r() * 0.2);
    return { p, q, share, star, r };
  });
  const gwStats = new Map(); // id -> [stats po kolu]
  for (const b of base) {
    const { p, q, share } = b, pos = p.element_type, list = [];
    for (let gw = 1; gw <= DEMO_CURRENT; gw++) {
      const r = rng(p.id * 977 + gw * 131);
      const fx = fxOf(p.team, gw)[0];
      const injuredNow = p.id === INJURED && gw >= DEMO_CURRENT - 1;
      const plays = !injuredNow && r() < share;
      const minutes = plays ? (r() < 0.85 ? 90 : 20 + Math.floor(r() * 50)) : 0;
      const opp = fx ? (fx.team_h === p.team ? fx.team_a : fx.team_h) : 0, home = fx ? fx.team_h === p.team : true;
      const ease = fx ? (6 - tierOf(opp)) / 4 : 1;
      const gChance = [0, 0, 0.06, 0.21, 0.46][pos] * (0.25 + q * 1.7) * (0.6 + ease * 0.5) * (minutes / 90);
      const goals = r() < gChance ? (r() < 0.18 ? 2 : 1) : 0;
      const aRate = [0, 0.01, 0.09, 0.24, 0.18][pos] * (0.25 + q * 1.6) * (minutes / 90);
      const assists = r() < aRate ? 1 : 0;
      const cs = minutes >= 60 && pos <= 3 && r() < (0.14 + tierOf(p.team) * 0.06) * (0.6 + ease * 0.6) ? 1 : 0;
      const bonus = minutes && (goals || assists) && r() < 0.35 + q * 0.5 ? Math.min(3, goals * 2 + assists) : 0;
      const pts = !minutes ? 0 : (minutes >= 60 ? 2 : 1) + goals * [0, 10, 6, 5, 4][pos] + assists * 3 + cs * [0, 4, 4, 1, 0][pos] + bonus - (r() < 0.07 ? 1 : 0);
      list.push({ round: gw, minutes, goals_scored: goals, assists, clean_sheets: cs, bonus, total_points: pts, opponent_team: opp, was_home: home, xg: gChance * 0.9, xa: aRate * 0.9 });
    }
    gwStats.set(p.id, list);
  }

  const elements = base.map(({ p, q, star, r }) => {
    const pos = p.element_type, list = gwStats.get(p.id);
    const span = [0, 16, 22, 85, 105][pos];
    const now_cost = Math.round(([0, 40, 40, 45, 45][pos] + span * Math.pow(q, 2.6)) / 5) * 5;
    const total = list.reduce((s, x) => s + x.total_points, 0), mins = list.reduce((s, x) => s + x.minutes, 0);
    const played = list.filter((x) => x.minutes).length;
    const last4 = list.slice(-4);
    const injured = p.id === INJURED;
    const expPts = 2 + q * [0, 2.6, 3.2, 4.6, 5.6][pos] + tierOf(p.team) * 0.18;
    const xg90 = mins ? list.reduce((s, x) => s + x.xg, 0) / mins * 90 : 0, xa90 = mins ? list.reduce((s, x) => s + x.xa, 0) / mins * 90 : 0;
    const sel = r1(Math.min(65, Math.pow(q, 3) * 55 + star * 6 + r() * 3));
    return {
      id: p.id, web_name: p.web_name, first_name: p.first_name, second_name: p.second_name, team: p.team, element_type: pos,
      now_cost, total_points: total, minutes: mins, starts: list.filter((x) => x.minutes >= 60).length,
      // forma i prosjek: pola stvarni demo bodovi, pola očekivanje po kvalitetu (manje slučajnosti iz samo 8 kola)
      form: String(r1(0.45 * last4.reduce((s, x) => s + x.total_points, 0) / last4.length + 0.55 * expPts * (injured ? 0 : 1))),
      points_per_game: String(played ? r1(0.4 * total / played + 0.6 * expPts) : 0),
      event_points: list[list.length - 1].total_points,
      goals_scored: list.reduce((s, x) => s + x.goals_scored, 0), assists: list.reduce((s, x) => s + x.assists, 0),
      clean_sheets: list.reduce((s, x) => s + x.clean_sheets, 0), bonus: list.reduce((s, x) => s + x.bonus, 0),
      expected_goals_per_90: r2(xg90), expected_assists_per_90: r2(xa90), ict_index: String(r1(total * 1.6 + q * 20)),
      selected_by_percent: String(sel),
      transfers_in_event: Math.round(sel * 1200 * (r() + (q > 0.7 ? 0.6 : 0))), transfers_out_event: Math.round(sel * 900 * r() + (injured ? 180000 : 0)),
      status: injured ? 'i' : r() < 0.03 ? 'd' : 'a',
      chance_of_playing_next_round: injured ? 25 : null,
      news: injured ? 'Povreda skočnog zgloba, upitan za vikend' : '',
      cost_change_event: r() < 0.08 ? 1 : r() < 0.05 ? -1 : 0,
      ep_next: null
    };
  });
  const events = snap.events.map((e) => ({
    id: e.id, deadline_time: e.deadline_time, finished: e.id <= DEMO_CURRENT, is_current: e.id === DEMO_CURRENT, is_next: e.id === DEMO_CURRENT + 1,
    average_entry_score: 0,
    highest_score: e.id <= DEMO_CURRENT ? 110 + e.id * 3 : null
  }));
  cache = { teams, elements, events, fixtures, gwStats };
  // prosjek kola: prosjek 30 izmišljenih menadžera
  for (const ev of events) if (ev.id <= DEMO_CURRENT) { let t = 0; for (let m = 2; m <= 31; m++) t += historyFor(m).current[ev.id - 1].points; ev.average_entry_score = Math.round(t / 30); }
  return cache;
}

export function bootstrap() {
  const b = build();
  return { teams: b.teams, elements: b.elements, events: b.events, element_types: [{ id: 1, singular_name_short: 'GK' }, { id: 2, singular_name_short: 'DEF' }, { id: 3, singular_name_short: 'MID' }, { id: 4, singular_name_short: 'FWD' }] };
}
export const fixtures = () => build().fixtures;

export function live(gw) {
  const b = build();
  return { elements: b.elements.map((e) => { const s = (b.gwStats.get(e.id) || [])[gw - 1]; return { id: e.id, stats: s ? { minutes: s.minutes, goals_scored: s.goals_scored, assists: s.assists, clean_sheets: s.clean_sheets, bonus: s.bonus, total_points: s.total_points } : { minutes: 0, goals_scored: 0, assists: 0, clean_sheets: 0, bonus: 0, total_points: 0 } }; }) };
}

export function element(id) {
  const b = build(), e = b.elements.find((x) => x.id === id);
  if (!e) return null;
  const hist = (b.gwStats.get(id) || []).map((s) => ({ element: id, round: s.round, opponent_team: s.opponent_team, was_home: s.was_home, minutes: s.minutes, goals_scored: s.goals_scored, assists: s.assists, clean_sheets: s.clean_sheets, bonus: s.bonus, total_points: s.total_points, value: e.now_cost }));
  const fx = b.fixtures.filter((f) => f.event > DEMO_CURRENT && (f.team_h === e.team || f.team_a === e.team)).slice(0, 8)
    .map((f) => ({ id: f.id, event: f.event, kickoff_time: f.kickoff_time, team_h: f.team_h, team_a: f.team_a, is_home: f.team_h === e.team, difficulty: f.team_h === e.team ? f.team_h_difficulty : f.team_a_difficulty }));
  return { history: hist, fixtures: fx };
}

// ---- menadžeri ----
// Graba FC: dobar tim sastavljen iz igrača sa najviše bodova (budžet oko 103 M, najviše 3 po klubu),
// uz Haalanda za kapitena i povrijeđenog Isaka u postavi (da se vide upozorenja i prijedlozi).
let GRABA = null;
function grabaSquad() {
  if (GRABA) return GRABA;
  const b = build(), need = { 1: 2, 2: 5, 3: 5, 4: 3 }, per = {}, picked = [411, 379];
  let cost = 0;
  for (const id of picked) { const e = b.elements.find((x) => x.id === id); need[e.element_type]--; per[e.team] = (per[e.team] || 0) + 1; cost += e.now_cost; }
  const pool = b.elements.filter((e) => !picked.includes(e.id) && e.minutes > 300).sort((x, y) => (y.now_cost + y.minutes * 0.02) - (x.now_cost + x.minutes * 0.02));
  for (const e of pool) {
    if (!need[e.element_type] || (per[e.team] || 0) >= 3) continue;
    const left = Object.values(need).reduce((t, v) => t + v, 0) - 1;
    if (cost + e.now_cost + left * 45 > 1035) continue;
    picked.push(e.id); need[e.element_type]--; per[e.team] = (per[e.team] || 0) + 1; cost += e.now_cost;
  }
  // ako je nešto ostalo prazno, popuni najjeftinijim igračima koji igraju
  for (const e of pool.slice().sort((x, y) => x.now_cost - y.now_cost)) {
    if (!need[e.element_type] || picked.includes(e.id) || (per[e.team] || 0) >= 3) continue;
    picked.push(e.id); need[e.element_type]--; per[e.team] = (per[e.team] || 0) + 1; cost += e.now_cost;
  }
  const el = (id) => b.elements.find((x) => x.id === id);
  const by = (t) => picked.filter((id) => el(id).element_type === t).sort((x, y) => el(y).total_points - el(x).total_points);
  const [g, d, m, f] = [by(1), by(2), by(3), by(4)];
  const fw = [411, 379, ...f.filter((id) => id !== 411 && id !== 379)];
  const xi = [g[0], ...d.slice(0, 4), ...m.slice(0, 4), fw[0], fw[1]];
  GRABA = { xi, bench: [g[1], m[4], d[4], fw[2]], captain: 411, vice: m[0] };
  return GRABA;
}

const squads = new Map();
function squadFor(id) {
  if (id === 1) return grabaSquad();
  if (squads.has(id)) return squads.get(id);
  // bilo koji drugi ID: slučajan, ali ispravan tim (2-5-5-3, najviše 3 iz kluba)
  const r = rng(id * 104729 + 3), b = build();
  const byPos = [1, 2, 3, 4].map((pos) => b.elements.filter((e) => e.element_type === pos && e.minutes > 200));
  const need = { 1: 2, 2: 5, 3: 5, 4: 3 }, perTeam = {}, picked = [];
  for (const pos of [4, 3, 2, 1]) {
    let n = need[pos];
    const pool = byPos[pos - 1].slice().sort(() => r() - 0.5);
    for (const e of pool) {
      if (!n) break;
      if ((perTeam[e.team] || 0) >= 3) continue;
      if (e.now_cost > (pos >= 3 ? 105 : 60) && r() < 0.6) continue;
      picked.push(e); perTeam[e.team] = (perTeam[e.team] || 0) + 1; n--;
    }
  }
  const of = (t) => picked.filter((e) => e.element_type === t);
  const [g, d, m, f] = [of(1), of(2), of(3), of(4)];
  const xi = [g[0], ...d.slice(0, 4), ...m.slice(0, 4), ...f.slice(0, 2)].map((e) => e.id);
  const bench = [g[1], m[4], d[4], f[2]].map((e) => e.id);
  const best = xi.map((i) => b.elements.find((e) => e.id === i)).sort((a, c) => c.now_cost - a.now_cost);
  const s = { xi, bench, captain: best[0].id, vice: best[1].id };
  squads.set(id, s);
  return s;
}

const NAMES = { 1: ['Graba FC', 'Ahmed', 'Grabus'], 2: ['Kerim United', 'Kerim', 'H.'], 3: ['Hamza 11', 'Hamza', 'K.'], 4: ['Dino Kickers', 'Dino', 'M.'], 5: ['Ćevap Rovers', 'Emir', 'S.'], 6: ['Bosna Bez Granica', 'Adnan', 'B.'] };
// transferi u demu (samo broj po kolu, tim ostaje isti): kolo -> [broj, minus bodova]
const MOVES = { 1: { 3: [1, 0], 4: [2, 0], 6: [2, 4], 8: [1, 0] } };

function teamValue(id) {
  const s = squadFor(id), b = build();
  return [...s.xi, ...s.bench].reduce((t, i) => t + b.elements.find((e) => e.id === i).now_cost, 0);
}

const histCache = new Map();
function historyFor(id) {
  if (histCache.has(id)) return histCache.get(id);
  const b = build(), s = squadFor(id), r = rng(id * 6151 + 1);
  let total = 0;
  const current = [];
  for (let gw = 1; gw <= DEMO_CURRENT; gw++) {
    const pts = (i) => (b.gwStats.get(i) || [])[gw - 1]?.total_points || 0;
    const mv = (MOVES[id] || {})[gw] || [id !== 1 && gw > 1 && r() < 0.6 ? 1 : 0, 0];
    const raw = s.xi.reduce((t, i) => t + pts(i) * (i === s.captain ? 2 : 1), 0);
    const points = raw - mv[1];
    total += points;
    const ev = b.events[gw - 1];
    const rank = Math.max(1200, Math.round(11_000_000 / (1 + Math.exp((total / gw - 46) / 4))));
    current.push({ event: gw, points, total_points: total, overall_rank: rank, rank: Math.max(1, Math.round(9_000_000 * Math.pow(Math.max(0.02, 1 - points / 110), 2))), value: teamValue(id) - (DEMO_CURRENT - gw) * 2, bank: 5, event_transfers: mv[0], event_transfers_cost: mv[1], points_on_bench: s.bench.reduce((t, i) => t + pts(i), 0) });
  }
  const res = { current, chips: id === 1 ? [{ name: 'wildcard', event: 5 }] : [] };
  histCache.set(id, res);
  return res;
}

export function entry(id) {
  const n = NAMES[id] || ['Tim ' + id, 'Menadžer', String(id)];
  const h = historyFor(id).current, last = h[h.length - 1];
  return { id, name: n[0], player_first_name: n[1], player_last_name: n[2], summary_overall_points: last.total_points, summary_overall_rank: last.overall_rank, summary_event_points: last.points, current_event: DEMO_CURRENT, last_deadline_bank: last.bank, last_deadline_value: last.value, leagues: { classic: [{ id: 1, name: 'Liga iz kancelarije', entry_rank: 0, entry_last_rank: 0 }] } };
}
export const history = (id) => historyFor(id);

export function picks(id, gw) {
  const s = squadFor(id);
  const all = [...s.xi, ...s.bench];
  return {
    active_chip: id === 1 && gw === 5 ? 'wildcard' : null,
    entry_history: historyFor(id).current[Math.min(gw, DEMO_CURRENT) - 1],
    picks: all.map((el, i) => ({ element: el, position: i + 1, multiplier: i > 10 ? 0 : el === s.captain ? 2 : 1, is_captain: el === s.captain, is_vice_captain: el === s.vice }))
  };
}

export function league(id) {
  const rows = [1, 2, 3, 4, 5, 6].map((e) => { const h = historyFor(e).current; return { entry: e, entry_name: NAMES[e][0], player_name: NAMES[e][1] + ' ' + NAMES[e][2], total: h[h.length - 1].total_points, event_total: h[h.length - 1].points, prev: h[h.length - 2].total_points }; });
  const prevRank = rows.slice().sort((a, b) => b.prev - a.prev).map((r) => r.entry);
  rows.sort((a, b) => b.total - a.total).forEach((r, i) => { r.rank = i + 1; r.last_rank = prevRank.indexOf(r.entry) + 1; delete r.prev; });
  return { league: { id, name: 'Liga iz kancelarije' }, standings: { results: rows } };
}
