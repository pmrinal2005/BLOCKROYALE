import { chromium } from 'playwright';
const b = await chromium.launch({ args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
await p.goto('http://localhost:3000', { waitUntil:'domcontentloaded' });
await p.waitForSelector('.menu-logo', { timeout: 20000 });
await p.waitForTimeout(800);
// PREVIEW state flip?
let prevMax=0;
for(let i=0;i<10;i++){await p.waitForTimeout(60); const f=await p.evaluate(()=>window.__game?.human?.flipT||0); if(f>prevMax)prevMax=f;}
console.log('PREVIEW human maxFlipT:', prevMax);

await p.click('#m-play');
await p.waitForFunction(() => window.__game?.state === 'playing', { timeout: 20000 }).catch(()=>{});
// Sample flip for 2 seconds WITHOUT any input
let matchMax=0, samples=[];
for(let i=0;i<30;i++){await p.waitForTimeout(60); const d=await p.evaluate(()=>{const h=window.__game?.human;return{f:h.flipT,s:h.animState};}); if(d.f>matchMax)matchMax=d.f; if(i<8)samples.push(`${d.f.toFixed(2)}/${d.s}`);}
console.log('MATCH (no input) human maxFlipT:', matchMax.toFixed(3), 'early:', samples.join(' '));
await b.close();
