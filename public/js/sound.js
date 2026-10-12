// Optional sounds, made in code with the Web Audio API (no audio files). Off by default.

let ctx = null;
const KEY = 'sj-sound';

export const soundOn = () => {
  try { return localStorage.getItem(KEY) === '1'; } catch { return false; }
};
export function setSound(on) {
  try { localStorage.setItem(KEY, on ? '1' : '0'); } catch {}
  if (on) audio();
}

function audio() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function noise(a, seconds) {
  const buf = a.createBuffer(1, Math.floor(a.sampleRate * seconds), a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = a.createBufferSource();
  src.buffer = buf;
  return src;
}

/** Wooden knock of the gavel: a short thump plus a click. */
export function gavel(strength = 1) {
  if (!soundOn()) return;
  const a = audio();
  const t = a.currentTime;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(180, t);
  o.frequency.exponentialRampToValueAtTime(55, t + 0.18);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.7 * strength, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + 0.3);
  const n = noise(a, 0.05);
  const f = a.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = 2400;
  const ng = a.createGain();
  ng.gain.setValueAtTime(0.35 * strength, t);
  ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
  n.connect(f).connect(ng).connect(a.destination);
  n.start(t);
}

/** A short crowd swell for a perfect 10. */
export function crowd() {
  if (!soundOn()) return;
  const a = audio();
  const t = a.currentTime;
  const n = noise(a, 1.3);
  const f = a.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = 900;
  f.Q.value = 0.6;
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.25, t + 0.35);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 1.25);
  n.connect(f).connect(g).connect(a.destination);
  n.start(t);
}

/** Bright two note chime for success moments. */
export function chime() {
  if (!soundOn()) return;
  const a = audio();
  const t = a.currentTime;
  [660, 990].forEach((hz, i) => {
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = 'triangle';
    o.frequency.value = hz;
    g.gain.setValueAtTime(0.0001, t + i * 0.09);
    g.gain.exponentialRampToValueAtTime(0.25, t + i * 0.09 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.09 + 0.4);
    o.connect(g).connect(a.destination);
    o.start(t + i * 0.09);
    o.stop(t + i * 0.09 + 0.45);
  });
}
