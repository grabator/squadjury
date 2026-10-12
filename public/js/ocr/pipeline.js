// The full screenshot reading pipeline, shared by the browser and the tests.
// The caller provides `recognize(gray, psm)` which runs Tesseract on a grayscale image
// ({ gray: Uint8Array, width, height }) and returns words in that image's pixels.

import { findCards, findBadges, badgeLetter, cropGray, grayUpscale, thresholdGray, THRESHOLDS } from './preprocess.js';
import { readSquad, buildIndex } from './match.js';

const scaleWords = (words, s, dx = 0, dy = 0) =>
  words.map((w) => ({
    text: w.text,
    confidence: w.confidence,
    bbox: { x0: w.bbox.x0 / s + dx, y0: w.bbox.y0 / s + dy, x1: w.bbox.x1 / s + dx, y1: w.bbox.y1 / s + dy },
  }));

/**
 * img: RGBA ImageData-like. data: { players, teams, fixtures, gw? }.
 * Returns the squad from match.readSquad plus timing info.
 */
export async function readScreenshot(img, data, { recognize, onProgress = () => {} }) {
  const t0 = Date.now();
  const ctx = { ...data, index: data.index || buildIndex(data.players), width: img.width, height: img.height };
  ctx.badges = findBadges(img).map((b) => ({ ...b, letter: badgeLetter(img, b.box) }));

  // 1) Each white name card on its own: small, clean, fast and very reliable.
  const cards = findCards(img);
  const cardWords = [];
  for (let i = 0; i < cards.length; i++) {
    const c = cards[i];
    const up = cropGray(img, c, 3);
    const words = await recognize(thresholdGray(up, 150), '6');
    cardWords.push(...scaleWords(words, 3, c.x, c.y));
    onProgress({ step: 'cards', done: i + 1, total: cards.length });
  }
  const passes = [cardWords];
  let squad = readSquad(passes, ctx);
  onProgress({ step: 'found', recognised: squad.recognised });

  // 2) Whole screenshot passes until all 15 are found (cards the detector missed,
  //    usually the bench on its pale background).
  if (squad.recognised < 15) {
    const up = grayUpscale(img, 2);
    for (const t of THRESHOLDS) {
      const words = await recognize(thresholdGray(up, t), '11');
      passes.push(scaleWords(words, 2));
      squad = readSquad(passes, ctx);
      onProgress({ step: 'page', threshold: t, recognised: squad.recognised });
      if (squad.recognised >= 15 && squad.ok) break;
    }
  }
  return { ...squad, cards: cards.length, ms: Date.now() - t0 };
}
