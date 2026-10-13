// My squad: the verdict, the rank, how the jury voted, sharing and replacing the screenshot.

import { t } from '../i18n.js';
import { html, raw, $, sheet, toast, errText, ICONS } from '../ui.js';
import { api } from '../api.js';
import { loadFpl } from '../fpl.js';
import { store } from '../store.js';
import { navigate } from '../app.js';
import { teamCardHtml, wireTeamCard, xText, xIntent, shareUrl, rateUrl, shareImage, canShareFiles, channelsHtml, wireChannels, pointsHtml, duelRowHtml, wireDuelRow } from './common.js';
import { renderShareImage, downloadBlob } from '../share.js';
import { squadHtml } from '../pitch.js';

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
  const hasResult = team.locked && team.points != null;
  el.innerHTML = html`<div>
    <div class="page-head"><h1 class="title">${t('squad.title')}, GW${team.gw}</h1></div>
    <div class="scoreboard"><span class="ycard" aria-hidden="true"></span>
      <div class="big ${team.avg == null ? 'none' : ''}">${team.avg != null ? team.avg.toFixed(1) : '-'}</div>
      <div class="meta">${status}<span>${team.votes === 1 ? t('squad.verdict1') : t('squad.verdicts', { n: team.votes })}</span></div>
    </div>
    ${team.votes ? html`<section class="chart" aria-labelledby="dist-h"><h2 id="dist-h">${t('squad.dist')}</h2>
      <div class="hist" role="img" aria-label="${t('squad.dist')}: ${dist.map((n, i) => `${i + 1}: ${n}`).join(', ')}">${dist.map((n, i) => raw(`<i class="${i === top ? 'top' : ''}" style="height:${Math.max(3, Math.round((n / max) * 100))}%"></i>`))}</div>
      <div class="hist-x" aria-hidden="true">${dist.map((_, i) => raw(`<span>${i + 1}</span>`))}</div></section>` : ''}
    ${duelRowHtml(team)}
    ${planHtml(fpl, team)}
    ${hasResult ? html`<section class="result-card" aria-labelledby="res-h">
      <h2 id="res-h">${t('pts.resultTitle', { gw: team.gw })}</h2>
      ${pointsHtml(team)}
      <div class="share-row" style="margin:12px 0 0"><button class="btn btn-go" id="share-result">${raw(canShareFiles() ? ICONS.share : ICONS.download)}${t('pts.shareResult')}</button>
        <a class="btn" id="result-x" href="${xIntent(resultText(team, p))}" target="_blank" rel="noopener">${raw(ICONS.x)}${t('squad.postX')}</a>
        <button class="btn" id="result-story">${t('squad.story')}</button></div>
    </section>` : team.locked ? pointsHtml(team) : ''}
    ${!team.locked ? html`<section class="get-rated" aria-labelledby="gr-h">
      <div class="gr-head"><span class="ycard" aria-hidden="true"></span><div><h2 id="gr-h">${t('squad.getRated')}</h2><p>${t('squad.getRatedText')}</p></div></div>
      ${channelsHtml()}</section>` : ''}
    ${hasResult ? html`<div class="share-row"><button class="btn" id="copy">${raw(ICONS.link)}${t('squad.copy')}</button></div>` : html`<div class="share-row">
      <a class="btn btn-go" id="postx" href="${xIntent(xText(team, p))}" target="_blank" rel="noopener">${raw(ICONS.x)}${t('squad.postX')}</a>
      ${team.locked ? html`<button class="btn" id="copy">${raw(ICONS.link)}${t('squad.copy')}</button>` : ''}
      <button class="btn" id="dl">${raw(canShareFiles() ? ICONS.share : ICONS.download)}${canShareFiles() ? t('squad.shareImage') : t('squad.download')}</button>
    </div>`}
    <article class="jcard">${teamCardHtml(fpl, team, { report: false })}</article>
    <p style="text-align:center;margin:12px 0 0">${hasResult ? '' : html`<button class="link-btn" id="story">${t('squad.story')}</button> · `}<button class="link-btn" id="embed">${t('embed.button')}</button>${!team.locked && !hasResult ? html` · <button class="link-btn" id="replace">${t('squad.replace')}</button>` : ''}</p>
  </div>`.s;
  wireTeamCard($('.jcard', el), fpl, team);
  wireDuelRow(el, team);
  wirePlan(el, fpl, team);
  // Plan B became the squad: its link preview is drawn again.
  if (!team.locked && !team.og) uploadOg(fpl, team, p);

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
  const dl = $('#dl', el);
  if (dl) dl.onclick = async () => {
    toast(t('squad.making'), { ms: 1500 });
    try { await shareImage(fpl, team, p); } catch (e) { toast(errText(e), { bad: true }); }
  };
  const story = $('#story', el);
  if (story) story.onclick = download('story');
  const result = (kind) => async () => {
    toast(t('squad.making'), { ms: 1500 });
    try {
      const blob = await renderShareImage(kind, fpl, team, p, { result: true });
      const name = `squadjury-gw${team.gw}-result${kind === 'story' ? '-story' : ''}.png`;
      if (kind === 'x' && canShareFiles()) {
        try { await navigator.share({ files: [new File([blob], name, { type: 'image/png' })], text: resultText(team, p) }); return; } catch (e) { if (e.name === 'AbortError') return; }
      }
      downloadBlob(blob, name);
    } catch (e) {
      toast(errText(e), { bad: true });
    }
  };
  $('#share-result', el)?.addEventListener('click', result('x'));
  $('#result-story', el)?.addEventListener('click', result('story'));
  $('#embed', el)?.addEventListener('click', () => embedSheet(fpl, team));
  $('#replace', el)?.addEventListener('click', () => {
    const s = sheet(html`<h2>${t('post.replaceTitle')}</h2><p>${t('post.replaceText', { n: team.votes })}</p>
      <div class="row"><button class="btn btn-ghost" data-no>${t('post.cancel')}</button><button class="btn btn-danger" data-yes>${t('post.replaceGo')}</button></div>`);
    $('[data-no]', s.el).onclick = s.close;
    $('[data-yes]', s.el).onclick = () => { s.close(); navigate('/post?replace=1'); };
  });
}

