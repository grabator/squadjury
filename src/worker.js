// SquadJury Worker: JSON API, images from R2, share pages and the deadline cron.
// Static files (the app itself) are served by Workers static assets.

import { json, fail, HttpError, readJson, checkOrigin, clientIp, rateLimit, randomKey, esc } from './lib/http.js';
import { verifyGoogleToken, createSession, endSession, currentUser, isAdmin, checkNickname, checkXHandle, suggestNickname } from './lib/auth.js';
import { getFpl } from './lib/fpl.js';
import { syncGameweeks, liveStandings, refreshVoterWeight, teamOut, placeOf, avgOf } from './lib/core.js';
import { validate } from '../public/js/ocr/match.js';
import { judgeTarget } from './lib/rank.js';
import { seasonOf, gwKey, gwNum } from './lib/season.js';
import { runBackup, listBackups } from './lib/backup.js';
import { newCode, parseCode, checkLeagueName, rerank, seasonTable, MAX_LEAGUES_PER_USER, MAX_MEMBERS, NEW_LEAGUES_PER_DAY } from './lib/leagues.js';

const MAX_IMAGE = 3 * 1024 * 1024;
const BACKUP_CRON = '17 4 * * 1'; // Mondays 04:17 UTC, same as in wrangler.jsonc
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
  const keys = [t.image_key, t.og_key, t.rate_og_key].filter(Boolean);
  if (keys.length) await env.IMAGES.delete(keys);
}

/** Channel names that can be counted: wa, vb, ms, x, copy, share, or a creator's name. */
const cleanSource = (s) => (/^[a-z0-9_-]{1,24}$/i.test(String(s || '')) ? String(s).toLowerCase() : null);

/** Where a new user came from: { source, referredBy } from { s, key } (rate or squad link) or { s, league }. */
async function resolveRef(env, ref) {
  if (!ref || typeof ref !== 'object') return { source: null, referredBy: null };
  let referredBy = null;
  if (/^[A-Za-z0-9_-]{4,20}$/.test(ref.key || '')) {
    referredBy = (await env.DB.prepare('SELECT user_id FROM teams WHERE share_key = ?').bind(ref.key).first())?.user_id ?? null;
  } else if (/^[A-Za-z0-9]{6}$/.test(ref.league || '')) {
    referredBy = (await env.DB.prepare('SELECT owner_id FROM leagues WHERE code = ?').bind(String(ref.league).toUpperCase()).first())?.owner_id ?? null;
  }
  return { source: cleanSource(ref.s) || (referredBy ? 'link' : null), referredBy };
}

/** Counts one link open: per day, channel and kind. */
async function countVisit(env, now, source, kind) {
  const day = new Date(now).toISOString().slice(0, 10);
  await env.DB.prepare('INSERT INTO visits (day, source, kind, n) VALUES (?, ?, ?, 1) ON CONFLICT(day, source, kind) DO UPDATE SET n = n + 1')
    .bind(day, cleanSource(source) || 'direct', kind).run();
}

// ==== routes

const routes = [];
const route = (method, pattern, handler) => routes.push({ method, re: new RegExp(`^${pattern}$`), handler });

