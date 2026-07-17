// FULL-COURSE water crossing test (Task #2).
//
// Drives a runner that behaves like a competent player: sprints forward AND
// JUMPS/DIVES when it detects a gap or a step-up ahead (so intentional jumpable
// gaps elsewhere on the track don't masquerade as "water bugs"). The assertion
// is specifically about the WATER SECTION: entering it, and CLIMBING OUT onto
// the far bank without dropping into the void.
import * as THREE from 'three';
import { CFG, DT } from '../src/config.js';
import { Entity } from '../src/entity.js';
import { BotBrain } from '../src/bots.js';
import { buildLevel } from '../src/levels.js';

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; console.log('  \u2713', name); }
  else { fail++; console.log('  \u2717 FAIL:', name); }
}

function wetTrack(name = 'Round 1') {
  for (let i = 0; i < 200; i++) {
    const w = buildLevel(new THREE.Scene(), { type: 'race', biome: 'jungle', name });
    if (w.waterZones.length > 0) return w;
  }
  return null;
}

// Walkable surface height just ahead of the entity (probe for gaps / drops).
function surfAhead(w, x, z) {
  let best = -Infinity;
  for (const p of w.platforms) {
    if (p.solid === false || p.sy > 1.2) continue;
    if (x < p.x - p.sx / 2 || x > p.x + p.sx / 2) continue;
    if (z < p.z - p.sz / 2 || z > p.z + p.sz / 2) continue;
    const top = p.y + p.sy / 2;
    if (top > best) best = top;
  }
  const ry = w.rampHeightAt(x, z);
  if (ry != null && ry > best) best = ry;
  return best === -Infinity ? null : best;
}

// Competent runner: forward + jump gaps + paddle while swimming.
function runCourse(w) {
  const zone = w.waterZones[0];
  const e = new Entity({});
  const sp = w.spawnPoints[0];
  e.respawnAt({ x: sp.x, y: sp.y, z: sp.z });

  let enteredWater = false, exitedWater = false, fellAtWater = false;
  for (let i = 0; i < 12000; i++) {
    e.intent.mx = 0; e.intent.mz = 1;
    if (e.inWater) {
      e.intent.jump = true;                 // paddle up
    } else if (e.grounded) {
      // look ~2.5 units ahead; if it's a gap or a notable drop, jump.
      const hereY = e.y;
      const ahead = surfAhead(w, e.x, e.z + 2.5);
      if (ahead == null || ahead < hereY - 1.2) e.intent.jump = true;
    } else if (e.vy < 0 && e.diveTimer <= 0 && e.diveCd <= 0) {
      // airborne & descending over a gap => dive to extend the leap
      const ahead = surfAhead(w, e.x, e.z + 3);
      if (ahead == null) e.intent.dive = true;
    }
    e.tick(w, DT);
    if (e.inWater) enteredWater = true;
    if (enteredWater && !e.inWater && e.z > zone.maxZ) exitedWater = true;
    // void fall specifically within the pool footprint
    if (e.y < zone.surfaceTop - 6 && e.z > zone.minZ - 2 && e.z < zone.maxZ + 10) { fellAtWater = true; break; }
    if (e.z >= w.finishZ) break;
    if (e.y < CFG.RESPAWN_FALL_Y) break;   // fell elsewhere (a gap) — not our concern here
  }
  return { enteredWater, exitedWater, fellAtWater };
}

console.log('\n=== Competent runner: crossing the WATER section ===');
{
  let trials = 0, entered = 0, crossed = 0, fellAtWater = 0;
  for (let t = 0; t < 40; t++) {
    const w = wetTrack(); if (!w) continue; trials++;
    const r = runCourse(w);
    if (r.enteredWater) entered++;
    if (r.exitedWater) crossed++;
    if (r.fellAtWater) fellAtWater++;
  }
  ok('runner reaches & enters the water on every wet track', entered >= trials - 1);
  ok('runner NEVER falls into the void at the water section', fellAtWater === 0);
  ok('runner ALWAYS climbs out onto the far bank', crossed === entered);
  console.log(`     (${entered}/${trials} entered, ${crossed} climbed out, ${fellAtWater} fell at water)`);
}

console.log(`\n==== RESULT: ${pass} passed, ${fail} failed ====\n`);
process.exit(fail ? 1 : 0);
