// ============================================================
// Input (Section 4). PC: WASD/arrows + mouse-look orbit, Space
// jump, Shift/double-tap dive. Mobile: virtual joystick + tap
// jump + swipe dive. Produces a normalized intent consumed by
// the human entity each frame, relative to the camera yaw.
// ============================================================

export class InputManager {
  constructor() {
    this.keys = {};
    this.cameraYaw = 0;      // orbit angle (radians)
    this.cameraPitch = 0.35;
    this.jumpQueued = false;
    this.diveQueued = false;
    this.pointerLocked = false;
    this.touch = { active: false, mx: 0, mz: 0 };
    this.enabled = false;
    this._lastDir = null; this._lastDirTime = 0;
    this._bind();
  }

  _bind() {
    addEventListener('keydown', (e) => {
      if (!this.enabled) return;
      const k = e.key.toLowerCase();
      this.keys[k] = true;
      if (k === ' ') { this.jumpQueued = true; e.preventDefault(); }
      if (k === 'shift') this.diveQueued = true;
      // double-tap direction => dive
      const dirMap = { w:'w', a:'a', s:'s', d:'d', arrowup:'w', arrowleft:'a', arrowdown:'s', arrowright:'d' };
      if (dirMap[k]) {
        const now = performance.now();
        if (this._lastDir === dirMap[k] && now - this._lastDirTime < 260) this.diveQueued = true;
        this._lastDir = dirMap[k]; this._lastDirTime = now;
      }
    });
    addEventListener('keyup', (e) => { this.keys[e.key.toLowerCase()] = false; });

    // mouse look (drag or pointer lock)
    const canvasHost = document.getElementById('game-root');
    let dragging = false, lastX = 0, lastY = 0;
    canvasHost.addEventListener('mousedown', (e) => { if (this.enabled) { dragging = true; lastX = e.clientX; lastY = e.clientY; } });
    addEventListener('mouseup', () => dragging = false);
    addEventListener('mousemove', (e) => {
      if (!this.enabled) return;
      if (this.pointerLocked) {
        this.cameraYaw -= e.movementX * 0.0035;
        this.cameraPitch = clamp(this.cameraPitch + e.movementY * 0.0025, 0.05, 0.9);
      } else if (dragging) {
        this.cameraYaw -= (e.clientX - lastX) * 0.006;
        this.cameraPitch = clamp(this.cameraPitch + (e.clientY - lastY) * 0.004, 0.05, 0.9);
        lastX = e.clientX; lastY = e.clientY;
      }
    });
    // wheel zoom-ish -> pitch tweak (kept subtle)
    canvasHost.addEventListener('wheel', (e) => {
      if (!this.enabled) return;
      this.cameraPitch = clamp(this.cameraPitch + Math.sign(e.deltaY) * 0.05, 0.05, 0.9);
    }, { passive: true });

    this._bindTouch();
  }

  _bindTouch() {
    const zone = document.getElementById('joystick-zone');
    const base = document.getElementById('joystick-base');
    const thumb = document.getElementById('joystick-thumb');
    let originX = 0, originY = 0, jid = null;

    const start = (x, y, id) => {
      jid = id; originX = x; originY = y;
      base.style.display = 'block';
      base.style.left = (x - 60) + 'px';
      base.style.top = (y - 60) + 'px';
      this.touch.active = true;
    };
    const move = (x, y) => {
      let dx = x - originX, dy = y - originY;
      const max = 55;
      const d = Math.hypot(dx, dy);
      if (d > max) { dx = dx / d * max; dy = dy / d * max; }
      thumb.style.left = (60 + dx) + 'px';
      thumb.style.top = (60 + dy) + 'px';
      this.touch.mx = dx / max;
      this.touch.mz = -dy / max;
    };
    const end = () => {
      jid = null; base.style.display = 'none';
      thumb.style.left = '50%'; thumb.style.top = '50%';
      this.touch.active = false; this.touch.mx = 0; this.touch.mz = 0;
    };

    zone.addEventListener('touchstart', (e) => {
      const t = e.changedTouches[0];
      start(t.clientX, t.clientY, t.identifier); e.preventDefault();
    }, { passive: false });
    zone.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) if (t.identifier === jid) move(t.clientX, t.clientY);
      e.preventDefault();
    }, { passive: false });
    zone.addEventListener('touchend', (e) => {
      for (const t of e.changedTouches) if (t.identifier === jid) end();
    });

    // camera drag on right half of screen
    let camId = null, cx = 0, cy = 0;
    addEventListener('touchstart', (e) => {
      if (!this.enabled) return;
      for (const t of e.changedTouches) {
        if (t.clientX > innerWidth * 0.5 && camId === null && !e.target.closest('button')) {
          camId = t.identifier; cx = t.clientX; cy = t.clientY;
        }
      }
    }, { passive: true });
    addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) if (t.identifier === camId) {
        this.cameraYaw -= (t.clientX - cx) * 0.008;
        this.cameraPitch = clamp(this.cameraPitch + (t.clientY - cy) * 0.005, 0.05, 0.9);
        cx = t.clientX; cy = t.clientY;
      }
    }, { passive: true });
    addEventListener('touchend', (e) => {
      for (const t of e.changedTouches) if (t.identifier === camId) camId = null;
    });

    document.getElementById('btn-jump').addEventListener('touchstart', (e) => { this.jumpQueued = true; e.preventDefault(); }, { passive: false });
    document.getElementById('btn-dive').addEventListener('touchstart', (e) => { this.diveQueued = true; e.preventDefault(); }, { passive: false });
  }

  requestPointerLock() {
    const host = document.getElementById('game-root');
    const canvas = host.querySelector('canvas');
    if (canvas && canvas.requestPointerLock) {
      canvas.requestPointerLock();
    }
  }

  // Build camera-relative movement intent.
  getIntent() {
    let ix = 0, iz = 0;
    if (this.touch.active) { ix = this.touch.mx; iz = this.touch.mz; }
    else {
      if (this.keys['w'] || this.keys['arrowup']) iz += 1;
      if (this.keys['s'] || this.keys['arrowdown']) iz -= 1;
      if (this.keys['a'] || this.keys['arrowleft']) ix -= 1;
      if (this.keys['d'] || this.keys['arrowright']) ix += 1;
    }
    // rotate intent by camera yaw so "forward" = away from camera
    const cos = Math.cos(this.cameraYaw), sin = Math.sin(this.cameraYaw);
    const mx = ix * cos - iz * sin;
    const mz = ix * sin + iz * cos;
    const jump = this.jumpQueued; this.jumpQueued = false;
    const dive = this.diveQueued; this.diveQueued = false;
    return { mx, mz, jump, dive };
  }
}

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
