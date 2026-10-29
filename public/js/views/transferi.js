// Transferi: besplatni transferi, pojedinačni i dvostruki prijedlozi, minus 4, šta ako, cijene.
import { S, ftLeft } from '../state.js';
import { transferIdeas, transferPairs, hitWorth, whatIf, alerts, risers, xp, num, fmt, price, int, POS_BS } from '../model.js';
import { esc, ic, pbtn, $, fdrChip, shirt, photo } from '../ui.js';
import { tr } from '../i18n.js';

export const title = tr('Transferi', 'Transfers');
const POS_SHORT = tr({ 1: 'GOL', 2: 'ODB', 3: 'VEZ', 4: 'NAP' }, { 1: 'GK', 2: 'DEF', 3: 'MID', 4: 'FWD' });
// jedan igrač u redu transfera: mali dres, ime, cijena i klub
const pcell = (ix, e, cls) => `<span class="trx-p ${cls}"><span class="shirt">${shirt(ix.teams.get(e.team), e.element_type === 1)}${photo(e)}</span><span class="trx-n">${pbtn(e)}<span class="sub">£${price(e)}m · ${esc(ix.teams.get(e.team).short_name)}</span></span></span>`;
const swapCells = (ix, out, inn) => `${pcell(ix, out, 'o')}<span class="trx-arrow" aria-hidden="true">→</span><span class="sr">${tr('mijenja se za', 'replaced by')}</span>${pcell(ix, inn, 'i')}`;
let hz = 5;
const mk = { pos: 0, max: 0, sort: 'xp', q: '' };

