#!/usr/bin/env node
/* WHERE THE SIM STEP GOES — CDP sampling profile of a pure update() loop.
   No render in the path, no wrapper on anything. node tools/_simprof.js [game.html] [secs] */
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const file = process.argv[2] || 'game.html';
  const SECS = Number(process.argv[3] || 8);
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
  const steps = await p.evaluate((S) => {
    const t0 = performance.now(); let n = 0;
    while(performance.now() - t0 < S*1000){ update(1/30); n++; }
    return n;
  }, SECS);
  const { profile } = await client.send('Profiler.stop');
  await b.close();

  const byId = new Map(profile.nodes.map(n => [n.id, n]));
  const self = new Map(); let total = 0;
  for(let i=0;i<profile.samples.length;i++){
    const dt = (profile.timeDeltas[i]||0)/1000; total += dt;
    const n = byId.get(profile.samples[i]); if(!n) continue;
    const f = n.callFrame || {};
    const key = (f.functionName||'(anonymous)') + ' :' + ((f.lineNumber|0)+1);
    self.set(key, (self.get(key)||0) + dt);
  }
  const rows = [...self.entries()].sort((a,b2)=>b2[1]-a[1]);
  console.log(`*** ${steps} sim steps in ${SECS}s — ${(total/steps).toFixed(3)} ms/step sampled`);
  console.log('*** self time per sim step:');
  for(const [k,v] of rows.slice(0,30)){
    if(v/total < 0.004) break;
    console.log(`***   ${(v/steps).toFixed(3)} ms  ${(v/total*100).toFixed(1).padStart(5)}%  ${k}`);
  }
})();
