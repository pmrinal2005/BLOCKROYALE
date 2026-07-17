// Focused reproduction of the two reported bugs, against the sim modules.
import * as THREE from 'three';
import { CFG, DT } from '../src/config.js';
import { Entity } from '../src/entity.js';
import { checkMeleeHits } from '../src/physics.js';
import { buildLevel } from '../src/levels.js';

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; console.log('  \u2713', name); }
  else { fail++; console.log('  \u2717 FAIL:', name); }
}

const flat = {
  platforms: [{ x: 0, y: -1, z: 0, sx: 400, sy: 2, sz: 400, solid: true }],
  obstacles: [], spawnPoints: [{ x: 0, y: 0.2, z: 0 }],
  finishZ: 9999, startZ: -10, laneHalf: 50,
  rampHeightAt: () => null, waterAt: () => null, updateObstacles() {}, clear() {},
};

console.log('\n=== BUG #1: human can punch a nearby player (various relative positions) ===');
{
  // Attacker stands still (no movement), target is directly in front within reach.
  function trial(dz, dx, movedBefore, aimAssist = false) {
    const a = new Entity({ name: 'You', isBot: false });
    const b = new Entity({ name: 'Target', isBot: true });
    a.meleeAimAssist = aimAssist;
    a.respawnAt({ x: 0, y: 0.2, z: 0 });
    b.respawnAt({ x: dx, y: 0.2, z: dz });
    a.grounded = b.grounded = true;
    // If a human was standing still and never moved, yaw defaults to 0 (=> +Z).
    if (movedBefore) { a.intent.mx = 0; a.intent.mz = 1; a.tick(flat, DT); }
    // request a punch
    a.intent.melee = true;
    a.tick(flat, DT);
    // advance ticks until the active window opens and resolve hits
    let hit = false;
    for (let i = 0; i < 12; i++) {
      checkMeleeHits([a, b], (att, h) => { if (att === a && h) hit = true; });
      a.tick(flat, DT); b.tick(flat, DT);
    }
    return hit;
  }
  ok('punch hits target 1.2u directly ahead (+Z), attacker idle', trial(1.2, 0, false));
  ok('punch hits target 1.2u ahead after moving forward', trial(1.2, 0, true));
  ok('punch hits target slightly off-axis (1.0 fwd, 0.5 side)', trial(1.0, 0.5, false));
  // HUMAN aim-assist: nearest player in reach is hit regardless of facing —
  // this is the actual fix for "I can't punch the player next to me".
  ok('HUMAN aim-assist: hits target to the SIDE (+X) while facing +Z', trial(0, 1.2, true, true));
  ok('HUMAN aim-assist: hits target BEHIND while facing +Z', trial(-1.2, 0, true, true));
  ok('HUMAN aim-assist: hits target when idle & un-aimed', trial(1.0, 1.0, false, true));
  // A target clearly OUT OF REACH must never be hit — aim-assist auto-acquires
  // the nearest rival in ANY direction (that IS the "punch the player next to
  // me" fix, so a target behind you at close range SHOULD now connect), but it
  // must still respect the MELEE_RANGE reach so it never grabs someone across
  // the map. (Aim-assist is on by default for every entity now.)
  const a = new Entity({ isBot: false }); const b = new Entity({ isBot: true });
  a.respawnAt({ x: 0, y: 0.2, z: 0 }); b.respawnAt({ x: 0, y: 0.2, z: -8 });
  a.grounded = b.grounded = true; a.intent.melee = true; a.tick(flat, DT);
  let behindHit = false;
  for (let i = 0; i < 12; i++) { checkMeleeHits([a, b], (att, h) => { if (h) behindHit = true; }); a.tick(flat, DT); b.tick(flat, DT); }
  ok('punch does NOT hit an out-of-reach target (8u away)', !behindHit);
}

console.log('\n=== BUG #2: water exit — swimmer climbs out onto the bank, does not fall through ===');
{
  // Build wet race tracks until we get one with water, then drive a bot through.
  let world = null;
  for (let i = 0; i < 60 && !world; i++) {
    const w = buildLevel(new THREE.Scene(), { type: 'race', biome: 'jungle', name: 'Round 1' });
    if (w.waterZones.length > 0) world = w;
  }
  ok('found a wet race track to test', !!world);
  if (world) {
    const zone = world.waterZones[0];
    const exitZ = zone.maxZ;          // far edge of the pool = start of exit bank
    const surf = zone.surfaceTop;
    // Place a swimmer in the middle of the pool at the waterline, drive +Z out.
    const e = new Entity({ name: 'Swimmer', isBot: false });
    e.respawnAt({ x: 0, y: surf - 0.3, z: (zone.minZ + zone.maxZ) / 2 });
    let fellThrough = false, exited = false, minYAfterExit = Infinity;
    for (let i = 0; i < 600; i++) {
      e.intent.mx = 0; e.intent.mz = 1;      // swim/run straight toward exit
      // help the swimmer surface by paddling up while still in water
      if (e.inWater) e.intent.jump = (i % 3 === 0);
      e.tick(world, DT);
      if (!e.inWater && e.z > exitZ + 0.5) {
        exited = true;
        minYAfterExit = Math.min(minYAfterExit, e.y);
        // once safely a few units past the bank, stop
        if (e.z > exitZ + 4) break;
      }
      if (e.y < -10) { fellThrough = true; break; }
    }
    ok('swimmer reaches the exit bank and leaves the water', exited);
    ok('swimmer does NOT fall through into the void after exiting', !fellThrough);
    ok('swimmer stays near bank height after exit (y within ~1u of surface)',
       exited && minYAfterExit > surf - 1.2);
    console.log(`     [debug] surf=${surf.toFixed(2)} exitZ=${exitZ.toFixed(2)} finalY=${e.y.toFixed(2)} finalZ=${e.z.toFixed(2)} fell=${fellThrough}`);
  }
}

console.log(`\n==== RESULT: ${pass} passed, ${fail} failed ====\n`);
process.exit(fail ? 1 : 0);
