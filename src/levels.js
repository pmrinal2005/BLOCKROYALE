import { World, BIOMES } from './world.js';
import { CFG } from './config.js';

// ============================================================
// Level composition (Section 3): assemble maps from the modular
// obstacle/terrain library. Each round type produces a course.
// Deterministic-ish layout with light randomness for variety.
//
// Task #1: tracks are LONGER, feature richer elevation (multi-step
// mountain climbs + descents), and roadside STRUCTURES — some of
// which are collidable (walls / big boulders you must route around),
// giving the course real 3D navigation rather than a flat lane.
// ============================================================

function rand(min, max) { return min + Math.random() * (max - min); }
function pick(arr) { return arr[(Math.random() * arr.length) | 0]; }

// Scatter scenery along the sides of the track for the given Z range at
// the current surface height. Decoration only — never touches collision.
//
// FLOATING-OBJECT FIX (err1.PNG): every roadside prop is now dropped onto a
// solid, merged GROUND APRON laid at `surfaceY` on both flanks of the lane, so
// trees, rocks and blocks always rest on real terrain instead of hovering over
// the void beside an elevated plateau. The apron's downward skirt reaches all
// the way to base ground, so an elevated section reads as a solid mountainside.
// Distant mountains start from base ground (0) so their cones rise up out of
// the world rather than floating at plateau height.
function decorateSides(world, b, zFrom, zTo, surfaceY, laneHalf) {
  const outer = laneHalf + 3;
  const len = Math.max(0.1, zTo - zFrom);
  const midZ = (zFrom + zTo) / 2;
  // How far the scenery band extends outward from the lane edge.
  const bandInner = laneHalf;          // starts at the lane edge
  const bandOuter = outer + 8;         // props scatter within [outer, outer+~8]
  const bandW = bandOuter - bandInner; // width of one side apron
  const bandCx = (bandInner + bandOuter) / 2;
  // Skirt reaches to base ground so nothing looks like a floating shelf.
  const skirt = Math.max(2, surfaceY + 4);

  // Lay the solid ground apron on BOTH sides (props will sit on its top face).
  for (const side of [-1, 1]) {
    world.addGroundApron(side * bandCx, midZ, bandW, len + 2, surfaceY, side < 0 ? b.ground : b.ground2, skirt);
  }

  for (let z = zFrom; z < zTo; z += rand(4, 8)) {
    for (const side of [-1, 1]) {
      // keep props within the apron footprint so they always have ground below
      const x = side * (outer + rand(0, Math.max(0.5, bandW - (outer - bandInner) - 1)));
      const r = Math.random();
      if (b.decoType === 'tree') {
        if (r < 0.6) world.addTree(x, surfaceY, z, b.accent, b.deco1, rand(0.8, 1.6));
        else world.addDecor(x, surfaceY + rand(0.5, 1.0), z, rand(1, 2.4), rand(1, 2), rand(1, 2.4), b.rock, Math.random());
      } else if (b.decoType === 'rock') {
        const h = rand(1.4, 3.5);
        world.addDecor(x, surfaceY + h / 2, z, rand(1.2, 3), h, rand(1.2, 3), r < 0.4 ? b.deco1 : b.rock, Math.random());
      } else if (b.decoType === 'crystal') {
        const h = rand(2, 4.5);
        world.addDecor(x, surfaceY + h / 2, z, rand(0.6, 1.3), h, rand(0.6, 1.3), r < 0.5 ? b.deco2 : b.deco1, Math.random());
      } else { // pillar (sky)
        const h = rand(3, 6);
        world.addDecor(x, surfaceY + h / 2, z, rand(0.9, 1.6), h, rand(0.9, 1.6), b.rock, 0);
        world.addDecor(x, surfaceY + h + 0.3, z, rand(1.4, 2), 0.6, rand(1.4, 2), b.accent, 0);
      }
    }
    // occasional roadside architecture for a richer skyline (Task #1) — sits on
    // the apron so it is grounded too.
    if (Math.random() < 0.18) {
      const side = Math.random() < 0.5 ? -1 : 1;
      const sx = side * (outer + rand(1, Math.max(1.5, bandW - (outer - bandInner) - 2)));
      world.addStructure(sx, surfaceY, z,
        pick(['arch', 'tower', 'ruin']), b.rock, b.accent);
    }
    // occasional distant mountain for a mountainous skyline. These stand FAR
    // beyond the apron, so they rise from BASE GROUND (0) up past the plateau
    // — a tall solid cone, never a floating pyramid.
    if (Math.random() < 0.28) {
      const side = Math.random() < 0.5 ? -1 : 1;
      world.addMountain(side * (bandOuter + rand(6, 20)), 0, z + rand(-4, 4),
        rand(10, 16), rand(surfaceY + 14, surfaceY + 26), b.mountain, b.snow);
    }
  }
}

