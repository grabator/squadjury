// Share images drawn on a canvas: 1920x1080 for X, 1080x1920 for stories,
// 1920x1005 for link cards. Our fonts, colours, logo and pitch; no FPL artwork.

import { t } from './i18n.js';
import { kitFor, shirtSvg, fixtureLabel } from './fpl.js';

export const SIZES = {
  x: { w: 1920, h: 1080 },
  story: { w: 1080, h: 1920 },
  og: { w: 1920, h: 1005 },
};

const C = { night: '#04060c', purple: '#111a2c', purple2: '#18233a', green: '#3cff8f', cyan: '#9cc8ff', magenta: '#ff3b5c', gold: '#ffc94a', silver: '#d5dceb', bronze: '#e8925a', chalk: '#f2f5fa' };
const DISPLAY = '"Barlow Condensed", "Arial Narrow", sans-serif';
const BODY = 'Manrope, system-ui, sans-serif';

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
  await Promise.all([
    document.fonts.load(`800 100px ${DISPLAY}`),
    document.fonts.load(`700 100px ${DISPLAY}`),
    document.fonts.load(`700 40px ${BODY}`),
    document.fonts.load(`800 40px ${BODY}`),
  ]).catch(() => {});
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

function fitText(g, text, maxW, size, weight = 800, family = DISPLAY) {
  let s = size;
  do {
    g.font = `${weight} ${s}px ${family}`;
    if (g.measureText(text).width <= maxW) break;
    s -= 2;
  } while (s > 12);
  return s;
}

