// Karijera: XP i nivo menadžera, značke, kalendar sezone, brojač žaljenja i slika sezone za dijeljenje.
import { S, captainHistory, warmCaptainHistory } from '../state.js';
import { careerXp, badges, regrets, num, int } from '../model.js';
import { esc, ring, ic } from '../ui.js';
import { tr } from '../i18n.js';

export const prefetch = () => warmCaptainHistory(8);
export const title = tr('Karijera', 'Career');
let last = null;

export async function render() {
  const { ix, history } = S;
  let capRows = [];
  try { capRows = await captainHistory(8); } catch { /* bez podataka o kapitenima */ }
  const capPts = Object.fromEntries(capRows.map((r) => [r.gw, r.cap * 2]));
  const capMiss = Object.fromEntries(capRows.map((r) => [r.gw, Math.max(0, (r.best - r.cap)) * 2]));
  const c = careerXp(history, ix.events, capPts);
  const b = badges(history, ix.events, capPts);
  const rg = regrets(history, capMiss);
  const h = history.current;
  const avgOf = (gw) => num(ix.events.find((e) => e.id === gw)?.average_entry_score);
  const cls = (x) => { const a = avgOf(x.event); if (!a) return 'c2'; const d = x.points - a; return d >= 20 ? 'c4' : d > 0 ? 'c3' : d > -10 ? 'c2' : 'c1'; };
  const best = h.slice().sort((a, b2) => b2.points - a.points)[0];
  last = { c, b, rg, best, h };
  const cal = [];
  for (let gw = 1; gw <= Math.max(38, h.length); gw++) { const x = h.find((y) => y.event === gw); cal.push(x ? `<div class="${cls(x)}" title="${tr('Kolo', 'Gameweek')} ${gw}: ${x.points} ${tr('bodova', 'points')}"><span><b>${x.points}</b>${tr('K', 'GW')}${gw}</span></div>` : `<div class="c0"><span>${tr('K', 'GW')}${gw}</span></div>`); }
  return `<div class="head"><div><h1>${tr('Karijera menadžera', 'Manager career')}</h1><p class="sub">${tr('XP za pametne poteze, značke i tvoja sezona na jednom mjestu', 'XP for smart moves, badges and your season in one place')}</p></div><button type="button" class="btn" id="wrap">${ic('share')}${tr('Slika sezone za story', 'Season image for your story')}</button></div>
    <div class="grid3">
      <section class="g card lvl"><div class="ring">${ring(c.into / c.need)}<b>${c.level}</b></div><div><p class="sub">${tr('Nivo', 'Level')} ${c.level}</p><p class="big" style="font-size:34px">${esc(c.title)}</p><p class="sub">${tr(`${int(c.total)} XP ukupno, još ${int(c.need - c.into)} do nivoa ${c.level + 1}`, `${int(c.total)} XP total, ${int(c.need - c.into)} more to level ${c.level + 1}`)}</p></div></section>
      <section class="g card"><p class="sub">${tr('Najbolje kolo', 'Best gameweek')}</p><p class="big">${best ? best.points : 0} <span class="sub">${tr('bodova', 'points')}</span></p><p class="sub">${best ? tr('Kolo ' + best.event + ', prosjek tog kola ' + avgOf(best.event), 'Gameweek ' + best.event + ', that gameweek\'s average ' + avgOf(best.event)) : ''}</p></section>
      <section class="g card"><p class="sub">${tr('Brojač žaljenja', 'Regret counter')}</p><p class="big" style="color:#ff6aa6">${rg.total} <span class="sub">${tr('bodova', 'points')}</span></p><p class="sub">${tr(`${rg.bench} ostalo na klupi, ${rg.hits} na minus transferima`, `${rg.bench} left on the bench, ${rg.hits} on hits`)}${capRows.length ? tr(', ' + rg.cap + ' na kapitenu (zadnjih ' + capRows.length + ' kola)', ', ' + rg.cap + ' on the captain (last ' + capRows.length + ' gameweeks)') : ''}</p></section>
    </div>
    <section class="g card mt"><h2 class="ct">${tr('Kalendar sezone', 'Season calendar')}</h2><p class="sub" style="margin-top:4px">${tr('Svako kolo u odnosu na prosjek: crveno ispod, sivo blizu, zeleno iznad, svijetlo zeleno 20+ iznad', 'Each gameweek against the average: red below, grey close, green above, light green 20+ above')}</p><div class="cal" style="margin-top:12px">${cal.join('')}</div></section>
    <div class="grid2 mt">
      <section class="g card"><h2 class="ct">${tr('Značke', 'Badges')}</h2><div class="badges" style="margin-top:12px">${b.map((x) => `<div class="bdg${x.on ? ' on' : ''}"><b>${esc(x.name)}</b><span>${x.on ? tr('Osvojeno', 'Earned') : esc(x.hint)}</span></div>`).join('')}</div></section>
      <section class="g card"><h2 class="ct">${tr('XP po kolima', 'XP per gameweek')}</h2><div class="list" style="margin-top:12px">${c.log.slice().reverse().map((l) => `<div class="li"><span class="k">${tr('Kolo', 'GW')} ${l.gw}</span><span class="sub">${l.items.map((i) => esc(i[0])).join(', ') || tr('ništa ovo kolo', 'nothing this gameweek')}</span><span class="chg ${l.xp ? 'up' : 'nt'}">+${l.xp}</span></div>`).join('')}</div>
        <p class="sub" style="margin-top:10px">${tr('XP: zelena strelica +30, iznad prosjeka +20, 70+ bodova +50, 90+ još +50, kolo bez minusa +10, kapiten sa 10+ bodova +50.', 'XP: green arrow +30, above average +20, 70+ points +50, 90+ another +50, gameweek without a hit +10, captain with 10+ points +50.')}</p></section>
    </div>`;
}

