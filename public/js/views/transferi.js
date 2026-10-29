// Transferi: besplatni transferi, pojedinačni i dvostruki prijedlozi, minus 4, šta ako, cijene.
import { S } from '../state.js';
import { transferIdeas, transferPairs, hitWorth, whatIf, alerts, freeTransfers, risers, xp, num, fmt, price, int, POS_BS } from '../model.js';
import { esc, ic, pbtn, $, fdrChip } from '../ui.js';

export const title = 'Transferi';
let hz = 5;
const mk = { pos: 0, max: 0, sort: 'xp', q: '' };

export async function render() {
  const { ix } = S;
  const ft = freeTransfers(S.history);
  const ideas = transferIdeas(ix, S.ids, S.bank, { limit: 6, horizon: hz });
  const pairs = transferPairs(ix, S.ids, S.bank, { limit: 3, horizon: hz });
  const al = alerts(ix, S.ids);
  const rise = risers(ix, 6);
  const squad = S.ids.map((id) => ix.players.get(id)).sort((a, b) => a.element_type - b.element_type);
  const verdict = (gain, cost) => {
    if (!cost) return `<span class="chg up">+${fmt(gain)}</span>`;
    const h = hitWorth(gain);
    return `<span class="chg ${h.worth ? 'up' : h.close ? 'nt' : 'dn'}" title="Sa minus ${cost} bodova">${h.net >= 0 ? '+' : '−'}${fmt(Math.abs(h.net))} poslije −${cost}</span>`;
  };
  const pairCost = Math.max(0, 2 - ft) * 4;
  return `<div class="head"><div><h1>Transferi</h1><p class="sub">Prijedlozi za ${hz === 1 ? 'sljedeće kolo' : 'narednih ' + hz + ' kola'}, u okviru budžeta (banka £${fmt(S.bank / 10)}m) i najviše 3 igrača iz kluba</p></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><span class="chg up" style="font-size:14px">${ft} ${ft === 1 ? 'besplatan transfer' : 'besplatna transfera'}</span><span class="chg nt" style="font-size:14px">svaki dodatni −4</span></div></div>
    <div class="grid2">
      <div class="stack">
        <section class="g card" aria-labelledby="h-ideas"><div class="ch" style="margin:0"><h2 id="h-ideas" class="ct">Najbolji pojedinačni transferi</h2><div class="seg" role="group" aria-label="Za koliko kola">${[1, 3, 5].map((n) => `<button type="button" data-hz="${n}" aria-pressed="${hz === n}">${n} ${n === 1 ? 'kolo' : 'kola'}</button>`).join('')}</div></div><div class="list" style="margin-top:12px">${ideas.length ? ideas.map((t) => `<div class="tr"><span class="k">${POS_BS[t.out.element_type]}</span><div class="swap"><div class="p o">${pbtn(t.out)}<span class="sub">£${price(t.out)}m, ${esc(ix.teams.get(t.out.team).short_name)}</span></div>${ic('swap')}<div class="p i">${pbtn(t.inn)}<span class="sub">£${price(t.inn)}m, ${esc(ix.teams.get(t.inn.team).short_name)}</span></div></div>${verdict(t.gain, ft >= 1 ? 0 : 4)}</div>`).join('') : '<p class="muted">Nema transfera koji se jasno isplati.</p>'}</div></section>
        <section class="g card" aria-labelledby="h-pairs"><h2 id="h-pairs" class="ct">Dva transfera odjednom</h2><p class="sub" style="margin-top:4px">${pairCost ? `Imaš ${ft} besplatan, pa bi ovo koštalo −${pairCost}.` : 'Imaš dovoljno besplatnih transfera za ovo.'}</p><div class="list" style="margin-top:12px">${pairs.length ? pairs.map((t) => `<div class="tr two"><div style="display:grid;gap:6px">${t.outs.map((o, i) => `<div class="swap"><div class="p o">${pbtn(o)}<span class="sub">£${price(o)}m</span></div>${ic('swap')}<div class="p i">${pbtn(t.ins[i])}<span class="sub">£${price(t.ins[i])}m</span></div></div>`).join('')}</div>${verdict(t.gain, pairCost)}</div>`).join('') : '<p class="muted">Nema dobre kombinacije u okviru budžeta.</p>'}</div>
          <p class="sub" style="margin-top:10px">Minus 4 se isplati samo ako transfer kroz 5 kola donese bar 2 boda više od tih 4. Prodajna cijena u FPL-u može biti malo niža od trenutne, pa provjeri budžet.</p></section>
      </div>
      <div class="stack">
        <section class="g card" aria-labelledby="h-sim"><h2 id="h-sim" class="ct">Šta ako zamijenim?</h2>
          <form class="stack" id="sim" style="margin-top:12px;gap:12px">
            <label class="field">Prodajem<select id="sim-out">${squad.map((e) => `<option value="${e.id}">${esc(e.web_name)} (${POS_BS[e.element_type]}, £${price(e)}m)</option>`).join('')}</select></label>
            <label class="field">Kupujem<input id="sim-in" list="sim-list" placeholder="Upiši ime igrača" autocomplete="off"></label>
            <datalist id="sim-list"></datalist>
          </form><div id="sim-res" aria-live="polite"></div></section>
        <section class="g card"><h2 class="ct">Kupi prije poskupljenja</h2><p class="sub" style="margin-top:4px">Najviše kupovani igrači ovog kola. Vjerovatno će uskoro poskupjeti.</p><div class="list" style="margin-top:10px">${rise.map((r) => `<div class="li"><span class="k">£${price(r.e)}m</span><span>${pbtn(r.e)} <span class="sub">${esc(ix.teams.get(r.e.team).short_name)}</span></span><span class="chg up">+${int(r.net)}</span></div>`).join('')}</div></section>
        <section class="g card"><h2 class="ct">Upozorenja</h2><div style="margin-top:10px">${al.length ? al.map((a) => `<p class="alert"><span class="dot" aria-hidden="true"></span><span>${esc(a.text)}</span></p>`).join('') : '<p class="muted">Nema povreda ni igrača bez utakmice.</p>'}</div></section>
      </div>
    </div>
    <section class="g card mt" aria-labelledby="h-mk"><div class="ch"><div><h2 id="h-mk" class="ct">Tržište igrača</h2><p class="sub">Filtriraj i poredaj sve igrače. Predviđeni bodovi su za ${hz === 1 ? 'sljedeće kolo' : 'narednih ' + hz + ' kola'}.</p></div></div>
      <div class="mk-f">
        <div class="seg" role="group" aria-label="Pozicija">${[[0, 'Svi'], [1, 'GOL'], [2, 'ODB'], [3, 'VEZ'], [4, 'NAP']].map(([v, t]) => `<button type="button" data-pos="${v}" aria-pressed="${mk.pos === v}">${t}</button>`).join('')}</div>
        <label class="field mk-r"><span>Najviše <output id="mk-maxv">${mk.max ? '£' + fmt(mk.max / 10) + 'm' : 'sve cijene'}</output></span><input type="range" id="mk-max" min="40" max="155" step="5" value="${mk.max || 155}"></label>
        <label class="field">Poredaj po<select id="mk-sort"><option value="xp">predviđenim bodovima</option><option value="val">bodovima po milionu</option><option value="form">formi</option><option value="own">vlasništvu</option><option value="price">cijeni</option></select></label>
        <label class="field">Traži<input id="mk-q" type="search" placeholder="Ime ili klub" autocomplete="off" value="${esc(mk.q)}"></label>
      </div>
      <div class="scroll-x" tabindex="0" style="margin-top:12px"><table class="tbl mk"><caption class="sr">Igrači po filteru</caption><thead><tr><th scope="col">Igrač</th><th scope="col">Cijena</th><th scope="col">Forma</th><th scope="col">Vlasn.</th><th scope="col">Sljedeća 3</th><th scope="col">Predviđeno</th></tr></thead><tbody id="mk-body"></tbody></table></div>
    </section>`;
}

