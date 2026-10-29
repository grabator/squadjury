// Builds src/data/fpl-snapshot.json from FPL CSV exports.
//
// Production reads the live FPL API (bootstrap-static and fixtures). This snapshot is
// only for local development and tests, when the FPL API is not reachable.
//
// Usage: node scripts/build-snapshot.mjs <folder with players_raw.csv, teams.csv, fixtures.csv>
// Source of the CSV files: github.com/vaastav/Fantasy-Premier-League (data/2026-27).

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2];
if (!dir) {
  console.error('Usage: node scripts/build-snapshot.mjs <csv folder>');
  process.exit(1);
}

// Small CSV parser that understands quoted fields with commas.
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const [head, ...body] = rows;
  return body.filter((r) => r.length === head.length).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]])));
}

const read = (f) => parseCsv(readFileSync(join(dir, f), 'utf8'));

const teams = read('teams.csv')
  .map((t) => ({ id: +t.id, name: t.name, short_name: t.short_name }))
  .sort((a, b) => a.id - b.id);

const players = read('players_raw.csv')
  .map((p) => ({
    id: +p.id,
    web_name: p.web_name,
    first_name: p.first_name,
    second_name: p.second_name,
    team: +p.team,
    element_type: +p.element_type,
  }))
  .sort((a, b) => a.id - b.id);

// Players that appear in our test screenshots but were added to FPL after the CSV export.
// Marked so nobody mistakes them for official ids.
const supplement = [
  { id: 9001, web_name: 'Maitland-Niles', first_name: 'Ainsley', second_name: 'Maitland-Niles', team: 9, element_type: 2, local_only: true },
];
for (const s of supplement) if (!players.some((p) => p.web_name === s.web_name)) players.push(s);

const fixtures = read('fixtures.csv')
  .filter((f) => f.event)
  .map((f) => ({ id: +f.id, event: +f.event, kickoff_time: f.kickoff_time, team_h: +f.team_h, team_a: +f.team_a }))
  .sort((a, b) => a.event - b.event || a.kickoff_time.localeCompare(b.kickoff_time));

// FPL deadline is 90 minutes before the first kickoff of the gameweek.
const events = [];
for (const f of fixtures) {
  const e = events.find((x) => x.id === f.event);
  const k = Date.parse(f.kickoff_time);
  if (!e) events.push({ id: f.event, first_kickoff: k });
  else if (k < e.first_kickoff) e.first_kickoff = k;
}
const eventsOut = events
  .sort((a, b) => a.id - b.id)
  .map((e) => ({ id: e.id, deadline_time: new Date(e.first_kickoff - 90 * 60 * 1000).toISOString() }));

const out = {
  source: 'snapshot',
  note: 'Local snapshot of FPL 2026/27 data for development and tests. Production uses the live FPL API.',
  season: '2026/27',
  teams,
  players,
  events: eventsOut,
  fixtures,
};
writeFileSync(new URL('../src/jury/data/fpl-snapshot.json', import.meta.url), JSON.stringify(out));
console.log(`teams ${teams.length}, players ${players.length}, events ${eventsOut.length}, fixtures ${fixtures.length}`);
