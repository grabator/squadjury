// Pieces shared by several views: the squad card, the gavel, sharing and reporting.

import { t } from '../i18n.js';
import { html, raw, $, ICONS, sheet, toast, errText } from '../ui.js';
import { squadHtml } from '../pitch.js';
import { api } from '../api.js';
import { ensureUser } from '../auth.js';
import { store } from '../store.js';

export const GAVEL_SVG = `<svg viewBox="-130 -60 260 330" aria-hidden="true">
  <rect x="-14" y="30" width="28" height="230" rx="14" fill="#fff"/>
  <rect x="-118" y="-50" width="236" height="100" rx="22" fill="#00ff87"/>
  <rect x="-86" y="-50" width="18" height="100" fill="#1f0022" opacity=".9"/>
  <rect x="68" y="-50" width="18" height="100" fill="#1f0022" opacity=".9"/></svg>`;

/** Owner line, gameweek chip and the squad (pitch, or the original screenshot). */
export function teamCardHtml(fpl, team, { report = true } = {}) {
  const hasShot = !!team.image;
  return html`
    <div class="jcard-head">
      <div class="owner">
        <b>${team.nickname}</b>
        ${team.x ? html`<a href="https://x.com/${team.x}" target="_blank" rel="noopener" aria-label="@${team.x} on X">${raw(ICONS.x.replace('<svg', '<svg style="width:15px;height:15px"'))}</a>` : ''}
        ${team.demo ? html`<span class="tag tag-demo">${t('judge.example')}</span>` : ''}
      </div>
      <span class="head-right">
        ${report && !team.mine ? html`<button type="button" class="icon-btn" data-report aria-label="${t('judge.report')}" title="${t('judge.report')}">${raw(ICONS.flag)}</button>` : ''}
        <span class="gwchip">GW${team.gw}</span>
      </span>
    </div>
    <div class="squad-view">${squadHtml(fpl, team)}</div>
    ${hasShot
      ? html`<div style="margin-top:8px;display:flex;justify-content:center"><div class="seg" role="group" aria-label="View"><button type="button" data-view="pitch" aria-pressed="true">${t('judge.viewPitch')}</button><button type="button" data-view="shot" aria-pressed="false">${t('judge.viewShot')}</button></div></div>`
      : ''}`;
}

/** Wires the pitch/screenshot toggle and the report button inside a card. */
export function wireTeamCard(root, fpl, team) {
  root.querySelectorAll('[data-view]').forEach((b) =>
    b.addEventListener('click', () => {
      const shot = b.dataset.view === 'shot';
      root.querySelectorAll('[data-view]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      $('.squad-view', root).innerHTML = shot
        ? html`<div class="shot"><img src="${team.image}" alt="Screenshot of ${team.nickname}'s squad" loading="lazy"></div>`.s
        : squadHtml(fpl, team).s;
    }),
  );
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

/** The stamp overlay: gavel comes down, verdict lands. */
export function verdictOverlay(score) {
  return html`<div class="verdict" aria-hidden="true">
      <div class="gavel">${raw(GAVEL_SVG)}</div>
      <div class="stamp ${score <= 3 ? 'low' : ''}"><div><small>${t('judge.verdict').toUpperCase()}</small><strong>${score}</strong></div></div>
    </div>`;
}

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
