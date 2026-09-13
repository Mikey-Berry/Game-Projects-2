const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox','--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 900, height: 650 } });
  const errs = []; p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message.slice(0,200)));
  await p.goto('file://' + path.join(__dirname, 'game.html'), { waitUntil: 'load' });
  await p.waitForTimeout(3000);
  await p.evaluate(() => document.getElementById('btn-start').click());
  await p.waitForTimeout(5000);
  const out = {};
  for(const sp of [1, 3, 5]){
    await p.evaluate((s) => { setSpeed(s); opts.fps = true; paused = false; }, sp);
    await p.waitForTimeout(6000);
    out[sp + 'x'] = await p.evaluate(() => ({
      steps: +simStepsEMA.toFixed(2), simMs: +simMs.toFixed(1),
      perStep: +(simMs / Math.max(0.05, simStepsEMA)).toFixed(1),
      fps: Math.round(fpsEMA), bodies: chars.length, speed,
    }));
  }
  /* and paused must show the sim stop entirely */
  await p.evaluate(() => { paused = true; });
  await p.waitForTimeout(4000);
  out.paused = await p.evaluate(() => ({ steps: +simStepsEMA.toFixed(2), simMs: +simMs.toFixed(1), fps: Math.round(fpsEMA) }));
  for(const e of errs) console.log(e);
  console.log(JSON.stringify(out, null, 1));
  await b.close();
})();
