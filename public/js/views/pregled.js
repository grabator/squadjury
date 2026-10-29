// Pregled: rok, stanje sezone, bodovi po kolima, sljedeće kolo i brzi savjeti.
import { S, league } from '../state.js';
import { captainOptions, transferIdeas, alerts, freeTransfers, greenArrowOdds, fixturesFor, num, fmt, price, int, time, dayShort, dateShort, dateLong, pct } from '../model.js';
import { esc, ic, chip, spark, greet, kit, pbtn, ring, countUp } from '../ui.js';
import { tr } from '../i18n.js';

export const title = tr('Pregled', 'Overview');

function countdown(ix) {
  const ev = ix.events.find((e) => e.id === ix.nextGw);
  if (!ev) return { ev: null, parts: null };
  const ms = new Date(ev.deadline_time) - Date.now();
  if (ms <= 0) return { ev, parts: null };
  const m = Math.floor(ms / 60000);
  return { ev, parts: [[Math.floor(m / 1440), tr('dana', 'days')], [Math.floor(m / 60) % 24, tr('sati', 'hours')], [m % 60, tr('minuta', 'minutes')]] };
}

export async function render() {
  const { ix, history, entry } = S;
  const h = history.current, last = h[h.length - 1] || { points: 0, overall_rank: 0, value: 1000, bank: 0, event: 0 }, prev = h[h.length - 2];
  const avgOf = (gw) => num(ix.events.find((e) => e.id === gw)?.average_entry_score);
  const avg = avgOf(last.event);
  const rankChg = prev ? prev.overall_rank - last.overall_rank : 0;
  const ft = freeTransfers(history);
  const cd = countdown(ix);
  const L = await league().catch(() => null);
  const rows = L?.standings?.results || [], lead = rows[0], meta = S.leagues.find((l) => l.id === S.leagueId);
  const myL = rows.find((r) => r.entry === S.id) || (meta?.entry_rank ? { rank: meta.entry_rank, total: null } : null);

  // stubići
  const gwPts = h.map((x) => x.points), best = Math.max(...gwPts, 1), avgs = h.map((x) => avgOf(x.event));
  const meanAvg = avgs.length ? avgs.reduce((a, b) => a + b, 0) / avgs.length : 0, mine = gwPts.reduce((a, b) => a + b, 0) / Math.max(1, h.length);
  const scale = Math.max(best, ...avgs, 1);
  const bars = h.map((x, i) => { const av = avgOf(x.event), d = x.points - av; return `<div class="bar${x.points === best ? ' best' : ''}${x.points < av ? ' low' : ''}" style="--n:${i}" tabindex="0" aria-label="${tr('Kolo', 'Gameweek')} ${x.event}: ${x.points} ${tr('bodova', 'points')}"><b>${x.points}</b><i style="height:${(x.points / scale * 82).toFixed(1)}%"></i><span class="sub">${tr('K', 'GW')}${x.event}</span>
      <span class="tip" role="tooltip"><b>${tr('Kolo', 'Gameweek')} ${x.event}</b><span>${x.points} ${tr('bod.', 'pts')} ${av ? `<em class="${d >= 0 ? 'up' : 'dn'}">${d >= 0 ? '+' : '−'}${int(d)} ${tr('od prosjeka', 'vs average')}</em>` : ''}</span>${x.rank ? `<span>${tr('Rang kola', 'GW rank')} ${int(x.rank)}</span>` : ''}<span>${tr('Ukupni rang', 'Overall rank')} ${int(x.overall_rank)}</span>${x.event_transfers ? `<span>${tr('Transferi', 'Transfers')} ${x.event_transfers}${x.event_transfers_cost ? ', −' + x.event_transfers_cost : ''}</span>` : ''}${x.points_on_bench ? `<span>${tr('Na klupi', 'On bench')} ${x.points_on_bench}</span>` : ''}</span></div>`; }).join('');

  // sljedeće kolo: utakmice sa mojim igračima
  const gw = ix.nextGw, byFix = new Map();
  for (const id of S.ids) { const e = ix.players.get(id); for (const f of fixturesFor(ix, e.team, gw, 1)) { if (!byFix.has(f.id)) byFix.set(f.id, { f, team: e.team, ps: [] }); byFix.get(f.id).ps.push(e); } }
  const fxs = [...byFix.values()].sort((a, b) => String(a.f.kickoff).localeCompare(String(b.f.kickoff)));
  const dot = (t) => `<i class="kd" style="background:${kit(t)[0]}"></i>`;
  const fxHtml = fxs.map(({ f, team, ps }) => {
    const d = new Date(f.kickoff), me = ix.teams.get(team), op = ix.teams.get(f.opp);
    const [hm, aw] = f.home ? [me, op] : [op, me];
    return `<div class="fx"><span class="k">${dayShort(d)}<br><b>${time(d)}</b></span><div class="fx-m"><p class="fx-t"><span class="${hm === me ? 'mine' : ''}">${dot(hm)}${esc(hm.short_name)}</span><span class="vs">–</span><span class="${aw === me ? 'mine' : ''}">${dot(aw)}${esc(aw.short_name)}</span></p><div class="chips">${ps.map((e) => chip(ix, e)).join('')}</div></div><span class="fdr d${f.fdr}" title="${tr('Težina', 'Difficulty')}: ${f.fdr} ${tr('od', 'of')} 5">${f.fdr}</span></div>`;
  }).join('') || `<p class="muted">${tr('Nijedan tvoj igrač nema utakmicu u ovom kolu.', 'None of your players has a match this gameweek.')}</p>`;

  const cap = captainOptions(ix, S.xi)[0];
  const idea = transferIdeas(ix, S.ids, S.bank, { limit: 1 })[0];
  const al = alerts(ix, S.ids).slice(0, 4);
  const recentAvg = avgs.slice(-4).reduce((a, b) => a + b, 0) / Math.max(1, avgs.slice(-4).length);
  const odds = greenArrowOdds(ix, { xi: S.xi, captain: cap?.e.id || S.captain }, recentAvg || 50, 2000);

  return `<section class="g hero" aria-labelledby="h-hero">
      <div><p class="sub">${esc(entry.name)}, ${tr('kolo', 'gameweek')} ${gw}</p><h1 id="h-hero" class="cond">${greet()}, ${esc(entry.player_first_name)}</h1>
        <p>${cd.ev ? (cd.parts ? tr('Rok za transfere je ', 'The transfer deadline is ') + dateLong(new Date(cd.ev.deadline_time)) + '.' : tr('Rok za kolo ' + cd.ev.id + ' je prošao.', 'The gameweek ' + cd.ev.id + ' deadline has passed.')) : ''} ${tr('Imaš', 'You have')} ${ft} ${ft === 1 ? tr('besplatan transfer', 'free transfer') : tr('besplatna transfera', 'free transfers')}${ft >= 5 ? tr(' (najviše što se može sačuvati)', ' (the most you can bank)') : ''}.</p>
        <p style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap"><a class="btn" href="#/transferi">${ic('swap')}${tr('Planiraj transfere', 'Plan transfers')}</a><a class="btn ghost" href="#/kapiten">${ic('cap')}${tr('Izaberi kapitena', 'Pick a captain')}</a></p></div>
      ${cd.parts ? `<div class="count" id="countdown" aria-label="${tr('Vrijeme do roka', 'Time to deadline')}">${cd.parts.map(([v, l]) => `<div><b>${v}</b><span>${l}</span></div>`).join('')}</div>` : ''}
    </section>
    <section class="grid4 mt" aria-label="${tr('Tvoja sezona', 'Your season')}">
      <div class="g stat"><p class="sub">${tr('Ukupni rang', 'Overall rank')}</p><p class="v" data-n="${last.overall_rank}" data-f="int">${int(last.overall_rank)}</p><div class="row2">${rankChg ? `<span class="chg ${rankChg > 0 ? 'up' : 'dn'}">${rankChg > 0 ? '▲' : '▼'} ${int(rankChg)}</span>` : `<span class="chg nt">${tr('bez promjene', 'no change')}</span>`}${spark(h.map((x) => x.overall_rank), '#05f0ff', true)}</div></div>
      <div class="g stat"><p class="sub">${tr('Bodovi u kolu', 'Points in GW')} ${last.event}</p><p class="v" data-n="${last.points}" data-f="int">${last.points}</p><div class="row2"><span class="chg ${last.points >= avg ? 'up' : 'dn'}">${last.points >= avg ? '+' : '−'}${int(last.points - avg)} ${tr('od prosjeka', 'vs average')}</span>${spark(gwPts, '#00ff87')}</div></div>
      <div class="g stat"><p class="sub">${tr('Vrijednost tima', 'Team value')}</p><p class="v" data-n="${last.value / 10}" data-f="m">£${fmt(last.value / 10)}m</p><div class="row2"><span class="chg nt">${tr('banka', 'bank')} £${fmt(last.bank / 10)}m</span>${spark(h.map((x) => x.value), '#ffc94a')}</div></div>
      <div class="g stat"><p class="sub">${esc(L?.league?.name || meta?.name || tr('Mini liga', 'Mini league'))}</p><p class="v">${myL ? tr(int(myL.rank) + '. mjesto', '#' + int(myL.rank)) : '–'}</p><div class="row2">${myL && lead && lead.entry !== S.id && myL.total != null ? `<span class="chg dn">${int(lead.total - myL.total)} ${tr('bod. do prvog', 'pts behind 1st')}</span>` : myL && myL.rank === 1 ? `<span class="chg up">${tr('vodiš ligu', 'you lead')}</span>` : myL ? `<a class="chg nt" href="#/liga">${tr('tabela', 'table')}</a>` : `<span class="chg nt">${tr('nema privatne lige', 'no private league')}</span>`}${spark(h.map((x) => x.total_points), '#d98bff')}</div></div>
    </section>
    <div class="grid2 mt">
      <div class="stack">
        <section class="g card" aria-labelledby="h-pts"><div class="ch"><div><h2 id="h-pts" class="ct">${tr('Bodovi po kolima', 'Points per gameweek')}</h2><p class="sub">${tr('Pređi preko stubića za detalje kola', 'Hover a bar for gameweek details')}</p></div><span class="chg ${mine >= meanAvg ? 'up' : 'dn'}">${tr('Ti', 'You')} ${fmt(mine)} ${tr('po kolu, prosjek', 'per GW, average')} ${fmt(meanAvg)}</span></div>
          <div class="bars enter">${meanAvg ? `<div class="avg" style="bottom:calc(20px + (100% - 24px) * ${(0.82 * meanAvg / scale).toFixed(3)})"></div>` : ''}${bars}</div></section>
        <div class="grid2e">
          <section class="g card"><div class="ch"><h2 class="ct">${tr('Kapiten', 'Captain')}</h2><a class="sub" href="#/kapiten">${tr('svi kandidati', 'all options')}</a></div>${cap ? `<p class="big">${pbtn(cap.e)}</p><p class="sub">${fmt(cap.xp)} ${tr('predviđenih bodova', 'predicted points')}</p><p class="muted" style="margin-top:8px">${esc(cap.why)}</p>` : ''}</section>
          <section class="g card"><div class="ch"><h2 class="ct">${tr('Preporučeni transfer', 'Suggested transfer')}</h2><a class="sub" href="#/transferi">${tr('svi prijedlozi', 'all ideas')}</a></div>${idea ? `<div class="swap"><div class="p o">${pbtn(idea.out)}<span class="sub">£${price(idea.out)}m</span></div>${ic('swap')}<div class="p i">${pbtn(idea.inn)}<span class="sub">£${price(idea.inn)}m</span></div></div><p style="margin-top:10px"><span class="chg up">+${fmt(idea.gain)} ${tr('bodova kroz 5 kola', 'points over 5 GWs')}</span></p>` : `<p class="muted">${tr('Nema transfera koji se jasno isplati.', 'No transfer clearly pays off.')}</p>`}</section>
        </div>
        <section class="g card arrow-card"><div class="ring-wrap">${ring(odds.p, 'url(#rgg)')}<b>${pct(odds.p)}</b></div><div><h2 class="ct">${tr('Šansa za zelenu strelicu', 'Green arrow chance')}</h2><p class="muted" style="margin-top:6px">${tr(`Kolo ${gw} „odigrano” 2.000 puta sa tvojim timom i kapitenom ${esc(cap?.e.web_name || '')}. Najvjerovatnije ${odds.low} do ${odds.high} bodova, a prosjek kola je oko ${Math.round(recentAvg)}.`, `Gameweek ${gw} "played" 2,000 times with your team and ${esc(cap?.e.web_name || '')} as captain. Most likely ${odds.low} to ${odds.high} points, while the gameweek average is about ${Math.round(recentAvg)}.`)}</p></div></section>
        <section class="g card"><div class="ch"><h2 class="ct">${tr('Upozorenja', 'Alerts')}</h2>${al.length ? `<span class="chg dn">${al.length}</span>` : ''}</div>${al.length ? al.map((a) => `<p class="alert"><span class="dot" aria-hidden="true"></span><span>${esc(a.text)}</span></p>`).join('') : `<p class="muted">${tr('Svi tvoji igrači su spremni za kolo.', 'All your players are ready for the gameweek.')}</p>`}</section>
      </div>
      <div class="stack">
        <section class="g card" aria-labelledby="h-gw"><div class="ch"><div><h2 id="h-gw" class="ct">${tr('Kolo', 'Gameweek')} ${gw}</h2><p class="sub">${tr('Utakmice tvojih igrača, broj je težina', 'Your players\' matches, the number is difficulty')}</p></div><a class="sub" href="#/raspored">${tr('više kola', 'more')}</a></div><div class="list">${fxHtml}</div></section>
        <section class="g card jury-cta"><div class="ch" style="margin-bottom:8px"><h2 class="ct">SquadJury</h2><span class="chg up">${tr('dodatak', 'community')}</span></div><p class="muted">${tr(`Objavi svoj tim za kolo ${gw} i neka ga zajednica ocijeni od 1 do 10. Ocjenjuj tuđe timove, igraj duele i skupljaj scout bodove.`, `Post your team for gameweek ${gw} and let the community rate it from 1 to 10. Rate other squads, play duels and collect scout points.`)}</p><p style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap"><a class="btn sm" href="/jury/post">${tr('Objavi tim', 'Post your team')}</a><a class="btn sm ghost" href="/jury/">${tr('Ocjenjuj timove', 'Rate squads')}</a></p></section>
      </div>
    </div>`;
}

export function bind() {
  countUp(document.getElementById('main'));
  const el = document.getElementById('countdown');
  if (!el) return;
  const t = setInterval(() => {
    if (!document.body.contains(el)) return clearInterval(t);
    const c = countdown(S.ix);
    if (!c.parts) return clearInterval(t);
    el.querySelectorAll('b').forEach((b, i) => { b.textContent = c.parts[i][0]; });
  }, 30000);
}