export function bind(rerender) {
  document.querySelectorAll('[data-hz]').forEach((b) => { b.onclick = () => { hz = +b.dataset.hz; rerender(true); }; });
  market();
  const { ix } = S, outSel = $('#sim-out'), inp = $('#sim-in'), list = $('#sim-list'), box = $('#sim-res');
  if (!outSel) return;
  $("#sim").onsubmit = (e) => e.preventDefault();
  const label = (e) => `${e.web_name} (${ix.teams.get(e.team).short_name}, £${price(e)}m)`;
  const pool = () => { const out = ix.players.get(+outSel.value); return [...ix.players.values()].filter((e) => e.element_type === out.element_type && !S.ids.includes(e.id) && e.minutes > 0).sort((a, b) => b.now_cost - a.now_cost); };
  const fill = () => { list.innerHTML = pool().map((e) => `<option value="${esc(label(e))}"></option>`).join(''); };
  const show = () => {
    const out = ix.players.get(+outSel.value), v = inp.value.trim().toLowerCase();
    const m = pool().find((e) => label(e).toLowerCase() === v) || pool().find((e) => e.web_name.toLowerCase() === v);
    if (!m) { box.innerHTML = '<p class="sub" style="margin-top:14px">Izaberi igrača kojeg prodaješ i upiši koga bi kupio.</p>'; return; }
    const w = whatIf(ix, out, m), money = m.now_cost - out.now_cost;
    box.innerHTML = `<div class="gw-table">${w.rows.map((r) => `<div><p class="sub">Kolo ${r.gw}</p><p class="num" style="color:${r.inn >= r.out ? 'var(--green)' : '#ff6aa6'}">${r.inn >= r.out ? '+' : '−'}${fmt(Math.abs(r.inn - r.out))}</p></div>`).join('')}</div>
      <p class="cond" style="margin-top:14px;font-size:26px">${w.gain >= 0 ? 'Dobijaš' : 'Gubiš'} oko ${fmt(Math.abs(w.gain))} bodova kroz 5 kola</p>
      <p class="sub">${money > S.bank ? `Fali ti £${fmt((money - S.bank) / 10)}m u banci.` : `U banci ostaje £${fmt((S.bank - money) / 10)}m.`}</p>`;
  };
  outSel.onchange = () => { fill(); inp.value = ''; show(); };
  inp.oninput = show;
  fill(); show();
}

