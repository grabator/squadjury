import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rankScore, standings, voterWeight, priorMean, judgeTarget } from '../../../src/jury/lib/rank.js';

const r2 = (x) => Math.round(x * 100) / 100;

test('Graba 8.7 (20) beats Neko 10 (1)', () => {
  assert.equal(r2(rankScore(8.7, 20)), 8.36);
  assert.equal(r2(rankScore(10, 1)), 7.5);
});

test('Graba 9.5 (30) beats Neko 10 (5)', () => {
  assert.equal(r2(rankScore(9.5, 30)), 9.14);
  assert.equal(r2(rankScore(10, 5)), 8.5);
});

test('Neko needs 13 straight 10s to pass Graba 9.5 (30)', () => {
  assert.ok(rankScore(10, 12) < rankScore(9.5, 30));
  assert.ok(rankScore(10, 13) > rankScore(9.5, 30));
});

test('standings: 5 verdicts and 5 judged squads to be ranked', () => {
  const { ranked, pending } = standings(
    [
      { id: 1, avg: 8.7, votes: 20, judged: 9 },
      { id: 2, avg: 10, votes: 1, judged: 9 },
      { id: 3, avg: 9.5, votes: 30, judged: 2 },
      { id: 4, avg: 7, votes: 6, judged: 5 },
      { id: 5, avg: 6, votes: 0, judged: 0 },
      { id: 6, avg: 6, votes: 0, judged: 0 },
    ],
    7,
  );
  assert.deepEqual(ranked.map((r) => [r.id, r.rank]), [[1, 1], [4, 2]]);
  assert.deepEqual(pending.map((r) => [r.id, r.needsVotes, r.needsJudged]), [[3, 0, 3], [2, 4, 0], [5, 5, 5], [6, 5, 5]]);
});

test('with only a few squads, judging every other squad is enough', () => {
  // 4 squads: an owner can judge at most 3 others, so 3 is the target, not 5.
  const rows = [
    { id: 1, avg: 8.8, votes: 5, judged: 3 },
    { id: 2, avg: 8.5, votes: 5, judged: 1 },
    { id: 3, avg: 9.5, votes: 2, judged: 3 },
    { id: 4, avg: 0, votes: 0, judged: 0 },
  ];
  const { ranked, pending } = standings(rows, 7);
  assert.deepEqual(ranked.map((r) => r.id), [1]);
  assert.deepEqual(pending.map((r) => [r.id, r.needsVotes, r.needsJudged]), [[2, 0, 2], [3, 3, 0], [4, 5, 3]]);
  assert.equal(judgeTarget(1), 0);
  assert.equal(judgeTarget(4), 3);
  assert.equal(judgeTarget(40), 5);
});

test('ties go to the squad with more verdicts', () => {
  const { ranked } = standings([{ id: 1, avg: 8, votes: 10, judged: 5 }, { id: 2, avg: 8, votes: 10, judged: 5 }, { id: 3, avg: 7.5, votes: 40, judged: 5 }], 7.5);
  assert.equal(ranked[0].id, 1);
});

test('voters who only give 1 or 10 count half', () => {
  assert.equal(voterWeight(12, 12), 0.5);
  assert.equal(voterWeight(12, 6), 1);
  assert.equal(voterWeight(5, 5), 1);
});

test('the prior is 7.0 until a gameweek has 50 votes', () => {
  assert.equal(priorMean(10, 8.4), 7);
  assert.equal(priorMean(60, 8.4), 8.4);
});
