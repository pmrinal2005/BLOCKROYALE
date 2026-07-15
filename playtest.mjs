// Comprehensive headless playtest: drive the human forward through a full
// race and track Y/Z every frame to detect fall-through / void-falls, plus
// capture countdown + gameplay screenshots. (Referenced in past transcript.)
import { chromium } from 'playwright';

const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1024, height: 640 } });
const errs = [];
p.on('pageerror', e => errs.push('PAGEERR: ' + e.message));
p.on('console', m => { if (m.type() === 'error' && !m.text().includes('403') && !m.text().toLowerCase().includes('font')) errs.push('CONSOLE-ERR: ' + m.text()); });

await p.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
await p.waitForSelector('.menu-logo', { timeout: 15000 });
await p.click('#m-play');
await p.waitForTimeout(500);

// grab countdown screenshot
await p.screenshot({ path: '/tmp/pt_countdown.png' });

// wait for the round to start playing
await p.waitForFunction(() => window.__game?.state === 'playing', { timeout: 12000 }).catch(() => {});

// Drive forward (W) and sample the human's y/z over ~18s of running.
await p.keyboard.down('w');
const samples = [];
let minY = Infinity, fellCount = 0, prevZ = 0, stuck = 0;
for (let i = 0; i < 60; i++) {
  await p.waitForTimeout(300);
  const s = await p.evaluate(() => {
    const g = window.__game; const h = g?.human;
    return h ? { x: +h.x.toFixed(2), y: +h.y.toFixed(2), z: +h.z.toFixed(2), grounded: h.grounded, alive: h.alive, respawns: h.respawns, state: g.state, finishZ: +(g.world?.finishZ||0).toFixed(1) } : null;
  });
  if (!s) break;
  samples.push(s);
  if (s.y < minY) minY = s.y;
  if (s.y < -10) fellCount++;
  // occasionally jump to clear gaps/obstacles
  if (i % 4 === 3) { await p.keyboard.press(' '); }
  if (Math.abs(s.z - prevZ) < 0.2) stuck++; else stuck = 0;
  prevZ = s.z;
  if (s.state !== 'playing' && s.state !== 'countdown') break;
}
await p.keyboard.up('w');
await p.screenshot({ path: '/tmp/pt_run.png' });

// Report
const last = samples[samples.length - 1] || {};
console.log('SAMPLES:', samples.length);
console.log('minY:', minY.toFixed(2), '| voidFalls(y<-10):', fellCount, '| respawns:', last.respawns);
console.log('progress z:', last.z, '/ finishZ:', last.finishZ, '| state:', last.state);
console.log('grounded ratio:', (samples.filter(s => s.grounded).length / Math.max(1, samples.length)).toFixed(2));
console.log('ERRORS:', errs.length ? errs.join(' | ') : 'NONE');

const info = await p.evaluate(() => {
  const r = window.__game?.renderer;
  return r ? { calls: r.info.render.calls, tris: r.info.render.triangles } : null;
});
console.log('RENDER:', JSON.stringify(info));

await b.close();
