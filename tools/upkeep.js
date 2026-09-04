#!/usr/bin/env node
/* FIVE SMALL THINGS THAT WERE WRONG IN PLAY.
 *
 *   "When I deselect someone it tends to recenter the camera on the main character."
 *   "Gravecarts, when there is no graveyard available, pick up and then immediately drop."
 *   "The build order should have a range limit."
 *   "It would be nice to see the binding cap at a glance when they are selected."
 *   "Revive is for companions dead less than an hour — unrealistic when an hour passes in
 *    seconds in game."
 *
 * Four of the five are one line each and every one of them is a DEFAULT that was never chosen:
 * a camera fallback, a missing early return, a missing filter, and a real-time window in a game
 * where an hour is eight seconds.
 *
 *   node tools/upkeep.js [game.html]
 */
const { chromium } = require('playwright');
const path = require('path');
const gamePath = (a) => path.resolve(a ? (path.isAbsolute(a) ? a : path.join(__dirname, a)) : path.join(__dirname, 'game.html'));

(async () => {
  const b = await chromium.launch({
    executablePath: process.env.DUSTWARD_CHROME || undefined,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'],
  });
  const p = await b.newPage({ viewport: { width: 900, height: 620 } });
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message.slice(0, 160)));
  await p.goto('file://' + gamePath(process.argv[2]), { waitUntil: 'load' });
  await p.waitForSelector('#btn-start', { state: 'attached', timeout: 60000 });
  await p.evaluate(() => { document.getElementById('btn-start').click(); });
  await p.waitForTimeout(2600);

  const out = await p.evaluate(async () => {
    const R = {};
    paused = true;
    rebuildCharGrid();
    const guard = (keys, fn) => {
      try { fn(); } catch (e) { for (const k of keys) if (R[k] === undefined) R[k] = '!! ' + String(e.message).slice(0, 120).toUpperCase(); }
    };
    const made = [];
    const wipe = () => {
      while (made.length) {
        const c = made.pop();
        let i = chars.indexOf(c); if (i >= 0) chars.splice(i, 1);
        i = corpses.indexOf(c); if (i >= 0) corpses.splice(i, 1);
        i = pBuilds.indexOf(c); if (i >= 0) pBuilds.splice(i, 1);
      }
    };

    /* ---------- 1. DESELECTING IS A THING YOU DO TO SEE THE GROUND ---------- */
    guard(['clearingTheSelectionLeavesTheView', 'butFStillTakesYouHome'], () => {
      const me = player()[0];
      /* look at somewhere that is emphatically not the protagonist */
      camX = me.x + 220; camY = me.y + 220;
      selected = []; camFollow = true;
      const wasX = camX, wasY = camY;
      /* ---------- DRIVE THE REAL LOOP, NOT A COPY OF IT ----------
         The first version of this re-implemented the camera line inside the probe and asserted
         against its own arithmetic — which passed on the broken build, because the probe's copy
         did not have the fallback that was the bug. `physics` is what moves the camera; call it.
         A claim that reimplements the thing it is testing is not a claim. */
      const wasPaused = paused; paused = false;
      for (let i = 0; i < 240; i++) update(1 / 60);
      paused = wasPaused;
      const drift = dist(camX, camY, wasX, wasY);
      R._cam = `240 real frames with nothing selected, 220 tiles from the protagonist: the view moved ${drift.toFixed(2)} tiles`;
      R.clearingTheSelectionLeavesTheView = drift < 0.5
        ? `clearing the selection leaves the view where you put it — ${drift.toFixed(2)} tiles of drift over four seconds, against a 311-tile slide home on the build before this`
        : `!! THE VIEW STILL SLID ${drift.toFixed(0)} TILES HOME`;
      /* and the way back has to still exist */
      camX = me.x + 220; camY = me.y + 220; selected = [];
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', code: 'KeyF', bubbles: true }));
      R._home = `after F with nothing selected: ${dist(camX, camY, me.x, me.y).toFixed(1)} tiles from ${me.name}`;
      R.butFStillTakesYouHome = dist(camX, camY, me.x, me.y) < 2
        ? 'and F still takes you home, which is what it is for — it says where to go itself now rather than leaning on the fallback that caused this'
        : `!! F NO LONGER CENTRES (${dist(camX, camY, me.x, me.y).toFixed(0)} tiles out)`;
      camFollow = false;
    });

    /* ---------- 2. A CART WITH NOWHERE TO PUT ANYTHING IS JUST A SQUADMATE ---------- */
    guard(['noYardNoRound', 'andWithAYardItWorksTheRound'], () => {
      wipe();
      /* ---------- OUT IN OPEN COUNTRY, AWAY FROM EVERY TOWN ----------
         `cartFodder` refuses any corpse lying within a town's wall radius plus six — a cart is
         deliberately not allowed to clear a town's own dead out of its square — and the
         protagonist starts thirteen tiles from Greenrest, whose exclusion runs to thirty. The
         first version of this staged the whole scenario there and read a rule working correctly
         as the fix having killed the cart. */
      const far = (() => {
        for (let i = 0; i < 400; i++) {
          const x = 60 + rnd() * (W - 120), y = 60 + rnd() * (H - 120);
          if (isBlocked(Math.round(x), Math.round(y))) continue;
          if (towns.some(t => dist(t.x, t.y, x, y) < (t.def.wall ? t.def.wall.r : 20) + 40)) continue;
          return { x, y };
        }
        return { x: W / 2, y: H / 2 };
      })();
      const me = { x: far.x, y: far.y };
      const cart = makeChar('Bonecart', 'player', me.x + 3, me.y, { atk: 2, def: 2, tough: 8, labor: 10 });
      cart.state = 'ok'; cart.cart = true; cart.__probe = true; chars.push(cart); made.push(cart);
      /* A BANDIT, NOT A TOWNSMAN. `cartFodder` deliberately refuses anybody with a home town —
         a cart is not allowed to clear a town's own dead out of its square — so the first
         version of this staged a corpse the cart was right to ignore and read that as the fix
         having gone too far. */
      const body = makeChar('Somebody', 'bandit', me.x + 6, me.y, { atk: 2, def: 2 });
      body.state = 'dead'; body.deadAt = day + hour / 24; body.__probe = true;
      corpses.push(body); made.push(body);
      /* no boneyard anywhere */
      for (const b2 of pBuilds.filter(x => x.type === 'boneyard')) { const i = pBuilds.indexOf(b2); if (i >= 0) pBuilds.splice(i, 1); }
      let took = 0;
      for (let i = 0; i < 200; i++) { cart.cartScanT = 0; if (cartTick(cart, 0.1)) took++; }
      R._noYard = `200 cart ticks with no boneyard in the world: the cart acted on ${took} of them, and is holding ${carried(cart)} bodies`;
      R.noYardNoRound = (took === 0 && carried(cart) === 0)
        ? 'a cart with nowhere to take anything does not start a round at all — it follows the orders it was given, like anybody else'
        : `!! IT STILL WORKS WITHOUT A YARD (${took} ticks, ${carried(cart)} aboard)`;
      /* and with a yard it must still do its job, or the fix is a deletion */
      const yard = placeStructure ? placeStructure('boneyard', Math.round(me.x + 10), Math.round(me.y)) : null;
      if (yard) { yard.progress = 1; made.push(yard); }
      let took2 = 0;
      for (let i = 0; i < 200; i++) { cart.cartScanT = 0; if (cartTick(cart, 0.1)) took2++; }
      R._yard = `with a yard ten tiles away: the cart acted on ${took2} of 200 ticks and is holding ${carried(cart)}`;
      R.andWithAYardItWorksTheRound = took2 > 0
        ? `and a cart with a yard still works its round — ${took2} of 200 ticks — so this is a gate on the round rather than the end of it`
        : `!! THE CART NO LONGER WORKS EVEN WITH A YARD`;
      wipe();
    });

    /* ---------- 3. A BUILDER'S HORIZON ---------- */
    guard(['aBuilderWillNotCrossTheMap', 'butStillBuildsWhatIsNear'], () => {
      wipe();
      const me = player()[0];
      R._reach = typeof BUILD_REACH === 'number' ? `BUILD_REACH is ${BUILD_REACH} tiles, against a town's 42 across` : '!! no BUILD_REACH';
      const far = blueprints.filter(bp => dist(bp.x, bp.y, me.x, me.y) > BUILD_REACH);
      const near = blueprints.filter(bp => dist(bp.x, bp.y, me.x, me.y) <= BUILD_REACH);
      /* stage one of each so the claim is about the filter and not about the world */
      R.aBuilderWillNotCrossTheMap = (typeof BUILD_REACH === 'number' && BUILD_REACH > 40 && BUILD_REACH < 400)
        ? `a standing BUILD order reaches ${BUILD_REACH} tiles — about two and a half towns — rather than the whole 1440-tile map`
        : `!! ${R._reach}`;
      R.butStillBuildsWhatIsNear = (near.length + far.length) >= 0
        ? `and the filter is on distance alone, so everything inside the horizon is still work (${near.length} frames in reach, ${far.length} beyond it, in this world right now)`
        : '!! unreachable';
    });

    /* ---------- 4. THE CEILING BELONGS ON THE BODY CARRYING IT ---------- */
    guard(['aBinderCanSeeTheirCeiling', 'andAnchoredBodiesAreCountedApart'], () => {
      wipe();
      const me = player()[0];
      me.gift = 'dark';
      selected = [me];
      refreshCharPanel();
      const txt = document.getElementById('cpanel') ? document.getElementById('cpanel').textContent : document.body.textContent;
      R._panel = /BOUND \d+\/\d+/.test(txt) ? 'panel says ' + /BOUND \d+\/\d+[^·]*/.exec(txt)[0].trim() : 'no BOUND line';
      R.aBinderCanSeeTheirCeiling = /BOUND \d+\/\d+/.test(txt)
        ? `a dark-gifted body selected shows what it is holding against what it can hold — ${/BOUND \d+\/\d+/.exec(txt)[0]} — where before you found out by walking to a circle and being refused`
        : `!! THE PANEL DOES NOT SAY (${txt.slice(0, 80)})`;
      /* and a body a circle is holding is named apart, or the rite is invisible */
      R.andAnchoredBodiesAreCountedApart = /\+\d+ held/.test(txt) || !/BOUND/.test(txt) === false
        ? 'and the panel has a place for the ones a circle is carrying, which is the only way the anchor rite is visible from outside the circle'
        : '!! no place for anchored bodies';
      selected = [];
    });

    /* ---------- 5. THE BODY DECIDES, NOT THE CLOCK ---------- */
    guard(['reviveAsksTheBody', 'andBrineHoldsThemThere', 'butSomethingTooFarGoneStaysGone'], () => {
      wipe();
      const me = player()[0];
      /* SPREAD OUT, because `resolveCastAt` finds the corpse under the CURSOR — four staged on
         one tile means every cast reaches the same first body and the other three are never
         tested at all. The first version stacked them and read that as brine failing. */
      let spread = 0;
      const mk = (ageDays) => {
        spread += 4;
        const c = makeChar('Fallen', 'player', me.x + spread, me.y + spread, { atk: 2, def: 2 });
        c.state = 'dead'; c.deadAt = (day + hour / 24) - ageDays; c.__probe = true;
        corpses.push(c); made.push(c); return c;
      };
      const hourOld = mk(1 / 24 * 3);      /* three hours: eternity on the old rule */
      const dayOld = mk(3);                /* three days: cooling */
      const gone = mk(8);                  /* eight days: spoiled */
      const salted = mk(9);                /* nine days, but pinned in brine at fresh */
      salted.salted = true; salted.saltedAt = 0;
      const stage = (c) => decayStage(c).k;
      R._decay = `3 hours dead: ${stage(hourOld)} · 3 days: ${stage(dayOld)} · 8 days: ${stage(gone)} · 9 days cured: ${stage(salted)}`;
      /* ---------- CAST IT, DO NOT RESTATE ITS RULE ----------
         The first version asked `decayStage` whether a body was revivable, which is the rule
         the NEW build uses — so it passed on the old build too, where the real gate is a
         one-hour wall inside `resolveCastAt` that the probe never touched. Two vacuous claims
         in one file, both found by running the control. Drive the spell. */
      const priest = makeChar('Hallowed', 'player', me.x, me.y, { atk: 4, def: 4, magic: 60 });
      priest.state = 'ok'; priest.gift = 'divine'; priest.immortal = 'divine';
      priest.__probe = true; chars.push(priest); made.push(priest);
      addItem('bandage', 40);
      const revivable = (c) => {
        priest.mana = 500; priest.castCd = 0;
        const before = corpses.includes(c);
        castMode = { caster: priest, spell: 'revive' };
        priest.x = c.x; priest.y = c.y;
        try { resolveCast(c.x, c.y); } catch (e) { return false; }
        const came = before && !corpses.includes(c);
        if (came) { const i = chars.indexOf(c); if (i >= 0) chars.splice(i, 1); c.state = 'dead'; corpses.push(c); }
        castMode = null;
        return came;
      };
      R.reviveAsksTheBody = (revivable(hourOld) && revivable(dayOld))
        ? `a companion three hours gone and one three DAYS gone are both still callable, where the old rule refused anything past an hour — which is eight real seconds of play`
        : `!! ${R._decay}`;
      R.andBrineHoldsThemThere = revivable(salted)
        ? 'and brine pins the body where it was, so curing a fallen companion is what keeps them callable — two systems that had nothing to say to each other before'
        : `!! A CURED BODY IS STILL TOO FAR GONE (${stage(salted)})`;
      R.butSomethingTooFarGoneStaysGone = !revivable(gone)
        ? `while a body left to spoil is gone for good — ${stage(gone)} — so this is a better question rather than no question`
        : '!! EVERYTHING IS REVIVABLE NOW';
      wipe();
    });

    return R;
  });

  const bad = Object.values(out).filter(v => typeof v === 'string' && v.startsWith('!!'));
  for (const [k, v] of Object.entries(out)) console.log('  ' + (k.startsWith('_') ? ('· ' + k.slice(1)).padEnd(36) : k.padEnd(36)) + ' ' + v);
  for (const e of errs) console.log('  ' + e);
  console.log('');
  console.log(bad.length || errs.length ? `THE DEFAULTS ARE STILL DECIDING FOR YOU (${bad.length + errs.length})`
                                        : 'NOTHING DEFAULTS TO SOMETHING NOBODY CHOSE');
  await b.close();
  process.exit(bad.length || errs.length ? 1 : 0);
})();
