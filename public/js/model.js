// Model predviđenih bodova i preporuke. Čiste funkcije, koriste ih i preglednik i testovi.
// Sve brojke su procjena (forma, prosjek bodova, očekivani golovi i asistencije, minutaža,
// težina protivnika, domaći teren), a ne sigurna brojka.
import { tr, lang } from './i18n.js';

export const POS = { 1: 'GK', 2: 'DEF', 3: 'MID', 4: 'FWD' };
export const POS_BS = tr({ 1: 'Golman', 2: 'Odbrana', 3: 'Vezni', 4: 'Napad' }, { 1: 'Goalkeeper', 2: 'Defender', 3: 'Midfielder', 4: 'Forward' });
const dec = (s) => (lang === 'bs' ? s.replace('.', ',') : s);
export const EP_W_OURS = 0.1;
const FDR_FACTOR = { 1: 1.25, 2: 1.15, 3: 1, 4: 0.85, 5: 0.72 };
const GOAL_PTS = { 1: 10, 2: 6, 3: 5, 4: 4 };

export const num = (v) => (v == null || v === '' ? 0 : +v);
export const price = (e) => dec((e.now_cost / 10).toFixed(1));

/** Indeksi za brz pristup: igrači i klubovi po id-u, utakmice po klubu. */
export function index(boot, fixtures) {
  const players = new Map(boot.elements.map((e) => [e.id, e]));
  const teams = new Map(boot.teams.map((t) => [t.id, t]));
  const byTeam = new Map();
  for (const f of fixtures) {
    if (!f.event) continue;
    for (const [team, opp, home, fdr] of [[f.team_h, f.team_a, true, f.team_h_difficulty], [f.team_a, f.team_h, false, f.team_a_difficulty]]) {
      if (!byTeam.has(team)) byTeam.set(team, []);
      byTeam.get(team).push({ gw: f.event, opp, home, fdr, kickoff: f.kickoff_time, id: f.id, finished: f.finished, hs: f.team_h_score, as: f.team_a_score });
    }
  }
  for (const list of byTeam.values()) list.sort((a, b) => a.gw - b.gw || String(a.kickoff).localeCompare(String(b.kickoff)));
  const next = boot.events.find((e) => e.is_next) || boot.events.find((e) => !e.finished) || boot.events[boot.events.length - 1];
  const current = boot.events.find((e) => e.is_current) || next;
  return { boot, players, teams, byTeam, nextGw: next.id, currentGw: current.id, events: boot.events, lastGw: boot.events.length, memo: new Map() };
}

/** Utakmice kluba u kolima od..do (može ih biti 0, 1 ili 2 u jednom kolu). */
export function fixturesFor(ix, teamId, fromGw, n = 1) {
  return (ix.byTeam.get(teamId) || []).filter((f) => f.gw >= fromGw && f.gw < fromGw + n);
}

/** Šansa da igra sljedeće kolo, od 0 do 1. */
export function availability(e) {
  if (e.status === 'a') return 1;
  if (e.chance_of_playing_next_round != null) return e.chance_of_playing_next_round / 100;
  return e.status === 'd' ? 0.5 : 0;
}

/** Očekivane minute po utakmici (udio od 0 do 1). */
export function minuteShare(e, gwsPlayed) {
  if (gwsPlayed <= 0) return 1;
  const byMin = Math.min(1, e.minutes / (gwsPlayed * 90));
  const bySt = e.starts != null ? Math.min(1, e.starts / gwsPlayed) : byMin;
  return Math.max(byMin, bySt * 0.95);
}

/**
 * Osnovni bodovi po utakmici: spoj prosjeka sezone, forme i (kad postoje) očekivanih golova i asistencija,
 * umanjen za malu minutažu.
 */
export function baseRate(e, gwsPlayed) {
  const ppg = num(e.points_per_game), form = num(e.form), share = minuteShare(e, gwsPlayed);
  let rate = 0.55 * ppg + 0.45 * form;
  if (e.expected_goals_per_90 != null) {
    const xg = num(e.expected_goals_per_90), xa = num(e.expected_assists_per_90);
    const xRate = 2 + (xg * GOAL_PTS[e.element_type] + xa * 3) * share + (e.element_type <= 2 ? 1.2 : e.element_type === 3 ? 0.3 : 0) + 0.5;
    rate = 0.4 * ppg + 0.3 * form + 0.3 * xRate;
  }
  return rate * (0.35 + 0.65 * Math.sqrt(share));
}

