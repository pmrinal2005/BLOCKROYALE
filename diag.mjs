import { chromium } from 'playwright';
const b = await chromium.launch({ args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--no-sandbox'] });
const p = await b.newPage({ viewport:{width:1024,height:640} });
await p.goto('http://localhost:3000', { waitUntil:'domcontentloaded' });
await p.waitForSelector('.menu-logo', { timeout:15000 });
await p.click('#m-play');
await p.waitForFunction(() => window.__game?.state === 'playing', { timeout:15000 }).catch(()=>{});
await p.keyboard.down('w');
for (let i=0;i<12;i++){
  await p.waitForTimeout(250);
  const s = await p.evaluate(()=>{const h=window.__game?.human;const it=window.__game?.input?.getIntent?window.__game.input:null;return h?{x:+h.x.toFixed(2),y:+h.y.toFixed(2),z:+h.z.toFixed(2),vx:+h.vx.toFixed(2),vz:+h.vz.toFixed(2),g:h.grounded,imx:+h.intent.mx.toFixed(2),imz:+h.intent.mz.toFixed(2)}:null;});
  console.log(JSON.stringify(s));
}
await p.keyboard.up('w');
await b.close();
