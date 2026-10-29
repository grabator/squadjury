// Liga: tabela, kapitenski duel kola i najbolji ovog kola.
import { S, league, picksOf, teamOf, live, setLeague } from '../state.js';
import { int, CAP_HIT, captainStats } from '../model.js';
import { esc, leaguePick } from '../ui.js';

export const prefetch = () => { league().then((L) => { for (const r of (L?.standings?.results || []).slice(0, 20)) picksOf(r.entry, S.lastGw).catch(() => {}); }).catch(() => {}); live(S.lastGw).catch(() => {}); };
export const title = 'Liga';
const HITS_N = 4;

export async function render() {
  const { ix } = S;
  const L = await league().catch(() => null);
  if (!L) return `<div class="head"><h1>Liga</h1></div><section class="g card"><p class="muted">Ovaj tim nije ni u jednoj privatnoj klasičnoj ligi. Napravi ligu u FPL-u ili se pridruži ligi sa prijateljima, pa će se ovdje pojaviti.</p></section>`;
  const rows = L.standings.results, gw = S.lastGw, meta = S.leagues.find((l) => l.id === S.leagueId);
  const lv = await live(gw);
  const caps = await Promise.all(rows.slice(0, 20).map(async (r) => {
    try { const t = teamOf(await picksOf(r.entry, gw)); const e = ix.players.get(t.captain); return { r, e, pts: (lv.get(t.captain)?.total_points || 0) * 2 }; } catch { return { r, e: null, pts: 0 }; }
  }));
  caps.sort((a, b) => b.pts - a.pts);
  const bestGw = rows.slice().sort((a, b) => b.event_total - a.event_total)[0];
  const mover = rows.slice().sort((a, b) => (b.last_rank - b.rank) - (a.last_rank - a.rank))[0];
  return `<div class="head"><div><h1>${esc(L.league.name)}</h1><p class="sub">Klasična tabela, ukupni bodovi poslije kola ${gw}${L.standings.has_next ? `. Prikazano prvih ${rows.length}${meta?.entry_rank ? `, a ti si na ${int(meta.entry_rank)}. mjestu` : ''}` : ''}</p></div>${S.leagues.length > 1 ? leaguePick(S.leagues, S.leagueId) : ''}</div>
    <div class="grid2">
      <div class="stack">
      <section class="g card"><h2 class="ct">Tabela</h2><table class="tbl" style="margin-top:6px"><thead><tr><th scope="col">#</th><th scope="col">Tim</th><th scope="col">Kolo</th><th scope="col">Ukupno</th></tr></thead><tbody>${rows.map((r) => `<tr${r.entry === S.id ? ' class="me"' : ''}><td>${r.rank} ${r.last_rank > r.rank ? '<span class="chg up" aria-label="gore">▲</span>' : r.last_rank < r.rank ? '<span class="chg dn" aria-label="dole">▼</span>' : ''}</td><td>${esc(r.entry_name)}<br><span class="sub">${esc(r.player_name)}</span></td><td class="num">${r.event_total}</td><td class="num">${int(r.total)}</td></tr>`).join('')}</tbody></table></section>
        <section class="g card" aria-labelledby="h-lhits"><h2 id="h-lhits" class="ct">Kapitenski pogoci</h2><p class="sub">Zadnja ${Math.min(HITS_N, S.history.current.length)} kola: koliko puta je kapiten donio ${CAP_HIT}+ bodova</p><div id="lg-hits" class="list" style="margin-top:10px"><div class="sk" style="height:160px"></div></div></section>
      </div>
      <div class="stack">
        <section class="g card"><h2 class="ct">Kapitenski duel, kolo ${gw}</h2><p class="sub">Ko je izabrao najboljeg kapitena (bodovi su već duplirani)</p><div class="list" style="margin-top:10px">${caps.map((c, i) => `<div class="li${c.r.entry === S.id ? ' hl' : ''}"><span class="k">${i + 1}.</span><span><b>${esc(c.r.entry_name)}</b><br><span class="sub">${c.e ? esc(c.e.web_name) : '–'}</span></span><b class="cond" style="font-size:24px">${c.pts}</b></div>`).join('')}</div></section>
        <section class="g card"><h2 class="ct">Kolo ${gw} u ligi</h2><div class="list" style="margin-top:10px">
          <div class="li"><span class="k">Najviše</span><b>${esc(bestGw.entry_name)}</b><span class="chg up">${bestGw.event_total} bod.</span></div>
          ${mover && mover.last_rank > mover.rank ? `<div class="li"><span class="k">Skok</span><b>${esc(mover.entry_name)}</b><span class="chg up">${mover.last_rank}. → ${mover.rank}.</span></div>` : ''}
        </div></section>
      </div>
    </div>`;
}

// kapitenski pogoci članova lige (prvih 20) u zadnjih HITS_N kola, učitava se poslije prikaza tabele
async function leagueHits() {
  const box = document.getElementById('lg-hits'), L = await league().catch(() => null);
  if (!box || !L) return;
  const gws = S.history.current.slice(-HITS_N).map((h) => h.event);
  const lives = new Map(await Promise.all(gws.map(async (gw) => [gw, await live(gw)])));
  const rows = await Promise.all(L.standings.results.slice(0, 20).map(async (r) => {
    const per = await Promise.all(gws.map(async (gw) => {
      try {
        const p = await picksOf(r.entry, gw), t = teamOf(p), lv = lives.get(gw), pts = (id) => lv.get(id)?.total_points || 0, mins = (id) => lv.get(id)?.minutes || 0;
        const capId = mins(t.captain) || !t.vice || !mins(t.vice) ? t.captain : t.vice;
        return { gw, cap: pts(capId), best: Math.max(...t.xi.map(pts)), mult: p.active_chip === '3xc' ? 3 : 2 };
      } catch { return null; }
    }));
    return { r, st: captainStats(per.filter(Boolean)) };
  }));
  rows.sort((a, b) => b.st.hits - a.st.hits || b.st.total - a.st.total);
  if (!document.body.contains(box)) return;
  box.innerHTML = rows.map(({ r, st }, i) => `<div class="li${r.entry === S.id ? ' hl' : ''}"><span class="k">${i + 1}.</span><span><b>${esc(r.entry_name)}</b><br><span class="sub">${st.total} bodova od kapitena, najbolji izbor ${st.best}×</span></span><span class="hitdots" aria-label="${st.hits} pogodaka od ${st.n}">${'<i class="on"></i>'.repeat(st.hits)}${'<i></i>'.repeat(Math.max(0, st.n - st.hits))}<b>${st.hits}/${st.n}</b></span></div>`).join('');
}

export function bind(rerender) {
  leagueHits().catch(() => { const b = document.getElementById('lg-hits'); if (b) b.innerHTML = '<p class="muted">Pogoci trenutno nisu dostupni.</p>'; });
  const sel = document.getElementById('lg-sel');
  if (sel) sel.onchange = () => { setLeague(+sel.value); rerender(); };
}
