import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// ============================================================
// World / Level system (Section 3).
// - Voxel platforms merged into low-vertex box geometry (we use
//   whole-slab boxes = the cheapest possible "greedy mesh": one
//   box per rectangular platform instead of per-voxel cubes).
// - Obstacles = parametric primitives with scripted sine/linear
//   motion, driven by the fixed-step sim (see updateObstacles).
// - Biomes are pure palette swaps of the same toolkit.
//
// PERFORMANCE (Bug #4 + cinematic pass):
//   ALL static scenery (terrain slabs + roadside decor) is COLLECTED
//   as raw box geometries during the build and MERGED at finalize()
//   into a tiny number of draw calls (one merged mesh per material).
//   This keeps <100 draw calls even with hundreds of props, and — key
//   for the "dramatic shadows" requirement — a merged static mesh
//   casts/receives shadows for essentially the cost of one object.
// ============================================================

export const BIOMES = {
  jungle: { ground: 0x4caf50, ground2: 0x66bb6a, accent: 0x795548, sky: 0x8fe3ff, fog: 0xbdf0d0, hazard: 0x2e7d32, friction: 1,
            deco1: 0x2e7d32, deco2: 0x1b5e20, rock: 0x6d7b6e, mountain: 0x5d7a4f, snow: 0xdff3e0, decoType: 'tree',
            sun: 0xfff4d6, amb: 0x9fdcff, fogNear: 42, fogFar: 150 },
  lava:   { ground: 0x5d4037, ground2: 0x795548, accent: 0xff5722, sky: 0xffab6b, fog: 0xffccaa, hazard: 0xff3d00, friction: 1,
            deco1: 0xbf360c, deco2: 0xff7043, rock: 0x4e342e, mountain: 0x6d4c41, snow: 0xffcc80, decoType: 'rock',
            sun: 0xffd9a0, amb: 0xff9d5c, fogNear: 34, fogFar: 130 },
  ice:    { ground: 0x81d4fa, ground2: 0xb3e5fc, accent: 0xe1f5fe, sky: 0xcaf0ff, fog: 0xe0f7ff, hazard: 0x0288d1, friction: 0.14,
            deco1: 0xb3e5fc, deco2: 0x4fc3f7, rock: 0x90caf9, mountain: 0xb0bec5, snow: 0xffffff, decoType: 'crystal',
            sun: 0xffffff, amb: 0xbfe9ff, fogNear: 40, fogFar: 150 },
  sky:    { ground: 0xfff8e1, ground2: 0xffe082, accent: 0xffd23f, sky: 0xb3e5ff, fog: 0xe8f4ff, hazard: 0x64b5f6, friction: 1,
            deco1: 0xffe082, deco2: 0xffd23f, rock: 0xe0e0e0, mountain: 0xeceff1, snow: 0xffffff, decoType: 'pillar',
            sun: 0xfff6e0, amb: 0xcfeaff, fogNear: 45, fogFar: 160 },
};

const _tmpMat = new THREE.Matrix4();
const _tmpColor = new THREE.Color();

