// Restores a backup file (backups/YYYY-MM-DD.json.gz from R2) into the LOCAL database, to check it.
//
// 1. Download a backup:
//      npx wrangler r2 object get squadjury-images/backups/2026-10-19.json.gz --file backup.json.gz --remote
// 2. Restore it locally:
//      node scripts/restore-backup.mjs backup.json.gz
//
// Restoring to production replaces live data, so it needs both --remote and RESTORE_REMOTE=1.
// For mistakes from the last 30 days, D1 Time Travel is simpler (see README, "Backups").

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const file = process.argv[2];
const remote = process.argv.includes('--remote');
if (!file) {
  console.error('Usage: node scripts/restore-backup.mjs <backup.json.gz> [--remote]');
  process.exit(1);
}
if (remote && process.env.RESTORE_REMOTE !== '1') {
  console.error('Refusing to restore to the remote database without RESTORE_REMOTE=1.');
  process.exit(1);
}

const raw = readFileSync(file);
const data = JSON.parse((raw[0] === 0x1f ? gunzipSync(raw) : raw).toString('utf8'));
const lit = (v) => (v === null || v === undefined ? 'NULL' : typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`);

// Children first when deleting, parents first when inserting.
const ORDER = ['users', 'gameweeks', 'teams', 'votes', 'results', 'reports', 'leagues', 'league_members', 'h2h', 'duels', 'plans', 'plan_votes'];
const names = Object.keys(data.tables).sort((a, b) => (ORDER.indexOf(a) + 1 || 99) - (ORDER.indexOf(b) + 1 || 99));
const sql = ['PRAGMA defer_foreign_keys = on;'];
for (const name of [...names].reverse()) sql.push(`DELETE FROM "${name}";`);
let rows = 0;
for (const name of names) {
  for (const row of data.tables[name]) {
    const cols = Object.keys(row);
    sql.push(`INSERT INTO "${name}" (${cols.map((c) => `"${c}"`).join(', ')}) VALUES (${cols.map((c) => lit(row[c])).join(', ')});`);
    rows++;
  }
}

mkdirSync(new URL('../.wrangler/', import.meta.url), { recursive: true });
const out = fileURLToPath(new URL('../.wrangler/restore.sql', import.meta.url));
writeFileSync(out, sql.join('\n'));
execSync(`npx wrangler d1 execute squadjury ${remote ? '--remote' : '--local'} --file="${out}"`, { stdio: 'inherit' });
console.log(`Restored ${rows} rows from ${data.created} into the ${remote ? 'REMOTE' : 'local'} database.`);
