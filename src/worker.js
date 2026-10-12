// SquadJury Worker: JSON API, images from R2, share pages and the deadline cron.
// Static files (the app itself) are served by Workers static assets.

import { json, fail, HttpError, readJson, checkOrigin, clientIp, rateLimit, randomKey, esc } from './lib/http.js';
import { verifyGoogleToken, createSession, endSession, currentUser, isAdmin, checkNickname, checkXHandle, suggestNickname } from './lib/auth.js';
import { getFpl } from './lib/fpl.js';
import { syncGameweeks, liveStandings, refreshVoterWeight, teamOut, placeOf, avgOf } from './lib/core.js';
import { validate } from '../public/js/ocr/match.js';
import { MIN_JUDGED } from './lib/rank.js';

const MAX_IMAGE = 3 * 1024 * 1024;
const MAX_OG = 2 * 1024 * 1024;

/** Request clock. In development a fake "now" can be passed to test deadlines. */
function clock(req, env) {
  if (env.DEV_LOGIN === '1') {
    const fake = req.headers.get('x-sj-now') || new URL(req.url).searchParams.get('now');
    if (fake && !Number.isNaN(Date.parse(fake))) return Date.parse(fake);
  }
  return Date.now();
}

const isSecure = (req) => new URL(req.url).protocol === 'https:';

function needUser(c) {
  if (!c.user) fail(401, 'sign_in');
  if (!c.user.nickname) fail(403, 'nickname_needed');
  return c.user;
}

async function needOpen(c) {
  const open = await c.open();
  if (!open) fail(409, 'season_over');
  return open;
}

