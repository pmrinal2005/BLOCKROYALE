import * as THREE from 'three';
import { getSkin, getHat, HATS } from './cosmetics.js';

// ============================================================
// Voxel character rig (Section 2).
// PERFORMANCE MODEL: instead of a Group per player (32 groups *
// ~7 meshes = 224 draw calls), we use ONE InstancedMesh per body
// part shared across every avatar. 32 players => ~7 draw calls
// total for all characters. Colors are per-instance via
// instanceColor. Blob shadows are a second instanced quad pool.
//
// Each "part" is a unit box; per frame we compute a world matrix
// per player per part from the animation pose and write it into
// the instance buffer. All matrix math is plain, no skinning.
// ============================================================

// Body parts (Task #2: 'hat' removed here — hats are now multi-piece 3D
// models rendered by the dedicated HatPool below, not a single body box).
const PARTS = ['head', 'torso', 'armL', 'armR', 'legL', 'legR'];

// Base local dimensions of each part (relative to player origin at feet).
const DIMS = {
  head:  { size: [0.9, 0.9, 0.9],  pivot: [0, 1.55, 0] },
  torso: { size: [0.85, 0.95, 0.6], pivot: [0, 0.9, 0] },
  armL:  { size: [0.26, 0.8, 0.26], pivot: [-0.58, 1.28, 0] },
  armR:  { size: [0.26, 0.8, 0.26], pivot: [ 0.58, 1.28, 0] },
  legL:  { size: [0.3, 0.85, 0.3],  pivot: [-0.22, 0.42, 0] },
  legR:  { size: [0.3, 0.85, 0.3],  pivot: [ 0.22, 0.42, 0] },
};

// Y (in avatar-local units, feet=0) of the TOP of the head cube — the pivot
// origin every hat piece is authored relative to (see HATS[].parts).
const HEAD_TOP_Y = DIMS.head.pivot[1] + DIMS.head.size[1] / 2;  // 1.55 + 0.45 = 2.0

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _qFlip = new THREE.Quaternion();
const _euler = new THREE.Euler();
const _pos = new THREE.Vector3();
const _scl = new THREE.Vector3();
const _color = new THREE.Color();
const _hidden = new THREE.Matrix4().makeScale(0, 0, 0); // collapse to hide

// Height (in local avatar units) about which the dive front-flip rotates —
// roughly the body's centre of mass so the tumble looks natural. (Task #2)
const FLIP_PIVOT_Y = 0.95;

// Apply a forward FLIP to a part's LOCAL (pre-yaw) offset. `flip` is the
// rotation angle (radians) around the +X axis about FLIP_PIVOT_Y. Returns the
// flipped local offset in-place via _pos, and rotates the given quaternion.
// Local frame: +Z is the avatar's facing direction, +Y up. A forward flip is
// a rotation around +X (so the head tucks forward toward +Z).
function applyFlip(lx, ly, lz, flip, q) {
  if (!flip) { _pos.set(lx, ly, lz); return; }
  const dy = ly - FLIP_PIVOT_Y;
  const c = Math.cos(flip), s = Math.sin(flip);
  // rotate (dy, lz) in the Y-Z plane around +X
  const ny = dy * c - lz * s;
  const nz = dy * s + lz * c;
  _pos.set(lx, FLIP_PIVOT_Y + ny, nz);
  _euler.set(flip, 0, 0);
  _qFlip.setFromEuler(_euler);
  q.premultiply(_qFlip);
}

