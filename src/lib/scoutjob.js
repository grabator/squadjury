// Works out the scout scores of a finished gameweek once its real points are in.
// Runs again while verified points (FPL team ids) keep coming in.

import { scoutScores, MIN_TEAMS } from './scouts.js';
import { seasonLabel } from './season.js';

export async function scoreScouts(env, gw, now) {
  const [teams, votes, duels] = await env.DB.batch([
    env.DB.prepare('SELECT id, points FROM teams WHERE gw = ? AND hidden = 0 AND points IS NOT NULL').bind(gw),
    env.DB.prepare('SELECT user_id, team_id, score FROM votes WHERE gw = ?').bind(gw),
    env.DB.prepare('SELECT user_id, a_id, b_id, winner_id FROM duels WHERE gw = ? AND counted = 1').bind(gw),
  ]);
  const points = new Map(teams.results.map((t) => [t.id, t.points]));
  const stmts = [env.DB.prepare('DELETE FROM scouts WHERE gw = ?').bind(gw)];
  if (points.size >= MIN_TEAMS) {
    for (const s of scoutScores(votes.results, duels.results, points)) {
      stmts.push(env.DB.prepare('INSERT INTO scouts (user_id, gw, season, score, verdicts, duels, rank, total) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(s.user_id, gw, seasonLabel(gw), s.score, s.verdicts, s.duels, s.rank, s.total));
    }
  }
  stmts.push(env.DB.prepare('UPDATE gameweeks SET scouts_at = ?, scouts_teams = ? WHERE id = ?').bind(now, points.size, gw));
  for (let i = 0; i < stmts.length; i += 90) await env.DB.batch(stmts.slice(i, i + 90));
  return stmts.length - 2;
}
