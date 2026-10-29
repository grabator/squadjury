// Karijera: XP i nivo menadžera, značke, kalendar sezone, brojač žaljenja i slika sezone za dijeljenje.
import { S, captainHistory, warmCaptainHistory } from '../state.js';
import { careerXp, badges, regrets, num, int } from '../model.js';
import { esc, ring, ic } from '../ui.js';

export const prefetch = () => warmCaptainHistory(8);
export const title = 'Karijera';
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
  for (let gw = 1; gw <= Math.max(38, h.length); gw++) { const x = h.find((y) => y.event === gw); cal.push(x ? `<div class="${cls(x)}" title="Kolo ${gw}: ${x.points} bodova"><span><b>${x.points}</b>K${gw}</span></div>` : `<div class="c0"><span>K${gw}</span></div>`); }
  return `<div class="head"><div><h1>Karijera menadžera</h1><p class="sub">XP za pametne poteze, značke i tvoja sezona na jednom mjestu</p></div><button type="button" class="btn" id="wrap">${ic('share')}Slika sezone za story</button></div>
    <div class="grid3">
      <section class="g card lvl"><div class="ring">${ring(c.into / c.need)}<b>${c.level}</b></div><div><p class="sub">Nivo ${c.level}</p><p class="big" style="font-size:34px">${esc(c.title)}</p><p class="sub">${int(c.total)} XP ukupno, još ${int(c.need - c.into)} do nivoa ${c.level + 1}</p></div></section>
      <section class="g card"><p class="sub">Najbolje kolo</p><p class="big">${best ? best.points : 0} <span class="sub">bodova</span></p><p class="sub">${best ? 'Kolo ' + best.event + ', prosjek tog kola ' + avgOf(best.event) : ''}</p></section>
      <section class="g card"><p class="sub">Brojač žaljenja</p><p class="big" style="color:#ff6aa6">${rg.total} <span class="sub">bodova</span></p><p class="sub">${rg.bench} ostalo na klupi, ${rg.hits} na minus transferima${capRows.length ? ', ' + rg.cap + ' na kapitenu (zadnjih ' + capRows.length + ' kola)' : ''}</p></section>
    </div>
    <section class="g card mt"><h2 class="ct">Kalendar sezone</h2><p class="sub" style="margin-top:4px">Svako kolo u odnosu na prosjek: crveno ispod, sivo blizu, zeleno iznad, svijetlo zeleno 20+ iznad</p><div class="cal" style="margin-top:12px">${cal.join('')}</div></section>
    <div class="grid2 mt">
      <section class="g card"><h2 class="ct">Značke</h2><div class="badges" style="margin-top:12px">${b.map((x) => `<div class="bdg${x.on ? ' on' : ''}"><b>${esc(x.name)}</b><span>${x.on ? 'Osvojeno' : esc(x.hint)}</span></div>`).join('')}</div></section>
      <section class="g card"><h2 class="ct">XP po kolima</h2><div class="list" style="margin-top:12px">${c.log.slice().reverse().map((l) => `<div class="li"><span class="k">Kolo ${l.gw}</span><span class="sub">${l.items.map((i) => esc(i[0])).join(', ') || 'ništa ovo kolo'}</span><span class="chg ${l.xp ? 'up' : 'nt'}">+${l.xp}</span></div>`).join('')}</div>
        <p class="sub" style="margin-top:10px">XP: zelena strelica +30, iznad prosjeka +20, 70+ bodova +50, 90+ još +50, kolo bez minusa +10, kapiten sa 10+ bodova +50.</p></section>
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
  T('MOJA FPL SEZONA', 220, 70, '#00ff87');
  T(e.name.toUpperCase(), 330, 110);
  const last1 = h[h.length - 1] || {};
  const rows = [['Ukupno bodova', int(last1.total_points || 0)], ['Rang', int(last1.overall_rank || 0)], ['Najbolje kolo', (best?.points || 0) + ' (K' + (best?.event || '') + ')'], ['Nivo menadžera', c.level + ', ' + c.title], ['Ostalo na klupi', rg.bench + ' bodova'], ['Značke', b.filter((y) => y.on).length + ' od ' + b.length]];
  rows.forEach(([k, v], i) => { const y = 520 + i * 200; T(k, y, 44, 'rgba(246,241,251,.65)', '600 44px Manrope, sans-serif'); T(v, y + 92, 96); });
  T('FPL Manager', 1820, 48, 'rgba(246,241,251,.6)');
  return new Promise((res) => cv.toBlob(res, 'image/png'));
}

export function bind() {
  const btn = document.getElementById('wrap');
  if (!btn) return;
  btn.onclick = async () => {
    btn.disabled = true;
    const blob = await drawWrap();
    btn.disabled = false;
    const file = new File([blob], 'moja-fpl-sezona.png', { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file], title: 'Moja FPL sezona' }); return; } catch { /* odustao */ } }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = file.name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
}