/** Embed code for websites, and the 1920x1080 image with a QR code for YouTube. */
function embedSheet(fpl, team) {
  const src = `${location.origin}/embed/${team.key}`;
  const code = `<iframe src="${src}" width="360" height="520" style="border:0;border-radius:12px;max-width:100%" title="${team.nickname}'s FPL squad on SquadJury" loading="lazy"></iframe>`;
  const sh = sheet(html`<h2>${t('embed.title')}</h2><p>${t('embed.text')}</p>
    <label class="sr-only" for="emb-code">${t('embed.title')}</label>
    <textarea id="emb-code" class="emb-code" readonly rows="4">${code}</textarea>
    <div class="row" style="margin-top:8px"><button type="button" class="btn btn-go" id="emb-copy">${raw(ICONS.copy)}${t('embed.copy')}</button>
      <a class="btn" href="${src}" target="_blank" rel="noopener">${t('embed.preview')}</a></div>
    <h3 class="section-h" style="margin-top:18px">${t('embed.ytTitle')}</h3>
    <p class="sub" style="margin-top:0">${t('embed.ytText')}</p>
    <button type="button" class="btn btn-block" id="emb-yt">${raw(ICONS.download)}${t('embed.ytImage')}</button>`, { label: t('embed.title') });
  $('#emb-copy', sh.el).onclick = async () => {
    try { await navigator.clipboard.writeText(code); toast(t('embed.copied')); } catch { $('#emb-code', sh.el).select(); }
  };
  $('#emb-yt', sh.el).onclick = async () => {
    toast(t('squad.making'), { ms: 1500 });
    try {
      const { renderYouTubeImage } = await import('../share.js');
      downloadBlob(await renderYouTubeImage(fpl, team, `${location.origin}/r/${team.key}?s=yt`), `squadjury-gw${team.gw}-youtube.png`);
    } catch (e) { toast(errText(e), { bad: true }); }
  };
}

async function uploadOg(fpl, team, place) {
  try {
    const blob = await renderShareImage('og', fpl, team, place);
    const fd = new FormData();
    fd.set('og', blob, 'card.jpg');
    await api('/api/teams/mine/og', { method: 'PUT', form: fd });
  } catch {}
}

