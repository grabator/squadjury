// Post: upload a Pick Team screenshot, we read the 15 players, you confirm, the jury judges.

import { t } from '../i18n.js';
import { html, raw, $, $$, sheet, toast, errText, ICONS, haptic } from '../ui.js';
import { api } from '../api.js';
import { loadFpl, POS, POS_LONG, kitFor, shirtSvg } from '../fpl.js';
import { store, refreshState } from '../store.js';
import { ensureUser } from '../auth.js';
import { squadHtml } from '../pitch.js';
import { navigate } from '../app.js';
import { validate } from '../ocr/match.js';
import { renderShareImage } from '../share.js';
import { xIntent, xText, shareUrl, shareImage, canShareFiles } from './common.js';

let root, fpl, draft, shotBitmap, replace = false, onPaste, onDrag;

export async function mount(el) {
  root = el;
  replace = new URLSearchParams(location.search).has('replace');
  fpl = await loadFpl();
  const s = store.state;
  if (!s.gw) {
    el.innerHTML = html`<div class="empty"><h2>${t('clock.season')}</h2><p>${t('post.closed')}</p></div>`.s;
    return;
  }
  if (s.mine && !replace) return navigate('/squad', { replace: true });
  if (!s.user?.nickname) {
    el.innerHTML = entryHtml(false);
    $('#signin', el).onclick = async () => { if (await ensureUser({ title: t('post.signIn') })) mount(el); };
    return;
  }
  chooser();
}

export function unmount() {
  document.removeEventListener('paste', onPaste);
  document.removeEventListener('dragover', onDrag);
  document.removeEventListener('dragleave', onDrag);
  document.removeEventListener('drop', onDrag);
}

/** The entry screen: an example screenshot, three steps and one big button, all on one screen. */
function entryHtml(signedIn) {
  const gw = store.state.gw.id;
  return html`<div class="post-entry">
    <div class="page-head"><h1 class="title">${replace ? t('squad.replace') : t('post.title')}</h1><p class="sub">${t('post.sub')}</p></div>
    <div class="example"><img src="/img/example-pick-team.svg" alt="${t('post.exampleAlt')}"></div>
    <ol class="steps"><li>${t('post.step1')}</li><li>${t('post.step2', { gw })}</li><li>${t('post.step3')}</li></ol>
    ${signedIn
      ? html`<label class="btn btn-go btn-block" for="file">${raw(ICONS.upload)}${t('post.choose')}</label>
        <input type="file" id="file" accept="image/*" class="sr-only">
        <p class="drop-hint">${matchMedia('(hover: hover)').matches ? t('post.dropDesk') : t('post.dropHint')}</p>`
      : html`<button class="btn btn-go btn-block" id="signin">${t('auth.google')}</button>`}
  </div>`.s;
}

function chooser() {
  root.innerHTML = entryHtml(true);
  // Start loading the reader early: most people pick a file within seconds.
  import('../ocr/client.js').then((m) => m.warmUp()).catch(() => {});
  $('#file', root).addEventListener('change', (e) => e.target.files[0] && read(e.target.files[0]));
  // Desktop: paste with Ctrl+V or drop a file on the page.
  unmount();
  onPaste = (e) => {
    const f = [...(e.clipboardData?.files || [])].find((x) => x.type.startsWith('image/'));
    if (f && $('#file', root)) { e.preventDefault(); read(f); }
  };
  onDrag = (e) => {
    if (!$('#file', root)) return;
    e.preventDefault();
    const entry = $('.post-entry', root);
    if (e.type === 'dragover') entry?.classList.add('dropping');
    else entry?.classList.remove('dropping');
    if (e.type === 'drop') {
      const f = [...(e.dataTransfer?.files || [])].find((x) => x.type.startsWith('image/'));
      if (f) read(f);
    }
  };
  document.addEventListener('paste', onPaste);
  document.addEventListener('dragover', onDrag);
  document.addEventListener('dragleave', onDrag);
  document.addEventListener('drop', onDrag);
}

function setProgress(pct, label) {
  const bar = $('#progress i', root);
  if (bar) bar.style.width = `${Math.round(pct * 100)}%`;
  const st = $('#status', root);
  if (st && label) st.innerHTML = label;
}

