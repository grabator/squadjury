// Judge: one squad at a time. Tap a number, a yellow card shows the verdict, the next squad
// slides in. The whole screen fits the phone, from the header to Skip.

import { t } from '../i18n.js';
import { html, raw, $, toast, haptic, reduceMotion, errText, ICONS } from '../ui.js';
import { api, withRetry } from '../api.js';
import { loadFpl } from '../fpl.js';
import { store } from '../store.js';
import { ensureUser } from '../auth.js';
import { teamCardHtml, wireTeamCard, verdictCard, xIntent, shareUrl } from './common.js';
import { whistle } from '../sound.js';

let root, fpl, queue = [], skipped = [], busy = false, unsub, onKey, asideTimer, undoTimer;
const HINT_KEY = 'sj-hint';
let early = null;

/** Called by the app shell on first load of "/": asks for squads while everything else is loading. */
export function prefetch() {
  early ??= api('/api/judge/next?n=4&skip=').catch(() => null);
}

export async function mount(el) {
  root = el;
  queue = [];
  busy = false;
  fpl = await loadFpl();
  el.innerHTML = html`<div class="home">
      <section class="judge" aria-labelledby="judge-h">
        <h1 class="sr-only" id="judge-h">${t('judge.title')}</h1>
        <div id="mybar"></div>
        <div class="deck" id="deck" aria-live="polite"></div>
        <div class="controls" id="controls"></div>
      </section>
      <aside class="aside-board" aria-labelledby="aside-h"><h2 id="aside-h">${t('judge.live')}</h2><div id="aside"></div></aside>
    </div>`.s;
  renderBar();
  unsub = store.subscribe(renderBar);
  await fill();
  show();
  loadAside();
  asideTimer = setInterval(loadAside, 30000);
  onKey = (e) => {
    if (e.target.closest('input, textarea, .sheet') || e.metaKey || e.ctrlKey || e.altKey) return;
    if (/^[0-9]$/.test(e.key)) vote(e.key === '0' ? 10 : +e.key);
    else if (e.key === 'ArrowLeft' || e.key.toLowerCase() === 's') skip();
  };
  document.addEventListener('keydown', onKey);
}

export function unmount() {
  unsub?.();
  clearInterval(asideTimer);
  clearTimeout(undoTimer);
  document.removeEventListener('keydown', onKey);
}

/** For a few seconds after a verdict: "Gave 8 to Toni · Undo". Undo brings the squad back to judge again. */
function offerUndo(team, score) {
  const hint = $('.judge-hint', root);
  if (!hint) return;
  clearTimeout(undoTimer);
  hint.dataset.text ??= hint.textContent;
  hint.innerHTML = html`<button type="button" class="link-btn" id="undo" style="padding:4px 2px">${t('judge.undo')}</button> · ${t('judge.gave', { score, nick: team.nickname })}`.s;
  $('#undo', hint).onclick = () => {
    if (busy) return;
    clearTimeout(undoTimer);
    hint.textContent = hint.dataset.text;
    queue.unshift(team);
    show();
  };
  undoTimer = setTimeout(() => { hint.textContent = hint.dataset.text; }, 5000);
}

/** One line above the card: your squad's score, or how many squads you still need to judge. */
let lastBar = '';
function renderBar() {
  const s = store.state;
  const bar = $('#mybar', root);
  if (!bar) return;
  let out = '';
  if (s.mine) {
    const p = s.mine.place || {};
    const need = Math.max(0, s.minJudged - s.judged);
    out = need
      ? html`<a class="mine need" href="/squad"><span>${t('judge.needMore', { n: need })}</span><span class="dot"></span><b>${s.judged}/${s.minJudged}</b><span class="go">${t('judge.view')}</span></a>`.s
      : html`<a class="mine" href="/squad"><span>${t('judge.yourSquad')}</span><b>${s.mine.avg != null ? s.mine.avg.toFixed(1) : '-'}</b>${p.rank ? html`<span class="dot"></span><span>${t('squad.rank', { rank: p.rank, total: p.total })}</span>` : ''}<span class="dot"></span><span>${t('lb.votes', { n: s.mine.votes })}</span><span class="go">${t('judge.view')}</span></a>`.s;
  } else if (s.gw) {
    out = html`<a class="mine" href="/post"><span>${t('judge.postYours')}</span><span class="go">${t('judge.postCta')}</span></a>`.s;
  }
  if (out === lastBar && bar.innerHTML) return;
  bar.innerHTML = out;
  lastBar = out;
}

