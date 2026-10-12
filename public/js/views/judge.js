// Judge: one squad at a time on a deck of cards. Tap a verdict, the gavel comes down,
// the next card is dealt. The whole screen fits the phone, from the clock to Skip.

import { t } from '../i18n.js';
import { html, raw, $, toast, haptic, reduceMotion, errText, ICONS, confetti, countUp, avatar } from '../ui.js';
import { api, withRetry } from '../api.js';
import { loadFpl } from '../fpl.js';
import { store } from '../store.js';
import { ensureUser } from '../auth.js';
import { teamCardHtml, wireTeamCard, verdictOverlay, xIntent, shareUrl, flash, verdictColor } from './common.js';
import { gavel as gavelSound, crowd } from '../sound.js';

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
        <div class="controls" id="controls"></div>
      </section>
      <aside class="aside-board" aria-labelledby="aside-h"><h2 id="aside-h"><span class="live-badge"><i></i>LIVE</span>${t('judge.live')}</h2><div id="aside"></div></aside>
    </div>`.s;
  renderBar();
  unsub = store.subscribe(renderBar);
  await fill();
  show();
  loadAside();
  asideTimer = setInterval(loadAside, 30000);
  onKey = (e) => {
    if (e.target.closest('input, textarea, .sheet, .intro') || e.metaKey || e.ctrlKey || e.altKey) return;
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

/** Progress ring with one segment per squad you still need to judge. */
function ring(done, total) {
  const r = 11, c = 2 * Math.PI * r, seg = c / total, gap = 2.2;
  let out = '';
  for (let i = 0; i < total; i++) {
    out += `<circle cx="15" cy="15" r="${r}" class="${i < done ? 'seg-on' : 'seg-off'}" stroke-dasharray="${seg - gap} ${c - seg + gap}" stroke-dashoffset="${-i * seg}"/>`;
  }
  return `<svg class="ringp" viewBox="0 0 30 30" aria-hidden="true">${out}</svg>`;
}

let lastBar = '';
function renderBar() {
  const s = store.state;
  const bar = $('#mybar', root);
  if (!bar) return;
  let out;
  if (s.mine) {
    const p = s.mine.place || {};
    const need = s.judged < s.minJudged;
    const right = need
      ? html`<span class="rank" title="${t('judge.progress', { n: s.judged, max: s.minJudged })}"><span class="k">${s.judged}/${s.minJudged}</span>${raw(ring(s.judged, s.minJudged))}</span>`
      : p.rank ? html`<span class="rank"><span class="pos num">#${p.rank}</span></span>` : html`<span class="rank"><span class="k">${t('lb.waiting')}</span></span>`;
    out = html`<a class="lt" href="/squad" aria-label="${t('judge.yourSquad')}">
      <span class="big" data-count>${s.mine.avg != null ? s.mine.avg.toFixed(1) : '-'}</span>
      <span class="meta"><b>${t('judge.yourSquad')}</b><span class="k">${t('lb.votes', { n: s.mine.votes })}${need ? ` · ${t('judge.progressShort', { n: s.minJudged - s.judged })}` : ''}</span></span>
      ${right}</a>`.s;
  } else if (s.gw) {
    out = html`<a class="lt cta" href="/post"><span class="meta"><b>${t('judge.postYours')}</b><span class="k">GW${s.gw.id}</span></span><span class="btn btn-go btn-sm">${raw(ICONS.post)}${t('judge.postCta')}</span></a>`.s;
  } else out = '';
  if (out === lastBar && bar.innerHTML) return;
  const before = parseFloat($('[data-count]', bar)?.textContent);
  bar.innerHTML = out;
  lastBar = out;
  const big = $('[data-count]', bar);
  if (big && s.mine?.avg != null && !Number.isNaN(before)) { big.textContent = before.toFixed(1); countUp(big, s.mine.avg); }
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