export class CharacterPool {
  constructor(scene, capacity, quality = { charShadows: false }) {
    this.capacity = capacity;
    this.meshes = {};
    // Real per-limb shadows on high/mid tiers; blob decals on low tier.
    this.realShadows = !!quality.charShadows;
    const geo = new THREE.BoxGeometry(1, 1, 1);
    // MeshStandardMaterial => the avatars pick up the same cinematic lighting
    // (directional highlights + shadow) as the world. Still one material,
    // still fully instanced: ~7 draw calls for all 32 players.
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.7, metalness: 0.05 });

    for (const p of PARTS) {
      const m = new THREE.InstancedMesh(geo, mat.clone(), capacity);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false;
      // enable per-instance color
      m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
      // Torso/head/legs cast (arms/hat skipped to trim shadow draw work).
      m.castShadow = this.realShadows && (p === 'torso' || p === 'head' || p === 'legL' || p === 'legR');
      m.receiveShadow = false;
      scene.add(m);
      this.meshes[p] = m;
    }

    // Blob shadow pool (flat dark circles) — used only on the low tier where
    // real shadow maps are disabled, so we still ground the characters.
    const shadowGeo = new THREE.CircleGeometry(0.55, 12);
    shadowGeo.rotateX(-Math.PI / 2);
    const shadowMat = new THREE.MeshBasicMaterial({ color: 0x0a0f1f, transparent: true, opacity: 0.28, depthWrite: false });
    this.shadow = new THREE.InstancedMesh(shadowGeo, shadowMat, capacity);
    this.shadow.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.shadow.frustumCulled = false;
    this.shadow.renderOrder = 1;
    this.shadow.visible = !this.realShadows;
    scene.add(this.shadow);

    // Eliminated "poof" particle pool (tiny instanced cubes) — Section 2.
    const pGeo = new THREE.BoxGeometry(0.18, 0.18, 0.18);
    const pMat = new THREE.MeshBasicMaterial({ vertexColors: false });
    this.poofCap = 160;
    this.poof = new THREE.InstancedMesh(pGeo, pMat, this.poofCap);
    this.poof.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.poof.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.poofCap * 3), 3);
    this.poof.frustumCulled = false;
    scene.add(this.poof);
    this.poofParts = []; // {pos, vel, life, color}

    // ---- 3D hat pool (Task #2) ----
    // Multi-piece stylized hats, still fully instanced. We share ONE
    // InstancedMesh per primitive geometry type (box / cylinder / cone). The
    // worst-case piece count is (capacity players) × (max pieces in any hat),
    // so a full 32-player lobby of crowns is still just ~3 draw calls.
    this.hatPool = new HatPool(scene, capacity, this.realShadows);
  }

  // Compute a limb's world matrix given player transform + local rotation.
  _setPart(mesh, idx, part, px, py, pz, yaw, rot, skinColor, pose) {
    const d = DIMS[part];
    // local pivot then rotation around pivot then player world transform
    const [sx, sy, sz] = d.size;
    const [ox, oy, oz] = d.pivot;

    // limb pivot (top of limb) — rotate the box hanging below pivot for arms/legs
    _euler.set(rot.x || 0, rot.y || 0, rot.z || 0, 'XYZ');
    _q.setFromEuler(_euler);

    // offset of box center from its pivot (arms/legs hang down)
    let cx = 0, cy = 0, cz = 0;
    if (part === 'armL' || part === 'armR') cy = -sy / 2 + 0.05;
    else if (part === 'legL' || part === 'legR') cy = -sy / 2;

    // rotate offset
    _pos.set(cx, cy, cz).applyQuaternion(_q);
    // local position = pivot + rotated offset + pose bob
    let lx = ox + _pos.x;
    let ly = oy + _pos.y + (pose.bob || 0);
    let lz = oz + _pos.z;

    // dive FRONT-FLIP: rotate the whole limb about the body pivot (Task #2)
    const flip = pose.flip || 0;
    applyFlip(lx, ly, lz, flip, _q);
    lx = _pos.x; ly = _pos.y; lz = _pos.z;

    // apply player yaw around Y to whole limb position
    const cosY = Math.cos(yaw), sinY = Math.sin(yaw);
    const wx = lx * cosY + lz * sinY;
    const wz = -lx * sinY + lz * cosY;

    // combined rotation: player yaw * (flip * limb rot) (reuse _q2 to avoid GC)
    _euler.set(0, yaw, 0);
    _q2.setFromEuler(_euler);
    _q2.multiply(_q);

    _scl.set(sx, sy, sz);
    _m.compose(_pos.set(px + wx, py + ly, pz + wz), _q2, _scl);
    mesh.setMatrixAt(idx, _m);
    _color.setHex(skinColor);
    mesh.setColorAt(idx, _color);
  }

  // Update one avatar's instances from its render state.
  writeAvatar(idx, av) {
    const skin = getSkin(av.skinId);
    const hat = getHat(av.hatId);
    const pose = av.pose;
    const yaw = av.yaw;
    const { x, y, z } = av;

    const stumbleRoll = pose.stumble || 0;

    // head (with subtle look yaw handled by pose.headYaw)
    this._setPartSimple('head', idx, x, y, z, yaw + (pose.headYaw||0), stumbleRoll, DIMS.head, pose, skin.head);
    this._setPartSimple('torso', idx, x, y, z, yaw, stumbleRoll, DIMS.torso, pose, skin.body);
    this._setLimb('armL', idx, x, y, z, yaw, pose.armL, stumbleRoll, skin.limbs, pose);
    this._setLimb('armR', idx, x, y, z, yaw, pose.armR, stumbleRoll, skin.limbs, pose);
    this._setLimb('legL', idx, x, y, z, yaw, pose.legL, stumbleRoll, skin.limbs, pose);
    this._setLimb('legR', idx, x, y, z, yaw, pose.legR, stumbleRoll, skin.limbs, pose);

    // 3D hat (Task #2): a stylized multi-piece model, placed by the HatPool so
    // it tumbles with the head (stumble roll + dive flip) and follows yaw.
    this.hatPool.writeHat(idx, hat, x, y, z, yaw, stumbleRoll, pose);

    // blob shadow — projects onto groundY, scales with height above ground
    const gap = Math.max(0, y - (av.groundY ?? y));
    const s = THREE.MathUtils.clamp(1 - gap * 0.06, 0.4, 1.1);
    _m.compose(_pos.set(x, (av.groundY ?? 0) + 0.02, z), new THREE.Quaternion(), _scl.set(s, 1, s));
    this.shadow.setMatrixAt(idx, _m);
  }

  _setPartSimple(part, idx, x, y, z, yaw, roll, d, pose, color) {
    const [sx, sy, sz] = d.size;
    const flip = pose.flip || 0;
    // local (pre-yaw) position of the part centre
    let lx = 0, ly = d.pivot[1] + (pose.bob || 0), lz = 0;
    // rotation: stumble roll, then dive flip folded in below
    _euler.set(roll, 0, roll * 0.6, 'XYZ');
    _q.setFromEuler(_euler);
    // apply the front-flip about the body pivot (Task #2)
    applyFlip(lx, ly, lz, flip, _q);
    lx = _pos.x; ly = _pos.y; lz = _pos.z;
    // fold in the head/body yaw last
    _euler.set(0, yaw, 0);
    _q2.setFromEuler(_euler);
    _q2.multiply(_q);
    // yaw the local XZ offset into world space
    const cosY = Math.cos(yaw), sinY = Math.sin(yaw);
    const wx = lx * cosY + lz * sinY;
    const wz = -lx * sinY + lz * cosY;
    _scl.set(sx, sy, sz);
    _m.compose(_pos.set(x + wx, y + ly, z + wz), _q2, _scl);
    this.meshes[part].setMatrixAt(idx, _m);
    _color.setHex(color); this.meshes[part].setColorAt(idx, _color);
  }

  _setLimb(part, idx, x, y, z, yaw, rotX, roll, color, pose) {
    this._setPart(this.meshes[part], idx, part, x, y, z, yaw, { x: (rotX || 0) + roll, y: 0, z: roll * 0.5 }, color, pose);
  }

  hide(idx) {
    for (const p of PARTS) this.meshes[p].setMatrixAt(idx, _hidden);
    this.shadow.setMatrixAt(idx, _hidden);
  }

  spawnPoof(x, y, z, colorHex) {
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2;
      const up = 2 + Math.random() * 4;
      this.poofParts.push({
        pos: new THREE.Vector3(x, y + 1, z),
        vel: new THREE.Vector3(Math.cos(a) * 3, up, Math.sin(a) * 3),
        life: 0.8, max: 0.8, color: colorHex,
      });
    }
  }

  updatePoof(dt) {
    const arr = this.poofParts;
    for (let i = arr.length - 1; i >= 0; i--) {
      const p = arr[i];
      p.life -= dt;
      if (p.life <= 0) { arr.splice(i, 1); continue; }
      p.vel.y -= 18 * dt;
      p.pos.addScaledVector(p.vel, dt);
    }
    const n = Math.min(arr.length, this.poofCap);
    for (let i = 0; i < n; i++) {
      const p = arr[i];
      const s = (p.life / p.max) * 0.9 + 0.1;
      _m.compose(p.pos, _q.identity(), _scl.set(s, s, s));
      this.poof.setMatrixAt(i, _m);
      _color.setHex(p.color); this.poof.setColorAt(i, _color);
    }
    for (let i = n; i < this.poofCap; i++) this.poof.setMatrixAt(i, _hidden);
    this.poof.count = this.poofCap;
    this.poof.instanceMatrix.needsUpdate = true;
    if (this.poof.instanceColor) this.poof.instanceColor.needsUpdate = true;
  }

  flush(count) {
    for (const p of PARTS) {
      const m = this.meshes[p];
      m.count = count;
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
    this.shadow.count = count;
    this.shadow.instanceMatrix.needsUpdate = true;
    // finalize the hat piece buffers for this frame (Task #2)
    this.hatPool.flush();
  }
}

