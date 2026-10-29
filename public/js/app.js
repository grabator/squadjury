// SquadJury (FPL dio): meni, rute, kartica igrača i početni ekran. Ekrani su u js/views/.
import { setDemo, isDemo, warm } from './api.js';
import { enhance } from './dd.js';
import { S, load, reset, element, warmCaptainHistory } from './state.js';
import { xp, fixturesFor, reason, fmt, price, num, POS_BS, dayShort, dateShort, dateLong } from './model.js';
import { $, esc, ic, ROUTES, TABS, shirt, fdrChip } from './ui.js';
import * as pregled from './views/pregled.js';
import * as tim from './views/tim.js';
import * as kapiten from './views/kapiten.js';
import * as transferi from './views/transferi.js';
import * as raspored from './views/raspored.js';
import * as uzivo from './views/uzivo.js';
import * as rival from './views/rival.js';
import * as liga from './views/liga.js';
import * as karijera from './views/karijera.js';
import * as vodic from './views/vodic.js';
import * as kutak from './views/kutak.js';

const VIEWS = { pregled, tim, kapiten, transferi, raspored, uzivo, kutak, rival, liga, karijera, vodic };
const mac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
const store = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* */ } }, del: (k) => { try { localStorage.removeItem(k); } catch { /* */ } } };
const route = () => { const r = (location.hash.replace('#/', '') || 'pregled').split('?')[0]; return VIEWS[r] ? r : 'pregled'; };

// ---------- meni ----------
function chrome() {
  const r = route(), side = $('#side'), tabs = $('#tabs'), more = $('#more');
  const mtop = $('#mtop');
  side.hidden = tabs.hidden = mtop.hidden = !S.ready;
  document.querySelector('.shell').classList.toggle('noside', !S.ready);
  if (!S.ready) { more.hidden = true; return; }
  let grp = '';
  side.innerHTML = `<a class="brand" href="#/pregled" aria-label="SquadJury, pregled"><img src="/img/brand/mark.svg" alt="" width="38" height="38"><span>Squad<em>Jury</em></span></a><button type="button" class="search-btn" data-cmd>${ic('search')}<span>Pretraga</span><kbd>${mac ? '⌘' : 'Ctrl'} K</kbd></button>` + ROUTES.map(([k, t, i, g]) => {
    const head = g !== grp ? `<p class="grp">${g}</p>` : ''; grp = g;
    return head + `<a class="nv" href="#/${k}"${k === r ? ' aria-current="page"' : ''}>${ic(i)}${t}</a>`;
  }).join('') + `<p class="grp">Zajednica</p><a class="nv jury" href="/jury/">${ic('jury')}SquadJury<span class="new">ocijeni timove</span></a><div class="me"><span class="av" aria-hidden="true">${esc((S.entry.player_first_name[0] || '') + (S.entry.player_last_name[0] || ''))}</span><div style="min-width:0;flex:1"><b>${esc(S.entry.name)}</b><span class="sub">${esc(S.entry.player_first_name)} ${esc(S.entry.player_last_name)}</span>${isDemo() ? '<br><span class="demo-badge">Primjer</span>' : ''}</div><div class="acts"><button class="btn ghost sm" type="button" data-share>${ic('link')}Link</button><button class="btn ghost sm" type="button" data-logout>${ic('out')}Promijeni</button></div></div>`;
  mtop.innerHTML = `<a class="brand" href="#/pregled" aria-label="SquadJury, pregled"><img src="/img/brand/mark.svg" alt="" width="38" height="38"><span>Squad<em>Jury</em></span></a><span style="display:flex;gap:8px;align-items:center"><button type="button" class="icon-btn" data-cmd aria-label="Traži igrača ili ekran">${ic('search')}</button><span class="av" title="${esc(S.entry.name)}" aria-label="${esc(S.entry.name)}">${esc((S.entry.player_first_name[0] || '') + (S.entry.player_last_name[0] || ''))}</span></span>`;
  const inMore = !TABS.includes(r);
  tabs.innerHTML = TABS.map((k) => { const [, t, i] = ROUTES.find((x) => x[0] === k); return `<a href="#/${k}"${k === r ? ' aria-current="page"' : ''}>${ic(i)}<span>${t}</span></a>`; }).join('') + `<button type="button" id="more-btn" aria-expanded="${!more.hidden}" aria-controls="more"${inMore ? ' aria-current="page"' : ''}>${ic('more')}<span>Više</span></button>`;
  more.innerHTML = ROUTES.filter(([k]) => !TABS.includes(k)).map(([k, t, i]) => `<a href="#/${k}"${k === r ? ' aria-current="page"' : ''}>${ic(i)}${t}</a>`).join('') + `<a href="/jury/">${ic('jury')}SquadJury</a><a href="#/" data-logout>${ic('out')}Promijeni tim</a>`;
  $('#more-btn').onclick = () => { more.hidden = !more.hidden; $('#more-btn').setAttribute('aria-expanded', String(!more.hidden)); };
  document.querySelectorAll('[data-logout]').forEach((b) => { b.onclick = (e) => { e.preventDefault(); store.del('fm-id'); store.del('fm-demo'); reset(); setDemo(false); more.hidden = true; history.replaceState(null, '', location.pathname + '#/pregled'); render(); }; });
  document.querySelectorAll('[data-share]').forEach((b) => { b.onclick = async () => { const url = location.origin + '/?id=' + S.id + (isDemo() ? '&demo=1' : ''); try { await navigator.clipboard.writeText(url); status('Link tima je kopiran.'); } catch { prompt('Link tvog tima', url); } }; });
}
const status = (t) => { $('#status').textContent = t; };

