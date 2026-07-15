import * as THREE from 'three';
import { CFG } from './config.js';

// ============================================================
// Lightweight AABB collision + entity kinematics (Section 1).
// No rigid-body engine: players are vertical capsules approximated
// as AABBs resolved against static/moving platform AABBs.
// ============================================================

const R = CFG.PLAYER_RADIUS;
const H = CFG.PLAYER_HEIGHT;

// Resolve an entity (feet at e.y) against all solid platforms.
// Returns { grounded, groundY, ice, conveyor }.
export function resolveEntity(e, world, dt) {
  let grounded = false;
  let groundY = -999;
  let iceGround = false;
  let conveyor = null;

  const minX = e.x - R, maxX = e.x + R;
  const minZ = e.z - R, maxZ = e.z + R;
  const feet = e.y;
  const head = e.y + H;

  for (const p of world.platforms) {
    if (p.solid === false) continue;
    const pMinX = p.x - p.sx / 2, pMaxX = p.x + p.sx / 2;
    const pMinZ = p.z - p.sz / 2, pMaxZ = p.z + p.sz / 2;
    const pTop = p.y + p.sy / 2, pBot = p.y - p.sy / 2;

    // horizontal overlap?
    if (maxX <= pMinX || minX >= pMaxX || maxZ <= pMinZ || minZ >= pMaxZ) continue;

    // landing on top: falling and feet near top surface
    if (e.vy <= 0.001 && feet <= pTop + 0.35 && feet >= pTop - 0.6) {
      if (pTop > groundY) {
        groundY = pTop; grounded = true;
        iceGround = !!p.ice;
        conveyor = p.conveyor || null;
      }
    } else if (feet < pTop - 0.05 && head > pBot + 0.05) {
      // side penetration — push out on the smallest axis (horizontal)
      const overlapL = maxX - pMinX;
      const overlapR = pMaxX - minX;
      const overlapF = maxZ - pMinZ;
      const overlapB = pMaxZ - minZ;
      const m = Math.min(overlapL, overlapR, overlapF, overlapB);
      // only push if this platform is tall enough to be a wall
      if (p.sy > 1.2) {
        if (m === overlapL) e.x -= overlapL;
        else if (m === overlapR) e.x += overlapR;
        else if (m === overlapF) e.z -= overlapF;
        else e.z += overlapB;
      }
    }
  }

  if (grounded) {
    if (e.y < groundY) e.y = groundY;
    if (e.y <= groundY + 0.05) { e.y = groundY; if (e.vy < 0) e.vy = 0; }
    else grounded = false;
  }

  return { grounded, groundY: grounded ? groundY : e.y, ice: iceGround, conveyor };
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
  // gravity
  e.vy += CFG.GRAVITY * dt;

  // horizontal friction (ice = low)
  if (ground.grounded) {
    const fr = ground.ice ? CFG.ICE_FRICTION : CFG.FRICTION;
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
