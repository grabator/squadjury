// Private leagues: invite codes, names and the league tables (built from the same verdicts as
// the main leaderboard, only filtered to the members, so friends cannot boost each other).

import { fail } from './http.js';
import { checkText } from './auth.js';

export const MAX_LEAGUES_PER_USER = 10;
export const MAX_MEMBERS = 200;
export const NEW_LEAGUES_PER_DAY = 5;

// No 0/O, 1/I/L: a code read out loud or typed from a screenshot should never be ambiguous.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function newCode() {
  const b = crypto.getRandomValues(new Uint8Array(6));
  return [...b].map((x) => ALPHABET[x % ALPHABET.length]).join('');
}

/** A code from what was typed or pasted: "k7p2qx", "K7P2 QX" or a whole squadjury.com/l/K7P2QX link. */
export function parseCode(input) {
  const s = String(input || '').trim();
  const fromLink = s.match(/\/l\/([A-Za-z0-9]{6})(?:[/?#]|$)/);
  const code = (fromLink ? fromLink[1] : s.replace(/[\s-]/g, '')).toUpperCase();
  return /^[A-Z0-9]{6}$/.test(code) ? code : null;
}

/** League names: 3 to 30 characters, no offensive words. */
export function checkLeagueName(name) {
  const n = String(name || '').replace(/\s+/g, ' ').trim();
  if (n.length < 3 || n.length > 30) fail(400, 'league_name_length');
  checkText(n, 'league_name_blocked');
  return n;
}

/** Re-ranks rows that are already in order (1, 2, 3 within the league). */
export const rerank = (rows) => rows.map((r, i) => ({ ...r, rank: i + 1 }));

/**
 * Season table of a league from the final results of each finished gameweek.
 * results: [{ gw, user_id, rank, avg }] for members only. Per member: gameweeks played,
 * league wins (best in the league that week), podiums and average verdict.
 */
export function seasonTable(results) {
  const byGw = new Map();
  for (const r of results) (byGw.get(r.gw) || byGw.set(r.gw, []).get(r.gw)).push(r);
  const users = new Map();
  for (const rows of byGw.values()) {
    rows.sort((a, b) => a.rank - b.rank).forEach((r, i) => {
      const u = users.get(r.user_id) || users.set(r.user_id, { user_id: r.user_id, played: 0, wins: 0, podiums: 0, sum: 0 }).get(r.user_id);
      u.played++;
      u.sum += r.avg;
      if (i === 0) u.wins++;
      if (i < 3) u.podiums++;
    });
  }
  return [...users.values()]
    .map(({ sum, ...u }) => ({ ...u, avg: Math.round((sum / u.played) * 10) / 10 }))
    .sort((a, b) => b.wins - a.wins || b.podiums - a.podiums || b.avg - a.avg || b.played - a.played)
    .map((u, i) => ({ ...u, place: i + 1 }));
}
