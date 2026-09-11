#!/usr/bin/env node
/* A CHAMBER WITH TWO WAYS IN AND ONE DOOR.
   "some doors lead to a boss room, which would then seem to lead to another hallway on the
    other side... but there is no door to open that side."
   `chamber` walls its entire ring but the one door tile, so at build time every chamber has
   exactly one opening. Counts what the world actually ends up with. */
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox','--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 500, height: 400 } });
  await p.goto('file://' + path.join(__dirname, (process.argv[2] || 'game.html')), { waitUntil: 'load' });
  await p.waitForTimeout(2500);
  await p.evaluate(() => document.getElementById('btn-start').click());
  await p.waitForTimeout(5000);
  const r = await p.evaluate(() => {
    let rooms = 0, vaults = 0, leaky = 0, leakyVaults = 0, holes = 0;
    const worst = [];
    for(const cv of caves) for(const rm of (cv.rooms || [])){
      rooms++; if(rm.vault) vaults++;
      const F = rm.f;
      const doorSet = new Set((cv.doors || []).filter(d => d.f === F).map(d => d.x + ',' + d.y));
      const open = [];
      for(let x = rm.x0; x <= rm.x1; x++) for(const y of [rm.y0, rm.y1])
        if(!isBlocked(x + 0.5, y + 0.5, F) && !doorSet.has(x + ',' + y)) open.push([x, y]);
      for(let y = rm.y0 + 1; y <= rm.y1 - 1; y++) for(const x of [rm.x0, rm.x1])
        if(!isBlocked(x + 0.5, y + 0.5, F) && !doorSet.has(x + ',' + y)) open.push([x, y]);
      if(open.length){
        leaky++; holes += open.length; if(rm.vault) leakyVaults++;
        if(worst.length < 5) worst.push({ f: F, vault: !!rm.vault, holes: open.length, at: open.slice(0,3) });
      }
    }
    return { rooms, vaults, leaky, leakyVaults, holes, worst };
  });
  console.log(JSON.stringify(r, null, 1));
  await b.close();
})();
