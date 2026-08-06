#!/usr/bin/env node
/* What the mountains are actually like to walk on.
 *
 * Answers three questions a player asks with their feet and nobody has asked with a number:
 *
 *   How steep is it?    Max and median rise per tile across each massif. A character is
 *                       about 1.8 units tall, so a tile that climbs more than that is a
 *                       wall being drawn as a hill.
 *   Can it be climbed?  Flood from open ground outside the massif and see how high you can
 *                       actually get, against how high it goes. A summit you cannot stand on
 *                       is scenery, not terrain.
 *   Does it wall off the world?  Flood the whole map from the start and report what fraction
 *                       of walkable land you can reach. A range across an isthmus quietly
 *                       cuts the map in half and nothing else in the project would notice.
 *
 * Usage: node tools/terrain.js [game.html]
 */
const { chromium } = require('playwright');
const path = require('path');
const gamePath = (a) => path.resolve(a ? (path.isAbsolute(a) ? a : path.join(__dirname, a)) : path.join(__dirname, 'game.html'));

(async () => {
  const b = await chromium.launch({
    executablePath: process.env.DUSTWARD_CHROME || undefined,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'],
  });
  const p = await b.newPage({ viewport: { width: 900, height: 600 } });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message.slice(0, 200)));
  await p.goto('file://' + gamePath(process.argv[2]), { waitUntil: 'load' });
  await p.waitForTimeout(3000);
  await p.evaluate(() => document.getElementById('btn-start').click());
  await p.waitForTimeout(3000);

  const out = await p.evaluate(() => {
    const rows = [];
    for (const m of mountains) {
      const R = Math.ceil(m.r * 1.4);
      let blockedN = 0, openN = 0, maxSlope = 0;
      const slopes = [];
      for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
        const x = m.x + dx, y = m.y + dy;
        if (x < 1 || y < 1 || x >= W - 1 || y >= H - 1) continue;
        if (Math.hypot(dx, dy) > R) continue;
        /* the biggest single step a foot would have to take out of this tile */
        const h = heightAt(x, y);
        const s = Math.max(
          Math.abs(heightAt(x + 1, y) - h), Math.abs(heightAt(x - 1, y) - h),
          Math.abs(heightAt(x, y + 1) - h), Math.abs(heightAt(x, y - 1) - h));
        slopes.push(s);
        if (s > maxSlope) maxSlope = s;
        if (isBlocked(x + 0.5, y + 0.5, 0)) blockedN++; else openN++;
      }
      slopes.sort((a2, b2) => a2 - b2);

      /* how high can a walker actually get? flood inward from open ground on the rim */
      const seen = new Set(), q = [];
      for (let a2 = 0; a2 < 64; a2++) {
        const x = Math.round(m.x + Math.cos(a2 / 64 * Math.PI * 2) * R);
        const y = Math.round(m.y + Math.sin(a2 / 64 * Math.PI * 2) * R);
        if (x < 1 || y < 1 || x >= W - 1 || y >= H - 1) continue;
        if (isBlocked(x + 0.5, y + 0.5, 0)) continue;
        const k = x + ',' + y;
        if (!seen.has(k)) { seen.add(k); q.push([x, y]); }
      }
      let reach = -99;
      while (q.length) {
        const [x, y] = q.pop();
        const h = heightAt(x, y);
        if (h > reach) reach = h;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy, k = nx + ',' + ny;
          if (seen.has(k)) continue;
          if (Math.hypot(nx - m.x, ny - m.y) > R) continue;
          if (nx < 1 || ny < 1 || nx >= W - 1 || ny >= H - 1) continue;
          if (isBlocked(nx + 0.5, ny + 0.5, 0)) continue;
          seen.add(k); q.push([nx, ny]);
        }
      }
      const top = heightAt(m.x, m.y);
      rows.push({
        r: +m.r.toFixed(1), peak: +m.peak.toFixed(1),
        topH: +top.toFixed(1),
        climbTo: +reach.toFixed(1),
        climbPct: +(100 * Math.max(0, reach) / Math.max(0.01, top)).toFixed(0),
        maxStep: +maxSlope.toFixed(2),
        medStep: +(slopes[slopes.length >> 1] || 0).toFixed(2),
        p90Step: +(slopes[Math.floor(slopes.length * 0.9)] || 0).toFixed(2),
        blocked: blockedN, open: openN,
        blockedPct: +(100 * blockedN / Math.max(1, blockedN + openN)).toFixed(0),
      });
    }

    /* does the world still hang together? flood every walkable land tile from the start */
    let land = 0;
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) if (!isBlocked(x + 0.5, y + 0.5, 0)) land++;
    const seenG = new Uint8Array(W * H);
    const st = [[Math.round(startTown.x), Math.round(startTown.y)]];
    seenG[st[0][1] * W + st[0][0]] = 1;
    let reached = 0;
    while (st.length) {
      const [x, y] = st.pop(); reached++;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 1 || ny < 1 || nx >= W - 1 || ny >= H - 1) continue;
        const k = ny * W + nx;
        if (seenG[k] || isBlocked(nx + 0.5, ny + 0.5, 0)) continue;
        seenG[k] = 1; st.push([nx, ny]);
      }
    }
    /* Does the range survive a save? This exact code had a bug once where every massif
       quietly became walkable on load, because the peaks are raised after baseBlocked is
       taken and restore() rebuilds the world from baseBlocked. The trails are DELETED from
       baseBlocked now as well, so both halves of the claim need checking: cliffs still
       cliff, and the way up still open. */
    const sample = [], trailSample = [];
    for (const m of mountains) {
      const R = Math.ceil(m.r * 1.9);
      for (let dy = -R; dy <= R && sample.length < 400; dy += 3) for (let dx = -R; dx <= R; dx += 3) {
        const x = m.x + dx, y = m.y + dy;
        if (x < 1 || y < 1 || x >= W - 1 || y >= H - 1) continue;
        if (isBlocked(x + 0.5, y + 0.5, 0)) { sample.push([x, y]); break; }
      }
      for (const [x, y] of (m.trail || []).slice(0, 12)) trailSample.push([x, y]);
    }
    restore(JSON.parse(JSON.stringify(snapshot())));
    const cliffKept = sample.filter(([x, y]) => isBlocked(x + 0.5, y + 0.5, 0)).length;
    const trailOpen = trailSample.filter(([x, y]) => !isBlocked(x + 0.5, y + 0.5, 0)).length;

    return { rows, world: { walkableTiles: land, reachable: reached, pct: +(100 * reached / Math.max(1, land)).toFixed(1) },
             persist: { cliffSampled: sample.length, cliffKept, trailSampled: trailSample.length, trailOpen } };
  });

  console.log('=== ' + (process.argv[2] || 'game.html') + ' ===');
  console.log('\nPER MASSIF  (a character is ~1.8 units tall; a step over that is a wall)');
  console.log('  ' + ['r', 'peak', 'topH', 'climbTo', 'climb%', 'maxStep', 'p90Step', 'medStep', 'blk%'].map(s => s.padStart(9)).join(''));
  for (const r of out.rows) {
    console.log('  ' + [r.r, r.peak, r.topH, r.climbTo, r.climbPct + '%', r.maxStep, r.p90Step, r.medStep, r.blockedPct + '%']
      .map(s => String(s).padStart(9)).join(''));
  }
  const cl = out.rows.map(r => r.climbPct);
  console.log('\n  climbable to the top:  ' + cl.filter(c => c >= 90).length + '/' + cl.length +
    '   median reach ' + (cl.sort((a, b2) => a - b2)[cl.length >> 1] || 0) + '% of summit height');
  console.log('\nWORLD CONNECTIVITY');
  console.log('  walkable land tiles ' + out.world.walkableTiles + ', reachable from start ' +
    out.world.reachable + '  (' + out.world.pct + '%)');
  if (out.world.pct < 99) console.log('  *** ' + (100 - out.world.pct).toFixed(1) + '% of walkable land is CUT OFF ***');
  const pr = out.persist;
  console.log('\nSAVE / LOAD');
  console.log('  cliffs still blocked ' + pr.cliffKept + '/' + pr.cliffSampled +
    '   trail still open ' + pr.trailOpen + '/' + pr.trailSampled +
    ((pr.cliffKept === pr.cliffSampled && pr.trailOpen === pr.trailSampled) ? '   OK' : '   *** LOST ***'));
  if (errs.length) console.log('\nerrs:', errs.length, errs.slice(0, 3));
  await b.close();
})();
