// SquadJury (FPL dio): meni, rute, kartica igrača i početni ekran. Ekrani su u js/views/.
import { setDemo, isDemo, warm } from './api.js';
import { enhance } from './dd.js';
import { tr, langSwitch, bindLang } from './i18n.js';
import { S, load, reset, element, warmCaptainHistory, ftLeft, live } from './state.js';
import { xp, fixturesFor, reason, fmt, price, num, int, POS_BS, dayShort, dateShort, dateLong, alerts, liveBonus } from './model.js';
import { $, esc, ic, ROUTES, TABS, shirt, photo, fdrChip } from './ui.js';
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
import * as trofeji from './views/trofeji.js';

const VIEWS = { pregled, tim, kapiten, transferi, raspored, uzivo, kutak, rival, liga, karijera, trofeji, vodic };
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
  side.innerHTML = `<a class="brand" href="#/pregled" aria-label="SquadJury, ${tr('pregled', 'overview')}"><img src="/img/brand/mark.svg" alt="" width="38" height="38"><span>Squad<em>Jury</em></span></a><button type="button" class="search-btn" data-cmd>${ic('search')}<span>${tr('Pretraga', 'Search')}</span><kbd>${mac ? '⌘' : 'Ctrl'} K</kbd></button>` + ROUTES.map(([k, t, i, g]) => {
    const head = g !== grp ? `<p class="grp">${g}</p>` : ''; grp = g;
    return head + `<a class="nv" href="#/${k}"${k === r ? ' aria-current="page"' : ''}>${ic(i)}${t}</a>`;
  }).join('') + `<p class="grp">${tr('Zajednica', 'Community')}</p><a class="nv jury" href="/jury/">${ic('jury')}SquadJury<span class="new">${tr('ocijeni timove', 'rate squads')}</span></a><div class="me"><span class="av" aria-hidden="true">${esc((S.entry.player_first_name[0] || '') + (S.entry.player_last_name[0] || ''))}</span><div style="min-width:0;flex:1"><b>${esc(S.entry.name)}</b><span class="sub">${esc(S.entry.player_first_name)} ${esc(S.entry.player_last_name)}</span>${isDemo() ? `<br><span class="demo-badge">${tr('Primjer', 'Demo')}</span>` : ''}</div><div class="acts"><button class="btn ghost sm" type="button" data-share>${ic('link')}Link</button><button class="btn ghost sm" type="button" data-logout>${ic('out')}${tr('Promijeni', 'Switch')}</button></div></div><div class="side-lang"><span class="sub">${tr('Jezik', 'Language')}</span>${langSwitch()}</div>`;
  const al = alerts(S.ix, S.nextIds || S.ids);
  mtop.innerHTML = `<a class="brand" href="#/pregled" aria-label="SquadJury, ${tr('pregled', 'overview')}"><img src="/img/brand/mark.svg" alt="" width="38" height="38"><span>Squad<em>Jury</em></span></a>${hchip()}<span class="mtop-r">${al.length ? `<button type="button" class="icon-btn bell" id="bell-btn" aria-haspopup="dialog" aria-expanded="false" aria-controls="alerts" aria-label="${tr('Upozorenja', 'Alerts')}: ${al.length}">${ic('bell')}<i aria-hidden="true">${al.length}</i></button>` : ''}<button type="button" class="icon-btn" data-cmd aria-label="${tr('Traži igrača ili ekran', 'Find a player or screen')}">${ic('search')}</button><button type="button" class="av av-btn" id="acct-btn" aria-haspopup="dialog" aria-expanded="false" aria-controls="acct" aria-label="${initials()}, ${tr('tvoj tim i promjena tima', 'your team and switching team')}: ${esc(S.entry.name)}">${initials()}</button></span>`;
  bell(al); liveChip();
  acct();
  const inMore = !TABS.includes(r);
  tabs.innerHTML = TABS.map((k) => { const [, t, i] = ROUTES.find((x) => x[0] === k); return `<a href="#/${k}"${k === r ? ' aria-current="page"' : ''}>${ic(i)}<span>${t}</span></a>`; }).join('') + `<button type="button" id="more-btn" aria-expanded="${!more.hidden}" aria-controls="more"${inMore ? ' aria-current="page"' : ''}>${ic('more')}<span>${tr('Više', 'More')}</span></button>`;
  // Više: jasne grupe kao u bočnom meniju, neprozirna podloga
  const rest = ROUTES.filter(([k]) => !TABS.includes(k)), groups = [...new Set(rest.map((x) => x[3]))];
  more.innerHTML = `<div class="ms-h"><b>${tr('Više', 'More')}</b><button type="button" class="icon-btn" data-close-more aria-label="${tr('Zatvori', 'Close')}">${ic('close')}</button></div>` + groups.map((g) => `<p class="ms-g">${g}</p><div class="ms-row">${rest.filter((x) => x[3] === g).map(([k, t, i]) => `<a href="#/${k}"${k === r ? ' aria-current="page"' : ''}>${ic(i)}<span>${t}</span></a>`).join('')}</div>`).join('') + `<p class="ms-g">${tr('Zajednica', 'Community')}</p><div class="ms-row"><a href="/jury/">${ic('jury')}<span>SquadJury</span></a><a href="#/" data-logout>${ic('out')}<span>${tr('Promijeni tim', 'Switch team')}</span></a></div><div class="more-lang"><span class="sub">${tr('Jezik', 'Language')}</span>${langSwitch()}</div>`;
  bindLang();
  $('#more-btn').onclick = () => { more.hidden = !more.hidden; $('#acct').hidden = true; $('#more-btn').setAttribute('aria-expanded', String(!more.hidden)); };
  more.querySelector('[data-close-more]').onclick = () => { more.hidden = true; $('#more-btn').setAttribute('aria-expanded', 'false'); };
  bindAcctActions(document);
}
const status = (t) => { $('#status').textContent = t; };
const initials = () => esc((S.entry.player_first_name[0] || '') + (S.entry.player_last_name[0] || ''));

