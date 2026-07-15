import { CFG } from './config.js';
import { resolveEntity, integrate } from './physics.js';
import { solvePose } from './character.js';

// ============================================================
// Entity: shared state + kinematics for humans and bots.
// A human's intent comes from input; a bot's from BotBrain.
// Client-authoritative here (Vercel static build); the intent
// -> integrate pipeline mirrors what a Colyseus server tick would
// run, so it is drop-in replaceable with server reconciliation.
// ============================================================

let _id = 0;

export class Entity {
  constructor(opts = {}) {
    this.id = _id++;
    this.name = opts.name || 'Blocky';
    this.isBot = !!opts.isBot;
    this.skinId = opts.skinId || 'classic';
    this.hatId = opts.hatId || 'none';
    this.trailId = opts.trailId || 'none';

    this.x = 0; this.y = 2; this.z = 0;
    this.vx = 0; this.vy = 0; this.vz = 0;
    this.yaw = 0;

    this.alive = true;
    this.finished = false;
    this.finishOrder = 0;
    this.grounded = false;
    this.groundY = 0;
    this.diveTimer = 0;
    this.diveCd = 0;
    this.stumbleTimer = 0;
    this.jumpsLeft = 1;

    // king-of-hill control accumulator
    this.controlTime = 0;

    // Last position where the entity was safely on solid ground. Used to
    // respawn "slightly behind" the fall-off point in race rounds. (Bug #3)
    this.lastSafeX = 0; this.lastSafeY = 2; this.lastSafeZ = 0;
    this.respawns = 0;

    // render pose
    this.pose = { armL: 0, armR: 0, legL: 0, legR: 0, bob: 0, headYaw: 0, stumble: 0 };
    this.animState = 'idle';
    this.animPhase = 0;

    // desired horizontal intent (unit-ish vector) & flags per tick
    this.intent = { mx: 0, mz: 0, jump: false, dive: false };
    this.brain = null; // bot brain
  }

  respawnAt(sp) {
    this.x = sp.x; this.y = sp.y; this.z = sp.z;
    this.vx = this.vy = this.vz = 0;
    this.stumbleTimer = 0; this.finished = false; this.finishOrder = 0;
    this.alive = true; this.controlTime = 0; this.diveTimer = 0; this.diveCd = 0;
    this.jumpsLeft = 1;
    // seed the "last safe" checkpoint at the spawn pad
    this.lastSafeX = sp.x; this.lastSafeY = sp.y; this.lastSafeZ = sp.z;
    this.respawns = 0;
  }

  // Re-place the entity at a mid-air checkpoint (used by the track
  // fall-respawn) without resetting round state. (Bug #3)
  reviveAt(x, y, z) {
    this.x = x; this.y = y; this.z = z;
    this.vx = this.vy = this.vz = 0;
    this.stumbleTimer = 0;
    this.diveTimer = 0;
    this.grounded = false;
    this.jumpsLeft = 1;
    this.respawns++;
  }

  // One fixed-step simulation tick.
  tick(world, dt) {
    if (!this.alive) return;

    // timers
    if (this.diveCd > 0) this.diveCd -= dt;
    if (this.diveTimer > 0) this.diveTimer -= dt;
    if (this.stumbleTimer > 0) this.stumbleTimer -= dt;

    const stumbling = this.stumbleTimer > 0;
    const mv = this.intent;

    // desired facing from movement intent
    if (!stumbling && (mv.mx || mv.mz)) {
      this.yaw = Math.atan2(mv.mx, mv.mz);
    }

    // acceleration toward intent (disabled while stumbling)
    if (!stumbling && !this.finished) {
      const speed = CFG.MOVE_SPEED;
      const control = this.grounded ? 1 : CFG.AIR_CONTROL;
      const len = Math.hypot(mv.mx, mv.mz);
      if (len > 0.01) {
        const nx = mv.mx / len, nz = mv.mz / len;
        const tvx = nx * speed, tvz = nz * speed;
        const a = CFG.ACCEL * control * dt;
        this.vx += (tvx - this.vx) * Math.min(1, a / speed * 2);
        this.vz += (tvz - this.vz) * Math.min(1, a / speed * 2);
      }

      // dive lunge
      if (mv.dive && this.diveCd <= 0 && this.diveTimer <= 0) {
        const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
        this.vx = fx * CFG.DIVE_SPEED;
        this.vz = fz * CFG.DIVE_SPEED;
        this.vy = Math.max(this.vy, 3);
        this.diveTimer = CFG.DIVE_DURATION;
        this.diveCd = CFG.DIVE_COOLDOWN;
        this.onDive && this.onDive();
      }

      // jump
      if (mv.jump && this.grounded && this.jumpsLeft > 0) {
        this.vy = CFG.JUMP_VELOCITY;
        this.grounded = false;
        this.jumpsLeft--;
        this.onJump && this.onJump();
      }
    }

    integrate(this, world, dt, { grounded: this.grounded, ice: this._ice, conveyor: this._conv });

    const g = resolveEntity(this, world, dt);
    this.grounded = g.grounded;
    this.groundY = g.groundY;
    this._ice = g.ice;
    this._conv = g.conveyor;
    if (g.grounded) {
      this.jumpsLeft = 1;
      // Record a safe checkpoint whenever standing on solid ground and not
      // mid-stumble, so a fall can respawn us just behind this spot. (Bug #3)
      if (this.stumbleTimer <= 0 && this.y > -5) {
        this.lastSafeX = this.x;
        this.lastSafeY = this.y;
        this.lastSafeZ = this.z;
      }
    }

    // consume one-shot intents
    mv.jump = false; mv.dive = false;
  }

  // Update render pose (called at render rate, not sim rate).
  updatePose(dt) {
    if (!this.alive) return;
    this.animPhase += dt;
    let state;
    if (this.stumbleTimer > 0) {
      state = 'stumble';
      // ramp stumble roll up then down over the timer
      const p = 1 - (this.stumbleTimer / CFG.STUMBLE_TIME);
      this.pose.stumble = Math.sin(p * Math.PI) * 1.4;
    } else {
      this.pose.stumble *= Math.max(0, 1 - dt * 8);
      if (this.finished && this.won) state = 'victory';
      else if (!this.grounded && this.diveTimer > 0) state = 'dive';
      else if (!this.grounded && this.vy > 1) state = 'jump';
      else if (!this.grounded) state = 'fall';
      else if (Math.hypot(this.vx, this.vz) > 1.5) state = 'run';
      else state = this.finished ? 'victory' : 'idle';
    }
    this.animState = state;
    solvePose(this.pose, state, this.animPhase, dt);
  }
}
