#!/usr/bin/env node
/* LINE-LEVEL SELF TIME INSIDE ONE FUNCTION.
   The sampler records `positionTicks` per node — how many samples landed on each LINE of that
   function's own frame. That is what separates "update is expensive" from "this one loop inside
   update is expensive", without putting a wrapper on anything.
   node tools/_lines.js [game.html] [secs] [fnName] */
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
(async () => {
  const file = process.argv[2] || 'game.html';
  const SECS = Number(process.argv[3] || 8);
  const WANT = (process.argv[4] || 'update').split(',');
  const b = await chromium.launch({ args: ['--use-gl=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox','--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 400, height: 300 } });
  await p.goto('file://' + path.resolve(__dirname, file), { waitUntil: 'load' });
  await p.waitForTimeout(2500);
  await p.evaluate(() => document.getElementById('btn-start').click());
  await p.waitForTimeout(5000);
  const client = await p.context().newCDPSession(p);
  await client.send('Profiler.enable');
  await client.send('Profiler.setSamplingInterval', { interval: 100 });
  await client.send('Profiler.start');
  const steps = await p.evaluate((S) => { const t0=performance.now(); let n=0;
    while(performance.now()-t0 < S*1000){ update(1/30); n++; } return n; }, SECS);
  const { profile } = await client.send('Profiler.stop');
  await b.close();

  const src = fs.readFileSync(path.resolve(__dirname, file), 'utf8').split('\n');
  let grand = 0;
  for(const n of profile.nodes) grand += (n.hitCount || 0);
  const per = {};
  for(const n of profile.nodes){
    const f = n.callFrame || {};
    if(!WANT.includes(f.functionName)) continue;
    for(const t of (n.positionTicks || [])){
      const L = t.line;                       /* already 1-based within the file for inline script */
      per[L] = (per[L] || 0) + t.ticks;
    }
  }
  const rows = Object.entries(per).map(([L,t]) => [Number(L), t]).sort((a,b2)=>b2[1]-a[1]);
  const tot = rows.reduce((s,r)=>s+r[1], 0);
  console.log(`*** ${steps} steps · ${WANT.join(',')} own frame = ${tot} of ${grand} samples (${(tot/grand*100).toFixed(1)}% of all)`);
  for(const [L,t] of rows.slice(0, 30)){
    if(t/tot < 0.008) break;
    console.log(`***  ${String(t).padStart(5)}  ${(t/tot*100).toFixed(1).padStart(5)}%  L${L}: ${(src[L-1]||'').trim().slice(0,110)}`);
  }
})();