// Place one obstacle theme's meshes at a race segment (Task #3: densified).
// Extracted so a segment can layer a primary + secondary theme cheaply. Every
// theme now spawns MORE instances than before for a busier gauntlet.
function placeObstacleTheme(world, b, kind, top, midZ, z, segLen, laneHalf) {
  if (kind === 'hammers') {
    const n = 3 + (Math.random() * 3 | 0);            // was 2-4 -> now 3-5
    for (let i = 0; i < n; i++)
      world.addHammer(rand(-6, 6), top + 5.5, midZ + (i - n / 2) * 2.4, 3.4, rand(1.2, 2.1), rand(0, 6));
  } else if (kind === 'rotor') {
    world.addRotor(0, top + 0.9, midZ, rand(8, 12), rand(1.0, 1.9) * (Math.random() < .5 ? 1 : -1));
    // second + occasional third stacked rotor => denser sweep (was max 2)
    world.addRotor(0, top + 1.6, midZ + rand(-4, 4), rand(6, 10), rand(1.0, 1.7) * (Math.random() < .5 ? 1 : -1));
    if (Math.random() < 0.5)
      world.addRotor(0, top + 2.3, midZ + rand(-4, 4), rand(5, 8), rand(1.2, 1.8) * (Math.random() < .5 ? 1 : -1));
  } else if (kind === 'dice') {
    const n = 2 + (Math.random() * 2 | 0);            // was 1-2 -> now 2-3
    for (let i = 0; i < n; i++)
      world.addRollingDie(rand(-6, 6), top + 0.9, z - 2, z + segLen + 2, rand(5, 9), rand(1.6, 2.2));
  } else if (kind === 'blink') {
    for (let i = 0; i < 8; i++)                        // was 6 -> now 8
      world.addBlinkTile(rand(-6, 6), top + 0.05, z + 2 + i * (segLen / 9), 2.4, rand(2.5, 4), rand(0, 3));
  } else if (kind === 'movers') {
    const n = 2 + (Math.random() * 2 | 0);            // was 1-2 -> now 2-3
    for (let i = 0; i < n; i++)
      world.addMovingPlatform(rand(-3, 3), top + 0.1, midZ + (i - n / 2) * 4, rand(3, 4.5), 0.6, rand(3, 4.5),
        b.accent, 'x', rand(3, 5), rand(0.8, 1.4), rand(0, 6));
  } else if (kind === 'pusher') {
    for (const side of [-1, 1]) {
      world.addPusher(side * (laneHalf + 1), top + 1, midZ, 2.4, 2.4, 3, b.hazard,
        laneHalf, rand(1.0, 1.6), Math.random() * 6);
      // a second, offset piston per side for a tighter squeeze
      if (Math.random() < 0.6)
        world.addPusher(side * (laneHalf + 1), top + 1, midZ + rand(3, 6), 2.2, 2.2, 2.6, b.hazard,
          laneHalf, rand(1.0, 1.6), Math.random() * 6);
    }
  } else if (kind === 'vines') {
    for (let i = 0; i < 5; i++) world.addVineSwing(rand(-6, 6), top + 6, midZ + i * 2.4, 4);  // was 3 -> now 5
  }
}

