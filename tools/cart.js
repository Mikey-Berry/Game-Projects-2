#!/usr/bin/env node
/* THE GATE SEARCHES THE CART.
 *
 * "Speaking of guards at the gates, I haven't got stopped for an inspection like ever. I'm
 *  wondering if that mechanic is working properly. We keep trying to tweak it and I think it's
 *  broken currently. Note that I never walk in anyone blatantly carrying mortal remains or
 *  other contraband and just send it straight to the stash."
 *
 * The last sentence is the bug, and it is not in the odds — which had been tuned twice. The
 * check reads `c.inv`, and nothing ever ends up in `c.inv`: `lootCorpse` finishes at `addItem`,
 * which is the wagon. `tools/_stop.js` measured it — forty samples of ordinary play produced
 * contraband on a person zero times. The gate was searching a place nothing is ever kept.
 *
 * The premise is claimed here first, because a mechanic that fires zero times has two possible
 * explanations and only one of them is a bug: it could be rare. It is not rare. It is
 * unreachable, and the claim below counts that before it counts anything else.
 *
 *   node tools/cart.js [game.html]
 */
const { chromium } = require('playwright');
const path = require('path');
const gamePath = (a) => path.resolve(a ? (path.isAbsolute(a) ? a : path.join(__dirname, a)) : path.join(__dirname, 'game.html'));

