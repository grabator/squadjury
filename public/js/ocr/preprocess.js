// Image preprocessing for OCR. Pure functions over ImageData-like objects
// ({ data, width, height }), so the same code runs in the browser and in Node tests.

/** Grayscale + upscale (bilinear) in one pass. Returns a Uint8Array of luminance. */
export function grayUpscale(img, scale = 2) {
  const { data, width: w, height: h } = img;
  const W = Math.round(w * scale), H = Math.round(h * scale);
  // Luminance of the source first, so the upscale reads one byte per pixel.
  const lum = new Uint8Array(w * h);
  for (let p = 0, i = 0; p < lum.length; p++, i += 4) {
    lum[p] = (data[i] * 77 + data[i + 1] * 150 + data[i + 2] * 29) >> 8;
  }
  const out = new Uint8Array(W * H);
  const sx = (w - 1) / Math.max(1, W - 1), sy = (h - 1) / Math.max(1, H - 1);
  for (let y = 0; y < H; y++) {
    const fy = y * sy, y0 = fy | 0, y1 = Math.min(h - 1, y0 + 1), ty = fy - y0;
    for (let x = 0; x < W; x++) {
      const fx = x * sx, x0 = fx | 0, x1 = Math.min(w - 1, x0 + 1), tx = fx - x0;
      const a = lum[y0 * w + x0], b = lum[y0 * w + x1], c = lum[y1 * w + x0], d = lum[y1 * w + x1];
      out[y * W + x] = (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
    }
  }
  return { lum: out, width: W, height: H };
}

/** Black text on white: pixels darker than the threshold become black. */
export function threshold({ lum, width, height }, t) {
  const out = new Uint8ClampedArray(width * height * 4);
  for (let p = 0, i = 0; p < lum.length; p++, i += 4) {
    const v = lum[p] < t ? 0 : 255;
    out[i] = out[i + 1] = out[i + 2] = v;
    out[i + 3] = 255;
  }
  return { data: out, width, height };
}

/** Same as threshold, but returns a single-channel buffer (for PNG encoding in Node). */
export function thresholdGray({ lum, width, height }, t) {
  const out = new Uint8Array(width * height);
  for (let p = 0; p < lum.length; p++) out[p] = lum[p] < t ? 0 : 255;
  return { gray: out, width, height };
}

// The thresholds that together read every name on a real Pick Team screenshot.
// Each one alone misses a player or two; the union catches all of them.
export const THRESHOLDS = [140, 110, 170, 200];

/**
 * Finds the small dark purple badges FPL draws for the captain (C) and vice captain (V).
 * Returns their centres and a crop box (in source pixels) for a single character read.
 */
export function findBadges(img) {
  const { data, width: w, height: h } = img;
  const B = 3; // block size keeps this fast on large screenshots
  const gw = Math.floor(w / B), gh = Math.floor(h / B);
  const mark = new Uint8Array(gw * gh);
  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      const i = ((gy * B + 1) * w + gx * B + 1) * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      // Deep purple: very dark green channel, red and blue a bit higher.
      if (g < 40 && r < 110 && b < 120 && r + b > 40 && r + b < 210) mark[gy * gw + gx] = 1;
    }
  }
  const seen = new Uint8Array(gw * gh), out = [];
  for (let s = 0; s < mark.length; s++) {
    if (!mark[s] || seen[s]) continue;
    let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1, n = 0;
    const stack = [s]; seen[s] = 1;
    while (stack.length) {
      const c = stack.pop(), x = c % gw, y = (c / gw) | 0;
      n++;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (const k of [c - 1, c + 1, c - gw, c + gw]) {
        if (k >= 0 && k < mark.length && mark[k] && !seen[k] && Math.abs((k % gw) - x) <= 1) { seen[k] = 1; stack.push(k); }
      }
    }
    const bw = (x1 - x0 + 1) * B, bh = (y1 - y0 + 1) * B;
    const size = w * 0.022; // badge diameter is about 2.2% of the screenshot width
    if (bw > size * 0.6 && bw < size * 1.8 && bh > size * 0.6 && bh < size * 1.8 && Math.abs(bw - bh) < size * 0.5) {
      // A filled circle covers roughly pi/4 of its box (minus the white letter).
      const fill = (n * B * B) / (bw * bh);
      if (fill > 0.35 && fill < 0.95) {
        out.push({ cx: (x0 * B + x1 * B + B) / 2, cy: (y0 * B + y1 * B + B) / 2, box: { x: x0 * B, y: y0 * B, w: bw, h: bh } });
      }
    }
  }
  return out;
}

