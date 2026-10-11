import { test } from 'node:test';
import assert from 'node:assert/strict';
import { norm, lev, buildIndex, lookup, validate } from '../../public/js/ocr/match.js';

const players = [
  { id: 1, web_name: 'Ødegaard', team: 1, element_type: 3 },
  { id: 2, web_name: 'Gibbs-White', team: 2, element_type: 3 },
  { id: 3, web_name: 'Van Hecke', team: 3, element_type: 2 },
  { id: 4, web_name: 'Eze', team: 1, element_type: 3 },
  { id: 5, web_name: 'Haaland', team: 4, element_type: 4 },
];

test('norm strips accents, symbols and case', () => {
  assert.equal(norm('Ødegaard'), 'odegaard');
  assert.equal(norm('Gibbs-White'), 'gibbswhite');
  assert.equal(norm('Van Hecke'), 'vanhecke');
  assert.equal(norm('Müller'), 'muller');
});

test('lev counts edits', () => {
  assert.equal(lev('haaland', 'haaland'), 0);
  assert.equal(lev('haa1and', 'haaland'), 1);
  assert.equal(lev('abc', 'xyz', 1), 2);
});

test('lookup finds exact and slightly misread names', () => {
  const idx = buildIndex(players);
  assert.equal(lookup(idx, 'Odegaard').players[0].id, 1);
  assert.equal(lookup(idx, 'Gibbs-Vhite').players[0].id, 2);
  assert.equal(lookup(idx, 'Van Hecke').players[0].id, 3);
  assert.equal(lookup(idx, 'Eze').players[0].id, 4);
  assert.equal(lookup(idx, 'Ezo'), null, 'short names must match exactly');
  assert.equal(lookup(idx, 'Emirates'), null);
});

test('validate checks squad shape and clubs', () => {
  const mk = (pos, team, bench = false) => ({ id: Math.random(), pos, team, bench });
  const good = [mk(1, 1), mk(2, 2), mk(2, 3), mk(2, 4), mk(3, 5), mk(3, 6), mk(3, 7), mk(3, 8), mk(4, 9), mk(4, 10), mk(4, 11), mk(1, 12, true), mk(2, 13, true), mk(2, 14, true), mk(3, 15, true)];
  assert.equal(validate(good, { teams: [] }).ok, true);
  const four = good.map((p, i) => (i < 4 ? { ...p, team: 1 } : p));
  assert.equal(validate(four, { teams: [] }).problems[0].code, 'club');
  assert.equal(validate(good.slice(0, 14), { teams: [] }).ok, false);
});