route('GET', '/api/state', async (c) => {
  const open = await c.open();
  const u = c.user;
  let mine = null, judged = 0, minJudged = 0;
  if (open) {
    const n = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM teams WHERE gw = ? AND hidden = 0').bind(open.id).first();
    minJudged = judgeTarget(n.n);
  }
  if (u && open) {
    judged = await judgedCount(c.env, u.id, open.id);
    const t = await myTeam(c.env, u.id, open.id);
    if (t) mine = teamOut(t, { place: await placeOf(c.env, open.id, t.id, false) });
  }
  return json({
    now: c.now,
    gw: open ? { id: open.num, deadline: open.deadline } : null,
    season: c.fpl.season || null,
    fplSource: c.fpl.source,
    user: u ? { id: u.id, nickname: u.nickname, x: u.x_handle, admin: isAdmin(c.env, u) } : null,
    mine,
    judged,
    minJudged,
    // Deadline of the gameweek before the open one: the clock shows how much of the window is gone.
    prevDeadline: open ? (() => {
      const prev = c.fpl.events.filter((e) => Date.parse(e.deadline_time) <= c.now).pop();
      return prev ? Date.parse(prev.deadline_time) : null;
    })() : null,
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
  const { credential, ref } = await readJson(c.req);
  const g = await verifyGoogleToken(credential, c.env.GOOGLE_CLIENT_ID, c.now);
  let user = await c.env.DB.prepare('SELECT * FROM users WHERE google_sub = ?').bind(g.sub).first();
  if (user?.banned) fail(403, 'banned');
  if (!user) {
    const { source, referredBy } = await resolveRef(c.env, ref);
    user = await c.env.DB.prepare('INSERT INTO users (google_sub, email, created_at, source, referred_by) VALUES (?, ?, ?, ?, ?) RETURNING *')
      .bind(g.sub, g.email || null, c.now, source, referredBy).first();
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
  const { name = 'tester', ref } = await readJson(c.req);
  const sub = `dev:${String(name).slice(0, 30)}`;
  let user = await c.env.DB.prepare('SELECT * FROM users WHERE google_sub = ?').bind(sub).first();
  if (!user) {
    const { source, referredBy } = await resolveRef(c.env, ref);
    user = await c.env.DB.prepare('INSERT INTO users (google_sub, email, created_at, source, referred_by) VALUES (?, ?, ?, ?, ?) RETURNING *')
      .bind(sub, `${name}@example.test`, c.now, source, referredBy).first();
  }
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
  // Leagues this user started go to their oldest member (or away, when nobody is left).
  const owned = await c.env.DB.prepare('SELECT * FROM leagues WHERE owner_id = ?').bind(u.id).all();
  for (const l of owned.results) await handOver(c.env, l, u.id);
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
    c.env.DB.prepare('DELETE FROM league_members WHERE user_id = ?').bind(u.id),
    c.env.DB.prepare('DELETE FROM users WHERE id = ?').bind(u.id),
  ]);
  return json({ ok: true }, { headers: { 'set-cookie': await endSession(c.env, c.req, isSecure(c.req)) } });
});

route('GET', '/api/me/profile', async (c) => {
  const u = needUser(c);
  const open = await c.open();
  const [results, teams] = await c.env.DB.batch([
    c.env.DB.prepare('SELECT r.gw, r.rank, r.avg, r.votes, t.share_key FROM results r JOIN teams t ON t.id = r.team_id WHERE r.user_id = ? ORDER BY r.gw DESC').bind(u.id),
    c.env.DB.prepare('SELECT gw, season, share_key, vote_sum, vote_count FROM teams WHERE user_id = ? ORDER BY gw DESC').bind(u.id),
  ]);
  const res = results.results;
  const byGw = new Map(res.map((r) => [r.gw, r]));
  const squads = teams.results.map((t) => {
    const r = byGw.get(t.gw);
    return { gw: gwNum(t.gw), season: t.season, key: t.share_key, avg: r ? Math.round(r.avg * 10) / 10 : avgOf(t), votes: r ? r.votes : t.vote_count, rank: r?.rank ?? null, live: t.gw === open?.id };
  });
  const finals = res.filter((r) => r.votes);
  return json({
    stats: {
      average: finals.length ? Math.round((finals.reduce((s, r) => s + r.avg, 0) / finals.length) * 10) / 10 : null,
      gameweeks: teams.results.length,
      best: finals.length ? Math.min(...finals.map((r) => r.rank)) : null,
      top10: finals.filter((r) => r.rank <= 10).length,
      trophies: finals.filter((r) => r.rank <= 3).map((r) => ({ gw: gwNum(r.gw), rank: r.rank })),
    },
    squads,
  });
});

// Your verdicts, one gameweek and one page at a time (no endless lists).
route('GET', '/api/me/verdicts', async (c) => {
  const u = needUser(c);
  const open = await c.open();
  const url = new URL(c.req.url);
  const size = Math.min(50, Math.max(1, +url.searchParams.get('size') || 20));
  const counts = await c.env.DB.prepare('SELECT gw, COUNT(*) AS n FROM votes WHERE user_id = ? AND gw > ? AND gw < ? GROUP BY gw ORDER BY gw DESC')
    .bind(u.id, c.season.base, c.season.base + 100).all();
  const asked = +url.searchParams.get('gw');
  const gw = asked ? gwKey(c.season, asked) : open?.id || counts.results[0]?.gw || 0;
  const gws = counts.results.map((r) => ({ gw: gwNum(r.gw), count: r.n }));
  const total = counts.results.find((g) => g.gw === gw)?.n || 0;
  const pages = Math.max(1, Math.ceil(total / size));
  const page = Math.min(pages, Math.max(1, +url.searchParams.get('page') || 1));
  const rows = await c.env.DB.prepare(
    `SELECT v.score, t.share_key, us.nickname, us.demo FROM votes v JOIN teams t ON t.id = v.team_id JOIN users us ON us.id = t.user_id
      WHERE v.user_id = ? AND v.gw = ? ORDER BY v.updated_at DESC LIMIT ? OFFSET ?`,
  ).bind(u.id, gw, size, (page - 1) * size).all();
  return json({
    gw: gwNum(gw), open: gw === open?.id, total, page, pages, size, gws,
    items: rows.results.map((v) => ({ key: v.share_key, nickname: v.nickname, score: v.score, demo: !!v.demo })),
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
      'INSERT INTO teams (user_id, gw, season, share_key, image_key, og_key, picks_json, captain_id, vice_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
      .bind(u.id, open.id, open.season, key, imageKey, ogKey, JSON.stringify(picks), captain, vice, c.now, c.now)
      .run();
  }
  const t = await myTeam(c.env, u.id, open.id);
  return json({ team: teamOut(t, { place: await placeOf(c.env, open.id, t.id, false) }) }, { status: existing ? 200 : 201 });
}

// The "Rate my team" preview image is drawn in the owner's browser and stored next to the squad.
route('PUT', '/api/teams/mine/rate-og', async (c) => {
  const u = needUser(c);
  const open = await needOpen(c);
  await rateLimit(c.env, `rateog:${u.id}`, 20, 3600, c.now);
  const t = await myTeam(c.env, u.id, open.id);
  if (!t) fail(404, 'no_squad');
  const form = await c.req.formData().catch(() => fail(400, 'bad_form'));
  const og = await readImage(form.get('og'), MAX_OG);
  if (!og) fail(400, 'not_an_image');
  const key = `rate_${t.share_key}_${randomKey(4)}.${og.type.split('/')[1]}`;
  await c.env.IMAGES.put(key, og.buf, { httpMetadata: { contentType: og.type, cacheControl: 'public, max-age=31536000, immutable' } });
  if (t.rate_og_key) await c.env.IMAGES.delete(t.rate_og_key);
  await c.env.DB.prepare('UPDATE teams SET rate_og_key = ? WHERE id = ?').bind(key, t.id).run();
  return json({ ok: true });
});

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
    const m = await c.env.DB.prepare('SELECT AVG(score) AS avg FROM votes WHERE gw = ?').bind(t.gw).first();
    out.gwAvg = m.avg != null ? Math.round(m.avg * 10) / 10 : null;
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
  // Squads of people in your leagues come first, marked with the league's name.
  const rows = await c.env.DB.prepare(
    `SELECT t.*, u.nickname, u.x_handle, u.demo, lg.league FROM teams t JOIN users u ON u.id = t.user_id
       LEFT JOIN (SELECT b.user_id AS uid, MIN(l.name) AS league FROM league_members a
                    JOIN league_members b ON b.league_id = a.league_id JOIN leagues l ON l.id = a.league_id
                   WHERE a.user_id = ? GROUP BY b.user_id) lg ON lg.uid = t.user_id
      WHERE t.gw = ? AND t.hidden = 0 AND t.user_id != ?
        AND NOT EXISTS (SELECT 1 FROM votes v WHERE v.team_id = t.id AND v.user_id = ?)
        ${skip.length ? `AND t.share_key NOT IN (${marks})` : ''}
      ORDER BY lg.league IS NULL, t.vote_count ASC, random() LIMIT ?`,
  )
    .bind(uid, open.id, uid, uid, ...skip, n)
    .all();
  // Averages are revealed only after the verdict, by the vote response.
  return json({ teams: rows.results.map((t) => ({ ...teamOut(t), avg: null, league: t.league || null })) });
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
      c.env.DB.prepare('INSERT INTO votes (team_id, user_id, gw, season, score, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(t.id, u.id, open.id, open.season, s, c.now, c.now),
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
  const asked = +url.searchParams.get('gw');
  const gw = asked ? gwKey(c.season, asked) : open?.id;
  const gwRows = await c.env.DB.prepare("SELECT id, status FROM gameweeks WHERE (id IN (SELECT DISTINCT gw FROM teams) OR status = 'open') AND id > ? AND id < ? ORDER BY id DESC")
    .bind(c.season.base, c.season.base + 100).all();
  const gws = { results: gwRows.results.map((g) => ({ id: gwNum(g.id), status: g.status })) };
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
        gw: gwNum(gw), live: true, deadline: open.deadline, gameweeks: gws.results, total: s.total,
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
    { gw: gwNum(gw), live: false, gameweeks: gws.results, total: all.length, ranked: all.slice(0, 10).map((r) => row(r, true)), pending: [], me: me ? row(me, true) : null },
    { headers: { 'cache-control': 'private, max-age=60' } },
  );
});

route('GET', '/api/champions', async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT r.gw, r.avg, r.votes, t.share_key, u.nickname, u.x_handle, u.demo FROM results r
       JOIN teams t ON t.id = r.team_id JOIN users u ON u.id = r.user_id WHERE r.rank = 1 AND r.gw > ? AND r.gw < ? ORDER BY r.gw DESC`,
  ).bind(c.season.base, c.season.base + 100).all();
  return json({
    champions: rows.results.map((r) => ({ gw: gwNum(r.gw), avg: Math.round(r.avg * 10) / 10, votes: r.votes, key: r.share_key, nickname: r.nickname, x: r.x_handle, demo: !!r.demo })),
  });
});

route('GET', '/api/season', async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT u.id, u.nickname, u.x_handle, u.demo, SUM(CASE WHEN r.rank <= 10 THEN 1 ELSE 0 END) AS top10,
            SUM(CASE WHEN r.rank = 1 THEN 1 ELSE 0 END) AS wins, AVG(r.avg) AS avg, MIN(r.rank) AS best, COUNT(*) AS played
       FROM results r JOIN users u ON u.id = r.user_id WHERE r.gw > ? AND r.gw < ? GROUP BY u.id
      HAVING top10 > 0 ORDER BY top10 DESC, wins DESC, avg DESC LIMIT 50`,
  ).bind(c.season.base, c.season.base + 100).all();
  return json({
    season: rows.results.map((r, i) => ({
      place: i + 1, nickname: r.nickname, x: r.x_handle, demo: !!r.demo, top10: r.top10, wins: r.wins,
      avg: Math.round(r.avg * 10) / 10, best: r.best, played: r.played, mine: r.id === c.user?.id,
    })),
  });
});

