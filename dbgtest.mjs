import { chromium } from 'playwright';
const b = await chromium.launch({ args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport:{width:1024,height:640} });
p.on('pageerror', e => console.log('PAGEERR:', e.message));
p.on('console', m => console.log('['+m.type()+']', m.text().slice(0,200)));
await p.goto('http://localhost:3000', { waitUntil:'domcontentloaded' });
await p.waitForTimeout(4000);
const state = await p.evaluate(() => ({
  bootGone: !document.getElementById('boot'),
  hasMenu: !!document.querySelector('.menu-logo'),
  uiHTML: document.getElementById('ui-root')?.innerHTML.slice(0,80),
  hasCanvas: !!document.querySelector('#game-root canvas'),
  bootTip: document.getElementById('boot-tip')?.textContent,
}));
console.log('STATE:', JSON.stringify(state));
await b.close();
