import * as THREE from 'three';
import { getTrail } from './cosmetics.js';

// ============================================================
// Movement Trail System (Task #4).
//
// THE BUG IT FIXES: trails were stored/equipped and shown in the shop but
// NOTHING ever drew them — so an equipped trail was invisible while running.
// This module actually renders them.
//
// PERFORMANCE MODEL (Section 7): identical philosophy to the poof pool in
// character.js — every trail particle in the whole match shares ONE
// InstancedMesh PER SHAPE FAMILY. With 5 shape families that is at most ~5
// draw calls for ALL trails of ALL 32 players combined, regardless of how
// many trails are equipped. Particles are pure transform + per-instance
// colour writes; no per-particle objects on the GPU, no new geometry per
// skin/trail. Emission scales with the emitter's speed so the trail streams
// smoothly WHILE RUNNING (not only on jump/dive), and a burst is injected on
// jump/dive for a flashy pop.
//
// Each shape family has a distinct silhouette + material so the trails read
// as genuinely different effects (Task #4: "distinct particle/mesh anims"):
//   cube   : chunky rounded-ish box (bubbles / generic)
//   spark  : tiny bright box, fast spin, additive glow (sparkle / gold)
//   ember  : soft billboard-y box, additive, rises + fades (fire / void)
//   shard  : elongated crystal prism, additive (frost)
//   ribbon : thin flat plane that flutters (rainbow)
// ============================================================

const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
const _c2 = new THREE.Color();
const _hidden = new THREE.Matrix4().makeScale(0, 0, 0);

// Geometry per shape family (built once, shared by every particle).
function shapeGeometry(shape) {
  switch (shape) {
    case 'spark': return new THREE.BoxGeometry(1, 1, 1);
    case 'ember': return new THREE.BoxGeometry(1, 1, 1);
    case 'shard': return new THREE.BoxGeometry(0.5, 1.6, 0.5);   // elongated crystal
    case 'ribbon': {                                             // thin flat plane
      const g = new THREE.PlaneGeometry(1.4, 0.5);
      return g;
    }
    case 'cube':
    default: return new THREE.BoxGeometry(1, 1, 1);
  }
}

const SHAPES = ['cube', 'spark', 'ember', 'shard', 'ribbon'];

export class TrailSystem {
  constructor(scene, quality = {}) {
    this.scene = scene;
    // capacity per shape family — plenty for a 32-player lobby; low tier trims.
    const cap = quality.tier === 'low' ? 260 : quality.tier === 'high' ? 900 : 560;
    this.cap = cap;

    this.pools = {};      // shape -> { mesh, geo, parts:[] }
    for (const shape of SHAPES) {
      const geo = shapeGeometry(shape);
      const glow = shape !== 'cube';   // cube family = normal blend (bubbles read as solid)
      const mat = new THREE.MeshBasicMaterial({
        vertexColors: false,
        transparent: true,
        opacity: 1,
        depthWrite: false,                 // never occlude / z-fight the world
        blending: glow ? THREE.AdditiveBlending : THREE.NormalBlending,
        toneMapped: true,
      });
      const mesh = new THREE.InstancedMesh(geo, mat, cap);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
      mesh.frustumCulled = false;
      mesh.renderOrder = 2;              // draw over the world, under HUD
      mesh.count = 0;
      scene.add(mesh);
      this.pools[shape] = { mesh, geo, parts: [] };
    }
  }

  // Emit particles for an entity based on its current motion. Called every
  // render frame for every visible avatar. `boost` (0..1) is added emission
  // for jump/dive frames so the trail flares on take-off.
  emit(e, dt) {
    const trail = getTrail(e.trailId);
    if (!trail || trail.color == null) return;         // 'none' / off => nothing
    const pool = this.pools[trail.shape] || this.pools.cube;

    // Speed-driven emission: the faster you move, the denser the stream, so
    // it is clearly visible WHILE RUNNING and tapers when standing still.
    const speed = Math.hypot(e.vx || 0, e.vz || 0);
    const speedK = THREE.MathUtils.clamp(speed / 8, 0, 1.2);
    // airborne dive/jump => a livelier stream too
    const airK = (!e.grounded) ? 0.6 : 0;
    const rate = trail.emitPerSec * (0.25 + speedK + airK);

    // accumulate fractional particles per entity
    e._trailAcc = (e._trailAcc || 0) + rate * dt;
    let n = e._trailAcc | 0;
    e._trailAcc -= n;
    if (n > 8) n = 8;                                  // clamp per-frame spawn

    // spawn point: just behind the character's lower torso, so it streams
    // out from the feet/back as they run.
    const bx = Math.sin(e.yaw), bz = Math.cos(e.yaw);  // forward
    for (let i = 0; i < n; i++) this._spawn(pool, trail, e, bx, bz, speed, false);

    // burst on the exact frame a jump/dive starts (flashy pop, Task #4)
    if (e._trailBurst) {
      e._trailBurst = false;
      const b = trail.burst | 0;
      for (let i = 0; i < b; i++) this._spawn(pool, trail, e, bx, bz, speed, true);
    }
  }