async function fill() {
  if (!store.state.gw) return;
  const have = queue.map((q) => q.key);
  try {
    const first = !have.length && !skipped.length && early ? await early : null;
    early = null;
    const { teams } = first || (await api(`/api/judge/next?n=4&skip=${[...have, ...skipped].join(',')}`));
    for (const team of teams) if (!have.includes(team.key)) queue.push(team);
  } catch (e) {
    if (!queue.length) {
      $('#deck', root).innerHTML = html`<div class="empty" style="margin:auto"><h2>${t('err.generic')}</h2><p>${errText(e)}</p><button class="btn" id="retry">${t('err.tryAgain')}</button></div>`.s;
      $('#retry', root).onclick = async () => { await fill(); show(); };
    }
  }
}

const firstTime = () => { try { return !localStorage.getItem(HINT_KEY); } catch { return false; } };

function show() {
  const deck = $('#deck', root);
  const controls = $('#controls', root);
  const team = queue[0];
  if (!team) {
    const s = store.state;
    deck.innerHTML = html`<div class="empty" style="margin:auto"><span class="ycard"></span>
        <h2>${!s.gw ? t('clock.season') : s.judged ? t('judge.emptyTitle') : t('judge.emptyNone', { gw: s.gw.id })}</h2>
        <p>${t('judge.emptyText')}</p>
        <div class="row" style="justify-content:center">
          ${!s.mine && s.gw ? html`<a class="btn btn-go" href="/post">${t('nav.post')}</a>` : ''}
          <a class="btn" href="${xIntent(t('x.invite', { link: s.mine ? shareUrl(s.mine) : location.origin }))}" target="_blank" rel="noopener">${raw(ICONS.x)}${t('judge.invite')}</a>
        </div></div>`.s;
    controls.innerHTML = '';
    return;
  }
  deck.innerHTML = html`<article class="jcard enter" aria-label="${team.nickname}'s squad">${teamCardHtml(fpl, team)}<span class="skip-hint" aria-hidden="true">${t('judge.skip').toUpperCase()}</span></article>`.s;
  const card = $('.jcard', deck);
  wireTeamCard(card, fpl, team);
  wireSwipe(card);
  if (!controls.firstChild) {
    const touch = !matchMedia('(hover: hover)').matches;
    controls.innerHTML = html`
      ${firstTime()
        ? html`<p class="first-hint" id="first-hint">${t('judge.firstHint')}</p>`
        : html`<div class="vscale" aria-hidden="true"><b>${t('judge.question')}</b><span>${t('judge.scale')}</span></div>`}
      <div class="verdicts" role="group" aria-label="${t('judge.rate')}">
        ${Array.from({ length: 10 }, (_, i) => html`<button type="button" class="vbtn" data-score="${i + 1}" aria-label="${t('judge.score', { n: i + 1 })}">${i + 1}</button>`)}
      </div>
      <div class="judge-actions">
        <span class="judge-hint">${touch ? t('judge.swipeHint') : t('judge.keysHint')}</span>
        <button type="button" class="skip" id="skip">${t('judge.skip')}</button>
      </div>`.s;
    controls.querySelectorAll('.vbtn').forEach((b) => b.addEventListener('click', () => vote(+b.dataset.score)));
    $('#skip', controls).addEventListener('click', () => skip());
  }
  controls.querySelectorAll('.vbtn').forEach((b) => b.classList.remove('chosen'));
}

