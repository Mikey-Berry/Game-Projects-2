#!/usr/bin/env node
/* THE WASTE, A LITTLE LESS EMPTY.
 *
 * "The world definitely feels sparse. The size is great but we need to brainstorm ways to
 *  balance emptiness with life." And then: "for the sparse world, I like the idea of hamlets
 *  etc.. I'd also like to add some new biomes, and make the main roads between towns a bit more
 *  obvious. Right now the waste all blends together. Let's work at this little by little so as
 *  not to overcrowd the game."
 *
 * One claim per step, added as each step lands:
 *
 *   1. the roads are worn into the ground: along every road the ground's own vertices are
 *      darker and browner than the waste a few tiles off it, and nothing else on the map moved
 *
 * Anything starting '!!' fails the build.
 *
 *   node tools/waste.js [game.html]
 */
const { chromium } = require('playwright');
const path = require('path');
const gamePath = (a) => path.resolve(a ? (path.isAbsolute(a) ? a : path.join(__dirname, a)) : path.join(__dirname, 'game.html'));

(async () => {
  const b = await chromium.launch({
    executablePath: process.env.DUSTWARD_CHROME || undefined,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'],
  });
  const p = await b.newPage({ viewport: { width: 1000, height: 700 } });
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message.slice(0, 200)));
  await p.goto('file://' + gamePath(process.argv[2]), { waitUntil: 'load', timeout: 120000 });
  await p.waitForSelector('#btn-start', { state: 'attached', timeout: 120000 });
  await p.evaluate(() => { document.getElementById('btn-start').click(); paused = true; });
  await p.waitForFunction(() => { try { return player().length > 0; } catch (e) { return false; } }, null, { timeout: 180000, polling: 1000 });
  await p.waitForTimeout(1500);

  const out = await p.evaluate(() => {
    const R = {};
    paused = true;

    /* ---- 1. the roads, worn into the ground ----
       Read off the built ground itself: the vertex colour at a road's middle against the one
       eight tiles to the side of it, square to the road, at points all along every road. */
    {
      const ground = [];
      scene.traverse(o => { if (o.isMesh && o.name === 'ground') ground.push(o); });
      const colAt = (x, y) => {
        for (const m of ground) {
          const g = m.geometry, bb = g.boundingBox || (g.computeBoundingBox(), g.boundingBox);
          if (x < bb.min.x || x > bb.max.x || y < bb.min.z || y > bb.max.z) continue;
          const pos = g.attributes.position, col = g.attributes.color;
          for (let i = 0; i < pos.count; i++)
            if (Math.round(pos.getX(i)) === Math.round(x) && Math.round(pos.getZ(i)) === Math.round(y))
              return [col.getX(i), col.getY(i), col.getZ(i)];
        }
        return null;
      };
      let on = 0, off = 0, n = 0, browner = 0;
      for (const rt of tradeRoutes) {
        for (let k = 3; k < rt.wps.length - 3; k += Math.max(1, Math.floor(rt.wps.length / 6))) {
          const a = rt.wps[k - 1], c = rt.wps[k + 1], w = rt.wps[k];
          const dx = c.x - a.x, dy = c.y - a.y, L = Math.hypot(dx, dy) || 1;
          const sx = w.x - dy / L * 8, sy = w.y + dx / L * 8;
          if (nearRoad(sx, sy, 5)) continue;                       /* the side point is on another road */
          const c0 = colAt(w.x, w.y), c1 = colAt(sx, sy);
          if (!c0 || !c1) continue;
          const l0 = (c0[0] + c0[1] + c0[2]) / 3, l1 = (c1[0] + c1[1] + c1[2]) / 3;
          on += l0; off += l1; n++;
          if (c0[2] / c0[0] < c1[2] / c1[0] - 0.02) browner++;
        }
      }
      on /= n || 1; off /= n || 1;
      R.theRoadsAreWorn = n >= 20 && on < off * 0.88 && browner >= n * 0.8
        ? `at ${n} points along ${tradeRoutes.length} roads the ground down the middle is ${(on / off * 100).toFixed(0)}% as bright as eight tiles off it, and browner at ${browner} of them`
        : `!! THE ROADS DO NOT SHOW: ${n} points, middle ${on.toFixed(3)} against ${off.toFixed(3)} beside it, browner at ${browner}`;
    }
    return R;
  });

  const bad = Object.values(out).filter(v => typeof v === 'string' && v.startsWith('!!'));
  for (const [k, v] of Object.entries(out)) console.log('  ' + k.padEnd(20) + ' ' + v);
  for (const e of errs) console.log('  ' + e);
  console.log('');
  console.log(bad.length || errs.length ? `*** THE WASTE IS WRONG (${bad.length + errs.length}) ***` : 'THE WASTE HAS ROADS IN IT');
  await b.close();
  process.exit(bad.length || errs.length ? 1 : 0);
})();
