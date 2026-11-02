// Pregled: pločice (kolo i rok, rang, bodovi, kapiten, šansa za zelenu strelicu, transfer, vrijednost, liga) i utakmice kola.
import { S, league } from '../state.js';
import { captainOptions, transferIdeas, greenArrowOdds, fixturesFor, num, fmt, int, time, dayShort, dateLong, pct } from '../model.js';
import { esc, kit, ink, shirt, photo, countUp } from '../ui.js';
import { tr } from '../i18n.js';

export const title = tr('Pregled', 'Overview');

function countdown(ix) {
  const ev = ix.events.find((e) => e.id === ix.nextGw);
  if (!ev) return { ev: null, parts: null };
  const end = new Date(ev.deadline_time), ms = end - Date.now();
  if (ms <= 0) return { ev, parts: null };
  const m = Math.floor(ms / 60000), d = Math.floor(m / 1440), h = Math.floor(m / 60) % 24;
  // prsten: koliko je ostalo od vremena između prošlog i ovog roka
  const prev = ix.events.find((e) => e.id === ix.nextGw - 1), span = prev ? end - new Date(prev.deadline_time) : 7 * 864e5;
  return { ev, parts: true, big: d ? `${d}d ${h}h` : `${h}h`, min: `${m % 60} min`, p: Math.max(0.02, Math.min(1, ms / span)) };
}

