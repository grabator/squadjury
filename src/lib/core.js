// Gameweeks, standings and squads: the rules of SquadJury on top of D1.

import { standings, priorMean, voterWeight } from './rank.js';
import { openGameweek } from './fpl.js';

/** Makes sure the open gameweek has a row and locks every gameweek whose deadline passed. */
export async function syncGameweeks(env, fpl, now) {
  const open = openGameweek(fpl, now);
  const stmts = [];
  if (open) {
    stmts.push(
      env.DB.prepare(
        "INSERT INTO gameweeks (id, deadline, status) VALUES (?1, ?2, 'open') ON CONFLICT(id) DO UPDATE SET deadline = ?2 WHERE status = 'open'",
      ).bind(open.id, open.deadline),
    );
  }
  // Keep deadlines of other open rows in step with FPL (deadlines sometimes move).
  for (const e of fpl.events) {
    stmts.push(env.DB.prepare("UPDATE gameweeks SET deadline = ? WHERE id = ? AND status = 'open'").bind(Date.parse(e.deadline_time), e.id));
  }
  if (stmts.length) await env.DB.batch(stmts);
  const due = await env.DB.prepare("SELECT id FROM gameweeks WHERE status = 'open' AND deadline <= ?").bind(now).all();
  for (const { id } of due.results) await lockGameweek(env, id, now);
  return open;
}

/** Freezes the final standings of a gameweek into `results`. Safe to run twice. */
export async function lockGameweek(env, gw, now) {
  const { ranked } = await liveStandings(env, gw);
  const stmts = [env.DB.prepare('DELETE FROM results WHERE gw = ?').bind(gw)];
  for (const r of ranked) {
    stmts.push(
      env.DB.prepare('INSERT INTO results (gw, team_id, user_id, avg, votes, rank_score, rank) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(
        gw, r.id, r.user_id, r.avg, r.votes, r.rank_score, r.rank,
      ),
    );
  }
  stmts.push(env.DB.prepare("UPDATE gameweeks SET status = 'locked', locked_at = ? WHERE id = ?").bind(now, gw));
  await env.DB.batch(stmts);
  console.log(JSON.stringify({ msg: 'gameweek locked', gw, ranked: ranked.length }));
}

/** Current standings of a gameweek, computed from the votes. */
export async function liveStandings(env, gw) {
  const [rows, mean] = await env.DB.batch([
    env.DB.prepare(
      `SELECT t.id, t.user_id, t.share_key, t.vote_sum, t.vote_count, t.image_key, t.picks_json, t.captain_id, t.vice_id,
              u.nickname, u.x_handle, u.demo,
              COALESCE(SUM(v.score * vu.vote_weight), 0) AS wsum, COALESCE(SUM(vu.vote_weight), 0) AS wcnt,
              (SELECT COUNT(*) FROM votes j WHERE j.user_id = t.user_id AND j.gw = t.gw) AS judged
         FROM teams t
         JOIN users u ON u.id = t.user_id
         LEFT JOIN votes v ON v.team_id = t.id
         LEFT JOIN users vu ON vu.id = v.user_id
        WHERE t.gw = ? AND t.hidden = 0
        GROUP BY t.id`,
    ).bind(gw),
    env.DB.prepare('SELECT COUNT(*) AS n, AVG(score) AS avg FROM votes WHERE gw = ?').bind(gw),
  ]);
  const m = mean.results[0];
  const prior = priorMean(m.n, m.avg);
  const list = rows.results.map((r) => ({
    ...r,
    avg: r.vote_count ? r.vote_sum / r.vote_count : 0,
    wavg: r.wcnt ? r.wsum / r.wcnt : 0,
    votes: r.vote_count,
  }));
  return { ...standings(list, prior), prior, total: list.length };
}

/** Recomputes how much a voter's verdicts count (0.5 for people who only give 1 or 10). */
export async function refreshVoterWeight(env, userId) {
  const s = await env.DB.prepare('SELECT COUNT(*) AS n, SUM(CASE WHEN score IN (1, 10) THEN 1 ELSE 0 END) AS ext FROM votes WHERE user_id = ?')
    .bind(userId)
    .first();
  const w = voterWeight(s.n, s.ext || 0);
  await env.DB.prepare('UPDATE users SET vote_weight = ? WHERE id = ? AND vote_weight != ?').bind(w, userId, w).run();
}

export const avgOf = (t) => (t.vote_count ? Math.round((t.vote_sum / t.vote_count) * 10) / 10 : null);

/** Public shape of a squad. */
export function teamOut(t, extra = {}) {
  const picks = JSON.parse(t.picks_json);
  return {
    key: t.share_key,
    gw: t.gw,
    nickname: t.nickname,
    x: t.x_handle || null,
    demo: !!t.demo,
    picks,
    captain: t.captain_id,
    vice: t.vice_id,
    image: t.image_key ? `/u/${t.image_key}` : null,
    og: t.og_key ? `/u/${t.og_key}` : null,
    avg: avgOf(t),
    votes: t.vote_count,
    ...extra,
  };
}

/** Where a squad stands: rank, total and how many squads it beats. */
export async function placeOf(env, gw, teamId, locked) {
  if (locked) {
    const r = await env.DB.prepare('SELECT rank, avg, votes FROM results WHERE gw = ? AND team_id = ?').bind(gw, teamId).first();
    const total = await env.DB.prepare('SELECT COUNT(*) AS n FROM results WHERE gw = ?').bind(gw).first();
    if (!r) return { rank: null, total: total.n };
    return { rank: r.rank, total: total.n, better: total.n > 1 ? Math.round(((total.n - r.rank) / (total.n - 1)) * 100) : 100 };
  }
  const s = await liveStandings(env, gw);
  const me = s.ranked.find((r) => r.id === teamId);
  const pending = s.pending.find((r) => r.id === teamId);
  const n = s.ranked.length;
  if (me) return { rank: me.rank, total: n, better: n > 1 ? Math.round(((n - me.rank) / (n - 1)) * 100) : 100 };
  return { rank: null, total: n, needsVotes: pending?.needsVotes ?? 0, needsJudged: pending?.needsJudged ?? 0 };
}
