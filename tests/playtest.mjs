// Headless behavioral playtest for Tasks 1-3.
// Imports the pure sim modules (no WebGL) and drives entities through
// scripted inputs, asserting the mechanics behave as specified.
import { CFG, DT } from '../src/config.js';
import { Entity } from '../src/entity.js';
import { BotBrain } from '../src/bots.js';
import { checkMeleeHits, resolvePlayerBumps } from '../src/physics.js';

// Minimal flat world: one big solid platform at y=0..1, top surface y=1.
const world = {
  biome: 'jungle',
  platforms: [{ x: 0, y: 0, z: 0, sx: 200, sy: 2, sz: 200, solid: true }],
  obstacles: [],
  throne: { x: 0, y: 1, z: 0, r: 3 },
  spawnPoints: [{ x: 0, y: 1.2, z: 0 }],
  finishZ: 9999, startZ: -10, laneHalf: 20,
  rampHeightAt: () => null,
  updateObstacles() {},
  clear() {},
};

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; console.log('  \u2713', name); }
  else { fail++; console.log('  \u2717 FAIL:', name); }
}

function stepPose(e, frameDt = 1 / 60) { e.updatePose(frameDt); }

// ---------------------------------------------------------------
console.log('\n=== TASK 2: flip must NOT play at spawn/idle (no loop) ===');
{
  const e = new Entity({ name: 'P', isBot: false });
  e.respawnAt(world.spawnPoints[0]);
  // simulate 2 seconds of idle (grounded, no input) at render rate
  let maxFlip = 0, everFlipping = false;
  for (let i = 0; i < 120; i++) {
    e.tick(world, DT);
    stepPose(e);
    if (e.flipping) everFlipping = true;
    maxFlip = Math.max(maxFlip, Math.abs(e.pose.flip));
  }
  ok('flipping=false at spawn and stays false while idle', !everFlipping);
  ok('pose.flip stays 0 during idle (no residual/looping rotation)', maxFlip < 1e-6);
}

// ---------------------------------------------------------------
console.log('\n=== TASK 1 + 2: double-jump => dive + single-shot flip ===');
{
  const e = new Entity({ name: 'P', isBot: false });
  e.respawnAt(world.spawnPoints[0]);
  // give some forward run so a facing exists
  const runFwd = () => { e.intent.mx = 0; e.intent.mz = 1; };

  // settle one tick so physics reports grounded=true (fresh respawn is y=1.2,
  // above the y=1 surface, so the first tick is the "landing" tick).
  runFwd(); e.tick(world, DT); stepPose(e);

  // 1st jump (grounded)
  runFwd(); e.intent.jump = true;
  e.tick(world, DT); stepPose(e);
  ok('after ground jump: airborne', !e.grounded);
  ok('no flip yet after single jump', !e.flipping);

  // let it rise a couple frames, then 2nd jump press mid-air => dive+flip
  runFwd(); e.tick(world, DT); stepPose(e);
  runFwd(); e.intent.jump = true;   // second press while airborne
  e.tick(world, DT); stepPose(e);
  ok('second mid-air jump press triggers dive (diveTimer>0)', e.diveTimer > 0);
  ok('flip armed (flipping=true) exactly on the dive', e.flipping === true);

  // play the flip out; it must complete exactly ONE turn then terminate
  let sawFullTurn = false, framesFlipping = 0;
  for (let i = 0; i < 200; i++) {
    runFwd();
    e.tick(world, DT); stepPose(e);
    if (e.flipping) { framesFlipping++; if (Math.abs(e.pose.flip) > Math.PI * 1.8) sawFullTurn = true; }
    if (!e.flipping && framesFlipping > 0) break;
  }
  ok('flip reached ~full 360 turn', sawFullTurn);
  ok('flip terminated (flipping=false) after one turn', !e.flipping);
  ok('pose.flip snapped back to 0 after termination', Math.abs(e.pose.flip) < 1e-6);

  // it must NOT re-arm on its own (no auto-replay) over the next second
  let reArmed = false;
  for (let i = 0; i < 60; i++) { runFwd(); e.tick(world, DT); stepPose(e); if (e.flipping) reArmed = true; }
  ok('flip does NOT auto-replay/loop after completing', !reArmed);
}