// Lay a localized WATER SECTION across the track (Task #2). It carves the lane
// into a swimmable channel: the walkable floor DIPS to a submerged shelf, a
// water trigger volume fills the dip up to `surf`, and the far bank rises back
// to `surf` so you climb out and resume running. The water covers ONLY this
// stretch of the level — everything before/after is normal dry track. Returns
// the Z just past the exit bank so the caller keeps building seamlessly.
function placeWaterSection(world, b, z, surf, laneW) {
  const laneHalf = laneW / 2;
  const poolLen = rand(20, 28);          // length of the swim channel
  const floorDrop = 3.2;                 // how far the submerged floor sits below the surface
  const floorTop = surf - floorDrop;     // walkable pool-bottom height (solid, so no death-fall)

  // Entry lip so you can't clip the near wall, then the submerged floor slab.
  const midZ = z + poolLen / 2;
  // Solid pool floor (players who sink can push off it; also stops fall-off).
  world.addSurface(0, floorTop, midZ, laneW, poolLen, b.rock, {});
  // Side walls contain the channel visually + physically.
  for (const side of [-1, 1]) {
    world.addPlatform(side * (laneHalf + 0.3), surf - 0.4, midZ, 0.6, floorDrop + 1.4, poolLen, b.accent);
  }
  // The water volume itself: surface exactly at `surf`, reaching down to the floor.
  world.addWater(0, surf, midZ, laneW - 0.4, poolLen, floorDrop + 0.3, biomeWater(b));
  // Decorate the banks so the pool reads as an intentional feature.
  decorateSides(world, b, z - 1, z + poolLen + 1, surf, laneHalf);

  // Far exit bank: a short gentle ramp up out of the water back to `surf` — the
  // floor already meets `surf` at the ends, so this is just a clean landing pad.
  const bankLen = 6;
  world.addSurface(0, surf, z + poolLen + bankLen / 2, laneW, bankLen, b.ground2, {});
  return z + poolLen + bankLen;
}

// Pick a water tint that suits the biome (still clearly "water", just themed).
function biomeWater(b) {
  return b === BIOMES.lava ? 0x33c1c9        // teal geothermal pool in lava biome
    : b === BIOMES.ice ? 0x5fd0ff             // icy meltwater
    : b === BIOMES.sky ? 0x59c8ff             // bright sky pool
    : 0x2fa6d8;                                // jungle river blue
}

