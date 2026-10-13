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
import { pointsJob, scoreGameweek, fetchLive } from './lib/pointsjob.js';
import { juryCall, pointsRanks } from './lib/points.js';
import { scoreScouts } from './lib/scoutjob.js';
import { evaluateBadges, badgeJob } from './lib/badgejob.js';
import { BADGES, GROUPS, byId as badgeById, progressOf, streaks } from './lib/badges.js';
import { MIN_VERDICTS, MIN_TEAMS } from './lib/scouts.js';
import { elo, pairKey, biasedSide, pickPairs, roundRobin, h2hResult, h2hTable, DUEL_LIMIT, MIN_MS, MIN_DUELS, H2H_MIN_MEMBERS } from './lib/duels.js';
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

/** Squads judged this gameweek: verdicts plus duels that counted (one duel counts as one). */
async function judgedCount(env, userId, gw) {
  const r = await env.DB.prepare(
    'SELECT (SELECT COUNT(*) FROM votes WHERE user_id = ?1 AND gw = ?2) + (SELECT COUNT(*) FROM duels WHERE user_id = ?1 AND gw = ?2 AND counted = 1) AS n',
  ).bind(userId, gw).first();
  return r.n;
}

async function myTeam(env, userId, gw) {
  return env.DB.prepare('SELECT t.*, u.nickname, u.x_handle, u.demo FROM teams t JOIN users u ON u.id = t.user_id WHERE t.user_id = ? AND t.gw = ?')
    .bind(userId, gw)
    .first();
}

async function deleteTeamFiles(env, t) {
  const plan = await env.DB.prepare('SELECT image_key FROM plans WHERE team_id = ?').bind(t.id).first();
  const keys = [t.image_key, t.og_key, t.rate_og_key, plan?.image_key].filter(Boolean);
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
    user: u ? { id: u.id, nickname: u.nickname, x: u.x_handle, fplId: u.fpl_id ?? null, admin: isAdmin(c.env, u) } : null,
    mine,
    judged,
    minJudged,
    scoutNews: u ? await scoutNews(c, u) : null,
    ...(u?.nickname ? await badgeState(c, u, open) : {}),
    // Deadline of the gameweek before the open one: the clock shows how much of the window is gone.
    prevDeadline: open ? (() => {
      const prev = c.fpl.events.filter((e) => Date.parse(e.deadline_time) <= c.now).pop();
      return prev ? Date.parse(prev.deadline_time) : null;
    })() : null,
    googleClientId: c.env.GOOGLE_CLIENT_ID || null,
    devLogin: c.env.DEV_LOGIN === '1',
  });
});

/** New badges (not seen yet) and the streak, for the toasts while judging. */
async function badgeState(c, u, open) {
  const [fresh, perGw, gws] = await c.env.DB.batch([
    c.env.DB.prepare('SELECT badge FROM badges WHERE user_id = ? AND seen = 0').bind(u.id),
    c.env.DB.prepare(
      `SELECT gw, SUM(n) AS n FROM (SELECT gw, COUNT(*) AS n FROM votes WHERE user_id = ?1 GROUP BY gw
         UNION ALL SELECT gw, COUNT(*) AS n FROM duels WHERE user_id = ?1 AND counted = 1 GROUP BY gw) GROUP BY gw`,
    ).bind(u.id),
    c.env.DB.prepare('SELECT id FROM gameweeks WHERE id <= COALESCE(?, (SELECT MAX(id) FROM gameweeks)) ORDER BY id').bind(open?.id ?? null),
  ]);
  return {
    newBadges: fresh.results.map((b) => ({ id: b.badge, name: badgeName(b.badge) })),
    streak: streaks(gws.results.map((g) => g.id), new Map(perGw.results.map((r) => [r.gw, r.n])), open?.id ?? null),
  };
}

