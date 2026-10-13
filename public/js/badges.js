// Badges on the client: the compact row on the profile, the Badges sheet with every badge
// (unlocked and locked, with progress), the row on public squad pages and the unlock toasts.

import { t } from './i18n.js';
import { html, raw, $, sheet, toast, errText } from './ui.js';
import { api } from './api.js';
import { BADGE_ICONS, LOCK } from './badge-icons.js';

const icon = (id) => raw(BADGE_ICONS[id] || BADGE_ICONS['first-verdict']);
const MAX_ROW = 6;

function streakHtml(streak) {
  if (!streak || (!streak.current && !streak.best)) return '';
  return html`<span class="streak"><b>🔥 ${t('badge.streak', { n: streak.current })}</b>${streak.best > streak.current ? html`<small>${t('badge.best', { n: streak.best })}</small>` : ''}</span>`;
}

/** The profile row: newest badges first, at most 6, then "+3", and the streak. */
export function badgeRowHtml(b) {
  const list = b?.list || [];
  const hasNew = list.some((x) => x.isNew);
  return html`<button type="button" class="badge-row" id="badgerow" aria-haspopup="dialog" aria-label="${t('badge.open', { n: list.length, total: b?.total ?? 18 })}">
    ${list.length
      ? html`<span class="badge-icons">${list.slice(0, MAX_ROW).map((x) => html`<span class="bdg on" title="${x.name}">${icon(x.id)}</span>`)}${list.length > MAX_ROW ? html`<span class="bdg more">+${list.length - MAX_ROW}</span>` : ''}</span>`
      : html`<span class="badge-none">${t('badge.none')}</span>`}
    ${hasNew ? html`<span class="new-dot">${t('badge.new')}</span>` : ''}
    ${streakHtml(b?.streak)}
    <span class="see-all">${t('badge.seeAll')}</span>
  </button>`;
}

const progressText = (p) => (p.unit ? `${Number.isInteger(p.value) ? p.value : p.value.toFixed(1)} / ${p.target} ${p.unit}` : '');

function tileHtml(b) {
  const on = !!b.unlocked;
  return html`<li><button type="button" class="bdg-tile ${on ? 'on' : 'off'}" data-badge="${b.id}">
    <span class="bdg ${on ? 'on' : 'off'}">${icon(b.id)}${on ? '' : html`<span class="lock">${raw(LOCK)}</span>`}${b.isNew ? html`<i class="dot" aria-label="${t('badge.new')}"></i>` : ''}</span>
    <b>${b.name}</b>
    <small>${on ? (b.unlocked.gw ? t('badge.unlockedGw', { gw: b.unlocked.gw }) : t('badge.unlocked')) : progressText(b.progress) || b.desc}</small>
  </button></li>`;
}

/** The Badges sheet: count, progress bar, groups; a tap on a badge shows its detail. */
export async function openBadgesSheet(onSeen) {
  let data;
  try { data = await api('/api/me/badges'); } catch (e) { toast(errText(e), { bad: true }); return; }
  const sh = sheet(html`<span></span>`, { label: t('badge.title') });
  const list = () => {
    sh.el.innerHTML = html`<div class="grab" aria-hidden="true"></div>
      <h2>${t('badge.title')}</h2>
      <p class="sub" style="margin:0 0 6px">${t('badge.count', { n: data.unlocked, total: data.total })}</p>
      <div class="bdg-bar" role="progressbar" aria-valuemin="0" aria-valuemax="${data.total}" aria-valuenow="${data.unlocked}" aria-label="${t('badge.count', { n: data.unlocked, total: data.total })}"><span style="width:${Math.round((data.unlocked / data.total) * 100)}%"></span></div>
      ${data.streak?.best ? html`<p class="bdg-streak">🔥 ${t('badge.streak', { n: data.streak.current })} · ${t('badge.best', { n: data.streak.best })}</p>` : ''}
      ${data.groups.map((g) => html`<h3 class="section-h">${t(`badge.group.${g.name}`)}</h3><ul class="bdg-grid">${g.badges.map(tileHtml)}</ul>`)}`.s;
    sh.el.querySelectorAll('[data-badge]').forEach((b) => b.addEventListener('click', () => detail(b.dataset.badge)));
  };
  const detail = (id) => {
    const b = data.groups.flatMap((g) => g.badges).find((x) => x.id === id);
    const on = !!b.unlocked;
    sh.el.innerHTML = html`<div class="grab" aria-hidden="true"></div>
      <button type="button" class="link-btn" id="bdg-back">‹ ${t('badge.title')}</button>
      <div class="bdg-detail">
        <span class="bdg big ${on ? 'on' : 'off'}">${icon(b.id)}${on ? '' : html`<span class="lock">${raw(LOCK)}</span>`}</span>
        <h2>${b.name}</h2>
        <p>${b.desc}</p>
        ${on
          ? html`<p class="bdg-when"><span class="ycard mini" aria-hidden="true"></span>${b.unlocked.gw ? t('badge.unlockedGw', { gw: b.unlocked.gw }) : t('badge.unlocked')}</p>`
          : html`<div class="bdg-bar"><span style="width:${Math.round((b.progress.value / b.progress.target) * 100)}%"></span></div><p class="sub">${progressText(b.progress)}</p>`}
        <p class="sub">${t('badge.share', { n: b.pct })}</p>
      </div>`.s;
    $('#bdg-back', sh.el).addEventListener('click', list);
    $('#bdg-back', sh.el).focus();
  };
  list();
  if (data.groups.some((g) => g.badges.some((b) => b.isNew))) {
    api('/api/me/badges/seen', { method: 'POST' }).then(() => onSeen?.()).catch(() => {});
  }
}

/** Public squad page: the owner's unlocked badges, no list. */
export function publicBadgesHtml(list) {
  if (!list?.length) return '';
  return html`<div class="badge-public" aria-label="${t('badge.ownerBadges')}"><span class="badge-icons">${list.slice(0, 8).map((x) => html`<span class="bdg on" title="${x.name}" role="img" aria-label="${x.name}">${icon(x.id)}</span>`)}${list.length > 8 ? html`<span class="bdg more">+${list.length - 8}</span>` : ''}</span></div>`;
}

/** "Badge unlocked: Sharp Eye", once per badge on this device. */
export function toastBadges(list) {
  if (!list?.length) return;
  let shown = [];
  try { shown = JSON.parse(localStorage.getItem('sj-badges-toasted') || '[]'); } catch {}
  const fresh = list.filter((b) => !shown.includes(b.id));
  if (!fresh.length) return;
  try { localStorage.setItem('sj-badges-toasted', JSON.stringify([...shown, ...fresh.map((b) => b.id)])); } catch {}
  fresh.forEach((b, i) => setTimeout(() => toast(t('badge.toast', { name: b.name }), { ms: 3500 }), 400 + i * 3800));
}
