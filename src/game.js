import * as THREE from 'three';
import { CFG, DT } from './config.js';
import { CharacterPool } from './character.js';
import { buildLevel } from './levels.js';
import { BIOMES } from './world.js';
import { Entity } from './entity.js';
import { BotBrain, botName } from './bots.js';
import { resolvePlayerBumps, checkObstacleHits } from './physics.js';
import { audio } from './audio.js';
import * as UI from './ui.js';
import { SKINS } from './cosmetics.js';

// ============================================================
// Game orchestrator: scene, camera, match state machine and the
// fixed-step sim / variable-step render loop (Section 1 & 4).
// States: preview -> countdown -> playing -> roundEnd -> ...
//         -> podium.
// ============================================================

export class Game {
  constructor(hostId, save, input) {
    this.save = save;
    this.input = input;
    this.host = document.getElementById(hostId);

    // ---- Quality tier (auto-scaled for low-end devices) ----
    // Guarantees no lag on weak browsers: we drop shadow resolution /
    // pixel ratio (and can disable shadows entirely) on modest hardware,
    // while high-end machines get the full cinematic pass.
    this.quality = detectQuality();

    // Renderer (WebGL2 w/ WebGL1 fallback via three's default probe)
    this.renderer = new THREE.WebGLRenderer({
      antialias: this.quality.antialias,
      powerPreference: 'high-performance',
      stencil: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.quality.pixelRatio));
    this.renderer.setSize(innerWidth, innerHeight);
    // Cinematic colour pipeline: filmic tone-mapping + sRGB output give the
    // punchy highlights / gentle rolloff that read as "photographic" —
    // essentially free (a per-pixel curve), no extra geometry or textures.
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    // Real, dramatic shadows — the single biggest realism upgrade. Kept
    // cheap via a tight frustum that follows the player (see _updateSun).
    this.renderer.shadowMap.enabled = this.quality.shadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.host.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 320);
    this.camera.position.set(0, 8, 14);

    // Lighting (Section 6 tone, upgraded to cinematic):
    //  - one strong "sun" directional light that CASTS shadows,
    //  - a soft sky/ground hemisphere fill for believable bounce,
    //  - a low ambient floor so shadows stay dramatic (not washed out).
    const sun = new THREE.DirectionalLight(0xfff4e0, 2.15);
    sun.position.set(28, 46, 18);
    sun.castShadow = this.quality.shadows;
    const sc = sun.shadow;
    sc.mapSize.set(this.quality.shadowMap, this.quality.shadowMap);
    sc.camera.near = 1;
    sc.camera.far = 140;
    const S = 34;                       // ortho half-extent (frustum size)
    sc.camera.left = -S; sc.camera.right = S;
    sc.camera.top = S; sc.camera.bottom = -S;
    sc.bias = -0.0006;
    sc.normalBias = 0.5;                // hides shadow acne on box faces
    this.scene.add(sun);
    this.scene.add(sun.target);
    this.sun = sun;

    this.hemi = new THREE.HemisphereLight(0xdfefff, 0x4a4638, 0.55);
    this.scene.add(this.hemi);
    this.ambient = new THREE.AmbientLight(0xffffff, 0.28);
    this.scene.add(this.ambient);

    this.charPool = new CharacterPool(this.scene, CFG.MAX_PLAYERS + 4, this.quality);

    this.entities = [];
    this.human = null;
    this.world = null;
    this.state = 'preview';
    this.roundIndex = 0;
    this.roundTimer = 0;
    this.countdown = 0;
    this.accumulator = 0;
    this.lastTime = performance.now();
    this.camShake = 0;
    this._camPos = new THREE.Vector3(0, 8, 14);
    this.matchResults = [];  // finishing order (last placed first later reversed)
    this.eliminatedOrder = [];
    this.spectateIndex = 0;

    this._hud = {
      round: document.getElementById('hud-round'),
      alive: document.getElementById('alive-count'),
      timer: document.getElementById('hud-timer'),
      objective: document.getElementById('hud-objective'),
      place: document.getElementById('hud-place'),
    };

