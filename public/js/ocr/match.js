// Turns OCR words from a Pick Team screenshot into a validated FPL squad.
// Pure functions: no DOM, no network. Shared by the browser and the tests.

const SPECIAL = { 'ø': 'o', 'æ': 'ae', 'œ': 'oe', 'ß': 'ss', 'ł': 'l', 'đ': 'd', 'ð': 'd', 'þ': 'th', 'ı': 'i' };

/** Lowercase, no accents, letters only. "Gibbs-White" -> "gibbswhite", "Ødegaard" -> "odegaard". */
export function norm(s) {
  return String(s)
    .toLowerCase()
    .replace(/[øæœßłđðþı]/g, (c) => SPECIAL[c])
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z]/g, '');
}

/** Classic edit distance, with an early exit once it exceeds max. */
export function lev(a, b, max = 3) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (cur[j] < best) best = cur[j];
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

const allowedDistance = (len) => (len <= 4 ? 0 : len <= 6 ? 1 : 2);

export const POSITIONS = { 1: 'GK', 2: 'DEF', 3: 'MID', 4: 'FWD' };
export const SQUAD_SHAPE = { 1: 2, 2: 5, 3: 5, 4: 3 };

/** Index of players by normalised web_name for fast lookups. */
export function buildIndex(players) {
  const byKey = new Map();
  for (const p of players) {
    const k = norm(p.web_name);
    if (k.length < 2) continue;
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k).push(p);
  }
  return { byKey, keys: [...byKey.keys()] };
}

/** Finds players whose name matches an OCR token. Returns [{ players, dist, key }] best first. */
export function lookup(index, text) {
  const k = norm(text);
  if (k.length < 3) return null;
  if (index.byKey.has(k)) return { key: k, dist: 0, players: index.byKey.get(k) };
  const max = allowedDistance(k.length);
  if (!max) return null;
  let best = null;
  for (const key of index.keys) {
    if (Math.abs(key.length - k.length) > max || key.length < 5) continue;
    const d = lev(k, key, max);
    if (d <= max && (!best || d < best.dist)) best = { key, dist: d, players: index.byKey.get(key) };
  }
  return best;
}

// Words that appear on every screenshot and are never player names.
const NOISE = new Set(['gk', 'def', 'mid', 'fwd', 'fantasy', 'emirates', 'stake', 'aia', 'etihad', 'sbotop', 'snapdragon', 'bet', 'better', 'fly']);

/**
 * Merges words from several OCR passes into name candidates with positions.
 * words: [{ text, confidence, bbox: { x0, y0, x1, y1 } }] in screenshot pixels.
 */
