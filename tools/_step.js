#!/usr/bin/env node
/* WHAT ONE SIM STEP COSTS — bulk timing, no per-call wrapper anywhere.
   node tools/_step.js [game.html] [steps] */
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const file = process.argv[2] || 'game.html';
  const N = Number(process.argv[3] || 300);
  const b = await chromium.launch({ args: ['--use-gl=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox','--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 400, height: 300 } });
  await p.goto('file://' + path.resolve(__dirname, file), { waitUntil: 'load' });
  await p.waitForTimeout(2500);
  await p.evaluate(() => document.getElementById('btn-start').click());
  await p.waitForTimeout(5000);
  const r = await p.evaluate((N) => {
    const D = 1/30;
    for(let i=0;i<20;i++) update(D);                       /* warm */
    const runs = [];
    for(let k=0;k<5;k++){
      const t0 = performance.now();
      for(let i=0;i<N;i++) update(D);
      runs.push((performance.now()-t0)/N);
    }
    runs.sort((a,b)=>a-b);
    return { med: runs[2], lo: runs[0], hi: runs[4],
             chars: chars.length, cold: chars.filter(c=>c._cold).length,
             ok: chars.filter(c=>c.state==='ok').length };
  }, N);
  await b.close();
  console.log(`*** ${file}  ${r.chars} bodies (${r.ok} ok, ${r.cold} cold)`);
  console.log(`***   ${r.med.toFixed(3)} ms / sim step   (${r.lo.toFixed(3)} .. ${r.hi.toFixed(3)} over 5 runs of ${N})`);
  console.log(`***   a 30Hz sim has 33.3ms; this uses ${(r.med/33.3*100).toFixed(1)}% of it`);
})();
