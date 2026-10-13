// Every badge in one place: id, group, name, how to get it and how far along a juror is.
// To add a badge, add a line here (and an icon in public/js/badge-icons.js).
// `value(stats)` reads the numbers from userStats(); a badge unlocks when value >= target.

export const GROUPS = ['Juror', 'Manager', 'Scout', 'Duels', 'Community'];

export const BADGES = [
  { id: 'first-verdict', group: 'Juror', name: 'First Verdict', desc: 'Give your first verdict.', target: 1, unit: 'verdicts', value: (s) => s.verdicts },
  { id: 'regular', group: 'Juror', name: 'Regular', desc: 'Give 50 verdicts.', target: 50, unit: 'verdicts', value: (s) => s.verdicts },
  { id: 'seasoned', group: 'Juror', name: 'Seasoned Juror', desc: 'Give 500 verdicts.', target: 500, unit: 'verdicts', value: (s) => s.verdicts },
  { id: 'first-whistle', group: 'Juror', name: 'First Whistle', desc: 'Be the first to judge a squad, 10 times.', target: 10, unit: 'squads', value: (s) => s.firsts },
  { id: 'tough-judge', group: 'Juror', name: 'Tough Judge', desc: 'Average verdict under 5.5 after at least 50 verdicts.', target: 1, value: (s) => (s.verdicts >= 50 && s.avgVerdict < 5.5 ? 1 : 0), progress: (s) => ({ value: Math.min(s.verdicts, 50), target: 50, unit: 'verdicts' }) },
  { id: 'generous-judge', group: 'Juror', name: 'Generous Judge', desc: 'Average verdict over 8 after at least 50 verdicts.', target: 1, value: (s) => (s.verdicts >= 50 && s.avgVerdict > 8 ? 1 : 0), progress: (s) => ({ value: Math.min(s.verdicts, 50), target: 50, unit: 'verdicts' }) },
  { id: 'streak-5', group: 'Juror', name: 'Streak 5', desc: 'Judge 5 squads in 5 gameweeks in a row.', target: 5, unit: 'gameweeks', value: (s) => s.bestStreak },
  { id: 'streak-10', group: 'Juror', name: 'Streak 10', desc: 'Judge 5 squads in 10 gameweeks in a row.', target: 10, unit: 'gameweeks', value: (s) => s.bestStreak },
  { id: 'on-the-pitch', group: 'Manager', name: 'On the Pitch', desc: 'Post your first squad.', target: 1, unit: 'squads', value: (s) => s.squads },
  { id: 'top-10', group: 'Manager', name: 'Top 10', desc: 'Finish a gameweek in the top 10.', target: 1, unit: 'times', value: (s) => s.top10 },
  { id: 'top-10-x3', group: 'Manager', name: 'Top 10 x3', desc: 'Finish in the top 10 in three gameweeks.', target: 3, unit: 'times', value: (s) => s.top10 },
  { id: 'number-one', group: 'Manager', name: 'Number One', desc: 'Finish a gameweek as #1.', target: 1, unit: 'times', value: (s) => s.wins },
  { id: 'crowd-favourite', group: 'Manager', name: 'Crowd Favourite', desc: 'Get 50 verdicts on one squad.', target: 50, unit: 'verdicts', value: (s) => s.maxVotes },
  { id: 'sharp-eye', group: 'Scout', name: 'Sharp Eye', desc: 'Scout score of 8 or more in a gameweek.', target: 8, unit: 'best score', value: (s) => s.bestScout },
  { id: 'oracle', group: 'Scout', name: 'Oracle', desc: 'Finish a gameweek in the top 10 scouts.', target: 1, unit: 'times', value: (s) => s.scoutTop10 },
  { id: 'duelist', group: 'Duels', name: 'Duelist', desc: 'Judge 100 duels.', target: 100, unit: 'duels', value: (s) => s.duels },
  { id: 'giant-killer', group: 'Duels', name: 'Giant Killer', desc: 'Your squad beats a top 3 squad in a duel.', target: 1, unit: 'times', value: (s) => s.giantKills },
  { id: 'recruiter', group: 'Community', name: 'Recruiter', desc: 'Bring 3 people who sign up with your link.', target: 3, unit: 'sign ups', value: (s) => s.recruits },
];

export const byId = new Map(BADGES.map((b) => [b.id, b]));

/** Progress of one badge: { value, target, unit, done }. */
export function progressOf(b, stats) {
  const v = Math.max(0, Number(b.value(stats)) || 0);
  const done = v >= b.target;
  if (b.progress && !done) return { ...b.progress(stats), done };
  return { value: Math.min(v, b.target), target: b.target, unit: b.unit || '', done };
}

/** Ids of the badges these stats unlock. */
export const unlocked = (stats) => BADGES.filter((b) => (Number(b.value(stats)) || 0) >= b.target).map((b) => b.id);

/**
 * Streak by gameweeks: a gameweek counts with at least 5 verdicts or duels.
 * order: every gameweek id in order. counts: Map(gw -> verdicts + duels). openId: the open gameweek.
 * The current streak stays alive while the open gameweek is still being played.
 */
export function streaks(order, counts, openId = null) {
  const ok = (gw) => (counts.get(gw) || 0) >= 5;
  let best = 0, run = 0;
  for (const gw of order) {
    run = ok(gw) ? run + 1 : 0;
    best = Math.max(best, run);
  }
  let i = order.length - 1;
  if (openId != null && order[i] === openId && !ok(openId)) i--; // not played yet this week
  let current = 0;
  for (; i >= 0 && ok(order[i]); i--) current++;
  return { current, best, thisGw: openId != null && ok(openId) };
}
