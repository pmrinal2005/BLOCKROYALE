import * as THREE from 'three';
import { buildLevel } from '../src/levels.js';

function wetTrack() {
  for (let i = 0; i < 200; i++) {
    const w = buildLevel(new THREE.Scene(), { type: 'race', biome: 'jungle', name: 'Round 1' });
    if (w.waterZones.length > 0) return w;
  }
  return null;
}
const w = wetTrack();
// Sample walkable surface height along z at x=0 (finding both platforms tops and ramps)
function surfAt(x, z) {
  let best = -Infinity;
  for (const p of w.platforms) {
    if (p.solid === false) continue;
    if (x < p.x - p.sx/2 || x > p.x + p.sx/2) continue;
    if (z < p.z - p.sz/2 || z > p.z + p.sz/2) continue;
    const top = p.y + p.sy/2;
    if (p.sy > 1.2) continue; // skip walls
    if (top > best) best = top;
  }
  const ry = w.rampHeightAt(x, z);
  if (ry != null && ry > best) best = ry;
  return best === -Infinity ? null : best;
}
// list ALL ramps overlapping x=0 in z[112..128]
console.log('--- RAMPS overlapping x=0, z in [112,128] ---');
for (const r of w.ramps) {
  if (r.solid === false) continue;
  if (0 < r.x - r.sx/2 || 0 > r.x + r.sx/2) continue;
  if (r.zMax < 112 || r.zMin > 128) continue;
  const yA = r.yRef + r.slopeZ*(r.zMin - r.zRef);
  const yB = r.yRef + r.slopeZ*(r.zMax - r.zRef);
  console.log(`ramp z[${r.zMin.toFixed(1)}..${r.zMax.toFixed(1)}] y ${yA.toFixed(2)}->${yB.toFixed(2)} slope=${r.slopeZ.toFixed(3)}`);
}
console.log('--- PLATFORMS (non-wall) overlapping x=0, z in [112,128] ---');
for (const p of w.platforms) {
  if (p.solid === false) continue;
  if (0 < p.x - p.sx/2 || 0 > p.x + p.sx/2) continue;
  if (p.z + p.sz/2 < 112 || p.z - p.sz/2 > 128) continue;
  console.log(`plat z[${(p.z-p.sz/2).toFixed(1)}..${(p.z+p.sz/2).toFixed(1)}] top=${(p.y+p.sy/2).toFixed(2)} sy=${p.sy.toFixed(2)}${p.sy>1.2?' WALL':''}`);
}
