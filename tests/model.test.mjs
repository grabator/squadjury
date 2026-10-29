import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import * as demo from '../src/lib/demo.js';
import { index, xp, captainOptions, transferIdeas, whatIf, alerts, fixturesFor, availability } from '../public/js/model.js';

const ix = index(demo.bootstrap(), demo.fixtures());
const p = demo.picks(1, 9).picks.map((x) => x.element);
const xi = p.slice(0, 11);

test('sljedeće kolo i utakmice', () => {
  assert.equal(ix.nextGw, 9);
  assert.equal(ix.currentGw, 8);
  for (const t of ix.teams.keys()) assert.ok(fixturesFor(ix, t, 1, 38).length >= 30);
});

test('povrijeđen igrač ima manje predviđenih bodova', () => {
  const isak = ix.players.get(379);
  assert.equal(availability(isak), 0.25);
  const healthy = { ...isak, status: 'a', chance_of_playing_next_round: null };
  const hurt = xp(ix, isak); ix.memo.clear();
  assert.ok(hurt < xp(ix, healthy)); ix.memo.clear();
});

test('lakši protivnik daje više bodova', () => {
  const e = ix.players.get(411);
  const fx = fixturesFor(ix, e.team, 9, 38);
  const easy = fx.find((f) => f.fdr <= 2), hard = fx.find((f) => f.fdr >= 4);
  if (easy && hard) assert.ok(xp(ix, e, easy.gw, 1) > xp(ix, e, hard.gw, 1) || fixturesFor(ix, e.team, easy.gw, 1).length !== fixturesFor(ix, e.team, hard.gw, 1).length);
});

test('kapiten: sortirano, sa razlogom', () => {
  const c = captainOptions(ix, xi);
  assert.equal(c.length, 11);
  for (let i = 1; i < c.length; i++) assert.ok(c[i - 1].xp >= c[i].xp);
  assert.match(c[0].why, /home to|away at/);
});

test('transferi poštuju poziciju, budžet i 3 po klubu', () => {
  const bank = 5;
  const ideas = transferIdeas(ix, p, bank);
  assert.ok(ideas.length > 0);
  const per = {};
  for (const id of p) { const e = ix.players.get(id); per[e.team] = (per[e.team] || 0) + 1; }
  for (const t of ideas) {
    assert.equal(t.inn.element_type, t.out.element_type);
    assert.ok(t.inn.now_cost <= t.out.now_cost + bank);
    assert.ok(!p.includes(t.inn.id));
    if (t.inn.team !== t.out.team) assert.ok((per[t.inn.team] || 0) < 3);
    assert.ok(t.gain > 0);
  }
  // Isak je povrijeđen pa bi trebao biti među prvim prijedlozima za prodaju
  assert.ok(ideas.some((t) => t.out.id === 379));
});

test('šta ako: zbir po kolima', () => {
  const w = whatIf(ix, ix.players.get(379), ix.players.get(55));
  assert.equal(w.rows.length, 5);
  assert.equal(w.gain, Math.round(w.rows.reduce((s, r) => s + r.inn - r.out, 0) * 10) / 10);
});

test('upozorenja za povrijeđenog', () => {
  assert.ok(alerts(ix, p).some((a) => a.e.id === 379 && a.kind === 'povreda'));
});

test('demo tim za bilo koji ID je ispravan', () => {
  for (const id of [2, 77, 123456]) {
    const ids = demo.picks(id, 9).picks.map((x) => x.element);
    assert.equal(new Set(ids).size, 15);
    const pos = { 1: 0, 2: 0, 3: 0, 4: 0 }, per = {};
    for (const i of ids) { const e = ix.players.get(i); pos[e.element_type]++; per[e.team] = (per[e.team] || 0) + 1; }
    assert.deepEqual(pos, { 1: 2, 2: 5, 3: 5, 4: 3 });
    assert.ok(Math.max(...Object.values(per)) <= 3);
  }
});

import { bestXI, transferPairs, hitWorth, freeTransfers, duelOdds, greenArrowOdds, compareSquads, predictCaptain, careerXp, levelOf, badges, regrets, fixtureSwings, specialGws, risers, int } from '../public/js/model.js';

test('najbolja postava poštuje formaciju', () => {
  const players = p.map((id) => ix.players.get(id));
  const b = bestXI(players, (e) => xp(ix, e));
  assert.equal(b.xi.length, 11);
  assert.equal(b.bench.length, 4);
  assert.equal(b.xi.filter((e) => e.element_type === 1).length, 1);
  assert.ok(b.xi.filter((e) => e.element_type === 2).length >= 3);
  assert.ok(b.xi.filter((e) => e.element_type === 4).length >= 1);
  assert.equal(b.bench[0].element_type, 1);
  assert.match(b.formation, /^\d-\d-\d$/);
});

test('par transfera: budžet i 3 po klubu', () => {
  const pairs = transferPairs(ix, p, 5);
  assert.ok(pairs.length > 0);
  for (const t of pairs) {
    assert.ok(t.ins[0].now_cost + t.ins[1].now_cost <= t.outs[0].now_cost + t.outs[1].now_cost + 5);
    const ids = new Set(p.filter((i) => i !== t.outs[0].id && i !== t.outs[1].id).concat(t.ins.map((e) => e.id)));
    const per = {};
    for (const i of ids) { const e = ix.players.get(i); per[e.team] = (per[e.team] || 0) + 1; }
    assert.ok(Math.max(...Object.values(per)) <= 3);
  }
});

