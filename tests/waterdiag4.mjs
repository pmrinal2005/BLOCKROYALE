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
const zone = w.waterZones[0];
console.log('POOL minZ=%s maxZ=%s surf=%s', zone.minZ.toFixed(2), zone.maxZ.toFixed(2), zone.surfaceTop.toFixed(2));
// dump exact walkable surface (platforms top + ramps) at x=0 across the pool+bank
function surfAt(x, z) {
  let best = -Infinity, kind='none';
  for (const p of w.platforms) {
    if (p.solid === false) continue;
    if (p.sy > 1.2) continue;
    if (x < p.x - p.sx/2 || x > p.x + p.sx/2) continue;
    if (z < p.z - p.sz/2 || z > p.z + p.sz/2) continue;
    const top = p.y + p.sy/2;
    if (top > best) { best = top; kind='plat'; }
  }
  const ry = w.rampHeightAt(x, z);
  if (ry != null && ry > best) { best = ry; kind='ramp'; }
  return best === -Infinity ? [null,'GAP'] : [best,kind];
}
for (let z = zone.minZ - 3; z <= zone.maxZ + 8; z += 0.5) {
  const [s,k] = surfAt(0, z);
  console.log(z.toFixed(1), ':', s==null?'GAP':s.toFixed(2), k);
}