// Build a LONGER race gauntlet with SMOOTH elevation changes (Task #3: true
// ramps, zero stairs) that climb onto mountainous plateaus and descend again,
// jumpable gaps, rich biome-specific roadside scenery + collidable structures
// you must weave around (Task #1), and a varied obstacle mix — all merged /
// instanced for a tiny draw-call count.
//
// COORDINATE CONVENTION: `surf` is always the WALKABLE TOP surface height.
// Flats are laid with addSurface(...top=surf...) and ramps interpolate between
// two surface heights, so segments meet seamlessly and nothing drops through.
function buildRace(world, cfg) {
  const b = BIOMES[cfg.biome];
  const laneW = 16;
  const laneHalf = laneW / 2;
  world.laneHalf = laneHalf;
  // Longer courses (Task #1). Round 3 (sprint) is a touch shorter than round 1.
  const length = cfg.name && cfg.name.includes('3') ? 340 : 430;
  world.startZ = 0;
  const ice = cfg.biome === 'ice';
  const START_TOP = 1;   // walkable height of the start pad

  // start pad
  world.addSurface(0, START_TOP, -6, laneW, 14, b.ground2, { ice });
  for (let i = 0; i < CFG.MAX_PLAYERS; i++) {
    const col = i % 8, row = (i / 8) | 0;
    world.spawnPoints.push({ x: -laneW / 2 + 2 + col * 1.7, y: START_TOP + 0.2, z: -10 + row * 1.6 });
  }
  decorateSides(world, b, -14, 2, START_TOP, laneHalf);

  // Walk the course, carrying a running walkable-surface height `surf`.
  let z = 1;            // build cursor just past the start pad (z=1 is its far edge)
  let surf = START_TOP;
  let seg = 0;

  // Task #2: place exactly ONE localized water swim-section per race, somewhere
  // in the middle third of the track, on flat ground (so entry/exit are clean).
  let waterPlaced = false;
  const waterZoneStart = length * 0.34, waterZoneEnd = length * 0.66;

  while (z < length) {
    // --- localized WATER SECTION (Task #2): a swim channel across the lane. ---
    if (!waterPlaced && seg > 1 && z >= waterZoneStart && z < waterZoneEnd &&
        surf <= START_TOP + 0.2) {
      z = placeWaterSection(world, b, z, surf, laneW);
      waterPlaced = true;
      seg++;
      continue;   // resume normal segments after the exit bank
    }

    // --- optional gap the player must jump/dive across (only on flat runs so
    //     you never have to blind-jump off a slope). ---
    const gap = (seg > 1 && surf <= START_TOP + 0.2 && Math.random() < 0.28) ? rand(2.2, 3.8) : 0;
    if (gap > 0) z += gap;

    // --- optional SMOOTH elevation change onto / off a plateau (Task #1/#3).
    //     Multi-tier climbs build genuine mountain stretches; ramps are gentle
    //     enough (rise/run < ~0.55) that running up/down never launches or
    //     drops the player. ---
    const doHill = seg > 0 && Math.random() < 0.55;
    if (doHill) {
      const goUp = surf <= START_TOP + 0.2 ? true : (Math.random() < 0.6);
      const tiers = 1 + (Math.random() < 0.45 ? 1 : 0);
      for (let ti = 0; ti < tiers; ti++) {
        const run = rand(9, 15);
        let rise = rand(3, 6);
        if (!goUp) rise = -Math.min(rise, surf - START_TOP);   // never below ground
        if (Math.abs(rise) < 0.4) break;
        const nextSurf = Math.max(START_TOP, surf + rise);
        world.addRamp(0, z, z + run, surf, nextSurf, laneW, seg % 2 ? b.ground : b.ground2);
        z += run;
        surf = nextSurf;
        // short flat landing between tiers so the climb reads as terraced
        if (ti < tiers - 1) {
          const lp = rand(5, 8);
          world.addSurface(0, surf, z + lp / 2, laneW, lp, b.ground2, { ice });
          decorateSides(world, b, z, z + lp, surf, laneHalf);
          z += lp;
        }
      }
    }

    const segLen = rand(14, 22);
    const midZ = z + segLen / 2;
    const segColor = seg % 2 ? b.ground : b.ground2;

    // Choose obstacle theme up-front: themes that need a dead-flat floor
    // (blink tiles you must stand on, sliding platforms, rolling dice lanes)
    // get a flat slab; everything else gets a gently ROLLING organic surface
    // (Task #3: natural sloped elevation, seamless, zero stairs).
    const themes = ['hammers', 'rotor', 'dice', 'blink', 'movers', 'pusher', 'vines', 'clear', 'clear'];
    const kind = themes[(Math.random() * themes.length) | 0];
    const needsFlat = ice || kind === 'blink' || kind === 'movers' || kind === 'dice';

    if (needsFlat) {
      world.addSurface(0, surf, midZ, laneW, segLen, segColor, { ice });
    } else {
      // low-amplitude rolling ground: rises/dips ~0.4-1.0 units across the run
      const amp = rand(0.4, 1.0);
      world.addRollingStretch(0, z, z + segLen, surf, laneW, segColor,
        amp, rand(0.9, 1.7), rand(0, Math.PI * 2));
    }

    // low side railings on elevated plateaus so it reads as a mountain path
    // and softly keeps players from sliding off the edge.
    if (surf > START_TOP + 0.6) {
      for (const side of [-1, 1]) {
        world.addPlatform(side * (laneHalf + 0.15), surf + 0.5, midZ, 0.5, 1.6, segLen, b.rock);
      }
    }
    decorateSides(world, b, z - 2, z + segLen + 2, surf, laneHalf);

    // --- collidable roadside structure jutting into the lane: a chunky
    //     boulder/pillar you must route around (real 3D navigation, Task #1).
    //     Tall enough (sy>1.2) that the solver treats it as a wall. ---
    if (seg > 1 && Math.random() < 0.5) {
      const side = Math.random() < 0.5 ? -1 : 1;
      const bw = rand(2, 3.6);
      world.addPlatform(side * (laneHalf - bw * 0.45), surf + 1.6, midZ + rand(-3, 3),
        bw, 3.4, bw, b.rock);
    }

    // --- obstacle theme for this segment (top = walkable surface). ---
    // `kind` was chosen above to decide flat-vs-rolling floor.
    // Task #3: EVERY level now packs MORE obstacles — each theme spawns a
    // denser set, and most segments layer a lightweight SECONDARY hazard on
    // top of the primary theme for a busier, more chaotic gauntlet. All of it
    // stays cheap: obstacles are shared-material meshes and the swept-hit sim
    // handles a few dozen per level well inside the perf budget (Section 7).
    const top = surf;
    placeObstacleTheme(world, b, kind, top, midZ, z, segLen, laneHalf);

    // Secondary hazard sprinkled on flat-friendly segments to raise density
    // (skip on 'movers'/'dice'/'blink' floors where a second mover would clash).
    if (!needsFlat && seg > 1 && Math.random() < 0.5) {
      const extras = ['hammers', 'rotor', 'pusher', 'vines'];
      const extra = extras[(Math.random() * extras.length) | 0];
      if (extra !== kind) placeObstacleTheme(world, b, extra, top, midZ + rand(-3, 3), z, segLen, laneHalf);
    }

    z += segLen;
    seg++;
  }

  // smoothly ramp back down to ground level for the finish if we ended high
  if (surf > START_TOP + 0.2) {
    const run = Math.max(10, (surf - START_TOP) * 2.4);
    world.addRamp(0, z, z + run, surf, START_TOP, laneW, b.accent);
    z += run; surf = START_TOP;
  }

  // finish pad + gate
  world.addSurface(0, surf, z + 6, laneW + 4, 12, b.accent);
  decorateSides(world, b, z, z + 14, surf, laneHalf + 2);
  world.addFinishGate(0, surf, z + 2, 6);
  world.finishZ = z + 2;
}