// ------------------------------------------------------------
// HatPool (Task #2): renders the multi-piece 3D hats.
// One shared InstancedMesh per primitive geometry type (box / cyl / cone),
// so an entire 32-player lobby of detailed hats is a handful of draw calls.
// Each frame we walk every visible avatar's equipped hat, transform each
// piece from head-local space into world space (following bob, stumble roll,
// dive flip and yaw exactly like the body parts), and append it to the right
// geometry bucket. A per-frame write cursor packs only the pieces actually in
// use; the tail is collapsed to zero-scale (hidden).
// ------------------------------------------------------------
class HatPool {
  constructor(scene, capacity, realShadows) {
    // worst-case: every player wears the hat with the most pieces.
    let maxPieces = 1;
    for (const h of HATS) if (h.parts) maxPieces = Math.max(maxPieces, h.parts.length);
    const cap = capacity * maxPieces + 8;

    const mat = new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.12 });
    const mk = (geo) => {
      const m = new THREE.InstancedMesh(geo, mat.clone(), cap);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
      m.frustumCulled = false;
      m.castShadow = realShadows;
      m.receiveShadow = false;
      scene.add(m);
      return m;
    };

    // Unit primitives (all authored around their own centre, scaled per piece).
    const box = new THREE.BoxGeometry(1, 1, 1);
    // unit-radius (0.5), unit-height cylinder/cone; low radial segs = cheap.
    const cyl = new THREE.CylinderGeometry(0.5, 0.5, 1, 12);
    const cone = new THREE.ConeGeometry(0.5, 1, 12);

    this.buckets = {
      box:  { mesh: mk(box),  cursor: 0 },
      cyl:  { mesh: mk(cyl),  cursor: 0 },
      cone: { mesh: mk(cone), cursor: 0 },
    };
    this._cap = cap;
  }

  // Reset write cursors at the start of an avatar-write pass.
  beginFrame() {
    for (const k in this.buckets) this.buckets[k].cursor = 0;
  }

  // Place one avatar's hat pieces. Mirrors the body-part transform pipeline:
  //   local piece offset -> (+bob) -> dive flip about FLIP_PIVOT_Y ->
  //   stumble roll -> yaw -> world translate.
  writeHat(idx, hat, x, y, z, yaw, stumbleRoll, pose) {
    if (!hat || hat.color == null || !hat.parts || !hat.parts.length) return;
    const flip = pose.flip || 0;
    const bob = pose.bob || 0;
    const cosY = Math.cos(yaw), sinY = Math.sin(yaw);

    for (const piece of hat.parts) {
      const bucket = this.buckets[piece.geo] || this.buckets.box;
      if (bucket.cursor >= this._cap) continue;
      const i = bucket.cursor++;

      const [px, py, pz] = piece.pos;
      const [gx, gy, gz] = normalizeSize(piece);

      // piece local rotation (authored), then stumble roll folded in
      _euler.set(
        (piece.rot ? piece.rot[0] : 0) + stumbleRoll,
        (piece.rot ? piece.rot[1] : 0),
        (piece.rot ? piece.rot[2] : 0) + stumbleRoll * 0.6,
        'XYZ');
      _q.setFromEuler(_euler);

      // piece centre in avatar-local space: head-top origin + authored offset + bob
      let lx = px;
      let ly = HEAD_TOP_Y + py + bob;
      let lz = pz;

      // dive front-flip about the body pivot (so the hat tumbles with the head)
      applyFlip(lx, ly, lz, flip, _q);
      lx = _pos.x; ly = _pos.y; lz = _pos.z;

      // fold in yaw
      _euler.set(0, yaw, 0);
      _q2.setFromEuler(_euler);
      _q2.multiply(_q);

      const wx = lx * cosY + lz * sinY;
      const wz = -lx * sinY + lz * cosY;

      _scl.set(gx, gy, gz);
      _m.compose(_pos.set(x + wx, y + ly, z + wz), _q2, _scl);
      bucket.mesh.setMatrixAt(i, _m);
      _color.setHex(piece.color != null ? piece.color : (hat.color || 0xffffff));
      bucket.mesh.setColorAt(i, _color);
    }
  }

  // Hide a single avatar's slot — no-op here because hats are packed by a
  // per-frame cursor (unused pieces are collapsed in flush()).
  hide() { /* handled by cursor packing + flush() */ }

  // Collapse unused instances and push the buffers to the GPU.
  flush() {
    for (const k in this.buckets) {
      const b = this.buckets[k];
      for (let i = b.cursor; i < this._cap; i++) b.mesh.setMatrixAt(i, _hidden);
      b.mesh.count = this._cap;
      b.mesh.instanceMatrix.needsUpdate = true;
      if (b.mesh.instanceColor) b.mesh.instanceColor.needsUpdate = true;
    }
  }
}

