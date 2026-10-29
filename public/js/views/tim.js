// Moj tim: planer postave (zamjene sa klupom, kapiten), predložena postava i najbolja moguća postava prošlog kola.
import { S, live } from '../state.js';
import { xp, bestXI, fmt, POS_BS } from '../model.js';
import { esc, fdrChip, ic, pitchCard } from '../ui.js';

export const title = 'Moj tim';
let sel = null, focusId = null, note = '';

const store = { get: (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* */ } }, del: (k) => { try { localStorage.removeItem(k); } catch { /* */ } } };
const key = () => `fm-plan-${S.id}-${S.ix.nextGw}`;
const fromFpl = () => ({ xi: [...S.xi], bench: [...S.bench], captain: S.captain, vice: S.vice });
function plan() {
  const p = store.get(key());
  const all = new Set(S.ids);
  // plan važi samo ako su u njemu isti igrači kao u timu
  if (p && p.xi?.length === 11 && p.bench?.length === 4 && [...p.xi, ...p.bench].every((id) => all.has(id))) return p;
  return fromFpl();
}
const save = (p) => store.set(key(), p);

/** FPL pravila za prvih 11: 1 golman, bar 3 odbrambena, 2 vezna i 1 napadač. */
function valid(ix, xi) {
  const n = [0, 0, 0, 0, 0];
  for (const id of xi) n[ix.players.get(id).element_type]++;
  if (n[1] !== 1) return 'U postavi mora biti tačno jedan golman.';
  if (n[2] < 3) return 'Treba bar 3 odbrambena igrača.';
  if (n[3] < 2) return 'Treba bar 2 vezna igrača.';
  if (n[4] < 1) return 'Treba bar 1 napadač.';
  return '';
}
const formation = (ix, xi) => [2, 3, 4].map((t) => xi.filter((id) => ix.players.get(id).element_type === t).length).join('-');

const card = (ix, e, { cap, vice, val, gw, bench }) => pitchCard(ix, e, { cap, vice, bench, attr: 'data-sel', pressed: sel === e.id, info: `${fdrChip(ix, e, gw)}<span class="xpv">${val}</span>` });


const CHIPS = [['wildcard', 'Wildcard', 'Neograničeni transferi u kolu bez minus bodova'], ['freehit', 'Free Hit', 'Tim samo za jedno kolo, pa se vraća stari'], ['bboost', 'Bench Boost', 'Bodovi igrača sa klupe se računaju'], ['3xc', 'Triple Captain', 'Kapiten donosi trostruke bodove']];
const chipsCard = () => {
  const used = S.history.chips || [];
  return `<section class="g card"><h2 class="ct">Čipovi</h2><div class="chips4">${CHIPS.map(([k, t, d]) => { const u = used.filter((c) => c.name === k); return `<div class="chipc${u.length ? ' used' : ''}"><b>${t}</b><span class="sub">${d}</span><span class="chg ${u.length ? 'nt' : 'up'}">${u.length ? 'Iskorišten, kolo ' + u.map((c) => c.event).join(' i ') : 'Nije korišten'}</span></div>`; }).join('')}</div><p class="sub" style="margin-top:10px">Koliko čipova ima u sezoni i kada se mogu koristiti provjeri u pravilima FPL-a za ovu sezonu.</p></section>`;
};

