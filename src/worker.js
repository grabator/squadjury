// FPL Manager: statična aplikacija (public/) i mali API koji prosljeđuje javne FPL podatke.
// FPL API ne dozvoljava pozive direktno iz preglednika (CORS), pa idu preko ovog Workera, uz keš.
//   GET /api/bootstrap              igrači, klubovi, kola
//   GET /api/fixtures               sve utakmice sa težinom
//   GET /api/entry/:id              menadžer
//   GET /api/entry/:id/history      bodovi i rang po kolima
//   GET /api/entry/:id/picks/:gw    tim u kolu
//   GET /api/entry/:id/transfers    svi transferi, i oni već napravljeni za sljedeće kolo
//   GET /api/live/:gw               bodovi igrača u kolu
//   GET /api/league/:id             tabela klasične lige
//   GET /api/element/:id            igrač: bodovi po kolima i sljedeće utakmice
//   GET /api/team/:id               menadžer, historija i tim zadnjeg kola u jednom odgovoru (brži početak)
// FPL_SOURCE=demo (ili snapshot u lokalnom razvoju) vraća izmišljene, ali stalne podatke (src/lib/demo.js).
// SquadJury (ocjenjivanje timova) je dio aplikacije: stranice pod /jury, svoj API pod /api, kod u src/jury.
import * as demo from './lib/demo.js';
import jury from './jury/worker.js';

const FPL = 'https://fantasy.premierleague.com/api';
const UA = { 'user-agent': 'FPL-Manager/0.1', accept: 'application/json' };

// koliko dugo čuvati odgovor (sekunde)
const TTL = { bootstrap: 900, fixtures: 900, entry: 300, history: 300, picks: 300, transfers: 120, live: 60, league: 300, element: 900, team: 300 };

const SEC = { 'x-content-type-options': 'nosniff', 'referrer-policy': 'strict-origin-when-cross-origin' };
const json = (data, status = 200, ttl = 0) => new Response(JSON.stringify(data), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': ttl ? `public, max-age=${Math.min(ttl, 120)}` : 'no-store', ...SEC }
});

export function route(path) {
  let m;
  if (path === '/api/bootstrap') return { kind: 'bootstrap', up: '/bootstrap-static/' };
  if (path === '/api/fixtures') return { kind: 'fixtures', up: '/fixtures/' };
  if ((m = path.match(/^\/api\/entry\/(\d{1,9})$/))) return { kind: 'entry', id: +m[1], up: `/entry/${m[1]}/` };
  if ((m = path.match(/^\/api\/entry\/(\d{1,9})\/history$/))) return { kind: 'history', id: +m[1], up: `/entry/${m[1]}/history/` };
  if ((m = path.match(/^\/api\/entry\/(\d{1,9})\/transfers$/))) return { kind: 'transfers', id: +m[1], up: `/entry/${m[1]}/transfers/` };
  if ((m = path.match(/^\/api\/entry\/(\d{1,9})\/picks\/(\d{1,2})$/))) return { kind: 'picks', id: +m[1], gw: +m[2], up: `/entry/${m[1]}/event/${m[2]}/picks/` };
  if ((m = path.match(/^\/api\/live\/(\d{1,2})$/))) return { kind: 'live', gw: +m[1], up: `/event/${m[1]}/live/` };
  if ((m = path.match(/^\/api\/league\/(\d{1,9})$/))) return { kind: 'league', id: +m[1], up: `/leagues-classic/${m[1]}/standings/` };
  if ((m = path.match(/^\/api\/element\/(\d{1,5})$/))) return { kind: 'element', id: +m[1], up: `/element-summary/${m[1]}/` };
  if ((m = path.match(/^\/api\/team\/(\d{1,9})$/))) return { kind: 'team', id: +m[1] };
  return null;
}

export function fromDemo(r) {
  switch (r.kind) {
    case 'bootstrap': return demo.bootstrap();
    case 'fixtures': return demo.fixtures();
    case 'entry': return demo.entry(r.id);
    case 'history': return demo.history(r.id);
    case 'picks': return demo.picks(r.id, r.gw);
    case 'transfers': return demo.transfers(r.id);
    case 'live': return demo.live(r.gw);
    case 'league': return demo.league(r.id);
    case 'element': { const e = demo.element(r.id); if (!e) { const x = new Error('nema'); x.status = 404; throw x; } return e; }
  }
}

// bootstrap-static je velik (oko 1,5 MB): šaljemo samo polja koja aplikacija koristi
const PF = ['id', 'web_name', 'first_name', 'second_name', 'team', 'element_type', 'now_cost', 'form', 'points_per_game', 'total_points', 'minutes', 'selected_by_percent', 'status', 'chance_of_playing_next_round', 'news', 'cost_change_event', 'ep_next', 'starts', 'event_points', 'goals_scored', 'assists', 'clean_sheets', 'bonus', 'expected_goals_per_90', 'expected_assists_per_90', 'ict_index', 'transfers_in_event', 'transfers_out_event'];
export function slimBootstrap(b) {
  return {
    teams: b.teams.map((t) => ({ id: t.id, name: t.name, short_name: t.short_name, strength: t.strength })),
    elements: b.elements.map((e) => Object.fromEntries(PF.map((k) => [k, e[k]]))),
    events: b.events.map((e) => ({ id: e.id, deadline_time: e.deadline_time, finished: e.finished, is_current: e.is_current, is_next: e.is_next, average_entry_score: e.average_entry_score, highest_score: e.highest_score })),
    element_types: b.element_types.map((t) => ({ id: t.id, singular_name_short: t.singular_name_short }))
  };
}