export async function render() {
  const { ix } = S;
  const ft = ftLeft(), made = S.pending.length;
  const ideas = transferIdeas(ix, S.nextIds, S.nextBank, { limit: 6, horizon: hz });
  const pairs = transferPairs(ix, S.nextIds, S.nextBank, { limit: 3, horizon: hz });
  const al = alerts(ix, S.nextIds);
  const rise = risers(ix, 6);
  const squad = S.nextIds.map((id) => ix.players.get(id)).sort((a, b) => a.element_type - b.element_type);
  const verdict = (gain, cost) => {
    if (!cost) return `<span class="chg up">+${fmt(gain)}</span>`;
    const h = hitWorth(gain);
    return `<span class="chg ${h.worth ? 'up' : h.close ? 'nt' : 'dn'}" title="${tr('Sa minus', 'With a hit of')} ${cost}">${h.net >= 0 ? '+' : '−'}${fmt(Math.abs(h.net))} ${tr('poslije', 'after')} −${cost}</span>`;
  };
  const pairCost = Math.max(0, 2 - ft) * 4;
  return `<div class="head"><div><h1>${tr('Transferi', 'Transfers')}</h1><p class="sub">${tr(`Prijedlozi za ${hz === 1 ? 'sljedeće kolo' : 'narednih ' + hz + ' kola'}, u okviru budžeta (banka £${fmt(S.nextBank / 10)}m) i najviše 3 igrača iz kluba`, `Ideas for ${hz === 1 ? 'the next gameweek' : 'the next ' + hz + ' gameweeks'}, within budget (bank £${fmt(S.nextBank / 10)}m) and at most 3 players per club`)}</p></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><span class="chg up" style="font-size:14px">${ft} ${ft === 1 ? tr('besplatan transfer', 'free transfer') : tr('besplatna transfera', 'free transfers')}</span>${made ? `<span class="chg vi" style="font-size:14px">${tr(`već napravljeno na FPL-u: ${made}`, `already made on FPL: ${made}`)}</span>` : ''}<span class="chg nt" style="font-size:14px">${tr('svaki dodatni −4', 'each extra −4')}</span></div></div>
    <div class="grid2">
      <div class="stack">
        <section class="g card" aria-labelledby="h-ideas"><div class="ch" style="margin:0"><h2 id="h-ideas" class="ct">${tr('Najbolji pojedinačni transferi', 'Best single transfers')}</h2><div class="seg" role="group" aria-label="${tr('Za koliko kola', 'How many gameweeks')}">${[1, 3, 5].map((n) => `<button type="button" data-hz="${n}" aria-pressed="${hz === n}">${n} ${n === 1 ? tr('kolo', 'GW') : tr('kola', 'GWs')}</button>`).join('')}</div></div><div class="list" style="margin-top:12px">${ideas.length ? ideas.map((t) => `<div class="trx"><span class="trx-pos">${POS_SHORT[t.out.element_type]}</span>${swapCells(ix, t.out, t.inn)}${verdict(t.gain, ft >= 1 ? 0 : 4)}</div>`).join('') : `<p class="muted">${tr('Nema transfera koji se jasno isplati.', 'No transfer clearly pays off.')}</p>`}</div></section>
        <section class="g card" aria-labelledby="h-pairs"><h2 id="h-pairs" class="ct">${tr('Dva transfera odjednom', 'Two transfers at once')}</h2><p class="sub" style="margin-top:4px">${pairCost ? tr(`Imaš ${ft} besplatan, pa bi ovo koštalo −${pairCost}.`, `You have ${ft} free, so this would cost −${pairCost}.`) : tr('Imaš dovoljno besplatnih transfera za ovo.', 'You have enough free transfers for this.')}</p><div class="list" style="margin-top:12px">${pairs.length ? pairs.map((t) => `<div class="trx two"><div class="trx-lines">${t.outs.map((o, k) => `<div class="trx-line">${swapCells(ix, o, t.ins[k])}</div>`).join('')}</div>${verdict(t.gain, pairCost)}</div>`).join('') : `<p class="muted">${tr('Nema dobre kombinacije u okviru budžeta.', 'No good combination within budget.')}</p>`}</div>
          <p class="sub" style="margin-top:10px">${tr('Minus 4 se isplati samo ako transfer kroz 5 kola donese bar 2 boda više od tih 4. Prodajna cijena u FPL-u može biti malo niža od trenutne, pa provjeri budžet.', 'A −4 hit only pays off if the transfer brings at least 2 points more than those 4 over 5 gameweeks. The FPL selling price can be a bit below the current price, so check your budget.')}</p></section>
      </div>
      <div class="stack">
        <section class="g card" aria-labelledby="h-sim"><h2 id="h-sim" class="ct">${tr('Šta ako zamijenim?', 'What if I swap?')}</h2>
          <form class="stack" id="sim" style="margin-top:12px;gap:12px">
            <label class="field">${tr('Prodajem', 'Selling')}<select id="sim-out">${squad.map((e) => `<option value="${e.id}">${esc(e.web_name)} (${POS_BS[e.element_type]}, £${price(e)}m)</option>`).join('')}</select></label>
            <label class="field">${tr('Kupujem', 'Buying')}<input id="sim-in" list="sim-list" placeholder="${tr('Upiši ime igrača', 'Type a player name')}" autocomplete="off"></label>
            <datalist id="sim-list"></datalist>
          </form><div id="sim-res" aria-live="polite"></div></section>
        <section class="g card"><h2 class="ct">${tr('Kupi prije poskupljenja', 'Buy before the price rise')}</h2><p class="sub" style="margin-top:4px">${tr('Najviše kupovani igrači ovog kola. Vjerovatno će uskoro poskupjeti.', 'The most bought players this gameweek. They will probably rise in price soon.')}</p><div class="list" style="margin-top:10px">${rise.map((r) => `<div class="li"><span class="k">£${price(r.e)}m</span><span>${pbtn(r.e)} <span class="sub">${esc(ix.teams.get(r.e.team).short_name)}</span></span><span class="chg up">+${int(r.net)}</span></div>`).join('')}</div></section>
        <section class="g card"><h2 class="ct">${tr('Upozorenja', 'Alerts')}</h2><div style="margin-top:10px">${al.length ? al.map((a) => `<p class="alert"><span class="dot" aria-hidden="true"></span><span>${esc(a.text)}</span></p>`).join('') : `<p class="muted">${tr('Nema povreda ni igrača bez utakmice.', 'No injuries and no players without a match.')}</p>`}</div></section>
      </div>
    </div>
    <section class="g card mt" aria-labelledby="h-mk"><div class="ch"><div><h2 id="h-mk" class="ct">${tr('Tržište igrača', 'Player market')}</h2><p class="sub">${tr(`Filtriraj i poredaj sve igrače. Predviđeni bodovi su za ${hz === 1 ? 'sljedeće kolo' : 'narednih ' + hz + ' kola'}.`, `Filter and sort every player. Predicted points are for ${hz === 1 ? 'the next gameweek' : 'the next ' + hz + ' gameweeks'}.`)}</p></div></div>
      <div class="mk-f">
        <div class="seg" role="group" aria-label="${tr('Pozicija', 'Position')}">${[[0, tr('Svi', 'All')], [1, POS_SHORT[1]], [2, POS_SHORT[2]], [3, POS_SHORT[3]], [4, POS_SHORT[4]]].map(([v, t]) => `<button type="button" data-pos="${v}" aria-pressed="${mk.pos === v}">${t}</button>`).join('')}</div>
        <label class="field mk-r"><span>${tr('Najviše', 'Up to')} <output id="mk-maxv">${mk.max ? '£' + fmt(mk.max / 10) + 'm' : tr('sve cijene', 'any price')}</output></span><input type="range" id="mk-max" min="40" max="155" step="5" value="${mk.max || 155}"></label>
        <label class="field">${tr('Poredaj po', 'Sort by')}<select id="mk-sort"><option value="xp">${tr('predviđenim bodovima', 'predicted points')}</option><option value="val">${tr('bodovima po milionu', 'points per million')}</option><option value="form">${tr('formi', 'form')}</option><option value="own">${tr('vlasništvu', 'ownership')}</option><option value="price">${tr('cijeni', 'price')}</option></select></label>
        <label class="field">${tr('Traži', 'Search')}<input id="mk-q" type="search" placeholder="${tr('Ime ili klub', 'Name or club')}" autocomplete="off" value="${esc(mk.q)}"></label>
      </div>
      <div class="scroll-x" tabindex="0" style="margin-top:12px"><table class="tbl mk"><caption class="sr">${tr('Igrači po filteru', 'Filtered players')}</caption><thead><tr><th scope="col">${tr('Igrač', 'Player')}</th><th scope="col">${tr('Cijena', 'Price')}</th><th scope="col">${tr('Forma', 'Form')}</th><th scope="col">${tr('Vlasn.', 'Owned')}</th><th scope="col">${tr('Sljedeća 3', 'Next 3')}</th><th scope="col">${tr('Predviđeno', 'Predicted')}</th></tr></thead><tbody id="mk-body"></tbody></table></div>
    </section>`;
}

