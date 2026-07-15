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

// Accessories: hat = box on top of head. 'none' => no mesh.
export const HATS = [
  { id: 'none',    name: 'None',      price: 0,   color: null },
  { id: 'cap',     name: 'Cap',       price: 80,  color: 0xef4444, shape: [0.55, 0.28, 0.55], y: 0.62 },
  { id: 'top',     name: 'Top Hat',   price: 160, color: 0x1a2140, shape: [0.5, 0.55, 0.5],  y: 0.75 },
  { id: 'crown',   name: 'Crown',     price: 350, color: 0xffd23f, shape: [0.62, 0.3, 0.62],  y: 0.62 },
  { id: 'horn',    name: 'Party Cone',price: 120, color: 0x22d3ee, shape: [0.42, 0.6, 0.42], y: 0.78 },
  { id: 'antenna', name: 'Antenna',   price: 140, color: 0xff5ea2, shape: [0.14, 0.7, 0.14], y: 0.85 },
];

// Trail effects on jump/dive (Section 5). color null = off.
export const TRAILS = [
  { id: 'none',   name: 'None',    price: 0,   color: null },
  { id: 'spark',  name: 'Sparkle', price: 100, color: 0xffd23f },
  { id: 'fire',   name: 'Fire',    price: 200, color: 0xff5722 },
  { id: 'ice',    name: 'Frost',   price: 200, color: 0x81d4fa },
  { id: 'rainbow',name: 'Rainbow', price: 450, color: 0xff5ea2 },
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