// tržište: filter po poziciji, cijeni i imenu, poredano po izboru; crta se samo tabela
function market() {
  const { ix } = S, body = $('#mk-body');
  if (!body) return;
  const all = [...ix.players.values()].filter((e) => e.minutes > 0 && e.status !== 'u');
  const xs = new Map(all.map((e) => [e.id, xp(ix, e, ix.nextGw, hz)]));
  const key = { xp: (e) => xs.get(e.id), val: (e) => xs.get(e.id) / e.now_cost, form: (e) => num(e.form), own: (e) => num(e.selected_by_percent), price: (e) => e.now_cost };
  const draw = () => {
    const q = mk.q.trim().toLowerCase();
    const rows = all.filter((e) => (!mk.pos || e.element_type === mk.pos) && (!mk.max || e.now_cost <= mk.max) && (!q || e.web_name.toLowerCase().includes(q) || ix.teams.get(e.team).name.toLowerCase().includes(q) || ix.teams.get(e.team).short_name.toLowerCase() === q))
      .sort((a, b) => key[mk.sort](b) - key[mk.sort](a)).slice(0, 15);
    body.innerHTML = rows.length ? rows.map((e) => `<tr${S.ids.includes(e.id) ? ' class="me"' : ''}><td>${pbtn(e)} <span class="sub">${esc(ix.teams.get(e.team).short_name)}, ${POS_BS[e.element_type]}</span>${S.ids.includes(e.id) ? ' <span class="chg vi">tvoj</span>' : ''}</td><td class="num">${price(e)}</td><td class="num">${fmt(num(e.form))}</td><td class="num">${fmt(num(e.selected_by_percent))}%</td><td><span class="fx3">${[0, 1, 2].map((k) => fdrChip(ix, e, ix.nextGw + k)).join('')}</span></td><td><span class="chg vi">${fmt(xs.get(e.id))}</span></td></tr>`).join('') : '<tr><td colspan="6" class="muted">Nema igrača za ovaj filter.</td></tr>';
  };
  document.querySelectorAll('[data-pos]').forEach((b) => { b.onclick = () => { mk.pos = +b.dataset.pos; document.querySelectorAll('[data-pos]').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); draw(); }; });
  const r = $('#mk-max'), out = $('#mk-maxv'), sel = $('#mk-sort'), q = $('#mk-q');
  r.oninput = () => { mk.max = +r.value >= 155 ? 0 : +r.value; out.textContent = mk.max ? '£' + fmt(mk.max / 10) + 'm' : 'sve cijene'; draw(); };
  sel.value = mk.sort; sel.onchange = () => { mk.sort = sel.value; draw(); };
  q.oninput = () => { mk.q = q.value; draw(); };
  draw();
}
