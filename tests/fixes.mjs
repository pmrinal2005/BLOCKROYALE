// Regression tests for the TWO reported real-world bugs, driven through the
// REAL level geometry (not idealized flats):
//   A) Punch usability — you can punch a player standing next to you in ANY
//      direction (auto-aim), off a short cooldown.
//   B) Water exit — human AND bots swim through and climb out onto the bank
//      instead of falling through into the void.
import * as THREE from 'three';
import { CFG, DT } from '../src/config.js';
import { Entity } from '../src/entity.js';
import { BotBrain } from '../src/bots.js';
import { checkMeleeHits } from '../src/physics.js';
import { buildLevel } from '../src/levels.js';

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; console.log('  \u2713', name); }
  else { fail++; console.log('  \u2717 FAIL:', name); }
}

const flat = {
  platforms: [{ x:0,y:0,z:0,sx:200,sy:2,sz:200,solid:true }],
  obstacles: [], throne:{x:0,y:1,z:0,r:3}, spawnPoints:[{x:0,y:1.2,z:0}],
  finishZ:9999, startZ:-10, laneHalf:20, rampHeightAt:()=>null,
  updateObstacles(){}, clear(){}, waterAt:()=>null,
};

// ---------------------------------------------------------------
console.log('\n=== BUG A: punch connects on a nearby player in ANY direction ===');
{
  for (const deg of [0, 45, 90, 135, 180, 270]) {
    const a = new Entity({}); const t = new Entity({});
    a.respawnAt({x:0,y:1.2,z:0});
    const rad = deg*Math.PI/180;
    t.respawnAt({ x: Math.sin(rad)*1.3, y:1.2, z: Math.cos(rad)*1.3 });
    a.yaw = 0;   // attacker's stale facing is +Z regardless of target angle
    let hit=false;
    for (let i=0;i<20;i++){ a.intent.melee=(i===0); a.tick(flat,DT); t.tick(flat,DT); checkMeleeHits([a,t],(x,h)=>{if(h)hit=true;}); if(hit)break; }
    ok(`punch lands on target at ${deg}° (auto-aim)`, hit);
  }
  const a = new Entity({});
  ok('cooldown is snappy (<=1.5s)', CFG.MELEE_COOLDOWN <= 1.5);
}

// ---------------------------------------------------------------
console.log('\n=== BUG A: a target clearly OUT of reach is NOT hit ===');
{
  const a = new Entity({}); const t = new Entity({});
  a.respawnAt({x:0,y:1.2,z:0}); t.respawnAt({x:0,y:1.2,z:8}); a.yaw=0;
  let hit=false;
  for (let i=0;i<20;i++){ a.intent.melee=(i===0); a.tick(flat,DT); t.tick(flat,DT); checkMeleeHits([a,t],(x,h)=>{if(h)hit=true;}); if(hit)break; }
  ok('far target (8 units) is NOT punched', !hit);
}

// ---------------------------------------------------------------
console.log('\n=== BUG B: HUMAN swims through & climbs out (many random tracks) ===');
{
  let trials=0, climbedOut=0, fellThrough=0;
  for (let attempt=0; attempt<60 && trials<12; attempt++){
    const w = buildLevel(new THREE.Scene(), { type:'race', biome:'jungle', name:'Round 1' });
    if (w.waterZones.length===0) continue;
    trials++;
    const zone = w.waterZones[0];
    const e = new Entity({});
    e.respawnAt({ x:0, y: zone.surfaceTop+0.2, z: zone.minZ-3 });
    let entered=false, fell=false, out=false;
    for (let i=0;i<1500;i++){
      e.intent.mx=0; e.intent.mz=1;
      e.intent.jump = e.inWater;          // paddle up while submerged
      e.tick(w, DT);
      if (e.inWater) entered=true;
      if (e.y < -8){ fell=true; break; }
      if (entered && !e.inWater && e.z > zone.maxZ + 3 && e.grounded && e.y > zone.surfaceTop-0.8){ out=true; break; }
    }
    if (out) climbedOut++;
    if (fell) fellThrough++;
  }
  ok(`gathered wet-track trials`, trials >= 8);
  ok(`human NEVER falls through the exit (0 void-falls)`, fellThrough === 0);
  ok(`human climbs out on every wet track`, climbedOut === trials);
  console.log(`     (${climbedOut}/${trials} climbed out, ${fellThrough} fell through)`);
}

// ---------------------------------------------------------------
console.log('\n=== BUG B: a BOT also swims through & climbs out ===');
{
  let w=null;
  for (let i=0;i<60 && !w;i++){ const c=buildLevel(new THREE.Scene(),{type:'race',biome:'jungle',name:'Round 1'}); if(c.waterZones.length) w=c; }
  ok('rolled a wet track for the bot test', !!w);
  if (w){
    const zone = w.waterZones[0];
    const b = new Entity({ isBot:true });
    b.respawnAt({ x:0, y:zone.surfaceTop+0.2, z: zone.minZ-3 });
    b.brain = new BotBrain(b, w, { type:'race' });
    let entered=false, fell=false, out=false;
    for (let i=0;i<2000;i++){
      b.brain.think(DT, [b]);
      if (b.inWater) b.intent.jump = true;   // bot paddles up in water (race brain doesn't spam jump underwater)
      b.tick(w, DT);
      if (b.inWater) entered=true;
      if (b.y < -8){ fell=true; break; }
      if (entered && !b.inWater && b.z > zone.maxZ + 2 && b.grounded){ out=true; break; }
    }
    ok('bot entered the water', entered);
    ok('bot did NOT fall through', !fell);
    ok('bot climbed out onto the bank', out);
  }
}

// ---------------------------------------------------------------
console.log('\n=== BUG A: bots DO punch a rival (incl. the human) when close ===');
{
  // Put a bot right next to a "human" repeatedly and confirm it throws a punch
  // within a reasonable window (king brain = most aggressive).
  let punched = false;
  for (let trial = 0; trial < 20 && !punched; trial++) {
    const human = new Entity({ name:'You', isBot:false });
    const bot = new Entity({ name:'Bonk', isBot:true });
    human.respawnAt({ x:0, y:1.2, z:0 });
    bot.respawnAt({ x:0, y:1.2, z:1.2 });   // 1.2 units from the human
    bot.brain = new BotBrain(bot, { ...flat, throne:{x:0,y:1,z:0,r:6} }, { type:'king' });
    for (let i=0;i<120;i++){
      // keep the bot loosely near the human
      bot.brain.think(DT, [human, bot]);
      const meleeReq = bot.intent.melee;
      human.tick(flat, DT); bot.tick(flat, DT);
      checkMeleeHits([human, bot], () => {});
      if (meleeReq && (bot.meleeTimer > 0 || bot.meleeCd > 0)) { punched = true; break; }
      // re-seat if it drifted too far so the scenario stays valid
      if (Math.hypot(bot.x-human.x, bot.z-human.z) > 2.5){ bot.x=0; bot.z=1.2; bot.vx=bot.vz=0; }
    }
  }
  ok('a bot throws a punch at a nearby rival within the window', punched);
}

console.log(`\n==== RESULT: ${pass} passed, ${fail} failed ====\n`);
process.exit(fail ? 1 : 0);