const EMPTY_ART = `<svg class="art" viewBox="0 0 150 120" aria-hidden="true"><rect x="22" y="24" width="72" height="88" rx="12" fill="#18233a" transform="rotate(-8 58 68)"/><rect x="40" y="18" width="72" height="88" rx="12" fill="#22304d" transform="rotate(5 76 62)"/><rect x="48" y="30" width="56" height="62" rx="6" fill="#0f6b3c" transform="rotate(5 76 62)"/><circle cx="118" cy="26" r="16" fill="#3cff8f"/><path d="M110 26l6 6 10-11" stroke="#03210f" stroke-width="3.5" fill="none" stroke-linecap="round"/></svg>`;

function show() {
  const deck = $('#deck', root);
  const controls = $('#controls', root);
  const team = queue[0];
  if (!team) {
    const s = store.state;
    const none = !s.gw;
    deck.innerHTML = html`<div class="empty" style="margin:auto">${raw(EMPTY_ART)}
        <h2>${none ? t('clock.season') : s.judged ? t('judge.emptyTitle') : t('judge.emptyNone', { gw: s.gw.id })}</h2>
        <p>${t('judge.emptyText')}</p>
        <div class="row" style="justify-content:center">
          ${!s.mine && s.gw ? html`<a class="btn btn-go" href="/post">${raw(ICONS.post)}${t('judge.postCta')}</a>` : ''}
          <a class="btn" href="${xIntent(t('x.invite', { link: s.mine ? shareUrl(s.mine) : location.origin }))}" target="_blank" rel="noopener">${raw(ICONS.x)}${t('judge.invite')}</a>
        </div></div>`.s;
    controls.innerHTML = '';
    return;
  }
  const ghosts = Math.min(2, queue.length - 1);
  deck.innerHTML = html`${ghosts > 1 ? raw('<div class="ghost g2" aria-hidden="true"></div>') : ''}${ghosts > 0 ? raw('<div class="ghost" aria-hidden="true"></div>') : ''}
    <article class="jcard enter" aria-label="${team.nickname}'s squad">${teamCardHtml(fpl, team)}<span class="skip-hint" aria-hidden="true">${t('judge.skip').toUpperCase()}</span></article>`.s;
  const card = $('.jcard', deck);
  wireTeamCard(card, fpl, team);
  wireSwipe(card);
  // Ghost cards match the width of the squad on the top card.
  // and the card shrinks to the squad, so there is no empty band inside it.
  requestAnimationFrame(() => {
    const sq = card.querySelector('.squad')?.getBoundingClientRect();
    if (!sq) return;
    const box = card.querySelector('.squad-box').getBoundingClientRect();
    const spare = Math.max(0, box.height - sq.height);
    const ch = Math.round(card.getBoundingClientRect().height - spare);
    deck.style.setProperty('--cw', `${Math.min(deck.clientWidth, sq.width + 16)}px`);
    deck.style.setProperty('--ch', `${ch}px`);
    card.style.maxWidth = `${sq.width + 16}px`;
  });
  if (!controls.firstChild) {
    controls.innerHTML = html`
      <div class="verdicts" role="group" aria-label="${t('judge.rate')}">
        ${Array.from({ length: 10 }, (_, i) => html`<button type="button" class="vbtn" style="--n:${i + 1}" data-score="${i + 1}" aria-label="${t('judge.score', { n: i + 1 })}">${i + 1}</button>`)}
      </div>
      <div class="judge-actions">
        <span class="judge-hint">${t('judge.hint')}</span>
        <button type="button" class="skip" id="skip">${t('judge.skip')}${raw(ICONS.skip)}</button>
      </div>`.s;
    controls.querySelectorAll('.vbtn').forEach((b) => b.addEventListener('click', () => vote(+b.dataset.score)));
    $('#skip', controls).addEventListener('click', skip);
  }
  controls.querySelectorAll('.vbtn').forEach((b) => b.classList.remove('chosen'));
}

