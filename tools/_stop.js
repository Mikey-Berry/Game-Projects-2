#!/usr/bin/env node
/* WHY NOBODY HAS EVER BEEN STOPPED AT A GATE.
 *
 * "I haven't got stopped for an inspection like ever. I'm wondering if that mechanic is working
 *  properly... Note that I never walk in anyone blatantly carrying mortal remains or other
 *  contraband and just send it straight to the stash."
 *
 * The mechanic is not broken. Its trigger reads somewhere the game never fills.
 *
 * `contrabandOn(c)` asks `c.inv` — the body's own pack. `lootCorpse` ends in `addItem()`, which
 * writes to `stash`. So the wagon is a TELEPORTER: everything picked up is in it the instant it
 * is picked up, and nothing is ever ON anybody standing at a gate. The only way to carry
 * contraband is to take it back out of the wagon by hand, which nobody would do — which is
 * exactly what the report describes from the other side.
 *
 * MEASURED, and the premise is counted before the machinery, because "it never fires" and "it
 * cannot fire" are different faults with different fixes:
 *
 *   · 40 samples of ordinary play — contraband on a person: 0 times
 *   · stripping a body: 3 remains into the WAGON, 0 into the looter's pack
 *   · GATE_ODDS 0.55, which is a hair trigger rather than a rare event
 *   · and the stop FIRES on the first tick once something is put in a pack by hand
 *
 * So the machinery is fine and 0.55 would have stopped the player constantly if the condition
 * were ever true. The comment in `contrabandCheck` records how it got here: it used to read the
 * shared stash, that was too aggressive ("one proscribed formula put the whole company at risk"),
 * and the swing went from always to never.
 *
 * ANSWERED. The gate searches the cart now — one roll, at a crossing, once a day per town, and
 * only when nothing was found on anybody, so the swing does not go back to always. This probe
 * is kept because it is the measurement the fix was built on, and because the first finding is
 * still true and still load-bearing: contraband goes to the wagon and never to a pack.
 * `tools/cart.js` is the harness that holds the fix in place.
 *
 * A probe rather than a harness: it asserts nothing, it establishes what is true.
 *
 *   node tools/_stop.js [game.html]
 */
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch({ executablePath: process.env.DUSTWARD_CHROME,
    args: ['--use-gl=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox','--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 900, height: 600 } });
  p.on('pageerror', e => console.log('PAGEERROR ' + e.message.slice(0,200)));
  await p.goto('file://' + path.join(__dirname, 'game.html'), { waitUntil: 'load', timeout: 90000 });
  await p.waitForFunction(() => !!document.getElementById('btn-start'), null, {timeout:60000});
  await p.evaluate(() => { document.getElementById('btn-start').click(); paused = true; });
  await p.waitForFunction(() => typeof chars !== 'undefined' && chars.length > 0, null, {timeout:60000});
  await p.waitForTimeout(2500);

  const R = await p.evaluate(() => {
    const O = {};
    const step = (s, dt = 0.25) => { for (let i = 0; i < s / dt; i++) update(dt); };
    const KEYS = Object.keys(CONTRABAND);

    /* ---- 1. THE PREMISE, COUNTED FIRST ----
       Play normally for a while — loot the dead, harvest, walk about — and ask how often a
       forbidden thing is ever ON somebody, which is the only condition the stop reads. */
    paused = false;
    let everHeld = 0, samples = 0;
    /* give them something to loot: kill a few things and strip them the way a player would */
    const me = player()[0];
    for (let i = 0; i < 40; i++) {
      step(15);
      samples++;
      for (const c of player()) if (c.inv && KEYS.some(k => (c.inv[k] || 0) > 0)) everHeld++;
    }
    /* and loot a corpse outright, which is where remains come from */
    const body = corpses.find(x => x && x.name && !x.looted);
    let afterLootOnPerson = 0, afterLootInStash = 0;
    if (body) {
      const before = stash.remains || 0;
      lootCorpse(body, true, me);
      harvestCorpse && harvestCorpse(body, true, me);
      afterLootInStash = (stash.remains || 0) - before;
      afterLootOnPerson = (me.inv && me.inv.remains) || 0;
    }
    O.premise = `${samples} samples of normal play: contraband on a person ${everHeld} times`;
    O.looting = `stripping a body put ${afterLootInStash} remains in the WAGON and ${afterLootOnPerson} in the looter's pack`;
    O.odds = `GATE_ODDS ${GATE_ODDS}, LINGER_ODDS ${LINGER_ODDS}`;

    /* ---- 2. AND THE MACHINERY, WITH THE PREMISE FORCED ----
       Put a forbidden thing in a pack and walk them through a gate past a guard. */
    const t = towns.find(t2 => !t2.playerRuled && !t2.def.undeadFriendly);
    const g = chars.find(o => o.faction === 'town' && !o.civ && o.state === 'ok' && o.homeTown === t);
    let fired = false, why = '';
    if (!t) why = 'no searchable town';
    else if (!g) why = 'no guard in that town';
    else {
      const hand = player().find(c => c.state === 'ok' && !c.undead);
      hand.inv = hand.inv || {};
      hand.inv.remains = 3;
      hand._walls = null;                /* so the next tick reads as a crossing */
      hand.x = g.x + 1.5; hand.y = g.y + 1.5; hand.floor = 0;
      hand.stoppedDay = -9;
      const wasOpen = _stopOpen;
      for (let i = 0; i < 60 && !fired; i++) {
        hand._walls = null;
        contrabandCheck();
        if (_stopOpen && !wasOpen) fired = true;
      }
      O.staged = `guard ${g.name} of ${t.name}, ${dist(hand.x, hand.y, g.x, g.y).toFixed(1)} tiles away, inWalls=${!!inWalls(hand)}`;
    }
    O.machinery = fired ? 'the stop FIRES when somebody is actually carrying something'
                        : `!! THE STOP NEVER FIRED EVEN WITH IT IN THE PACK (${why})`;
    return O;
  });
  for (const k of Object.keys(R)) console.log('  ' + k.padEnd(11) + R[k]);
  await b.close();
})();
