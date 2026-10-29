// Zajednički dijelovi prikaza: ikone, dresovi, oznake težine, formatiranje.
import { fixturesFor, xp, fmt, price } from './model.js';
import { tr, lang } from './i18n.js';

export const $ = (s, el = document) => el.querySelector(s);
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const ICON = {
  home: '<path d="M4 11l8-7 8 7v9H4z"/>', team: '<path d="M8 4l-4 2 1.5 4L8 9v11h8V9l2.5 1L20 6l-4-2c-.5 1.5-2 2.5-4 2.5S8.5 5.5 8 4z"/>',
  cap: '<circle cx="12" cy="12" r="8"/><path d="M14.5 9.5a3.5 3.5 0 1 0 0 5"/>', swap: '<path d="M7 7h11l-3-3M17 17H6l3 3"/>',
  cal: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>', live: '<circle cx="12" cy="12" r="2.5"/><path d="M7 7a7 7 0 0 0 0 10M17 7a7 7 0 0 1 0 10M4.5 4.5a10.5 10.5 0 0 0 0 15M19.5 4.5a10.5 10.5 0 0 1 0 15"/>',
  vs: '<path d="M5 5l6 14M11 5L5 19M14 9.5c0-1.5 1.2-2.5 3-2.5s3 1 3 2.2c0 3-6 2-6 5.3 0 1.4 1.3 2.5 3 2.5s3-1 3-2.5"/>',
  cup: '<path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8.5 20h7"/>', star: '<path d="M12 4l2.4 5 5.4.7-4 3.8 1 5.4L12 16.3 7.2 18.9l1-5.4-4-3.8 5.4-.7z"/>',
  book: '<path d="M5 4h9a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h9"/>', out: '<path d="M10 6H6v12h4M14 8l4 4-4 4M18 12H9"/>',
  more: '<circle cx="6" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="18" cy="12" r="1.6"/>', close: '<path d="M6 6l12 12M18 6L6 18"/>',
  spark: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 16l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z"/>',
  jury: '<rect x="6" y="3.5" width="12" height="17" rx="2"/><path d="M9.5 8.5h5M9.5 12h5M9.5 15.5h3"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4 4"/>',
  share: '<path d="M12 4v11M8 8l4-4 4 4M5 14v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4"/>', link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>'
};
export const ic = (k) => '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">' + ICON[k] + '</svg>';

// meni: [ruta, naziv, ikona, grupa]
const G = { tim: tr('Tim', 'Team'), kolo: tr('Kolo', 'Gameweek'), ti: tr('Ti', 'You') };
export const ROUTES = [
  ['pregled', tr('Pregled', 'Overview'), 'home', G.tim], ['tim', tr('Moj tim', 'My team'), 'team', G.tim], ['kapiten', tr('Kapiten', 'Captain'), 'cap', G.tim], ['transferi', tr('Transferi', 'Transfers'), 'swap', G.tim], ['raspored', tr('Raspored', 'Fixtures'), 'cal', G.tim],
  ['uzivo', tr('Uživo', 'Live'), 'live', G.kolo], ['kutak', tr('Zanimljivosti', 'Records'), 'spark', G.kolo], ['rival', 'Rival', 'vs', G.kolo], ['liga', tr('Liga', 'League'), 'cup', G.kolo],
  ['karijera', tr('Karijera', 'Career'), 'star', G.ti], ['vodic', tr('Vodič', 'Guide'), 'book', G.ti]
];
export const TABS = ['pregled', 'tim', 'uzivo', 'transferi'];

