// Seasons. Gameweek numbers repeat every season (1 to 38), so inside the database a gameweek is
// stored as a key that also holds the season: 2026/27 GW7 is 202607. The API and the app keep
// talking in plain gameweek numbers; only the Worker converts. Every table that has a `gw`
// also has a readable `season` label ("2026-27").

/** Season of the FPL data: { year: 2026, base: 202600, label: '2026-27' }. */
export function seasonOf(fpl) {
  const first = fpl?.events?.[0]?.deadline_time;
  const d = first ? new Date(first) : new Date();
  // The first deadline is in August; anything before July belongs to the season that started the year before.
  const year = d.getUTCMonth() >= 6 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
  return { year, base: year * 100, label: `${year}-${String((year + 1) % 100).padStart(2, '0')}` };
}

/** Database key of gameweek `n` in a season. */
export const gwKey = (season, n) => season.base + Number(n);

/** Plain gameweek number (1 to 38) of a database key. */
export const gwNum = (key) => (key == null ? key : Number(key) % 100);

/** True when the key belongs to the season. */
export const inSeason = (season, key) => key > season.base && key < season.base + 100;

/** Season label of a database key: 202607 -> "2026-27". */
export function seasonLabel(key) {
  const year = Math.floor(Number(key) / 100);
  return `${year}-${String((year + 1) % 100).padStart(2, '0')}`;
}
