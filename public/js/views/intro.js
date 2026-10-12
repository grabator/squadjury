// First visit: three cards (Post, Judge, Win). Skippable, shown once.

import { t } from '../i18n.js';
import { html, raw, $ } from '../ui.js';

const ART = {
  post: `<svg class="art" viewBox="0 0 240 200" aria-hidden="true"><rect x="70" y="10" width="100" height="180" rx="18" fill="#18233a" stroke="#2c3b5c" stroke-width="3"/><rect x="78" y="22" width="84" height="156" rx="10" fill="#0f6b3c"/><g fill="#fff" opacity=".9">${[[120, 50], [95, 80], [120, 80], [145, 80], [100, 112], [140, 112], [120, 145]].map(([x, y]) => `<rect x="${x - 11}" y="${y}" width="22" height="7" rx="2"/><path transform="translate(${x - 9} ${y - 16}) scale(.28)" d="M18 4 L8 9 L2 22 L11 26 L14 21 L14 54 L50 54 L50 21 L53 26 L62 22 L56 9 L46 4 Q40 10 32 10 Q24 10 18 4 Z" fill="#e2231a"/>`).join('')}</g><rect x="78" y="84" width="84" height="3" fill="#3cff8f" opacity=".9"><animate attributeName="y" values="24;176;24" dur="2.4s" repeatCount="indefinite"/></rect><circle cx="190" cy="40" r="20" fill="#3cff8f"/><path d="M181 40l6 6 12-12" stroke="#03210f" stroke-width="4" fill="none" stroke-linecap="round"/></svg>`,
  judge: `<svg class="art" viewBox="0 0 240 200" aria-hidden="true"><g transform="translate(120 112)"><circle r="62" fill="none" stroke="#3cff8f" stroke-width="7"/><circle r="51" fill="none" stroke="#3cff8f" stroke-width="2" opacity=".4"/><text y="22" text-anchor="middle" font-family="Barlow Condensed, Arial Narrow, sans-serif" font-weight="800" font-size="64" fill="#3cff8f" transform="rotate(-12)">9</text></g><g transform="translate(150 40) rotate(-38)"><rect x="-6" y="14" width="12" height="90" rx="6" fill="#fff"/><rect x="-46" y="-20" width="92" height="40" rx="9" fill="#3cff8f"/><rect x="-34" y="-20" width="7" height="40" fill="#0a0f1c"/><rect x="27" y="-20" width="7" height="40" fill="#0a0f1c"/></g></svg>`,
  win: `<svg class="art" viewBox="0 0 240 200" aria-hidden="true"><rect x="30" y="120" width="56" height="60" rx="6" fill="#22304d"/><rect x="92" y="90" width="56" height="90" rx="6" fill="#2c3b5c"/><rect x="154" y="138" width="56" height="42" rx="6" fill="#1a2438"/><text x="58" y="160" text-anchor="middle" font-family="Barlow Condensed, sans-serif" font-weight="800" font-size="28" fill="#d5dceb">2</text><text x="120" y="142" text-anchor="middle" font-family="Barlow Condensed, sans-serif" font-weight="800" font-size="34" fill="#ffc94a">1</text><text x="182" y="168" text-anchor="middle" font-family="Barlow Condensed, sans-serif" font-weight="800" font-size="24" fill="#e8925a">3</text><path d="M104 30h32v16a16 16 0 0 1-32 0z" fill="#ffc94a"/><path d="M114 62h12v12h-12zM108 76h24v6h-24z" fill="#ffc94a"/><path d="M136 34h10v4a10 10 0 0 1-10 10M104 34H94v4a10 10 0 0 0 10 10" stroke="#ffc94a" stroke-width="4" fill="none"/></svg>`,
};

export function showIntro() {
  const done = () => {
    try { localStorage.setItem('sj-intro', '1'); } catch {}
    el.remove();
    document.body.style.overflow = '';
  };
  const el = document.createElement('div');
  el.className = 'intro';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', 'Welcome to SquadJury');
  const slides = [
    ['post', t('intro.postT'), t('intro.postP')],
    ['judge', t('intro.judgeT'), t('intro.judgeP')],
    ['win', t('intro.winT'), t('intro.winP')],
  ];
  el.innerHTML = html`<div class="top"><button class="link-btn" data-skip>${t('intro.skip')}</button></div>
    <div class="slides">${slides.map(([k, h, p]) => html`<section class="slide">${raw(ART[k])}<h2>${h}</h2><p>${p}</p></section>`)}</div>
    <div class="dots" aria-hidden="true">${slides.map((_, i) => raw(`<i class="${i ? '' : 'on'}"></i>`))}</div>
    <button class="btn btn-go btn-block" data-next>${t('intro.next')}</button>`.s;
  document.body.append(el);
  document.body.style.overflow = 'hidden';
  const track = $('.slides', el);
  const dots = [...el.querySelectorAll('.dots i')];
  const next = $('[data-next]', el);
  const at = () => Math.round(track.scrollLeft / track.clientWidth);
  const sync = () => {
    const i = at();
    dots.forEach((d, k) => d.classList.toggle('on', k === i));
    next.textContent = i === slides.length - 1 ? t('intro.start') : t('intro.next');
  };
  track.addEventListener('scroll', () => requestAnimationFrame(sync), { passive: true });
  next.onclick = () => (at() >= slides.length - 1 ? done() : track.scrollTo({ left: (at() + 1) * track.clientWidth, behavior: 'smooth' }));
  $('[data-skip]', el).onclick = done;
  el.addEventListener('keydown', (e) => e.key === 'Escape' && done());
  next.focus();
}
