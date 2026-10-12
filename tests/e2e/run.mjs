// End to end test of the main flow in a real browser, against `npm run dev`.
// Usage: node tests/e2e/run.mjs [screenshot folder]
import { launch } from '../../scripts/browser.mjs';
import assert from 'node:assert/strict';

const BASE = process.env.BASE || 'http://127.0.0.1:8787';
const OUT = process.argv[2];
const fixture = new URL('../fixtures/pick-team-2.jpg', import.meta.url).pathname;
const shot = async (p, name) => OUT && p.screenshot({ path: `${OUT}/${name}.png` });
const results = [];
const step = async (name, fn) => {
  const t0 = Date.now();
  try { await fn(); results.push(`ok   ${name} (${Date.now() - t0} ms)`); }
  catch (e) {
    results.push(`FAIL ${name}: ${e.message.split('\n')[0]}`);
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
  await step('sign in from the Post tab (dev login) and pick a nickname', async () => {
    await page.goto(BASE + '/post');
    await page.getByRole('button', { name: 'Continue with Google' }).click();
    await page.locator('#devn').fill(nick);
    await page.getByRole('button', { name: 'Sign in as test juror' }).click();
    await page.locator('#nick').fill(nick);
    await page.locator('#xh').fill('@grabator');
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.getByText('Choose screenshot').waitFor();
    await shot(page, 'e2e-1-post');
  });

  await step('upload the Pick Team screenshot and read all 15 players in the browser', async () => {
    await page.locator('#file').setInputFiles(fixture);
    await page.waitForTimeout(1200);
    await shot(page, 'e2e-2-reading');
    await page.getByText('15 of 15 recognised').waitFor({ timeout: 90000 });
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

  await step('judge 5 squads with the gavel animation', async () => {
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

  await step('my squad page shows the squad and share buttons', async () => {
    await page.goto(BASE + '/squad');
    await page.getByRole('button', { name: 'Share link' }).waitFor();
    assert.equal(await page.locator('.pl').count(), 15);
    await page.waitForTimeout(1200);
    await shot(page, 'e2e-7-mysquad');
  });

  await step('the share image renders at 1920x1080 and 1080x1920', async () => {
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
        if (kind !== 'og') window[`__${kind}`] = await new Promise((r) => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(blob); });
      }
      return out;
    });
    assert.deepEqual(sizes, { x: '1920x1080', story: '1080x1920', og: '1920x1005' });
    if (OUT) {
      const { writeFileSync } = await import('node:fs');
      for (const k of ['x', 'story']) {
        const data = await page.evaluate((k) => window[`__${k}`], k);
        writeFileSync(`${OUT}/share-${k}.png`, Buffer.from(data.split(',')[1], 'base64'));
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

  assert.deepEqual(errors, [], 'no console errors');
} finally {
  console.log(results.join('\n'));
  if (errors.length) console.log('console errors:\n' + errors.join('\n'));
  await browser.close();
}
