import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trueScores, verdictPoints, duelPoints, scoutScores, MIN_VERDICTS } from '../../../src/jury/lib/scouts.js';

test('true score: best 10, worst 1, evenly between, equal points share a place', () => {
  const rows = Array.from({ length: 10 }, (_, i) => ({ id: i + 1, points: 100 - i * 5 }));
  const t = trueScores(rows);
  assert.equal(t.get(1), 10);
  assert.equal(t.get(10), 1);
  assert.deepEqual([...t.values()], [10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
  const tie = trueScores([{ id: 1, points: 50 }, { id: 2, points: 50 }, { id: 3, points: 20 }]);
  assert.equal(tie.get(1), 10);
  assert.equal(tie.get(2), 10);
  assert.equal(tie.get(3), 1);
  assert.equal(trueScores([{ id: 1, points: 40 }]).get(1), 10);
});

test('a verdict scores 10, 8, 6, 3 or 0 by how far it is', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 9].map((d) => verdictPoints(5 + (d > 4 ? 4 : d), 5)), [10, 8, 6, 3, 0, 0]);
  assert.equal(verdictPoints(2, 4), 6);
});

test('a duel pick scores 5 when the picked squad scored more', () => {
  assert.equal(duelPoints(60, 50), 5);
  assert.equal(duelPoints(40, 50), 0);
  assert.equal(duelPoints(50, 50), null);
  assert.equal(duelPoints(null, 50), null);
});

test('scout score: average of the items, only with 10 verdicts, ranked', () => {
  const points = new Map(Array.from({ length: 12 }, (_, i) => [i + 1, 100 - i * 6]));
  const truth = trueScores([...points].map(([id, p]) => ({ id, points: p })));
  const votes = [];
  // Juror 1 gives every squad its true score, juror 2 always 5, juror 3 only 5 verdicts.
  for (let id = 1; id <= 12; id++) {
    votes.push({ user_id: 1, team_id: id, score: truth.get(id) });
    votes.push({ user_id: 2, team_id: id, score: 5 });
    if (id <= 5) votes.push({ user_id: 3, team_id: id, score: 10 });
  }
  const duels = [{ user_id: 1, a_id: 1, b_id: 2, winner_id: 1 }, { user_id: 2, a_id: 1, b_id: 2, winner_id: 2 }];
  const s = scoutScores(votes, duels, points);
  assert.equal(s.length, 2);
  assert.ok(!s.some((x) => x.user_id === 3), `needs ${MIN_VERDICTS} verdicts`);
  const one = s.find((x) => x.user_id === 1), two = s.find((x) => x.user_id === 2);
  assert.equal(one.rank, 1);
  assert.equal(one.score, Math.round(((12 * 10 + 5) / 13) * 100) / 100);
  assert.equal(two.rank, 2);
  assert.ok(two.score < 6, 'the same verdict for everyone does not score well');
  assert.equal(one.total, 2);
  assert.equal(one.duels, 1);
});
