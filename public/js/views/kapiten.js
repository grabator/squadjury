// Kapiten: kandidati iz prvih 11, sigurna i rizična opcija, šansa za zelenu strelicu po kapitenu.
import { S, captainHistory, warmCaptainHistory } from '../state.js';
import { captainOptions, greenArrowOdds, captainStats, CAP_HIT, CAP_MISS, fmt, num, pct, pl, POS_BS } from '../model.js';
import { esc, pbtn, shirt } from '../ui.js';

export const title = 'Kapiten';
export const prefetch = () => warmCaptainHistory(38);

// kapitenski pogoci ove sezone
async function hitsCard(ix) {
  let rows;
  try { rows = await captainHistory(S.history.current.length); } catch { return ''; }
  if (!rows.length) return '';
  const st = captainStats(rows);
  const cls = (r) => (r.cap >= CAP_HIT ? 'hit' : r.cap <= CAP_MISS ? 'miss' : 'ok');
  const chips = rows.map((r) => { const e = ix.players.get(r.capId), b = ix.players.get(r.bestId); return `<button type="button" class="capc ${cls(r)}" data-pid="${r.capId}" title="Kolo ${r.gw}: ${esc(e?.web_name || '')} ${r.cap * r.mult} bod.${r.cap < r.best && b ? ', najbolji bi bio ' + esc(b.web_name) + ' (' + r.best * r.mult + ')' : ''}"><span class="sub">K${r.gw}</span><span class="shirt">${e ? shirt(ix.teams.get(e.team), e.element_type === 1) : ''}</span><b>${esc(e?.web_name || '–')}</b><span class="capp">${r.cap * r.mult}${r.mult === 3 ? ' <small>×3</small>' : ''}</span>${r.cap >= r.best ? '<span class="capbest" title="Najbolji izbor u timu">★</span>' : ''}</button>`; }).join('');
  return `<section class="g card mt" aria-labelledby="h-hits"><div class="ch"><div><h2 id="h-hits" class="ct">Tvoji kapiteni ove sezone</h2><p class="sub">Pogodak je kapiten sa ${CAP_HIT} ili više bodova (${CAP_HIT * 2}+ sa duplim). Promašaj je ${CAP_MISS} ili manje. Zvjezdica znači da niko iz prvih 11 nije donio više.</p></div></div>
    <div class="caps4">
      <div><span class="sub">Pogoci</span><b style="color:var(--green)">${st.hits}<small> od ${st.n}</small></b><div class="meter green"><i style="width:${pct(st.rate)}"></i></div><span class="sub">${pct(st.rate)} kola</span></div>
      <div><span class="sub">Najbolji izbor</span><b>${st.best}<small> ${pl(st.best, 'put', 'puta', 'puta')}</small></b><span class="sub">kapiten je bio najbolji u timu</span></div>
      <div><span class="sub">Bodovi od kapitena</span><b>${st.total}</b><span class="sub">${fmt(st.total / Math.max(1, st.n))} po kolu, promašaja ${st.misses}</span></div>
      <div><span class="sub">Ostalo na stolu</span><b style="color:#ff6aa6">${st.lost}</b><span class="sub">da je kapiten uvijek bio najbolji iz prvih 11${st.streak > 1 ? `. Najduži niz pogodaka: ${st.streak}` : ''}</span></div>
    </div>
    <div class="caprow">${chips}</div></section>`;
}

export async function render() {
  const { ix } = S;
  const opts = captainOptions(ix, S.xi);
  const top = opts[0], max = top?.xp || 1;
  const second = opts[1];
  const diff = opts.filter((o) => o.own < 15 && o.xp >= max * 0.7)[0];
  const avgs = S.history.current.slice(-4).map((h) => num(ix.events.find((e) => e.id === h.event)?.average_entry_score));
  const avg = avgs.reduce((a, b) => a + b, 0) / Math.max(1, avgs.length) || 50;
  const odds = opts.slice(0, 3).map((o) => ({ o, g: greenArrowOdds(ix, { xi: S.xi, captain: o.e.id }, avg, 1500, 5) }));
  const box = (k, o, note) => o ? `<section class="g card"><p class="sub">${k}</p><p class="big" style="margin-top:4px">${pbtn(o.e)}</p><p class="sub">${fmt(o.xp)} predviđenih bodova, bira ga ${fmt(o.own)}% menadžera</p><p class="muted" style="margin-top:8px">${note}</p></section>` : '';
  const hits = await hitsCard(ix);
  return `<div class="head"><div><h1>Kapiten za kolo ${ix.nextGw}</h1><p class="sub">Kapiten donosi duple bodove. Predviđanje je procjena iz forme, minuta, očekivanih golova i protivnika.</p></div></div>
    <div class="grid3">${box('Najviše predviđenih bodova', top, esc(top?.why || ''))}${box('Druga opcija', second, esc(second?.why || ''))}${diff ? box('Rizik koji se može isplatiti', diff, 'Malo ko ga bira. Ako on donese bodove, skačeš u rangu.') : '<section class="g card"><p class="sub">Rizik koji se može isplatiti</p><p class="muted" style="margin-top:6px">U tvom timu trenutno nema dobrog kapitena kojeg malo ko bira.</p></section>'}</div>
    ${hits}
    <div class="grid2 mt">
      <section class="g card" aria-labelledby="h-all"><h2 id="h-all" class="ct">Svi igrači iz prvih 11</h2><div class="list" style="margin-top:12px">${opts.map((o, i) => `<div class="li${i === 0 ? ' hl' : ''}"><span class="k">${i + 1}.</span><div>${pbtn(o.e)} <span class="sub">${POS_BS[o.e.element_type]}, ${esc(ix.teams.get(o.e.team).name)}</span><p class="sub" style="margin-top:2px">${esc(o.why)}</p><div class="meter"><i style="width:${(o.xp / max * 100).toFixed(0)}%"></i></div></div><span class="cond" style="font-size:26px">${fmt(o.xp)}</span></div>`).join('')}</div></section>
      <section class="g card"><h2 class="ct">Šansa za zelenu strelicu</h2><p class="sub" style="margin-top:4px">Kolo „odigrano” 1.500 puta sa svakim od tri najbolja kapitena (prosjek kola oko ${Math.round(avg)} bodova)</p>
        <div class="list" style="margin-top:12px">${odds.map(({ o, g }) => `<div class="li"><span class="k">${esc(o.e.web_name)}</span><div><div class="meter green"><i style="width:${pct(g.p)}"></i></div><p class="sub" style="margin-top:4px">najvjerovatnije ${g.low} do ${g.high} bodova</p></div><b>${pct(g.p)}</b></div>`).join('')}</div>
        <p class="sub" style="margin-top:12px">Razlike su često male. Kad su dva igrača blizu, sigurniji je onaj kojeg ima više menadžera, a rizičniji onaj kojeg malo ko ima.</p></section>
    </div>`;
}
