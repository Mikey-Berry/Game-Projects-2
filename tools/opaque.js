#!/usr/bin/env node
/* IS THE BUILDING SOLID WHEN NOBODY IS IN IT?
 *
 * "Visuals for redoubts and multi-story buildings — right now they are see-through even if
 * none of my squad are inside."
 *
 * The Bastion's citadel has always had this right and says so in its own comment: "stand
 * outside and it is a black tower. Step through the door and it opens like a diagram." Three
 * other places wanted the same behaviour and asked a weaker question:
 *
 *   · a REDOUBT asked whether any of your people were on that FLOOR NUMBER anywhere in the
 *     world, so one hand standing on your camp's rampart opened every redoubt on the map;
 *   · TOWN RAMPARTS and your own WATCHTOWER asked only whether the camera was on the ground,
 *     which it nearly always is — so every wall in every town was glass by default.
 *
 * Read off the BUILT MESH, not off the flags: a rule that changes an expression and never
 * reaches a material would pass a flag test and change nothing on screen. And the sync groups
 * are CACHED against a key, so a fix that does not also reach the key is a building that
 * stays open behind you — which this file checks by walking in and looking again.
 *
 *   node tools/opaque.js [game.html]
 */
const { chromium } = require('playwright');
const path = require('path');
const gamePath = (a) => path.resolve(a ? (path.isAbsolute(a) ? a : path.join(__dirname, a)) : path.join(__dirname, 'game.html'));

