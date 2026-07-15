import { CFG } from './config.js';

// ============================================================
// Bot AI (Section 4: bot-fill so lobbies never feel empty).
// Behaviour depends on round type. Bots use the SAME intent
// interface as the human, so the sim treats everyone identically.
// Intentionally imperfect: bots stumble, mistime jumps, and vary
// in skill so matches feel human and funny, not robotic.
// ============================================================

const NAMES = ['Wobble','Tumbles','ZoomZoom','BlockyBob','Sir Fumble','Pixel','Zippy','Chonk','Yeet','Boing',
  'Cubey','Noodle','Bouncer','Slippy','Gigglz','Toppler','Dizzy','Rocket','Waffle','Snacc',
  'Mochi','Turbo','Klutz','Jelly','Bonk','Nugget','Splat','Dashy','Pancake','Fumbles','Gizmo','Wiggle'];

export function botName(i) { return NAMES[i % NAMES.length]; }

export class BotBrain {
  constructor(entity, world, roundCfg) {
    this.e = entity;
    this.world = world;
    this.cfg = roundCfg;
    this.skill = 0.55 + Math.random() * 0.45; // 0.55..1.0
    this.jumpTimer = 0;
    this.wander = Math.random() * Math.PI * 2;
    this.reactionJitter = Math.random() * 0.3;
    this.targetX = (Math.random() - 0.5) * 8;
  }

  think(dt, allEntities) {
    const e = this.e;
    if (!e.alive || e.finished) { e.intent.mx = e.intent.mz = 0; return; }
    this.jumpTimer -= dt;

    if (this.cfg.type === 'race') this._race(dt);
    else if (this.cfg.type === 'survival') this._survival(dt);
    else if (this.cfg.type === 'king') this._king(dt);
  }

  _race(dt) {
    const e = this.e;
    // steer toward finish (forward +Z) with a wandering target X
    if (Math.random() < 0.02) this.targetX = (Math.random() - 0.5) * 10;
    const dx = this.targetX - e.x;
    e.intent.mx = Math.max(-1, Math.min(1, dx * 0.3));
    e.intent.mz = 1; // always push forward

    this._avoidHammers();

    // jump gaps / obstacles occasionally
    if (this.jumpTimer <= 0 && e.grounded && Math.random() < 0.02 * this.skill + 0.006) {
      e.intent.jump = true;
      this.jumpTimer = 0.6 + Math.random();
    }
    // dive to cross gaps sometimes
    if (e.grounded && Math.random() < 0.004 * this.skill) e.intent.dive = true;
  }

  _survival(dt) {
    const e = this.e;
    // stay near center but flee from hammer heads
    const toCx = -e.x, toCz = -e.z;
    let mx = toCx * 0.08, mz = toCz * 0.08;
    const flee = this._fleeVector();
    mx += flee.x; mz += flee.z;
    const l = Math.hypot(mx, mz) || 1;
    e.intent.mx = mx / l; e.intent.mz = mz / l;
    if (this.jumpTimer <= 0 && e.grounded && flee.danger && Math.random() < 0.05) {
      e.intent.jump = true; this.jumpTimer = 0.5;
    }
  }

  _king(dt) {
    const e = this.e;
    const th = this.world.throne;
    if (!th) return;
    const dx = th.x - e.x, dz = th.z - e.z;
    const dist = Math.hypot(dx, dz);
    let mx = dx, mz = dz;
    // if on throne, jockey around a bit
    if (dist < th.r) { mx += Math.cos(this.wander) * 1.5; mz += Math.sin(this.wander) * 1.5; this.wander += dt * 2; }
    const flee = this._fleeVector();
    mx += flee.x * 1.5; mz += flee.z * 1.5;
    const l = Math.hypot(mx, mz) || 1;
    e.intent.mx = mx / l; e.intent.mz = mz / l;
  }

  _fleeVector() {
    const e = this.e;
    let fx = 0, fz = 0, danger = false;
    for (const o of this.world.obstacles) {
      if (o.type === 'hammer') {
        const h = o.getHead();
        const dx = e.x - h.x, dz = e.z - h.z;
        const d2 = dx*dx + dz*dz;
        if (d2 < 12) { const d = Math.sqrt(d2)||1; fx += dx/d; fz += dz/d; danger = true; }
      } else if (o.type === 'rotor') {
        const dx = e.x - o.cx, dz = e.z - o.cz;
        const d2 = dx*dx + dz*dz;
        if (d2 < 6) { const d = Math.sqrt(d2)||1; fx += dx/d; fz += dz/d; danger = true; }
      }
    }
    return { x: fx, z: fz, danger };
  }

  _avoidHammers() {
    const e = this.e;
    const f = this._fleeVector();
    if (f.danger) { e.intent.mx += f.x * 0.6 * this.skill; e.intent.mz += f.z * 0.3; }
  }
}