export async function render() {
  const { ix } = S, gw = ix.nextGw;
  const P = plan();
  const squad = S.ids.map((id) => ix.players.get(id));
  const score = (e) => xp(ix, e);
  const total = (p) => p.xi.reduce((s, id) => s + score(ix.players.get(id)) * (id === p.captain ? 2 : 1), 0);
  const opt = bestXI(squad, score);
  const optP = { xi: opt.xi.map((e) => e.id), captain: opt.captain.id };
  const mine = total(P), orig = total(fromFpl()), best = total(optP);
  const value = S.ids.reduce((s, id) => s + ix.players.get(id).now_cost, 0);
  const changed = JSON.stringify(P) !== JSON.stringify(fromFpl());
  const se = sel && ix.players.get(sel), selXI = sel && P.xi.includes(sel);

  // prošlo kolo: koliko je bilo moguće sa istih 15 igrača
  let past = '';
  try {
    const lv = await live(S.lastGw);
    const pts = (e) => lv.get(e.id)?.total_points || 0;
    const real = S.xi.reduce((s, id) => s + pts(ix.players.get(id)) * (id === S.captain ? 2 : 1), 0);
    const ideal = bestXI(squad, pts);
    past = `<section class="g card"><h2 class="ct">Kolo ${S.lastGw} unazad</h2><p class="muted" style="margin-top:6px">Sa istih 15 igrača najbolja moguća postava i kapiten (${esc(ideal.captain.web_name)}) donijeli bi <b>${ideal.total}</b> bodova. Tvoja postava je donijela <b>${real}</b>${ideal.total > real ? `, pa je na stolu ostalo <b>${ideal.total - real}</b>` : ', što je maksimum'}.</p><div class="meter green"><i style="width:${Math.round(real / Math.max(1, ideal.total) * 100)}%"></i></div></section>`;
  } catch { /* bez podataka za prošlo kolo */ }

  const rows = [1, 2, 3, 4].map((pos) => `<div class="line-row">${P.xi.map((id) => ix.players.get(id)).filter((e) => e.element_type === pos).map((e) => card(ix, e, { cap: e.id === P.captain, vice: e.id === P.vice, val: fmt(score(e)), gw })).join('')}</div>`).join('');
  const benchRow = P.bench.map((id) => ix.players.get(id)).map((e, i) => `<div class="bslot"><span class="sub">${i ? i + '.' : 'GOL'}</span>${card(ix, e, { val: fmt(score(e)), gw, bench: true })}</div>`).join('');
  const bar = se ? `<div class="planbar g" role="region" aria-label="Izabrani igrač"><span><b>${esc(se.web_name)}</b> <span class="sub">${POS_BS[se.element_type]}${selXI ? '' : ', klupa'}</span></span><span class="acts">${selXI ? `<button type="button" class="btn sm" data-act="cap"${P.captain === sel ? ' disabled' : ''}>Kapiten</button><button type="button" class="btn sm ghost" data-act="vice"${P.vice === sel ? ' disabled' : ''}>Vice</button>` : ''}<button type="button" class="btn sm ghost" data-pid="${sel}">Detalji</button><button type="button" class="icon-btn" data-act="x" aria-label="Poništi izbor">${ic('close')}</button></span><p class="sub" style="grid-column:1/-1">${selXI ? 'Klikni igrača na klupi da ga zamijeniš.' : 'Klikni igrača u postavi da ga zamijeniš.'}</p></div>`
    : `<p class="sub planhint">Klikni igrača da ga izabereš, pa drugog da ih zamijeniš. Plan se čuva u ovom pregledniku, a u FPL-u ga moraš potvrditi sam.</p>`;

  return `<div class="head"><div><h1>Moj tim</h1><p class="sub">Planer za kolo ${gw}: zamjene, kapiten i predviđeni bodovi</p></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><span class="chg nt">Tim £${fmt(value / 10)}m, banka £${fmt(S.bank / 10)}m</span></div></div>
    <div class="grid2">
      <div class="stack">
        <div class="plan-top g">
          <div><p class="sub">Predviđeno</p><p class="big" id="plan-total">${fmt(mine)}</p></div>
          <div><p class="sub">Formacija</p><p class="cond" style="font-size:28px">${formation(ix, P.xi)}</p></div>
          <div><p class="sub">Razlika od FPL postave</p><p class="cond" style="font-size:28px;color:${mine - orig >= 0 ? 'var(--green)' : '#ff6aa6'}">${mine - orig >= 0 ? '+' : '−'}${fmt(Math.abs(mine - orig))}</p></div>
          <div class="acts"><button type="button" class="btn sm" data-act="best"${Math.abs(best - mine) < 0.05 ? ' disabled' : ''}>Najbolja postava (${opt.formation})</button><button type="button" class="btn sm ghost" data-act="reset"${changed ? '' : ' disabled'}>Vrati FPL postavu</button></div>
        </div>
        <p class="err" id="plan-err" role="alert">${esc(note)}</p>
        <section class="pitch" aria-label="Postava"><div class="field">${rows}</div><div class="bench" aria-label="Klupa">${benchRow}</div></section>
        ${bar}
      </div>
      <div class="stack">
        <section class="g card"><h2 class="ct">Predložena postava</h2><p class="muted" style="margin-top:6px">${best - mine > 0.05 ? `Po procjeni je najbolja formacija ${opt.formation} sa kapitenom <b>${esc(opt.captain.web_name)}</b>, oko ${fmt(best - mine)} bodova više od tvog plana.` : 'Tvoj plan je već najbolji po procjeni.'}</p></section>
        ${past}
        ${chipsCard()}
        <section class="g card"><h2 class="ct">Kako čitati</h2><p class="legend" style="margin-top:8px"><span><span class="fdr d2">lako</span></span><span><span class="fdr d3">srednje</span></span><span><span class="fdr d4">teško</span></span><span><span class="fdr d5">vrlo teško</span></span></p><p class="sub" style="margin-top:8px">(D) znači da tim igra kod kuće, (G) u gostima. Broj desno su predviđeni bodovi za kolo ${gw}. Uzvičnik je upitan igrač: žut 75%, narandžast 50%, tamnonarandžast 25%, crven ne igra. C je kapiten, V vice kapiten.</p></section>
      </div>
    </div>`;
}