async function read(file) {
  if (file.size > 15 * 1024 * 1024) return toast(t('err.image_too_large'), { bad: true });
  const url = URL.createObjectURL(file);
  root.innerHTML = html`<div class="reading">
    <div class="page-head" style="margin:0"><h1 class="title">${t('post.reading')}</h1></div>
    <div class="preview"><img src="${url}" alt=""></div>
    <div class="progress" id="progress" aria-hidden="true"><i></i></div>
    <p class="status" id="status" role="status">${t('post.loadingEngine')}<small>${t('post.firstTime')}</small></p></div>`.s;
  try {
    const ocr = await import('../ocr/client.js');
    const { imageData, bitmap } = await ocr.decodeFile(file);
    shotBitmap = bitmap;
    setProgress(0.08);
    await ocr.warmUp();
    setProgress(0.2, html`${t('post.readingPlayers')}`.s);
    const result = await ocr.readSquadFromImage(imageData, fpl, {
      gw: store.state.gw.id,
      onProgress: (p) => {
        if (p.step === 'cards') setProgress(0.2 + 0.55 * (p.done / p.total));
        else setProgress(p.step === 'found' ? 0.78 : Math.min(0.97, 0.78 + p.recognised / 100), html`${t('post.foundSoFar', { n: Math.min(15, p.recognised) })}`.s);
      },
    });
    setProgress(1, html`${t('post.checking')}`.s);
    if (result.recognised < 8) return notFpl(url);
    draft = {
      picks: result.picks.map((p) => ({ id: p.id, bench: p.bench, pos: p.pos ?? posForSlot(result.picks, p), name: p.name, options: p.options })),
      captain: result.captain,
      vice: result.vice,
      seenGw: result.gw,
      url,
    };
    confirmView();
  } catch (e) {
    console.error(e);
    $('#status', root).innerHTML = html`${t('err.generic')}<small>${errText(e)}</small>`.s;
    root.insertAdjacentHTML('beforeend', html`<div class="row" style="justify-content:center;margin-top:12px"><button class="btn" id="again">${t('post.tryAgain')}</button></div>`.s);
    $('#again', root).onclick = chooser;
  }
}

/** Guesses the position of an unread slot from where it sits in the formation. */
function posForSlot(picks, p) {
  if (p.bench) return [1, null, null, null][picks.filter((x) => x.bench).indexOf(p)] ?? null;
  return null;
}

function notFpl(url) {
  root.innerHTML = html`<div class="empty">
      <div class="row" style="justify-content:center;gap:18px;margin-bottom:14px;align-items:center">
        <img src="${url}" alt="" style="width:96px;border-radius:12px;opacity:.6;box-shadow:0 0 0 3px var(--red)">
        <img src="/img/example-pick-team.svg" alt="${t('post.exampleAlt')}" style="width:96px;border-radius:12px;box-shadow:0 0 0 3px var(--green)">
      </div>
      <h2>${t('post.notFpl')}</h2><p>${t('post.notFplText')}</p>
      <button class="btn btn-go" id="again">${t('post.tryAgain')}</button></div>`.s;
  $('#again', root).onclick = chooser;
}

function problemsText(v) {
  return v.problems.map((p) => {
    if (p.code === 'count') return t('problem.count', { n: v.recognised });
    if (p.code === 'shape') return t('problem.shape', { pos: p.pos, have: p.have, need: p.need });
    if (p.code === 'club') return t('problem.club', { team: p.team });
    return t('problem.formation');
  });
}

function currentPicks() {
  return draft.picks.map((p) => {
    const pl = p.id ? fpl.byId.get(p.id) : null;
    return { ...p, team: pl?.team ?? null, pos: pl?.element_type ?? p.pos };
  });
}

function checks(picks) {
  const known = picks.filter((p) => p.id);
  const count = (pos) => known.filter((p) => p.pos === pos).length;
  const clubs = {};
  for (const p of known) clubs[p.team] = (clubs[p.team] || 0) + 1;
  const items = [
    ['GK', count(1), 2], ['DEF', count(2), 5], ['MID', count(3), 5], ['FWD', count(4), 3],
  ].map(([lbl, have, need]) => ({ ok: have === need, text: `${lbl} ${have}/${need}` }));
  items.push({ ok: Object.values(clubs).every((n) => n <= 3), text: t('post.clubRule') });
  return html`<div class="checks" aria-label="${t('post.rules')}">${items.map((c) => html`<span class="check ${c.ok ? 'ok' : ''}">${raw(c.ok ? ICONS.check : ICONS.alert)}${c.text}</span>`)}</div>`;
}