// dresovi po klubu (samo boje i šare, bez grbova): b tijelo, s rukavi, st pruge, t kragna
const KIT = {
  ARS: { b: '#e2263e', s: '#fff' }, AVL: { b: '#7a003c', s: '#95bfe5' }, BOU: { b: '#da291c', st: '#111' }, BRE: { b: '#e30613', st: '#fff', t: '#111' }, BHA: { b: '#0057b8', st: '#fff' },
  CHE: { b: '#1f4cc7', t: '#fff' }, COV: { b: '#6bb8e6', t: '#fff' }, CRY: { b: '#1b458f', st: '#c4122e' }, EVE: { b: '#274488', t: '#fff' }, FUL: { b: '#f5f5f5', t: '#111' },
  HUL: { b: '#f5a12d', st: '#111' }, IPS: { b: '#3a64a3', s: '#fff' }, LEE: { b: '#f5f5f5', t: '#1d428a' }, LIV: { b: '#c8102e', t: '#f6eb61' }, MCI: { b: '#8cc5f0', t: '#fff' },
  MUN: { b: '#da291c', t: '#111' }, NEW: { b: '#222', st: '#f5f5f5' }, NFO: { b: '#dd0000', t: '#fff' }, TOT: { b: '#f5f5f5', t: '#132257' }, SUN: { b: '#eb172b', st: '#fff' },
  WHU: { b: '#7a263a', s: '#1bb1e7' }, WOL: { b: '#fdb913', t: '#231f20' }, BUR: { b: '#6c1d45', s: '#99d6ea' }, LUT: { b: '#f78f1e', t: '#002a5c' }, SOU: { b: '#d71920', st: '#fff' },
  LEI: { b: '#003090', t: '#fdbe11' }, SHU: { b: '#ee2737', st: '#fff' }
};
// golmani nose drugačiji dres, kao u FPL-u (boje su izmišljene, ne pravi golmanski dresovi)
const GK = ['#22d39a', '#f2e600', '#ff8a1f', '#3cb4ff', '#b4ff00', '#ff5fa2', '#9b7bff'];
export const kit = (t) => { const k = KIT[t?.short_name] || { b: '#8a8a9a' }; return [k.b, k.t || k.s || '#fff']; };
export const shirt = (t, gk = false) => {
  const k = KIT[t?.short_name] || { b: '#8a8a9a' };
  const body = gk ? GK[(t?.id || 0) % GK.length] : k.b, sleeve = gk ? body : k.s || body, trim = gk ? '#111' : k.t || k.s || (k.st && k.st) || '#fff';
  const stripes = !gk && k.st ? [18.3, 24.9, 31.5].map((x) => `<rect x="${x}" y="10.5" width="3.3" height="34.5" fill="${k.st}"/>`).join('') : '';
  return `<svg viewBox="0 0 50 50" aria-hidden="true"><path d="M17 5l-11 6 4 10 5-2z M33 5l11 6-4 10-5-2z" fill="${sleeve}" stroke="rgba(0,0,0,.35)" stroke-width="1.1"/><path d="M15 9l2-4c1 4 4 6 8 6s7-2 8-6l2 4v36H15z" fill="${body}" stroke="rgba(0,0,0,.35)" stroke-width="1.1"/>${stripes}<path d="M6.6 12.4l2.2 5.4M43.4 12.4l-2.2 5.4" stroke="${trim}" stroke-width="1.6" opacity=".8"/><path d="M20 5.5c1.2 3.2 3 4.6 5 4.6s3.8-1.4 5-4.6" fill="none" stroke="${trim}" stroke-width="2.4"/><path d="M15 45h20" stroke="rgba(0,0,0,.25)" stroke-width="2"/></svg>`;
};

/** Boja oznake upitnog igrača kao u FPL-u: žuta 75%, narandžasta 50%, tamnije 25%, crvena ne igra. */
export const flagColor = (e) => { const c = e.chance_of_playing_next_round; if (e.status === 'a' && c == null) return ''; if (['i', 's', 'u', 'n'].includes(e.status) || c === 0) return '#c0020d'; if (c >= 75) return '#ffe65b'; if (c >= 50) return '#ffab1b'; return '#d44401'; };

/** Igrač na terenu u FPL stilu: dres, ime na bijeloj traci, ispod podaci (protivnik i bodovi). attr je data-sel ili data-pid. */
export const pitchCard = (ix, e, { cap, vice, info, attr, pressed, bench, extra = '' }) => { const fc = flagColor(e); return `<button type="button" class="pl${bench ? ' out' : ''}" ${attr}="${e.id}"${pressed != null ? ` aria-pressed="${pressed}"` : ''}${fc && e.news ? ` title="${esc(e.news)}"` : ''}><div class="shirt">${shirt(ix.teams.get(e.team), e.element_type === 1)}${cap ? '<span class="badge c" aria-hidden="true">C</span>' : vice ? '<span class="badge" aria-hidden="true">V</span>' : ''}${fc ? `<span class="flag" style="background:${fc};color:${fc === '#ffe65b' || fc === '#ffab1b' ? '#37003c' : '#fff'}" aria-hidden="true">!</span>` : ''}</div><span class="nm">${esc(e.web_name)}</span>${cap ? `<span class="sr">, ${tr('kapiten', 'captain')}</span>` : vice ? `<span class="sr">, ${tr('vice kapiten', 'vice captain')}</span>` : ''}${bench ? `<span class="sr">, ${tr('na klupi', 'on the bench')}</span>` : ''}${fc ? `<span class="sr">, ${tr('upitan', 'doubtful')}</span>` : ''}<span class="meta">${info}</span>${extra}</button>`; };

export function fdrChip(ix, e, gw, teamId) {
  const fx = fixturesFor(ix, teamId ?? e.team, gw, 1);
  if (!fx.length) return `<span class="fdr none">${tr('bez', 'none')}</span>`;
  return fx.map((f) => `<span class="fdr d${f.fdr}" title="${esc(ix.teams.get(f.opp).name)}${f.home ? tr(', kod kuće', ', home') : tr(', u gostima', ', away')}">${ix.teams.get(f.opp).short_name} (${f.home ? tr('D', 'H') : tr('G', 'A')})</span>`).join('');
}

