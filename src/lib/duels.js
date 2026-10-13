// Duels and league head to head: the maths, without the database.

export const START = 1500;
export const K = 24;
export const DUEL_LIMIT = 200; // duels per juror per gameweek
export const MIN_MS = 1000; // a pick faster than this does not count
export const MIN_DUELS = 5; // duels a squad needs to be listed by duel rating
export const H2H_MIN_MEMBERS = 4;
export const JURY_MIN_VOTES = 3; // duel votes between two squads to decide a jury result

/** Elo update. Returns the new ratings [a, b] after a beat b (aWon) or b beat a. */
export function elo(ra, rb, aWon, k = K) {
  const ea = 1 / (1 + 10 ** ((rb - ra) / 400));
  const sa = aWon ? 1 : 0;
  return [ra + k * (sa - ea), rb + k * (1 - sa - (1 - ea))];
}

/** A pair is stored with the lower team id first. */
export const pairKey = (x, y) => (x < y ? `${x}-${y}` : `${y}-${x}`);

/**
 * A juror who almost always picks the same side (top or bottom) is not judging the squads.
 * Returns the side that does not count any more, or null.
 */
export function biasedSide(total, first) {
  if (total < 10) return null;
  if (first / total >= 0.9) return 'first';
  if (first / total <= 0.1) return 'second';
  return null;
}

/**
 * Picks up to n pairs for a juror. teams: [{ id, elo, duels }]. done: Set of pairKey already judged.
 * Squads with fewer duels go first, each against the closest rating it has not met yet.
 * No squad appears twice in one batch.
 */
export function pickPairs(teams, done, n, rnd = Math.random) {
  const pool = [...teams].sort((a, b) => a.duels - b.duels || rnd() - 0.5);
  const used = new Set();
  const out = [];
  for (const a of pool) {
    if (out.length >= n) break;
    if (used.has(a.id)) continue;
    let best = null;
    for (const b of pool) {
      if (b.id === a.id || used.has(b.id) || done.has(pairKey(a.id, b.id))) continue;
      const gap = Math.abs(b.elo - a.elo) + b.duels * 2; // close ratings, and fresh squads
      if (!best || gap < best.gap) best = { b, gap };
    }
    if (!best) continue;
    used.add(a.id).add(best.b.id);
    out.push(rnd() < 0.5 ? [a.id, best.b.id] : [best.b.id, a.id]);
  }
  return out;
}

/**
 * Round robin fixtures for one round (circle method). ids: members in a fixed order.
 * With an odd number of members one plays "Average" (null). Every pair meets once
 * before any pair meets again.
 */
export function roundRobin(ids, round) {
  const list = [...ids];
  if (list.length % 2) list.push(null);
  const n = list.length;
  if (n < 2) return [];
  const r = round % (n - 1);
  // Keep the first fixed, rotate the others r times.
  const rest = list.slice(1);
  const rot = rest.slice(rest.length - r).concat(rest.slice(0, rest.length - r));
  const order = [list[0], ...rot];
  const out = [];
  for (let i = 0; i < n / 2; i++) {
    let home = order[i], away = order[n - 1 - i];
    if (home === null) [home, away] = [away, null];
    // Swap home and away every other round so nobody is always first.
    if (away !== null && r % 2 && i === 0) [home, away] = [away, home];
    out.push([home, away]);
  }
  return out;
}

const sign = (x) => (x > 0 ? 'H' : x < 0 ? 'A' : 'D');

/**
 * Result of one head to head match.
 * home/away: { posted, avg, points, votesWon } (away null = Average, given as avg/points of the league).
 * Returns { jury: { home, away, res, by }, points: { home, away, res } | null }.
 *   jury.by: 'duels' (duel votes between the two), 'rating' (too few duel votes) or 'forfeit'.
 */
export function h2hResult(home, away, { average = null, pointsReady = false } = {}) {
  const out = { jury: null, points: null };
  const vsAverage = away == null;
  const a = vsAverage ? { posted: average?.avg != null, avg: average?.avg ?? null, points: average?.points ?? null, votesWon: 0 } : away;
  if (!home.posted || !a.posted) {
    const res = home.posted ? 'H' : a.posted ? 'A' : 'N'; // N: nobody posted, both lose
    const score = res === 'H' ? [3, 0] : res === 'A' ? [0, 3] : [0, 0];
    out.jury = { home: score[0], away: score[1], res, by: 'forfeit' };
    if (pointsReady) out.points = { home: home.posted ? home.points : null, away: a.posted ? a.points : null, res };
    return out;
  }
  const votes = (home.votesWon || 0) + (a.votesWon || 0);
  if (!vsAverage && votes >= JURY_MIN_VOTES) {
    out.jury = { home: home.votesWon, away: a.votesWon, res: sign(home.votesWon - a.votesWon), by: 'duels' };
  } else {
    const ha = Math.round((home.avg ?? 0) * 10) / 10, aa = Math.round((a.avg ?? 0) * 10) / 10;
    out.jury = { home: vsAverage ? ha : home.votesWon || 0, away: vsAverage ? aa : a.votesWon || 0, res: sign(ha - aa), by: 'rating', homeAvg: ha, awayAvg: aa };
  }
  if (pointsReady && home.points != null && a.points != null) {
    const ap = Math.round(a.points);
    out.points = { home: home.points, away: ap, res: sign(home.points - ap) };
  }
  return out;
}

/** League table from match results: 3 for a win, 1 for a draw. kind: 'jury' or 'points'. */
export function h2hTable(matches, members, kind) {
  const row = new Map(members.map((id) => [id, { user_id: id, p: 0, w: 0, d: 0, l: 0, pts: 0, for: 0 }]));
  const add = (id, mine, theirs, res, homeSide) => {
    const r = row.get(id);
    if (!r) return;
    r.p++;
    const won = res === (homeSide ? 'H' : 'A'), drew = res === 'D';
    if (won) { r.w++; r.pts += 3; } else if (drew) { r.d++; r.pts += 1; } else r.l++;
    r.for += Number(mine) || 0;
  };
  for (const m of matches) {
    const x = m[kind];
    if (!x) continue;
    add(m.home_id, x.home, x.away, x.res, true);
    if (m.away_id != null) add(m.away_id, x.away, x.home, x.res, false);
  }
  return [...row.values()].sort((a, b) => b.pts - a.pts || b.w - a.w || b.for - a.for || a.user_id - b.user_id)
    .map((r, i) => ({ ...r, place: i + 1, for: Math.round(r.for * 10) / 10 }));
}