// ==== leagues

async function leagueBy(c, code) {
  const l = await c.env.DB.prepare('SELECT * FROM leagues WHERE code = ?').bind(String(code).toUpperCase()).first();
  if (!l) fail(404, 'league_not_found');
  return l;
}

async function memberOf(c, league) {
  if (!c.user) return false;
  return !!(await c.env.DB.prepare('SELECT 1 FROM league_members WHERE league_id = ? AND user_id = ?').bind(league.id, c.user.id).first());
}

async function leagueOut(c, l) {
  const [count, members, owner] = await c.env.DB.batch([
    c.env.DB.prepare('SELECT COUNT(*) AS n FROM league_members WHERE league_id = ?').bind(l.id),
    c.env.DB.prepare('SELECT u.id, u.nickname FROM league_members m JOIN users u ON u.id = m.user_id WHERE m.league_id = ? ORDER BY m.joined_at LIMIT 8').bind(l.id),
    c.env.DB.prepare('SELECT nickname FROM users WHERE id = ?').bind(l.owner_id),
  ]);
  return {
    code: l.code, name: l.name, owner: owner.results[0]?.nickname || null, members: count.results[0].n,
    faces: members.results.map((m) => m.nickname), isOwner: c.user?.id === l.owner_id, isMember: await memberOf(c, l),
    og: l.og_key ? `/u/${l.og_key}` : null,
  };
}

