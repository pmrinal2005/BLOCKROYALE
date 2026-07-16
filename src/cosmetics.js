// ============================================================
// Cosmetic catalog + player save (Section 2 & 5).
// Skins = pure color/material swaps on the SAME box geometry.
// Accessories = one extra box mesh from a tiny shared pool.
// Nothing here adds per-skin geometry => cosmetics are free.
// ============================================================

// Body skins: just a set of colors mapped onto the shared rig.
// { body, limbs, head } are hex ints usable directly by three.
export const SKINS = [
  { id: 'classic',  name: 'Blocky',    price: 0,   body: 0x4fc3f7, limbs: 0x3aa0d8, head: 0xffe0b2 },
  { id: 'lava',     name: 'Lava',      price: 150, body: 0xff5722, limbs: 0xd84315, head: 0xffab40 },
  { id: 'zombie',   name: 'Zombie',    price: 200, body: 0x7cb342, limbs: 0x558b2f, head: 0x9ccc65 },
  { id: 'cake',     name: 'Cake',      price: 250, body: 0xff8fc7, limbs: 0xf06292, head: 0xfff3e0 },
  { id: 'robot',    name: 'Robot',     price: 300, body: 0x90a4ae, limbs: 0x607d8b, head: 0xcfd8dc },
  { id: 'gold',     name: 'Golden',    price: 500, body: 0xffd23f, limbs: 0xd9a91d, head: 0xfff59d },
  { id: 'shadow',   name: 'Shadow',    price: 400, body: 0x37474f, limbs: 0x263238, head: 0x546e7a },
  { id: 'mint',     name: 'Minty',     price: 180, body: 0x34d399, limbs: 0x10b981, head: 0xd1fae5 },
  { id: 'grape',    name: 'Grape',     price: 220, body: 0xa855f7, limbs: 0x7c3aed, head: 0xe9d5ff },
  { id: 'candy',    name: 'Bubblegum', price: 260, body: 0xff5ea2, limbs: 0xe0367e, head: 0xffe0f0 },
];

