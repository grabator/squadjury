// "Rate my team" link (/r/:key): a squad ready to be rated by someone who may not have an
// account yet. The verdict can be tapped first; signing in then sends it straight away.

import { t } from '../i18n.js';
import { html, $, toast, haptic, errText, reduceMotion } from '../ui.js';
import { api } from '../api.js';
import { loadFpl } from '../fpl.js';
import { store } from '../store.js';
import { signIn } from '../auth.js';
import { navigate } from '../app.js';
import { teamCardHtml, wireTeamCard, verdictCard } from './common.js';
import { whistle } from '../sound.js';

const PENDING = 'sj-pending-verdict';
const readPending = () => { try { return JSON.parse(sessionStorage.getItem(PENDING) || 'null'); } catch { return null; } };
const setPending = (v) => { try { v ? sessionStorage.setItem(PENDING, JSON.stringify(v)) : sessionStorage.removeItem(PENDING); } catch {} };

export async function mount(el, key) {
  const fpl = await loadFpl();
  let team;
  try {
    ({ team } = await api(`/api/teams/${key}`));
  } catch {
    const pages = await import('./pages.js');
    return pages.mount(el, '404');
  }
  if (team.mine) return navigate(`/t/${key}`, { replace: true });
  draw(el, fpl, team);
  // A verdict tapped before signing in (for example before a page reload) is sent now.
  const pending = readPending();
  if (pending?.key === key && store.state.user?.nickname && !team.myVote) send(el, fpl, team, pending.score);
}

function draw(el, fpl, team, { justVoted = false } = {}) {
  const open = !team.locked && store.state.gw?.id === team.gw;
  const voted = team.myVote != null;
  const s = store.state;
  document.title = `${t('share.rateMy', { gw: team.gw })} | SquadJury`;
  el.innerHTML = html`<div class="rate-page">
    <h1 class="rate-ask"><span class="ycard" aria-hidden="true"></span><span>${open ? t('rate.wants', { nick: team.nickname, gw: team.gw }) : t('rate.closed', { gw: team.gw })}</span></h1>
    ${voted || !open
      ? html`<div class="scoreboard" style="margin:0"><div class="big ${team.avg == null ? 'none' : ''}">${team.avg != null ? team.avg.toFixed(1) : '-'}</div>
          <div class="meta"><b>${justVoted ? t('rate.thanks') : t('judge.juryAvg')}</b><span>${voted ? `${t('rate.yours', { n: team.myVote })} · ` : ''}${team.votes === 1 ? t('squad.verdict1') : t('lb.votes', { n: team.votes })}</span></div></div>`
      : ''}
    <article class="jcard">${teamCardHtml(fpl, team)}</article>
    ${open && !voted
      ? html`<div class="controls" style="padding:0">
          <div class="vscale"><b>${t('judge.question')}</b><span>${t('judge.scale')}</span></div>
          <div class="verdicts" role="group" aria-label="${t('judge.rate')}">${Array.from({ length: 10 }, (_, i) => html`<button type="button" class="vbtn" data-score="${i + 1}" aria-label="${t('judge.score', { n: i + 1 })}">${i + 1}</button>`)}</div></div>`
      : html`<div class="rate-next">
          ${s.gw ? html`<a class="btn btn-go" href="/jury/">${t('rate.more')}</a>` : ''}
          ${s.gw && !s.mine ? html`<a class="btn" href="/jury/post">${t('rate.post')}</a>` : ''}</div>`}
  </div>`.s;
  wireTeamCard($('.jcard', el), fpl, team);
  el.querySelectorAll('.vbtn').forEach((b) => b.addEventListener('click', () => tap(el, fpl, team, +b.dataset.score)));
}

async function tap(el, fpl, team, score) {
  el.querySelectorAll('.vbtn').forEach((x) => x.classList.toggle('chosen', +x.dataset.score === score));
  if (!store.state.user?.nickname) {
    setPending({ key: team.key, score });
    const ok = await signIn({ title: t('rate.signIn'), text: t('rate.signInText', { score }) });
    if (!ok) {
      setPending(null);
      el.querySelectorAll('.vbtn').forEach((x) => x.classList.remove('chosen'));
      toast(t('rate.cancelled'));
      return;
    }
    // Signed in: maybe this was your own squad, or you had already judged it.
    const { team: fresh } = await api(`/api/teams/${team.key}`);
    if (fresh.mine) { setPending(null); return navigate(`/t/${team.key}`, { replace: true }); }
    team = fresh;
  }
  send(el, fpl, team, score);
}

async function send(el, fpl, team, score) {
  setPending(null);
  const card = $('.jcard', el);
  haptic(20);
  if (score === 10) whistle();
  card.classList.add('judged');
  card.insertAdjacentHTML('beforeend', verdictCard(score).s);
  try {
    const r = await api('/api/votes', { method: 'POST', body: { key: team.key, score } });
    store.set({ judged: r.judged });
    await new Promise((res) => setTimeout(res, reduceMotion() ? 300 : 800));
    const { team: fresh } = await api(`/api/teams/${team.key}`);
    draw(el, fpl, fresh, { justVoted: true });
  } catch (e) {
    card.classList.remove('judged');
    $('.moment', card)?.remove();
    toast(errText(e), { bad: true });
  }
}