async function leaguesOfUser(env, userId) {
  const r = await env.DB.prepare(
    `SELECT l.code, l.name, l.owner_id, (SELECT COUNT(*) FROM league_members x WHERE x.league_id = l.id) AS members
       FROM league_members m JOIN leagues l ON l.id = m.league_id WHERE m.user_id = ? ORDER BY m.joined_at`,
  ).bind(userId).all();
  return r.results.map((l) => ({ code: l.code, name: l.name, members: l.members, isOwner: l.owner_id === userId }));
}

async function joinLeague(c, l) {
  const u = needUser(c);
  if (await memberOf(c, l)) return;
  const [mine, members] = await c.env.DB.batch([
    c.env.DB.prepare('SELECT COUNT(*) AS n FROM league_members WHERE user_id = ?').bind(u.id),
    c.env.DB.prepare('SELECT COUNT(*) AS n FROM league_members WHERE league_id = ?').bind(l.id),
  ]);
  if (mine.results[0].n >= MAX_LEAGUES_PER_USER) fail(409, 'too_many_leagues');
  if (members.results[0].n >= MAX_MEMBERS) fail(409, 'league_full');
  await c.env.DB.prepare('INSERT OR IGNORE INTO league_members (league_id, user_id, joined_at) VALUES (?, ?, ?)').bind(l.id, u.id, c.now).run();
}

