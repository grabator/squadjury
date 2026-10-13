// API tests on a fresh, throwaway local database (separate from your dev data).
// Starts its own Worker on port 8788, runs the checks, then stops it.
// Usage: npm run test:api
import { spawn, execSync } from 'node:child_process';
import { rmSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { client, randomSquad } from './client.mjs';
import { fileURLToPath } from 'node:url';

const PORT = 8788;
const BASE = `http://127.0.0.1:${PORT}`;
process.env.BASE = BASE;
const STATE = fileURLToPath(new URL('../../.wrangler/test-state', import.meta.url));
const snap = JSON.parse(readFileSync(new URL('../../src/data/fpl-snapshot.json', import.meta.url)));

rmSync(STATE, { recursive: true, force: true });
execSync(`npx wrangler d1 migrations apply squadjury --local --persist-to "${STATE}"`, { stdio: 'ignore' });
const WIN = process.platform === 'win32';
const dev = spawn('npx', ['wrangler', 'dev', '--local', '--port', String(PORT), '--persist-to', `"${STATE}"`, '--var', 'DEV_LOGIN:1', '--var', 'FPL_SOURCE:snapshot', '--var', 'ADMIN_EMAILS:admin@example.test', '--var', 'ADMIN_TOKEN:test-token-123'], { stdio: 'ignore', detached: !WIN, shell: true });
const stop = () => {
  try {
    if (WIN) execSync(`taskkill /pid ${dev.pid} /T /F`, { stdio: 'ignore' });
    else process.kill(-dev.pid);
  } catch {}
};
process.on('exit', stop);

for (let i = 0; i < 60; i++) {
  try { if ((await fetch(BASE + '/api/state')).ok) break; } catch {}
  await new Promise((r) => setTimeout(r, 500));
}

const results = [];
async function check(name, fn) {
  try { await fn(); results.push(`ok   ${name}`); }
  catch (e) { results.push(`FAIL ${name}: ${e.message}`); }
}

const form = (squad, extra = {}) => {
  const fd = new FormData();
  fd.set('picks', JSON.stringify(squad));
  fd.set('captain', String(squad[5].id));
  fd.set('vice', String(squad[6].id));
  for (const [k, v] of Object.entries(extra)) fd.set(k, v);
  return fd;
};

const users = await Promise.all(['ana', 'ben', 'cia', 'dan', 'eve', 'fox'].map(async (n) => { const c = client(`${n}${Date.now()}`); await c.login(); return c; }));
const [A, B, C, D, E, F] = users;
const state = (await A.call('GET', '/api/state')).data;
const gw = state.gw;

await check('posting a valid squad works, a second post is refused', async () => {
  assert.equal((await A.call('POST', '/api/teams', form(randomSquad(11)), true)).status, 201);
  assert.equal((await A.call('POST', '/api/teams', form(randomSquad(12)), true)).status, 409);
});

await check('squad rules: 4 players from one club are refused', async () => {
  const type = (id) => snap.players.find((x) => x.id === id).element_type;
  const club = (id) => snap.players.find((x) => x.id === id).team;
  const squad = randomSquad(13);
  const arsenal = snap.players.filter((p) => p.team === 1 && p.element_type > 1 && !squad.some((s) => s.id === p.id));
  const done = new Set();
  for (const p of arsenal) {
    if (squad.filter((s) => club(s.id) === 1).length >= 4) break;
    const i = squad.findIndex((s, k) => !done.has(k) && type(s.id) === p.element_type && club(s.id) !== 1);
    if (i >= 0) { squad[i] = { id: p.id }; done.add(i); }
  }
  assert.equal(squad.filter((s) => club(s.id) === 1).length, 4);
  const r = await B.call('POST', '/api/teams', form(squad), true);
  assert.equal(r.status, 400, JSON.stringify(r.data));
  assert.equal(r.data.error, 'squad_rules');
});

await check('a file that is not an image is refused', async () => {
  const r = await C.call('POST', '/api/teams', form(randomSquad(14), { image: new Blob(['hello'], { type: 'image/png' }) }), true);
  assert.equal(r.status, 415);
});

await check('a real screenshot uploads and is served back', async () => {
  const img = new Blob([readFileSync(new URL('../fixtures/pick-team-2.jpg', import.meta.url))], { type: 'image/jpeg' });
  const r = await C.call('POST', '/api/teams', form(randomSquad(15), { image: img }), true);
  assert.equal(r.status, 201);
  const res = await fetch(BASE + r.data.team.image);
  assert.equal(res.status, 200, r.data.team.image);
  assert.equal(res.headers.get('content-type'), 'image/jpeg');
});

const keyA = (await A.call('GET', '/api/state')).data.mine.key;

await check('verdicts: 1 to 10 only, not on your own squad, average hidden until you judge', async () => {
  assert.equal((await B.call('POST', '/api/votes', { key: keyA, score: 0 })).status, 400);
  assert.equal((await A.call('POST', '/api/votes', { key: keyA, score: 10 })).status, 403);
  assert.equal((await B.call('GET', `/api/teams/${keyA}`)).data.team.avg, null);
  const v = await B.call('POST', '/api/votes', { key: keyA, score: 7 });
  assert.equal(v.status, 200);
  assert.equal((await B.call('GET', `/api/teams/${keyA}`)).data.team.avg, 7);
});

await check('changing a verdict replaces it instead of adding one', async () => {
  const v = await B.call('POST', '/api/votes', { key: keyA, score: 9 });
  assert.deepEqual([v.data.avg, v.data.votes], [9, 1]);
});

await check('the owner sees the vote distribution', async () => {
  const t = (await A.call('GET', `/api/teams/${keyA}`)).data.team;
  assert.equal(t.dist[8], 1);
});

await check('your verdicts come one page at a time', async () => {
  const keyC = (await C.call('GET', '/api/state')).data.mine.key;
  assert.equal((await B.call('POST', '/api/votes', { key: keyC, score: 6 })).status, 200);
  const p1 = (await B.call('GET', '/api/me/verdicts?size=1')).data;
  assert.deepEqual([p1.total, p1.pages, p1.page, p1.items.length, p1.open], [2, 2, 1, 1, true]);
  const p2 = (await B.call('GET', `/api/me/verdicts?gw=${p1.gw}&page=2&size=1`)).data;
  assert.equal(p2.items.length, 1);
  assert.notEqual(p2.items[0].key, p1.items[0].key);
  assert.deepEqual(p1.gws, [{ gw: p1.gw, count: 2 }]);
  assert.equal((await fetch(BASE + '/api/me/verdicts')).status, 401);
});

await check('duels: sign in first, a quick pick does not count, a pair only once, never your own squad', async () => {
  assert.equal((await fetch(BASE + '/api/duels/next')).status, 401);
  for (const [u, seed] of [[D, 21], [E, 22]]) assert.equal((await u.call('POST', '/api/teams', form(randomSquad(seed)), true)).status, 201);
  const owners = new Map();
  for (const u of [A, C, D, E]) owners.set((await u.call('GET', '/api/state')).data.mine?.key, u);
  const first = (await F.call('GET', '/api/duels/next?n=3')).data;
  assert.ok(first.pairs.length >= 1, JSON.stringify(first));
  const [p1, p2] = first.pairs;
  // Too quick: saved, but not counted for the rating.
  const quick = await F.call('POST', '/api/duels', { first: p1.first.key, second: p1.second.key, pick: p1.first.key });
  assert.equal(quick.status, 200, JSON.stringify(quick.data));
  assert.equal(quick.data.counted, false);
  assert.equal(quick.data.agree, 100);
  assert.equal((await F.call('POST', '/api/duels', { first: p1.second.key, second: p1.first.key, pick: p1.first.key })).status, 409);
  if (p2) {
    await new Promise((r) => setTimeout(r, 1100));
    const ok = await F.call('POST', '/api/duels', { first: p2.first.key, second: p2.second.key, pick: p2.second.key });
    assert.equal(ok.data.counted, true);
    const winner = owners.get(p2.second.key);
    const t = (await winner.call('GET', `/api/teams/${p2.second.key}`)).data.team;
    assert.deepEqual([t.duels.w, t.duels.l], [1, 0]);
    assert.ok(t.duels.rating > 1500);
    assert.equal((await F.call('GET', '/api/state')).data.judged, 1);
  }
  const own = (await D.call('GET', '/api/state')).data.mine.key;
  const other = [...owners.keys()].find((k) => k && k !== own);
  assert.equal((await D.call('POST', '/api/duels', { first: own, second: other, pick: own })).status, 403);
  const next = (await D.call('GET', '/api/duels/next?n=4')).data.pairs;
  assert.ok(next.every((p) => p.first.key !== own && p.second.key !== own));
  assert.equal((await A.call('GET', '/api/leaderboard/duels')).status, 200);
});

await check('cross site writes are refused', async () => {
  const r = await fetch(BASE + '/api/votes', { method: 'POST', headers: { origin: 'https://evil.example', 'content-type': 'application/json' }, body: JSON.stringify({ key: keyA, score: 1 }) });
  assert.equal(r.status, 403);
});

await check('Rate link: preview tags, visits per channel, and new sign ups remember who invited them', async () => {
  const key = (await A.call('GET', '/api/state')).data.mine?.key;
  assert.ok(key, 'A has a squad');
  const page = await (await fetch(`${BASE}/r/${key}?s=wa`)).text();
  assert.match(page, /og:title" content="Rate my GW\d+ team/);
  assert.match(page, /og:url" content="[^"]*\/r\//);
  // Only the owner can store the preview image.
  const fd = new FormData();
  fd.set('og', new Blob([readFileSync(new URL('../fixtures/pick-team-1.jpg', import.meta.url))], { type: 'image/jpeg' }), 'rate.jpg');
  const up = await A.call('PUT', '/api/teams/mine/rate-og', fd, true);
  assert.equal(up.status, 200, JSON.stringify(up.data));
  assert.equal((await A.call('GET', `/api/teams/${key}`)).data.team.rateOg, true);
  const fd2 = new FormData();
  fd2.set('og', new Blob([readFileSync(new URL('../fixtures/pick-team-1.jpg', import.meta.url))], { type: 'image/jpeg' }), 'rate.jpg');
  const noSquad = client(`nosquad${Date.now()}`);
  await noSquad.login();
  assert.equal((await noSquad.call('PUT', '/api/teams/mine/rate-og', fd2, true)).status, 404);
  const withRate = await (await fetch(`${BASE}/r/${key}`)).text();
  assert.match(withRate, /og:image" content="[^"]*\/u\/rate_/);
  // A friend signs up through the link.
  const friend = client(`invited${Date.now()}`);
  const r = await friend.call('POST', '/api/auth/dev', { name: `invited${Date.now()}`, ref: { key, s: 'wa' } });
  assert.equal(r.status, 200);
  const admin = client('admin');
  await admin.login();
  const src = (await admin.call('GET', '/api/admin/sources')).data.sources;
  const wa = src.find((x) => x.source === 'wa');
  assert.ok(wa && wa.rate >= 1 && wa.signups >= 1, JSON.stringify(src));
  assert.equal((await A.call('GET', '/api/admin/sources')).status, 403);
});

await check('leagues: create, join by code or link, member only table, owner only settings, hand over on leave', async () => {
  const made = await D.call('POST', '/api/leagues', { name: '  Office   FPL ' });
  assert.equal(made.status, 201, JSON.stringify(made.data));
  const { code } = made.data.league;
  assert.equal(made.data.league.name, 'Office FPL');
  assert.match(code, /^[A-Z0-9]{6}$/);
  assert.equal((await D.call('POST', '/api/leagues', { name: 'ab' })).status, 400);
  // A stranger sees the invite card, not the table.
  const info = await E.call('GET', `/api/leagues/${code}`);
  assert.equal(info.data.league.isMember, false);
  assert.equal(info.data.league.memberList, undefined);
  assert.equal((await E.call('GET', `/api/leagues/${code}/standings`)).status, 403);
  assert.equal((await E.call('POST', '/api/leagues/join', { code: 'ZZZZZZ' })).status, 404);
  assert.equal((await E.call('POST', '/api/leagues/join', { code: `https://squadjury.com/l/${code.toLowerCase()}` })).status, 200);
  assert.equal((await F.call('POST', '/api/leagues/join', { code })).status, 200);
  const table = (await E.call('GET', `/api/leagues/${code}/standings`)).data;
  assert.equal(table.members, 3);
  assert.equal(table.ranked.length + table.pending.length + table.missing.length, 3);
  // Only the owner renames, makes a new code or removes people.
  assert.equal((await E.call('POST', `/api/leagues/${code}/rename`, { name: 'Hacked' })).status, 403);
  const fNick = (await F.call('GET', '/api/state')).data.user.nickname;
  const fId = (await D.call('GET', `/api/leagues/${code}`)).data.league.memberList.find((m) => m.nickname === fNick)?.id;
  assert.equal((await D.call('POST', `/api/leagues/${code}/kick`, { userId: fId })).status, 200);
  assert.equal((await D.call('GET', `/api/leagues/${code}`)).data.league.members, 2);
  const fresh = (await D.call('POST', `/api/leagues/${code}/new-code`)).data.league.code;
  assert.notEqual(fresh, code);
  assert.equal((await F.call('POST', '/api/leagues/join', { code })).status, 404, 'the old code stops working');
  // The owner leaves: the oldest member takes over.
  assert.equal((await D.call('POST', `/api/leagues/${fresh}/leave`)).status, 200);
  assert.equal((await E.call('GET', `/api/leagues/${fresh}`)).data.league.isOwner, true);
  const page = await (await fetch(`${BASE}/l/${fresh}`)).text();
  assert.match(page, /og:title" content="Join &quot;Office FPL&quot; on SquadJury/);
});

await check('Plan B: one per squad, jurors vote A or B in Duels, the owner picks and B becomes the squad', async () => {
  assert.equal((await D.call('POST', '/api/plans', form(randomSquad(21)), true)).status, 400); // same as Plan A
  const made = await D.call('POST', '/api/plans', form(randomSquad(31)), true);
  assert.equal(made.status, 201, JSON.stringify(made.data));
  assert.equal((await D.call('POST', '/api/plans', form(randomSquad(32)), true)).status, 409);
  assert.equal((await F.call('POST', '/api/plans', form(randomSquad(33)), true)).status, 404); // no squad yet
  const pairs = (await F.call('GET', '/api/duels/next?n=4')).data.pairs;
  const pp = pairs.find((p) => p.kind === 'plan');
  assert.ok(pp, JSON.stringify(pairs.map((p) => p.kind)));
  assert.equal(pp.plan, made.data.plan.key);
  assert.deepEqual([pp.first.label, pp.second.label], ['A', 'B']);
  const v = await F.call('POST', '/api/plans/vote', { plan: pp.plan, pick: 'b' });
  assert.deepEqual([v.status, v.data.votes, v.data.agree], [200, 1, 100]);
  assert.equal((await D.call('POST', '/api/plans/vote', { plan: pp.plan, pick: 'a' })).status, 403);
  const key = (await D.call('GET', '/api/state')).data.mine.key;
  const mine = (await D.call('GET', `/api/teams/${key}`)).data.team;
  assert.deepEqual([mine.plan.votesA, mine.plan.votesB, mine.plan.chosen], [0, 1, null]);
  assert.equal((await F.call('GET', `/api/teams/${key}`)).data.team.plan, undefined); // only the owner sees it
  const chosen = await D.call('POST', '/api/plans/mine/choose', { pick: 'b' });
  assert.equal(chosen.status, 200);
  assert.equal(chosen.data.team.key, key);
  assert.deepEqual(chosen.data.team.picks.map((p) => p.id), randomSquad(31).map((p) => p.id));
  assert.equal((await D.call('POST', '/api/plans/mine/choose', { pick: 'a' })).status, 409);
  assert.ok(!(await F.call('GET', '/api/duels/next?n=4')).data.pairs.some((p) => p.kind === 'plan'));
});

await check('league H2H: 4 members get fixtures, everyone plays once, members judge the fixtures first', async () => {
  const made = (await A.call('POST', '/api/leagues', { name: 'H2H Test' })).data.league;
  for (const u of [C, D]) assert.equal((await u.call('POST', '/api/leagues/join', { code: made.code })).status, 200);
  const three = (await A.call('GET', `/api/leagues/${made.code}/h2h`)).data;
  assert.equal(three.gws.length, 0);
  assert.equal((await E.call('POST', '/api/leagues/join', { code: made.code })).status, 200);
  const r = (await A.call('GET', `/api/leagues/${made.code}/h2h`)).data;
  assert.equal(r.gw, gw.id);
  assert.equal(r.matches.length, 2);
  const names = r.matches.flatMap((m) => [m.home.nickname, m.away.nickname]);
  assert.equal(new Set(names).size, 4);
  assert.ok(r.matches.every((m) => ['H', 'A', 'D'].includes(m.jury.res)));
  assert.equal(r.tables.jury.length, 4);
  assert.equal((await B.call('GET', `/api/leagues/${made.code}/h2h`)).status, 403);
  // B joins later: not in this gameweek's fixtures, but gets them first in Duel mode.
  assert.equal((await B.call('POST', '/api/leagues/join', { code: made.code })).status, 200);
  const pairs = (await B.call('GET', '/api/duels/next?n=3')).data.pairs;
  assert.equal(pairs[0].kind, 'league', JSON.stringify(pairs.map((p) => p.kind)));
  assert.equal(pairs[0].league, 'H2H Test');
  assert.equal((await B.call('GET', `/api/leagues/${made.code}/h2h`)).data.matches.length, 2);
});

await check('badges: 18 in groups with progress, first verdict unlocks, the new mark goes once seen, others see only the row', async () => {
  const b = (await B.call('GET', '/api/me/badges')).data;
  assert.equal(b.total, 18);
  assert.deepEqual(b.groups.map((g) => g.name), ['Juror', 'Manager', 'Scout', 'Duels', 'Community']);
  const first = b.groups[0].badges.find((x) => x.id === 'first-verdict');
  assert.ok(first.unlocked, JSON.stringify(first));
  assert.equal(first.isNew, true);
  const regular = b.groups[0].badges.find((x) => x.id === 'regular');
  assert.equal(regular.unlocked, null);
  assert.equal(regular.progress.target, 50);
  assert.ok((await B.call('GET', '/api/state')).data.newBadges.some((x) => x.id === 'first-verdict'));
  assert.equal((await B.call('POST', '/api/me/badges/seen')).status, 200);
  assert.deepEqual((await B.call('GET', '/api/state')).data.newBadges, []);
  const keyA = (await A.call('GET', '/api/state')).data.mine.key;
  await A.call('GET', '/api/me/badges');
  const pub = (await B.call('GET', `/api/teams/${keyA}`)).data.team.ownerBadges;
  assert.ok(pub.some((x) => x.id === 'on-the-pitch'), JSON.stringify(pub));
  assert.equal((await fetch(BASE + '/api/me/badges')).status, 401);
});

await check('email link: works once, expires after 15 minutes, 3 per hour per email, the same email is the same account', async () => {
  const mail = `link${Date.now()}@example.test`;
  const M = client('mailer');
  assert.equal((await M.call('POST', '/api/auth/email', { email: 'not an email' })).status, 400);
  const sent = await M.call('POST', '/api/auth/email', { email: mail });
  assert.equal(sent.status, 200, JSON.stringify(sent.data));
  const token = new URL(sent.data.devLink).searchParams.get('token');
  const first = await M.call('POST', '/api/auth/email/verify', { token });
  assert.equal(first.status, 200, JSON.stringify(first.data));
  assert.equal(first.data.nickname, null);
  assert.ok(first.data.suggestion);
  assert.equal((await M.call('PATCH', '/api/me', { nickname: first.data.suggestion })).status, 200);
  assert.equal((await M.call('POST', '/api/auth/email/verify', { token })).status, 410); // used
  // A second link for the same email signs in to the same account.
  const again = await M.call('POST', '/api/auth/email', { email: mail.toUpperCase() });
  const N = client('mailer2');
  const second = await N.call('POST', '/api/auth/email/verify', { token: new URL(again.data.devLink).searchParams.get('token') });
  assert.equal(second.data.nickname, first.data.suggestion);
  // Expired: 16 minutes later.
  const late = await M.call('POST', '/api/auth/email', { email: mail });
  const lateToken = new URL(late.data.devLink).searchParams.get('token');
  const res = await fetch(`${BASE}/api/auth/email/verify`, { method: 'POST', headers: { origin: BASE, 'content-type': 'application/json', 'x-sj-now': new Date(Date.now() + 16 * 60e3).toISOString() }, body: JSON.stringify({ token: lateToken }) });
  assert.equal(res.status, 410);
  assert.equal((await res.json()).error, 'link_expired');
  assert.equal((await M.call('POST', '/api/auth/email', { email: mail })).status, 429); // 4th this hour
  assert.equal((await M.call('POST', '/api/auth/email/verify', { token: 'x'.repeat(43) })).status, 400);
  assert.equal((await M.call('POST', '/api/auth/apple', { idToken: 'a.b.c' })).status, 404); // Apple is off until set up
});

await check('3 reports hide a squad from judging and from its link', async () => {
  for (const u of [C, D, E]) assert.equal((await u.call('POST', '/api/reports', { key: keyA })).status, 200);
  assert.equal((await F.call('GET', `/api/teams/${keyA}`)).status, 404);
  const next = await F.call('GET', '/api/judge/next?n=5');
  assert.ok(!next.data.teams.some((t) => t.key === keyA));
});

await check('at the deadline the gameweek locks and the next one opens', async () => {
  const after = new Date(gw.deadline + 60_000).toISOString();
  const call = async (u, m, p, b) => {
    const res = await fetch(BASE + p, { method: m, headers: { origin: BASE, 'x-sj-now': after, 'content-type': 'application/json', cookie: '' }, body: b ? JSON.stringify(b) : undefined });
    return { status: res.status, data: await res.json() };
  };
  const s = await call(null, 'GET', '/api/state');
  assert.equal(s.data.gw.id, gw.id + 1);
  const lb = await call(null, "GET", `/api/leaderboard?gw=${gw.id}`);
  if (!lb.data.gameweeks) throw new Error(JSON.stringify(lb));
  assert.equal(lb.data.live, false);
  const gws = lb.data.gameweeks.find((g) => g.id === gw.id);
  assert.ok(gws, JSON.stringify(lb.data.gameweeks));
  assert.equal(gws.status, 'locked');
});

await check('real points: only admins or the token can score, the leaderboard sorts by points', async () => {
  const live = { elements: snap.players.map((p) => ({ id: p.id, stats: { total_points: 2, minutes: 90 } })) };
  assert.equal((await A.call('POST', '/api/admin/points', { gw: gw.id, live })).status, 403);
  const bad = await fetch(`${BASE}/api/admin/points`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-admin-token': 'wrong' }, body: JSON.stringify({ gw: gw.id, live }) });
  assert.ok([401, 403].includes(bad.status));
  const res = await fetch(`${BASE}/api/admin/points`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-admin-token': 'test-token-123' }, body: JSON.stringify({ gw: gw.id, live }) });
  const body = await res.json();
  assert.equal(res.status, 200, JSON.stringify(body));
  assert.ok(body.scored >= 1);
  // 11 starters with 2 points each, the captain doubled.
  const after = new Date(gw.deadline + 60_000).toISOString();
  const lb = await (await fetch(`${BASE}/api/leaderboard?gw=${gw.id}&sort=points`, { headers: { 'x-sj-now': after } })).json();
  assert.equal(lb.hasPoints, true, JSON.stringify(lb).slice(0, 300));
  assert.equal(lb.sort, 'points');
  assert.ok([...lb.ranked, lb.me].filter(Boolean).every((r) => r.points === 24), JSON.stringify(lb.ranked));
  const admin = client('admin');
  await admin.login();
  const list = (await admin.call('GET', '/api/admin/points')).data;
  assert.equal(list.gameweeks.find((g) => g.gw === gw.id).status, 'done');
  assert.equal((await admin.call('POST', '/api/admin/points', { gw: 39, live })).status, 400);
  // Scout scores follow the points: with fewer than 10 squads they are not worked out.
  const sc = await (await fetch(`${BASE}/api/scouts?gw=${gw.id}`, { headers: { 'x-sj-now': after } })).json();
  assert.equal(sc.status, 'few', JSON.stringify(sc));
  assert.deepEqual(sc.ranked, []);
  const season = await (await fetch(`${BASE}/api/scouts?type=season`, { headers: { 'x-sj-now': after } })).json();
  assert.equal(season.type, 'season');
  assert.ok('scouts' in (await A.call('GET', '/api/me/profile')).data);
});

await check('FPL team id: a number or an FPL link is saved, anything else is refused', async () => {
  const nick = (await B.call('GET', '/api/state')).data.user.nickname;
  assert.equal((await B.call('PATCH', '/api/me', { nickname: nick, fplId: 'abc' })).status, 400);
  assert.equal((await B.call('PATCH', '/api/me', { nickname: nick, fplId: 'https://fantasy.premierleague.com/entry/1234567/event/7' })).data.fplId, 1234567);
  assert.equal((await B.call('GET', '/api/state')).data.user.fplId, 1234567);
  assert.equal((await B.call('PATCH', '/api/me', { nickname: nick, fplId: '' })).data.fplId, null);
});

await check('only admins can make and list backups, and a backup holds every table', async () => {
  assert.equal((await A.call('POST', '/api/admin/backup')).status, 403);
  assert.equal((await A.call('GET', '/api/admin/backups')).status, 403);
  const admin = client('admin');
  await admin.login();
  const made = await admin.call('POST', '/api/admin/backup');
  assert.equal(made.status, 200, JSON.stringify(made.data));
  assert.match(made.data.backup.key, /^backups\/\d{4}-\d{2}-\d{2}\.json\.gz$/);
  assert.ok(made.data.backup.rows > 0);
  const list = await admin.call('GET', '/api/admin/backups');
  assert.equal(list.data.backups[0].key, made.data.backup.key);
});

await check('gameweeks are plain numbers in the API, whatever the season key inside', async () => {
  const s = (await A.call('GET', '/api/state')).data;
  assert.ok(s.gw.id >= 1 && s.gw.id <= 38, JSON.stringify(s.gw));
  const lb = (await A.call('GET', '/api/leaderboard')).data;
  assert.equal(lb.gw, s.gw.id);
  assert.ok(lb.gameweeks.every((g) => g.id >= 1 && g.id <= 38));
  const mine = (await A.call('GET', '/api/state')).data.mine;
  if (mine) assert.equal(mine.gw, s.gw.id);
});

await check('deleting an account removes the user and their squad', async () => {
  const keyC = (await C.call('GET', '/api/state')).data.mine?.key;
  assert.equal((await C.call('DELETE', '/api/me')).status, 200);
  assert.equal((await C.call('GET', '/api/state')).data.user, null);
  if (keyC) assert.equal((await A.call('GET', `/api/teams/${keyC}`)).status, 404);
});

stop();
console.log(results.join('\n'));
if (results.some((r) => r.startsWith('FAIL'))) process.exit(1);
process.exit(0);