// event/live ima i detaljna objašnjenja bodova (velik odgovor): šaljemo samo statistike koje aplikacija koristi
const LF = ['minutes', 'goals_scored', 'assists', 'clean_sheets', 'goals_conceded', 'own_goals', 'penalties_saved', 'penalties_missed', 'yellow_cards', 'red_cards', 'saves', 'bonus', 'bps', 'defensive_contribution', 'clearances_blocks_interceptions', 'recoveries', 'tackles', 'total_points'];
// fx: po utakmici [id utakmice, BPS, minute] iz objašnjenja bodova (u duplom kolu svaka utakmica posebno)
const val = (x, id) => (x.stats || []).find((s) => s.identifier === id)?.value ?? 0;
export const slimLive = (d) => ({ elements: d.elements.map((e) => ({ id: e.id, stats: Object.fromEntries(LF.map((k) => [k, e.stats?.[k] ?? 0])), fx: (e.explain || []).map((x) => [x.fixture, val(x, 'bps'), val(x, 'minutes')]) })) });

async function fromFpl(r, ctx) {
  const cache = caches.default, key = new Request('https://fpl-cache.local' + r.up);
  const hit = await cache.match(key);
  if (hit) return hit.json();
  const res = await fetch(FPL + r.up, { headers: UA });
  if (res.status === 404) { const e = new Error('nema'); e.status = 404; throw e; }
  if (!res.ok) { const e = new Error('fpl ' + res.status); e.status = 502; throw e; }
  let data = await res.json();
  if (r.kind === 'bootstrap') data = slimBootstrap(data);
  if (r.kind === 'live') data = slimLive(data);
  ctx.waitUntil(cache.put(key, new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${TTL[r.kind]}` } })));
  return data;
}

// menadžer + historija + tim zadnjeg odigranog kola; get(r) vraća podatke za jednu rutu
export async function team(id, get) {
  const [entry, history] = await Promise.all([get(route('/api/entry/' + id)), get(route('/api/entry/' + id + '/history'))]);
  const gw = history.current.length ? history.current[history.current.length - 1].event : entry.current_event;
  const [picks, transfers] = await Promise.all([gw ? get(route('/api/entry/' + id + '/picks/' + gw)) : null, Promise.resolve().then(() => get(route('/api/entry/' + id + '/transfers'))).catch(() => [])]);
  return { entry, history, picks, gw, transfers };
}

const OLD = /^\/(leaderboard|post|squad|me|how|rules|privacy|admin|login)(\/.*)?$/;
const isFile = (p) => /\.[a-z0-9]+$/i.test(p);

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url), p = url.pathname;
    const r = p.startsWith('/api/') ? route(p) : null;
    if (r) return fpl(req, env, ctx, url, r);
    // stare SquadJury adrese (prije spajanja bile su u korijenu) vode na /jury
    if (OLD.test(p)) return Response.redirect(new URL('/jury' + p + url.search, url), 301);
    // SquadJury stranice (/jury, /jury/leaderboard, ...) dobijaju svoju ljusku
    if (/^\/jury(\/|$)/.test(p) && !isFile(p)) return env.ASSETS.fetch(new Request(new URL('/jury/', url), req));
    // SquadJury API, slike i linkovi za dijeljenje
    if (p.startsWith('/api/') || /^\/(t|r|l|u|embed)\//.test(p)) return jury.fetch(req, env, ctx);
    return env.ASSETS.fetch(req);
  },
  // cron: SquadJury zaključava kola, računa bodove, značke i kopije baze
  scheduled: (event, env, ctx) => jury.scheduled(event, env, ctx)
};

async function fpl(req, env, ctx, url, r) {
  if (req.method !== 'GET') return json({ greska: 'Samo GET.' }, 405);
  try {
    const useDemo = env.FPL_SOURCE === 'demo' || env.FPL_SOURCE === 'snapshot' || url.searchParams.get('demo') === '1';
    const one = useDemo ? fromDemo : (x) => fromFpl(x, ctx);
    const data = r.kind === 'team' ? await team(r.id, one) : await one(r);
    return json(data, 200, TTL[r.kind]);
  } catch (e) {
    if (e.status === 404) return json({ greska: 'Ne postoji tim ili liga sa tim brojem.' }, 404);
    console.error(e);
    return json({ greska: 'FPL trenutno ne odgovara. Pokušajte za minut.' }, 502);
  }
}
