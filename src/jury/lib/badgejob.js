// Works out a juror's numbers for the badges and the streak, and stores newly unlocked badges.

import { BADGES, unlocked, streaks } from './badges.js';
import { MIN_DUELS } from './duels.js';
import { seasonLabel } from './season.js';

/** Everything the badges look at, in one batch. open: the open gameweek key (or null). */
export async function userStats(env, userId, open = null) {
  const q = (sql, ...b) => env.DB.prepare(sql).bind(...b);
  const [v, firsts, perGw, gws, teams, res, sc, du, giant, rec] = await env.DB.batch([
    q('SELECT COUNT(*) AS n, AVG(score) AS avg FROM votes WHERE user_id = ?', userId),
    q(`SELECT COUNT(*) AS n FROM votes v WHERE v.user_id = ?1 AND NOT EXISTS (
         SELECT 1 FROM votes w WHERE w.team_id = v.team_id AND (w.created_at < v.created_at OR (w.created_at = v.created_at AND w.user_id < v.user_id)))`, userId),
    q(`SELECT gw, SUM(n) AS n FROM (SELECT gw, COUNT(*) AS n FROM votes WHERE user_id = ?1 GROUP BY gw
         UNION ALL SELECT gw, COUNT(*) AS n FROM duels WHERE user_id = ?1 AND counted = 1 GROUP BY gw) GROUP BY gw`, userId),
    q(`SELECT id FROM gameweeks WHERE id <= COALESCE(?1, (SELECT MAX(id) FROM gameweeks)) ORDER BY id`, open),
    q('SELECT COUNT(*) AS n, MAX(vote_count) AS mv FROM teams WHERE user_id = ?', userId),
    q('SELECT SUM(CASE WHEN rank <= 10 THEN 1 ELSE 0 END) AS top10, SUM(CASE WHEN rank = 1 THEN 1 ELSE 0 END) AS wins FROM results WHERE user_id = ?', userId),
    q('SELECT MAX(score) AS best, SUM(CASE WHEN rank <= 10 THEN 1 ELSE 0 END) AS top10 FROM scouts WHERE user_id = ?', userId),
    q('SELECT COUNT(*) AS n FROM duels WHERE user_id = ? AND counted = 1', userId),
    q(`SELECT COUNT(*) AS n FROM duels d JOIN teams m ON m.id = d.winner_id AND m.user_id = ?1
         JOIN teams o ON o.id = CASE WHEN d.winner_id = d.a_id THEN d.b_id ELSE d.a_id END
        WHERE d.counted = 1 AND o.duel_w + o.duel_l >= ?2
          AND (SELECT COUNT(*) FROM teams x WHERE x.gw = o.gw AND x.hidden = 0 AND x.duel_w + x.duel_l >= ?2 AND x.elo > o.elo) < 3`, userId, MIN_DUELS),
    q('SELECT COUNT(*) AS n FROM users WHERE referred_by = ? AND nickname IS NOT NULL', userId),
  ]);
  const counts = new Map(perGw.results.map((r) => [r.gw, r.n]));
  const streak = streaks(gws.results.map((g) => g.id), counts, open);
  return {
    verdicts: v.results[0].n, avgVerdict: v.results[0].avg ?? 0, firsts: firsts.results[0].n,
    bestStreak: streak.best, streak, squads: teams.results[0].n, maxVotes: teams.results[0].mv ?? 0,
    top10: res.results[0].top10 ?? 0, wins: res.results[0].wins ?? 0, bestScout: sc.results[0].best ?? 0, scoutTop10: sc.results[0].top10 ?? 0,
    duels: du.results[0].n, giantKills: giant.results[0].n, recruits: rec.results[0].n,
  };
}

/** Stores badges that are newly unlocked. Returns { stats, fresh: [ids] }. */
export async function evaluateBadges(env, userId, open, now) {
  const stats = await userStats(env, userId, open?.id ?? null);
  const have = new Set((await env.DB.prepare('SELECT badge FROM badges WHERE user_id = ?').bind(userId).all()).results.map((r) => r.badge));
  const fresh = unlocked(stats).filter((id) => !have.has(id));
  if (fresh.length) {
    const gw = open?.id ?? null;
    await env.DB.batch(fresh.map((id) => env.DB.prepare('INSERT OR IGNORE INTO badges (user_id, badge, season, gw, unlocked_at) VALUES (?, ?, ?, ?, ?)')
      .bind(userId, id, gw ? seasonLabel(gw) : null, gw, now)));
  }
  return { stats, fresh };
}

/** Cron: badges for jurors who did something lately (every 5 minutes) or after a gameweek (hourly). */
export async function badgeJob(env, open, now, sinceMs) {
  const since = now - sinceMs;
  const users = await env.DB.prepare(
    `SELECT user_id FROM votes WHERE updated_at > ?1 UNION SELECT user_id FROM duels WHERE created_at > ?1
      UNION SELECT user_id FROM teams WHERE updated_at > ?1 UNION SELECT referred_by FROM users WHERE created_at > ?1 AND referred_by IS NOT NULL
      UNION SELECT user_id FROM results WHERE gw = (SELECT MAX(id) FROM gameweeks WHERE locked_at > ?1)
      UNION SELECT user_id FROM scouts WHERE gw IN (SELECT id FROM gameweeks WHERE scouts_at > ?1)
      LIMIT 300`,
  ).bind(since).all();
  let n = 0;
  for (const { user_id } of users.results) {
    if (!user_id) continue;
    n += (await evaluateBadges(env, user_id, open, now)).fresh.length;
  }
  return n;
}

export { BADGES };