/** The juror's score of the latest scored gameweek, for the "Your verdicts are in" message. */
async function scoutNews(c, u) {
  const r = await c.env.DB.prepare(
    `SELECT s.gw, s.score, s.rank, s.total FROM scouts s WHERE s.user_id = ? AND s.gw = (SELECT MAX(id) FROM gameweeks WHERE scouts_at IS NOT NULL AND id > ? AND id < ?)`,
  ).bind(u.id, c.season.base, c.season.base + 100).first();
  return r ? { gw: gwNum(r.gw), score: Math.round(r.score * 10) / 10, rank: r.rank, total: r.total } : null;
}

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
  let fplId = c.user.fpl_id ?? null;
  if (body.fplId !== undefined) {
    const raw = String(body.fplId ?? '').trim();
    // The number in an FPL link such as fantasy.premierleague.com/entry/1234567/event/7, or the link itself.
    const m = raw.match(/entry\/(\d{1,9})/) || raw.match(/^(\d{1,9})$/);
    if (raw && !m) fail(400, 'fpl_id_format');
    fplId = m ? +m[1] : null;
  }
  const taken = await c.env.DB.prepare('SELECT id FROM users WHERE nickname = ? AND id != ?').bind(nickname, c.user.id).first();
  if (taken) fail(409, 'nickname_taken');
  await c.env.DB.prepare('UPDATE users SET nickname = ?, x_handle = ?, fpl_id = ? WHERE id = ?').bind(nickname, x, fplId, c.user.id).run();
  return json({ nickname, x, fplId });
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
    c.env.DB.prepare('DELETE FROM duels WHERE user_id = ?1 OR a_id IN (SELECT id FROM teams WHERE user_id = ?1) OR b_id IN (SELECT id FROM teams WHERE user_id = ?1)').bind(u.id),
    c.env.DB.prepare('DELETE FROM duel_offers WHERE user_id = ?').bind(u.id),
    c.env.DB.prepare('DELETE FROM scouts WHERE user_id = ?').bind(u.id),
    c.env.DB.prepare('DELETE FROM badges WHERE user_id = ?').bind(u.id),
    c.env.DB.prepare('DELETE FROM plan_votes WHERE user_id = ?1 OR plan_id IN (SELECT id FROM plans WHERE user_id = ?1)').bind(u.id),
    c.env.DB.prepare('DELETE FROM plans WHERE user_id = ?').bind(u.id),
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
    c.env.DB.prepare('SELECT gw, season, share_key, vote_sum, vote_count, points FROM teams WHERE user_id = ? ORDER BY gw DESC').bind(u.id),
  ]);
  const res = results.results;
  const byGw = new Map(res.map((r) => [r.gw, r]));
  const squads = teams.results.map((t) => {
    const r = byGw.get(t.gw);
    return { gw: gwNum(t.gw), season: t.season, key: t.share_key, points: t.points ?? null, avg: r ? Math.round(r.avg * 10) / 10 : avgOf(t), votes: r ? r.votes : t.vote_count, rank: r?.rank ?? null, live: t.gw === open?.id };
  });
  const finals = res.filter((r) => r.votes);
  const [lastScout, seasonScout] = await c.env.DB.batch([
    c.env.DB.prepare('SELECT gw, score, rank, total FROM scouts WHERE user_id = ? AND gw > ? AND gw < ? ORDER BY gw DESC LIMIT 1').bind(u.id, c.season.base, c.season.base + 100),
    c.env.DB.prepare(
      `SELECT x.score, x.gws, (SELECT COUNT(*) + 1 FROM (SELECT SUM(score) AS s FROM scouts WHERE gw > ?2 AND gw < ?3 GROUP BY user_id) WHERE s > x.score) AS rank
         FROM (SELECT SUM(score) AS score, COUNT(*) AS gws FROM scouts WHERE user_id = ?1 AND gw > ?2 AND gw < ?3) x WHERE x.gws > 0`,
    ).bind(u.id, c.season.base, c.season.base + 100),
  ]);
  const ls = lastScout.results[0], ss = seasonScout.results[0];
  const { stats: bstats } = await evaluateBadges(c.env, u.id, open, c.now);
  const got = (await c.env.DB.prepare('SELECT badge, seen FROM badges WHERE user_id = ? ORDER BY unlocked_at DESC, rowid DESC').bind(u.id).all()).results;
  return json({
    badges: { list: got.map((b) => ({ id: b.badge, name: badgeName(b.badge), isNew: !b.seen })), total: BADGES.length, streak: bstats.streak },
    scouts: {
      last: ls ? { gw: gwNum(ls.gw), score: Math.round(ls.score * 10) / 10, rank: ls.rank, total: ls.total } : null,
      season: ss ? { score: Math.round(ss.score * 10) / 10, gws: ss.gws, rank: ss.rank } : null,
    },
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
      c.env.DB.prepare('DELETE FROM duels WHERE a_id = ?1 OR b_id = ?1').bind(existing.id),
      c.env.DB.prepare('DELETE FROM plan_votes WHERE plan_id IN (SELECT id FROM plans WHERE team_id = ?)').bind(existing.id),
      c.env.DB.prepare('DELETE FROM plans WHERE team_id = ?').bind(existing.id),
      c.env.DB.prepare(
        'UPDATE teams SET image_key = ?, og_key = ?, picks_json = ?, captain_id = ?, vice_id = ?, vote_sum = 0, vote_count = 0, reports = 0, hidden = 0, elo = 1500, duel_w = 0, duel_l = 0, updated_at = ? WHERE id = ?',
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

// The squad's own link preview, drawn again when Plan B became the squad.
route('PUT', '/api/teams/mine/og', async (c) => {
  const u = needUser(c);
  const open = await needOpen(c);
  await rateLimit(c.env, `ogcard:${u.id}`, 20, 3600, c.now);
  const t = await myTeam(c.env, u.id, open.id);
  if (!t) fail(404, 'no_squad');
  const form = await c.req.formData().catch(() => fail(400, 'bad_form'));
  const og = await readImage(form.get('og'), MAX_OG);
  if (!og) fail(400, 'not_an_image');
  const key = `og_${t.share_key}_${randomKey(4)}.${og.type.split('/')[1]}`;
  await c.env.IMAGES.put(key, og.buf, { httpMetadata: { contentType: og.type, cacheControl: 'public, max-age=31536000, immutable' } });
  if (t.og_key) await c.env.IMAGES.delete(t.og_key);
  await c.env.DB.prepare('UPDATE teams SET og_key = ? WHERE id = ?').bind(key, t.id).run();
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
  // After the gameweek: real points, the place by points and how the jury did.
  if (locked && t.points != null) {
    const all = await c.env.DB.prepare('SELECT id, points FROM teams WHERE gw = ? AND hidden = 0 AND points IS NOT NULL').bind(t.gw).all();
    const ranks = pointsRanks(all.results);
    out.pointsRank = ranks.get(t.id) ?? null;
    out.pointsTotal = all.results.length;
    out.call = juryCall(out.place?.rank, out.pointsRank, Math.min(out.place?.total || 0, out.pointsTotal));
  }
  // The owner's badges (just the unlocked ones, newest first).
  out.ownerBadges = (await c.env.DB.prepare('SELECT badge FROM badges WHERE user_id = ? ORDER BY unlocked_at DESC LIMIT 12').bind(t.user_id).all()).results.map((b) => ({ id: b.badge, name: badgeName(b.badge) }));
  // Plan B, for the owner only.
  if (mineFlag) {
    const plan = await c.env.DB.prepare('SELECT * FROM plans WHERE team_id = ?').bind(t.id).first();
    const g = await c.env.DB.prepare('SELECT deadline FROM gameweeks WHERE id = ?').bind(t.gw).first();
    out.plan = plan ? planOut(plan, !locked && c.now <= g.deadline - PLAN_CLOSE, g.deadline) : null;
    out.planCloses = g.deadline - PLAN_CLOSE;
    out.canPlan = !locked && !plan && c.now <= g.deadline - PLAN_CLOSE;
  }
  // Duels: the record, and for the owner the best squad it beat.
  if (!showAvg) out.duels = null;
  else if (t.duel_w + t.duel_l > 0) {
    out.duels = await duelPlace(c.env, t);
    if (mineFlag && t.duel_w) {
      const best = await c.env.DB.prepare(
        `SELECT o.id, o.gw, o.elo, o.duel_w, o.duel_l, o.share_key, u.nickname FROM duels d JOIN teams o ON o.id = CASE WHEN d.a_id = ?1 THEN d.b_id ELSE d.a_id END
           JOIN users u ON u.id = o.user_id WHERE (d.a_id = ?1 OR d.b_id = ?1) AND d.winner_id = ?1 AND d.counted = 1 ORDER BY o.elo DESC LIMIT 1`,
      ).bind(t.id).first();
      if (best) out.bestWin = { key: best.share_key, nickname: best.nickname, rank: (await duelPlace(c.env, best)).rank };
    }
  }
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
  const judged = await judgedCount(c.env, u.id, open.id);
  return json({ avg: avgOf(after), votes: after.vote_count, judged, badges: old ? [] : await badgesAfter(c, open, judged) });
});

// ==== badges and streak

const badgeName = (id) => badgeById.get(id)?.name || id;
const MILESTONES = new Set([1, 5, 10, 25, 50, 100, 200, 500]);

/** After a verdict or duel: badges are checked right away at round numbers (the cron does the rest). */
async function badgesAfter(c, open, judged) {
  if (!MILESTONES.has(judged)) return [];
  const { fresh } = await evaluateBadges(c.env, c.user.id, open, c.now);
  return fresh.map((id) => ({ id, name: badgeName(id) }));
}

route('GET', '/api/me/badges', async (c) => {
  const u = needUser(c);
  const open = await c.open();
  const { stats } = await evaluateBadges(c.env, u.id, open, c.now);
  const [mine, counts, jurors] = await c.env.DB.batch([
    c.env.DB.prepare('SELECT badge, gw, unlocked_at, seen FROM badges WHERE user_id = ?').bind(u.id),
    c.env.DB.prepare('SELECT badge, COUNT(*) AS n FROM badges GROUP BY badge'),
    c.env.DB.prepare('SELECT COUNT(*) AS n FROM users WHERE nickname IS NOT NULL AND banned = 0'),
  ]);
  const got = new Map(mine.results.map((b) => [b.badge, b]));
  const share = new Map(counts.results.map((r) => [r.badge, r.n]));
  const total = Math.max(1, jurors.results[0].n);
  return json({
    total: BADGES.length, unlocked: got.size, streak: stats.streak,
    groups: GROUPS.map((g) => ({
      name: g,
      badges: BADGES.filter((b) => b.group === g).map((b) => {
        const have = got.get(b.id);
        return {
          id: b.id, name: b.name, desc: b.desc, progress: progressOf(b, stats),
          unlocked: have ? { gw: have.gw ? gwNum(have.gw) : null, at: have.unlocked_at } : null, isNew: have ? !have.seen : false,
          pct: Math.round(((share.get(b.id) || 0) / total) * 100),
        };
      }),
    })),
  });
});

route('POST', '/api/me/badges/seen', async (c) => {
  const u = needUser(c);
  await c.env.DB.prepare('UPDATE badges SET seen = 1 WHERE user_id = ? AND seen = 0').bind(u.id).run();
  return json({ ok: true });
});


// ==== Plan B

const PLAN_CLOSE = 30 * 60 * 1000; // the owner picks a plan at least 30 minutes before the deadline

function planOut(p, open, deadline) {
  return {
    key: p.share_key, picks: JSON.parse(p.picks_json), captain: p.captain_id, vice: p.vice_id,
    image: p.image_key ? `/u/${p.image_key}` : null, votesA: p.votes_a, votesB: p.votes_b, chosen: p.chosen,
    closesAt: deadline - PLAN_CLOSE, open: !p.chosen && open,
  };
}

async function myPlanContext(c) {
  const u = needUser(c);
  const open = await needOpen(c);
  const t = await myTeam(c.env, u.id, open.id);
  if (!t) fail(404, 'no_squad');
  const plan = await c.env.DB.prepare('SELECT * FROM plans WHERE team_id = ?').bind(t.id).first();
  return { u, open, t, plan };
}

route('POST', '/api/plans', async (c) => {
  const { u, open, t, plan } = await myPlanContext(c);
  if (c.now > open.deadline - PLAN_CLOSE) fail(409, 'plan_closed');
  if (plan) fail(409, 'plan_exists');
  await rateLimit(c.env, `plan:${u.id}`, 10, 3600, c.now);
  const form = await c.req.formData().catch(() => fail(400, 'bad_form'));
  let raw;
  try { raw = JSON.parse(form.get('picks')); } catch { fail(400, 'bad_picks'); }
  const captain = form.get('captain') ? +form.get('captain') : null;
  const vice = form.get('vice') ? +form.get('vice') : null;
  const picks = checkPicks(raw, c.fpl, captain, vice);
  if (JSON.stringify(picks) === t.picks_json && captain === t.captain_id && vice === t.vice_id) fail(400, 'plan_same');
  const shot = await readImage(form.get('image'), MAX_IMAGE);
  const key = randomKey(6);
  const imageKey = shot ? `plan_${open.id}_${key}.${shot.type.split('/')[1]}` : null;
  if (shot) await c.env.IMAGES.put(imageKey, shot.buf, { httpMetadata: { contentType: shot.type, cacheControl: 'public, max-age=31536000, immutable' } });
  const p = await c.env.DB.prepare(
    'INSERT INTO plans (team_id, user_id, gw, share_key, picks_json, captain_id, vice_id, image_key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *',
  ).bind(t.id, u.id, open.id, key, JSON.stringify(picks), captain, vice, imageKey, c.now).first();
  return json({ plan: planOut(p, true, open.deadline) }, { status: 201 });
});

route('DELETE', '/api/plans/mine', async (c) => {
  const { plan } = await myPlanContext(c);
  if (!plan) fail(404, 'no_plan');
  if (plan.chosen) fail(409, 'plan_chosen');
  if (plan.image_key) await c.env.IMAGES.delete(plan.image_key);
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM plan_votes WHERE plan_id = ?').bind(plan.id),
    c.env.DB.prepare('DELETE FROM plans WHERE id = ?').bind(plan.id),
  ]);
  return json({ ok: true });
});

/** Plan B becomes the squad: its players go into the squad, Plan A is kept as the archived plan. */
function choosePlanStmts(env, plan, t, pick) {
  if (pick === 'a') return [env.DB.prepare("UPDATE plans SET chosen = 'a' WHERE id = ?").bind(plan.id)];
  return [
    env.DB.prepare('UPDATE teams SET picks_json = ?, captain_id = ?, vice_id = ?, image_key = ?, og_key = NULL, rate_og_key = NULL WHERE id = ?')
      .bind(plan.picks_json, plan.captain_id, plan.vice_id, plan.image_key, t.id),
    env.DB.prepare("UPDATE plans SET chosen = 'b', picks_json = ?, captain_id = ?, vice_id = ?, image_key = ? WHERE id = ?")
      .bind(t.picks_json, t.captain_id, t.vice_id, t.image_key, plan.id),
  ];
}

route('POST', '/api/plans/mine/choose', async (c) => {
  const { open, t, plan } = await myPlanContext(c);
  const { pick } = await readJson(c.req);
  if (pick !== 'a' && pick !== 'b') fail(400, 'bad_plan');
  if (!plan) fail(404, 'no_plan');
  if (plan.chosen) fail(409, 'plan_chosen');
  if (c.now > open.deadline - PLAN_CLOSE) fail(409, 'plan_closed');
  await c.env.DB.batch(choosePlanStmts(c.env, plan, t, pick));
  if (pick === 'b') {
    const old = [t.og_key, t.rate_og_key].filter(Boolean);
    if (old.length) await c.env.IMAGES.delete(old);
  }
  const fresh = await myTeam(c.env, t.user_id, open.id);
  return json({ team: teamOut(fresh, { mine: true }) });
});

/** 30 minutes before the deadline, a plan nobody picked goes to the one with more votes. */
async function autoChoosePlans(env, now) {
  const due = await env.DB.prepare(
    `SELECT p.*, g.deadline FROM plans p JOIN gameweeks g ON g.id = p.gw WHERE p.chosen IS NULL AND g.deadline - ? <= ? LIMIT 200`,
  ).bind(PLAN_CLOSE, now).all();
  for (const p of due.results) {
    const t = await env.DB.prepare('SELECT * FROM teams WHERE id = ?').bind(p.team_id).first();
    if (!t) continue;
    const pick = p.votes_b > p.votes_a ? 'b' : 'a';
    await env.DB.batch(choosePlanStmts(env, p, t, pick));
    if (pick === 'b') {
      const old = [t.og_key, t.rate_og_key].filter(Boolean);
      if (old.length) await env.IMAGES.delete(old);
    }
  }
}

/** A vote in a "Plan A vs Plan B" duel. Does not touch ratings or the leaderboard. */
route('POST', '/api/plans/vote', async (c) => {
  const u = needUser(c);
  const open = await needOpen(c);
  const { plan: key, pick } = await readJson(c.req);
  if (pick !== 'a' && pick !== 'b') fail(400, 'bad_plan');
  await rateLimit(c.env, `planvote:${u.id}`, 120, 3600, c.now);
  const p = await c.env.DB.prepare('SELECT * FROM plans WHERE share_key = ?').bind(String(key || '')).first();
  if (!p) fail(404, 'not_found');
  if (p.user_id === u.id) fail(403, 'own_squad');
  if (p.gw !== open.id || p.chosen || c.now > open.deadline - PLAN_CLOSE) fail(409, 'plan_closed');
  await c.env.DB.prepare('INSERT INTO plan_votes (plan_id, user_id, pick, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(plan_id, user_id) DO UPDATE SET pick = excluded.pick')
    .bind(p.id, u.id, pick, c.now).run();
  const n = await c.env.DB.prepare("SELECT SUM(CASE WHEN pick = 'a' THEN 1 ELSE 0 END) AS a, SUM(CASE WHEN pick = 'b' THEN 1 ELSE 0 END) AS b FROM plan_votes WHERE plan_id = ?").bind(p.id).first();
  await c.env.DB.prepare('UPDATE plans SET votes_a = ?, votes_b = ? WHERE id = ?').bind(n.a || 0, n.b || 0, p.id).run();
  const total = (n.a || 0) + (n.b || 0);
  return json({ votes: total, agree: Math.round(((pick === 'a' ? n.a : n.b) / total) * 100) });
});

// ==== duels

const TEAM_COLS = 't.*, u.nickname, u.x_handle, u.demo';

/** Duel record of a squad, with its place by duel rating in the gameweek. */
async function duelPlace(env, t) {
  const n = t.duel_w + t.duel_l;
  if (n < MIN_DUELS) return { w: t.duel_w, l: t.duel_l, rating: Math.round(t.elo), rank: null };
  const r = await env.DB.prepare('SELECT COUNT(*) + 1 AS rank FROM teams WHERE gw = ? AND hidden = 0 AND duel_w + duel_l >= ? AND elo > ?').bind(t.gw, MIN_DUELS, t.elo).first();
  return { w: t.duel_w, l: t.duel_l, rating: Math.round(t.elo), rank: r.rank };
}

/** Pairs for the Duel mode: league fixtures first, then a Plan A vs Plan B, then close ratings. */
route('GET', '/api/duels/next', async (c) => {
  const u = needUser(c);
  const open = await needOpen(c);
  const url = new URL(c.req.url);
  const n = Math.min(4, Math.max(1, +url.searchParams.get('n') || 3));
  const skip = new Set((url.searchParams.get('skip') || '').split(',').filter((k) => /^[A-Za-z0-9_-]{4,20}~[A-Za-z0-9_-]{4,20}$/.test(k)).slice(0, 200));
  const [mine, teamsRes, plansRes, fixtures] = await c.env.DB.batch([
    c.env.DB.prepare('SELECT a_id, b_id FROM duels WHERE user_id = ? AND gw = ?').bind(u.id, open.id),
    c.env.DB.prepare('SELECT id, user_id, share_key, elo, duel_w + duel_l AS duels FROM teams WHERE gw = ? AND hidden = 0 AND user_id != ? ORDER BY random() LIMIT 400').bind(open.id, u.id),
    c.env.DB.prepare(
      `SELECT p.id FROM plans p JOIN teams t ON t.id = p.team_id JOIN gameweeks g ON g.id = p.gw WHERE p.gw = ? AND p.chosen IS NULL AND p.user_id != ? AND t.hidden = 0 AND g.deadline - ${PLAN_CLOSE} > ${Math.floor(c.now)}
          AND NOT EXISTS (SELECT 1 FROM plan_votes v WHERE v.plan_id = p.id AND v.user_id = ?) ORDER BY random() LIMIT 1`,
    ).bind(open.id, u.id, u.id),
    c.env.DB.prepare(
      `SELECT h.home_id, h.away_id, l.name FROM h2h h JOIN leagues l ON l.id = h.league_id JOIN league_members m ON m.league_id = h.league_id AND m.user_id = ?
        WHERE h.gw = ? AND h.away_id IS NOT NULL AND h.home_id != ? AND h.away_id != ?`,
    ).bind(u.id, open.id, u.id, u.id),
  ]);
  const done = new Set(mine.results.map((d) => pairKey(d.a_id, d.b_id)));
  if (done.size >= DUEL_LIMIT) return json({ pairs: [], limit: true, done: done.size });
  const teams = teamsRes.results;
  const byKey = new Map(teams.map((t) => [t.share_key, t]));
  const byUser = new Map(teams.map((t) => [t.user_id, t]));
  for (const k of skip) {
    const [x, y] = k.split('~').map((key) => byKey.get(key)?.id);
    if (x && y) done.add(pairKey(x, y));
  }
  const out = [];
  const used = new Set();
  for (const f of fixtures.results) {
    const a = byUser.get(f.home_id), b = byUser.get(f.away_id);
    if (!a || !b || done.has(pairKey(a.id, b.id)) || used.has(a.id) || used.has(b.id) || out.length >= n) continue;
    out.push({ ids: [a.id, b.id], kind: 'league', league: f.name });
    used.add(a.id).add(b.id);
  }
  if (plansRes.results.length && out.length < n) out.push({ plan: plansRes.results[0].id, kind: 'plan' });
  const rest = pickPairs(teams.filter((t) => !used.has(t.id)), done, n - out.length);
  out.push(...rest.map((ids) => ({ ids, kind: 'jury' })));
  if (!out.length) return json({ pairs: [], done: done.size });

  const ids = [...new Set(out.flatMap((p) => p.ids || []))];
  const planIds = out.filter((p) => p.plan).map((p) => p.plan);
  const full = ids.length ? (await c.env.DB.prepare(`SELECT ${TEAM_COLS} FROM teams t JOIN users u ON u.id = t.user_id WHERE t.id IN (${ids.map(() => '?').join(',')})`).bind(...ids).all()).results : [];
  const fullById = new Map(full.map((t) => [t.id, t]));
  const plans = planIds.length ? (await c.env.DB.prepare(
    `SELECT ${TEAM_COLS}, p.id AS plan_id, p.share_key AS plan_key, p.picks_json AS plan_picks, p.captain_id AS plan_captain, p.vice_id AS plan_vice, p.image_key AS plan_image
       FROM plans p JOIN teams t ON t.id = p.team_id JOIN users u ON u.id = t.user_id WHERE p.id IN (${planIds.map(() => '?').join(',')})`,
  ).bind(...planIds).all()).results : [];
  const pub = (t) => ({ ...teamOut(t), avg: null, votes: undefined, points: undefined, duels: undefined });
  const pairs = [];
  const offers = [];
  for (const p of out) {
    if (p.plan) {
      const r = plans.find((x) => x.plan_id === p.plan);
      if (!r) continue;
      const a = pub(r);
      const b = { ...a, key: r.plan_key, picks: JSON.parse(r.plan_picks), captain: r.plan_captain, vice: r.plan_vice, image: r.plan_image ? `/u/${r.plan_image}` : null };
      pairs.push({ kind: 'plan', plan: r.plan_key, nickname: r.nickname, first: { ...a, label: 'A' }, second: { ...b, label: 'B' } });
      continue;
    }
    const [x, y] = p.ids.map((id) => fullById.get(id));
    if (!x || !y) continue;
    pairs.push({ kind: p.kind, league: p.league || null, first: pub(x), second: pub(y) });
    const [lo, hi] = x.id < y.id ? [x.id, y.id] : [y.id, x.id];
    offers.push(c.env.DB.prepare('INSERT OR REPLACE INTO duel_offers (user_id, a_id, b_id, at) VALUES (?, ?, ?, ?)').bind(u.id, lo, hi, c.now));
  }
  if (offers.length) await c.env.DB.batch(offers);
  return json({ pairs, done: done.size });
});

route('POST', '/api/duels', async (c) => {
  const u = needUser(c);
  const open = await needOpen(c);
  const { first, second, pick } = await readJson(c.req);
  if (!first || !second || first === second || (pick !== first && pick !== second)) fail(400, 'bad_duel');
  await rateLimit(c.env, `duel:${u.id}`, 300, 3600, c.now);
  await rateLimit(c.env, `duelip:${clientIp(c.req)}`, 1200, 3600, c.now);
  const rows = (await c.env.DB.prepare('SELECT id, user_id, gw, hidden, elo, share_key FROM teams WHERE share_key IN (?, ?)').bind(first, second).all()).results;
  const f = rows.find((t) => t.share_key === first), s = rows.find((t) => t.share_key === second);
  if (!f || !s || f.hidden || s.hidden) fail(404, 'not_found');
  if (f.gw !== open.id || s.gw !== open.id) fail(409, 'voting_closed');
  if (f.user_id === u.id || s.user_id === u.id) fail(403, 'own_squad');
  const [lo, hi] = f.id < s.id ? [f, s] : [s, f];
  const winner = pick === first ? f : s;
  const side = pick === first ? 'first' : 'second';
  const [already, mineRes, offer] = await c.env.DB.batch([
    c.env.DB.prepare('SELECT 1 FROM duels WHERE user_id = ? AND a_id = ? AND b_id = ?').bind(u.id, lo.id, hi.id),
    c.env.DB.prepare("SELECT COUNT(*) AS n, SUM(CASE WHEN side = 'first' THEN 1 ELSE 0 END) AS first FROM duels WHERE user_id = ? AND gw = ?").bind(u.id, open.id),
    c.env.DB.prepare('SELECT at FROM duel_offers WHERE user_id = ? AND a_id = ? AND b_id = ?').bind(u.id, lo.id, hi.id),
  ]);
  if (already.results.length) fail(409, 'duel_done');
  const m = mineRes.results[0];
  if (m.n >= DUEL_LIMIT) fail(429, 'duel_limit');
  const shownAt = offer.results[0]?.at;
  // Counts for the rating only when it was really looked at and the juror is not always on one side.
  const counted = shownAt != null && c.now - shownAt >= MIN_MS && biasedSide(m.n + 1, (m.first || 0) + (side === 'first' ? 1 : 0)) !== side ? 1 : 0;
  const stmts = [
    c.env.DB.prepare('INSERT INTO duels (user_id, gw, season, a_id, b_id, winner_id, side, counted, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(u.id, open.id, open.season, lo.id, hi.id, winner.id, side, counted, c.now),
    c.env.DB.prepare('DELETE FROM duel_offers WHERE user_id = ? AND a_id = ? AND b_id = ?').bind(u.id, lo.id, hi.id),
  ];
  if (counted) {
    const [rf, rs] = elo(f.elo, s.elo, winner === f);
    stmts.push(
      c.env.DB.prepare(`UPDATE teams SET elo = ?, ${winner === f ? 'duel_w = duel_w + 1' : 'duel_l = duel_l + 1'} WHERE id = ?`).bind(rf, f.id),
      c.env.DB.prepare(`UPDATE teams SET elo = ?, ${winner === s ? 'duel_w = duel_w + 1' : 'duel_l = duel_l + 1'} WHERE id = ?`).bind(rs, s.id),
    );
  }
  await c.env.DB.batch(stmts);
  const agree = await c.env.DB.prepare('SELECT COUNT(*) AS n, SUM(CASE WHEN winner_id = ? THEN 1 ELSE 0 END) AS same FROM duels WHERE a_id = ? AND b_id = ?').bind(winner.id, lo.id, hi.id).first();
  const judged = await judgedCount(c.env, u.id, open.id);
  return json({ counted: !!counted, votes: agree.n, agree: Math.round((agree.same / agree.n) * 100), judged, badges: counted ? await badgesAfter(c, open, judged) : [] });
});

// The last 10 duels of a squad: who it met and whether it won. Jurors are never shown.
route('GET', '/api/teams/([A-Za-z0-9_-]{4,20})/duels', async (c, key) => {
  const t = await c.env.DB.prepare('SELECT * FROM teams WHERE share_key = ?').bind(key).first();
  if (!t || (t.hidden && !isAdmin(c.env, c.user))) fail(404, 'not_found');
  const rows = await c.env.DB.prepare(
    `SELECT d.winner_id, o.share_key, u.nickname, u.demo, d.created_at FROM duels d
       JOIN teams o ON o.id = CASE WHEN d.a_id = ?1 THEN d.b_id ELSE d.a_id END JOIN users u ON u.id = o.user_id
      WHERE (d.a_id = ?1 OR d.b_id = ?1) AND d.counted = 1 ORDER BY d.created_at DESC LIMIT 10`,
  ).bind(t.id).all();
  return json({
    duels: await duelPlace(c.env, t),
    last: rows.results.map((r) => ({ key: r.share_key, nickname: r.nickname, demo: !!r.demo, won: r.winner_id === t.id })),
  });
});

route('GET', '/api/leaderboard/duels', async (c) => {
  const open = await c.open();
  const asked = +new URL(c.req.url).searchParams.get('gw');
  const gw = asked ? gwKey(c.season, asked) : open?.id;
  if (!gw) return json({ gw: null, ranked: [] });
  const rows = await c.env.DB.prepare(
    `SELECT t.share_key, t.user_id, t.elo, t.duel_w, t.duel_l, u.nickname, u.x_handle, u.demo FROM teams t JOIN users u ON u.id = t.user_id
      WHERE t.gw = ? AND t.hidden = 0 AND t.duel_w + t.duel_l >= ? ORDER BY t.elo DESC, t.duel_w DESC LIMIT 100`,
  ).bind(gw, MIN_DUELS).all();
  const row = (r, i) => ({
    rank: i + 1, key: r.share_key, nickname: r.nickname, x: r.x_handle || null, demo: !!r.demo, mine: r.user_id === c.user?.id,
    rating: Math.round(r.elo), w: r.duel_w, l: r.duel_l, pct: Math.round((r.duel_w / (r.duel_w + r.duel_l)) * 100),
  });
  const ranked = rows.results.map(row);
  let me = ranked.find((r) => r.mine) || null;
  if (!me && c.user) {
    const t = await c.env.DB.prepare('SELECT * FROM teams WHERE user_id = ? AND gw = ?').bind(c.user.id, gw).first();
    if (t) {
      const p = await duelPlace(c.env, t);
      me = { rank: p.rank, key: t.share_key, nickname: c.user.nickname, mine: true, rating: p.rating, w: p.w, l: p.l, pct: p.w + p.l ? Math.round((p.w / (p.w + p.l)) * 100) : null, needs: Math.max(0, MIN_DUELS - p.w - p.l) };
    }
  }
  return json({ gw: gwNum(gw), live: gw === open?.id, minDuels: MIN_DUELS, ranked, me }, { headers: { 'cache-control': 'private, max-age=10' } });
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
    needsVotes: r.needsVotes, needsJudged: r.needsJudged, locked, points: r.points ?? null,
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
  // A finished gameweek: the final top 10 by verdict, or by real points once they are in.
  // By points every squad of the week counts, also the ones the jury did not rank.
  const wantPoints = url.searchParams.get('sort') === 'points';
  let all = [];
  if (wantPoints) {
    all = (await c.env.DB.prepare(
      `SELECT t.id AS team_id, t.user_id, t.share_key, t.points, r.rank, t.vote_count AS votes,
              COALESCE(r.avg, CASE WHEN t.vote_count > 0 THEN 1.0 * t.vote_sum / t.vote_count ELSE 0 END) AS avg,
              u.nickname, u.x_handle, u.demo
         FROM teams t JOIN users u ON u.id = t.user_id LEFT JOIN results r ON r.team_id = t.id
        WHERE t.gw = ? AND t.hidden = 0 AND t.points IS NOT NULL
        ORDER BY t.points DESC, r.rank IS NULL, r.rank ASC, t.vote_count DESC`,
    ).bind(gw).all()).results;
  }
  const byPoints = all.length > 0;
  if (!byPoints) {
    all = (await c.env.DB.prepare(
      `SELECT r.*, t.share_key, t.points, u.nickname, u.x_handle, u.demo FROM results r JOIN teams t ON t.id = r.team_id JOIN users u ON u.id = r.user_id
        WHERE r.gw = ? ORDER BY r.rank ASC`,
    ).bind(gw).all()).results;
  }
  const me = all.find((r) => r.user_id === c.user?.id);
  const hasPoints = byPoints || !!(await c.env.DB.prepare('SELECT 1 FROM teams WHERE gw = ? AND points IS NOT NULL AND hidden = 0 LIMIT 1').bind(gw).first());
  return json(
    { gw: gwNum(gw), live: false, gameweeks: gws.results, total: all.length, hasPoints, sort: byPoints ? 'points' : 'jury', ranked: all.slice(0, 10).map((r) => row(r, true)), pending: [], me: me ? row(me, true) : null },
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
    rank: r.rank ?? null, mine: r.user_id === me, needsVotes: r.needsVotes, needsJudged: r.needsJudged, locked, points: r.points ?? null,
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
      `SELECT r.*, t.share_key, t.points, u.nickname, u.x_handle, u.demo FROM results r JOIN teams t ON t.id = r.team_id JOIN users u ON u.id = r.user_id
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

// ==== league head to head

/**
 * Makes the fixtures of a gameweek for every league with at least 4 members that has none yet.
 * Round robin over the members (by user id), the round is the number of gameweeks already played.
 */
async function ensureFixtures(env, gw, season, leagueId = null) {
  const leagues = await env.DB.prepare(
    `SELECT l.id FROM leagues l WHERE ${leagueId ? 'l.id = ?2 AND' : ''} (SELECT COUNT(*) FROM league_members m WHERE m.league_id = l.id) >= ${H2H_MIN_MEMBERS}
        AND NOT EXISTS (SELECT 1 FROM h2h h WHERE h.league_id = l.id AND h.gw = ?1) LIMIT 200`,
  ).bind(...(leagueId ? [gw, leagueId] : [gw])).all();
  for (const { id } of leagues.results) {
    const [members, played] = await env.DB.batch([
      env.DB.prepare('SELECT user_id FROM league_members WHERE league_id = ? ORDER BY user_id').bind(id),
      env.DB.prepare('SELECT COUNT(DISTINCT gw) AS n FROM h2h WHERE league_id = ? AND season = ?').bind(id, season),
    ]);
    const fixtures = roundRobin(members.results.map((m) => m.user_id), played.results[0].n);
    await env.DB.batch(fixtures.map(([home, away]) =>
      env.DB.prepare('INSERT OR IGNORE INTO h2h (league_id, gw, season, home_id, away_id) VALUES (?, ?, ?, ?, ?)').bind(id, gw, season, home, away)));
  }
}

/** Matches of one gameweek and the season tables (Jury and Points) of a league. */
route('GET', '/api/leagues/([A-Za-z0-9]{6})/h2h', async (c, code) => {
  const l = await leagueBy(c, code);
  if (!(await memberOf(c, l))) fail(403, 'not_member');
  const open = await c.open();
  if (open) await ensureFixtures(c.env, open.id, open.season, l.id);
  const lo = c.season.base, hi = c.season.base + 100;
  const [fx, teams, duels, gws, members] = await c.env.DB.batch([
    c.env.DB.prepare('SELECT gw, home_id, away_id FROM h2h WHERE league_id = ? AND gw > ? AND gw < ? ORDER BY gw, home_id').bind(l.id, lo, hi),
    c.env.DB.prepare(
      `SELECT t.id, t.user_id, t.gw, t.share_key, t.vote_sum, t.vote_count, t.points, t.hidden FROM teams t
         JOIN league_members m ON m.user_id = t.user_id AND m.league_id = ? WHERE t.gw > ? AND t.gw < ?`,
    ).bind(l.id, lo, hi),
    c.env.DB.prepare(
      `SELECT d.gw, d.a_id, d.b_id, d.winner_id, COUNT(*) AS n FROM duels d
         JOIN teams ta ON ta.id = d.a_id JOIN league_members ma ON ma.user_id = ta.user_id AND ma.league_id = ?1
         JOIN teams tb ON tb.id = d.b_id JOIN league_members mb ON mb.user_id = tb.user_id AND mb.league_id = ?1
        WHERE d.counted = 1 AND d.gw > ?2 AND d.gw < ?3 GROUP BY d.gw, d.a_id, d.b_id, d.winner_id`,
    ).bind(l.id, lo, hi),
    c.env.DB.prepare('SELECT id, status, points_status FROM gameweeks WHERE id > ? AND id < ?').bind(lo, hi),
    c.env.DB.prepare('SELECT u.id, u.nickname, u.demo FROM league_members m JOIN users u ON u.id = m.user_id WHERE m.league_id = ?').bind(l.id),
  ]);
  const gwInfo = new Map(gws.results.map((g) => [g.id, g]));
  const teamOf = new Map(teams.results.filter((t) => !t.hidden).map((t) => [`${t.gw}:${t.user_id}`, t]));
  const wins = new Map(); // "gw:teamId:oppId" -> duel votes won
  for (const d of duels.results) {
    const loser = d.winner_id === d.a_id ? d.b_id : d.a_id;
    const k = `${d.gw}:${d.winner_id}:${loser}`;
    wins.set(k, (wins.get(k) || 0) + d.n);
  }
  const avgOfTeam = (t) => (t.vote_count ? t.vote_sum / t.vote_count : null);
  const leagueAverage = (gw) => {
    const list = teams.results.filter((t) => t.gw === gw && !t.hidden);
    const avgs = list.map(avgOfTeam).filter((x) => x != null);
    const pts = list.map((t) => t.points).filter((x) => x != null);
    return { avg: avgs.length ? avgs.reduce((a, b) => a + b, 0) / avgs.length : null, points: pts.length ? pts.reduce((a, b) => a + b, 0) / pts.length : null };
  };
  const side = (gw, uid, oppTeam) => {
    const t = teamOf.get(`${gw}:${uid}`);
    if (!t) return { posted: false };
    return { posted: true, team: t, avg: avgOfTeam(t), points: t.points, votesWon: oppTeam ? wins.get(`${gw}:${t.id}:${oppTeam.id}`) || 0 : 0 };
  };
  const matches = fx.results.map((f) => {
    const g = gwInfo.get(f.gw) || {};
    const homeT = teamOf.get(`${f.gw}:${f.home_id}`), awayT = f.away_id != null ? teamOf.get(`${f.gw}:${f.away_id}`) : null;
    const home = side(f.gw, f.home_id, awayT);
    const away = f.away_id != null ? side(f.gw, f.away_id, homeT) : null;
    const r = h2hResult(home, away, { average: f.away_id == null ? leagueAverage(f.gw) : null, pointsReady: g.points_status === 'done' });
    return { ...f, ...r, homeKey: homeT?.share_key || null, awayKey: awayT?.share_key || null, locked: g.status === 'locked' };
  });
  const ids = members.results.map((m) => m.id);
  const done = matches.filter((m) => m.locked);
  const playedGws = [...new Set(fx.results.map((f) => f.gw))];
  const asked = +new URL(c.req.url).searchParams.get('gw');
  const gw = asked ? gwKey(c.season, asked) : playedGws.includes(open?.id) ? open.id : playedGws[playedGws.length - 1];
  const names = new Map(members.results.map((m) => [m.id, m]));
  const who = (id, key) => (id == null ? null : { nickname: names.get(id)?.nickname || t_formerMember, demo: !!names.get(id)?.demo, mine: id === c.user.id, key });
  const tableOut = (rows) => rows.map((r) => ({ ...r, nickname: names.get(r.user_id)?.nickname, demo: !!names.get(r.user_id)?.demo, mine: r.user_id === c.user.id, user_id: undefined }));
  return json({
    members: ids.length, minMembers: H2H_MIN_MEMBERS,
    gws: playedGws.map(gwNum), gw: gw ? gwNum(gw) : null, live: gw === open?.id,
    pointsReady: gwInfo.get(gw)?.points_status === 'done',
    matches: matches.filter((m) => m.gw === gw).map((m) => ({
      home: who(m.home_id, m.homeKey), away: who(m.away_id, m.awayKey), jury: m.jury, points: m.points,
    })),
    tables: { jury: tableOut(h2hTable(done, ids, 'jury')), points: tableOut(h2hTable(done.filter((m) => m.points), ids, 'points')) },
  });
});
const t_formerMember = 'Former member';

// ==== scouts

/** Scout scores: one gameweek, or the season (sum of the gameweeks). ?league=CODE keeps only its members. */
route('GET', '/api/scouts', async (c) => {
  const url = new URL(c.req.url);
  const lo = c.season.base, hi = c.season.base + 100;
  let members = null;
  const code = url.searchParams.get('league');
  if (code) {
    const l = await leagueBy(c, code);
    if (!(await memberOf(c, l))) fail(403, 'not_member');
    members = new Set((await c.env.DB.prepare('SELECT user_id FROM league_members WHERE league_id = ?').bind(l.id).all()).results.map((r) => r.user_id));
  }
  const keep = (rows) => (members ? rows.filter((r) => members.has(r.user_id)) : rows);
  const rerankBy = (rows) => {
    let rank = 0;
    return rows.map((r, i) => {
      if (!i || rows[i - 1].score !== r.score) rank = i + 1;
      return { ...r, rank };
    });
  };
  const out = (r) => ({ rank: r.rank, nickname: r.nickname, demo: !!r.demo, mine: r.user_id === c.user?.id, score: Math.round(r.score * 10) / 10, verdicts: r.verdicts, gws: r.gws });
  if (url.searchParams.get('type') === 'season') {
    const rows = await c.env.DB.prepare(
      `SELECT s.user_id, SUM(s.score) AS score, COUNT(*) AS gws, SUM(s.verdicts) AS verdicts, u.nickname, u.demo FROM scouts s JOIN users u ON u.id = s.user_id
        WHERE s.gw > ? AND s.gw < ? GROUP BY s.user_id ORDER BY score DESC, verdicts DESC`,
    ).bind(lo, hi).all();
    const ranked = rerankBy(keep(rows.results)).map(out);
    return json({ type: 'season', ranked: ranked.slice(0, 100), me: ranked.find((r) => r.mine) || null, total: ranked.length });
  }
  const gwsRes = await c.env.DB.prepare("SELECT id, scouts_at, scouts_teams, points_status FROM gameweeks WHERE status = 'locked' AND id > ? AND id < ? ORDER BY id DESC").bind(lo, hi).all();
  const asked = +url.searchParams.get('gw');
  const g = asked ? gwsRes.results.find((x) => x.id === gwKey(c.season, asked)) : gwsRes.results.find((x) => x.scouts_at) || gwsRes.results[0];
  if (!g) return json({ type: 'gw', gw: null, status: 'waiting', ranked: [], me: null });
  const status = !g.scouts_at ? 'waiting' : g.scouts_teams < MIN_TEAMS ? 'few' : 'ready';
  const rows = status === 'ready'
    ? (await c.env.DB.prepare('SELECT s.*, u.nickname, u.demo FROM scouts s JOIN users u ON u.id = s.user_id WHERE s.gw = ? ORDER BY s.rank').bind(g.id).all()).results
    : [];
  const ranked = (members ? rerankBy(keep(rows)) : rows).map(out);
  let me = ranked.find((r) => r.mine) || null;
  if (!me && c.user && status === 'ready') {
    const n = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM votes WHERE user_id = ? AND gw = ?').bind(c.user.id, g.id).first();
    if (n.n) me = { mine: true, nickname: c.user.nickname, verdicts: n.n, needs: Math.max(0, MIN_VERDICTS - n.n) };
  }
  return json({ type: 'gw', gw: gwNum(g.id), status, teams: g.scouts_teams, minVerdicts: MIN_VERDICTS, minTeams: MIN_TEAMS, total: ranked.length, ranked: ranked.slice(0, 100), me });
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

/** Admin by session, or by the ADMIN_TOKEN secret for scripts run on your own computer. */
function needAdminOrToken(c) {
  const token = c.req.headers.get('x-admin-token');
  if (token && c.env.ADMIN_TOKEN && token === c.env.ADMIN_TOKEN) return;
  needAdmin(c);
}

route('GET', '/api/admin/points', async (c) => {
  needAdmin(c);
  const rows = await c.env.DB.prepare(
    `SELECT g.id, g.points_status, g.points_tries, g.points_at, (SELECT COUNT(*) FROM teams t WHERE t.gw = g.id) AS squads,
            (SELECT COUNT(*) FROM teams t WHERE t.gw = g.id AND t.points IS NOT NULL) AS scored,
            (SELECT COUNT(*) FROM teams t WHERE t.gw = g.id AND t.points_verified = 1) AS verified
       FROM gameweeks g WHERE g.status = 'locked' AND g.id > ? AND g.id < ? ORDER BY g.id DESC LIMIT 6`,
  ).bind(c.season.base, c.season.base + 100).all();
  return json({ gameweeks: rows.results.map((g) => ({ gw: gwNum(g.id), status: g.points_status || 'waiting', tries: g.points_tries, at: g.points_at, squads: g.squads, scored: g.scored, verified: g.verified })) });
});

// Score a finished gameweek now: with live data sent by `npm run points`, or fetched here.
route('POST', '/api/admin/points', async (c) => {
  needAdminOrToken(c);
  const body = await readJson(c.req, 4 * 1024 * 1024);
  const num = +body.gw;
  if (!(num >= 1 && num <= 38)) fail(400, 'bad_gw');
  const key = gwKey(c.season, num);
  const g = await c.env.DB.prepare('SELECT status FROM gameweeks WHERE id = ?').bind(key).first();
  if (!g || g.status !== 'locked') fail(409, 'gw_not_finished');
  let live = body.live;
  if (!live) {
    try { live = await fetchLive(num); } catch { fail(502, 'fpl_blocked'); }
  }
  const scored = await scoreGameweek(c.env, c.fpl, key, live, c.now);
  const scouts = await scoreScouts(c.env, key, c.now);
  return json({ gw: num, scored, scouts });
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
    const open = await syncGameweeks(env, fpl, now);
    await autoChoosePlans(env, now).catch((e) => console.log(JSON.stringify({ msg: 'plan pick failed', error: String(e) })));
    if (open) await ensureFixtures(env, open.id, open.season).catch((e) => console.log(JSON.stringify({ msg: 'fixtures failed', error: String(e) })));
    ctx.waitUntil(badgeJob(env, open, now, hourly ? 2 * 3600e3 : 10 * 60e3).catch((e) => console.log(JSON.stringify({ msg: 'badges failed', error: String(e) }))));
    if (hourly) {
      ctx.waitUntil(cleanupImages(env));
      ctx.waitUntil(env.DB.prepare('DELETE FROM duel_offers WHERE at < ?').bind(now - 86400000).run());
      ctx.waitUntil(pointsJob(env, fpl, now).catch((e) => console.log(JSON.stringify({ msg: 'points job failed', error: String(e) }))));
    }
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
  // Plan B screenshots of finished gameweeks are not needed any more.
  const plans = await env.DB.prepare(
    `SELECT id, image_key FROM plans WHERE image_key IS NOT NULL AND gw <= (SELECT MAX(id) FROM gameweeks WHERE status = 'locked') LIMIT 500`,
  ).all();
  if (plans.results.length) {
    await env.IMAGES.delete(plans.results.map((r) => r.image_key));
    await env.DB.batch(plans.results.map((r) => env.DB.prepare('UPDATE plans SET image_key = NULL WHERE id = ?').bind(r.id)));
  }
  if (!old.results.length) return;
  await env.IMAGES.delete(old.results.map((r) => r.image_key));
  await env.DB.batch(old.results.map((r) => env.DB.prepare('UPDATE teams SET image_key = NULL WHERE id = ?').bind(r.id)));
}
