import { chromium } from 'playwright';
const b = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
p.on('pageerror', e => errs.push('PAGEERR: ' + e.message));
p.on('console', m => { if (m.type()==='error' && !/403|font/i.test(m.text())) errs.push('CONSOLE-ERR: '+m.text()); });
await p.goto('http://localhost:3000', { waitUntil:'domcontentloaded' });
await p.waitForSelector('.menu-logo', { timeout: 20000 });
await p.waitForTimeout(800);
await p.click('#m-play');
await p.waitForFunction(() => window.__game?.state === 'playing', { timeout: 20000 }).catch(()=>{});
await p.waitForTimeout(500);

// Test double-jump flip: jump then jump again mid-air
await p.keyboard.press('Space');
await p.waitForTimeout(120);
await p.keyboard.press('Space');
// sample flipT over next second
let maxFlip = 0, sawDive=false;
for (let i=0;i<15;i++){
  await p.waitForTimeout(60);
  const d = await p.evaluate(()=>{const h=window.__game?.human; return h?{flipT:h.flipT, diveTimer:h.diveTimer, state:h.animState}:null;});
  if(d){ if(d.flipT>maxFlip)maxFlip=d.flipT; if(d.state==='dive')sawDive=true; }
}
console.log('HUMAN maxFlipT:', +maxFlip.toFixed(3), 'sawDiveState:', sawDive);

// check bots ever flip
let botFlips=0;
for(let i=0;i<40;i++){
  await p.waitForTimeout(80);
  const n = await p.evaluate(()=>{const g=window.__game; if(!g)return 0; return g.entities.filter(e=>e.isBot && e.flipT>0.05).length;});
  if(n>botFlips)botFlips=n;
}
console.log('BOTS simultaneously flipping (peak):', botFlips);

await p.waitForTimeout(400);
await p.screenshot({ path: '/tmp/play_check.png' });
console.log('ERRORS:', errs.length ? errs : 'none');
await b.close();