/** Night stadium: deep blue, two floodlight cones, a glow over the pitch and fine grain. */
function background(g, w, h) {
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#0d1424');
  grad.addColorStop(1, '#04060c');
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  const cone = (x, dir) => {
    g.save();
    const lg = g.createRadialGradient(x, -h * 0.1, 0, x, -h * 0.1, h * 1.2);
    lg.addColorStop(0, 'rgba(200,225,255,0.22)');
    lg.addColorStop(1, 'rgba(200,225,255,0)');
    g.fillStyle = lg;
    g.beginPath();
    g.moveTo(x, -h * 0.1);
    g.lineTo(x + dir * w * 0.62, h);
    g.lineTo(x + dir * w * 0.32, h);
    g.closePath();
    g.fill();
    g.restore();
  };
  cone(w * 0.08, 1);
  cone(w * 0.92, -1);
  const glow = g.createRadialGradient(w / 2, h * 1.05, 0, w / 2, h * 1.05, h * 0.8);
  glow.addColorStop(0, 'rgba(30,140,80,0.32)');
  glow.addColorStop(1, 'rgba(30,140,80,0)');
  g.fillStyle = glow;
  g.fillRect(0, 0, w, h);
  // grain
  const img = g.getImageData(0, 0, w, h);
  for (let i = 0; i < img.data.length; i += 4 * 3) {
    const n = (Math.random() - 0.5) * 10;
    img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
}

/** Pitch with XI and bench, inside the box (x, y, w, h). */
async function drawSquad(g, fpl, team, x, y, w, h) {
  const benchH = h * 0.2;
  const pitchH = h - benchH - h * 0.025;
  // stripes
  roundRect(g, x, y, w, pitchH, 28);
  g.save();
  g.clip();
  for (let i = 0; i < 10; i++) {
    g.fillStyle = i % 2 ? '#0c5a33' : '#0f6b3c';
    g.fillRect(x, y + (pitchH / 10) * i, w, pitchH / 10 + 1);
  }
  const light = g.createRadialGradient(x + w / 2, y + pitchH * 0.42, 0, x + w / 2, y + pitchH * 0.42, w * 0.7);
  light.addColorStop(0, 'rgba(210,255,225,0.22)');
  light.addColorStop(1, 'rgba(0,0,0,0.35)');
  g.fillStyle = light;
  g.fillRect(x, y, w, pitchH);
  g.strokeStyle = 'rgba(255,255,255,.26)';
  g.lineWidth = 4;
  g.beginPath(); g.moveTo(x, y + pitchH * 0.58); g.lineTo(x + w, y + pitchH * 0.58); g.stroke();
  g.beginPath(); g.arc(x + w / 2, y + pitchH * 0.58, w * 0.13, 0, Math.PI * 2); g.stroke();
  g.restore();
  // bench strip
  roundRect(g, x, y + pitchH + h * 0.025, w, benchH, 24);
  g.fillStyle = 'rgba(255,255,255,.06)';
  g.fill();
  g.strokeStyle = 'rgba(255,255,255,.08)';
  g.lineWidth = 2;
  g.stroke();

  const picks = team.picks.map((p) => ({ ...p, pl: fpl.byId.get(p.id) }));
  const xi = picks.filter((p) => !p.bench);
  const rows = [1, 2, 3, 4].map((pos) => xi.filter((p) => p.pl?.element_type === pos)).filter((r) => r.length);
  const bench = picks.filter((p) => p.bench);
  const cell = Math.min(w / 5.6, pitchH / (rows.length * 1.12));
  const rowGap = pitchH / rows.length;
  for (let r = 0; r < rows.length; r++) {
    const cy = y + rowGap * r + rowGap * 0.12;
    await drawRow(g, fpl, team, rows[r], x, cy, w, cell);
  }
  await drawRow(g, fpl, team, bench, x, y + pitchH + h * 0.025 + benchH * 0.06, w, Math.min(cell, benchH * 0.9));
}

async function drawRow(g, fpl, team, row, x, y, w, cell) {
  const gap = cell * 0.08;
  const total = row.length * cell + (row.length - 1) * gap;
  let cx = x + (w - total) / 2;
  for (const p of row) {
    await drawPlayer(g, fpl, team, p, cx, y, cell);
    cx += cell + gap;
  }
}

async function drawPlayer(g, fpl, team, p, x, y, size) {
  const kit = kitFor(fpl, p.pl);
  const shirt = await loadImage(svgUrl(shirtSvg(kit, `s${p.id}`)));
  const sw = size * 0.62, sh = sw * (56 / 64);
  g.save();
  g.shadowColor = 'rgba(0,0,0,.35)';
  g.shadowBlur = size * 0.06;
  g.shadowOffsetY = size * 0.03;
  g.drawImage(shirt, x + (size - sw) / 2, y, sw, sh);
  g.restore();
  const isC = p.id === team.captain, isV = p.id === team.vice;
  if (isC || isV) {
    const r = size * 0.1;
    g.fillStyle = isC ? C.green : C.cyan;
    g.beginPath(); g.arc(x + (size - sw) / 2 + r * 0.6, y + r * 0.6, r, 0, Math.PI * 2); g.fill();
    g.fillStyle = C.night;
    g.font = `800 ${r * 1.3}px ${DISPLAY}`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(isC ? 'C' : 'V', x + (size - sw) / 2 + r * 0.6, y + r * 0.66);
  }
  const ny = y + sh - size * 0.02, nh = size * 0.2, fh = size * 0.16;
  roundRect(g, x, ny, size, nh + fh, size * 0.06);
  g.save(); g.clip();
  g.fillStyle = '#ffffff'; g.fillRect(x, ny, size, nh);
  g.fillStyle = kit[0].toLowerCase() === '#ffffff' ? kit[1] : kit[0]; g.fillRect(x, ny, size * 0.05, nh);
  g.fillStyle = 'rgba(6,12,24,0.92)'; g.fillRect(x, ny + nh, size, fh);
  g.restore();
  const name = p.pl?.web_name || '?';
  g.fillStyle = '#0b1222';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  fitText(g, name, size * 0.92, nh * 0.62, 700, BODY);
  g.fillText(name, x + size / 2, ny + nh * 0.54);
  g.fillStyle = '#c9d6ee';
  g.font = `700 ${fh * 0.6}px ${BODY}`;
  g.fillText(fixtureLabel(fpl, p.pl?.team, team.gw).split(',')[0], x + size / 2, ny + nh + fh * 0.52);
}

/** The verdict stamp: score inside a tilted ring. */
function stamp(g, cx, cy, r, score, sub, color = C.green) {
  g.save();
  g.translate(cx, cy);
  g.rotate(-0.2);
  g.strokeStyle = color;
  g.lineWidth = r * 0.07;
  g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.stroke();
  g.globalAlpha = 0.35;
  g.lineWidth = r * 0.025;
  g.beginPath(); g.arc(0, 0, r * 0.84, 0, Math.PI * 2); g.stroke();
  g.globalAlpha = 1;
  g.fillStyle = color;
  g.textAlign = 'center'; g.textBaseline = 'alphabetic';
  g.font = `800 ${r * 0.2}px ${DISPLAY}`;
  g.fillText(sub, 0, -r * 0.38);
  fitText(g, score, r * 1.45, r * 0.9);
  g.textBaseline = 'middle';
  g.fillText(score, 0, r * 0.18);
  g.restore();
}

function medal(rank) {
  return rank === 1 ? C.gold : rank === 2 ? C.silver : rank === 3 ? C.bronze : C.green;
}

/**
 * Renders a share image. kind: 'x' | 'story' | 'og'.
 * team: { nickname, x, gw, picks, captain, vice, avg, votes }, place: { rank, total } or null.
 * Returns a Blob (PNG for x/story, JPEG for og).
 */
export async function renderShareImage(kind, fpl, team, place) {
  await fonts();
  const { w, h } = SIZES[kind];
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d');
  background(g, w, h);
  const logo = await loadImage('/img/logo/logo.svg');
  const scored = team.avg != null && team.votes > 0 && kind !== 'og';
  const top = place?.rank && place.rank <= 10 && team.votes >= 5;
  const ringColor = top ? medal(place.rank) : C.green;
  const scoreText = scored ? Number(team.avg).toFixed(1) : '?';
  const subLine = scored
    ? `${t('share.from', { n: team.votes })}${place?.rank ? `   ${t('share.of', { rank: place.rank, total: place.total })}` : ''}`
    : t('share.judgeMy');
  const badge = top ? (place.rank === 1 && team.locked ? t('share.champion', { gw: team.gw }) : t('share.top10', { gw: team.gw })) : null;

  if (kind === 'story') {
    const pad = 70;
    g.drawImage(logo, pad, 90, 420, 420 * (logo.height / logo.width));
    g.fillStyle = C.cyan;
    g.font = `800 54px ${DISPLAY}`;
    g.textAlign = 'right'; g.textBaseline = 'alphabetic';
    g.fillText(`GW${team.gw}`, w - pad, 150);
    g.textAlign = 'left';
    g.fillStyle = C.chalk;
    fitText(g, team.nickname, w - pad * 2, 120);
    g.fillText(team.nickname, pad, 330);
    if (team.x) { g.fillStyle = 'rgba(247,242,248,.7)'; g.font = `700 40px ${BODY}`; g.fillText(`@${team.x}`, pad, 390); }
    await drawSquad(g, fpl, team, pad, 440, w - pad * 2, 960);
    g.textAlign = 'center';
    if (badge) { g.fillStyle = ringColor; g.font = `800 52px ${DISPLAY}`; g.fillText(badge.toUpperCase(), w / 2, 1478); }
    stamp(g, w / 2, 1645, 135, scoreText, scored ? t('share.verdict').toUpperCase() : t('share.judgeMy').toUpperCase(), ringColor);
    g.textAlign = 'center';
    g.fillStyle = 'rgba(247,242,248,.75)';
    g.font = `700 34px ${BODY}`;
    g.fillText(scored ? subLine : 'squadjury.com', w / 2, 1852);
  } else {
    const pad = 80;
    const squadW = kind === 'og' ? 900 : 960;
    await drawSquad(g, fpl, team, pad, pad, squadW, h - pad * 2);
    const rx = pad + squadW + 90, rw = w - rx - pad;
    g.drawImage(logo, rx, pad + 4, 420, 420 * (logo.height / logo.width));
    g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    g.fillStyle = C.cyan;
    g.font = `800 56px ${DISPLAY}`;
    g.fillText(`GW${team.gw}`, rx, pad + 190);
    g.fillStyle = C.chalk;
    fitText(g, team.nickname, rw, 120);
    g.fillText(team.nickname, rx, pad + 300);
    if (team.x) { g.fillStyle = 'rgba(247,242,248,.7)'; g.font = `700 38px ${BODY}`; g.fillText(`@${team.x}`, rx, pad + 352); }
    // Badge line, then the stamp in the space left above the bottom line.
    const badgeY = pad + 440;
    const top0 = badge ? badgeY + 34 : pad + (team.x ? 390 : 340);
    const bottom0 = h - pad - (kind === 'og' ? 30 : 80);
    const r = Math.min(rw / 2.4, (bottom0 - top0) / 2 - 8);
    const cy = top0 + (bottom0 - top0) / 2;
    stamp(g, rx + r + 10, cy, r, scoreText, scored ? t('share.verdict').toUpperCase() : t('share.judgeMy').toUpperCase(), ringColor);
    g.textAlign = 'left';
    g.fillStyle = 'rgba(247,242,248,.78)';
    g.font = `700 34px ${BODY}`;
    if (scored) g.fillText(subLine, rx, h - pad - 20);
    else g.fillText('squadjury.com', rx, h - pad - 4);
    if (badge) { g.textAlign = 'left'; g.fillStyle = ringColor; g.font = `800 50px ${DISPLAY}`; g.fillText(badge.toUpperCase(), rx, badgeY); }
    if (scored) { g.fillStyle = 'rgba(247,242,248,.55)'; g.textAlign = 'right'; g.font = `700 30px ${BODY}`; g.fillText('squadjury.com', w - pad, h - pad - 20); }
  }
  const type = kind === 'og' ? 'image/jpeg' : 'image/png';
  return new Promise((resolve) => canvas.toBlob(resolve, type, 0.9));
}

export async function downloadBlob(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