/** Predviđeni bodovi igrača u kolima [fromGw, fromGw+n). */
export function xp(ix, e, fromGw = ix.nextGw, n = 1) {
  const key = e.id + ':' + fromGw + ':' + n;
  if (ix.memo.has(key)) return ix.memo.get(key);
  const gwsPlayed = Math.max(1, ix.currentGw);
  const rate = baseRate(e, gwsPlayed);
  let sum = 0;
  for (const f of fixturesFor(ix, e.team, fromGw, n)) {
    let v = rate * (FDR_FACTOR[f.fdr] || 1) * (f.home ? 1.05 : 0.97);
    if (f.gw === ix.nextGw) {
      v *= availability(e);
      // za sljedeće kolo FPL daje svoju procjenu (ep_next) koja zna i za povrede i rotaciju; provjera na prošlim
      // kolima (scripts/backtest.mjs) pokazala je da je tačnija od naše, pa ona nosi 90%
      if (e.ep_next != null && e.ep_next !== '') v = EP_W_OURS * v + (1 - EP_W_OURS) * num(e.ep_next);
    } else if (e.status === 'i' || e.status === 's') v *= f.gw <= ix.nextGw + 1 ? 0.5 : 0.9;
    sum += v;
  }
  const out = Math.round(sum * 10) / 10;
  ix.memo.set(key, out);
  return out;
}

export const fmt = (v, d = 1) => dec((Math.round(v * 10 ** d) / 10 ** d).toFixed(d));

/** Kratko objašnjenje zašto je igrač dobar ili loš izbor za sljedeće kolo. */
export function reason(ix, e) {
  const fx = fixturesFor(ix, e.team, ix.nextGw, 1);
  const parts = [];
  if (!fx.length) return tr('Nema utakmicu u ovom kolu.', 'No match this gameweek.');
  parts.push(fx.map((f) => (f.home ? tr('kod kuće protiv ', 'at home to ') : tr('u gostima kod ', 'away at ')) + ix.teams.get(f.opp).name).join(tr(' i ', ' and ')));
  if (fx.length > 1) parts.push(tr('dvije utakmice u kolu', 'two matches this gameweek'));
  const form = num(e.form);
  if (form >= 6) parts.push(tr('odlična forma (', 'great form (') + fmt(form) + ')');
  else if (form < 3) parts.push(tr('slaba forma (', 'poor form (') + fmt(form) + ')');
  const xgi = num(e.expected_goals_per_90) + num(e.expected_assists_per_90);
  if (e.element_type >= 3 && xgi >= 0.6) parts.push(tr('stalno je u šansama (', 'always in the chances (') + fmt(xgi, 2) + tr(' očekivanih golova i asistencija po utakmici)', ' expected goals and assists per match)'));
  if (e.status !== 'a') parts.push(e.news ? e.news.toLowerCase() : tr('upitan za kolo', 'doubtful for the gameweek'));
  const s = parts.join(', ');
  return s.charAt(0).toUpperCase() + s.slice(1) + '.';
}

/** Kandidati za kapitena iz prvih 11, najbolji prvi. */
export function captainOptions(ix, squadIds) {
  return squadIds.map((id) => ix.players.get(id)).filter(Boolean)
    .map((e) => ({ e, xp: xp(ix, e), own: num(e.selected_by_percent), why: reason(ix, e) }))
    .sort((a, b) => b.xp - a.xp);
}

// ---------------- postava ----------------
/**
 * Najbolja postava iz 15 igrača po datoj ocjeni (npr. predviđeni ili stvarni bodovi):
 * 1 golman, najmanje 3 odbrambena, 2 vezna i 1 napadač, ukupno 11. Vraća i formaciju i klupu.
 */
