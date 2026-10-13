// Share images drawn on a canvas, in the app's daylight style: a square 1080x1080 for posts on X,
// 1080x1920 for stories and 1200x630 for link previews. Our fonts, pitch and logo; no FPL artwork.

import { t } from './i18n.js';
import { kitFor, shirtSvg, fixtureLabel } from './fpl.js';

export const SIZES = {
  x: { w: 1080, h: 1080 },
  story: { w: 1080, h: 1920 },
  og: { w: 1200, h: 630 },
  rate: { w: 1200, h: 630 },
};

const C = { bg: '#f6f6f3', ink: '#111418', ink2: '#5e6670', grass1: '#3da35d', grass2: '#359452', bench: '#e9eee6', fix: '#dde3da', fixInk: '#3b444c', yellow: '#ffd400' };
const FONT = 'Archivo, system-ui, sans-serif';

const imgCache = new Map();
function loadImage(src) {
  if (!imgCache.has(src)) {
    imgCache.set(src, new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = src;
    }));
  }
  return imgCache.get(src);
}
const svgUrl = (svg) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.includes('xmlns') ? svg : svg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"'))}`;

async function fonts() {
  await Promise.all([document.fonts.load(`800 100px ${FONT}`), document.fonts.load(`600 40px ${FONT}`)]).catch(() => {});
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function setFont(g, weight, size, stretch = 'normal') {
  g.font = `${weight} ${size}px ${FONT}`;
  if ('fontStretch' in g) g.fontStretch = stretch;
}

/** Shrinks the text until it fits maxW; returns the size used. */
function fit(g, text, maxW, size, weight = 800, stretch = 'normal') {
  let s = size;
  do {
    setFont(g, weight, s, stretch);
    if (g.measureText(text).width <= maxW) break;
    s -= 2;
  } while (s > 10);
  return s;
}

/** The yellow card with the jury's score, tilted like the one in the app. */
function scoreCard(g, cx, cy, w, scored, score, rot = 0.1) {
  const h = w * 1.31;
  g.save();
  g.translate(cx, cy);
  g.rotate(rot);
  g.shadowColor = 'rgba(0,0,0,.16)';
  g.shadowBlur = w * 0.12;
  g.shadowOffsetY = w * 0.05;
  roundRect(g, -w / 2, -h / 2, w, h, w * 0.11);
  g.fillStyle = C.yellow;
  g.fill();
  g.shadowColor = 'transparent';
  g.fillStyle = C.ink;
  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';
  setFont(g, 800, w * 0.1);
  g.fillText(scored ? t('share.jury') : t('share.rateIt'), 0, -h * 0.27);
  fit(g, score, w * 0.86, w * 0.5, 900, 'semi-condensed');
  g.textBaseline = 'middle';
  g.fillText(score, 0, h * 0.04);
  setFont(g, 700, w * 0.1);
  g.textBaseline = 'alphabetic';
  g.fillText(scored ? '/ 10' : '1 to 10', 0, h * 0.36);
  g.restore();
}

/** Pitch seen from above with the XI, and the bench strip under it, inside (x, y, w, h). */
async function drawSquad(g, fpl, team, x, y, w, h) {
  const benchH = h * 0.2;
  const gap = h * 0.018;
  const pitchH = h - benchH - gap;
  const r = w * 0.018;
  roundRect(g, x, y, w, pitchH, r);
  g.save();
  g.clip();
  for (let i = 0; i < 10; i++) {
    g.fillStyle = i % 2 ? C.grass2 : C.grass1;
    g.fillRect(x, y + (pitchH / 10) * i, w, pitchH / 10 + 1);
  }
  g.strokeStyle = 'rgba(255,255,255,.85)';
  g.lineWidth = Math.max(2, w / 360);
  const px = (f) => x + w * f, py = (f) => y + pitchH * f;
  g.strokeRect(px(0.015), py(0.01), w * 0.97, pitchH * 0.98);
  g.beginPath(); g.moveTo(px(0.015), py(0.5)); g.lineTo(px(0.985), py(0.5)); g.stroke();
  g.beginPath(); g.arc(px(0.5), py(0.5), w * 0.11, 0, Math.PI * 2); g.stroke();
  g.strokeRect(px(0.24), py(0.01), w * 0.52, pitchH * 0.15);
  g.strokeRect(px(0.37), py(0.01), w * 0.26, pitchH * 0.055);
  g.strokeRect(px(0.24), py(0.84), w * 0.52, pitchH * 0.15);
  g.strokeRect(px(0.37), py(0.935), w * 0.26, pitchH * 0.055);
  g.restore();

  roundRect(g, x, y + pitchH + gap, w, benchH, r);
  g.fillStyle = C.bench;
  g.fill();

  const picks = team.picks.map((p) => ({ ...p, pl: fpl.byId.get(p.id) }));
  const xi = picks.filter((p) => !p.bench);
  const rows = [1, 2, 3, 4].map((pos) => xi.filter((p) => p.pl?.element_type === pos)).filter((row) => row.length);
  const bench = picks.filter((p) => p.bench);
  const rowH = pitchH / rows.length;
  const cell = Math.min(w / 5.15, rowH / 0.95); // a player (shirt and plates) is 0.82 of a cell high
  const unitH = cell * 0.82; // shirt plus the two plates
  for (let i = 0; i < rows.length; i++) await drawRow(g, fpl, team, rows[i], x, y + rowH * i + (rowH - unitH) / 2, w, cell);
  const bcell = cell * 0.86;
  setFont(g, 700, w * 0.022);
  g.fillStyle = C.ink2;
  g.textAlign = 'left';
  g.textBaseline = 'top';
  g.fillText(t('judge.bench').toUpperCase(), x + w * 0.025, y + pitchH + gap + benchH * 0.08);
  await drawRow(g, fpl, team, bench, x, y + pitchH + gap + (benchH - bcell * 0.82) / 2 + benchH * 0.06, w, bcell);
}

async function drawRow(g, fpl, team, row, x, y, w, cell) {
  const step = cell * 1.02;
  let cx = x + (w - (row.length - 1) * step) / 2;
  for (const p of row) {
    await drawPlayer(g, fpl, team, p, cx, y, cell);
    cx += step;
  }
}

async function drawPlayer(g, fpl, team, p, cx, y, cell) {
  const kit = kitFor(fpl, p.pl);
  const shirt = await loadImage(svgUrl(shirtSvg(kit, `s${p.id}`)));
  const sw = cell * 0.46, sh = sw * (56 / 64);
  g.save();
  g.shadowColor = 'rgba(0,0,0,.22)';
  g.shadowBlur = cell * 0.03;
  g.shadowOffsetY = cell * 0.015;
  g.drawImage(shirt, cx - sw / 2, y, sw, sh);
  g.restore();
  const isC = p.id === team.captain, isV = p.id === team.vice;
  if (isC || isV) {
    const r = cell * 0.075, ax = cx + sw / 2 + r * 0.1, ay = y + r * 0.6;
    g.beginPath(); g.arc(ax, ay, r, 0, Math.PI * 2);
    g.fillStyle = isC ? C.yellow : '#ffffff'; g.fill();
    g.lineWidth = r * 0.2; g.strokeStyle = isC ? '#ffffff' : C.ink; g.stroke();
    g.fillStyle = C.ink;
    setFont(g, 800, r * 1.15);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(isC ? 'C' : 'V', ax, ay + r * 0.06);
  }
  const name = p.pl?.web_name || '?';
  const fix = fixtureLabel(fpl, p.pl?.team, team.gw).split(',')[0];
  const nh = cell * 0.17, fh = cell * 0.14, ny = y + sh + cell * 0.01;
  const ns = fit(g, name, cell * 0.92, nh * 0.74, 700, name.length > 9 ? 'condensed' : 'semi-condensed');
  const nw = Math.min(cell * 0.98, g.measureText(name).width + cell * 0.12);
  setFont(g, 600, fh * 0.7, 'semi-condensed');
  const fw = Math.min(cell * 0.98, g.measureText(fix).width + cell * 0.12);
  roundRect(g, cx - nw / 2, ny, nw, nh, cell * 0.03);
  g.fillStyle = '#ffffff'; g.fill();
  roundRect(g, cx - fw / 2, ny + nh, fw, fh, cell * 0.03);
  g.fillStyle = C.fix; g.fill();
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = C.ink;
  setFont(g, 700, ns, name.length > 9 ? 'condensed' : 'semi-condensed');
  g.fillText(name, cx, ny + nh * 0.54);
  g.fillStyle = C.fixInk;
  setFont(g, 600, fh * 0.7, 'semi-condensed');
  g.fillText(fix, cx, ny + nh + fh * 0.52);
}

async function brand(g, x, y, h, withUrl = true) {
  const logo = await loadImage('/img/logo/logo.svg');
  const w = h * (logo.width / logo.height);
  g.drawImage(logo, x, y, w, h);
  if (withUrl) {
    g.fillStyle = C.ink2;
    setFont(g, 600, h * 0.62);
    g.textAlign = 'left';
    g.textBaseline = 'alphabetic';
    g.fillText('squadjury.com', x + w + h * 0.7, y + h * 0.78);
  }
}

/**
 * Renders a share image. kind: 'x' | 'story' | 'og'.
 * team: { nickname, x, gw, picks, captain, vice, avg, votes, demo }, place: { rank, total } or null.
 * Returns a Blob (PNG for x and story, JPEG for og).
 */
export async function renderShareImage(kind, fpl, team, place, { result = false } = {}) {
  await fonts();
  const { w, h } = SIZES[kind];
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d');
  g.fillStyle = C.bg;
  g.fillRect(0, 0, w, h);
  const scored = team.avg != null && team.votes > 0;
  const score = scored ? Number(team.avg).toFixed(1) : '?';
  let gwLine = `${t('share.gameweek', { gw: team.gw })}${team.demo ? ` · ${t('judge.exampleShort')}` : ''}`;
  let meta = [team.x ? `@${team.x}` : null, place?.rank ? t('share.of', { rank: place.rank, total: place.total }) : null, scored ? t('share.from', { n: team.votes }) : t('share.judgeMy')].filter(Boolean).join(' · ');
  // Result after the gameweek: the jury's verdict, the real points and how the jury did.
  if (result && team.points != null) {
    gwLine = `GW${team.gw}${team.call ? ` · ${t(`pts.${team.call}`)}` : ''}`;
    meta = place?.rank
      ? t('pts.resultLine', { rank: place.rank, total: place.total, score, pts: team.points })
      : t('pts.resultLineNoRank', { score, pts: team.points });
  }

  if (kind === 'x') {
    const pad = 40;
    await drawSquad(g, fpl, team, pad, 34, w - pad * 2, 740);
    const cardW = 176;
    const left = w - pad * 2 - cardW - 40;
    g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    g.fillStyle = C.ink2; setFont(g, 700, 26);
    g.fillText(gwLine, pad, 846);
    g.fillStyle = C.ink;
    fit(g, team.nickname, left, 70, 900, 'semi-condensed');
    g.fillText(team.nickname, pad, 918);
    g.fillStyle = C.ink2;
    fit(g, meta, left, 28, 600);
    g.fillText(meta, pad, 962);
    await brand(g, pad, 996, 36);
    scoreCard(g, w - pad - cardW / 2 - 6, 922, cardW, scored, score);
  } else if (kind === 'story') {
    const pad = 64;
    await brand(g, pad, 96, 52, false);
    g.textAlign = 'right'; g.textBaseline = 'alphabetic';
    g.fillStyle = C.ink2; setFont(g, 700, 34);
    g.fillText(gwLine, w - pad, 138);
    g.textAlign = 'left';
    g.fillStyle = C.ink;
    fit(g, team.nickname, w - pad * 2, 96, 900, 'semi-condensed');
    g.fillText(team.nickname, pad, 290);
    if (team.x) { g.fillStyle = C.ink2; setFont(g, 600, 36); g.fillText(`@${team.x}`, pad, 344); }
    await drawSquad(g, fpl, team, pad - 20, 400, w - (pad - 20) * 2, 1060);
    scoreCard(g, w / 2, 1650, 230, scored, score);
    g.textAlign = 'center';
    g.fillStyle = C.ink2;
    fit(g, place?.rank || scored ? meta.replace(`@${team.x} · `, '') : 'squadjury.com', w - pad * 2, 34, 600);
    g.fillText(place?.rank || scored ? meta.replace(`@${team.x} · `, '') : 'squadjury.com', w / 2, 1868);
  } else if (kind === 'rate') {
    // Link preview of the "Rate my team" link: the squad, a big question and the empty card.
    const pad = 32;
    const sqW = 520;
    await drawSquad(g, fpl, team, pad, pad, sqW, h - pad * 2);
    const rx = pad + sqW + 52, rw = w - rx - pad;
    await brand(g, rx, 52, 38, false);
    g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    g.fillStyle = C.ink;
    const [l1, ...rest] = t('share.rateMy', { gw: team.gw }).split(' ');
    const line2 = rest.join(' ');
    const big = Math.min(fit(g, l1, rw - 10, 96, 900, 'semi-condensed'), fit(g, line2, rw - 10, 96, 900, 'semi-condensed'));
    setFont(g, 900, big, 'semi-condensed');
    g.fillText(l1, rx, 196);
    g.fillText(line2, rx, 196 + big * 0.98);
    g.fillStyle = C.ink2;
    fit(g, team.nickname, rw - 190, 34, 700, 'semi-condensed');
    g.fillText(team.nickname, rx, 360);
    scoreCard(g, w - pad - 86, 470, 138, false, '?', 0.12);
    g.fillStyle = C.ink;
    setFont(g, 800, 28);
    g.fillText(t('share.oneTap'), rx, 470);
    g.fillStyle = C.ink2;
    setFont(g, 600, 24);
    g.fillText('squadjury.com', rx, 508);
  } else {
    const pad = 32;
    const sqW = 520;
    await drawSquad(g, fpl, team, pad, pad, sqW, h - pad * 2);
    const rx = pad + sqW + 48, rw = w - rx - pad;
    await brand(g, rx, 56, 40, false);
    g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    g.fillStyle = C.ink2; setFont(g, 700, 26);
    g.fillText(gwLine, rx, 172);
    g.fillStyle = C.ink;
    fit(g, team.nickname, rw, 64, 900, 'semi-condensed');
    g.fillText(team.nickname, rx, 238);
    if (team.x) { g.fillStyle = C.ink2; setFont(g, 600, 26); g.fillText(`@${team.x}`, rx, 278); }
    scoreCard(g, rx + 100, 430, 150, scored, score);
    g.textAlign = 'left';
    g.fillStyle = C.ink;
    setFont(g, 800, 30);
    g.fillText(scored ? t('share.from', { n: team.votes }) : t('share.judgeMy'), rx + 210, 420);
    g.fillStyle = C.ink2;
    setFont(g, 600, 24);
    g.fillText('squadjury.com', rx + 210, 458);
  }
  const type = kind === 'og' || kind === 'rate' ? 'image/jpeg' : 'image/png';
  return new Promise((resolve) => canvas.toBlob(resolve, type, 0.9));
}

/** Link preview of a league invite (1200x630): the name, members and a yellow card with the code. */
export async function renderLeagueImage(league) {
  await fonts();
  const w = 1200, h = 630;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d');
  g.fillStyle = C.bg;
  g.fillRect(0, 0, w, h);
  // A strip of pitch along the bottom, the app's grass.
  for (let i = 0; i < 6; i++) {
    g.fillStyle = i % 2 ? C.grass2 : C.grass1;
    g.fillRect((w / 6) * i, h - 70, w / 6 + 1, 70);
  }
  const pad = 72;
  await brand(g, pad, 64, 44, false);
  g.textAlign = 'left';
  g.textBaseline = 'alphabetic';
  g.fillStyle = C.ink2;
  setFont(g, 800, 28);
  g.fillText(t('share.privateLeague').toUpperCase(), pad, 214);
  g.fillStyle = C.ink;
  const nameW = w - pad * 2 - 300;
  const words = league.name.split(' ');
  // One line when it fits big, otherwise two lines.
  let size = fit(g, league.name, nameW, 110, 900, 'semi-condensed');
  let lines = [league.name];
  if (size < 76 && words.length > 1) {
    const cut = Math.ceil(words.length / 2);
    lines = [words.slice(0, cut).join(' '), words.slice(cut).join(' ')];
    size = Math.min(fit(g, lines[0], nameW, 96, 900, 'semi-condensed'), fit(g, lines[1], nameW, 96, 900, 'semi-condensed'));
  }
  setFont(g, 900, size, 'semi-condensed');
  lines.forEach((ln, i) => g.fillText(ln, pad, 214 + size * 1.02 * (i + 1)));
  g.fillStyle = C.ink2;
  setFont(g, 600, 30);
  g.fillText(t('share.leagueMeta', { members: league.members === 1 ? t('league.member1') : t('league.members', { n: league.members }) }), pad, 214 + size * 1.02 * lines.length + 56);
  // The card: JOIN and the code.
  const cw = 210, ch = cw * 1.31, cx = w - pad - cw / 2 + 10, cy = 280;
  g.save();
  g.translate(cx, cy);
  g.rotate(0.1);
  g.shadowColor = 'rgba(0,0,0,.18)';
  g.shadowBlur = 30;
  g.shadowOffsetY = 12;
  roundRect(g, -cw / 2, -ch / 2, cw, ch, 22);
  g.fillStyle = C.yellow;
  g.fill();
  g.shadowColor = 'transparent';
  g.fillStyle = C.ink;
  g.textAlign = 'center';
  setFont(g, 800, 24);
  g.fillText(t('share.joinCard'), 0, -ch * 0.24);
  setFont(g, 900, 44, 'semi-condensed');
  g.fillText(league.code.slice(0, 3), 0, ch * 0.0);
  g.fillText(league.code.slice(3), 0, ch * 0.16);
  setFont(g, 700, 20);
  g.fillText('squadjury.com', 0, ch * 0.38);
  g.restore();
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
}

/** 1080x1080 image for the winner of a head to head match: "I beat Need", GW and league. */
export async function renderH2HImage({ gw, opp, league, score, me }) {
  await fonts();
  const w = 1080, h = 1080;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d');
  g.fillStyle = C.bg;
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < 10; i++) {
    g.fillStyle = i % 2 ? C.grass2 : C.grass1;
    g.fillRect(0, h - 300 + i * 30, w, 30);
  }
  const pad = 80;
  await brand(g, pad, 80, 52, false);
  g.textAlign = 'left';
  g.textBaseline = 'alphabetic';
  g.fillStyle = C.ink2;
  setFont(g, 800, 34);
  g.fillText(t('h2h.imageSub', { gw }).toUpperCase(), pad, 270);
  if (league) {
    setFont(g, 600, 34);
    g.fillText(league, pad, 320);
  }
  g.fillStyle = C.ink;
  setFont(g, 900, 96, 'semi-condensed');
  g.fillText(t('h2h.imageTitle', { opp: '' }).trim(), pad, 450);
  const size = fit(g, opp, w - pad * 2 - 40, 150, 900, 'semi-condensed');
  setFont(g, 900, size, 'semi-condensed');
  g.fillText(opp, pad, 450 + size);
  if (me) {
    g.fillStyle = C.ink2;
    setFont(g, 700, 34);
    g.fillText(me, pad, 450 + size + 64);
  }
  // The yellow card: WIN, and the points when the points decided it.
  const cw = 230, ch = cw * 1.31, cx = w - pad - cw / 2, cy = h - 300;
  g.save();
  g.translate(cx, cy);
  g.rotate(0.12);
  g.shadowColor = 'rgba(0,0,0,.22)';
  g.shadowBlur = 34;
  g.shadowOffsetY = 14;
  roundRect(g, -cw / 2, -ch / 2, cw, ch, 24);
  g.fillStyle = C.yellow;
  g.fill();
  g.shadowColor = 'transparent';
  g.fillStyle = C.ink;
  g.textAlign = 'center';
  setFont(g, 900, 84, 'semi-condensed');
  g.fillText('WIN', 0, score ? -10 : 30);
  if (score) {
    setFont(g, 900, 52, 'semi-condensed');
    g.fillText(`${score[0]}:${score[1]}`, 0, 70);
  }
  g.restore();
  g.fillStyle = '#fff';
  g.textAlign = 'left';
  setFont(g, 800, 34);
  g.fillText('squadjury.com', pad, h - 70);
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

export async function downloadBlob(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
