// Headless test for Task #4: trails must actually render (particles spawned
// + instance count > 0) while running, for EVERY equipped trail type, and be
// invisible only for 'none'. InstancedMesh buffer writes work in Node (no
// WebGL needed), so we can assert the pool state directly.
import * as THREE from 'three';
import { TrailSystem } from '../src/trails.js';
import { TRAILS } from '../src/cosmetics.js';

const scene = new THREE.Scene();
let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; console.log('  \u2713', name); }
  else { fail++; console.log('  \u2717 FAIL:', name); }
}

// a fake "running" entity moving fast enough to emit
function runner(trailId) {
  return { x: 0, y: 1, z: 0, vx: 7, vz: 0, yaw: 0, grounded: true, trailId, alive: true };
}

function liveParticles(sys) {
  let n = 0;
  for (const shape of Object.keys(sys.pools)) n += sys.pools[shape].parts.length;
  return n;
}
function drawnInstances(sys) {
  let n = 0;
  for (const shape of Object.keys(sys.pools)) n += sys.pools[shape].mesh.count;
  return n;
}

console.log('\n=== TASK 4: each trail type renders while running ===');
for (const t of TRAILS) {
  const sys = new TrailSystem(scene, { tier: 'mid' });
  const e = runner(t.id);
  // simulate ~0.5s of running at 60fps
  for (let i = 0; i < 30; i++) { sys.emit(e, 1 / 60); sys.update(1 / 60); }
  const live = liveParticles(sys);
  const drawn = drawnInstances(sys);
  if (t.color == null) {
    ok(`'${t.id}' (None) emits NOTHING`, live === 0 && drawn === 0);
  } else {
    ok(`'${t.name}' streams particles while running (live=${live}, drawn=${drawn})`, live > 0 && drawn > 0);
  }
}

console.log('\n=== TASK 4: standing still emits far less than running (speed-driven) ===');
{
  const sysRun = new TrailSystem(scene, { tier: 'mid' });
  const sysStill = new TrailSystem(scene, { tier: 'mid' });
  const run = runner('fire');
  const still = { x: 0, y: 1, z: 0, vx: 0, vz: 0, yaw: 0, grounded: true, trailId: 'fire', alive: true };
  let runCount = 0, stillCount = 0;
  for (let i = 0; i < 60; i++) {
    sysRun.emit(run, 1 / 60);
    sysStill.emit(still, 1 / 60);
  }
  runCount = liveParticles(sysRun);
  stillCount = liveParticles(sysStill);
  ok(`running emits more than idle (run=${runCount} > idle=${stillCount})`, runCount > stillCount);
}

console.log('\n=== TASK 4: jump/dive burst injects an extra pop ===');
{
  const sys = new TrailSystem(scene, { tier: 'mid' });
  const e = runner('rainbow');
  sys.emit(e, 1 / 60);
  const before = liveParticles(sys);
  e._trailBurst = true;             // simulate the onJump/onDive burst flag
  sys.emit(e, 1 / 60);
  const after = liveParticles(sys);
  ok(`burst adds a batch of particles (before=${before}, after=${after})`, after - before >= 5);
}

console.log('\n=== TASK 4: distinct shapes => distinct pools used ===');
{
  const shapesUsed = new Set(TRAILS.filter(t => t.color != null).map(t => t.shape));
  ok('multiple distinct shape families are configured', shapesUsed.size >= 3);
  console.log('     shapes in use:', [...shapesUsed].join(', '));
}

console.log('\n=== TASK 4: particles die out (no leak) ===');
{
  const sys = new TrailSystem(scene, { tier: 'mid' });
  const e = runner('spark');
  for (let i = 0; i < 30; i++) { sys.emit(e, 1 / 60); sys.update(1 / 60); }
  const peak = liveParticles(sys);
  // stop emitting, let them expire
  e.vx = 0; e.vz = 0; e.trailId = 'none';
  for (let i = 0; i < 120; i++) sys.update(1 / 60);
  const settled = liveParticles(sys);
  ok(`particles expire after emission stops (peak=${peak} -> settled=${settled})`, settled === 0 && peak > 0);
}

console.log(`\n==== RESULT: ${pass} passed, ${fail} failed ====\n`);
process.exit(fail ? 1 : 0);
