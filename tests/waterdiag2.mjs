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

// Find a track where the forward sprinter falls, then dump the ticks around the fall.
for (let attempt = 0; attempt < 60; attempt++) {
  const w = wetTrack();
  const e = new Entity({});
  const sp = w.spawnPoints[0];
  e.respawnAt({ x: sp.x, y: sp.y, z: sp.z });
  const log = [];
  let fellZ = null;
  for (let i = 0; i < 8000; i++) {
    e.intent.mx = 0; e.intent.mz = 1;
    e.tick(w, DT);
    const ry = w.rampHeightAt(e.x, e.z);
    log.push(`t=${i} z=${e.z.toFixed(2)} y=${e.y.toFixed(2)} vy=${e.vy.toFixed(2)} vz=${e.vz.toFixed(2)} grnd=${e.grounded} rampAt=${ry==null?'null':ry.toFixed(2)}`);
    if (log.length > 40) log.shift();
    if (e.y < -8) { fellZ = e.z; break; }
    if (e.z >= w.finishZ) break;
  }
  if (fellZ != null) {
    console.log(`### Attempt ${attempt}: FELL at z=${fellZ.toFixed(2)}. Last 40 ticks:`);
    console.log(log.join('\n'));
    break;
  }
}
