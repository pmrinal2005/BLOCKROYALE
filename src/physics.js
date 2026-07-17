import * as THREE from 'three';
import { CFG } from './config.js';

// ============================================================
// Lightweight AABB collision + entity kinematics (Section 1).
// No rigid-body engine: players are vertical capsules approximated
// as AABBs resolved against static/moving platform AABBs.
// ============================================================

const R = CFG.PLAYER_RADIUS;
const H = CFG.PLAYER_HEIGHT;

// Resolve an entity (feet at e.y) against all solid platforms AND sloped
// ramps. Returns { grounded, groundY, ice, conveyor }.
//
// FALL-THROUGH FIX + Task #3 (smooth slopes):
//  - Flat platforms and analytic ramps are both considered. We find the
//    HIGHEST walkable surface directly under the player's XZ footprint.
//  - "Snap-up" band is generous (STEP_UP) so running onto the bottom of a
//    ramp, over a seam between two segments, or across a small height change
//    lands cleanly instead of clipping through.
//  - "Snap-down" (STICK_DOWN) keeps a grounded player glued to a descending
//    slope: without it, moving downhill fast makes the feet float above the
//    surface each tick, gravity never re-touches, and the player "falls off"
//    a slope they should be running down. This was a primary void-fall cause.
//  - Tall platforms (sy>1.2) still act as walls via AABB side push-out so the
//    collidable roadside boulders/pillars block the lane (Task #1).
export function resolveEntity(e, world, dt) {
  const minX = e.x - R, maxX = e.x + R;
  const minZ = e.z - R, maxZ = e.z + R;
  const feet = e.y;
  const head = e.y + H;

  // Water-exit assist (Task #2 bug fix): while swimming, the body floats at the
  // waterline (~0.35 below `surf`), so the exit bank top sits ABOVE the feet by
  // more than the normal step band — the bank was being rejected and the player
  // dropped onto the submerged floor / off the track. When the entity is in or
  // has JUST left water we widen BOTH bands generously so climbing out onto the
  // bank at (or just above) the waterline catches cleanly, exactly like a step.
  // Only widen the bands during the EXIT window (just left the water, climbing
  // out) — NOT while still submerged, where buoyancy must own vertical motion
  // and a widened down-snap would glue a floating body to the pool floor.
  const nearWater = !e.inWater && (e._waterExitAssist || 0) > 0;
  const STEP_UP = nearWater ? 1.6 : 0.6;   // how far ABOVE feet a surface can catch
  const STICK_DOWN = 0.9;   // how far BELOW feet we snap down while grounded
  const wasGrounded = !!e.grounded;

  let groundY = -Infinity;
  let iceGround = false;
  let conveyor = null;
  let found = false;

  // ---- flat platforms (top faces) + wall push-out ----
  for (const p of world.platforms) {
    if (p.solid === false) continue;
    const pMinX = p.x - p.sx / 2, pMaxX = p.x + p.sx / 2;
    const pMinZ = p.z - p.sz / 2, pMaxZ = p.z + p.sz / 2;
    const pTop = p.y + p.sy / 2, pBot = p.y - p.sy / 2;

    // horizontal overlap?
    if (maxX <= pMinX || minX >= pMaxX || maxZ <= pMinZ || minZ >= pMaxZ) continue;

    // Consider this top as ground if it is at/below feet (within snap-down
    // when grounded) or just above feet (within step-up when descending/flat).
    const downBand = wasGrounded ? STICK_DOWN : (nearWater ? 1.2 : 0.12);
    // While climbing out of water the body is rising (vy>0) — don't let the
    // rising-velocity gate block the catch onto the bank.
    const vyGate = nearWater ? 6.0 : 0.5;
    const canLand = e.vy <= vyGate && feet <= pTop + STEP_UP && feet >= pTop - downBand;
    if (canLand) {
      if (pTop > groundY) { groundY = pTop; iceGround = !!p.ice; conveyor = p.conveyor || null; found = true; }
    } else if (feet < pTop - 0.08 && head > pBot + 0.08 && p.sy > 1.2) {
      // side penetration into a WALL-height block — push out on smallest axis
      const overlapL = maxX - pMinX, overlapR = pMaxX - minX;
      const overlapF = maxZ - pMinZ, overlapB = pMaxZ - minZ;
      const m = Math.min(overlapL, overlapR, overlapF, overlapB);
      if (m === overlapL) e.x -= overlapL;
      else if (m === overlapR) e.x += overlapR;
      else if (m === overlapF) e.z -= overlapF;
      else e.z += overlapB;
    }
  }

  // ---- sloped ramps (analytic top surface) ----
  const ry = world.rampHeightAt ? world.rampHeightAt(e.x, e.z) : null;
  if (ry != null) {
    const downBand = wasGrounded ? STICK_DOWN : (nearWater ? 1.2 : 0.12);
    const vyGate = nearWater ? 6.0 : 0.5;
    if (e.vy <= vyGate && feet <= ry + STEP_UP && feet >= ry - downBand) {
      if (ry > groundY) { groundY = ry; iceGround = false; conveyor = null; found = true; }
    }
  }

  if (found) {
    e.y = groundY;
    if (e.vy < 0) e.vy = 0;
    return { grounded: true, groundY, ice: iceGround, conveyor };
  }

  return { grounded: false, groundY: e.y, ice: false, conveyor: null };
}

