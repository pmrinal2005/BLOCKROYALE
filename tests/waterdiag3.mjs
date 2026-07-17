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

// Teleport the entity to just before the pool entry, at high forward speed,
// airborne (worst case: sailed in off a crest), and see if it crosses out.
for (let attempt = 0; attempt < 40; attempt++) {
  const w = wetTrack();
  const zone = w.waterZones[0];
  const e = new Entity({});
  // place at pool entry, moving fast forward, slightly airborne
  e.respawnAt({ x: 0, y: zone.surfaceTop + 0.5, z: zone.minZ - 2 });
  e.vz = CFG.MOVE_SPEED; e.vy = 2; e.grounded = false;   // sailing in fast+airborne
  const log = [];
  let result = 'timeout';
  for (let i = 0; i < 3000; i++) {
    e.intent.mx = 0; e.intent.mz = 1;
    // paddle up while swimming (typical player)
    if (e.inWater) e.intent.jump = true;
    e.tick(w, DT);
    const ry = w.rampHeightAt(e.x, e.z);
    log.push(`t=${i} z=${e.z.toFixed(2)} y=${e.y.toFixed(2)} vy=${e.vy.toFixed(2)} vz=${e.vz.toFixed(2)} grnd=${e.grounded} inW=${e.inWater} exA=${(e._waterExitAssist||0).toFixed(2)} rampAt=${ry==null?'null':ry.toFixed(2)}`);
    if (log.length > 60) log.shift();
    if (e.y < -8) { result = 'FELL'; break; }
    if (e.z > zone.maxZ + 5 && e.grounded && e.y > zone.surfaceTop - 1) { result = 'OUT'; break; }
  }
  if (result === 'FELL') {
    console.log(`### Attempt ${attempt}: pool minZ=${zone.minZ.toFixed(2)} maxZ=${zone.maxZ.toFixed(2)} surf=${zone.surfaceTop.toFixed(2)} => ${result}`);
    console.log(log.join('\n'));
    break;
  }
  if (attempt === 39) console.log('no fall reproduced with airborne fast entry (all crossed)');
}
