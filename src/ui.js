import { SKINS, HATS, TRAILS, getSkin, xpForLevel } from './cosmetics.js';
import { audio } from './audio.js';

// ============================================================
// DOM UI layer (Section 4 flow + Section 6 tone).
// Pure DOM overlays; the 3D canvas keeps running behind them.
// All copy is playful/positive per the tone spec.
// ============================================================

const root = () => document.getElementById('ui-root');
const uiRootEl = document.getElementById('ui-root');

export function clearUI() { root().innerHTML = ''; }

function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

function coinChip(coins) {
  return `<div class="coin-chip"><span class="coin"></span>${coins}</div>`;
}

// ---------- MAIN MENU ----------
export function showMenu(save, handlers) {
  clearUI();
  const screen = el(`
    <div class="screen">
      <div class="top-bar">
        ${coinChip(save.coins)}
        <button class="icon-btn" id="m-shop" title="Shop">🎽</button>
        <button class="icon-btn" id="m-stats" title="Stats">🏆</button>
        <button class="icon-btn" id="m-settings" title="Settings">⚙️</button>
      </div>
      <div class="menu-logo">BLOCK<span>ROYALE</span><em>· IO ·</em></div>
      <div class="menu-tag">Race • Tumble • Win the Crown 👑</div>
      <div class="menu-stack">
        <input id="m-name" class="name-input" maxlength="12" placeholder="Your name" value="${save.name || ''}" />
        <button class="br-btn big pink" id="m-play">PLAY NOW ▶</button>
        <div class="menu-row">
          <button class="br-btn ghost" id="m-shop2">🎽 Locker</button>
          <button class="br-btn ghost" id="m-how">❓ How to Play</button>
        </div>
      </div>
      <div style="position:fixed;bottom:10px;color:#fff;opacity:.8;font-size:12px;font-weight:600">Lv ${save.level} · ${save.stats.crowns} 👑 · ${save.stats.wins} wins</div>
    </div>
  `);
  root().appendChild(screen);

  const nameEl = screen.querySelector('#m-name');
  nameEl.addEventListener('change', () => { save.name = nameEl.value.trim().slice(0, 12); handlers.onName(save.name); });

  screen.querySelector('#m-play').onclick = () => { audio.click(); save.name = nameEl.value.trim().slice(0,12) || 'You'; handlers.onName(save.name); handlers.onPlay(); };
  screen.querySelector('#m-shop').onclick = () => { audio.click(); showShop(save, handlers); };
  screen.querySelector('#m-shop2').onclick = () => { audio.click(); showShop(save, handlers); };
  screen.querySelector('#m-stats').onclick = () => { audio.click(); showStats(save); };
  screen.querySelector('#m-settings').onclick = () => { audio.click(); showSettings(save, handlers); };
  screen.querySelector('#m-how').onclick = () => { audio.click(); showHow(); };
}

// ---------- SHOP / LOCKER ----------
export function showShop(save, handlers) {
  const wrap = el(`
    <div class="panel-wrap">
      <div class="panel">
        <div class="panel-head"><h2>🎽 Locker</h2><button class="icon-btn" id="s-close">✕</button></div>
        <div class="panel-body">
          <div style="display:flex;justify-content:flex-end;margin-bottom:10px">${coinChip(save.coins)}</div>
          <div class="tabs">
            <button class="tab active" data-t="skins">Skins</button>
            <button class="tab" data-t="hats">Hats</button>
            <button class="tab" data-t="trails">Trails</button>
          </div>
          <div class="grid" id="s-grid"></div>
        </div>
      </div>
    </div>
  `);
  root().appendChild(wrap);

  const grid = wrap.querySelector('#s-grid');
  let tab = 'skins';

  function catalog() {
    if (tab === 'skins') return SKINS.map(s => ({ ...s, kind: 'skin', swatch: swatchSkin(s) }));
    if (tab === 'hats') return HATS.map(h => ({ ...h, kind: 'hat', swatch: swatchColor(h.color) }));
    return TRAILS.map(t => ({ ...t, kind: 'trail', swatch: swatchColor(t.color) }));
  }
  function ownedList() { return save.owned[tab]; }
  function equippedId() { return tab === 'skins' ? save.equipped.skin : tab === 'hats' ? save.equipped.hat : save.equipped.trail; }

  function render() {
    grid.innerHTML = '';
    for (const item of catalog()) {
      const owned = ownedList().includes(item.id);
      const equipped = equippedId() === item.id;
      const card = el(`
        <div class="item-card ${equipped ? 'equipped' : ''} ${owned ? '' : 'locked'}">
          <div class="item-swatch" style="${item.swatch}"></div>
          <div class="item-name">${item.name}</div>
          ${equipped ? '<div class="item-tag tag-equipped">ON</div>'
            : owned ? '<div class="item-tag tag-owned">✓</div>'
            : `<div class="item-price"><span class="coin" style="width:14px;height:14px"></span>${item.price}</div>`}
        </div>
      `);
      card.onclick = () => {
        audio.click();
        if (owned) {
          if (tab === 'skins') save.equipped.skin = item.id;
          else if (tab === 'hats') save.equipped.hat = item.id;
          else save.equipped.trail = item.id;
          handlers.onEquip();
          render();
        } else if (save.coins >= item.price) {
          save.coins -= item.price;
          ownedList().push(item.id);
          audio.coin();
          if (tab === 'skins') save.equipped.skin = item.id;
          else if (tab === 'hats') save.equipped.hat = item.id;
          else save.equipped.trail = item.id;
          handlers.onEquip();
          handlers.onSave();
          render();
          // refresh coin chips
          wrap.querySelector('.panel-body .coin-chip').innerHTML = `<span class="coin"></span>${save.coins}`;
        } else {
          flash(card);
        }
      };
      grid.appendChild(card);
    }
  }

  wrap.querySelectorAll('.tab').forEach(b => b.onclick = () => {
    wrap.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
    b.classList.add('active'); tab = b.dataset.t; render();
  });
  wrap.querySelector('#s-close').onclick = () => { audio.click(); handlers.onSave(); wrap.remove(); };
  render();
}

