#!/usr/bin/env node
/* CAN A COUPLE ACTUALLY HAVE A CHILD?
 *
 * "There should be an easier way for a courting/wed couple to have kids. Right now I do not see
 *  any means for them to actually do so, and I have waited for many days in-game time. Perhaps
 *  it could require a shack as a sort of home... There should also be natural limits."
 *
 * IT DID WORK, AND THAT IS THE POINT. Measured before anything changed: a staged wed couple
 * standing together produced 5 pregnancies and 5 births over 200 game-days. At 2% a day that is
 * a fifty-day wait for the first, and the pair had to be inside eight tiles AT THE MIDNIGHT
 * TICK — which two people on different jobs frequently are not. The feature was invisible
 * rather than absent, which is the worst way for one to be, and a probe that only asked "do
 * births happen" would have been green throughout.
 *
 * So every assertion here is a RATE or a LIMIT, and the two halves are tested against each
 * other: a house means children soon enough to see, and the limits hold so a homestead cannot
 * become a barracks.
 *
 * REWRITTEN AFTER THE M&B2 REWORK, because two of these claims had become claims about a rule
 * that no longer exists. The homestead used to be a GATE — no house, no conception at all —
 * and it is now an INCENTIVE: two married people together anywhere conceive at 2% a night, a
 * homestead they both stand in makes it 12%, and the cost moved to the far end, where the
 * child has to be born under a roof. So "no house, no children" is still TRUE and no longer
 * true for the reason it says: they conceive on the road and never deliver there. It is
 * written out that way now. And "a full house takes no more" was flatly wrong under the new
 * rule and failed, correctly — a full house stops being a bonus, it does not stop a couple.
 * The hard stop that replaces it is the season, which now rides the mother.
 *
 *   node tools/kin2.js [game.html]
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
  await p.waitForTimeout(2600);
  await p.evaluate(() => { document.getElementById('btn-start').click(); paused = true; });
  await p.waitForTimeout(2600);

  const out = await p.evaluate(() => {
    const R = {};
    paused = true;
    const guard = (keys, fn) => {
      try { fn(); } catch (e) { for (const k of keys) if (R[k] === undefined) R[k] = '!! ' + String(e.message).slice(0, 90).toUpperCase(); }
    };

    const me = player()[0];
    const born = [];
    const clean = () => {
      for (const c of born) { const i = chars.indexOf(c); if (i >= 0) chars.splice(i, 1); }
      born.length = 0;
      for (let i = pBuilds.length - 1; i >= 0; i--) if (pBuilds[i].__probe) pBuilds.splice(i, 1);
    };
    /* a wed couple of prime age, standing where they are put */
    const couple = (x, y) => {
      const mk = (sex, dx) => {
        const c = makeChar('X', 'player', x + dx, y, { race: 'human', sub: 'dustborn', sex, age: 26, atk: 5, def: 5, tough: 5, ath: 5 });
        c.state = 'ok'; c.noFight = true; chars.push(c); born.push(c); return c;
      };
      const w = mk('f', 0), h = mk('m', 0.5);
      marry(w, h);
      return [w, h];
    };
    const house = (x, y) => {
      const h = { type: 'home', x: Math.round(x) - 2, y: Math.round(y) - 2, w: 4, h: 4,
                  floor: 0, hp: 200, maxHp: 200, progress: 1, __probe: true };
      pBuilds.push(h); return h;
    };
    /* THE ROLLOVER IS `if(hour >= 24)` INSIDE `update`, so the clock is pushed to the boundary
       and one step taken — a whole game-day of bookkeeping without simulating the 192 real
       seconds a day costs at HOUR_SEC 8. */
    /* AND THE AUTOSAVE IS STUBBED FOR THE DURATION. The day block ends with
       `packSaveText(snapshot())` — the whole world serialised and then compressed — and this
       file rolls several hundred midnights. It was 95 seconds, almost all of it writing saves
       nobody reads, which is also why the windows below used to be too short to separate a
       rate from a stop. Put back at the end. */
    const _snap = snapshot, _pack = packSaveText;
    snapshot = () => ({});
    packSaveText = () => new Promise(() => {});
    const runDays = (n, keepAt) => {
      let births = 0;
      const real = log;
      window.log = (m, k) => { if (/child is born/i.test(String(m))) births++; return real(m, k); };
      for (let d = 0; d < n; d++) {
        hour = 23.999; update(1 / 30);
        if (keepAt) for (const c of keepAt.who) { c.x = keepAt.x + (c.sex === 'f' ? 0 : 0.5); c.y = keepAt.y; c.age = 26; }
      }
      window.log = real;
      return births;
    };

    /* ---------- 1. NOWHERE TO LIVE: A CHILD IS STARTED AND NEVER ARRIVES ----------
       The same hundred and twenty days as before and the same zero at the end of it, for a
       different reason. Both halves are asked, because the count alone cannot tell "the gate
       is still at the front" from "the gate has moved to the back". */
    guard(['aCoupleWithNowhereToLive', 'butTheyDoConceive'], () => {
      clean();
      const [w, h] = couple(me.x + 3, me.y + 3);
      let carried = 0;
      const real = log;
      let births = 0;
      window.log = (m, k) => { if (/child is born/i.test(String(m))) births++; return real(m, k); };
      for (let d = 0; d < 120; d++) {
        hour = 23.999; update(1 / 30);
        w.x = me.x + 3; w.y = me.y + 3; h.x = me.x + 3.5; h.y = me.y + 3; w.age = 26; h.age = 26;
        if ((w.pregnant || 0) > 0 || (h.pregnant || 0) > 0) carried++;
      }
      window.log = real;
      R.aCoupleWithNowhereToLive = births === 0
        ? 'a wed couple with nowhere to live still have no children in a hundred and twenty days'
        : `!! ${births} CHILDREN WITH NO ROOF ANYWHERE`;
      R.butTheyDoConceive = carried > 0
        ? `— but not because they cannot start one: she was carrying on ${carried} of those nights and had nowhere to deliver. The gate is at the far end now.`
        : '!! AND THEY NEVER CONCEIVED EITHER — the homestead is still a gate at the front';
      clean();
    });

    /* ---------- 2. AND WITH ONE, SOON ENOUGH TO SEE ----------
       The number that matters. The old rate put the first child fifty days out and behind a
       proximity test the couple failed most nights; "soon enough to notice you built the
       thing" is the whole request. */
    guard(['andWithOneTheyDo', 'andItIsQuickEnoughToNotice'], () => {
      clean();
      const hx = me.x + 12, hy = me.y + 12;
      house(hx, hy);
      const [w, h] = couple(hx, hy);
      let first = -1, births = 0;
      const real = log;
      window.log = (m, k) => { if (/child is born/i.test(String(m))) births++; return real(m, k); };
      for (let d = 0; d < 90; d++) {
        hour = 23.999; update(1 / 30);
        w.x = hx; w.y = hy; h.x = hx + 0.5; h.y = hy; w.age = 26; h.age = 26;
        if (births > 0 && first < 0) first = d + 1;
      }
      window.log = real;
      R.andWithOneTheyDo = births > 0
        ? `and a couple with a homestead have ${births} in ninety days, the first on day ${first}`
        : '!! A HOMESTEAD PRODUCED NO CHILDREN AT ALL';
      R.andItIsQuickEnoughToNotice = (first > 0 && first <= 45)
        ? `and the first arrives ${first} days after they move in — you can tell the house did it`
        : `!! THE FIRST CHILD TOOK ${first} DAYS`;
      clean();
    });

    /* ---------- 3. AND THE LIMITS HOLD ----------
       ASKED OF THE GUARDS, NOT OF NINE HUNDRED DAYS. A first version ran the couple for 900
       rollovers to watch a house fill up and timed the harness out on its own — a day rollover
       is the heaviest tick in this game (every town, every civ, the whole economy) and 1,300 of
       them is minutes of wall clock. The rules being tested are a full house and a cooldown, so
       set each one and show that nothing happens: same claim, forty days instead of nine
       hundred. */
    guard(['andAHouseFillsUp', 'andASeasonPassesBetween', 'andTheyComeOneAtATime'], () => {
      clean();
      const hx = me.x + 20, hy = me.y + 20;
      const h2 = house(hx, hy);
      const [w, h] = couple(hx, hy);
      /* A HUNDRED NIGHTS, NOT FORTY. At 2% against 12% a forty-night window separates the two
         rates by about four counts against one, which is not a margin — it is a coin landing
         the way you wanted. A hundred puts roughly two against twelve between them. */
      const window40 = (n = 100) => {
        let got = 0;
        for (let d = 0; d < n; d++) {
          hour = 23.999; update(1 / 30);
          /* AND THE AGE IS PINNED. Everything that breathes ages 1/7 of a year a midnight and
             conception stops at fifty; four windows of a hundred nights carried this couple to
             eighty-three, and the last two windows measured nothing but that. The forty-night
             version was already at forty-nine by its last window — right on the edge, passing. */
          w.x = hx; w.y = hy; h.x = hx + 0.5; h.y = hy; w.age = 26; h.age = 26;
          if ((w.pregnant || 0) > 0 || (h.pregnant || 0) > 0) { got++; w.pregnant = 0; h.pregnant = 0; }
        }
        return got;
      };
      const clear = () => { w.pregnant = 0; h.pregnant = 0; w.lastBorn = null; h.lastBorn = null; };
      /* a full house — under the new rule this is not a stop, it is the loss of a bonus */
      h2.kids = 3; h2.bornDay = -999; clear();
      const whenFull = window40();
      /* the same couple with no house at all, which is what a full house is now worth */
      const hi = pBuilds.indexOf(h2); pBuilds.splice(hi, 1);
      clear();
      const whenNone = window40();
      pBuilds.push(h2);
      /* a mother who has just given birth — THIS is the hard stop now, and it rides her rather
         than the building, because a couple on the road has no building to hang it on */
      /* SIXTY, BECAUSE THE SEASON IS NINETY. Asked over a hundred nights this window runs out
         the far side of the cooldown and counts the conceptions that are supposed to happen
         after it — three of them, which is the rule working and the probe misreading it. */
      h2.kids = 0; h2.bornDay = -999; clear(); w.lastBorn = day;
      const whenFresh = window40(60);
      /* and the control: none of it set, so the rule is not simply off */
      h2.kids = 0; h2.bornDay = -999; clear();
      const whenFree = window40();
      R.andAHouseFillsUp = whenFull < whenFree && Math.abs(whenFull - whenNone) <= Math.max(2, whenFree - whenFull)
        ? `and a full house stops being worth anything — ${whenFull} in a hundred nights against ${whenFree} with room, which is what the same couple manage with no house at all (${whenNone}). A homestead is not a barracks.`
        : `!! A FULL HOUSE IS STILL AS GOOD AS AN EMPTY ONE (full ${whenFull}, none ${whenNone}, free ${whenFree})`;
      R.andASeasonPassesBetween = whenFresh === 0
        ? 'and a season has to pass after each one — sixty nights of nothing, kept on the mother so it holds on the road too'
        : `!! ${whenFresh} PREGNANCIES INSIDE THE SEASON`;
      R.andTheyComeOneAtATime = whenFree > 0
        ? `while a house with room and no recent birth conceives ${whenFree} times in a hundred nights — the limits are limits, not an off switch`
        : '!! AN EMPTY HOUSE OFF COOLDOWN CONCEIVED NOTHING — THE RULE IS JUST OFF';
      clean();
    });

    /* ---------- 4. AND A HOMESTEAD IS A HOUSE ----------
       "shack beds are small and only fit one person. Also the actual model is tiny." Both are
       measurable: how many beds it puts down, and how much geometry it is against the shack. */
    guard(['aHomesteadSleepsAFamily'], () => {
      /* placed through `placeStructure`, the same call the build system makes, so the beds
         counted are the beds a player would get and not a copy of the intent */
      const bt = BUILD_TYPES.home;
      const n0 = beds.length;
      placeStructure('home', Math.round(me.x + 30), Math.round(me.y + 30));
      const homeBeds = beds.length - n0;
      const n1 = beds.length;
      placeStructure('shack', Math.round(me.x + 40), Math.round(me.y + 40));
      const shackBeds = beds.length - n1;
      R.aHomesteadSleepsAFamily = (bt.w === 4 && homeBeds >= 4 && shackBeds === 1)
        ? `and a homestead is ${bt.w}x${bt.h} laying ${homeBeds} beds, against a shack's 3x3 and ${shackBeds}`
        : `!! HOMESTEAD ${bt.w}x${bt.h} WITH ${homeBeds} BEDS, SHACK WITH ${shackBeds}`;
    });

    /* ---------- 5. AND IT IS ACTUALLY OFFERED ----------
       THE DOOR THE PLAYER HAS TO USE. This file's own build list carries a note about the
       holding cell: costed, placeable, described, and missing from `BUILD_CATS`, so it existed
       for every test that called `placeStructure` directly and for nobody who played the game.
       27 of 28 types were listed and the missing one was the one that got reported. The
       homestead is the 29th, so this asks the BAR rather than the table. */
    guard(['andYouCanActuallyBuildIt'], () => {
      const listed = BUILD_CATS.some(([, keys]) => keys.includes('home'));
      refreshBuildBar();
      const onBar = [...document.querySelectorAll('#buildbar .bbtn')]
        .some(x => /HOMESTEAD/i.test(x.textContent));
      R.andYouCanActuallyBuildIt = (listed && onBar)
        ? 'and HOMESTEAD is on the build bar — reachable by a player, not only by a harness'
        : `!! IN BUILD_CATS: ${listed}, ON THE BAR: ${onBar}`;
    });

    snapshot = _snap; packSaveText = _pack;
    return R;
  });

  const bad = Object.values(out).filter(v => typeof v === 'string' && v.startsWith('!!'));
  for (const [k, v] of Object.entries(out)) console.log('  ' + k.padEnd(30) + v);
  for (const e of errs) console.log('  ' + e);
  console.log('');
  console.log(bad.length || errs.length ? `NOBODY IS HAVING CHILDREN (${bad.length + errs.length})`
                                        : 'THERE ARE CHILDREN, AND THEY HAVE SOMEWHERE TO SLEEP');
  await b.close();
  process.exit(bad.length || errs.length ? 1 : 0);
})();