/** Image file type from its first bytes. */
function sniff(bytes) {
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'image/jpeg';
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  if (String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP') return 'image/webp';
  return null;
}

async function readImage(file, max) {
  if (!file || typeof file === 'string') return null;
  if (file.size > max) fail(413, 'image_too_large');
  const buf = new Uint8Array(await file.arrayBuffer());
  const type = sniff(buf);
  if (!type) fail(415, 'not_an_image');
  return { buf, type };
}

/** Checks posted picks against FPL data and the squad rules. */
function checkPicks(raw, fpl, captain, vice) {
  if (!Array.isArray(raw) || raw.length !== 15) fail(400, 'squad_15');
  const byId = new Map(fpl.players.map((p) => [p.id, p]));
  const picks = raw.map((p, i) => {
    const pl = byId.get(+p.id);
    if (!pl) fail(400, 'unknown_player', { id: p.id });
    return { id: pl.id, bench: i >= 11, slot: i + 1, name: pl.web_name, team: pl.team, pos: pl.element_type };
  });
  if (new Set(picks.map((p) => p.id)).size !== 15) fail(400, 'duplicate_player');
  const v = validate(picks, fpl);
  if (!v.ok) fail(400, 'squad_rules', { problems: v.problems });
  const ids = new Set(picks.map((p) => p.id));
  if (captain != null && !ids.has(+captain)) fail(400, 'bad_captain');
  if (vice != null && (!ids.has(+vice) || +vice === +captain)) fail(400, 'bad_vice');
  return picks.map((p) => ({ id: p.id, bench: p.bench }));
}

async function judgedCount(env, userId, gw) {
  const r = await env.DB.prepare('SELECT COUNT(*) AS n FROM votes WHERE user_id = ? AND gw = ?').bind(userId, gw).first();
  return r.n;
}

async function myTeam(env, userId, gw) {
  return env.DB.prepare('SELECT t.*, u.nickname, u.x_handle, u.demo FROM teams t JOIN users u ON u.id = t.user_id WHERE t.user_id = ? AND t.gw = ?')
    .bind(userId, gw)
    .first();
}

async function deleteTeamFiles(env, t) {
  const keys = [t.image_key, t.og_key].filter(Boolean);
  if (keys.length) await env.IMAGES.delete(keys);
}

// ==== routes

const routes = [];
const route = (method, pattern, handler) => routes.push({ method, re: new RegExp(`^${pattern}$`), handler });

route('GET', '/api/state', async (c) => {
  const open = await c.open();
  const u = c.user;
  let mine = null, judged = 0;
  if (u && open) {
    judged = await judgedCount(c.env, u.id, open.id);
    const t = await myTeam(c.env, u.id, open.id);
    if (t) mine = teamOut(t, { place: await placeOf(c.env, open.id, t.id, false) });
  }
  return json({
    now: c.now,
    gw: open,
    season: c.fpl.season || null,
    fplSource: c.fpl.source,
    user: u ? { id: u.id, nickname: u.nickname, x: u.x_handle, admin: isAdmin(c.env, u) } : null,
    mine,
    judged,
    minJudged: MIN_JUDGED,
    googleClientId: c.env.GOOGLE_CLIENT_ID || null,
    devLogin: c.env.DEV_LOGIN === '1',
  });
});

route('GET', '/api/fpl', async (c) =>
  json(
    { source: c.fpl.source, teams: c.fpl.teams, players: c.fpl.players, events: c.fpl.events, fixtures: c.fpl.fixtures },
    { headers: { 'cache-control': 'public, max-age=600' } },
  ),
);

// ==== auth

route('POST', '/api/auth/google', async (c) => {
  await rateLimit(c.env, `auth:${clientIp(c.req)}`, 30, 3600, c.now);
  const { credential } = await readJson(c.req);
  const g = await verifyGoogleToken(credential, c.env.GOOGLE_CLIENT_ID, c.now);
  let user = await c.env.DB.prepare('SELECT * FROM users WHERE google_sub = ?').bind(g.sub).first();
  if (user?.banned) fail(403, 'banned');
  if (!user) {
    user = await c.env.DB.prepare('INSERT INTO users (google_sub, email, created_at) VALUES (?, ?, ?) RETURNING *').bind(g.sub, g.email || null, c.now).first();
  } else if (g.email && g.email !== user.email) {
    await c.env.DB.prepare('UPDATE users SET email = ? WHERE id = ?').bind(g.email, user.id).run();
  }
  const cookie = await createSession(c.env, user.id, c.now, isSecure(c.req));
  const suggestion = user.nickname ? null : await suggestNickname(c.env, g.name || g.given_name);
  return json({ nickname: user.nickname, suggestion }, { headers: { 'set-cookie': cookie } });
});

// Development only: sign in as a test juror without Google.
route('POST', '/api/auth/dev', async (c) => {
  if (c.env.DEV_LOGIN !== '1') fail(404, 'not_found');
  const { name = 'tester' } = await readJson(c.req);
  const sub = `dev:${String(name).slice(0, 30)}`;
  let user = await c.env.DB.prepare('SELECT * FROM users WHERE google_sub = ?').bind(sub).first();
  if (!user) user = await c.env.DB.prepare('INSERT INTO users (google_sub, email, created_at) VALUES (?, ?, ?) RETURNING *').bind(sub, `${name}@example.test`, c.now).first();
  const cookie = await createSession(c.env, user.id, c.now, isSecure(c.req));
  return json({ nickname: user.nickname, suggestion: user.nickname ? null : await suggestNickname(c.env, name) }, { headers: { 'set-cookie': cookie } });
});

route('POST', '/api/auth/logout', async (c) => json({ ok: true }, { headers: { 'set-cookie': await endSession(c.env, c.req, isSecure(c.req)) } }));

route('PATCH', '/api/me', async (c) => {
  if (!c.user) fail(401, 'sign_in');
  const body = await readJson(c.req);
  const nickname = body.nickname !== undefined ? checkNickname(body.nickname) : c.user.nickname;
  if (!nickname) fail(400, 'nickname_format');
  const x = body.x !== undefined ? checkXHandle(body.x) : c.user.x_handle;
  const taken = await c.env.DB.prepare('SELECT id FROM users WHERE nickname = ? AND id != ?').bind(nickname, c.user.id).first();
  if (taken) fail(409, 'nickname_taken');
  await c.env.DB.prepare('UPDATE users SET nickname = ?, x_handle = ? WHERE id = ?').bind(nickname, x, c.user.id).run();
  return json({ nickname, x });
});

route('DELETE', '/api/me', async (c) => {
  const u = needUser(c);
  const teams = await c.env.DB.prepare('SELECT * FROM teams WHERE user_id = ?').bind(u.id).all();
  for (const t of teams.results) await deleteTeamFiles(c.env, t);
  // Take this juror's verdicts out of other squads' totals first.
  await c.env.DB.batch([
    c.env.DB.prepare(
      `UPDATE teams SET vote_sum = vote_sum - (SELECT score FROM votes WHERE votes.team_id = teams.id AND votes.user_id = ?1),
                        vote_count = vote_count - 1
        WHERE id IN (SELECT team_id FROM votes WHERE user_id = ?1)`,
    ).bind(u.id),
    c.env.DB.prepare('DELETE FROM votes WHERE user_id = ?').bind(u.id),
    c.env.DB.prepare('DELETE FROM reports WHERE user_id = ?').bind(u.id),
    c.env.DB.prepare('DELETE FROM results WHERE user_id = ?').bind(u.id),
    c.env.DB.prepare('DELETE FROM votes WHERE team_id IN (SELECT id FROM teams WHERE user_id = ?)').bind(u.id),
    c.env.DB.prepare('DELETE FROM teams WHERE user_id = ?').bind(u.id),
    c.env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(u.id),
    c.env.DB.prepare('DELETE FROM users WHERE id = ?').bind(u.id),
  ]);
  return json({ ok: true }, { headers: { 'set-cookie': await endSession(c.env, c.req, isSecure(c.req)) } });
});

route('GET', '/api/me/profile', async (c) => {
  const u = needUser(c);
  const open = await c.open();
  const [results, teams, verdicts] = await c.env.DB.batch([
    c.env.DB.prepare('SELECT r.gw, r.rank, r.avg, r.votes, t.share_key FROM results r JOIN teams t ON t.id = r.team_id WHERE r.user_id = ? ORDER BY r.gw DESC').bind(u.id),
    c.env.DB.prepare('SELECT gw, share_key, vote_sum, vote_count FROM teams WHERE user_id = ? ORDER BY gw DESC').bind(u.id),
    c.env.DB.prepare(
      `SELECT v.score, t.share_key, us.nickname FROM votes v JOIN teams t ON t.id = v.team_id JOIN users us ON us.id = t.user_id
        WHERE v.user_id = ? AND v.gw = ? ORDER BY v.updated_at DESC LIMIT 200`,
    ).bind(u.id, open?.id ?? -1),
  ]);
  const res = results.results;
  const byGw = new Map(res.map((r) => [r.gw, r]));
  const squads = teams.results.map((t) => {
    const r = byGw.get(t.gw);
    return { gw: t.gw, key: t.share_key, avg: r ? Math.round(r.avg * 10) / 10 : avgOf(t), votes: r ? r.votes : t.vote_count, rank: r?.rank ?? null, live: t.gw === open?.id };
  });
  const finals = res.filter((r) => r.votes);
  return json({
    stats: {
      average: finals.length ? Math.round((finals.reduce((s, r) => s + r.avg, 0) / finals.length) * 10) / 10 : null,
      gameweeks: teams.results.length,
      best: finals.length ? Math.min(...finals.map((r) => r.rank)) : null,
      top10: finals.filter((r) => r.rank <= 10).length,
      trophies: finals.filter((r) => r.rank <= 3).map((r) => ({ gw: r.gw, rank: r.rank })),
    },
    squads,
    verdicts: verdicts.results.map((v) => ({ key: v.share_key, nickname: v.nickname, score: v.score })),
  });
});

// ==== squads

route('POST', '/api/teams', async (c) => postTeam(c, false));
route('PUT', '/api/teams/mine', async (c) => postTeam(c, true));

async function postTeam(c, replace) {
  const u = needUser(c);
  const open = await needOpen(c);
  await rateLimit(c.env, `post:${u.id}`, 20, 3600, c.now);
  const form = await c.req.formData().catch(() => fail(400, 'bad_form'));
  let raw;
  try {
    raw = JSON.parse(form.get('picks'));
  } catch {
    fail(400, 'bad_picks');
  }
  const captain = form.get('captain') ? +form.get('captain') : null;
  const vice = form.get('vice') ? +form.get('vice') : null;
  const picks = checkPicks(raw, c.fpl, captain, vice);
  const shot = await readImage(form.get('image'), MAX_IMAGE);
  const og = await readImage(form.get('og'), MAX_OG);

  const existing = await myTeam(c.env, u.id, open.id);
  if (existing && !replace) fail(409, 'already_posted');
  if (!existing && replace) fail(404, 'no_squad');

  const key = existing?.share_key || randomKey(6);
  const stamp = randomKey(4); // new file names on replace, so caches never show the old squad
  const imageKey = shot ? `shot_${open.id}_${key}_${stamp}.${shot.type.split('/')[1]}` : null;
  const ogKey = og ? `og_${key}_${stamp}.${og.type.split('/')[1]}` : null;
  const put = (k, f) => c.env.IMAGES.put(k, f.buf, { httpMetadata: { contentType: f.type, cacheControl: 'public, max-age=31536000, immutable' } });
  if (shot) await put(imageKey, shot);
  if (og) await put(ogKey, og);

  if (existing) {
    await deleteTeamFiles(c.env, existing);
    await c.env.DB.batch([
      c.env.DB.prepare('DELETE FROM votes WHERE team_id = ?').bind(existing.id),
      c.env.DB.prepare('DELETE FROM reports WHERE team_id = ?').bind(existing.id),
      c.env.DB.prepare(
        'UPDATE teams SET image_key = ?, og_key = ?, picks_json = ?, captain_id = ?, vice_id = ?, vote_sum = 0, vote_count = 0, reports = 0, hidden = 0, updated_at = ? WHERE id = ?',
      ).bind(imageKey, ogKey, JSON.stringify(picks), captain, vice, c.now, existing.id),
    ]);
  } else {
    await c.env.DB.prepare(
      'INSERT INTO teams (user_id, gw, share_key, image_key, og_key, picks_json, captain_id, vice_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
      .bind(u.id, open.id, key, imageKey, ogKey, JSON.stringify(picks), captain, vice, c.now, c.now)
      .run();
  }
  const t = await myTeam(c.env, u.id, open.id);
  return json({ team: teamOut(t, { place: await placeOf(c.env, open.id, t.id, false) }) }, { status: existing ? 200 : 201 });
}

route('GET', '/api/teams/([A-Za-z0-9_-]{4,20})', async (c, key) => {
  const t = await c.env.DB.prepare('SELECT t.*, u.nickname, u.x_handle, u.demo FROM teams t JOIN users u ON u.id = t.user_id WHERE t.share_key = ?').bind(key).first();
  if (!t || (t.hidden && !isAdmin(c.env, c.user))) fail(404, 'not_found');
  const open = await c.open();
  const locked = t.gw !== open?.id;
  const mineFlag = c.user?.id === t.user_id;
  const my = c.user ? await c.env.DB.prepare('SELECT score FROM votes WHERE team_id = ? AND user_id = ?').bind(t.id, c.user.id).first() : null;
  // The jury average stays hidden until you have given your own verdict (or it is yours, or locked).
  const showAvg = locked || mineFlag || !!my;
  const out = teamOut(t, { mine: mineFlag, myVote: my?.score ?? null, locked, place: await placeOf(c.env, t.gw, t.id, locked) });
  if (!showAvg) { out.avg = null; out.place = null; }
  // How the jury voted (counts per score), for the owner and for locked gameweeks.
  if (mineFlag || locked) {
    const d = await c.env.DB.prepare('SELECT score, COUNT(*) AS n FROM votes WHERE team_id = ? GROUP BY score').bind(t.id).all();
    out.dist = Array.from({ length: 10 }, (_, i) => d.results.find((r) => r.score === i + 1)?.n ?? 0);
  }
  return json({ team: out });
});

// ==== judging

route('GET', '/api/judge/next', async (c) => {
  const open = await needOpen(c);
  const url = new URL(c.req.url);
  const n = Math.min(5, Math.max(1, +url.searchParams.get('n') || 3));
  const skip = (url.searchParams.get('skip') || '').split(',').filter((k) => /^[A-Za-z0-9_-]{4,20}$/.test(k)).slice(0, 200);
  const uid = c.user?.id ?? -1;
  const marks = skip.map(() => '?').join(',');
  const rows = await c.env.DB.prepare(
    `SELECT t.*, u.nickname, u.x_handle, u.demo FROM teams t JOIN users u ON u.id = t.user_id
      WHERE t.gw = ? AND t.hidden = 0 AND t.user_id != ?
        AND NOT EXISTS (SELECT 1 FROM votes v WHERE v.team_id = t.id AND v.user_id = ?)
        ${skip.length ? `AND t.share_key NOT IN (${marks})` : ''}
      ORDER BY t.vote_count ASC, random() LIMIT ?`,
  )
    .bind(open.id, uid, uid, ...skip, n)
    .all();
  // Averages are revealed only after the verdict, by the vote response.
  return json({ teams: rows.results.map((t) => ({ ...teamOut(t), avg: null })) });
});

route('POST', '/api/votes', async (c) => {
  const u = needUser(c);
  const open = await needOpen(c);
  const { key, score } = await readJson(c.req);
  const s = Number(score);
  if (!Number.isInteger(s) || s < 1 || s > 10) fail(400, 'score_1_10');
  await rateLimit(c.env, `vote:${u.id}`, 120, 3600, c.now);
  await rateLimit(c.env, `voteip:${clientIp(c.req)}`, 600, 3600, c.now);
  const t = await c.env.DB.prepare('SELECT * FROM teams WHERE share_key = ?').bind(key).first();
  if (!t || t.hidden) fail(404, 'not_found');
  if (t.gw !== open.id) fail(409, 'voting_closed');
  if (t.user_id === u.id) fail(403, 'own_squad');
  const old = await c.env.DB.prepare('SELECT score FROM votes WHERE team_id = ? AND user_id = ?').bind(t.id, u.id).first();
  if (old) {
    await c.env.DB.batch([
      c.env.DB.prepare('UPDATE votes SET score = ?, updated_at = ? WHERE team_id = ? AND user_id = ?').bind(s, c.now, t.id, u.id),
      c.env.DB.prepare('UPDATE teams SET vote_sum = vote_sum + ? WHERE id = ?').bind(s - old.score, t.id),
    ]);
  } else {
    await c.env.DB.batch([
      c.env.DB.prepare('INSERT INTO votes (team_id, user_id, gw, score, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').bind(t.id, u.id, open.id, s, c.now, c.now),
      c.env.DB.prepare('UPDATE teams SET vote_sum = vote_sum + ?, vote_count = vote_count + 1 WHERE id = ?').bind(s, t.id),
    ]);
  }
  c.ctx.waitUntil(refreshVoterWeight(c.env, u.id));
  const after = await c.env.DB.prepare('SELECT vote_sum, vote_count FROM teams WHERE id = ?').bind(t.id).first();
  return json({ avg: avgOf(after), votes: after.vote_count, judged: await judgedCount(c.env, u.id, open.id) });
});

// ==== leaderboard

route('GET', '/api/leaderboard', async (c) => {
  const open = await c.open();
  const url = new URL(c.req.url);
  const gw = +url.searchParams.get('gw') || open?.id;
  const gws = await c.env.DB.prepare("SELECT id, status FROM gameweeks WHERE id IN (SELECT DISTINCT gw FROM teams) OR status = 'open' ORDER BY id DESC").all();
  const row = (r, locked) => ({
    key: r.share_key, nickname: r.nickname, x: r.x_handle || null, demo: !!r.demo,
    avg: Math.round(r.avg * 10) / 10, votes: r.votes, rank: r.rank ?? null, mine: r.user_id === c.user?.id,
    needsVotes: r.needsVotes, needsJudged: r.needsJudged, locked,
  });
  if (!gw) return json({ gw: null, gameweeks: gws.results, ranked: [], pending: [] });
  if (gw === open?.id) {
    const s = await liveStandings(c.env, gw);
    const meRanked = s.ranked.find((r) => r.user_id === c.user?.id);
    const mePending = s.pending.find((r) => r.user_id === c.user?.id);
    return json(
      {
        gw, live: true, deadline: open.deadline, gameweeks: gws.results, total: s.total,
        ranked: s.ranked.slice(0, 100).map((r) => row(r, false)),
        pending: s.pending.slice(0, 50).map((r) => row(r, false)),
        me: meRanked ? row(meRanked, false) : mePending ? row(mePending, false) : null,
      },
      { headers: { 'cache-control': 'private, max-age=5' } },
    );
  }
  const res = await c.env.DB.prepare(
    `SELECT r.*, t.share_key, u.nickname, u.x_handle, u.demo FROM results r JOIN teams t ON t.id = r.team_id JOIN users u ON u.id = r.user_id
      WHERE r.gw = ? ORDER BY r.rank ASC`,
  )
    .bind(gw)
    .all();
  const all = res.results;
  const me = all.find((r) => r.user_id === c.user?.id);
  return json(
    { gw, live: false, gameweeks: gws.results, total: all.length, ranked: all.slice(0, 10).map((r) => row(r, true)), pending: [], me: me ? row(me, true) : null },
    { headers: { 'cache-control': 'private, max-age=60' } },
  );
});

route('GET', '/api/champions', async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT r.gw, r.avg, r.votes, t.share_key, u.nickname, u.x_handle, u.demo FROM results r
       JOIN teams t ON t.id = r.team_id JOIN users u ON u.id = r.user_id WHERE r.rank = 1 ORDER BY r.gw DESC`,
  ).all();
  return json({
    champions: rows.results.map((r) => ({ gw: r.gw, avg: Math.round(r.avg * 10) / 10, votes: r.votes, key: r.share_key, nickname: r.nickname, x: r.x_handle, demo: !!r.demo })),
  });
});

route('GET', '/api/season', async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT u.id, u.nickname, u.x_handle, u.demo, SUM(CASE WHEN r.rank <= 10 THEN 1 ELSE 0 END) AS top10,
            SUM(CASE WHEN r.rank = 1 THEN 1 ELSE 0 END) AS wins, AVG(r.avg) AS avg, MIN(r.rank) AS best, COUNT(*) AS played
       FROM results r JOIN users u ON u.id = r.user_id GROUP BY u.id
      HAVING top10 > 0 ORDER BY top10 DESC, wins DESC, avg DESC LIMIT 50`,
  ).all();
  return json({
    season: rows.results.map((r, i) => ({
      place: i + 1, nickname: r.nickname, x: r.x_handle, demo: !!r.demo, top10: r.top10, wins: r.wins,
      avg: Math.round(r.avg * 10) / 10, best: r.best, played: r.played, mine: r.id === c.user?.id,
    })),
  });
});