/** The owner leaves or deletes the account: the oldest member takes over, an empty league goes. */
async function handOver(env, l, leavingId) {
  const next = await env.DB.prepare('SELECT user_id FROM league_members WHERE league_id = ? AND user_id != ? ORDER BY joined_at LIMIT 1').bind(l.id, leavingId).first();
  if (next) await env.DB.prepare('UPDATE leagues SET owner_id = ? WHERE id = ?').bind(next.user_id, l.id).run();
  else {
    if (l.og_key) await env.IMAGES.delete(l.og_key);
    await env.DB.prepare('DELETE FROM leagues WHERE id = ?').bind(l.id).run();
  }
}

route('POST', '/api/leagues', async (c) => {
  const u = needUser(c);
  const { name } = await readJson(c.req);
  const clean = checkLeagueName(name);
  await rateLimit(c.env, `league:${u.id}`, NEW_LEAGUES_PER_DAY, 86400, c.now);
  const mine = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM league_members WHERE user_id = ?').bind(u.id).first();
  if (mine.n >= MAX_LEAGUES_PER_USER) fail(409, 'too_many_leagues');
  let l;
  for (let i = 0; i < 6 && !l; i++) {
    l = await c.env.DB.prepare('INSERT OR IGNORE INTO leagues (code, name, owner_id, created_at) VALUES (?, ?, ?, ?) RETURNING *').bind(newCode(), clean, u.id, c.now).first();
  }
  if (!l) fail(500, 'server_error');
  await c.env.DB.prepare('INSERT INTO league_members (league_id, user_id, joined_at) VALUES (?, ?, ?)').bind(l.id, u.id, c.now).run();
  return json({ league: await leagueOut(c, l) }, { status: 201 });
});

route('POST', '/api/leagues/join', async (c) => {
  needUser(c);
  await rateLimit(c.env, `join:${c.user.id}`, 30, 3600, c.now);
  const { code } = await readJson(c.req);
  const parsed = parseCode(code);
  if (!parsed) fail(400, 'league_code_format');
  const l = await leagueBy(c, parsed);
  await joinLeague(c, l);
  return json({ league: await leagueOut(c, l) });
});

route('GET', '/api/leagues/mine', async (c) => {
  const u = needUser(c);
  return json({ leagues: await leaguesOfUser(c.env, u.id) });
});

route('GET', '/api/leagues/([A-Za-z0-9]{6})', async (c, code) => {
  const l = await leagueBy(c, code);
  const out = await leagueOut(c, l);
  // Top 3 of the last finished gameweek, to show what the league is about.
  const last = await c.env.DB.prepare(
    `SELECT r.gw, r.avg, r.rank, u.nickname FROM results r JOIN league_members m ON m.user_id = r.user_id AND m.league_id = ? JOIN users u ON u.id = r.user_id
      WHERE r.gw = (SELECT MAX(r2.gw) FROM results r2 JOIN league_members m2 ON m2.user_id = r2.user_id AND m2.league_id = ? WHERE r2.gw > ? AND r2.gw < ?)
      ORDER BY r.rank LIMIT 3`,
  ).bind(l.id, l.id, c.season.base, c.season.base + 100).all();
  out.top = last.results.map((r, i) => ({ place: i + 1, nickname: r.nickname, avg: Math.round(r.avg * 10) / 10, gw: gwNum(r.gw) }));
  if (out.isMember) {
    const m = await c.env.DB.prepare('SELECT u.id, u.nickname FROM league_members m JOIN users u ON u.id = m.user_id WHERE m.league_id = ? ORDER BY m.joined_at').bind(l.id).all();
    out.memberList = m.results.map((x) => ({ id: x.id, nickname: x.nickname, owner: x.id === l.owner_id, me: x.id === c.user.id }));
  }
  return json({ league: out });
});

