// Pregled: pločice (kolo i rok, rang, bodovi, kapiten, šansa za zelenu strelicu, transfer, vrijednost, liga) i utakmice kola.
import { S, league } from '../state.js';
import { captainOptions, transferIdeas, greenArrowOdds, fixturesFor, num, fmt, int, time, dayLong, dayShort, dateLong, pct } from '../model.js';
import { esc, kit, ink, shirt, photo, crest, countUp } from '../ui.js';
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
  const side = (t, cls) => { const [c] = kit(t); return `<span class="${cls}" style="--c:${c};--ct:${ink(c)}"><span class="cr">${crest(t)}</span><b>${esc(t.short_name)}</b></span>`; };
  const fxCards = fxs.map(({ f, team, ps }) => {
    const d = new Date(f.kickoff), me = ix.teams.get(team), op = ix.teams.get(f.opp);
    const [hm, aw] = f.home ? [me, op] : [op, me];
    return `<a class="fcard" href="#/raspored" aria-label="${esc(hm.name)} ${tr('protiv', 'against')} ${esc(aw.name)}, ${dayLong(d)} ${time(d)}. ${tr('Tvoji igrači', 'Your players')}: ${esc(ps.map((e) => e.web_name).join(', '))}"><span class="ftp">${side(hm, '')}${side(aw, '')}</span><span class="fbt"><b>${time(d)}</b><span class="sub">${dayLong(d)}</span><span class="fps">${ps.map((e) => esc(e.web_name)).join(', ')}</span></span></a>`;
  }).join('');
  const words = entry.name.trim().split(/\s+/);

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
    <div class="cards" id="ov-cards" aria-roledescription="${tr('vrtuljak', 'carousel')}" aria-label="${tr('Glavne kartice', 'Main cards')}">
      <section class="ocard pat-bg" aria-label="${tr('Kolo', 'Gameweek')} ${gw}"><span class="oslash" aria-hidden="true"><i></i><i></i><i></i></span><span class="otag">${tr('Kolo', 'Gameweek')} ${gw}</span>
        <h2 class="oname">${words.length > 1 ? `${esc(words.slice(0, -1).join(' '))}<br><em>${esc(words.at(-1))}</em>` : `<em>${esc(entry.name)}</em>`}</h2>
        <div class="obot">${cd.parts ? `<div id="countdown" role="timer" aria-label="${tr('Rok za transfere', 'Transfer deadline')}: ${dateLong(new Date(cd.ev.deadline_time))}"><b>${cd.big}</b><span class="sub"><span class="dl-min">${cd.min}</span> ${tr('do roka', 'to deadline')} · ${dayShort(new Date(cd.ev.deadline_time))} ${time(new Date(cd.ev.deadline_time))}</span></div>` : `<div><b>${tr('Rok je prošao', 'Deadline passed')}</b></div>`}<a class="btn" href="#/tim">${tr('Moj tim', 'My team')}</a></div></section>
      <section class="ocard" aria-label="${tr('Kapiten', 'Captain')}"><span class="otag">${tr('Kapiten', 'Captain')}</span>${cap ? `<span class="shirt ocap">${shirt(ix.teams.get(cap.e.team), cap.e.element_type === 1)}${photo(cap.e)}</span><h2 class="oname sm">${esc(cap.e.web_name)}</h2>` : ''}
        <div class="obot"><div><b>${cap ? fmt(cap.xp) : '–'}</b><span class="sub">${tr('predviđeno', 'predicted')}${capFx ? ' · ' + esc(capFx) : ''}</span></div><a class="btn" href="#/kapiten">${tr('Kapiten', 'Captain')}</a></div></section>
      <section class="ocard" aria-label="${tr('Najbolji transfer', 'Best transfer')}"><span class="otag">${tr('Najbolji transfer', 'Best transfer')}</span>${idea ? `<div class="otr"><span><small>${tr('Prodaj', 'Out')}</small><s>${esc(idea.out.web_name)}</s></span><span class="ar" aria-hidden="true">→</span><span><small>${tr('Kupi', 'In')}</small><b>${esc(idea.inn.web_name)}</b></span></div>` : `<h2 class="oname sm">${tr('Ništa se jasno ne isplati', 'Nothing clearly pays off')}</h2>`}
        <div class="obot"><div><b class="g">${idea ? '+' + fmt(idea.gain) : '–'}</b><span class="sub">${tr('bodova kroz 5 kola', 'points over 5 gameweeks')}</span></div><a class="btn" href="#/transferi">${tr('Transferi', 'Transfers')}</a></div></section>
      <section class="ocard" aria-label="${tr('Bodovi u kolu', 'Points in gameweek')} ${last.event}"><span class="otag">${tr('Kolo', 'Gameweek')} ${last.event}</span><h2 class="oname big" data-n="${last.points}" data-f="int">${last.points}</h2>
        <div class="obot"><div><b class="${last.points >= avg ? 'g' : 'r'}">${last.points >= avg ? '+' : '−'}${int(last.points - avg)}</b><span class="sub">${tr('od prosjeka', 'vs average')} (${Math.round(avg)})</span></div><a class="btn" href="#/uzivo">${tr('Uživo', 'Live')}</a></div></section>
    </div>
    <div class="odots" role="group" aria-label="${tr('Kartice', 'Cards')}">${[tr('Kolo', 'Gameweek'), tr('Kapiten', 'Captain'), tr('Transfer', 'Transfer'), tr('Bodovi', 'Points')].map((t, i) => `<button type="button" data-card="${i}" aria-label="${t}"${i ? '' : ' aria-current="true"'}></button>`).join('')}</div>
    <div class="minis">
      <a class="mini" href="#/liga"><small>${tr('Ukupni rang', 'Overall rank')}</small><b data-n="${last.overall_rank}" data-f="int">${int(last.overall_rank)}</b>${rankChg ? `<span class="${rankChg > 0 ? 'up' : 'dn'}">${rankChg > 0 ? '▲' : '▼'} ${int(rankChg)}</span>` : `<span class="nt">${tr('bez promjene', 'no change')}</span>`}</a>
      <a class="mini" href="#/kapiten"><small>${tr('Zelena strelica', 'Green arrow')}</small><b class="gd">${pct(odds.p)}</b><span class="nt">${odds.low}–${odds.high} ${tr('bod. vjerovatno', 'pts likely')}</span></a>
      <a class="mini" href="#/transferi"><small>${tr('Vrijednost tima', 'Team value')}</small><b data-n="${last.value / 10}" data-f="m">£${fmt(last.value / 10)}m</b><span class="nt">${tr('banka', 'bank')} £${fmt(last.bank / 10)}m</span></a>
      <a class="mini" href="#/liga"><small>${esc(lname)}</small><b>${myL ? '#' + int(myL.rank) : '–'}</b>${myL && myL.rank === 1 ? `<span class="up">${tr('vodiš ligu', 'you lead')}</span>` : myL && lead && lead.entry !== S.id && myL.total != null ? `<span class="dn">${int(lead.total - myL.total)} ${tr('bod. do prvog', 'pts behind 1st')}</span>` : `<span class="nt">${tr('tabela', 'table')}</span>`}</a>
    </div>
    <div class="lbl"><h2 class="ct">${tr('Kolo', 'Gameweek')} ${gw}</h2><a class="sub" href="#/raspored">${tr('Sve utakmice', 'See all')}</a></div>
    <div class="hscroll">${fxCards || `<p class="muted">${tr('Nijedan tvoj igrač nema utakmicu u ovom kolu.', 'None of your players has a match this gameweek.')}</p>`}</div>
    <a class="jury3" href="/jury/post"><span><b>${tr('Ocijeni moj tim', 'Rate my team')}</b><span class="sub">${tr(`Objavi kolo ${gw} na SquadJury`, `Post GW ${gw} on SquadJury`)}</span></span><span class="go">${tr('Objavi', 'Post')}</span></a>`;
}

export function bind() {
  countUp(document.getElementById('main'));
  // vrtuljak: tačke prate karticu na ekranu, dodir na tačku je vodi na tu karticu
  const box = document.getElementById('ov-cards'), dots = [...document.querySelectorAll('.odots button')];
  if (box && dots.length) {
    const cur = () => Math.round(box.scrollLeft / Math.max(1, box.firstElementChild.offsetWidth + 10));
    box.addEventListener('scroll', () => { const i = cur(); dots.forEach((d, k) => (k === i ? d.setAttribute('aria-current', 'true') : d.removeAttribute('aria-current'))); }, { passive: true });
    dots.forEach((d, k) => { d.onclick = () => box.children[k].scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'nearest', inline: 'start' }); });
  }
  const el = document.getElementById('countdown');
  if (!el) return;
  const t = setInterval(() => {
    if (!document.body.contains(el)) return clearInterval(t);
    const c = countdown(S.ix);
    if (!c.parts) return clearInterval(t);
    el.querySelector('b').textContent = c.big; el.querySelector('.dl-min').textContent = c.min;
  }, 30000);
}
