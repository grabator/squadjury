// Stanje aplikacije i učitavanje podataka (sve preko /api, keš u api.js).
import { get, forget } from './api.js';
import { index } from './model.js';
import { tr } from './i18n.js';

export const S = { ready: false };

export async function load(id) {
  const [boot, fixtures, team] = await Promise.all([get('/bootstrap'), get('/fixtures'), get('/team/' + id)]);
  const { entry, history, picks } = team;
  if (!picks) { const e = new Error(tr('Ovaj tim još nema odigrano kolo.', 'This team has not played a gameweek yet.')); e.status = 404; throw e; }
  const ix = index(boot, fixtures);
  const lastGw = team.gw;
  // sve klasične lige: privatne (league_type "x") prvo, pa javne (Overall, klub, država, kolo početka)
  const all = (entry.leagues?.classic || []).filter((l) => l.id > 0).map((l) => ({ ...l, mine: (l.league_type ?? 'x') === 'x' }));
  const leagues = [...all.filter((l) => l.mine), ...all.filter((l) => !l.mine)];
  let saved = null;
  try { saved = +localStorage.getItem('fm-league-' + id) || null; } catch { /* bez spremnika */ }
  const ids = picks.picks.map((p) => p.element);
  const last = history.current[history.current.length - 1] || {};
  Object.assign(S, {
    ready: true, id, ix, entry, history, picks, ids, xi: ids.slice(0, 11), bench: ids.slice(11), lastGw,
    captain: picks.picks.find((p) => p.is_captain)?.element, vice: picks.picks.find((p) => p.is_vice_captain)?.element,
    bank: last.bank ?? entry.last_deadline_bank ?? 0, league: null, leagues, leagueId: leagues.some((l) => l.id === saved) ? saved : leagues[0]?.id || null
  });
}
export function setLeague(lid) {
  S.leagueId = lid; S.league = null;
  try { localStorage.setItem('fm-league-' + S.id, String(lid)); } catch { /* bez spremnika */ }
}
export function reset() { for (const k of Object.keys(S)) delete S[k]; S.ready = false; }

export async function league() {
  if (!S.leagueId) return null;
  if (!S.league) S.league = await get('/league/' + S.leagueId);
  return S.league;
}
const lives = new Map();
export const refreshLive = (gw) => forget('/live/' + gw);
export const live = (gw) => { const k = get('/live/' + gw); if (!lives.has(gw) || lives.get(gw).src !== k) { const m = k.then((d) => new Map(d.elements.map((e) => [e.id, e.stats]))); m.src = k; lives.set(gw, m); } return lives.get(gw); };
export const picksOf = (entryId, gw) => get('/entry/' + entryId + '/picks/' + gw);
export const historyOf = (entryId) => get('/entry/' + entryId + '/history');
export const element = (id) => get('/element/' + id);
export const teamOf = (p) => { const ids = p.picks.map((x) => x.element); return { xi: ids.slice(0, 11), bench: ids.slice(11), captain: p.picks.find((x) => x.is_captain)?.element, vice: p.picks.find((x) => x.is_vice_captain)?.element }; };

// bodovi kapitena (i najboljeg mogućeg kapitena) po kolima, za karijeru i žaljenje; zadnjih n kola
const lastGws = (n) => S.history.current.slice(-n).map((h) => h.event);
export const warmCaptainHistory = (n = 8) => { for (const gw of lastGws(n)) { picksOf(S.id, gw).catch(() => {}); live(gw).catch(() => {}); } };
export async function captainHistory(n = 8) {
  const gws = lastGws(n);
  const rows = await Promise.all(gws.map(async (gw) => {
    const [p, lv] = await Promise.all([picksOf(S.id, gw), live(gw)]);
    const t = teamOf(p), pts = (id) => lv.get(id)?.total_points || 0, mins = (id) => lv.get(id)?.minutes || 0;
    // ako kapiten nije igrao, traku nosi vice kapiten
    const capId = mins(t.captain) || !t.vice || !mins(t.vice) ? t.captain : t.vice;
    const bestId = t.xi.reduce((b, id) => (pts(id) > pts(b) ? id : b), t.xi[0]);
    return { gw, cap: pts(capId), best: pts(bestId), capId, bestId, mult: p.active_chip === '3xc' ? 3 : 2, chip: p.active_chip, played: mins(capId) > 0 };
  }));
  return rows;
}
