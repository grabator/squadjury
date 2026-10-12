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
  const grad = g.createLinearGradient(0, 0, 1920, 1005);
  grad.addColorStop(0, '#4b0752'); grad.addColorStop(0.55, '#37003c'); grad.addColorStop(1, '#1f0022');
  g.fillStyle = grad; g.fillRect(0, 0, 1920, 1005);
  g.globalAlpha = 0.05; g.strokeStyle = '#fff'; g.lineWidth = 40;
  for (let x = -1005; x < 1920; x += 140) { g.beginPath(); g.moveTo(x, 1005); g.lineTo(x + 1005, 0); g.stroke(); }
  g.globalAlpha = 1;
  const load = (src) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = src; });
  const mark = await load('/img/logo/mark.svg');
  g.drawImage(mark, 1180, 190, 600, 600);
  const logo = await load('/img/logo/logo.svg');
  g.drawImage(logo, 120, 150, 640, 640 * (logo.height / logo.width));
  g.fillStyle = '#f7f2f8'; g.font = '800 132px "Barlow Condensed"';
  g.fillText('Post your squad.', 120, 470);
  g.fillStyle = '#00ff87';
  g.fillText('The jury decides.', 120, 600);
  g.fillStyle = 'rgba(247,242,248,.75)'; g.font = '700 42px Manrope';
  g.fillText('Rate FPL squads from 1 to 10 before the deadline', 120, 720);
  g.fillStyle = '#04f5ff'; g.font = '800 48px "Barlow Condensed"';
  g.fillText('squadjury.com', 120, 860);
  return c.toDataURL('image/png');
});
writeFileSync(new URL('../public/img/og-default.png', import.meta.url), Buffer.from(data.split(',')[1], 'base64'));
await browser.close();
console.log('og-default.png written');
