// Scout points: a verdict is also a forecast. After the gameweek every squad gets a "true score"
// from 1 to 10 by its place in real points, and each verdict is scored by how close it was.

export const MIN_VERDICTS = 10; // verdicts a juror needs in a gameweek to get a scout score
export const MIN_TEAMS = 10; // squads with points a gameweek needs before scouts are scored
const BY_GAP = [10, 8, 6, 3]; // points for a verdict 0, 1, 2 or 3 away from the true score
export const DUEL_POINTS = 5;

/**
 * True score of every squad: the best by points gets 10, the worst 1, evenly in between.
 * Equal points share the better place. rows: [{ id, points }]. Returns Map(id -> 1..10).
 */
export function trueScores(rows) {
  const list = rows.filter((r) => r.points != null).sort((a, b) => b.points - a.points);
  const n = list.length;
  const out = new Map();
  let place = 0;
  list.forEach((r, i) => {
    if (!i || list[i - 1].points !== r.points) place = i;
    out.set(r.id, n === 1 ? 10 : Math.round(10 - (9 * place) / (n - 1)));
  });
  return out;
}

/** Points for one verdict. */
export function verdictPoints(score, truth) {
  return BY_GAP[Math.abs(score - truth)] ?? 0;
}

/** Points for one duel pick: 5 when the picked squad scored more, 0 when less, null for a tie. */
export function duelPoints(pickedPoints, otherPoints) {
  if (pickedPoints == null || otherPoints == null || pickedPoints === otherPoints) return null;
  return pickedPoints > otherPoints ? DUEL_POINTS : 0;
}

/**
 * Scout scores of a gameweek.
 * votes: [{ user_id, team_id, score }], duels: [{ user_id, a_id, b_id, winner_id }],
 * points: Map(team id -> points). Returns [{ user_id, score, verdicts, duels, rank, total }],
 * only for jurors with at least MIN_VERDICTS verdicts on squads that have points.
 */
export function scoutScores(votes, duels, points) {
  const truth = trueScores([...points].map(([id, p]) => ({ id, points: p })));
  const by = new Map();
  const get = (u) => by.get(u) || by.set(u, { user_id: u, sum: 0, items: 0, verdicts: 0, duels: 0 }).get(u);
  for (const v of votes) {
    const tr = truth.get(v.team_id);
    if (tr == null) continue;
    const s = get(v.user_id);
    s.sum += verdictPoints(v.score, tr);
    s.items++;
    s.verdicts++;
  }
  for (const d of duels) {
    const other = d.winner_id === d.a_id ? d.b_id : d.a_id;
    const p = duelPoints(points.get(d.winner_id), points.get(other));
    if (p == null) continue;
    const s = get(d.user_id);
    s.sum += p;
    s.items++;
    s.duels++;
  }
  const scored = [...by.values()].filter((s) => s.verdicts >= MIN_VERDICTS)
    .map((s) => ({ user_id: s.user_id, score: Math.round((s.sum / s.items) * 100) / 100, verdicts: s.verdicts, duels: s.duels }))
    .sort((a, b) => b.score - a.score || b.verdicts - a.verdicts || a.user_id - b.user_id);
  let rank = 0;
  scored.forEach((s, i) => {
    if (!i || scored[i - 1].score !== s.score) rank = i + 1;
    s.rank = rank;
    s.total = scored.length;
  });
  return scored;
}
