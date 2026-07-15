import { chromium } from 'playwright';
const b = await chromium.launch({ args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport:{width:1024,height:640} });
await p.goto('http://localhost:3000', { waitUntil:'domcontentloaded' });
await p.waitForSelector('.menu-logo', { timeout:15000 });
await p.click('#m-play');
// poll the countdown element for 3 seconds
for (let i=0;i<6;i++){
  await p.waitForTimeout(500);
  const s = await p.evaluate(() => {
    const cd = document.getElementById('countdown');
    const num = document.querySelector('#countdown .count-num');
    return {
      state: window.__game?.state,
      countdown: window.__game?.countdown?.toFixed?.(2),
      cdExists: !!cd,
      cdHTML: cd?.innerHTML,
      numText: num?.textContent,
      numVisible: num ? getComputedStyle(num).display : 'no-el',
      uiRootChildren: document.getElementById('ui-root')?.children.length,
    };
  });
  console.log(i*0.5+'s', JSON.stringify(s));
}
await b.close();