// traka sa rokom za transfere, kao na vrhu FPL stranica
function deadline() {
  const ev = S.ix.events.find((e) => e.id === S.ix.nextGw);
  if (!ev) return '';
  const d = new Date(ev.deadline_time), ms = d - Date.now();
  if (ms <= 0) return '';
  const m = Math.floor(ms / 60000), left = m >= 1440 ? Math.floor(m / 1440) + ' d ' + Math.floor(m / 60) % 24 + ' h' : Math.floor(m / 60) + ' h ' + m % 60 + ' min';
  return `<p class="dl"><b>Kolo ${ev.id}</b><span>Rok: ${dateLong(d)}</span><span class="dl-left">još ${left}</span></p>`;
}

// ---------- kartica igrača ----------
// poređenje dva igrača: bolja vrijednost u redu je zelena
function compare(ix, a, b) {
  const rows = [['Cijena', (x) => x.now_cost / 10, (v) => '£' + fmt(v) + 'm', -1], ['Predviđeno, 5 kola', (x) => xp(ix, x, ix.nextGw, 5), fmt, 1], ['Forma', (x) => num(x.form), fmt, 1], ['Bodova po utakmici', (x) => num(x.points_per_game), fmt, 1], ['Ukupno bodova', (x) => x.total_points, String, 1], ['Golovi', (x) => x.goals_scored || 0, String, 1], ['Asistencije', (x) => x.assists || 0, String, 1], ['xG na 90 min', (x) => num(x.expected_goals_per_90), (v) => fmt(v, 2), 1], ['xA na 90 min', (x) => num(x.expected_assists_per_90), (v) => fmt(v, 2), 1], ['Minute', (x) => x.minutes, String, 1], ['Vlasništvo', (x) => num(x.selected_by_percent), (v) => fmt(v) + '%', 0]];
  // jedan na jedan: vrijednosti lijevo i desno, naziv u sredini, trake pokazuju odnos
  const side = (e) => `<div class="cmp-pl"><span class="shirt">${shirt(ix.teams.get(e.team), e.element_type === 1)}</span><b>${esc(e.web_name)}</b><span class="sub">${esc(ix.teams.get(e.team).short_name)} · £${price(e)}m</span></div>`;
  const row = ([k, g, f, d]) => {
    const va = g(a), vb = g(b), mx = Math.max(Math.abs(va), Math.abs(vb)) || 1;
    const wa = d && va !== vb && (d > 0 ? va > vb : va < vb), wb = d && va !== vb && !wa;
    return `<div class="cmp-r"><b class="${wa ? 'win' : ''}">${f(va)}</b><span class="cmp-k">${k}</span><b class="${wb ? 'win' : ''}">${f(vb)}</b><span class="cmp-bar l"><i style="width:${(Math.abs(va) / mx * 100).toFixed(0)}%"></i></span><span class="cmp-bar r"><i style="width:${(Math.abs(vb) / mx * 100).toFixed(0)}%"></i></span></div>`;
  };
  const fx = (e) => `<span class="fx3">${[0, 1, 2].map((k) => fdrChip(ix, e, ix.nextGw + k)).join('')}</span>`;
  const wins = rows.filter(([, g, , d]) => d && g(a) !== g(b)).map(([, g, , d]) => (d > 0 ? g(a) > g(b) : g(a) < g(b)));
  const wa = wins.filter(Boolean).length, wb = wins.length - wa;
  return `<div class="cmp2" role="group" aria-label="Poređenje ${esc(a.web_name)} i ${esc(b.web_name)}"><div class="cmp-h">${side(a)}<span class="cmp-vs"><b>${wa} : ${wb}</b><span class="sub">bolji u</span></span>${side(b)}</div>${rows.map(row).join('')}<div class="cmp-r fxr"><span>${fx(a)}</span><span class="cmp-k">Sljedeća 3</span><span>${fx(b)}</span></div></div>`;
}