test('minus 4 i besplatni transferi', () => {
  assert.equal(hitWorth(7).worth, true);
  assert.equal(hitWorth(3).worth, false);
  assert.equal(freeTransfers({ current: [{ event: 1, event_transfers: 0 }, { event: 2, event_transfers: 0 }, { event: 3, event_transfers: 0 }], chips: [] }), 3);
  assert.equal(freeTransfers({ current: [{ event: 1, event_transfers: 0 }, { event: 2, event_transfers: 2 }], chips: [] }), 1);
  const many = [{ event: 1, event_transfers: 0 }]; for (let g = 2; g <= 9; g++) many.push({ event: g, event_transfers: 0 });
  assert.equal(freeTransfers({ current: many, chips: [] }), 5);
  assert.equal(freeTransfers({ current: [{ event: 1, event_transfers: 0 }, { event: 2, event_transfers: 9 }], chips: [{ name: 'wildcard', event: 2 }] }), 2);
});

test('dvoboj: zbir šansi je 1, isti tim je ravnopravan', () => {
  const a = { xi, captain: 411 };
  const o = duelOdds(ix, a, a, 500);
  assert.equal(o.win, 0); assert.equal(o.lose, 0); assert.equal(o.draw, 1);
  const other = demo.picks(2, 9).picks.slice(0, 11).map((x) => x.element);
  const d = duelOdds(ix, a, { xi: other, captain: other[9] }, 800);
  assert.ok(Math.abs(d.win + d.draw + d.lose - 1) < 1e-9);
  const g = greenArrowOdds(ix, a, 54, 800);
  assert.ok(g.p >= 0 && g.p <= 1 && g.low <= g.mid && g.mid <= g.high);
});

test('rival: poređenje i kapiten', () => {
  const other = demo.picks(2, 9).picks.slice(0, 11).map((x) => x.element);
  const c = compareSquads(ix, { xi }, { xi: other });
  assert.equal(c.shared.length + c.onlyMine.length, 11);
  assert.equal(c.shared.length + c.onlyTheirs.length, 11);
  const pc = predictCaptain(ix, other, other[0]);
  assert.ok(other.includes(pc.e.id));
});

test('XP, nivoi, značke, žaljenje', () => {
  const h = demo.history(1);
  const c = careerXp(h, ix.events, { 7: 12 });
  assert.equal(c.log.length, 8);
  assert.equal(c.total, c.log.reduce((s, x) => s + x.xp, 0));
  assert.deepEqual(levelOf(0), { level: 1, into: 0, need: 100, title: 'Amateur' });
  assert.equal(levelOf(100).level, 2);
  assert.equal(levelOf(220).level, 3);
  assert.equal(badges(h, ix.events).length, 8);
  const rg = regrets(h, { 7: 4 });
  assert.equal(rg.total, rg.bench + rg.hits + rg.cap);
  assert.equal(rg.hits, 4);
});

test('raspored i cijene', () => {
  for (const s of fixtureSwings(ix)) assert.ok(s.delta >= 0.6);
  assert.ok(Array.isArray(specialGws(ix, 9, 6)));
  const rs = risers(ix, 5);
  assert.equal(rs.length, 5);
  assert.ok(rs[0].net >= rs[4].net);
  assert.equal(int(1234567), '1,234,567');
});

test('demo historija je usklađena sa bodovima igrača', () => {
  const h = demo.history(1).current;
  assert.equal(h[7].total_points, h.reduce((s, x) => s + x.points, 0));
  const isak = ix.players.get(379);
  assert.equal(isak.total_points, demo.element(379).history.reduce((s, x) => s + x.total_points, 0));
});

test('bonus po BPS-u: izjednačeni dijele mjesto, sljedeći preskače', async () => {
  const { bonusFromBps, liveBonus, defCon } = await import('../public/js/model.js');
  const b = bonusFromBps([{ id: 1, bps: 40, mins: 90 }, { id: 2, bps: 40, mins: 90 }, { id: 3, bps: 30, mins: 90 }, { id: 4, bps: 20, mins: 90 }, { id: 5, bps: 50, mins: 0 }]);
  assert.deepEqual([b.get(1), b.get(2), b.get(3), b.get(4), b.get(5)], [3, 3, 1, 0, undefined]);
  const t = bonusFromBps([{ id: 1, bps: 40, mins: 90 }, { id: 2, bps: 30, mins: 90 }, { id: 3, bps: 30, mins: 90 }, { id: 4, bps: 10, mins: 90 }]);
  assert.deepEqual([t.get(1), t.get(2), t.get(3), t.get(4)], [3, 2, 2, 0]);
  // privremeni bonus dok FPL ne potvrdi, poslije pravi
  const lv = new Map([[1, { bonus: 0, bps: 40, fx: [[9, 40, 90]] }], [2, { bonus: 0, bps: 20, fx: [[9, 20, 90]] }]]);
  assert.deepEqual(liveBonus(lv).get(1), { bps: 40, bonus: 3, provisional: 3 });
  const done = new Map([[1, { bonus: 2, bps: 40, fx: [[9, 40, 90]] }], [2, { bonus: 3, bps: 20, fx: [[9, 20, 90]] }]]);
  assert.deepEqual(liveBonus(done).get(1), { bps: 40, bonus: 2, provisional: 0 });
  assert.deepEqual(defCon({ element_type: 2 }, { defensive_contribution: 10 }), { v: 10, need: 10, hit: true });
  assert.deepEqual(defCon({ element_type: 3 }, { clearances_blocks_interceptions: 4, tackles: 3, recoveries: 4 }), { v: 11, need: 12, hit: false });
  assert.equal(defCon({ element_type: 1 }, {}), null);
});
