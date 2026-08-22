#!/usr/bin/env node
/* CAN YOU PLAY A CAVE?
 *
 * "While it is now possible to go explore caves under mountains, the camera does not follow.
 * And it becomes impossible to select anyone underneath the mountain as the geometry appears
 * to block clicking on them/dragging a box over them. So cave segments are still effectively
 * unplayable."
 *
 * Three claims, and the ledger was right that they might not have one cause. They do not:
 *
 *   · the camera anchor asked `(floor||0) > 0` — a yes/no about being UPSTAIRS, written when
 *     the only storey that was not the ground was a rampart. Caves are NEGATIVE floors, so a
 *     squad three storeys down scored zero;
 *   · the click resolved through `screenToWorld`, which marches the TERRAIN and stops at the
 *     first solid thing — which for a body under a mountain is the mountain. Nothing was
 *     blocking anything; the click was landing on the hillside, correctly;
 *   · and the drag box projected every body at `groundY + 0.9`, putting a cave squad on the
 *     surface for the purposes of the rectangle. That one hides a squad on a rampart too.
 *
 * `descend.js` already proves the STOREY follows — `activeFloor` after a real render — which
 * is a different claim from any of these three, and is why the suite was green throughout.
 *
 *   node tools/cave.js [game.html]
 */
const { chromium } = require('playwright');
const path = require('path');
const gamePath = (a) => path.resolve(a ? (path.isAbsolute(a) ? a : path.join(__dirname, a)) : path.join(__dirname, 'game.html'));

