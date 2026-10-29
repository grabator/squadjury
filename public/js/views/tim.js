// Moj tim: planer kroz 3 kola. Za svako kolo transferi (besplatni i minus 4), čip, postava i kapiten,
// sa predviđenim bodovima. Plan se čuva u pregledniku; u FPL-u ga korisnik potvrđuje sam.
import { S, live } from '../state.js';
import { xp, bestXI, fmt, price, POS_BS, freeTransfers } from '../model.js';
import { esc, fdrChip, ic, pitchCard, shirt } from '../ui.js';
import { tr } from '../i18n.js';

export const title = tr('Moj tim', 'My team');
const N = 3;
let gwSel = null, sel = null, pick = null, focusId = null, note = '';

const store = { get: (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* */ } }, del: (k) => { try { localStorage.removeItem(k); } catch { /* */ } } };
const key = () => `fm-plan2-${S.id}-${S.ix.nextGw}`;
const load = () => { const p = store.get(key()); return p && p.gws ? p : { gws: {} }; };
const save = (p) => store.set(key(), p);
const rec = (P, gw) => (P.gws[gw] ||= {});
const gwList = () => { const out = []; for (let g = S.ix.nextGw; g < S.ix.nextGw + N && g <= S.ix.lastGw; g++) out.push(g); return out; };
const fromFpl = () => ({ xi: [...S.xi], bench: [...S.bench], captain: S.captain, vice: S.vice });
const cost = (id) => S.ix.players.get(id).now_cost;
const idsOf = (t) => [...t.xi, ...t.bench];
const sameSet = (a, b) => a.length === b.length && a.every((x) => b.includes(x));
const swapId = (t, o, i) => ({ xi: t.xi.map((x) => (x === o ? i : x)), bench: t.bench.map((x) => (x === o ? i : x)), captain: t.captain === o ? i : t.captain, vice: t.vice === o ? i : t.vice });
const ptsOf = (t, gw) => t.xi.reduce((s, id) => s + xp(S.ix, S.ix.players.get(id), gw, 1) * (id === t.captain ? 2 : 1), 0);

/**
 * Plan kroz kola. Svako kolo kreće od tima prethodnog (Free Hit se poslije vraća), primijeni transfere,
 * pa uzme sačuvanu postavu ako odgovara igračima. Besplatni transferi: +1 svako kolo, najviše 5;
 * Wildcard i Free Hit ih ne troše. Svaki transfer preko besplatnih je −4.
 */
function simulate(P) {
  const { ix } = S;
  let base = fromFpl(), bank = S.bank, ft = freeTransfers(S.history);
  const out = [];
  for (const gw of gwList()) {
    const g = P.gws[gw] || {};
    let team = base, b = bank;
    const trs = [];
    for (const [o, i] of g.tr || []) {
      const ids = idsOf(team);
      if (!ids.includes(o) || ids.includes(i) || !ix.players.get(i)) continue; // transfer više ne važi (promjena u ranijem kolu)
      team = swapId(team, o, i); b += cost(o) - cost(i); trs.push([o, i]);
    }
    if (g.lineup && sameSet(idsOf(g.lineup), idsOf(team))) team = g.lineup;
    const chip = g.chip || null, free = chip === 'wildcard' || chip === 'freehit';
    const hits = free ? 0 : Math.max(0, trs.length - ft) * 4;
    const clubs = {};
    for (const id of idsOf(team)) { const t = ix.players.get(id).team; clubs[t] = (clubs[t] || 0) + 1; }
    const over = Object.entries(clubs).filter(([, n]) => n > 3).map(([t]) => ix.teams.get(+t).name);
    const gross = ptsOf(team, gw);
    out.push({ gw, team, bank: b, ft, used: trs.length, hits, chip, gross, net: gross - hits, trs, over });
    if (chip !== 'freehit') { base = team; bank = b; }
    ft = free ? Math.min(5, ft + 1) : Math.min(5, Math.max(0, ft - trs.length) + 1);
  }
  return out;
}