async function openPlayer(id) {
  const ix = S.ix, e = ix.players.get(id), dlg = $('#pd');
  if (!e) return;
  const t = ix.teams.get(e.team);
  const nextFx = fixturesFor(ix, e.team, ix.nextGw, 5);
  const xp5 = xp(ix, e, ix.nextGw, 5);
  const top = `<div class="pd-top"><div class="shirt">${shirt(t, e.element_type === 1)}</div><div class="pd-name"><p class="sub">${POS_BS[e.element_type]} · ${esc(t.name)}</p><h2 id="pd-h">${esc(e.web_name)}</h2><p class="pd-tags"><span class="chg nt">£${price(e)}m</span><span class="chg vi">${fmt(xp5)} pred. 5 kola</span>${S.ids.includes(e.id) ? '<span class="chg up">u tvom timu</span>' : ''}</p></div><button type="button" class="icon-btn" data-close aria-label="Zatvori">${ic('close')}</button></div>`;
  const stats = [['Forma', fmt(num(e.form))], ['Bodovi', e.total_points], ['Golovi', e.goals_scored ?? '–'], ['Asist.', e.assists ?? '–'], ['Minute', e.minutes], ['Vlasn.', fmt(num(e.selected_by_percent)) + '%'], ['xG/90', fmt(num(e.expected_goals_per_90), 2)], ['xA/90', fmt(num(e.expected_assists_per_90), 2)]];
  const fxs = nextFx.map((f) => { const d = new Date(f.kickoff), o = ix.teams.get(f.opp); return `<div class="pfx d${f.fdr}" title="${esc(o.name)}, ${f.home ? 'kod kuće' : 'u gostima'}, ${dayShort(d)} ${dateShort(d)}"><span class="pfx-gw">K${f.gw}</span><b>${esc(o.short_name)}</b><span class="pfx-ha">${f.home ? 'kod kuće' : 'gost'}</span><span class="pfx-xp">${fmt(xp(ix, e, f.gw, 1))}</span></div>`; }).join('');
  dlg.innerHTML = `${top}<div class="pd-in">${e.news ? `<p class="alert"><span class="dot" aria-hidden="true"></span><span>${esc(e.news)}</span></p>` : ''}
    <div class="pd-stats">${stats.map(([k, v]) => `<div><span class="sub">${k}</span><b>${esc(String(v))}</b></div>`).join('')}</div>
    <h3 class="ct pd-h3">Sljedeće utakmice</h3><p class="sub">Boja je težina protivnika, broj su predviđeni bodovi</p>${fxs ? `<div class="pfxs">${fxs}</div>` : '<p class="muted">Nema zakazanih utakmica.</p>'}
    <p class="sub" style="margin-top:8px">${esc(reason(ix, e))}</p>
    <h3 class="ct pd-h3">Bodovi po kolima</h3><div id="pd-hist"><div class="sk" style="height:110px;margin-top:10px"></div></div>
    <h3 class="ct pd-h3">Uporedi</h3><label class="field" style="margin-top:8px"><span class="sr">Uporedi sa igračem</span><input id="pd-cmp" list="pd-cmp-list" placeholder="Upiši ime igrača za poređenje" autocomplete="off"></label><datalist id="pd-cmp-list">${[...ix.players.values()].filter((x) => x.element_type === e.element_type && x.id !== e.id && x.minutes > 0).sort((a, b) => b.total_points - a.total_points).slice(0, 80).map((x) => `<option value="${esc(x.web_name)}">`).join('')}</datalist><div id="pd-cmp-res"></div></div>`;
  dlg.querySelector('[data-close]').onclick = () => dlg.close();
  const ci = $('#pd-cmp');
  ci.oninput = () => { const v = ci.value.trim().toLowerCase(); const o = [...ix.players.values()].find((x) => x.id !== e.id && x.web_name.toLowerCase() === v); $('#pd-cmp-res').innerHTML = o ? compare(ix, e, o) : ''; };
  enhance(dlg);
  if (!dlg.open) dlg.showModal();
  dlg.scrollTop = 0;
  try {
    const sum = await element(id);
    const hist = sum.history || [], mx = Math.max(4, ...hist.map((h) => h.total_points));
    const sumPts = hist.reduce((x, h) => x + h.total_points, 0);
    $('#pd-hist').innerHTML = hist.length ? `<div class="pbars" role="img" aria-label="Bodovi po kolima: ${hist.map((h) => 'kolo ' + h.round + ' ' + h.total_points).join(', ')}">${hist.map((h) => `<div class="pbar${h.total_points >= 6 ? ' hi' : !h.minutes ? ' z' : ''}"><b>${h.total_points}</b><i style="height:${Math.max(4, h.total_points / mx * 100)}%"></i><span>${h.round}</span></div>`).join('')}</div><p class="sub" style="margin-top:6px">${sumPts} bodova u ${hist.length} ${hist.length === 1 ? 'kolu' : 'kola'}, najviše ${Math.max(...hist.map((h) => h.total_points))}. Zeleno je 6 ili više.</p>` : '<p class="muted">Još nema odigranih kola.</p>';
  } catch { $('#pd-hist').innerHTML = '<p class="muted">Historija igrača trenutno nije dostupna.</p>'; }
}
document.addEventListener('click', (ev) => {
  const p = ev.target.closest('[data-pid]');
  if (p && S.ready) { ev.preventDefault(); openPlayer(+p.dataset.pid); }
  const more = $('#more');
  if (!more.hidden && !ev.target.closest('#more, #more-btn')) { more.hidden = true; $('#more-btn')?.setAttribute('aria-expanded', 'false'); }
});
$('#pd').addEventListener('click', (ev) => { if (ev.target === $('#pd')) $('#pd').close(); });