(async () => {
  const b = await chromium.launch({ executablePath: process.env.DUSTWARD_CHROME || undefined,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 900, height: 600 } });
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message.slice(0, 200)));
  await p.goto('file://' + gamePath(process.argv[2]), { waitUntil: 'load', timeout: 90000 });
  await p.waitForFunction(() => !!document.getElementById('btn-start'), null, { timeout: 60000 });
  await p.evaluate(() => { document.getElementById('btn-start').click(); paused = true; });
  await p.waitForFunction(() => typeof chars !== 'undefined' && chars.length > 0, null, { timeout: 60000 });
  await p.waitForTimeout(2500);

  const R = await p.evaluate(() => {
    const O = {};
    const guard = (keys, fn) => {
      try { fn(); } catch (e) { for (const k of keys) if (O[k] === undefined) O[k] = '!! ' + String(e.message).slice(0, 150).toUpperCase(); }
    };
    const t = towns.find(q => q.def.wall && !q.def.undeadFriendly && !q.playerRuled &&
      chars.some(o => o.faction === 'town' && !o.civ && o.state === 'ok' && o.homeTown === q));
    const g0 = chars.find(o => o.faction === 'town' && !o.civ && o.state === 'ok' && o.homeTown === t);
    const me = player().find(o => o.state === 'ok' && !o.undead);
    const squad = player().filter(o => o.state !== 'dead');
    const home = squad.map(o => ({ o, x: o.x, y: o.y }));
    t.rep = 0; t.bounty = 0;

    const shut = () => {
      const m = document.getElementById('modal');
      if (m) m.style.display = 'none';
      modalOpen = false; _stopOpen = false;
    };
    const clearInv = () => { for (const o of squad) for (const k of Object.keys(CONTRABAND)) if (o.inv && o.inv[k]) delete o.inv[k]; };
    const clearCart = () => { for (const k of Object.keys(CONTRABAND)) delete stash[k]; };
    /* ---------- ONE CROSSING ----------
       `crossed` is `c._walls !== the town's key`, so a crossing is staged by forgetting where
       everybody was and standing them inside the ring. The per-body day gate and the town's own
       cart gate are cleared too: this measures the ODDS of a search, not the cooldowns, which
       have claims of their own below. */
    const cross = () => {
      shut();
      for (const o of squad) { o._walls = null; o.stoppedDay = -9; o.stoppedAt = null; }
      t.cartDay = -9;
      me.x = g0.x + 1.5; me.y = g0.y + 1.5; me.floor = 0;
      rebuildCharGrid();
      contrabandCheck();
      const stopped = _stopOpen;
      const title = stopped ? (document.getElementById('modaltitle') || {}).textContent || '' : '';
      shut();
      return { stopped, title };
    };
    const rate = (n) => { let hit = 0; for (let i = 0; i < n; i++) if (cross().stopped) hit++; return hit; };
    const goHome = () => { for (const h of home) { h.o.x = h.x; h.o.y = h.y; } rebuildCharGrid(); };

    /* ---------- THE PREMISE: WHERE DOES IT ACTUALLY GO? ----------
       A claim that counts zero stops has to count the premise first, or "rare" and "impossible"
       come back the same number. */
    guard(['_premise', 'lootedContrabandGoesToTheCartNotThePack'], () => {
      clearInv(); clearCart();
      const invBefore = Object.keys(CONTRABAND).reduce((n, k) => n + (me.inv && me.inv[k] || 0), 0);
      const cartBefore = Object.keys(CONTRABAND).reduce((n, k) => n + (stash[k] || 0), 0);
      addItem('remains', 3);
      const invAfter = Object.keys(CONTRABAND).reduce((n, k) => n + (me.inv && me.inv[k] || 0), 0);
      const cartAfter = Object.keys(CONTRABAND).reduce((n, k) => n + (stash[k] || 0), 0);
      O._premise = `${t.name} watched by ${g0.name}; three remains taken the way the game takes them:` +
        ` packs ${invBefore} -> ${invAfter}, cart ${cartBefore} -> ${cartAfter}`;
      O.lootedContrabandGoesToTheCartNotThePack = (invAfter === invBefore && cartAfter > cartBefore)
        ? `contraband picked up in the ordinary way goes to the cart and never to a pack — which is the place the gate never looked`
        : `!! IT DID NOT GO TO THE CART (packs ${invBefore}->${invAfter}, cart ${cartBefore}->${cartAfter}) — the premise of this whole file is wrong`;
      clearCart();
    });

    /* ---------- 1. A CLEAN CART IS NEVER SEARCHED, A DIRTY ONE IS ---------- */
    guard(['_rate', 'theGateSearchesTheCart', 'andNeverWhenThereIsNothingInIt'], () => {
      clearInv(); clearCart();
      const clean = rate(200);
      stash.remains = 12;
      const dirty = rate(400);
      /* the written odds do not exist on the build before this; the measured number does */
      const written = (typeof CART_ODDS !== 'undefined') ? Math.round(CART_ODDS * 100) + '%' : 'no such rule';
      O._rate = `200 crossings with an empty cart: ${clean} stops. 400 with twelve remains in it: ${dirty}` +
        ` (${(dirty / 4).toFixed(0)}% a crossing, against a written ${written})`;
      O.theGateSearchesTheCart = dirty > 40
        ? `a cart with grave-goods under the sheet is searched on ${(dirty / 4).toFixed(0)} per cent of crossings`
        : `!! THE CART IS STILL NEVER SEARCHED (${dirty} stops in 400 crossings)`;
      O.andNeverWhenThereIsNothingInIt = clean === 0
        ? 'and a cart with nothing in it is never stopped at all, across two hundred crossings'
        : `!! A CLEAN CART WAS STOPPED (${clean} of 200)`;
      clearCart();
    });

    /* ---------- 2. AND NOT TWICE IN A DAY ----------
       They looked in the cart on the way in. They are not going to look again this afternoon,
       and a mechanic that can fire on every crossing is the gauntlet the original version of
       this was rewritten to stop being. */
    guard(['_again', 'theyDoNotSearchTheSameCartTwiceInADay'], () => {
      clearInv(); clearCart();
      stash.remains = 12;
      /* keep crossing until one lands, then keep crossing WITHOUT clearing the town's gate */
      let first = 0;
      while (first < 200 && !cross().stopped) first++;
      const landed = first < 200;
      t.cartDay = day;                       /* the state a real stop leaves behind */
      let after = 0;
      for (let i = 0; i < 200; i++) {
        shut();
        for (const o of squad) { o._walls = null; o.stoppedDay = -9; o.stoppedAt = null; }
        me.x = g0.x + 1.5; me.y = g0.y + 1.5; rebuildCharGrid();
        contrabandCheck();
        if (_stopOpen) after++;
        shut();
      }
      O._again = `a stop landed after ${first} crossings; two hundred more the same day with the cart still full: ${after} stops`;
      O.theyDoNotSearchTheSameCartTwiceInADay = (landed && after === 0)
        ? 'once they have had the sheet off, that is the cart done for the day — two hundred more crossings, no second search'
        : !landed ? '!! NO STOP EVER LANDED, SO THERE WAS NOTHING TO NOT-REPEAT'
          : `!! THE SAME CART WAS SEARCHED AGAIN THE SAME DAY (${after} of 200)`;
      t.cartDay = -9; clearCart();
    });

    /* ---------- 3. SOMEBODY CARRYING IT IS STILL STOPPED FIRST ----------
       The cart pass runs only when nobody has been stopped. If it pre-empted the personal
       search, the scene would be about a wagon every time and the pack would stop mattering. */
    guard(['_person', 'apersonCarryingItIsStoppedFirst'], () => {
      clearInv(); clearCart();
      me.inv = me.inv || {}; me.inv.tome = 1;
      stash.remains = 12;
      let pack = 0, cartStop = 0, n = 0;
      for (let i = 0; i < 200; i++) {
        const r = cross();
        if (!r.stopped) continue;
        n++;
        /* the pack scene names the pack; the cart scene names the sheet */
        const txt = (document.getElementById('modaltext') || {}).textContent || '';
        (txt.indexOf('cart') >= 0 ? cartStop++ : pack++);
      }
      delete me.inv.tome; clearCart();
      O._person = `carrying a book AND hauling remains, 200 crossings: ${n} stops — ${pack} about the pack, ${cartStop} about the cart`;
      O.apersonCarryingItIsStoppedFirst = (n > 0 && cartStop === 0)
        ? `every one of the ${n} stops was about what was on the person — the cart pass only runs when nobody was carrying`
        : n === 0 ? '!! NOBODY WAS STOPPED AT ALL WHILE VISIBLY CARRYING A FORBIDDEN BOOK'
          : `!! THE CART PRE-EMPTED A PERSONAL SEARCH (${cartStop} of ${n} stops were about the cart)`;
    });

    /* ---------- 4. AND WHAT THEY FIND IN IT, THEY TAKE ----------
       Without this a cart search has no bite: go quietly, serve the days, and the wagon is
       still full of it when you come out. */
    guard(['_seize', 'whatTheyFindInTheCartTheyTake'], () => {
      clearInv(); clearCart();
      stash.remains = 9; stash.tome = 2;
      const before = (stash.remains || 0) + (stash.tome || 0);
      theReckoning(me, g0, t, CONTRABAND.remains, ['remains', 'tome']);
      const btn = document.querySelectorAll('#modalbody button')[0];
      const label = btn ? btn.textContent : '(no buttons)';
      if (btn) btn.click();
      shut();
      const after = (stash.remains || 0) + (stash.tome || 0);
      O._seize = `${before} pieces of contraband in the cart; took "${label.split('—')[0].trim()}"; ${after} left`;
      O.whatTheyFindInTheCartTheyTake = (before > 0 && after === 0)
        ? `going quietly empties the cart of all ${before} of it — the watch carts it away themselves`
        : `!! THE CART KEPT ITS CONTRABAND THROUGH THE ARREST (${before} -> ${after})`;
      clearCart();
    });

    clearInv(); clearCart(); shut(); goHome();
    for (const o of squad) { o._walls = null; o.stoppedDay = -9; }
    t.cartDay = -9;
    return O;
  });

  console.log('\n=== THE GATE SEARCHES THE CART ===\n');
  const bad = [];
  for (const k of Object.keys(R)) {
    const v = String(R[k]);
    console.log('  ' + k.padEnd(40) + v);
    if (v.startsWith('!!')) bad.push(v);
  }
  console.log('\n' + (bad.length ? '*** ' + bad.join('\n*** ')
    : 'THE SHEET COMES OFF, ONCE A DAY, AND ONLY WHEN NOBODY WAS CARRYING'));
  if (errs.length) { console.log('errs:', errs.length); errs.slice(0, 4).forEach(e => console.log('  ' + e)); }
  await b.close();
  if (bad.length) process.exitCode = 1;
})();
