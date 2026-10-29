// FPL Manager: meni, rute, kartica igrača i početni ekran. Ekrani su u js/views/.
import { setDemo, isDemo, warm } from './api.js';
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

const VIEWS = { pregled, tim, kapiten, transferi, raspored, uzivo, rival, liga, karijera, vodic };
const mac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
const store = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* */ } }, del: (k) => { try { localStorage.removeItem(k); } catch { /* */ } } };
const route = () => { const r = (location.hash.replace('#/', '') || 'pregled').split('?')[0]; return VIEWS[r] ? r : 'pregled'; };

// ---------- meni ----------
function chrome() {
  const r = route(), side = $('#side'), tabs = $('#tabs'), more = $('#more');
  const mtop = $('#mtop');
  side.hidden = tabs.hidden = mtop.hidden = !S.ready;
  if (!S.ready) { more.hidden = true; return; }
  let grp = '';
  side.innerHTML = `<a class="brand" href="#/pregled"><i>FM</i><span>FPL Manager</span></a><button type="button" class="search-btn" data-cmd>${ic('search')}<span>Pretraga</span><kbd>${mac ? '⌘' : 'Ctrl'} K</kbd></button>` + ROUTES.map(([k, t, i, g]) => {
    const head = g !== grp ? `<p class="grp">${g}</p>` : ''; grp = g;
    return head + `<a class="nv" href="#/${k}"${k === r ? ' aria-current="page"' : ''}>${ic(i)}${t}</a>`;
  }).join('') + `<p class="grp">Zajednica</p><a class="nv jury" href="/jury/">${ic('jury')}SquadJury<span class="new">ocijeni timove</span></a><div class="me"><span class="av" aria-hidden="true">${esc((S.entry.player_first_name[0] || '') + (S.entry.player_last_name[0] || ''))}</span><div style="min-width:0;flex:1"><b>${esc(S.entry.name)}</b><span class="sub">${esc(S.entry.player_first_name)} ${esc(S.entry.player_last_name)}</span>${isDemo() ? '<br><span class="demo-badge">Primjer</span>' : ''}</div><div class="acts"><button class="btn ghost sm" type="button" data-share>${ic('link')}Link</button><button class="btn ghost sm" type="button" data-logout>${ic('out')}Promijeni</button></div></div>`;
  mtop.innerHTML = `<a class="brand" href="#/pregled"><i>FM</i><span>FPL Manager</span></a><span style="display:flex;gap:8px;align-items:center"><button type="button" class="icon-btn" data-cmd aria-label="Traži igrača ili ekran">${ic('search')}</button><span class="av" title="${esc(S.entry.name)}" aria-label="${esc(S.entry.name)}">${esc((S.entry.player_first_name[0] || '') + (S.entry.player_last_name[0] || ''))}</span></span>`;
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
  const rows = [['Cijena', (x) => x.now_cost / 10, (v) => '£' + fmt(v) + 'm', -1], ['Forma', (x) => num(x.form), fmt, 1], ['Bodova po utakmici', (x) => num(x.points_per_game), fmt, 1], ['Ukupno bodova', (x) => x.total_points, String, 1], ['Golovi', (x) => x.goals_scored || 0, String, 1], ['Asistencije', (x) => x.assists || 0, String, 1], ['xG na 90 min', (x) => num(x.expected_goals_per_90), (v) => fmt(v, 2), 1], ['xA na 90 min', (x) => num(x.expected_assists_per_90), (v) => fmt(v, 2), 1], ['Minute', (x) => x.minutes, String, 1], ['Vlasništvo', (x) => num(x.selected_by_percent), (v) => fmt(v) + '%', 0], ['Predviđeno, 5 kola', (x) => xp(ix, x, ix.nextGw, 5), fmt, 1]];
  const cell = (v, w, f, dir) => `<td class="${dir && v !== w && (dir > 0 ? v > w : v < w) ? 'win' : ''}">${f(v)}</td>`;
  return `<table class="tbl cmp" style="margin-top:10px"><caption class="sr">Poređenje ${esc(a.web_name)} i ${esc(b.web_name)}</caption><thead><tr><th scope="col"><span class="sr">Statistika</span></th><th scope="col">${esc(a.web_name)}</th><th scope="col">${esc(b.web_name)}</th></tr></thead><tbody>${rows.map(([k, g, f, d]) => `<tr><th scope="row">${k}</th>${cell(g(a), g(b), f, d)}${cell(g(b), g(a), f, d)}</tr>`).join('')}<tr><th scope="row">Sljedeća 3</th><td><span class="fx3">${[0, 1, 2].map((k) => fdrChip(ix, a, ix.nextGw + k)).join('')}</span></td><td><span class="fx3">${[0, 1, 2].map((k) => fdrChip(ix, b, ix.nextGw + k)).join('')}</span></td></tr></tbody></table>`;
}