// Soft player-vs-player collision (Section 4: comedic bump).
// O(n^2) but n<=32 => trivial. Applies symmetric knockback.
export function resolvePlayerBumps(entities) {
  const list = entities.filter(e => e.alive && !e.finished);
  const minDist = R * 2 + 0.12;
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j];
      const dx = b.x - a.x, dz = b.z - a.z;
      const dy = Math.abs(b.y - a.y);
      if (dy > H) continue;
      const d2 = dx * dx + dz * dz;
      if (d2 < minDist * minDist && d2 > 1e-5) {
        const d = Math.sqrt(d2);
        const nx = dx / d, nz = dz / d;
        const push = (minDist - d) * 0.5;
        a.x -= nx * push; a.z -= nz * push;
        b.x += nx * push; b.z += nz * push;
        const f = CFG.BUMP_FORCE;
        a.vx -= nx * f * 0.5; a.vz -= nz * f * 0.5;
        b.vx += nx * f * 0.5; b.vz += nz * f * 0.5;
      }
    }
  }
}

// ------------------------------------------------------------
// Obstacle hit checks -> instant knockback + stumble trigger.
// (Bug fix #2) Collisions are resolved the SAME tick contact
// happens. Fast movers (hammers/rotors/dice) use a swept test
// between their previous and current position so they can never
// tunnel THROUGH a player between two 30Hz ticks — which was the
// source of the "delayed / missed" hit feel.
// ------------------------------------------------------------
export function checkObstacleHits(entities, world, dt = 1 / 30) {
  for (const o of world.obstacles) {
    if (o.type === 'hammer') {
      const head = o.getHead();
      const prev = o.prevHead || head;
      for (const e of entities) {
        if (!e.alive || e.finished || e.stumbleTimer > 0) continue;
        // swept sphere: closest approach of the head's motion segment
        const ey = e.y + H / 2;
        if (segPointHit(prev.x, prev.z, head.x, head.z, e.x, e.z, o.headHalf + R + 0.2) &&
            Math.abs(ey - head.y) < (o.headHalf + H * 0.6)) {
          knock(e, e.x - head.x, e.z - head.z, 9);
        }
      }
      // remember for next tick's sweep
      o.prevHead = o.prevHead || { x: 0, y: 0, z: 0 };
      o.prevHead.x = head.x; o.prevHead.y = head.y; o.prevHead.z = head.z;
    } else if (o.type === 'rotor') {
      const ang = o.angle;
      const half = o.len / 2;
      const ex = Math.cos(ang), ez = Math.sin(ang);
      // tip linear speed ~ half * angularSpeed; widen the hit band by how
      // far the bar edge swept this tick so nothing slips between ticks.
      const sweep = Math.abs(o.speed) * half * dt;
      for (const e of entities) {
        if (!e.alive || e.finished || e.stumbleTimer > 0) continue;
        const dx = e.x - o.cx, dz = e.z - o.cz;
        if (Math.abs(e.y + H / 2 - o.cy) > 1.4) continue;
        const t = dx * ex + dz * ez;             // along the bar
        if (Math.abs(t) > half + R) continue;
        const perp = Math.abs(dx * -ez + dz * ex); // distance from bar line
        if (perp < R + 0.5 + sweep * 0.5) {
          const s = Math.sign(o.speed) || 1;
          knock(e, -ez * s, ex * s, 8);
        }
      }
    } else if (o.type === 'die') {
      // die moves along +Z; use its authoritative sim coords (x,y,z),
      // not the mesh local transform (fixes stale-position hit bug).
      const cx = o.x, cy = o.y, cz = o.z;
      const prevZ = o.prevZ != null ? o.prevZ : cz;
      for (const e of entities) {
        if (!e.alive || e.finished || e.stumbleTimer > 0) continue;
        const dy = Math.abs(e.y + H / 2 - cy);
        if (dy > o.r + 1) continue;
        // swept in Z between prevZ and cz
        if (segPointHit(cx, prevZ, cx, cz, e.x, e.z, o.r + R)) {
          knock(e, e.x - cx, e.z - cz, 10);
        }
      }
      o.prevZ = cz;
    }
  }
}