// Survival arena: circular-ish platform with sweeping hammers.
function buildSurvival(world, cfg) {
  const b = BIOMES[cfg.biome];
  const R = 13;
  world.addSurface(0, 1, 0, R * 2, R * 2, b.ground);
  world.addSurface(0, 1.3, 0, R * 2 - 3, R * 2 - 3, b.ground2, { thick: 0.4 });
  // solid rocky underside so the arena reads as a floating cube island, not a
  // paper slab hovering over nothing (err1: no floating-looking geometry).
  world.addIslandBase(0, 0.4, 0, R * 2, 16, b.rock, b.accent);

  // spawn ring
  for (let i = 0; i < CFG.MAX_PLAYERS; i++) {
    const a = (i / CFG.MAX_PLAYERS) * Math.PI * 2;
    world.spawnPoints.push({ x: Math.cos(a) * (R - 3), y: 1.5, z: Math.sin(a) * (R - 3) });
  }

  // central rotating bars that sweep the floor (Task #3: extra middle sweeper)
  world.addRotor(0, 1.4, 0, R * 1.8, 0.9);
  world.addRotor(0, 1.9, 0, R * 1.4, -1.3);
  world.addRotor(0, 2.4, 0, R * 1.0, 1.7);
  // ring of pendulum hammers (Task #3: denser ring, was 8 -> now 12)
  const n = 12;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    world.addHammer(Math.cos(a) * (R - 1), 6, Math.sin(a) * (R - 1), 3.4, rand(1.2, 1.9), a);
  }
  // an inner ring of shorter hammers for a second wall of danger
  const n2 = 6;
  for (let i = 0; i < n2; i++) {
    const a = (i / n2) * Math.PI * 2 + 0.5;
    world.addHammer(Math.cos(a) * (R - 6), 5.4, Math.sin(a) * (R - 6), 2.8, rand(1.4, 2.1), a);
  }
  // blink tiles near edge to shrink safe zone over time (Task #3: was 10 -> 16)
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    world.addBlinkTile(Math.cos(a) * (R - 2), 1.05, Math.sin(a) * (R - 2), 2.6, rand(3, 5), rand(0, 4));
  }
  // scenic backdrop mountains ring the arena — rise from base ground (0) so
  // they read as solid massifs, never floating (err1 fix).
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    world.addMountain(Math.cos(a) * (R + 16), 0, Math.sin(a) * (R + 16), rand(10, 16), rand(16, 26), b.mountain, b.snow);
  }
  world.survivalArena = { R };
}