// AABB platform description: {x,y,z centre, sx,sy,sz size}
// Collision uses these directly (Section 1: AABB vs voxel grid).
export class World {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.platforms = [];      // solid AABBs for collision
    this.ramps = [];          // sloped surfaces for collision (Task #3)
    this.obstacles = [];      // {type, mesh, aabb, update(dt,t)}
    this.hazards = [];        // lava planes etc (fall/kill zones handled by Y)
    this.startZ = 0;
    this.finishZ = 0;
    this.finishX = 0;
    this.spawnPoints = [];
    this.throne = null;       // king-of-hill zone {x,z,r}
    this.biome = 'jungle';
    this._t = 0;
    this._matCache = {};
    // Batched STATIC geometry, keyed by "colorHex" -> array of BoxGeometry
    // (already transformed to world space). Merged once at finalize().
    // decor = never collidable scenery; terrain = the merged visual twin
    // of solid platforms (collision still uses the AABB list separately).
    this._decorBatch = new Map();
    this._terrainBatch = new Map();
    this._mergedMeshes = [];
  }

  _mat(color) {
    if (!this._matCache[color]) {
      // MeshStandardMaterial gives real, view-dependent highlights +
      // proper shadow response for the "cinematic" look. It is still
      // cheap here: no textures, no normal maps — just a lit BRDF. All
      // scenery of one color shares ONE material instance.
      this._matCache[color] = new THREE.MeshStandardMaterial({
        color, roughness: 0.82, metalness: 0.04,
      });
    }
    return this._matCache[color];
  }

  // Collect a transformed box geometry into a per-color batch bucket.
  _batch(map, x, y, z, sx, sy, sz, color, rotY = 0) {
    const geo = new THREE.BoxGeometry(sx, sy, sz);
    if (rotY) geo.rotateY(rotY);
    geo.translate(x, y, z);
    let arr = map.get(color);
    if (!arr) { arr = []; map.set(color, arr); }
    arr.push(geo);
  }

  // Collect an ALREADY-transformed arbitrary geometry (cone, cylinder…) into a
  // per-color batch bucket. Lets organic shapes (smooth mountains, Task #3)
  // merge into the same near-zero-cost draw call as the box decor.
  _batchGeo(map, geo, color) {
    let arr = map.get(color);
    if (!arr) { arr = []; map.set(color, arr); }
    arr.push(geo);
  }

  // Add a solid platform. The COLLISION AABB is registered immediately;
  // the VISUAL is batched into the merged terrain mesh at finalize().
  // opts.dynamic (moving/blink platforms) => keep as its own live mesh.
  addPlatform(x, y, z, sx, sy, sz, color, opts = {}) {
    const aabb = { x, y, z, sx, sy, sz, ice: !!opts.ice, conveyor: opts.conveyor || null };
    this.platforms.push(aabb);
    if (opts.dynamic) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), this._mat(color));
      mesh.position.set(x, y, z);
      mesh.castShadow = true; mesh.receiveShadow = true;
      this.group.add(mesh);
      return { aabb, mesh };
    }
    this._batch(this._terrainBatch, x, y, z, sx, sy, sz, color);
    return aabb;
  }

  // Convenience: add a flat walkable slab whose TOP face is exactly at
  // `surfaceTop`. Keeps level code in walkable-surface coordinates so flats
  // and ramps line up seamlessly (Task #3 / fall-through fix).
  addSurface(x, surfaceTop, z, w, len, color, opts = {}) {
    const thick = opts.thick || 1.2;
    return this.addPlatform(x, surfaceTop - thick / 2, z, w, thick, len, color, opts);
  }

  // Pure DECORATION box — rendered but NOT collidable (scenery on the
  // sides of the track: rocks, trees, pillars, mountains). Batched so
  // the whole course's scenery costs only a handful of draw calls. (Bug #4)
  addDecor(x, y, z, sx, sy, sz, color, rotY = 0) {
    this._batch(this._decorBatch, x, y, z, sx, sy, sz, color, rotY);
  }

  // A flat DECORATIVE ground apron: a wide, thin merged slab that fills the
  // scenery band on both sides of the walkable lane so roadside props NEVER
  // hover over the void (Bug #3 / err1: floating trees & blocks). It sits at
  // `top` (a walkable-surface height) with a chunky downward skirt so an
  // elevated plateau reads as a solid mountainside instead of a floating strip.
  // Purely visual (decor batch) — collision is unchanged; one draw call per
  // colour for the whole course.
  addGroundApron(xCenter, z, w, len, top, color, skirt = 6) {
    const thick = 1.0;
    // top cap flush with the track surface
    this._batch(this._decorBatch, xCenter, top - thick / 2, z, w, thick, len, color);
    // solid skirt below so there is never a see-through gap under the props
    const sk = Math.max(0, skirt);
    if (sk > 0.2) {
      this._batch(this._decorBatch, xCenter, top - thick - sk / 2, z, w, sk, len, color);
    }
  }

  // A chunky underside for a floating arena island so it reads as a solid
  // hovering cube of rock (Section 3: "floating cube islands") rather than a
  // paper-thin slab. Decoration only — a couple of tapered boxes, merged.
  addIslandBase(x, topY, z, w, depth = 10, color = 0x6d4c41, accent = 0x5d4037) {
    // main body just under the walkable slab
    this._batch(this._decorBatch, x, topY - 0.6 - depth / 2, z, w * 0.98, depth, w * 0.98, color);
    // a tapered lower block for a rocky, pointed underside
    this._batch(this._decorBatch, x, topY - 0.6 - depth - depth * 0.35, z, w * 0.55, depth * 0.7, w * 0.55, accent);
  }

  // A voxel "tree": trunk + a couple of leaf blocks. Decoration only.
  // `groundY` is the true surface the tree's BASE rests on; the trunk is sunk
  // slightly (−0.2) so it always visually bites into the ground (never floats),
  // and the foliage is stacked directly on top of the trunk — fixing the
  // "detached foliage / floating tree" issue from err1.PNG.
  addTree(x, groundY, z, trunk = 0x795548, leaf = 0x2e7d32, scale = 1) {
    const base = groundY - 0.2;                       // sink the trunk into the ground
    const h = (2 + Math.random() * 1.5) * scale;
    this.addDecor(x, base + h / 2, z, 0.5 * scale, h, 0.5 * scale, trunk);
    const ls = (1.6 + Math.random()) * scale;
    const trunkTop = base + h;                          // foliage sits ON the trunk top
    this.addDecor(x, trunkTop + ls * 0.30, z, ls, ls, ls, leaf, Math.random());
    this.addDecor(x, trunkTop + ls * 0.85, z, ls * 0.62, ls * 0.62, ls * 0.62, leaf, Math.random());
  }

  // A SMOOTH sloped "mountain" (Task #3: natural elevation, ZERO steps/stairs).
  // Built from a single low-poly cone (6–8 radial segments) — organic sloped
  // sides instead of the old stacked-box staircase — plus a small snow-cap
  // cone. Both are batched into the merged decor mesh, so a whole mountain
  // range still costs only a couple of draw calls. Decoration only.
  addMountain(x, groundY, z, base = 8, height = 12, color = 0x8d6e63, snow = 0xffffff) {
    const seg = 6 + (Math.random() * 3 | 0);   // 6–8 sides: still reads round, stays cheap
    const r = base * 0.62;
    // main body cone
    const body = new THREE.ConeGeometry(r, height, seg, 1);
    body.rotateY(Math.random() * Math.PI);
    body.translate(x, groundY + height / 2, z);
    this._batchGeo(this._decorBatch, body, color);
    // snow cap: a smaller cone sitting on the upper third
    const capH = height * 0.34;
    const cap = new THREE.ConeGeometry(r * 0.4, capH, seg, 1);
    cap.rotateY(Math.random() * Math.PI);
    cap.translate(x, groundY + height - capH / 2, z);
    this._batchGeo(this._decorBatch, cap, snow);
  }

  // A tall roadside STRUCTURE (arch / ruin / tower) — richer scenery than
  // a plain rock. Purely decorative but reads as architecture. (Task #1)
  addStructure(x, groundY, z, kind, main, accent) {
    if (kind === 'arch') {
      const w = 5.5 + Math.random() * 2, h = 5 + Math.random() * 2, t = 0.9;
      this.addDecor(x - w / 2, groundY + h / 2, z, t, h, t, main);
      this.addDecor(x + w / 2, groundY + h / 2, z, t, h, t, main);
      this.addDecor(x, groundY + h + t / 2, z, w + t, t, t * 1.4, accent);
    } else if (kind === 'tower') {
      const levels = 3 + (Math.random() * 2 | 0);
      let w = 3.2 + Math.random();
      let hy = groundY;
      for (let i = 0; i < levels; i++) {
        const lh = 2.4;
        this.addDecor(x, hy + lh / 2, z, w, lh, w, i % 2 ? accent : main, 0);
        hy += lh; w *= 0.82;
      }
      this.addDecor(x, hy + 0.5, z, w * 1.4, 1, w * 1.4, accent, Math.PI / 4);
    } else { // ruin — scattered broken blocks
      for (let i = 0; i < 4; i++) {
        const bh = 1 + Math.random() * 3;
        this.addDecor(x + (Math.random() - 0.5) * 4, groundY + bh / 2, z + (Math.random() - 0.5) * 3,
          1 + Math.random() * 1.6, bh, 1 + Math.random() * 1.6, Math.random() < 0.5 ? main : accent, Math.random());
      }
    }
  }

  // A TRUE sloped ramp (Task #3: natural incline, ZERO steps/stairs).
  //   x        : lane centre X
  //   zLow     : Z of the LOW edge of the ramp
  //   zHigh    : Z of the HIGH edge of the ramp
  //   yLowTop  : WALKABLE surface height at the low edge
  //   yHighTop : WALKABLE surface height at the high edge
  //   w        : lane width
  //
  // Everything is expressed in WALKABLE-SURFACE heights so ramp ends line up
  // exactly with adjacent flat-platform tops (no seams / no drop-throughs).
  // Collision is a single analytic sloped plane (resolveEntity samples it),
  // so players glide smoothly up/down with no stepping. The VISUAL is one
  // slab, rotated to the slope angle, whose TOP face coincides with that
  // plane — what you see is exactly what you stand on.
  addRamp(x, zLow, zHigh, yLowTop, yHighTop, w, color) {
    const dz = zHigh - zLow;                 // signed run along Z
    const dy = yHighTop - yLowTop;            // signed rise
    const slopeZ = dz !== 0 ? dy / dz : 0;    // dy per +1 z

    const zMin = Math.min(zLow, zHigh), zMax = Math.max(zLow, zHigh);
    const yAtZmin = zLow <= zHigh ? yLowTop : yHighTop;

    // Analytic collision surface.
    this.ramps.push({
      x, sx: w, zMin, zMax, zRef: zMin, yRef: yAtZmin, slopeZ, solid: true,
    });

    // Visual slab. The TOP face must sit on the plane, so we place a slab of
    // thickness T whose centre is T/2 below the surface midpoint, then tilt.
    const run = Math.abs(dz);
    const len3d = Math.hypot(run, Math.abs(dy));
    const angle = Math.atan2(dy, dz);         // slope angle wrt +Z
    const T = 0.5;
    const midY = (yLowTop + yHighTop) / 2 - T / 2 * Math.cos(angle);
    const slab = new THREE.Mesh(new THREE.BoxGeometry(w, T, len3d), this._mat(color));
    slab.position.set(x, midY, (zLow + zHigh) / 2);
    slab.rotation.x = -angle;                 // +X rotation lowers the +Z end
    slab.castShadow = true; slab.receiveShadow = true;
    this.group.add(slab);

    // Solid skirt below the incline so there is never a see-through gap and
    // the mountain reads as massive. Purely visual (decor batch).
    const skirtH = Math.min(yLowTop, yHighTop);
    if (skirtH > 0.6) {
      this._batch(this._decorBatch, x, skirtH / 2, (zLow + zHigh) / 2, w * 0.98, skirtH, run, color);
    }
    return this.ramps[this.ramps.length - 1];
  }

  // A gently ROLLING ground stretch (Task #3: organic, seamless, zero stairs).
  // Lays a smooth sinusoidal height profile over [zFrom, zTo] as a chain of
  // short analytic ramps — because each ramp is a true sloped plane and each
  // shares its end height with the next, the surface is C0-continuous with NO
  // steps anywhere. Returns the surface height at zTo so the caller can keep
  // laying seamlessly. amp = how many units the ground rises/falls.
  addRollingStretch(x, zFrom, zTo, baseTop, w, color, amp = 0.9, waves = 1.4, phase = 0) {
    const total = zTo - zFrom;
    if (total <= 0) return baseTop;
    const N = Math.max(3, Math.round(total / 4.2));   // ~4-unit ramp pieces => smooth yet fewer AABBs
    // Height profile. A sin(π·t) window forces the profile to baseTop at BOTH
    // ends (t=0 and t=1) so this stretch connects SEAMLESSLY to the flat
    // segments before/after it — no seam, no step. The inner sine gives the
    // organic roll; an integer number of full waves would also close, but the
    // window guarantees it regardless of `waves`.
    const win = (t) => Math.sin(t * Math.PI);
    const h = (t) => baseTop + amp * win(t) * Math.sin(phase + t * waves * Math.PI * 2);
    let zPrev = zFrom, yPrev = h(0);   // == baseTop
    for (let i = 1; i <= N; i++) {
      const t = i / N;
      const zCur = zFrom + total * t;
      const yCur = h(t);
      this.addRamp(x, zPrev, zCur, yPrev, yCur, w, color);
      zPrev = zCur; yPrev = yCur;
    }
    return yPrev;   // == baseTop (window is 0 at t=1)
  }

  // Sample the ramp surface height at (x,z) if the point is over a ramp.
  // Returns null when not above any ramp. (Task #3 slope collision)
  rampHeightAt(x, z) {
    let best = null;
    for (const r of this.ramps) {
      if (r.solid === false) continue;
      if (x < r.x - r.sx / 2 || x > r.x + r.sx / 2) continue;
      if (z < r.zMin - 0.05 || z > r.zMax + 0.05) continue;
      const y = r.yRef + r.slopeZ * (z - r.zRef);
      if (best == null || y > best) best = y;
    }
    return best;
  }

  // Merge every collected static box into one mesh per color. Called once
  // at the end of level construction (see buildLevel). (Bug #4 / perf)
  finalizeStatic() {
    const build = (map, castShadow, receiveShadow) => {
      for (const [color, geos] of map) {
        if (!geos.length) continue;
        const merged = mergeGeometries(geos, false);
        for (const g of geos) g.dispose();
        if (!merged) continue;
        const mesh = new THREE.Mesh(merged, this._mat(color));
        mesh.castShadow = castShadow;
        mesh.receiveShadow = receiveShadow;
        mesh.matrixAutoUpdate = false;   // static: skip per-frame matrix work
        this.group.add(mesh);
        this._mergedMeshes.push(mesh);
      }
    };
    build(this._terrainBatch, true, true);
    build(this._decorBatch, true, false);   // decor casts but skips receiving (cheaper, still dramatic)
    this._terrainBatch.clear();
    this._decorBatch.clear();
  }

  clear() {
    // dispose geometries to keep heap low (Section 7: <300MB)
    this.group.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    this.scene.remove(this.group);
    this.group = new THREE.Group();
    this.scene.add(this.group);
    this.platforms = []; this.ramps = []; this.obstacles = []; this.hazards = [];
    this.spawnPoints = []; this.throne = null; this._t = 0;
    this._mergedMeshes = [];
    this._decorBatch.clear(); this._terrainBatch.clear();
  }

  // -------- Obstacle factory (modular library, Section 3) --------
  addHammer(x, y, z, reach = 3, speed = 1.6, phase = 0) {
    const g = new THREE.Group();
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, reach, 8), this._mat(0x9e9e9e));
    handle.position.y = -reach / 2;
    handle.castShadow = true;
    const head = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.1, 1.3), this._mat(0xff5252));
    head.position.y = -reach;
    head.castShadow = true;
    g.add(handle); g.add(head);
    g.position.set(x, y, z);
    this.group.add(g);
    const ob = {
      type: 'hammer', mesh: g, headHalf: 0.7, reach,
      hx: x, hy: y, hz: z,
      update: (dt, t) => {
        g.rotation.z = Math.sin(t * speed + phase) * 1.15;
      },
      // world position of hammer head for collision
      headPos: new THREE.Vector3(),
      getHead() {
        const a = g.rotation.z;
        this.headPos.set(x + Math.sin(a) * reach, y - Math.cos(a) * reach, z);
        return this.headPos;
      }
    };
    this.obstacles.push(ob);
    return ob;
  }

  addRotor(x, y, z, len = 5, speed = 1.4) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(len, 0.45, 0.65), this._mat(0xffb300));
    bar.position.set(x, y, z);
    bar.castShadow = true;
    this.group.add(bar);
    const ob = {
      type: 'rotor', mesh: bar, len, cx: x, cy: y, cz: z, speed,
      angle: 0,
      update(dt, t) { this.angle = t * speed; bar.rotation.y = this.angle; },
    };
    this.obstacles.push(ob);
    return ob;
  }

  addSpinPlatform(x, y, z, r = 3, speed = 0.6) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(r * 2, 0.5, r * 2), this._mat(0xba68c8));
    p.position.set(x, y, z);
    p.castShadow = true; p.receiveShadow = true;
    this.group.add(p);
    const aabb = { x, y, z, sx: r * 2, sy: 0.5, sz: r * 2, spin: true };
    this.platforms.push(aabb);
    const ob = { type: 'spin', mesh: p, update(dt, t) { p.rotation.y = t * speed; } };
    this.obstacles.push(ob);
    return ob;
  }

  // Disappearing floor tile (telegraphed flash before vanish).
  addBlinkTile(x, y, z, s, period = 3, offset = 0) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(s, 0.4, s), this._mat(0x26c6da).clone());
    mesh.position.set(x, y, z);
    mesh.receiveShadow = true;
    this.group.add(mesh);
    const aabb = { x, y, z, sx: s, sy: 0.4, sz: s, solid: true };
    this.platforms.push(aabb);
    const base = new THREE.Color(0x26c6da);
    const ob = {
      type: 'blink', mesh, aabb,
      update(dt, t) {
        const ph = ((t + offset) % period) / period; // 0..1
        if (ph > 0.72 && ph < 0.85) {
          // telegraph flash
          const f = Math.sin(t * 40) * 0.5 + 0.5;
          mesh.material.color.setRGB(1, f, f);
          mesh.material.emissive.setRGB(0.6, 0.1 * f, 0.1 * f);
          aabb.solid = true; mesh.visible = true;
        } else if (ph >= 0.85) {
          aabb.solid = false; mesh.visible = false;
        } else {
          mesh.material.color.copy(base); mesh.material.emissive.setRGB(0, 0, 0);
          aabb.solid = true; mesh.visible = true;
        }
      }
    };
    this.obstacles.push(ob);
    return ob;
  }

  addRollingDie(x, y, z, targetZ, speed = 6, size = 1.8) {
    const die = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), this._mat(0xf5f5f5));
    die.position.set(x, y, z);
    die.castShadow = true;
    this.group.add(die);
    const ob = {
      type: 'die', mesh: die, size, r: size / 2,
      z, startZ: z, targetZ, speed, x, y,
      update(dt) {
        this.z += this.speed * dt;
        if (this.z > this.targetZ) this.z = this.startZ;
        die.position.z = this.z;
        die.rotation.x = -this.z * (2 / this.size);
      }
    };
    this.obstacles.push(ob);
    return ob;
  }

  // Moving platform that slides back and forth (X or Z). Its collision
  // AABB tracks the mesh every tick so players ride it correctly. (Bug #4)
  addMovingPlatform(x, y, z, sx, sy, sz, color, axis = 'x', amp = 4, speed = 1, phase = 0) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), this._mat(color));
    mesh.position.set(x, y, z);
    mesh.castShadow = true; mesh.receiveShadow = true;
    this.group.add(mesh);
    const aabb = { x, y, z, sx, sy, sz, solid: true };
    this.platforms.push(aabb);
    const ob = {
      type: 'mover', mesh, aabb, base: { x, y, z }, axis, amp, speed, phase,
      update(dt, t) {
        const o = Math.sin(t * speed + phase) * amp;
        if (axis === 'x') { mesh.position.x = this.base.x + o; aabb.x = mesh.position.x; }
        else { mesh.position.z = this.base.z + o; aabb.z = mesh.position.z; }
      }
    };
    this.obstacles.push(ob);
    return ob;
  }

  // A "pusher" piston: a wall block that periodically shoves out across
  // the track, bumping players. Collidable + knockback. (Bug #4)
  addPusher(x, y, z, sx, sy, sz, color, reach = 3, speed = 1.4, phase = 0) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), this._mat(color));
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    this.group.add(mesh);
    const aabb = { x, y, z, sx, sy, sz, solid: true };
    this.platforms.push(aabb);
    const ob = {
      type: 'mover', mesh, aabb, base: { x, y, z }, axis: 'x', amp: reach, speed, phase,
      update(dt, t) {
        const o = (Math.sin(t * speed + phase) * 0.5 + 0.5) * reach;
        mesh.position.x = this.base.x + o; aabb.x = mesh.position.x;
      }
    };
    this.obstacles.push(ob);
    return ob;
  }

  addVineSwing(x, y, z, len = 4) {
    const g = new THREE.Group();
    const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, len, 6), this._mat(0x33691e));
    rope.position.y = -len / 2;
    rope.castShadow = true;
    g.add(rope); g.position.set(x, y, z); this.group.add(g);
    const ob = { type: 'vine', mesh: g, update(dt, t) { g.rotation.x = Math.sin(t * 1.1) * 0.6; } };
    this.obstacles.push(ob);
    return ob;
  }

  addFinishGate(x, y, z, w) {
    const c = 0x00e676;
    const post = new THREE.BoxGeometry(0.6, 4, 0.6);
    const l = new THREE.Mesh(post, this._mat(c)); l.position.set(x - w / 2, y + 2, z); l.castShadow = true;
    const r = new THREE.Mesh(post, this._mat(c)); r.position.set(x + w / 2, y + 2, z); r.castShadow = true;
    const top = new THREE.Mesh(new THREE.BoxGeometry(w, 0.6, 0.6), this._mat(c)); top.position.set(x, y + 4, z); top.castShadow = true;
    this.group.add(l); this.group.add(r); this.group.add(top);
    this.finishZ = z; this.finishX = x;
  }

  applyBiomeFog(scene) {
    const b = BIOMES[this.biome];
    scene.background = new THREE.Color(b.sky);
    scene.fog = new THREE.Fog(b.fog, b.fogNear || 40, b.fogFar || 140);
  }

  updateObstacles(dt) {
    this._t += dt;
    const t = this._t;
    for (const o of this.obstacles) o.update(dt, t);
  }
}
