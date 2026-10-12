// API smoke test against a running `npm run dev` (http://127.0.0.1:8787).
import { readFileSync } from 'node:fs';
const base = () => process.env.BASE || 'http://127.0.0.1:8787';
const snap = JSON.parse(readFileSync(new URL('../../src/data/fpl-snapshot.json', import.meta.url)));

export function client(name) {
  let cookie = '';
  const call = async (method, path, body, isForm) => {
    const BASE = base();
    const headers = { origin: BASE, cookie };
    if (body && !isForm) headers['content-type'] = 'application/json';
    const res = await fetch(BASE + path, { method, headers, body: isForm ? body : body ? JSON.stringify(body) : undefined });
    const sc = res.headers.get('set-cookie');
    if (sc) cookie = sc.split(';')[0];
    const data = await res.json().catch(() => null);
    return { status: res.status, data };
  };
  return {
    call,
    async login() {
      const r = await call('POST', '/api/auth/dev', { name });
      if (!r.data.nickname) await call('PATCH', '/api/me', { nickname: r.data.suggestion });
      return r;
    },
  };
}

/** A valid random squad from the snapshot (2 GK, 5 DEF, 5 MID, 3 FWD, max 3 per club). */
export function randomSquad(seed = 1) {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const need = { 1: 2, 2: 5, 3: 5, 4: 3 }, clubs = {}, picked = { 1: [], 2: [], 3: [], 4: [] };
  const pool = [...snap.players].filter((p) => !p.local_only).sort(() => rnd() - 0.5);
  for (const p of pool) {
    if (picked[p.element_type].length >= need[p.element_type] || (clubs[p.team] || 0) >= 3) continue;
    picked[p.element_type].push(p); clubs[p.team] = (clubs[p.team] || 0) + 1;
  }
  // XI: 1 GK, 4 DEF, 4 MID, 2 FWD; bench: GK, DEF, MID, FWD
  const xi = [picked[1][0], ...picked[2].slice(0, 4), ...picked[3].slice(0, 4), ...picked[4].slice(0, 2)];
  const bench = [picked[1][1], picked[2][4], picked[3][4], picked[4][2]];
  return [...xi, ...bench].map((p) => ({ id: p.id }));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const a = client('smoke-a-' + Date.now()), b = client('smoke-b-' + Date.now());
  await a.login(); await b.login();
  const squad = randomSquad(Date.now() % 1000);
  const fd = new FormData();
  fd.set('picks', JSON.stringify(squad)); fd.set('captain', String(squad[5].id)); fd.set('vice', String(squad[6].id));
  const post = await a.call('POST', '/api/teams', fd, true);
  console.log('post', post.status, post.data?.team?.key, post.data?.error || '');
  const again = await a.call('POST', '/api/teams', fd, true);
  console.log('post again (409 expected)', again.status);
  const next = await b.call('GET', '/api/judge/next?n=3');
  console.log('judge next', next.status, next.data.teams.length);
  const key = post.data.team.key;
  console.log('vote', JSON.stringify((await b.call('POST', '/api/votes', { key, score: 8 })).data));
  console.log('re-vote', JSON.stringify((await b.call('POST', '/api/votes', { key, score: 9 })).data));
  console.log('own vote (403 expected)', (await a.call('POST', '/api/votes', { key, score: 10 })).status);
  console.log('bad score (400 expected)', (await b.call('POST', '/api/votes', { key, score: 11 })).status);
  const lb = await b.call('GET', '/api/leaderboard');
  console.log('leaderboard', lb.status, 'ranked', lb.data.ranked.length, 'pending', lb.data.pending.length);
  console.log('state a', JSON.stringify((await a.call('GET', '/api/state')).data.mine?.place));
  const bad = await fetch(base() + '/api/votes', { method: 'POST', headers: { origin: 'https://evil.example', 'content-type': 'application/json' }, body: '{}' });
  console.log('cross origin (403 expected)', bad.status);
}