// Accessories (Task #2): every hat is now a STYLIZED LOW-POLY 3D MODEL built
// from a handful of primitive pieces (box / cylinder / cone), instead of a
// single flat placeholder box. To keep the 32-player lobby cheap (Section 7),
// all hat pieces are drawn from a few shared InstancedMeshes keyed by geometry
// type (see HatPool in character.js) — so a fully-detailed crown costs the same
// handful of draw calls whether 1 or 32 players wear one.
//
// A hat = { id, name, price, color (legacy/swatch tint), parts: [ piece, ... ] }.
// Each piece is authored in the head-local frame (origin at the TOP of the head
// cube, +Y up, +Z forward = the avatar's facing) so it tumbles/flips correctly:
//   geo   : 'box' | 'cyl' | 'cone'
//   size  : box -> [sx,sy,sz]; cyl/cone -> [radius, height, radialSegs?]
//   pos   : [x,y,z] local offset of the piece centre
//   rot   : [rx,ry,rz] optional local euler (radians)
//   color : hex tint for that piece
// `color:null` on the hat itself => the "None" option (no mesh at all).
export const HATS = [
  { id: 'none', name: 'None', price: 0, color: null, parts: [] },

  // Baseball Cap: rounded dome crown (short wide cylinder) + a flat forward brim.
  {
    id: 'cap', name: 'Baseball Cap', price: 80, color: 0xef4444,
    parts: [
      { geo: 'cyl', size: [0.42, 0.30, 10], pos: [0, 0.15, 0],           color: 0xef4444 },
      { geo: 'box', size: [0.5, 0.06, 0.10], pos: [0, 0.05, 0.04],       color: 0xd12f2f }, // headband
      { geo: 'box', size: [0.46, 0.05, 0.40], pos: [0, 0.06, 0.42],      color: 0xc62828 }, // brim
      { geo: 'box', size: [0.10, 0.10, 0.10], pos: [0, 0.32, 0],         color: 0xfff3e0 }, // button
    ],
  },

  // Top Hat: tall cylindrical crown + wide flat brim + a satin band.
  {
    id: 'top', name: 'Top Hat', price: 160, color: 0x1a2140,
    parts: [
      { geo: 'box', size: [0.62, 0.05, 0.62], pos: [0, 0.02, 0],         color: 0x11162e }, // brim
      { geo: 'cyl', size: [0.30, 0.62, 12], pos: [0, 0.35, 0],           color: 0x1a2140 }, // crown
      { geo: 'cyl', size: [0.315, 0.10, 12], pos: [0, 0.14, 0],          color: 0xc0392b }, // red band
      { geo: 'cyl', size: [0.32, 0.05, 12], pos: [0, 0.66, 0],           color: 0x232a52 }, // top rim
    ],
  },

  // Crown: a golden band ring + five triangular spikes + jewel accents.
  {
    id: 'crown', name: 'Crown', price: 350, color: 0xffd23f,
    parts: [
      { geo: 'cyl', size: [0.34, 0.22, 12], pos: [0, 0.11, 0],           color: 0xffd23f }, // band
      // five points around the band
      { geo: 'cone', size: [0.10, 0.34, 4], pos: [0, 0.34, 0.30],        color: 0xffe066 },
      { geo: 'cone', size: [0.10, 0.30, 4], pos: [0.28, 0.32, 0.10],     color: 0xffe066 },
      { geo: 'cone', size: [0.10, 0.30, 4], pos: [-0.28, 0.32, 0.10],    color: 0xffe066 },
      { geo: 'cone', size: [0.10, 0.30, 4], pos: [0.20, 0.32, -0.24],    color: 0xffe066 },
      { geo: 'cone', size: [0.10, 0.30, 4], pos: [-0.20, 0.32, -0.24],   color: 0xffe066 },
      { geo: 'box',  size: [0.09, 0.09, 0.09], pos: [0, 0.13, 0.34],     color: 0xe53935, rot: [0, 0, 0.78] }, // ruby
      { geo: 'box',  size: [0.08, 0.08, 0.08], pos: [0.24, 0.13, -0.18], color: 0x1e88e5, rot: [0, 0, 0.78] }, // sapphire
      { geo: 'box',  size: [0.08, 0.08, 0.08], pos: [-0.24, 0.13, -0.18],color: 0x1e88e5, rot: [0, 0, 0.78] },
    ],
  },

  // Party Cone: a tall cone in bright candy colours + a pom-pom on top.
  {
    id: 'horn', name: 'Party Cone', price: 120, color: 0x22d3ee,
    parts: [
      { geo: 'cone', size: [0.34, 0.78, 12], pos: [0, 0.40, 0],          color: 0x22d3ee },
      { geo: 'cyl',  size: [0.20, 0.05, 12], pos: [0, 0.44, 0],          color: 0xff5ea2, rot: [0, 0, 0] }, // stripe
      { geo: 'box',  size: [0.18, 0.18, 0.18], pos: [0, 0.82, 0],        color: 0xffe066 }, // pom-pom
    ],
  },

  // Antenna: a slim stalk + a glowing bobble ball on top (bug/robot vibe).
  {
    id: 'antenna', name: 'Antenna', price: 140, color: 0xff5ea2,
    parts: [
      { geo: 'cyl', size: [0.045, 0.62, 6], pos: [0, 0.32, 0],           color: 0x37474f }, // stalk
      { geo: 'box', size: [0.16, 0.16, 0.16], pos: [0, 0.68, 0],         color: 0xff5ea2, rot: [0.6, 0.6, 0] }, // bobble
      { geo: 'cyl', size: [0.12, 0.06, 8], pos: [0, 0.03, 0],            color: 0x263238 }, // base clip
    ],
  },
];

