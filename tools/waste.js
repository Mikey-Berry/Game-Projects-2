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
 *   2. hamlets: one per town, out along that town's own road, clear of every camp, site, ruin
 *      and town; a house (and at a farm a barn) built the town's way; nobody in them until one
 *      of yours comes near, and bringing them in moves no draw of the world's; and once there
 *      they keep to their own yard, and talk about the work in front of them
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

    /* ---- 2. hamlets ---- */
    {
      const bad = [];
      const per = towns.map((t, ti) => hamlets.filter(h => h.town === ti).length);
      for (const h of hamlets) {
        const t = towns[h.town], d = dist(t.x, t.y, h.x, h.y);
        if (d < 50 || d > 130) bad.push(`${h.name} is ${Math.round(d)} from ${t.name}`);
        if (towns.some((o, oi) => oi !== h.town && dist(o.x, o.y, h.x, h.y) < 55)) bad.push(`${h.name} crowds another town`);
        if (camps.some(c => dist(c.x, c.y, h.x, h.y) < 70)) bad.push(`${h.name} is beside a bandit camp`);
        if (corpseSites.some(s2 => dist(s2.x, s2.y, h.x, h.y) < 55)) bad.push(`${h.name} is on Sundered ground`);
        if (!nearRoad(h.x, h.y, 22) || nearRoad(h.x, h.y, 8)) bad.push(`${h.name} is not beside a road`);
        const hb = buildings.filter(b => b.hamlet === h.id);
        if (!hb.length || hb.some(b => b.town || b.styleTown !== t)) bad.push(`${h.name}'s buildings are wrong`);
      }
      R.oneHamletATown = per.every(n => n === 1) && !bad.length
        ? `${hamlets.length} hamlets, one for each town (${[...new Set(hamlets.map(h => h.kind))].join(', ')}), 50 to 130 tiles out beside that town's own road, and none by a camp, a site or another town: ${hamlets.map(h => h.name).join(', ')}`
        : `!! THE HAMLETS: per town [${per.join(', ')}]; ${bad.slice(0, 4).join('; ')}`;

      /* nobody there until you come, and coming moves nothing */
      const h = hamlets.find(o => !o.woke) || hamlets[0];
      const before = chars.filter(c => c.hamlet === h.id).length;
      const s0 = seed, u0 = uid;
      wakeHamlet(h);
      const folk = chars.filter(c => c.hamlet === h.id);
      R.theyComeWhenYouDo = before === 0 && folk.length >= 3 && seed === s0 && folk.every(c => c.civ && c.guard && !c.homeTown)
        ? `${h.name} is empty until one of yours is near; then ${folk.length} people are there (${folk.map(c => c.name).join(', ')}), and the world's stream is exactly where it was`
        : `!! THE PEOPLE: ${before} before, ${folk.length} after, stream ${seed === s0 ? 'kept' : 'MOVED'}`;

      /* they keep to their own yard: run the world for two minutes with nobody of ours near */
      for (const c of player()) { c.x = h.x + 400; c.y = h.y; }
      rebuildCharGrid();
      const hour0 = hour; hour = 11;
      for (let i = 0; i < 1200; i++) update(0.1);
      hour = hour0;
      const strays = folk.filter(c => c.state === 'ok' && dist(c.x, c.y, h.x, h.y) > 14);
      R.theyKeepToTheYard = folk.length && !strays.length
        ? `two minutes on, all ${folk.length} are still in the yard (farthest ${Math.max(...folk.map(c => dist(c.x, c.y, h.x, h.y))).toFixed(1)} tiles out)`
        : `!! ${strays.length} WANDERED OFF: ${strays.map(c => `${c.name} at ${Math.round(dist(c.x, c.y, h.x, h.y))}`).join(', ')}`;

      /* and what they say */
      const adult = folk.find(c => c.trade);
      const heard = new Set();
      const say0 = window.say; window.say = (c, line) => { heard.add(String(line)); };
      const log0 = window.log; window.log = () => {};
      try { for (let i = 0; i < 40; i++) talkTo(adult, player()[0]); } finally { window.say = say0; window.log = log0; }
      const work = [...heard].filter(l => (TRADE_TALK[adult.trade] || []).includes(l));
      R.theyTalkAboutTheWork = work.length && heard.size > work.length && !document.querySelector('#modal[style*="block"]')
        ? `right-clicked, a ${adult.trade} out there barks rather than opening a window, and about the work in front of them as often as the news ("${work[0]}")`
        : `!! WHAT THEY SAY: ${heard.size} lines, ${work.length} about the work`;
    }
    return R;
  });

  const bad = Object.values(out).filter(v => typeof v === 'string' && v.startsWith('!!'));
  for (const [k, v] of Object.entries(out)) console.log('  ' + k.padEnd(20) + ' ' + v);
  for (const e of errs) console.log('  ' + e);
  console.log('');
  console.log(bad.length || errs.length ? `*** THE WASTE IS WRONG (${bad.length + errs.length}) ***` : 'THE WASTE HAS ROADS IN IT, AND PEOPLE BY THEM');
  await b.close();
  process.exit(bad.length || errs.length ? 1 : 0);
})();
