// Melee / Knockback punch verification (Task #3).
// Reproduces the reported bug: "I'm not able to punch players near me."
// Sets up a human attacker with a rival standing at various relative positions
// (in front, beside, behind, diagonally) and confirms a single swing knocks
// them back — regardless of which way the attacker happens to be facing.
import { CFG, DT } from '../src/config.js';
import { Entity } from '../src/entity.js';
import { checkMeleeHits } from '../src/physics.js';

// Minimal flat world: solid floor at y=0 everywhere, no ramps/water.
const world = {
  platforms: [{ x: 0, y: -1, z: 0, sx: 500, sy: 2, sz: 500, solid: true }],
  obstacles: [], waterZones: [], spawnPoints: [{ x: 0, y: 0.2, z: 0 }],
  finishZ: 9999, startZ: -10, laneHalf: 50,
  rampHeightAt: () => null, waterAt: () => null, updateObstacles() {},
};

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; console.log('  \u2713', name); }
  else { fail++; console.log('  \u2717 FAIL:', name); }
}

// Simulate: attacker swings, target stands still. Run a handful of ticks so the
// wind-up elapses and the active frame opens, resolving the hit. Returns how
// far the target was displaced horizontally.
function swingAndMeasure({ attackerYaw, targetDX, targetDZ }) {
  const a = new Entity({ name: 'You', isBot: false });
  a.meleeAimAssist = true;
  a.respawnAt({ x: 0, y: 0, z: 0 });
  a.yaw = attackerYaw;
  a.grounded = true;

  const b = new Entity({ name: 'Rival', isBot: true });
  b.respawnAt({ x: targetDX, y: 0, z: targetDZ });
  b.grounded = true;

  const list = [a, b];
  const startX = b.x, startZ = b.z;

  // request a punch
  a.intent.melee = true;
  let hit = false;
  for (let i = 0; i < 20; i++) {
    // keep the attacker standing still (no move intent) — worst case for aiming
    a.intent.mx = 0; a.intent.mz = 0;
    b.intent.mx = 0; b.intent.mz = 0;
    a.tick(world, DT);
    b.tick(world, DT);
    checkMeleeHits(list, (attacker, didHit) => { if (attacker === a && didHit) hit = true; });
    if (i === 0) a.intent.melee = false;   // one-shot
  }
  const disp = Math.hypot(b.x - startX, b.z - startZ);
  return { hit, disp, stumbled: b.stumbleTimer > 0 || disp > 0.5, inputLocked: b.inputLock > 0 };
}

console.log('\n=== Human punch connects on a rival standing NEXT TO you (any direction) ===');
const R = CFG.PLAYER_RADIUS;
const near = R * 2 + 0.4;   // just within contact range
const cases = [
  ['directly in front (+Z)', 0, 0, near],
  ['directly behind (-Z)', 0, 0, -near],
  ['to the right (+X)', 0, near, 0],
  ['to the left (-X)', 0, -near, 0],
  ['diagonal front-right', 0, near * 0.7, near * 0.7],
  ['attacker faces +X but rival is behind at -Z', Math.PI / 2, 0, -near],
  ['attacker faces away, rival at +X', Math.PI, near, 0],
];
for (const [label, yaw, dx, dz] of cases) {
  const r = swingAndMeasure({ attackerYaw: yaw, targetDX: dx, targetDZ: dz });
  ok(`punch lands: ${label}`, r.hit && r.disp > 0.5);
}

console.log('\n=== Punch respects range (rival too far => miss) ===');
{
  const r = swingAndMeasure({ attackerYaw: 0, targetDX: 0, targetDZ: CFG.MELEE_RANGE + 3 });
  ok('rival well beyond reach is NOT hit', !r.hit && r.disp < 0.2);
}

console.log('\n=== Knockback applies stun + input-lock ===');
{
  const r = swingAndMeasure({ attackerYaw: 0, targetDX: 0, targetDZ: near });
  ok('hit target is stunned/knocked', r.stumbled);
  ok('hit target has directional input-lock', r.inputLocked);
}

console.log(`\n==== RESULT: ${pass} passed, ${fail} failed ====\n`);
process.exit(fail ? 1 : 0);
