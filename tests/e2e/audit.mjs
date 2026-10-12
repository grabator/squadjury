// Accessibility (axe), horizontal overflow and console errors on every page at phone and desktop widths.
// Usage: node tests/e2e/audit.mjs   (against `npm run dev`)
import { readFileSync } from 'node:fs';
import { launch } from '../../scripts/browser.mjs';

const BASE = process.env.BASE || 'http://127.0.0.1:8787';
const axe = readFileSync(new URL('../../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8');
const PAGES = ['/', '/leaderboard', '/leaderboard?tab=gw6', '/leaderboard?tab=season', '/post', '/squad', '/me', '/me/verdicts', '/how', '/rules', '/privacy', '/nope'];
const WIDTHS = [360, 390, 430, 1280];

const browser = await launch();
const problems = [];
let checked = 0;
const RUNS = [];
for (const signedIn of [false, true]) for (const w of WIDTHS) RUNS.push({ signedIn, w, scheme: 'light' });
// The dark theme follows the phone; check it on a phone and on desktop.
for (const w of [390, 1280]) RUNS.push({ signedIn: true, w, scheme: 'dark' });
for (const { signedIn, w, scheme } of RUNS) {
  {
    const ctx = await browser.newContext({ viewport: { width: w, height: 860 }, isMobile: w < 800, hasTouch: w < 800, reducedMotion: 'reduce', colorScheme: scheme, bypassCSP: true });
    // The first visit intro is tested in run.mjs; here it would cover the screens.
    await ctx.addInitScript(() => { try { localStorage.setItem('sj-intro', '1'); } catch {} });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push(String(e)));
    page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
    if (signedIn) {
      await page.goto(BASE + '/');
      await page.evaluate(async (n) => {
        const r = await fetch('/api/auth/dev', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: n }) });
        const d = await r.json();
        if (!d.nickname) await fetch('/api/me', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nickname: d.suggestion }) });
      }, `auditor${w}`);
    }
    for (const path of PAGES) {
      await page.goto(BASE + path);
      await page.waitForTimeout(700);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      if (overflow > 0) problems.push(`${w}px ${path}: page scrolls sideways by ${overflow}px`);
      await page.addScriptTag({ content: axe });
      const res = await page.evaluate(async () => (await window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice'] })).violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.length}x ${v.nodes[0]?.target}`));
      for (const r of res) problems.push(`${w}px ${scheme} ${signedIn ? 'in ' : ''}${path}: ${r}`);
      checked++;
    }
    for (const e of errs) problems.push(`${w}px console: ${e}`);
    await ctx.close();
  }
}
await browser.close();
console.log(`${checked} page views checked`);
console.log(problems.length ? [...new Set(problems)].join('\n') : 'no problems found');
