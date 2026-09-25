#!/usr/bin/env node
/* THE TWO ORDERS YOU GIVE A BAND IN THE FIELD, AND WHAT THEY ACTUALLY DO.
 *
 * Two reports, one file, because both are about `commandTick` and both come down to the same
 * thing: the order was measuring the wrong quantity.
 *
 *   "The patrol command sends the group in a very tiny circle, and then proudly reports that
 *    they completed a tour. It's literally just walking around in a circle. It should be a
 *    genuine patrol of a large perimeter around their original point of origin."
 *
 *   "The forage command right now basically just fizzles out by saying there's nothing of
 *    value nearby. The point of that command is to have them go out and explore/map out new
 *    territory, not JUST go looting."
 *
 * THE PATROL is geometry and can be asked of the waypoints directly — `cmdLeg` is a pure
 * function of the order, so a circuit can be enumerated without running a step of sim. The
 * bar is the RADIUS OF THE RING and the SPREAD OF THE POINTS ON IT, because "a tiny circle"
 * is a statement about both: a wide ring with five points on it is a pentagon.
 *
 * THE FORAGE is harder and is asked through the tick. The old code's failure mode is precise
 * — `forageFind` returns null on picked-over ground and the order ends on the first tick — so
 * the claim stages exactly that: a band on ground with nothing to lift, with unexplored
 * country inside the order, and asks whether they go and look at it.
 *
 *   node tools/sweep.js [game.html]
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
  const p = await b.newPage({ viewport: { width: 900, height: 600 } });
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message.slice(0, 200)));
  await p.goto('file://' + gamePath(process.argv[2]), { waitUntil: 'load' });
  await p.waitForTimeout(3000);
  await p.evaluate(() => { document.getElementById('btn-start').click(); paused = true; });
  await p.waitForTimeout(3000);

  Object.assign(R, await p.evaluate(() => {
    const O = {};
    paused = true;
    const guard = (keys, fn) => {
      try { fn(); } catch (e) { for (const k of keys) if (O[k] === undefined) O[k] = '!! ' + String(e.message).slice(0, 120).toUpperCase(); }
    };
    if (typeof giveCommand !== 'function' || typeof CMD === 'undefined') {
      for (const k of ['aPatrolIsAPerimeter', 'andItHasEnoughCorners', 'aForageWalksWhatNobodyHasSeen',
                       'andSaysWhyItIsStillOut', 'andEndsWhenTheGroundIsKnown'])
        O[k] = '!! THIS BUILD HAS NO FIELD ORDERS';
      return O;
    }

    /* open waste, well clear of anything that could wander into the measurement */
    let gx = 0, gy = 0;
    outer:
    for (let y = 220; y < H - 220; y += 11) for (let x = 220; x < W - 220; x += 11) {
      if (towns.some(t => dist(t.x, t.y, x, y) < 150)) continue;
      let ok = true;
      for (let j = -8; j <= 8 && ok; j++) for (let i = -8; i <= 8; i++) if (isBlocked(x+i+0.5, y+j+0.5, 0)) ok = false;
      if (ok) { gx = x; gy = y; break outer; }
    }
    O._ground = gx ? `staged on open waste at ${gx},${gy}` : '!! NO OPEN GROUND';
    if (!gx) return O;

    const mine = chars.filter(c => c.faction === 'player' && c.state !== 'dead');
    const cdr = mine[0], band = mine.slice(0, 3);
    for (const c of band) { c.x = gx; c.y = gy; c.floor = 0; }
    rebuildCharGrid();

    /* ---- 1 & 2. A PATROL IS A PERIMETER ---- */
    guard(['aPatrolIsAPerimeter', 'andItHasEnoughCorners'], () => {
      giveCommand(cdr, band, 'patrol', {x: gx, y: gy});
      const m = cdr.cmd;
      /* walk one whole circuit's worth of waypoints out of the generator itself */
      const legs = (typeof cmdLegCount === 'function') ? cmdLegCount(cdr) : 5;
      const pts = [];
      for (let i = 0; i < legs; i++) { m.leg = i; pts.push(cmdLeg(cdr)); }
      m.leg = 0;
      const rad = pts.map(q => dist(q.x, q.y, gx, gy));
      const near = Math.min(...rad), far = Math.max(...rad);
      /* the perimeter of the polygon they actually walk, which is the thing the report is about:
         "walking around in a circle" is a complaint about how SHORT the walk is */
      let per = 0;
      for (let i = 0; i < pts.length; i++) {
        const q = pts[i], n = pts[(i + 1) % pts.length];
        per += dist(q.x, q.y, n.x, n.y);
      }
      /* A HOLDING IS ABOUT FORTY TILES ACROSS (`baseHolds` links buildings at 26 and lets the
         watch ring reach 40), so a circuit that screens the ground AROUND one has to stand
         outside that — otherwise it is the patrol JOB with extra steps. 40 is the bar, and the
         old build's ring was 14 to 24. */
      O.aPatrolIsAPerimeter = near >= 40
        ? `the circuit stands ${near.toFixed(0)}-${far.toFixed(0)} tiles out and runs ${per.toFixed(0)} tiles round — `
          + `outside the 40-tile holding it is screening, which is the difference between this and the patrol JOB`
        : `!! THE PATROL IS A TINY CIRCLE (${near.toFixed(0)}-${far.toFixed(0)} tiles out, ${per.toFixed(0)} tiles round)`;
      /* AND ENOUGH CORNERS TO BE A CIRCUIT RATHER THAN A POLYGON. At this radius a five-point
         ring cuts 14% of the ground off at the corners; eight cuts 5%. Measured as the ratio of
         the walked perimeter to the circle it is inscribed in. */
      const circle = 2 * Math.PI * ((near + far) / 2);
      const cover = per / circle;
      O.andItHasEnoughCorners = legs >= 8 && cover > 0.93
        ? `and it is walked in ${legs} legs, covering ${(cover * 100).toFixed(0)}% of the ring it is inscribed in — `
          + `a circuit, not a pentagon with the corners cut off`
        : `!! THE CIRCUIT IS TOO COARSE (${legs} legs, ${(cover * 100).toFixed(0)}% of the ring)`;
      standDown(cdr, true);
    });

    /* ---- 3, 4 & 5. A FORAGE WALKS THE GROUND ---- */
    guard(['aForageWalksWhatNobodyHasSeen', 'andSaysWhyItIsStillOut', 'andEndsWhenTheGroundIsKnown'], () => {
      /* STAGE THE EXACT FAILURE THE REPORT DESCRIBES: ground with nothing left on it. Every
         chest and body inside the order is marked taken, so `forageFind` returns null on the
         first tick — which on the old build is the whole of "nothing here worth carrying". */
      for (const c of band) { c.x = gx; c.y = gy; c.floor = 0; }
      rebuildCharGrid();
      giveCommand(cdr, band, 'forage', {x: gx, y: gy});
      const m = cdr.cmd;
      for (const ch of chests) if (dist(ch.x, ch.y, gx, gy) < m.r + 5) ch.opened = true;
      for (const bd of corpses) if (dist(bd.x, bd.y, gx, gy) < m.r + 5) bd.looted = true;
      O._picked = `the order's ground is picked clean before the first tick — forageFind has nothing to return`;

      /* and the country inside it is unwalked, which is the thing they are supposed to notice */
      let blank = 0, total = 0;
      const farBlank = [];     /* unseen, and further out than anyone can see from the anchor */
      for (let y = Math.floor(gy - m.r); y <= Math.ceil(gy + m.r); y += 4)
        for (let x = Math.floor(gx - m.r); x <= Math.ceil(gx + m.r); x += 4) {
          if (x < 2 || y < 2 || x >= W - 2 || y >= H - 2) continue;
          if (dist(x, y, gx, gy) > m.r) continue;
          total++;
          if (vis[y * W + x] === 0){ blank++; if (dist(x, y, gx, gy) > 34) farBlank.push(y * W + x); }
        }
      O._blank = `${blank} of ${total} lattice points inside the order have never been seen`;

      /* now drive the order and watch what the band is told to do about it */
      const logs = [];
      const realLog = window.log;
      window.log = (t, k) => { logs.push(String(t)); return realLog(t, k); };
      const wasPaused = paused;
      paused = false;
      /* THE CLAIM IS THE MAP THEY MAKE, NOT THE FIRST WAYPOINT THEY ARE HANDED.
         The first cut of this recorded where the order pointed them and then checked `vis`
         there AFTER the run — by which time they had walked to it and looked at it, so the
         tile was in sight and the claim reported failure about a sweep doing exactly what it
         was asked to. And the first waypoint is the WEAKEST thing to ask about anyway: a band
         standing in unexplored country has unexplored ground one tile away, so "is the target
         unseen" is trivially true and says nothing about whether they go anywhere.
         What the report is actually about is new territory getting mapped. So: count the
         lattice points inside the order that nobody had seen, run the order, count them again.
         Ground learned is the whole of it, and on a build where the sweep ends on the first
         tick the number is what the band can see standing still. */
      let learned = 0, ended = false, maxOut = 0;
      for (let i = 0; i < 900 && !ended; i++) {
        update(1 / 30);
        if (!cdr.cmd) { ended = true; break; }
        for (const o of band) maxOut = Math.max(maxOut, dist(o.x, o.y, gx, gy));   /* only while the order is live */
      }
      paused = wasPaused;
      window.log = realLog;
      let stillBlank = 0;
      for (let y = Math.floor(gy - m.r); y <= Math.ceil(gy + m.r); y += 4)
        for (let x = Math.floor(gx - m.r); x <= Math.ceil(gx + m.r); x += 4) {
          if (x < 2 || y < 2 || x >= W - 2 || y >= H - 2) continue;
          if (dist(x, y, gx, gy) > m.r) continue;
          if (vis[y * W + x] === 0) stillBlank++;
        }
      learned = blank - stillBlank;
      const farLearned = farBlank.filter(i => vis[i] !== 0).length;
      const said = logs.join(' | ');
      /* THE BAR IS GROUND LEARNED PAST SIGHT, AND IT IS SET OFF THE GAME'S OWN SIGHT RADIUS.
         Counting ground learned is not enough on its own and the first cut of this found out
         why: a body sees `17 + dayness*13`, up to THIRTY tiles in full daylight, so on a build
         whose forage circle is only 26 tiles wide a band that never moves has already mapped
         half of it — the claim went green on the control about an order that ends on tick one.
         Ground learned inside your own eyeline is not scouting.
         So the claim is the lattice points more than 34 tiles from the anchor — past what anyone
         can see from the middle in the brightest light — that nobody had seen, and how many of
         them the band learned while the order was live. Every one of those was learned by
         walking toward it.
         It used to be "the CAPTAIN got more than 34 tiles out", which was the same question
         while the captain led. PR 39 put him at the rear on purpose, with his blades five tiles
         in front of him, and a sweep that steers for the NEAREST unseen ground maps a 48-tile
         circle from 30-odd tiles out: 441 of 441 points learned, the captain at 31.5, the front
         of the band at 35.5. The proxy had stopped meaning the thing it stood for.
         The bar is a quarter of those points inside the step budget. Measured: 96 of 216 on the
         build before PR 39, 104 of 216 after, and 0 for an order that ends on its first tick. */
      O.aForageWalksWhatNobodyHasSeen = !farBlank.length
        ? `!! NOTHING OUT PAST SIGHT TO LEARN — the staging has to leave unwalked ground beyond 34 tiles`
        : farLearned >= Math.max(1, farBlank.length * 0.25)
          ? `with nothing left to lift the band walks OUT — ${maxOut.toFixed(0)} tiles from the anchor at the front — `
            + `and learns ${farLearned} of the ${farBlank.length} unwalked points past the ${'30'}-tile daylight sight `
            + `they would have had standing still (${learned} of ${blank} in all)`
          : `!! THE SWEEP NEVER LEAVES THE SPOT (${farLearned} of ${farBlank.length} points past sight learned, `
            + `${maxOut.toFixed(0)} tiles out at furthest, ${ended ? 'order ended' : 'order still out'}) — `
            + `${said.slice(0, 110) || 'and it says nothing'}`;
      /* and it says why, once, rather than announcing a failure */
      const fizzled = /nothing here worth carrying/i.test(said);
      O.andSaysWhyItIsStillOut = !fizzled
        ? `and it does not report the ground as empty while there is ground on it nobody has walked`
        : `!! IT STILL SAYS "NOTHING HERE WORTH CARRYING" ABOUT COUNTRY IT HAS NOT LOOKED AT`;

      /* ---- AND THE ERRAND STILL ENDS. An order that cannot finish is worse than one that
              finishes early, so the end condition is asked of the predicate directly on ground
              that IS fully known — which is the one case where coming home is correct. ---- */
      if (cdr.cmd) {
        const m2 = cdr.cmd;
        for (let y = Math.floor(gy - m2.r) - 4; y <= Math.ceil(gy + m2.r) + 4; y++)
          for (let x = Math.floor(gx - m2.r) - 4; x <= Math.ceil(gx + m2.r) + 4; x++) {
            if (x < 0 || y < 0 || x >= W || y >= H) continue;
            if (!vis[y * W + x]) vis[y * W + x] = 1;
          }
        const left = (typeof unseenIn === 'function') ? unseenIn(cdr) : 'NO PREDICATE';
        O.andEndsWhenTheGroundIsKnown = left === null
          ? `and once every tile inside the order is known the sweep has nothing left to do — `
            + `the errand ends on a condition that is reachable, which is what makes it an errand`
          : `!! THE SWEEP NEVER FINISHES (${JSON.stringify(left)})`;
      } else {
        O.andEndsWhenTheGroundIsKnown = '-- cannot speak: the order ended before the ground was filled in';
      }
      if (cdr.cmd) standDown(cdr, true);
    });
    return O;
  }));

  console.log('=== WHAT A BAND IN THE FIELD ACTUALLY DOES ===\n');
  for (const [k, v] of Object.entries(R)) console.log('  ' + k.padEnd(32) + v);
  const bad = Object.values(R).map(String).filter(v => v.startsWith('!!'));
  if (errs.length) { console.log(''); errs.slice(0, 4).forEach(e => console.log('  ' + e)); }
  console.log('\n' + (bad.length || errs.length
    ? '*** ' + [...bad, ...errs].join('\n*** ')
    : 'THEY WALK THE GROUND, AND THE CIRCUIT IS A CIRCUIT'));
  await b.close();
  process.exitCode = (bad.length || errs.length) ? 1 : 0;
})();
