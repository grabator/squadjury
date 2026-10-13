// Public squad page (/t/:key): the link people share. Judge it right here.

import { t } from '../i18n.js';
import { html, $, toast, haptic, errText, reduceMotion } from '../ui.js';
import { api } from '../api.js';
import { loadFpl } from '../fpl.js';
import { store } from '../store.js';
import { ensureUser } from '../auth.js';
import { teamCardHtml, wireTeamCard, verdictCard, pointsHtml, duelRowHtml, wireDuelRow } from './common.js';
import { whistle } from '../sound.js';
import { publicBadgesHtml, toastBadges } from '../badges.js';
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
  el.innerHTML = html`<div style="display:grid;gap:12px"><h1 class="sr-only">${t('team.title', { nick: team.nickname, gw: team.gw })}</h1>
    ${team.avg != null
      ? html`<div class="scoreboard" style="margin:0"><div class="big">${team.avg.toFixed(1)}</div>
          <div class="meta"><b>${t('judge.juryAvg')}</b><span>${t('lb.votes', { n: team.votes })}${p.rank ? ` · ${t('squad.rank', { rank: p.rank, total: p.total })}` : ''}</span></div></div>`
      : ''}
    ${team.locked ? pointsHtml(team) : ''}
    ${duelRowHtml(team)}
    <article class="jcard">${teamCardHtml(fpl, team)}</article>
    ${publicBadgesHtml(team.ownerBadges)}
    ${canVote
      ? html`<div class="controls" style="padding:0">
          <div class="vscale"><b>${team.myVote ? `${t('judge.yourVerdict')}: ${team.myVote}` : t('judge.question')}</b><span>${t('judge.scale')}</span></div>
          <div class="verdicts" role="group" aria-label="${t('judge.rate')}">${Array.from({ length: 10 }, (_, i) => html`<button type="button" class="vbtn ${team.myVote === i + 1 ? 'chosen' : ''}" data-score="${i + 1}" aria-label="${t('judge.score', { n: i + 1 })}">${i + 1}</button>`)}</div></div>`
      : ''}
    <div class="row">${!store.state.mine && store.state.gw ? html`<a class="btn btn-go" href="/post">${t('judge.postSquad')}</a>` : ''}<a class="btn" href="/">${t('page.home')}</a></div>
  </div>`.s;
  const card = $('.jcard', el);
  wireTeamCard(card, fpl, team);
  wireDuelRow(el, team);
  el.querySelectorAll('.vbtn').forEach((b) =>
    b.addEventListener('click', async () => {
      if (!(await ensureUser())) return;
      const score = +b.dataset.score;
      haptic(20);
      if (score === 10) whistle();
      el.querySelectorAll('.vbtn').forEach((x) => x.classList.toggle('chosen', x === b));
      card.classList.add('judged');
      card.insertAdjacentHTML('beforeend', verdictCard(score).s);
      try {
        const r = await api('/api/votes', { method: 'POST', body: { key: team.key, score } });
        store.set({ judged: r.judged });
        toastBadges(r.badges);
        await new Promise((res) => setTimeout(res, reduceMotion() ? 300 : 800));
        const { team: fresh } = await api(`/api/teams/${team.key}`);
        draw(el, fpl, fresh);
      } catch (e) {
        card.classList.remove('judged');
        $('.moment', card)?.remove();
        toast(errText(e), { bad: true });
      }
    }),
  );
}
