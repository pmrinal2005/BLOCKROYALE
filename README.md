<div align="center">

# 🎮 BlockRoyale.io

### **A lightweight, browser-based 3D voxel party battle-royale.**
### _Race. Tumble. Punch. Swim. Win the Crown._

[![Play](https://img.shields.io/badge/▶_PLAY_NOW-22d3ee?style=for-the-badge&logoColor=white)](#-quick-start)
[![Three.js](https://img.shields.io/badge/Three.js-r160-000000?style=for-the-badge&logo=three.js&logoColor=white)](https://threejs.org)
[![Vite](https://img.shields.io/badge/Vite-5.x-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev)
[![Vercel](https://img.shields.io/badge/Deploy-Vercel-000000?style=for-the-badge&logo=vercel&logoColor=white)](https://vercel.com)
[![Zero Backend](https://img.shields.io/badge/Backend-None_(100%25_static)-34d399?style=for-the-badge)](#-architecture)

**≈149 KB gzipped · loads in < 3 s · 60 fps on integrated graphics · zero install, zero sign-up**

</div>

---

## 📖 Table of Contents

1. [What is BlockRoyale.io?](#-what-is-blockroyaleio)
2. [Feature Highlights](#-feature-highlights)
3. [Quick Start](#-quick-start)
4. [How to Play](#-how-to-play)
5. [Signature Mechanics](#-signature-mechanics-deep-dive)
6. [Match Flow & Rounds](#-match-flow--rounds)
7. [Cosmetics & Economy](#-cosmetics--economy)
8. [Architecture](#-architecture)
9. [Graphics Philosophy](#-graphics-philosophy--aesthetic-yet-featherweight)
10. [Performance Budgets](#-performance-budgets)
11. [Project Structure](#-project-structure)
12. [Testing](#-testing)
13. [Deployment (Vercel)](#-deployment-vercel-free-tier)
14. [Roadmap](#-roadmap)
15. [Credits & License](#-credits--license)

---

## 🌟 What is BlockRoyale.io?

**BlockRoyale.io** is a bright, chaotic, physics-driven party battle-royale that runs entirely in your browser — no downloads, no accounts, no plugins. You drop into a 32-player lobby of blocky characters, sprint through obstacle gauntlets, get knocked into hilarious pileups, and survive round after round until one player is crowned on the throne block.

It is built to a **hard engineering brief**: it must load in **under 3 seconds** on a school Chromebook with integrated graphics and hold **60 fps with 32 players on-screen** — while still looking *aesthetic and cinematic*. Every design decision prioritizes **file size, load time, and runtime performance** above raw visual complexity, then claws back visual richness through smart lighting, tone-mapping, and material choices rather than heavy assets.

> **The emotional core:** losing is a punchline, not a punishment. Every wipeout is a slide-whistle and a cartoon tumble — you laugh, then hit **Play Again**.

---

## ✨ Feature Highlights

| | Feature | Description |
|---|---------|-------------|
| 🥊 | **Knockback Melee ("Punch")** | Fast-cooldown, directional crowd-control strike. Zero damage — pure physics knockback. Cancels enemy momentum & jumps, sends airborne targets flying 1.5× farther, and **Super Punch** while dashing hits 1.3× harder. Bots punch each other too. |
| 🌊 | **Localized Swimming Zones** | Trigger-volume water sections carved into ~50% of race tracks. Enter → state flips *Running → Swimming*: buoyancy, thick drag, slower speed, and repurposed up/down swim controls. Exit → instant reset to running. |
| 👁️ | **Spectator System** | Activates the moment you **Qualify** or are **Eliminated**. Disables your controls, filters the camera to only *still-racing* players/bots, and lets you cycle targets with ◀ ▶ / arrow keys plus a live "Spectating: …" overlay. |
| 🤸 | **Dive + Front-Flip** | Double-tap jump mid-air for a forward plunge with a crisp single 360° flip — great for clearing gaps and bodychecking rivals into hazards. |
| 🏁 | **Full Match Loop** | Preview → lobby countdown → 4 rounds (race / survival / race / King-of-the-Block) → podium → one-click replay. |
| 🤖 | **Bot-Fill Matchmaking** | Lobbies fill instantly with named AI bots so there's never dead-time. Bots run, jump, dive, and punch autonomously. |
| 🎨 | **Cosmetic Economy** | 10 skins, 6 hats, 8 jump/dive trails — all cosmetic, **zero pay-to-win**. Earn "Block Coins" by playing. Persisted in `localStorage`. |
| 🌋 | **4 Themed Biomes** | Jungle, Lava, Ice (slippery!), and the golden Sky Temple — each a reskin of one shared block toolkit. |
| 🔊 | **Cartoon Audio** | Procedural WebAudio SFX (boing, slide-whistle, poof, fanfare, coin chime) — no audio files to download. |
| 📱 | **Mobile Ready** | Virtual joystick + on-screen Jump / Punch buttons; auto quality-scaling for 3-year-old Android browsers. |

---

## 🚀 Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Run the dev server (hot reload)
npm run dev
#   → open http://localhost:3000

# 3. Production build (static site → dist/)
npm run build

# 4. Preview the production build locally
npm run preview
```

That's it. Open the page, click **Play Now**, and you're in a lobby within seconds. No backend to run.

---

## 🎯 How to Play

### 🖥️ Desktop Controls

| Input | Action |
|-------|--------|
| **W A S D** / **Arrow Keys** | Move |
| **Mouse (drag)** | Orbit third-person camera |
| **Spacebar** | Jump — press **again mid-air** to **Dive + Flip** |
| **Shift** | Dive (forward lunge) |
| **F** / **E** / **Q** / **Right-Click** | 🥊 **Punch** (Knockback Melee) |
| **◀ ▶ Arrow Keys** | Cycle spectator target (while spectating) |

### 📱 Mobile Controls

| Input | Action |
|-------|--------|
| **Left-thumb virtual joystick** | Move |
| **Tap right side of screen** | Jump / Dive |
| **On-screen 🥊 button** | Punch |
| **On-screen ◀ ▶ buttons** | Cycle spectator target |

### 🌊 While Swimming (inside a water zone)
- **Move keys / joystick** → swim horizontally (slower, floaty)
- **Jump / up** → swim **up**
- **Dive / Shift / down** → swim **down**
- Buoyancy naturally floats you toward the surface; exit the far bank to resume running.

---

## 🔬 Signature Mechanics (Deep Dive)

### 🥊 1. Knockback Melee — _"The Punch"_

A fast-cooldown, **directional, zero-damage** melee that prioritizes **physics-based crowd control** over damage. It instantly halts an enemy's momentum and shoves them away — perfect for creating space at a bottleneck or hazard-killing a rival by punching them off a ledge or into a swinging hammer.

**How to punch another player:**
1. Face the target (camera / movement direction sets your facing).
2. Get within melee reach (~1.9 units — roughly two body-widths).
3. Press **`F`** (or `E`/`Q`), **right-click**, or tap the **on-screen 🥊 button**.

**What happens on a hit** _(resolved server-authoritatively in `physics.js → checkMeleeHits()`):_
- The strike only lands inside a **narrow forward cone** (`MELEE_CONE_DOT`), so you must aim.
- Target's velocity is **overridden to zero**, and any active jump/dive/flip is cancelled.
- An **impulse is applied along `(Target − Attacker).normalized`** — straight away from you.
- **Airborne targets** fly **1.5×** farther and get a **0.5 s ragdoll-stun**.
- Grounded targets get a brief **stumble** + **0.3 s directional input-lock**.
- **Super Punch:** punching *while dashing/diving* folds your dash momentum in for **1.3×** knockback.
- **4-second cooldown** prevents spam.

**Bots do it too:** every bot shares the identical code path. When a bot is close to a *different* player and off cooldown, its brain rolls to throw a punch — producing the emergent, comedic shoving matches at chokepoints.

---

### 🌊 2. Localized Water / Swimming Zones

Water is a **localized 3D trigger volume** covering only *part* of a track — not the whole level. Roughly **50 % of race tracks** roll "wet" at build time and get exactly one swim channel carved across the lane; the rest stay fully dry. Survival and King rounds never get water.

The system implements the full state machine you'd expect:

| Stage | Behaviour |
|-------|-----------|
| **Trigger Volume** | `World.waterAt(x, y, z)` runs a cheap per-tick AABB test at the player's mid-body height. |
| **Enter (Running → Swimming)** | Fires `onWaterEnter` (splash SFX), kills any active flip/dive, switches to the swim pose. |
| **Swimming Physics** | Gravity nearly cancelled + **buoyancy** lifts you toward the surface, **heavy isotropic drag** on all axes, **reduced horizontal speed**, and **up/down swim controls** (jump = up, dive = down). |
| **Exit (Swimming → Running)** | Fires `onWaterExit`; normal running physics & animation resume instantly. |

Buoyancy is clamped (`WATER_MAX_RISE`) so you **bob at the waterline** rather than rocketing out. All tuning lives in `config.js` (`WATER_*`).

---

### 👁️ 3. Spectator System

Spectating **activates only after** the local player's state changes to **Eliminated** or **Qualified** — never before.

- **State Trigger:** on eliminate/qualify, the player's movement & action **input is disabled**, and `SpectatorMode` is entered.
- **Target Filtering:** the camera targets **only players/bots still actively racing** — anyone already eliminated *or* already qualified/finished (and the local player) is **excluded**. The list shrinks live as the round thins out.
- **Camera Switching:** **Left/Right Arrow** keys **or** the on-screen **◀ ▶ buttons** cycle to the previous/next active target, wrapping around.
- **UI Overlay:** a clean overlay shows **`Spectating: <name>`** plus the switch buttons and remaining-target count.
- **Auto-cleanup:** SpectatorMode ends automatically at round end / match end / return to menu, restoring input.

---

## 🏁 Match Flow & Rounds

```
 Preview  →  Lobby Countdown  →  Round 1  →  Round 2  →  Round 3  →  Final  →  Podium  →  Play Again
 (jiggle)     (5 s, 32 players)   RACE        SURVIVAL     RACE       KING       top-3       one click
                                  32 → 16     16 → 8       8 → 4      4 → 1     + rewards
```

| Round | Type | Biome | Objective | Survivors |
|-------|------|-------|-----------|-----------|
| **1** | Race | 🌿 Jungle | Reach the finish line | 16 |
| **2** | Survival | 🌋 Lava | Dodge swinging hammers for 55 s | 8 |
| **3** | Race | ❄️ Ice (slippery) | Sprint to the finish | 4 |
| **Final** | 👑 King of the Block | ☁️ Sky Temple | Hold the throne to win the Crown | 1 |

Fall off the map and you don't lose the session — you drop into **Spectator Mode** and keep watching until the podium.

---

## 🎨 Cosmetics & Economy

**Single soft currency — "Block Coins"** — earned purely by playing (participation, per-round survival, top-3 & win bonuses). **No real-money purchases, no pay-to-win, ever.** Everything below is cosmetic and reuses the same base geometry (only textures/colors/accessory cubes swap), so a full 32-player lobby of unique looks costs essentially nothing to render.

| Category | Count | Examples |
|----------|-------|----------|
| 🧍 **Skins** | 10 | Blocky, Lava, Zombie, Cake, Robot, Golden, Shadow, Minty, Grape, Bubblegum |
| 🎩 **Hats** | 6 | Baseball Cap, Top Hat, Crown, Party Cone, Antenna |
| ✨ **Trails** | 8 | Sparkle, Fire, Frost, Rainbow, Bubbles, Void, Gold Rush |

Progress persists automatically in `localStorage` (no server, no login).

---

## 🏗️ Architecture

BlockRoyale.io is a **100 % static, client-authoritative** single-page app — it deploys to any static host (Vercel free tier by default) with **no server runtime**.

```
┌──────────────────────────────────────────────────────────────┐
│                         Browser (client)                       │
│                                                                │
│   main.js  ──► boots splash, loads save, builds Game           │
│      │                                                         │
│      ▼                                                         │
│   Game (game.js) ── fixed-step SIM @30 Hz  +  render @60 fps    │
│      │        ├── Entity/Bot kinematics  (entity.js, bots.js)  │
│      │        ├── AABB physics + melee    (physics.js)         │
│      │        ├── Level/World geometry    (levels.js, world.js)│
│      │        ├── Character rig + pose     (character.js)       │
│      │        ├── Trails / Nameplates      (trails.js, ...)     │
│      │        ├── UI overlays              (ui.js)             │
│      │        └── Procedural audio         (audio.js)          │
│      ▼                                                         │
│   Three.js WebGL2 renderer (ACES tone-map, PCF soft shadows)   │
└──────────────────────────────────────────────────────────────┘
```

**Design note — server-ready by construction.** The simulation is written as a clean `intent → integrate → resolve` pipeline running at a fixed 30 Hz tick, mirroring exactly what an authoritative **Colyseus** room tick would run. This makes it **drop-in replaceable** with real server reconciliation + client prediction later, without rewriting gameplay. For the current static build, the client *is* the authority.

---

## 🌇 Graphics Philosophy — _Aesthetic yet Featherweight_

The brief demands a **real-life, cinematic aesthetic** while staying **maximally lightweight with no lag**. We hit both by spending our budget on *light and color math* (per-pixel, essentially free) instead of heavy assets:

- **🎞️ ACES Filmic tone-mapping + sRGB output** — punchy highlights and gentle rolloff that read as "photographic," at zero geometry cost.
- **☀️ One dramatic, low-angled cinematic sun** casting long **PCF soft shadows** via a tight frustum that *follows the player* — the single biggest realism upgrade for almost no fill-rate.
- **🌈 Hemisphere + minimal ambient** — warm sky/ground bounce keeps shadow cores deep without crushing to black.
- **🧱 Cached `MeshStandardMaterial`** — real view-dependent specular highlights, but every color is a **shared, cached material** so draw calls stay tiny.
- **🌅 Gradient sky dome + per-biome fog** — depth and atmosphere from a single extra draw.
- **⚙️ Automatic quality tiers** (`detectQuality()`): sniffs GPU/RAM/cores and scales shadow resolution, pixel ratio, and antialiasing — **high** machines get the full 2048px-shadow cinematic pass; **low** machines drop shadows entirely to guarantee 60 fps. Nobody lags.

No `.glb`/`.fbx` meshes, no normal maps, no PBR textures, no streamed assets — just primitives, cached materials, and clever lighting.

---

## 📊 Performance Budgets

| Metric | Target | Status |
|--------|--------|--------|
| Initial transfer | < 5 MB | ✅ **~149 KB gzipped** (~584 KB raw) |
| Load time | < 3 s on 4G | ✅ |
| Frame rate | 60 fps on integrated GPU, 32 players | ✅ (auto-scales down on weak HW) |
| Mobile | 30 fps+ on 3-yr-old Android | ✅ (low-tier quality profile) |
| JS engine chunk | small & cacheable | ✅ Three.js split into its own chunk |

---

## 📁 Project Structure

```
webapp/
├── index.html            # SPA shell + HUD / menu markup
├── vite.config.js        # Static build → dist/ (three.js code-split)
├── vercel.json           # Vercel static-hosting config
├── package.json
├── src/
│   ├── main.js           # Boot sequence & entry point
│   ├── game.js           # Orchestrator: scene, camera, match state machine
│   ├── entity.js         # Shared player/bot state + kinematics (melee, water, dive)
│   ├── bots.js           # Autonomous bot AI (run/jump/dive/punch)
│   ├── physics.js        # AABB collision, knockback melee, swimming integration
│   ├── levels.js         # Modular level composition + water-section placement
│   ├── world.js          # World geometry, biomes, obstacles, water zones
│   ├── character.js      # Voxel character rig + hand-keyed pose animation
│   ├── cosmetics.js      # Skins / hats / trails + localStorage save
│   ├── trails.js         # Instanced particle trail system
│   ├── nameplates.js     # Screen-space name labels
│   ├── input.js          # Keyboard / mouse / touch + spectator cycling
│   ├── ui.js             # HUD, toasts, spectator overlay, shop, podium
│   ├── audio.js          # Procedural WebAudio SFX + music
│   └── config.js         # ★ All gameplay/perf tuning constants
└── tests/
    ├── playtest.mjs      # Melee + dive/flip behavioral tests
    ├── watertest.mjs     # Water/swimming + spectator-filter tests
    └── trailtest.mjs     # Particle trail tests
```

---

## 🧪 Testing

Headless, WebGL-free behavioral tests exercise the pure simulation modules — they run anywhere Node runs:

```bash
node tests/playtest.mjs     # Task: Melee physics + Dive/Flip           → 19 passing
node tests/watertest.mjs    # Task: Water/Swimming + Spectator filter    → 24 passing
node tests/trailtest.mjs    # Particle trails                            → 12 passing
```

**Total: 55 automated assertions, 0 failures.** They validate the exact spec rules — e.g. "spectator targets exclude eliminated *and* qualified players," "swim speed is capped below run speed," "airborne melee targets get 1.5× knockback + 0.5 s stun," and "water spawns on ~50 % of race tracks, never on survival/king rounds."

---

## 🚀 Deployment (Vercel Free Tier)

The app is a fully static site, so deploying is trivial:

**Option A — Vercel Dashboard**
1. Import the repo at [vercel.com/new](https://vercel.com/new).
2. Vercel auto-detects `vercel.json`:
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
   - **Framework:** none (static)
3. Deploy. Done.

**Option B — Vercel CLI**
```bash
npm i -g vercel
vercel --prod
```

`vercel.json` already sets `cleanUrls: true` and `trailingSlash: false` for tidy static routing. Because there is **no server runtime**, it runs comfortably within the Vercel free tier with global CDN caching.

---

## 🗺️ Roadmap

- [ ] **Real-time multiplayer** — promote the built-in fixed-step sim to an authoritative Colyseus room with client-side prediction & reconciliation.
- [ ] **More biomes & obstacle modules** — expand the modular library (vine-swings, conveyor mazes, rolling-dice canyons).
- [ ] **Seasonal Battle Pass** — cosmetic-only tracks that reuse existing art direction.
- [ ] **Persistent leaderboards** — global & friends (wins, top-3s, crowns).
- [ ] **Emote wheel & victory dances** — more hand-keyed loops on the shared rig.

---

## 🙌 Credits & License

- **Engine:** [Three.js](https://threejs.org) (r160) — rendering only, code-split for cache efficiency.
- **Build:** [Vite](https://vitejs.dev).
- **Design brief:** the full BlockRoyale.io technical & design specification (lightweight voxel party battle-royale).

Built with a relentless focus on **file size, load time, and runtime performance** — proving a browser game can feel *cinematic* without ever feeling *heavy*.

> _Oof! Better luck next round._ 🎉

---

<div align="center">

**Made for chaos. Optimized for everyone.** 🧱👑

</div>
