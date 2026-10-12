// My squad: verdict, rank, how the jury voted, sharing and replacing the screenshot.

import { t } from '../i18n.js';
import { html, raw, $, sheet, toast, errText, ICONS, countUp, confetti } from '../ui.js';
import { api } from '../api.js';
import { loadFpl } from '../fpl.js';
import { store } from '../store.js';
import { navigate } from '../app.js';
import { teamCardHtml, wireTeamCard, xText, xIntent, shareUrl } from './common.js';
import { renderShareImage, downloadBlob } from '../share.js';

export async function mount(el, keyFromRoute) {
  const s = store.state;
  const fpl = await loadFpl();
  const key = keyFromRoute || s.mine?.key;
  if (!key) {
    el.innerHTML = html`<div class="empty"><img src="/img/logo/mark.svg" alt="" width="88" height="88" style="width:88px;margin:0 auto 14px;border-radius:22px">
      <h2>${t('squad.title')}</h2><p>${s.gw ? t('squad.none', { gw: s.gw.id }) : t('clock.season')}</p>
      ${s.gw ? html`<a class="btn btn-go" href="/post">${raw(ICONS.post)}${t('judge.postCta')}</a>` : ''}</div>`.s;
    return;
  }
  const { team } = await api(`/api/teams/${key}`);
  renderMine(el, fpl, team);
}

/** Renders the owner's view of a squad (also used by /t/:key when it is yours). */
export function renderMine(el, fpl, team) {
  const p = team.place || {};
  const dist = team.dist || [];
  const max = Math.max(1, ...dist);
  const top = dist.indexOf(Math.max(...dist));
  const status = p.rank
    ? html`<b>${t('squad.rank', { rank: p.rank, total: p.total })}</b><span>${t('squad.better', { n: p.better })}</span>`
    : team.votes
      ? html`<b>${t('lb.waiting')}</b><span>${p.needsVotes ? t('squad.needs', { votes: p.needsVotes }) : p.needsJudged ? t('squad.needsJudge', { n: p.needsJudged }) : ''}</span>`
      : html`<b>${t('lb.waiting')}</b><span>${t('squad.noVerdicts')}</span>`;
  const avgLine = team.gwAvg != null && team.votes
    ? raw(`<span class="avgline" style="left:calc(${((team.gwAvg - 0.5) / 10) * 100}% - 1px)" data-label="avg ${team.gwAvg}"></span>`)
    : '';
  el.innerHTML = html`<div class="squad-wrap">
    <div class="page-head"><h1 class="title">${t('squad.title')} <span class="hl">GW${team.gw}</span></h1></div>
    <div class="scoreboard">
      <div class="big ${team.avg == null ? 'none' : ''}" id="bigscore">${team.avg != null ? '0.0' : '?'}</div>
      <div class="meta">${status}<span>${team.votes === 1 ? t('squad.verdict1') : t('squad.verdicts', { n: team.votes })}</span></div>
    </div>
    ${team.votes ? html`<section class="chart" aria-labelledby="dist-h"><h2 id="dist-h">${t('squad.dist')}</h2>
      <div class="hist" role="img" aria-label="${t('squad.dist')}: ${dist.map((n, i) => `${i + 1}: ${n}`).join(', ')}">${dist.map((n, i) => raw(`<i class="${i === top ? 'top' : ''}" style="--i:${i};height:${Math.max(3, Math.round((n / max) * 100))}%"></i>`))}${avgLine}</div>
      <div class="hist-x" aria-hidden="true">${dist.map((_, i) => raw(`<span>${i + 1}</span>`))}</div>
      ${team.gwAvg != null ? html`<p class="note2">${t('squad.vsAvg')}</p>` : ''}</section>` : ''}
    <div class="row" style="margin:0 0 14px">
      <button class="btn btn-go" id="share">${raw(ICONS.share)}${t('squad.share')}</button>
      <a class="btn" id="postx" href="${xIntent(xText(team, p))}" target="_blank" rel="noopener">${raw(ICONS.x)}${t('squad.postX')}</a>
    </div>
    <article class="jcard">${teamCardHtml(fpl, team, { report: false })}</article>
    <div class="row" style="margin-top:14px">
      <button class="btn btn-ghost" id="dl">${raw(ICONS.download)}${t('squad.download')}</button>
      <button class="btn btn-ghost" id="story">${raw(ICONS.download)}${t('squad.story')}</button>
    </div>
    ${!team.locked ? html`<p style="text-align:center;margin-top:14px"><button class="link-btn" id="replace">${t('squad.replace')}</button></p>` : ''}
  </div>`.s;
  if (team.avg != null) countUp($('#bigscore', el), team.avg, { ms: 900 });
  // A small celebration the first time your squad is in the top 10.
  if (p.rank && p.rank <= 10 && team.votes >= 5) {
    try {
      const k = `sj-top10-${team.gw}`;
      if (!localStorage.getItem(k)) { localStorage.setItem(k, '1'); toast(t('squad.top10Toast'), { icon: 'star', ms: 3600 }); confetti(); }
    } catch {}
  }
  wireTeamCard($('.jcard', el), fpl, team);

  $('#share', el).onclick = async () => {
    const url = shareUrl(team);
    const text = xText(team, p);
    try {
      if (navigator.canShare) {
        const blob = await renderShareImage('x', fpl, team, p);
        const file = new File([blob], `squadjury-gw${team.gw}.png`, { type: 'image/png' });
        if (navigator.canShare({ files: [file] })) return await navigator.share({ files: [file], text, url });
        return await navigator.share({ text, url });
      }
      await navigator.clipboard.writeText(url);
      toast(t('squad.copied'));
    } catch (e) {
      if (e.name !== 'AbortError') {
        try { await navigator.clipboard.writeText(url); toast(t('squad.copied')); } catch { toast(url); }
      }
    }
  };
  const download = (kind) => async () => {
    toast(t('squad.making'), { ms: 1500 });
    try {
      const blob = await renderShareImage(kind, fpl, team, p);
      downloadBlob(blob, `squadjury-gw${team.gw}-${kind === 'story' ? 'story' : 'x'}.png`);
    } catch (e) {
      toast(errText(e), { bad: true });
    }
  };
  $('#dl', el).onclick = download('x');
  $('#story', el).onclick = download('story');
  $('#replace', el)?.addEventListener('click', () => {
    const s = sheet(html`<h2>${t('post.replaceTitle')}</h2><p>${t('post.replaceText', { n: team.votes })}</p>
      <div class="row"><button class="btn btn-ghost" data-no>${t('post.cancel')}</button><button class="btn btn-danger" data-yes>${t('post.replaceGo')}</button></div>`);
    $('[data-no]', s.el).onclick = s.close;
    $('[data-yes]', s.el).onclick = () => { s.close(); navigate('/post?replace=1'); };
  });
}
