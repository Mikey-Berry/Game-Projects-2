#!/usr/bin/env node
/* NOTHING REACHES THROUGH A FLOOR TO TAKE A BODY OFF THE GROUND.
 *
 * `dist` is planar. It knows x and y and it has never heard of a storey. Every grid-backed
 * query in this file already knows that — `charsNear` is floor-blind by design, and its own
 * note says "every caller filters by floor itself", which nine places do with the same line:
 *
 *     if((o.floor || 0) !== (c.floor || 0)) continue;   // a floor is as good as a wall
 *
 * Five did not, and they are the five that ask "is there a body on the ground near me":
 *
 *     the Larder-Kin's snatch     4.5 tiles
 *     the slaver's grab           4
 *     the Maw's meal              2.5
 *     a bandit robbing the fallen 3
 *     the town guard's arrest     5
 *
 * They are the five that read the ROSTER rather than the grid, so they were never near the
 * note that says to filter. The effect is a body going down on the surface and being eaten,
 * enslaved, robbed or arrested by something standing directly above or below it in the
 * underworld — at a distance of zero, because x and y match exactly and nothing asked which
 * storey either of them was on.
 *
 * Each claim is a PAIR, and the pair is the point: the same predator, the same body, the same
 * tile, once on the floor below and once beside it. The "below" half is the bug; the "beside"
 * half is the control, because a fix that simply stops all five features working would pass
 * the first half of every one of these and be worse than the bug.
 *
 *   node tools/storeys.js [game.html]
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
  await p.waitForSelector('#btn-start', { state: 'attached', timeout: 60000 });
  await p.evaluate(() => { document.getElementById('btn-start').click(); paused = true; });
  await p.waitForTimeout(2600);

  const out = await p.evaluate(() => {
    const R = {};
    paused = true;
    const guard = (keys, fn) => {
      try { fn(); } catch (e) {
        for (const k of keys) if (R[k] === undefined) R[k] = '!! ' + String(e.message).slice(0, 130).toUpperCase();
      }
    };

    const home = player()[0];
    /* ---------- CLEAR OF EVERYBODY, NOT JUST OF THE TILE ----------
       `clear` is 14 and not 4 on purpose. The robbery is gated on `!c.target`, and a bandit
       picks a target with `nearestEnemy(c, 9)` — so a spot with nobody standing ON it but a
       townsman nine tiles away gives the bandit something to fight and it never reaches the
       robbery branch at all. That made the same-floor CONTROL fail while the cross-floor half
       passed, for a reason that has nothing to do with floors: underground there was nobody to
       target, on the surface there was. The staging has to be empty out past every targeting
       radius in play, or the pair is measuring ambient population instead of storeys. */
    /* ---------- AND AWAY FROM ANY TOWN, BECAUSE TOWNSFOLK WALK ----------
       A clearance is a snapshot and the trial runs four hundred ticks. Thirty tiles of empty
       ground still failed, because a townswoman called Verity strolled into the Maw's reach
       and it spent the whole control fighting her — the Maw is the only one of these five
       hostile to townsfolk, which is why it is the only pair that ever suffers this. So the
       spot has to be out in the waste, not merely empty at the moment it is chosen. */
    const open = (r0, clear, townGap) => {
      const far = (x, y) => !townGap || (typeof towns === 'undefined') ||
        towns.every(t => dist(t.x, t.y, x, y) > townGap);
      for (let r = r0; r < r0 + 200; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = Math.floor(home.x) + dx + 0.5, y = Math.floor(home.y) + dy + 0.5;
        if (x < 4 || y < 4 || x >= W - 4 || y >= H - 4) continue;
        if (!far(x, y)) continue;
        if (!isBlocked(x, y, 0) && !charsNear(x, y, clear || 14).length) return { x, y };
      }
      return null;
    };

    const probes = [];
    const mk = (name, fac, x, y, floor, extra) => {
      const c = makeChar(name, fac, x, y, { atk: 6, def: 5, tough: 30, race: 'human', sub: 'dustborn' });
      c.state = 'ok'; c.hunger = 100; c.floor = floor; c.__probe = true;
      Object.assign(c, extra || {});
      chars.push(c); probes.push(c); return c;
    };
    const wipe = () => {
      for (let i = chars.length - 1; i >= 0; i--) if (chars[i].__probe) chars.splice(i, 1);
      probes.length = 0;
      rebuildCharGrid();
    };

    /* One trial: put the victim down at a tile, the predator on `predFloor` at the SAME x,y,
       run the real `ai` for a few seconds, and report whether the predator took them.
       `rebuildCharGrid` every tick, because `ai` needs the grid and the short lists — see the
       note in `rebuildCharGrid` and what it cost tools/civics.js. */
    const trial = (spot, predFloor, victimFloor, makePred, took) => {
      wipe();
      const v = mk('Test Fallen', 'player', spot.x, spot.y, victimFloor);
      v.state = 'down'; v.downT = 40; v.blood = 40;
      const pred = makePred(spot, predFloor);
      rebuildCharGrid();
      let fought = null;
      for (let i = 0; i < 400; i++) {
        rebuildCharGrid();
        for (const c of chars) if (c.state !== 'dead') { ai(c, 0.05); physics(c, 0.05); }
        /* what it did INSTEAD, recorded as it happens — a target picked up and dropped again
           inside four hundred ticks is invisible to a check at the end */
        if (!fought && pred.target && pred.target !== v) fought = pred.target.name;
        if (took(pred, v)) break;
      }
      const got = took(pred, v);
      wipe();
      return { got, fought };
    };

    const pair = (label, makePred, took, note) => {
      guard([label], () => {
        /* ---------- AND THE STAGING HAS TO BE EMPTY, MEASURED RATHER THAN HOPED ----------
           The note at the top of this file already says a predator that finds something to
           FIGHT never reaches the branch under test, and fourteen tiles of clearance turned
           out not to be enough: the world moved, the spot landed eleven tiles from GREENREST,
           and the Maw locked onto a townsman named Quill Ruck and stood there for four hundred
           ticks. The harness then reported that taking a meal "no longer works at all", which
           is a true sentence about nothing.
           Two changes. The clearance goes to thirty, which is past every targeting radius in
           this file. And the trial REPORTS whether the predator picked a fight, so a distracted
           run says so instead of blaming the mechanic. */
        const spot = open(10, 30, 90) || open(10, 30, 50) || open(10, 22) || open(10);
        if (!spot) { R[label] = '!! NO OPEN GROUND'; return; }
        const through = trial(spot, -1, 0, makePred, took);
        const beside  = trial(spot,  0, 0, makePred, took);
        R[label] = (!through.got && beside.got)
          ? `${note} — not through a floor, still works beside them`
          : through.got
            ? `!! ${note.toUpperCase()} REACHES THROUGH A FLOOR (one storey down, same tile)`
            : beside.fought
              ? `!! NOTHING TO MEASURE — the ${note} predator spent the same-floor control fighting ${beside.fought} instead of eating`
              : `!! ${note.toUpperCase()} NO LONGER WORKS AT ALL — the same-floor control failed too`;
      });
    };

    /* ---------- 1. THE MAW ---------- */
    pair('theMawEatsOnlyItsOwnStorey',
      (spot, fl) => mk('Test Maw', 'cannibal', spot.x, spot.y, fl, { eater: true }),
      (pred) => !!pred.gnaw,
      'the Maw takes a meal on its own floor only');

    /* ---------- 2. THE LARDER-KIN ---------- */
    pair('theLarderReachesOnlyItsOwnStorey',
      (spot, fl) => mk('Test Larder', 'gaunt', spot.x, spot.y, fl, { gauntKind: 'larder' }),
      (pred) => !!pred.drag,
      'the Larder-Kin snatches on its own floor only');

    /* ---------- 3. THE SLAVER ---------- */
    pair('theSlaverGrabsOnlyItsOwnStorey',
      (spot, fl) => mk('Test Slaver', 'slaver', spot.x, spot.y, fl, {}),
      (pred) => !!pred.drag,
      'the slaver grabs on its own floor only');

    /* ---------- 4. THE ROBBERY ---------- */
    pair('theBanditRobsOnlyItsOwnStorey',
      (spot, fl) => mk('Test Bandit', 'bandit', spot.x, spot.y, fl, {}),
      (pred) => !!pred.robbed,
      'a bandit robs the fallen on its own floor only');

    /* ---------- 5. THE ARREST ----------
       Needs a town with a bounty and a free cell, so it is staged against a real town rather
       than on open ground: the guard belongs to a town and the cell has to exist. */
    guard(['theWatchArrestsOnlyOnItsOwnStorey'], () => {
      const t = towns.find(tt => !tt.def.undeadFriendly && !tt.playerRuled && tt.gaolPost) || towns[0];
      const cell = freeCell(t);
      if (!cell) { R.theWatchArrestsOnlyOnItsOwnStorey = '!! NO FREE CELL TO STAGE AN ARREST'; return; }
      const runArrest = (guardFloor) => {
        wipe();
        t.bounty = 300; t.wanted = true;
        const g = mk('Test Watch', 'town', cell.x + 3.5, cell.y, guardFloor,
                     { guard: { x: cell.x + 3.5, y: cell.y }, homeTown: t, civ: false });
        const v = mk('Test Fallen', 'player', g.x, g.y, 0);
        v.state = 'down'; v.downT = 400; v.blood = 40;
        rebuildCharGrid();
        for (let i = 0; i < 400; i++) {
          rebuildCharGrid();
          for (const c of chars) if (c.state !== 'dead') { ai(c, 0.05); physics(c, 0.05); }
          if (g.drag === v || v.jailedAt) break;
        }
        const got = g.drag === v || !!v.jailedAt;
        wipe();
        t.bounty = 0; t.wanted = false;
        return got;
      };
      const through = runArrest(-1);
      const beside  = runArrest(0);
      R.theWatchArrestsOnlyOnItsOwnStorey = (!through && beside)
        ? 'the watch arrests on its own floor only — not through a floor, still works beside them'
        : through
          ? '!! THE WATCH ARRESTS THROUGH A FLOOR (a guard one storey down seizes a body on the surface)'
          : '!! THE WATCH NO LONGER ARRESTS AT ALL — the same-floor control failed too';
    });

    /* ---------- 6. AND THE RULE THE REST OF THE FILE ALREADY KEEPS ----------
       A negative control on the premise: `nearestEnemy` is the grid-backed query these five
       sit beside, and it has always filtered by floor. If this ever goes red the convention
       itself has moved and the five above are no longer the exception. */
    guard(['andTheGridQueriesAlreadyDidThis'], () => {
      const spot = open(26, 14);
      wipe();
      const a = mk('Test Eyes', 'player', spot.x, spot.y, 0);
      const e = mk('Test Foe', 'bandit', spot.x, spot.y, -1);
      rebuildCharGrid();
      const below = nearestEnemy(a, 12);
      e.floor = 0; rebuildCharGrid();
      const beside = nearestEnemy(a, 12);
      const ok = (below !== e && beside === e);
      wipe();
      R.andTheGridQueriesAlreadyDidThis = ok
        ? '`nearestEnemy` already refuses a foe one storey down and takes the same one beside — the convention this fix joins'
        : `!! THE PREMISE HAS MOVED: nearestEnemy below=${below === e}, beside=${beside === e}`;
    });

    wipe();
    return R;
  });

  const bad = Object.values(out).filter(v => typeof v === 'string' && v.startsWith('!!'));
  for (const [k, v] of Object.entries(out)) console.log('  ' + k.padEnd(36) + v);
  for (const e of errs) console.log('  ' + e);
  console.log('');
  console.log(bad.length || errs.length
    ? `SOMETHING IS REACHING THROUGH A FLOOR (${bad.length + errs.length})`
    : 'A FLOOR IS AS GOOD AS A WALL');
  await b.close();
  process.exit(bad.length || errs.length ? 1 : 0);
})();