// ==== reports and admin

route('POST', '/api/reports', async (c) => {
  const u = needUser(c);
  await rateLimit(c.env, `report:${u.id}`, 30, 3600, c.now);
  const { key } = await readJson(c.req);
  const t = await c.env.DB.prepare('SELECT id, user_id FROM teams WHERE share_key = ?').bind(key).first();
  if (!t) fail(404, 'not_found');
  if (t.user_id === u.id) fail(403, 'own_squad');
  const ins = await c.env.DB.prepare('INSERT OR IGNORE INTO reports (team_id, user_id, created_at) VALUES (?, ?, ?)').bind(t.id, u.id, c.now).run();
  if (ins.meta.changes) {
    await c.env.DB.prepare('UPDATE teams SET reports = reports + 1, hidden = CASE WHEN reports + 1 >= 3 THEN 1 ELSE hidden END WHERE id = ?').bind(t.id).run();
  }
  return json({ ok: true });
});

function needAdmin(c) {
  const u = needUser(c);
  if (!isAdmin(c.env, u)) fail(403, 'admin_only');
  return u;
}

route('GET', '/api/admin/reports', async (c) => {
  needAdmin(c);
  const rows = await c.env.DB.prepare(
    `SELECT t.*, u.nickname, u.x_handle, u.demo, u.id AS owner FROM teams t JOIN users u ON u.id = t.user_id
      WHERE t.reports > 0 OR t.hidden = 1 ORDER BY t.hidden DESC, t.reports DESC LIMIT 100`,
  ).all();
  return json({ teams: rows.results.map((t) => teamOut(t, { reports: t.reports, hidden: !!t.hidden, owner: t.owner })) });
});

