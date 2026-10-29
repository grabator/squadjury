// Real FPL points of a squad after a gameweek, from the official live data.
// First version without chips: the starting XI, the captain doubled (the vice when the captain
// did not play) and automatic substitutions from the bench in order, keeping a valid formation
// (1 goalkeeper, at least 3 defenders, 2 midfielders and 1 forward), the same rules as FPL.

const MIN = { 2: 3, 3: 2, 4: 1 };

/**
 * picks: [{ id, bench }] in FPL order (XI first, then the bench: keeper, then outfield 1 to 3).
 * live: Map(id -> { points, minutes }). pos: Map(id -> element_type 1..4).
 * Returns { points, xi: [ids that counted], subs: [{ out, in }], captain: id that was doubled }.
 */
export function squadPoints(picks, captain, vice, live, pos) {
  const stat = (id) => live.get(id) || { points: 0, minutes: 0 };
  const played = (id) => stat(id).minutes > 0;
  let xi = picks.filter((p) => !p.bench).map((p) => p.id);
  const bench = picks.filter((p) => p.bench).map((p) => p.id);
  const subs = [];
  const count = (ids, t) => ids.filter((id) => pos.get(id) === t).length;

  // Goalkeeper: only the bench keeper can come in.
  const gk = xi.find((id) => pos.get(id) === 1);
  const benchGk = bench.find((id) => pos.get(id) === 1);
  if (gk && !played(gk) && benchGk && played(benchGk)) {
    xi = xi.map((id) => (id === gk ? benchGk : id));
    subs.push({ out: gk, in: benchGk });
  }
  // Outfield: bench players in order, each replacing the first non-playing starter they can.
  const used = new Set(subs.map((s) => s.in));
  for (const b of bench.filter((id) => pos.get(id) !== 1)) {
    if (!played(b) || used.has(b)) continue;
    const out = xi.find((id) => {
      if (pos.get(id) === 1 || played(id)) return false;
      const next = xi.map((x) => (x === id ? b : x));
      return [2, 3, 4].every((t) => count(next, t) >= MIN[t]);
    });
    if (out == null) continue;
    xi = xi.map((id) => (id === out ? b : id));
    subs.push({ out, in: b });
    used.add(b);
  }

  let doubled = null;
  if (captain && xi.includes(captain) && played(captain)) doubled = captain;
  else if (vice && xi.includes(vice) && played(vice)) doubled = vice;
  const points = xi.reduce((sum, id) => sum + stat(id).points * (id === doubled ? 2 : 1), 0);
  return { points, xi, subs, captain: doubled };
}

/** Live data from FPL's /api/event/{gw}/live/ as a Map(id -> { points, minutes }). */
export function liveMap(data) {
  return new Map((data?.elements || []).map((e) => [e.id, { points: e.stats?.total_points ?? 0, minutes: e.stats?.minutes ?? 0 }]));
}

/** Points of a verified squad from FPL's /api/entry/{id}/event/{gw}/picks/: gameweek points minus hits. */
export function entryPoints(data) {
  const h = data?.entry_history;
  if (!h || typeof h.points !== 'number') return null;
  return h.points - (h.event_transfers_cost || 0);
}

/**
 * How the jury did on one squad: compares its place by verdict with its place by points.
 * 'over' when the jury put it clearly higher than the points did, 'under' the other way, else 'spot'.
 */
export function juryCall(juryRank, pointsRank, total) {
  if (!juryRank || !pointsRank || total < 3) return null;
  const gap = (pointsRank - juryRank) / total;
  if (gap > 0.25) return 'over';
  if (gap < -0.25) return 'under';
  return 'spot';
}

/** Places by points (1 = most points); equal points share a place. rows: [{ id, points }]. */
export function pointsRanks(rows) {
  const sorted = rows.filter((r) => r.points != null).sort((a, b) => b.points - a.points);
  const out = new Map();
  sorted.forEach((r, i) => out.set(r.id, i && sorted[i - 1].points === r.points ? out.get(sorted[i - 1].id) : i + 1));
  return out;
}