/** The card follows the finger; past a short distance to the left it goes and the next one comes. */
function wireSwipe(card) {
  let x0 = null, y0 = 0, dx = 0, id = null;
  const hint = $('.skip-hint', card);
  card.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button, a') || busy) return;
    x0 = e.clientX; y0 = e.clientY; dx = 0; id = e.pointerId;
    card.classList.remove('spring', 'enter');
    card.classList.add('drag');
  });
  card.addEventListener('pointermove', (e) => {
    if (x0 == null || e.pointerId !== id) return;
    dx = Math.min(40, e.clientX - x0);
    if (Math.abs(dx) < 6 && Math.abs(e.clientY - y0) > 10) return;
    card.style.transform = `translateX(${dx}px) rotate(${dx / 30}deg)`;
    if (hint) hint.style.opacity = String(Math.min(1, Math.max(0, -dx / 100)));
  });
  const end = () => {
    if (x0 == null) return;
    x0 = null;
    card.classList.remove('drag');
    if (dx < -80) return skip(true);
    card.classList.add('spring');
    card.style.transform = '';
    if (hint) hint.style.opacity = '0';
  };
  card.addEventListener('pointerup', end);
  card.addEventListener('pointercancel', end);
}

async function next() {
  const card = $('.jcard', root);
  if (card && !reduceMotion()) {
    card.classList.remove('enter', 'spring', 'drag');
    card.style.transform = '';
    card.classList.add('leave');
    await new Promise((r) => setTimeout(r, 220));
  }
  queue.shift();
  if (queue.length < 3) await fill();
  show();
  busy = false;
}

function skip() {
  if (busy || !queue[0]) return;
  busy = true;
  haptic(10);
  skipped.push(queue[0].key);
  next();
}

async function vote(score) {
  const team = queue[0];
  if (busy || !team) return;
  if (!store.state.user?.nickname) {
    if (!(await ensureUser())) return;
    // Signed in now: drop this juror's own squad from the queue, then the verdict counts.
    const me = store.state.user?.nickname;
    queue = queue.filter((q, i) => i === 0 || q.nickname !== me);
    if (team.nickname === me) { queue.shift(); show(); return; }
  }
  busy = true;
  haptic(20);
  if (score === 10) whistle();
  $(`.vbtn[data-score="${score}"]`, root)?.classList.add('chosen');
  if (firstTime()) {
    try { localStorage.setItem(HINT_KEY, '1'); } catch {}
    $('#first-hint', root)?.replaceWith(Object.assign(document.createElement('div'), { className: 'vscale', innerHTML: html`<b>${t('judge.question')}</b><span>${t('judge.scale')}</span>`.s }));
  }
  const card = $('#deck .jcard', root);
  card?.classList.add('judged');
  card?.insertAdjacentHTML('beforeend', verdictCard(score).s);
  const line = document.createElement('p');
  line.className = 'verdict-line';
  card?.append(line);

  const before = store.state.judged;
  // Optimistic: the next squad comes up while the verdict is sent in the background.
  withRetry(() => api('/api/votes', { method: 'POST', body: { key: team.key, score } }))
    .then((r) => {
      line.innerHTML = html`<span>${r.votes > 1 ? `${t('judge.juryAvg')} ${r.avg.toFixed(1)}` : t('judge.firstVerdict')}</span>`.s;
      store.set({ judged: r.judged });
      if (before < store.state.minJudged && r.judged >= store.state.minJudged && store.state.mine) toast(t('judge.unlocked'), { ms: 3600 });
    })
    .catch((e) => toast(e.code === 'offline' ? t('judge.sentFail') : errText(e), { bad: true }));

  await new Promise((r) => setTimeout(r, reduceMotion() ? 450 : 750));
  await next();
  offerUndo(team, score);
}

/** Desktop only: the live top 10 next to the card. */
async function loadAside() {
  const box = $('#aside', root);
  if (!box || getComputedStyle(box.parentElement).display === 'none') return;
  try {
    const lb = await api('/api/leaderboard');
    if (!lb.ranked.length) {
      box.innerHTML = html`<p class="sub">${t('lb.empty')}</p>`.s;
      return;
    }
    box.innerHTML = html`<ol class="board">${lb.ranked.slice(0, 10).map((r) => html`
      <li class="${r.mine ? 'me' : ''} ${r.rank <= 3 ? `p${r.rank}` : ''}"><a href="/t/${r.key}">
        <span class="pos">${r.rank}</span><span class="who"><b>${r.nickname}${r.demo ? html`<span class="tag">${t('judge.exampleShort')}</span>` : ''}</b><span>${t('lb.votes', { n: r.votes })}</span></span>
        <span class="score"><span class="num">${r.avg.toFixed(1)}</span></span></a></li>`)}</ol>`.s;
  } catch {}
}
