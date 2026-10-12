import { test } from 'node:test';
import assert from 'node:assert/strict';
import { t } from '../../public/js/i18n.js';

// X counts every link as 23 characters and emoji as 2.
const xLength = (s) => [...s.replace(/https?:\/\/\S+/g, 'x'.repeat(23))].reduce((n, ch) => n + (ch.codePointAt(0) > 0xffff || /\p{Extended_Pictographic}/u.test(ch) ? 2 : 1), 0);

test('every X post fits in 280 characters with the longest values', () => {
  const worst = { gw: 38, score: '10.0', votes: 99999, rank: 99999, total: 99999, link: 'https://squadjury.com/t/AbCdEfGhIjKl' };
  for (const k of ['x.posted', 'x.scored', 'x.top10', 'x.champion', 'x.invite', 'x.deadline']) {
    const text = t(k, worst);
    assert.ok(!/\{\w+\}/.test(text), `${k} has an unfilled placeholder`);
    assert.ok(xLength(text) <= 280, `${k} is ${xLength(text)} characters`);
    assert.match(text, /#SquadJury/);
    assert.match(text, /#FPL\b/);
  }
});