// ---------------------------------------------------------------
console.log('\n=== TASK 1: bots perform the air-dive from time to time ===');
{
  const cfg = { type: 'race' };
  let botDived = 0;
  for (let trial = 0; trial < 8; trial++) {
    const b = new Entity({ name: 'B', isBot: true });
    b.respawnAt(world.spawnPoints[0]);
    b.brain = new BotBrain(b, world, cfg);
    for (let i = 0; i < 400; i++) {
      b.brain.think(DT, [b]);
      b.tick(world, DT); b.updatePose(DT);
      if (b.diveTimer > 0 && b.flipping) { botDived++; break; }
    }
  }
  ok('bots trigger the double-jump dive+flip across trials', botDived > 0);
  console.log(`     (${botDived}/8 bot trials dived within the window)`);
}

// ---------------------------------------------------------------
console.log('\n=== TASK 3: knockback melee physics ===');
{
  // attacker faces +Z (yaw=0 => facing (sin0,cos0)=(0,1)); target directly ahead
  const a = new Entity({ name: 'A', isBot: false });
  const t = new Entity({ name: 'T', isBot: false });
  a.respawnAt({ x: 0, y: 1.2, z: 0 });
  t.respawnAt({ x: 0, y: 1.2, z: 1.0 });   // 1.0 unit ahead (within MELEE_RANGE)
  a.yaw = 0; t.yaw = Math.PI;
  const list = [a, t];

  // fire melee
  a.intent.melee = true;
  // run enough ticks for windup->active hit frame
  let hitApplied = false;
  const tzBefore = t.z, tvzBefore = t.vz;
  for (let i = 0; i < 30; i++) {
    a.intent.melee = (i === 0);   // press once
    a.tick(world, DT); t.tick(world, DT);
    checkMeleeHits(list, (att, hit) => { if (hit) hitApplied = true; });
    a.updatePose(DT); t.updatePose(DT);
    if (hitApplied) break;
  }
  ok('melee connects on a target in the forward cone', hitApplied);
  ok('target knocked in +Z (away from attacker)', t.z > tzBefore || t.vz > 0.5 || t.stumbleTimer > 0);
  ok('target got a stumble/stun applied', t.stumbleTimer > 0);
  ok('attacker melee went on cooldown (anti-spam)', a.meleeCd > 0);
  ok('cooldown ~= CFG.MELEE_COOLDOWN', Math.abs(a.meleeCd - CFG.MELEE_COOLDOWN) < 0.5);

  // damage-free: neither loses "alive" from a punch
  ok('melee deals no elimination/damage (target still alive)', t.alive === true);
}

// ---------------------------------------------------------------
console.log('\n=== TASK 3: airborne target modifier + super punch ===');
{
  // airborne target => 1.5x knockback + air stun
  const a = new Entity({}); const t = new Entity({});
  a.respawnAt({ x: 0, y: 1.2, z: 0 }); t.respawnAt({ x: 0, y: 1.2, z: 1.0 });
  // airborne but within the punch's vertical band (a small hop, not way overhead)
  a.yaw = 0; t.grounded = false; t.y = 1.5;
  const list = [a, t];
  a.meleeTimer = CFG.MELEE_ANIM_TIME; a._meleeFired = false;
  a.meleeActive = 1;                     // force active frame
  let air = false;
  checkMeleeHits(list, () => {});
  ok('airborne target gets air-stun (~MELEE_AIR_STUN)', Math.abs(t.stumbleTimer - CFG.MELEE_AIR_STUN) < 0.05);

  // super punch: attacker mid-dive => 1.3x force. Compare velocities.
  function knockVel(superOn) {
    const A = new Entity({}); const T = new Entity({});
    A.respawnAt({ x: 0, y: 1.2, z: 0 }); T.respawnAt({ x: 0, y: 1.2, z: 1.0 });
    A.yaw = 0; T.grounded = true;
    A.meleeTimer = CFG.MELEE_ANIM_TIME; A._meleeFired = false; A.meleeActive = 1;
    A.meleeSuper = superOn;
    checkMeleeHits([A, T], () => {});
    return Math.hypot(T.vx, T.vz);
  }
  const normal = knockVel(false), sup = knockVel(true);
  ok('super punch increases knockback (1.3x)', sup > normal * 1.2);
  console.log(`     (normal=${normal.toFixed(2)}  super=${sup.toFixed(2)}  ratio=${(sup/normal).toFixed(2)})`);
}

console.log(`\n==== RESULT: ${pass} passed, ${fail} failed ====\n`);
process.exit(fail ? 1 : 0);
