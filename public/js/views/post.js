// Post: upload a Pick Team screenshot, we read the 15 players, you confirm, the jury judges.

import { t } from '../i18n.js';
import { html, raw, $, $$, sheet, toast, errText, ICONS, confetti, haptic } from '../ui.js';
import { api } from '../api.js';
import { loadFpl, POS, POS_LONG } from '../fpl.js';
import { store, refreshState } from '../store.js';
import { ensureUser } from '../auth.js';
import { squadHtml } from '../pitch.js';
import { navigate } from '../app.js';
import { validate } from '../ocr/match.js';
import { renderShareImage } from '../share.js';

let root, fpl, draft, shotBitmap, replace = false;

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
    el.innerHTML = html`<div class="page-head"><h1 class="title">${t('post.title')}</h1><p class="sub">${t('post.sub')}</p></div>
      <div class="empty"><button class="btn btn-go" id="signin">${t('auth.google')}</button></div>`.s;
    $('#signin', el).onclick = async () => { if (await ensureUser({ title: t('post.signIn') })) mount(el); };
    return;
  }
  chooser();
}

function chooser() {
  const gw = store.state.gw.id;
  root.innerHTML = html`<div class="page-head"><h1 class="title">${replace ? t('squad.replace') : t('post.title')}</h1><p class="sub">${t('post.sub')}</p></div>
    <label class="drop" for="file">
      ${raw(ICONS.upload)}
      <span class="btn btn-go">${t('post.choose')}</span>
      <span class="sub" style="margin:0">${t('post.dropHint')}</span>
    </label>
    <input type="file" id="file" accept="image/*" class="sr-only">
    <div class="example">
      <img src="/img/example-pick-team.svg" alt="${t('post.exampleAlt')}" width="112" height="160">
      <ol><li>${t('post.step1')}</li><li>${t('post.step2', { gw })}</li><li>${t('post.step3')}</li></ol>
    </div>`.s;
  // Start loading the reader early: most people pick a file within seconds.
  import('../ocr/client.js').then((m) => m.warmUp()).catch(() => {});
  $('#file', root).addEventListener('change', (e) => e.target.files[0] && read(e.target.files[0]));
}

async function read(file) {
  const url = URL.createObjectURL(file);
  root.innerHTML = html`<div class="page-head"><h1 class="title">${t('post.reading')}</h1></div>
    <div class="scan"><img src="${url}" alt=""></div>
    <p class="status" id="status" role="status">${t('post.loadingEngine')}</p>
    <div class="found" id="found" aria-hidden="true"></div>`.s;
  const status = $('#status', root);
  try {
    const ocr = await import('../ocr/client.js');
    const { imageData, bitmap } = await ocr.decodeFile(file);
    shotBitmap = bitmap;
    await ocr.warmUp();
    const result = await ocr.readSquadFromImage(imageData, fpl, {
      gw: store.state.gw.id,
      onProgress: (p) => {
        status.innerHTML = p.step === 'cards'
          ? html`${t('post.readingCards', { done: p.done, total: p.total })}`.s
          : html`${t('post.readingPage')}`.s;
      },
    });
    if (result.recognised < 8) return notFpl(url);
    const shown = $('#found', root);
    for (const p of result.picks.filter((x) => x.id)) {
      shown.insertAdjacentHTML('beforeend', html`<span>${p.name}</span>`.s);
      await new Promise((r) => setTimeout(r, 45));
    }
    draft = {
      picks: result.picks.map((p) => ({ id: p.id, bench: p.bench, pos: p.pos ?? posForSlot(result.picks, p), name: p.name, options: p.options })),
      captain: result.captain,
      vice: result.vice,
      seenGw: result.gw,
      url,
    };
    await new Promise((r) => setTimeout(r, 300));
    confirmView();
  } catch (e) {
    console.error(e);
    status.innerHTML = html`${t('err.generic')}<small>${errText(e)}</small>`.s;
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
      <img class="big" src="${url}" alt="" style="width:120px;height:auto;border-radius:10px;opacity:.6">
      <h2>${t('post.notFpl')}</h2><p>${t('post.notFplText')}</p>
      <img src="/img/example-pick-team.svg" alt="${t('post.exampleAlt')}" width="140" style="margin:0 auto 18px">
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

function confirmView() {
  const gw = store.state.gw.id;
  const picks = currentPicks();
  const v = validate(picks, fpl);
  const missing = picks.filter((p) => !p.id).length;
  const ready = v.ok && !missing;
  root.innerHTML = html`<div class="squad-wrap">
    <div class="recog"><span class="num">${15 - missing}</span><span><b>${t('post.recognised', { n: 15 - missing })}</b></span></div>
    <p class="sub" style="margin-top:0">${ready ? t('post.allGood') : t('post.fix')}</p>
    ${draft.seenGw && draft.seenGw !== gw ? html`<p class="note">${t('post.gwNote', { seen: draft.seenGw, gw })}</p>` : ''}
    ${!ready ? html`<div class="problems" role="alert">${missing ? html`<b>${t('problem.missing')}</b>` : ''}<ul>${problemsText(v).map((x) => html`<li>${x}</li>`)}</ul></div>` : ''}
    <div id="pitch" style="margin:12px 0">${squadHtml(fpl, { picks, captain: draft.captain, vice: draft.vice, gw }, { editable: true })}</div>
    <p class="sub" style="font-size:13px">${t('post.tapPlayer')}</p>
    <div class="row" style="margin-top:14px">
      <button class="btn btn-ghost" id="again">${t('post.retake')}</button>
      <button class="btn btn-go" id="send" ${raw(ready ? '' : 'disabled')}>${t('post.send')}</button>
    </div></div>`.s;
  $$('.pick', root).forEach((b) => b.addEventListener('click', () => playerMenu(+b.dataset.index)));
  $('#again', root).onclick = chooser;
  $('#send', root).onclick = send;
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
      .map((p) => html`<button type="button" role="option" data-id="${p.id}"><span><b>${p.web_name}</b> <small>${p.first_name} ${p.second_name}</small></span><small>${fpl.teamsById.get(p.team)?.short_name} ${POS[p.element_type]}</small></button>`.s)
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
  btn.textContent = t('post.sending');
  try {
    const ocr = await import('../ocr/client.js');
    const picks = draft.picks.map((p) => ({ id: p.id }));
    const me = store.state.user;
    const preview = { nickname: me.nickname, x: me.x, gw: store.state.gw.id, picks: draft.picks.map((p) => ({ id: p.id, bench: p.bench })), captain: draft.captain, vice: draft.vice, avg: null, votes: 0 };
    const [shot, og] = await Promise.all([ocr.compress(shotBitmap), renderShareImage('og', fpl, preview, null)]);
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
    btn.textContent = t('post.send');
  }
}

function done() {
  const s = store.state;
  const left = Math.max(0, s.minJudged - s.judged);
  confetti();
  haptic(40);
  root.innerHTML = html`<div class="empty">
      <img class="big" src="/img/logo/mark.svg" alt="" width="88" height="88">
      <h2>${t('post.liveTitle')}</h2>
      <p>${left ? t('post.liveText', { n: left }) : t('judge.unlocked')}</p>
      <div class="row" style="justify-content:center">
        <a class="btn btn-go" href="/">${t('post.startJudging')}</a>
        <a class="btn" href="/squad">${t('nav.mySquad')}</a>
      </div></div>`.s;
}
