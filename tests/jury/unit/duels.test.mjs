import { test } from 'node:test';
import assert from 'node:assert/strict';
import { elo, pairKey, biasedSide, pickPairs, roundRobin, h2hResult, h2hTable } from '../../../src/jury/lib/duels.js';

test('Elo: equal ratings move 12 points with K 24, the total stays the same', () => {
  const [a, b] = elo(1500, 1500, true);
  assert.equal(a, 1512);
  assert.equal(b, 1488);
  const [c, d] = elo(1600, 1400, false);
  assert.ok(c < 1600 && d > 1400);
  assert.ok(Math.abs(c + d - 3000) < 1e-9);
  // An upset moves more than an expected win.
  assert.ok(1600 - c > elo(1600, 1400, true)[0] - 1600);
});

test('a pair is the same whichever squad comes first', () => {
  assert.equal(pairKey(9, 3), '3-9');
  assert.equal(pairKey(3, 9), '3-9');
});

test('always the same side does not count, a mix does', () => {
  assert.equal(biasedSide(9, 9), null);
  assert.equal(biasedSide(10, 9), 'first');
  assert.equal(biasedSide(20, 1), 'second');
  assert.equal(biasedSide(20, 10), null);
});

test('pairs: no squad twice, no repeated pair, close ratings and fresh squads first', () => {
  const teams = [
    { id: 1, elo: 1500, duels: 0 }, { id: 2, elo: 1510, duels: 0 }, { id: 3, elo: 1700, duels: 9 },
    { id: 4, elo: 1690, duels: 9 }, { id: 5, elo: 1300, duels: 2 },
  ];
  const rnd = () => 0.9;
  const pairs = pickPairs(teams, new Set(), 3, rnd);
  const ids = pairs.flat();
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(pairs[0].slice().sort(), [1, 2]);
  const again = pickPairs(teams, new Set(['1-2']), 3, rnd);
  assert.ok(!again.some((p) => pairKey(p[0], p[1]) === '1-2'));
  assert.deepEqual(pickPairs([{ id: 1, elo: 1500, duels: 0 }], new Set(), 3), []);
});

test('round robin: every member meets every other once in n-1 rounds', () => {
  for (const n of [4, 5, 6, 7, 10]) {
    const ids = Array.from({ length: n }, (_, i) => i + 1);
    const rounds = n % 2 ? n : n - 1;
    const met = new Map();
    for (let r = 0; r < rounds; r++) {
      const fx = roundRobin(ids, r);
      const seen = fx.flat().filter((x) => x != null);
      assert.equal(new Set(seen).size, seen.length, `round ${r} of ${n}: someone plays twice`);
      assert.equal(seen.length, n);
      for (const [h, a] of fx) if (a != null) met.set(pairKey(h, a), (met.get(pairKey(h, a)) || 0) + 1);
      if (n % 2) assert.equal(fx.filter(([, a]) => a == null).length, 1);
    }
    assert.equal(met.size, (n * (n - 1)) / 2, `${n} members`);
    assert.ok([...met.values()].every((v) => v === 1));
  }
});

test('H2H jury result: duel votes decide, too few votes fall back to the rating', () => {
  const p = (votesWon, avg, points = null) => ({ posted: true, votesWon, avg, points });
  assert.deepEqual(h2hResult(p(2, 6), p(1, 8)).jury, { home: 2, away: 1, res: 'H', by: 'duels' });
  const few = h2hResult(p(1, 6), p(1, 8)).jury;
  assert.equal(few.by, 'rating');
  assert.equal(few.res, 'A');
  assert.equal(h2hResult(p(3, 6), p(3, 9)).jury.res, 'D');
});

test('H2H: no squad by the deadline loses 0:3, points come after the gameweek', () => {
  const p = (posted, points) => ({ posted, votesWon: 0, avg: 7, points });
  const r = h2hResult(p(true, 52), p(false, null), { pointsReady: true });
  assert.deepEqual([r.jury.home, r.jury.away, r.jury.res], [3, 0, 'H']);
  assert.equal(r.points.res, 'H');
  const both = h2hResult(p(false), p(false));
  assert.equal(both.jury.res, 'N');
  const pts = h2hResult({ posted: true, votesWon: 2, avg: 7, points: 52 }, { posted: true, votesWon: 1, avg: 7, points: 61 }, { pointsReady: true });
  assert.deepEqual(pts.points, { home: 52, away: 61, res: 'A' });
  assert.equal(h2hResult(p(true, 52), p(true, 40)).points, null);
});

test('H2H against Average uses the league average', () => {
  const r = h2hResult({ posted: true, votesWon: 0, avg: 7.4, points: 60 }, null, { average: { avg: 7.1, points: 55.4 }, pointsReady: true });
  assert.equal(r.jury.res, 'H');
  assert.equal(r.points.away, 55);
  assert.equal(r.points.res, 'H');
});

test('H2H table: 3 for a win, 1 for a draw, Average is not in the table', () => {
  const m = (home_id, away_id, res) => ({ home_id, away_id, jury: { home: 1, away: 1, res } });
  const table = h2hTable([m(1, 2, 'H'), m(3, null, 'A'), m(1, 3, 'D'), m(2, 3, 'A')], [1, 2, 3], 'jury');
  const by = Object.fromEntries(table.map((r) => [r.user_id, r]));
  assert.equal(by[1].pts, 4);
  assert.equal(by[3].pts, 4);
  assert.equal(by[2].pts, 0);
  assert.equal(by[3].l, 1);
  assert.equal(table.length, 3);
  assert.equal(table[2].user_id, 2);
});
