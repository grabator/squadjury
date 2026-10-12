// Loading speed of the Judge screen on a simulated mid range phone over 4G.
import { launch } from '../../scripts/browser.mjs';
const BASE = process.env.BASE || 'http://127.0.0.1:8787';
const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
// The first visit intro is tested in run.mjs; here it would cover the screens.
await ctx.addInitScript(() => { try { localStorage.setItem('sj-intro', '1'); } catch {} });
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
await cdp.send('Network.enable');
await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: (9 * 1024 * 1024) / 8, uploadThroughput: (1.5 * 1024 * 1024) / 8 });
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
let bytes = 0, jsBytes = 0;
cdp.on('Network.loadingFinished', (e) => { bytes += e.encodedDataLength; });
const types = new Map();
cdp.on('Network.responseReceived', (e) => types.set(e.requestId, e.type));
cdp.on('Network.loadingFinished', (e) => { if (types.get(e.requestId) === 'Script') jsBytes += e.encodedDataLength; });
await page.addInitScript(() => {
  window.__lcp = 0; window.__cls = 0;
  new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lcp = e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true });
  new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: 'layout-shift', buffered: true });
});
const t0 = Date.now();
await page.goto(BASE + '/', { waitUntil: 'load' });
await page.locator('.vbtn').first().waitFor();
const ready = Date.now() - t0;
await page.waitForTimeout(1500);
const m = await page.evaluate(() => ({ lcp: Math.round(window.__lcp), cls: Math.round(window.__cls * 1000) / 1000 }));
console.log(JSON.stringify({ verdictButtonsReadyMs: ready, lcpMs: m.lcp, cls: m.cls, transferKB: Math.round(bytes / 1024), jsKB: Math.round(jsBytes / 1024) }));
await browser.close();
