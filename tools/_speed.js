#!/usr/bin/env node
/* WHAT THE SIM SPENDS AT EACH SPEED, split by tier.
   COUNTS ONLY — a wrapper distorts a timing but a call count is a call count. */
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const file = process.argv[2] || 'game.html';
  const b = await chromium.launch({ args: ['--use-gl=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox','--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 500, height: 400 } });
  await p.goto('file://' + path.join(__dirname, file), { waitUntil: 'load' });
  await p.waitForTimeout(2500);
  await p.evaluate(() => document.getElementById('btn-start').click());
  await p.waitForTimeout(5000);
  const r = await p.evaluate(() => {
    const out = {};
    for(const sp of [1, 5]){
      speed = sp;
      for(let i=0;i<60;i++) update(1/30);          /* settle */
      const c = { aiCold:0, aiColdBusy:0, aiWarm:0, phCold:0, phColdBusy:0, phWarm:0 };
      const rAi = window.ai, rPh = window.physics;
      window.ai = function(x, d){ const busy = !!(x.target || x.windup);
        if(x._cold) c[busy ? 'aiColdBusy' : 'aiCold']++; else c.aiWarm++; return rAi.apply(this, arguments); };
      window.physics = function(x, d){ const busy = !!(x.target || x.windup);
        if(x._cold) c[busy ? 'phColdBusy' : 'phCold']++; else c.phWarm++; return rPh.apply(this, arguments); };
      const N = 120;
      for(let i=0;i<N;i++) update(1/30);
      window.ai = rAi; window.physics = rPh;
      const per = {}; for(const k of Object.keys(c)) per[k] = +(c[k]/N).toFixed(1);
      /* per WALL second: at speed s the loop runs 30*s steps a second */
      const wall = {}; for(const k of Object.keys(c)) wall[k] = Math.round(c[k]/N * 30 * sp);
      out[sp + 'x'] = { perStep: per, perWallSecond: wall,
        bodies: chars.length, cold: chars.filter(x=>x._cold).length,
        coldBusy: chars.filter(x=>x._cold && (x.target||x.windup)).length };
    }
    speed = 1;
    return out;
  });
  console.log(JSON.stringify(r, null, 1));
  await b.close();
})();
