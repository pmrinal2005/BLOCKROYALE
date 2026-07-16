// End-to-end verification for the 3 tasks + crash fix.
// Runs against the local preview server (http://localhost:3000).
import { chromium } from 'playwright';

const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1100, height: 680 } });
const errs = [];
p.on('pageerror', e => errs.push('PAGEERR: ' + e.message));
p.on('console', m => { if (m.type() === 'error' && !m.text().includes('403') && !m.text().toLowerCase().includes('font')) errs.push('CONSOLE-ERR: ' + m.text()); });

await p.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
await p.waitForSelector('.menu-logo', { timeout: 15000 });
await p.waitForTimeout(1000);
await p.screenshot({ path: '/tmp/v_menu.png' });
console.log('MENU rendered, sky dome present:', await p.evaluate(() => !!window.__game?.sky));

// Read the tuned config values (Task #3 speed).
const cfg = await p.evaluate(() => {
  const g = window.__game;
  return g ? null : null; // placeholder (config not exposed)
});

await p.click('#m-play');
// wait for playing
await p.waitForFunction(() => window.__game?.state === 'playing', { timeout: 15000 }).catch(() => {});
await p.waitForTimeout(300);
await p.screenshot({ path: '/tmp/v_play.png' });

// ---- Task #3: measure human PEAK speed while running forward ----
await p.keyboard.down('w');
let peak = 0;
for (let i = 0; i < 20; i++) {
  await p.waitForTimeout(150);
  const v = await p.evaluate(() => { const h = window.__game?.human; return h ? Math.hypot(h.vx, h.vz) : 0; });
  if (v > peak) peak = v;
}
await p.keyboard.up('w');
console.log('PEAK RUN SPEED (units/s):', +peak.toFixed(2), '(config MOVE_SPEED expected ~9.4)');

// ---- Task #2: double-jump dive. Press space to jump, then again mid-air. ----
// Detect the dive by watching diveTimer become > 0 after the 2nd press.
await p.keyboard.press(' ');           // ground jump -> airborne
await p.waitForTimeout(120);
const airborne = await p.evaluate(() => { const h = window.__game?.human; return h ? { grounded: h.grounded, y: +h.y.toFixed(2) } : null; });
await p.keyboard.press(' ');           // 2nd press mid-air => DIVE
await p.waitForTimeout(80);
const diveState = await p.evaluate(() => { const h = window.__game?.human; return h ? { diveTimer: +h.diveTimer.toFixed(3), vhoriz: +Math.hypot(h.vx, h.vz).toFixed(2) } : null; });
await p.keyboard.up('w');
console.log('AIRBORNE after 1st jump:', JSON.stringify(airborne));
console.log('DIVE after 2nd mid-air press:', JSON.stringify(diveState), '-> diveTimer>0 means DIVE FIRED');

// ---- Task #2 bots: confirm at least one bot dives over a few seconds ----
let botDived = false;
for (let i = 0; i < 30 && !botDived; i++) {
  await p.waitForTimeout(200);
  botDived = await p.evaluate(() => (window.__game?.entities || []).some(e => e.isBot && e.diveTimer > 0));
}
console.log('BOT performed a dive within window:', botDived);

// ---- Perf: draw calls + fps ----
const info = await p.evaluate(async () => {
  let frames = 0; const t0 = performance.now();
  await new Promise(res => { (function loop(){ frames++; if (performance.now()-t0 < 1000) requestAnimationFrame(loop); else res(); })(); });
  const fps = Math.round(frames * 1000 / (performance.now() - t0));
  const r = window.__game?.renderer;
  return { fps, calls: r?.info?.render?.calls ?? null, tris: r?.info?.render?.triangles ?? null };
});
console.log('PERF:', JSON.stringify(info));

console.log('ERRORS:', errs.length ? errs : 'none');
await b.close();
process.exit(errs.length ? 1 : 0);
