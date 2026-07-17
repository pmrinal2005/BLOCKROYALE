import * as THREE from 'three';
import { CFG, DT } from './src/config.js';
import { Entity } from './src/entity.js';
import { buildLevel } from './src/levels.js';
for (let t = 0; t < 2000; t++) {
  const w = buildLevel(new THREE.Scene(), { type:'race', biome:'jungle', name:'Round 1' });
  if (!w.waterZones.length) continue;
  const zone = w.waterZones[0];
  const e = new Entity({});
  e.respawnAt({ x:0, y: zone.surfaceTop+0.2, z: zone.minZ-4 });
  let entered=false, fell=false;
  for (let i=0;i<2500;i++){
    e.intent.mx=0; e.intent.mz=1; if (e.inWater) e.intent.jump=true;
    e.tick(w, DT); if (e.inWater) entered=true;
    if (e.y<-8){fell=true;break;}
    if (entered && !e.inWater && e.z>zone.maxZ+2.5 && e.grounded && e.y>zone.surfaceTop-0.9)break;
  }
  if (fell) {
    // list all center-lane spans (plat+ramp) sorted, near pool
    const spans=[];
    for (const p of w.platforms) if (p.solid!==false && Math.abs(p.x)<5) spans.push([p.z-p.sz/2,p.z+p.sz/2,'P',(p.y+p.sy/2).toFixed(1)]);
    for (const r of w.ramps) if (r.solid!==false && Math.abs(r.x)<5) spans.push([r.zMin,r.zMax,'R',`${r.yRef.toFixed(1)}`]);
    spans.sort((a,b)=>a[0]-b[0]);
    console.log(`pool z[${zone.minZ.toFixed(1)}..${zone.maxZ.toFixed(1)}]`);
    for (const s of spans) if (s[1]>zone.minZ-25 && s[0]<zone.minZ+5) console.log(`  ${s[2]} z[${s[0].toFixed(1)}..${s[1].toFixed(1)}] y~${s[3]}`);
    break;
  }
}
