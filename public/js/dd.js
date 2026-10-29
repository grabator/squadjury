// Vlastiti padajući meniji umjesto sistemskih: <select> i polja sa prijedlozima (<input list>).
// Pravi <select> ostaje u stranici (vrijednost, change događaj, forme), samo se ne vidi.
// Tastatura: strelice, Home/End, Enter, Escape, Tab i prvo slovo opcije.

let uid = 0;
const open = new Set();
const closeAll = (except) => { for (const c of [...open]) if (c !== except) c(); };
document.addEventListener('pointerdown', (e) => { if (!e.target.closest('.dd')) closeAll(); });
addEventListener('hashchange', () => closeAll());

const chevron = '<svg class="dd-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';

/** Otvorena lista mora biti iznad susjednih kartica: podigni pretke (svaka kartica ima svoj sloj zbog stakla). */
function raise(wrap, on) {
  for (let el = wrap.parentElement; el && el !== document.body; el = el.parentElement) {
    el.classList.toggle('dd-up', on);
    if (el.tagName === 'MAIN' || el.tagName === 'DIALOG') break;
  }
}

/** Postavi listu tako da stane na ekran: ispod polja, ili iznad ako dole nema mjesta. */
function place(wrap, list) {
  const r = wrap.getBoundingClientRect(), below = innerHeight - r.bottom, above = r.top;
  const up = below < 240 && above > below;
  list.classList.toggle('up', up);
  list.style.maxHeight = Math.max(160, Math.min(340, (up ? above : below) - 16)) + 'px';
}

function enhanceSelect(sel) {
  sel.dataset.enh = '1';
  const id = 'dd' + ++uid;
  const label = sel.closest('label');
  const labelText = label ? [...label.childNodes].filter((n) => n.nodeType === 3 || (n.nodeType === 1 && n !== sel && !n.contains(sel))).map((n) => n.textContent).join(' ').replace(/\s+/g, ' ').trim() : sel.getAttribute('aria-label') || '';
  const wrap = document.createElement('div');
  wrap.className = 'dd';
  wrap.innerHTML = `<button type="button" class="dd-btn" aria-haspopup="listbox" aria-expanded="false" aria-controls="${id}"><span class="dd-val"></span>${chevron}</button><ul class="dd-list" id="${id}" role="listbox" tabindex="-1" hidden></ul>`;
  sel.after(wrap);
  wrap.prepend(sel);
  sel.classList.add('dd-native');
  sel.tabIndex = -1;
  sel.setAttribute('aria-hidden', 'true');
  const btn = wrap.querySelector('.dd-btn'), list = wrap.querySelector('.dd-list'), val = wrap.querySelector('.dd-val');
  let items = [], act = 0;

  const sync = () => {
    const o = sel.options[sel.selectedIndex];
    val.textContent = o ? o.textContent : '';
    btn.setAttribute('aria-label', (labelText ? labelText + ': ' : '') + val.textContent);
  };
  const build = () => {
    items = [];
    let html = '';
    for (const node of sel.children) {
      const opts = node.tagName === 'OPTGROUP' ? [...node.children] : [node];
      if (node.tagName === 'OPTGROUP') html += `<li class="dd-grp" role="presentation">${node.label.replace(/</g, '&lt;')}</li>`;
      for (const o of opts) {
        const i = items.length;
        items.push(o);
        html += `<li role="option" id="${id}-${i}" data-i="${i}" aria-selected="${o.selected}"${o.disabled ? ' aria-disabled="true"' : ''}>${o.textContent.replace(/</g, '&lt;')}</li>`;
      }
    }
    list.innerHTML = html;
  };
  const mark = () => {
    list.querySelectorAll('[role=option]').forEach((li) => li.classList.toggle('act', +li.dataset.i === act));
    list.setAttribute('aria-activedescendant', `${id}-${act}`);
    list.querySelector('.act')?.scrollIntoView({ block: 'nearest' });
  };
  const close = (focus) => {
    if (list.hidden) return;
    list.hidden = true; btn.setAttribute('aria-expanded', 'false'); wrap.classList.remove('on'); open.delete(close); raise(wrap, false);
    if (focus) btn.focus();
  };
  const show = () => {
    closeAll(close);
    build();
    act = Math.max(0, items.findIndex((o) => o.selected));
    list.hidden = false; btn.setAttribute('aria-expanded', 'true'); wrap.classList.add('on'); open.add(close); raise(wrap, true);
    place(wrap, list); mark(); list.focus({ preventScroll: true });
  };
  const choose = (i) => {
    const o = items[i];
    if (!o || o.disabled) return;
    const changed = sel.value !== o.value;
    sel.value = o.value;
    close(true);
    if (changed) sel.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const step = (d) => { let i = act; do { i = Math.max(0, Math.min(items.length - 1, i + d)); } while (items[i]?.disabled && i > 0 && i < items.length - 1); act = i; mark(); };

  btn.onclick = () => (list.hidden ? show() : close(true));
  btn.onkeydown = (e) => { if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); show(); } };
  list.onkeydown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); step(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); step(-1); }
    else if (e.key === 'Home') { e.preventDefault(); act = 0; mark(); }
    else if (e.key === 'End') { e.preventDefault(); act = items.length - 1; mark(); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(act); }
    else if (e.key === 'Escape') { e.preventDefault(); close(true); }
    else if (e.key === 'Tab') close(false);
    else if (e.key.length === 1) { const k = e.key.toLowerCase(), n = items.length; for (let j = 1; j <= n; j++) { const i = (act + j) % n; if (items[i].textContent.trim().toLowerCase().startsWith(k)) { act = i; mark(); break; } } }
  };
  list.onclick = (e) => { const li = e.target.closest('[role=option]'); if (li) choose(+li.dataset.i); };
  list.onpointermove = (e) => { const li = e.target.closest('[role=option]'); if (li && +li.dataset.i !== act) { act = +li.dataset.i; mark(); } };
  if (label) label.addEventListener('click', (e) => { if (!wrap.contains(e.target)) { e.preventDefault(); btn.focus(); } });
  // kad kod postavi sel.value, dugme pokaže novu vrijednost
  const proto = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
  Object.defineProperty(sel, 'value', { configurable: true, get() { return proto.get.call(this); }, set(v) { proto.set.call(this, v); sync(); } });
  sel.addEventListener('change', sync);
  sync();
}

