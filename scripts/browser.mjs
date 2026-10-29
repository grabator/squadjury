// Shared Chromium launcher for scripts and tests. Set CHROME_PATH to use a specific browser.
import { chromium } from 'playwright-core';
import { existsSync } from 'node:fs';

const CANDIDATES = [
  process.env.CHROME_PATH,
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  '/usr/bin/chromium',
  '/usr/bin/google-chrome',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);

export function launch(opts = {}) {
  const executablePath = CANDIDATES.find((p) => existsSync(p));
  return chromium.launch({ executablePath, ...opts });
}
