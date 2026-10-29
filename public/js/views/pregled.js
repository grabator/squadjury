// Pregled: rok, stanje sezone, bodovi po kolima, sljedeće kolo i brzi savjeti.
import { S, league } from '../state.js';
import { captainOptions, transferIdeas, alerts, freeTransfers, greenArrowOdds, fixturesFor, num, fmt, price, int, time, dayShort, dateShort, dateLong, pct } from '../model.js';
import { esc, ic, chip, spark, greet, kit, pbtn, ring, countUp } from '../ui.js';

export const title = 'Pregled';

function countdown(ix) {
  const ev = ix.events.find((e) => e.id === ix.nextGw);
  if (!ev) return { ev: null, parts: null };
  const ms = new Date(ev.deadline_time) - Date.now();
  if (ms <= 0) return { ev, parts: null };
  const m = Math.floor(ms / 60000);
  return { ev, parts: [[Math.floor(m / 1440), 'dana'], [Math.floor(m / 60) % 24, 'sati'], [m % 60, 'minuta']] };
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
  const bars = h.map((x, i) => { const av = avgOf(x.event), d = x.points - av; return `<div class="bar${x.points === best ? ' best' : ''}${x.points < av ? ' low' : ''}" style="--n:${i}" tabindex="0" aria-label="Kolo ${x.event}: ${x.points} bodova"><b>${x.points}</b><i style="height:${(x.points / scale * 82).toFixed(1)}%"></i><span class="sub">K${x.event}</span>
      <span class="tip" role="tooltip"><b>Kolo ${x.event}</b><span>${x.points} bod. ${av ? `<em class="${d >= 0 ? 'up' : 'dn'}">${d >= 0 ? '+' : '−'}${int(d)} od prosjeka</em>` : ''}</span>${x.rank ? `<span>Rang kola ${int(x.rank)}</span>` : ''}<span>Ukupni rang ${int(x.overall_rank)}</span>${x.event_transfers ? `<span>Transferi ${x.event_transfers}${x.event_transfers_cost ? ', −' + x.event_transfers_cost : ''}</span>` : ''}${x.points_on_bench ? `<span>Na klupi ${x.points_on_bench}</span>` : ''}</span></div>`; }).join('');

  // sljedeće kolo: utakmice sa mojim igračima
  const gw = ix.nextGw, byFix = new Map();
  for (const id of S.ids) { const e = ix.players.get(id); for (const f of fixturesFor(ix, e.team, gw, 1)) { if (!byFix.has(f.id)) byFix.set(f.id, { f, team: e.team, ps: [] }); byFix.get(f.id).ps.push(e); } }
  const fxs = [...byFix.values()].sort((a, b) => String(a.f.kickoff).localeCompare(String(b.f.kickoff)));
  const dot = (t) => `<i class="kd" style="background:${kit(t)[0]}"></i>`;
  const fxHtml = fxs.map(({ f, team, ps }) => {
    const d = new Date(f.kickoff), me = ix.teams.get(team), op = ix.teams.get(f.opp);
    const [hm, aw] = f.home ? [me, op] : [op, me];
    return `<div class="fx"><span class="k">${dayShort(d)}<br><b>${time(d)}</b></span><div class="fx-m"><p class="fx-t"><span class="${hm === me ? 'mine' : ''}">${dot(hm)}${esc(hm.short_name)}</span><span class="vs">–</span><span class="${aw === me ? 'mine' : ''}">${dot(aw)}${esc(aw.short_name)}</span></p><div class="chips">${ps.map((e) => chip(ix, e)).join('')}</div></div><span class="fdr d${f.fdr}" title="Težina: ${f.fdr} od 5">${f.fdr}</span></div>`;
  }).join('') || '<p class="muted">Nijedan tvoj igrač nema utakmicu u ovom kolu.</p>';

  const cap = captainOptions(ix, S.xi)[0];
  const idea = transferIdeas(ix, S.ids, S.bank, { limit: 1 })[0];
  const al = alerts(ix, S.ids).slice(0, 4);
  const recentAvg = avgs.slice(-4).reduce((a, b) => a + b, 0) / Math.max(1, avgs.slice(-4).length);
  const odds = greenArrowOdds(ix, { xi: S.xi, captain: cap?.e.id || S.captain }, recentAvg || 50, 2000);

  return `<section class="g hero" aria-labelledby="h-hero">
      <div><p class="sub">${esc(entry.name)}, kolo ${gw}</p><h1 id="h-hero" class="cond">${greet()}, ${esc(entry.player_first_name)}</h1>
        <p>${cd.ev ? (cd.parts ? 'Rok za transfere je ' + dateLong(new Date(cd.ev.deadline_time)) + '.' : 'Rok za kolo ' + cd.ev.id + ' je prošao.') : ''} Imaš ${ft} ${ft === 1 ? 'besplatan transfer' : 'besplatna transfera'}${ft >= 5 ? ' (najviše što se može sačuvati)' : ''}.</p>
        <p style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap"><a class="btn" href="#/transferi">${ic('swap')}Planiraj transfere</a><a class="btn ghost" href="#/kapiten">${ic('cap')}Izaberi kapitena</a></p></div>
      ${cd.parts ? `<div class="count" id="countdown" aria-label="Vrijeme do roka">${cd.parts.map(([v, l]) => `<div><b>${v}</b><span>${l}</span></div>`).join('')}</div>` : ''}
    </section>
    <section class="grid4 mt" aria-label="Tvoja sezona">
      <div class="g stat"><p class="sub">Ukupni rang</p><p class="v" data-n="${last.overall_rank}" data-f="int">${int(last.overall_rank)}</p><div class="row2">${rankChg ? `<span class="chg ${rankChg > 0 ? 'up' : 'dn'}">${rankChg > 0 ? '▲' : '▼'} ${int(rankChg)}</span>` : '<span class="chg nt">bez promjene</span>'}${spark(h.map((x) => x.overall_rank), '#05f0ff', true)}</div></div>
      <div class="g stat"><p class="sub">Bodovi u kolu ${last.event}</p><p class="v" data-n="${last.points}" data-f="int">${last.points}</p><div class="row2"><span class="chg ${last.points >= avg ? 'up' : 'dn'}">${last.points >= avg ? '+' : '−'}${int(last.points - avg)} od prosjeka</span>${spark(gwPts, '#00ff87')}</div></div>
      <div class="g stat"><p class="sub">Vrijednost tima</p><p class="v" data-n="${last.value / 10}" data-f="m">£${fmt(last.value / 10)}m</p><div class="row2"><span class="chg nt">banka £${fmt(last.bank / 10)}m</span>${spark(h.map((x) => x.value), '#ffc94a')}</div></div>
      <div class="g stat"><p class="sub">${esc(L?.league?.name || meta?.name || 'Mini liga')}</p><p class="v">${myL ? int(myL.rank) + '. mjesto' : '–'}</p><div class="row2">${myL && lead && lead.entry !== S.id && myL.total != null ? `<span class="chg dn">${int(lead.total - myL.total)} bod. do prvog</span>` : myL && myL.rank === 1 ? '<span class="chg up">vodiš ligu</span>' : myL ? `<a class="chg nt" href="#/liga">tabela</a>` : '<span class="chg nt">nema privatne lige</span>'}${spark(h.map((x) => x.total_points), '#d98bff')}</div></div>
    </section>
    <div class="grid2 mt">
      <div class="stack">
        <section class="g card" aria-labelledby="h-pts"><div class="ch"><div><h2 id="h-pts" class="ct">Bodovi po kolima</h2><p class="sub">Pređi preko stubića za detalje kola</p></div><span class="chg ${mine >= meanAvg ? 'up' : 'dn'}">Ti ${fmt(mine)} po kolu, prosjek ${fmt(meanAvg)}</span></div>
          <div class="bars enter">${meanAvg ? `<div class="avg" style="bottom:calc(20px + (100% - 24px) * ${(0.82 * meanAvg / scale).toFixed(3)})"></div>` : ''}${bars}</div></section>
        <div class="grid2e">
          <section class="g card"><div class="ch"><h2 class="ct">Kapiten</h2><a class="sub" href="#/kapiten">svi kandidati</a></div>${cap ? `<p class="big">${pbtn(cap.e)}</p><p class="sub">${fmt(cap.xp)} predviđenih bodova</p><p class="muted" style="margin-top:8px">${esc(cap.why)}</p>` : ''}</section>
          <section class="g card"><div class="ch"><h2 class="ct">Preporučeni transfer</h2><a class="sub" href="#/transferi">svi prijedlozi</a></div>${idea ? `<div class="swap"><div class="p o">${pbtn(idea.out)}<span class="sub">£${price(idea.out)}m</span></div>${ic('swap')}<div class="p i">${pbtn(idea.inn)}<span class="sub">£${price(idea.inn)}m</span></div></div><p style="margin-top:10px"><span class="chg up">+${fmt(idea.gain)} bodova kroz 5 kola</span></p>` : '<p class="muted">Nema transfera koji se jasno isplati.</p>'}</section>
        </div>
        <section class="g card arrow-card"><div class="ring-wrap">${ring(odds.p, 'url(#rgg)')}<b>${pct(odds.p)}</b></div><div><h2 class="ct">Šansa za zelenu strelicu</h2><p class="muted" style="margin-top:6px">Kolo ${gw} „odigrano” 2.000 puta sa tvojim timom i kapitenom ${esc(cap?.e.web_name || '')}. Najvjerovatnije ${odds.low} do ${odds.high} bodova, a prosjek kola je oko ${Math.round(recentAvg)}.</p></div></section>
        <section class="g card"><div class="ch"><h2 class="ct">Upozorenja</h2>${al.length ? `<span class="chg dn">${al.length}</span>` : ''}</div>${al.length ? al.map((a) => `<p class="alert"><span class="dot" aria-hidden="true"></span><span>${esc(a.text)}</span></p>`).join('') : '<p class="muted">Svi tvoji igrači su spremni za kolo.</p>'}</section>
      </div>
      <div class="stack">
        <section class="g card" aria-labelledby="h-gw"><div class="ch"><div><h2 id="h-gw" class="ct">Kolo ${gw}</h2><p class="sub">Utakmice tvojih igrača, broj je težina</p></div><a class="sub" href="#/raspored">više kola</a></div><div class="list">${fxHtml}</div></section>
        <section class="g card jury-cta"><div class="ch" style="margin-bottom:8px"><h2 class="ct">SquadJury</h2><span class="chg up">dodatak</span></div><p class="muted">Objavi svoj tim za kolo ${gw} i neka ga zajednica ocijeni od 1 do 10. Ocjenjuj tuđe timove, igraj duele i skupljaj scout bodove.</p><p style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap"><a class="btn sm" href="/jury/post">Objavi tim</a><a class="btn sm ghost" href="/jury/">Ocjenjuj timove</a></p></section>
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