// ---------- pretraga (Ctrl+K) ----------
const norm = (t) => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ø/g, 'o').replace(/đ/g, 'dj');
function openCmd() {
  if (!S.ready) return;
  const dlg = $('#cmd'), ix = S.ix;
  dlg.innerHTML = `<div class="cmd-in"><label class="cmd-q">${ic('search')}<span class="sr">Traži</span><input id="cmd-q" role="combobox" aria-controls="cmd-list" aria-expanded="true" aria-autocomplete="list" placeholder="Igrač, klub ili ekran" autocomplete="off"><kbd>Esc</kbd></label><ul id="cmd-list" role="listbox" aria-label="Rezultati"></ul></div>`;
  const q = $('#cmd-q'), list = $('#cmd-list');
  let items = [], act = 0;
  const draw = () => {
    const v = norm(q.value.trim());
    const routes = ROUTES.filter(([k, t]) => !v || norm(t).includes(v)).map(([k, t, i]) => ({ kind: 'r', k, t, i }));
    const players = v.length < 2 ? (v ? [] : S.ids.map((id) => ix.players.get(id))) : [...ix.players.values()].filter((e) => norm(e.web_name).includes(v) || norm(e.second_name).includes(v) || norm(ix.teams.get(e.team).name).includes(v)).sort((a, b) => num(b.selected_by_percent) - num(a.selected_by_percent));
    items = [...(v ? routes.slice(0, 4) : []), ...players.slice(0, 8).map((e) => ({ kind: 'p', e })), ...(v ? [] : routes.slice(0, 4))];
    act = Math.min(act, Math.max(0, items.length - 1));
    list.innerHTML = items.length ? items.map((it, i) => `<li role="option" id="cmd-${i}" aria-selected="${i === act}" data-i="${i}">${it.kind === 'r' ? `<span class="ci">${ic(it.i)}</span><span>${it.t}</span><span class="sub">ekran</span>` : `<span class="ci shirt">${shirt(ix.teams.get(it.e.team), it.e.element_type === 1)}</span><span><b>${esc(it.e.web_name)}</b> <span class="sub">${esc(ix.teams.get(it.e.team).short_name)}, ${POS_BS[it.e.element_type]}</span></span><span class="sub">£${price(it.e)}m</span>`}</li>`).join('') : '<li class="muted" style="padding:14px">Nema rezultata.</li>';
    q.setAttribute('aria-activedescendant', items.length ? 'cmd-' + act : '');
    list.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  };
  const go = (i) => { const it = items[i]; if (!it) return; dlg.close(); if (it.kind === 'r') location.hash = '#/' + it.k; else openPlayer(it.e.id); };
  q.oninput = () => { act = 0; draw(); };
  q.onkeydown = (ev) => {
    if (ev.key === 'ArrowDown') { ev.preventDefault(); act = (act + 1) % Math.max(1, items.length); draw(); }
    else if (ev.key === 'ArrowUp') { ev.preventDefault(); act = (act - 1 + items.length) % Math.max(1, items.length); draw(); }
    else if (ev.key === 'Enter') { ev.preventDefault(); go(act); }
  };
  list.onclick = (ev) => { const li = ev.target.closest('[data-i]'); if (li) go(+li.dataset.i); };
  list.onpointermove = (ev) => { const li = ev.target.closest('[data-i]'); if (li && +li.dataset.i !== act) { act = +li.dataset.i; list.querySelectorAll('[role=option]').forEach((x) => x.setAttribute('aria-selected', String(+x.dataset.i === act))); } };
  draw();
  dlg.showModal();
  q.focus();
}
document.addEventListener('keydown', (ev) => { if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'k') { ev.preventDefault(); if ($('#cmd').open) $('#cmd').close(); else { $('#pd').open && $('#pd').close(); openCmd(); } } });
document.addEventListener('click', (ev) => { if (ev.target.closest('[data-cmd]')) openCmd(); });
$('#cmd').addEventListener('click', (ev) => { if (ev.target === $('#cmd')) $('#cmd').close(); });

