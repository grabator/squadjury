// Uživo: bodovi tvog tima u kolu, događaji (golovi, asistencije, bonus) i dvoboj sa rivalom iz lige.
import { S, live, league, picksOf, teamOf, refreshLive, setLeague } from '../state.js';
import { POS_BS, plural, int } from '../model.js';
import { esc, pbtn, pitchCard, leaguePick } from '../ui.js';
import { tr } from '../i18n.js';

export const prefetch = () => { live(S.lastGw).catch(() => {}); league().catch(() => {}); };
export const title = tr('Uživo', 'Live');
let rivalId = null, timer = null;

const teamPoints = (t, lv) => t.xi.reduce((s, id) => s + (lv.get(id)?.total_points || 0) * (id === t.captain ? 2 : 1), 0);

export async function render() {
  const { ix } = S, gw = S.lastGw;
  const ev = ix.events.find((e) => e.id === gw) || {};
  const hist = S.history.current.find((h) => h.event === gw);
  const lv = await live(gw);
  const me = { xi: S.xi, bench: S.bench, captain: S.captain };
  const mine = teamPoints(me, lv), benchPts = S.bench.reduce((s, id) => s + (lv.get(id)?.total_points || 0), 0);
  const L = await league().catch(() => null);
  const others = (L?.standings?.results || []).filter((r) => r.entry !== S.id);
  if (rivalId && !others.some((r) => r.entry === rivalId)) rivalId = null;
  if (!rivalId && others.length) { const myRow = L.standings.results.find((r) => r.entry === S.id); rivalId = (L.standings.results.find((r) => myRow && r.rank === myRow.rank - 1) || others[0]).entry; }
  let duel = '';
  if (rivalId) {
    const rp = teamOf(await picksOf(rivalId, gw)), rname = others.find((r) => r.entry === rivalId)?.entry_name || 'Rival';
    const theirs = teamPoints(rp, lv), total = Math.max(1, mine + theirs);
    const leftMine = S.xi.filter((id) => !(lv.get(id)?.minutes)).length, leftTheirs = rp.xi.filter((id) => !(lv.get(id)?.minutes)).length;
    duel = `<section class="g card" aria-labelledby="h-duel"><div class="ch"><h2 id="h-duel" class="ct">${tr('Dvoboj', 'Head to head')}</h2></div><div class="pick2">${leaguePick(S.leagues, S.leagueId)}<label class="field">Rival<select id="rival">${others.map((r) => `<option value="${r.entry}"${r.entry === rivalId ? ' selected' : ''}>${esc(r.entry_name)}</option>`).join('')}</select></label></div>
      <div style="display:grid;grid-template-columns:1fr auto 1fr;align-items:center;text-align:center;gap:10px"><div><p class="sub">${esc(S.entry.name)}</p><p class="big" style="color:var(--green)">${mine}</p></div><p class="cond" style="font-size:28px;color:var(--d)">:</p><div><p class="sub">${esc(rname)}</p><p class="big" style="color:#ff6aa6">${theirs}</p></div></div>
      <div class="odds mt" aria-hidden="true"><i style="width:${(mine / total * 100).toFixed(0)}%;background:linear-gradient(90deg,#00c46a,var(--green))"></i><i style="width:${(theirs / total * 100).toFixed(0)}%;background:linear-gradient(90deg,var(--pink),#ff6aa6)"></i></div>
      <p class="sub" style="margin-top:10px">${mine === theirs ? tr('Izjednačeno.', 'Level.') : mine > theirs ? `${tr('Vodiš', 'You lead by')} ${mine - theirs} ${plural(mine - theirs, ['bod', 'boda', 'bodova'], ['point'])}.` : `${tr('Zaostaješ', 'You trail by')} ${theirs - mine} ${plural(theirs - mine, ['bod', 'boda', 'bodova'], ['point'])}.`} ${tr(`Bez minuta još: ti ${leftMine}, rival ${leftTheirs} igrača.`, `Still to play: you ${leftMine}, rival ${leftTheirs} players.`)}</p></section>`;
  }
  else if (S.leagues.length) duel = `<section class="g card"><h2 class="ct">${tr('Dvoboj', 'Head to head')}</h2><div class="pick2" style="margin-top:12px">${leaguePick(S.leagues, S.leagueId)}</div><p class="muted" style="margin-top:10px">${tr('U ovoj ligi nema drugih menadžera. Izaberi drugu ligu.', 'There are no other managers in this league. Pick another league.')}</p></section>`;
  // događaji
  const feed = [];
  for (const id of [...S.xi, ...S.bench]) {
    const s = lv.get(id), e = ix.players.get(id);
    if (!s) continue;
    const mult = id === S.captain ? 2 : S.bench.includes(id) ? 0 : 1;
    const gp = { 1: 10, 2: 6, 3: 5, 4: 4 }[e.element_type];
    for (let k = 0; k < s.goals_scored; k++) feed.push(['g', tr('GOL', 'GOAL'), e, tr(`${e.web_name} je dao gol`, `${e.web_name} scored`), gp * mult]);
    for (let k = 0; k < s.assists; k++) feed.push(['a', tr('AS', 'AST'), e, `${e.web_name}: ${tr('asistencija', 'assist')}`, 3 * mult]);
    if (s.clean_sheets && e.element_type <= 2) feed.push(['c', 'CS', e, `${e.web_name}: ${tr('bez primljenog gola', 'clean sheet')}`, 4 * mult]);
    if (s.bonus) feed.push(['b', 'B', e, `${e.web_name}: bonus`, s.bonus * mult]);
  }
  const rows = [...S.xi, ...S.bench].map((id, i) => {
    const e = ix.players.get(id), s = lv.get(id) || {}, cap = id === S.captain, bench = i > 10;
    return `<div class="li${cap ? ' hl' : ''}"><span class="k">${bench ? tr('klupa', 'bench') : POS_BS[e.element_type]}</span><span>${pbtn(e)}${cap ? ' <span class="chg up">C ×2</span>' : ''}<br><span class="sub">${s.minutes || 0} min${s.goals_scored ? ', ' + s.goals_scored + tr(' gol', ' G') : ''}${s.assists ? ', ' + s.assists + tr(' as.', ' A') : ''}${s.bonus ? ', bonus ' + s.bonus : ''}</span></span><b class="cond" style="font-size:24px${bench ? ';opacity:.5' : ''}">${(s.total_points || 0) * (cap ? 2 : 1)}</b></div>`;
  }).join('');
  return `<div class="head"><div><h1>${tr(`Kolo ${gw} uživo`, `Gameweek ${gw} live`)}</h1><p class="sub">${ev.finished ? tr('Kolo je završeno. Bonus bodovi su konačni kad ih FPL potvrdi.', 'The gameweek is finished. Bonus points are final once FPL confirms them.') : tr('Osvježava se svake minute dok traju utakmice. Bonus bodovi su privremeni.', 'Refreshes every minute while matches are on. Bonus points are provisional.')}</p></div><span class="chg ${ev.finished ? 'nt' : 'up'}" style="font-size:14px">${ev.finished ? tr('završeno', 'finished') : tr('uživo', 'live')}</span></div>
    <div class="grid2">
      <div class="stack">
        <section class="g pts-head" aria-label="${tr('Bodovi u kolu', 'Points in gameweek')} ${gw}">
          <div class="side-s"><div><span class="sub">${tr('Prosjek', 'Average')}</span><b>${ev.average_entry_score ?? '–'}</b></div><div><span class="sub">${tr('Najviše', 'Highest')}</span><b>${ev.highest_score ?? '–'}</b></div></div>
          <div class="main-s"><span class="sub">${tr('Bodovi u kolu', 'Points in GW')} ${gw}</span><b data-n="${mine}">${mine}</b><span class="chg ${ev.finished ? 'nt' : 'up'}">${ev.finished ? tr('završeno', 'finished') : tr('uživo', 'live')}</span></div>
          <div class="side-s"><div><span class="sub">${tr('Rang kola', 'GW rank')}</span><b>${hist?.rank ? int(hist.rank) : '–'}</b></div><div><span class="sub">${tr('Transferi', 'Transfers')}</span><b>${hist ? hist.event_transfers + (hist.event_transfers_cost ? ' (−' + hist.event_transfers_cost + ')' : '') : '–'}</b></div></div>
        </section>
        <section class="pitch" aria-label="${tr('Bodovi igrača', 'Player points')}"><div class="field">${[1, 2, 3, 4].map((pos) => `<div class="line-row">${S.xi.map((id) => ix.players.get(id)).filter((e) => e.element_type === pos).map((e) => pitchCard(ix, e, { cap: e.id === S.captain, vice: e.id === S.vice, attr: 'data-pid', info: `<span class="pts">${(lv.get(e.id)?.total_points || 0) * (e.id === S.captain ? 2 : 1)}</span>` })).join('')}</div>`).join('')}</div>
          <div class="bench" aria-label="${tr('Klupa', 'Bench')}">${S.bench.map((id, i) => { const e = ix.players.get(id); return `<div class="bslot"><span class="sub">${i ? i + '.' : tr('GOL', 'GK')}</span>${pitchCard(ix, e, { bench: true, attr: 'data-pid', info: `<span class="pts">${lv.get(id)?.total_points || 0}</span>` })}</div>`; }).join('')}</div></section>
        <section class="g card"><h2 class="ct">${tr('Šta se desilo', 'What happened')}</h2><div class="feed" style="margin-top:12px">${feed.length ? feed.map(([k, t, e, txt, p]) => `<p><span class="ev ${k}">${t}</span><span>${esc(txt)} <span class="sub">${esc(ix.teams.get(e.team).short_name)}</span></span><b class="num" style="color:${p ? 'var(--green)' : 'var(--d)'}">${p ? '+' + p : tr('klupa', 'bench')}</b></p>`).join('') : `<p class="muted">${tr('Još nema golova ni asistencija tvojih igrača.', 'No goals or assists from your players yet.')}</p>`}</div></section>
      </div>
      <div class="stack">${duel}<details class="g card more-d"><summary class="ct">${tr('Minute i događaji po igraču', 'Minutes and events per player')}</summary><div class="list" style="margin-top:12px">${rows}</div></details></div>
    </div>
    <p class="sub mt">${tr('Automatske zamjene sa klupe FPL radi na kraju kola, pa ovdje još nisu uračunate.', 'FPL makes automatic substitutions at the end of the gameweek, so they are not counted here yet.')}</p>`;
}

export function bind(rerender) {
  const sel = document.getElementById('rival');
  if (sel) sel.onchange = () => { rivalId = +sel.value; rerender(); };
  const lg = document.getElementById('lg-sel');
  if (lg) lg.onchange = () => { setLeague(+lg.value); rivalId = null; rerender(); };
  clearInterval(timer);
  const ev = S.ix.events.find((e) => e.id === S.lastGw);
  if (ev && !ev.finished) timer = setInterval(() => { if (location.hash.includes('uzivo') && !document.hidden) { refreshLive(S.lastGw); rerender(true); } else clearInterval(timer); }, 60000);
}
