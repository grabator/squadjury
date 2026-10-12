// Runs the browser OCR pipeline in Node, for tests.
import { readFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import jpeg from 'jpeg-js';
import Tesseract from 'tesseract.js';
import { readScreenshot } from '../../public/js/ocr/pipeline.js';
import { fileURLToPath } from 'node:url';

// Minimal 8-bit grayscale PNG encoder (Tesseract in Node wants an encoded image).
const CRC = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
function crc32(buf) {
  let crc = -1;
  for (let i = 0; i < buf.length; i++) crc = CRC[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
export function pngGray({ gray, width, height }) {
  const raw = Buffer.alloc((width + 1) * height);
  for (let y = 0; y < height; y++) Buffer.from(gray.buffer, gray.byteOffset + y * width, width).copy(raw, y * (width + 1) + 1);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 1 })), chunk('IEND', Buffer.alloc(0))]);
}

let worker;
async function getWorker() {
  if (worker) return worker;
  const langPath = fileURLToPath(new URL('../../node_modules/@tesseract.js-data/eng/4.0.0_best_int/', import.meta.url));
  worker = await Tesseract.createWorker('eng', 1, { langPath, gzip: true, cachePath: (await import('node:os')).tmpdir() });
  return worker;
}
export async function stop() { if (worker) await worker.terminate(); worker = null; }

export async function recognize(gray, psm) {
  const w = await getWorker();
  await w.setParameters({ tessedit_pageseg_mode: psm, user_defined_dpi: '300' });
  const { data } = await w.recognize(pngGray(gray), {}, { blocks: true });
  const words = [];
  for (const b of data.blocks || []) for (const p of b.paragraphs) for (const l of p.lines) for (const wd of l.words) words.push(wd);
  return words;
}

export function decode(file) {
  return jpeg.decode(readFileSync(file), { useTArray: true, formatAsRGBA: true });
}

export async function readFile(file, data) {
  return readScreenshot(decode(file), data, { recognize });
}
