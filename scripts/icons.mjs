// Rasterises the logo into favicon and app icons: the yellow card alone for the favicon,
// the card on a dark tile for app icons.
// Usage: npm run icons
import { readFileSync } from 'node:fs';
import { launch } from './browser.mjs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../public/', import.meta.url));
const b64 = (f) => Buffer.from(readFileSync(root + f, 'utf8')).toString('base64');
const mark = b64('img/logo/mark.svg');
const icon = b64('img/logo/icon.svg');

const jobs = [
  { file: 'img/icons/favicon-32.png', size: 32, src: mark },
  { file: 'img/icons/apple-touch-icon.png', size: 180, src: icon },
  { file: 'img/icons/icon-192.png', size: 192, src: icon },
  { file: 'img/icons/icon-512.png', size: 512, src: icon },
  // Maskable: the tile is full bleed already and the card sits inside the safe zone.
  { file: 'img/icons/maskable-512.png', size: 512, src: icon },
];

const browser = await launch();
const page = await browser.newPage();
for (const j of jobs) {
  const html = `<html><body style="margin:0"><div style="width:${j.size}px;height:${j.size}px"><img src="data:image/svg+xml;base64,${j.src}" style="display:block;width:100%;height:100%"></div></body></html>`;
  await page.setViewportSize({ width: j.size, height: j.size });
  await page.setContent(html);
  await page.locator('div').screenshot({ path: root + j.file, omitBackground: true });
}
await browser.close();
console.log('icons written');
