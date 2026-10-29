// Trofeji: nagrade iz privatne lige (menadžer kola, kapiten kola, skok kola, vrh lige), u obliku valjaka.
import { S, historyOf, picksOf, teamOf, live } from '../state.js';
import { get } from '../api.js';
import { leagueAwards, int } from '../model.js';
import { esc, leaguePick } from '../ui.js';
import { tr, plural } from '../i18n.js';

export const title = tr('Trofeji', 'Trophies');
const MAX_MEMBERS = 50, CAP_MEMBERS = 20, CAP_GWS = 4;

const KINDS = {
  mgr: { c: 'cy', t: tr('Menadžer', 'Manager'), s: tr('kola', 'of the week'), d: tr('Najviše bodova u ligi u kolu', 'Most points in the league in a gameweek'), u: (n) => plural(n, ['bod', 'boda', 'bodova'], ['pt', 'pts']) },
  cap: { c: 'ye', t: tr('Kapiten', 'Captain'), s: tr('kola', 'of the week'), d: tr(`Najbolji kapiten u ligi (zadnja ${CAP_GWS} kola, prvih ${CAP_MEMBERS} na tabeli)`, `Best captain in the league (last ${CAP_GWS} gameweeks, top ${CAP_MEMBERS} in the table)`), u: (n) => plural(n, ['bod kapitena', 'boda kapitena', 'bodova kapitena'], ['captain pt', 'captain pts']) },
  jump: { c: 'gr', t: tr('Skok', 'Climber'), s: tr('kola', 'of the week'), d: tr('Najveći skok na tabeli lige u kolu', 'Biggest climb in the league table in a gameweek'), u: (n) => plural(n, ['mjesto gore', 'mjesta gore', 'mjesta gore'], ['place up', 'places up']) },
  top: { c: 'wh', t: tr('Vrh', 'Top'), s: tr('lige', 'of the league'), d: tr('Prvo mjesto u ligi poslije kola', 'First place in the league after a gameweek'), u: () => tr('ukupno', 'total') }
};

// naš znak u jednoj boji, kao lav na PL valjcima
const MARK = '<svg class="tro-mark" viewBox="0 0 100 100" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M33 50A13 13 0 0 1 33 76H25" stroke-width="9"/><path d="M28 68.5L20 76L28 83.5" stroke-width="7"/><path d="M33 50A13 13 0 0 1 33 24H44" stroke-width="9"/><path d="M41 16.5L49 24L41 31.5" stroke-width="7"/><path d="M60 60L68 74L84 24" stroke-width="9.5"/></g></svg>';

/** n poslova, najviše k istovremeno */
async function pool(items, k, fn) {
  const out = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(k, items.length) }, async () => { while (i < items.length) { const j = i++; out[j] = await fn(items[j]).catch(() => null); } }));
  return out;
}

const store = { get: (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* bez spremnika */ } } };

// kapiteni kola: bodovi kapitena svakog člana (odigrana kola se ne mijenjaju, pa se pamte u pregledniku)
async function captains(lid, rows, gws) {
  const caps = new Map();
  for (const gw of gws) {
    const key = `fm-tro-${lid}-${gw}`, saved = gw < S.ix.currentGw || S.ix.events.find((e) => e.id === gw)?.finished ? store.get(key) : null;
    if (saved) { caps.set(gw, new Map(saved)); continue; }
    const lv = await live(gw);
    const pts = await pool(rows, 8, async (r) => { const p = await picksOf(r.entry, gw), t = teamOf(p); const mins = (id) => lv.get(id)?.minutes || 0; const id = mins(t.captain) || !t.vice || !mins(t.vice) ? t.captain : t.vice; return [r.entry, (lv.get(id)?.total_points || 0) * (p.active_chip === '3xc' ? 3 : 2)]; });
    const m = new Map(pts.filter(Boolean));
    caps.set(gw, m);
    if (S.ix.events.find((e) => e.id === gw)?.finished) store.set(key, [...m]);
  }
  return caps;
}

const pick = () => { const priv = S.leagues.filter((l) => l.mine); return { priv, lid: priv.some((l) => l.id === S.troLeague) ? S.troLeague : priv.some((l) => l.id === S.leagueId) ? S.leagueId : priv[0]?.id }; };

