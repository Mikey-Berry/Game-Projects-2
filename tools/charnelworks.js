#!/usr/bin/env node
/* WHY YOU WOULD EVER OWN A GRAVECART.
 *
 * "For corpse harvesting I think the process should take a bit more time. Perhaps corpses can
 *  be piled in dedicated storage buildings that allow a fuller extraction of mortal remains.
 *  One, we just need a use for the bone cart as it's pointless when a Death Eater can just walk
 *  around and harvest all day long. And two, I love the idea of hauling back a Sixfold's corpse
 *  to properly extract and loot it."
 *
 * The cart was a solved problem looking for a question: it moves bodies, and there was no
 * reason to want a body anywhere in particular. So the test is not "does the building exist" —
 * it is whether the two numbers a player weighs are actually different, and whether the great
 * dead are genuinely a haul rather than a longer animation.
 *
 * Every yield here is measured over many bodies, because `harvestCorpse` rolls.
 *
 *   node tools/charnelworks.js [game.html]
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
      try { fn(); } catch (e) { for (const k of keys) if (R[k] === undefined) R[k] = '!! ' + String(e.message).slice(0, 110).toUpperCase(); }
    };
    const me = player()[0];
    /* ---------- WELL AWAY FROM ANY SEAT ----------
       `cartFodder` refuses a body lying inside somebody else's walls — that is grave-robbery
       and `takeBody` books it — and the player starts next to a town, so a yard staged
       fourteen tiles from the start put every test corpse inside a wall radius and the cart
       correctly picked up nothing. The probe read that as the cart being broken. */
    let gx = 0, gy = 0;
    outer:
    for (let y = 90; y < H - 90; y += 7) for (let x = 90; x < W - 90; x += 7) {
      if (nearestTownDist(x, y) < 140) continue;
      let ok = true;
      for (let dy = -8; dy <= 8 && ok; dy++) for (let dx = -8; dx <= 8; dx++) if (isBlocked(x + dx, y + dy)) { ok = false; break; }
      if (ok) { gx = x; gy = y; break outer; }
    }
    R._where = `staged on open waste at ${gx},${gy}, ${Math.round(nearestTownDist(gx, gy))} tiles from the nearest seat`;
    const at = findOpenNear(gx, gy, 8);
    const yard = placeStructure('boneyard', at.x, at.y);
    const YW = BUILD_TYPES.boneyard ? BUILD_TYPES.boneyard.w : 3;

    /* a fresh corpse, put exactly where we want it */
    const corpse = (x, y, big) => {
      const c = makeChar('Meat', 'bandit', x, y, { atk: 5, def: 5, tough: 20 });
      c.state = 'dead'; c.rot = 'fresh'; c.deadAt = day; c.big = big || 1;
      c.x = x; c.y = y;
      chars.push(c); corpses.push(c);
      return c;
    };
    const yardSpot = () => ({ x: at.x + YW / 2, y: at.y + YW / 2 });
    const fieldSpot = () => ({ x: at.x - 30, y: at.y - 30 });

    guard(['thereIsAYardToBuild', 'andItIsOnTheBuildBar'], () => {
      R.thereIsAYardToBuild = (BUILD_TYPES.boneyard && yard && pBuilds.some(b2 => b2.type === 'boneyard'))
        ? `a Boneyard is ${BUILD_TYPES.boneyard.w}x${BUILD_TYPES.boneyard.h} and stands where it was put`
        : '!! THERE IS NO BONEYARD';
      /* the mistake this project has made three times: costed, placeable, described, unlisted */
      research.done.rites_binding = true;
      const listed = BUILD_CATS.some(([, keys]) => keys.includes('boneyard'));
      refreshBuildBar();
      const onBar = [...document.querySelectorAll('#buildbar .bbtn')].some(x => /BONEYARD/i.test(x.textContent));
      R.andItIsOnTheBuildBar = (listed && onBar)
        ? 'and BONEYARD is on the build bar once Rites of Binding is done — reachable by a player, not only by a harness'
        : `!! IN BUILD_CATS: ${listed}, ON THE BAR: ${onBar}`;
    });

    /* ---------- 1. THE TWO NUMBERS A PLAYER WEIGHS ----------
       Rendered on the racks against rendered where it fell. `harvestCorpse` rolls, so this is
       a hundred bodies each way and a ratio, not one body and an opinion. */
    guard(['aYardIsWorthTheWalk'], () => {
      const run = (where, big) => {
        let tot = 0;
        for (let i = 0; i < 100; i++) {
          const s = where();
          const c = corpse(s.x, s.y, big);
          c.looted = true;
          tot += harvestCorpse(c, true, null) || 0;
        }
        return tot / 100;
      };
      const field = run(fieldSpot, 1), racks = run(yardSpot, 1);
      R._ordinary = `an ordinary body: ${field.toFixed(2)} remains in the field, ${racks.toFixed(2)} on the racks`;
      R.aYardIsWorthTheWalk = racks > field * 1.4
        ? `the racks give ${(racks / field).toFixed(2)}x what a field rendering does — enough that hauling is a decision`
        : `!! A YARD IS WORTH ${(racks / field).toFixed(2)}x A FIELD — nobody would build one`;
    });

    /* ---------- 2. AND THE GREAT DEAD ARE A HAUL, NOT AN ANIMATION ---------- */
    guard(['aSixfoldCannotBeWorkedInAField', 'butComesApartOnTheRacks', 'andYouCannotLootOneWhereItFell'], () => {
      const run = (where) => {
        let tot = 0;
        for (let i = 0; i < 100; i++) {
          const s = where();
          const c = corpse(s.x, s.y, 2.4);
          c.looted = true;
          tot += harvestCorpse(c, true, null) || 0;
        }
        return tot / 100;
      };
      const field = run(fieldSpot), racks = run(yardSpot);
      R._great = `a Sixfold-sized body: ${field.toFixed(2)} in the field, ${racks.toFixed(2)} on the racks`;
      R.aSixfoldCannotBeWorkedInAField = racks > field * 3
        ? `a knife in a field gets ${field.toFixed(2)} off one; the yard gets ${racks.toFixed(2)}, ${(racks / field).toFixed(1)}x more`
        : `!! FIELD ${field.toFixed(2)} AGAINST RACKS ${racks.toFixed(2)} — there is no reason to haul it`;
      R.butComesApartOnTheRacks = racks > 0
        ? 'and on the racks it comes apart properly rather than being refused'
        : '!! A GREAT BODY YIELDS NOTHING EVEN IN THE YARD';
      /* the loot, which is the half the note was actually excited about */
      const f = fieldSpot(), y2 = yardSpot();
      const outThere = corpse(f.x, f.y, 2.4); outThere.loot = 500; outThere.weapon = 'w_kat';
      const gold0 = cats;
      const gotField = lootCorpse(outThere, true, null);
      /* READ THE PURSE BETWEEN THE TWO, not after both. The first version asked for
         `cats === gold0 && cats > gold0` at the end, which nothing can satisfy. */
      const goldAfterField = cats;
      const home = corpse(y2.x, y2.y, 2.4); home.loot = 500; home.weapon = 'w_kat';
      const gotYard = lootCorpse(home, true, null);
      R.andYouCannotLootOneWhereItFell = (gotField === null && goldAfterField === gold0 && Array.isArray(gotYard) && cats > goldAfterField)
        ? `and its pockets will not open in a field (purse held at ${gold0}) and will on the racks (${cats}) — the wagon, stated as a rule`
        : `!! FIELD LOOT ${JSON.stringify(gotField)}, YARD LOOT ${JSON.stringify(gotYard)}, purse ${gold0} -> ${goldAfterField} -> ${cats}`;
    });

    /* ---------- 3. AND A RENDERING IS WORK ----------
       "The process should take a bit more time." A second and a half a body made a HARVEST hand
       a tap that never stops running. */
    guard(['renderingTakesRealTime'], () => {
      const man = harvestSecs({ big: 1 }), six = harvestSecs({ big: 2.4 }), brood = harvestSecs({ big: 3.2 });
      R._secs = `a man ${man}s, a Sixfold ${six}s, a Brood ${brood}s (halved on the racks)`;
      R.renderingTakesRealTime = (man >= 4 && six > man * 1.5)
        ? `a body is ${man} seconds of work and a great one ${six} — a job to allocate, not a tap`
        : `!! A RENDERING IS ${man}s FOR A MAN AND ${six}s FOR A SIXFOLD`;
    });

    /* ---------- 4. AND THE CART KNOWS WHERE HOME IS ---------- */
    guard(['theCartHaulsToTheYard', 'andFetchesTheGreatDeadFirst'], () => {
      const cart = makeChar('Gravecart', 'player', at.x - 10, at.y - 10, { atk: 2, def: 4, tough: 10, ath: 6 });
      cart.state = 'ok'; cart.cart = true; cart.beast = true; cart.undead = true; cart.master = me;
      chars.push(cart);
      const home = cartDrop(cart);
      const inYard = home && !!boneyardAt(home.x, home.y);
      R.theCartHaulsToTheYard = inYard
        ? `a loaded cart heads for the racks and sets bodies down INSIDE them (${home.x.toFixed(1)},${home.y.toFixed(1)})`
        : `!! THE CART DROPS AT ${home ? home.x.toFixed(1) + ',' + home.y.toFixed(1) : 'NOWHERE'} — not in the yard`;
      /* three ordinary bodies close by and one giant further off: it must want the giant */
      for (let i = corpses.length - 1; i >= 0; i--) { const c = corpses[i]; corpses.splice(i, 1); const j = chars.indexOf(c); if (j >= 0) chars.splice(j, 1); }
      for (let i = 0; i < 3; i++) corpse(cart.x + 3 + i, cart.y, 1);
      const giant = corpse(cart.x + 16, cart.y, 2.4);
      cart.cartScanT = 0;
      cartTick(cart, 1 / 30);
      R.andFetchesTheGreatDeadFirst = cart.cartBody === giant
        ? 'and it crosses the field past three ordinary corpses to fetch the one that cannot be worked where it lies'
        : `!! THE CART WENT FOR ${cart.cartBody ? 'a body at ' + cart.cartBody.x.toFixed(0) + ',' + cart.cartBody.y.toFixed(0) : 'nothing'}`;
    });

    return R;
  });

  const bad = Object.values(out).filter(v => typeof v === 'string' && v.startsWith('!!'));
  for (const [k, v] of Object.entries(out)) console.log('  ' + k.padEnd(32) + v);
  for (const e of errs) console.log('  ' + e);
  console.log('');
  console.log(bad.length || errs.length ? `THE CART IS STILL A DECORATION (${bad.length + errs.length})`
                                        : 'THERE IS A REASON TO HAUL A BODY HOME');
  await b.close();
  process.exit(bad.length || errs.length ? 1 : 0);
})();