    addEventListener('resize', () => this._onResize());
    this._buildPreview();
    this._loop();
  }

  _onResize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
  }

  // Tint the lighting to match the active biome so each world feels like a
  // distinct time-of-day / atmosphere (warm lava dusk, cool icy noon…).
  _applyBiomeLighting() {
    const b = BIOMES[this.world?.biome] || BIOMES.jungle;
    this.sun.color.setHex(b.sun);
    this.hemi.color.setHex(b.amb);
    // lava reads hotter/lower-key; ice reads brighter/cooler
    this.renderer.toneMappingExposure = this.world?.biome === 'lava' ? 0.98
      : this.world?.biome === 'ice' ? 1.12 : 1.05;
  }

  // Keep the shadow-casting sun anchored over whatever we're following so
  // the (deliberately small) shadow frustum always covers the on-screen
  // action — this is what lets us use a tight, cheap shadow map. (perf)
  _updateSun(target) {
    if (!this.sun || !target) return;
    const tx = target.x, ty = target.y, tz = target.z;
    this.sun.target.position.set(tx, ty, tz);
    this.sun.position.set(tx + 28, ty + 46, tz + 18);
    this.sun.target.updateMatrixWorld();
  }

  // ---------------- PREVIEW (menu backdrop) ----------------
  _buildPreview() {
    this.state = 'preview';
    if (this.world) this.world.clear();
    this.world = buildLevel(this.scene, { type: 'king', biome: 'sky' });
    this._applyBiomeLighting();
    // single spinning platform vibe: just show the human jiggling
    this.entities = [];
    const h = new Entity({ name: this.save.name || 'You', isBot: false, ...this._cosmetics() });
    h.x = 0; h.z = 0; h.y = 3;
    this.human = h;
    this.entities.push(h);
    this.previewAngle = 0;
  }

  _cosmetics() {
    return { skinId: this.save.equipped.skin, hatId: this.save.equipped.hat, trailId: this.save.equipped.trail };
  }

  refreshCosmetics() {
    if (this.human) {
      const c = this._cosmetics();
      this.human.skinId = c.skinId; this.human.hatId = c.hatId; this.human.trailId = c.trailId;
    }
  }

  // ---------------- MATCH START ----------------
  startMatch() {
    this.roundIndex = 0;
    this.matchResults = [];
    this.eliminatedOrder = [];
    document.getElementById('hud').classList.remove('hidden');
    const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    if (isTouch) document.getElementById('touch-controls').classList.remove('hidden');
    this.input.enabled = true;
    this._buildRound();
  }

  _buildRound() {
    const cfg = CFG.ROUNDS[this.roundIndex];
    if (this.world) this.world.clear();
    this.world = buildLevel(this.scene, cfg);
    this._applyBiomeLighting();

    // Determine survivors: round 0 = full lobby, else carry alive players.
    let survivors;
    if (this.roundIndex === 0) {
      survivors = this._makeLobby();
    } else {
      survivors = this.entities.filter(e => e.alive && !this._isEliminated(e));
    }
    this.entities = survivors;

    // reset + place at spawn points
    const sp = this.world.spawnPoints;
    survivors.forEach((e, i) => {
      e.respawnAt(sp[i % sp.length]);
      e.won = false;
      e.finished = false;
      e.controlTime = 0;
      if (e.isBot) e.brain = new BotBrain(e, this.world, cfg);
      this._wireSfx(e);
    });

    this.roundTimer = cfg.time;
    this.state = 'countdown';
    this.countdown = this.roundIndex === 0 ? CFG.LOBBY_COUNTDOWN : CFG.ROUND_COUNTDOWN;
    this._nextBeep = Math.ceil(this.countdown);
    this._hud.round.textContent = cfg.name.toUpperCase();
    this._hud.objective.textContent = cfg.objective;
    this._hud.place.classList.add('hidden');
    this._updateHudAlive();
    // Show the round timer immediately (even before "GO!") so it is never
    // blank at the start of a match. (Bug fix #1)
    this._updateHudTimer();
    audio.startMusic();
    UI.toast(cfg.name, '#ffd23f');
  }

  _makeLobby() {
    const arr = [];
    const human = new Entity({ name: this.save.name || 'You', isBot: false, ...this._cosmetics() });
    human.isHuman = true;
    this.human = human;
    arr.push(human);
    // bot fill (Section 4)
    const skins = SKINS.map(s => s.id);
    for (let i = 1; i < CFG.MAX_PLAYERS; i++) {
      const b = new Entity({
        name: botName(i - 1), isBot: true,
        skinId: skins[i % skins.length],
        hatId: 'none', trailId: 'none',
      });
      arr.push(b);
    }
    return arr;
  }

  _wireSfx(e) {
    e.onJump = () => { if (e === this.human) audio.jump(); };
    e.onDive = () => { if (e === this.human) audio.dive(); };
    e.onStumble = () => {
      if (e === this.human) { audio.stumble(); this.camShake = 0.5; }
    };
  }

  _isEliminated(e) { return this.eliminatedOrder.includes(e); }

  // ---------------- SIM STEP ----------------
  _simTick() {
    const cfg = CFG.ROUNDS[this.roundIndex];

    // human intent
    if (this.human && this.human.alive && !this.human.finished) {
      const it = this.input.getIntent();
      this.human.intent.mx = it.mx; this.human.intent.mz = it.mz;
      if (it.jump) this.human.intent.jump = true;
      if (it.dive) this.human.intent.dive = true;
    }

    // bot brains
    for (const e of this.entities) {
      if (e.isBot && e.brain) e.brain.think(DT, this.entities);
    }

    // Advance obstacles FIRST so entities collide against their CURRENT
    // position this very tick (removes the 1-tick collision lag). (Bug fix #2)
    this.world.updateObstacles(DT);

    // integrate players against the freshly-moved world
    for (const e of this.entities) e.tick(this.world, DT);

    resolvePlayerBumps(this.entities);
    // Hit test right after movement, against up-to-date obstacle transforms,
    // so the stumble/knockback is applied instantly on contact. (Bug fix #2)
    checkObstacleHits(this.entities, this.world, DT);

    // round-specific logic
    if (cfg.type === 'race') this._tickRace();
    else if (cfg.type === 'survival') this._tickSurvival();
    else if (cfg.type === 'king') this._tickKing();

    // fall-off detection
    for (const e of this.entities) {
      if (e.alive && !e.finished && e.y < CFG.RESPAWN_FALL_Y) {
        if (cfg.type === 'race') this._respawnBehind(e);
        else this._eliminate(e, 'fell');
      }
    }

    // timer
    this.roundTimer -= DT;
    if (this.roundTimer <= 0) this._endRound('time');
  }

  _tickRace() {
    for (const e of this.entities) {
      if (e.alive && !e.finished && e.z >= this.world.finishZ) {
        e.finished = true;
        e.won = true;
        e.finishOrder = ++this._finishCounter || (this._finishCounter = 1);
        this.matchResults.push(e); // earliest finishers first
        if (e === this.human) { UI.toast('FINISH! 🏁', '#34d399'); audio.fanfare(); }
      }
    }
    const cfg = CFG.ROUNDS[this.roundIndex];
    const finishedCount = this.entities.filter(e => e.finished).length;
    // end round when enough finished to satisfy 'keep'
    if (finishedCount >= cfg.keep) this._endRound('quota');
  }

  _tickSurvival() {
    // survival: nothing extra — eliminations come from falling. Timer ends round.
  }

  _tickKing() {
    const th = this.world.throne;
    for (const e of this.entities) {
      if (!e.alive) continue;
      const dx = e.x - th.x, dz = e.z - th.z;
      const onThrone = (dx*dx + dz*dz) < th.r * th.r && e.y > th.y - 0.6;
      if (onThrone) e.controlTime += DT;
    }
  }

  _finishCounter = 0;

  // ---------------- RESPAWN (race tracks, Bug #3) ----------------
  // Put a fallen player back on the track slightly BEHIND the point where
  // they left it, so they lose a little progress but stay in the race.
  // Applies to EVERY player (human and bots) identically.
  _respawnBehind(e) {
    const back = 3.0;   // units of lost progress along the track (+Z)
    const dropH = 2.4;  // drop height above the surface for a soft landing

    // base on the last safe checkpoint; if we never had one, use spawn.
    let sx = e.lastSafeX, sy = e.lastSafeY, sz = e.lastSafeZ;
    if (!isFinite(sx) || sy < -5) {
      const sp = this.world.spawnPoints[0] || { x: 0, y: 1.2, z: -10 };
      sx = sp.x; sy = sp.y; sz = sp.z;
    }

    // pull back along the race direction (progress is +Z) but never before
    // the start pad, and keep inside the lane width.
    let rz = Math.max(this.world.startZ - 4, sz - back);
    const halfLane = (this.world.laneHalf || 8) - 0.6;
    let rx = Math.max(-halfLane, Math.min(halfLane, sx));

    // find the actual ground height at (rx,rz) so we land on the track,
    // not inside/under it.
    const gy = this._groundHeightAt(rx, rz);
    const ry = (gy != null ? gy : sy) + dropH;

    e.reviveAt(rx, ry, rz);
    // refresh the checkpoint to the safe re-entry spot
    e.lastSafeX = rx; e.lastSafeY = (gy != null ? gy : sy); e.lastSafeZ = rz;

    if (e === this.human) {
      audio.stumble();
      this.camShake = 0.45;
      UI.toast('Whoops! Back on track 🪂', '#ffd23f');
    }
  }

  // Sample the top surface of the highest solid platform under (x,z).
  _groundHeightAt(x, z) {
    let best = null;
    for (const p of this.world.platforms) {
      if (p.solid === false) continue;
      const minX = p.x - p.sx / 2, maxX = p.x + p.sx / 2;
      const minZ = p.z - p.sz / 2, maxZ = p.z + p.sz / 2;
      if (x < minX || x > maxX || z < minZ || z > maxZ) continue;
      const top = p.y + p.sy / 2;
      if (best == null || top > best) best = top;
    }
    return best;
  }

  // ---------------- ELIMINATION ----------------
  _eliminate(e, reason) {
    if (!e.alive || this._isEliminated(e)) return;
    e.alive = false;
    this.eliminatedOrder.push(e);
    this.charPool.spawnPoof(e.x, e.y, e.z, getSkinColor(e));
    if (e === this.human) {
      audio.poof(); audio.aww();
      UI.toast('Oof! 💫', '#ff5ea2');
      this._enterSpectate();
    } else {
      if (e === this.human) audio.poof();
    }
    this._updateHudAlive();
  }

  _enterSpectate() {
    this._hud.place.classList.remove('hidden');
    const left = this.entities.filter(x => x.alive || x.finished).length;
    this._hud.place.textContent = `💀 Out! Spectating… (${left} left)`;
    this.spectateIndex = 0;
  }

  _aliveOrFinished() { return this.entities.filter(e => e.alive || e.finished); }

  _endRound(why) {
    if (this.state !== 'playing') return;
    const cfg = CFG.ROUNDS[this.roundIndex];

    // Rank everyone for this round.
    // Finished (race) ranked by finishOrder; king ranked by controlTime;
    // survivors ranked above eliminated; eliminated by reverse elim order.
    const alive = this.entities.filter(e => e.alive && !e.finished);
    const finished = this.entities.filter(e => e.finished).sort((a,b)=>a.finishOrder-b.finishOrder);

    let ranked;
    if (cfg.type === 'king') {
      ranked = [...this.entities].sort((a, b) => (b.alive?1:0)-(a.alive?1:0) || b.controlTime - a.controlTime);
    } else if (cfg.type === 'survival') {
      ranked = [...alive, ...this.eliminatedOrder.slice().reverse()];
    } else { // race
      ranked = [...finished, ...alive.sort((a,b)=>b.z-a.z), ...this.eliminatedOrder.slice().reverse()];
    }

    const keep = Math.min(cfg.keep, ranked.length);
    const survivors = ranked.slice(0, keep);
    const cut = ranked.slice(keep);

    // reward the human for surviving this round
    if (survivors.includes(this.human) && this.human) {
      // handled in economy at match end via stats.rounds
    }

    // mark cut players eliminated
    for (const e of cut) { e.alive = false; if (!this._isEliminated(e)) this.eliminatedOrder.push(e); }
    // keep survivors alive & reset finished flags for next round
    for (const e of survivors) { e.alive = true; }

    this._roundSurvivors = survivors;
    this.roundsClearedThisMatch = (this.roundsClearedThisMatch || 0) + (survivors.includes(this.human) ? 1 : 0);

    this.state = 'roundEnd';
    this._roundEndTimer = 2.2;
    // human feedback
    if (this.human) {
      if (survivors.includes(this.human)) UI.toast('QUALIFIED! ✅', '#34d399');
      else if (this.human.alive === false) { /* already out */ }
    }
    audio.beep();
  }

  _advanceOrFinish() {
    const survivors = this._roundSurvivors || [];
    const isFinal = this.roundIndex >= CFG.ROUNDS.length - 1;
    // Win conditions: final round OR only <=1 player left overall
    if (isFinal || survivors.length <= 1) {
      this._finishMatch(survivors);
      return;
    }
    // carry survivors
    this.entities = survivors;
    this.roundIndex++;
    this._finishCounter = 0;
    this._buildRound();
  }

  // ---------------- MATCH END / PODIUM ----------------
  _finishMatch(finalSurvivors) {
    this.state = 'podium';
    this.input.enabled = false;
    document.getElementById('hud').classList.add('hidden');
    document.getElementById('touch-controls').classList.add('hidden');
    UI.hideCountdown();

    const cfg = CFG.ROUNDS[this.roundIndex];
    // Final placement order:
    let placement;
    if (cfg.type === 'king') {
      placement = [...this.entities].sort((a, b) => (b.alive?1:0)-(a.alive?1:0) || b.controlTime - a.controlTime);
    } else {
      const fin = this.entities.filter(e=>e.finished).sort((a,b)=>a.finishOrder-b.finishOrder);
      const al = this.entities.filter(e=>e.alive && !e.finished).sort((a,b)=>b.z-a.z);
      placement = [...fin, ...al];
    }
    // append everyone eliminated (best-last)
    const elimReversed = this.eliminatedOrder.slice().reverse();
    for (const e of elimReversed) if (!placement.includes(e)) placement.push(e);
    // ensure all 32 present
    for (const e of this._allSeen()) if (!placement.includes(e)) placement.push(e);

    const humanPlace = placement.indexOf(this.human) + 1;
    const won = placement[0] === this.human;
    const top3 = humanPlace <= 3 && humanPlace > 0;

    // economy (Section 5)
    let coins = CFG.COIN_PARTICIPATE + (this.roundsClearedThisMatch || 0) * CFG.COIN_PER_ROUND;
    let xp = (this.roundsClearedThisMatch || 0) * CFG.XP_PER_ROUND;
    if (won) { coins += CFG.COIN_WIN; xp += CFG.XP_WIN; }
    else if (top3) coins += CFG.COIN_TOP3;

    this.save.stats.matches++;
    this.save.stats.rounds += (this.roundsClearedThisMatch || 0);
    if (won) { this.save.stats.wins++; this.save.stats.crowns++; }
    if (top3) this.save.stats.top3++;

    const leveled = grantAndSave(this.save, coins, xp);

    // top-3 winners perform victory dance in scene
    placement.slice(0, 3).forEach((e, i) => { if (e) { e.finished = true; e.won = true; } });
    // camera focus winner
    this._podiumFocus = placement[0];

    audio.stopMusic();
    if (won) audio.fanfare(); else audio.beep();

    UI.showPodium(placement.slice(0, 3), { coins, xp, won, place: humanPlace, leveled }, this.save, this._handlers);
  }

  _allSeen() {
    // union of entities ever created this match
    const set = new Set(this.entities);
    for (const e of this.eliminatedOrder) set.add(e);
    for (const e of this.matchResults) set.add(e);
    return [...set];
  }

  setHandlers(h) { this._handlers = h; }

  toMenu() {
    this.state = 'preview';
    document.getElementById('hud').classList.add('hidden');
    document.getElementById('touch-controls').classList.add('hidden');
    this.input.enabled = false;
    this._buildPreview();
  }

  // ---------------- HUD ----------------
  _updateHudAlive() {
    const n = this.entities.filter(e => e.alive || e.finished).length;
    this._hud.alive.textContent = n;
  }

  _updateHudTimer() {
    const t = Math.max(0, Math.ceil(this.roundTimer));
    const m = (t / 60) | 0, s = t % 60;
    this._hud.timer.textContent = `${m}:${s.toString().padStart(2, '0')}`;
    this._hud.timer.classList.toggle('warn', t <= 10 && this.state === 'playing');
  }

  // ---------------- MAIN LOOP ----------------
  _loop() {
    requestAnimationFrame(() => this._loop());
    const now = performance.now();
    let frameDt = (now - this.lastTime) / 1000;
    this.lastTime = now;
    if (frameDt > 0.1) frameDt = 0.1; // clamp big stalls

    this._updateState(frameDt);

    // fixed-step sim
    if (this.state === 'playing') {
      this.accumulator += frameDt;
      let steps = 0;
      while (this.accumulator >= DT && steps < 5) {
        this._simTick();
        this.accumulator -= DT;
        steps++;
        if (this.state !== 'playing') break;
      }
    }

    // render poses (variable step)
    for (const e of this.entities) e.updatePose(frameDt);
    this._renderAvatars();
    this.charPool.updatePoof(frameDt);
    this._updateCamera(frameDt);
    this._updateSun(this._followTarget || this.human);

    this.renderer.render(this.scene, this.camera);
  }

  _updateState(dt) {
    if (this.state === 'preview') {
      // gentle idle jiggle already via pose; slowly orbit camera
      this.previewAngle += dt * 0.25;
    } else if (this.state === 'countdown') {
      this.countdown -= dt;
      const c = Math.ceil(this.countdown);
      if (c < this._nextBeep && c >= 0) { this._nextBeep = c; if (c > 0) audio.beep(); }
      UI.showCountdown(c > 0 ? c : 0, 'GO!');
      // keep the round timer pill populated during the countdown (Bug fix #1)
      this._updateHudTimer();
      if (this.countdown <= 0) {
        UI.hideCountdown();
        audio.go();
        this.state = 'playing';
      }
    } else if (this.state === 'playing') {
      this._updateHudTimer();
    } else if (this.state === 'roundEnd') {
      this._roundEndTimer -= dt;
      if (this._roundEndTimer <= 0) this._advanceOrFinish();
    }
  }

  _renderAvatars() {
    let idx = 0;
    for (const e of this.entities) {
      if (!e.alive && !e.finished) { continue; } // hidden (poofed)
      this.charPool.writeAvatar(idx, {
        x: e.x, y: e.y, z: e.z, yaw: e.yaw, pose: e.pose,
        skinId: e.skinId, hatId: e.hatId, groundY: e.groundY,
      });
      e._renderIdx = idx;
      idx++;
    }
    // hide the rest
    for (let i = idx; i < this.charPool.capacity; i++) this.charPool.hide(i);
    this.charPool.flush(this.charPool.capacity);
  }

  _updateCamera(dt) {
    let target = null;
    if (this.state === 'preview') {
      target = this.human;
      this._followTarget = target;
      const yaw = this.previewAngle;
      const tx = Math.sin(yaw) * 7, tz = Math.cos(yaw) * 7;
      this._camPos.lerp(new THREE.Vector3(tx, 4.5, tz), 0.05);
      this.camera.position.copy(this._camPos);
      this.camera.lookAt(0, 2.2, 0);
      return;
    }

    if (this.state === 'podium') {
      target = this._podiumFocus;
      this._followTarget = target;
      if (target) {
        const p = new THREE.Vector3(target.x + Math.sin(performance.now()/1500)*6, target.y + 4, target.z + 6);
        this._camPos.lerp(p, 0.05);
        this.camera.position.copy(this._camPos);
        this.camera.lookAt(target.x, target.y + 1.5, target.z);
      }
      return;
    }

    // follow human, or spectate a living player if eliminated
    if (this.human && (this.human.alive || this.human.finished)) target = this.human;
    else {
      const specs = this._aliveOrFinished();
      target = specs[this.spectateIndex % Math.max(1, specs.length)] || this.human;
    }
    this._followTarget = target;
    if (!target) return;

    const yaw = this.input.cameraYaw;
    const pitch = this.input.cameraPitch;
    const dist = CFG.CAMERA_DIST;
    const ox = Math.sin(yaw) * Math.cos(pitch) * dist;
    const oz = Math.cos(yaw) * Math.cos(pitch) * dist;
    const oy = Math.sin(pitch) * dist + 1.5;

    let desired = new THREE.Vector3(target.x - ox, target.y + oy, target.z - oz);

    // camera shake
    if (this.camShake > 0) {
      this.camShake -= dt * 2;
      const s = this.camShake * 0.4;
      desired.x += (Math.random()-0.5) * s;
      desired.y += (Math.random()-0.5) * s;
    }

    this._camPos.lerp(desired, CFG.CAMERA_LERP);
    this.camera.position.copy(this._camPos);
    this.camera.lookAt(target.x, target.y + 1.4, target.z);
  }
}

