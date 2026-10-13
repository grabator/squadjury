// League invite link (/l/:code): what the league is, who is in it, and one button to join.

import { t } from '../i18n.js';
import { html, raw, $, toast, errText, ICONS } from '../ui.js';
import { api } from '../api.js';
import { store } from '../store.js';
import { signIn } from '../auth.js';
import { navigate } from '../app.js';
import { membersText, forgetLeagues } from '../leagues.js';

const initials = (n) => n.replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase() || '?';

export async function mount(el, code) {
  let league;
  try {
    ({ league } = await api(`/api/leagues/${code}`));
  } catch {
    el.innerHTML = html`<div class="empty"><span class="ycard"></span><h1 class="title" style="margin-bottom:8px">${t('league.notFound')}</h1><p>${t('league.notFoundText')}</p>
      <a class="btn btn-go" href="/leaderboard">${t('lb.title')}</a></div>`.s;
    return;
  }
  if (league.isMember) return navigate(`/leaderboard?league=${league.code}`, { replace: true });
  document.title = `${t('league.joinTitle', { name: league.name })} | SquadJury`;
  const extra = league.members - league.faces.length;
  el.innerHTML = html`<div class="lg-join">
    <div class="lg-join-card">
      <span class="ycard lg-join-ycard" aria-hidden="true"></span>
      <p class="lg-kicker">${t('share.privateLeague')}</p>
      <h1 class="lg-join-name">${league.name}</h1>
      <p class="sub" style="margin:4px 0 0">${membersText(league.members)}${league.owner ? html` · ${t('league.by', { owner: league.owner })}` : ''}</p>
      <ul class="faces" aria-label="${t('league.membersTitle')}">${league.faces.map((n) => html`<li title="${n}"><span aria-hidden="true">${initials(n)}</span><span class="sr-only">${n}</span></li>`)}${extra > 0 ? html`<li class="face-more">+${extra}</li>` : ''}</ul>
      ${league.top?.length ? html`<div class="lg-top"><h2>${t('league.lastTop', { gw: league.top[0].gw })}</h2>
        <ol>${league.top.map((r) => html`<li><span class="pos">${r.place}</span><b>${r.nickname}</b><span class="num">${r.avg.toFixed(1)}</span></li>`)}</ol></div>` : ''}
      <p class="lg-join-text">${t('league.joinText')}</p>
      <button class="btn btn-go btn-block" id="join">${raw(ICONS.users)}${t('league.joinLeague')}</button>
    </div>
  </div>`.s;
  $('#join', el).addEventListener('click', async (e) => {
    if (!store.state.user?.nickname && !(await signIn({ title: t('league.joinTitle', { name: league.name }), text: t('league.signInText') }))) return;
    e.target.disabled = true;
    try {
      const { league: l } = await api('/api/leagues/join', { method: 'POST', body: { code: league.code } });
      forgetLeagues();
      toast(t('league.joined', { name: l.name }));
      navigate(`/leaderboard?league=${l.code}`, { replace: true });
    } catch (err) {
      e.target.disabled = false;
      toast(errText(err), { bad: true });
    }
  });
}