route('GET', '/api/leagues/([A-Za-z0-9]{6})/standings', async (c, code) => {
  const l = await leagueBy(c, code);
  if (!(await memberOf(c, l))) fail(403, 'not_member');
  const open = await c.open();
  const url = new URL(c.req.url);
  const ids = (await c.env.DB.prepare('SELECT user_id FROM league_members WHERE league_id = ?').bind(l.id).all()).results.map((r) => r.user_id);
  const isMember = (id) => ids.includes(id);
  const me = c.user.id;
  if (url.searchParams.get('type') === 'season') {
    const res = await c.env.DB.prepare(
      `SELECT r.gw, r.user_id, r.rank, r.avg FROM results r JOIN league_members m ON m.user_id = r.user_id AND m.league_id = ? WHERE r.gw > ? AND r.gw < ?`,
    ).bind(l.id, c.season.base, c.season.base + 100).all();
    const table = seasonTable(res.results);
    const names = new Map((await c.env.DB.prepare('SELECT u.id, u.nickname, u.demo FROM league_members m JOIN users u ON u.id = m.user_id WHERE m.league_id = ?').bind(l.id).all()).results.map((u) => [u.id, u]));
    return json({ type: 'season', members: ids.length, season: table.map((r) => ({ ...r, nickname: names.get(r.user_id)?.nickname, demo: !!names.get(r.user_id)?.demo, mine: r.user_id === me, user_id: undefined })) });
  }
  const asked = +url.searchParams.get('gw');
  const gw = asked ? gwKey(c.season, asked) : open?.id;
  const row = (r, locked) => ({
    key: r.share_key, nickname: r.nickname, x: r.x_handle || null, demo: !!r.demo, avg: Math.round(r.avg * 10) / 10, votes: r.votes,
    rank: r.rank ?? null, mine: r.user_id === me, needsVotes: r.needsVotes, needsJudged: r.needsJudged, locked,
  });
  if (!gw) return json({ gw: null, members: ids.length, ranked: [], pending: [], missing: [] });
  let ranked, pending = [], posted;
  if (gw === open?.id) {
    const s = await liveStandings(c.env, gw);
    ranked = rerank(s.ranked.filter((r) => isMember(r.user_id))).map((r) => row(r, false));
    pending = s.pending.filter((r) => isMember(r.user_id)).map((r) => row(r, false));
    posted = new Set([...s.ranked, ...s.pending].filter((r) => isMember(r.user_id)).map((r) => r.user_id));
  } else {
    const res = await c.env.DB.prepare(
      `SELECT r.*, t.share_key, u.nickname, u.x_handle, u.demo FROM results r JOIN teams t ON t.id = r.team_id JOIN users u ON u.id = r.user_id
        JOIN league_members m ON m.user_id = r.user_id AND m.league_id = ? WHERE r.gw = ? ORDER BY r.rank`,
    ).bind(l.id, gw).all();
    ranked = rerank(res.results).map((r) => row(r, true));
    const t2 = await c.env.DB.prepare('SELECT t.user_id FROM teams t JOIN league_members m ON m.user_id = t.user_id AND m.league_id = ? WHERE t.gw = ?').bind(l.id, gw).all();
    posted = new Set(t2.results.map((r) => r.user_id));
  }
  const missingIds = ids.filter((id) => !posted.has(id));
  const missing = missingIds.length
    ? (await c.env.DB.prepare(`SELECT id, nickname FROM users WHERE id IN (${missingIds.map(() => '?').join(',')})`).bind(...missingIds).all()).results.map((u) => ({ nickname: u.nickname, mine: u.id === me }))
    : [];
  return json({ gw: gwNum(gw), live: gw === open?.id, members: ids.length, ranked, pending, missing });
});

route('POST', '/api/leagues/([A-Za-z0-9]{6})/leave', async (c, code) => {
  const u = needUser(c);
  const l = await leagueBy(c, code);
  await c.env.DB.prepare('DELETE FROM league_members WHERE league_id = ? AND user_id = ?').bind(l.id, u.id).run();
  if (l.owner_id === u.id) await handOver(c.env, l, u.id);
  return json({ ok: true });
});

async function needOwner(c, code) {
  const u = needUser(c);
  const l = await leagueBy(c, code);
  if (l.owner_id !== u.id) fail(403, 'owner_only');
  return l;
}