// ---------- početni ekran ----------
const url = (id) => `<span class="url" aria-hidden="true"><i>fantasy.premierleague.com</i>/entry/<b>${id}</b>/event/9</span>`;
const HOW = {
  pc: [
    ['Otvori stranicu', 'Idi na <b>fantasy.premierleague.com</b> i prijavi se svojim FPL računom.'],
    ['Klikni na Points', 'U meniju na vrhu otvori <b>Points</b>. Ne Pick Team, jer tamo broja nema u adresi.'],
    ['Pogledaj adresu', `Gore u pregledniku piše adresa ovakva: ${url('1234567')} Broj iza <b>entry</b> je tvoj ID.`],
    ['Zalijepi ovdje', 'Upiši taj broj, ili kopiraj cijelu adresu i zalijepi je u polje. Broj izvlačimo sami.']
  ],
  mob: [
    ['Otvori preglednik', 'Otvori <b>fantasy.premierleague.com</b> u Safariju ili Chromeu na mobitelu (ne u FPL aplikaciji) i prijavi se.'],
    ['Otvori Points', 'Otvori meni i izaberi <b>Points</b>, stranicu sa bodovima tvog tima.'],
    ['Kopiraj adresu', `Dodirni adresnu traku i kopiraj link. Izgleda ovako: ${url('1234567')}`],
    ['Zalijepi ovdje', 'Zalijepi cijeli link u polje iznad. Ne moraš tražiti broj, sami ga izvlačimo.']
  ]
};
const steps = (k) => HOW[k].map(([h, t], i) => `<li><span class="stp-n">${i + 1}</span><div><b>${h}</b><p>${t}</p></div></li>`).join('');
const idOf = (v) => (v.match(/entry\/(\d+)/) || v.match(/^\s*(\d{1,9})\s*$/) || [])[1];

