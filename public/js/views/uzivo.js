// Uživo: bodovi tvog tima u kolu, događaji (golovi, asistencije, bonus) i dvoboj sa rivalom iz lige.
import { S, live, liveFix, league, picksOf, teamOf, refreshLive, setLeague } from '../state.js';
import { POS_BS, plural, int, liveBonus, defCon, fixturesFor, playerState, dayShort, time } from '../model.js';
import { esc, ic, pbtn, leaguePick, kit, shirt, photo, flagColor } from '../ui.js';
import { TVBG } from './tim.js';
import { tr } from '../i18n.js';

export const prefetch = () => { live(S.lastGw).catch(() => {}); liveFix(S.lastGw).catch(() => {}); league().catch(() => {}); };
export const title = tr('Uživo', 'Live');
let rivalId = null, timer = null, side = false;

// bodovi igrača uživo: FPL bodovi plus privremeni bonus iz BPS-a dok ga FPL ne potvrdi
const ptsOf = (lv, lb, id) => (lv.get(id)?.total_points || 0) + (lb.get(id)?.provisional || 0);
const teamPoints = (t, lv, lb) => t.xi.reduce((s, id) => s + ptsOf(lv, lb, id) * (id === t.captain ? t.mult || 2 : 1), 0);
/**
 * Kartica igrača uživo: lijevo slika u okviru sa šarom SJ, desno bodovi, minute, DefCon (golman: odbrane) i bonus.
 * Prije utakmice desno stoje dan i vrijeme početka. Ime je na traci ispod.
 */
function liveCard(ix, e, s = {}, b = {}, pts, gw, lf, { cap, vice, bench }) {
  const { fx, state } = playerState(ix, e, gw, lf), mins = s.minutes || 0, now = Date.now();
  const ko = fx.map((f) => f.kickoff && new Date(f.kickoff)).filter(Boolean).sort((x, y) => x - y);
  const pre = state === 'pre', none = !fx.length, gk = e.element_type === 1, dc = defCon(e, s), sv = s.saves || 0, fc = flagColor(e);
  let right;
  if (none) right = `<b class="lc-p">–</b><span class="lc-t">${tr('ne igra', 'no game')}</span><span class="lc-t"></span>`;
  else if (pre) { const d = ko.find((x) => x > now) || ko[0]; right = `<b class="lc-p">–</b><span class="lc-t">${dayShort(d)}</span><span class="lc-t">${time(d)}</span>`; }
  else {
    // samo ono što je donijelo bodove: DefCon (golman: odbrane) i bonus
    const plus = gk ? Math.floor(sv / 3) : dc?.hit ? 2 : 0;
    const dcT = plus ? `<span class="lc-t on">+${plus} ${gk ? tr('OD', 'SV') : 'DC'}</span>` : '<span class="lc-t"></span>';
    const bT = b.bonus ? `<span class="lc-t gd${b.provisional ? ' pr' : ''}">+${b.bonus} B</span>` : '<span class="lc-t"></span>';
    right = `<b class="lc-p">${pts}</b><span class="lc-m${state === 'live' ? ' live' : ''}">${mins}'</span>${dcT}${bT}`;
  }
  const sr = `<span class="sr">${esc(e.web_name)}${cap ? ', ' + tr('kapiten', 'captain') : vice ? ', ' + tr('vice kapiten', 'vice captain') : ''}${bench ? ', ' + tr('na klupi', 'on the bench') : ''}: ${none ? tr('ne igra', 'no game') : pre ? tr('utakmica još nije počela', 'match not started') : `${pts} ${tr('bodova', 'points')}, ${mins} ${tr('minuta', 'minutes')}, BPS ${b.bps || 0}, bonus ${b.bonus || 0}${b.provisional ? tr(' (nije konačan)', ' (not final)') : ''}${dc ? `, DefCon ${dc.v} ${tr('od', 'of')} ${dc.need}` : ''}${gk ? `, ${tr('odbrane', 'saves')} ${sv}` : ''}`}</span>`;
  return `<button type="button" class="lc${bench ? ' out' : ''}${cap ? ' cap' : ''}" data-pid="${e.id}"${fc && e.news ? ` title="${esc(e.news)}"` : ''}><span class="lc-ph pat-bg" aria-hidden="true"><span class="shirt">${shirt(ix.teams.get(e.team), gk)}${photo(e)}</span>${cap ? '<i class="lc-c">C</i>' : vice ? '<i class="lc-c v">V</i>' : ''}${fc ? `<i class="lc-f" style="background:${fc}">!</i>` : ''}</span><span class="lc-r" aria-hidden="true">${right}</span><span class="lc-n" aria-hidden="true">${esc(e.web_name)}</span>${sr}</button>`;
}

