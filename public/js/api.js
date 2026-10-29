// Pozivi prema našem Workeru. U demo modu se dodaje ?demo=1 pa Worker vraća izmišljene podatke.
import { tr } from './i18n.js';
const memo = new Map();
const ERR = { 404: 'No team or league with that number.', 502: 'FPL is not responding right now. Try again in a minute.' };
let demo = false;
export const setDemo = (v) => { demo = !!v; memo.clear(); };
export const isDemo = () => demo;
/** Učitaj u pozadini (greške se ignorišu, rezultat ostaje u kešu). */
/** Zaboravi keširani odgovor (npr. uživo bodovi), pa sljedeći get ide na mrežu. */
export const forget = (path) => { memo.delete('/api' + path + (demo ? '?demo=1' : '')); };
export const warm = (...paths) => { for (const p of paths) get(p).catch(() => {}); };

export async function get(path) {
  const url = '/api' + path + (demo ? '?demo=1' : '');
  if (!memo.has(url)) {
    const pre = window.__pre?.[url];
    if (pre) delete window.__pre[url];
    memo.set(url, (pre || fetch(url)).then(async (r) => {
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { const e = new Error(tr(d.greska || 'Greška ' + r.status, ERR[r.status] || 'Error ' + r.status)); e.status = r.status; throw e; }
      return d;
    }).catch((e) => { memo.delete(url); throw e; }));
  }
  return memo.get(url);
}