// ------------------------------------------------------------
// Knockback Melee resolution (Task #3).
// For every entity whose melee active-frame is open this tick, find targets
// inside a short NARROW forward CONE and apply the physics-only knockback:
//   - cancel target velocity + active jump/dive state (velocity override),
//   - impulse away from the attacker (Target - Attacker).normalized * force,
//   - airborne targets: 1.5x horizontal distance + 0.5s ragdoll/stun,
//   - brief stumble + 0.3s directional input-lock on the target,
//   - Super Punch: attacker mid-dash => 1.3x knockback.
// Damage is always 0 — pure crowd-control utility, per spec.
// ------------------------------------------------------------
export function checkMeleeHits(entities, onHit) {
  const list = entities.filter(e => e.alive && !e.finished);
  for (const a of list) {
    if (!a.meleeActive) continue;
    a.meleeActive = 0;
    a._meleeFired = true;                 // one hit test per swing

    const range = CFG.MELEE_RANGE + R;

    // ---------------------------------------------------------------
    // AIM ASSIST (fix for "I can't punch players near me").
    // Previously the punch used a NARROW forward cone locked to the
    // attacker's yaw, and yaw only ever changes while MOVING. So if you
    // stood next to someone (not walking into them) the cone pointed at
    // your last-walked direction and the swing whiffed. We now:
    //   1) gather EVERY rival in range within the vertical band, and
    //   2) if the best one is within a GENEROUS arc (or on any entity
    //      that opts into full aim-assist via `a.meleeAimAssist`, i.e.
    //      the human), SNAP the attacker to face that target so the hit
    //      lands. Bots keep a slightly tighter arc so their shoves still
    //      read as deliberate. Damage stays 0 — pure crowd control.
    // ---------------------------------------------------------------
    const fx0 = Math.sin(a.yaw), fz0 = Math.cos(a.yaw);   // attacker facing (XZ)
    // Human punches get full 360° acquisition of the NEAREST rival in reach
    // (you always hit whoever you're standing next to). Bots use a forward
    // arc so their punches stay directional/intentional.
    const acquireDot = a.meleeAimAssist ? -1.1 : CFG.MELEE_CONE_DOT;
    const targets = [];
    for (const b of list) {
      if (b === a) continue;
      const dx = b.x - a.x, dz = b.z - a.z;
      const dy = Math.abs((b.y + H / 2) - (a.y + H / 2));
      if (dy > H) continue;                              // different vertical band
      const dist = Math.hypot(dx, dz);
      if (dist > range || dist < 1e-4) continue;
      const dot = (dx / dist) * fx0 + (dz / dist) * fz0;
      if (dot < acquireDot) continue;
      targets.push({ b, dx, dz, dist });
    }
    // Face the nearest acquired target so the swing connects (aim assist).
    if (a.meleeAimAssist && targets.length) {
      let near = targets[0];
      for (const t of targets) if (t.dist < near.dist) near = t;
      a.yaw = Math.atan2(near.dx, near.dz);
    }
    const fx = Math.sin(a.yaw), fz = Math.cos(a.yaw);   // (possibly re-aimed) facing
    // Effective hit cone: humans get a wide, forgiving arc after aim-assist;
    // bots keep the configured narrower cone.
    const hitDot = a.meleeAimAssist ? CFG.MELEE_HIT_DOT_ASSIST : CFG.MELEE_CONE_DOT;
    let hitAny = false;

    for (const { b, dx, dz, dist } of targets) {
      // wide cone: normalized offset must point roughly the attacker's way
      const dot = (dx / dist) * fx + (dz / dist) * fz;
      if (dot < hitDot) continue;

      // ---- APPLY IMPACT ----
      // velocity override: kill current momentum + any active jump/dive state
      b.vx = 0; b.vz = 0;
      if (b.vy > 0) b.vy = 0;                            // cancel active rising jump
      b.diveTimer = 0; b.flipping = false; b.flipT = 0; b.pose.flip = 0;
      b.intent.mx = 0; b.intent.mz = 0; b.intent.jump = false; b.intent.dive = false;

      // knockback vector = away from attacker, normalized
      const nx = dx / dist, nz = dz / dist;
      let force = CFG.MELEE_KNOCKBACK;
      if (a.meleeSuper) force *= CFG.MELEE_SUPER_MULT;   // Super Punch
      const airborne = !b.grounded;
      if (airborne) force *= CFG.MELEE_AIRBORNE_MULT;    // airborne fly farther

      b.vx = nx * force;
      b.vz = nz * force;
      b.vy = Math.max(b.vy, airborne ? 6.5 : 4.5);       // pop up so they sail back

      // stun / input-lock / stumble
      b.stumbleTimer = Math.max(b.stumbleTimer, airborne ? CFG.MELEE_AIR_STUN : CFG.STUMBLE_TIME * 0.6);
      b.inputLock = Math.max(b.inputLock, CFG.MELEE_INPUT_LOCK);
      b.onStumble && b.onStumble();

      hitAny = true;
    }
    a.meleeSuper = false;
    if (onHit) onHit(a, hitAny);
  }
}