// Map a piece's authored `size` to an [x,y,z] scale for its unit geometry.
//  box  -> [sx, sy, sz]
//  cyl  -> [diameter, height, diameter]   (unit cyl radius = 0.5)
//  cone -> [diameter, height, diameter]   (unit cone radius = 0.5)
function normalizeSize(piece) {
  const s = piece.size;
  if (piece.geo === 'cyl' || piece.geo === 'cone') {
    const d = s[0] * 2;      // radius -> diameter (unit geo radius is 0.5)
    return [d, s[1], d];
  }
  return [s[0], s[1], s[2]];
}

// ------------------------------------------------------------
// Pose solver: turns (state, phase) into limb rotations.
// Pure keyframed sine-based cycles, <1s loops (Section 2).
// ------------------------------------------------------------
export function solvePose(pose, state, phase, dt) {
  // pose is mutated in place; we lerp toward targets for smooth blends.
  let tArmL = 0, tArmR = 0, tLegL = 0, tLegR = 0, bob = 0, headYaw = 0, stumble = pose.stumble || 0;

  if (state === 'run') {
    const s = Math.sin(phase * 12);
    const c = Math.cos(phase * 12);
    tLegL = s * 0.9; tLegR = -s * 0.9;
    tArmL = -s * 0.7; tArmR = s * 0.7;
    bob = Math.abs(c) * 0.06;
  } else if (state === 'idle') {
    bob = Math.sin(phase * 3) * 0.03;
    tArmL = Math.sin(phase * 3) * 0.05;
    tArmR = -Math.sin(phase * 3) * 0.05;
  } else if (state === 'jump') {
    tLegL = 0.6; tLegR = 0.6; tArmL = -2.2; tArmR = -2.2;
  } else if (state === 'fall') {
    tLegL = 0.3; tLegR = -0.3; tArmL = -1.5; tArmR = -1.8;
  } else if (state === 'dive') {
    tArmL = -2.6; tArmR = -2.6; tLegL = 0.4; tLegR = 0.4;
  } else if (state === 'stumble') {
    // chaotic tumble — driven by stumble timer set externally
    const t = phase * 10;
    tArmL = Math.sin(t) * 2.5; tArmR = Math.cos(t*1.3) * 2.5;
    tLegL = Math.sin(t*0.8) * 1.8; tLegR = Math.cos(t) * 1.8;
    stumble = pose.stumble; // preserve
  } else if (state === 'victory') {
    const s = Math.sin(phase * 8);
    tArmL = -2.4 + s * 0.4; tArmR = -2.4 - s * 0.4;
    bob = Math.abs(Math.sin(phase * 8)) * 0.25;
    headYaw = Math.sin(phase * 4) * 0.4;
  }

  const k = Math.min(1, dt * 14);
  pose.armL = lerp(pose.armL || 0, tArmL, k);
  pose.armR = lerp(pose.armR || 0, tArmR, k);
  // Melee punch overlay (Task #3): drive the RIGHT arm forward on top of the
  // locomotion pose so the strike reads clearly in any state. punch is 0..1.
  if (pose.punch) {
    // -1.9 rad ≈ arm thrust forward/up (matches jump's forward reach sign)
    pose.armR = lerp(pose.armR, -1.9, pose.punch);
    pose.armL = lerp(pose.armL, -0.5, pose.punch * 0.5);
  }
  pose.legL = lerp(pose.legL || 0, tLegL, k);
  pose.legR = lerp(pose.legR || 0, tLegR, k);
  pose.bob  = lerp(pose.bob  || 0, bob,  k);
  pose.headYaw = lerp(pose.headYaw || 0, headYaw, k);
  // stumble roll handled by controller timer; here we just keep it
  return pose;
}

function lerp(a, b, t) { return a + (b - a) * t; }
