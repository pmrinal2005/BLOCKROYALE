import { chromium } from 'playwright';
const b = await chromium.launch({ args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
p.on('pageerror', e => errs.push('PAGEERR: ' + e.message));
await p.goto('http://localhost:3000', { waitUntil:'domcontentloaded' });
await p.waitForSelector('.menu-logo', { timeout: 20000 });
await p.waitForTimeout(800);
await p.click('#m-play');
await p.waitForFunction(() => window.__game?.state === 'playing', { timeout: 20000 }).catch(()=>{});
await p.waitForTimeout(500);

// Press first jump
await p.keyboard.press('Space');
// sample grounded/vy immediately for a few frames, pressing space again once airborne
let log = [];
let didSecond = false;
for (let i=0;i<25;i++){
  await p.waitForTimeout(40);
  const d = await p.evaluate(()=>{const h=window.__game?.human; return h?{g:h.grounded, vy:+h.vy.toFixed(2), y:+h.y.toFixed(2), flipT:+h.flipT.toFixed(3), dt:+h.diveTimer.toFixed(2), dc:+h.diveCd.toFixed(2), st:h.animState}:null;});
  if(d){
    log.push(`${i} g=${d.g?1:0} vy=${d.vy} y=${d.y} flipT=${d.flipT} dt=${d.dt} state=${d.st}`);
    if(!d.g && !didSecond){ await p.keyboard.press('Space'); didSecond=true; log.push('  >> pressed 2nd space'); }
  }
}
console.log(log.join('\n'));
console.log('ERRORS:', errs.length ? errs : 'none');
await b.close();