/** Drag with physics: the card follows the finger, tilts, springs back or flies away. */
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
    dx = e.clientX - x0;
    if (Math.abs(dx) < 6 && Math.abs(e.clientY - y0) > 10) return;
    card.style.transform = `translateX(${dx}px) rotate(${dx / 22}deg)`;
    if (hint) hint.style.opacity = String(Math.min(1, Math.max(0, -dx / 110)));
  });
  const end = () => {
    if (x0 == null) return;
    x0 = null;
    card.classList.remove('drag');
    if (dx < -90) {
      haptic(12);
      card.style.transition = 'transform .32s cubic-bezier(.5,0,.75,0), opacity .32s';
      card.style.transform = `translateX(-130%) rotate(-18deg)`;
      card.style.opacity = '0';
      return skip(true);
    }
    card.classList.add('spring');
    card.style.transform = '';
    if (hint) hint.style.opacity = '0';
  };
  card.addEventListener('pointerup', end);
  card.addEventListener('pointercancel', end);
}

async function next(direction, alreadyGone = false) {
  const card = $('.jcard', root);
  if (card && !reduceMotion() && !alreadyGone) {
    card.classList.remove('enter');
    card.classList.add(direction === 'left' ? 'leave-left' : 'leave-right');
  }
  if (!reduceMotion()) await new Promise((r) => setTimeout(r, 340));
  queue.shift();
  if (queue.length < 3) await fill();
  show();
  busy = false;
}

function skip(swiped = false) {
  if (busy || !queue[0]) return;
  busy = true;
  skipped.push(queue[0].key);
  next('left', swiped === true);
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
  haptic(score >= 9 ? [20, 40, 30] : 24);
  const btn = $(`.vbtn[data-score="${score}"]`, root);
  btn?.classList.add('chosen');
  const deck = $('#deck', root);
  const card = $('.jcard', deck);
  card?.insertAdjacentHTML('beforeend', verdictOverlay(score).s);
  setTimeout(() => {
    flash();
    gavelSound(score >= 9 ? 1.2 : 1);
    if (score === 10) crowd();
    if (score >= 9) {
      const r = card?.getBoundingClientRect();
      if (r) confetti({ x: r.left + r.width / 2, y: r.top + r.height * 0.45, n: score === 10 ? 90 : 50, spread: 60 });
    }
  }, 260);
  const line = document.createElement('p');
  line.className = 'verdict-line';
  line.style.color = verdictColor(score);
  line.innerHTML = html`${t('judge.verdict')}: ${score}`.s;
  card?.append(line);
  card?.classList.add('shake');

  const before = store.state.judged;
  // Optimistic: the next squad comes up while the verdict is sent in the background.
  withRetry(() => api('/api/votes', { method: 'POST', body: { key: team.key, score } }))
    .then((r) => {
      line.innerHTML = r.votes > 1
        ? html`${t('judge.verdict')}: ${score} <span>· ${t('judge.juryAvg')} ${r.avg.toFixed(1)}</span>`.s
        : html`${t('judge.verdict')}: ${score} <span>· ${t('judge.firstVerdict')}</span>`.s;
      store.set({ judged: r.judged });
      if (before < store.state.minJudged && r.judged >= store.state.minJudged && store.state.mine) {
        toast(t('judge.unlocked'), { icon: 'star', ms: 3600 });
        confetti();
      }
    })
    .catch((e) => toast(e.code === 'offline' ? t('judge.sentFail') : errText(e), { bad: true }));

  await new Promise((r) => setTimeout(r, reduceMotion() ? 450 : 1050));
  $('.verdict .gavel', deck)?.classList.add('lift');
  await next('right');
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
      <li class="${r.mine ? 'me' : ''}"><a href="/t/${r.key}">
        <span class="pos">${r.rank}</span>${avatar(r.nickname)}<span class="who"><b>${r.nickname}</b><small>${t('lb.votes', { n: r.votes })}</small></span>
        <span class="score"><span class="num">${r.avg.toFixed(1)}</span></span></a></li>`)}</ol>`.s;
  } catch {}
}