export function candidates(passes, index) {
  const found = [];
  for (const words of passes) {
    const ws = words.filter((w) => w.text && w.confidence > 55);
    // Single words and pairs of neighbouring words ("Van" + "Hecke").
    const tokens = [];
    for (let i = 0; i < ws.length; i++) {
      tokens.push({ text: ws[i].text, conf: ws[i].confidence, box: ws[i].bbox });
      const a = ws[i], b = ws[i + 1];
      if (b) {
        const h = a.bbox.y1 - a.bbox.y0;
        const sameLine = Math.abs(a.bbox.y0 - b.bbox.y0) < h * 0.5;
        const gap = b.bbox.x0 - a.bbox.x1;
        if (sameLine && gap >= 0 && gap < h * 1.2) {
          tokens.push({
            text: a.text + ' ' + b.text,
            conf: Math.min(a.confidence, b.confidence),
            box: { x0: a.bbox.x0, y0: Math.min(a.bbox.y0, b.bbox.y0), x1: b.bbox.x1, y1: Math.max(a.bbox.y1, b.bbox.y1) },
            pair: true,
          });
        }
      }
    }
    for (const t of tokens) {
      const clean = t.text.replace(/[^A-Za-zÀ-ÿĀ-žØøÆæßŁłĐđ' -]/g, '').trim();
      if (!/^[A-ZÀ-ÞĀ-Ž]/.test(clean) || NOISE.has(norm(clean))) continue;
      const hit = lookup(index, clean);
      if (!hit) continue;
      const cx = (t.box.x0 + t.box.x1) / 2, cy = (t.box.y0 + t.box.y1) / 2;
      // Same name seen in another pass at the same spot: keep the better reading.
      const dup = found.find((f) => Math.abs(f.cx - cx) < 60 && Math.abs(f.cy - cy) < 30);
      const score = (t.pair ? 1 : 0) + (3 - hit.dist) + t.conf / 100;
      if (dup) {
        if (score > dup.score) Object.assign(dup, { text: clean, hit, score, box: t.box, cx, cy });
        continue;
      }
      found.push({ text: clean, hit, score, box: t.box, cx, cy });
    }
  }
  return found;
}

/** Reads fixture labels like "TOT (H)" and returns them with positions. */
export function fixtureLabels(passes, teams) {
  const shorts = new Set(teams.map((t) => t.short_name));
  const out = [];
  for (const words of passes) {
    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      const code = (w.text || '').toUpperCase().replace(/[^A-Z]/g, '');
      if (code.length !== 3 || !shorts.has(code)) continue;
      const next = words[i + 1];
      let venue = null;
      if (next) {
        const m = (next.text || '').toUpperCase().match(/\(?([HA])\)?/);
        if (m && next.bbox.x0 - w.bbox.x1 < (w.bbox.y1 - w.bbox.y0) * 1.5) venue = m[1];
      }
      const cx = (w.bbox.x0 + (next && venue ? next.bbox.x1 : w.bbox.x1)) / 2;
      const cy = (w.bbox.y0 + w.bbox.y1) / 2;
      if (!out.some((o) => Math.abs(o.cx - cx) < 60 && Math.abs(o.cy - cy) < 30 && (o.venue || !venue))) {
        const old = out.findIndex((o) => Math.abs(o.cx - cx) < 60 && Math.abs(o.cy - cy) < 30);
        if (old >= 0) out.splice(old, 1);
        out.push({ code, venue, cx, cy });
      }
    }
  }
  return out;
}

/** Bench header row ("GK FWD DEF DEF"): returns its y, or null. */
export function benchHeaderY(passes) {
  for (const words of passes) {
    const pos = words.filter((w) => /^(GK|DEF|MID|FWD)$/.test((w.text || '').trim()));
    for (const a of pos) {
      const row = pos.filter((b) => Math.abs(b.bbox.y0 - a.bbox.y0) < 20);
      if (row.length >= 3) return Math.min(...row.map((b) => b.bbox.y0));
    }
  }
  return null;
}

/** Which team does `teamId` play in gameweek `gw`, and where. */
function fixtureFor(teamId, gw, fixtures, teams) {
  const short = (id) => teams.find((t) => t.id === id)?.short_name;
  const out = [];
  for (const f of fixtures) {
    if (f.event !== gw) continue;
    if (f.team_h === teamId) out.push({ code: short(f.team_a), venue: 'H' });
    if (f.team_a === teamId) out.push({ code: short(f.team_h), venue: 'A' });
  }
  return out;
}

/** Picks the player for an ambiguous name using the fixture label below it. */
function resolve(cand, labels, ctx) {
  const options = cand.hit.players;
  const h = cand.box.y1 - cand.box.y0;
  const label = labels
    .filter((l) => l.cy > cand.cy && l.cy - cand.cy < h * 4 && Math.abs(l.cx - cand.cx) < h * 4)
    .sort((a, b) => a.cy - b.cy)[0];
  if (options.length === 1) return { player: options[0], label };
  if (label && ctx.gw) {
    const fit = options.filter((p) =>
      fixtureFor(p.team, ctx.gw, ctx.fixtures, ctx.teams).some((f) => f.code === label.code && (!label.venue || f.venue === label.venue)),
    );
    if (fit.length === 1) return { player: fit[0], label };
  }
  return { player: null, options, label };
}

/** Guesses the gameweek from fixture labels when it is not known. */
export function guessGameweek(slots, labels, ctx) {
  const scores = new Map();
  for (const s of slots) {
    if (!s.player || !s.label) continue;
    for (const ev of new Set(ctx.fixtures.map((f) => f.event))) {
      if (fixtureFor(s.player.team, ev, ctx.fixtures, ctx.teams).some((f) => f.code === s.label.code)) {
        scores.set(ev, (scores.get(ev) || 0) + 1);
      }
    }
  }
  let best = null;
  for (const [ev, n] of scores) if (!best || n > best.n || (n === best.n && ev > best.ev)) best = { ev, n };
  return best?.ev ?? null;
}

/**
 * Main entry. passes: OCR word lists (one per threshold), in screenshot pixels.
 * ctx: { players, teams, fixtures, gw?, width, height, badges?: [{ cx, cy, letter }] }
 */
export function readSquad(passes, ctx) {
  const index = ctx.index || buildIndex(ctx.players);
  const cands = candidates(passes, index);
  const labels = fixtureLabels(passes, ctx.teams);
  const benchY = benchHeaderY(passes);

  let slots = cands.map((c) => ({ ...resolve(c, labels, ctx), cand: c }));
  // Drop names without a fixture label nearby when we have more than 15 (stray sponsor text).
  if (slots.length > 15) {
    const labelled = slots.filter((s) => s.label);
    if (labelled.length >= 11) slots = labelled;
  }
  // One player can only appear once.
  const seen = new Set();
  slots = slots
    .sort((a, b) => b.cand.score - a.cand.score)
    .filter((s) => {
      const id = s.player?.id ?? 'n' + s.cand.text;
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });

  const gw = ctx.gw ?? guessGameweek(slots, labels, ctx);
  if (!ctx.gw && gw) {
    // Re-resolve ambiguous names now that we know the gameweek.
    slots = slots.map((s) => (s.player ? s : { ...resolve(s.cand, labels, { ...ctx, gw }), cand: s.cand }));
  }

  // Starters above the bench header, bench below it.
  const rowGap = (ctx.height || 2000) * 0.04;
  const starters = [], bench = [];
  for (const s of slots) (benchY != null && s.cand.cy > benchY ? bench : starters).push(s);
  if (benchY == null && slots.length === 15) {
    slots.sort((a, b) => a.cand.cy - b.cand.cy);
    starters.length = 0; bench.length = 0;
    starters.push(...slots.slice(0, 11)); bench.push(...slots.slice(11));
  }
  starters.sort((a, b) => (Math.abs(a.cand.cy - b.cand.cy) < rowGap ? a.cand.cx - b.cand.cx : a.cand.cy - b.cand.cy));
  bench.sort((a, b) => a.cand.cx - b.cand.cx);

  // Captain and vice: badge sits above the name, near the card's left edge.
  let captain = null, vice = null;
  for (const b of ctx.badges || []) {
    const owner = [...starters, ...bench]
      .filter((s) => s.cand.cy > b.cy && s.cand.cy - b.cy < (ctx.width || 1080) * 0.22 && Math.abs(s.cand.cx - b.cx) < (ctx.width || 1080) * 0.12)
      .sort((x, y) => (x.cand.cy - b.cy) - (y.cand.cy - b.cy))[0];
    if (!owner?.player) continue;
    if (b.letter === 'C' && !captain) captain = owner.player.id;
    else if (b.letter === 'V' && !vice) vice = owner.player.id;
  }

  const toPick = (s, i, isBench) => ({
    slot: i + 1,
    bench: isBench,
    id: s.player?.id ?? null,
    name: s.player?.web_name ?? s.cand.text,
    team: s.player?.team ?? null,
    pos: s.player?.element_type ?? null,
    options: s.player ? undefined : (s.options || []).map((p) => p.id),
    fixture: s.label ? `${s.label.code}${s.label.venue ? ` (${s.label.venue})` : ''}` : null,
  });
  const picks = [...starters.map((s, i) => toPick(s, i, false)), ...bench.map((s, i) => toPick(s, i + starters.length, true))];
  return { gw, picks, captain, vice, ...validate(picks, ctx) };
}

/** Squad rules: 15 players, 2 GK / 5 DEF / 5 MID / 3 FWD, max 3 per club, valid formation. */
export function validate(picks, ctx) {
  const problems = [];
  const known = picks.filter((p) => p.id != null);
  if (picks.length !== 15) problems.push({ code: 'count', n: picks.length });
  if (known.length === 15) {
    const byPos = {};
    for (const p of known) byPos[p.pos] = (byPos[p.pos] || 0) + 1;
    for (const [pos, n] of Object.entries(SQUAD_SHAPE)) {
      if ((byPos[pos] || 0) !== n) problems.push({ code: 'shape', pos: POSITIONS[pos], have: byPos[pos] || 0, need: n });
    }
    const byClub = {};
    for (const p of known) byClub[p.team] = (byClub[p.team] || 0) + 1;
    for (const [team, n] of Object.entries(byClub)) {
      if (n > 3) problems.push({ code: 'club', team: ctx.teams?.find((t) => t.id === +team)?.short_name || team, n });
    }
    const xi = known.filter((p) => !p.bench);
    const c = (pos) => xi.filter((p) => p.pos === pos).length;
    if (xi.length === 11 && (c(1) !== 1 || c(2) < 3 || c(3) < 2 || c(4) < 1)) problems.push({ code: 'formation' });
  }
  return { ok: problems.length === 0 && known.length === 15, recognised: known.length, problems };
}
