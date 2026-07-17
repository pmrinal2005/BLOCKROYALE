import * as THREE from 'three';
import { CFG, DT } from '../src/config.js';
import { Entity } from '../src/entity.js';
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
console.log('POOL zone: minZ=%s maxZ=%s surfaceTop=%s minY=%s',
  zone.minZ.toFixed(2), zone.maxZ.toFixed(2), zone.surfaceTop.toFixed(2), zone.minY.toFixed(2));

const e = new Entity({});
const sp = w.spawnPoints[0];
e.respawnAt({ x: sp.x, y: sp.y, z: sp.z });
let prevGrounded = true;
for (let i = 0; i < 8000; i++) {
  e.intent.mx = 0; e.intent.mz = 1;
  const py = e.y, pz = e.z;
  e.tick(w, DT);
  // log every airborne->fall transition to catch the launch point
  if (prevGrounded && !e.grounded) {
    console.log('LEAVE GROUND t=%d z=%s y=%s vy=%s vz=%s', i, e.z.toFixed(2), e.y.toFixed(2), e.vy.toFixed(2), e.vz.toFixed(2));
  }
  prevGrounded = e.grounded;
  if (e.y < -8) { console.log('>>> FELL VOID at t=%d z=%s y=%s (rampAt=%s)', i, e.z.toFixed(2), e.y.toFixed(2), w.rampHeightAt(e.x, e.z)); break; }
  if (e.z >= w.finishZ) { console.log('reached finish z=%s', e.z.toFixed(2)); break; }
}
