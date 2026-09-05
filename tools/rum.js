#!/usr/bin/env node
/* DUSTPORT, AND A DRINK THAT DOES SOMETHING.
 *
 * "Dustport with a REAL bar, and a local brew. We need to make rum more useful in general!"
 *
 * Rum has been in this game since the beginning as `type:'trade'` — bought in one town, sold in
 * another at a markup, with no other verb attached to it anywhere in the file. The bar sold it,
 * the brewer made it, the shelves stocked it, and nobody ever DRANK any, because there was
 * nothing anywhere that could.
 *
 * What is measured here is therefore not "is there a drink item" but "does drinking one change
 * a body", asked of the two numbers that already decided whether a body is on its feet:
 * `downAt`, the blood at which you drop, and the 50 at which you get back up.
 *
 *   1. a measure poured into somebody lying in the dirt stands them up
 *   2. a drinker keeps going past where they would have dropped, and comes round sooner
 *   3. and it COSTS something — they swing wide and they are easier to hit — or it is a free
 *      buff rather than a decision
 *   4. the dead and the built refuse it
 *   5. Dustport's bar is a named house, twice the floor, with its own brew ON THE SHELF and not
 *      merely in a vendor's list — which is the aether-cell mistake and this file has made it
 *      twice already
 *   6. and the brew is worth carrying: cheap where it is made, dear everywhere else
 *
 * Anything starting '!!' fails the build.
 *
 *   node tools/rum.js [game.html]
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
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message.slice(0, 240)));
  await p.goto('file://' + gamePath(process.argv[2]), { waitUntil: 'load' });
  await p.waitForTimeout(3000);
  await p.evaluate(() => { document.getElementById('btn-start').click(); paused = true; });
  await p.waitForTimeout(2500);

  const out = await p.evaluate(() => {
    const R = {};
    /* every new symbol through `typeof`: the build before this work has none of them, and a bare
       reference would kill the control and prove only that the symbol is new */
    const hasDrink = typeof DRINKS !== 'undefined';
    R.itIsADrink = (ITEMS.rum && ITEMS.rum.drink && hasDrink)
      ? `rum carries a use at last (${Object.keys(DRINKS).join(', ')})`
      : '!! RUM IS STILL A TRADE GOOD WITH NO VERB ON IT';
    R.theBrew = ITEMS.rum_black
      ? `and Dustport has one of its own: ${ITEMS.rum_black.name} at ${ITEMS.rum_black.base}`
      : '!! THERE IS NO LOCAL BREW';
    /* ---------- AND THE HALF THAT DOES NOT NEED THE DRINK STILL REPORTS ----------
       This was a bare `if(!hasDrink) return R`, and against the build before this work the file
       stopped after two lines — so the negative control said nothing whatever about the bar, the
       shelf or the trade, all of which are measurable on any build. Gate only what genuinely
       cannot be asked. */
    if(hasDrink){
    /* ---- 1. A MEASURE INTO SOMEBODY ON THE GROUND ---- */
    const me = player().find(c => c.state === 'ok' && !c.undead);
    const mate = player().filter(c => c.state === 'ok' && !c.undead && c !== me)[0];
    mate.blood = 30; updateState(mate);
    const wasDown = mate.state;
    const rose = drinkFrom(mate, 'rum');
    R.standsThemUp = wasDown === 'down' && rose && mate.state === 'ok'
      ? `a body at 30 blood is down, and a measure puts it back on its feet at ${Math.round(mate.blood)}`
      : `!! A MEASURE DID NOT LIFT A DOWNED BODY (was ${wasDown}, now ${mate.state}, blood ${Math.round(mate.blood)})`;

    /* ---- 2. THE TWO THRESHOLDS ----
       Asked of `updateState` itself rather than of a copy of the rule: set a sober body just
       above the drop line and a drunk one just below it, and see which of them is standing. */
    const drop = (c, blood, drunk) => {
      c.state = 'ok'; c.blood = blood; c.gritT = drunk ? 60 : 0; c.gritWob = drunk ? 0.1 : 0;
      updateState(c);
      return c.state;
    };
    const sober = drop(me, 34, false), lit = drop(me, 34, true);
    R.keepsGoing = sober === 'down' && lit === 'ok'
      ? 'at 34 blood a sober body is down and a drinking one is still swinging'
      : `!! THE DROP LINE DOES NOT MOVE (sober ${sober}, drunk ${lit})`;
    const rise = (c, blood, drunk) => {
      c.state = 'down'; c.blood = blood; c.gritT = drunk ? 60 : 0; c.gritWob = drunk ? 0.1 : 0;
      updateState(c);
      return c.state;
    };
    const upS = rise(me, 44, false), upD = rise(me, 44, true);
    R.comesRound = upS === 'down' && upD === 'ok'
      ? 'and at 44 a sober body stays down while a drinking one gets up'
      : `!! THE RISE LINE DOES NOT MOVE (sober ${upS}, drunk ${upD})`;

    /* ---- 3. AND IT COSTS SOMETHING, IN THE ONE PLACE A BLOW IS DECIDED ---- */
    const foe = chars.find(c => c.faction !== 'player' && c.state === 'ok' && !c.undead) || mate;
    me.gritT = 0; me.gritWob = 0; foe.gritT = 0; foe.gritWob = 0;
    const hit0 = hitChance(me, foe), taken0 = hitChance(foe, me);
    me.gritT = 60; me.gritWob = DRINKS.rum.wob;
    const hit1 = hitChance(me, foe), taken1 = hitChance(foe, me);
    R.swingsWide = hit1 < hit0 - 0.02
      ? `a drinker swings wide: ${(hit0*100).toFixed(0)}% down to ${(hit1*100).toFixed(0)}%`
      : `!! DRINK COSTS NOTHING ON THE SWING (${hit0.toFixed(3)} -> ${hit1.toFixed(3)})`;
    R.easierToHit = taken1 > taken0 + 0.02
      ? `and is easier to hit: ${(taken0*100).toFixed(0)}% up to ${(taken1*100).toFixed(0)}%`
      : `!! DRINK COSTS NOTHING ON THE GUARD (${taken0.toFixed(3)} -> ${taken1.toFixed(3)})`;
    /* AND IT WEARS OFF, or it is a permanent buff sold at 75 gold */
    me.gritT = 0.05;
    for(let i = 0; i < 40; i++) update(0.1);
    R.wearsOff = !gritted(me) ? 'and it wears off on its own' : `!! THE DRINK NEVER WEARS OFF (${(me.gritT||0).toFixed(1)}s left)`;

    /* ---- 4. WHO CANNOT DRINK ---- */
    const dead = chars.find(c => c.undead && !c.lich && c.state !== 'dead');
    R.refusals = (!dead || drinkFrom(dead, 'rum') === false)
      ? 'the risen have no throat to put it down'
      : '!! A CORPSE DRANK A MEASURE OF RUM';

    } else {
      for(const k of ['standsThemUp','keepsGoing','comesRound','swingsWide','easierToHit','wearsOff','refusals'])
        R[k] = '!! NOTHING IN THIS BUILD CAN DRINK ANYTHING';
    }

    /* ---- 5. THE HOUSE AT DUSTPORT ---- */
    const dp = towns.find(t => t.def.key === 'dustport');
    const bar = buildings.find(x => x.town === dp && /DROWNED/.test(x.label));
    const plain = buildings.find(x => x.town !== dp && x.label === 'BAR');
    R.namedHouse = bar
      ? `${bar.label}, ${bar.w}x${bar.h} against every other town's ${plain ? plain.w + 'x' + plain.h : '8x6'}`
      : '!! DUSTPORT HAS THE SAME BAR AS EVERYBODY ELSE';
    const keep = vendors.find(v => v.vt === 'bar' && v.town === dp);
    R.namedKeep = keep && keep.name !== 'Barkeep' && keep.house
      ? `${keep.name} keeps it, and the window says so`
      : `!! THE HOUSE IS KEPT BY "${keep ? keep.name : 'nobody'}"`;
    /* THE SHELF, NOT THE LIST — the aether-cell mistake, made twice already in this file */
    if(!ITEMS.rum_black){
      for(const k of ['onTheShelf','nowhereElse','keepsBrewing','worthCarrying','notAPrinter'])
        R[k] = '!! THERE IS NO LOCAL BREW TO PUT ON A SHELF';
      R.roundExists = typeof roundTakers === 'function' ? 'a round can be stood' : '!! THERE IS NO ROUND TO STAND';
      return R;
    }
    R.onTheShelf = stockOf(dp, 'rum_black') > 0
      ? `${stockOf(dp, 'rum_black')} measures actually behind the counter`
      : '!! THE HOUSE MEASURE IS LISTED AND THE COUNTER IS EMPTY';
    R.nowhereElse = towns.filter(t => t !== dp && stockOf(t, 'rum_black') > 0).length === 0
      ? 'and no other town has a drop of it'
      : `!! ${towns.filter(t => t !== dp && stockOf(t, 'rum_black') > 0).length} OTHER TOWNS STOCK THE LOCAL BREW`;
    /* AND IT KEEPS BEING MADE, or the counter runs dry the first time you stand a round */
    const was = stockOf(dp, 'rum_black');
    dp.stock.fruit = (dp.stock.fruit || 0) + 400;
    for(const c of chars.filter(c2 => c2.homeTown === dp && c2.trade === 'brewer')) for(let i = 0; i < 40; i++) workShift(dp, c);
    R.keepsBrewing = stockOf(dp, 'rum_black') > was
      ? `and the brewers keep putting it up: ${was} to ${stockOf(dp, 'rum_black')}`
      : `!! NOBODY IN DUSTPORT MAKES IT (${was} still)`;

    /* ---- 6. WORTH CARRYING ---- */
    const here = priceSell(dp, 'rum_black'), away = towns.filter(t => t !== dp).map(t => priceBuy(t, 'rum_black'));
    R.worthCarrying = Math.min(...away) > here
      ? `bought at ${here} in the harbour and wanted at ${Math.min(...away)}-${Math.max(...away)} inland`
      : `!! THERE IS NO TRADE IN IT (sells ${here}, cheapest elsewhere ${Math.min(...away)})`;

    /* ---- AND A ROUND IS A THING YOU BUY FOR OTHER PEOPLE ---- */
    /* AND IT MUST NOT BE A MONEY PRINTER. The spread on the house measure is read against the
       spread on ORDINARY rum, which has been in the economy since the beginning and is the
       calibration everything else in this town is priced against. A local speciality should be
       worth the trip; it should not be worth more than every other good in the game combined. */
    const spread = k2 => {
      const lo = Math.min(...towns.map(t => priceSell(t, k2)));
      const hi = Math.max(...towns.map(t => priceBuy(t, k2)));
      return hi / Math.max(1, lo);
    };
    const sR = spread('rum'), sB = spread('rum_black');
    R.notAPrinter = sB <= sR * 1.35
      ? `and its spread is ${sB.toFixed(1)}x against ordinary rum's ${sR.toFixed(1)}x — a speciality, not a printing press`
      : `!! THE BREW'S SPREAD IS ${sB.toFixed(1)}x AGAINST RUM'S ${sR.toFixed(1)}x`;
    R.roundExists = typeof roundTakers === 'function' && typeof roundCost === 'function'
      ? `a round for those in the room costs ${roundCost(dp, 'rum', 4)} for four`
      : '!! THERE IS NO ROUND TO STAND';
    return R;
  });

  console.log('=== DUSTPORT, AND THE DRINK ===\n');
  for (const [k, v] of Object.entries(out)) console.log('  ' + k.padEnd(16) + v);
  const bad = Object.values(out).map(String).filter(v => v.startsWith('!!'));
  console.log('\n' + (bad.length ? '*** ' + bad.join('\n*** ') : 'RUM IS CHEAP HERE, AND EVERYTHING ELSE COSTS BLOOD'));
  if (errs.length) { console.log('errs:', errs.length); errs.slice(0, 4).forEach(e => console.log('  ' + e)); }
  await b.close();
  if (bad.length) process.exitCode = 1;
})();