export function bind(rerender) {
  document.querySelectorAll('[data-hz]').forEach((b) => { b.onclick = () => { hz = +b.dataset.hz; rerender(true); }; });
  market();
  const { ix } = S, outSel = $('#sim-out'), inp = $('#sim-in'), list = $('#sim-list'), box = $('#sim-res');
  if (!outSel) return;
  $("#sim").onsubmit = (e) => e.preventDefault();
  const label = (e) => `${e.web_name} (${ix.teams.get(e.team).short_name}, £${price(e)}m)`;
  const pool = () => { const out = ix.players.get(+outSel.value); return [...ix.players.values()].filter((e) => e.element_type === out.element_type && !S.nextIds.includes(e.id) && e.minutes > 0).sort((a, b) => b.now_cost - a.now_cost); };
  const fill = () => { list.innerHTML = pool().map((e) => `<option value="${esc(label(e))}"></option>`).join(''); };
  const show = () => {
    const out = ix.players.get(+outSel.value), v = inp.value.trim().toLowerCase();
    const m = pool().find((e) => label(e).toLowerCase() === v) || pool().find((e) => e.web_name.toLowerCase() === v);
    if (!m) { box.innerHTML = `<p class="sub" style="margin-top:14px">${tr('Izaberi igrača kojeg prodaješ i upiši koga bi kupio.', 'Pick the player you sell and type who you would buy.')}</p>`; return; }
    const w = whatIf(ix, out, m), money = m.now_cost - out.now_cost;
    box.innerHTML = `<div class="gw-table">${w.rows.map((r) => `<div><p class="sub">${tr('Kolo', 'GW')} ${r.gw}</p><p class="num" style="color:${r.inn >= r.out ? 'var(--green)' : '#ff6aa6'}">${r.inn >= r.out ? '+' : '−'}${fmt(Math.abs(r.inn - r.out))}</p></div>`).join('')}</div>
      <p class="cond" style="margin-top:14px;font-size:26px">${w.gain >= 0 ? tr('Dobijaš', 'You gain') : tr('Gubiš', 'You lose')} ${tr('oko', 'about')} ${fmt(Math.abs(w.gain))} ${tr('bodova kroz 5 kola', 'points over 5 gameweeks')}</p>
      <p class="sub">${money > S.nextBank ? tr(`Fali ti £${fmt((money - S.nextBank) / 10)}m u banci.`, `You are £${fmt((money - S.nextBank) / 10)}m short.`) : tr(`U banci ostaje £${fmt((S.nextBank - money) / 10)}m.`, `£${fmt((S.nextBank - money) / 10)}m left in the bank.`)}</p>`;
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
    body.innerHTML = rows.length ? rows.map((e) => `<tr${S.nextIds.includes(e.id) ? ' class="me"' : ''}><td>${pbtn(e)} <span class="sub">${esc(ix.teams.get(e.team).short_name)}, ${POS_BS[e.element_type]}</span>${S.nextIds.includes(e.id) ? ` <span class="chg vi">${tr('tvoj', 'yours')}</span>` : ''}</td><td class="num">${price(e)}</td><td class="num">${fmt(num(e.form))}</td><td class="num">${fmt(num(e.selected_by_percent))}%</td><td><span class="fx3">${[0, 1, 2].map((k) => fdrChip(ix, e, ix.nextGw + k)).join('')}</span></td><td><span class="chg vi">${fmt(xs.get(e.id))}</span></td></tr>`).join('') : `<tr><td colspan="6" class="muted">${tr('Nema igrača za ovaj filter.', 'No players match this filter.')}</td></tr>`;
  };
  document.querySelectorAll('[data-pos]').forEach((b) => { b.onclick = () => { mk.pos = +b.dataset.pos; document.querySelectorAll('[data-pos]').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); draw(); }; });
  const r = $('#mk-max'), out = $('#mk-maxv'), sel = $('#mk-sort'), q = $('#mk-q');
  r.oninput = () => { mk.max = +r.value >= 155 ? 0 : +r.value; out.textContent = mk.max ? '£' + fmt(mk.max / 10) + 'm' : tr('sve cijene', 'any price'); draw(); };
  sel.value = mk.sort; sel.onchange = () => { mk.sort = sel.value; draw(); };
  q.oninput = () => { mk.q = q.value; draw(); };
  draw();
}
