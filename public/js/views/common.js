// Pieces shared by several views: the squad card, the gavel, sharing and reporting.

import { t } from '../i18n.js';
import { html, raw, $, ICONS, sheet, toast, errText, avatar } from '../ui.js';
import { squadHtml } from '../pitch.js';
import { api } from '../api.js';
import { ensureUser } from '../auth.js';
import { store } from '../store.js';

export const GAVEL_SVG = `<svg viewBox="-130 -60 260 330" aria-hidden="true">
  <rect x="-14" y="30" width="28" height="230" rx="14" fill="#fff"/>
  <rect x="-118" y="-50" width="236" height="100" rx="22" fill="#3cff8f"/>
  <rect x="-118" y="-50" width="236" height="40" rx="22" fill="#fff" opacity=".25"/>
  <rect x="-86" y="-50" width="18" height="100" fill="#0a0f1c" opacity=".9"/>
  <rect x="68" y="-50" width="18" height="100" fill="#0a0f1c" opacity=".9"/></svg>`;

/** Owner line, gameweek chip and the squad (pitch, or the original screenshot). */
export function teamCardHtml(fpl, team, { report = true } = {}) {
  const hasShot = !!team.image;
  return html`
    <div class="jcard-head">
      <div class="owner">
        ${avatar(team.nickname)}
        <b>${team.nickname}</b>
        ${team.x ? html`<a class="xlink" href="https://x.com/${team.x}" target="_blank" rel="noopener" aria-label="@${team.x} on X">${raw(ICONS.x.replace('<svg', '<svg style="width:15px;height:15px"'))}</a>` : ''}
        ${team.demo ? html`<span class="tag tag-demo" title="${t('judge.example')}">${t('judge.exampleShort')}</span>` : ''}
      </div>
      <span class="head-right">
        ${hasShot ? html`<button type="button" class="icon-btn" data-shot aria-pressed="false" aria-label="${t('judge.viewShot')}" title="${t('judge.viewShot')}">${raw(ICONS.post)}</button>` : ''}
        ${report && !team.mine ? html`<button type="button" class="icon-btn" data-report aria-label="${t('judge.report')}" title="${t('judge.report')}">${raw(ICONS.flag)}</button>` : ''}
        <span class="gwchip">GW${team.gw}</span>
      </span>
    </div>
    <div class="squad-box squad-view">${squadHtml(fpl, team)}</div>`;
}

/** Wires the pitch/screenshot toggle and the report button inside a card. */
export function wireTeamCard(root, fpl, team) {
  const btn = $('[data-shot]', root);
  btn?.addEventListener('click', () => {
    const shot = btn.getAttribute('aria-pressed') !== 'true';
    btn.setAttribute('aria-pressed', String(shot));
    btn.innerHTML = shot ? ICONS.shirt : ICONS.post;
    btn.setAttribute('aria-label', shot ? t('judge.viewPitch') : t('judge.viewShot'));
    $('.squad-view', root).innerHTML = shot
      ? html`<div class="shot"><img src="${team.image}" alt="Screenshot of ${team.nickname}'s squad" loading="lazy"></div>`.s
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

/** Colour of a verdict on the red (1) to green (10) scale. */
export const verdictColor = (n) => `hsl(${(n - 1) * 15.5} 92% 60%)`;

/** The stamp overlay: gavel comes down, verdict lands in its own colour. */
export function verdictOverlay(score) {
  return html`<div class="verdict" aria-hidden="true">
      <div class="gavel">${raw(GAVEL_SVG)}</div>
      <div class="stamp" style="--sc:${verdictColor(score)}"><div><small>${t('judge.verdict').toUpperCase()}</small><strong>${score}</strong></div></div>
    </div>`;
}

/** Camera flash over the whole screen when the verdict lands. */
export function flash() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const f = document.createElement('div');
  f.className = 'flash';
  document.body.append(f);
  setTimeout(() => f.remove(), 480);
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
