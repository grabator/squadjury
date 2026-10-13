// After a gameweek: fetch the official live points, score every squad, then replace the points
// of squads whose owner gave an FPL team id with the real points of that team.
// FPL sometimes blocks cloud servers, so failures are retried every hour for 48 hours, and the
// points can also be sent from a computer with `npm run points` (see README).

import { squadPoints, liveMap, entryPoints } from './points.js';
import { seasonOf, gwKey, gwNum } from './season.js';

const UA = { 'user-agent': 'SquadJury/1.0 (+https://squadjury.com)', accept: 'application/json' };
const MAX_TRIES = 48;
const VERIFY_PER_RUN = 40; // the free plan allows 50 outgoing requests per run

export async function fetchLive(num) {
  const r = await fetch(`https://fantasy.premierleague.com/api/event/${num}/live/`, { headers: UA });
  if (!r.ok) throw new Error(`fpl live ${r.status}`);
  return r.json();
}

/** Scores every squad of a gameweek from live data and marks the gameweek done. */
export async function scoreGameweek(env, fpl, key, liveData, now) {
  const live = liveMap(liveData);
  if (!live.size) throw new Error('empty live data');
  const pos = new Map(fpl.players.map((p) => [p.id, p.element_type]));
  const teams = await env.DB.prepare('SELECT id, picks_json, captain_id, vice_id FROM teams WHERE gw = ? AND points_verified = 0').bind(key).all();
  const stmts = teams.results.map((t) => {
    const { points } = squadPoints(JSON.parse(t.picks_json), t.captain_id, t.vice_id, live, pos);
    return env.DB.prepare('UPDATE teams SET points = ? WHERE id = ?').bind(points, t.id);
  });
  stmts.push(env.DB.prepare("UPDATE gameweeks SET points_status = 'done', points_at = ? WHERE id = ?").bind(now, key));
  for (let i = 0; i < stmts.length; i += 90) await env.DB.batch(stmts.slice(i, i + 90));
  return teams.results.length;
}

/** Real points for squads whose owner gave an FPL team id (a few per run). */
export async function verifyEntries(env, key) {
  const rows = await env.DB.prepare(
    `SELECT t.id, u.fpl_id FROM teams t JOIN users u ON u.id = t.user_id
      WHERE t.gw = ? AND t.points_verified = 0 AND u.fpl_id IS NOT NULL LIMIT ?`,
  ).bind(key, VERIFY_PER_RUN).all();
  let done = 0;
  for (const r of rows.results) {
    try {
      const res = await fetch(`https://fantasy.premierleague.com/api/entry/${r.fpl_id}/event/${gwNum(key)}/picks/`, { headers: UA });
      // 404: wrong id or no team that week. Stop asking for this squad.
      if (res.status === 404) { await env.DB.prepare('UPDATE teams SET points_verified = -1 WHERE id = ?').bind(r.id).run(); continue; }
      if (!res.ok) break; // blocked or busy: next run
      const pts = entryPoints(await res.json());
      if (pts == null) continue;
      await env.DB.prepare('UPDATE teams SET points = ?, points_verified = 1 WHERE id = ?').bind(pts, r.id).run();
      done++;
    } catch {
      break;
    }
  }
  return done;
}

/** Hourly: finished gameweeks get their points; failures are retried for 48 hours. */
export async function pointsJob(env, fpl, now) {
  const season = seasonOf(fpl);
  const due = await env.DB.prepare(
    `SELECT id, points_tries FROM gameweeks WHERE status = 'locked' AND (points_status IS NULL OR points_status = 'failed')
       AND points_tries < ? AND id > ? AND id < ? ORDER BY id`,
  ).bind(MAX_TRIES, season.base, season.base + 100).all();
  for (const g of due.results) {
    const ev = fpl.events.find((e) => gwKey(season, e.id) === g.id);
    if (!ev?.finished || !ev?.data_checked) continue; // FPL has not confirmed the scores yet
    try {
      await scoreGameweek(env, fpl, g.id, await fetchLive(gwNum(g.id)), now);
    } catch (e) {
      console.log(JSON.stringify({ msg: 'points fetch failed', gw: g.id, error: String(e) }));
      await env.DB.prepare("UPDATE gameweeks SET points_status = 'failed', points_tries = points_tries + 1 WHERE id = ?").bind(g.id).run();
    }
  }
  // Verified points for the last finished gameweeks.
  const done = await env.DB.prepare("SELECT id FROM gameweeks WHERE points_status = 'done' AND id > ? AND id < ? ORDER BY id DESC LIMIT 2")
    .bind(season.base, season.base + 100).all();
  for (const g of done.results) await verifyEntries(env, g.id);
}