/** Dodaj transfer u kolo. Ako je igrač kupljen pa prodan u istom kolu, to je jedan transfer. Kasnije postave dobiju novog igrača. */
function addTransfer(P, gw, o, i) {
  const g = rec(P, gw), list = (g.tr ||= []);
  const k = list.findIndex(([, x]) => x === o);
  if (k >= 0) { const first = list[k][0]; if (first === i) list.splice(k, 1); else list[k] = [first, i]; }
  else list.push([o, i]);
  if (g.lineup) g.lineup = swapId(g.lineup, o, i);
  if (g.chip === 'freehit') return;
  for (const later of gwList().filter((x) => x > gw)) {
    const l = P.gws[later];
    if (l?.lineup && idsOf(l.lineup).includes(o) && !idsOf(l.lineup).includes(i)) l.lineup = swapId(l.lineup, o, i);
  }
}
function undoTransfer(P, gw, k) {
  const g = rec(P, gw), [o, i] = g.tr[k];
  g.tr.splice(k, 1);
  for (const x of gwList().filter((y) => y >= gw)) {
    const l = P.gws[x];
    if (l?.lineup && idsOf(l.lineup).includes(i) && !idsOf(l.lineup).includes(o)) l.lineup = swapId(l.lineup, i, o);
  }
}

/** Kandidati za kupovinu umjesto igrača out u kolu r: ista pozicija, u budžetu, najviše 3 iz kluba. */
function candidates(r, out) {
  const { ix } = S, ids = idsOf(r.team), e0 = ix.players.get(out);
  const budget = r.bank + e0.now_cost, n = gwList().at(-1) - r.gw + 1;
  const clubs = {};
  for (const id of ids) if (id !== out) { const t = ix.players.get(id).team; clubs[t] = (clubs[t] || 0) + 1; }
  const base = xp(ix, e0, r.gw, n);
  return [...ix.players.values()].filter((e) => e.element_type === e0.element_type && !ids.includes(e.id) && e.status !== 'u' && e.now_cost <= budget && (clubs[e.team] || 0) < 3)
    .map((e) => ({ e, v: xp(ix, e, r.gw, n), gain: xp(ix, e, r.gw, n) - base })).sort((a, b) => b.v - a.v);
}
/** Najbolji pojedinačni transferi za kolo r (do kraja plana). */
function ideas(r) {
  const res = [];
  for (const o of idsOf(r.team)) { const c = candidates(r, o)[0]; if (c && c.gain > 0.8) res.push({ o, ...c }); }
  const seen = new Set();
  return res.sort((a, b) => b.gain - a.gain).filter((x) => !seen.has(x.e.id) && seen.add(x.e.id)).slice(0, 3);
}

/** FPL pravila za prvih 11: 1 golman, bar 3 odbrambena, 2 vezna i 1 napadač. */
function valid(ix, xi) {
  const n = [0, 0, 0, 0, 0];
  for (const id of xi) n[ix.players.get(id).element_type]++;
  if (n[1] !== 1) return tr('U postavi mora biti tačno jedan golman.', 'The lineup needs exactly one goalkeeper.');
  if (n[2] < 3) return tr('Treba bar 3 odbrambena igrača.', 'You need at least 3 defenders.');
  if (n[3] < 2) return tr('Treba bar 2 vezna igrača.', 'You need at least 2 midfielders.');
  if (n[4] < 1) return tr('Treba bar 1 napadač.', 'You need at least 1 forward.');
  return '';
}
const formation = (ix, xi) => [2, 3, 4].map((t) => xi.filter((id) => ix.players.get(id).element_type === t).length).join('-');
const m = (v) => '£' + fmt(v / 10) + 'm';
const signed = (v) => (v >= 0 ? '+' : '−') + fmt(Math.abs(v));

const card = (ix, e, { cap, vice, val, gw, bench, fresh }) => pitchCard(ix, e, { cap, vice, bench, attr: 'data-sel', pressed: sel === e.id, info: `${fdrChip(ix, e, gw)}<span class="xpv">${val}</span>`, extra: fresh ? `<span class="tin" aria-hidden="true">${tr('NOVI', 'NEW')}</span><span class="sr">, ${tr('novi igrač', 'new signing')}</span>` : '' });

