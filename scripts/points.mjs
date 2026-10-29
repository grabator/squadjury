// Sends the real points of a finished gameweek to SquadJury from your own computer.
// Use it when FPL blocks Cloudflare and the hourly job cannot fetch the points itself.
//
//   PowerShell:  $env:ADMIN_TOKEN="..."; npm run points -- --gw 7
//   cmd:         set ADMIN_TOKEN=... && npm run points -- --gw 7
//
// ADMIN_TOKEN is the same secret you set once with: npx wrangler secret put ADMIN_TOKEN
// BASE is the address of the app, for example https://your-domain (or http://127.0.0.1:8790 locally).

const args = process.argv.slice(2);
const gw = +args[args.indexOf('--gw') + 1];
const BASE = process.env.BASE;
if (!BASE) {
  console.error('Set BASE to the address of the app, for example BASE=https://your-domain');
  process.exit(1);
}
const token = process.env.ADMIN_TOKEN;
if (!(gw >= 1 && gw <= 38)) {
  console.error('Usage: npm run points -- --gw 7');
  process.exit(1);
}
if (!token) {
  console.error('Set ADMIN_TOKEN first (see the top of scripts/points.mjs).');
  process.exit(1);
}

const res = await fetch(`https://fantasy.premierleague.com/api/event/${gw}/live/`, { headers: { 'user-agent': 'Mozilla/5.0', accept: 'application/json' } });
if (!res.ok) {
  console.error(`FPL answered ${res.status}. Try again in a few minutes.`);
  process.exit(1);
}
const live = await res.json();
// Only what SquadJury needs: points and minutes per player.
const slim = { elements: live.elements.map((e) => ({ id: e.id, stats: { total_points: e.stats.total_points, minutes: e.stats.minutes } })) };
const post = await fetch(`${BASE}/api/admin/points`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-admin-token': token, origin: BASE },
  body: JSON.stringify({ gw, live: slim }),
});
const out = await post.json().catch(() => ({}));
if (!post.ok) {
  console.error(`SquadJury answered ${post.status}: ${out.error || 'error'}`);
  process.exit(1);
}
console.log(`GW${gw}: points saved for ${out.scored} squads.`);
