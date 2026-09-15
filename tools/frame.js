#!/usr/bin/env node
/* WHERE A FRAME ACTUALLY GOES.
 *
 *   "the FPS drop is pretty killer especially on the laptop."
 *
 * A SAMPLING PROFILE OF REAL FRAMES, not a hand-timed loop around `update()`. Everything in this
 * repo that has measured the sim so far has called `update()` in a tight loop and timed it with
 * `performance.now()`, which has two faults that between them sent a whole day's optimisation at
 * the wrong thing:
 *
 *   · IT EXCLUDES THE RENDER ENTIRELY. A frame is sim AND draw, and if the draw is the ceiling
 *     then halving the sim buys nothing at all.
 *   · AND WRAPPING FUNCTIONS TO COUNT THEM DISTORTS WHAT IT MEASURES. A per-call wrapper costs
 *     a fraction of a microsecond, which is nothing — until it is multiplied by the call count,
 *     and the call count is exactly what you are hunting. `physics` at 1,102 calls a step came
 *     back as 40% of the frame and most of that was the wrapper. The thing that looks hottest
 *     under a wrapper is the thing that is called most, which is not the same question.
 *
 * So this drives the REAL rAF loop with the renderer running, takes a CPU sampling profile off
 * the DevTools protocol, and attributes SELF TIME to each function. No wrappers, no loop, no
 * instrument in the path of the thing being measured.
 *
 * ---------- AND THE RENDER NUMBERS HERE ARE NOT THE PLAYER'S RENDER NUMBERS ----------
 * This container has no GPU. WebGL runs on SwiftShader, a software rasteriser, so everything
 * below the draw call is CPU work that simply does not exist on a laptop with a real GPU. Read
 * the GL/rasteriser rows as an artefact of the harness.
 * What IS representative is the JS either side of it: building the scene graph, updating
 * matrices, `syncChars`, the `makeDynGroup` rebuilds, and the sim. Those cost the player exactly
 * what they cost here. The report separates them for that reason.
 *
 *   node tools/frame.js [game.html] [seconds]
 */
const { chromium } = require('playwright');
const path = require('path');
const gamePath = (a) => path.resolve(a ? (path.isAbsolute(a) ? a : path.join(__dirname, a)) : path.join(__dirname, 'game.html'));

(async () => {
  const file = process.argv[2] || 'game.html';
  const SECS = Number(process.argv[3] || 12);
  /* ---------- AND THE VIEWPORT IS A KNOB, BECAUSE THE RASTERISER IS THE ARTEFACT ----------
     At 1200x820 under SwiftShader the software rasteriser is 93% of the frame and the whole
     profile says "the GPU is busy", which is true of this container and false of every machine
     anybody plays on. Rasterising scales with PIXELS; the scene graph, the matrix updates and
     the sim scale with OBJECTS. Shrink the viewport and the artefact collapses while everything
     the player's CPU actually does stays exactly the same size. */
  const VW = Number(process.argv[4] || 1200), VH = Number(process.argv[5] || 820);
  const b = await chromium.launch({
    executablePath: process.env.DUSTWARD_CHROME || undefined,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'],
  });
  const p = await b.newPage({ viewport: { width: VW, height: VH } });
  await p.goto('file://' + gamePath(file), { waitUntil: 'load' });
  await p.waitForTimeout(3000);
  await p.evaluate(() => document.getElementById('btn-start').click());
  await p.waitForTimeout(4000);

  /* let the world settle so the profile is of a running game rather than of worldgen's aftermath */
  await p.waitForTimeout(3000);

  const client = await p.context().newCDPSession(p);
  await client.send('Profiler.enable');
  await client.send('Profiler.setSamplingInterval', { interval: 200 });   /* microseconds */

  /* count real frames across the window, so the profile can be read per frame */
  await p.evaluate(() => { window.__f = 0; const t = () => { window.__f++; requestAnimationFrame(t); }; requestAnimationFrame(t); });
  await client.send('Profiler.start');
  await p.waitForTimeout(SECS * 1000);
  const { profile } = await client.send('Profiler.stop');
  const frames = await p.evaluate(() => window.__f);
  const world = await p.evaluate(() => ({ chars: chars.length, cold: chars.filter(c => c._cold).length }));
  await b.close();

  /* ---- attribute SELF time to each node, then fold by function ---- */
  const byId = new Map(profile.nodes.map(n => [n.id, n]));
  const self = new Map();
  let total = 0;
  for (let i = 0; i < profile.samples.length; i++) {
    const dt = (profile.timeDeltas[i] || 0) / 1000;          /* µs → ms */
    total += dt;
    const n = byId.get(profile.samples[i]);
    if (!n) continue;
    const f = n.callFrame || {};
    const name = f.functionName || '(anonymous)';
    const url = (f.url || '').split('/').pop() || '(native)';
    const key = name + ' @' + url;
    self.set(key, (self.get(key) || 0) + dt);
  }
  const rows = [...self.entries()].sort((a, b2) => b2[1] - a[1]);
  const ms = (v) => (v / Math.max(1, frames)).toFixed(3);

  /* ---------- WHOSE TIME IS IT ----------
     `(program)` and `(garbage collector)` are V8's own buckets. Anything with no script URL at
     this depth is native — for a WebGL page under SwiftShader that is overwhelmingly the software
     rasteriser, which the player's machine does in silicon. */
  const isNative = (k) => k.endsWith('@(native)') || k.includes('(program)') || k.includes('(root)') || k.includes('(idle)');
  const isGC = (k) => k.includes('garbage collector');
  let jsMs = 0, nativeMs = 0, gcMs = 0;
  for (const [k, v] of rows) { if (isGC(k)) gcMs += v; else if (isNative(k)) nativeMs += v; else jsMs += v; }

  console.log(`=== WHERE THE FRAME GOES — ${file} ===\n`);
  console.log(`  ${frames} frames in ${SECS}s  =  ${(frames / SECS).toFixed(1)} fps`);
  console.log(`  ${world.chars} bodies (${world.cold} cold)  viewport ${VW}x${VH}`);
  console.log(`  profile covers ${total.toFixed(0)}ms of samples\n`);
  console.log(`  JS (yours + three.js) ${ms(jsMs).padStart(8)} ms/frame   ${(jsMs / total * 100).toFixed(1)}%`);
  console.log(`  native / rasteriser   ${ms(nativeMs).padStart(8)} ms/frame   ${(nativeMs / total * 100).toFixed(1)}%  <- SwiftShader here, silicon on a real machine`);
  console.log(`  garbage collector     ${ms(gcMs).padStart(8)} ms/frame   ${(gcMs / total * 100).toFixed(1)}%\n`);
  console.log('  --- top self-time, per frame ---');
  for (const [k, v] of rows.slice(0, 26)) {
    if (v / total < 0.002) break;
    console.log(`  ${ms(v).padStart(8)} ms  ${(v / total * 100).toFixed(1).padStart(5)}%  ${k}`);
  }
})();
