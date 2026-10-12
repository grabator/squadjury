// Browser side of the squad reader: loads Tesseract from our own domain on first use
// and runs the shared pipeline on an uploaded screenshot.

import { readScreenshot } from './pipeline.js';

const BASE = '/vendor/tesseract';
let workerPromise = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (window.Tesseract) return resolve();
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error('ocr_load_failed'));
    document.head.append(s);
  });
}

/** Starts loading the OCR engine (about 7 MB, cached after the first time). */
export function warmUp() {
  if (!workerPromise) {
    workerPromise = loadScript(`${BASE}/tesseract.min.js`).then(() =>
      window.Tesseract.createWorker('eng', 1, {
        workerPath: `${BASE}/worker.min.js`,
        corePath: `${BASE}/core`,
        langPath: `${BASE}/lang`,
        workerBlobURL: false,
        gzip: true,
      }),
    );
    workerPromise.catch(() => (workerPromise = null));
  }
  return workerPromise;
}

/** Grayscale buffer to a canvas Tesseract can read. */
function toCanvas({ gray, width, height }) {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  const g = c.getContext('2d');
  const img = g.createImageData(width, height);
  for (let p = 0, i = 0; p < gray.length; p++, i += 4) {
    img.data[i] = img.data[i + 1] = img.data[i + 2] = gray[p];
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}

async function recognize(gray, psm) {
  const w = await warmUp();
  await w.setParameters({ tessedit_pageseg_mode: psm, user_defined_dpi: '300' });
  const { data } = await w.recognize(toCanvas(gray), {}, { blocks: true, text: false });
  const words = [];
  for (const b of data.blocks || []) for (const p of b.paragraphs) for (const l of p.lines) for (const wd of l.words) words.push(wd);
  return words;
}

/** Decodes an image file, scaled to 1080 px wide (the width the reader is tuned for). */
export async function decodeFile(file) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = 1080 / bmp.width;
  const w = 1080, h = Math.round(bmp.height * scale);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.imageSmoothingQuality = 'high';
  g.drawImage(bmp, 0, 0, w, h);
  return { imageData: g.getImageData(0, 0, w, h), bitmap: bmp };
}

/** Reads the squad from a decoded screenshot. */
export async function readSquadFromImage(imageData, fpl, { gw, onProgress }) {
  return readScreenshot(imageData, { players: fpl.players, teams: fpl.teams, fixtures: fpl.fixtures, gw: undefined, hintGw: gw }, { recognize, onProgress });
}

/** Re-encodes the screenshot for upload: WebP (JPEG where WebP is not supported), max 1600 px wide. */
export async function compress(bitmap) {
  const scale = Math.min(1, 1600 / bitmap.width);
  const c = document.createElement('canvas');
  c.width = Math.round(bitmap.width * scale);
  c.height = Math.round(bitmap.height * scale);
  c.getContext('2d').drawImage(bitmap, 0, 0, c.width, c.height);
  const webp = await new Promise((r) => c.toBlob(r, 'image/webp', 0.8));
  if (webp && webp.type === 'image/webp') return webp;
  return new Promise((r) => c.toBlob(r, 'image/jpeg', 0.82));
}
