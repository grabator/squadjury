// Liga: tabela, kapitenski duel kola i najbolji ovog kola.
import { S, league, picksOf, teamOf, live } from '../state.js';
import { int } from '../model.js';
import { esc } from '../ui.js';

export const prefetch = () => { league().then((L) => { for (const r of (L?.standings?.results || []).slice(0, 20)) picksOf(r.entry, S.lastGw).catch(() => {}); }).catch(() => {}); live(S.lastGw).catch(() => {}); };
export const title = 'Liga';

export async function render() {
  const { ix } = S;
  const L = await league().catch(() => null);
  if (!L) return `<div class="head"><h1>Liga</h1></div><section class="g card"><p class="muted">Ovaj tim nije ni u jednoj klasičnoj mini ligi.</p></section>`;
  const rows = L.standings.results, gw = S.lastGw;
  const lv = await live(gw);
  const caps = await Promise.all(rows.slice(0, 20).map(async (r) => {
    try { const t = teamOf(await picksOf(r.entry, gw)); const e = ix.players.get(t.captain); return { r, e, pts: (lv.get(t.captain)?.total_points || 0) * 2 }; } catch { return { r, e: null, pts: 0 }; }
  }));
  caps.sort((a, b) => b.pts - a.pts);
  const bestGw = rows.slice().sort((a, b) => b.event_total - a.event_total)[0];
  const mover = rows.slice().sort((a, b) => (b.last_rank - b.rank) - (a.last_rank - a.rank))[0];
  return `<div class="head"><div><h1>${esc(L.league.name)}</h1><p class="sub">Klasična tabela, ukupni bodovi poslije kola ${gw}</p></div></div>
    <div class="grid2">
      <section class="g card"><h2 class="ct">Tabela</h2><table class="tbl" style="margin-top:6px"><thead><tr><th scope="col">#</th><th scope="col">Tim</th><th scope="col">Kolo</th><th scope="col">Ukupno</th></tr></thead><tbody>${rows.map((r) => `<tr${r.entry === S.id ? ' class="me"' : ''}><td>${r.rank} ${r.last_rank > r.rank ? '<span class="chg up" aria-label="gore">▲</span>' : r.last_rank < r.rank ? '<span class="chg dn" aria-label="dole">▼</span>' : ''}</td><td>${esc(r.entry_name)}<br><span class="sub">${esc(r.player_name)}</span></td><td class="num">${r.event_total}</td><td class="num">${int(r.total)}</td></tr>`).join('')}</tbody></table></section>
      <div class="stack">
        <section class="g card"><h2 class="ct">Kapitenski duel, kolo ${gw}</h2><p class="sub">Ko je izabrao najboljeg kapitena (bodovi su već duplirani)</p><div class="list" style="margin-top:10px">${caps.map((c, i) => `<div class="li${c.r.entry === S.id ? ' hl' : ''}"><span class="k">${i + 1}.</span><span><b>${esc(c.r.entry_name)}</b><br><span class="sub">${c.e ? esc(c.e.web_name) : '–'}</span></span><b class="cond" style="font-size:24px">${c.pts}</b></div>`).join('')}</div></section>
        <section class="g card"><h2 class="ct">Kolo ${gw} u ligi</h2><div class="list" style="margin-top:10px">
          <div class="li"><span class="k">Najviše</span><b>${esc(bestGw.entry_name)}</b><span class="chg up">${bestGw.event_total} bod.</span></div>
          ${mover && mover.last_rank > mover.rank ? `<div class="li"><span class="k">Skok</span><b>${esc(mover.entry_name)}</b><span class="chg up">${mover.last_rank}. → ${mover.rank}.</span></div>` : ''}
        </div></section>
      </div>
    </div>`;
}
