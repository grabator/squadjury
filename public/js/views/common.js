// Pieces shared by several views: the squad card, sharing and reporting.

import { t } from '../i18n.js';
import { html, raw, $, ICONS, sheet, toast, errText } from '../ui.js';
import { squadHtml, formationOf } from '../pitch.js';
import { api } from '../api.js';
import { ensureUser } from '../auth.js';
import { store } from '../store.js';

/** Owner, @handle and formation, then the squad (pitch, or the original screenshot). */
export function teamCardHtml(fpl, team, { report = true } = {}) {
  const hasShot = !!team.image;
  const f = formationOf(fpl, team.picks);
  return html`
    <div class="jcard-head">
      <div class="who">
        <b>${team.nickname}${team.demo ? html`<span class="tag" title="${t('judge.example')}">${t('judge.exampleShort')}</span>` : ''}</b>
        <span>${team.x ? html`<a href="https://x.com/${team.x}" target="_blank" rel="noopener">@${team.x}</a>` : `GW${team.gw}`}${f ? ` · ${f}` : ''}</span>
      </div>
      <span class="head-right">
        ${hasShot ? html`<button type="button" class="icon-btn" data-shot aria-pressed="false" aria-label="${t('judge.viewShot')}" title="${t('judge.viewShot')}">${raw(ICONS.shot)}</button>` : ''}
        ${report && !team.mine ? html`<button type="button" class="icon-btn" data-report aria-label="${t('judge.report')}" title="${t('judge.report')}">${raw(ICONS.flag)}</button>` : ''}
      </span>
    </div>
    <div class="squad-box squad-view">${squadHtml(fpl, team)}</div>`;
}

/** Wires the pitch/screenshot toggle and the report button inside a card. The screenshot loads only on tap. */
export function wireTeamCard(root, fpl, team) {
  const btn = $('[data-shot]', root);
  btn?.addEventListener('click', () => {
    const shot = btn.getAttribute('aria-pressed') !== 'true';
    btn.setAttribute('aria-pressed', String(shot));
    btn.innerHTML = shot ? ICONS.pitch : ICONS.shot;
    btn.setAttribute('aria-label', shot ? t('judge.viewPitch') : t('judge.viewShot'));
    $('.squad-view', root).innerHTML = shot
      ? html`<div class="shot"><img src="${team.image}" alt="Screenshot of ${team.nickname}'s squad"></div>`.s
      : squadHtml(fpl, team).s;
  });
  $('[data-report]', root)?.addEventListener('click', () => reportTeam(team));
}

export async function reportTeam(team) {
  if (!(await ensureUser())) return;
  const s = sheet(
    html`<h2>${t('judge.reportTitle')}</h2><p>${t('judge.reportText')}</p>
      <div class="row"><button class="btn btn-ghost" data-no>${t('post.cancel')}</button><button class="btn btn-danger" data-yes>${raw(ICONS.flag)}${t('judge.report')}</button></div>`,
    { label: t('judge.reportTitle') },
  );
  $('[data-no]', s.el).onclick = s.close;
  $('[data-yes]', s.el).onclick = async () => {
    try {
      await api('/api/reports', { method: 'POST', body: { key: team.key } });
      toast(t('judge.reportDone'));
    } catch (e) {
      toast(errText(e), { bad: true });
    }
    s.close();
  };
}

/** The verdict moment: a big yellow card with the score lands on the squad. */
export const verdictCard = (score) => html`<div class="moment" aria-hidden="true"><small>${t('judge.verdict').toUpperCase()}</small><strong>${score}</strong></div>`;

export const shareUrl = (team) => `${location.origin}/t/${team.key}`;

/** Picks the right X text for where a squad stands. */
export function xText(team, place) {
  const link = shareUrl(team);
  const base = { gw: team.gw, link, score: team.avg?.toFixed?.(1) ?? team.avg, votes: team.votes, rank: place?.rank, total: place?.total };
  if (team.locked && place?.rank === 1) return t('x.champion', base);
  if (place?.rank && place.rank <= 10 && team.votes >= 5) return t('x.top10', base);
  const left = store.state.gw ? store.state.gw.deadline - Date.now() : Infinity;
  if (team.votes >= 3 && team.avg != null) return t('x.scored', base);
  if (left < 24 * 3600e3 && !team.locked) return t('x.deadline', base);
  return t('x.posted', base);
}

export const xIntent = (text) => `https://x.com/intent/post?text=${encodeURIComponent(text)}`;