route('POST', '/api/leagues/([A-Za-z0-9]{6})/kick', async (c, code) => {
  const l = await needOwner(c, code);
  const { userId } = await readJson(c.req);
  if (+userId === l.owner_id) fail(400, 'cannot_kick_owner');
  await c.env.DB.prepare('DELETE FROM league_members WHERE league_id = ? AND user_id = ?').bind(l.id, +userId).run();
  return json({ ok: true });
});

route('POST', '/api/leagues/([A-Za-z0-9]{6})/rename', async (c, code) => {
  const l = await needOwner(c, code);
  const { name } = await readJson(c.req);
  const clean = checkLeagueName(name);
  await c.env.DB.prepare('UPDATE leagues SET name = ? WHERE id = ?').bind(clean, l.id).run();
  return json({ league: await leagueOut(c, { ...l, name: clean }) });
});

route('POST', '/api/leagues/([A-Za-z0-9]{6})/new-code', async (c, code) => {
  const l = await needOwner(c, code);
  await rateLimit(c.env, `newcode:${l.id}`, 10, 86400, c.now);
  let fresh = null;
  for (let i = 0; i < 6 && !fresh; i++) {
    const cand = newCode();
    const r = await c.env.DB.prepare('UPDATE leagues SET code = ? WHERE id = ? AND NOT EXISTS (SELECT 1 FROM leagues WHERE code = ?)').bind(cand, l.id, cand).run();
    if (r.meta.changes) fresh = cand;
  }
  if (!fresh) fail(500, 'server_error');
  return json({ league: await leagueOut(c, { ...l, code: fresh }) });
});

