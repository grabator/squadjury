// Public squad page (/t/:key): the link people share. Judge it right here.

import { t } from '../i18n.js';
import { html, $, toast, haptic, errText, reduceMotion } from '../ui.js';
import { api } from '../api.js';
import { loadFpl } from '../fpl.js';
import { store } from '../store.js';
import { ensureUser } from '../auth.js';
import { teamCardHtml, wireTeamCard, verdictOverlay, flash } from './common.js';
import { gavel as gavelSound, crowd } from '../sound.js';
import { renderMine } from './squad.js';

export async function mount(el, key) {
  const fpl = await loadFpl();
  let team;
  try {
    ({ team } = await api(`/api/teams/${key}`));
  } catch (e) {
    const pages = await import('./pages.js');
    return pages.mount(el, '404');
  }
  if (team.mine) return renderMine(el, fpl, team);
  draw(el, fpl, team);
}

function draw(el, fpl, team) {
  const canVote = !team.locked && store.state.gw?.id === team.gw;
  const p = team.place || {};
  el.innerHTML = html`<div class="squad-wrap" style="display:grid;gap:12px">
    <div class="tdeck" style="position:relative"><article class="jcard enter">${teamCardHtml(fpl, team)}</article></div>
    ${team.avg != null
      ? html`<div class="panel" style="display:flex;justify-content:space-between;align-items:center">
          <span><b>${t('judge.juryAvg')}</b><br><small style="color:var(--text-2)">${t('lb.votes', { n: team.votes })}${p.rank ? `, #${p.rank} of ${p.total}` : ''}</small></span>
          <span class="num" style="font-size:44px;color:var(--accent)">${team.avg.toFixed(1)}</span></div>`
      : ''}
    ${canVote
      ? html`<p class="judge-hint" style="margin:4px 0 0">${team.myVote ? `${t('judge.verdict')}: ${team.myVote}. ${t('me.change')}` : t('judge.hint')}</p>
        <div class="verdicts" role="group" aria-label="${t('judge.rate')}">${Array.from({ length: 10 }, (_, i) => html`<button type="button" class="vbtn ${team.myVote === i + 1 ? 'chosen' : ''}" style="--n:${i + 1}" data-score="${i + 1}" aria-label="${t('judge.score', { n: i + 1 })}">${i + 1}</button>`)}</div>`
      : ''}
    <div class="row" style="margin-top:8px"><a class="btn btn-ghost" href="/">${t('page.home')}</a>${!store.state.mine && store.state.gw ? html`<a class="btn btn-go" href="/post">${t('judge.postCta')}</a>` : ''}</div>
  </div>`.s;
  wireTeamCard($('.jcard', el), fpl, team);
  el.querySelectorAll('.vbtn').forEach((b) =>
    b.addEventListener('click', async () => {
      if (!(await ensureUser())) return;
      const score = +b.dataset.score;
      haptic(24);
      const deck = $('.tdeck .jcard', el);
      deck.insertAdjacentHTML('beforeend', verdictOverlay(score).s);
      setTimeout(() => { flash(); gavelSound(); if (score === 10) crowd(); }, 260);
      try {
        const r = await api('/api/votes', { method: 'POST', body: { key: team.key, score } });
        store.set({ judged: r.judged });
        await new Promise((res) => setTimeout(res, reduceMotion() ? 300 : 1100));
        const { team: fresh } = await api(`/api/teams/${team.key}`);
        draw(el, fpl, fresh);
      } catch (e) {
        $('.verdict', deck)?.remove();
        toast(errText(e), { bad: true });
      }
    }),
  );
}
