import { loadSave, writeSave } from './cosmetics.js';
import { audio } from './audio.js';
import { InputManager } from './input.js';
import { Game } from './game.js';
import * as UI from './ui.js';

// ============================================================
// Entry point: boot sequence -> menu -> game.
// Kept minimal so first meaningful paint is fast (Section 7:
// <3s load). Three.js scene builds lazily behind the splash.
// ============================================================

const boot = document.getElementById('boot');
const fill = document.getElementById('boot-fill');
const tip = document.getElementById('boot-tip');
const TIPS = ['Building Craftland…', 'Warming up the hammers…', 'Polishing the Crown…', 'Filling the lobby…', 'Almost there!'];

let progress = 0;
function setProgress(p, msg) {
  progress = Math.max(progress, p);
  fill.style.width = progress + '%';
  if (msg) tip.textContent = msg;
}

async function boostrap() {
  setProgress(15, TIPS[0]);
  const save = loadSave();

  // apply saved audio prefs
  audio.setSfx(save.settings.sfx);
  audio.musicOn = save.settings.music;

  setProgress(40, TIPS[1]);
  const input = new InputManager();

  setProgress(60, TIPS[2]);
  // build the game (creates renderer + preview scene)
  let game;
  try {
    game = new Game('game-root', save, input);
  } catch (err) {
    console.error(err);
    tip.textContent = '⚠️ WebGL not available on this device.';
    return;
  }

  setProgress(85, TIPS[3]);

  const handlers = {
    onPlay: () => { audio.unlock(); if (save.settings.music) audio.setMusic(true); UI.clearUI(); game.startMatch(); },
    onMenu: () => { game.toMenu(); UI.showMenu(save, handlers); },
    onName: (n) => { save.name = n; writeSave(save); },
    onEquip: () => { game.refreshCosmetics(); },
    onSave: () => { writeSave(save); },
  };
  game.setHandlers(handlers);
  // expose for perf diagnostics / e2e tests (no effect on gameplay)
  window.__game = game;

  // DEV-ONLY autoplay hook for headless smoke tests: ?autoplay=1 starts a match
  // immediately (bypasses the menu click). Guarded by the query param so it has
  // zero effect on the real deployed game. Also surfaces uncaught errors to a
  // window flag the console capture can read.
  if (/[?&]autoplay=1/.test(location.search)) {
    window.__errors = [];
    addEventListener('error', (e) => { window.__errors.push(String(e.message || e.error)); console.error('WINDOW_ERROR', e.message, e.error && e.error.stack); });
    addEventListener('unhandledrejection', (e) => { window.__errors.push('promise:' + String(e.reason)); console.error('PROMISE_REJECTION', e.reason); });
    setTimeout(() => { try { handlers.onPlay(); console.log('AUTOPLAY: match started'); } catch (err) { console.error('AUTOPLAY start error', err); } }, 800);
    // Force fast round completion by directly ending the round once it is
    // playing — this exercises the _endRound -> _advanceOrFinish -> _buildRound
    // (and eventually _finishMatch/podium) transitions, the real crash suspects.
    setInterval(() => {
      const g = game;
      if (g.state === 'playing') {
        try { g._endRound('time'); } catch (err) { window.__errors.push('endRound:' + err.message); console.error('ENDROUND_ERR', err && err.stack); }
      }
    }, 2500);
    let lastState = '';
    setInterval(() => {
      const s = `${game.state}/${game.roundIndex}`;
      console.log('STATE', game.state, 'round', game.roundIndex, 'alive', game.entities.filter(e=>e.alive||e.finished).length, 'errs', window.__errors.length);
      lastState = s;
    }, 1500);
  }

  setProgress(100, TIPS[4]);

  // unlock audio on first interaction
  const unlock = () => { audio.unlock(); removeEventListener('pointerdown', unlock); removeEventListener('keydown', unlock); };
  addEventListener('pointerdown', unlock);
  addEventListener('keydown', unlock);

  // reveal menu after a short beat so the splash animation reads
  setTimeout(() => {
    boot.style.transition = 'opacity .4s ease';
    boot.style.opacity = '0';
    setTimeout(() => boot.remove(), 420);
    UI.showMenu(save, handlers);
  }, 350);
}

boostrap();
