// Weekly backup: every table as JSON, gzipped into R2 under backups/. The last 8 are kept.
// Sessions, rate limit counters and the FPL cache are left out: they are temporary and
// sessions should never sit in a file.

const SKIP = new Set(['sessions', 'rate', 'kv', 'd1_migrations']);
const KEEP = 8;
const PAGE = 2000;

async function gzip(text) {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Writes a backup to R2 and removes the oldest beyond 8. Returns { key, size, rows }. */
export async function runBackup(env, now) {
  const list = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name").all();
  const tables = {};
  let rows = 0;
  for (const { name } of list.results) {
    if (SKIP.has(name)) continue;
    tables[name] = [];
    for (let offset = 0; ; offset += PAGE) {
      const page = await env.DB.prepare(`SELECT * FROM "${name}" LIMIT ? OFFSET ?`).bind(PAGE, offset).all();
      tables[name].push(...page.results);
      if (page.results.length < PAGE) break;
    }
    rows += tables[name].length;
  }
  const body = await gzip(JSON.stringify({ version: 1, created: new Date(now).toISOString(), tables }));
  const key = `backups/${new Date(now).toISOString().slice(0, 10)}.json.gz`;
  await env.IMAGES.put(key, body, { httpMetadata: { contentType: 'application/gzip' }, customMetadata: { rows: String(rows) } });
  await pruneBackups(env);
  console.log(JSON.stringify({ msg: 'backup written', key, size: body.length, rows }));
  return { key, size: body.length, rows };
}

/** Backups, newest first. */
export async function listBackups(env) {
  const out = [];
  let cursor;
  do {
    const page = await env.IMAGES.list({ prefix: 'backups/', cursor, include: ['customMetadata'] });
    out.push(...page.objects.map((o) => ({ key: o.key, size: o.size, uploaded: o.uploaded.getTime(), rows: +(o.customMetadata?.rows || 0) })));
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return out.sort((a, b) => b.key.localeCompare(a.key));
}

async function pruneBackups(env) {
  const old = (await listBackups(env)).slice(KEEP);
  if (old.length) await env.IMAGES.delete(old.map((o) => o.key));
}
