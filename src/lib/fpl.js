// FPL data: players, clubs, gameweeks and fixtures.
// Live data comes from the official FPL API and is cached in D1. When the API cannot be
// reached (or FPL_SOURCE=snapshot), the bundled 2026/27 snapshot is used instead.

import snapshot from '../data/fpl-snapshot.json';

const BOOTSTRAP = 'https://fantasy.premierleague.com/api/bootstrap-static/';
const FIXTURES = 'https://fantasy.premierleague.com/api/fixtures/';
const FRESH_MS = 60 * 60 * 1000; // refresh at most once an hour

let memo = { data: null, at: 0 };

function slim(bootstrap, fixtures) {
  return {
    source: 'live',
    teams: bootstrap.teams.map((t) => ({ id: t.id, name: t.name, short_name: t.short_name })),
    players: bootstrap.elements.map((p) => ({
      id: p.id,
      web_name: p.web_name,
      first_name: p.first_name,
      second_name: p.second_name,
      team: p.team,
      element_type: p.element_type,
    })),
    events: bootstrap.events.map((e) => ({ id: e.id, deadline_time: e.deadline_time })),
    fixtures: fixtures
      .filter((f) => f.event)
      .map((f) => ({ id: f.id, event: f.event, kickoff_time: f.kickoff_time, team_h: f.team_h, team_a: f.team_a })),
  };
}

async function fetchLive() {
  const headers = { 'user-agent': 'SquadJury/1.0 (+https://squadjury.com)', accept: 'application/json' };
  const [b, f] = await Promise.all([fetch(BOOTSTRAP, { headers }), fetch(FIXTURES, { headers })]);
  if (!b.ok || !f.ok) throw new Error(`fpl ${b.status} ${f.status}`);
  return slim(await b.json(), await f.json());
}

/** Returns FPL data, refreshing from the live API when the cache is old. */
export async function getFpl(env, now, { refresh = false } = {}) {
  if (env.FPL_SOURCE === 'snapshot') return snapshot;
  if (!refresh && memo.data && now - memo.at < 5 * 60 * 1000) return memo.data;
  const row = await env.DB.prepare("SELECT value, updated_at FROM kv WHERE key = 'fpl'").first();
  if (row && !refresh && now - row.updated_at < FRESH_MS) {
    memo = { data: JSON.parse(row.value), at: now };
    return memo.data;
  }
  try {
    const data = await fetchLive();
    await env.DB.prepare("INSERT INTO kv (key, value, updated_at) VALUES ('fpl', ?1, ?2) ON CONFLICT(key) DO UPDATE SET value = ?1, updated_at = ?2")
      .bind(JSON.stringify(data), now)
      .run();
    memo = { data, at: now };
    return data;
  } catch (e) {
    console.log(JSON.stringify({ msg: 'fpl fetch failed, using cache or snapshot', error: String(e) }));
    if (row) return (memo = { data: JSON.parse(row.value), at: now }).data;
    return snapshot;
  }
}

/** The gameweek that is open for posting and verdicts: the first one with a deadline ahead. */
export function openGameweek(fpl, now) {
  const next = fpl.events.find((e) => Date.parse(e.deadline_time) > now);
  return next ? { id: next.id, deadline: Date.parse(next.deadline_time) } : null;
}
