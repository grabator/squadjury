// My squad: the verdict, the rank, how the jury voted, sharing and replacing the screenshot.

import { t } from '../i18n.js';
import { html, raw, $, sheet, toast, errText, ICONS } from '../ui.js';
import { api } from '../api.js';
import { loadFpl } from '../fpl.js';
import { store } from '../store.js';
import { navigate } from '../app.js';
import { teamCardHtml, wireTeamCard, xText, xIntent, shareUrl, rateUrl, shareImage, canShareFiles, channelsHtml, wireChannels } from './common.js';
import { renderShareImage, downloadBlob } from '../share.js';

export async function mount(el, keyFromRoute) {
  const s = store.state;
  const fpl = await loadFpl();
  const key = keyFromRoute || s.mine?.key;
  if (!key) {
    el.innerHTML = html`<div class="empty"><span class="ycard"></span>
      <h1 class="title" style="margin-bottom:8px">${t('squad.title')}</h1><p>${s.gw ? t('squad.none', { gw: s.gw.id }) : t('clock.season')}</p>
      ${s.gw ? html`<a class="btn btn-go" href="/post">${t('judge.postSquad')}</a>` : ''}</div>`.s;
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
  el.innerHTML = html`<div>
    <div class="page-head"><h1 class="title">${t('squad.title')}, GW${team.gw}</h1></div>
    <div class="scoreboard"><span class="ycard" aria-hidden="true"></span>
      <div class="big ${team.avg == null ? 'none' : ''}">${team.avg != null ? team.avg.toFixed(1) : '-'}</div>
      <div class="meta">${status}<span>${team.votes === 1 ? t('squad.verdict1') : t('squad.verdicts', { n: team.votes })}</span></div>
    </div>
    ${team.votes ? html`<section class="chart" aria-labelledby="dist-h"><h2 id="dist-h">${t('squad.dist')}</h2>
      <div class="hist" role="img" aria-label="${t('squad.dist')}: ${dist.map((n, i) => `${i + 1}: ${n}`).join(', ')}">${dist.map((n, i) => raw(`<i class="${i === top ? 'top' : ''}" style="height:${Math.max(3, Math.round((n / max) * 100))}%"></i>`))}</div>
      <div class="hist-x" aria-hidden="true">${dist.map((_, i) => raw(`<span>${i + 1}</span>`))}</div></section>` : ''}
    ${!team.locked ? html`<section class="get-rated" aria-labelledby="gr-h">
      <div class="gr-head"><span class="ycard" aria-hidden="true"></span><div><h2 id="gr-h">${t('squad.getRated')}</h2><p>${t('squad.getRatedText')}</p></div></div>
      ${channelsHtml()}</section>` : ''}
    <div class="share-row">
      <a class="btn btn-go" id="postx" href="${xIntent(xText(team, p))}" target="_blank" rel="noopener">${raw(ICONS.x)}${t('squad.postX')}</a>
      ${team.locked ? html`<button class="btn" id="copy">${raw(ICONS.link)}${t('squad.copy')}</button>` : ''}
      <button class="btn" id="dl">${raw(canShareFiles() ? ICONS.share : ICONS.download)}${canShareFiles() ? t('squad.shareImage') : t('squad.download')}</button>
    </div>
    <article class="jcard">${teamCardHtml(fpl, team, { report: false })}</article>
    <p style="text-align:center;margin:12px 0 0"><button class="link-btn" id="story">${t('squad.story')}</button>${!team.locked ? html` · <button class="link-btn" id="replace">${t('squad.replace')}</button>` : ''}</p>
  </div>`.s;
  wireTeamCard($('.jcard', el), fpl, team);

  const gr = $('.get-rated', el);
  if (gr) {
    wireChannels(gr, {
      url: (ch) => rateUrl(team, ch),
      text: (link) => t(link.includes('s=x') ? 'squad.rateTextX' : 'squad.rateText', { gw: team.gw, link }),
    });
    // The "Rate my team" link preview is drawn here once and stored with the squad.
    if (!team.rateOg) uploadRateOg(fpl, team, p);
  }
  $('#copy', el)?.addEventListener('click', async () => {
    const url = shareUrl(team);
    try { await navigator.clipboard.writeText(url); toast(t('squad.copied')); } catch { toast(url); }
  });
  const download = (kind) => async () => {
    toast(t('squad.making'), { ms: 1500 });
    try {
      const blob = await renderShareImage(kind, fpl, team, p);
      downloadBlob(blob, `squadjury-gw${team.gw}-${kind === 'story' ? 'story' : 'x'}.png`);
    } catch (e) {
      toast(errText(e), { bad: true });
    }
  };
  $('#dl', el).onclick = async () => {
    toast(t('squad.making'), { ms: 1500 });
    try { await shareImage(fpl, team, p); } catch (e) { toast(errText(e), { bad: true }); }
  };
  $('#story', el).onclick = download('story');
  $('#replace', el)?.addEventListener('click', () => {
    const s = sheet(html`<h2>${t('post.replaceTitle')}</h2><p>${t('post.replaceText', { n: team.votes })}</p>
      <div class="row"><button class="btn btn-ghost" data-no>${t('post.cancel')}</button><button class="btn btn-danger" data-yes>${t('post.replaceGo')}</button></div>`);
    $('[data-no]', s.el).onclick = s.close;
    $('[data-yes]', s.el).onclick = () => { s.close(); navigate('/post?replace=1'); };
  });
}

async function uploadRateOg(fpl, team, place) {
  try {
    const blob = await renderShareImage('rate', fpl, team, place);
    const fd = new FormData();
    fd.set('og', blob, 'rate.jpg');
    await api('/api/teams/mine/rate-og', { method: 'PUT', form: fd });
  } catch {}
}
