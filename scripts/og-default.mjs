// Renders public/img/og-default.png (1920x1005), the link card for pages without a squad.
// Needs `npm run dev` running (it uses the site's own fonts and logo).
import { writeFileSync } from 'node:fs';
import { launch } from './browser.mjs';

const BASE = process.env.BASE || 'http://127.0.0.1:8787';
const browser = await launch();
const page = await browser.newPage();
await page.goto(BASE + '/how');
const data = await page.evaluate(async () => {
  await document.fonts.load('800 100px "Barlow Condensed"');
  await document.fonts.load('700 40px Manrope');
  const c = document.createElement('canvas');
  c.width = 1920; c.height = 1005;
  const g = c.getContext('2d');
  // Night stadium: dark navy, two floodlight cones and a lit pitch at the bottom.
  const grad = g.createLinearGradient(0, 0, 0, 1005);
  grad.addColorStop(0, '#04060c'); grad.addColorStop(0.6, '#0a0f1c'); grad.addColorStop(1, '#0b2a1d');
  g.fillStyle = grad; g.fillRect(0, 0, 1920, 1005);
  for (const [x, dir] of [[260, 1], [1660, -1]]) {
    const cone = g.createLinearGradient(x, 0, x + dir * 420, 900);
    cone.addColorStop(0, 'rgba(233,241,255,.16)'); cone.addColorStop(1, 'rgba(233,241,255,0)');
    g.fillStyle = cone;
    g.beginPath(); g.moveTo(x - 30, 0); g.lineTo(x + 30, 0); g.lineTo(x + dir * 620, 1005); g.lineTo(x + dir * 220, 1005); g.closePath(); g.fill();
  }
  const glow = g.createRadialGradient(960, 1005, 40, 960, 1005, 900);
  glow.addColorStop(0, 'rgba(60,255,143,.22)'); glow.addColorStop(1, 'rgba(60,255,143,0)');
  g.fillStyle = glow; g.fillRect(0, 0, 1920, 1005);
  const load = (src) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = src; });
  const mark = await load('/img/logo/mark.svg');
  g.drawImage(mark, 1180, 190, 600, 600);
  const logo = await load('/img/logo/logo.svg');
  g.drawImage(logo, 120, 150, 640, 640 * (logo.height / logo.width));
  g.fillStyle = '#e9f1ff'; g.font = '800 132px "Barlow Condensed"';
  g.fillText('Post your squad.', 120, 470);
  g.fillStyle = '#3cff8f';
  g.fillText('The jury decides.', 120, 600);
  g.fillStyle = 'rgba(233,241,255,.75)'; g.font = '700 42px Manrope';
  g.fillText('Rate FPL squads from 1 to 10 before the deadline', 120, 720);
  g.fillStyle = '#9cc8ff'; g.font = '800 48px "Barlow Condensed"';
  g.fillText('squadjury.com', 120, 860);
  return c.toDataURL('image/png');
});
writeFileSync(new URL('../public/img/og-default.png', import.meta.url), Buffer.from(data.split(',')[1], 'base64'));
await browser.close();
console.log('og-default.png written');