function swatchSkin(s) {
  return `background:linear-gradient(135deg, #${s.body.toString(16).padStart(6,'0')} 0%, #${s.body.toString(16).padStart(6,'0')} 55%, #${s.head.toString(16).padStart(6,'0')} 55%);`;
}
function swatchColor(c) {
  if (c == null) return 'background:repeating-linear-gradient(45deg,#e5e9f5,#e5e9f5 8px,#d3d9ec 8px,#d3d9ec 16px);display:grid;place-items:center;';
  return `background:radial-gradient(circle at 40% 35%, #fff6, transparent), #${c.toString(16).padStart(6,'0')};`;
}
function flash(node) { node.style.animation = 'none'; node.offsetHeight; node.style.animation = 'toastPop .3s'; }

// ---------- STATS ----------
export function showStats(save) {
  const s = save.stats;
  const wrap = el(`
    <div class="panel-wrap">
      <div class="panel">
        <div class="panel-head"><h2>🏆 Career</h2><button class="icon-btn" id="st-close">✕</button></div>
        <div class="panel-body">
          <div style="text-align:center;margin-bottom:14px">
            <div style="font-size:38px;font-weight:800">Level ${save.level}</div>
            <div style="background:#e8eefc;border-radius:20px;height:14px;overflow:hidden;margin:8px auto;max-width:320px">
              <div style="height:100%;width:${Math.min(100,(save.xp/xpForLevel(save.level))*100)}%;background:linear-gradient(90deg,#a855f7,#22d3ee)"></div>
            </div>
            <div style="font-size:13px;color:#3b4472">${save.xp} / ${xpForLevel(save.level)} XP</div>
          </div>
          <div class="stat-row"><span>👑 Crowns</span><b>${s.crowns}</b></div>
          <div class="stat-row"><span>🥇 Wins</span><b>${s.wins}</b></div>
          <div class="stat-row"><span>🏅 Top 3 Finishes</span><b>${s.top3}</b></div>
          <div class="stat-row"><span>🎮 Matches Played</span><b>${s.matches}</b></div>
          <div class="stat-row"><span>➡️ Rounds Cleared</span><b>${s.rounds}</b></div>
        </div>
      </div>
    </div>
  `);
  root().appendChild(wrap);
  wrap.querySelector('#st-close').onclick = () => { audio.click(); wrap.remove(); };
}

// ---------- SETTINGS ----------
export function showSettings(save, handlers) {
  const wrap = el(`
    <div class="panel-wrap">
      <div class="panel" style="max-width:440px">
        <div class="panel-head"><h2>⚙️ Settings</h2><button class="icon-btn" id="se-close">✕</button></div>
        <div class="panel-body">
          <div class="settings-row"><span>🔊 Sound Effects</span><div class="switch ${save.settings.sfx?'on':''}" id="sw-sfx"></div></div>
          <div class="settings-row"><span>🎵 Music</span><div class="switch ${save.settings.music?'on':''}" id="sw-music"></div></div>
          <div style="margin-top:16px;text-align:center;color:#3b4472;font-size:13px">
            BlockRoyale.io — a lightweight voxel party royale.<br/>Cosmetics only. No pay-to-win, ever. 💛
          </div>
        </div>
      </div>
    </div>
  `);
  root().appendChild(wrap);
  const sfx = wrap.querySelector('#sw-sfx'), music = wrap.querySelector('#sw-music');
  sfx.onclick = () => { save.settings.sfx = !save.settings.sfx; sfx.classList.toggle('on'); audio.setSfx(save.settings.sfx); audio.click(); handlers.onSave(); };
  music.onclick = () => { save.settings.music = !save.settings.music; music.classList.toggle('on'); audio.setMusic(save.settings.music); handlers.onSave(); };
  wrap.querySelector('#se-close').onclick = () => { audio.click(); wrap.remove(); };
}