/** Players in one plan and not the other, and the captain when it changes. */
function planDiff(fpl, a, b) {
  const name = (id) => fpl.byId.get(id)?.web_name || '?';
  const ids = (x) => new Set(x.picks.map((p) => p.id));
  const A = ids(a), B = ids(b);
  const out = [...A].filter((id) => !B.has(id)).map(name);
  const inn = [...B].filter((id) => !A.has(id)).map(name);
  const parts = [];
  const list = (names) => (names.length > 4 ? `${names.slice(0, 4).join(', ')} +${names.length - 4}` : names.join(', '));
  if (out.length) parts.push(t('plan.diffOut', { names: list(out) }));
  if (inn.length) parts.push(t('plan.diffIn', { names: list(inn) }));
  if (a.captain !== b.captain) parts.push(t('plan.diffCaptain', { a: name(a.captain), b: name(b.captain) }));
  return parts;
}

const when = (ms) => new Date(ms).toLocaleString('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit' });

function planHtml(fpl, team) {
  if (team.locked) return '';
  const pl = team.plan;
  if (!pl) {
    return team.canPlan ? html`<section class="plan-card add"><div><h2>${t('plan.addTitle')}</h2><p>${t('plan.addText')}</p></div>
      <a class="btn btn-sm" href="/post?plan=b">${raw(ICONS.plus)}${t('plan.add')}</a></section>` : '';
  }
  const total = pl.votesA + pl.votesB;
  const pa = total ? Math.round((pl.votesA / total) * 100) : 50;
  if (pl.chosen) return html`<p class="plan-done">${t('plan.chosen', { x: pl.chosen.toUpperCase(), n: total })}</p>`;
  const diff = planDiff(fpl, team, pl);
  return html`<section class="plan-card" aria-labelledby="plan-h">
    <h2 id="plan-h">${t('plan.title')}</h2>
    <div class="plan-bar" role="img" aria-label="${t('plan.result', { a: pa, b: 100 - pa, n: total })}"><span style="width:${pa}%"></span></div>
    <p class="plan-res"><b>${t('plan.planA')} ${total ? `${pa}%` : '-'}</b><span>${t('plan.votes', { n: total })}</span><b>${t('plan.planB')} ${total ? `${100 - pa}%` : '-'}</b></p>
    ${diff.length ? html`<ul class="plan-diff">${diff.map((d) => html`<li>${d}</li>`)}</ul>` : ''}
    <div class="plan-actions">
      <button type="button" class="btn btn-sm" data-choose="a">${t('plan.makeA')}</button>
      <button type="button" class="btn btn-sm" data-choose="b">${t('plan.makeB')}</button>
    </div>
    <p class="hint">${t('plan.closes', { when: when(pl.closesAt) })} <button type="button" class="link-btn" id="plan-view">${t('plan.view')}</button> · <button type="button" class="link-btn" id="plan-del">${t('plan.remove')}</button></p>
  </section>`;
}

function wirePlan(el, fpl, team) {
  const pl = team.plan;
  if (!pl) return;
  el.querySelectorAll('[data-choose]').forEach((b) => b.addEventListener('click', () => {
    const x = b.dataset.choose;
    const s = sheet(html`<h2>${t('plan.confirmTitle', { x: x.toUpperCase() })}</h2><p>${t('plan.confirmText')}</p>
      <div class="row"><button class="btn btn-ghost" data-no>${t('post.cancel')}</button><button class="btn btn-go" data-yes>${t('plan.confirmGo')}</button></div>`, { label: t('plan.title') });
    $('[data-no]', s.el).onclick = s.close;
    $('[data-yes]', s.el).onclick = async () => {
      try {
        await api('/api/plans/mine/choose', { method: 'POST', body: { pick: x } });
        s.close();
        toast(t('plan.done', { x: x.toUpperCase() }));
        const { team: fresh } = await api(`/api/teams/${team.key}`);
        renderMine(el, fpl, fresh);
      } catch (e) { toast(errText(e), { bad: true }); }
    };
  }));
  $('#plan-view', el)?.addEventListener('click', () => {
    sheet(html`<h2>${t('plan.planB')}</h2><div class="plan-pitch">${squadHtml(fpl, { ...pl, gw: team.gw })}</div>`, { label: t('plan.planB') });
  });
  $('#plan-del', el)?.addEventListener('click', async () => {
    try {
      await api('/api/plans/mine', { method: 'DELETE' });
      const { team: fresh } = await api(`/api/teams/${team.key}`);
      renderMine(el, fpl, fresh);
    } catch (e) { toast(errText(e), { bad: true }); }
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

function resultText(team, place) {
  const rank = place?.rank ? t('pts.xRank', { rank: place.rank, total: place.total }) : '';
  return t('pts.xText', { gw: team.gw, score: team.avg != null ? team.avg.toFixed(1) : '-', pts: team.points, rank });
}