/** Classifies a badge as 'C' or 'V' from the white letter inside it. */
export function badgeLetter(img, box) {
  const { data, width: w } = img;
  // In the middle band of the badge, a "C" only has its left stroke, while a "V" has
  // two arms around the centre. The mean x of white pixels tells them apart.
  let sum = 0, n = 0;
  for (let y = Math.round(box.y + box.h * 0.42); y <= box.y + box.h * 0.62; y++) {
    for (let x = box.x; x < box.x + box.w; x++) {
      const i = (y * w + x) * 4;
      if (data[i] > 180 && data[i + 1] > 180 && data[i + 2] > 180) { sum += (x - box.x) / box.w; n++; }
    }
  }
  if (n < 3) return null;
  return sum / n < 0.43 ? 'C' : 'V';
}

/**
 * Finds the white name cards under each shirt. Works on horizontal runs of near-white
 * pixels: a card row is one run as wide as a card, and a card is a stack of such rows.
 * Pitch lines are either too thin or too long to pass.
 */
export function findCards(img) {
  const { data, width: w, height: h } = img;
  const minW = w * 0.12, maxW = w * 0.21, maxGap = w * 0.025;
  const rows = [];
  for (let y = 0; y < h; y++) {
    // White runs on this row, merging runs split by letters (short dark gaps).
    const runs = [];
    let start = -1;
    for (let x = 0; x <= w; x++) {
      const i = (y * w + x) * 4;
      const r = data[i], g = data[i + 1], bl = data[i + 2];
      // Bright white only (the name row). The bench background is a pale green with
      // red and blue around 240, so it stays out; the grey fixture row is added later.
      // A flagged player (injury or doubt) has a yellow name row instead.
      const white = x < w && ((r > 246 && g > 236 && bl > 246) || (r > 235 && g > 200 && bl < 170 && r - bl > 90));
      if (white && start < 0) start = x;
      else if (!white && start >= 0) {
        const last = runs[runs.length - 1];
        if (last && start - last.x1 <= maxGap) last.x1 = x - 1;
        else runs.push({ x0: start, x1: x - 1 });
        start = -1;
      }
    }
    for (const r of runs) {
      const len = r.x1 - r.x0 + 1;
      if (len >= minW && len <= maxW) rows.push({ y, x0: r.x0, x1: r.x1 });
    }
  }
  // Stack rows that line up into boxes. Rows with letters, or a pitch line running through
  // the name, can fail, so small gaps are fine.
  const boxes = [];
  for (const r of rows) {
    const b = boxes.find((b) => r.y - b.y1 <= 6 && Math.abs(r.x0 - b.x0) <= 6 && Math.abs(r.x1 - b.x1) <= 6);
    if (b) { b.y1 = r.y; b.n++; b.xs0.push(r.x0); b.xs1.push(r.x1); }
    else boxes.push({ x0: r.x0, x1: r.x1, y0: r.y, y1: r.y, n: 1, xs0: [r.x0], xs1: [r.x1] });
  }
  // Edges from the typical row, so a pitch line touching the first row does not widen the box.
  const median = (a) => a.slice().sort((p, q) => p - q)[a.length >> 1];
  for (const b of boxes) { b.x0 = median(b.xs0); b.x1 = median(b.xs1); }
  return boxes
    .filter((b) => b.y1 - b.y0 >= w * 0.022 && b.n >= (b.y1 - b.y0) * 0.7)
    // The name row plus the grey fixture row right under it.
    // A few pixels in from the sides, past the rounded corners.
    .map((b) => ({ x: b.x0 + 3, y: b.y0, w: b.x1 - b.x0 - 5, h: Math.min(h - b.y0, Math.round(w * 0.082)) }))
    .sort((a, b) => a.y - b.y || a.x - b.x);
}

/** Crops a box out of an RGBA image, as grayscale upscaled by `scale`. */
export function cropGray(img, box, scale = 3) {
  const { data, width: w } = img;
  const sub = new Uint8ClampedArray(box.w * box.h * 4);
  for (let y = 0; y < box.h; y++) {
    const from = ((box.y + y) * w + box.x) * 4;
    sub.set(data.subarray(from, from + box.w * 4), y * box.w * 4);
  }
  return grayUpscale({ data: sub, width: box.w, height: box.h }, scale);
}