export function bestXI(players, score) {
  const by = (t) => players.filter((e) => e.element_type === t).sort((a, b) => score(b) - score(a));
  const [g, d, m, f] = [by(1), by(2), by(3), by(4)];
  let best = null;
  for (let nd = 3; nd <= 5; nd++) for (let nm = 2; nm <= 5; nm++) {
    const nf = 10 - nd - nm;
    if (nf < 1 || nf > 3 || nd > d.length || nm > m.length || nf > f.length) continue;
    const xi = [g[0], ...d.slice(0, nd), ...m.slice(0, nm), ...f.slice(0, nf)].filter(Boolean);
    const total = xi.reduce((s, e) => s + score(e), 0);
    if (!best || total > best.total) best = { xi, total, formation: nd + '-' + nm + '-' + nf };
  }
  if (!best) return { xi: players.slice(0, 11), bench: players.slice(11), total: 0, formation: '' };
  const inXi = new Set(best.xi.map((e) => e.id));
  const rest = players.filter((e) => !inXi.has(e.id));
  const bench = [...rest.filter((e) => e.element_type === 1), ...rest.filter((e) => e.element_type !== 1).sort((a, b) => score(b) - score(a))];
  const cap = best.xi.slice().sort((a, b) => score(b) - score(a))[0];
  return { ...best, bench, captain: cap, total: best.total + (cap ? score(cap) : 0) };
}

// ---------------- transferi ----------------
function squadInfo(ix, squadIds) {
  const squad = squadIds.map((id) => ix.players.get(id)).filter(Boolean);
  const perTeam = {};
  for (const e of squad) perTeam[e.team] = (perTeam[e.team] || 0) + 1;
  return { squad, perTeam, owned: new Set(squadIds) };
}

/**
 * Najbolji pojedinačni transferi: za svakog igrača u timu traži zamjenu iste pozicije
 * koja staje u budžet (cijena igrača + banka) i ne prelazi 3 igrača iz istog kluba.
 * Napomena: prodajna cijena u FPL-u može biti malo niža od trenutne; ovdje računamo sa trenutnom.
 */
export function transferIdeas(ix, squadIds, bank, { horizon = 5, limit = 5 } = {}) {
  const { squad, perTeam, owned } = squadInfo(ix, squadIds);
  const pool = [...ix.players.values()].filter((e) => !owned.has(e.id) && e.minutes > 0 && e.status !== 'u');
  const getXp = (e) => xp(ix, e, ix.nextGw, horizon);
  const ideas = [];
  for (const out of squad) {
    const budget = out.now_cost + bank;
    let best = null;
    for (const inn of pool) {
      if (inn.element_type !== out.element_type || inn.now_cost > budget) continue;
      if (inn.team !== out.team && (perTeam[inn.team] || 0) >= 3) continue;
      const gain = getXp(inn) - getXp(out);
      if (!best || gain > best.gain) best = { out, inn, gain };
    }
    if (best && best.gain > 0.5) ideas.push({ ...best, gain: Math.round(best.gain * 10) / 10, cost: best.inn.now_cost - out.now_cost });
  }
  // svaki igrač koji ulazi samo jednom, i najviše dva prijedloga iz istog kluba
  const seen = new Set(), clubs = {};
  return ideas.sort((a, b) => b.gain - a.gain).filter((t) => {
    if (seen.has(t.inn.id) || (clubs[t.inn.team] || 0) >= 2) return false;
    seen.add(t.inn.id); clubs[t.inn.team] = (clubs[t.inn.team] || 0) + 1; return true;
  }).slice(0, limit);
}

/**
 * Najbolji par transfera (dva igrača van, dva unutra) u okviru budžeta i pravila 3 po klubu.
 * Traži među najboljim kandidatima po poziciji da ostane brzo.
 */
export function transferPairs(ix, squadIds, bank, { horizon = 5, limit = 3 } = {}) {
  const { squad, perTeam, owned } = squadInfo(ix, squadIds);
  const getXp = (e) => xp(ix, e, ix.nextGw, horizon);
  const cands = {};
  for (const t of [1, 2, 3, 4]) cands[t] = [...ix.players.values()].filter((e) => e.element_type === t && !owned.has(e.id) && e.minutes > 0).sort((a, b) => getXp(b) - getXp(a)).slice(0, 25);
  const outs = squad.slice().sort((a, b) => getXp(a) - getXp(b)).slice(0, 7);
  const res = [];
  for (let i = 0; i < outs.length; i++) for (let j = i + 1; j < outs.length; j++) {
    const o1 = outs[i], o2 = outs[j];
    const budget = bank + o1.now_cost + o2.now_cost;
    let best = null;
    for (const a of cands[o1.element_type]) for (const b of cands[o2.element_type]) {
      if (a.id === b.id || a.now_cost + b.now_cost > budget) continue;
      const pt = { ...perTeam }; pt[o1.team]--; pt[o2.team]--; pt[a.team] = (pt[a.team] || 0) + 1; pt[b.team] = (pt[b.team] || 0) + 1;
      if (pt[a.team] > 3 || pt[b.team] > 3) continue;
      const gain = getXp(a) + getXp(b) - getXp(o1) - getXp(o2);
      if (!best || gain > best.gain) best = { outs: [o1, o2], ins: [a, b], gain };
    }
    if (best) res.push({ ...best, gain: Math.round(best.gain * 10) / 10 });
  }
  return res.sort((a, b) => b.gain - a.gain).slice(0, limit);
}

