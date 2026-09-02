#!/usr/bin/env node
/* WHAT A CIRCLE CAN CARRY, AND WHAT THE CHEAPEST DEAD ARE WORTH.
 *
 * "I like the idea of binding circles eventually operating as a sort of 'anchor' for undead...
 *  it can take the mana and binding cap burden off of the caster within a certain range. That
 *  way, garrisons and 'bases' do not contribute to the caster's total binding."
 * "Maybe we can add a 'longdead' unit to the binding circle... costs very little to
 *  maintain/upkeep. It also has very low stats, but can grow over time."
 *
 * TWO HALVES OF ONE ECONOMY. The ceiling (`risenCap`) and the strain (`bindStrain`, which eats
 * the master's mana pool) are the two prices of holding a host, and BOTH have to come off or
 * the feature is half a feature — a garrison that costs no slot but still softens the man who
 * raised it is not off his hands. So every assertion here is made against both numbers.
 *
 * AND THE CAP PER CIRCLE IS THE ASSERTION THAT MATTERS MOST. Without one, a single ring holds
 * an unlimited host and the ceiling stops existing anywhere in the game — which is not what was
 * asked for. The interesting version is that a garrison is SIZED, so holding more ground means
 * building and defending more circles.
 *
 *   node tools/anchored.js [game.html]
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
  await p.evaluate(() => { document.getElementById('btn-start').click(); paused = true; });
  await p.waitForTimeout(2600);

  const out = await p.evaluate(() => {
    const R = {};
    paused = true;
    const guard = (keys, fn) => {
      try { fn(); } catch (e) { for (const k of keys) if (R[k] === undefined) R[k] = '!! ' + String(e.message).slice(0, 120).toUpperCase(); }
    };
    /* defensive, so a build without any of this still MEASURES rather than reporting one
       ReferenceError for a whole section */
    const anchors = () => (typeof refreshAnchors === 'function' ? refreshAnchors() : null);
    const me = player()[0];
    const made = [], rings = [];
    const wipe = () => {
      while (made.length) { const c = made.pop(); const i = chars.indexOf(c); if (i >= 0) chars.splice(i, 1); }
      while (rings.length) { const r = rings.pop(); const i = pBuilds.indexOf(r); if (i >= 0) pBuilds.splice(i, 1); }
    };
    const risen = (x, y, w) => {
      const c = makeChar('Bound', me.faction, x, y, { atk: 4, def: 4, tough: 6 });
      c.state = 'ok'; c.undead = true; c.lich = false; c.master = me;
      c.bindWeight = w === undefined ? 1 : w; c.__probe = true;
      chars.push(c); made.push(c); return c;
    };
    const ring = (x, y) => {
      const r = placeStructure ? placeStructure('circle', Math.round(x), Math.round(y)) : null;
      if (r) { r.progress = 1; rings.push(r); }
      return r;
    };
    const strainOf = (c) => { refreshBindStrain(); return bindStrain(c); };

    /* ---------- 1. THE LONGDEAD EXISTS AND IS NEARLY FREE TO HOLD ---------- */
    guard(['thereIsACheapTier', 'andFourOfThemCostOneOfAnythingElse'], () => {
      const ld = UNDEAD_TYPES.longdead;
      R._ld = ld ? `${ld.name}: ${ld.mana} mana, ${ld.weight} of a slot, costs ${JSON.stringify(ld.cost)}` : 'no such binding';
      R.thereIsACheapTier = (ld && ld.weight < 1 && ld.mana <= 6 && Object.keys(ld.cost).length === 1 && ld.cost.remains)
        ? `the circle offers a binding made of nothing but gathered remains — ${ld.cost.remains} of them, ${ld.mana} mana, and ${ld.weight} of a slot`
        : `!! ${ld ? JSON.stringify(ld) : 'THERE IS NO LONGDEAD'}`;
      R.andFourOfThemCostOneOfAnythingElse = (ld && UNDEAD_TYPES.gravehound && ld.weight * 4 <= UNDEAD_TYPES.gravehound.weight)
        ? `and four of them weigh what one Gravehound weighs — which is how a host gets NUMBERS without the strain economy being repealed`
        : `!! longdead ${ld && ld.weight} against gravehound ${UNDEAD_TYPES.gravehound && UNDEAD_TYPES.gravehound.weight}`;
    });

    /* ---------- 2. IT IS FEEBLE, AND IT DOES NOT INHERIT ITS MASTER'S POWER ----------
       Every other line at the circle scales off the necromancer's magic. This one must not, or
       a late-game Longdead is a free Bone Knight and the whole point of it is gone. */
    guard(['itIsFeeble', 'andItDoesNotScaleWithTheNecromancer', 'butItCanLearn'], () => {
      wipe();
      const c0 = ring(me.x + 4, me.y + 4);
      if (!c0) { R.itIsFeeble = '!! COULD NOT PLACE A BINDING CIRCLE'; return; }
      const weak = { ...me.stats }; me.stats.magic = 4; me.mana = 200;
      addItem('remains', 40);
      research.done.rites_binding = true;
      craftUndead('longdead', me, c0);
      const early = chars.find(x => x.kin === 'longdead');
      me.stats.magic = 90; me.mana = 200;
      craftUndead('longdead', me, c0);
      const late = chars.filter(x => x.kin === 'longdead')[1];
      me.stats = weak;
      for (const x of [early, late]) if (x) made.push(x);
      R._stats = early && late
        ? `raised at magic 4: atk ${early.stats.atk} tough ${early.stats.tough} · at magic 90: atk ${late.stats.atk} tough ${late.stats.tough}`
        : 'not raised';
      R.itIsFeeble = (early && early.stats.atk <= 3 && early.stats.tough <= 4)
        ? `it comes up feeble — atk ${early.stats.atk}, tough ${early.stats.tough}, against a Bone Knight's ten and up`
        : `!! ${early ? 'atk ' + early.stats.atk + ' tough ' + early.stats.tough : 'NOTHING WAS RAISED'}`;
      R.andItDoesNotScaleWithTheNecromancer = (early && late && late.stats.atk === early.stats.atk && late.stats.tough === early.stats.tough)
        ? 'and a master of the art raises exactly the same feeble thing a beginner does — the only line at this circle that does not inherit its master'
        : `!! magic 4 gave atk ${early && early.stats.atk}, magic 90 gave atk ${late && late.stats.atk}`;
      /* AND IT GROWS, which is the whole of what it has. */
      if (early) {
        const was = early.stats.tough;
        for (let i = 0; i < 400; i++) xpGain(early, 'tough', 0.06);
        R.butItCanLearn = early.stats.tough > was
          ? `and it learns: tough ${was} to ${early.stats.tough} off four hundred small knocks, so the ones that survive become worth something`
          : `!! IT CANNOT GROW (tough stayed ${was})`;
      } else R.butItCanLearn = '!! not reached';
      wipe();
    });

    /* ---------- 3. AN ANCHORED CIRCLE TAKES BOTH BURDENS ----------
       The ceiling AND the strain. A garrison that costs no slot but still softens its master is
       not off his hands, so both numbers are read on the same bodies before and after. */
    guard(['theCircleCarriesThem', 'andItTakesTheStrainTooNotJustTheSlot', 'andOnlyWithTheRite'], () => {
      wipe();
      research.done.rites_anchor = false;
      const c0 = ring(me.x + 30, me.y + 30);
      if (!c0) { R.theCircleCarriesThem = '!! COULD NOT PLACE A BINDING CIRCLE'; return; }
      for (let i = 0; i < 4; i++) risen(c0.x + 1 + (i % 2), c0.y + 1 + Math.floor(i / 2));
      anchors();
      const loadBefore = risenLoad(me), strainBefore = strainOf(me);
      /* WITHOUT THE RITE, NOTHING CHANGES — the assertion that says the tech is the gate and
         not the building, which is what the note asks for. */
      R.andOnlyWithTheRite = loadBefore === 4
        ? 'a circle with no rite behind it holds nothing — four bound bodies standing in it are still four slots off their master'
        : `!! AN UNRESEARCHED CIRCLE ALREADY CARRIES THEM (load ${loadBefore})`;
      research.done.rites_anchor = true;
      anchors();
      const loadAfter = risenLoad(me), strainAfter = strainOf(me);
      R._anchor = `four risen in the ring: load ${loadBefore} → ${loadAfter}, strain ${strainBefore.toFixed(3)} → ${strainAfter.toFixed(3)}`;
      R.theCircleCarriesThem = (loadAfter === 0 && loadBefore === 4)
        ? `with the rite researched the circle takes all four off the ceiling — ${loadBefore} slots to ${loadAfter}`
        : `!! load went ${loadBefore} to ${loadAfter}`;
      R.andItTakesTheStrainTooNotJustTheSlot = (strainBefore > 0 && strainAfter === 0)
        ? `and it takes the strain with them — ${(strainBefore * 100).toFixed(0)}% of their master's mana locked before, nothing after, so a garrison stops softening the man who raised it`
        : `!! strain ${strainBefore.toFixed(3)} → ${strainAfter.toFixed(3)}`;
    });

    /* ---------- 4. BUT ONLY SO MANY, AND ONLY WHILE THEY STAY ---------- */
    guard(['aCircleHoldsOnlySoMany', 'andWalkingOutOfTheRingIsFeltAtOnce'], () => {
      wipe();
      research.done.rites_anchor = true;
      const c0 = ring(me.x + 30, me.y + 30);
      if (!c0) { R.aCircleHoldsOnlySoMany = '!! COULD NOT PLACE A BINDING CIRCLE'; return; }
      const n = ANCHOR_CAP + 3;
      for (let i = 0; i < n; i++) risen(c0.x + 1 + (i % 3) * 0.4, c0.y + 1 + Math.floor(i / 3) * 0.4);
      anchors();
      const carried = made.filter(c => c.anchored).length, load = risenLoad(me);
      R._cap = `${n} risen crowded into one ring of cap ${ANCHOR_CAP}: ${carried} carried, ${load} still on the master`;
      R.aCircleHoldsOnlySoMany = (carried === ANCHOR_CAP && load === n - ANCHOR_CAP)
        ? `one ring carries ${ANCHOR_CAP} and no more — the other ${load} are still their master's problem, so holding more ground means more circles rather than one that holds everything`
        : `!! ${carried} carried of ${n}, ${load} left on the master, cap is ${ANCHOR_CAP}`;
      /* ---------- AND IT IS PROXIMITY, NOT ASSIGNMENT ----------
         ON AN UNDER-FULL RING, which the first version of this got wrong. Walking one body out
         of a ring that had three more waiting outside it simply promoted one of those three:
         the load was 3 before and 3 after, correctly, and the probe called that a failure to
         notice. Clear the crowd first, so the only thing that changes is the one that left. */
      wipe();
      const c1 = ring(me.x + 30, me.y + 30);
      for (let i = 0; i < 3; i++) risen(c1.x + 1 + i * 0.4, c1.y + 1);
      anchors();
      const one = made.find(c => c.anchored);
      if (!one) { R.andWalkingOutOfTheRingIsFeltAtOnce = '!! not reached'; return; }
      const before = risenLoad(me);
      one.x = c1.x + ANCHOR_R + 8;
      anchors();
      const after = risenLoad(me);
      R.andWalkingOutOfTheRingIsFeltAtOnce = after > before
        ? `and a body that walks out of the ring is felt again at once — ${before} slots to ${after} — which is what makes it a garrison rather than a roster`
        : `!! load ${before} → ${after} after walking one out`;
      wipe();
    });

    return R;
  });

  const bad = Object.values(out).filter(v => typeof v === 'string' && v.startsWith('!!'));
  for (const [k, v] of Object.entries(out)) console.log('  ' + (k.startsWith('_') ? ('· ' + k.slice(1)).padEnd(34) : k.padEnd(34)) + ' ' + v);
  for (const e of errs) console.log('  ' + e);
  console.log('');
  console.log(bad.length || errs.length ? `THE HOST IS STILL ALL ON ONE MAN (${bad.length + errs.length})`
                                        : 'THE CIRCLE HOLDS ITS OWN, AND THE CHEAPEST DEAD CAN LEARN');
  await b.close();
  process.exit(bad.length || errs.length ? 1 : 0);
})();