export function bind(rerender) {
  const { ix } = S;
  const redraw = (id) => { focusId = id; rerender(true); };
  document.querySelectorAll('[data-sel]').forEach((b) => {
    b.onclick = () => {
      const id = +b.dataset.sel, P = plan();
      note = '';
      if (!sel || sel === id) { sel = sel === id ? null : id; return redraw(id); }
      const aXI = P.xi.includes(sel), bXI = P.xi.includes(id);
      if (aXI === bXI) {
        if (aXI) { sel = id; return redraw(id); }
        // dvije klupe: zamijeni redoslijed (golman ostaje prvi)
        const i = P.bench.indexOf(sel), j = P.bench.indexOf(id);
        if (!i || !j) { note = 'Golman na klupi uvijek ostaje prvi.'; sel = null; return redraw(id); }
        [P.bench[i], P.bench[j]] = [P.bench[j], P.bench[i]];
      } else {
        const [inXI, onB] = aXI ? [sel, id] : [id, sel];
        const xi = P.xi.map((x) => (x === inXI ? onB : x));
        const err = valid(ix, xi);
        if (err) { note = err; sel = null; return redraw(id); }
        P.bench = P.bench.map((x) => (x === onB ? inXI : x));
        P.xi = xi;
        if (P.captain === inXI) P.captain = P.vice !== inXI ? P.vice : onB;
        if (P.vice === inXI || P.vice === P.captain) P.vice = P.xi.filter((x) => x !== P.captain).sort((x, y) => xp(ix, ix.players.get(y)) - xp(ix, ix.players.get(x)))[0];
      }
      save(P); sel = null; redraw(id);
    };
  });
  document.querySelectorAll('[data-act]').forEach((b) => {
    b.onclick = () => {
      const P = plan(), a = b.dataset.act;
      note = '';
      if (a === 'cap') { if (P.vice === sel) P.vice = P.captain; P.captain = sel; save(P); }
      if (a === 'vice') { if (P.captain === sel) P.captain = P.vice; P.vice = sel; save(P); }
      if (a === 'reset') store.del(key());
      if (a === 'best') {
        const opt = bestXI(S.ids.map((id) => ix.players.get(id)), (e) => xp(ix, e));
        const xi = opt.xi.map((e) => e.id), rest = S.ids.filter((id) => !xi.includes(id));
        const gk = rest.find((id) => ix.players.get(id).element_type === 1);
        const bench = [gk, ...rest.filter((id) => id !== gk).sort((x, y) => xp(ix, ix.players.get(y)) - xp(ix, ix.players.get(x)))];
        const vice = opt.xi.filter((e) => e.id !== opt.captain.id).sort((x, y) => xp(ix, y) - xp(ix, x))[0].id;
        save({ xi, bench, captain: opt.captain.id, vice });
      }
      const keep = a === 'cap' || a === 'vice' ? sel : null;
      if (a !== 'cap' && a !== 'vice') sel = null;
      redraw(keep);
    };
  });
  if (focusId) { (document.querySelector(`[data-sel="${focusId}"]`) || document.querySelector('[data-act="best"]'))?.focus({ preventScroll: true }); focusId = null; }
}
