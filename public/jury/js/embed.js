// /embed/<key>: a small squad card that FPL creators put on their own site with an iframe.
// The pitch, the jury average and one button that opens the squad on SquadJury.

import { t } from './i18n.js';
import { html } from './ui.js';
import { loadFpl } from './fpl.js';
import { squadHtml, formationOf } from './pitch.js';

const root = document.getElementById('embed');
const key = location.pathname.split('/')[2] || '';

async function main() {
  try {
    const [fpl, res] = await Promise.all([loadFpl(), fetch(`/api/embed/${encodeURIComponent(key)}`)]);
    if (!res.ok) throw new Error('not found');
    const { team } = await res.json();
    const link = `${location.origin}/${team.locked ? 't' : 'r'}/${team.key}?s=embed`;
    const f = formationOf(fpl, team.picks);
    root.innerHTML = html`
      <header class="emb-head">
        <a class="emb-logo" href="${location.origin}/jury/?s=embed" target="_blank" rel="noopener"><picture><img src="/jury/img/logo/logo-white.svg" alt="SquadJury" width="86" height="24"></picture></a>
        <span>GW${team.gw}${f ? ` · ${f}` : ''}</span>
      </header>
      <div class="emb-who">
        <div class="emb-title"><h1 class="emb-name">${team.nickname}</h1>${team.demo ? html`<span class="tag">${t('judge.exampleShort')}</span>` : ''}</div>
        <div class="emb-score">${team.avg != null ? html`<b>${team.avg.toFixed(1)}</b><small>${t('embed.jury', { n: team.votes })}</small>` : html`<small>${t('embed.noVerdicts')}</small>`}</div>
      </div>
      <div class="emb-pitch squad-box">${squadHtml(fpl, team)}</div>
      <a class="btn btn-go btn-block emb-go" href="${link}" target="_blank" rel="noopener">${team.locked ? t('embed.see') : t('embed.rate')}</a>`.s;
  } catch {
    root.innerHTML = html`<div class="emb-missing"><p>${t('embed.missing')}</p><a class="btn" href="${location.origin}" target="_blank" rel="noopener">SquadJury</a></div>`.s;
  }
}
main();
