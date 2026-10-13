import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BADGES, GROUPS, progressOf, unlocked, streaks, byId } from '../../src/lib/badges.js';

const base = { verdicts: 0, firsts: 0, avgVerdict: 0, bestStreak: 0, squads: 0, top10: 0, wins: 0, maxVotes: 0, bestScout: 0, scoutTop10: 0, duels: 0, giantKills: 0, recruits: 0 };

test('18 badges, unique ids, every group used, every badge has a name and a description', () => {
  assert.equal(BADGES.length, 18);
  assert.equal(new Set(BADGES.map((b) => b.id)).size, 18);
  for (const g of GROUPS) assert.ok(BADGES.some((b) => b.group === g), g);
  for (const b of BADGES) assert.ok(b.name && b.desc && GROUPS.includes(b.group), b.id);
  assert.deepEqual(unlocked(base), []);
});

test('verdict badges unlock at 1, 50 and 500', () => {
  assert.deepEqual(unlocked({ ...base, verdicts: 1 }), ['first-verdict']);
  assert.ok(unlocked({ ...base, verdicts: 50, avgVerdict: 7 }).includes('regular'));
  const p = progressOf(byId.get('seasoned'), { ...base, verdicts: 31 });
  assert.deepEqual(p, { value: 31, target: 500, unit: 'verdicts', done: false });
});

test('tough and generous judges need 50 verdicts first', () => {
  assert.ok(!unlocked({ ...base, verdicts: 49, avgVerdict: 4 }).includes('tough-judge'));
  assert.ok(unlocked({ ...base, verdicts: 50, avgVerdict: 5.4 }).includes('tough-judge'));
  assert.ok(unlocked({ ...base, verdicts: 60, avgVerdict: 8.2 }).includes('generous-judge'));
  assert.deepEqual(progressOf(byId.get('tough-judge'), { ...base, verdicts: 20, avgVerdict: 4 }), { value: 20, target: 50, unit: 'verdicts', done: false });
});

test('streak: 5 verdicts or duels per gameweek in a row, the open week does not break it', () => {
  const order = [1, 2, 3, 4, 5, 6, 7];
  const counts = new Map([[1, 5], [2, 9], [3, 2], [4, 5], [5, 6], [6, 12], [7, 1]]);
  assert.deepEqual(streaks(order, counts, 7), { current: 3, best: 3, thisGw: false });
  counts.set(7, 5);
  assert.deepEqual(streaks(order, counts, 7), { current: 4, best: 4, thisGw: true });
  // A missed finished week resets the current streak, the best stays.
  assert.deepEqual(streaks([1, 2, 3, 4], new Map([[1, 5], [2, 5], [3, 5]]), null), { current: 0, best: 3, thisGw: false });
});