// The link preview of a league is drawn by the owner's browser, like the squad previews.
route('PUT', '/api/leagues/([A-Za-z0-9]{6})/og', async (c, code) => {
  const l = await needOwner(c, code);
  await rateLimit(c.env, `leagueog:${l.id}`, 20, 3600, c.now);
  const form = await c.req.formData().catch(() => fail(400, 'bad_form'));
  const og = await readImage(form.get('og'), MAX_OG);
  if (!og) fail(400, 'not_an_image');
  const key = `league_${l.id}_${randomKey(4)}.${og.type.split('/')[1]}`;
  await c.env.IMAGES.put(key, og.buf, { httpMetadata: { contentType: og.type, cacheControl: 'public, max-age=31536000, immutable' } });
  if (l.og_key) await c.env.IMAGES.delete(l.og_key);
  await c.env.DB.prepare('UPDATE leagues SET og_key = ? WHERE id = ?').bind(key, l.id).run();
  return json({ ok: true });
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

// Where people come from, last 30 days: link opens and new accounts per channel.
route('GET', '/api/admin/sources', async (c) => {
  needAdmin(c);
  const since = new Date(c.now - 30 * 864e5).toISOString().slice(0, 10);
  const [opens, signups] = await c.env.DB.batch([
    c.env.DB.prepare('SELECT source, kind, SUM(n) AS n FROM visits WHERE day >= ? GROUP BY source, kind ORDER BY n DESC').bind(since),
    c.env.DB.prepare("SELECT COALESCE(source, 'direct') AS source, COUNT(*) AS n FROM users WHERE created_at >= ? AND demo = 0 GROUP BY 1 ORDER BY n DESC").bind(c.now - 30 * 864e5),
  ]);
  const rows = new Map();
  const row = (s) => rows.get(s) || rows.set(s, { source: s, opens: 0, rate: 0, squad: 0, league: 0, signups: 0 }).get(s);
  for (const o of opens.results) {
    const r = row(o.source);
    r.opens += o.n;
    if (o.kind === 'r') r.rate += o.n;
    else if (o.kind === 't') r.squad += o.n;
    else if (o.kind === 'l') r.league += o.n;
  }
  for (const u of signups.results) row(u.source).signups += u.n;
  return json({ since, sources: [...rows.values()].sort((a, b) => b.signups - a.signups || b.opens - a.opens) });
});

route('GET', '/api/admin/backups', async (c) => {
  needAdmin(c);
  return json({ backups: await listBackups(c.env) });
});

route('POST', '/api/admin/backup', async (c) => {
  needAdmin(c);
  await rateLimit(c.env, `backup:${c.user.id}`, 6, 3600, c.now);
  return json({ backup: await runBackup(c.env, c.now) });
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

/**
 * Share page: the app shell with Open Graph and Twitter tags for this squad.
 * kind 't' is the squad link, kind 'r' the "Rate my team" link with its own preview image.
 */
async function sharePage(c, key, kind = 't') {
  const t = await c.env.DB.prepare('SELECT t.*, u.nickname FROM teams t JOIN users u ON u.id = t.user_id WHERE t.share_key = ? AND t.hidden = 0').bind(key).first();
  const shell = await c.env.ASSETS.fetch(new Request(new URL('/index.html', c.req.url)));
  let html = await shell.text();
  c.ctx.waitUntil(countVisit(c.env, c.now, new URL(c.req.url).searchParams.get('s'), kind).catch(() => {}));
  if (t) {
    const origin = new URL(c.req.url).origin;
    const gw = gwNum(t.gw);
    const rate = kind === 'r';
    const title = rate ? `Rate my GW${gw} team 🟨` : `${t.nickname}'s GW${gw} squad on SquadJury`;
    const desc = rate
      ? `${t.nickname} wants your verdict. One tap from 1 to 10 on SquadJury.`
      : t.vote_count ? `Jury verdict so far: ${avgOf(t)}/10 from ${t.vote_count} jurors. Give yours before the deadline.` : 'Judge this FPL squad from 1 to 10 before the deadline.';
    const ogKey = (rate && t.rate_og_key) || t.og_key;
    const img = ogKey ? `${origin}/u/${ogKey}` : `${origin}/img/og-default.png`;
    const meta = [
      `<meta property="og:title" content="${esc(title)}">`,
      `<meta property="og:description" content="${esc(desc)}">`,
      `<meta property="og:url" content="${esc(`${origin}/${kind}/${key}`)}">`,
      `<meta property="og:image" content="${esc(img)}">`,
      '<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">',
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

/** League invite page: the app shell with a preview of the league for X and WhatsApp. */
async function leaguePage(c, code) {
  const l = await c.env.DB.prepare('SELECT * FROM leagues WHERE code = ?').bind(code.toUpperCase()).first();
  const shell = await c.env.ASSETS.fetch(new Request(new URL('/index.html', c.req.url)));
  let html = await shell.text();
  c.ctx.waitUntil(countVisit(c.env, c.now, new URL(c.req.url).searchParams.get('s'), 'l').catch(() => {}));
  if (l) {
    const origin = new URL(c.req.url).origin;
    const n = (await c.env.DB.prepare('SELECT COUNT(*) AS n FROM league_members WHERE league_id = ?').bind(l.id).first()).n;
    const title = `Join "${l.name}" on SquadJury 🟨`;
    const desc = `A private FPL league with ${n} ${n === 1 ? 'member' : 'members'}. Post your squad, rate each other, see who tops the table.`;
    const img = l.og_key ? `${origin}/u/${l.og_key}` : `${origin}/img/og-default.png`;
    const meta = [
      `<meta property="og:title" content="${esc(title)}">`,
      `<meta property="og:description" content="${esc(desc)}">`,
      `<meta property="og:url" content="${esc(`${origin}/l/${l.code}`)}">`,
      `<meta property="og:image" content="${esc(img)}">`,
      '<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">',
      '<meta name="twitter:card" content="summary_large_image">',
      `<meta name="twitter:title" content="${esc(title)}">`,
      `<meta name="twitter:description" content="${esc(desc)}">`,
      `<meta name="twitter:image" content="${esc(img)}">`,
    ].join('\n    ');
    html = html.replace(/<!-- og:start -->[\s\S]*?<!-- og:end -->/, meta).replace(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`);
  }
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
        req, env, ctx, now, fpl, season: seasonOf(fpl),
        user: await currentUser(env, req, now),
        open: async () => (openMemo ??= await syncGameweeks(env, fpl, now)),
      };
      const share = url.pathname.match(/^\/(t|r)\/([A-Za-z0-9_-]{4,20})\/?$/);
      if (share) return await sharePage(c, share[2], share[1]);
      const invite = url.pathname.match(/^\/l\/([A-Za-z0-9]{6})\/?$/);
      if (invite) return await leaguePage(c, invite[1]);
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

  /** Every 5 minutes: lock gameweeks past their deadline. Every hour: refresh FPL data and tidy images. Mondays: backup. */
  async scheduled(event, env, ctx) {
    const now = Date.now();
    if (event.cron === BACKUP_CRON) return void (await runBackup(env, now));
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