// ---------- gornja traka na mobitelu: čip sa stanjem i zvonce sa upozorenjima ----------
const short = (n) => (n >= 1e6 ? fmt(n / 1e6, 1) + 'M' : n >= 1e3 ? Math.round(n / 1e3) + 'k' : String(n));
// kolo je uživo: rok je prošao, a FPL ga još nije završio
const liveGw = () => { const ev = S.ix.events.find((e) => e.id === S.lastGw); return ev && !ev.finished && new Date(ev.deadline_time) < Date.now() ? ev.id : null; };
function hchip() {
  if (liveGw()) return `<a class="hchip live" id="hchip" href="#/uzivo"><span class="hs"><span class="dot" aria-hidden="true"></span><span class="lv">${tr('UŽIVO', 'LIVE')}</span><b id="hc-pts">…</b></span><span class="hs" id="hc-left"></span></a>`;
  const h = S.history.current, last = h[h.length - 1], prev = h[h.length - 2], chg = last && prev ? prev.overall_rank - last.overall_rank : 0, ft = ftLeft();
  const bank = fmt((S.nextBank ?? S.bank) / 10);
  return `<a class="hchip" id="hchip" href="#/transferi"><span class="hs"><b>${ft}</b> FT<span class="sr"> (${tr('besplatni transferi', 'free transfers')})</span></span><span class="hs"><span class="sr">${tr('banka', 'bank')} </span><b>£${bank}m</b></span>${last ? `<span class="hs hrk ${chg >= 0 ? 'up' : 'dn'}"><span class="sr">${tr('rang', 'rank')} ${chg > 0 ? tr('gore', 'up') : chg < 0 ? tr('dole', 'down') : ''} </span><span aria-hidden="true">${chg > 0 ? '▲' : chg < 0 ? '▼' : '•'}</span> ${short(Math.abs(chg) || last.overall_rank)}</span>` : ''}</a>`;
}
// uživo: bodovi tima (kapiten duplo, privremeni bonus) i koliko igrača iz postave još igra
async function liveChip() {
  const gw = liveGw();
  if (!gw) return;
  try {
    const lv = await live(gw), lb = liveBonus(lv), mult = S.picks?.active_chip === '3xc' ? 3 : 2;
    const pts = S.xi.reduce((t, id) => t + ((lv.get(id)?.total_points || 0) + (lb.get(id)?.provisional || 0)) * (id === S.captain ? mult : 1), 0);
    const left = S.xi.filter((id) => fixturesFor(S.ix, S.ix.players.get(id).team, gw, 1).some((f) => !f.finished)).length;
    const a = $('#hc-pts'), b = $('#hc-left');
    if (a) a.textContent = pts;
    if (b) b.textContent = left ? tr(`još ${left} igra`, `${left} to play`) : tr('svi odigrali', 'all played');
  } catch { /* bez uživo podataka čip ostaje sa tačkicama */ }
}
// zvonce: povrede, igrači bez utakmice i pad cijene
function bell(al) {
  const box = $('#alerts'), btn = $('#bell-btn');
  if (!btn) { box.hidden = true; return; }
  const col = { povreda: '#ffab1b', 'bez utakmice': '#9ff8ff', cijena: '#ff6aa6' };
  box.innerHTML = `<div class="ms-h"><b>${tr('Upozorenja', 'Alerts')}</b><button type="button" class="icon-btn" data-close-al aria-label="${tr('Zatvori', 'Close')}">${ic('close')}</button></div><div class="al-list">${al.map((a) => `<button type="button" class="al-row" data-pid="${a.e.id}"><i style="background:${col[a.kind] || '#fff'}" aria-hidden="true"></i><span>${esc(a.text)}</span></button>`).join('')}</div>`;
  const close = () => { box.hidden = true; btn.setAttribute('aria-expanded', 'false'); };
  btn.onclick = () => { box.hidden = !box.hidden; $('#acct').hidden = true; $('#more').hidden = true; btn.setAttribute('aria-expanded', String(!box.hidden)); if (!box.hidden) box.querySelector('button')?.focus(); };
  box.querySelector('[data-close-al]').onclick = close;
  box.querySelectorAll('.al-row').forEach((r) => { r.addEventListener('click', close); });
}

