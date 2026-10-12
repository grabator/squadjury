// One optional sound, made in code with the Web Audio API (no audio files): a short referee's
// whistle when you give a 10. Off by default, switched on under Me, Settings.

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

/** Two quick blasts of a pea whistle: a high tone with a fast trill. */
export function whistle() {
  if (!soundOn()) return;
  try {
    const a = audio();
    const t0 = a.currentTime;
    for (const [start, len] of [[0, 0.16], [0.22, 0.32]]) {
      const osc = a.createOscillator();
      const trill = a.createOscillator();
      const depth = a.createGain();
      const gain = a.createGain();
      osc.type = 'sine';
      osc.frequency.value = 2900;
      trill.frequency.value = 38;
      depth.gain.value = 140;
      trill.connect(depth).connect(osc.frequency);
      gain.gain.setValueAtTime(0, t0 + start);
      gain.gain.linearRampToValueAtTime(0.12, t0 + start + 0.02);
      gain.gain.setValueAtTime(0.12, t0 + start + len - 0.04);
      gain.gain.linearRampToValueAtTime(0, t0 + start + len);
      osc.connect(gain).connect(a.destination);
      osc.start(t0 + start); trill.start(t0 + start);
      osc.stop(t0 + start + len); trill.stop(t0 + start + len);
    }
  } catch {}
}
