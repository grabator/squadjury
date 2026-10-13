// Fills the LOCAL database with example data (example jurors, squads and verdicts) so the
// leaderboard, Champions and Season tabs have something to show during development.
// Every example juror is flagged demo = 1 and shown with an "example data" tag.
//
// Usage: npm run seed            (local database only)
//        DEMO_MODE=1 npm run seed -- --remote   (only if you really want examples on a remote database)

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { seasonOf, gwKey } from '../src/lib/season.js';
import { elo, pairKey, roundRobin } from '../src/lib/duels.js';
import { scoutScores } from '../src/lib/scouts.js';

const remote = process.argv.includes('--remote');
if (remote && process.env.DEMO_MODE !== '1') {
  console.error('Refusing to seed a remote database without DEMO_MODE=1.');
  process.exit(1);
}

const snap = JSON.parse(readFileSync(new URL('../src/data/fpl-snapshot.json', import.meta.url)));
let seed = 20261011;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const shuffle = (arr) => arr.map((x) => [rnd(), x]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;

const NICKS = [
  'TripleCaptain', 'BenchBoostBen', 'WildcardWendy', 'xG_Prophet', 'DifferentialDan', 'CleanSheetCarl', 'FreeHitFiona',
  'RankRiser', 'PriceChangePete', 'TemplateTom', 'HaalandOrBust', 'MiniLeagueMo', 'ArmbandAlice', 'GreenArrowGus',
  'DeadlineDave', 'PunterPriya', 'ChipStrategy', 'RedArrowRita', 'PoolsideScout', 'SetPieceSam', 'TopTenToni',
  'NoHitsNina', 'EyeTestEd', 'FixtureTicker', 'BudgetBeast', 'PremiumPaul', 'RotationRoss', 'BonusPointBea', 'GW1Guru', 'KingOfTheBench',
];

function squad() {
  const need = { 1: 2, 2: 5, 3: 5, 4: 3 }, clubs = {}, got = { 1: [], 2: [], 3: [], 4: [] };
  for (const p of shuffle(snap.players.filter((p) => !p.local_only))) {
    if (got[p.element_type].length >= need[p.element_type] || (clubs[p.team] || 0) >= 3) continue;
    got[p.element_type].push(p);
    clubs[p.team] = (clubs[p.team] || 0) + 1;
  }
  const shapes = [[4, 4, 2], [3, 5, 2], [4, 5, 1], [3, 4, 3], [5, 3, 2]];
  const [d, m, f] = pick(shapes);
  const xi = [got[1][0], ...got[2].slice(0, d), ...got[3].slice(0, m), ...got[4].slice(0, f)];
  const bench = [got[1][1], ...got[2].slice(d), ...got[3].slice(m), ...got[4].slice(f)];
  const attackers = xi.filter((p) => p.element_type >= 3);
  const captain = pick(attackers);
  const vice = pick(attackers.filter((p) => p !== captain));
  return {
    picks: [...xi.map((p) => ({ id: p.id, bench: false })), ...bench.map((p) => ({ id: p.id, bench: true }))],
    captain: captain.id,
    vice: vice.id,
  };
}

const key = () => Array.from({ length: 8 }, () => 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(rnd() * 56)]).join('');
const now = Date.now();
const openGw = snap.events.find((e) => Date.parse(e.deadline_time) > now)?.id ?? 7;
const gws = [openGw - 3, openGw - 2, openGw - 1, openGw].filter((g) => g >= 1);
const season = seasonOf(snap);

const sql = ["DELETE FROM h2h WHERE league_id = 900;", "DELETE FROM leagues WHERE code = 'EXAMP7';",
  'DELETE FROM votes WHERE user_id IN (SELECT id FROM users WHERE demo = 1);',
  'DELETE FROM duels WHERE user_id IN (SELECT id FROM users WHERE demo = 1);',
  'DELETE FROM results WHERE user_id IN (SELECT id FROM users WHERE demo = 1);',
  'DELETE FROM teams WHERE user_id IN (SELECT id FROM users WHERE demo = 1);',
  'DELETE FROM users WHERE demo = 1;'];
NICKS.forEach((n, i) => sql.push(`INSERT INTO users (id, google_sub, nickname, x_handle, demo, created_at) VALUES (${1000 + i}, ${q('demo:' + n)}, ${q(n)}, ${i % 4 === 0 ? q(n.slice(0, 15)) : 'NULL'}, 1, ${now - 864e5 * 40});`));

