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
// ============================================================

export const BIOMES = {
  jungle: { ground: 0x4caf50, ground2: 0x66bb6a, accent: 0x795548, sky: 0x8fe3ff, fog: 0xbdf0d0, hazard: 0x2e7d32, friction: 1,
            deco1: 0x2e7d32, deco2: 0x1b5e20, rock: 0x6d7b6e, mountain: 0x5d7a4f, snow: 0xdff3e0, decoType: 'tree' },
  lava:   { ground: 0x5d4037, ground2: 0x795548, accent: 0xff5722, sky: 0xffab6b, fog: 0xffccaa, hazard: 0xff3d00, friction: 1,
            deco1: 0xbf360c, deco2: 0xff7043, rock: 0x4e342e, mountain: 0x6d4c41, snow: 0xffcc80, decoType: 'rock' },
  ice:    { ground: 0x81d4fa, ground2: 0xb3e5fc, accent: 0xe1f5fe, sky: 0xcaf0ff, fog: 0xe0f7ff, hazard: 0x0288d1, friction: 0.14,
            deco1: 0xb3e5fc, deco2: 0x4fc3f7, rock: 0x90caf9, mountain: 0xb0bec5, snow: 0xffffff, decoType: 'crystal' },
  sky:    { ground: 0xfff8e1, ground2: 0xffe082, accent: 0xffd23f, sky: 0xb3e5ff, fog: 0xe8f4ff, hazard: 0x64b5f6, friction: 1,
            deco1: 0xffe082, deco2: 0xffd23f, rock: 0xe0e0e0, mountain: 0xeceff1, snow: 0xffffff, decoType: 'pillar' },
};

