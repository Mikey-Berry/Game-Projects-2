#!/usr/bin/env node
/* THE TAPROOM, THE STILL, AND THREE MEASURES.
 *
 * "There should be a craftable building, an enterable building like one of those in the towns,
 *  that can serve as a sort of 'bar' for the squad... It should be a way to get squadmates at
 *  least to the 'warm' level of affection for you, or buy them back from the brink of leaving...
 *  Along these lines, rum should have its own research tree and path to crafting. (Maybe even a
 *  special recipe like Dustport's that's findable after a quest of some kind.) Also also,
 *  drunkenness should have consequences and there should be a limit to how much a party member
 *  can drink. Right now you can down shots forever in a bar — there's gotta be a cooldown and
 *  again a downside to the advantages of alcohol. (Along with a clear indicator for how long it
 *  lasts.)"
 *
 * Three things are measured here, and the first of them is the one that had a NAME in the old
 * code: `Math.max`. A second measure did not stack, it refreshed — same wobble, same clock, more
 * blood in the body — so the optimal play was to click the cup until the bottle ran out and the
 * only price was gold. Every claim below is asked of the body rather than of the window, because
 * the pack, the town bar and the taproom all pour through one function and all three have to
 * obey the same ceiling.
 *
 *   1. three measures and no more, and the fourth is refused by name
 *   2. there is a gap between them — you cannot pour the ceiling in one click-storm
 *   3. it STACKS: the second measure costs more on the swing than the first (the Math.max bug)
 *   4. and there is a morning after: past two measures it wears off into a hangover that will
 *      not take another drop, and that is its own penalty in a fight
 *   5. the clock is READABLE — the panel says the band and the hours, which nothing did before
 *   6. the road: Distilling puts a Still and a Taproom in the BUILD BAR (not merely in the
 *      table — that is the jail.js mistake), and the still carries three recipes on three techs
 *   7. the receipt is FOUND, not bought: no row for it at the research bench, and walking Sella
 *      Vane's three stages is the only thing that puts it in `research.done`
 *   8. the taproom is a ROOM: its edge is walled and its doorway is not
 *   9. a sit-down pulls somebody back from the brink — and stops dead at WARM
 *  10. one sit-down per person per day, and it costs the host a measure too
 *
 * Anything starting '!!' fails the build.
 *
 *   node tools/taproom.js [game.html]
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
    /* every new symbol through `typeof`, so the build before this work reports rather than
       dying on the first line and proving only that the symbol is new */
    /* A TOP-LEVEL `const` IS NOT A PROPERTY OF `window`. It lives in the global LEXICAL
       environment, which `typeof` can see and `window.X` cannot — so every gate in this file is
       a bare `typeof`, the way rum.js does it. Written down because the first cut of this
       harness used `window[name]` and reported the whole feature missing on a build that had
       all of it. */
    const hasLimit = typeof DRINK_LIMIT !== 'undefined' && typeof drinkRefusal !== 'undefined'
                  && typeof measuresIn !== 'undefined';
    const sober = c => { c.gritT = 0; c.gritWob = 0; c.drunk = 0; c.drinkCd = 0; c.hangT = 0; };
    /* the two bodies every drink claim is asked of, hoisted because the claims that can be asked
       of ANY build are outside the new-symbol gate and the ones that cannot are inside it */
    const me = player().find(c => c.state === 'ok' && !c.undead);
    const foe = chars.find(c => c.faction !== 'player' && c.state === 'ok' && !c.undead)
             || player().filter(c => c !== me && c.state === 'ok')[0];

    /* ---- 1 & 2. THE CEILING AND THE GAP ---- */
    if(hasLimit){
      sober(me);
      let took = 0;
      for(let i = 0; i < 6; i++){
        if(drinkFrom(me, 'rum')) took++;
        me.drinkCd = 0;              /* skip the gap; claim 2 is what measures the gap */
      }
      R.threeAndNoMore = took === DRINK_LIMIT && measuresIn(me) === DRINK_LIMIT
        ? `a body takes ${took} measures and refuses the next: "${drinkRefusal(me, 'rum')}"`
        : `!! THE CEILING DOES NOT HOLD (took ${took} of ${DRINK_LIMIT}, carrying ${measuresIn(me)})`;
      sober(me);
      drinkFrom(me, 'rum');
      const gap = drinkRefusal(me, 'rum');
      const cd = me.drinkCd;
      R.aGapBetween = cd > 0 && /still working/.test(gap || '')
        ? `and there is a gap between them — ${(cd / HOUR_SEC).toFixed(1)}h before the next`
        : `!! A SECOND MEASURE GOES STRAIGHT DOWN (cd ${cd}, refusal "${gap}")`;

      /* ---- 4. THE MORNING AFTER ---- */
      sober(me);
      drinkFrom(me, 'rum'); me.drinkCd = 0; drinkFrom(me, 'rum'); me.drinkCd = 0; drinkFrom(me, 'rum');
      me.gritT = 0.05;
      for(let i = 0; i < 30; i++) update(0.1);
      /* read the hangover off the body the drink actually left behind — hours, refusal and the
         penalty in a fight, all three from the same state */
      const hung = hungover(me);
      const hangLeft = me.hangT || 0;
      const hangRefuse = drinkRefusal(me, 'rum');
      const hangHit2 = hitChance(me, foe);
      sober(me);
      const cleanHit = hitChance(me, foe);
      R.aMorningAfter = hung && hangLeft > 0 && /cannot look at it/.test(hangRefuse || '') && hangHit2 < cleanHit - 0.02
        ? `three measures leave ${(hangLeft / HOUR_SEC).toFixed(1)}h of hangover: they will not take another drop, and they swing ${((cleanHit - hangHit2) * 100).toFixed(0)} points worse for it`
        : `!! THE MORNING AFTER IS FREE (hungover ${hung}, refusal "${hangRefuse}", hit ${cleanHit.toFixed(3)} -> ${hangHit2.toFixed(3)})`;
    } else {
      for(const k of ['threeAndNoMore','aGapBetween','aMorningAfter'])
        R[k] = '!! NOTHING IN THIS BUILD LIMITS A DRINK';
    }

    /* ---------- AND THESE THREE CAN BE ASKED OF ANY BUILD ----------
       `drinkFrom` and `DRINKS` have existed since rum first did anything, so the stacking, the
       legs and the readout are all measurable on the build BEFORE this work — and on that build
       they are red for the right reason, which is the reason itself: the second measure is free,
       the legs do not know about it, and the panel says nothing. Gating them behind the new
       symbols would have made the control say "these symbols are new", which is not a finding.
       Gate only what genuinely cannot be asked — the rum.js lesson, one row up in the README. */
    {
      /* ---------- STAGED OFF THE FLOOR, ON PURPOSE ----------
         `hitChance` ends in `clamp(..., 0.15, 0.94)`, and the first run of this claim measured
         an ordinary squad member against an ordinary bandit: 0.234 dry, 0.164 on one measure —
         and 0.150 on two, because the SECOND measure's cost fell off the bottom of the clamp.
         Red, on a build where the stacking works perfectly. A claim that reads a difference has
         to be staged where the difference has room to exist, so the attacker is given enough
         edge to sit in the middle of the range, and the readings are checked against both rails
         before the difference is believed. */
      const atk0 = me.stats.atk;
      sober(me); sober(foe);
      me.stats.atk = foe.stats.def + 12;
      const dry = hitChance(me, foe);
      drinkFrom(me, 'rum');
      const one = hitChance(me, foe);
      me.drinkCd = 0; drinkFrom(me, 'rum');
      const two = hitChance(me, foe);
      me.stats.atk = atk0;
      const railed = dry >= 0.935 || two <= 0.155;
      R.itStacks = railed
        ? `!! STAGED ON A RAIL, SO THE CLAIM CANNOT SEE THE DIFFERENCE (dry ${dry.toFixed(3)}, two ${two.toFixed(3)})`
        : one < dry - 0.02 && two < one - 0.02
        ? `one measure costs ${((dry - one) * 100).toFixed(0)} points of hit chance and the second costs ${((one - two) * 100).toFixed(0)} more`
        : `!! THE SECOND MEASURE IS FREE — Math.max IS STILL THERE (dry ${dry.toFixed(3)}, one ${one.toFixed(3)}, two ${two.toFixed(3)})`;

      /* AND IT SLOWS THEM DOWN, which is the half a wobble cannot deliver */
      sober(me);
      const fast = moveSpeedRaw(me);
      drinkFrom(me, 'rum'); me.drinkCd = 0; drinkFrom(me, 'rum'); me.drinkCd = 0; drinkFrom(me, 'rum');
      const slow = moveSpeedRaw(me);
      sober(me);
      R.andSlowerOnIt = slow < fast - 0.05
        ? `and a body at the ceiling walks at ${(slow / fast * 100).toFixed(0)}% of its own pace`
        : `!! DRINK DOES NOT TOUCH THE LEGS (${fast.toFixed(2)} -> ${slow.toFixed(2)})`;

      /* ---- 5. THE INDICATOR ---- */
      sober(me); drinkFrom(me, 'rum'); me.drinkCd = 0; drinkFrom(me, 'rum');
      selected = [me]; refreshCharPanel();
      const panel = document.getElementById('equip').textContent;
      R.andYouCanSeeIt = /DRUNK 2\/3/.test(panel) && /\dh/.test(panel)
        ? `the panel says it out loud: "${(panel.match(/DRUNK [^·]*/) || [''])[0].trim()}"`
        : `!! THE PANEL SAYS NOTHING ABOUT THE DRINK ("${panel.slice(0, 120)}")`;
      sober(me); refreshCharPanel();
    }
    /* ---- 6. THE ROAD TO IT ---- */
    {
      const inBar = k => (typeof BUILD_CATS !== 'undefined') && BUILD_CATS.some(([, keys]) => keys.includes(k));
      const t = typeof TECHS !== 'undefined' && TECHS.distilling;
      R.theRoad = t && TECHS.cask_ageing && TECHS.black_receipt
        ? `three rungs: ${TECHS.distilling.name} ${TECHS.distilling.cost}g, ${TECHS.cask_ageing.name} ${TECHS.cask_ageing.cost}g, and ${TECHS.black_receipt.name}`
        : '!! RUM HAS NO RESEARCH TREE';
      /* THE BUILD BAR, NOT THE TABLE — the jail.js mistake, which this file has made once */
      R.inTheBuildBar = inBar('still') && inBar('taproom')
        ? 'and both buildings are offered in the build bar'
        : `!! ${inBar('still') ? 'THE TAPROOM' : inBar('taproom') ? 'THE STILL' : 'NEITHER BUILDING'} IS NOT IN THE BUILD BAR`;
      const rec = (typeof RECIPES !== 'undefined' && RECIPES.still) || [];
      const byTech = rec.map(r => `${ITEMS[r.out].name}←${r.tech}`).join(' · ');
      R.threeRecipes = rec.length === 3 && rec.some(r => r.out === 'rum' && r.tech === 'distilling')
                    && rec.some(r => r.out === 'rum_cask' && r.tech === 'cask_ageing')
                    && rec.some(r => r.out === 'rum_black' && r.tech === 'black_receipt')
        ? `and the still carries ${byTech}`
        : `!! THE STILL'S RECIPES ARE WRONG (${byTech || 'none'})`;
      R.lockedWithoutIt = (typeof buildLock === 'function' && buildLock('taproom') && buildLock('still'))
        ? `and neither can be raised before ${buildLock('still')}`
        : '!! THE STILL AND THE TAPROOM ARE FREE WITHOUT THE RESEARCH';
    }

    /* ---- 7. A RECEIPT IS FOUND, NOT BOUGHT ---- */
    if(typeof RECEIPT_STAGES !== 'undefined'){
      research.done.distilling = true; research.done.cask_ageing = true;
      openResearch();
      const bench = document.getElementById('modalbody').textContent;
      document.getElementById('modal').style.display = 'none'; modalOpen = false;
      R.notForSale = !/Harbour Receipt/.test(bench)
        ? 'the research bench does not offer the receipt at any price'
        : '!! THE HARBOUR RECEIPT CAN BE BOUGHT AT THE BENCH';
      /* walk her three stages with the stores she asks for */
      const before = !!research.done.black_receipt;
      for(let guard = 0; guard < 6 && blackReceipt.stage < RECEIPT_STAGES.length; guard++){
        const st = RECEIPT_STAGES[blackReceipt.stage];
        for(const k of Object.keys(st.need || {})) addItem(k, st.need[k]);
        if(st.place) sawPlace(st.place);
        if(!receiptAdvance()) break;
      }
      R.sheTellsYou = !before && research.done.black_receipt && blackReceipt.stage === RECEIPT_STAGES.length
        ? `and ${RECEIPT_STAGES.length} stages of Sella Vane's errand put it in the book`
        : `!! HER ERRAND DOES NOT HAND OVER THE RECEIPT (stage ${blackReceipt.stage}, done ${!!research.done.black_receipt})`;
    } else {
      R.notForSale = R.sheTellsYou = '!! THERE IS NO RECEIPT TO FIND';
    }

    /* ---- 8, 9, 10. THE ROOM ---- */
    if(typeof openTaproom === 'function'){
      /* somewhere clear to put it, near the squad */
      let spot = null;
      for(let r = 4; r < 40 && !spot; r += 2){
        for(let a = 0; a < 12 && !spot; a++){
          const tx = Math.round(me.x + Math.cos(a) * r), ty = Math.round(me.y + Math.sin(a) * r);
          let clear = true;
          for(let j = ty - 1; j < ty + 5 && clear; j++) for(let i = tx - 1; i < tx + 6; i++)
            if(isBlocked(i + 0.5, j + 0.5, 0)) { clear = false; break; }
          if(clear) spot = {x: tx, y: ty};
        }
      }
      if(!spot){ R.itIsARoom = R.backFromTheBrink = R.anotherNight = R.aRoundCounts = R.itStopsAtWarm = R.oncePerDay = '!! NOWHERE CLEAR TO RAISE ONE'; return R; }
      placeStructure('taproom', spot.x, spot.y);
      const tap = pBuilds[pBuilds.length - 1];
      const dx = tap.x + Math.floor(tap.w / 2) - 1;
      const wallShut = isBlocked(tap.x + 0.5, tap.y + 0.5, 0) && isBlocked(tap.x + tap.w - 0.5, tap.y + 0.5, 0);
      const doorOpen = !isBlocked(dx + 0.5, tap.y + tap.h - 0.5, 0);
      R.itIsARoom = wallShut && doorOpen
        ? `a ${tap.w}x${tap.h} room: the corners are walled and the doorway at ${dx},${tap.y + tap.h - 1} is not`
        : `!! THE TAPROOM IS NOT A ROOM (corners blocked ${wallShut}, door open ${doorOpen})`;

      /* put two of yours inside it, and somebody on the way out */
      const inside = player().filter(c => c.state === 'ok' && !c.undead && hasMind(c)).slice(0, 2);
      if(inside.length < 2){ R.backFromTheBrink = R.anotherNight = R.aRoundCounts = R.itStopsAtWarm = R.oncePerDay = '!! NOT ENOUGH LIVING SQUAD TO SIT DOWN'; return R; }
      const host = inside[0], mate = inside[1];
      host.protagonist = true;
      for(const c of inside){ c.x = tap.x + 2; c.y = tap.y + 1.5; c.floor = 0; sober(c); c.satDay = 0; }
      addItem('rum', 40);
      /* -45 is inside one evening's reach whatever the host's charisma; the claim below it is
         the body that is NOT, which is the other half of "buy them back from the brink" */
      mate.regard = -45; mate.leaving = day + 1;
      const was = mate.regard;
      const line = sitDownWith(tap, mate, tapHost(tap, mate));
      R.backFromTheBrink = line && mate.regard > was && !mate.leaving
        ? `somebody at ${Math.round(was)} and going is talked up to ${Math.round(mate.regard)} and stays`
        : `!! A SIT-DOWN DOES NOT MEND ANYTHING (was ${Math.round(was)}, now ${Math.round(mate.regard)}, leaving ${mate.leaving})`;
      /* AND ONE THAT CANNOT BE MENDED IN A NIGHT IS STILL WORTH THE NIGHT. `regardTick` gives a
         seething body ONE day before it walks and one evening moves about twenty points — so
         without the postponement anybody past about -55 is unsavable however much you pour, and
         the feature reads as broken on the body it is most obviously for. */
      for(const c of inside){ sober(c); c.satDay = 0; }
      mate.regard = -85; mate.leaving = day;
      sitDownWith(tap, mate, tapHost(tap, mate));
      R.anotherNight = mate.leaving === day + 1
        ? 'and one too far gone to mend in a night gets another night out of it'
        : `!! A DRINK BUYS NO TIME AT ALL (leaving ${mate.leaving}, day ${day})`;
      mate.leaving = null;

      /* ---- 10. ONE PER DAY, AND THE HOST PAYS TOO ---- */
      for(const c of inside){ sober(c); c.satDay = 0; }
      mate.regard = 0;
      sitDownWith(tap, mate, tapHost(tap, mate));
      const hostHad = measuresIn(host), mateHad = measuresIn(mate);
      mate.drinkCd = 0; host.drinkCd = 0;
      const again = sitDownWith(tap, mate, tapHost(tap, mate));
      R.oncePerDay = !again && hostHad >= 1 && mateHad >= 1
        ? `one conversation a night, and it costs the host a measure too (${hostHad} in them)`
        : `!! THE SIT-DOWN REPEATS OR IS FREE (second ${!!again}, host ${hostHad}, mate ${mateHad})`;

      /* ---- AND A ROUND IS NOT DECORATION ----
         `deed('gold')` is what the town bar has always used and only two of the seven convictions
         weight `gold` at all, so a round poured for a squad of Haunted and Scholars moved exactly
         nothing. Asked of a body whose conviction does NOT weight gold, so the claim cannot pass
         on the deed ledger by accident. */
      {
        for(const c of inside){ sober(c); c.satDay = 0; }
        mate.conviction = 'haunted'; mate.regard = 0;
        const before = mate.regard;
        openTaproom(tap);
        const btn = [...document.querySelectorAll('#modalbody button')].find(x => /^POUR/.test(x.textContent));
        if(btn) btn.click();
        document.getElementById('modal').style.display = 'none'; modalOpen = false;
        R.aRoundCounts = btn && mate.regard > before && measuresIn(mate) > 0
          ? `and a round moves everybody in the room a little — ${before} to ${Math.round(mate.regard)} on somebody whose conviction does not care about gold`
          : `!! A ROUND IN YOUR OWN ROOM IS DECORATION (button ${!!btn}, regard ${before} -> ${Math.round(mate.regard)}, measures ${measuresIn(mate)})`;
      }
      /* ---- 9. AND IT STOPS AT WARM ---- */
      for(const c of inside){ sober(c); c.satDay = 0; }
      mate.regard = 20; mate.leaving = null;
      sitDownWith(tap, mate, tapHost(tap, mate));
      const atCap = mate.regard;
      for(const c of inside){ sober(c); c.satDay = 0; }
      mate.regard = 10;
      sitDownWith(tap, mate, tapHost(tap, mate));
      R.itStopsAtWarm = atCap === TAP_WARM && mate.regard === TAP_WARM
        ? `and it stops dead at WARM (${TAP_WARM}) from either side of it — devotion is still earned out in the world`
        : `!! A DRINK CAN BUY DEVOTION (from 20 -> ${atCap}, from 10 -> ${mate.regard}, cap ${typeof TAP_WARM !== 'undefined' ? TAP_WARM : '?'})`;
    } else {
      for(const k of ['itIsARoom','backFromTheBrink','anotherNight','aRoundCounts','itStopsAtWarm','oncePerDay'])
        R[k] = '!! THERE IS NO TAPROOM IN THIS BUILD';
    }
    return R;
  });

  console.log('=== THE TAPROOM, AND THREE MEASURES ===\n');
  for (const [k, v] of Object.entries(out)) console.log('  ' + k.padEnd(18) + v);
  const bad = Object.values(out).map(String).filter(v => v.startsWith('!!'));
  console.log('\n' + (bad.length ? '*** ' + bad.join('\n*** ') : 'THREE MEASURES, AND THE THIRD ONE COSTS'));
  if (errs.length) { console.log('errs:', errs.length); errs.slice(0, 4).forEach(e => console.log('  ' + e)); }
  await b.close();
  if (bad.length) process.exitCode = 1;
})();