route('POST', '/api/admin/teams/([A-Za-z0-9_-]{4,20})', async (c, key) => {
  needAdmin(c);
  const { action } = await readJson(c.req);
  const t = await c.env.DB.prepare('SELECT * FROM teams WHERE share_key = ?').bind(key).first();
  if (!t) fail(404, 'not_found');
  if (action === 'restore') {
    await c.env.DB.batch([
      c.env.DB.prepare('DELETE FROM reports WHERE team_id = ?').bind(t.id),
      c.env.DB.prepare('UPDATE teams SET hidden = 0, reports = 0 WHERE id = ?').bind(t.id),
    ]);
  } else if (action === 'delete') {
    await deleteTeamFiles(c.env, t);
    await c.env.DB.batch([
      c.env.DB.prepare('DELETE FROM votes WHERE team_id = ?').bind(t.id),
      c.env.DB.prepare('DELETE FROM reports WHERE team_id = ?').bind(t.id),
      c.env.DB.prepare('DELETE FROM results WHERE team_id = ?').bind(t.id),
      c.env.DB.prepare('DELETE FROM teams WHERE id = ?').bind(t.id),
    ]);
  } else fail(400, 'bad_action');
  return json({ ok: true });
});

route('POST', '/api/admin/users/(\\d+)/ban', async (c, id) => {
  needAdmin(c);
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE users SET banned = 1 WHERE id = ?').bind(+id),
    c.env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(+id),
    c.env.DB.prepare('UPDATE teams SET hidden = 1 WHERE user_id = ?').bind(+id),
  ]);
  return json({ ok: true });
});