function start(msg = '') {
  const mob = matchMedia('(pointer: coarse)').matches;
  return `<div class="start">
    <section class="g card st-main">
      <p class="st-brand"><img src="/img/brand/mark.svg" alt="" width="56" height="56"><span>Squad<em>Jury</em></span></p>
      <h1>Tvoj FPL tim, <span>pregledno</span></h1>
      <p class="lead">Kapiten, transferi, raspored, bodovi uživo i rival iz lige, sa procjenom bodova za svako kolo. Uz to ocjenjuješ tuđe timove.</p>
      <form id="login" novalidate><label class="field" for="fid">Tvoj FPL ID ili link tima</label>
        <div class="st-row field"><input id="fid" inputmode="text" autocomplete="off" placeholder="npr. 1234567 ili zalijepi link" aria-describedby="fhint lerr" required><button class="btn" type="submit">Otvori moj tim</button></div>
        <p class="st-hint" id="fhint" aria-live="polite">Ne znaš svoj ID? Uputstvo je ${innerWidth > 980 ? 'desno' : 'ispod'}, traje pola minute.</p>
        <p class="err" id="lerr" role="alert">${esc(msg)}</p></form>
      <p class="st-or"><span>ili</span></p>
      <button class="btn ghost st-demo" type="button" id="demo">Pogledaj primjer bez prijave</button>
      <p class="sub st-note">Ne tražimo lozinku ni email. Koriste se samo javni podaci tvog tima. Nezvanična aplikacija, nije povezana sa Premier League.</p>
    </section>
    <section class="g card st-how" aria-labelledby="h-how">
      <h2 id="h-how" class="ct">Kako da nađem svoj FPL ID?</h2>
      <p class="sub">ID je broj tvog tima na FPL-u. Isti je cijelu sezonu, pa ga upisuješ samo jednom.</p>
      <div class="seg st-tabs" role="group" aria-label="Uređaj"><button type="button" data-how="pc" aria-pressed="${!mob}">Računar</button><button type="button" data-how="mob" aria-pressed="${mob}">Mobitel</button></div>
      <ol class="stp" id="how">${steps(mob ? 'mob' : 'pc')}</ol>
      <p class="st-tip"><b>Drugi način:</b> u bilo kojoj ligi na FPL-u klikni na svoje ime u tabeli. I tada je u adresi /entry/<b>broj</b>/.</p>
    </section>
  </div>`;
}
function bindStart() {
  const f = $('#login');
  if (!f) return;
  const fid = $('#fid'), hint = $('#fhint');
  fid.oninput = () => {
    const id = idOf(fid.value);
    $('#lerr').textContent = '';
    hint.classList.toggle('ok', !!id);
    hint.textContent = id ? `Pronađen ID: ${id}. Klikni Otvori moj tim.` : fid.value.trim() ? 'U ovome nema broja tima. Treba broj ili link sa /entry/broj/.' : 'Upiši broj ili zalijepi link.';
  };
  f.onsubmit = (e) => {
    e.preventDefault();
    const id = idOf(fid.value);
    if (!id) { $('#lerr').textContent = 'Upiši broj (FPL ID) ili zalijepi link sa Points stranice.'; fid.focus(); return; }
    store.set('fm-id', id); store.set('fm-demo', '0'); setDemo(false); render();
  };
  $('#demo').onclick = () => { store.set('fm-id', '1'); store.set('fm-demo', '1'); setDemo(true); render(); };
  document.querySelectorAll('[data-how]').forEach((b) => { b.onclick = () => { document.querySelectorAll('[data-how]').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); $('#how').innerHTML = steps(b.dataset.how); }; });
}