// ---------- tim: nedavni timovi, promjena tima, meni računa ----------
const recent = () => { try { return JSON.parse(store.get('fm-recent') || '[]').filter((x) => x && /^\d{1,9}$/.test(String(x.id))); } catch { return []; } };
function remember() {
  const me = { id: S.id, n: S.entry.name, m: `${S.entry.player_first_name} ${S.entry.player_last_name}`, d: isDemo() ? 1 : 0 };
  store.set('fm-recent', JSON.stringify([me, ...recent().filter((x) => !(x.id === me.id && x.d === me.d))].slice(0, 6)));
}
function openTeam(id, demo) {
  store.set('fm-id', String(id)); store.set('fm-demo', demo ? '1' : '0');
  reset(); setDemo(!!demo); $('#more').hidden = true; $('#acct').hidden = true;
  history.replaceState(null, '', location.pathname + '#/pregled'); render();
}
function logout() { store.del('fm-id'); store.del('fm-demo'); reset(); setDemo(false); $('#more').hidden = true; $('#acct').hidden = true; history.replaceState(null, '', location.pathname + '#/pregled'); render(); }
async function share() { const url = location.origin + '/?id=' + S.id + (isDemo() ? '&demo=1' : ''); try { await navigator.clipboard.writeText(url); status(tr('Link tima je kopiran.', 'Team link copied.')); } catch { prompt(tr('Link tvog tima', 'Your team link'), url); } }
function bindAcctActions(root) {
  root.querySelectorAll('[data-logout]').forEach((b) => { b.onclick = (e) => { e.preventDefault(); logout(); }; });
  root.querySelectorAll('[data-share]').forEach((b) => { b.onclick = share; });
  root.querySelectorAll('[data-team]').forEach((b) => { b.onclick = () => openTeam(+b.dataset.team, b.dataset.demo === '1'); });
}
const teamRow = (x) => `<button type="button" class="tm-row" data-team="${x.id}" data-demo="${x.d ? 1 : 0}"><span class="av" aria-hidden="true">${esc(String(x.m || x.n || '?').split(' ').map((w) => w[0] || '').join('').slice(0, 2))}</span><span><b>${esc(x.n)}</b><span class="sub">${esc(x.m || '')}${x.d ? ' · ' + tr('primjer', 'demo') : ''}</span></span>${ic('chev')}</button>`;
// meni računa (dodir na inicijale gore desno)
function acct() {
  const box = $('#acct'), btn = $('#acct-btn');
  const others = recent().filter((x) => !(x.id === S.id && !!x.d === isDemo()));
  box.innerHTML = `<div class="ac-me"><span class="av" aria-hidden="true">${initials()}</span><div><b>${esc(S.entry.name)}</b><span class="sub">${esc(S.entry.player_first_name)} ${esc(S.entry.player_last_name)} · ID ${S.id}${isDemo() ? ' · ' + tr('primjer', 'demo') : ''}</span></div></div>
    <div class="ac-acts"><button type="button" class="btn sm" data-logout>${ic('swap')}${tr('Promijeni tim', 'Switch team')}</button><button type="button" class="btn ghost sm" data-share>${ic('link')}${tr('Kopiraj link', 'Copy link')}</button></div>
    ${others.length ? `<p class="ms-g">${tr('Nedavni timovi', 'Recent teams')}</p><div class="tm-list">${others.map(teamRow).join('')}</div>` : ''}
    <div class="more-lang"><span class="sub">${tr('Jezik', 'Language')}</span>${langSwitch()}</div>`;
  bindAcctActions(box); bindLang();
  btn.onclick = () => { box.hidden = !box.hidden; $('#more').hidden = true; $('#alerts').hidden = true; btn.setAttribute('aria-expanded', String(!box.hidden)); if (!box.hidden) box.querySelector('button')?.focus(); };
}

// traka sa rokom za transfere, kao na vrhu FPL stranica
function deadline() {
  const ev = S.ix.events.find((e) => e.id === S.ix.nextGw);
  if (!ev) return '';
  const d = new Date(ev.deadline_time), ms = d - Date.now();
  if (ms <= 0) return '';
  const m = Math.floor(ms / 60000), left = m >= 1440 ? Math.floor(m / 1440) + ' d ' + Math.floor(m / 60) % 24 + ' h' : Math.floor(m / 60) + ' h ' + m % 60 + ' min';
  return `<p class="dl"><b>${tr('Kolo', 'Gameweek')} ${ev.id}</b><span>${tr('Rok', 'Deadline')}: ${dateLong(d)}</span><span class="dl-left">${tr('još ' + left, left + ' left')}</span></p>`;
}