/** Da li se dodatni transfer za minus 4 isplati: kroz 5 kola treba donijeti više od 4 boda. */
export function hitWorth(gain) {
  const net = Math.round((gain - 4) * 10) / 10;
  return { net, worth: net >= 2, close: net > -1 && net < 2 };
}

/** Razlika u bodovima ako "out" zamijeniš sa "inn", po kolima i ukupno. */
export function whatIf(ix, out, inn, horizon = 5) {
  const rows = [];
  for (let gw = ix.nextGw; gw < ix.nextGw + horizon; gw++) rows.push({ gw, out: xp(ix, out, gw, 1), inn: xp(ix, inn, gw, 1) });
  const total = rows.reduce((s, r) => s + r.inn - r.out, 0);
  return { rows, gain: Math.round(total * 10) / 10 };
}

/**
 * Procjena besplatnih transfera za sljedeće kolo iz historije menadžera.
 * Pravila od sezone 2024/25: 1 novi transfer po kolu, najviše 5 sačuvanih; Wildcard i Free Hit ih ne troše.
 */
export function freeTransfers(history) {
  const chips = new Map((history.chips || []).map((c) => [c.event, c.name]));
  let ft = 0;
  for (const h of history.current) {
    if (h.event === 1) { ft = 1; continue; }
    const chip = chips.get(h.event);
    if (chip === 'wildcard' || chip === 'freehit') { ft = Math.min(5, ft + 1); continue; }
    ft = Math.min(5, Math.max(0, ft - h.event_transfers) + 1);
  }
  return Math.max(1, ft);
}

/** Upozorenja za tim: povrede, igrači bez utakmice, pad cijene. */
export function alerts(ix, squadIds) {
  const out = [];
  for (const id of squadIds) {
    const e = ix.players.get(id);
    if (!e) continue;
    if (e.status !== 'a') out.push({ e, kind: 'povreda', text: e.web_name + ': ' + (e.news || tr('upitan za sljedeće kolo', 'doubtful for the next gameweek')) + (e.chance_of_playing_next_round != null ? ' (' + e.chance_of_playing_next_round + tr('% šanse da igra)', '% chance of playing)') : '') });
    else if (!fixturesFor(ix, e.team, ix.nextGw, 1).length) out.push({ e, kind: 'bez utakmice', text: e.web_name + tr(' nema utakmicu u kolu ', ' has no match in gameweek ') + ix.nextGw + '.' });
    if (e.cost_change_event < 0) out.push({ e, kind: 'cijena', text: e.web_name + tr(' je ovo kolo pao u cijeni.', ' dropped in price this gameweek.') });
  }
  return out;
}

/** Igrači koje mnogo ljudi kupuje ovo kolo: vjerovatno će uskoro poskupjeti. */
export function risers(ix, limit = 8) {
  return [...ix.players.values()].filter((e) => e.transfers_in_event != null)
    .map((e) => ({ e, net: num(e.transfers_in_event) - num(e.transfers_out_event) }))
    .sort((a, b) => b.net - a.net).slice(0, limit);
}

// ---------------- raspored ----------------
/** Prosječna težina protivnika kluba u kolima [from, from+n). Prazno kolo računa se kao 5. */
export function fixtureEase(ix, teamId, from, n) {
  let sum = 0, games = 0;
  for (let gw = from; gw < from + n; gw++) {
    const fx = fixturesFor(ix, teamId, gw, 1);
    if (!fx.length) { sum += 5; games++; continue; }
    for (const f of fx) { sum += f.fdr; games++; }
  }
  return games ? sum / games : 5;
}

