#!/usr/bin/env node
/* THE WARRENS HAVE FIRES IN THEM, AND THE FIRES STAY LIT.
 *
 *   "Bandits in the underground layer do not use torches at all and thus suffer a horrible
 *    penalty to their combat stats. Doesn't make sense for them not to use torches, like at
 *    least one per group. Or even to have their little bases equipped with built standing
 *    torches."
 *
 * The interesting part is that worldgen already guaranteed one torch per chamber, with a note
 * above it explaining exactly why — "a room of blind men is not a fight, it is a chore". The
 * guarantee was real and it was defeated by a clock somewhere else entirely: a torch holds
 * TORCH_HOURS and `torchTick` only ever relit for `faction === 'player'`. So every world was
 * correct for its first ten game-hours and blind underground forever after.
 *
 * WHICH IS WHY THE CENTRAL CLAIM HERE IS ABOUT TIME. Asking "does a chamber have a light" on a
 * fresh world passes on the old build too — it was never the seeding. The question is whether
 * it still has one a day later, and the only way to ask it is to run the clock.
 *
 *   node tools/pitch.js [game.html]
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
  const p = await b.newPage({ viewport: { width: 900, height: 600 } });
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message.slice(0, 200)));
  await p.goto('file://' + gamePath(process.argv[2]), { waitUntil: 'load' });
  await p.waitForTimeout(3000);
  await p.evaluate(() => { document.getElementById('btn-start').click(); paused = true; });
  await p.waitForTimeout(3000);

  const R = await p.evaluate(() => {
    const O = {};
    paused = true;
    const guard = (keys, fn) => {
      try { fn(); } catch (e) { for (const k of keys) if (O[k] === undefined) O[k] = '!! ' + String(e.message).slice(0, 120).toUpperCase(); }
    };

    /* the shallow warrens are the ones stocked with people rather than with things that see in
       the dark — `depth01 < 0.34` is the band, and it is the only band this report is about */
    const shallow = caves.filter(cv => (cv.menace === undefined ? 0.5 : cv.menace) < 0.34);
    O._warrens = `${shallow.length} shallow warrens of ${caves.length}, the ones stocked with people`;
    if (!shallow.length) {
      for (const k of ['everyChamberHasAFire', 'aFireLightsTheRoom', 'aTorchIsRelit', 'andTheyAreNotBlindADayLater'])
        O[k] = '!! NO SHALLOW WARRENS IN THIS WORLD';
      return O;
    }

    /* ---- 1. THE CHAMBERS HAVE FIRES ---- */
    guard(['everyChamberHasAFire'], () => {
      let rooms = 0, withFire = 0;
      for (const cv of shallow) for (const rm of (cv.rooms || [])) { rooms++; if (rm.fire) withFire++; }
      O.everyChamberHasAFire = (rooms && withFire === rooms)
        ? `all ${rooms} chambers across ${shallow.length} warrens have a standing fire in them — `
          + `a camp reads as a camp from the doorway, and it does not walk off when its bearer does`
        : `!! ${rooms - withFire} OF ${rooms} CHAMBERS HAVE NO FIRE`;
    });

    /* ---- 2. AND THE FIRE IS A LIGHT, not a decoration ----
       Asked through `litNear`, which is the predicate the dark penalty itself runs on, rather
       than through the list — a fire the lighting system cannot see is a sprite. */
    guard(['aFireLightsTheRoom'], () => {
      const cv = shallow.find(c2 => (c2.rooms || []).some(r2 => r2.fire));
      /* a clean sentence rather than a thrown TypeError on a build that seeds no fires — a red
         for the right reason still has to say what the reason is */
      if (!cv) { O.aFireLightsTheRoom = '!! NO CHAMBER IN THIS BUILD HAS A FIRE TO STAND AT'; return; }
      const rm = (cv.rooms || []).find(r2 => r2.fire);
      /* a body of nobody's, standing in the middle of that chamber, carrying nothing */
      const probe = makeChar('Pitch Probe', 'bandit', rm.fire.x + 0.5, rm.fire.y + 0.5, {atk:5, def:5, tough:10});
      probe.floor = cv.f; probe.weapon = null; chars.push(probe); rebuildCharGrid();
      const lit = litNear(probe);
      const dark = inTheDark(probe);
      chars.splice(chars.indexOf(probe), 1); rebuildCharGrid();
      O.aFireLightsTheRoom = (lit && !dark)
        ? `and a body standing at one with NO torch of its own is not in the dark — `
          + `\`litNear\` answers with the chamber's own fire, which is the predicate the swing penalty runs on`
        : `!! THE FIRE IS A SPRITE (litNear ${lit ? 'found something' : 'found nothing'}, inTheDark ${dark})`;
    });

    /* ---- 3 & 4. AND TEN HOURS LATER THEY ARE STILL NOT BLIND ----
       THE CLAIM THAT MATTERS. `torchTick` takes game-hours, so this drives it directly rather
       than waiting out a day of sim: one call with more hours in it than a torch holds is
       exactly the event that was silently putting every warren in the world out. */
    guard(['aTorchIsRelit', 'andTheyAreNotBlindADayLater'], () => {
      const inWarren = chars.filter(c => c.caveDweller && c.faction === 'bandit' && c.state === 'ok');
      O._folk = `${inWarren.length} people living in the warrens`;
      const before = inWarren.filter(c => c.weapon === 'w_torch').length;
      /* a full day, which is more than twice what a torch holds */
      torchTick(24);
      const after = inWarren.filter(c => c.weapon === 'w_torch').length;
      O.aTorchIsRelit = (before > 0 && after >= before)
        ? `a day of burning takes ${before} lit torches to ${after} — they are at home and there is `
          + `pitch here, so a torch going out means the next one is lit, exactly as it does for you`
        : `!! THE WARRENS GO DARK (${before} torches lit, ${after} after a day)`;
      /* and the thing the report is actually about: the combat penalty.
         ASKED OF THE CHAMBER, WHICH IS WHAT THE DESIGN PROMISES. The first cut of this asked
         that NOT ONE warren-dweller anywhere was in the dark, which is a promise nothing ever
         made: only about one in three carries the light, and a man who has wandered forty tiles
         up an unlit corridor away from both his room and his torchbearer is in the dark because
         that is what a corridor is. Measured on the build that caught it — 40 blind of 315, and
         39 of the 40 were outside the reach of their own room's fire, most of them well outside
         the room itself. So the claim is the one the report makes: A CHAMBER IS A LIT PLACE.
         Somebody standing in their own room can see. What happens in the corridors is the dark,
         and it is supposed to be. */
      rebuildCharGrid();
      const inRoom = [], strayed = [];
      for (const c of inWarren) {
        const cv = caves.find(v => v.id === c.caveId);
        const rm = cv && (cv.rooms || []).find(r2 => r2.id === c.roomId);
        if (rm && c.x >= rm.x0 && c.x <= rm.x1 && c.y >= rm.y0 && c.y <= rm.y1) inRoom.push(c);
        else strayed.push(c);
      }
      const blind = inRoom.filter(c => inTheDark(c)).length;
      O.andTheyAreNotBlindADayLater = (inRoom.length && blind === 0)
        ? `and of the ${inRoom.length} standing in their own chamber a day in, NOT ONE is in the dark — `
          + `corner to corner, because the fire is sized to its room rather than to a constant. `
          + `(${strayed.length} have wandered off into the corridors, where the dark is the point.)`
        : !inRoom.length ? '!! NOBODY IS IN A CHAMBER TO MEASURE'
        : `!! ${blind} OF ${inRoom.length} ARE BLIND STANDING IN THEIR OWN CHAMBER`;
    });
    return O;
  });

  console.log('=== WHAT IS BURNING UNDERGROUND ===\n');
  for (const [k, v] of Object.entries(R)) console.log('  ' + k.padEnd(30) + v);
  const bad = Object.values(R).map(String).filter(v => v.startsWith('!!'));
  if (errs.length) { console.log(''); errs.slice(0, 4).forEach(e => console.log('  ' + e)); }
  console.log('\n' + (bad.length || errs.length
    ? '*** ' + [...bad, ...errs].join('\n*** ')
    : 'THE WARRENS ARE LIT, AND STAY LIT'));
  await b.close();
  process.exitCode = (bad.length || errs.length) ? 1 : 0;
})();
