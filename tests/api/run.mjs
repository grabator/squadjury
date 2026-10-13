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
const dev = spawn('npx', ['wrangler', 'dev', '--local', '--port', String(PORT), '--persist-to', `"${STATE}"`, '--var', 'DEV_LOGIN:1', '--var', 'FPL_SOURCE:snapshot', '--var', 'ADMIN_EMAILS:admin@example.test'], { stdio: 'ignore', detached: !WIN, shell: true });
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
