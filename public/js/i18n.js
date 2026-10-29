// Jezik aplikacije: engleski (zadano) ili bosanski. Izbor se pamti u pregledniku i dijeli ga i SquadJury (/jury).
// Promjena jezika ponovo učita stranicu, pa svaki ekran samo pita tr(bosanski, engleski).
const saved = (() => { try { return localStorage.getItem('sj-lang'); } catch { return null; } })();
export const lang = saved === 'bs' ? 'bs' : 'en';
export const tr = (bs, en) => (lang === 'bs' ? bs : en);

const bsForm = (n, one, few, many) => { const a = Math.abs(n) % 10, b = Math.abs(n) % 100; return a === 1 && b !== 11 ? one : a >= 2 && a <= 4 && (b < 12 || b > 14) ? few : many; };
/** Riječ uz broj: plural(n, ['bod', 'boda', 'bodova'], ['point', 'points']). Engleska množina je "s" ako nije data. */
export const plural = (n, bs, en) => (lang === 'bs' ? bsForm(n, ...bs) : Math.abs(n) === 1 ? en[0] : en[1] ?? en[0] + 's');

export function setLang(l) {
  try { localStorage.setItem('sj-lang', l); } catch { /* bez spremnika */ }
  location.reload();
}

/** Prekidač EN / BS; klik se veže u bindLang. */
export const langSwitch = (cls = '') => `<div class="seg lang-sw ${cls}" role="group" aria-label="Language / Jezik"><button type="button" data-lang="en" aria-pressed="${lang === 'en'}" lang="en">EN<span class="sr"> English</span></button><button type="button" data-lang="bs" aria-pressed="${lang === 'bs'}" lang="bs">BS<span class="sr"> Bosanski</span></button></div>`;
export const bindLang = (root = document) => root.querySelectorAll('[data-lang]').forEach((b) => { b.onclick = () => { if (b.dataset.lang !== lang) setLang(b.dataset.lang); }; });

if (typeof document !== 'undefined') document.documentElement.lang = lang;
