#!/usr/bin/env node
/* THE WORLD STOPS BEING A SQUARE, AND IT STOPS GRADUALLY.
 *
 * "It would be great if we could more naturally transition the map's end so that it's not just
 *  an infinite blue dropoff at the edge of a square world... perhaps the ocean is one of salt —
 *  even MORE impossible to traverse. In any case I just hate that the map suddenly and sharply
 *  ends, and in such an obvious square shape. We should cull it inwards a bit so that the end
 *  of the world is a bit more gradual and less obviously the map's end."
 *
 * TWO FAULTS, AND THE MEASUREMENT FOUND THE SECOND ONE. The obvious half is the shape: the old
 * coast ran off `Math.min(x, y, W-1-x, H-1-y)`, which is a square by construction. The half
 * nobody had noticed is that THERE WAS NO SEA AT ALL — the outer forty tiles measured 15-18%
 * water on the old build, scattered puddles, and you could walk to x=0 on dry ground. Out at
 * the rim the old formula stopped ADDING dryness rather than subtracting it, so a tile still
 * had to draw its own noise under 0.34 to be wet. The comment above it said "the far water is
 * why nobody leaves" and it never made one tile of solid water anywhere.
 *
 *   1. the outer ring is SOLID and impassable, not 17% puddles
 *   2. it is not a square: the corners are pulled in much harder than the edge midpoints
 *   3. three bands, in order outward — brine, then crust, then the dead salt
 *   4. the pans stand clear of the water plane, so they read as ground and not as more sea
 *   5. every band blocks, because every band is still `terr === 3` under the paint
 *   6. and the world is still ONE landmass with every town on it, on five different seeds —
 *      which is the way this change could quietly ruin a world without looking like anything
 *
 * Anything starting '!!' fails the build.
 *
 *   node tools/rim.js [game.html]
 */
const { chromium } = require('playwright');
const path = require('path');
const gamePath = (a) => path.resolve(a ? (path.isAbsolute(a) ? a : path.join(__dirname, a)) : path.join(__dirname, 'game.html'));

