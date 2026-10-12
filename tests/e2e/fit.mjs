// Judge and the Post entry must fit one phone screen: no page scroll, Skip and the main button above the bottom menu,
// and every player name on the pitch at least 11 px.
// Usage: node tests/e2e/fit.mjs [screenshot folder]   (against `npm run dev`)
import { launch } from '../../scripts/browser.mjs';

const BASE = process.env.BASE || 'http://127.0.0.1:8787';
const OUT = process.argv[2];
const SIZES = [[360, 640], [375, 667], [390, 844], [412, 915], [430, 932]];

const browser = await launch();
const problems = [];
let checked = 0;
for (const signedIn of [false, true]) {
  for (const [w, h] of SIZES) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
    // The first visit intro is tested in run.mjs; here it would cover the screens.
    await ctx.addInitScript(() => { try { localStorage.setItem('sj-intro', '1'); } catch {} });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push(String(e)));
    if (signedIn) {
      await page.goto(BASE + '/');
      await page.evaluate(async (n) => {
        const r = await fetch('/api/auth/dev', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: n }) });
        const d = await r.json();
        if (!d.nickname) await fetch('/api/me', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nickname: d.suggestion }) });
      }, `fit${w}`);
    }
    const tag = `${w}x${h}${signedIn ? ' in' : ''}`;

    // Judge: clock to Skip on one screen.
    await page.goto(BASE + '/');
    await page.waitForSelector('.jcard, .empty', { timeout: 15000 });
    await page.waitForTimeout(500);
    const j = await page.evaluate(() => {
      const nav = document.querySelector('#tabs').getBoundingClientRect();
      const skip = document.querySelector('#skip')?.getBoundingClientRect();
      const btns = [...document.querySelectorAll('.controls .vbtn, .verdicts .vbtn')];
      return {
        scroll: document.documentElement.scrollHeight - innerHeight,
        hasDeck: !!document.querySelector('.jcard'),
        skipOk: !skip || skip.bottom <= nav.top,
        btnsOk: btns.every((b) => { const r = b.getBoundingClientRect(); return r.top >= 0 && r.bottom <= nav.top; }),
        minName: Math.min(...[...document.querySelectorAll('#deck .pl .name')].map((n) => parseFloat(getComputedStyle(n).fontSize))),
        names: document.querySelectorAll('#deck .pl .name').length,
      };
    });
    if (j.scroll > 0) problems.push(`${tag} judge: page scrolls by ${j.scroll}px`);
    if (j.hasDeck && !j.skipOk) problems.push(`${tag} judge: Skip is under the bottom menu`);
    if (j.hasDeck && !j.btnsOk) problems.push(`${tag} judge: a verdict button is off screen`);
    if (j.hasDeck && j.names !== 15) problems.push(`${tag} judge: ${j.names} player names shown, not 15`);
    if (j.hasDeck && j.minName < 11) problems.push(`${tag} judge: a player name is ${j.minName}px, under 11px`);
    if (OUT) await page.screenshot({ path: `${OUT}/fit-judge-${w}x${h}${signedIn ? '-in' : ''}.png` });
    checked++;

    // Post entry: title, phone, steps and the main button on one screen.
    await page.goto(BASE + '/post');
    await page.waitForSelector('.post-entry, .empty', { timeout: 15000 });
    await page.waitForTimeout(400);
    const p = await page.evaluate(() => {
      const nav = document.querySelector('#tabs').getBoundingClientRect();
      const go = document.querySelector('.post-entry .btn-go')?.getBoundingClientRect();
      return { scroll: document.documentElement.scrollHeight - innerHeight, goOk: !go || go.bottom <= nav.top, entry: !!document.querySelector('.post-entry') };
    });
    if (p.entry && p.scroll > 0) problems.push(`${tag} post: page scrolls by ${p.scroll}px`);
    if (p.entry && !p.goOk) problems.push(`${tag} post: the main button is under the bottom menu`);
    if (OUT) await page.screenshot({ path: `${OUT}/fit-post-${w}x${h}${signedIn ? '-in' : ''}.png` });
    checked++;

    for (const e of errs) problems.push(`${tag} error: ${e}`);
    await ctx.close();
  }
}
await browser.close();
console.log(`${checked} screens checked`);
if (problems.length) {
  console.log(problems.join('\n'));
  process.exit(1);
}
console.log('everything fits');
