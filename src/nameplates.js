import * as THREE from 'three';

// ============================================================
// Floating nameplate system (Task #4).
//
// A crisp label is drawn directly ABOVE each player's head and follows
// them every frame. Implemented as a small pool of absolutely-positioned
// DOM elements projected from the character's world head position into
// screen space — this is the LIGHTEST possible approach (Section 7):
//   - no per-nameplate WebGL geometry / sprite / texture,
//   - text stays native-crisp at any resolution / zoom,
//   - one shared pooled <div> per capacity slot, reused across rounds,
//   - labels behind the camera or off-screen are hidden (cheap cull),
//   - distance fade + scale so far plates shrink and never clutter.
//
// The plate anchors to HEAD_TOP + a small gap in the avatar's local frame
// so it sits just over the head cube (matching character.js head dims).
// ============================================================

// World-space Y (avatar feet = 0) just ABOVE the head cube top. character.js
// head pivot 1.55 + half height 0.45 = 2.0 (top of head); +0.55 gap.
const PLATE_Y = 2.55;

const _v = new THREE.Vector3();

export class NameplateSystem {
  constructor(host, capacity) {
    // A dedicated overlay layer above the canvas but below menu UI.
    this.layer = document.createElement('div');
    this.layer.id = 'nameplate-layer';
    (host || document.body).appendChild(this.layer);

    this.pool = [];
    for (let i = 0; i < capacity; i++) {
      const d = document.createElement('div');
      d.className = 'nameplate';
      d.style.display = 'none';
      this.layer.appendChild(d);
      this.pool.push(d);
    }
    this.visible = true;
  }

  // Toggle the whole layer (e.g. hidden on menu/podium).
  setVisible(v) {
    this.visible = v;
    this.layer.style.display = v ? 'block' : 'none';
    if (!v) for (const d of this.pool) d.style.display = 'none';
  }

  // Project every live entity's head position and place its plate.
  //   entities : array of Entity
  //   camera   : THREE.PerspectiveCamera
  //   human    : the local player (highlighted differently)
  update(entities, camera, human) {
    if (!this.visible) return;
    const w = innerWidth, h = innerHeight;
    let slot = 0;

    for (const e of entities) {
      // only living / finished (visible) avatars get a plate
      if (!(e.alive || e.finished)) continue;
      if (slot >= this.pool.length) break;

      // world head-top anchor (feet at e.y)
      _v.set(e.x, e.y + PLATE_Y, e.z);
      _v.project(camera);

      const d = this.pool[slot];
      // behind the camera (z>1 in NDC) or outside the frustum X/Y => hide
      if (_v.z > 1 || _v.x < -1.3 || _v.x > 1.3 || _v.y < -1.3 || _v.y > 1.3) {
        d.style.display = 'none';
        continue;
      }

      const sx = (_v.x * 0.5 + 0.5) * w;
      const sy = (-_v.y * 0.5 + 0.5) * h;

      // distance-based scale + fade so far plates shrink / dim (keeps the
      // 32-plate lobby readable, never a wall of overlapping text).
      const dist = Math.hypot(e.x - camera.position.x, e.y - camera.position.y, e.z - camera.position.z);
      const scale = THREE.MathUtils.clamp(11 / dist, 0.55, 1.15);
      const opacity = THREE.MathUtils.clamp(1.25 - dist / 55, 0.18, 1);

      const isHuman = e === human;
      d.textContent = e.name || (e.isBot ? 'Bot' : 'Player');
      d.className = 'nameplate' + (isHuman ? ' nameplate-you' : '');
      d.style.display = 'block';
      d.style.opacity = String(isHuman ? Math.max(opacity, 0.55) : opacity);
      d.style.transform =
        `translate(-50%,-100%) translate(${sx.toFixed(1)}px,${sy.toFixed(1)}px) scale(${scale.toFixed(3)})`;
      // nearer plates draw over farther ones
      d.style.zIndex = String(1000 - Math.round(dist));
      slot++;
    }

    // hide any unused pooled plates
    for (let i = slot; i < this.pool.length; i++) this.pool[i].style.display = 'none';
  }

  dispose() {
    if (this.layer && this.layer.parentNode) this.layer.parentNode.removeChild(this.layer);
  }
}