function confirmView() {
  const gw = store.state.gw.id;
  const picks = currentPicks();
  const v = validate(picks, fpl);
  const missing = picks.filter((p) => !p.id).length;
  const ready = v.ok && !missing;
  root.innerHTML = html`<div class="confirm">
    <div class="recog"><span class="num">${15 - missing}/15</span><b>${t('post.found')}</b></div>
    <p class="sub" style="margin:0">${ready ? t('post.allGood') : t('post.fix')}</p>
    ${checks(picks)}
    ${draft.seenGw && draft.seenGw !== gw ? html`<p class="note">${t('post.gwNote', { seen: draft.seenGw, gw })}</p>` : ''}
    ${!ready && v.problems.some((p) => p.code === 'formation') ? html`<p class="note" role="alert">${t('problem.formation')}</p>` : ''}
    <div class="jcard" id="pitch">${squadHtml(fpl, { picks, captain: draft.captain, vice: draft.vice, gw }, { editable: true })}</div>
    <p class="sub" style="font-size:13px;margin:0">${t('post.tapPlayer')}</p>
    <div class="row">
      <button class="btn btn-ghost" id="again">${t('post.retake')}</button>
      <button class="btn btn-go" id="send" ${raw(ready ? '' : 'disabled')}>${t('post.send')}</button>
    </div></div>`.s;
  $$('.pick', root).forEach((b) => b.addEventListener('click', () => playerMenu(+b.dataset.index)));
  $('#again', root).onclick = chooser;
  $('#send', root).onclick = send;
}

function previewTeam() {
  const me = store.state.user;
  return { nickname: me.nickname, x: me.x, gw: store.state.gw.id, picks: draft.picks.map((p) => ({ id: p.id, bench: p.bench })), captain: draft.captain, vice: draft.vice, avg: null, votes: 0 };
}

function playerMenu(index) {
  const p = draft.picks[index];
  if (!p.id) return pickPlayer(index);
  const s = sheet(
    html`<h2>${fpl.byId.get(p.id)?.web_name}</h2>
      <div style="display:grid;gap:10px">
        ${!p.bench ? html`<button class="btn btn-go" data-a="c">${t('post.makeC')}</button><button class="btn" data-a="v">${t('post.makeV')}</button>` : ''}
        <button class="btn btn-ghost" data-a="swap">${t('post.swap')}</button>
      </div>`,
  );
  s.el.addEventListener('click', (e) => {
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (!a) return;
    s.close();
    if (a === 'c') { if (draft.vice === p.id) draft.vice = draft.captain; draft.captain = p.id; }
    if (a === 'v') { if (draft.captain === p.id) draft.captain = draft.vice; draft.vice = p.id; }
    if (a === 'swap') return pickPlayer(index);
    haptic();
    confirmView();
  });
}