// slika sezone 1080x1920 za Instagram story
async function drawWrap() {
  const { c, b, rg, best, h } = last, e = S.entry;
  await document.fonts.load('800 80px "Barlow Condensed"').catch(() => {});
  const cv = document.createElement('canvas'); cv.width = 1080; cv.height = 1920;
  const x = cv.getContext('2d');
  const g = x.createLinearGradient(0, 0, 1080, 1920); g.addColorStop(0, '#37003c'); g.addColorStop(1, '#14061f'); x.fillStyle = g; x.fillRect(0, 0, 1080, 1920);
  const glow = (cx, cy, r, col) => { const rg2 = x.createRadialGradient(cx, cy, 0, cx, cy, r); rg2.addColorStop(0, col); rg2.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = rg2; x.fillRect(0, 0, 1080, 1920); };
  glow(100, 200, 700, 'rgba(150,60,255,.55)'); glow(1000, 1700, 700, 'rgba(255,40,130,.35)');
  const T = (t, y, size, col = '#fff', font = '800 ' + size + 'px "Barlow Condensed", sans-serif') => { x.font = font; x.fillStyle = col; x.fillText(t, 90, y); };
  T(tr('MOJA FPL SEZONA', 'MY FPL SEASON'), 220, 70, '#00ff87');
  T(e.name.toUpperCase(), 330, 110);
  const last1 = h[h.length - 1] || {};
  const rows = [[tr('Ukupno bodova', 'Total points'), int(last1.total_points || 0)], [tr('Rang', 'Rank'), int(last1.overall_rank || 0)], [tr('Najbolje kolo', 'Best gameweek'), (best?.points || 0) + ' (' + tr('K', 'GW') + (best?.event || '') + ')'], [tr('Nivo menadžera', 'Manager level'), c.level + ', ' + c.title], [tr('Ostalo na klupi', 'Left on the bench'), rg.bench + tr(' bodova', ' points')], [tr('Značke', 'Badges'), b.filter((y) => y.on).length + tr(' od ', ' of ') + b.length]];
  rows.forEach(([k, v], i) => { const y = 520 + i * 200; T(k, y, 44, 'rgba(246,241,251,.65)', '600 44px Manrope, sans-serif'); T(v, y + 92, 96); });
  T('SquadJury', 1820, 48, 'rgba(246,241,251,.6)');
  return new Promise((res) => cv.toBlob(res, 'image/png'));
}

export function bind() {
  const btn = document.getElementById('wrap');
  if (!btn) return;
  btn.onclick = async () => {
    btn.disabled = true;
    const blob = await drawWrap();
    btn.disabled = false;
    const file = new File([blob], tr('moja-fpl-sezona.png', 'my-fpl-season.png'), { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file], title: tr('Moja FPL sezona', 'My FPL season') }); return; } catch { /* odustao */ } }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = file.name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
}
