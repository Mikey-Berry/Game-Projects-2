#!/usr/bin/env node
/* WHAT DOES THE UNDERGROUND ACTUALLY COST?
 *
 * The hypothesis: the lower levels are simulated at all times, they exist purely as a combat and
 * exploration layer, and all that simulating is what is killing response times.
 *
 * This measures the CEILING on freezing them — not a design, just the number. It times the sim
 * as it stands, then times it again with every body below ground lifted out of `chars`
 * altogether, which is strictly better than any freeze could be (a freeze still has to visit a
 * body to decide to skip it). Whatever the gap is, that is the most the idea can be worth.
 *
 *   node tools/_deepcost.js [game.html] [steps]
 */
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
    const D = 1/30, out = {};
    const byFloor = {};
    for(const c of chars){ const f = c.floor || 0; byFloor[f] = (byFloor[f] || 0) + 1; }
    out.census = Object.keys(byFloor).sort((a,b)=>b-a).map(f => `${f}: ${byFloor[f]}`).join('  ');
    out.total = chars.length;
    out.below = chars.filter(c => (c.floor || 0) < 0).length;

    /* how much of the WORK goes below ground — counted, by wrapping ai/physics for one run only.
       A wrapper is poison in the hot path, so this is a separate timed-out-of-band count and the
       timings below are taken with it removed. */
    {
      const rAi = ai, rPh = physics;
      let aiUp = 0, aiDn = 0, phUp = 0, phDn = 0;
      ai = function(c){ if((c.floor||0) < 0) aiDn++; else aiUp++; return rAi.apply(this, arguments); };
      physics = function(c){ if((c.floor||0) < 0) phDn++; else phUp++; return rPh.apply(this, arguments); };
      for(let i=0;i<120;i++) update(D);
      ai = rAi; physics = rPh;
      out.aiCalls = `surface ${aiUp}  below ${aiDn}  (${(aiDn/(aiDn+aiUp)*100).toFixed(0)}% below)`;
      out.phCalls = `surface ${phUp}  below ${phDn}  (${(phDn/(phDn+phUp)*100).toFixed(0)}% below)`;
    }

    const time = (label) => {
      for(let i=0;i<20;i++) update(D);                 /* warm */
      const runs = [];
      for(let k=0;k<5;k++){
        const t0 = performance.now();
        for(let i=0;i<N;i++) update(D);
        runs.push((performance.now()-t0)/N);
      }
      runs.sort((a,b)=>a-b);
      return runs[2];                                   /* median of five */
    };

    out.asItStands = time('now');

    /* now lift every body below ground clean out of the roster */
    const below = chars.filter(c => (c.floor || 0) < 0);
    const keep = chars.filter(c => (c.floor || 0) >= 0);
    const gone = new Set(below);
    for(const c of keep){                               /* nobody may point at a body that left */
      if(c.target && gone.has(c.target)) c.target = null;
      if(c.guardTarget && gone.has(c.guardTarget)) c.guardTarget = null;
    }
    chars.length = 0; for(const c of keep) chars.push(c);
    out.surfaceOnly = time('surface only');
    out.lifted = below.length;
    out.saving = `${(out.asItStands - out.surfaceOnly).toFixed(2)} ms of ${out.asItStands.toFixed(2)} — ${((1 - out.surfaceOnly/out.asItStands)*100).toFixed(0)}%`;
    return out;
  }, N);

  console.log('*** bodies by floor:  ' + r.census);
  console.log('*** ' + r.below + ' of ' + r.total + ' bodies are below ground (' + (r.below/r.total*100).toFixed(0) + '%)');
  console.log('*** ai calls:      ' + r.aiCalls);
  console.log('*** physics calls: ' + r.phCalls);
  console.log('*** as it stands:  ' + r.asItStands.toFixed(3) + ' ms / step');
  console.log('*** surface only:  ' + r.surfaceOnly.toFixed(3) + ' ms / step   (' + r.lifted + ' bodies lifted out)');
  console.log('*** CEILING ON FREEZING THE DEPTHS: ' + r.saving);
  await b.close();
})();
