// Shared Chromium launcher for scripts and tests. Set CHROME_PATH to use a specific browser.
import { chromium } from 'playwright-core';
import { existsSync } from 'node:fs';

const CANDIDATES = [
  process.env.CHROME_PATH,
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  '/usr/bin/chromium',
  '/usr/bin/google-chrome',
].filter(Boolean);

export function launch(opts = {}) {
  const executablePath = CANDIDATES.find((p) => existsSync(p));
  return chromium.launch({ executablePath, ...opts });
}
