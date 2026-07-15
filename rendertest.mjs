import { chromium } from 'playwright';
const b = await chromium.launch({ args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport:{width:1024,height:640} });
const errs = [];
p.on('pageerror', e => errs.push('PAGEERR: '+e.message));
p.on('console', m => { if(m.type()==='error' && !m.text().includes('403') && !m.text().toLowerCase().includes('font')) errs.push('CONSOLE-ERR: '+m.text()); });
await p.goto('http://localhost:3000', { waitUntil:'domcontentloaded' });
await p.waitForSelector('.menu-logo', { timeout:15000 });
await p.waitForTimeout(1200);
await p.screenshot({ path:'/tmp/01menu.png' });
console.log('MENU rendered');
await p.click('#m-play');
await p.waitForTimeout(2500);
await p.screenshot({ path:'/tmp/02countdown.png' });
await p.waitForTimeout(4500);
await p.keyboard.down('w'); await p.waitForTimeout(1400); await p.keyboard.press(' '); await p.waitForTimeout(900); await p.keyboard.up('w');
await p.screenshot({ path:'/tmp/03play.png' });
console.log('GAMEPLAY rendered');

// Measure renderer stats (draw calls, triangles) + a short FPS sample.
const info = await p.evaluate(async () => {
  const c = document.querySelector('#game-root canvas');
  // FPS sample over ~1s
  let frames = 0; const t0 = performance.now();
  await new Promise(res => {
    function loop(){ frames++; if (performance.now()-t0 < 1000) requestAnimationFrame(loop); else res(); }
    requestAnimationFrame(loop);
  });
  const fps = Math.round(frames * 1000 / (performance.now()-t0));
  // Pull renderer.info via a global if the game exposed it, else null.
  let calls=null, tris=null;
  if (window.__game && window.__game.renderer) {
    calls = window.__game.renderer.info.render.calls;
    tris = window.__game.renderer.info.render.triangles;
  }
  return { hasCanvas: !!c, w: c?.width, h: c?.height, fps, calls, tris };
});
console.log('CANVAS:', JSON.stringify(info));

// let it run a full course-ish to catch late errors
await p.keyboard.down('w'); await p.waitForTimeout(3000); await p.keyboard.up('w');
await p.screenshot({ path:'/tmp/04run.png' });
console.log('ERRORS:', errs.length ? errs.join(' | ') : 'NONE');
await b.close();