function pickPlayer(index) {
  const slot = draft.picks[index];
  const taken = new Set(draft.picks.map((p) => p.id).filter(Boolean));
  const pos = slot.id ? fpl.byId.get(slot.id).element_type : slot.pos;
  const posName = pos ? POS_LONG[pos] : 'player';
  const s = sheet(
    html`<h2>${t('post.pick', { pos: posName })}</h2>
      <div class="field"><label for="ps" class="sr-only">${t('post.search')}</label><input id="ps" type="search" placeholder="${t('post.search')}" autocomplete="off"></div>
      <div class="player-search" id="plist" role="listbox" aria-label="${t('post.search')}"></div>`,
    { label: t('post.pick', { pos: posName }) },
  );
  const list = $('#plist', s.el);
  const preferred = new Set(slot.options || []);
  const draw = (q = '') => {
    const needle = q.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const items = fpl.players
      .filter((p) => (!pos || p.element_type === pos) && !taken.has(p.id))
      .filter((p) => !needle || `${p.web_name} ${p.first_name} ${p.second_name}`.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(needle))
      .sort((a, b) => (preferred.has(b.id) - preferred.has(a.id)) || a.web_name.localeCompare(b.web_name))
      .slice(0, 60);
    list.innerHTML = items
      .map((p) => html`<button type="button" role="option" data-id="${p.id}"><span class="mini-shirt">${raw(shirtSvg(kitFor(fpl, p), `ps${p.id}`))}</span><span class="grow"><b>${p.web_name}</b> <small>${p.first_name} ${p.second_name}</small></span><small>${fpl.teamsById.get(p.team)?.short_name} ${POS[p.element_type]}</small></button>`.s)
      .join('');
  };
  draw();
  $('#ps', s.el).addEventListener('input', (e) => draw(e.target.value));
  list.addEventListener('click', (e) => {
    const b = e.target.closest('[data-id]');
    if (!b) return;
    const id = +b.dataset.id;
    if (draft.captain === slot.id) draft.captain = id;
    if (draft.vice === slot.id) draft.vice = id;
    draft.picks[index] = { ...slot, id, name: fpl.byId.get(id).web_name, pos: fpl.byId.get(id).element_type, options: undefined };
    s.close();
    confirmView();
  });
}

async function send() {
  const btn = $('#send', root);
  btn.disabled = true;
  btn.classList.add('loading');
  btn.setAttribute('aria-label', t('post.sending'));
  try {
    const ocr = await import('../ocr/client.js');
    const picks = draft.picks.map((p) => ({ id: p.id }));
    const [shot, og] = await Promise.all([ocr.compress(shotBitmap), renderShareImage('og', fpl, previewTeam(), null)]);
    const form = new FormData();
    form.set('picks', JSON.stringify(picks));
    if (draft.captain) form.set('captain', String(draft.captain));
    if (draft.vice) form.set('vice', String(draft.vice));
    form.set('image', shot, 'squad.' + (shot.type === 'image/webp' ? 'webp' : 'jpg'));
    form.set('og', og, 'card.jpg');
    await api(replace ? '/api/teams/mine' : '/api/teams', { method: replace ? 'PUT' : 'POST', form });
    URL.revokeObjectURL(draft.url);
    await refreshState();
    done();
  } catch (e) {
    toast(errText(e), { bad: true });
    btn.disabled = false;
    btn.classList.remove('loading');
  }
}

/** Posted: the square image for X, one big "Post on X" button and the link. */
async function done() {
  const s = store.state;
  const left = Math.max(0, s.minJudged - s.judged);
  haptic(30);
  const team = { ...previewTeam(), key: s.mine?.key, avg: null, votes: 0 };
  root.innerHTML = html`<div class="done">
      <h1>${t('post.liveTitle')}</h1>
      <p class="sub" style="margin:0">${left ? t('post.liveText', { n: left }) : t('judge.unlocked')}</p>
      <div class="square skeleton" id="sq" role="img" aria-label="${t('post.squareAlt')}"></div>
      <div class="row">
        <a class="btn btn-go" id="postx" href="${xIntent(xText(team, null))}" target="_blank" rel="noopener">${raw(ICONS.x)}${t('squad.postX')}</a>
        <button class="btn" id="copy">${raw(ICONS.link)}${t('squad.copy')}</button>
      </div>
      ${canShareFiles() ? html`<button class="btn btn-block" id="shareimg" style="max-width:420px">${raw(ICONS.share)}${t('squad.shareImage')}</button>` : ''}
      <a class="btn btn-ghost btn-block" href="/" style="max-width:420px">${t('post.startJudging')}</a></div>`.s;
  $('#shareimg', root)?.addEventListener('click', () => shareImage(fpl, team, null).catch((e) => toast(errText(e), { bad: true })));
  $('#copy', root).onclick = async () => {
    try { await navigator.clipboard.writeText(shareUrl(team)); toast(t('squad.copied')); } catch { toast(shareUrl(team)); }
  };
  try {
    const blob = await renderShareImage('x', fpl, team, null);
    const box = $('#sq', root);
    if (box && blob) box.outerHTML = `<img class="square" src="${URL.createObjectURL(blob)}" alt="${t('post.squareAlt')}">`;
  } catch {}
}