// King of the block: shrinking central throne platform.
function buildKing(world, cfg) {
  const b = BIOMES[cfg.biome];
  const R = 9;
  world.addSurface(0, 1, 0, R * 2, R * 2, b.ground2);
  // solid rocky underside => a proper floating sky island (Section 3).
  world.addIslandBase(0, 0.4, 0, R * 2, 14, b.rock, b.accent);
  // raised throne cube (walkable top at 2.4)
  world.addSurface(0, 2.4, 0, 5, 5, b.accent, { thick: 2.4 });
  world.throne = { x: 0, z: 0, r: 3.2, y: 2.2 };

  for (let i = 0; i < CFG.MAX_PLAYERS; i++) {
    const a = (i / CFG.MAX_PLAYERS) * Math.PI * 2;
    world.spawnPoints.push({ x: Math.cos(a) * (R - 2), y: 1.4, z: Math.sin(a) * (R - 2) });
  }
  // sweeping bars to knock players off the throne (Task #3: two crossed bars)
  world.addRotor(0, 3.1, 0, 8, 1.1);
  world.addRotor(0, 3.5, 0, 6, -1.6);
  // pendulum hammers around edge (Task #3: was 4 -> now 8)
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    world.addHammer(Math.cos(a) * (R - 1), 6, Math.sin(a) * (R - 1), 3.2, rand(1.3, 1.8), a);
  }
  // a couple of pushers shoving inward from the rim toward the throne
  for (const side of [-1, 1]) {
    world.addPusher(side * (R - 0.5), 2.6, 0, 2.2, 2.2, 2.6, b.hazard, R - 3, rand(1.0, 1.5), Math.random() * 6);
  }
  // floating scenic pillars around the sky arena
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    world.addStructure(Math.cos(a) * (R + 12), -3, Math.sin(a) * (R + 12), 'tower', b.rock, b.accent);
  }
}

export function buildLevel(scene, roundCfg) {
  const world = new World(scene);
  world.biome = roundCfg.biome;
  if (roundCfg.type === 'race') buildRace(world, roundCfg);
  else if (roundCfg.type === 'survival') buildSurvival(world, roundCfg);
  else if (roundCfg.type === 'king') buildKing(world, roundCfg);
  // Merge all collected static terrain + decor into a few draw calls,
  // giving rich scenery + shadow casters for near-free render cost. (Bug #4)
  world.finalizeStatic();
  world.applyBiomeFog(scene);
  return world;
}
