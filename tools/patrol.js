#!/usr/bin/env node
/* WHAT A WATCH LOOKS LIKE WHEN IT IS WALKING ITS BEAT.
 *
 * "The patrol JOB (not the command) makes them move about a bit janky. Overall it works very
 * well, but everyone moves super twitchy and fast. There's no methodical calmness to it. (I do
 * appreciate it over the weird circle that it used to do, but this is a bit too chaotic for an
 * organized base. We need to find an ideal middle ground.)"
 *
 * A middle ground cannot be asserted with a flag, because both ends of it are "the job runs".
 * The old circle ran. The scatter ran. So this file measures the SHAPE OF THE WALK over four
 * real minutes of sim and holds it between two failures:
 *
 *   · too chaotic — a body that reverses its bearing every few seconds, and never stands
 *     still, which is what was reported;
 *   · too rigid — a body that holds one radius from the centre and orbits, which is what the
 *     report says the previous version did and explicitly does not want back.
 *
 * The pace is measured too, because "fast" was in the report and turned out to be the one
 * thing that was never true: `travel`'s last argument is an arrival radius, not a speed.
 *
 *   node tools/patrol.js [game.html]
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
  await p.evaluate(() => { document.getElementById('btn-start').click(); paused = true; });
  await p.waitForTimeout(3000);

  const out = await p.evaluate(() => {
    const R = {};
    paused = true;

    let gx = 0, gy = 0;
    outer:
    for (let y = 60; y < H - 60; y += 6) for (let x = 60; x < W - 60; x += 6) {
      if (isBlocked(x + 0.5, y + 0.5)) continue;
      if (towns.some(t => dist(t.x, t.y, x, y) < 80)) continue;
      let ok = true;
      for (let j = -22; j <= 22 && ok; j += 2) for (let i = -22; i <= 22 && ok; i += 2)
        if (isBlocked(x + i + 0.5, y + j + 0.5)) ok = false;
      if (ok) { gx = x; gy = y; break outer; }
    }
    R.ground = gx ? `staged on open waste at ${gx},${gy}` : '!! NO OPEN GROUND';

    /* A HOLDING TO WALK. `patrolCentreFor` takes the nearest cluster of your own buildings, so
       a few sheds in a ring is a camp as far as the job is concerned — and staging it rather
       than borrowing a town keeps the arc a known size. */
    const mine = [];
    for (const [dx, dy] of [[-8,-8],[8,-8],[-8,8],[8,8],[0,0]]) {
      const bl = { type: 'shack', x: gx + dx, y: gy + dy, w: 2, h: 2, floor: 0, hp: 90, maxHp: 90, progress: 1, __probe: true };
      pBuilds.push(bl); mine.push(bl);
    }
    const w = makeChar('Probe Watch', 'player', gx, gy, { atk: 5, def: 5, tough: 10, ath: 5 });
    w.__probe = true; chars.push(w); w.floor = 0; rebuildCharGrid();
    w.job = 'patrol'; w.job2 = null; clearOrders(w);
    const ctr = patrolCentreFor(w);
    R.holding = ctr ? `a holding ${ctr.r.toFixed(0)} tiles across at ${ctr.x.toFixed(0)},${ctr.y.toFixed(0)}` : '!! NO HOLDING';

    /* ---------- FOUR MINUTES OF WALKING, SAMPLED ---------- */
    const DT = 1 / 30, TICKS = 30 * 240;
    let still = 0, moved = 0, ground = 0;
    let turns = 0, lastAng = null;
    let rMin = 1e9, rMax = -1e9, outside = 0;
    const seen = new Set();
    let px = w.x, py = w.y;
    for (let i = 0; i < TICKS; i++) {
      w.state = 'ok';
      physics(w, DT);
      const step = dist(w.x, w.y, px, py);
      ground += step;
      if (step < 0.005) still++; else moved++;
      /* a REVERSAL, not a wobble: the bearing has to swing more than a right angle, sampled
         over a third of a second so ordinary path-following jitter does not register */
      if (i % 10 === 0) {
        if (step > 0.02) {
          const ang = Math.atan2(w.y - py, w.x - px);
          if (lastAng !== null) {
            let d = Math.abs(ang - lastAng);
            if (d > Math.PI) d = Math.PI * 2 - d;
            if (d > Math.PI / 2) turns++;
          }
          lastAng = ang;
        }
        const rr = dist(w.x, w.y, ctr.x, ctr.y);
        rMin = Math.min(rMin, rr); rMax = Math.max(rMax, rr);
        if (rr > ctr.r + 3) outside++;
        seen.add(Math.floor(w.x / 3) + ',' + Math.floor(w.y / 3));
      }
      px = w.x; py = w.y;
    }
    const mins = (TICKS * DT) / 60;
    const stillPct = still / TICKS;

    R.walk = `over ${mins.toFixed(0)} minutes it covered ${ground.toFixed(0)} tiles, stood still for ${(stillPct*100).toFixed(0)}% of it, ` +
             `reversed ${turns} times, and ranged ${rMin.toFixed(1)}-${rMax.toFixed(1)} tiles from the middle`;

    /* ---------- NOT TWITCHY ---------- */
    /* A BAND, NOT A FLOOR. Under the old code this was zero — the pause was written and never
       had any duration — so a floor alone would pass anything that stood still at all. The
       ceiling is the other failure: a watch that spends nine tenths of its shift motionless is
       not calm, it is furniture, and there is no assertion here that would have noticed. */
    R.itStandsAndLooks = (stillPct > 0.06 && stillPct < 0.80)
      ? `a watch stops and stands — ${(stillPct*100).toFixed(0)}% of its watch is spent not walking`
      : `!! ${stillPct <= 0.06 ? 'IT NEVER ONCE STANDS STILL' : 'IT BARELY MOVES AT ALL'} (${(stillPct*100).toFixed(1)}%)`;
    R.andItDoesNotChangeItsMind = turns <= mins * 2.5
      ? `and it reverses ${turns} times in ${mins.toFixed(0)} minutes — a beat, not a body pacing a cage`
      : `!! IT REVERSED ${turns} TIMES IN ${mins.toFixed(0)} MINUTES`;

    /* ---------- AND NOT THE OLD CIRCLE EITHER ----------
       The report is explicit that a fixed-radius orbit is worse than what it replaced, so the
       fix must not have quietly restored one. A real walk varies its distance from the middle
       and puts its feet in a lot of different places. */
    R.andItIsNotAnOrbit = (rMax - rMin) > ctr.r * 0.25
      ? `and it is not orbiting — its distance from the middle varies by ${(rMax-rMin).toFixed(1)} tiles across a ${ctr.r.toFixed(0)}-tile holding`
      : `!! IT IS WALKING A FIXED CIRCLE AGAIN (${rMin.toFixed(1)} to ${rMax.toFixed(1)})`;
    R.andItGetsAround = seen.size >= 8
      ? `and it put its feet in ${seen.size} different parts of the holding`
      : `!! IT ONLY EVER STOOD IN ${seen.size} PLACE(S)`;

    /* ---------- AND IT IS STILL A WATCH ---------- */
    R.andItStaysOnItsGround = outside === 0
      ? 'and it never once left the ground it was set to watch'
      : `!! IT WANDERED OFF ITS HOLDING ${outside} TIME(S)`;
    R.andThePaceIsAnOrdinaryWalk = (() => {
      const walkT = (moved / 30);
      const sp = ground / Math.max(0.001, walkT);
      const ref = moveSpeed(w);
      return Math.abs(sp - ref) < ref * 0.35
        ? `and while walking it makes ${sp.toFixed(2)} tiles a second against a plain walk of ${ref.toFixed(2)} — it was never moving fast`
        : `!! A PATROLLING BODY MOVES AT ${sp.toFixed(2)} AGAINST A PLAIN WALK OF ${ref.toFixed(2)}`;
    })();

    /* ---------- AND IT STILL DROPS EVERYTHING FOR TROUBLE ---------- */
    {
      const foe = makeChar('Probe Trouble', 'bandit', w.x + 5, w.y, { atk: 6, def: 4, tough: 10 });
      foe.__probe = true; chars.push(foe); foe.floor = 0; rebuildCharGrid();
      for (let i = 0; i < 30 && !w.target; i++) { w.state = 'ok'; physics(w, DT); }
      R.andTroubleStillEndsTheWalk = w.target === foe
        ? 'and a bandit five tiles off ends the walk at once — the calm is not deafness'
        : `!! A WATCH IGNORED A BANDIT FIVE TILES AWAY (target ${w.target ? w.target.name : 'none'})`;
    }

    for (let i = chars.length - 1; i >= 0; i--) if (chars[i].__probe) chars.splice(i, 1);
    for (let i = pBuilds.length - 1; i >= 0; i--) if (pBuilds[i].__probe) pBuilds.splice(i, 1);
    return R;
  });

  const bad = Object.values(out).filter(v => typeof v === 'string' && v.startsWith('!!'));
  for (const [k, v] of Object.entries(out)) console.log('  ' + k.padEnd(30) + v);
  for (const e of errs) console.log('  ' + e);
  console.log('');
  console.log(bad.length || errs.length
    ? `THE WATCH IS STILL PACING A CAGE (${bad.length + errs.length})`
    : 'A WATCH THAT WALKS ITS BEAT');
  await b.close();
  process.exit(bad.length || errs.length ? 1 : 0);
})();