// ---------- kartica igrača ----------
// poređenje dva igrača: bolja vrijednost u redu je zelena
function compare(ix, a, b) {
  const rows = [[tr('Cijena', 'Price'), (x) => x.now_cost / 10, (v) => '£' + fmt(v) + 'm', -1], [tr('Predviđeno, 5 kola', 'Predicted, 5 GWs'), (x) => xp(ix, x, ix.nextGw, 5), fmt, 1], [tr('Forma', 'Form'), (x) => num(x.form), fmt, 1], [tr('Bodova po utakmici', 'Points per match'), (x) => num(x.points_per_game), fmt, 1], [tr('Ukupno bodova', 'Total points'), (x) => x.total_points, String, 1], [tr('Golovi', 'Goals'), (x) => x.goals_scored || 0, String, 1], [tr('Asistencije', 'Assists'), (x) => x.assists || 0, String, 1], [tr('xG na 90 min', 'xG per 90'), (x) => num(x.expected_goals_per_90), (v) => fmt(v, 2), 1], [tr('xA na 90 min', 'xA per 90'), (x) => num(x.expected_assists_per_90), (v) => fmt(v, 2), 1], [tr('Minute', 'Minutes'), (x) => x.minutes, String, 1], [tr('Vlasništvo', 'Ownership'), (x) => num(x.selected_by_percent), (v) => fmt(v) + '%', 0]];
  // jedan na jedan: vrijednosti lijevo i desno, naziv u sredini, trake pokazuju odnos
  const side = (e) => `<div class="cmp-pl"><span class="shirt">${shirt(ix.teams.get(e.team), e.element_type === 1)}${photo(e)}</span><b>${esc(e.web_name)}</b><span class="sub">${esc(ix.teams.get(e.team).short_name)} · £${price(e)}m</span></div>`;
  const row = ([k, g, f, d]) => {
    const va = g(a), vb = g(b), mx = Math.max(Math.abs(va), Math.abs(vb)) || 1;
    const wa = d && va !== vb && (d > 0 ? va > vb : va < vb), wb = d && va !== vb && !wa;
    return `<div class="cmp-r"><b class="${wa ? 'win' : ''}">${f(va)}</b><span class="cmp-k">${k}</span><b class="${wb ? 'win' : ''}">${f(vb)}</b><span class="cmp-bar l"><i style="width:${(Math.abs(va) / mx * 100).toFixed(0)}%"></i></span><span class="cmp-bar r"><i style="width:${(Math.abs(vb) / mx * 100).toFixed(0)}%"></i></span></div>`;
  };
  const fx = (e) => `<span class="fx3">${[0, 1, 2].map((k) => fdrChip(ix, e, ix.nextGw + k)).join('')}</span>`;
  const wins = rows.filter(([, g, , d]) => d && g(a) !== g(b)).map(([, g, , d]) => (d > 0 ? g(a) > g(b) : g(a) < g(b)));
  const wa = wins.filter(Boolean).length, wb = wins.length - wa;
  return `<div class="cmp2" role="group" aria-label="${tr('Poređenje', 'Comparing')} ${esc(a.web_name)} ${tr('i', 'and')} ${esc(b.web_name)}"><div class="cmp-h">${side(a)}<span class="cmp-vs"><b>${wa} : ${wb}</b><span class="sub">${tr('bolji u', 'better in')}</span></span>${side(b)}</div>${rows.map(row).join('')}<div class="cmp-r fxr"><span>${fx(a)}</span><span class="cmp-k">${tr('Sljedeća 3', 'Next 3')}</span><span>${fx(b)}</span></div></div>`;
}