export async function render() {
  const { ix, history, entry } = S;
  const h = history.current, last = h[h.length - 1] || { points: 0, overall_rank: 0, value: 1000, bank: 0, event: 0 }, prev = h[h.length - 2];
  const avgOf = (gw) => num(ix.events.find((e) => e.id === gw)?.average_entry_score);
  const avg = avgOf(last.event);
  const rankChg = prev ? prev.overall_rank - last.overall_rank : 0;
  const cd = countdown(ix);
  const L = await league().catch(() => null);
  const rows = L?.standings?.results || [], lead = rows[0], meta = S.leagues.find((l) => l.id === S.leagueId);
  const myL = rows.find((r) => r.entry === S.id) || (meta?.entry_rank ? { rank: meta.entry_rank, total: null } : null);
  const avgs = h.map((x) => avgOf(x.event));

  // sljedeće kolo: utakmice sa mojim igračima, kao pločice u bojama oba kluba
  const gw = ix.nextGw, byFix = new Map();
  for (const id of S.nextIds || S.ids) { const e = ix.players.get(id); for (const f of fixturesFor(ix, e.team, gw, 1)) { if (!byFix.has(f.id)) byFix.set(f.id, { f, team: e.team, ps: [] }); byFix.get(f.id).ps.push(e); } }
  const fxs = [...byFix.values()].sort((a, b) => String(a.f.kickoff).localeCompare(String(b.f.kickoff)));
  const side = (t, cls) => { const [c] = kit(t); return `<span class="${cls}" style="--c:${c};--ct:${ink(c)}">${esc(t.short_name)}</span>`; };
  const fxHtml = fxs.map(({ f, team, ps }) => {
    const d = new Date(f.kickoff), me = ix.teams.get(team), op = ix.teams.get(f.opp);
    const [hm, aw] = f.home ? [me, op] : [op, me];
    const names = ps.map((e) => e.web_name).join(', ');
    return `<a class="fxt" href="#/raspored" aria-label="${esc(hm.name)} ${tr('protiv', 'against')} ${esc(aw.name)}, ${dayShort(d)} ${time(d)}. ${tr('Tvoji igrači', 'Your players')}: ${esc(names)}">${side(hm, 'h')}${side(aw, 'a')}<span class="tm"><b>${time(d)}</b><small>${dayShort(d)}</small></span><span class="ps" aria-hidden="true">${ps.map((e) => esc(e.web_name)).join(' · ')}</span></a>`;
  }).join('');

  const cap = captainOptions(ix, S.xi)[0];
  const idea = transferIdeas(ix, S.nextIds, S.nextBank, { limit: 1 })[0];
  const recentAvg = avgs.slice(-4).reduce((a, b) => a + b, 0) / Math.max(1, avgs.slice(-4).length);
  const odds = greenArrowOdds(ix, { xi: S.xi, captain: cap?.e.id || S.captain }, recentAvg || 50, 2000);
  const on = Math.round(odds.p * 100);
  const capFx = cap ? fixturesFor(ix, cap.e.team, gw, 1).map((f) => `${ix.teams.get(f.opp).short_name} (${f.home ? tr('D', 'H') : tr('G', 'A')})`).join(', ') : '';
  const lname = L?.league?.name || meta?.name || tr('Mini liga', 'Mini league');

  return `<h1 class="sr">${tr('Pregled', 'Overview')}: ${esc(entry.name)}</h1>
    <nav class="stories" aria-label="${tr('Brzi pregled', 'Quick look')}">
      <a class="story" href="#/kapiten"><span class="ring"><span>${cap ? `<span class="shirt">${shirt(ix.teams.get(cap.e.team), cap.e.element_type === 1)}${photo(cap.e)}</span>` : 'C'}</span></span>${tr('Kapiten', 'Captain')}</a>
      <a class="story" href="#/transferi"><span class="ring"><span>${idea ? '+' + Math.round(idea.gain) : '–'}</span></span>${tr('Transfer', 'Transfer')}</a>
      <a class="story" href="#/uzivo"><span class="ring"><span>${last.points}</span></span>${tr('Uživo', 'Live')}</a>
      <a class="story" href="#/liga"><span class="ring"><span>${myL ? '#' + myL.rank : '–'}</span></span>${tr('Liga', 'League')}</a>
      <a class="story" href="#/raspored"><span class="ring"><span>${tr('K', 'GW')}${gw}</span></span>${tr('Raspored', 'Fixtures')}</a>
    </nav>
    <div class="bento">
      <section class="t s6 hero3" aria-label="${tr('Kolo', 'Gameweek')} ${gw}">
        <svg class="bolt" viewBox="0 0 120 200" aria-hidden="true"><path d="M70 0 20 110h38L36 200 104 74H64L92 0z"/></svg><span class="tri" aria-hidden="true"><u></u><u></u><u></u></span>
        <div class="gwn"><small>${esc(entry.name)} · ${tr('kolo', 'gameweek')}</small><b>${gw}</b></div>
        ${cd.parts ? `<div class="dlx" id="countdown" role="timer" aria-label="${tr('Rok za transfere', 'Transfer deadline')}: ${dateLong(new Date(cd.ev.deadline_time))}"><b>${cd.big}</b><span><span class="dl-min">${cd.min}</span> ${tr('do roka', 'to deadline')}</span><span>${dateLong(new Date(cd.ev.deadline_time))}</span></div>` : cd.ev ? `<div class="dlx"><b>${tr('Rok je prošao', 'Deadline passed')}</b></div>` : ''}
      </section>
      <a class="t s3" href="#/liga"><small>${tr('Ukupni rang', 'Overall rank')}</small><span class="v" data-n="${last.overall_rank}" data-f="int">${int(last.overall_rank)}</span>${rankChg ? `<span class="${rankChg > 0 ? 'up' : 'dn'}">${rankChg > 0 ? '▲' : '▼'} ${int(rankChg)}</span>` : `<span class="nt">${tr('bez promjene', 'no change')}</span>`}</a>
      <a class="t s3 red" href="#/uzivo"><small>${tr('Bodovi u kolu', 'Points in GW')} ${last.event}</small><span class="v" data-n="${last.points}" data-f="int">${last.points}</span><span>${last.points >= avg ? '+' : '−'}${int(last.points - avg)} ${tr('od prosjeka', 'vs average')}</span></a>
      <a class="t s3 capt" href="#/kapiten" aria-label="${tr('Kapiten', 'Captain')}: ${esc(cap?.e.web_name || '–')}${cap ? `, ${fmt(cap.xp)} ${tr('predviđeno', 'predicted')}, ${esc(capFx)}` : ''}"><small>${tr('Kapiten', 'Captain')}</small>${cap ? `<span class="pp">${fmt(cap.xp)}</span><span class="shirt">${shirt(ix.teams.get(cap.e.team), cap.e.element_type === 1)}${photo(cap.e)}</span><span class="cpl" aria-hidden="true"><b style="font-size:${cap.e.web_name.length <= 8 ? 22 : cap.e.web_name.length <= 11 ? 18 : 15}px">${esc(cap.e.web_name)}</b><span>${esc(capFx)}</span></span>` : '<span class="v">–</span>'}</a>
      <section class="t s3 odds2" aria-label="${tr('Šansa za zelenu strelicu', 'Green arrow chance')}: ${pct(odds.p)}"><small>${tr('Zelena strelica', 'Green arrow')}</small><span class="v">${pct(odds.p)}</span><span class="obar" aria-hidden="true"><i style="width:${on}%"></i></span><span class="sub">${tr(`Najvjerovatnije ${odds.low} do ${odds.high} bod., prosjek ${Math.round(recentAvg)}`, `Likely ${odds.low} to ${odds.high} pts, average ${Math.round(recentAvg)}`)}</span></section>
      ${idea ? `<a class="t s6 trn" href="#/transferi"><span class="o"><small>${tr('Prodaj', 'Out')}</small><b>${esc(idea.out.web_name)}</b></span><span class="ar" aria-hidden="true">→</span><span class="sr">${tr('za', 'for')}</span><span class="in"><small>${tr('Kupi', 'In')}</small><b>${esc(idea.inn.web_name)}</b></span><span class="gain"><b>+${fmt(idea.gain)}</b><small>${tr('5 kola', '5 GWs')}</small></span></a>` : `<a class="t s6 trn" href="#/transferi"><span class="in"><small>${tr('Transfer', 'Transfer')}</small><b>${tr('Ništa se jasno ne isplati', 'Nothing clearly pays off')}</b></span></a>`}
      <a class="t s3" href="#/transferi"><small>${tr('Vrijednost tima', 'Team value')}</small><span class="v sm" data-n="${last.value / 10}" data-f="m">£${fmt(last.value / 10)}m</span><span class="nt">${tr('banka', 'bank')} £${fmt(last.bank / 10)}m</span></a>
      <a class="t s3" href="#/liga"><small>${esc(lname)}</small><span class="v sm">${myL ? (tr('', '#') + int(myL.rank) + tr('.', '')) : '–'}</span>${myL && myL.rank === 1 ? `<span class="up">${tr('vodiš ligu', 'you lead')}</span>` : myL && lead && lead.entry !== S.id && myL.total != null ? `<span class="dn">${int(lead.total - myL.total)} ${tr('bod. do prvog', 'pts behind 1st')}</span>` : `<span class="nt">${tr('tabela', 'table')}</span>`}</a>
    </div>
    <div class="lbl"><h2 class="ct">${tr('Kolo', 'Gameweek')} ${gw}</h2><span class="sub">${tr('utakmice tvojih igrača', 'your players’ matches')}</span></div>
    <div class="bento fxg">${fxHtml || `<p class="muted s6">${tr('Nijedan tvoj igrač nema utakmicu u ovom kolu.', 'None of your players has a match this gameweek.')}</p>`}
      <a class="t s${fxs.length % 3 === 1 ? 4 : fxs.length % 3 === 2 ? 2 : 6} jury2" href="/jury/post"><span><b>${tr('Ocijeni moj tim', 'Rate my team')}</b><span class="sub">${tr(`Objavi kolo ${gw} na SquadJury`, `Post GW ${gw} on SquadJury`)}</span></span><span class="go">${tr('Objavi', 'Post')}</span></a>
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
    el.querySelector('b').textContent = c.big; el.querySelector('.dl-min').textContent = c.min;
  }, 30000);
}