async function openPlayer(id) {
  const ix = S.ix, e = ix.players.get(id), dlg = $('#pd');
  if (!e) return;
  const t = ix.teams.get(e.team);
  const nextFx = fixturesFor(ix, e.team, ix.nextGw, 5);
  const top = `<div class="pd-top"><div class="shirt">${shirt(t, e.element_type === 1)}</div><div><p class="sub">${POS_BS[e.element_type]}, ${esc(t.name)}${S.ids.includes(e.id) ? ' <span class="chg vi">u tvom timu</span>' : ''}</p><h2 id="pd-h">${esc(e.first_name)} ${esc(e.second_name)}</h2></div><button type="button" class="icon-btn" data-close aria-label="Zatvori">${ic('close')}</button></div>`;
  const stats = [['Cijena', '£' + price(e) + 'm'], ['Forma', fmt(num(e.form))], ['Ukupno bodova', e.total_points], ['Vlasništvo', fmt(num(e.selected_by_percent)) + '%'], ['Golovi', e.goals_scored ?? '–'], ['Asistencije', e.assists ?? '–'], ['Minute', e.minutes], ['Predviđeno, 5 kola', fmt(xp(ix, e, ix.nextGw, 5))]];
  dlg.innerHTML = `<div class="pd-in">${top}${e.news ? `<p class="alert" style="margin-top:14px"><span class="dot" aria-hidden="true"></span><span>${esc(e.news)}</span></p>` : ''}
    <div class="pd-stats">${stats.map(([k, v]) => `<div><span class="sub">${k}</span><b>${esc(String(v))}</b></div>`).join('')}</div>
    <h3 class="ct" style="margin-top:20px">Sljedeće utakmice</h3><div class="list" style="margin-top:8px">${nextFx.map((f) => { const d = new Date(f.kickoff); return `<div class="li"><span class="k">K${f.gw}, ${dayShort(d)} ${dateShort(d)}</span><span>${f.home ? 'kod kuće protiv' : 'u gostima kod'} <b>${esc(ix.teams.get(f.opp).name)}</b></span><span class="fdr d${f.fdr}">${fmt(xp(ix, e, f.gw, 1))}</span></div>`; }).join('') || '<p class="muted">Nema zakazanih utakmica.</p>'}</div>
    <p class="sub" style="margin-top:8px">${esc(reason(ix, e))}</p>
    <h3 class="ct" style="margin-top:20px">Bodovi po kolima</h3><div id="pd-hist"><div class="sk" style="height:90px;margin-top:10px"></div></div>
    <h3 class="ct" style="margin-top:22px">Uporedi</h3><label class="field" style="margin-top:8px"><span class="sr">Uporedi sa igračem</span><input id="pd-cmp" list="pd-cmp-list" placeholder="Upiši ime igrača za poređenje" autocomplete="off"></label><datalist id="pd-cmp-list">${[...ix.players.values()].filter((x) => x.element_type === e.element_type && x.id !== e.id && x.minutes > 0).sort((a, b) => b.total_points - a.total_points).slice(0, 80).map((x) => `<option value="${esc(x.web_name)}">`).join('')}</datalist><div id="pd-cmp-res"></div></div>`;
  dlg.querySelector('[data-close]').onclick = () => dlg.close();
  const ci = $('#pd-cmp');
  ci.oninput = () => { const v = ci.value.trim().toLowerCase(); const o = [...ix.players.values()].find((x) => x.id !== e.id && x.web_name.toLowerCase() === v); $('#pd-cmp-res').innerHTML = o ? compare(ix, e, o) : ''; };
  if (!dlg.open) dlg.showModal();
  dlg.scrollTop = 0;
  try {
    const sum = await element(id);
    const hist = sum.history || [], mx = Math.max(4, ...hist.map((h) => h.total_points));
    $('#pd-hist').innerHTML = hist.length ? `<div class="mini-bars" role="img" aria-label="Bodovi po kolima: ${hist.map((h) => 'kolo ' + h.round + ' ' + h.total_points).join(', ')}">${hist.map((h) => `<i class="${h.total_points ? '' : 'z'}" style="height:${Math.max(3, h.total_points / mx * 100)}%" title="Kolo ${h.round}: ${h.total_points}"></i>`).join('')}</div><p class="sub" style="margin-top:6px">Kola 1 do ${hist.at(-1).round}. Najviše ${mx} bodova.</p>` : '<p class="muted">Još nema odigranih kola.</p>';
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
function start(msg = '') {
  return `<div class="start"><div class="g card"><h1>Tvoj FPL tim, <span>pregledno</span></h1><p class="lead">Kapiten, transferi, raspored, bodovi uživo, rival iz lige i tvoja karijera menadžera, sa procjenom bodova za svako kolo.</p>
    <form id="login"><label class="field">Tvoj FPL ID ili link tima<input id="fid" inputmode="numeric" autocomplete="off" placeholder="npr. 1234567" required></label>
      <button class="btn" type="submit">Otvori moj tim</button><p class="err" id="lerr" role="alert">${esc(msg)}</p></form>
    <p style="margin-top:12px"><button class="btn ghost" type="button" id="demo">Pogledaj primjer bez prijave</button></p>
    <details><summary>Gdje da nađem svoj FPL ID?</summary><p style="margin-top:8px">Na fantasy.premierleague.com otvori stranicu Points. U adresi piše /entry/<b>1234567</b>/event/…, a taj broj je tvoj ID. Možeš zalijepiti i cijeli link.</p></details>
    <p class="sub" style="margin-top:16px">Ne tražimo lozinku. Koriste se samo javni podaci tvog tima. Nezvanična aplikacija, nije povezana sa Premier League.</p></div></div>`;
}
function bindStart() {
  const f = $('#login');
  if (!f) return;
  f.onsubmit = (e) => {
    e.preventDefault();
    const v = $('#fid').value.trim(), m = v.match(/entry\/(\d+)/) || v.match(/^(\d{1,9})$/);
    if (!m) { $('#lerr').textContent = 'Upiši broj (FPL ID) ili zalijepi link svog tima.'; $('#fid').focus(); return; }
    store.set('fm-id', m[1]); store.set('fm-demo', '0'); setDemo(false); render();
  };
  $('#demo').onclick = () => { store.set('fm-id', '1'); store.set('fm-demo', '1'); setDemo(true); render(); };
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
    if (!warmed) { warmed = true; (window.requestIdleCallback || setTimeout)(() => { warm(...(S.leagueId ? ['/league/' + S.leagueId] : []), '/live/' + S.lastGw); warmCaptainHistory(8); }); }
  } catch (e) {
    clearTimeout(skT);
    console.error(e);
    main.innerHTML = `<section class="g card"><h1 class="ct">Ovaj dio se nije učitao</h1><p class="muted" style="margin-top:8px">${esc(e.status === 502 ? 'FPL trenutno ne odgovara. To se dešava dok se ažurira kolo. Pokušaj za koju minutu.' : e.message || 'Nepoznata greška.')}</p><p style="margin-top:12px"><button class="btn" type="button" id="retry">Pokušaj ponovo</button></p></section>`;
    $('#retry').onclick = () => render();
  }
  document.title = v.title + ' · FPL Manager';
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
