// ============================================================
// Audio (Section 6). To keep the bundle tiny (spec: <5MB total,
// SFX <50KB each) we SYNTHESIZE every cartoon sound with the Web
// Audio API — zero audio files to download. Bouncy marimba-ish
// background loop is also generated procedurally.
// ============================================================

export class AudioBus {
  constructor() {
    this.ctx = null;
    this.sfxOn = true;
    this.musicOn = true;
    this.musicNode = null;
    this.musicGain = null;
    this._musicTimer = null;
  }

  _ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  // Called on first user gesture.
  unlock() { this._ensure(); }

  _tone(freq, dur, type = 'sine', vol = 0.2, slideTo = null, delay = 0) {
    if (!this.sfxOn) return;
    const ctx = this._ensure();
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo != null) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g); g.connect(ctx.destination);
    osc.start(t0); osc.stop(t0 + dur + 0.02);
  }

  jump()   { this._tone(320, 0.18, 'sine', 0.18, 620); }             // boing up
  dive()   { this._tone(500, 0.16, 'triangle', 0.16, 260); }         // whoosh
  stumble(){ this._tone(700, 0.4, 'sawtooth', 0.14, 160);            // slide whistle down
             this._tone(200, 0.2, 'square', 0.08, 90, 0.05); }
  poof()   { this._tone(180, 0.25, 'square', 0.16, 60);              // cartoon poof
             this._tone(90, 0.3, 'sine', 0.12, 40, 0.02); }
  coin()   { this._tone(880, 0.08, 'square', 0.15); this._tone(1320, 0.12, 'square', 0.14, null, 0.07); }
  beep()   { this._tone(560, 0.12, 'square', 0.18); }                // countdown
  go()     { this._tone(720, 0.35, 'sawtooth', 0.22, 1100); }
  click()  { this._tone(440, 0.06, 'square', 0.12); }
  fanfare(){ [523,659,784,1046].forEach((f,i)=>this._tone(f,0.35,'triangle',0.2,null,i*0.12)); }
  aww()    { this._tone(400, 0.5, 'sine', 0.14, 250); }
  whoosh() { this._tone(760, 0.12, 'sine', 0.10, 300); }             // melee swing air whoosh (Task #3)
  punch()  { this._tone(150, 0.14, 'square', 0.22, 55);              // cartoon THWACK on connect
             this._tone(90, 0.18, 'sine', 0.16, 40, 0.02); }
  splash() { this._tone(520, 0.18, 'sine', 0.16, 180);               // water entry splash (Task #2)
             this._tone(300, 0.22, 'triangle', 0.12, 90, 0.03); }
  drip()   { this._tone(900, 0.12, 'sine', 0.10, 420); }             // climbing out of water (Task #2)

  startMusic() {
    if (!this.musicOn) return;
    const ctx = this._ensure();
    this.stopMusic();
    this.musicGain = ctx.createGain();
    this.musicGain.gain.value = 0.06;
    this.musicGain.connect(ctx.destination);

    // Bouncy marimba arpeggio loop (pentatonic, upbeat).
    const scale = [392, 440, 523, 587, 659, 784]; // G A C D E G
    const step = 0.16; // ~ up-tempo
    let i = 0;
    const play = () => {
      if (!this.musicOn) return;
      const t = ctx.currentTime;
      const note = scale[(Math.random() * scale.length) | 0] * (Math.random() < 0.3 ? 2 : 1);
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = note;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.5, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + step * 1.4);
      osc.connect(g); g.connect(this.musicGain);
      osc.start(t); osc.stop(t + step * 1.5);
      // occasional bass note
      if (i % 4 === 0) {
        const b = ctx.createOscillator(); const bg = ctx.createGain();
        b.type = 'sine'; b.frequency.value = 130;
        bg.gain.setValueAtTime(0.0001, t); bg.gain.exponentialRampToValueAtTime(0.6, t+0.02);
        bg.gain.exponentialRampToValueAtTime(0.0001, t + step*3);
        b.connect(bg); bg.connect(this.musicGain); b.start(t); b.stop(t+step*3.2);
      }
      i++;
    };
    this._musicTimer = setInterval(play, step * 1000);
  }

  stopMusic() {
    if (this._musicTimer) { clearInterval(this._musicTimer); this._musicTimer = null; }
    if (this.musicGain) { try { this.musicGain.disconnect(); } catch {} this.musicGain = null; }
  }

  setSfx(on) { this.sfxOn = on; }
  setMusic(on) { this.musicOn = on; if (on) this.startMusic(); else this.stopMusic(); }
}

export const audio = new AudioBus();
