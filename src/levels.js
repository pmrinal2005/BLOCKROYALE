import { World, BIOMES } from './world.js';
import { CFG } from './config.js';

// ============================================================
// Level composition (Section 3): assemble maps from the modular
// obstacle/terrain library. Each round type produces a course.
// Deterministic-ish layout with light randomness for variety.
// ============================================================

function rand(min, max) { return min + Math.random() * (max - min); }
function pick(arr) { return arr[(Math.random() * arr.length) | 0]; }

// Scatter scenery along the sides of the track for the given Z range at
// the current surface height. Decoration only — never touches collision.
function decorateSides(world, b, zFrom, zTo, surfaceY, laneHalf) {
  const outer = laneHalf + 3;
  for (let z = zFrom; z < zTo; z += rand(5, 9)) {
    for (const side of [-1, 1]) {
      const x = side * (outer + rand(0, 6));
      const r = Math.random();
      if (b.decoType === 'tree') {
        if (r < 0.6) world.addTree(x, surfaceY, z, b.accent, b.deco1, rand(0.8, 1.5));
        else world.addDecor(x, surfaceY + 0.6, z, rand(1, 2.4), rand(1, 2), rand(1, 2.4), b.rock, Math.random());
      } else if (b.decoType === 'rock') {
        world.addDecor(x, surfaceY + rand(0.5, 1.5), z, rand(1.2, 3), rand(1.4, 3.5), rand(1.2, 3), r < 0.4 ? b.deco1 : b.rock, Math.random());
      } else if (b.decoType === 'crystal') {
        const h = rand(2, 4.5);
        world.addDecor(x, surfaceY + h / 2, z, rand(0.6, 1.3), h, rand(0.6, 1.3), r < 0.5 ? b.deco2 : b.deco1, Math.random());
      } else { // pillar (sky)
        const h = rand(3, 6);
        world.addDecor(x, surfaceY + h / 2, z, rand(0.9, 1.6), h, rand(0.9, 1.6), b.rock, 0);
        world.addDecor(x, surfaceY + h + 0.3, z, rand(1.4, 2), 0.6, rand(1.4, 2), b.accent, 0);
      }
    }
    // occasional distant mountain for a mountainous skyline
    if (Math.random() < 0.25) {
      const side = Math.random() < 0.5 ? -1 : 1;
      world.addMountain(side * (outer + rand(10, 20)), surfaceY - 2, z + rand(-4, 4),
        rand(8, 14), rand(10, 20), b.mountain, b.snow);
    }
  }
}

// Build a LONGER race gauntlet with elevation changes (ramps up onto
// mountainous plateaus and back down), gaps, side scenery and a rich mix
// of obstacles — all still merged/instanced boxes for performance. (Bug #4)
function buildRace(world, cfg) {
  const b = BIOMES[cfg.biome];
  const laneW = 16;
  const laneHalf = laneW / 2;
  world.laneHalf = laneHalf;
  // Longer than before: round 3 (sprint) is a touch shorter than round 1.
  const length = cfg.name && cfg.name.includes('3') ? 200 : 240;
  world.startZ = 0;
  const ice = cfg.biome === 'ice';

  // start pad
  world.addPlatform(0, 0, -6, laneW, 1, 14, b.ground2, { shadow: true });
  for (let i = 0; i < CFG.MAX_PLAYERS; i++) {
    const col = i % 8, row = (i / 8) | 0;
    world.spawnPoints.push({ x: -laneW / 2 + 2 + col * 1.7, y: 1.2, z: -10 + row * 1.6 });
  }
  decorateSides(world, b, -14, 2, 0.5, laneHalf);

  // Walk the course, carrying a running surface height `y` so we can build
  // hills. Each iteration lays one segment + its obstacle theme.
  let z = 4;
  let y = 0;          // top surface of current segment sits at y + 0.5
  let seg = 0;
  const themes = ['hammers', 'rotor', 'dice', 'blink', 'movers', 'pusher', 'vines', 'clear'];

  while (z < length) {
    // --- optional gap the player must jump/dive across ---
    const gap = (seg > 1 && Math.random() < 0.3) ? rand(2.4, 4.0) : 0;
    if (gap > 0) z += gap;

    // --- optional elevation change: ramp up or down onto a plateau ---
    const doHill = seg > 0 && Math.random() < 0.4;
    if (doHill) {
      const dir = (y <= 0.01 || Math.random() < 0.6) ? 1 : -1; // prefer up
      const rise = dir * rand(3, 6);
      const run = rand(7, 11);
      world.addRamp(0, y, z + run / 2, laneW, rise, run, 1, b.accent);
      z += run;
      y = Math.max(0, y + rise);
    }

    const segLen = rand(12, 18);
    const surfaceY = y;
    const midZ = z + segLen / 2;
    world.addPlatform(0, surfaceY, midZ, laneW, 1, segLen, seg % 2 ? b.ground : b.ground2, { ice, shadow: true });

    // side railings on elevated plateaus so it reads as a mountain path
    if (surfaceY > 1) {
      for (const side of [-1, 1]) {
        world.addDecor(side * (laneHalf - 0.3), surfaceY + 1.0, midZ, 0.4, 1.4, segLen, b.accent);
      }
    }
    decorateSides(world, b, z - 2, z + segLen + 2, surfaceY + 0.5, laneHalf);

    // --- obstacle theme for this segment ---
    const top = surfaceY + 1;   // walkable surface height
    const kind = themes[(Math.random() * themes.length) | 0];
    if (kind === 'hammers') {
      const n = 2 + (Math.random() * 3 | 0);
      for (let i = 0; i < n; i++)
        world.addHammer(rand(-5, 5), top + 5.5, midZ + (i - n / 2) * 2.6, 3.4, rand(1.2, 2.0), rand(0, 6));
    } else if (kind === 'rotor') {
      world.addRotor(0, top + 0.9, midZ, rand(8, 12), rand(1.0, 1.8) * (Math.random() < .5 ? 1 : -1));
      if (Math.random() < 0.5)
        world.addRotor(0, top + 1.6, midZ + rand(-4, 4), rand(6, 10), rand(1.0, 1.6) * (Math.random() < .5 ? 1 : -1));
    } else if (kind === 'dice') {
      const n = 1 + (Math.random() * 2 | 0);
      for (let i = 0; i < n; i++)
        world.addRollingDie(rand(-5, 5), top - 0.1, z - 2, z + segLen + 2, rand(5, 9), rand(1.6, 2.2));
    } else if (kind === 'blink') {
      for (let i = 0; i < 6; i++)
        world.addBlinkTile(rand(-5, 5), top, z + 2 + i * (segLen / 7), 2.4, rand(2.5, 4), rand(0, 3));
    } else if (kind === 'movers') {
      const n = 1 + (Math.random() * 2 | 0);
      for (let i = 0; i < n; i++)
        world.addMovingPlatform(rand(-3, 3), top + 0.1, midZ + (i - n / 2) * 4, rand(3, 4.5), 0.6, rand(3, 4.5),
          b.accent, 'x', rand(3, 5), rand(0.8, 1.4), rand(0, 6));
    } else if (kind === 'pusher') {
      for (const side of [-1, 1]) {
        world.addPusher(side * (laneHalf + 1), top + 1, midZ, 2.4, 2.4, 3, b.hazard,
          laneHalf, rand(1.0, 1.6), Math.random() * 6);
      }
    } else if (kind === 'vines') {
      for (let i = 0; i < 3; i++) world.addVineSwing(rand(-5, 5), top + 6, midZ + i * 3, 4);
    }

    z += segLen;
    seg++;
  }

  // ramp back down to a ground-level finish if we ended up high
  if (y > 1) {
    const run = 9;
    world.addRamp(0, y, z + run / 2, laneW, -y, run, 1, b.accent);
    z += run; y = 0;
  }

  // finish pad + gate
  world.addPlatform(0, y, z + 6, laneW + 4, 1, 12, b.accent, { shadow: true });
  decorateSides(world, b, z, z + 14, y + 0.5, laneHalf + 2);
  world.addFinishGate(0, y + 0.5, z + 2, 6);
  world.finishZ = z + 2;
}

