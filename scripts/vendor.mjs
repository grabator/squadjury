// Copies the OCR engine (tesseract.js, its WebAssembly core and English data) and the QR code maker into
// public/vendor so the browser loads it from our own domain. Runs before dev and deploy.
import { mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const nm = fileURLToPath(new URL('../node_modules/', import.meta.url));
const out = fileURLToPath(new URL('../public/vendor/tesseract/', import.meta.url));
mkdirSync(out + 'core', { recursive: true });
mkdirSync(out + 'lang', { recursive: true });

const files = [
  ['tesseract.js/dist/tesseract.min.js', 'tesseract.min.js'],
  ['tesseract.js/dist/worker.min.js', 'worker.min.js'],
  ['tesseract.js-core/tesseract-core-simd-lstm.wasm.js', 'core/tesseract-core-simd-lstm.wasm.js'],
  ['tesseract.js-core/tesseract-core-lstm.wasm.js', 'core/tesseract-core-lstm.wasm.js'],
  ['@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz', 'lang/eng.traineddata.gz'],
];
for (const [from, to] of files) {
  if (!existsSync(nm + from)) throw new Error(`missing ${from}, run npm install`);
  copyFileSync(nm + from, out + to);
}
// QR codes for the YouTube image (MIT, Kazuhiko Arase).
copyFileSync(nm + 'qrcode-generator/dist/qrcode.mjs', fileURLToPath(new URL('../public/vendor/qrcode.mjs', import.meta.url)));
console.log('vendor: tesseract and qrcode copied to public/vendor');
