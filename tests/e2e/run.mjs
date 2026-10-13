// End to end test of the main flow in a real browser, against `npm run dev`.
// Usage: node tests/e2e/run.mjs [screenshot folder]
import { launch } from '../../scripts/browser.mjs';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const BASE = process.env.BASE || 'http://127.0.0.1:8787';
const OUT = process.argv[2];
const fixture = fileURLToPath(new URL('../fixtures/pick-team-2.jpg', import.meta.url));
const shot = async (p, name) => OUT && p.screenshot({ path: `${OUT}/${name}.png` });
const results = [];
const step = async (name, fn) => {
  const t0 = Date.now();
  try { await fn(); results.push(`ok   ${name} (${Date.now() - t0} ms)`); }
  catch (e) {
    results.push(`FAIL ${name}: ${e.message.split('\n').slice(0, 3).join(' ')}`);
    await shot(page, 'e2e-fail');
    console.log((await page.locator('main').innerText()).slice(0, 600));
    throw e;
  }
};

const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errors.push(m.text()));
const nick = `Graba${Date.now() % 100000}`;

try {
  await step('first visit: the intro explains the app in 4 screens, then gets out of the way', async () => {
    await page.goto(BASE + '/');
    await page.locator('.intro').waitFor();
    await page.getByRole('heading', { name: 'Rate my team? Ask the jury.' }).waitFor();
    await shot(page, 'e2e-0-intro');
    for (let i = 0; i < 3; i++) await page.locator('[data-next]').click();
    await page.getByRole('heading', { name: 'Climb before the deadline' }).waitFor();
    await page.getByRole('link', { name: 'Start judging' }).click();
    await page.locator('.intro').waitFor({ state: 'detached' });
    await page.reload();
    await page.locator('.vbtn, .empty').first().waitFor();
    assert.equal(await page.locator('.intro').count(), 0, 'the intro shows only once');
  });

  await step('sign in from the Post tab (dev login) and pick a nickname', async () => {
    await page.goto(BASE + '/post');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.locator('#devn').fill(nick);
    await page.getByRole('button', { name: 'Sign in as test juror' }).click();
    await page.locator('#nick').fill(nick);
    await page.locator('#xh').fill('@grabator');
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.getByText('Upload screenshot').waitFor();
    await shot(page, 'e2e-1-post');
  });

  await step('upload the Pick Team screenshot and read all 15 players in the browser', async () => {
    await page.locator('#file').setInputFiles(fixture);
    await page.waitForTimeout(1200);
    await shot(page, 'e2e-2-reading');
    await page.getByText('15/15').waitFor({ timeout: 90000 });
    const names = await page.locator('#pitch .name').allTextContents();
    assert.equal(names.length, 15);
    for (const n of ['Leno', 'Hall', 'Saka', 'Haaland', 'Mitchell']) assert.ok(names.includes(n), `missing ${n}`);
    assert.equal(await page.locator('#pitch .armband.c').count(), 1);
    assert.equal(await page.locator('#pitch .armband.v').count(), 1);
    await page.waitForTimeout(1200);
    await shot(page, 'e2e-3-confirm');
  });

  await step('send the squad to the jury', async () => {
    await page.getByRole('button', { name: 'Send to the jury' }).click();
    await page.getByText('Your squad is live!').waitFor({ timeout: 30000 });
    await page.waitForTimeout(600);
    await shot(page, 'e2e-4-live');
  });

  await step('judge 5 squads, the yellow card shows each verdict', async () => {
    await page.getByRole('link', { name: 'Start judging' }).click();
    for (let i = 0; i < 5; i++) {
      await page.locator('.vbtn').first().waitFor();
      await page.locator(`.vbtn[data-score="${[8, 6, 9, 7, 10][i]}"]`).click();
      if (i === 0) { await page.waitForTimeout(650); await shot(page, 'e2e-5-verdict'); }
      await page.waitForTimeout(1700);
    }
    await page.getByText('Your squad', { exact: false }).first().waitFor();
    await shot(page, 'e2e-6-after');
  });

  await step('Duel mode: two squads, tap the better one, a WIN card and how many agree', async () => {
    await page.goto(BASE + '/');
    await page.getByRole('button', { name: 'Duel', exact: true }).click();
    await page.locator('.dcard').nth(1).waitFor();
    assert.equal(await page.locator('.dcard').count(), 2);
    await page.waitForTimeout(1100);
    await page.locator('.dcard[data-side="first"] .dpick').click();
    await page.locator('.win-card').waitFor();
    await page.locator('.dcard .verdict-line span').waitFor();
    assert.match(await page.locator('.dcard .verdict-line span').textContent(), /agree|First vote/);
    await shot(page, 'e2e-6b-duel');
    await page.waitForTimeout(1500);
    await page.getByRole('button', { name: 'Rate', exact: true }).click();
    await page.locator('.vbtn').first().waitFor();
  });

  await step('my squad page shows the squad and share buttons', async () => {
    await page.goto(BASE + '/squad');
    await page.getByRole('link', { name: 'Post on X' }).waitFor();
    await page.getByRole('button', { name: 'Copy link' }).waitFor();
    assert.equal(await page.locator('.pl').count(), 15);
    await page.waitForTimeout(1200);
    await shot(page, 'e2e-7-mysquad');
  });

  await step('the share images render at 1080x1080, 1080x1920 and 1200x630', async () => {
    const sizes = await page.evaluate(async () => {
      const { renderShareImage } = await import('/js/share.js');
      const { loadFpl } = await import('/js/fpl.js');
      const { api } = await import('/js/api.js');
      const fpl = await loadFpl();
      const s = await api('/api/state');
      const { team } = await api(`/api/teams/${s.mine.key}`);
      const out = {};
      for (const kind of ['x', 'story', 'og']) {
        const blob = await renderShareImage(kind, fpl, { ...team, avg: 8.7, votes: 12 }, { rank: 3, total: 41 });
        const bmp = await createImageBitmap(blob);
        out[kind] = `${bmp.width}x${bmp.height}`;
        window[`__${kind}`] = await new Promise((r) => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(blob); });
      }
      return out;
    });
    assert.deepEqual(sizes, { x: '1080x1080', story: '1080x1920', og: '1200x630' });
    if (OUT) {
      const { writeFileSync } = await import('node:fs');
      for (const k of ['x', 'story', 'og']) {
        const data = await page.evaluate((k) => window[`__${k}`], k);
        writeFileSync(`${OUT}/share-${k}.${k === 'og' ? 'jpg' : 'png'}`, Buffer.from(data.split(',')[1], 'base64'));
      }
    }
  });

  await step('leaderboard, profile and share page open without errors', async () => {
    await page.goto(BASE + '/leaderboard');
    await page.locator('.board li').first().waitFor();
    await page.goto(BASE + '/me');
    await page.getByText('My squads').waitFor();
    await shot(page, 'e2e-8-me');
    const key = await page.evaluate(async () => (await (await fetch('/api/state')).json()).mine.key);
    const html = await (await fetch(`${BASE}/t/${key}`)).text();
    assert.match(html, /twitter:card" content="summary_large_image"/);
    assert.match(html, new RegExp(`${nick}(&#39;|')s GW\\d+ squad`));
  });

  await step('My squad has Get rated, and its Rate link preview image is made and stored', async () => {
    await page.goto(BASE + '/squad');
    await page.getByRole('heading', { name: 'Get rated' }).waitFor();
    assert.ok(await page.locator('.get-rated [data-chan="x"]').count());
    assert.ok(await page.locator('.get-rated [data-chan="wa"]').count(), 'WhatsApp on a phone');
    await page.waitForFunction(async () => (await (await fetch(`/api/teams/${(await (await fetch('/api/state')).json()).mine.key}`)).json()).team.rateOg, null, { timeout: 15000 });
    const key = await page.evaluate(async () => (await (await fetch('/api/state')).json()).mine.key);
    const html = await (await fetch(`${BASE}/r/${key}?s=wa`)).text();
    assert.match(html, /og:title" content="Rate my GW\d+ team/);
    assert.match(html, /og:image" content="[^"]*\/u\/rate_/);
    await shot(page, 'e2e-9-get-rated');
  });

  await step('a friend opens the Rate link, taps 8 before signing in, and the verdict goes in after sign in', async () => {
    const key = await page.evaluate(async () => (await (await fetch('/api/state')).json()).mine.key);
    const friend = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await friend.addInitScript(() => { try { localStorage.setItem('sj-intro', '1'); } catch {} });
    await friend.route('https://accounts.google.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
    const fp = await friend.newPage();
    fp.on('pageerror', (e) => errors.push(String(e)));
    await fp.goto(`${BASE}/r/${key}?s=wa`);
    await fp.getByText(`${nick} wants your verdict`).waitFor();
    await shot(fp, 'e2e-10-rate-link');
    await fp.locator('.vbtn[data-score="8"]').click();
    await fp.getByRole('heading', { name: 'Sign in to send your verdict' }).waitFor();
    const fnick = `Friend${Date.now() % 100000}`;
    await fp.locator('#devn').fill(fnick);
    await fp.getByRole('button', { name: 'Sign in as test juror' }).click();
    await fp.locator('#nick').fill(fnick);
    await fp.getByRole('button', { name: 'Continue', exact: true }).click();
    await fp.getByText('Verdict in. Thanks for judging!').waitFor({ timeout: 15000 });
    await fp.getByText('Your verdict: 8').waitFor();
    await fp.getByRole('link', { name: 'Judge more squads' }).waitFor();
    await shot(fp, 'e2e-11-rate-done');
    const team = await page.evaluate(async (k) => (await (await fetch(`/api/teams/${k}`)).json()).team, key);
    assert.ok(team.votes >= 1);
    await friend.close();
  });

  await step('create a league, a friend opens the invite link, signs in and lands in the league table', async () => {
    await page.goto(BASE + '/leaderboard');
    await page.locator('#lgadd').click();
    await page.locator('#lg-name').fill('E2E League');
    await page.locator('#lg-create button[type=submit]').click();
    await page.getByText('League created').waitFor();
    const code = (await page.locator('.lg-code-big b').textContent()).replace(/\s/g, '');
    assert.match(code, /^[A-Z0-9]{6}$/);
    await shot(page, 'e2e-12-league-created');
    await page.locator('#lg-go').click();
    await page.locator('.lg-head').getByText('E2E League').waitFor();
    await page.getByText('Just you so far').waitFor();
    const friend = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await friend.addInitScript(() => { try { localStorage.setItem('sj-intro', '1'); } catch {} });
    await friend.route('https://accounts.google.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
    const fp = await friend.newPage();
    fp.on('pageerror', (e) => errors.push(String(e)));
    await fp.goto(`${BASE}/l/${code}?s=wa`);
    await fp.getByRole('heading', { name: 'E2E League' }).waitFor();
    await shot(fp, 'e2e-13-league-invite');
    await fp.getByRole('button', { name: 'Join league' }).click();
    const fnick = `Mate${Date.now() % 100000}`;
    await fp.locator('#devn').fill(fnick);
    await fp.getByRole('button', { name: 'Sign in as test juror' }).click();
    await fp.locator('#nick').fill(fnick);
    await fp.getByRole('button', { name: 'Continue', exact: true }).click();
    await fp.waitForURL(/\/leaderboard\?league=/, { timeout: 15000 });
    await fp.locator('.lg-head').getByText('2 members').waitFor();
    await fp.getByText(nick).first().waitFor();
    await shot(fp, 'e2e-14-league-table');
    await friend.close();
  });

  await step('sign in with an email link: Email me a link, open the link, pick a nickname', async () => {
    const guest = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await guest.addInitScript(() => { try { localStorage.setItem('sj-intro', '1'); } catch {} });
    await guest.route('https://accounts.google.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
    const gp = await guest.newPage();
    gp.on('pageerror', (e) => errors.push(String(e)));
    await gp.goto(BASE + '/leaderboard');
    await gp.locator('.board, .empty').first().waitFor();
    await gp.evaluate(() => { import('/js/auth.js').then((m) => m.signIn()); });
    await gp.getByRole('button', { name: 'Email me a link' }).waitFor();
    await gp.locator('#mail').fill(`e2e${Date.now()}@example.test`);
    await shot(gp, 'e2e-15-email-form');
    await gp.getByRole('button', { name: 'Email me a link' }).click();
    await gp.getByText('Check your inbox').waitFor();
    await shot(gp, 'e2e-16-email-sent');
    const link = await gp.getByRole('link', { name: 'Open the link (development)' }).getAttribute('href');
    await gp.goto(link);
    const nick = `Mail${Date.now() % 100000}`;
    await gp.locator('#nick').fill(nick);
    await gp.getByRole('button', { name: 'Continue', exact: true }).click();
    await gp.waitForURL(/\/leaderboard/, { timeout: 15000 });
    const me = await gp.evaluate(async () => (await (await fetch('/api/state')).json()).user);
    assert.equal(me.nickname, nick);
    assert.ok(!gp.url().includes('token='));
    await guest.close();
  });

  assert.deepEqual(errors, [], 'no console errors');
} finally {
  console.log(results.join('\n'));
  if (errors.length) console.log('console errors:\n' + errors.join('\n'));
  await browser.close();
}
