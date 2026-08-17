#!/usr/bin/env node
/* CAN ANYBODY ACTUALLY GET INTO A CAVE?
 *
 * "The multi-layer system in caves seems not to work at all. I can't seem to go into the
 * first underlayer." The generator is not the suspect — the earlier pass counted 7 caves,
 * 26 down-stairs and 9 rooms on the first four levels, so the warrens exist. This drives the
 * descent itself, from the tile the player would right-click all the way to standing on the
 * floor below, and reports which link in that chain is broken.
 *
 *   node tools/descend.js [game.html]
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
    paused = true;

    R.cavesExist = caves.length ? `${caves.length} caves, depths ${caves.map(c => c.depth).join(',')}` : '!! NO CAVES IN THE WORLD';
    const mouths = stairs.filter(s => s.from === 0 && s.to === -1);
    R.mouthsExist = mouths.length ? `${mouths.length} cave mouths registered as stairs` : '!! NO CAVE MOUTH IS A STAIR';
    if (!caves.length || !mouths.length) return R;

    /* ---------- 1. IS THE MOUTH TILE SOMETHING A BODY CAN STAND ON? ----------
       `orderFloor` walks the body to `{sx + 0.5, sy + 0.5}` and `useStairs` only fires for a
       body actually standing there. A mouth on a blocked tile is a door with a wall in it. */
    const badMouth = mouths.filter(s => isBlocked(s.x + 0.5, s.y + 0.5, 0));
    R.mouthsAreStandable = badMouth.length === 0
      ? 'every cave mouth is on open ground on the surface'
      : `!! ${badMouth.length}/${mouths.length} CAVE MOUTHS ARE ON BLOCKED TILES — NOBODY CAN STAND ON THEM`;

    /* and the landing on the other side, which is the half a body arrives at */
    const badLanding = mouths.filter(s => isBlocked(s.x + 0.5, s.y + 0.5, -1));
    R.landingsAreStandable = badLanding.length === 0
      ? 'and every one of them lands on carved floor below'
      : `!! ${badLanding.length}/${mouths.length} MOUTHS DROP INTO SOLID ROCK`;

    /* ---------- 2. EVERY DEEPER STAIR, BOTH SIDES ----------
       The generator decks a down-stair's tile but a chamber's `wall()` may already have put
       that tile in `blocked`, and `deck` does not clear it. A stair inside a wall is a stair
       nobody reaches. */
    const deeper = stairs.filter(s => s.to < 0 && s.from < 0);
    const stuck = deeper.filter(s => isBlocked(s.x + 0.5, s.y + 0.5, s.from) || isBlocked(s.x + 0.5, s.y + 0.5, s.to));
    R.deepStairsAreReachable = stuck.length === 0
      ? `all ${deeper.length} deeper stairs stand on open floor on both sides`
      : `!! ${stuck.length}/${deeper.length} DEEPER STAIRS ARE EMBEDDED IN ROCK`;

    /* ---------- 3. DRIVE A REAL DESCENT ----------
       Not `c.floor = -1`. The whole question is whether the ORDER works, so this goes through
       the same `orderFloor` the right-click handler calls and then runs the sim. */
    const st = mouths[0];
    const cave = caves.find(c => c.mouth && c.mouth.x === st.x && c.mouth.y === st.y) || caves[0];
    const spot = findOpenNear(st.x + 3, st.y + 3, 6);
    const c = makeChar('Spelunker', 'player', spot.x, spot.y, { atk: 20, def: 20, tough: 30, ath: 20 });
    c.__probe = true;
    chars.push(c);
    R.walker = `${c.name} starts at ${c.x.toFixed(1)},${c.y.toFixed(1)}, floor ${c.floor || 0}; mouth at ${st.x},${st.y}`;

    /* the exact call the right-click handler makes for a stair */
    const want = (c.floor || 0) === st.from ? st.to : st.from;
    orderFloor(c, want, st.x, st.y);
    R.theOrderIsAccepted = c.wantFloor === -1
      ? `the order sets wantFloor -1 and a move to ${c.moveTarget.x},${c.moveTarget.y}`
      : `!! THE ORDER DID NOT TAKE (wantFloor ${c.wantFloor})`;

    paused = false;
    let reached = -1, arrivedAt = null;
    for (let t = 0; t < 4000; t++) {
      update(0.1);
      if (!arrivedAt && dist(c.x, c.y, st.x + 0.5, st.y + 0.5) < 0.6) arrivedAt = t;
      if ((c.floor || 0) === -1) { reached = t; break; }
      if (c.state !== 'ok') break;
    }
    paused = true;

    R.itWalksToTheMouth = arrivedAt !== null
      ? `it reaches the mouth tile after ${(arrivedAt / 10).toFixed(1)}s`
      : `!! IT NEVER REACHES THE MOUTH — stopped ${dist(c.x, c.y, st.x + 0.5, st.y + 0.5).toFixed(1)} tiles short at ${c.x.toFixed(1)},${c.y.toFixed(1)}`;
    R.itGoesUnderground = reached >= 0
      ? `and drops to floor -1 after ${(reached / 10).toFixed(1)}s`
      : `!! IT NEVER CHANGES FLOOR (floor ${c.floor || 0}, wantFloor ${c.wantFloor}, onStair ${c.onStair}, state ${c.state})`;

    /* ---------- 4. AND THE PLAYER CAN SEE WHERE IT WENT ----------
       Descending with the camera still showing the surface is indistinguishable from not
       descending at all, which is exactly what the report describes. */
    if (reached >= 0) {
      /* `activeFloor` is assigned inside `render()` and nowhere else, so a paused probe that
         only calls `update()` will always read 0 — the first version of this check reported a
         camera bug that does not exist. Drive the real frame. */
      selected = [c];
      const before = activeFloor;
      render();
      R.theViewFollowsItDown = activeFloor === -1
        ? 'and the view follows it underground'
        : `!! THE VIEW STAYS ON THE SURFACE (activeFloor ${before} -> ${activeFloor}) — DESCENDING LOOKS IDENTICAL TO FAILING`;
      /* it must also be able to get back OUT */
      orderFloor(c, 0, st.x, st.y);
      paused = false;
      let up = -1;
      for (let t = 0; t < 3000; t++) { update(0.1); if ((c.floor || 0) === 0) { up = t; break; } }
      paused = true;
      R.itCanClimbOut = up >= 0
        ? `and it can climb back out (${(up / 10).toFixed(1)}s)`
        : `!! IT CANNOT GET BACK OUT (floor ${c.floor}, wantFloor ${c.wantFloor})`;
    }

    /* ---------- 5. AND THE FLOORS BELOW CONNECT TO EACH OTHER ----------
       Reported per cave rather than in aggregate: one warren with an orphaned level is a
       whole dungeon nobody can finish, and an aggregate count hides it. */
    const orphan = [];
    for (const cv of caves) {
      for (let f = -1; f > -cv.depth; f--) {
        /* SCOPED TO THIS CAVE. A bare `stairs.some(from === f)` is satisfied by any warren in
           the world at the same depth, so seven caves cover for each other and an orphaned
           level reads as connected. Caves are tens of tiles apart; proximity to the mouth is
           the only link the stair record carries. */
        const link = stairs.some(s => ((s.from === f && s.to === f - 1) || (s.from === f - 1 && s.to === f))
                                   && dist(s.x, s.y, cv.x, cv.y) < 30);
        if (!link) orphan.push(`cave ${cv.id} floor ${f}`);
      }
    }
    R.everyFloorHasAWayDown = orphan.length === 0
      ? `every floor of every cave has a stair to the next (${caves.reduce((n, c2) => n + c2.depth, 0)} levels total)`
      : `!! NO WAY DOWN FROM: ${orphan.slice(0, 6).join(', ')}`;

    for (let i = chars.length - 1; i >= 0; i--) if (chars[i].__probe) chars.splice(i, 1);
    return R;
  });

  console.log('=== THE WAY DOWN ===\n');
  for (const [k, v] of Object.entries(out)) console.log('  ' + k.padEnd(26) + v);
  const bad = Object.values(out).map(String).filter(v => v.startsWith('!!'));
  console.log('\n' + (bad.length ? '*** ' + bad.join('\n*** ') : 'THE CAVES CAN BE ENTERED, DESCENDED AND LEFT'));
  if (errs.length) { console.log('errs:', errs.length); errs.slice(0, 4).forEach(e => console.log('  ' + e)); }
  await b.close();
  if (bad.length) process.exitCode = 1;
})();
