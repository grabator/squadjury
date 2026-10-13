import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seasonOf, gwKey, gwNum, inSeason, seasonLabel } from '../../src/lib/season.js';

const fpl = (first) => ({ events: [{ id: 1, deadline_time: first }] });

test('the season comes from the first deadline', () => {
  assert.deepEqual(seasonOf(fpl('2026-08-21T17:30:00Z')), { year: 2026, base: 202600, label: '2026-27' });
  assert.deepEqual(seasonOf(fpl('2027-08-13T17:30:00Z')), { year: 2027, base: 202700, label: '2027-28' });
  // A first deadline in spring belongs to the season that started the year before.
  assert.equal(seasonOf(fpl('2030-02-01T12:00:00Z')).label, '2029-30');
});

test('the same gameweek number in a new season is a different key', () => {
  const now = seasonOf(fpl('2026-08-21T17:30:00Z'));
  const next = seasonOf(fpl('2027-08-13T17:30:00Z'));
  assert.equal(gwKey(now, 1), 202601);
  assert.equal(gwKey(next, 1), 202701);
  assert.notEqual(gwKey(now, 1), gwKey(next, 1));
  assert.equal(gwNum(202701), 1);
  assert.equal(gwNum(202638), 38);
  assert.ok(inSeason(now, 202607));
  assert.ok(!inSeason(now, 202707));
  assert.equal(seasonLabel(202707), '2027-28');
});
