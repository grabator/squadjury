// Rasterises public/img/logo/mark.svg into favicon and app icons.
// Usage: npm run icons
import { readFileSync } from 'node:fs';
import { launch } from './browser.mjs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../public/', import.meta.url));
const mark = readFileSync(root + 'img/logo/mark.svg', 'utf8');
const b64 = Buffer.from(mark).toString('base64');

const jobs = [
  { file: 'img/icons/favicon-32.png', size: 32 },
  { file: 'img/icons/apple-touch-icon.png', size: 180, square: true },
  { file: 'img/icons/icon-192.png', size: 192 },
  { file: 'img/icons/icon-512.png', size: 512 },
  // Maskable: full bleed background, logo inside the 80% safe zone.
  { file: 'img/icons/maskable-512.png', size: 512, square: true, pad: 0.12 },
];

const browser = await launch();
const page = await browser.newPage();
for (const j of jobs) {
  const inner = j.pad ? `<img src="data:image/svg+xml;base64,${b64}" style="position:absolute;inset:${j.pad * 100}%;width:${100 - j.pad * 200}%">` : `<img src="data:image/svg+xml;base64,${b64}" style="width:100%;height:100%">`;
  const html = `<html><body style="margin:0"><div style="position:relative;width:${j.size}px;height:${j.size}px;background:${j.square ? '#37003C' : 'transparent'};overflow:hidden">${inner}</div></body></html>`;
  await page.setViewportSize({ width: j.size, height: j.size });
  await page.setContent(html);
  await page.locator('div').screenshot({ path: root + j.file, omitBackground: !j.square });
}
await browser.close();
console.log('icons written');