async function openPlayer(id) {
  const ix = S.ix, e = ix.players.get(id), dlg = $('#pd');
  if (!e) return;
  const t = ix.teams.get(e.team);
  const nextFx = fixturesFor(ix, e.team, ix.nextGw, 5);
  const xp5 = xp(ix, e, ix.nextGw, 5);
  const top = `<div class="pd-top"><div class="shirt">${shirt(t, e.element_type === 1)}${photo(e)}</div><div class="pd-name"><p class="sub">${POS_BS[e.element_type]} · ${esc(t.name)}</p><h2 id="pd-h">${esc(e.web_name)}</h2><p class="pd-tags"><span class="chg nt">£${price(e)}m</span><span class="chg vi">${fmt(xp5)} ${tr('pred. 5 kola', 'pred. 5 GWs')}</span>${S.ids.includes(e.id) ? `<span class="chg up">${tr('u tvom timu', 'in your team')}</span>` : ''}</p></div><button type="button" class="icon-btn" data-close aria-label="${tr('Zatvori', 'Close')}">${ic('close')}</button></div>`;
  const stats = [[tr('Forma', 'Form'), fmt(num(e.form))], [tr('Bodovi', 'Points'), e.total_points], [tr('Golovi', 'Goals'), e.goals_scored ?? '–'], [tr('Asist.', 'Assists'), e.assists ?? '–'], [tr('Minute', 'Minutes'), e.minutes], [tr('Vlasn.', 'Owned'), fmt(num(e.selected_by_percent)) + '%'], ['xG/90', fmt(num(e.expected_goals_per_90), 2)], ['xA/90', fmt(num(e.expected_assists_per_90), 2)]];
  const fxs = nextFx.map((f) => { const d = new Date(f.kickoff), o = ix.teams.get(f.opp); return `<div class="pfx d${f.fdr}" title="${esc(o.name)}, ${f.home ? tr('kod kuće', 'home') : tr('u gostima', 'away')}, ${dayShort(d)} ${dateShort(d)}"><span class="pfx-gw">${tr('K', 'GW')}${f.gw}</span><b>${esc(o.short_name)}</b><span class="pfx-ha">${f.home ? tr('kod kuće', 'home') : tr('gost', 'away')}</span><span class="pfx-xp">${fmt(xp(ix, e, f.gw, 1))}</span></div>`; }).join('');
  dlg.innerHTML = `${top}<div class="pd-in">${e.news ? `<p class="alert"><span class="dot" aria-hidden="true"></span><span>${esc(e.news)}</span></p>` : ''}
    <div class="pd-stats">${stats.map(([k, v]) => `<div><span class="sub">${k}</span><b>${esc(String(v))}</b></div>`).join('')}</div>
    <h3 class="ct pd-h3">${tr('Sljedeće utakmice', 'Next matches')}</h3><p class="sub">${tr('Boja je težina protivnika, broj su predviđeni bodovi', 'Colour is opponent difficulty, the number is predicted points')}</p>${fxs ? `<div class="pfxs">${fxs}</div>` : `<p class="muted">${tr('Nema zakazanih utakmica.', 'No scheduled matches.')}</p>`}
    <p class="sub" style="margin-top:8px">${esc(reason(ix, e))}</p>
    <h3 class="ct pd-h3">${tr('Bodovi po kolima', 'Points per gameweek')}</h3><div id="pd-hist"><div class="sk" style="height:110px;margin-top:10px"></div></div>
    <h3 class="ct pd-h3">${tr('Uporedi', 'Compare')}</h3><label class="field" style="margin-top:8px"><span class="sr">${tr('Uporedi sa igračem', 'Compare with a player')}</span><input id="pd-cmp" list="pd-cmp-list" placeholder="${tr('Upiši ime igrača za poređenje', 'Type a player name to compare')}" autocomplete="off"></label><datalist id="pd-cmp-list">${[...ix.players.values()].filter((x) => x.element_type === e.element_type && x.id !== e.id && x.minutes > 0).sort((a, b) => b.total_points - a.total_points).slice(0, 80).map((x) => `<option value="${esc(x.web_name)}">`).join('')}</datalist><div id="pd-cmp-res"></div></div>`;
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
    $('#pd-hist').innerHTML = hist.length ? `<div class="pbars" role="img" aria-label="${tr('Bodovi po kolima', 'Points per gameweek')}: ${hist.map((h) => tr('kolo ', 'gameweek ') + h.round + ' ' + h.total_points).join(', ')}">${hist.map((h) => `<div class="pbar${h.total_points >= 6 ? ' hi' : !h.minutes ? ' z' : ''}"><b>${h.total_points}</b><i style="height:${Math.max(4, h.total_points / mx * 100)}%"></i><span>${h.round}</span></div>`).join('')}</div><p class="sub" style="margin-top:6px">${tr(`${sumPts} bodova u ${hist.length} ${hist.length === 1 ? 'kolu' : 'kola'}, najviše ${Math.max(...hist.map((h) => h.total_points))}. Zeleno je 6 ili više.`, `${sumPts} points in ${hist.length} ${hist.length === 1 ? 'gameweek' : 'gameweeks'}, best ${Math.max(...hist.map((h) => h.total_points))}. Green is 6 or more.`)}</p>` : `<p class="muted">${tr('Još nema odigranih kola.', 'No gameweeks played yet.')}</p>`;
  } catch { $('#pd-hist').innerHTML = `<p class="muted">${tr('Historija igrača trenutno nije dostupna.', 'Player history is not available right now.')}</p>`; }
}
document.addEventListener('click', (ev) => {
  const p = ev.target.closest('[data-pid]');
  if (p && S.ready) { ev.preventDefault(); openPlayer(+p.dataset.pid); }
  const more = $('#more');
  if (!more.hidden && !ev.target.closest('#more, #more-btn')) { more.hidden = true; $('#more-btn')?.setAttribute('aria-expanded', 'false'); }
  const ac = $('#acct');
  if (ac && !ac.hidden && !ev.target.closest('#acct, #acct-btn')) { ac.hidden = true; $('#acct-btn')?.setAttribute('aria-expanded', 'false'); }
  const alb = $('#alerts');
  if (alb && !alb.hidden && !ev.target.closest('#alerts, #bell-btn')) { alb.hidden = true; $('#bell-btn')?.setAttribute('aria-expanded', 'false'); }
});
$('#pd').addEventListener('click', (ev) => { if (ev.target === $('#pd')) $('#pd').close(); });

