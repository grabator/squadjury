// Renders public/img/og-default.png (1200x630), the link card for pages without a squad.
// Needs `npm run dev` running (it uses the site's own font and logo).
import { writeFileSync } from 'node:fs';
import { launch } from './browser.mjs';

const BASE = process.env.BASE || 'http://127.0.0.1:8787';
const browser = await launch();
const page = await browser.newPage();
await page.goto(BASE + '/how');
const data = await page.evaluate(async () => {
  const F = 'Archivo, sans-serif';
  await document.fonts.load(`900 100px ${F}`);
  await document.fonts.load(`600 30px ${F}`);
  const c = document.createElement('canvas');
  c.width = 1200; c.height = 630;
  const g = c.getContext('2d');
  g.fillStyle = '#f6f6f3'; g.fillRect(0, 0, 1200, 630);
  // A strip of bright pitch on the right with the yellow card on it.
  const x0 = 820;
  for (let i = 0; i < 10; i++) { g.fillStyle = i % 2 ? '#359452' : '#3da35d'; g.fillRect(x0, i * 63, 380, 64); }
  g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 4;
  g.beginPath(); g.moveTo(x0, 315); g.lineTo(1200, 315); g.stroke();
  g.beginPath(); g.arc(x0 + 190, 315, 88, 0, Math.PI * 2); g.stroke();
  g.save(); g.translate(x0 + 190, 315); g.rotate(0.14);
  g.shadowColor = 'rgba(0,0,0,.25)'; g.shadowBlur = 30; g.shadowOffsetY = 12;
  g.fillStyle = '#ffd400';
  g.beginPath(); g.roundRect(-100, -133, 200, 266, 22); g.fill();
  g.restore();
  const load = (src) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = src; });
  const logo = await load('/img/logo/logo.svg');
  g.drawImage(logo, 72, 82, 300, 300 * (logo.height / logo.width));
  g.fillStyle = '#111418'; g.font = `900 68px ${F}`;
  g.fillText('Post your squad.', 72, 300);
  g.fillText('The jury decides.', 72, 384);
  g.fillStyle = '#5e6670'; g.font = `600 30px ${F}`;
  g.fillText('Rate FPL squads from 1 to 10 before the deadline', 72, 470);
  g.fillStyle = '#111418'; g.font = `800 30px ${F}`;
  g.fillText('squadjury.com', 72, 548);
  return c.toDataURL('image/png');
});
writeFileSync(new URL('../public/img/og-default.png', import.meta.url), Buffer.from(data.split(',')[1], 'base64'));
await browser.close();
console.log('og-default.png written');
