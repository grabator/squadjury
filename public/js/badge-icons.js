// Badge icons: thin lines in the app's style, each with its own shape, and a small yellow card
// as the accent. Locked badges are drawn grey by CSS.

const card = (x, y, r = -12) => `<rect class="acc" x="${x}" y="${y}" width="5" height="7" rx="1" transform="rotate(${r} ${x + 2.5} ${y + 3.5})"/>`;
const svg = (body) => `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

export const BADGE_ICONS = {
  'first-verdict': svg(`<rect x="6" y="3.5" width="12" height="17" rx="2"/><path d="M11 9l2-1.5V16M10.5 16h4"/>${card(16, 2)}`),
  regular: svg(`<rect x="4" y="6" width="10" height="14" rx="2"/><path d="M8 4h10a2 2 0 0 1 2 2v12"/>${card(15.5, 14, 10)}`),
  seasoned: svg(`<rect x="3" y="7" width="9" height="13" rx="1.6" transform="rotate(-12 7.5 13.5)"/><rect x="8" y="5" width="9" height="13" rx="1.6"/><rect x="12.5" y="7" width="9" height="13" rx="1.6" transform="rotate(12 17 13.5)"/>`),
  'first-whistle': svg(`<path d="M3 10h9.5a5 5 0 1 1-4.7 6.6L7 14H4a1 1 0 0 1-1-1z"/><circle cx="13" cy="15" r="1.4"/><path d="M14 10V6M17 7.5l2-2"/>${card(18, 2.5, 14)}`),
  'tough-judge': svg(`<path d="M5 19h9M9.5 19v-3"/><path d="M6 9l6-6 4 4-6 6z"/><path d="M14 11l6 6"/>${card(2.5, 3, -18)}`),
  'generous-judge': svg(`<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>${card(17, 2.5, 12)}`),
  'streak-5': svg(`<path d="M12 21a6 6 0 0 0 6-6c0-4-3-6-4-9-1 2-2 3-3.5 3.5C9 8 9 6.5 9.5 5 7 7 6 10.5 6 15a6 6 0 0 0 6 6z"/><path d="M12 21a2.5 2.5 0 0 1-2.5-2.5c0-1.8 1.5-2.5 2.5-4.5 1 2 2.5 2.7 2.5 4.5A2.5 2.5 0 0 1 12 21z"/>`),
  'streak-10': svg(`<path d="M8.5 21A4.5 4.5 0 0 1 4 16.5c0-3.5 2.5-5 3-8 1.5 2 3.5 3.5 3.5 7.5"/><path d="M14.5 21a5 5 0 0 0 5-5c0-3.5-2.5-5-3.4-7.6-.9 1.8-1.8 2.6-3 3-.4-1.2-.4-2.4 0-3.6-2 1.7-3 4.6-3 8.2a5 5 0 0 0 4.4 5z"/>`),
  'on-the-pitch': svg(`<path d="M8 3l-5 3 2 4 2-1v11h10V9l2 1 2-4-5-3c0 1.7-1.3 3-3 3S8 4.7 8 3z"/>${card(9.5, 11, 0)}`),
  'top-10': svg(`<path d="M3 20h18M5 20v-6h4v6M10 20V9h4v11M15 20v-8h4v8"/><path d="M11.2 5.5l.8-2 .8 2"/>`),
  'top-10-x3': svg(`<path d="M6 4l1.2 2.5 2.8.4-2 2 .5 2.7L6 10.3l-2.5 1.3.5-2.7-2-2 2.8-.4z"/><path d="M18 4l1.2 2.5 2.8.4-2 2 .5 2.7-2.5-1.3-2.5 1.3.5-2.7-2-2 2.8-.4z"/><path d="M12 12l1.2 2.5 2.8.4-2 2 .5 2.7-2.5-1.3-2.5 1.3.5-2.7-2-2 2.8-.4z"/>`),
  'number-one': svg(`<path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 6H4v1.5A3.5 3.5 0 0 0 7.5 11M17 6h3v1.5a3.5 3.5 0 0 1-3.5 3.5M12 14v3M8 20h8M9.5 17h5v3h-5z"/>${card(10, 4.5, 0)}`),
  'crowd-favourite': svg(`<circle cx="12" cy="8" r="3"/><circle cx="5.5" cy="10" r="2.2"/><circle cx="18.5" cy="10" r="2.2"/><path d="M6.5 20a5.5 5.5 0 0 1 11 0M2 19a3.5 3.5 0 0 1 4.5-3.3M22 19a3.5 3.5 0 0 0-4.5-3.3"/>`),
  'sharp-eye': svg(`<path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="3.2"/><path d="M12 2v2M12 20v2"/>`),
  oracle: svg(`<circle cx="12" cy="10" r="6.5"/><path d="M7 19h10l-1.5-3h-7z"/><path d="M9.5 8.5a3 3 0 0 1 2.5-1.5"/>${card(15.5, 1.5, 14)}`),
  duelist: svg(`<path d="M4 4l9 9M4 4h4M4 4v4M20 4l-9 9M20 4h-4M20 4v4M7 17l-3 3M17 17l3 3M9 15l-2 2M15 15l2 2"/>`),
  'giant-killer': svg(`<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1"/><path d="M19 5l-5.5 5.5M19 5v3M19 5h-3"/>`),
  recruiter: svg(`<circle cx="9.5" cy="8" r="3.5"/><path d="M3 20a6.5 6.5 0 0 1 13 0M19 8v6M16 11h6"/>${card(17, 15.5, 10)}`),
};

export const LOCK = svg('<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>');
