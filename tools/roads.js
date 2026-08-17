#!/usr/bin/env node
/* DO CARAVANS GET WHERE THEY ARE GOING?
 *
 * "Caravans have a tendency to get caught on city walls." A wagon that stops moving does not
 * throw and does not log — it just stands there for the rest of the run — so the only way to
 * see it is to run the world and watch the wagons.
 *
 * This samples every caravan's position on a fixed cadence, and calls one STALLED when it has
 * not moved a tile in a full minute of game time while it is awake, walking, and not sitting
 * out the night. Then it asks where the stalled ones were standing, because "caught on a wall"
 * is a specific claim: a wagon stuck in open waste is a different bug from a wagon stuck with
 * its nose against a rampart.
 *
 *   node tools/roads.js [game.html]
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
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message.slice(0, 200)));
  await p.goto('file://' + gamePath(process.argv[2]), { waitUntil: 'load' });
  await p.waitForTimeout(3000);
  await p.evaluate(() => document.getElementById('btn-start').click());
  await p.waitForTimeout(3000);

  const out = await p.evaluate(() => {
    const R = {};
    paused = false;

    const wagons = () => chars.filter(c => c.caravan && c.state === 'ok');
    /* A FLEET, NOT WHATEVER HAPPENED TO BE OUT. The world runs one or two wagons at a time,
       which over nine days is two or three legs — far too thin to say anything about a failure
       the report calls a "tendency". `spawnCaravan` is the game's own, so every route, every
       waypoint list and every gate approach is the one that ships; there are simply more of
       them at once, and between them they cover most town pairs on the map. */
    for (let i = 0; i < 14; i++) spawnCaravan();
    R.thereAreCaravans = wagons().length >= 12
      ? `${wagons().length} caravans on the roads, spread across the world's own routes`
      : `!! ONLY ${wagons().length} CARAVANS COULD BE PUT ON THE ROADS`;

    /* how near a town wall a body is standing, and whether that wall is between it and the
       town's gate — the distinction the report turns on */
    const wallGap = (c) => {
      let best = 1e9, town = null;
      for (const t of towns) {
        if (!t.def.wall) continue;
        const d = Math.abs(dist(c.x, c.y, t.x, t.y) - t.def.wall.r);
        if (d < best) { best = d; town = t; }
      }
      return { gap: best, town };
    };

    const seen = new Map();          /* id -> {x, y, stallT, worstStall, atWall} */
    const arrivals = new Map();      /* id -> how many legs it finished */
    let ticks = 0;
    const SAMPLE = 600;              /* 60s of game time per sample at dt 0.1 */
    /* ~9 game-days. Long enough that a wagon has to complete several legs, and every one of
       them has to pass a walled town, which is where the report puts the failure. */
    const TOTAL = 60000;

    for (const c of wagons()) { seen.set(c.id, { x: c.x, y: c.y, stall: 0, worst: 0, atWall: 0 }); arrivals.set(c.id, 0); }
    const destOf = new Map();
    for (const c of wagons()) destOf.set(c.id, c.caravan.dest);

    for (let t = 0; t < TOTAL; t++) {
      update(0.1);
      /* a leg finished is the positive signal — a harness that only counts stalls cannot tell
         "the roads work" from "every wagon died in the first hour" */
      for (const c of wagons()) {
        if (destOf.get(c.id) !== c.caravan.dest) {
          arrivals.set(c.id, (arrivals.get(c.id) || 0) + 1);
          destOf.set(c.id, c.caravan.dest);
        }
      }
      if (++ticks % SAMPLE) continue;
      for (const c of wagons()) {
        const s = seen.get(c.id);
        if (!s) { seen.set(c.id, { x: c.x, y: c.y, stall: 0, worst: 0, atWall: 0 }); arrivals.set(c.id, 0); destOf.set(c.id, c.caravan.dest); continue; }
        const moved = dist(c.x, c.y, s.x, s.y);
        /* the three legitimate reasons a wagon is standing still, all excluded */
        const idle = isNight() || c.caravan.waitT > 0 || c.target || c.fleeT > 0;
        if (moved < 1 && !idle) {
          s.stall++;
          s.worst = Math.max(s.worst, s.stall);
          const w = wallGap(c);
          if (w.gap < 3) s.atWall++;
        } else s.stall = 0;
        s.x = c.x; s.y = c.y;
      }
    }
    paused = true;

    const rows = [...seen.entries()].map(([id, s]) => ({ id, worst: s.worst, atWall: s.atWall, legs: arrivals.get(id) || 0 }));
    const alive = wagons().length;
    const stalled = rows.filter(r => r.worst >= 3);      /* three minutes without a tile */
    const atWall = stalled.filter(r => r.atWall > 0);
    const totalLegs = rows.reduce((n, r) => n + r.legs, 0);

    R.theRoadsAreWalked = totalLegs > 0
      ? `${totalLegs} legs finished across ${rows.length} wagons in nine game-days (${alive} still alive)`
      : `!! NOT ONE CARAVAN COMPLETED A SINGLE LEG IN NINE GAME-DAYS (${alive} alive)`;
    /* REPORTED, NOT ASSERTED — the host.js rule. "How many wagons delivered in nine days" is a
       function of route length, night sheltering and how many were eaten on the way, none of
       which this file is about, and an early draft failed the suite on 7/15 when not one of
       those seven had stood still for a single minute. They were walking the whole time; the
       legs are just long. The stall checks below are the actual test. */
    const idle = rows.filter(r => r.legs === 0).length;
    R.WATCH_delivery = `${rows.length - idle}/${rows.length} wagons delivered at least once in nine days; ${rows.length - alive} were lost on the road`;
    R.nobodyStandsStill = stalled.length === 0
      ? 'no wagon stood still for three minutes of daylight with somewhere to be'
      : `!! ${stalled.length}/${rows.length} WAGONS STALLED (worst run ${Math.max(...stalled.map(r => r.worst))} minutes)`;
    R.nobodyIsPinnedToAWall = atWall.length === 0
      ? 'and none of them spent that time with its nose against a rampart'
      : `!! ${atWall.length} WAGONS STALLED WITHIN 3 TILES OF A TOWN WALL — CAUGHT ON THE RING`;

    return R;
  });

  console.log('=== THE ROADS ===\n');
  for (const [k, v] of Object.entries(out)) console.log('  ' + k.padEnd(24) + v);
  const bad = Object.values(out).map(String).filter(v => v.startsWith('!!'));
  console.log('\n' + (bad.length ? '*** ' + bad.join('\n*** ') : 'THE FREIGHT MOVES AND NOTHING IS STUCK ON A WALL'));
  if (errs.length) { console.log('errs:', errs.length); errs.slice(0, 4).forEach(e => console.log('  ' + e)); }
  await b.close();
  if (bad.length) process.exitCode = 1;
})();
