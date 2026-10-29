// Leaderboard maths. A squad with a handful of votes should not beat one with many,
// so every average is pulled towards the gameweek mean (C) with the weight of M votes.

export const M = 5; // weight of the prior, in votes
export const MIN_VOTES = 5; // verdicts a squad needs to be ranked
export const MIN_JUDGED = 5; // squads the owner must judge to be ranked
export const FALLBACK_MEAN = 7.0; // prior used while a gameweek has few votes
export const MEAN_MIN_VOTES = 50; // votes needed before the real gameweek mean is used

/** Squads an owner must judge: MIN_JUDGED, or every other squad while there are fewer. */
export function judgeTarget(squads) {
  return Math.max(0, Math.min(MIN_JUDGED, squads - 1));
}

/** Bayesian average: (v * avg + M * C) / (v + M). */
export function rankScore(avg, votes, mean = FALLBACK_MEAN, m = M) {
  if (!votes) return mean;
  return (votes * avg + m * mean) / (votes + m);
}

/** The prior for a gameweek: its real mean once there are enough votes. */
export function priorMean(totalVotes, avgOfAll) {
  return totalVotes >= MEAN_MIN_VOTES && Number.isFinite(avgOfAll) ? avgOfAll : FALLBACK_MEAN;
}

/** Voters who almost always give 1 or 10 count half. */
export function voterWeight(count, extremes) {
  return count >= 10 && extremes / count >= 0.9 ? 0.5 : 1;
}

/**
 * Sorts rows into a leaderboard.
 * rows: [{ id, avg (shown), wavg (weighted, for ranking), votes, judged }]
 * Returns { ranked: [...with rank, rank_score], pending: [...with needs] }.
 */
export function standings(rows, mean) {
  const ranked = [], pending = [];
  const minJudged = judgeTarget(rows.length);
  for (const r of rows) {
    const needsVotes = Math.max(0, MIN_VOTES - r.votes);
    const needsJudged = Math.max(0, minJudged - (r.judged ?? minJudged));
    const score = rankScore(r.wavg ?? r.avg, r.votes, mean);
    if (needsVotes || needsJudged) pending.push({ ...r, rank_score: score, needsVotes, needsJudged });
    else ranked.push({ ...r, rank_score: score });
  }
  ranked.sort((a, b) => b.rank_score - a.rank_score || b.votes - a.votes || a.id - b.id);
  ranked.forEach((r, i) => (r.rank = i + 1));
  pending.sort((a, b) => b.votes - a.votes || a.id - b.id);
  return { ranked, pending };
}
