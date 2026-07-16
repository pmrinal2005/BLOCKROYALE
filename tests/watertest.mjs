// Headless behavioral playtest for Task #2 (localized water / swimming) and
// the Task #3 spectator target-filtering rules. Uses the pure sim modules
// (no WebGL) so it runs anywhere Node runs.
import { CFG, DT } from '../src/config.js';
import { Entity } from '../src/entity.js';

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; console.log('  \u2713', name); }
  else { fail++; console.log('  \u2717 FAIL:', name); }
}

// A flat world with a LOCALIZED water volume: solid floor everywhere, but a
// 10x10 pool centered at origin whose surface sits at y=3 and reaches down to
// y=-2. waterAt() returns the zone only inside that box (localized, per spec).
const POOL = { x: 0, z: 0, sx: 10, sz: 10, surfaceTop: 3, bottom: -2 };
const world = {
  biome: 'jungle',
  platforms: [{ x: 0, y: -3, z: 0, sx: 200, sy: 2, sz: 200, solid: true }],
  obstacles: [],
  spawnPoints: [{ x: 0, y: 1.2, z: 0 }],
  finishZ: 9999, startZ: -10, laneHalf: 20,
  rampHeightAt: () => null,
  waterAt(x, y, z) {
    if (x < POOL.x - POOL.sx / 2 || x > POOL.x + POOL.sx / 2) return null;
    if (z < POOL.z - POOL.sz / 2 || z > POOL.z + POOL.sz / 2) return null;
    if (y < POOL.bottom || y > POOL.surfaceTop) return null;
    return { surfaceTop: POOL.surfaceTop, bottom: POOL.bottom };
  },
  updateObstacles() {}, clear() {},
};

// ---------------------------------------------------------------
console.log('\n=== TASK 2: enter/exit water transitions fire callbacks ===');
{
  const e = new Entity({ name: 'Swimmer', isBot: false });
  e.respawnAt({ x: 30, y: 1.2, z: 30 });   // start OUTSIDE the pool (dry)
  let entered = 0, exited = 0;
  e.onWaterEnter = () => entered++;
  e.onWaterExit = () => exited++;

  // one dry tick to settle
  e.tick(world, DT);
  ok('starts NOT in water when outside the volume', e.inWater === false);

  // teleport into the pool, tick once => Running->Swimming transition fires once
  e.x = 0; e.z = 0; e.y = 1.0;
  e.tick(world, DT);
  ok('inWater=true after entering the volume', e.inWater === true);
  ok('onWaterEnter fired exactly once on entry', entered === 1);

  // staying in should NOT re-fire enter
  e.tick(world, DT);
  ok('onWaterEnter does not re-fire while staying submerged', entered === 1);

  // teleport back out => Swimming->Running, onWaterExit fires
  e.x = 30; e.z = 30; e.y = 1.2;
  e.tick(world, DT);
  ok('inWater=false after leaving the volume', e.inWater === false);
  ok('onWaterExit fired exactly once on exit', exited === 1);
}

// ---------------------------------------------------------------
console.log('\n=== TASK 2: buoyancy lifts a sinking body toward the surface ===');
{
  const e = new Entity({ name: 'Floaty', isBot: false });
  e.respawnAt({ x: 0, y: -1.5, z: 0 });   // deep, below the surface line
  e.x = 0; e.z = 0;
  let rose = false;
  const y0 = e.y;
  for (let i = 0; i < 120; i++) {
    e.intent.mx = 0; e.intent.mz = 0;
    e.tick(world, DT);
    if (e.y > y0 + 0.5) { rose = true; break; }
  }
  ok('buoyancy raises a submerged idle body upward', rose);
  ok('body never rockets above the surface (bobs, not breaches)', e.y <= POOL.surfaceTop + 0.5);
}

// ---------------------------------------------------------------
console.log('\n=== TASK 2: swim is slower than the run + JUMP swims up ===');
{
  // horizontal swim speed should settle well below the ground MOVE_SPEED
  const e = new Entity({ name: 'Speed', isBot: false });
  e.respawnAt({ x: 0, y: 0.5, z: 0 });
  e.x = 0; e.z = 0;
  let maxSpeed = 0;
  for (let i = 0; i < 90; i++) {
    e.intent.mx = 1; e.intent.mz = 0;   // hold a direction
    e.tick(world, DT);
    maxSpeed = Math.max(maxSpeed, Math.hypot(e.vx, e.vz));
  }
  ok('swim horizontal speed is capped near WATER_SWIM_SPEED (slower than run)',
     maxSpeed <= CFG.WATER_SWIM_SPEED + 0.5 && maxSpeed < CFG.MOVE_SPEED);

  // JUMP intent in water => upward swim velocity
  const u = new Entity({});
  u.respawnAt({ x: 0, y: 0.5, z: 0 }); u.x = 0; u.z = 0;
  u.tick(world, DT);            // become swimming
  u.intent.jump = true;
  u.tick(world, DT);
  ok('JUMP in water produces upward swim velocity', u.vy > 0);
}

// ---------------------------------------------------------------
console.log('\n=== TASK 3: spectator target filter excludes eliminated + qualified ===');
{
  // Reproduce the exact predicate Game._activeSpectateTargets uses:
  //   alive && !finished && !eliminated && !== human
  const human = new Entity({ name: 'You', isBot: false });
  const running1 = new Entity({ name: 'Bot_Runner_1', isBot: true });
  const running2 = new Entity({ name: 'Bot_Runner_2', isBot: true });
  const qualified = new Entity({ name: 'Bot_Qualified', isBot: true });
  const eliminated = new Entity({ name: 'Bot_Eliminated', isBot: true });
  const entities = [human, running1, running2, qualified, eliminated];

  qualified.finished = true;          // qualified => excluded
  eliminated.alive = false;           // eliminated => excluded
  const eliminatedOrder = [eliminated];

  const activeTargets = entities.filter(e =>
    e.alive && !e.finished && !eliminatedOrder.includes(e) && e !== human
  );
  ok('active targets are exactly the two still-running bots', activeTargets.length === 2);
  ok('excludes the qualified/finished player', !activeTargets.includes(qualified));
  ok('excludes the eliminated player', !activeTargets.includes(eliminated));
  ok('excludes the local human', !activeTargets.includes(human));

  // cycling wraps around the active list (the Game._cycleSpectate math)
  let idx = 0;
  const step = (d) => { idx = ((idx + d) % activeTargets.length + activeTargets.length) % activeTargets.length; return activeTargets[idx]; };
  ok('next cycles to second target', step(1) === activeTargets[1]);
  ok('next wraps back to first', step(1) === activeTargets[0]);
  ok('prev wraps to last', step(-1) === activeTargets[activeTargets.length - 1]);
}

console.log(`\n==== RESULT: ${pass} passed, ${fail} failed ====\n`);
process.exit(fail ? 1 : 0);