(async () => {
  const b = await chromium.launch({
    executablePath: process.env.DUSTWARD_CHROME || undefined,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'],
  });
  const p = await b.newPage({ viewport: { width: 1000, height: 720 } });
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message.slice(0, 200)));
  await p.goto('file://' + gamePath(process.argv[2]), { waitUntil: 'load' });
  await p.waitForTimeout(3000);
  await p.evaluate(() => { document.getElementById('btn-start').click(); paused = true; });
  await p.waitForTimeout(3000);

  const out = await p.evaluate(async () => {
    const R = {};
    paused = true;

    /* a real warren, dug by worldgen, not a staged hole */
    const cave = caves[0];
    if (!cave) { R.cave = '!! NO CAVES IN THIS WORLD'; return R; }
    /* the deepest floor that has a tile you can stand on */
    /* `bkey` PACKS INTO A NUMBER, it is not a comma string: (f + 4) * FLOOR_SPAN + y * W + x.
       Splitting it on commas gives one field and a floor of `undefined`, which is how the
       first run of this file reported "no deep floor tile" about a warren three storeys deep. */
    const unkey = (k) => {
      const f = Math.floor(k / FLOOR_SPAN) - 4;
      const rem = k - (f + 4) * FLOOR_SPAN;
      const y = Math.floor(rem / W);
      return { x: rem - y * W, y, f };
    };
    let deep = 0, spot = null;
    for (const k of decks) { const q = unkey(k); if (q.f < deep && dist(q.x, q.y, cave.x, cave.y) < 60) deep = q.f; }
    for (const k of decks) {
      const q = unkey(k);
      if (q.f !== deep) continue;
      if (dist(q.x, q.y, cave.x, cave.y) > 60) continue;
      spot = { x: q.x + 0.5, y: q.y + 0.5, f: deep }; break;
    }
    if (!spot) { R.cave = '!! NO DEEP FLOOR TILE FOUND NEAR THE CAVE MOUTH'; return R; }
    R.cave = `cave ${cave.id} at ${cave.x},${cave.y}, ${cave.depth} floors down; staging on storey ${spot.f} at ${spot.x},${spot.y}`;

    const hand = makeChar('Probe Spelunker', 'player', spot.x, spot.y, { atk: 5, def: 5, tough: 10, ath: 5 });
    hand.__probe = true; hand.floor = spot.f; chars.push(hand); rebuildCharGrid();
    /* A SECOND HAND, so the selection is never EMPTY while the click cases run. `activeFloor`
       follows the selection, and an empty selection used to snap the view to the ground —
       which meant a probe that cleared `selected` before clicking was measuring the surface.
       It is also what play looks like: you have somebody selected and you click somebody
       else. */
    const mate = makeChar('Probe Mate', 'player', spot.x + 4, spot.y, { atk: 5, def: 5, tough: 10, ath: 5 });
    mate.__probe = true; mate.floor = spot.f; chars.push(mate); rebuildCharGrid();
    selected = [hand];
    camX = camSX = spot.x; camY = camSY = spot.y; camFollow = false;
    camDist = camDistTarget = 18; camPitch = camPitchT = 0.95; camYaw = camYawT = 0;

    /* ---------- LET THE EYE ARRIVE, NOT MERELY SET OFF ----------
       `activeFloor`, the camera anchor and the glass are all decided inside `render`, so
       nothing below means anything until frames have run. But the anchor LERPS, and thirteen
       tiles is a long way: at 700ms it was still in transit at -7.86 of a -13.60 journey. Every
       screen coordinate below is projected through that camera, so a click aimed with `w2s`
       and then measured a moment later was aimed through one camera and checked against
       another — the answers disagreed by a tile and a half and the file reported a picking
       failure that was really its own impatience. Wait for it to land. */
    paused = false; await new Promise(r => setTimeout(r, 4000)); paused = true;

    R.storey = `activeFloor ${activeFloor}, camera anchor camFY ${camFY.toFixed(2)}, a storey is ${FLOOR_H}`;
    R.theStoreyFollows = activeFloor === spot.f
      ? `the view is on storey ${activeFloor}, where the squad is`
      : `!! THE VIEW IS ON STOREY ${activeFloor} AND THE SQUAD IS ON ${spot.f}`;
    /* ---------- THE CAMERA GOES DOWN WITH THEM ----------
       `camFY` is the anchor's height offset and it lerps, so this asks whether it has gone
       DOWNWARD at all rather than whether it has arrived. */
    R.theCameraFollowsThemDown = camFY < -0.5
      ? `and the eye has gone down with them — anchor ${camFY.toFixed(2)}, heading for ${floorY(spot.f)}`
      : `!! THE CAMERA STAYED AT THE SURFACE (anchor ${camFY.toFixed(2)}, squad on storey ${spot.f})`;

    /* ---------- A CLICK WHERE THEY ARE DRAWN PICKS THEM ----------
       Aimed at the body's own screen position — `w2s` with `charY`, which is where the
       renderer puts it — because that is where a player's cursor goes. */
    {
      selected = [mate];
      const q = w2s(hand.x, hand.y, charY(hand) + 0.9);
      R.aim = q ? `the spelunker draws at ${Math.round(q.x)},${Math.round(q.y)}` : '!! THE SPELUNKER IS NOT ON SCREEN';
      if (q) {
        const cv = document.getElementById('game');
        cv.dispatchEvent(new MouseEvent('mousedown', { clientX: q.x, clientY: q.y, button: 0, buttons: 1, bubbles: true, cancelable: true }));
        window.dispatchEvent(new MouseEvent('mouseup', { clientX: q.x, clientY: q.y, button: 0, bubbles: true, cancelable: true }));
      }
      R.aClickPicksThemUp = selected.includes(hand)
        ? 'clicking where they are drawn selects them, three storeys under a mountain'
        : `!! A CLICK ON THEM SELECTED ${selected.length ? selected.map(c => c.name).join(', ') : 'NOTHING'}`;
    }

    /* ---------- AND SO DOES A BOX ROUND THEM ---------- */
    {
      selected = [mate];
      const q = w2s(hand.x, hand.y, charY(hand) + 0.9);
      const cv = document.getElementById('game');
      cv.dispatchEvent(new MouseEvent('mousedown', { clientX: q.x - 60, clientY: q.y - 60, button: 0, buttons: 1, bubbles: true, cancelable: true }));
      /* ON THE CANVAS, NOT ON THE WINDOW. `mousedown` and `mousemove` are bound to `cv`;
         only `mouseup` is bound to the window. A mousemove dispatched at the window never
         reaches the handler that builds `dragRect`, so the drag stayed a click and this case
         reported a selection failure about code that was working. */
      cv.dispatchEvent(new MouseEvent('mousemove', { clientX: q.x + 60, clientY: q.y + 60, buttons: 1, bubbles: true, cancelable: true }));
      window.dispatchEvent(new MouseEvent('mouseup', { clientX: q.x + 60, clientY: q.y + 60, button: 0, bubbles: true, cancelable: true }));
      R.aBoxRoundThemGrabsThem = selected.includes(hand)
        ? 'and a drag-box round them grabs them'
        : `!! A BOX ROUND THEM GRABBED ${selected.length ? selected.map(c => c.name).join(', ') : 'NOTHING'}`;
    }

    /* ---------- AND A MOVE ORDER LANDS ON THEIR OWN STOREY ----------
       Not on the hillside three storeys above them, which is where the terrain march puts it. */
    {
      selected = [hand];
      let dest = null;
      for (const k of decks) {
        const q2 = unkey(k);
        if (q2.f !== spot.f) continue;
        const d = dist(q2.x + 0.5, q2.y + 0.5, hand.x, hand.y);
        if (d > 3 && d < 9) { dest = { x: q2.x + 0.5, y: q2.y + 0.5 }; break; }
      }
      if (!dest) R.aMoveOrderStaysUnderground = '(no second tile on this storey within reach to aim at)';
      else {
        const q = w2s(dest.x, dest.y, groundY(dest.x, dest.y) + floorY(spot.f));
        hand.moveTarget = null; hand.path = null; hand.wantFloor = null;
        document.getElementById('game').dispatchEvent(new MouseEvent('mousedown', {
          clientX: q.x, clientY: q.y, button: 2, buttons: 2, bubbles: true, cancelable: true }));
        const t = hand.moveTarget;
        R.order = t ? `ordered to ${t.x.toFixed(1)},${t.y.toFixed(1)} (aimed at ${dest.x.toFixed(1)},${dest.y.toFixed(1)})` : 'no order taken';
        /* 4 TILES WAS NOT AN ASSERTION. The old build sent the order 3.6 tiles wide — it had
           resolved through the terrain march onto the mountainside and `routeTo` salvaged
           something nearby — and a tolerance of four called that a pass. The fixed build lands
           inside one. */
        R.aMoveOrderStaysUnderground = (t && dist(t.x, t.y, dest.x, dest.y) < 2)
          ? 'and a move order aimed at the floor they are standing on lands on it, not on the mountainside above'
          : `!! A MOVE ORDER AIMED UNDERGROUND WENT TO ${t ? t.x.toFixed(0) + ',' + t.y.toFixed(0) : 'NOWHERE'} INSTEAD OF ${dest.x.toFixed(0)},${dest.y.toFixed(0)}`;
      }
    }

    /* ---------- AND NONE OF IT BREAKS THE SURFACE ----------
       The control. Every fix here widens what a click can mean, and a click on open ground
       with a surface squad selected has to go on meaning exactly what it meant. */
    {
      for (let i = chars.length - 1; i >= 0; i--) if (chars[i].__probe) chars.splice(i, 1);
      let gx = 0, gy = 0;
      outer:
      for (let y = 60; y < H - 60; y += 5) for (let x = 60; x < W - 60; x += 5) {
        if (isBlocked(x + 0.5, y + 0.5)) continue;
        if (towns.some(t => dist(t.x, t.y, x, y) < 70)) continue;
        let ok = true;
        for (let j = -6; j <= 6 && ok; j++) for (let i2 = -6; i2 <= 6 && ok; i2++)
          if (isBlocked(x + i2 + 0.5, y + j + 0.5)) ok = false;
        if (ok) { gx = x; gy = y; break outer; }
      }
      const surf = makeChar('Probe Walker', 'player', gx, gy, { atk: 5, def: 5, tough: 10, ath: 5 });
      surf.__probe = true; surf.floor = 0; chars.push(surf); rebuildCharGrid();
      selected = [surf];
      camX = camSX = gx; camY = camSY = gy;
      /* the anchor LERPS, and it is coming back from thirteen tiles underground — long
         enough to arrive, or this measures the journey rather than the destination */
      paused = false; await new Promise(r => setTimeout(r, 4000)); paused = true;
      selected = [];
      const q = w2s(surf.x, surf.y, charY(surf) + 0.9);
      const cv = document.getElementById('game');
      cv.dispatchEvent(new MouseEvent('mousedown', { clientX: q.x, clientY: q.y, button: 0, buttons: 1, bubbles: true, cancelable: true }));
      window.dispatchEvent(new MouseEvent('mouseup', { clientX: q.x, clientY: q.y, button: 0, bubbles: true, cancelable: true }));
      R.surface = `on open ground: activeFloor ${activeFloor}, camFY ${camFY.toFixed(2)}`;
      R.andTheSurfaceStillWorks = (selected.includes(surf) && Math.abs(camFY) < 0.9)
        ? 'and on open ground a click still picks them up with the eye at ground level — nothing about the surface changed'
        : `!! THE SURFACE BROKE (selected ${selected.length}, camFY ${camFY.toFixed(2)})`;
      for (let i = chars.length - 1; i >= 0; i--) if (chars[i].__probe) chars.splice(i, 1);
    }

    return R;
  });

  const bad = Object.values(out).filter(v => typeof v === 'string' && v.startsWith('!!'));
  for (const [k, v] of Object.entries(out)) console.log('  ' + k.padEnd(30) + v);
  for (const e of errs) console.log('  ' + e);
  console.log('');
  console.log(bad.length || errs.length
    ? `THE CAVES ARE STILL UNPLAYABLE (${bad.length + errs.length})`
    : 'YOU CAN PLAY A CAVE');
  await b.close();
  process.exit(bad.length || errs.length ? 1 : 0);
})();