let teamId = 5000;
for (const num of gws) {
  const ev = snap.events.find((e) => e.id === num);
  const deadline = Date.parse(ev.deadline_time);
  const gw = gwKey(season, num); // database key of the gameweek, e.g. 202607
  sql.push(`INSERT INTO gameweeks (id, deadline, status, season) VALUES (${gw}, ${deadline}, 'open', ${q(season.label)}) ON CONFLICT(id) DO UPDATE SET status = 'open', deadline = ${deadline};`);
  sql.push(`DELETE FROM results WHERE gw = ${gw};`);
  const owners = shuffle(NICKS.map((_, i) => 1000 + i)).slice(0, num === openGw ? 24 : 26);
  const teams = owners.map((uid) => ({ id: teamId++, uid, quality: 4.5 + rnd() * 4.8, ...squad() }));
  const votes = [];
  for (const tm of teams) {
    const jurors = shuffle(NICKS.map((_, i) => 1000 + i).filter((u) => u !== tm.uid)).slice(0, 3 + Math.floor(rnd() * (num === openGw ? 14 : 22)));
    for (const u of jurors) {
      const s = Math.max(1, Math.min(10, Math.round(tm.quality + (rnd() - 0.5) * 3.2)));
      votes.push({ team: tm.id, user: u, score: s });
    }
  }
  // Example duels: a better squad usually wins, ratings move like in the app.
  const duels = [], duelRows = [];
  for (const tm of teams) Object.assign(tm, { elo: 1500, w: 0, l: 0 });
  const seen = new Set();
  for (let i = 0; i < teams.length * 7; i++) {
    const [x, y] = shuffle(teams).slice(0, 2);
    const juror = pick(NICKS.map((_, j) => 1000 + j).filter((u) => u !== x.uid && u !== y.uid));
    const k = `${juror}:${pairKey(x.id, y.id)}`;
    if (seen.has(k)) continue;
    seen.add(k);
    const xWins = x.quality + (rnd() - 0.5) * 3 > y.quality + (rnd() - 0.5) * 3;
    [x.elo, y.elo] = elo(x.elo, y.elo, xWins);
    (xWins ? x : y).w++;
    (xWins ? y : x).l++;
    const [lo, hi] = x.id < y.id ? [x, y] : [y, x];
    duelRows.push({ user_id: juror, a_id: lo.id, b_id: hi.id, winner_id: (xWins ? x : y).id });
    duels.push(`INSERT INTO duels (user_id, gw, season, a_id, b_id, winner_id, side, counted, created_at) VALUES (${juror}, ${gw}, ${q(season.label)}, ${lo.id}, ${hi.id}, ${(xWins ? x : y).id}, '${rnd() < 0.5 ? 'first' : 'second'}', 1, ${deadline - 864e5 * 2});`);
  }
  for (const tm of teams) {
    const mine = votes.filter((v) => v.team === tm.id);
    const sum = mine.reduce((a, v) => a + v.score, 0);
    // Finished gameweeks get example points, loosely in line with what the jury thought.
    const pts = num === openGw ? 'NULL' : Math.max(18, Math.round(tm.quality * 7 + (rnd() - 0.5) * 40));
    tm.pts = pts;
    sql.push(`INSERT INTO teams (id, user_id, gw, season, share_key, picks_json, captain_id, vice_id, vote_sum, vote_count, points, elo, duel_w, duel_l, created_at, updated_at) VALUES (${tm.id}, ${tm.uid}, ${gw}, ${q(season.label)}, ${q(key())}, ${q(JSON.stringify(tm.picks))}, ${tm.captain}, ${tm.vice}, ${sum}, ${mine.length}, ${pts}, ${tm.elo}, ${tm.w}, ${tm.l}, ${deadline - 864e5 * 3}, ${deadline - 864e5 * 3});`);
  }
  if (num !== openGw) {
    sql.push(`UPDATE gameweeks SET points_status = 'done', points_at = ${deadline + 864e5 * 4}, scouts_at = ${deadline + 864e5 * 4}, scouts_teams = ${teams.length} WHERE id = ${gw};`);
    // Example scout scores, worked out the same way as the app does.
    sql.push(`DELETE FROM scouts WHERE gw = ${gw};`);
    const scored = scoutScores(votes.map((v) => ({ user_id: v.user, team_id: v.team, score: v.score })), duelRows, new Map(teams.map((tm) => [tm.id, tm.pts])));
    for (const x of scored) sql.push(`INSERT INTO scouts (user_id, gw, season, score, verdicts, duels, rank, total) VALUES (${x.user_id}, ${gw}, ${q(season.label)}, ${x.score}, ${x.verdicts}, ${x.duels}, ${x.rank}, ${x.total});`);
  }
  sql.push(...duels);
  for (const v of votes) sql.push(`INSERT INTO votes (team_id, user_id, gw, season, score, created_at, updated_at) VALUES (${v.team}, ${v.user}, ${gw}, ${q(season.label)}, ${v.score}, ${deadline - 864e5}, ${deadline - 864e5});`);
}

// An example league with 12 of the example jurors. Join it with the code EXAMP7 to try leagues.
sql.push(`INSERT INTO leagues (id, code, name, owner_id, created_at) VALUES (900, 'EXAMP7', 'Example League', 1000, ${now - 864e5 * 30});`);
for (let i = 0; i < 12; i++) sql.push(`INSERT INTO league_members (league_id, user_id, joined_at) VALUES (900, ${1000 + i}, ${now - 864e5 * (30 - i)});`);
// Its head to head fixtures, one round per gameweek.
gws.forEach((num, round) => {
  for (const [home, away] of roundRobin(Array.from({ length: 12 }, (_, i) => 1000 + i), round)) {
    sql.push(`INSERT INTO h2h (league_id, gw, season, home_id, away_id) VALUES (900, ${gwKey(season, num)}, ${q(season.label)}, ${home}, ${away ?? 'NULL'});`);
  }
});

mkdirSync(new URL('../.wrangler/', import.meta.url), { recursive: true });
const file = fileURLToPath(new URL('../.wrangler/seed.sql', import.meta.url));
writeFileSync(file, sql.join('\n'));
execSync(`npx wrangler d1 execute squadjury ${remote ? '--remote' : '--local'} --file="${file}"`, { stdio: 'inherit' });
console.log(`Seeded ${NICKS.length} example jurors over gameweeks ${gws.join(', ')}. Past gameweeks lock on the next request.`);
