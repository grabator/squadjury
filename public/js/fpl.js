// FPL data on the client: players, clubs and fixtures, loaded once per visit.

import { api } from './api.js';

let cache = null;
let loading = null;

export async function loadFpl() {
  if (cache) return cache;
  if (!loading) {
    loading = api('/api/fpl').then((d) => {
      const players = new Map(d.players.map((p) => [p.id, p]));
      const teams = new Map(d.teams.map((t) => [t.id, t]));
      cache = { ...d, byId: players, teamsById: teams };
      return cache;
    });
  }
  return loading;
}

export const POS = { 1: 'GK', 2: 'DEF', 3: 'MID', 4: 'FWD' };
export const POS_LONG = { 1: 'goalkeeper', 2: 'defender', 3: 'midfielder', 4: 'forward' };

/** "TOT (H)" style label for a club in a gameweek (double gameweeks join with a comma). */
export function fixtureLabel(fpl, teamId, gw) {
  const out = [];
  for (const f of fpl.fixtures) {
    if (f.event !== gw) continue;
    if (f.team_h === teamId) out.push(`${fpl.teamsById.get(f.team_a)?.short_name} (H)`);
    else if (f.team_a === teamId) out.push(`${fpl.teamsById.get(f.team_h)?.short_name} (A)`);
  }
  return out.join(', ') || '-';
}

// Primary, secondary and pattern for a generic shirt in club colours.
// Generic shapes only: no club badges, sponsors or official kit designs.
export const CLUB_COLORS = {
  ARS: ['#e2231a', '#ffffff', 'sleeves'],
  AVL: ['#7a1e47', '#95bfe5', 'sleeves'],
  BOU: ['#c8102e', '#111111', 'stripes'],
  BRE: ['#e30613', '#ffffff', 'stripes'],
  BHA: ['#0057b8', '#ffffff', 'stripes'],
  BUR: ['#6c1d45', '#99d6ea', 'sleeves'],
  CHE: ['#034694', '#034694', 'solid'],
  COV: ['#66b2e4', '#ffffff', 'solid'],
  CRY: ['#1b458f', '#c4122e', 'stripes'],
  EVE: ['#003399', '#ffffff', 'solid'],
  FUL: ['#ffffff', '#111111', 'solid'],
  HUL: ['#f5a12d', '#111111', 'stripes'],
  IPS: ['#0044aa', '#ffffff', 'sleeves'],
  LEE: ['#ffffff', '#1d428a', 'solid'],
  LEI: ['#003090', '#fdbe11', 'solid'],
  LIV: ['#c8102e', '#c8102e', 'solid'],
  LUT: ['#f78f1e', '#002d62', 'solid'],
  MCI: ['#6cabdd', '#ffffff', 'solid'],
  MUN: ['#da291c', '#111111', 'solid'],
  NEW: ['#111111', '#ffffff', 'stripes'],
  NFO: ['#dd0000', '#ffffff', 'solid'],
  SHU: ['#ee2737', '#ffffff', 'stripes'],
  SOU: ['#d71920', '#ffffff', 'stripes'],
  SUN: ['#eb172b', '#ffffff', 'stripes'],
  TOT: ['#ffffff', '#132257', 'solid'],
  WHU: ['#7a263a', '#1bb1e7', 'sleeves'],
  WOL: ['#fdb913', '#231f20', 'solid'],
};
const GK_COLORS = ['#a7e83a', '#1a1a1a', 'solid'];

export function kitFor(fpl, player) {
  if (player?.element_type === 1) return GK_COLORS;
  const short = fpl?.teamsById.get(player?.team)?.short_name;
  return CLUB_COLORS[short] || ['#34445f', '#ffffff', 'solid'];
}

/** SVG markup of a generic shirt with light, folds and a collar. */
export function shirtSvg([main, second, pattern], id) {
  const body = 'M18 4 L8 9 L2 22 L11 26 L14 21 L14 54 L50 54 L50 21 L53 26 L62 22 L56 9 L46 4 Q40 10 32 10 Q24 10 18 4 Z';
  const clip = `sh${id}`, shade = `sd${id}`, side = `sg${id}`;
  let deco = '';
  if (pattern === 'stripes') deco = [18, 30, 42].map((x) => `<rect x="${x}" y="0" width="6" height="56" fill="${second}"/>`).join('');
  if (pattern === 'sleeves') deco = `<path d="M18 4 L8 9 L2 22 L11 26 L14 21 L14 12 Z M46 4 L56 9 L62 22 L53 26 L50 21 L50 12 Z" fill="${second}"/>`;
  const light = ['#ffffff', '#fff'].includes(main.toLowerCase());
  return `<svg viewBox="0 0 64 56" aria-hidden="true"><defs>
    <clipPath id="${clip}"><path d="${body}"/></clipPath>
    <linearGradient id="${shade}" x1="0" y1="0" x2="0.35" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".38"/><stop offset=".45" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".38"/></linearGradient>
    <linearGradient id="${side}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#000" stop-opacity=".28"/><stop offset=".22" stop-color="#000" stop-opacity="0"/><stop offset=".78" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".3"/></linearGradient></defs>
    <g clip-path="url(#${clip})"><path d="${body}" fill="${main}"/>${deco}
    <rect width="64" height="56" fill="url(#${side})"/><rect width="64" height="56" fill="url(#${shade})"/>
    <path d="M14 21 L14 54 M50 21 L50 54" stroke="rgba(0,0,0,.22)" stroke-width="2.5"/>
    <path d="M24 30 Q30 34 27 44 M40 28 Q35 36 39 46" fill="none" stroke="rgba(0,0,0,.12)" stroke-width="1.6"/>
    <path d="M23 5 Q32 14 41 5" fill="none" stroke="${light ? '#c9ced8' : 'rgba(0,0,0,.35)'}" stroke-width="3.2"/></g>
    <path d="${body}" fill="none" stroke="${light ? '#b8bfcc' : 'rgba(0,0,0,.35)'}" stroke-width="1.2"/></svg>`;
}