  _spawn(pool, trail, e, bx, bz, speed, isBurst) {
    if (pool.parts.length >= this.cap) return;
    // position slightly behind + around the body
    const spread = trail.spread || 0.8;
    const px = e.x - bx * 0.25 + (Math.random() - 0.5) * spread;
    const py = e.y + 0.5 + Math.random() * 0.9;
    const pz = e.z - bz * 0.25 + (Math.random() - 0.5) * spread;
    // velocity: trail lags behind (opposite the facing) + scatter + burst kick
    const kick = isBurst ? 2.2 : 0.6;
    const vx = -bx * (0.4 + speed * 0.05) + (Math.random() - 0.5) * spread * 2;
    const vz = -bz * (0.4 + speed * 0.05) + (Math.random() - 0.5) * spread * 2;
    const vy = (Math.random() * 0.6) * (isBurst ? 1.8 : 1) + kick * 0.4;
    pool.parts.push({
      x: px, y: py, z: pz,
      vx: vx * kick, vy: vy, vz: vz * kick,
      life: trail.life, max: trail.life,
      rot: Math.random() * Math.PI * 2,
      rx: Math.random() * Math.PI, rz: Math.random() * Math.PI,
      trail,
    });
  }

  // Advance + write all trail particles. One pass per shape pool.
  update(dt) {
    for (const shape of SHAPES) {
      const pool = this.pools[shape];
      const arr = pool.parts;
      // integrate + cull
      for (let i = arr.length - 1; i >= 0; i--) {
        const p = arr[i];
        p.life -= dt;
        if (p.life <= 0) { arr.splice(i, 1); continue; }
        const t = p.trail;
        p.vy += (t.gravity || 0) * dt;
        const d = Math.max(0, 1 - (t.drag || 1.5) * dt);
        p.vx *= d; p.vz *= d;
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        p.rot += (t.spin || 0) * dt;
      }
      // write instances
      const mesh = pool.mesh;
      const n = Math.min(arr.length, this.cap);
      for (let i = 0; i < n; i++) {
        const p = arr[i];
        const t = p.trail;
        const k = p.life / p.max;                      // 1 -> 0
        // size eases: pop in slightly then shrink to nothing
        const grow = k > 0.85 ? (1 - k) / 0.15 : 1;    // 0..1 quick pop-in
        const sz = (t.size || 0.2) * (0.25 + k * 0.85) * grow;

        // colour: rainbow cycles hue; others lerp color -> color2 over life
        if (t.rainbow) {
          _c.setHSL(((1 - k) * 0.9 + performance.now() * 0.0002) % 1, 0.85, 0.6);
        } else if (t.color2 != null) {
          _c.setHex(t.color); _c2.setHex(t.color2);
          _c.lerp(_c2, 1 - k);
        } else {
          _c.setHex(t.color);
        }
        // fade via colour scaling (additive) so it dissolves smoothly
        const fade = t.glow ? (0.35 + k * 0.65) : 1;
        _c.multiplyScalar(fade);

        // orientation per shape: ribbons flutter, sparks/shards spin
        if (shape === 'ribbon') _e.set(p.rx + p.rot, p.rot * 0.5, p.rz);
        else _e.set(p.rot * 0.6, p.rot, p.rot * 0.3);
        _q.setFromEuler(_e);
        _s.set(sz, sz, sz);
        _m.compose(_p.set(p.x, p.y, p.z), _q, _s);
        mesh.setMatrixAt(i, _m);
        mesh.setColorAt(i, _c);
      }
      mesh.count = n;
      if (n > 0) {
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      }
    }
  }

  // Drop every live particle (used on round rebuild so trails don't linger).
  clear() {
    for (const shape of SHAPES) {
      this.pools[shape].parts.length = 0;
      this.pools[shape].mesh.count = 0;
    }
  }
}
