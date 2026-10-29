// Pravi public/img/stadion.webp iz scripts/stadion.html (zamućena noćna scena stadiona).
// Pokretanje: node scripts/stadion.mjs  (treba Playwright i Python sa Pillow)
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1960, height: 1210 } });
await p.goto('file://' + root + '/scripts/stadion.html');
await p.waitForFunction(() => document.documentElement.dataset.ok);
await p.screenshot({ path: root + '/scripts/.stadion.png' });
await b.close();
execFileSync('python3', ['-c', 'import sys;from PIL import Image;Image.open(sys.argv[1]).convert("RGB").save(sys.argv[2],quality=72,method=6)', root + '/scripts/.stadion.png', root + '/public/img/stadion.webp']);
console.log('public/img/stadion.webp');
