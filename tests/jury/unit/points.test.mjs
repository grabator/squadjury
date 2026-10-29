import { test } from 'node:test';
import assert from 'node:assert/strict';
import { squadPoints, liveMap, entryPoints, juryCall, pointsRanks } from '../../../src/jury/lib/points.js';

// XI: GK 1, DEF 2-5, MID 6-9, FWD 10-11. Bench: GK 12, DEF 13, MID 14, FWD 15.
const pos = new Map([[1, 1], [2, 2], [3, 2], [4, 2], [5, 2], [6, 3], [7, 3], [8, 3], [9, 3], [10, 4], [11, 4], [12, 1], [13, 2], [14, 3], [15, 4]]);
const picks = Array.from({ length: 15 }, (_, i) => ({ id: i + 1, bench: i >= 11 }));
const live = (over = {}) => new Map(Array.from({ length: 15 }, (_, i) => [i + 1, { points: 2, minutes: 90, ...(over[i + 1] || {}) }]));

test('the XI counts, the captain doubles', () => {
  const r = squadPoints(picks, 10, 9, live({ 10: { points: 12 } }), pos);
  assert.equal(r.points, 2 * 10 + 12 * 2);
  assert.equal(r.captain, 10);
  assert.deepEqual(r.subs, []);
});

test('the vice doubles when the captain does not play', () => {
  const r = squadPoints(picks, 10, 9, live({ 10: { points: 0, minutes: 0 }, 9: { points: 6 } }), pos);
  assert.equal(r.captain, 9);
  // The first outfield player on the bench (a defender, 2 points) comes in for the captain, the vice doubles.
  assert.deepEqual(r.subs, [{ out: 10, in: 13 }]);
  assert.equal(r.points, 2 * 9 + 6 * 2 + 2);
});

test('bench players come in by order, never breaking the formation', () => {
  // Two defenders miss: with 4 at the back, the first outfield sub (defender 13) can replace one,
  // the midfielder 14 can replace the other (3 defenders left is still fine).
  const r = squadPoints(picks, 10, 9, live({ 2: { minutes: 0, points: 0 }, 3: { minutes: 0, points: 0 } }), pos);
  assert.deepEqual(r.subs, [{ out: 2, in: 13 }, { out: 3, in: 14 }]);
  // A 3 at the back team losing a defender can only bring on a defender.
  const p3 = [1, 2, 3, 4, 6, 7, 8, 9, 5, 10, 11].map((id) => ({ id, bench: false })).concat([12, 14, 13, 15].map((id) => ({ id, bench: true })));
  const pos3 = new Map(pos); pos3.set(5, 3);
  const r3 = squadPoints(p3, 10, 9, live({ 2: { minutes: 0, points: 0 } }), pos3);
  assert.deepEqual(r3.subs, [{ out: 2, in: 13 }]);
});

test('the keeper is only replaced by the bench keeper', () => {
  const r = squadPoints(picks, 10, 9, live({ 1: { minutes: 0, points: 0 }, 12: { points: 7 } }), pos);
  assert.deepEqual(r.subs[0], { out: 1, in: 12 });
  const none = squadPoints(picks, 10, 9, live({ 1: { minutes: 0, points: 0 }, 12: { minutes: 0, points: 0 } }), pos);
  assert.equal(none.subs.length, 0);
});

test('FPL live data, verified entries with hits, and the jury call', () => {
  const m = liveMap({ elements: [{ id: 5, stats: { total_points: 9, minutes: 77 } }] });
  assert.deepEqual(m.get(5), { points: 9, minutes: 77 });
  assert.equal(entryPoints({ entry_history: { points: 70, event_transfers_cost: 4 } }), 66);
  assert.equal(entryPoints({}), null);
  assert.equal(juryCall(1, 9, 10), 'over');
  assert.equal(juryCall(9, 1, 10), 'under');
  assert.equal(juryCall(3, 4, 10), 'spot');
  assert.equal(juryCall(1, 2, 2), null);
  assert.deepEqual([...pointsRanks([{ id: 'a', points: 50 }, { id: 'b', points: 70 }, { id: 'c', points: 50 }]).entries()], [['b', 1], ['a', 2], ['c', 2]]);
});