// ---------- HOW TO PLAY ----------
export function showHow() {
  const wrap = el(`
    <div class="panel-wrap">
      <div class="panel" style="max-width:460px">
        <div class="panel-head"><h2>❓ How to Play</h2><button class="icon-btn" id="h-close">✕</button></div>
        <div class="panel-body" style="font-weight:600;line-height:1.7">
          <p>🎯 <b>Goal:</b> Survive 4 wild rounds and grab the Crown 👑</p>
          <p>⌨️ <b>PC:</b> WASD / Arrows to move · Drag mouse to look · <b>Space</b> to jump · tap <b>Space AGAIN in mid-air to Double-Jump Dive</b> (forward plunge)! · <b>Shift</b> also dives.</p>
          <p>📱 <b>Mobile:</b> Left joystick to move · tap <b>JUMP</b> (again mid-air = Dive) / <b>DIVE</b> · drag right side to look.</p>
          <p>💥 Bump rivals, dodge hammers, and don't fall off!</p>
          <p>😆 Falling is fun — it's just the punchline. You'll respawn to spectate and jump right back next match.</p>
          <p>🪙 Earn Blocks Coins to unlock skins, hats & trails in the Locker.</p>
        </div>
      </div>
    </div>
  `);
  root().appendChild(wrap);
  wrap.querySelector('#h-close').onclick = () => { audio.click(); wrap.remove(); };
}

// ---------- COUNTDOWN ----------
// Bug #4 FIX: `showCountdown` is called every render frame, but we must only
// rebuild the DOM (which restarts the CSS pop animation) when the DISPLAYED
// value actually changes. Rewriting innerHTML every frame restarted the 0.9s
// `countPop` animation each frame, pinning it at its opacity:0 first keyframe
// so the big number was effectively invisible the whole countdown.
let _cdLast = null;
export function showCountdown(n, label) {
  const text = n > 0 ? String(n) : (label || 'GO!');
  let cd = document.getElementById('countdown');
  if (!cd) { cd = el('<div id="countdown"></div>'); root().appendChild(cd); _cdLast = null; }
  if (text === _cdLast) return;          // unchanged -> don't restart animation
  _cdLast = text;
  const cls = n > 0 ? 'count-num' : 'count-num count-go';
  cd.innerHTML = `<div class="${cls}">${text}</div>`;
}
export function hideCountdown() {
  const cd = document.getElementById('countdown');
  if (cd) cd.remove();
  _cdLast = null;
}

// ---------- PODIUM ----------
export function showPodium(results, rewards, save, handlers) {
  clearUI();
  const [p1, p2, p3] = results;
  const leveled = rewards.leveled > 0 ? `<div class="reward-chip">⬆️ Level Up! Lv ${save.level}</div>` : '';
  const screen = el(`
    <div class="screen" style="background:linear-gradient(180deg, rgba(26,33,64,.35), rgba(26,33,64,.65))">
      <div class="menu-logo" style="font-size:clamp(28px,7vw,52px)">${rewards.won ? '👑 VICTORY! 👑' : 'GAME OVER'}</div>
      <div class="menu-tag">${rewards.won ? 'You are the BlockRoyale Champion!' : `You placed #${rewards.place}`}</div>
      <div class="podium-wrap">
        <div class="podium-col"><div class="podium-name">${esc(p2?.name||'—')}</div><div class="podium-block podium-2">2</div></div>
        <div class="podium-col"><div class="podium-name">${esc(p1?.name||'—')}</div><div class="podium-block podium-1">1</div></div>
        <div class="podium-col"><div class="podium-name">${esc(p3?.name||'—')}</div><div class="podium-block podium-3">3</div></div>
      </div>
      <div class="reward-row">
        <div class="reward-chip">🪙 +${rewards.coins}</div>
        <div class="reward-chip">✨ +${rewards.xp} XP</div>
        ${leveled}
      </div>
      <div class="menu-row">
        <button class="br-btn big pink" id="p-again">PLAY AGAIN ▶</button>
        <button class="br-btn ghost" id="p-menu">Menu</button>
      </div>
    </div>
  `);
  root().appendChild(screen);
  screen.querySelector('#p-again').onclick = () => { audio.click(); handlers.onPlay(); };
  screen.querySelector('#p-menu').onclick = () => { audio.click(); handlers.onMenu(); };
}

// ---------- Spectator / eliminated banner ----------
export function showEliminated(place, aliveLeft) {
  const b = el(`<div id="hud-place">💀 Out! Spectating… (${aliveLeft} left)</div>`);
  return b;
}

// ---------- HUD helpers ----------
export function toast(text, color) {
  const wrap = document.getElementById('hud-toast-wrap');
  if (!wrap) return;
  const t = el(`<div class="toast" style="${color?`color:${color}`:''}">${text}</div>`);
  wrap.appendChild(t);
  setTimeout(() => t.classList.add('fade'), 900);
  setTimeout(() => t.remove(), 1500);
}

function esc(s) { return String(s).replace(/[<>&]/g, c => ({ '<':'&lt;','>':'&gt;','&':'&amp;' }[c])); }
