import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCode, newCode, rerank, seasonTable } from '../../src/lib/leagues.js';

test('league codes: 6 easy characters, typed, spaced or as a whole link', () => {
  for (let i = 0; i < 50; i++) assert.match(newCode(), /^[A-HJKMNP-Z2-9]{6}$/);
  assert.equal(parseCode('k7p2qx'), 'K7P2QX');
  assert.equal(parseCode('K7P 2QX'), 'K7P2QX');
  assert.equal(parseCode('https://squadjury.com/l/K7P2QX?s=wa'), 'K7P2QX');
  assert.equal(parseCode('squadjury.com/l/k7p2qx'), 'K7P2QX');
  assert.equal(parseCode('K7P2'), null);
  assert.equal(parseCode(''), null);
});

test('a league table re-ranks from 1, keeping the order of the main leaderboard', () => {
  assert.deepEqual(rerank([{ id: 7, rank: 4 }, { id: 9, rank: 11 }]).map((r) => r.rank), [1, 2]);
});

test('league season: wins first, then podiums, then the average', () => {
  const results = [
    { gw: 202605, user_id: 1, rank: 3, avg: 8 }, { gw: 202605, user_id: 2, rank: 9, avg: 7 }, { gw: 202605, user_id: 3, rank: 20, avg: 6 },
    { gw: 202606, user_id: 2, rank: 1, avg: 9 }, { gw: 202606, user_id: 1, rank: 5, avg: 8.5 },
  ];
  const t = seasonTable(results);
  assert.deepEqual(t.map((r) => [r.user_id, r.wins, r.podiums, r.played]), [[1, 1, 2, 2], [2, 1, 2, 2], [3, 0, 1, 1]]);
  assert.equal(t[0].avg, 8.3);
  assert.equal(t[0].place, 1);
  assert.equal(t[0].sum, undefined);
});
