// ============================================================
// BlockRoyale.io — global tuning constants
// Every gameplay/perf number lives here so balance passes are
// a single-file edit (Section 7/8 of spec: enforce budgets).
// ============================================================

export const CFG = {
  // --- Simulation ---
  TICK_HZ: 30,              // logical sim rate (Section 1: 20-30Hz)
  MAX_PLAYERS: 32,          // full lobby (Section 3 round 1)
  GRAVITY: -34,             // units/s^2 (snappy, arcadey)
  MOVE_SPEED: 9.4,          // units/s ground run (Task #3: bumped a little faster for everyone)
  AIR_CONTROL: 0.55,        // fraction of move accel while airborne
  JUMP_VELOCITY: 12.4,      // slightly higher so jump arc still clears gaps at the faster run speed
  DIVE_SPEED: 15.5,         // forward lunge burst
  DIVE_DURATION: 0.42,      // seconds
  DIVE_COOLDOWN: 0.9,
  DIVE_POP: 3,              // small upward pop when diving (double-jump arc)
  ACCEL: 68,                // ground acceleration (nudged up so the higher top speed is reached snappily)
  FRICTION: 12,             // ground damping
  ICE_FRICTION: 1.6,        // slippery biome damping
  PLAYER_RADIUS: 0.42,      // capsule/AABB half-width
  PLAYER_HEIGHT: 1.7,
  BUMP_FORCE: 6.5,          // soft player-vs-player knockback
  STUMBLE_TIME: 0.62,       // tumble animation length (Section 2)
  RESPAWN_FALL_Y: -18,      // below this => fell off map
  CAMERA_DIST: 9.5,
  CAMERA_HEIGHT: 4.2,
  CAMERA_LERP: 0.12,

  // --- Round structure (Section 3) ---
  // eliminatePct = fraction eliminated at end of round
  ROUNDS: [
    { name: 'Round 1', type: 'race',     biome: 'jungle', keep: 16, time: 90,  objective: 'Reach the finish line!' },
    { name: 'Round 2', type: 'survival', biome: 'lava',   keep: 8,  time: 55,  objective: 'Survive the hammers for 55s!' },
    { name: 'Round 3', type: 'race',     biome: 'ice',     keep: 4,  time: 75,  objective: 'Sprint to the finish!' },
    { name: 'Final: King of the Block', type: 'king', biome: 'sky', keep: 1, time: 45, objective: 'Hold the throne to win the Crown!' }
  ],

  LOBBY_COUNTDOWN: 5,       // seconds before round 1
  ROUND_COUNTDOWN: 3,

  // --- Economy (Section 5, cosmetic-only) ---
  COIN_PARTICIPATE: 25,
  COIN_PER_ROUND: 40,
  COIN_TOP3: 120,
  COIN_WIN: 300,
  XP_PER_ROUND: 60,
  XP_WIN: 200,
};

// Fixed timestep derived once.
export const DT = 1 / CFG.TICK_HZ;
