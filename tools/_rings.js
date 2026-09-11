#!/usr/bin/env node
/* WHERE THE BODIES ACTUALLY ARE, relative to the squad — the census a distance-based
   cold tier would be built on. Counts only. */
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox','--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 500, height: 400 } });
  await p.goto('file://' + path.join(__dirname, 'game.html'), { waitUntil: 'load' });
  await p.waitForTimeout(2500);
  await p.evaluate(() => document.getElementById('btn-start').click());
  await p.waitForTimeout(5000);
  const r = await p.evaluate(() => {
    for(let i=0;i<90;i++) update(1/30);
    const pl = chars.filter(u => u.faction === 'player' && u.state !== 'dead');
    const alive = chars.filter(c => c.state !== 'dead' && c.faction !== 'player');
    const dNear = (c) => Math.min(...pl.map(u => Math.max(Math.abs(u.x-c.x), Math.abs(u.y-c.y))));
    const rings = { '0-40': 0, '40-80': 0, '80-150': 0, '150-300': 0, '300+': 0 };
    const surface = { '0-40': 0, '40-80': 0, '80-150': 0, '150-300': 0, '300+': 0 };
    let busyBeyond80 = 0, townFolkBeyond80 = 0, travellersBeyond80 = 0;
    for(const c of alive){
      const d = dNear(c);
      const k = d < 40 ? '0-40' : d < 80 ? '40-80' : d < 150 ? '80-150' : d < 300 ? '150-300' : '300+';
      rings[k]++;
      if((c.floor||0) === 0) surface[k]++;
      if(d >= 80){
        if(c.target || c.windup) busyBeyond80++;
        if(c.civ || c.guard) townFolkBeyond80++;
        if(c.pCaravan || c.mobileVendor || c.moveTarget) travellersBeyond80++;
      }
    }
    return { bodies: chars.length, alive: alive.length, squad: pl.length,
             coldNow: alive.filter(c => c._cold).length,
             warmNow: alive.filter(c => !c._cold).length,
             farNow: alive.filter(c => c._lod).length,
             rings, surface, busyBeyond80, townFolkBeyond80, travellersBeyond80,
             mapW: W };
  });
  console.log(JSON.stringify(r, null, 1));
  await b.close();
})();
