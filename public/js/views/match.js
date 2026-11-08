// Zajednički dijelovi za Bonus i DefCon: kartica utakmice (domaćin, rezultat, gost), dan iznad utakmica i "Više".
import { esc, crest, pbtn } from '../ui.js';
import { tr, lang } from '../i18n.js';

/** Utakmice poredane po početku i grupisane po danu: [{ day, label, items }]. */
export function byDay(list) {
  const out = [];
  for (const x of list) {
    const t = x.f?.kickoff_time ? new Date(x.f.kickoff_time) : null;
    const day = t ? t.toDateString() : '';
    let g = out[out.length - 1];
    if (!g || g.day !== day) { g = { day, label: t ? dayLabel(t) : '', items: [] }; out.push(g); }
    g.items.push(x);
  }
  return out;
}

function dayLabel(t) {
  try { return t.toLocaleDateString(lang === 'bs' ? 'bs-BA' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); }
  catch { return t.toDateString(); }
}

export const dayHead = (g) => (g.label ? `<h2 class="mc-day"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>${esc(g.label)}</h2>` : '');

/** Traka utakmice: domaćin sa grbom, rezultat, gost sa grbom; ispod minuta ili Kraj. */
export function matchHead(ix, f, inSummary = false) {
  const hm = ix.teams.get(f.team_h), aw = ix.teams.get(f.team_a);
  const played = f.team_h_score != null;
  const st = f.finished || f.finished_provisional ? tr('Kraj', 'FT') : f.started ? `${f.minutes || 0}'` : '';
  return `<div class="mc-top"${inSummary ? '' : ` role="img" aria-label="${esc(hm.name)} ${played ? f.team_h_score : ''} ${esc(aw.name)} ${played ? f.team_a_score : ''}"`}>
    <span class="mc-t h"><b>${esc(hm.name)}</b>${crest(hm)}</span>
    <span class="mc-sc${played ? '' : ' v'}">${played ? `<b>${f.team_h_score}</b><i></i><b>${f.team_a_score}</b>` : 'v'}</span>
    <span class="mc-t a">${crest(aw)}<b>${esc(aw.name)}</b></span>
    ${st ? `<span class="mc-st${f.started && !f.finished && !f.finished_provisional ? ' live' : ''}">${st}</span>` : ''}
  </div>`;
}

/** Ime igrača (otvara detalje igrača); tvoji igrači su označeni. */
export const nm = (e, mine) => `<span class="mc-nm${mine.has(e.id) ? ' me' : ''}">${pbtn(e)}</span>`;

/** Lista sa "Više": prvih n stavki odmah, ostale iza dugmeta. */
export function moreList(items, n, cls) {
  if (items.length <= n) return `<div class="${cls}">${items.join('')}</div>`;
  return `<div class="${cls}">${items.slice(0, n).join('')}</div><details class="mc-more"><summary>${tr('Više', 'More')}<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></summary><div class="${cls}">${items.slice(n).join('')}</div></details>`;
}

/** Sklopiva kartica utakmice: zatvorena pokazuje traku i kratak sažetak, klik otvara sve. */
export function matchCard(ix, f, { cls = '', hint = '', body = '' }) {
  const hm = ix.teams.get(f.team_h), aw = ix.teams.get(f.team_a), played = f.team_h_score != null;
  const label = `${hm.name} ${played ? f.team_h_score : ''} ${aw.name} ${played ? f.team_a_score : ''}`;
  return `<details class="mc ${cls}"><summary class="mc-sum" aria-label="${esc(label)}">${matchHead(ix, f, true)}<span class="mc-hint">${hint}<svg class="ico mc-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></span></summary>${body}</details>`;
}