// helpers ----------------------------------------------------
import { getSkin, grantRewards, writeSave } from './cosmetics.js';
function getSkinColor(e) { return getSkin(e.skinId).body; }
function grantAndSave(save, coins, xp) { return grantRewards(save, { coins, xp }); }

// ------------------------------------------------------------
// Quality auto-scaling (Section 7: must not lag on weak devices).
// We probe the device's memory / core count / GPU renderer string and
// pick a tier. Everything visual (shadows, shadow-map size, AA, pixel
// ratio) scales down together so a 3-year-old phone or an Intel-UHD
// Chromebook still holds framerate, while a desktop gets the full
// cinematic shadow pass.
// ------------------------------------------------------------
function detectQuality() {
  const mem = navigator.deviceMemory || 4;         // GB (heuristic)
  const cores = navigator.hardwareConcurrency || 4;
  const coarse = matchMedia('(pointer: coarse)').matches;
  const dpr = window.devicePixelRatio || 1;

  // Sniff the GPU renderer to catch software / very weak GPUs.
  let weakGpu = false;
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    if (!gl) weakGpu = true;
    else {
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      const r = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)).toLowerCase() : '';
      if (/swiftshader|software|llvmpipe|mesa offscreen/.test(r)) weakGpu = true;
    }
  } catch { /* ignore */ }

  // Score the device.
  const low = weakGpu || mem <= 3 || cores <= 3 || (coarse && dpr < 2 && mem <= 4);
  const high = !low && mem >= 8 && cores >= 8 && !coarse;

  if (low) {
    return { tier: 'low', shadows: false, shadowMap: 0, antialias: false, pixelRatio: 1, charShadows: false };
  }
  if (high) {
    return { tier: 'high', shadows: true, shadowMap: 2048, antialias: dpr < 2, pixelRatio: 2, charShadows: true };
  }
  return { tier: 'mid', shadows: true, shadowMap: 1024, antialias: false, pixelRatio: Math.min(dpr, 1.5), charShadows: true };
}