// uvodna animacija: makni je kad završi ili na dodir
const splash = $('#splash');
if (splash) {
  const done = () => { splash.remove(); document.documentElement.classList.remove('splashing'); };
  if (!document.documentElement.classList.contains('splashing')) done();
  else { splash.addEventListener('animationend', (e) => { if (e.animationName === 'sp-out') done(); }); splash.onclick = done; setTimeout(done, 4000); }
}

// ---------- prikaz ----------
let busy = null, seq = 0;
async function render(quiet) {
  const main = $('#main'), my = ++seq;
  if (!S.ready) {
    const saved = store.get('fm-id');
    if (!saved) { chrome(); main.innerHTML = start(); bindStart(); return; }
    if (!busy) {
      setDemo(store.get('fm-demo') === '1');
      main.innerHTML = '<div class="sk" style="height:180px"></div><div class="grid4 mt">' + '<div class="sk" style="height:120px"></div>'.repeat(4) + '</div><div class="sk mt" style="height:320px"></div>';
      busy = load(+saved).catch((e) => { store.del('fm-id'); reset(); main.innerHTML = start(e.status === 404 ? 'Ne postoji tim sa tim ID-om.' : e.message); bindStart(); }).finally(() => { busy = null; });
    }
    await busy;
    if (!S.ready || my !== seq) return;
  }
  chrome();
  const r = route(), v = VIEWS[r];
  // kostur samo ako ekran kasni, da brzi ekrani ne trepnu
  const skT = quiet ? 0 : setTimeout(() => { if (my === seq) main.innerHTML = '<div class="sk" style="height:60vh"></div>'; }, 140);
  try {
    const html = await v.render();
    clearTimeout(skT);
    if (my !== seq) return;
    main.innerHTML = (r === 'pregled' ? '' : deadline()) + html;
    main.dataset.v = r;
    if (!quiet && !calm) { main.classList.remove('in'); void main.offsetWidth; main.classList.add('in'); }
    v.bind?.((q) => render(q));
    enhance(main);
    if (!warmed) { warmed = true; (window.requestIdleCallback || setTimeout)(() => { warm(...(S.leagueId ? ['/league/' + S.leagueId] : []), '/live/' + S.lastGw); warmCaptainHistory(8); }); }
  } catch (e) {
    clearTimeout(skT);
    console.error(e);
    main.innerHTML = `<section class="g card"><h1 class="ct">Ovaj dio se nije učitao</h1><p class="muted" style="margin-top:8px">${esc(e.status === 502 ? 'FPL trenutno ne odgovara. To se dešava dok se ažurira kolo. Pokušaj za koju minutu.' : e.message || 'Nepoznata greška.')}</p><p style="margin-top:12px"><button class="btn" type="button" id="retry">Pokušaj ponovo</button></p></section>`;
    $('#retry').onclick = () => render();
  }
  document.title = v.title + ' · SquadJury';
}

let warmed = false;
// pređeš mišem ili tabom preko linka u meniju: podaci tog ekrana se počnu učitavati
const pre = (ev) => { const a = ev.target.closest?.('a[href^="#/"]'); const k = a?.getAttribute('href').slice(2); if (S.ready && VIEWS[k]?.prefetch) VIEWS[k].prefetch(); };
addEventListener('pointerover', pre, { passive: true });
addEventListener('focusin', pre);
addEventListener('hashchange', () => { $('#more').hidden = true; render(); if (!calm) scrollTo(0, 0); $('#main').focus({ preventScroll: true }); });
const q = new URLSearchParams(location.search);
if (q.get('id') && /^\d{1,9}$/.test(q.get('id'))) { store.set('fm-id', q.get('id')); store.set('fm-demo', q.get('demo') === '1' ? '1' : '0'); history.replaceState(null, '', location.pathname + location.hash); }
else if (q.get('demo') === '1') { store.set('fm-id', '1'); store.set('fm-demo', '1'); history.replaceState(null, '', location.pathname + location.hash); }
render();
if ('serviceWorker' in navigator && location.hostname !== 'localhost') navigator.serviceWorker.register('/sw.js').catch(() => {});