/** Polje sa prijedlozima: umjesto <datalist> vlastita lista ispod polja (combobox). */
function enhanceInput(inp) {
  inp.dataset.enh = '1';
  const dl = document.getElementById(inp.getAttribute('list'));
  if (!dl) return;
  const id = 'dd' + ++uid;
  inp.removeAttribute('list');
  inp.setAttribute('role', 'combobox'); inp.setAttribute('aria-autocomplete', 'list'); inp.setAttribute('aria-expanded', 'false'); inp.setAttribute('aria-controls', id);
  const wrap = document.createElement('div');
  wrap.className = 'dd dd-input';
  inp.after(wrap); wrap.append(inp);
  const list = document.createElement('ul');
  list.className = 'dd-list'; list.id = id; list.setAttribute('role', 'listbox'); list.hidden = true;
  wrap.append(list);
  let items = [], act = -1;
  const norm = (t) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ø/g, 'o');
  const close = () => { if (list.hidden) return; list.hidden = true; inp.setAttribute('aria-expanded', 'false'); inp.removeAttribute('aria-activedescendant'); open.delete(close); raise(wrap, false); };
  const mark = () => { list.querySelectorAll('[role=option]').forEach((li, i) => li.classList.toggle('act', i === act)); if (act >= 0) { inp.setAttribute('aria-activedescendant', `${id}-${act}`); list.children[act]?.scrollIntoView({ block: 'nearest' }); } else inp.removeAttribute('aria-activedescendant'); };
  const show = () => {
    const q = norm(inp.value.trim());
    const all = [...dl.options].map((o) => o.value);
    items = (q ? all.filter((v) => norm(v).includes(q)) : all).slice(0, 12);
    if (!items.length || (items.length === 1 && items[0] === inp.value)) return close();
    list.innerHTML = items.map((v, i) => `<li role="option" id="${id}-${i}" aria-selected="false">${v.replace(/</g, '&lt;')}</li>`).join('');
    act = -1; closeAll(close);
    list.hidden = false; inp.setAttribute('aria-expanded', 'true'); open.add(close); raise(wrap, true); place(wrap, list); mark();
  };
  const choose = (i) => { if (!items[i]) return; inp.value = items[i]; close(); inp.dispatchEvent(new Event('input', { bubbles: true })); };
  inp.addEventListener('input', (e) => { if (e.isTrusted) show(); });
  inp.addEventListener('focus', show);
  inp.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); if (list.hidden) show(); else { act = Math.min(items.length - 1, act + 1); mark(); } }
    else if (e.key === 'ArrowUp') { e.preventDefault(); act = Math.max(0, act - 1); mark(); }
    else if (e.key === 'Enter' && !list.hidden && act >= 0) { e.preventDefault(); choose(act); }
    else if (e.key === 'Escape' && !list.hidden) { e.preventDefault(); e.stopPropagation(); close(); }
    else if (e.key === 'Tab') close();
  });
  list.onpointerdown = (e) => e.preventDefault();
  list.onclick = (e) => { const li = e.target.closest('[role=option]'); if (li) choose([...list.children].indexOf(li)); };
}

/** Pretvori sve izbornike i polja sa prijedlozima unutar root u vlastite. Može se zvati više puta. */
export function enhance(root = document) {
  root.querySelectorAll('select:not([data-enh])').forEach(enhanceSelect);
  root.querySelectorAll('input[list]:not([data-enh])').forEach(enhanceInput);
}