export async function render() {
  const { priv, lid } = pick();
  const head = (sub) => `<div class="head"><div><h1>${tr('Trofeji', 'Trophies')}</h1><p class="sub">${sub}</p></div>${priv.length > 1 ? leaguePick(priv, lid, 'tro-sel') : ''}</div>`;
  if (!lid) return head(tr('Nagrade iz tvojih privatnih liga.', 'Awards from your private leagues.')) + `<section class="g card"><p class="muted">${tr('Ovaj tim nije ni u jednoj privatnoj ligi. Trofeji se dijele samo u privatnim ligama, gdje se takmičiš sa prijateljima.', 'This team is not in any private league. Trophies are only awarded in private leagues, where you play against friends.')}</p></section>`;
  const L = await get('/league/' + lid);
  const rows = L.standings.results.slice(0, MAX_MEMBERS);
  if (!rows.some((r) => r.entry === S.id)) rows.push({ entry: S.id, entry_name: S.entry.name });
  const hists = await pool(rows, 8, (r) => (r.entry === S.id ? Promise.resolve(S.history) : historyOf(r.entry)));
  const members = rows.map((r, i) => ({ entry: r.entry, hist: hists[i]?.current || [] })).filter((m) => m.hist.length);
  const capRows = rows.slice(0, CAP_MEMBERS).concat(rows.slice(CAP_MEMBERS).filter((r) => r.entry === S.id));
  const caps = await captains(lid, capRows, S.history.current.slice(-CAP_GWS).map((h) => h.event)).catch(() => new Map());
  const aw = leagueAwards(members, S.id, caps);
  const by = (k) => aw.filter((a) => a.type === k);
  const lname = esc(L.league.name);

  const cyl = (k) => {
    const K = KINDS[k], list = by(k), last = list[list.length - 1];
    return `<figure class="tro ${K.c}${list.length ? '' : ' none'}" aria-label="${K.t} ${K.s}: ${list.length}">
      <div class="tro-body"><span class="tro-top" aria-hidden="true"></span>${MARK}
        <figcaption><b>${K.t}</b><small>${K.s}</small></figcaption>
        <p class="tro-n">${list.length ? '×' + list.length : tr('još nema', 'not yet')}</p>
        <div class="tro-foot"><span>${last ? `${tr('K', 'GW')}${last.gw} · ${int(last.val)} ${K.u(last.val)}` : lname}</span></div></div></figure>`;
  };
  const all = aw.slice().sort((a, b) => b.gw - a.gw || a.type.localeCompare(b.type));
  return head(tr(`Nagrade iz lige ${lname}, kolo po kolo. Računaju se iz javnih FPL podataka članova lige.`, `Awards from ${lname}, gameweek by gameweek. Worked out from the league members' public FPL data.`)) + `
    <section class="tro-stage" aria-label="${tr('Polica sa trofejima', 'Trophy shelf')}"><div class="tro-shelf">${['mgr', 'cap', 'jump', 'top'].map(cyl).join('')}</div></section>
    <div class="grid2 mt">
      <section class="g card" aria-labelledby="h-tro"><div class="ch"><h2 id="h-tro" class="ct">${tr('Sve nagrade', 'All awards')}</h2><span class="chg vi">${aw.length}</span></div>
        ${all.length ? `<div class="list">${all.map((a) => `<div class="li tro-li"><i class="tro-dot ${KINDS[a.type].c}" aria-hidden="true"></i><span><b>${KINDS[a.type].t} ${KINDS[a.type].s}</b><br><span class="sub">${tr('Kolo', 'Gameweek')} ${a.gw}</span></span><b class="cond" style="font-size:22px">${int(a.val)} <small class="sub">${KINDS[a.type].u(a.val)}</small></b></div>`).join('')}</div>` : `<p class="muted">${tr('Još nema nagrada u ovoj ligi. Jedno dobro kolo i prvi trofej stiže.', 'No awards in this league yet. One good gameweek and the first trophy is yours.')}</p>`}</section>
      <section class="g card"><h2 class="ct">${tr('Kako se dijele', 'How they are awarded')}</h2><div class="list" style="margin-top:10px">${Object.values(KINDS).map((K) => `<p class="li tro-li"><i class="tro-dot ${K.c}" aria-hidden="true"></i><span><b>${K.t} ${K.s}</b><br><span class="sub">${K.d}</span></span></p>`).join('')}</div>
        <p class="sub" style="margin-top:10px">${tr(`Gleda se prvih ${MAX_MEMBERS} timova sa tabele i ti. Kad više timova ima isti rezultat, nagradu dobiju svi.`, `The top ${MAX_MEMBERS} teams in the table plus you are counted. When teams are level, they all get the award.`)}</p></section>
    </div>`;
}

export function bind(rerender) {
  const sel = document.getElementById('tro-sel');
  if (sel) sel.onchange = () => { S.troLeague = +sel.value; rerender(); };
}