// Survival arena: circular-ish platform with sweeping hammers.
function buildSurvival(world, cfg) {
  const b = BIOMES[cfg.biome];
  const R = 13;
  world.addPlatform(0, 0, 0, R * 2, 1, R * 2, b.ground);
  world.addPlatform(0, 0.5, 0, R * 2 - 3, 0.3, R * 2 - 3, b.ground2);

  // spawn ring
  for (let i = 0; i < CFG.MAX_PLAYERS; i++) {
    const a = (i / CFG.MAX_PLAYERS) * Math.PI * 2;
    world.spawnPoints.push({ x: Math.cos(a) * (R - 3), y: 1.3, z: Math.sin(a) * (R - 3) });
  }

  // central rotating bars that sweep the floor
  world.addRotor(0, 1.4, 0, R * 1.8, 0.9);
  world.addRotor(0, 1.9, 0, R * 1.4, -1.3);
  // ring of pendulum hammers
  const n = 8;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    world.addHammer(Math.cos(a) * (R - 1), 6, Math.sin(a) * (R - 1), 3.4, rand(1.2, 1.8), a);
  }
  // blink tiles near edge to shrink safe zone over time
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    world.addBlinkTile(Math.cos(a) * (R - 2), 1.0, Math.sin(a) * (R - 2), 2.6, rand(3, 5), rand(0, 4));
  }
  world.survivalArena = { R };
}

// King of the block: shrinking central throne platform.
function buildKing(world, cfg) {
  const b = BIOMES[cfg.biome];
  const R = 9;
  world.addPlatform(0, 0, 0, R * 2, 1, R * 2, b.ground2);
  // raised throne cube
  world.addPlatform(0, 1.4, 0, 5, 1.8, 5, b.accent);
  world.throne = { x: 0, z: 0, r: 3.2, y: 2.4 };

  for (let i = 0; i < CFG.MAX_PLAYERS; i++) {
    const a = (i / CFG.MAX_PLAYERS) * Math.PI * 2;
    world.spawnPoints.push({ x: Math.cos(a) * (R - 2), y: 1.3, z: Math.sin(a) * (R - 2) });
  }
  // sweeping bar to knock players off the throne
  world.addRotor(0, 2.9, 0, 8, 1.1);
  // pendulum hammers around edge
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    world.addHammer(Math.cos(a) * (R - 1), 6, Math.sin(a) * (R - 1), 3.2, 1.5, a);
  }
}

export function buildLevel(scene, roundCfg) {
  const world = new World(scene);
  world.biome = roundCfg.biome;
  if (roundCfg.type === 'race') buildRace(world, roundCfg);
  else if (roundCfg.type === 'survival') buildSurvival(world, roundCfg);
  else if (roundCfg.type === 'king') buildKing(world, roundCfg);
  world.applyBiomeFog(scene);
  return world;
}