// Movement trails (Section 5). Each trail is a fully-instanced particle
// effect (see TrailSystem in trails.js) — NO new geometry per player, so
// they stay free to render across a 32-player lobby (Section 7).
//
// Every trail carries a distinct visual RECIPE so they look and move
// uniquely (Task #4):
//   color/color2  : primary + secondary hues (lerped over particle life)
//   emitPerSec    : particles/sec while running (scaled by speed)
//   burst         : extra particles injected on a jump/dive (flashy pop)
//   size          : base particle size (units)
//   life          : particle lifetime (s)
//   gravity       : vertical accel (units/s^2) — >0 rises, <0 falls
//   drag          : horizontal velocity damping per sec
//   spin          : self-rotation speed (rad/s) for sparkle/shard sheen
//   spread        : sideways scatter of the emit velocity
//   shape         : 'cube' | 'spark' | 'ember' | 'shard' | 'ribbon'
//   rainbow       : cycle hue over life instead of color->color2 lerp
//   glow          : additive blending (bright, self-lit look)
// color === null => trail OFF (the "None" option).
export const TRAILS = [
  { id: 'none',    name: 'None',      price: 0,   color: null },
  {
    id: 'spark',   name: 'Sparkle',   price: 100,
    color: 0xffe27a, color2: 0xffb300, shape: 'spark', glow: true,
    emitPerSec: 34, burst: 12, size: 0.15, life: 0.55,
    gravity: 7, drag: 2.2, spin: 9, spread: 1.1,
  },
  {
    id: 'fire',    name: 'Fire',      price: 200,
    color: 0xfff3a0, color2: 0xd81b1b, shape: 'ember', glow: true,
    emitPerSec: 42, burst: 16, size: 0.24, life: 0.6,
    gravity: 5.5, drag: 1.4, spin: 3, spread: 0.7,
  },
  {
    id: 'ice',     name: 'Frost',     price: 200,
    color: 0xffffff, color2: 0x4fc3f7, shape: 'shard', glow: true,
    emitPerSec: 30, burst: 14, size: 0.2, life: 0.85,
    gravity: -6, drag: 2.8, spin: 7, spread: 0.9,
  },
  {
    id: 'rainbow', name: 'Rainbow',   price: 450,
    color: 0xff5ea2, shape: 'ribbon', glow: true, rainbow: true,
    emitPerSec: 52, burst: 20, size: 0.22, life: 0.7,
    gravity: 2.5, drag: 1.0, spin: 2, spread: 0.5,
  },
  {
    id: 'bubble',  name: 'Bubbles',   price: 260,
    color: 0xbdefff, color2: 0x9fe0ff, shape: 'cube', glow: false,
    emitPerSec: 22, burst: 10, size: 0.26, life: 1.0,
    gravity: 9, drag: 3.0, spin: 1.5, spread: 1.3,
  },
  {
    id: 'shadow',  name: 'Void',      price: 360,
    color: 0x9b6bff, color2: 0x2b1152, shape: 'ember', glow: true,
    emitPerSec: 38, burst: 16, size: 0.3, life: 0.7,
    gravity: 3.5, drag: 1.6, spin: 4, spread: 0.6,
  },
  {
    id: 'gold',    name: 'Gold Rush', price: 500,
    color: 0xfff6c0, color2: 0xffb300, shape: 'spark', glow: true,
    emitPerSec: 48, burst: 22, size: 0.18, life: 0.65,
    gravity: 6, drag: 2.0, spin: 11, spread: 1.0,
  },
];

const SAVE_KEY = 'blockroyale_save_v1';

const DEFAULT_SAVE = {
  name: '',
  coins: 100,
  xp: 0,
  level: 1,
  stats: { matches: 0, wins: 0, top3: 0, crowns: 0, rounds: 0 },
  owned: { skins: ['classic'], hats: ['none'], trails: ['none'] },
  equipped: { skin: 'classic', hat: 'none', trail: 'none' },
  settings: { sfx: true, music: true },
};

export function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return structuredClone(DEFAULT_SAVE);
    const s = JSON.parse(raw);
    // shallow-merge to survive schema additions
    return {
      ...structuredClone(DEFAULT_SAVE), ...s,
      stats: { ...DEFAULT_SAVE.stats, ...(s.stats || {}) },
      owned: { ...DEFAULT_SAVE.owned, ...(s.owned || {}) },
      equipped: { ...DEFAULT_SAVE.equipped, ...(s.equipped || {}) },
      settings: { ...DEFAULT_SAVE.settings, ...(s.settings || {}) },
    };
  } catch {
    return structuredClone(DEFAULT_SAVE);
  }
}

export function writeSave(save) {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch { /* ignore quota */ }
}

export function xpForLevel(level) { return 300 + (level - 1) * 150; }

export function grantRewards(save, { coins = 0, xp = 0 }) {
  save.coins += coins;
  save.xp += xp;
  let leveled = 0;
  while (save.xp >= xpForLevel(save.level)) {
    save.xp -= xpForLevel(save.level);
    save.level++;
    leveled++;
  }
  writeSave(save);
  return leveled;
}

export function getSkin(id) { return SKINS.find(s => s.id === id) || SKINS[0]; }
export function getHat(id)  { return HATS.find(h => h.id === id)  || HATS[0]; }
export function getTrail(id){ return TRAILS.find(t => t.id === id)|| TRAILS[0]; }

// ------------------------------------------------------------
// Hat locker previews (Task #2): render a crisp, stylized 2D SVG icon for
// each hat that mirrors its 3D model, so the Locker cards show a real visual
// of the hat instead of a flat colour square. SVG is inline + resolution-
// independent + zero extra assets (Section 7: stays lightweight). Each icon
// is hand-drawn to match the corresponding 3D piece silhouette.
// ------------------------------------------------------------
function hex(c) { return '#' + (c & 0xffffff).toString(16).padStart(6, '0'); }

