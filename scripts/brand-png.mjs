// PNG ikone i slika za dijeljenje iz znaka u public/img/brand (prvo: python3 scripts/brand.py).
// Pokretanje: node scripts/brand-png.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { launch } from './browser.mjs';

const pub = fileURLToPath(new URL('../public/', import.meta.url));
const b64 = (f) => 'data:image/svg+xml;base64,' + Buffer.from(readFileSync(pub + f, 'utf8')).toString('base64');
const mark = b64('img/brand/mark.svg'), mask = b64('img/brand/maskable.svg'), logo = b64('img/brand/logo-white.svg');

const icons = [
  ['img/icon-192.png', 192, mark], ['img/icon-512.png', 512, mark], ['img/maskable-512.png', 512, mask], ['img/apple-touch-icon.png', 180, mask], ['img/favicon-32.png', 32, mark],
  ['jury/img/icons/icon-192.png', 192, mark], ['jury/img/icons/icon-512.png', 512, mark], ['jury/img/icons/maskable-512.png', 512, mask], ['jury/img/icons/apple-touch-icon.png', 180, mask], ['jury/img/icons/favicon-32.png', 32, mark]
];
const browser = await launch();
const page = await browser.newPage();
for (const [file, size, src] of icons) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<body style="margin:0"><img src="${src}" style="display:block;width:${size}px;height:${size}px"></body>`);
  await page.locator('img').screenshot({ path: pub + file, omitBackground: true });
}
// slika za dijeljenje linka (1200x630)
const og = `<body style="margin:0"><div id="og" style="width:1200px;height:630px;display:grid;place-items:center;background:radial-gradient(700px 500px at 0 0,rgba(150,60,255,.45),transparent 70%),radial-gradient(600px 400px at 100% 100%,rgba(255,40,130,.22),transparent 70%),linear-gradient(160deg,#37003c,#14061f 75%);font-family:sans-serif">
  <div style="display:grid;justify-items:center;gap:34px"><img src="${logo}" style="height:150px"><div style="display:flex;gap:16px">${['Moj tim', 'Kapiten', 'Transferi', 'Ocijeni timove'].map((t) => `<span style="padding:12px 24px;border-radius:99px;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.18);color:#f6f1fb;font:700 30px sans-serif">${t}</span>`).join('')}</div></div></div></body>`;
await page.setViewportSize({ width: 1200, height: 630 });
await page.setContent(og);
await page.locator('#og').screenshot({ path: pub + 'img/og.png' });
await page.locator('#og').screenshot({ path: pub + 'jury/img/og-default.png' });
await browser.close();
console.log('brand-png: ikone i img/og.png');