// Distance from point P to segment A->B < radius ?  (2D, XZ plane)
function segPointHit(ax, az, bx, bz, px, pz, radius) {
  const abx = bx - ax, abz = bz - az;
  const apx = px - ax, apz = pz - az;
  const len2 = abx * abx + abz * abz;
  let t = len2 > 1e-9 ? (apx * abx + apz * abz) / len2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const cx = ax + abx * t, cz = az + abz * t;
  const dx = px - cx, dz = pz - cz;
  return (dx * dx + dz * dz) < radius * radius;
}

function knock(e, dx, dz, force) {
  const d = Math.hypot(dx, dz) || 1;
  e.vx += (dx / d) * force;
  e.vz += (dz / d) * force;
  e.vy = Math.max(e.vy, 4.5);
  e.stumbleTimer = CFG.STUMBLE_TIME;
  e.onStumble && e.onStumble();
}

// Integrate one entity's velocity/position for a fixed step.
export function integrate(e, world, dt, ground) {
  // ------------------------------------------------------------
  // SWIMMING branch (Task #2). While inside a water trigger volume the normal
  // ground/air kinematics are replaced by buoyant, heavily-damped motion:
  //   - gravity is mostly cancelled (WATER_GRAVITY_MULT),
  //   - a buoyant upward accel lifts a sinking body toward the surface,
  //   - strong isotropic drag on all three axes gives the thick, floaty feel.
  // Exiting the volume (ground.water == null next tick) restores the normal
  // running/air physics below automatically.
  // ------------------------------------------------------------
  if (ground.water) {
    e.vy += CFG.GRAVITY * CFG.WATER_GRAVITY_MULT * dt;   // tiny residual sink
    // Buoyancy: push up while below the (slightly submerged) surface line so
    // the body naturally floats up to bob at the waterline instead of sinking.
    const target = ground.water.surfaceTop - CFG.WATER_SURFACE_MARGIN;
    if (e.y < target) {
      e.vy += CFG.WATER_BUOYANCY * dt;
      if (e.vy > CFG.WATER_MAX_RISE) e.vy = CFG.WATER_MAX_RISE;   // never rocket out
    }
    // heavy linear drag (all axes) — water resists motion in every direction
    const wd = Math.max(0, 1 - CFG.WATER_DRAG * dt);
    e.vx *= wd; e.vy *= wd; e.vz *= wd;

    e.x += e.vx * dt;
    e.y += e.vy * dt;
    e.z += e.vz * dt;
    return;
  }

  // gravity
  e.vy += CFG.GRAVITY * dt;

  // horizontal friction (ice = low).
  // IMPORTANT (speed fix): friction is a STOPPING force — it should brake the
  // player when they aren't actively pushing, not constantly bleed the speed
  // of a player who IS running. Previously full friction was applied every
  // tick regardless of input, so ground speed settled far below MOVE_SPEED
  // (≈3.9 instead of the configured value) — the run never felt as fast as
  // intended. We now apply full friction only when there is little/no move
  // intent; while actively running we apply a much gentler drag so the
  // acceleration in Entity.tick can actually reach the target top speed.
  // Ice keeps its signature low friction in BOTH cases (slippery).
  const hasIntent = e.intent && Math.hypot(e.intent.mx || 0, e.intent.mz || 0) > 0.15;
  if (ground.grounded) {
    let fr = ground.ice ? CFG.ICE_FRICTION : CFG.FRICTION;
    if (hasIntent && !ground.ice) fr *= 0.18;   // gentle drag while running (non-ice)
    const damp = Math.max(0, 1 - fr * dt);
    e.vx *= damp; e.vz *= damp;
    // conveyor push
    if (ground.conveyor) { e.vx += ground.conveyor.x * dt * 8; e.vz += ground.conveyor.z * dt * 8; }
  } else {
    e.vx *= Math.max(0, 1 - 0.6 * dt);
    e.vz *= Math.max(0, 1 - 0.6 * dt);
  }

  e.x += e.vx * dt;
  e.y += e.vy * dt;
  e.z += e.vz * dt;
}