export function hatPreviewSVG(hat) {
  const id = hat && hat.id;
  // shared frame: 64x64 viewBox, hat sits centred with a soft floor shadow.
  const open = `<svg viewBox="0 0 64 64" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" style="display:block">`;
  const shadow = `<ellipse cx="32" cy="55" rx="17" ry="4" fill="rgba(10,15,31,.20)"/>`;
  const close = `</svg>`;

  if (id === 'none' || !hat || hat.color == null) {
    // clear "no hat" glyph: a dashed ring with a slash
    return open +
      `<circle cx="32" cy="32" r="16" fill="none" stroke="#b7c0dd" stroke-width="3" stroke-dasharray="4 4"/>` +
      `<line x1="22" y1="42" x2="42" y2="22" stroke="#b7c0dd" stroke-width="3" stroke-linecap="round"/>` +
      close;
  }

  if (id === 'cap') {
    return open + shadow +
      // dome crown
      `<path d="M16 40 A16 13 0 0 1 48 40 Z" fill="${hex(0xef4444)}"/>` +
      `<path d="M16 40 A16 13 0 0 1 48 40" fill="none" stroke="${hex(0xc62828)}" stroke-width="2"/>` +
      // brim
      `<path d="M30 40 q18 2 20 8 q-14 3 -22 -1 Z" fill="${hex(0xc62828)}"/>` +
      // headband + button
      `<rect x="16" y="38" width="32" height="4" fill="${hex(0xd12f2f)}"/>` +
      `<circle cx="32" cy="20" r="3" fill="#fff3e0"/>` +
      close;
  }

  if (id === 'top') {
    return open + shadow +
      // brim
      `<ellipse cx="32" cy="46" rx="20" ry="5" fill="${hex(0x11162e)}"/>` +
      // crown
      `<rect x="21" y="12" width="22" height="34" rx="2" fill="${hex(0x1a2140)}"/>` +
      `<ellipse cx="32" cy="12" rx="11" ry="3" fill="${hex(0x232a52)}"/>` +
      // red band
      `<rect x="21" y="38" width="22" height="5" fill="${hex(0xc0392b)}"/>` +
      close;
  }

  if (id === 'crown') {
    return open + shadow +
      // band
      `<rect x="17" y="38" width="30" height="12" rx="2" fill="${hex(0xffd23f)}"/>` +
      // five points
      `<path d="M17 40 L22 22 L27 40 Z" fill="${hex(0xffe066)}"/>` +
      `<path d="M25 40 L32 18 L39 40 Z" fill="${hex(0xffe066)}"/>` +
      `<path d="M37 40 L42 22 L47 40 Z" fill="${hex(0xffe066)}"/>` +
      // jewels
      `<circle cx="24" cy="44" r="2.4" fill="${hex(0x1e88e5)}"/>` +
      `<circle cx="32" cy="44" r="2.8" fill="${hex(0xe53935)}"/>` +
      `<circle cx="40" cy="44" r="2.4" fill="${hex(0x1e88e5)}"/>` +
      // point tips
      `<circle cx="22" cy="22" r="2" fill="#fff"/>` +
      `<circle cx="32" cy="18" r="2.2" fill="#fff"/>` +
      `<circle cx="42" cy="22" r="2" fill="#fff"/>` +
      close;
  }

  if (id === 'horn') {
    return open + shadow +
      // cone
      `<path d="M32 12 L46 48 L18 48 Z" fill="${hex(0x22d3ee)}"/>` +
      // stripe
      `<path d="M25 34 L39 34 L41 40 L23 40 Z" fill="${hex(0xff5ea2)}"/>` +
      // pom-pom
      `<circle cx="32" cy="12" r="4" fill="${hex(0xffe066)}"/>` +
      close;
  }

  if (id === 'antenna') {
    return open + shadow +
      // base clip
      `<ellipse cx="32" cy="46" rx="10" ry="4" fill="${hex(0x263238)}"/>` +
      // stalk
      `<rect x="30.5" y="20" width="3" height="26" rx="1.5" fill="${hex(0x37474f)}"/>` +
      // bobble
      `<circle cx="32" cy="17" r="6" fill="${hex(0xff5ea2)}"/>` +
      `<circle cx="30" cy="15" r="2" fill="#fff" opacity=".7"/>` +
      close;
  }

  // fallback: a simple tinted cap silhouette
  return open + shadow +
    `<path d="M16 42 A16 14 0 0 1 48 42 Z" fill="${hex(hat.color)}"/>` +
    close;
}
