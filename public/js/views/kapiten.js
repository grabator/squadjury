// Kapiten: kandidati iz prvih 11, sigurna i rizična opcija, šansa za zelenu strelicu po kapitenu.
import { S } from '../state.js';
import { captainOptions, greenArrowOdds, fmt, num, pct, POS_BS } from '../model.js';
import { esc, pbtn } from '../ui.js';

export const title = 'Kapiten';

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
  return `<div class="head"><div><h1>Kapiten za kolo ${ix.nextGw}</h1><p class="sub">Kapiten donosi duple bodove. Predviđanje je procjena iz forme, minuta, očekivanih golova i protivnika.</p></div></div>
    <div class="grid3">${box('Najviše predviđenih bodova', top, esc(top?.why || ''))}${box('Druga opcija', second, esc(second?.why || ''))}${diff ? box('Rizik koji se može isplatiti', diff, 'Malo ko ga bira. Ako on donese bodove, skačeš u rangu.') : '<section class="g card"><p class="sub">Rizik koji se može isplatiti</p><p class="muted" style="margin-top:6px">U tvom timu trenutno nema dobrog kapitena kojeg malo ko bira.</p></section>'}</div>
    <div class="grid2 mt">
      <section class="g card" aria-labelledby="h-all"><h2 id="h-all" class="ct">Svi igrači iz prvih 11</h2><div class="list" style="margin-top:12px">${opts.map((o, i) => `<div class="li${i === 0 ? ' hl' : ''}"><span class="k">${i + 1}.</span><div>${pbtn(o.e)} <span class="sub">${POS_BS[o.e.element_type]}, ${esc(ix.teams.get(o.e.team).name)}</span><p class="sub" style="margin-top:2px">${esc(o.why)}</p><div class="meter"><i style="width:${(o.xp / max * 100).toFixed(0)}%"></i></div></div><span class="cond" style="font-size:26px">${fmt(o.xp)}</span></div>`).join('')}</div></section>
      <section class="g card"><h2 class="ct">Šansa za zelenu strelicu</h2><p class="sub" style="margin-top:4px">Kolo „odigrano” 1.500 puta sa svakim od tri najbolja kapitena (prosjek kola oko ${Math.round(avg)} bodova)</p>
        <div class="list" style="margin-top:12px">${odds.map(({ o, g }) => `<div class="li"><span class="k">${esc(o.e.web_name)}</span><div><div class="meter green"><i style="width:${pct(g.p)}"></i></div><p class="sub" style="margin-top:4px">najvjerovatnije ${g.low} do ${g.high} bodova</p></div><b>${pct(g.p)}</b></div>`).join('')}</div>
        <p class="sub" style="margin-top:12px">Razlike su često male. Kad su dva igrača blizu, sigurniji je onaj kojeg ima više menadžera, a rizičniji onaj kojeg malo ko ima.</p></section>
    </div>`;
}