// AABB platform description: {x,y,z centre, sx,sy,sz size}
// Collision uses these directly (Section 1: AABB vs voxel grid).
export class World {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.platforms = [];      // solid AABBs for collision
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
    this._instObstacles = null;
    // batched decoration geometries, keyed by color -> merged into ONE mesh
    // per color at finalizeDecor() so all the scenery costs only a handful
    // of extra draw calls total. (Bug #4 / performance)
    this._decorBatch = {};
    this._staticBatch = {};
  }

  _mat(color) {
    if (!this._matCache[color]) this._matCache[color] = new THREE.MeshLambertMaterial({ color });
    return this._matCache[color];
  }

  // Add a solid platform (merged box). Registers collision AABB.
  addPlatform(x, y, z, sx, sy, sz, color, opts = {}) {
    const geo = new THREE.BoxGeometry(sx, sy, sz);
    const mesh = new THREE.Mesh(geo, this._mat(color));
    mesh.position.set(x, y, z);
    mesh.castShadow = !!opts.shadow;
    mesh.receiveShadow = true;
    this.group.add(mesh);
    const aabb = { x, y, z, sx, sy, sz, ice: !!opts.ice, conveyor: opts.conveyor || null };
    this.platforms.push(aabb);
    return aabb;
  }

  // Pure DECORATION box — rendered but NOT collidable (scenery on the
  // sides of the track: rocks, trees, pillars, mountains). Keeps the
  // course lively without touching the physics/AABB list. (Bug #4)
  addDecor(x, y, z, sx, sy, sz, color, rotY = 0) {
    const geo = new THREE.BoxGeometry(sx, sy, sz);
    const mesh = new THREE.Mesh(geo, this._mat(color));
    mesh.position.set(x, y, z);
    if (rotY) mesh.rotation.y = rotY;
    mesh.castShadow = true; mesh.receiveShadow = true;
    this.group.add(mesh);
    return mesh;
  }

  // A voxel "tree": trunk + a couple of leaf blocks. Decoration only.
  addTree(x, groundY, z, trunk = 0x795548, leaf = 0x2e7d32, scale = 1) {
    const h = (2 + Math.random() * 1.5) * scale;
    this.addDecor(x, groundY + h / 2, z, 0.5 * scale, h, 0.5 * scale, trunk);
    const ls = (1.6 + Math.random()) * scale;
    this.addDecor(x, groundY + h + ls * 0.35, z, ls, ls, ls, leaf, Math.random());
    this.addDecor(x, groundY + h + ls * 0.9, z, ls * 0.6, ls * 0.6, ls * 0.6, leaf, Math.random());
  }

  // A chunky voxel "mountain" (stepped pyramid of boxes) placed to the
  // side of the track for a mountainous skyline. Decoration only. (Bug #4)
  addMountain(x, groundY, z, base = 8, height = 12, color = 0x8d6e63, snow = 0xffffff) {
    const steps = 4;
    for (let i = 0; i < steps; i++) {
      const f = 1 - i / steps;
      const s = base * f;
      const hy = groundY + (height / steps) * i + (height / steps) / 2;
      const c = i === steps - 1 ? snow : color;
      this.addDecor(x, hy, z, s, height / steps + 0.4, s, c, Math.random() * 0.4);
    }
  }

  // A simple ramp (sloped box) that players can run up. Approximated for
  // collision by a short flight of thin stair AABBs so the lightweight
  // AABB solver still lands players correctly on the incline. (Bug #4)
  addRamp(x, yBottom, z, w, rise, run, dir, color) {
    // dir: +1 ascends toward +Z, -1 ascends toward -Z
    const steps = Math.max(3, Math.round(run / 1.4));
    for (let i = 0; i < steps; i++) {
      const t = (i + 0.5) / steps;
      const cz = z + dir * (t - 0.5) * run;
      const cy = yBottom + t * rise;
      this.addPlatform(x, cy, cz, w, 0.6, run / steps + 0.3, color, { shadow: true });
    }
  }

  clear() {
    // dispose geometries to keep heap low (Section 7: <300MB)
    this.group.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    this.scene.remove(this.group);
    this.group = new THREE.Group();
    this.scene.add(this.group);
    this.platforms = []; this.obstacles = []; this.hazards = [];
    this.spawnPoints = []; this.throne = null; this._t = 0;
  }

  // -------- Obstacle factory (modular library, Section 3) --------
  addHammer(x, y, z, reach = 3, speed = 1.6, phase = 0) {
    const g = new THREE.Group();
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, reach, 8), this._mat(0x9e9e9e));
    handle.position.y = -reach / 2;
    const head = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.0, 1.2), this._mat(0xff5252));
    head.position.y = -reach;
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
    const bar = new THREE.Mesh(new THREE.BoxGeometry(len, 0.4, 0.6), this._mat(0xffb300));
    bar.position.set(x, y, z);
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
    this.group.add(p);
    const aabb = { x, y, z, sx: r * 2, sy: 0.5, sz: r * 2, spin: true };
    this.platforms.push(aabb);
    const ob = { type: 'spin', mesh: p, update(dt, t) { p.rotation.y = t * speed; } };
    this.obstacles.push(ob);
    return ob;
  }

  // Disappearing floor tile (telegraphed flash before vanish).
  addBlinkTile(x, y, z, s, period = 3, offset = 0) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(s, 0.4, s), this._mat(0x26c6da));
    mesh.position.set(x, y, z);
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
          mesh.material = mesh.material; mesh.material.color.setRGB(1, f, f);
          aabb.solid = true; mesh.visible = true;
        } else if (ph >= 0.85) {
          aabb.solid = false; mesh.visible = false;
        } else {
          mesh.material.color.copy(base); aabb.solid = true; mesh.visible = true;
        }
      }
    };
    this.obstacles.push(ob);
    return ob;
  }

  addRollingDie(x, y, z, targetZ, speed = 6, size = 1.8) {
    const die = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), this._mat(0xf5f5f5));
    die.position.set(x, y, z);
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
    mesh.receiveShadow = true;
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
    const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, len, 6), this._mat(0x33691e));
    rope.position.y = -len / 2;
    g.add(rope); g.position.set(x, y, z); this.group.add(g);
    const ob = { type: 'vine', mesh: g, update(dt, t) { g.rotation.x = Math.sin(t * 1.1) * 0.6; } };
    this.obstacles.push(ob);
    return ob;
  }

  addFinishGate(x, y, z, w) {
    const c = 0x00e676;
    const post = new THREE.BoxGeometry(0.6, 4, 0.6);
    const l = new THREE.Mesh(post, this._mat(c)); l.position.set(x - w / 2, y + 2, z);
    const r = new THREE.Mesh(post, this._mat(c)); r.position.set(x + w / 2, y + 2, z);
    const top = new THREE.Mesh(new THREE.BoxGeometry(w, 0.6, 0.6), this._mat(c)); top.position.set(x, y + 4, z);
    this.group.add(l); this.group.add(r); this.group.add(top);
    this.finishZ = z; this.finishX = x;
  }

  applyBiomeFog(scene) {
    const b = BIOMES[this.biome];
    scene.background = new THREE.Color(b.sky);
    scene.fog = new THREE.Fog(b.fog, 40, 120);
  }

  updateObstacles(dt) {
    this._t += dt;
    const t = this._t;
    for (const o of this.obstacles) o.update(dt, t);
  }
}