export async function render() {
  const { ix } = S, gw = S.lastGw;
  const ev = ix.events.find((e) => e.id === gw) || {};
  const hist = S.history.current.find((h) => h.event === gw);
  const [lv, lf] = await Promise.all([live(gw), liveFix(gw).catch(() => null)]), lb = liveBonus(lv);
  const me = { xi: S.xi, bench: S.bench, captain: S.captain, mult: S.picks?.active_chip === '3xc' ? 3 : 2 };
  const toPlay = (xi) => xi.filter((id) => playerState(ix, ix.players.get(id), gw, lf).toPlay).length;
  const mine = teamPoints(me, lv, lb), prov = S.xi.reduce((s, id) => s + (lb.get(id)?.provisional || 0) * (id === S.captain ? me.mult : 1), 0);
  const L = await league().catch(() => null);
  const others = (L?.standings?.results || []).filter((r) => r.entry !== S.id);
  if (rivalId && !others.some((r) => r.entry === rivalId)) rivalId = null;
  if (!rivalId && others.length) { const myRow = L.standings.results.find((r) => r.entry === S.id); rivalId = (L.standings.results.find((r) => myRow && r.rank === myRow.rank - 1) || others[0]).entry; }
  let duel = '';
  if (rivalId) {
    const rpk = await picksOf(rivalId, gw), rp = { ...teamOf(rpk), mult: rpk.active_chip === '3xc' ? 3 : 2 }, rname = others.find((r) => r.entry === rivalId)?.entry_name || 'Rival';
    const theirs = teamPoints(rp, lv, lb), total = Math.max(1, mine + theirs);
    const leftMine = toPlay(S.xi), leftTheirs = toPlay(rp.xi);
    duel = `<section class="g card" aria-labelledby="h-duel"><div class="ch"><h2 id="h-duel" class="ct">${tr('Dvoboj', 'Head to head')}</h2></div><div class="pick2">${leaguePick(S.leagues, S.leagueId)}<label class="field">Rival<select id="rival">${others.map((r) => `<option value="${r.entry}"${r.entry === rivalId ? ' selected' : ''}>${esc(r.entry_name)}</option>`).join('')}</select></label></div>
      <div style="display:grid;grid-template-columns:1fr auto 1fr;align-items:center;text-align:center;gap:10px"><div><p class="sub">${esc(S.entry.name)}</p><p class="big" style="color:var(--green)">${mine}</p></div><p class="cond" style="font-size:28px;color:var(--d)">:</p><div><p class="sub">${esc(rname)}</p><p class="big" style="color:#ff6aa6">${theirs}</p></div></div>
      <div class="odds mt" aria-hidden="true"><i style="width:${(mine / total * 100).toFixed(0)}%;background:linear-gradient(90deg,#00c46a,var(--green))"></i><i style="width:${(theirs / total * 100).toFixed(0)}%;background:linear-gradient(90deg,var(--pink),#ff6aa6)"></i></div>
      <p class="sub" style="margin-top:10px">${mine === theirs ? tr('Izjednačeno.', 'Level.') : mine > theirs ? `${tr('Vodiš', 'You lead by')} ${mine - theirs} ${plural(mine - theirs, ['bod', 'boda', 'bodova'], ['point'])}.` : `${tr('Zaostaješ', 'You trail by')} ${theirs - mine} ${plural(theirs - mine, ['bod', 'boda', 'bodova'], ['point'])}.`} ${tr(`Još igra: ti ${leftMine}, rival ${leftTheirs} igrača.`, `Still to play: you ${leftMine}, rival ${leftTheirs} players.`)}</p></section>`;
  }
  else if (S.leagues.length) duel = `<section class="g card"><h2 class="ct">${tr('Dvoboj', 'Head to head')}</h2><div class="pick2" style="margin-top:12px">${leaguePick(S.leagues, S.leagueId)}</div><p class="muted" style="margin-top:10px">${tr('U ovoj ligi nema drugih menadžera. Izaberi drugu ligu.', 'There are no other managers in this league. Pick another league.')}</p></section>`;
  // događaji
  const feed = [];
  for (const id of [...S.xi, ...S.bench]) {
    const s = lv.get(id), e = ix.players.get(id);
    if (!s) continue;
    const mult = id === S.captain ? me.mult : S.bench.includes(id) ? 0 : 1;
    const gp = { 1: 10, 2: 6, 3: 5, 4: 4 }[e.element_type];
    for (let k = 0; k < s.goals_scored; k++) feed.push(['g', tr('GOL', 'GOAL'), e, tr(`${e.web_name} je dao gol`, `${e.web_name} scored`), gp * mult]);
    for (let k = 0; k < s.assists; k++) feed.push(['a', tr('AS', 'AST'), e, `${e.web_name}: ${tr('asistencija', 'assist')}`, 3 * mult]);
    if (s.clean_sheets && e.element_type <= 2) feed.push(['c', 'CS', e, `${e.web_name}: ${tr('bez primljenog gola', 'clean sheet')}`, 4 * mult]);
    const bb = lb.get(id)?.bonus || 0, dc = defCon(e, s);
    if (bb) feed.push(['b', 'B', e, `${e.web_name}: bonus${lb.get(id)?.provisional ? tr(' (privremeno)', ' (provisional)') : ''}`, bb * mult]);
    if (dc?.hit) feed.push(['d', 'DC', e, `${e.web_name}: ${tr('odbrambeni doprinos', 'defensive contribution')} ${dc.v}/${dc.need}`, 2 * mult]);
  }
  const rows = [...S.xi, ...S.bench].map((id, i) => {
    const e = ix.players.get(id), s = lv.get(id) || {}, cap = id === S.captain, bench = i > 10;
    return `<div class="li${cap ? ' hl' : ''}"><span class="k">${bench ? tr('klupa', 'bench') : POS_BS[e.element_type]}</span><span>${pbtn(e)}${cap ? ` <span class="chg up">C ×${me.mult}</span>` : ''}<br><span class="sub">${s.minutes || 0} min${s.goals_scored ? ', ' + s.goals_scored + tr(' gol', ' G') : ''}${s.assists ? ', ' + s.assists + tr(' as.', ' A') : ''}${(lb.get(id)?.bonus) ? ', bonus ' + lb.get(id).bonus : ''}, BPS ${lb.get(id)?.bps || 0}${defCon(e, s) ? ', DC ' + defCon(e, s).v + '/' + defCon(e, s).need : ''}</span></span><b class="cond" style="font-size:24px${bench ? ';opacity:.5' : ''}">${ptsOf(lv, lb, id) * (cap ? me.mult : 1)}</b></div>`;
  }).join('');
  // bonus uživo: po utakmici kola, igrači sa najviše BPS-a (prvo utakmice tvojih igrača)
  const myIds = new Set([...S.xi, ...S.bench]), myTeams = new Set([...myIds].map((id) => ix.players.get(id).team));
  const fxs = [];
  for (const t of ix.teams.values()) for (const f of fixturesFor(ix, t.id, gw, 1)) if (f.home) fxs.push({ id: f.id, h: t, a: ix.teams.get(f.opp) });
  const byFix = new Map();
  for (const [id, st] of lv) for (const [f, bps, mins] of st.fx || []) if (mins > 0) { if (!byFix.has(f)) byFix.set(f, []); byFix.get(f).push({ id, bps }); }
  const started = fxs.filter((f) => byFix.has(f.id)).sort((x, y) => (myTeams.has(y.h.id) || myTeams.has(y.a.id)) - (myTeams.has(x.h.id) || myTeams.has(x.a.id)));
  const bpsRows = (f) => byFix.get(f.id).sort((x, y) => y.bps - x.bps).slice(0, 5).map((r) => { const e = ix.players.get(r.id), b = lb.get(r.id) || {}; return `<div class="bps-r${myIds.has(r.id) ? ' mine' : ''}"><i class="kd" style="background:${kit(ix.teams.get(e.team))[0]}"></i>${pbtn(e)}<span class="num">${r.bps}</span><span class="bps-b${b.bonus ? ' on' : ''}">${b.bonus ? '+' + b.bonus : '0'}</span></div>`; }).join('');
  const conf = (f) => byFix.get(f.id).some((r) => (lv.get(r.id)?.bonus || 0) > 0);
  const bpsCard = started.length ? `<section class="g card" aria-labelledby="h-bps"><div class="ch"><h2 id="h-bps" class="ct">${tr('Bonus uživo (BPS)', 'Live bonus (BPS)')}</h2></div><p class="sub">${tr('Top 3 po BPS-u u utakmici dobijaju 3, 2 i 1 bod.', 'The top 3 by BPS in a match get 3, 2 and 1 points.')}</p>
      <div class="bps-list">${started.slice(0, 4).map((f) => `<div class="bps-fx"><p class="bps-h"><b>${esc(f.h.short_name)} – ${esc(f.a.short_name)}</b><span class="chg ${conf(f) ? 'nt' : 'up'}">${conf(f) ? tr('potvrđeno', 'confirmed') : tr('privremeno', 'provisional')}</span></p>${bpsRows(f)}</div>`).join('')}</div>
      ${started.length > 4 ? `<details class="more-d"><summary class="sub">${tr(`Ostale utakmice (${started.length - 4})`, `Other matches (${started.length - 4})`)}</summary><div class="bps-list">${started.slice(4).map((f) => `<div class="bps-fx"><p class="bps-h"><b>${esc(f.h.short_name)} – ${esc(f.a.short_name)}</b><span class="chg ${conf(f) ? 'nt' : 'up'}">${conf(f) ? tr('potvrđeno', 'confirmed') : tr('privremeno', 'provisional')}</span></p>${bpsRows(f)}</div>`).join('')}</div></details>` : ''}</section>` : '';
  // odbrambeni doprinos tvojih igrača
  const dcs = [...S.xi, ...S.bench].map((id) => { const e = ix.players.get(id), st = lv.get(id) || {}; return { e, st, dc: defCon(e, st) }; }).filter((x) => x.dc && x.st.minutes > 0).sort((x, y) => y.dc.v / y.dc.need - x.dc.v / x.dc.need);
  const dcCard = dcs.length ? `<section class="g card" aria-labelledby="h-dc"><h2 id="h-dc" class="ct">${tr('Odbrambeni doprinos (DefCon)', 'Defensive contribution (DefCon)')}</h2><p class="sub">${tr('Otklanjanja, blokade, presjeci i startovi (vezni i napadači i povrati lopte). Na 10 za odbranu i 12 za ostale stiže +2.', 'Clearances, blocks, interceptions and tackles (plus recoveries for midfielders and forwards). At 10 for defenders and 12 for the rest it is +2.')}</p>
      <div class="list" style="margin-top:10px">${dcs.map(({ e, dc }) => `<div class="li dc-r"><span>${pbtn(e)} <span class="sub">${POS_BS[e.element_type]}</span><span class="meter${dc.hit ? ' green' : ''}"><i style="width:${Math.min(100, Math.round(dc.v / dc.need * 100))}%"></i></span></span><b class="num">${dc.v}<small>/${dc.need}</small></b><span class="chg ${dc.hit ? 'up' : 'nt'}">${dc.hit ? '+2' : tr(`još ${dc.need - dc.v}`, `${dc.need - dc.v} to go`)}</span></div>`).join('')}</div></section>` : '';
  const st = ev.finished ? tr('završeno', 'finished') : tr('uživo', 'live');
  const left = toPlay(S.xi);
  return `<div class="tmv lv${side ? ' side-open' : ''}">
    <div class="tm-main">
      <div class="tvbn"><h1>${tr('Uživo', 'Live')}</h1><div class="lv-gw"><b>${tr('Kolo', 'GW')} ${gw}</b><span class="${ev.finished ? '' : 'on'}">${ev.finished ? '' : '<i aria-hidden="true"></i>'}${st}</span></div></div>
      <div class="tchips lvc" aria-label="${tr('Bodovi u kolu', 'Points in gameweek')} ${gw}">
        <div class="hl big"><span class="sub">${tr('Tvoji bodovi', 'Your points')}</span><b data-n="${mine}">${mine}</b>${prov ? `<span class="sub">${tr('uklj. bonus', 'incl. bonus')} +${prov}</span>` : ''}</div>
        <div><span class="sub">${tr('Prosjek', 'Average')}</span><b>${ev.average_entry_score ?? '–'}</b></div>
        <div><span class="sub">${tr('Još igra', 'To play')}</span><b>${left}<small>/11</small></b></div>
        <div><span class="sub">${tr('Rang kola', 'GW rank')}</span><b>${hist?.rank ? short(hist.rank) : '–'}</b></div>
      </div>
      <div class="pl-tools"><span class="sub lx-legend">${tr('B bonus po BPS-u, DC odbrambeni doprinos (10 odbrana, 12 ostali = +2)', 'B bonus from BPS, DC defensive contribution (10 defenders, 12 others = +2)')}</span><button type="button" class="btn sm ghost plan-open" data-side aria-expanded="${side}" aria-controls="tm-side">${tr('Detalji', 'Details')}</button></div>
      <section class="pitch tvp lvp" aria-label="${tr('Bodovi igrača', 'Player points')}">${TVBG}<div class="pboard" aria-hidden="true"><span>Squad</span><img src="/img/brand/mark.svg" alt=""><span>Jury</span></div><div class="field">${[1, 2, 3, 4].map((pos) => `<div class="line-row">${S.xi.map((id) => ix.players.get(id)).filter((e) => e.element_type === pos).map((e) => liveCard(ix, e, lv.get(e.id), lb.get(e.id), ptsOf(lv, lb, e.id) * (e.id === S.captain ? me.mult : 1), gw, lf, { cap: e.id === S.captain, vice: e.id === S.vice })).join('')}</div>`).join('')}</div>
        <div class="bench" aria-label="${tr('Klupa', 'Bench')}"><span class="bench-l">${tr('Klupa', 'Bench')}</span>${S.bench.map((id, i) => { const e = ix.players.get(id); return `<div class="bslot"><span class="sub">${i ? i + '.' : tr('GOL', 'GK')}</span>${liveCard(ix, e, lv.get(id), lb.get(id), ptsOf(lv, lb, id), gw, lf, { bench: true })}</div>`; }).join('')}</div></section>
    </div>
    <div class="tm-side" id="tm-side">
      <div class="side-h"><h2 class="ct">${tr(`Kolo ${gw}: detalji`, `Gameweek ${gw}: details`)}</h2><button type="button" class="icon-btn" data-side aria-label="${tr('Zatvori detalje', 'Close details')}">${ic('close')}</button></div>
      <p class="sub">${ev.finished ? tr('Kolo je završeno. Bonus bodovi su konačni kad ih FPL potvrdi.', 'The gameweek is finished. Bonus points are final once FPL confirms them.') : tr('Osvježava se svake minute dok traju utakmice. Bonus bodovi su privremeni.', 'Refreshes every minute while matches are on. Bonus points are provisional.')} ${tr('Automatske zamjene sa klupe FPL radi na kraju kola, pa ovdje još nisu uračunate.', 'FPL makes automatic substitutions at the end of the gameweek, so they are not counted here yet.')}</p>
      <section class="g card"><h2 class="ct">${tr('Šta se desilo', 'What happened')}</h2><div class="feed" style="margin-top:12px">${feed.length ? feed.map(([k, t, e, txt, p]) => `<p><span class="ev ${k}">${t}</span><span>${esc(txt)} <span class="sub">${esc(ix.teams.get(e.team).short_name)}</span></span><b class="num" style="color:${p ? 'var(--green)' : 'var(--d)'}">${p ? '+' + p : tr('klupa', 'bench')}</b></p>`).join('') : `<p class="muted">${tr('Još nema golova ni asistencija tvojih igrača.', 'No goals or assists from your players yet.')}</p>`}</div></section>
      ${duel}${bpsCard}${dcCard}
      <details class="g card more-d"><summary class="ct">${tr('Minute i događaji po igraču', 'Minutes and events per player')}</summary><div class="list" style="margin-top:12px">${rows}</div></details>
    </div>
  </div>`;
}

const short = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1).replace('.0', '') + 'M' : n >= 1e4 ? Math.round(n / 1e3) + 'k' : int(n));
export function bind(rerender) {
  document.querySelectorAll('[data-side]').forEach((b) => { b.onclick = () => { side = !side; rerender(true); }; });
  const sel = document.getElementById('rival');
  if (sel) sel.onchange = () => { rivalId = +sel.value; rerender(); };
  const lg = document.getElementById('lg-sel');
  if (lg) lg.onchange = () => { setLeague(+lg.value); rivalId = null; rerender(); };
  clearInterval(timer);
  const ev = S.ix.events.find((e) => e.id === S.lastGw);
  if (ev && !ev.finished) timer = setInterval(() => { if (location.hash.includes('uzivo') && !document.hidden) { refreshLive(S.lastGw); rerender(true); } else clearInterval(timer); }, 60000);
}
