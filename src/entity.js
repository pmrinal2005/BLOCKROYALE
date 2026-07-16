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
    this.pose = { armL: 0, armR: 0, legL: 0, legR: 0, bob: 0, headYaw: 0, stumble: 0, flip: 0, punch: 0 };
    this.animState = 'idle';
    this.animPhase = 0;
    // ---- Dive front-flip state (Task #2) ----
    // flipping: is a flip currently in progress? (default FALSE at spawn)
    // flipT:    0..1 progress of the single 360° turn.
    // flipLock: once a flip completes it stays locked (flipping=false) until a
    //           NEW valid double-space/dive re-arms it — no auto-replay, no loop.
    this.flipping = false;
    this.flipT = 0;

    // ---- Knockback melee state (Task #3) ----
    this.meleeCd = 0;        // cooldown remaining
    this.meleeTimer = 0;     // punch animation remaining
    this.meleeActive = 0;    // >0 during the active hit frame window
    this._meleeFired = false;// ensures the hit is applied exactly once per swing
    this.meleeSuper = false; // this swing combined with a dash/dive (Super Punch)
    this.inputLock = 0;      // directional inputs locked (melee-stun on target)

    // desired horizontal intent (unit-ish vector) & flags per tick
    this.intent = { mx: 0, mz: 0, jump: false, dive: false, melee: false };
    this.brain = null; // bot brain
  }

  respawnAt(sp) {
    this.x = sp.x; this.y = sp.y; this.z = sp.z;
    this.vx = this.vy = this.vz = 0;
    this.stumbleTimer = 0; this.finished = false; this.finishOrder = 0;
    this.alive = true; this.controlTime = 0; this.diveTimer = 0; this.diveCd = 0;
    this.jumpsLeft = 1;
    // (Task #2) always spawn with NO flip in progress and pose reset flat.
    this.flipping = false; this.flipT = 0; this.pose.flip = 0;
    // (Task #3) melee fully reset on (re)spawn
    this.meleeCd = 0; this.meleeTimer = 0; this.meleeActive = 0;
    this._meleeFired = false; this.meleeSuper = false; this.inputLock = 0;
    this.pose.punch = 0;
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
    // (Task #2) mid-air respawn must not carry a stale flip.
    this.flipping = false; this.flipT = 0; this.pose.flip = 0;
    this.respawns++;
  }

  // One fixed-step simulation tick.
  tick(world, dt) {
    if (!this.alive) return;

    // timers
    if (this.diveCd > 0) this.diveCd -= dt;
    if (this.diveTimer > 0) this.diveTimer -= dt;
    if (this.stumbleTimer > 0) this.stumbleTimer -= dt;
    if (this.meleeCd > 0) this.meleeCd -= dt;
    if (this.inputLock > 0) this.inputLock -= dt;

    const stumbling = this.stumbleTimer > 0;
    const mv = this.intent;

    // ---- Knockback Melee (Task #3) ----
    // Fast, no-charge punch. Fires whenever requested and off cooldown, even
    // mid-air. The actual hit is resolved in physics.checkMeleeHits() using
    // meleeActive; here we just start the swing + arm the Super-Punch flag.
    if (mv.melee && this.meleeCd <= 0 && this.meleeTimer <= 0 && !stumbling) {
      this.meleeTimer = CFG.MELEE_ANIM_TIME;
      this.meleeActive = 0;                 // becomes active after a short wind-up
      this.meleeCd = CFG.MELEE_COOLDOWN;
      this._meleeFired = false;
      // Super Punch: swinging while dashing/diving folds dash momentum in.
      this.meleeSuper = this.diveTimer > 0;
      this.onMelee && this.onMelee();
    }
    if (this.meleeTimer > 0) {
      this.meleeTimer -= dt;
      const elapsed = CFG.MELEE_ANIM_TIME - this.meleeTimer;
      // active hit window opens after the wind-up and lasts a couple frames
      this.meleeActive = (elapsed >= CFG.MELEE_WINDUP && !this._meleeFired) ? 1 : 0;
    } else {
      this.meleeActive = 0;
    }

    // directional inputs are locked briefly after being punched (melee stun)
    const inputLocked = this.inputLock > 0;

    // desired facing from movement intent (blocked while stunned)
    if (!stumbling && !inputLocked && (mv.mx || mv.mz)) {
      this.yaw = Math.atan2(mv.mx, mv.mz);
    }

    // acceleration toward intent (disabled while stumbling or input-locked)
    if (!stumbling && !inputLocked && !this.finished) {
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

      // ---- Jump / Double-Jump-Dive (Task #2) ----
      // Pressing jump/space a SECOND time while airborne performs the
      // forward "Dive" plunge (the officially-named Double Jump / Diving).
      // We fold this into the jump handler so a double-tap of the SAME
      // button does it — humans and bots share this identical code path.
      const wantDive = mv.dive ||               // dedicated dive input (Shift / swipe / dbl-tap dir)
        (mv.jump && !this.grounded);            // 2nd jump press mid-air => dive
      const wantGroundJump = mv.jump && this.grounded && this.jumpsLeft > 0;

      if (wantGroundJump) {
        // First press on the ground = a normal jump.
        this.vy = CFG.JUMP_VELOCITY;
        this.grounded = false;
        this.jumpsLeft--;
        this.onJump && this.onJump();
      } else if (wantDive && this.diveCd <= 0 && this.diveTimer <= 0) {
        // Airborne second press (or explicit dive) = forward PLUNGE + FLIP.
        const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
        this.vx = fx * CFG.DIVE_SPEED;
        this.vz = fz * CFG.DIVE_SPEED;
        // a small pop so the dive arcs forward instead of dropping like a stone
        this.vy = Math.max(this.vy, CFG.DIVE_POP);
        this.diveTimer = CFG.DIVE_DURATION;
        this.diveCd = CFG.DIVE_COOLDOWN;
        // Arm EXACTLY ONE forward-flip (Task #2). Setting flipping=true starts a
        // single 360° turn; it is cleared the instant that turn completes and
        // will NOT re-arm until the next valid double-space / dive input.
        this.flipping = true; this.flipT = 0;
        this.onDive && this.onDive();
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
    mv.jump = false; mv.dive = false; mv.melee = false;
  }

  // Update render pose (called at render rate, not sim rate).
  updatePose(dt) {
    if (!this.alive) return;
    this.animPhase += dt;

    // ---- Dive FRONT-FLIP driver (Task #2) — strict single-shot, no loop ----
    // DEFAULT STATE: flipping=false => pose.flip stays 0 (no flip on spawn/idle).
    // TRIGGER: only the double-space/dive path sets flipping=true (see tick()).
    // PLAYBACK: advance a single 0..1 turn at a fixed rate (same for bots).
    // TERMINATION: the instant the turn completes we set flipping=false and
    //   snap pose.flip back to 0 — it then stays locked flat until the next
    //   valid double-space input re-arms it. No auto-replay, ever.
    if (this.flipping) {
      this.flipT += dt * CFG.FLIP_TURNS_PER_SEC;
      if (this.flipT >= 1) {
        // completed exactly one 360°: terminate immediately + lock off.
        this.flipping = false;
        this.flipT = 0;
        this.pose.flip = 0;
      } else {
        // forward flip = negative X rotation of the whole avatar (head tucks first)
        this.pose.flip = -this.flipT * Math.PI * 2;
      }
    } else {
      // not flipping => hard-zero (guarantees no residual/looping rotation)
      this.pose.flip = 0;
    }

    // ---- Melee punch pose driver (Task #3) ----
    // A quick forward arm-snap; 0 when idle so it never affects the default pose.
    if (this.meleeTimer > 0) {
      const t = 1 - (this.meleeTimer / CFG.MELEE_ANIM_TIME);   // 0..1
      // fast out (punch), slower recover — a snappy sine bump
      this.pose.punch = Math.sin(Math.min(1, t * 1.3) * Math.PI);
    } else {
      this.pose.punch = 0;
    }

    let state;
    if (this.stumbleTimer > 0) {
      state = 'stumble';
      // ramp stumble roll up then down over the timer
      const p = 1 - (this.stumbleTimer / CFG.STUMBLE_TIME);
      this.pose.stumble = Math.sin(p * Math.PI) * 1.4;
    } else {
      this.pose.stumble *= Math.max(0, 1 - dt * 8);
      if (this.finished && this.won) state = 'victory';
      else if (this.flipping || (!this.grounded && this.diveTimer > 0)) state = 'dive';
      else if (!this.grounded && this.vy > 1) state = 'jump';
      else if (!this.grounded) state = 'fall';
      else if (Math.hypot(this.vx, this.vz) > 1.5) state = 'run';
      else state = this.finished ? 'victory' : 'idle';
    }
    this.animState = state;
    solvePose(this.pose, state, this.animPhase, dt);
  }
}