const CHIPS = [['wildcard', 'Wildcard', tr('Neograničeni transferi u kolu bez minus bodova', 'Unlimited transfers in a gameweek with no hits')], ['freehit', 'Free Hit', tr('Tim samo za jedno kolo, pa se vraća stari', 'A team for one gameweek, then your old one returns')], ['bboost', 'Bench Boost', tr('Bodovi igrača sa klupe se računaju', 'Your bench players\' points count')], ['3xc', 'Triple Captain', tr('Kapiten donosi trostruke bodove', 'Your captain scores triple points')]];
const chipsCard = () => {
  const used = S.history.chips || [];
  return `<section class="g card"><h2 class="ct">${tr('Čipovi', 'Chips')}</h2><div class="chips4">${CHIPS.map(([k, t, d]) => { const u = used.filter((c) => c.name === k); return `<div class="chipc${u.length ? ' used' : ''}"><b>${t}</b><span class="sub">${d}</span><span class="chg ${u.length ? 'nt' : 'up'}">${u.length ? tr('Iskorišten, kolo ', 'Used, gameweek ') + u.map((c) => c.event).join(tr(' i ', ' and ')) : tr('Nije korišten', 'Not used')}</span></div>`; }).join('')}</div><p class="sub" style="margin-top:10px">${tr('Koliko čipova ima u sezoni i kada se mogu koristiti provjeri u pravilima FPL-a za ovu sezonu.', 'Check this season\'s FPL rules for how many chips there are and when you can use them.')}</p></section>`;
};