/** Tekst koji se čita na boji dresa: tamni na svijetloj, bijeli na tamnoj. */
const ink = (hex) => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)); const L = 0.2126 * r + 0.7152 * g + 0.0722 * b; return (L + 0.05) / 0.058 > 1.05 / (L + 0.05) ? '#2b0030' : '#fff'; };
/** Srednje tamne boje dresa malo potamni da bijeli tekst ima dovoljan kontrast. */
const deep = (hex) => ink(hex) === '#fff' ? '#' + [1, 3, 5].map((i) => Math.round(parseInt(hex.slice(i, i + 2), 16) * 0.85).toString(16).padStart(2, '0')).join('') : hex;
export const chip = (ix, e) => { const [a] = kit(ix.teams.get(e.team)); return `<button type="button" class="chip" data-pid="${e.id}" style="--c:${deep(a)};--ci:${ink(a)}"><i>${esc(e.web_name.slice(0, 2).toUpperCase())}</i>${esc(e.web_name)}</button>`; };
export const pbtn = (e, label) => `<button type="button" class="pbtn" data-pid="${e.id}">${esc(label ?? e.web_name)}</button>`;
export const xpTag = (ix, e, from, n) => `<span class="chg vi">${fmt(xp(ix, e, from, n))}</span>`;
export { fmt, price };

export const spark = (pts, col, invert) => {
  if (pts.length < 2) return '';
  const w = 110, h = 40, mx = Math.max(...pts), mn = Math.min(...pts), rng = mx - mn || 1;
  const d = pts.map((p, i) => (i ? 'L' : 'M') + (i * w / (pts.length - 1)).toFixed(1) + ' ' + (invert ? 4 + (p - mn) / rng * (h - 8) : h - 4 - (p - mn) / rng * (h - 8)).toFixed(1)).join(' ');
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true"><path d="${d}" fill="none" stroke="${col}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
};
export const ring = (p, col = 'url(#rg)') => { const r = 40, c = 2 * Math.PI * r; return `<svg width="96" height="96" viewBox="0 0 96 96" aria-hidden="true"><defs><linearGradient id="rg" x1="0" x2="1"><stop offset="0" stop-color="#963cff"/><stop offset="1" stop-color="#05f0ff"/></linearGradient><linearGradient id="rgg" x1="0" x2="1"><stop offset="0" stop-color="#00c46a"/><stop offset="1" stop-color="#05f0ff"/></linearGradient></defs><circle cx="48" cy="48" r="${r}" fill="none" stroke="rgba(255,255,255,.12)" stroke-width="9"/><circle cx="48" cy="48" r="${r}" fill="none" stroke="${col}" stroke-width="9" stroke-linecap="round" stroke-dasharray="${(c * Math.max(0, Math.min(1, p))).toFixed(1)} 999" transform="rotate(-90 48 48)"/></svg>`; };
export const greet = () => { const h = new Date().getHours(); return h < 11 ? tr('Dobro jutro', 'Good morning') : h < 18 ? tr('Dobar dan', 'Good afternoon') : tr('Dobro veče', 'Good evening'); };
export const empty = (t) => `<p class="muted">${t}</p>`;

/** Brojevi sa data-n se izbroje od nule do vrijednosti (ne kad korisnik traži manje pokreta). */
export function countUp(root) {
  if (!root || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const f = { int: (v) => String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, tr('.', ',')), m: (v) => '£' + (lang === 'bs' ? v.toFixed(1).replace('.', ',') : v.toFixed(1)) + 'm' };
  root.querySelectorAll('[data-n]').forEach((el) => {
    const to = +el.dataset.n, fm = f[el.dataset.f] || f.int, t0 = performance.now(), dur = 900;
    const step = (t) => { const k = Math.min(1, (t - t0) / dur), e = 1 - (1 - k) ** 3; el.textContent = fm(to * e); if (k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  });
}

/** Izbor lige: tvoje (privatne) lige pa javne. id je id <select> elementa. */
export function leaguePick(leagues, cur, id = 'lg-sel') {
  if (!leagues.length) return '';
  const opt = (l) => `<option value="${l.id}"${l.id === cur ? ' selected' : ''}>${esc(l.name)}</option>`;
  const mine = leagues.filter((l) => l.mine), pub = leagues.filter((l) => !l.mine);
  return `<label class="field lg-pick">${tr('Liga', 'League')}<select id="${id}">${mine.length && pub.length ? `<optgroup label="${tr('Tvoje lige', 'Your leagues')}">${mine.map(opt).join('')}</optgroup><optgroup label="${tr('Javne lige', 'Public leagues')}">${pub.map(opt).join('')}</optgroup>` : leagues.map(opt).join('')}</select></label>`;
}
