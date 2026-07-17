// Realistic water-exit reproduction (Task #2 real-world bug):
// A player who reaches the END of the water and tries to step back onto the
// solid track. We test the WORST realistic cases the user described:
//   1) Human holds ONLY forward (no paddle-jump) — heavy water drag bleeds
//      speed; must still cross onto the exit bank, never fall through.
//   2) Human swims forward AND paddles up (jump) — should also climb out.
//   3) A BOT driven by the REAL race brain (which does NOT spam jump in water)
//      swims the channel and climbs out.
// A failure = ending below the surface / in the void, or never reaching the
// far bank.
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

function wetTrack() {
  for (let i = 0; i < 80; i++) {
    const w = buildLevel(new THREE.Scene(), { type: 'race', biome: 'jungle', name: 'Round 1' });
    if (w.waterZones.length > 0) return w;
  }
  return null;
}

// Drive an entity from just before the pool to past the exit bank.
// paddleUp: hold JUMP while submerged.  useBrain: let the race brain steer.
function runThrough(w, { isBot = false, paddleUp = false, useBrain = false } = {}) {
  const zone = w.waterZones[0];
  const e = new Entity({ isBot });
  e.respawnAt({ x: 0, y: zone.surfaceTop + 0.2, z: zone.minZ - 4 });
  if (useBrain) { e.brain = new BotBrain(e, w, { type: 'race' }); }
  let entered = false, fell = false, out = false, minYAfterEnter = 1e9;
  for (let i = 0; i < 2500; i++) {
    if (useBrain) {
      e.brain.think(DT, [e]);
      if (paddleUp && e.inWater) e.intent.jump = true;
    } else {
      e.intent.mx = 0; e.intent.mz = 1;                 // hold forward only
      if (paddleUp && e.inWater) e.intent.jump = true;   // optional paddle
    }
    e.tick(w, DT);
    if (e.inWater) entered = true;
    if (entered) minYAfterEnter = Math.min(minYAfterEnter, e.y);
    if (e.y < -8) { fell = true; break; }
    // climbed out = past the exit bank, on solid ground at/above waterline
    if (entered && !e.inWater && e.z > zone.maxZ + 2.5 && e.grounded && e.y > zone.surfaceTop - 0.9) { out = true; break; }
  }
  return { entered, fell, out };
}

console.log('\n=== Water exit — HUMAN, forward-only (no paddle), many tracks ===');
{
  let trials = 0, out = 0, fell = 0;
  for (let t = 0; t < 25; t++) {
    const w = wetTrack(); if (!w) continue;
    trials++;
    const r = runThrough(w, { isBot: false, paddleUp: false });
    if (r.out) out++;
    if (r.fell) fell++;
  }
  ok(`ran forward-only human trials`, trials >= 15);
  ok(`forward-only human NEVER falls through`, fell === 0);
  ok(`forward-only human climbs out EVERY time`, out === trials);
  console.log(`     (${out}/${trials} climbed out, ${fell} fell)`);
}

console.log('\n=== Water exit — HUMAN, forward + paddle up ===');
{
  let trials = 0, out = 0, fell = 0;
  for (let t = 0; t < 20; t++) {
    const w = wetTrack(); if (!w) continue;
    trials++;
    const r = runThrough(w, { isBot: false, paddleUp: true });
    if (r.out) out++;
    if (r.fell) fell++;
  }
  ok(`paddling human NEVER falls through`, fell === 0);
  ok(`paddling human climbs out EVERY time`, out === trials);
  console.log(`     (${out}/${trials} climbed out, ${fell} fell)`);
}

console.log('\n=== Water exit — BOT on the real race brain ===');
{
  let trials = 0, out = 0, fell = 0;
  for (let t = 0; t < 20; t++) {
    const w = wetTrack(); if (!w) continue;
    trials++;
    const r = runThrough(w, { isBot: true, paddleUp: true, useBrain: true });
    if (r.out) out++;
    if (r.fell) fell++;
  }
  ok(`bot NEVER falls through`, fell === 0);
  ok(`bot climbs out on nearly every track`, out >= trials - 1);
  console.log(`     (${out}/${trials} climbed out, ${fell} fell)`);
}

console.log(`\n==== RESULT: ${pass} passed, ${fail} failed ====\n`);
process.exit(fail ? 1 : 0);