// ---------- pretraga (Ctrl+K) ----------
const norm = (t) => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ø/g, 'o').replace(/đ/g, 'dj');
function openCmd() {
  if (!S.ready) return;
  const dlg = $('#cmd'), ix = S.ix;
  dlg.innerHTML = `<div class="cmd-in"><label class="cmd-q">${ic('search')}<span class="sr">${tr('Traži', 'Search')}</span><input id="cmd-q" role="combobox" aria-controls="cmd-list" aria-expanded="true" aria-autocomplete="list" type="search" enterkeyhint="search" placeholder="${tr('Igrač, klub ili ekran', 'Player, club or screen')}" autocomplete="off" spellcheck="false"><kbd>Esc</kbd><button type="button" class="cmd-x" aria-label="${tr('Zatvori pretragu', 'Close search')}">${tr('Zatvori', 'Close')}</button></label><p class="cmd-hint sub" id="cmd-hint"></p><ul id="cmd-list" role="listbox" aria-label="${tr('Rezultati', 'Results')}"></ul></div>`;
  const q = $('#cmd-q'), list = $('#cmd-list');
  dlg.querySelector('.cmd-x').onclick = () => dlg.close();
  let items = [], act = 0;
  const draw = () => {
    const v = norm(q.value.trim());
    const routes = ROUTES.filter(([k, t]) => !v || norm(t).includes(v)).map(([k, t, i]) => ({ kind: 'r', k, t, i }));
    // već od prvog slova: jedno slovo traži početak imena, više slova bilo gdje u imenu, prezimenu ili klubu
    const hit = (e) => { const a = norm(e.web_name), b = norm(e.second_name), f = norm(e.first_name), c = norm(ix.teams.get(e.team).name), cs = norm(ix.teams.get(e.team).short_name); return v.length < 2 ? a.startsWith(v) || b.startsWith(v) : a.includes(v) || b.includes(v) || (f + ' ' + b).includes(v) || c.includes(v) || cs === v; };
    const rank = (e) => (norm(e.web_name).startsWith(v) ? 2 : 0) + (S.ids.includes(e.id) ? 1 : 0);
    const players = !v ? S.ids.map((id) => ix.players.get(id)) : [...ix.players.values()].filter(hit).sort((a, b) => rank(b) - rank(a) || num(b.selected_by_percent) - num(a.selected_by_percent));
    items = [...players.slice(0, v ? 12 : 15).map((e) => ({ kind: 'p', e })), ...routes.slice(0, v ? 3 : 5)];
    act = Math.min(act, Math.max(0, items.length - 1));
    list.innerHTML = items.length ? items.map((it, i) => `<li role="option" id="cmd-${i}" aria-selected="${i === act}" data-i="${i}">${it.kind === 'r' ? `<span class="ci">${ic(it.i)}</span><span>${it.t}</span><span class="sub">${tr('ekran', 'screen')}</span>` : `<span class="ci shirt">${shirt(ix.teams.get(it.e.team), it.e.element_type === 1)}${photo(it.e)}</span><span class="cmd-n"><b>${esc(it.e.web_name)}</b>${S.ids.includes(it.e.id) ? `<em class="cmd-mine">${tr('tvoj', 'yours')}</em>` : ''}<span class="sub">${esc(ix.teams.get(it.e.team).short_name)} · ${POS_BS[it.e.element_type]} · ${it.e.total_points} ${tr('bod.', 'pts')}</span></span><span class="cmd-p">£${price(it.e)}m<span class="sub">${it.e.selected_by_percent}%</span></span>`}</li>`).join('') : `<li class="muted" style="padding:14px">${tr('Nema rezultata.', 'No results.')}</li>`;
    q.setAttribute('aria-activedescendant', items.length ? 'cmd-' + act : '');
    $('#cmd-hint').textContent = v ? `${players.length} ${tr('igrača', 'players')}${players.length > 12 ? tr(', prikazano 12 najpopularnijih', ', showing the 12 most picked') : ''}` : tr('Tvoj tim i ekrani. Kucaj ime igrača ili kluba.', 'Your team and screens. Type a player or club name.');
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
// slike igrača: učitana slika zamijeni dres, neuspjela se makne pa ostaje dres
document.addEventListener('load', (ev) => { if (ev.target.matches?.('img.ph')) ev.target.parentNode.classList.add('has-ph'); }, true);
document.addEventListener('error', (ev) => { if (ev.target.matches?.('img.ph')) ev.target.remove(); }, true);
document.addEventListener('keydown', (ev) => {
  if (ev.key !== 'Escape') return;
  if (!$('#acct').hidden) { $('#acct').hidden = true; $('#acct-btn')?.setAttribute('aria-expanded', 'false'); $('#acct-btn')?.focus(); }
  if (!$('#alerts').hidden) { $('#alerts').hidden = true; $('#bell-btn')?.setAttribute('aria-expanded', 'false'); $('#bell-btn')?.focus(); }
  if (!$('#more').hidden) { $('#more').hidden = true; $('#more-btn')?.setAttribute('aria-expanded', 'false'); $('#more-btn')?.focus(); }
});
$('#cmd').addEventListener('click', (ev) => { if (ev.target === $('#cmd')) $('#cmd').close(); });

// ---------- početni ekran ----------
const url = (id) => `<span class="url" aria-hidden="true"><i>fantasy.premierleague.com</i>/entry/<b>${id}</b>/event/9</span>`;
const HOW = tr({
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
}, {
  pc: [
    ['Open the site', 'Go to <b>fantasy.premierleague.com</b> and log in with your FPL account.'],
    ['Click Points', 'In the top menu open <b>Points</b>. Not Pick Team, that page has no number in the address.'],
    ['Look at the address', `The address bar shows something like: ${url('1234567')} The number after <b>entry</b> is your ID.`],
    ['Paste it here', 'Type that number, or copy the whole address and paste it into the box. We pull the number out for you.']
  ],
  mob: [
    ['Open your browser', 'Open <b>fantasy.premierleague.com</b> in Safari or Chrome on your phone (not in the FPL app) and log in.'],
    ['Open Points', 'Open the menu and choose <b>Points</b>, the page with your team\'s score.'],
    ['Copy the address', `Tap the address bar and copy the link. It looks like this: ${url('1234567')}`],
    ['Paste it here', 'Paste the whole link into the box above. No need to find the number, we pull it out for you.']
  ]
});
const steps = (k) => HOW[k].map(([h, t], i) => `<li><span class="stp-n">${i + 1}</span><div><b>${h}</b><p>${t}</p></div></li>`).join('');
const idOf = (v) => (v.match(/entry\/(\d+)/) || v.match(/^\s*(\d{1,9})\s*$/) || [])[1];

function start(msg = '') {
  const mob = matchMedia('(pointer: coarse)').matches;
  return `<div class="start">
    <section class="g card st-main">
      <div class="st-top"><p class="st-brand"><img src="/img/brand/mark.svg" alt="" width="56" height="56"><span>Squad<em>Jury</em></span></p>${langSwitch()}</div>
      <h1>${tr('Tvoj FPL tim, <span>pregledno</span>', 'Your FPL team, <span>at a glance</span>')}</h1>
      <p class="lead">${tr('Kapiten, transferi, raspored, bodovi uživo i rival iz lige, sa procjenom bodova za svako kolo. Uz to ocjenjuješ tuđe timove.', 'Captain, transfers, fixtures, live points and your league rival, with predicted points for every gameweek. Plus you get to rate other squads.')}</p>
      <form id="login" novalidate><label class="field" for="fid">${tr('Tvoj FPL ID ili link tima', 'Your FPL ID or team link')}</label>
        <div class="st-row field"><input id="fid" inputmode="text" autocomplete="off" placeholder="${tr('npr. 1234567 ili zalijepi link', 'e.g. 1234567 or paste a link')}" aria-describedby="fhint lerr" required><button class="btn" type="submit">${tr('Otvori moj tim', 'Open my team')}</button></div>
        <p class="st-hint" id="fhint" aria-live="polite">${innerWidth > 980 ? tr('Ne znaš svoj ID? Uputstvo je desno, traje pola minute.', 'Don\'t know your ID? The steps are on the right, it takes half a minute.') : tr('Ne znaš svoj ID? Uputstvo je ispod, traje pola minute.', 'Don\'t know your ID? The steps are below, it takes half a minute.')}</p>
        <p class="err" id="lerr" role="alert">${esc(msg)}</p></form>
      <details class="st-find" id="st-find"><summary>${ic('search')}<span>${tr('Ne znaš ID? Nađi tim po imenu', 'No ID? Find your team by name')}</span></summary>
        <form id="find" novalidate>
          <p class="sub">${tr('FPL ne nudi pretragu svih timova, pa tražimo unutar lige u kojoj si: liga sa prijateljima, liga tvog kluba ili države. Broj lige je u adresi kad je otvoriš na FPL-u (/leagues/<b>broj</b>/).', 'FPL has no search across all teams, so we search inside a league you are in: your friends\' league, your club\'s or your country\'s league. The league number is in the address when you open it on FPL (/leagues/<b>number</b>/).')}</p>
          <div class="st-find-f"><label class="field">${tr('Ime tima ili menadžera', 'Team or manager name')}<input id="fq" autocomplete="off" placeholder="${tr('npr. Graba FC ili Ahmed', 'e.g. Graba FC or Ahmed')}"></label>
          <label class="field">${tr('Liga (broj ili link)', 'League (number or link)')}<input id="fl" inputmode="text" autocomplete="off" placeholder="${tr('npr. 123456', 'e.g. 123456')}"></label></div>
          <button class="btn" type="submit">${ic('search')}${tr('Traži', 'Search')}</button>
          <div id="fres" aria-live="polite"></div>
        </form></details>
      ${recent().length ? `<div class="st-recent"><p class="ms-g">${tr('Nedavni timovi', 'Recent teams')}</p><div class="tm-list">${recent().map(teamRow).join('')}</div></div>` : ''}
      <p class="st-or"><span>${tr('ili', 'or')}</span></p>
      <button class="btn ghost st-demo" type="button" id="demo">${tr('Pogledaj primjer bez prijave', 'Try a demo team first')}</button>
      <p class="sub st-note">${tr('Ne tražimo lozinku ni email. Koriste se samo javni podaci tvog tima. Nezvanična aplikacija, nije povezana sa Premier League.', 'We never ask for a password or email. Only your team\'s public data is used. Unofficial app, not affiliated with the Premier League.')}</p>
    </section>
    <section class="g card st-how" aria-labelledby="h-how">
      <h2 id="h-how" class="ct">${tr('Kako da nađem svoj FPL ID?', 'How do I find my FPL ID?')}</h2>
      <p class="sub">${tr('ID je broj tvog tima na FPL-u. Isti je cijelu sezonu, pa ga upisuješ samo jednom.', 'Your ID is your team\'s number on FPL. It stays the same all season, so you only enter it once.')}</p>
      <div class="seg st-tabs" role="group" aria-label="${tr('Uređaj', 'Device')}"><button type="button" data-how="pc" aria-pressed="${!mob}">${tr('Računar', 'Computer')}</button><button type="button" data-how="mob" aria-pressed="${mob}">${tr('Mobitel', 'Phone')}</button></div>
      <ol class="stp" id="how">${steps(mob ? 'mob' : 'pc')}</ol>
      <p class="st-tip">${tr('<b>Drugi način:</b> u bilo kojoj ligi na FPL-u klikni na svoje ime u tabeli. I tada je u adresi /entry/<b>broj</b>/.', '<b>Another way:</b> in any league on FPL, click your own name in the table. The address then also shows /entry/<b>number</b>/.')}</p>
    </section>
  </div>`;
}
function bindStart() {
  const f = $('#login');
  if (!f) return;
  bindLang();
  const fid = $('#fid'), hint = $('#fhint');
  fid.oninput = () => {
    const id = idOf(fid.value);
    $('#lerr').textContent = '';
    hint.classList.toggle('ok', !!id);
    hint.textContent = id ? tr(`Pronađen ID: ${id}. Klikni Otvori moj tim.`, `Found ID: ${id}. Click Open my team.`) : fid.value.trim() ? tr('U ovome nema broja tima. Treba broj ili link sa /entry/broj/.', 'There is no team number in this. Use a number or a link with /entry/number/.') : tr('Upiši broj ili zalijepi link.', 'Type a number or paste a link.');
  };
  f.onsubmit = (e) => {
    e.preventDefault();
    const id = idOf(fid.value);
    if (!id) { $('#lerr').textContent = tr('Upiši broj (FPL ID) ili zalijepi link sa Points stranice.', 'Type your number (FPL ID) or paste the link from the Points page.'); fid.focus(); return; }
    store.set('fm-id', id); store.set('fm-demo', '0'); setDemo(false); render();
  };
  $('#demo').onclick = () => { store.set('fm-id', '1'); store.set('fm-demo', '1'); setDemo(true); render(); };
  bindAcctActions($('#main'));
  // traženje tima po imenu unutar lige
  const ff = $('#find'), res = $('#fres');
  ff.onsubmit = async (e) => {
    e.preventDefault();
    const q = $('#fq').value.trim(), l = $('#fl').value.trim();
    if (q.length < 2) { res.innerHTML = `<p class="err">${tr('Upiši bar 2 slova imena.', 'Type at least 2 letters of the name.')}</p>`; $('#fq').focus(); return; }
    if (!/\d/.test(l)) { res.innerHTML = `<p class="err">${tr('Upiši broj lige ili zalijepi njen link.', 'Type the league number or paste its link.')}</p>`; $('#fl').focus(); return; }
    res.innerHTML = `<div class="sk" style="height:56px;margin-top:10px"></div>`;
    try {
      const r = await fetch('/api/find?league=' + encodeURIComponent(l) + '&q=' + encodeURIComponent(q));
      const d = await r.json();
      if (!r.ok) { const x = new Error('find'); x.status = r.status; throw x; }
      const rows = d.results.map((x) => ({ id: x.entry, n: x.entry_name, m: x.player_name + (x.rank ? ` · ${x.rank}.` : ''), d: 0 }));
      res.innerHTML = rows.length ? `<p class="sub" style="margin:10px 0 6px">${esc(d.league?.name || '')}: ${tr('dodirni svoj tim', 'tap your team')}</p><div class="tm-list">${rows.map(teamRow).join('')}</div>` : `<p class="muted" style="margin-top:10px">${tr(`Nema tima sa tim imenom među prvih ${d.scanned} u ovoj ligi.`, `No team with that name among the first ${d.scanned} in this league.`)}${d.more ? tr(' Liga je velika, probaj manju ligu.', ' The league is big, try a smaller one.') : ''}</p>`;
      bindAcctActions(res);
    } catch (err) {
      res.innerHTML = `<p class="err">${esc(err.status === 404 ? tr('Ne postoji liga sa tim brojem.', 'There is no league with that number.') : err.status === 400 ? tr('Upiši broj lige ili zalijepi njen link.', 'Type the league number or paste its link.') : tr('Pretraga trenutno ne radi. Pokušaj za minut.', 'Search is not working right now. Try again in a minute.'))}</p>`;
    }
  };
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
      busy = load(+saved).catch((e) => { store.del('fm-id'); reset(); main.innerHTML = start(e.status === 404 ? tr('Ne postoji tim sa tim ID-om.', 'There is no team with that ID.') : e.message); bindStart(); }).finally(() => { busy = null; });
    }
    await busy;
    if (!S.ready || my !== seq) return;
  }
  if (S.id && S.remembered !== S.id) { S.remembered = S.id; remember(); }
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
    main.innerHTML = `<section class="g card"><h1 class="ct">${tr('Ovaj dio se nije učitao', 'This part did not load')}</h1><p class="muted" style="margin-top:8px">${esc(e.status === 502 ? tr('FPL trenutno ne odgovara. To se dešava dok se ažurira kolo. Pokušaj za koju minutu.', 'FPL is not responding right now. This happens while a gameweek is being updated. Try again in a few minutes.') : e.message || tr('Nepoznata greška.', 'Unknown error.'))}</p><p style="margin-top:12px"><button class="btn" type="button" id="retry">${tr('Pokušaj ponovo', 'Try again')}</button></p></section>`;
    $('#retry').onclick = () => render();
  }
  document.title = v.title + ' · SquadJury';
}

let warmed = false;
// pređeš mišem ili tabom preko linka u meniju: podaci tog ekrana se počnu učitavati
const pre = (ev) => { const a = ev.target.closest?.('a[href^="#/"]'); const k = a?.getAttribute('href').slice(2); if (S.ready && VIEWS[k]?.prefetch) VIEWS[k].prefetch(); };
addEventListener('pointerover', pre, { passive: true });
addEventListener('focusin', pre);
addEventListener('hashchange', () => { $('#more').hidden = true; $('#acct').hidden = true; $('#alerts').hidden = true; render(); if (!calm) scrollTo(0, 0); $('#main').focus({ preventScroll: true }); });
const q = new URLSearchParams(location.search);
if (q.get('id') && /^\d{1,9}$/.test(q.get('id'))) { store.set('fm-id', q.get('id')); store.set('fm-demo', q.get('demo') === '1' ? '1' : '0'); history.replaceState(null, '', location.pathname + location.hash); }
else if (q.get('demo') === '1') { store.set('fm-id', '1'); store.set('fm-demo', '1'); history.replaceState(null, '', location.pathname + location.hash); }
render();
if ('serviceWorker' in navigator && location.hostname !== 'localhost') navigator.serviceWorker.register('/sw.js').catch(() => {});