// ==== pages

/** Share page: the app shell with Open Graph and Twitter tags for this squad. */
async function sharePage(c, key) {
  const t = await c.env.DB.prepare('SELECT t.*, u.nickname FROM teams t JOIN users u ON u.id = t.user_id WHERE t.share_key = ? AND t.hidden = 0').bind(key).first();
  const shell = await c.env.ASSETS.fetch(new Request(new URL('/index.html', c.req.url)));
  let html = await shell.text();
  if (t) {
    const origin = new URL(c.req.url).origin;
    const title = `${t.nickname}'s GW${t.gw} squad on SquadJury`;
    const desc = t.vote_count ? `Jury verdict so far: ${avgOf(t)}/10 from ${t.vote_count} jurors. Give yours before the deadline.` : 'Judge this FPL squad from 1 to 10 before the deadline.';
    const img = t.og_key ? `${origin}/u/${t.og_key}` : `${origin}/img/og-default.png`;
    const meta = [
      `<meta property="og:title" content="${esc(title)}">`,
      `<meta property="og:description" content="${esc(desc)}">`,
      `<meta property="og:url" content="${esc(`${origin}/t/${key}`)}">`,
      `<meta property="og:image" content="${esc(img)}">`,
      '<meta property="og:image:width" content="1920"><meta property="og:image:height" content="1005">',
      '<meta name="twitter:card" content="summary_large_image">',
      `<meta name="twitter:title" content="${esc(title)}">`,
      `<meta name="twitter:description" content="${esc(desc)}">`,
      `<meta name="twitter:image" content="${esc(img)}">`,
    ].join('\n    ');
    html = html.replace(/<!-- og:start -->[\s\S]*?<!-- og:end -->/, meta).replace(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`);
  }
  // Keep the security headers (CSP and friends) that static assets get from public/_headers.
  const headers = new Headers(shell.headers);
  headers.set('content-type', 'text/html; charset=utf-8');
  headers.set('cache-control', 'no-cache');
  headers.delete('content-length');
  headers.delete('etag');
  return new Response(html, { headers });
}

async function image(c, key) {
  const obj = await c.env.IMAGES.get(key);
  if (!obj) return new Response('Not found', { status: 404 });
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set('etag', obj.httpEtag);
  headers.set('x-content-type-options', 'nosniff');
  return new Response(obj.body, { headers });
}

// ==== entry

const SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'x-frame-options': 'DENY',
};

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const now = clock(req, env);
    let res;
    try {
      const upload = url.pathname.match(/^\/u\/([A-Za-z0-9_.-]{6,80})$/);
      if (upload) return await image({ env, req }, upload[1]);
      checkOrigin(req);
      const fpl = await getFpl(env, now);
      let openMemo;
      const c = {
        req, env, ctx, now, fpl,
        user: await currentUser(env, req, now),
        open: async () => (openMemo ??= await syncGameweeks(env, fpl, now)),
      };
      const share = url.pathname.match(/^\/t\/([A-Za-z0-9_-]{4,20})\/?$/);
      if (share) return await sharePage(c, share[1]);
      for (const r of routes) {
        const m = url.pathname.match(r.re);
        if (m && r.method === req.method) {
          res = await r.handler(c, ...m.slice(1));
          break;
        }
      }
      if (!res) res = url.pathname.startsWith('/api/') ? json({ error: 'not_found' }, { status: 404 }) : await env.ASSETS.fetch(req);
    } catch (e) {
      if (e instanceof HttpError) res = json({ error: e.code, ...e.extra }, { status: e.status });
      else {
        console.log(JSON.stringify({ msg: 'unhandled', path: url.pathname, error: String(e?.stack || e) }));
        res = json({ error: 'server_error' }, { status: 500 });
      }
    }
    if (url.pathname.startsWith('/api/')) {
      res = new Response(res.body, res);
      for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.headers.set(k, v);
    }
    return res;
  },

  /** Every 5 minutes: lock gameweeks past their deadline. Every hour: refresh FPL data and tidy images. */
  async scheduled(event, env, ctx) {
    const now = Date.now();
    const hourly = event.cron === '0 * * * *';
    const fpl = await getFpl(env, now, { refresh: hourly });
    await syncGameweeks(env, fpl, now);
    if (hourly) ctx.waitUntil(cleanupImages(env));
  },
};

/** Screenshots older than two locked gameweeks are removed, except the top 10. Share cards stay. */
async function cleanupImages(env) {
  const old = await env.DB.prepare(
    `SELECT t.id, t.image_key FROM teams t
      WHERE t.image_key IS NOT NULL
        AND t.gw <= (SELECT MAX(id) - 2 FROM gameweeks WHERE status = 'locked')
        AND NOT EXISTS (SELECT 1 FROM results r WHERE r.team_id = t.id AND r.rank <= 10)
      LIMIT 500`,
  ).all();
  if (!old.results.length) return;
  await env.IMAGES.delete(old.results.map((r) => r.image_key));
  await env.DB.batch(old.results.map((r) => env.DB.prepare('UPDATE teams SET image_key = NULL WHERE id = ?').bind(r.id)));
}