(async () => {
  const b = await chromium.launch({
    executablePath: process.env.DUSTWARD_CHROME || undefined,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'],
  });
  const p = await b.newPage({ viewport: { width: 900, height: 640 } });
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message.slice(0, 200)));
  await p.goto('file://' + gamePath(process.argv[2]), { waitUntil: 'load' });
  await p.waitForTimeout(3000);
  await p.evaluate(() => { document.getElementById('btn-start').click(); paused = true; });
  await p.waitForTimeout(3000);

  const out = await p.evaluate(async () => {
    const R = {};
    paused = true;

    /* ---------- COUNT SEE-THROUGH PARTS BY DIFFERENCE, ACROSS THE WHOLE SCENE ----------
       Taking the count with the thing in the world and again with it lifted out isolates
       exactly what that thing drew, whichever group drew it — so this needs no hook into the
       renderer and works identically on a build that predates the change. */
    const glassIn = (root) => {
      let glass = 0, solid = 0;
      root && root.traverse(o => {
        if (!o.material) return;
        const ms = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of ms) {
          if (m.opacity !== undefined && m.transparent && m.opacity < 0.95) glass++;
          else solid++;
        }
      });
      return { glass, solid };
    };
    const frame = async () => { paused = false; await new Promise(r => setTimeout(r, 450)); paused = true; };

    /* ---------- THE REDOUBT'S OWN CONTRIBUTION, BY DIFFERENCE ----------
       `syncRedoubts` also draws middens and cave mouths, some of which are legitimately
       see-through, so counting the group is not counting the building. Take the count with
       the redoubts in the world and again with them lifted out of it: the difference is
       exactly what the redoubts themselves drew, and nothing else. */
    const rd = redoubts.find(r => r.deep);
    if (!rd) { R.redoubt = '!! NO DEEP REDOUBT IN THIS WORLD'; return R; }
    /* BOUNDS WORKED OUT HERE, off the redoubt's own wall tiles, rather than calling the
       game's helper — the helper is part of the change under test and does not exist on the
       build before it, and reaching for it takes the whole evaluate down instead of reporting
       a red line. Same reason the counting below traverses the scene rather than the sync
       group: `makeDynGroup` does not expose its group on the old build either. */
    let _x0 = 1e9, _y0 = 1e9, _x1 = -1e9, _y1 = -1e9;
    for (const w of rd.walls || []) { _x0 = Math.min(_x0, w.x); _y0 = Math.min(_y0, w.y); _x1 = Math.max(_x1, w.x); _y1 = Math.max(_y1, w.y); }
    const bb = { _bx: _x0, _by: _y0, _bX: _x1, _bY: _y1 };
    R.redoubt = `deep redoubt spanning ${bb._bx},${bb._by} to ${bb._bX},${bb._bY}`;

    const rdGlass = async () => {
      await frame();
      const withThem = glassIn(scene).glass;
      const save = redoubts.splice(0, redoubts.length);
      await frame();
      const without = glassIn(scene).glass;
      for (const r of save) redoubts.push(r);
      await frame();
      return withThem - without;
    };

    /* SOMEBODY OF YOURS ON FLOOR 1, NINETY TILES AWAY — the exact case in the report. The old
       rule asked whether any of your people were on that FLOOR NUMBER anywhere in the world. */
    const away = makeChar('Probe Rampart', 'player', bb._bx - 90, bb._by - 90, { atk: 4, def: 4, tough: 8 });
    away.__probe = true; away.floor = 1; chars.push(away); rebuildCharGrid();
    selected = [away];
    camX = camSX = bb._bx + 4; camY = camSY = bb._by + 4; camFollow = false;
    const outside = await rdGlass();
    R.outsideCount = `with a hand of yours on floor 1 ninety tiles away, the redoubts draw ${outside} see-through parts`;
    R.aRedoubtIsSolidFromOutside = outside === 0
      ? 'a redoubt nobody of yours is inside is a solid building, roof and all'
      : `!! AN EMPTY REDOUBT DRAWS ${outside} SEE-THROUGH PARTS`;

    /* ---------- AND OPENS WHEN YOU WALK IN ----------
       The half a cached sync group fails: if the key does not know you moved, the building
       stays shut behind you and the fix reads as a regression. */
    away.x = (bb._bx + bb._bX) / 2; away.y = (bb._by + bb._bY) / 2; away.floor = 1;
    rebuildCharGrid();
    const inside = await rdGlass();
    R.insideCount = `standing on its first floor: ${inside} see-through parts`;
    R.andOpensWhenYouAreInIt = inside > 0
      ? `and it opens like a diagram once you are standing in it — ${inside} parts turn to glass`
      : '!! IT STAYS SHUT WITH YOUR OWN SQUAD INSIDE IT — the sync key does not know you moved';
    for (let i2 = chars.length - 1; i2 >= 0; i2--) if (chars[i2].__probe) chars.splice(i2, 1);
    selected = [];

    /* ---------- AND A WATCHTOWER YOU BUILT HAS A FLOOR IN IT ----------
       Same report, different group. `activeFloor < 1` is true whenever the camera is not up
       the tower, so every watchtower ever built had a glass deck from the moment it went up. */
    {
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
      const bt = BUILD_TYPES.tower;
      const twr = { type: 'tower', x: gx, y: gy, w: bt.w, h: bt.h, floor: 0, hp: 200, maxHp: 200, growth: 0, __probe: true };
      pBuilds.push(twr);
      const twrGlass = async () => {
        await frame();
        const withIt = glassIn(scene).glass;
        const i3 = pBuilds.indexOf(twr); pBuilds.splice(i3, 1);
        await frame();
        const without = glassIn(scene).glass;
        pBuilds.push(twr);
        await frame();
        return withIt - without;
      };
      camX = camSX = gx; camY = camSY = gy;
      /* ---------- SELECT SOMEBODY ON THE GROUND, WELL CLEAR OF IT ----------
         NOT `selected = []`. `activeFloor` follows the selection and HOLDS when there is
         none, so an empty selection left it at 1 from the redoubt section above — which
         happens to satisfy the old `activeFloor < 1` rule, and this case passed on the broken
         build for a reason that had nothing to do with towers. The honest staging for "nobody
         is under it" is a hand of yours standing on the ground somewhere else. */
      const bystander = makeChar('Probe Bystander', 'player', gx + 9, gy + 9, { atk: 4, def: 4, tough: 8 });
      bystander.__probe = true; bystander.floor = 0; chars.push(bystander); rebuildCharGrid();
      selected = [bystander];
      const empty = await twrGlass();
      R.towerEmpty = `an empty watchtower draws ${empty} see-through parts`;
      R.anEmptyTowerHasBoards = empty === 0
        ? 'and a watchtower with nobody under it has a floor in it, not a sheet of glass'
        : `!! AN EMPTY WATCHTOWER DRAWS ${empty} SEE-THROUGH PARTS`;
      const under = makeChar('Probe Lookout', 'player', gx + 1.5, gy + 1.5, { atk: 4, def: 4, tough: 8 });
      under.__probe = true; under.floor = 0; chars.push(under); rebuildCharGrid();
      selected = [under];
      const stood = await twrGlass();
      R.towerUnder = `with one of yours standing under it: ${stood} see-through parts`;
      R.andTurnsToGlassWhenYouAreUnderIt = stood > 0
        ? 'and turns to glass the moment one of yours is standing under it, so you can see them'
        : '!! THE DECK STAYS SOLID OVER YOUR OWN HEAD — the sync key does not know you walked in';
      for (let i2 = pBuilds.length - 1; i2 >= 0; i2--) if (pBuilds[i2].__probe) pBuilds.splice(i2, 1);
      for (let i2 = chars.length - 1; i2 >= 0; i2--) if (chars[i2].__probe) chars.splice(i2, 1);
      selected = [];
    }

    return R;
  });

  const bad = Object.values(out).filter(v => typeof v === 'string' && v.startsWith('!!'));
  for (const [k, v] of Object.entries(out)) console.log('  ' + k.padEnd(34) + v);
  for (const e of errs) console.log('  ' + e);
  console.log('');
  console.log(bad.length || errs.length
    ? `THE WALLS ARE STILL GLASS (${bad.length + errs.length})`
    : 'SOLID FROM OUTSIDE, OPEN FROM WITHIN');
  await b.close();
  process.exit(bad.length || errs.length ? 1 : 0);
})();