export async function render() {
  const { ix } = S;
  const P = load(), list = gwList();
  if (!list.includes(gwSel)) gwSel = list[0];
  const sim = simulate(P), base = simulate({ gws: {} });
  const r = sim.find((x) => x.gw === gwSel), gw = r.gw, T = r.team, g = P.gws[gw] || {};
  const squad = idsOf(T).map((id) => ix.players.get(id));
  const score = (e) => xp(ix, e, gw, 1);
  const opt = bestXI(squad, score);
  const best = ptsOf({ xi: opt.xi.map((e) => e.id), captain: opt.captain.id }, gw);
  const ins = new Set(sim.filter((x) => x.gw <= gw && x.gw >= list[0]).flatMap((x) => x.trs.map(([, i]) => i)));
  const se = sel && ix.players.get(sel), selXI = sel && T.xi.includes(sel);
  const usedChips = (S.history.chips || []);
  const chipNote = (k) => { const u = usedChips.filter((c) => c.name === k); return u.length ? tr(` (već iskorišten u kolu ${u.map((c) => c.event).join(', ')})`, ` (already used in GW ${u.map((c) => c.event).join(', ')})`) : ''; };

  let past = '';
  // prošlo kolo: koliko je bilo moguće sa istih 15 igrača
  try {
    const lv = await live(S.lastGw);
    const pts = (e) => lv.get(e.id)?.total_points || 0;
    const real = S.xi.reduce((s, id) => s + pts(ix.players.get(id)) * (id === S.captain ? 2 : 1), 0);
    const ideal = bestXI(S.ids.map((id) => ix.players.get(id)), pts);
    past = `<section class="g card"><h2 class="ct">${tr(`Kolo ${S.lastGw} unazad`, `Gameweek ${S.lastGw} in hindsight`)}</h2><p class="muted" style="margin-top:6px">${tr(`Sa istih 15 igrača najbolja moguća postava i kapiten (${esc(ideal.captain.web_name)}) donijeli bi <b>${ideal.total}</b> bodova. Tvoja postava je donijela <b>${real}</b>${ideal.total > real ? `, pa je na stolu ostalo <b>${ideal.total - real}</b>` : ', što je maksimum'}.`, `With the same 15 players the best possible lineup and captain (${esc(ideal.captain.web_name)}) would have scored <b>${ideal.total}</b> points. Your lineup scored <b>${real}</b>${ideal.total > real ? `, so <b>${ideal.total - real}</b> were left on the table` : ', which is the maximum'}.`)}</p><div class="meter green"><i style="width:${Math.round(real / Math.max(1, ideal.total) * 100)}%"></i></div></section>`;
  } catch { /* bez podataka za prošlo kolo */ }

  const rows = [1, 2, 3, 4].map((pos) => `<div class="line-row">${T.xi.map((id) => ix.players.get(id)).filter((e) => e.element_type === pos).map((e) => card(ix, e, { cap: e.id === T.captain, vice: e.id === T.vice, val: fmt(score(e)), gw, fresh: ins.has(e.id) })).join('')}</div>`).join('');
  const benchRow = T.bench.map((id) => ix.players.get(id)).map((e, i) => `<div class="bslot"><span class="sub">${i ? i + '.' : tr('GOL', 'GK')}</span>${card(ix, e, { val: fmt(score(e)), gw, bench: true, fresh: ins.has(e.id) })}</div>`).join('');
  const bar = se ? `<div class="planbar g" role="region" aria-label="${tr('Izabrani igrač', 'Selected player')}"><span><b>${esc(se.web_name)}</b> <span class="sub">${POS_BS[se.element_type]}, £${price(se)}m${selXI ? '' : tr(', klupa', ', bench')}</span></span><span class="acts"><button type="button" class="btn sm" data-act="sell">${ic('swap')}${tr('Prodaj', 'Sell')}</button>${selXI ? `<button type="button" class="btn sm ghost" data-act="cap"${T.captain === sel ? ' disabled' : ''}>${tr('Kapiten', 'Captain')}</button><button type="button" class="btn sm ghost" data-act="vice"${T.vice === sel ? ' disabled' : ''}>Vice</button>` : ''}<button type="button" class="btn sm ghost" data-pid="${sel}">${tr('Detalji', 'Details')}</button><button type="button" class="icon-btn" data-act="x" aria-label="${tr('Poništi izbor', 'Clear selection')}">${ic('close')}</button></span><p class="sub" style="grid-column:1/-1">${selXI ? tr('Klikni igrača na klupi da ga ubaciš u postavu, ili Prodaj za transfer.', 'Click a bench player to swap them in, or Sell to make a transfer.') : tr('Klikni igrača u postavi da ga zamijeniš, ili Prodaj za transfer.', 'Click a lineup player to swap them, or Sell to make a transfer.')}</p></div>`
    : `<p class="sub planhint">${tr('Klikni igrača: zamjena sa klupom, kapiten ili Prodaj za transfer. Plan se čuva u ovom pregledniku, a u FPL-u ga potvrđuješ sam.', 'Click a player: swap with the bench, captain, or Sell for a transfer. The plan is saved in this browser, you confirm it on FPL yourself.')}</p>`;

  // kupovina: lista se crta u bind (pretraga bez ponovnog crtanja cijele stranice)
  const pe = pick && ix.players.get(pick);
  const picker = pe ? `<section class="g card buy" id="buy" aria-labelledby="h-buy"><div class="ch"><div><h2 id="h-buy" class="ct">${tr('Zamjena za', 'Replace')} ${esc(pe.web_name)}</h2><p class="sub">${tr(`Budžet ${m(r.bank + pe.now_cost)} (banka ${m(r.bank)} + prodaja ${m(pe.now_cost)}). Poredano po predviđenim bodovima do kola ${list.at(-1)}.`, `Budget ${m(r.bank + pe.now_cost)} (bank ${m(r.bank)} + sale ${m(pe.now_cost)}). Sorted by predicted points to gameweek ${list.at(-1)}.`)}</p></div><button type="button" class="icon-btn" data-act="nopick" aria-label="${tr('Odustani', 'Cancel')}">${ic('close')}</button></div>
      <label class="field"><span class="sr">${tr('Traži igrača', 'Search player')}</span><input id="buy-q" type="search" placeholder="${tr('Ime ili klub', 'Name or club')}" autocomplete="off"></label>
      <div class="list buy-list" id="buy-list" style="margin-top:10px"></div></section>` : '';

  const tabs = `<div class="gw-tabs" role="tablist" aria-label="${tr('Kolo u planu', 'Planned gameweek')}">${sim.map((x) => `<button type="button" role="tab" data-gw="${x.gw}" aria-selected="${x.gw === gw}"><b>${tr('Kolo', 'GW')} ${x.gw}</b><span class="sub">${fmt(x.net)} ${tr('pred.', 'pred.')}</span><span class="gt-tr${x.hits ? ' hit' : ''}">${x.chip ? (x.chip === 'wildcard' ? 'WC' : 'FH') : x.used ? `${x.used} ${tr('tr.', 'tr.')}${x.hits ? ' −' + x.hits : ''}` : tr('bez transfera', 'no transfers')}</span></button>`).join('')}</div>`;

  const trList = r.trs.length ? `<div class="list" style="margin-top:10px">${r.trs.map(([o, i], k) => { const eo = ix.players.get(o), ei = ix.players.get(i); return `<div class="trx plan"><span class="trx-p o"><span class="shirt">${shirt(ix.teams.get(eo.team), eo.element_type === 1)}</span><span class="trx-n"><b>${esc(eo.web_name)}</b><span class="sub">£${price(eo)}m</span></span></span><span class="trx-arrow" aria-hidden="true">→</span><span class="sr">${tr('mijenja se za', 'replaced by')}</span><span class="trx-p i"><span class="shirt">${shirt(ix.teams.get(ei.team), ei.element_type === 1)}</span><span class="trx-n"><b>${esc(ei.web_name)}</b><span class="sub">£${price(ei)}m</span></span></span><button type="button" class="icon-btn" data-undo="${(g.tr || []).findIndex(([a, b]) => a === o && b === i)}" aria-label="${tr('Poništi transfer', 'Undo transfer')} ${esc(eo.web_name)} → ${esc(ei.web_name)}">${ic('close')}</button></div>`; }).join('')}</div>` : `<p class="muted" style="margin-top:8px">${tr('Još nema transfera u ovom kolu. Izaberi igrača na terenu i klikni Prodaj.', 'No transfers in this gameweek yet. Pick a player on the pitch and click Sell.')}</p>`;
  const id3 = ideas(r);
  const ideaHtml = id3.length ? `<div class="list" style="margin-top:10px">${id3.map((x) => { const eo = ix.players.get(x.o); return `<div class="li idea"><span>${esc(eo.web_name)} → <b>${esc(x.e.web_name)}</b><br><span class="sub">£${price(eo)}m → £${price(x.e)}m</span></span><span class="chg up">+${fmt(x.gain)}</span><button type="button" class="btn sm ghost" data-idea="${x.o}:${x.e.id}">${tr('Dodaj', 'Add')}</button></div>`; }).join('')}</div>` : `<p class="muted" style="margin-top:8px">${tr('Nema transfera koji se jasno isplati do kraja plana.', 'No transfer clearly pays off over the plan.')}</p>`;
  const warn = [r.bank < 0 ? tr(`Banka je u minusu (${m(r.bank)}). Ovaj plan FPL ne bi prihvatio.`, `The bank is negative (${m(r.bank)}). FPL would not accept this plan.`) : '', r.over.length ? tr(`Više od 3 igrača iz kluba: ${r.over.join(', ')}.`, `More than 3 players from: ${r.over.join(', ')}.`) : ''].filter(Boolean);

  const totNet = sim.reduce((s, x) => s + x.net, 0), totBase = base.reduce((s, x) => s + x.net, 0);
  const summary = `<section class="g card" aria-labelledby="h-sum"><h2 id="h-sum" class="ct">${tr(`Plan za ${sim.length} kola`, `Plan for ${sim.length} gameweeks`)}</h2>
    <div class="scroll-x" tabindex="0" style="margin-top:8px"><table class="tbl plan-sum"><thead><tr><th scope="col">${tr('Kolo', 'GW')}</th><th scope="col"><abbr title="${tr('Transferi / besplatni', 'Transfers / free')}">${tr('Tr.', 'Tr.')}</abbr></th><th scope="col">${tr('Minus', 'Hits')}</th><th scope="col">${tr('Banka', 'Bank')}</th><th scope="col"><abbr title="${tr('Predviđeno, minus već oduzet', 'Predicted, hits taken off')}">${tr('Pred.', 'Pred.')}</abbr></th><th scope="col"><abbr title="${tr('Predviđeno bez ijednog transfera', 'Predicted with no transfers')}">${tr('Bez tr.', 'No tr.')}</abbr></th></tr></thead>
    <tbody>${sim.map((x, k) => `<tr${x.gw === gw ? ' class="me"' : ''}><td>${x.gw}${x.chip ? ` <span class="chg vi">${x.chip === 'wildcard' ? 'WC' : 'FH'}</span>` : ''}</td><td class="num">${x.used}/${x.chip ? '∞' : x.ft}</td><td class="num">${x.hits ? '−' + x.hits : '0'}</td><td class="num">${m(x.bank)}</td><td class="num"><b>${fmt(x.net)}</b></td><td class="num">${fmt(base[k].net)}</td></tr>`).join('')}
    <tr><td><b>${tr('Ukupno', 'Total')}</b></td><td class="num">${sim.reduce((s, x) => s + x.used, 0)}</td><td class="num">${sim.reduce((s, x) => s + x.hits, 0) ? '−' + sim.reduce((s, x) => s + x.hits, 0) : '0'}</td><td></td><td class="num"><b>${fmt(totNet)}</b></td><td class="num">${fmt(totBase)}</td></tr></tbody></table></div>
    <p style="margin-top:10px"><span class="chg ${totNet - totBase >= 0 ? 'up' : 'dn'}">${signed(totNet - totBase)} ${tr('u odnosu na tim bez promjena', 'vs keeping the team as it is')}</span></p>
    <p class="sub" style="margin-top:8px">${tr('Minus bodovi su već oduzeti. Prodajna cijena u FPL-u može biti malo niža od trenutne, a ovdje računamo trenutnu.', 'Hits are already taken off. The FPL selling price can be a bit lower than the current price, here we use the current one.')}</p>
    <p style="margin-top:10px"><button type="button" class="btn sm ghost" data-act="wipe"${Object.keys(P.gws).length ? '' : ' disabled'}>${tr('Obriši cijeli plan', 'Clear the whole plan')}</button></p></section>`;

  return `<div class="head"><div><h1>${tr('Moj tim', 'My team')}</h1><p class="sub">${tr(`Planer za ${sim.length} kola: transferi, minus 4, čipovi, postava i kapiten za svako kolo`, `Planner for ${sim.length} gameweeks: transfers, hits, chips, lineup and captain for each gameweek`)}</p></div></div>
    ${tabs}
    <div class="grid2 mt">
      <div class="stack">
        <div class="plan-top g">
          <div><p class="sub">${tr('Predviđeno', 'Predicted')}</p><p class="big" id="plan-total">${fmt(r.net)}</p>${r.hits ? `<p class="sub">${fmt(r.gross)} − ${r.hits}</p>` : ''}</div>
          <div><p class="sub">${tr('Besplatni transferi', 'Free transfers')}</p><p class="cond" style="font-size:28px">${r.chip ? '∞' : r.ft}</p><p class="sub">${tr('iskorišteno', 'used')} ${r.used}</p></div>
          <div><p class="sub">${tr('Banka', 'Bank')}</p><p class="cond" style="font-size:28px;color:${r.bank < 0 ? '#ff6aa6' : 'var(--t)'}">${m(r.bank)}</p></div>
          <div class="acts"><button type="button" class="btn sm" data-act="best"${Math.abs(best - r.gross) < 0.05 ? ' disabled' : ''}>${tr('Najbolja postava', 'Best lineup')} (${opt.formation})</button><button type="button" class="btn sm ghost" data-act="reset"${g.lineup ? '' : ' disabled'}>${tr('Vrati postavu', 'Reset lineup')}</button></div>
        </div>
        <div class="chip-pick"><span class="sub">${tr('Čip u kolu', 'Chip this GW')} ${gw}</span><div class="seg" role="group" aria-label="${tr('Čip', 'Chip')}">${[['', tr('Bez čipa', 'None')], ['wildcard', 'Wildcard'], ['freehit', 'Free Hit']].map(([k, t]) => `<button type="button" data-chip="${k}" aria-pressed="${(r.chip || '') === k}">${t}</button>`).join('')}</div>${r.chip ? `<span class="sub">${r.chip === 'wildcard' ? tr('Transferi bez minus bodova, tim ostaje.', 'Transfers with no hits, the team stays.') : tr('Transferi bez minus bodova samo za ovo kolo, poslije se vraća stari tim.', 'Transfers with no hits for this gameweek only, then the old team returns.')}${chipNote(r.chip)}</span>` : ''}</div>
        ${r.used > r.ft && !r.chip ? `<p class="alert"><span class="dot" aria-hidden="true"></span><span>${tr(`${r.used} transfera, a besplatnih je ${r.ft}: to je −${r.hits} bodova.`, `${r.used} transfers with ${r.ft} free: that is −${r.hits} points.`)}</span></p>` : ''}
        ${warn.map((w) => `<p class="alert"><span class="dot" aria-hidden="true"></span><span>${w}</span></p>`).join('')}
        <p class="err" id="plan-err" role="alert">${esc(note)}</p>
        <section class="pitch" aria-label="${tr('Postava za kolo', 'Lineup for gameweek')} ${gw}"><div class="field">${rows}</div><div class="bench" aria-label="${tr('Klupa', 'Bench')}">${benchRow}</div></section>
        ${bar}
        ${picker}
      </div>
      <div class="stack">
        <section class="g card" aria-labelledby="h-trs"><div class="ch"><h2 id="h-trs" class="ct">${tr('Transferi u kolu', 'Transfers in gameweek')} ${gw}</h2>${r.used ? `<span class="chg ${r.hits ? 'dn' : 'up'}">${r.hits ? '−' + r.hits : tr('besplatno', 'free')}</span>` : ''}</div>${trList}</section>
        <section class="g card"><h2 class="ct">${tr('Prijedlozi', 'Suggestions')}</h2><p class="sub">${tr(`Najbolji pojedinačni transferi za kola ${gw} do ${list.at(-1)}`, `Best single transfers for gameweeks ${gw} to ${list.at(-1)}`)}</p>${ideaHtml}</section>
        ${summary}
        <section class="g card"><h2 class="ct">${tr('Predložena postava', 'Suggested lineup')}</h2><p class="muted" style="margin-top:6px">${best - r.gross > 0.05 ? tr(`Po procjeni je najbolja formacija ${opt.formation} sa kapitenom <b>${esc(opt.captain.web_name)}</b>, oko ${fmt(best - r.gross)} bodova više od tvog plana.`, `The model's best is ${opt.formation} with <b>${esc(opt.captain.web_name)}</b> as captain, about ${fmt(best - r.gross)} points more than your plan.`) : tr('Tvoja postava je već najbolja po procjeni.', 'Your lineup is already the best by the model.')}</p></section>
        ${past}
        ${chipsCard()}
        <section class="g card"><h2 class="ct">${tr('Kako čitati', 'How to read')}</h2><p class="legend" style="margin-top:8px"><span><span class="fdr d2">${tr('lako', 'easy')}</span></span><span><span class="fdr d3">${tr('srednje', 'medium')}</span></span><span><span class="fdr d4">${tr('teško', 'hard')}</span></span><span><span class="fdr d5">${tr('vrlo teško', 'very hard')}</span></span></p><p class="sub" style="margin-top:8px">${tr(`(D) znači da tim igra kod kuće, (G) u gostima. Broj desno su predviđeni bodovi za kolo ${gw}. Uzvičnik je upitan igrač: žut 75%, narandžast 50%, tamnonarandžast 25%, crven ne igra. C je kapiten, V vice kapiten.`, `(H) means the team plays at home, (A) away. The number on the right is predicted points for gameweek ${gw}. The exclamation mark is a doubtful player: yellow 75%, orange 50%, dark orange 25%, red is out. C is captain, V vice captain.`)}</p></section>
      </div>
    </div>`;
}

function drawBuy() {
  const box = document.getElementById('buy-list');
  if (!box || !pick) return;
  const { ix } = S, r = simulate(load()).find((x) => x.gw === gwSel), qv = (document.getElementById('buy-q')?.value || '').trim().toLowerCase();
  const list = candidates(r, pick).filter(({ e }) => !qv || e.web_name.toLowerCase().includes(qv) || ix.teams.get(e.team).name.toLowerCase().includes(qv) || ix.teams.get(e.team).short_name.toLowerCase() === qv).slice(0, 25);
  box.innerHTML = list.length ? list.map(({ e, v, gain }) => `<button type="button" class="li buy-row" data-buy="${e.id}"><span class="shirt">${shirt(ix.teams.get(e.team), e.element_type === 1)}</span><span><b>${esc(e.web_name)}</b> <span class="sub">${esc(ix.teams.get(e.team).short_name)} · £${price(e)}m</span><br><span class="fx3">${[0, 1, 2].map((k) => fdrChip(ix, e, gwSel + k)).join('')}</span></span><span class="buy-v"><b>${fmt(v)}</b><span class="chg ${gain >= 0 ? 'up' : 'dn'}">${signed(gain)}</span></span></button>`).join('')
    : `<p class="muted">${tr('Nema igrača za ovaj budžet i filter.', 'No players for this budget and filter.')}</p>`;
}

export function bind(rerender) {
  const { ix } = S;
  const redraw = (id) => { focusId = id; rerender(true); };
  const P = () => load();
  document.querySelectorAll('[data-gw]').forEach((b) => { b.onclick = () => { gwSel = +b.dataset.gw; sel = null; pick = null; note = ''; redraw(null); }; });
  document.querySelectorAll('[data-chip]').forEach((b) => { b.onclick = () => { const p = P(); rec(p, gwSel).chip = b.dataset.chip || null; save(p); redraw(null); }; });
  document.querySelectorAll('[data-undo]').forEach((b) => { b.onclick = () => { const p = P(); undoTransfer(p, gwSel, +b.dataset.undo); save(p); redraw(null); }; });
  document.querySelectorAll('[data-idea]').forEach((b) => { b.onclick = () => { const [o, i] = b.dataset.idea.split(':').map(Number); const p = P(); addTransfer(p, gwSel, o, i); save(p); sel = null; redraw(i); }; });
  document.querySelectorAll('[data-sel]').forEach((b) => {
    b.onclick = () => {
      const id = +b.dataset.sel, p = P(), T = simulate(p).find((x) => x.gw === gwSel).team;
      const L = { xi: [...T.xi], bench: [...T.bench], captain: T.captain, vice: T.vice };
      note = ''; pick = null;
      if (!sel || sel === id) { sel = sel === id ? null : id; return redraw(id); }
      const aXI = L.xi.includes(sel), bXI = L.xi.includes(id);
      if (aXI === bXI) {
        if (aXI) { sel = id; return redraw(id); }
        // dvije klupe: zamijeni redoslijed (golman ostaje prvi)
        const i = L.bench.indexOf(sel), j = L.bench.indexOf(id);
        if (!i || !j) { note = tr('Golman na klupi uvijek ostaje prvi.', 'The bench goalkeeper always stays first.'); sel = null; return redraw(id); }
        [L.bench[i], L.bench[j]] = [L.bench[j], L.bench[i]];
      } else {
        const [inXI, onB] = aXI ? [sel, id] : [id, sel];
        const xi = L.xi.map((x) => (x === inXI ? onB : x));
        const err = valid(ix, xi);
        if (err) { note = err; sel = null; return redraw(id); }
        L.bench = L.bench.map((x) => (x === onB ? inXI : x));
        L.xi = xi;
        if (L.captain === inXI) L.captain = L.vice !== inXI ? L.vice : onB;
        if (L.vice === inXI || L.vice === L.captain) L.vice = L.xi.filter((x) => x !== L.captain).sort((x, y) => xp(ix, ix.players.get(y), gwSel, 1) - xp(ix, ix.players.get(x), gwSel, 1))[0];
      }
      rec(p, gwSel).lineup = L; save(p); sel = null; redraw(id);
    };
  });
  document.querySelectorAll('[data-act]').forEach((b) => {
    b.onclick = () => {
      const p = P(), a = b.dataset.act, T = simulate(p).find((x) => x.gw === gwSel).team, g = rec(p, gwSel);
      note = '';
      if (a === 'sell') { pick = sel; sel = null; focusId = null; rerender(true); return; }
      if (a === 'nopick') { pick = null; return redraw(null); }
      if (a === 'cap') { const L = { ...T }; if (L.vice === sel) L.vice = L.captain; L.captain = sel; g.lineup = L; save(p); }
      if (a === 'vice') { const L = { ...T }; if (L.captain === sel) L.captain = L.vice; L.vice = sel; g.lineup = L; save(p); }
      if (a === 'reset') { delete g.lineup; save(p); }
      if (a === 'wipe') { store.del(key()); pick = null; }
      if (a === 'best') {
        const opt = bestXI(idsOf(T).map((id) => ix.players.get(id)), (e) => xp(ix, e, gwSel, 1));
        const xi = opt.xi.map((e) => e.id), rest = idsOf(T).filter((id) => !xi.includes(id));
        const gk = rest.find((id) => ix.players.get(id).element_type === 1);
        const bench = [gk, ...rest.filter((id) => id !== gk).sort((x, y) => xp(ix, ix.players.get(y), gwSel, 1) - xp(ix, ix.players.get(x), gwSel, 1))];
        const vice = opt.xi.filter((e) => e.id !== opt.captain.id).sort((x, y) => xp(ix, y, gwSel, 1) - xp(ix, x, gwSel, 1))[0].id;
        g.lineup = { xi, bench, captain: opt.captain.id, vice }; save(p);
      }
      const keep = a === 'cap' || a === 'vice' ? sel : null;
      if (a !== 'cap' && a !== 'vice') sel = null;
      redraw(keep);
    };
  });
  const buy = document.getElementById('buy');
  if (buy) {
    drawBuy();
    document.getElementById('buy-q').oninput = drawBuy;
    document.getElementById('buy-list').onclick = (ev) => {
      const row = ev.target.closest('[data-buy]');
      if (!row) return;
      const p = P(), i = +row.dataset.buy, o = pick;
      addTransfer(p, gwSel, o, i); save(p); pick = null; redraw(i);
    };
    buy.scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    document.getElementById('buy-q').focus({ preventScroll: true });
  }
  if (focusId) { (document.querySelector(`[data-sel="${focusId}"]`) || document.querySelector('[data-act="best"]'))?.focus({ preventScroll: true }); focusId = null; }
}
