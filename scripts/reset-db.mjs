// Deletes the local database and creates it again from the migrations (works on Windows too).
import { rmSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

rmSync(fileURLToPath(new URL('../.wrangler/state', import.meta.url)), { recursive: true, force: true });
execSync('npx wrangler d1 migrations apply squadjury --local', { stdio: 'inherit' });
