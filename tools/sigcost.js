#!/usr/bin/env node
/* WHAT A FRAME SPENDS DECIDING WHETHER TO REBUILD — and a sim step, beside it, as a control.
 *
 * `render()` calls seventeen `sync*` functions every frame. Each one builds a signature string
 * and rebuilds its group only when the string changes, so the signature itself is the cost
 * that is paid every frame, whether or not anything changed. `simcost.js` times `update()` and
 * `bench.js` times the renderer; neither of them timed this. Until 2026-09-24 one of these
 * signatures (syncRedoubts) ran a full-roster filter per cave, about 2 ms a frame on a
 * 1,700-body world.
 *
 * Interleaved A/B, because run-to-run noise here is +/-10% and a single pair of runs proves
 * nothing (the README's rule). Each round loads both builds in alternating order.
 *
 *   node tools/prep.js HEAD prev          # the build to compare against
 *   node tools/sigcost.js prev.html game.html [rounds=6] [steps=500]
 */
const { chromium } = require('playwright');
const path = require('path');
const gamePath = (a) => path.resolve(a ? (path.isAbsolute(a) ? a : path.join(__dirname, a)) : path.join(__dirname, 'game.html'));
const [A, B] = [gamePath(process.argv[2] || 'prev.html'), gamePath(process.argv[3] || 'game.html')];
const ROUNDS = +(process.argv[4] || 6), N = +(process.argv[5] || 500);

async function one(b, file) {
  const p = await b.newPage({ viewport: { width: 800, height: 600 } });
  await p.goto('file://' + file, { waitUntil: 'load' });
  await p.waitForSelector('#btn-start', { state: 'attached', timeout: 60000 });
  await p.waitForTimeout(1500);
  await p.evaluate(() => document.getElementById('btn-start').click());
  await p.waitForTimeout(2500);
  const r = await p.evaluate((N) => {
    paused = true;
    for (let i = 0; i < 60; i++) update(SIM_DT);
    const t = performance.now(); for (let i = 0; i < N; i++) update(SIM_DT);
    const step = (performance.now() - t) / N;
    const syncs = { syncPBuilds, syncBlueprints, syncSundered, syncWells, syncPyres, syncBastion, syncChests, syncBeds,
      syncTownWalls, syncCamps, syncSlaverCamp, syncRoofs, syncVertical, syncRifts, syncStairs, syncUndercroft, syncRedoubts };
    for (const k in syncs) syncs[k]();       /* settle: the first call after a change rebuilds */
    const each = {};
    let total = 0;
    for (const k in syncs) {
      const t0 = performance.now(); for (let i = 0; i < 200; i++) syncs[k]();
      each[k] = (performance.now() - t0) / 200; total += each[k];
    }
    return { step, total, each, chars: chars.length };
  }, N);
  await p.close();
  return r;
}

(async () => {
  const b = await chromium.launch({
    executablePath: process.env.DUSTWARD_CHROME || undefined,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'],
  });
  const res = { A: [], B: [] };
  for (let r = 0; r < ROUNDS; r++) {
    const order = r % 2 ? [['B', B], ['A', A]] : [['A', A], ['B', B]];
    for (const [k, f] of order) res[k].push(await one(b, f));
    console.log(`round ${r + 1}: A step ${res.A[r].step.toFixed(3)} sig ${res.A[r].total.toFixed(3)} | B step ${res.B[r].step.toFixed(3)} sig ${res.B[r].total.toFixed(3)}`);
  }
  const med = a => { const s = [...a].sort((p, q) => p - q); return s[Math.floor(s.length / 2)]; };
  const span = a => `${Math.min(...a).toFixed(3)}–${Math.max(...a).toFixed(3)}`;
  console.log('');
  for (const k of ['A', 'B']) {
    const st = res[k].map(x => x.step), sg = res[k].map(x => x.total);
    console.log(`${k} ${path.basename(k === 'A' ? A : B).padEnd(12)} step ${med(st).toFixed(3)} ms (${span(st)})   signatures ${med(sg).toFixed(3)} ms/frame (${span(sg)})   ${res[k][0].chars} bodies`);
  }
  console.log('\nper signature, median ms/frame (A → B):');
  for (const s of Object.keys(res.A[0].each)) {
    const a = med(res.A.map(x => x.each[s])), bb = med(res.B.map(x => x.each[s]));
    if (a > 0.005 || bb > 0.005) console.log(`  ${s.padEnd(16)} ${a.toFixed(3)} → ${bb.toFixed(3)}`);
  }
  await b.close();
})();
