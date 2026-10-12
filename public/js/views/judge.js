// Judge: one squad at a time, tap a number, the gavel comes down, next squad.

import { t } from '../i18n.js';
import { html, raw, $, toast, haptic, reduceMotion, errText, ICONS, confetti } from '../ui.js';
import { api, withRetry } from '../api.js';
import { loadFpl } from '../fpl.js';
import { store } from '../store.js';
import { ensureUser } from '../auth.js';
import { teamCardHtml, wireTeamCard, verdictOverlay, xIntent, shareUrl } from './common.js';

let root, fpl, queue = [], skipped = [], busy = false, unsub, onKey, asideTimer;

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
        <div id="controls"></div>
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
  document.removeEventListener('keydown', onKey);
}

function renderBar() {
  const s = store.state;
  const bar = $('#mybar', root);
  if (!bar) return;
  if (s.mine) {
    const p = s.mine.place || {};
    const right = p.rank ? html`<span class="num">#${p.rank}</span>` : html`<span class="muted">${t('lb.waiting')}</span>`;
    const progress = s.judged < s.minJudged
      ? html`<div class="row" style="align-items:center;justify-content:space-between;margin-top:8px;font-size:13px;color:var(--mute)">
          <span>${t('judge.progress', { n: s.judged, max: s.minJudged })}</span>
          <span class="progress5" aria-hidden="true">${Array.from({ length: s.minJudged }, (_, i) => raw(`<i class="${i < s.judged ? 'on' : ''}"></i>`))}</span></div>`
      : '';
    bar.innerHTML = html`<a class="mybar" href="/squad"><span>${t('judge.yourSquad')}: <span class="num">${s.mine.avg != null ? s.mine.avg.toFixed(1) : '-'}</span> ★ <span class="muted">(${s.mine.votes})</span></span>${right}</a>${progress}`.s;
  } else if (s.gw) {
    bar.innerHTML = html`<a class="mybar" href="/post"><span>${t('judge.postYours')}</span><span class="btn btn-go" style="min-height:36px;padding:0 14px">${raw(ICONS.post)}${t('judge.postCta')}</span></a>`.s;
  } else bar.innerHTML = '';
}

async function fill() {
  if (!store.state.gw) return;
  const have = queue.map((q) => q.key);
  try {
    const { teams } = await api(`/api/judge/next?n=4&skip=${[...have, ...skipped].join(',')}`);
    for (const team of teams) {
      if (!have.includes(team.key)) queue.push(team);
      if (team.image) new Image().src = team.image; // warm the cache for the screenshot toggle
    }
  } catch (e) {
    if (!queue.length) {
      $('#deck', root).innerHTML = html`<div class="empty"><h2>${t('err.generic')}</h2><p>${errText(e)}</p><button class="btn" id="retry">${t('err.tryAgain')}</button></div>`.s;
      $('#retry', root).onclick = async () => { await fill(); show(); };
    }
  }
}

function show() {
  const deck = $('#deck', root);
  const controls = $('#controls', root);
  const team = queue[0];
  if (!team) {
    const s = store.state;
    const none = !s.gw;
    deck.innerHTML = html`<div class="empty">
        <img class="big" src="/img/logo/mark.svg" alt="" width="88" height="88">
        <h2>${none ? t('clock.season') : s.judged ? t('judge.emptyTitle') : t('judge.emptyNone', { gw: s.gw.id })}</h2>
        <p>${t('judge.emptyText')}</p>
        <div class="row" style="justify-content:center">
          ${!s.mine && s.gw ? html`<a class="btn btn-go" href="/post">${raw(ICONS.post)}${t('judge.postCta')}</a>` : ''}
          <a class="btn" href="${xIntent(t('x.invite', { link: s.mine ? shareUrl(s.mine) : location.origin }))}" target="_blank" rel="noopener">${raw(ICONS.x)}${t('judge.invite')}</a>
        </div></div>`.s;
    controls.innerHTML = '';
    return;
  }
  deck.innerHTML = html`<article class="jcard enter" aria-label="${team.nickname}'s squad">${teamCardHtml(fpl, team)}</article>`.s;
  const card = $('.jcard', deck);
  wireTeamCard(card, fpl, team);
  wireSwipe(card);
  controls.innerHTML = html`
    <div class="verdicts" role="group" aria-label="${t('judge.rate')}">
      ${Array.from({ length: 10 }, (_, i) => html`<button type="button" class="vbtn" data-score="${i + 1}" aria-label="${t('judge.score', { n: i + 1 })}">${i + 1}</button>`)}
    </div>
    <div class="judge-actions" style="margin-top:8px">
      <span class="judge-hint">${t('judge.hint')}</span>
      <button type="button" class="btn btn-ghost" id="skip" style="min-height:40px">${t('judge.skip')}</button>
    </div>`.s;
  controls.querySelectorAll('.vbtn').forEach((b) => b.addEventListener('click', () => vote(+b.dataset.score)));
  $('#skip', controls).addEventListener('click', skip);
}

