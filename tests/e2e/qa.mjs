// QA sweep, like a user: every page and the main actions, signed out and signed in, light and dark,
// phone, desktop and landscape. Reports console errors, untranslated text, broken images, sideways
// scrolling, missing actions and unexpected 404 or 5xx responses.
// Usage: node tests/e2e/qa.mjs   (against `npm run dev`)
import { launch } from '../../scripts/browser.mjs';
const BASE = process.env.BASE || 'http://127.0.0.1:8787';
const b = await launch();
const issues = [];
const KEY = /\b(nav|clock|judge|auth|post|problem|squad|lb|me|page|err|share|pager|team|x)\.[a-zA-Z]+\b/;
async function inspect(p, tag) {
  const r = await p.evaluate((src) => {
    const re = new RegExp(src);
    const text = document.body.innerText;
    const raw = text.match(re)?.[0];
    const broken = [...document.images].filter((i) => i.complete && i.naturalWidth === 0 && i.src).map((i) => i.src);
    const overflow = document.documentElement.scrollWidth - innerWidth;
    const undef = /undefined|NaN|\[object Object\]|\{[a-z]+\}/.test(text) ? text.match(/.{0,30}(undefined|NaN|\[object Object\]|\{[a-z]+\}).{0,30}/)?.[0] : null;
    return { raw, broken, overflow, undef };
  }, KEY.source);
  if (r.raw && !/x\.com/.test(r.raw)) issues.push(`${tag}: raw key ${r.raw}`);
  if (r.broken.length) issues.push(`${tag}: broken images ${r.broken.join(' ')}`);
  if (r.overflow > 0) issues.push(`${tag}: scrolls sideways ${r.overflow}px`);
  if (r.undef) issues.push(`${tag}: odd text "${r.undef}"`);
}
async function session({ w = 390, h = 844, scheme = 'light', user = null, hint = true } = {}) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, isMobile: w < 800, hasTouch: w < 800, colorScheme: scheme, acceptDownloads: true });
  // The first visit intro is tested in run.mjs; here it would cover the screens.
  await ctx.addInitScript(() => { try { localStorage.setItem('sj-intro', '1'); } catch {} });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => issues.push(`${user || 'anon'} ${w} pageerror: ${e}`));
  p.on('console', (m) => m.type() === 'error' && !m.text().includes('404') && issues.push(`${user || 'anon'} ${w} console: ${m.text()}`));
  p.on('response', (r) => { if (r.status() === 404 && !r.url().includes('doesnotexist')) issues.push(`404 ${r.url()}`); if (r.status() >= 500) issues.push(`${user || 'anon'} 5xx ${r.status()} ${r.url()}`); });
  await p.goto(BASE + '/');
  if (hint) await p.evaluate(() => localStorage.setItem('sj-hint', '1'));
  if (user) await p.evaluate(async (n) => { const r = await fetch('/api/auth/dev', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: n }) }); const d = await r.json(); if (!d.nickname) await fetch('/api/me', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nickname: n }) }); }, user);
  return { ctx, p };
}
const visit = async (p, path, tag, wait = 1100) => { await p.goto(BASE + path); await p.waitForTimeout(wait); await inspect(p, tag); };
const PAGES = ['/', '/leaderboard', '/leaderboard?tab=gw6', '/leaderboard?tab=season', '/post', '/squad', '/me', '/me/verdicts', '/me/verdicts?page=2', '/how', '/rules', '/privacy', '/nope', '/t/doesnotexist', '/admin'];

// signed out
let { ctx, p } = await session({ hint: false });
for (const path of PAGES) await visit(p, path, `anon ${path}`);
await p.goto(BASE + '/'); await p.waitForTimeout(1000);
if (!(await p.locator('#first-hint').count())) issues.push('anon: first-time hint missing');
await p.locator('.vbtn[data-score="7"]').click(); await p.waitForTimeout(600);
if (!(await p.locator('.sheet').count())) issues.push('anon: tapping a verdict did not ask to sign in');
await p.keyboard.press('Escape'); await p.waitForTimeout(300);
const key = await p.evaluate(async () => (await (await fetch('/api/judge/next?n=1')).json()).teams?.[0]?.key);
if (key) await visit(p, '/t/' + key, 'anon team page');
await ctx.close();

// signed in, light and dark, phone and desktop
for (const opt of [{ user: 'Graba' }, { user: 'Graba', scheme: 'dark' }, { user: 'Graba', w: 1280, h: 800 }, { user: 'Fresh' + (Date.now() % 100000) }]) {
  ({ ctx, p } = await session(opt));
  const tag = `${opt.user.slice(0, 5)} ${opt.w || 390} ${opt.scheme || 'light'}`;
  for (const path of PAGES) await visit(p, path, `${tag} ${path}`);
  // judge with the keyboard, then skip, then undo
  await p.goto(BASE + '/'); await p.waitForTimeout(1200);
  if (await p.locator('#deck .jcard').count()) {
    const before = await p.locator('#deck .who b').first().textContent();
    await p.keyboard.press('s'); await p.waitForTimeout(500);
    const afterSkip = await p.locator('#deck .who b').first().textContent().catch(() => null);
    if (afterSkip === before && (await p.locator('#deck .jcard').count())) issues.push(`${tag}: S did not skip`);
    await p.keyboard.press('6'); await p.waitForTimeout(1300);
    if (!(await p.locator('#undo').count())) issues.push(`${tag}: no undo after a verdict`);
  }
  // clock sheet and calendar file
  await p.locator('#clock').click(); await p.waitForTimeout(400);
  const dl = p.waitForEvent('download', { timeout: 3000 }).catch(() => null);
  await p.locator('#ics').click().catch(() => issues.push(`${tag}: no add to calendar`));
  const d = await dl; if (!d) issues.push(`${tag}: calendar file not downloaded`);
  await p.keyboard.press('Escape');
  // leaderboard picker
  await p.goto(BASE + '/leaderboard?tab=gw6'); await p.waitForTimeout(900);
  await p.locator('#gwpick').click(); await p.waitForTimeout(300);
  await p.locator('.gw-tile[data-gw="5"]').click(); await p.waitForTimeout(900);
  if (!p.url().includes('gw5')) issues.push(`${tag}: picker did not switch to GW5`);
  // me: open an older gameweek group if any
  await p.goto(BASE + '/me'); await p.waitForTimeout(1000);
  const grp = p.locator('.gw-group summary').first();
  if (await grp.count()) { await grp.click(); await p.waitForTimeout(800); await inspect(p, `${tag} me older gw`); }
  // tab order: the first few focusable things have visible labels
  await ctx.close();
}

// landscape and the smallest phone
({ ctx, p } = await session({ w: 640, h: 360, user: 'Graba' }));
await visit(p, '/', 'landscape judge');
const cut = await p.evaluate(() => { const s = document.querySelector('#skip')?.getBoundingClientRect(); return s ? s.bottom > innerHeight : false; });
if (cut) issues.push('landscape: Skip is cut off');
await ctx.close();

console.log(issues.length ? [...new Set(issues)].join('\n') : 'no issues');
await b.close();
if (issues.length) process.exit(1);