/** Duplo (2 utakmice) i prazno (0 utakmica) kolo po klubu. */
export function specialGws(ix, from, n) {
  const out = [];
  for (const t of ix.teams.values()) for (let gw = from; gw < from + n && gw <= ix.lastGw; gw++) {
    const c = fixturesFor(ix, t.id, gw, 1).length;
    if (c !== 1) out.push({ team: t, gw, kind: c === 0 ? 'prazno' : 'duplo' });
  }
  return out;
}

/** Klubovi kojima se raspored uskoro jako olakšava (dobro vrijeme da kupiš njihove igrače). */
export function fixtureSwings(ix, { now = 3, later = 4, offset = 2 } = {}) {
  return [...ix.teams.values()].map((t) => {
    const a = fixtureEase(ix, t.id, ix.nextGw, now), b = fixtureEase(ix, t.id, ix.nextGw + offset, later);
    return { team: t, now: a, later: b, delta: a - b };
  }).filter((x) => x.delta >= 0.6).sort((x, y) => y.delta - x.delta);
}

// ---------------- simulacija kola ----------------
function gauss(r) { let u = 0, v = 0; while (!u) u = r(); while (!v) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
export function seeded(seed) { let s = seed % 2147483647 || 1; return () => (s = (s * 16807) % 2147483647) / 2147483647; }

/** Jedno "odigrano" kolo za igrača: oko predviđenih bodova, sa šansom za veliki dan. */
export function simPlayer(mean, r) {
  if (mean <= 0) return 0;
  const sd = 0.9 * Math.sqrt(mean) + 1.2;
  let v = mean + gauss(r) * sd;
  if (r() < 0.06 * Math.min(1.5, mean / 5)) v += 6 + r() * 6;
  return Math.max(0, Math.round(v));
}

/**
 * Šansa da tim A ima više bodova od tima B u sljedećem kolu (zajednički igrači se poništavaju).
 * a, b: { xi: [id], captain: id }
 */
export function duelOdds(ix, a, b, runs = 3000, seed = 7) {
  const r = seeded(seed);
  const pts = (team, sims) => team.xi.reduce((s, id) => s + sims.get(id) * (id === team.captain ? 2 : 1), 0);
  const ids = new Set([...a.xi, ...b.xi]);
  const means = new Map([...ids].map((id) => [id, xp(ix, ix.players.get(id))]));
  let win = 0, draw = 0, sumA = 0, sumB = 0;
  for (let k = 0; k < runs; k++) {
    const sims = new Map([...ids].map((id) => [id, simPlayer(means.get(id), r)]));
    const pa = pts(a, sims), pb = pts(b, sims);
    sumA += pa; sumB += pb;
    if (pa > pb) win++; else if (pa === pb) draw++;
  }
  return { win: win / runs, draw: draw / runs, lose: 1 - (win + draw) / runs, meanA: sumA / runs, meanB: sumB / runs };
}

/** Šansa za zelenu strelicu: koliko često tim prelazi prosjek kola (procjena prosjeka iz prethodnih kola). */
export function greenArrowOdds(ix, team, avgGuess, runs = 3000, seed = 11) {
  const r = seeded(seed);
  const means = new Map(team.xi.map((id) => [id, xp(ix, ix.players.get(id))]));
  const scores = [];
  for (let k = 0; k < runs; k++) scores.push(team.xi.reduce((s, id) => s + simPlayer(means.get(id), r) * (id === team.captain ? 2 : 1), 0));
  scores.sort((a, b) => a - b);
  return { p: scores.filter((s) => s > avgGuess).length / runs, low: scores[Math.floor(runs * 0.1)], mid: scores[Math.floor(runs * 0.5)], high: scores[Math.floor(runs * 0.9)] };
}

// ---------------- rival ----------------
/** Poređenje dva tima: zajednički igrači i razlike (diferencijali) sa predviđenim bodovima. */
export function compareSquads(ix, mine, theirs) {
  const A = new Set(mine.xi), B = new Set(theirs.xi);
  const row = (id) => ({ e: ix.players.get(id), xp: xp(ix, ix.players.get(id)) });
  return {
    shared: mine.xi.filter((id) => B.has(id)).map(row),
    onlyMine: mine.xi.filter((id) => !B.has(id)).map(row).sort((a, b) => b.xp - a.xp),
    onlyTheirs: theirs.xi.filter((id) => !A.has(id)).map(row).sort((a, b) => b.xp - a.xp)
  };
}

/** Koga će rival vjerovatno staviti za kapitena: njegov prošli izbor ako i dalje ima dobar raspored, inače najbolji po procjeni. */
export function predictCaptain(ix, xiIds, lastCaptain) {
  const opts = captainOptions(ix, xiIds);
  if (!opts.length) return null;
  const last = opts.find((o) => o.e.id === lastCaptain);
  if (last && last.xp >= opts[0].xp * 0.85) return { ...last, sure: 0.7 };
  return { ...opts[0], sure: last ? 0.5 : 0.6 };
}

// ---------------- karijera ----------------
/**
 * XP iz historije sezone. Pravila:
 * zelena strelica +30, iznad prosjeka kola +20, 70 ili više bodova +50, 90 ili više još +50,
 * kola bez minus bodova +10, kapiten sa 10+ bodova +50 (kad su poznati bodovi kapitena).
 */
export function careerXp(history, events, captainPts = {}) {
  const log = [];
  let prevRank = null;
  for (const h of history.current) {
    const ev = events.find((e) => e.id === h.event) || {};
    const items = [];
    if (prevRank != null && h.overall_rank < prevRank) items.push([tr('Zelena strelica', 'Green arrow'), 30]);
    if (ev.average_entry_score && h.points > ev.average_entry_score) items.push([tr('Iznad prosjeka kola', 'Above the gameweek average'), 20]);
    if (h.points >= 70) items.push([tr('70+ bodova u kolu', '70+ points in a gameweek'), 50]);
    if (h.points >= 90) items.push([tr('90+ bodova u kolu', '90+ points in a gameweek'), 50]);
    if (!h.event_transfers_cost) items.push([tr('Bez minus bodova', 'No points hits'), 10]);
    if (captainPts[h.event] >= 10) items.push([tr('Kapiten donio ' + captainPts[h.event] + ' bodova', 'Captain scored ' + captainPts[h.event] + ' points'), 50]);
    log.push({ gw: h.event, items, xp: items.reduce((s, x) => s + x[1], 0) });
    prevRank = h.overall_rank;
  }
  const total = log.reduce((s, x) => s + x.xp, 0);
  return { total, log, ...levelOf(total) };
}

const TITLES = tr([[0, 'Amater'], [5, 'Trener početnik'], [10, 'Trener'], [15, 'Menadžer'], [25, 'Iskusni menadžer'], [35, 'Taktičar'], [45, 'Legenda']], [[0, 'Amateur'], [5, 'Rookie coach'], [10, 'Coach'], [15, 'Manager'], [25, 'Seasoned manager'], [35, 'Tactician'], [45, 'Legend']]);
export function levelOf(xpTotal) {
  // svaki nivo traži malo više od prethodnog: 100, 120, 140...
  let level = 1, need = 100, left = xpTotal;
  while (left >= need) { left -= need; level++; need += 20; }
  const title = TITLES.filter(([l]) => level >= l).pop()[1];
  return { level, into: left, need, title };
}

/** Značke koje se mogu izračunati iz historije. */
export function badges(history, events, captainPts = {}) {
  const h = history.current;
  const avg = (gw) => (events.find((e) => e.id === gw) || {}).average_entry_score || 0;
  let streak = 0, bestStreak = 0, prev = null;
  for (const x of h) { if (prev != null && x.overall_rank < prev) { streak++; bestStreak = Math.max(bestStreak, streak); } else streak = 0; prev = x.overall_rank; }
  const caps = Object.values(captainPts);
  return [
    { id: 'zelene3', name: tr('Tri zelene zaredom', 'Three greens in a row'), on: bestStreak >= 3, hint: tr('Rang bolji tri kola zaredom', 'Rank up three gameweeks in a row') },
    { id: 'sto', name: tr('100 bodova u kolu', '100 in a gameweek'), on: h.some((x) => x.points >= 100), hint: tr('Jedno kolo sa 100 ili više bodova', 'One gameweek with 100 points or more') },
    { id: 'sedamdeset', name: tr('Veliko kolo', 'Big gameweek'), on: h.some((x) => x.points >= 70), hint: tr('70 ili više bodova u kolu', '70 or more points in a gameweek') },
    { id: 'kapiten', name: tr('Kapitenski pogodak', 'Captain haul'), on: caps.some((p) => p >= 16), hint: tr('Kapiten sa 16+ bodova (8 duplo)', 'Captain with 16+ points (8 doubled)') },
    { id: 'bezminusa', name: tr('Bez kazni', 'No hits'), on: h.length >= 5 && h.every((x) => !x.event_transfers_cost), hint: tr('Nijedan minus 4 cijelu sezonu', 'Not a single -4 all season') },
    { id: 'iznad', name: tr('Stalno iznad prosjeka', 'Always above average'), on: h.length >= 5 && h.slice(-5).every((x) => x.points > avg(x.event)), hint: tr('5 kola zaredom iznad prosjeka', '5 gameweeks in a row above average') },
    { id: 'wildcard', name: tr('Wildcard u pravo vrijeme', 'Well-timed Wildcard'), on: (history.chips || []).some((c) => c.name === 'wildcard' && h.find((x) => x.event === c.event)?.points > avg(c.event)), hint: tr('Kolo sa Wildcardom iznad prosjeka', 'Wildcard gameweek above average') },
    { id: 'top100k', name: tr('Top 100.000', 'Top 100k'), on: h.some((x) => x.overall_rank <= 100000), hint: tr('Rang bolji od 100.000', 'Overall rank inside 100,000') }
  ];
}

/** Brojač žaljenja: bodovi ostavljeni na klupi, minus bodovi i (kad je poznato) propušteni kapiten. */
/**
 * Kapitenski pogoci kroz sezonu. Pogodak: kapiten donio 6+ bodova (12+ sa duplim).
 * Promašaj: 2 ili manje (samo minute ili nije igrao). Najbolji izbor: niko iz prvih 11 nije donio više.
 */
export const CAP_HIT = 6, CAP_MISS = 2;
export function captainStats(rows) {
  const n = rows.length;
  const hits = rows.filter((r) => r.cap >= CAP_HIT).length, misses = rows.filter((r) => r.cap <= CAP_MISS).length;
  const best = rows.filter((r) => r.cap >= r.best).length;
  const total = rows.reduce((s, r) => s + r.cap * r.mult, 0);
  const lost = rows.reduce((s, r) => s + Math.max(0, r.best - r.cap) * (r.mult - 1), 0);
  let streak = 0, run = 0;
  for (const r of rows) { run = r.cap >= CAP_HIT ? run + 1 : 0; streak = Math.max(streak, run); }
  return { n, hits, misses, best, total, lost, streak, rate: n ? hits / n : 0 };
}

export function regrets(history, captainMiss = {}) {
  const bench = history.current.reduce((s, x) => s + (x.points_on_bench || 0), 0);
  const hits = history.current.reduce((s, x) => s + (x.event_transfers_cost || 0), 0);
  const cap = Object.values(captainMiss).reduce((s, v) => s + v, 0);
  return { bench, hits, cap, total: bench + hits + cap };
}

// ---- formatiranje po izabranom jeziku, nezavisno od jezika preglednika ----
const DAYS = tr(['nedjelja', 'ponedjeljak', 'utorak', 'srijeda', 'četvrtak', 'petak', 'subota'], ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']);
const DAYS_SHORT = tr(['ned', 'pon', 'uto', 'sri', 'čet', 'pet', 'sub'], ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n) => String(n).padStart(2, '0');
export const int = (v) => String(Math.round(Math.abs(v))).replace(/\B(?=(\d{3})+(?!\d))/g, tr('.', ','));
export const time = (d) => pad(d.getHours()) + ':' + pad(d.getMinutes());
export const dayShort = (d) => DAYS_SHORT[d.getDay()];
export const dateShort = (d) => tr(d.getDate() + '.' + (d.getMonth() + 1) + '.', d.getDate() + ' ' + MONTHS[d.getMonth()]);
export const dateLong = (d) => DAYS[d.getDay()] + ', ' + dateShort(d) + tr(' u ', ' at ') + time(d);
export const pct = (p) => Math.round(p * 100) + '%';

export { plural } from './i18n.js';

// ---------------- uživo: bonus po BPS-u i odbrambeni doprinos ----------------
/**
 * Bonus u jednoj utakmici po BPS-u: 3, 2 i 1 za prva tri mjesta. Izjednačeni dijele mjesto,
 * a sljedeći igrač preskače (dva prva po 3, treći dobije 1), kao u FPL pravilima.
 * rows: [{ id, bps, mins }]; računaju se samo igrači koji su igrali.
 */
export function bonusFromBps(rows) {
  const played = rows.filter((r) => r.mins > 0);
  const out = new Map();
  for (const r of played) { const rank = 1 + played.filter((x) => x.bps > r.bps).length; out.set(r.id, rank <= 3 ? 4 - rank : 0); }
  return out;
}

/**
 * Bonus i BPS za sve igrače kola. lv: Map id -> stats (sa fx: [[utakmica, bps, minute]]).
 * Kad FPL potvrdi bonus u utakmici (neko ima bonus > 0), koristi se pravi bonus; inače procjena iz BPS-a.
 * Vraća Map id -> { bps, bonus, provisional } gdje je provisional bonus koji još nije u total_points.
 */
export function liveBonus(lv) {
  const byFix = new Map();
  for (const [id, s] of lv) for (const [f, bps, mins] of s.fx || []) { if (!byFix.has(f)) byFix.set(f, []); byFix.get(f).push({ id, bps, mins }); }
  const res = new Map();
  for (const [, rows] of byFix) {
    const confirmed = rows.some((r) => (lv.get(r.id)?.bonus || 0) > 0);
    const proj = bonusFromBps(rows);
    for (const r of rows) {
      const cur = res.get(r.id) || { bps: 0, bonus: 0, provisional: 0 };
      cur.bps += r.bps;
      if (confirmed) cur.bonus = lv.get(r.id)?.bonus || 0;
      else { const b = proj.get(r.id) || 0; cur.bonus += b; cur.provisional += b; }
      res.set(r.id, cur);
    }
  }
  for (const [id, s] of lv) if (!res.has(id)) res.set(id, { bps: s.bps || 0, bonus: s.bonus || 0, provisional: 0 });
  return res;
}

/** Odbrambeni doprinos (DefCon): odbrana treba 10 (otklanjanja, blokade, presjeci, startovi), vezni i napadači 12 (plus povrati lopte). Golmani ne dobijaju. */
export const DEFCON_NEED = { 2: 10, 3: 12, 4: 12 };
export function defCon(e, s = {}) {
  const need = DEFCON_NEED[e.element_type];
  if (!need) return null;
  const v = s.defensive_contribution ?? ((s.clearances_blocks_interceptions || 0) + (s.tackles || 0) + (e.element_type >= 3 ? s.recoveries || 0 : 0));
  return { v, need, hit: v >= need };
}

/**
 * Trofeji u ligi. members: [{ entry, hist: history.current }], caps: Map(kolo -> Map(entry -> bodovi kapitena)).
 * mgr: najviše bodova u kolu, cap: najbolji kapiten kola, jump: najveći skok na tabeli, top: prvo mjesto poslije kola.
 * Neriješeno se računa kao pobjeda svih sa istim rezultatom.
 */
export function leagueAwards(members, me, caps = new Map()) {
  const out = [], mine = members.find((m) => m.entry === me);
  if (!mine || members.length < 2) return out;
  const at = (m, gw) => m.hist.find((h) => h.event === gw);
  const rankAt = (gw) => { const rows = members.map((m) => ({ e: m.entry, t: at(m, gw)?.total_points })).filter((r) => r.t != null).sort((a, b) => b.t - a.t); const r = new Map(); rows.forEach((x, i) => r.set(x.e, i && x.t === rows[i - 1].t ? r.get(rows[i - 1].e) : i + 1)); return r; };
  let prev = null;
  for (const h of mine.hist) {
    const gw = h.event, pts = members.map((m) => at(m, gw)?.points).filter((p) => p != null);
    if (pts.length > 1 && h.points === Math.max(...pts)) out.push({ type: 'mgr', gw, val: h.points });
    const rk = rankAt(gw);
    if (rk.get(me) === 1) out.push({ type: 'top', gw, val: h.total_points });
    if (prev) {
      const jump = (e) => (prev.has(e) && rk.has(e) ? prev.get(e) - rk.get(e) : 0), best = Math.max(...members.map((m) => jump(m.entry)));
      if (best > 0 && jump(me) === best) out.push({ type: 'jump', gw, val: best });
    }
    prev = rk;
    const c = caps.get(gw);
    if (c && c.size > 1 && c.has(me)) { const mx = Math.max(...c.values()); if (mx > 0 && c.get(me) === mx) out.push({ type: 'cap', gw, val: mx }); }
  }
  return out;
}
