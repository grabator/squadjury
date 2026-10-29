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
        <span>${team.x ? html`<a href="https://x.com/${team.x}" target="_blank" rel="noopener">@${team.x}</a>` : t('lb.gw', { gw: team.gw })}${f ? ` · ${f}` : ''}${team.league ? html`<span class="lg-chip" title="${t('league.from')}">${team.league}</span>` : ''}</span>
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

/** After a gameweek: the jury's verdict next to the real points, and how the jury did. */
export function pointsHtml(team) {
  if (team.points == null) return team.locked ? html`<p class="pts-wait">${t('pts.waiting')}</p>` : '';
  return html`<section class="pts-box" aria-label="${t('pts.jury')} / ${t('pts.real')}">
    <div class="pts-cell"><span>${t('pts.jury')}</span><b>${team.avg != null ? team.avg.toFixed(1) : '-'}</b></div>
    <div class="pts-vs" aria-hidden="true">vs</div>
    <div class="pts-cell real"><span>${t('pts.real')}${team.verified ? html` <i class="pts-ok" title="${t('pts.verifiedTitle')}">${t('pts.verified')}</i>` : ''}</span><b>${team.points}<small> pts</small></b></div>
    ${team.call ? html`<p class="pts-call ${team.call}">${t(`pts.${team.call}`)}</p>` : ''}
    ${team.pointsRank ? html`<p class="pts-rank">${t('pts.rank', { rank: team.pointsRank, total: team.pointsTotal })}</p>` : ''}
  </section>`;
}

/** "Duels: 34 W · 12 L (74%)". For the owner: "Your squad won 34 of 46 duels" and the best win. Tap for the last 10. */
export function duelRowHtml(team) {
  const d = team.duels;
  if (!d || !(d.w + d.l)) return '';
  const n = d.w + d.l;
  const pct = Math.round((d.w / n) * 100);
  const main = team.mine ? t('duel.mineWon', { w: d.w, n }) : t('duel.record', { w: d.w, l: d.l, pct });
  const best = team.mine && team.bestWin
    ? (team.bestWin.rank ? t('duel.bestWin', { rank: team.bestWin.rank, nick: team.bestWin.nickname }) : t('duel.bestWinNoRank', { nick: team.bestWin.nickname }))
    : d.rank ? t('duel.ratingRank', { n: d.rating, rank: d.rank }) : t('duel.rating', { n: d.rating });
  return html`<button type="button" class="duel-row" id="duelrow" aria-haspopup="dialog">${raw(ICONS.duel)}<span><b>${main}</b><small>${best}</small></span><span class="chev" aria-hidden="true">›</span></button>`;
}

export function wireDuelRow(el, team) {
  $('#duelrow', el)?.addEventListener('click', async () => {
    try {
      const r = await api(`/api/teams/${team.key}/duels`);
      sheet(html`<h2>${t('duel.recordTitle')}</h2><p>${t('duel.recordText')}</p>
        <ul class="list duel-list">${r.last.map((x) => html`<li><a class="item" href="/t/${x.key}"><span>${t('duel.vs', { nick: x.nickname })}${x.demo ? html`<span class="tag">${t('judge.exampleShort')}</span>` : ''}</span>
          <span class="res ${x.won ? 'w' : 'l'}">${x.won ? t('duel.won') : t('duel.lost')}</span></a></li>`)}</ul>`, { label: t('duel.recordTitle') });
    } catch (e) { toast(errText(e), { bad: true }); }
  });
}

/** Link that opens the squad ready to be rated, while its gameweek is open. `s` names the channel. */
export const rateUrl = (team, s) => `${location.origin}/r/${team.key}${s ? `?s=${s}` : ''}`;
export const shareUrl = (team, s = 'x') => (team.locked ? `${location.origin}/t/${team.key}` : rateUrl(team, s));

/** Phones get WhatsApp, Viber and Messenger buttons; computers only X and Copy link. */
export const isPhone = () =>
  /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
  (matchMedia('(pointer: coarse)').matches && navigator.maxTouchPoints > 0 && Math.min(screen.width, screen.height) < 900);

/**
 * Row of share buttons. opts: { url(s): link for a channel, text(url): message, title }.
 * Channels: the phone's own share sheet, WhatsApp, Viber, Messenger, X and Copy link.
 */
export function channelsHtml() {
  const phone = isPhone();
  const items = [
    phone && navigator.share ? ['share', t('share.more'), ICONS.share] : null,
    phone ? ['wa', 'WhatsApp', ICONS.chat] : null,
    phone ? ['vb', 'Viber', ICONS.chat] : null,
    phone ? ['ms', 'Messenger', ICONS.chat] : null,
    ['x', 'X', ICONS.x],
    ['copy', t('squad.copy'), ICONS.copy],
  ].filter(Boolean);
  return html`<div class="channels">${items.map(([id, label, icon]) => html`<button type="button" class="chan" data-chan="${id}">${raw(icon)}<span>${label}</span></button>`)}</div>`;
}

export function wireChannels(root, { url, text }) {
  root.querySelectorAll('[data-chan]').forEach((b) => b.addEventListener('click', async () => {
    const ch = b.dataset.chan;
    const link = url(ch);
    const msg = text(link);
    const enc = encodeURIComponent;
    if (ch === 'share') {
      try { await navigator.share({ text: msg }); } catch {}
    } else if (ch === 'wa') location.href = `https://wa.me/?text=${enc(msg)}`;
    else if (ch === 'vb') location.href = `viber://forward?text=${enc(msg)}`;
    else if (ch === 'ms') location.href = `fb-messenger://share/?link=${enc(link)}`;
    else if (ch === 'x') window.open(xIntent(msg), '_blank', 'noopener');
    else {
      try { await navigator.clipboard.writeText(msg); toast(t('squad.copied')); } catch { toast(link); }
    }
  }));
}

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

/** Phones with a share sheet get "Share image" (straight into the X app), others a download. */
export const canShareFiles = () => {
  try { return !!navigator.canShare?.({ files: [new File([''], 'x.png', { type: 'image/png' })] }); } catch { return false; }
};

export async function shareImage(fpl, team, place) {
  const { renderShareImage, downloadBlob } = await import('../share.js');
  const blob = await renderShareImage('x', fpl, team, place);
  const name = `squadjury-gw${team.gw}.png`;
  if (canShareFiles()) {
    try {
      await navigator.share({ files: [new File([blob], name, { type: 'image/png' })], text: xText(team, place) });
      return;
    } catch (e) {
      if (e.name === 'AbortError') return;
    }
  }
  downloadBlob(blob, name);
}

export const xIntent = (text) => `https://x.com/intent/post?text=${encodeURIComponent(text)}`;