function wireSwipe(card) {
  let x0 = null, dx = 0;
  card.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' || e.target.closest('button, a')) return;
    x0 = e.clientX; dx = 0;
  });
  card.addEventListener('pointermove', (e) => {
    if (x0 == null) return;
    dx = e.clientX - x0;
    if (dx < 0) card.style.transform = `translateX(${dx}px) rotate(${dx / 40}deg)`;
  });
  const end = () => {
    if (x0 == null) return;
    x0 = null;
    if (dx < -90) skip();
    else card.style.transform = '';
  };
  card.addEventListener('pointerup', end);
  card.addEventListener('pointercancel', end);
}

async function next(direction) {
  const card = $('.jcard', root);
  if (card && !reduceMotion()) {
    card.classList.remove('enter');
    card.classList.add(direction === 'left' ? 'leave-left' : 'leave-right');
    await new Promise((r) => setTimeout(r, 380));
  }
  queue.shift();
  if (queue.length < 2) await fill();
  show();
  busy = false;
}

function skip() {
  if (busy || !queue[0]) return;
  busy = true;
  skipped.push(queue[0].key);
  next('left');
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
  haptic(24);
  $(`.vbtn[data-score="${score}"]`, root)?.classList.add('chosen');
  const deck = $('#deck', root);
  deck.insertAdjacentHTML('beforeend', verdictOverlay(score).s);
  const line = document.createElement('p');
  line.className = 'verdict-line';
  line.innerHTML = html`${t('judge.verdict')}: ${score}`.s;
  $('#controls', root).prepend(line);
  $('.jcard', deck)?.classList.add('shake');

  const before = store.state.judged;
  // Optimistic: the next squad comes up while the verdict is sent in the background.
  const sent = withRetry(() => api('/api/votes', { method: 'POST', body: { key: team.key, score } }))
    .then((r) => {
      line.innerHTML = r.votes > 1
        ? html`${t('judge.verdict')}: ${score} <span>· ${t('judge.juryAvg')} ${r.avg.toFixed(1)}</span>`.s
        : html`${t('judge.verdict')}: ${score} <span>· ${t('judge.firstVerdict')}</span>`.s;
      store.set({ judged: r.judged });
      if (before < store.state.minJudged && r.judged >= store.state.minJudged && store.state.mine) {
        toast(t('judge.unlocked'));
        confetti();
      }
    })
    .catch((e) => toast(e.code === 'offline' ? t('judge.sentFail') : errText(e), { bad: true }));

  await new Promise((r) => setTimeout(r, reduceMotion() ? 500 : 1150));
  $('.verdict .gavel', deck)?.classList.add('lift');
  line.remove();
  await next('right');
  sent.then(() => {});
}

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
      <li class="${r.rank <= 3 ? 'p' + r.rank : ''} ${r.mine ? 'me' : ''}"><a href="/t/${r.key}">
        <span class="pos">${r.rank}</span><span class="who"><b>${r.nickname}</b><small>${t('lb.votes', { n: r.votes })}</small></span>
        <span class="score"><span class="num">${r.avg.toFixed(1)}</span></span></a></li>`)}</ol>`.s;
  } catch {}
}
