import test from 'node:test';
import assert from 'node:assert/strict';
import { route, fromDemo, slimBootstrap, slimLive } from '../src/worker.js';

test('rute', () => {
  assert.deepEqual(route('/api/entry/123/picks/9'), { kind: 'picks', id: 123, gw: 9, up: '/entry/123/event/9/picks/' });
  assert.equal(route('/api/entry/abc'), null);
  assert.equal(route('/api/live/9').up, '/event/9/live/');
  assert.equal(route('/api/league/1').up, '/leagues-classic/1/standings/');
  assert.equal(route('/api/../secret'), null);
});

test('demo odgovori imaju oblik FPL API-ja', () => {
  const b = fromDemo(route('/api/bootstrap'));
  assert.equal(b.teams.length, 20);
  assert.ok(b.elements.length > 500);
  assert.ok(b.events.find((e) => e.is_next));
  const s = slimBootstrap(b);
  assert.deepEqual(Object.keys(s.elements[0]).sort(), Object.keys(b.elements[0]).sort());
  assert.equal(fromDemo(route('/api/entry/1')).name, 'Graba FC');
  assert.equal(fromDemo(route('/api/entry/1/history')).current.length, 8);
  assert.equal(fromDemo(route('/api/entry/1/picks/9')).picks.length, 15);
  assert.ok(fromDemo(route('/api/league/1')).standings.results.length >= 4);
});

test('team: menadžer, historija i tim zadnjeg kola u jednom', async () => {
  const { team } = await import('../src/worker.js');
  const t = await team(1, fromDemo);
  assert.equal(t.entry.id, 1);
  assert.equal(t.gw, t.history.current.at(-1).event);
  assert.equal(t.picks.picks.length, 15);
  assert.equal(route('/api/team/1').kind, 'team');
});

test('slimLive zadržava samo statistike', () => {
  const d = slimLive({ elements: [{ id: 7, stats: { minutes: 90, total_points: 9, influence: '30.2' }, explain: [{ fixture: 1 }] }] });
  assert.deepEqual(Object.keys(d.elements[0]), ['id', 'stats']);
  assert.equal(d.elements[0].stats.total_points, 9);
  assert.equal(d.elements[0].stats.influence, undefined);
  assert.equal(d.elements[0].stats.bonus, 0);
});

test('stare SquadJury adrese vode na /jury', async () => {
  const w = (await import('../src/worker.js')).default;
  const env = { ASSETS: { fetch: () => new Response('asset') } };
  const r = await w.fetch(new Request('https://x.test/leaderboard?tab=gw'), env, {});
  assert.equal(r.status, 301);
  assert.equal(r.headers.get('location'), 'https://x.test/jury/leaderboard?tab=gw');
  assert.equal((await w.fetch(new Request('https://x.test/me/verdicts'), env, {})).headers.get('location'), 'https://x.test/jury/me/verdicts');
  assert.equal(await (await w.fetch(new Request('https://x.test/'), env, {})).text(), 'asset');
});