(async () => {
  const b = await chromium.launch({
    executablePath: process.env.DUSTWARD_CHROME || undefined,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'],
  });
  const errs = [];
  const R = {};
  const file = gamePath(process.argv[2]);

  /* ---- the shape, measured on the default world ---- */
  {
    const p = await b.newPage({ viewport: { width: 900, height: 600 } });
    p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message.slice(0, 200)));
    await p.goto('file://' + file, { waitUntil: 'load' });
    await p.waitForTimeout(3000);
    await p.evaluate(() => { document.getElementById('btn-start').click(); paused = true; });
    await p.waitForTimeout(3000);
    Object.assign(R, await p.evaluate(() => {
      const O = {};
      const banded = typeof brim !== 'undefined';
      if (!banded) {
        for (const k of ['theRingIsSolid', 'itIsNotASquare', 'threeBandsInOrder', 'thePansStandProud', 'everyBandBlocks'])
          O[k] = '!! THIS BUILD HAS NO RIM BANDS AT ALL';
        return O;
      }
      /* ---- 1. SOLID ---- */
      const ring = (d) => { let wet = 0, n = 0;
        for (let x = d; x < W - d; x += 3) for (const [px, py] of [[x, d], [x, H-1-d], [d, x], [W-1-d, x]]) {
          if (px < 0 || py < 0 || px >= W || py >= H) continue;
          n++; if (tileAt(px, py) === 3) wet++;
        }
        return wet / n; };
      const r10 = ring(10), r30 = ring(30);
      O.theRingIsSolid = (r10 > 0.99 && r30 > 0.99)
        ? `the outer ring is solid water — ${(r10*100).toFixed(0)}% at 10 tiles in and ${(r30*100).toFixed(0)}% at 30, against 17% on the old rule`
        : `!! THE RIM IS STILL PUDDLES (${(r10*100).toFixed(0)}% at 10 tiles, ${(r30*100).toFixed(0)}% at 30)`;

      /* ---- 2. NOT A SQUARE ----
         A frame reaches the same distance inland at a corner as at an edge midpoint. A closed
         curve does not: the corners are furthest from the middle, so they drown deepest. */
      const inland = (sx, sy, dx, dy) => { let i = 0; while (i < 400 && tileAt(sx + dx*i, sy + dy*i) === 3) i++; return i; };
      const mid = [inland(W/2, 0, 0, 1), inland(W/2, H-1, 0, -1), inland(0, H/2, 1, 0), inland(W-1, H/2, -1, 0)];
      const k = Math.SQRT1_2;
      const cor = [inland(0, 0, k, k), inland(W-1, 0, -k, k), inland(0, H-1, k, -k), inland(W-1, H-1, -k, -k)];
      const mAvg = mid.reduce((a, v) => a + v, 0) / 4, cAvg = cor.reduce((a, v) => a + v, 0) / 4;
      O.itIsNotASquare = cAvg > mAvg * 1.5
        ? `the corners are drowned ${(cAvg/mAvg).toFixed(1)}x deeper than the edge midpoints — ${cAvg.toFixed(0)} tiles against ${mAvg.toFixed(0)} — so the landmass has corners rather than a frame around it`
        : `!! IT IS STILL A SQUARE (corners ${cAvg.toFixed(0)} tiles, midpoints ${mAvg.toFixed(0)})`;

      /* ---- 3. THREE BANDS, IN ORDER ----
         Walked inward along four rays: the first band met must be the dead salt, then crust,
         then brine, then land. A band that is out of order is a band the eye cannot read. */
      const walk = (sx, sy, dx, dy) => { const seq = [];
        for (let i = 0; i < 400; i++) {
          const x = Math.round(sx + dx*i), y = Math.round(sy + dy*i);
          const v = tileAt(x, y) === 3 ? brimAt(x, y) : 0;
          if (!seq.length || seq[seq.length-1] !== v) seq.push(v);
          if (v === 0 && seq.length > 1) break;
        }
        return seq.join('>'); };
      const rays = [walk(W/2, 0, 0, 1), walk(0, H/2, 1, 0), walk(W/2, H-1, 0, -1), walk(W-1, H/2, -1, 0)];
      const good = rays.filter(r => r === '3>2>1>0').length;
      O.threeBandsInOrder = good >= 3
        ? `${good} of 4 rays inward read dead salt, then crust, then brine, then land — ${rays.join('  ')}`
        : `!! THE BANDS ARE OUT OF ORDER — ${rays.join('  ')}`;
      const tally = [0,0,0,0]; let n2 = 0;
      for (let y = 0; y < H; y += 4) for (let x = 0; x < W; x += 4) { tally[brim[y*W+x]]++; n2++; }
      O._bands = `inland ${(tally[0]/n2*100).toFixed(1)}%, brine ${(tally[1]/n2*100).toFixed(1)}%, `
               + `crust ${(tally[2]/n2*100).toFixed(1)}%, dead ${(tally[3]/n2*100).toFixed(1)}%`;

      /* ---- 4. THE PANS ARE GROUND, NOT SEA ----
         The water plane paints everything under it. Crust and dead salt are lifted clear of it
         or they are simply more ocean in a different name. */
      const plane = -0.22;
      const hAt = (x, y) => HV[y*(W+1)+x];
      /* THE INTERIOR OF A BAND, NOT ITS EDGE. `HV` is per-VERTEX and averages the four tiles
         around it, so a vertex on the crust/brine seam mixes -0.15 with -0.55 and lands well
         under the plane — which is the beach slope doing exactly what a beach should, and read
         as a failure on the first run. Sample only tiles whose whole neighbourhood is the same
         band, and the claim is about the pan rather than about its shoreline. */
      const solid = (x, y, band) => {
        for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
          const px = x + i, py = y + j;
          if (px < 0 || py < 0 || px >= W || py >= H) return false;
          if (brim[py*W+px] !== band) return false;
        }
        return true; };
      const stat = (band) => { let lo = 9, hi = -9, under = 0, n3 = 0;
        for (let y = 1; y < H-1 && n3 < 600; y += 5) for (let x = 1; x < W-1 && n3 < 600; x += 5) {
          if (!solid(x, y, band)) continue;
          const h = hAt(x, y); lo = Math.min(lo, h); hi = Math.max(hi, h); if (h < plane) under++; n3++;
        }
        return {lo, hi, under, n3}; };
      const cr = stat(2), dd = stat(3), br = stat(1);
      O.thePansStandProud = (cr.under === 0 && dd.under === 0 && br.under / br.n3 > 0.8)
        ? `crust ${cr.lo.toFixed(2)}..${cr.hi.toFixed(2)} and dead salt ${dd.lo.toFixed(2)}..${dd.hi.toFixed(2)} are entirely above the water plane at ${plane}, while ${(br.under/br.n3*100).toFixed(0)}% of the brine is under it`
        : `!! THE PANS ARE UNDERWATER (crust ${cr.under}/${cr.n3} under, dead ${dd.under}/${dd.n3} under, brine ${br.under}/${br.n3})`;

      /* ---- 5. AND ALL THREE BLOCK ----
         The bands are a rendering fact carried in `brim`; the BLOCKING is `terr === 3`, which
         is what the thirty-odd existing checks already read. If a band ever stops being water
         underneath the paint, this is the line that says so. */
      let walkable = 0, checked = 0;
      for (let y = 0; y < H; y += 7) for (let x = 0; x < W; x += 7) {
        if (!brim[y*W+x]) continue;
        checked++; if (!isBlocked(x + 0.5, y + 0.5, 0)) walkable++;
      }
      O.everyBandBlocks = walkable === 0
        ? `all ${checked} sampled tiles of brine, crust and dead salt refuse a foot — the paint is new, the wall is the one that was already there`
        : `!! ${walkable} OF ${checked} RIM TILES CAN BE WALKED ON`;
      return O;
    }));
    await p.close();
  }

  /* ---- 6. AND THE WORLD STILL WORKS, ON FIVE SEEDS ----
     The way this change ruins a world without looking like anything: a town sited in the sea by
     the terrain-blind fallback grid, or a landmass cut in two so half the map cannot be walked
     to. Both are silent, and neither shows up on the default seed. */
  {
    const rows = [];
    for (const seed of [0, 7, 91, 404, 1234]) {
      const p = await b.newPage({ viewport: { width: 700, height: 500 } });
      p.on('pageerror', e => errs.push('PAGEERROR(seed ' + seed + '): ' + e.message.slice(0, 160)));
      await p.goto('file://' + file + (seed ? '?seed=' + seed : ''), { waitUntil: 'load' });
      await p.waitForTimeout(2600);
      await p.evaluate(() => { document.getElementById('btn-start').click(); paused = true; });
      await p.waitForTimeout(2600);
      rows.push(await p.evaluate(() => {
        const drowned = towns.filter(t => tileAt(t.x, t.y) === 3).length;
        const comps = new Set(towns.map(t => landComp[Math.round(t.y)*W + Math.round(t.x)]));
        return {n: towns.length, drowned, comps: comps.size,
                edge: Math.min(...towns.map(t => Math.round(Math.min(t.x, t.y, W - t.x, H - t.y))))};
      }));
      await p.close();
    }
    const bad = rows.filter(r => r.drowned || r.comps !== 1);
    R.everyTownIsOnTheLand = bad.length === 0
      ? `five worlds, ${rows.map(r => r.n).join('/')} towns, none in the sea, one landmass each, nearest to an edge ${Math.min(...rows.map(r => r.edge))} tiles`
      : `!! ${bad.length} OF 5 WORLDS ARE BROKEN — ${bad.map(r => r.drowned + ' drowned, ' + r.comps + ' landmasses').join(' · ')}`;
  }

  console.log('=== THE END OF THE WORLD ===\n');
  for (const [k, v] of Object.entries(R)) console.log('  ' + k.padEnd(24) + v);
  const bad = Object.values(R).map(String).filter(v => v.startsWith('!!'));
  if (errs.length) { console.log(''); errs.slice(0, 4).forEach(e => console.log('  ' + e)); }
  console.log('\n' + (bad.length || errs.length
    ? '*** ' + [...bad, ...errs].join('\n*** ')
    : 'AN ISLAND OF SALT, AND NO SQUARE ANYWHERE ON IT'));
  await b.close();
  process.exit(bad.length || errs.length ? 1 : 0);
})();
