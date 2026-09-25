#!/usr/bin/env node
/* NOT WALKING SEVENTEEN HUNDRED BODIES TO ASK ABOUT THREE.
 *
 *   "the FPS drop is pretty killer especially on the laptop" … "Always, even standing still."
 *
 * "Even standing still" is the whole diagnosis. A cost that is paid whether or not anything is
 * happening is a cost that does not scale with the fight, it scales with the ROSTER — and the
 * roster is seventeen hundred bodies. Measured before any of this: one sim step cost 13.6ms of
 * a 33.3ms budget at 30Hz, with nothing on screen and nobody moving.
 *
 * A line-level sampling profile of `update`'s own frame (tools/_lines.js, which reads the
 * `positionTicks` the CPU sampler records per line, so there is no wrapper on anything) found
 * that most of it was three questions about a handful of bodies, each answered by reading all
 * seventeen hundred:
 *
 *   · `_nearSquad(c)` — "is the squad near this body" — asked once per body per step. 6.1% of
 *     update's own frame, the single largest line in it.
 *   · THE HAUL LOOP — "is this body carrying a corpse" — a full walk of the roster per step to
 *     move a corpse along with the two or three people actually holding one. 6.7%.
 *   · THE BODYGUARD BLOCK — an `includes` and two `find`s over the whole roster, per guard, per
 *     step, running `hostile()` and `dist()` against every body in the world to find a threat
 *     standing within nine tiles of one person.
 *
 * None of the three is a rate change or a fidelity trade. Each is the same question asked of a
 * structure that already knows the answer: the spatial grid, a list gathered in the pass that
 * builds the grid, and — for `_nearSquad` — the `_cold` flag computed one line above it, which
 * already means "no player unit is on this floor" and therefore already implies the answer.
 *
 * THAT LAST ONE IS THE ONE TO DISTRUST, so claim 3 proves the implication on the live world
 * rather than asserting it, and claim 6 proves the grid sweep returns the same candidate set as
 * the roster scan it replaced, over a hundred random wards.
 *
 * MEASURED, interleaved A/B on an idle machine, three rounds each: 13.610 / 13.383 / 13.990 ms
 * a step before, 10.728 / 11.738 / 10.843 after. Counts are the claim below; the milliseconds
 * are colour, because this repo has been burned once already by a speedup that wasn't there.
 *
 * Anything starting '!!' fails the build.
 *
 *   node tools/walk.js [game.html]
 */
const { chromium } = require('playwright');
const path = require('path');
const gamePath = (a) => path.resolve(a ? (path.isAbsolute(a) ? a : path.join(__dirname, a)) : path.join(__dirname, 'game.html'));

(async () => {
  const b = await chromium.launch({
    executablePath: process.env.DUSTWARD_CHROME || undefined,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'],
  });
  const p = await b.newPage({ viewport: { width: 1200, height: 820 } });
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message.slice(0, 240)));
  await p.goto('file://' + gamePath(process.argv[2]), { waitUntil: 'load' });
  await p.waitForTimeout(3000);
  await p.evaluate(() => document.getElementById('btn-start').click());
  await p.waitForTimeout(3500);
  const R = {};

  /* ---- 1. THE HAUL LIST IS THE SHORT LIST, AND IT IS THE RIGHT ONE ----
     Two halves, and the second is the one that matters: a gathered list is only a speedup if it
     is EXACTLY the set the walk would have found. Compared against the filter it replaced. */
  const haul = await p.evaluate(() => {
    if (typeof carriers === 'undefined') return null;
    for (let i = 0; i < 30; i++) update(1 / 30);
    /* ---------- AND SOMEBODY HAS TO BE CARRYING, OR THE COMPARISON IS VACUOUS ----------
       The first cut compared the list against the filter and passed with "0 missing, 0 extra"
       on a world where nobody was holding anything: an empty list matching an empty set is
       every bit as true of a gather that never runs. So two bodies are given something to
       carry first, and the set compared is a set with things in it. */
    const hands = chars.filter(c => c.state === 'ok').slice(0, 2);
    const spare = corpses.filter(x => x && x.name).slice(0, 2);
    if (spare.length < 2 || hands.length < 2) return 'nocorpse';
    hands[0].carry = spare[0];
    hands[1].carryList = [spare[1]];
    update(1 / 30);                       /* the gather runs at the top of this one */
    const want = chars.filter(c => c.carry || (c.carryList && c.carryList.length));
    const got = carriers.slice();
    const out = {
      roster: chars.length, list: got.length, want: want.length,
      missing: want.filter(c => !got.includes(c)).length,
      extra: got.filter(c => !want.includes(c)).length,
    };
    hands[0].carry = null; hands[1].carryList = [];
    return out;
  });
  R.theHaulListIsShortNotTheRoster = !haul ? '!! NOTHING TO MEASURE — this build still walks the roster to find carriers'
    : haul === 'nocorpse' ? '!! NOTHING TO MEASURE — no corpses in the world to put in anybody\'s hands'
    : (haul.want >= 2 && haul.missing === 0 && haul.extra === 0 && haul.list < haul.roster * 0.05)
    ? `the haul loop reads ${haul.list} bodies instead of ${haul.roster}, and with two people deliberately given something to carry it is exactly the set the walk found — 0 missing, 0 extra of ${haul.want}`
    : `!! THE GATHERED LIST IS NOT THE SET THE WALK FOUND (${JSON.stringify(haul)})`;

  /* ---- 2. AND A CARRIER STILL CARRIES ----
     The list is rebuilt at the top of the step, so a body that picks something up is carrying it
     visibly from the NEXT step. Driven, because "one step later" is the kind of claim that turns
     into "never" when the gather sits on the wrong side of a `continue`. */
  const carried = await p.evaluate(() => {
    if (typeof carriers === 'undefined') return null;
    const me = player().find(c => c.state === 'ok');
    if (!me) return null;
    const body = corpses.find(x => x && x.name);
    if (!body) return 'nocorpse';
    me.carry = body; me.moveTarget = null; me.target = null;
    update(1 / 30);                        /* the gather happens at the top of this one */
    const listed = carriers.includes(me);
    me.x += 4; me.y += 3;
    update(1 / 30);
    const tracked = Math.abs(body.x - (me.x - 0.4)) < 0.01 && Math.abs(body.y - (me.y + 0.25)) < 0.01;
    me.carry = null;
    return { listed, tracked, bx: +body.x.toFixed(2), mx: +me.x.toFixed(2) };
  });
  R.andACarrierStillCarries = !carried ? '!! NOTHING TO MEASURE — no carriers list'
    : carried === 'nocorpse' ? '!! NOTHING TO MEASURE — no corpse in the world to pick up'
    : (carried.listed && carried.tracked)
    ? `somebody who picks a body up is on the haul list on the next step and the body follows them across the map (${carried.bx} against ${carried.mx})`
    : `!! A CARRIED BODY STOPPED FOLLOWING ITS CARRIER (${JSON.stringify(carried)})`;

  /* ---- 3. A COLD BODY CANNOT BE NEAR THE SQUAD, PROVEN RATHER THAN ASSERTED ----
     The short-circuit rests on `_cold` implying `!_nearSquad`. That is true by construction —
     `_cold` means no player unit is on this floor and `_nearSquad`'s first test is the floor —
     but "true by construction" is exactly the phrase that precedes the bugs in this repo's
     README. So the implication is re-derived here from the live world, for every cold body. */
  const imply = await p.evaluate(() => {
    if (typeof DEPTHS === 'undefined') return null;
    for (let i = 0; i < 20; i++) update(1 / 30);
    const pl = chars.filter(u => u.faction === 'player' && u.state !== 'dead');
    const cold = chars.filter(c => c._cold && c.state !== 'dead');
    if (!cold.length) return { cold: 0 };
    /* ---------- THE CLAIM IS THE IMPLICATION, NOT THE FLAG ----------
       The first cut also compared each body's `_lod` against the old expression and came back
       with twelve disagreements out of 1,133 — which is not a divergence, it is the same
       mistake this repo has already written down twice. `_lod` is written in the MIDDLE of a
       step and `ai` runs for that body immediately afterwards and can give it a quarry; read
       at the end of the step, a flag that said `!target` is compared against a body that now
       has one. It measures whether the body's own ai happened to fire on the last step —
       which is why the count moved between 0 and 12 depending only on how many updates the
       claim above it had run. The content of the short-circuit is the implication, and the
       implication is what is checked: no cold body is within reach of the squad, so the call
       that was skipped could only ever have returned false. */
    let nearAnyway = 0, onAWarmFloor = 0;
    const warm = new Set(pl.map(u => u.floor || 0));
    for (const c of cold) {
      const cf = c.floor || 0;
      if (pl.some(u => (u.floor || 0) === cf && Math.abs(u.x - c.x) < 40 && Math.abs(u.y - c.y) < 40)) nearAnyway++;
      if (warm.has(cf)) onAWarmFloor++;
    }
    return { cold: cold.length, squad: pl.length, nearAnyway, onAWarmFloor, floors: [...warm] };
  });
  R.aColdBodyIsNeverNearTheSquad = !imply ? '!! NOTHING TO MEASURE — no cold tier in this build'
    : !imply.cold ? '!! NOTHING TO MEASURE — nothing was cold'
    : (imply.nearAnyway === 0 && imply.onAWarmFloor === 0)
    ? `all ${imply.cold} cold bodies re-checked by hand against the ${imply.squad}-strong squad standing on ${JSON.stringify(imply.floors)}: 0 were on a floor the squad is on and 0 were within reach of it, so the call the short-circuit skips could only ever have returned false`
    : `!! THE SHORT-CIRCUIT SKIPPED A CALL THAT WOULD HAVE SAID YES (${JSON.stringify(imply)})`;

  /* ---- 4. AND THE GRID SWEEP FINDS WHAT THE ROSTER SCAN FOUND ----
     The bodyguard's threat search moved from two `chars.find`s to one `charsNear` sweep. Run
     both, side by side, for a hundred wards drawn from bodies all over the world, and compare
     the SETS — order is allowed to differ, membership is not. */
  const same = await p.evaluate(() => {
    if (typeof charsNear !== 'function') return null;
    const pick = [];
    for (let i = 0; i < chars.length && pick.length < 100; i += Math.max(1, (chars.length / 140) | 0)) {
      if (chars[i].state === 'ok') pick.push(chars[i]);
    }
    let checked = 0, disagree = 0, foundSomething = 0, frozenOnly = 0, unexplained = 0;
    const lost = [];
    const bad = [];
    /* ---------- AND THE OLD SIDE IS RESTRICTED TO WHAT THE GRID IS FOR ----------
       This claim read red for a long time and it was the claim that was wrong, not the sweep.
       `regridAll` files a body only `if(c.state === 'ok' && !bodyFrozen(c))` — a storey with
       nobody of yours on it is FROZEN and deliberately absent from the grid, which is most of
       the point of having one. The roster scan reproduced here had no such clause, so it was
       asking a different question: measured, 22 of 100 pairs disagreed and **all 22 of them
       were frozen bodies, with 0 unexplained**. Comparing a sweep of the live world against a
       scan of the whole world can only ever fail.
       So the old side is restricted to what the grid is defined to hold, and the exclusion
       itself becomes its own claim below rather than noise in this one. */
    const live = (o) => o.state === 'ok' && !(typeof bodyFrozen === 'function' && bodyFrozen(o));
    for (const w of pick) {
      for (const c of [pick[(pick.indexOf(w) + 7) % pick.length]]) {
        if (c === w) continue;
        checked++;
        /* the old code, verbatim but for the freeze the grid already applies */
        const oldOn = chars.filter(o => live(o) && o.target === w && hostile(c, o) && dist(o.x, o.y, w.x, w.y) < 9);
        const oldNear = chars.filter(o => live(o) && hostile(c, o) && dist(o.x, o.y, w.x, w.y) < 5);
        /* the new sweep, verbatim */
        const newOn = [], newNear = [];
        for (const o of charsNear(w.x, w.y, 9).slice()) {
          if (o.state !== 'ok') continue;
          const dw2 = dist(o.x, o.y, w.x, w.y);
          if (dw2 >= 9) continue;
          if (!hostile(c, o)) continue;
          if (o.target === w) newOn.push(o);
          else if (dw2 < 5) newNear.push(o);
        }
        const setEq = (a, b2) => a.length === b2.length && a.every(x => b2.includes(x));
        /* oldNear includes bodies that are also on the ward; fold them in before comparing */
        const newNearAll = newNear.concat(newOn.filter(o => dist(o.x, o.y, w.x, w.y) < 5));
        if (oldOn.length + oldNear.length) foundSomething++;
        if (!setEq(oldOn, newOn) || !setEq(oldNear, newNearAll)) {
          disagree++;
          if (bad.length < 3) bad.push({ oldOn: oldOn.length, newOn: newOn.length, oldNear: oldNear.length, newNear: newNearAll.length });
        }
        /* and the exclusion, counted as itself: an UNRESTRICTED scan may only ever differ by
           bodies the freeze holds. Anything else is the grid losing somebody, which is the
           fault this whole claim exists to catch. */
        const rawNear = chars.filter(o => o.state === 'ok' && hostile(c, o) && dist(o.x, o.y, w.x, w.y) < 5);
        const extra = rawNear.filter(o => !newNearAll.includes(o) && !newOn.includes(o));
        /* ITS OWN COUNTER AND ITS OWN LIST. Sharing `bad` with the claim above meant three
           ordinary disagreements could fill it first and a real loss would go unrecorded —
           a claim that cannot fail is not a claim. */
        if (extra.length && extra.every(o => typeof bodyFrozen === 'function' && bodyFrozen(o))) frozenOnly++;
        else if (extra.length) {
          unexplained++;
          if (lost.length < 3) lost.push(extra.slice(0, 3).map(o => `${o.name} f${o.floor || 0} at ${dist(o.x, o.y, w.x, w.y).toFixed(1)}`).join(' ; '));
        }
      }
    }
    return { checked, disagree, foundSomething, frozenOnly, unexplained, lost, bad };
  });
  R.andTheGridFindsWhatTheRosterFound = !same ? '!! NOTHING TO MEASURE — no spatial grid'
    : (same.checked > 40 && same.disagree === 0 && same.foundSomething > 0)
    ? `the grid sweep and the roster scan agree on every one of ${same.checked} ward/guard pairs drawn from across the world, ${same.foundSomething} of which had somebody to find`
    : `!! THE GRID SWEEP FOUND A DIFFERENT SET (${JSON.stringify(same)})`;
  /* the exclusion, said out loud. It is the whole reason the sweep is cheap and it is the one
     way a "faster" grid could quietly start losing bodies that matter. */
  R.andTheOnlyThingItLeavesOutIsAFrozenStorey = !same ? '!! NOTHING TO MEASURE — no spatial grid'
    : same.unexplained
    ? `!! THE GRID LOST ${same.unexplained} BODY/BODIES THAT WERE NOT FROZEN (${JSON.stringify(same.lost)})`
    : `${same.frozenOnly} of ${same.checked} pairs had a body the whole-roster scan sees and the grid does not, and every one of them was on a storey nobody of yours is standing on`;

  /* ---- AND NOT THROUGH THE FLOOR ----
     `dist` is two-dimensional, so a body standing directly under the ward is at distance zero
     from it. `nearestEnemy` refuses a body on another storey and this sweep did not — it was
     covered by accident, because the grid holds nothing on a frozen storey and a storey with
     nobody of yours on it is frozen. Staged rather than sampled, because the live world does
     not reliably produce the case: 10 cross-storey pairs inside nine tiles and 0 of 53 guard
     picks landing on one. A guard that charges something under its feet is the failure. */
  const throughFloor = await p.evaluate(() => {
    const pl = player().filter(c => c.state === 'ok');
    if (pl.length < 2) return null;
    const ward = pl[0], guard = pl[1];
    ward.floor = 0; guard.floor = 0;
    guard.x = ward.x + 1.2; guard.y = ward.y;
    /* a hostile on the storey below, on the ward's own tile, and NOT frozen — which is what
       having one of yours down there buys it */
    const q = findOpenNear(Math.round(ward.x), Math.round(ward.y), 4);
    const foe = makeChar('Cellar Thing', 'bandit', q.x, q.y, { atk: 12, def: 10, tough: 12 });
    foe.state = 'ok'; foe.floor = -1; foe.provoked = true;
    chars.push(foe);
    const mine = makeChar('Down There', 'player', q.x, q.y, { atk: 10, def: 10, tough: 10 });
    mine.state = 'ok'; mine.floor = -1;
    chars.push(mine);
    update(1 / 30);
    const seen = charsNear(ward.x, ward.y, 9).some(o => o === foe);
    /* ---------- DRIVEN, NOT RE-IMPLEMENTED ----------
       A first cut of this copied the guard's threat loop into the harness, floor test and all,
       so it refused the body below whatever the game did — a claim that cannot fail. The real
       block is the thing under test, so the guard is given the ward and the world is stepped,
       and what is read back is the target the game chose. */
    clearOrders(guard);
    guard.guardTarget = ward; guard.target = null; guard.targetManual = false;
    for (let i = 0; i < 12; i++) update(1 / 30);
    const out = { inGrid: seen, pickedTheCellarThing: guard.target === foe, hostile: hostile(guard, foe),
                  chose: guard.target ? guard.target.name : 'nothing',
                  d: +dist(foe.x, foe.y, ward.x, ward.y).toFixed(2) };
    guard.guardTarget = null; guard.target = null;
    for (const x of [foe, mine]) { const i = chars.indexOf(x); if (i >= 0) chars.splice(i, 1); }
    return out;
  });
  R.andAGuardDoesNotStepInThroughTheFloor = !throughFloor ? '!! NOTHING TO MEASURE — not enough player bodies to stage a ward and a guard'
    : !throughFloor.hostile ? '!! NOTHING TO MEASURE — the staged body was not hostile to the guard'
    : !throughFloor.inGrid ? '!! NOTHING TO MEASURE — the grid never handed the body below back, so no floor test was exercised'
    : !throughFloor.pickedTheCellarThing
    ? `a hostile standing ${throughFloor.d} tiles from the ward but one storey down is handed back by the grid and refused by the real guard block — it chose ${throughFloor.chose}`
    : `!! A GUARD PICKED A THREAT ON ANOTHER STOREY AS A THREAT TO ITS WARD (${JSON.stringify(throughFloor)})`;

  /* ---- 5. AND A GUARD STILL STEPS IN, AND STILL LETS GO ----
     The behaviour either side of the rewrite, driven. The second half is the `includes` that
     became a `charById` check: a ward spliced out of the world must still be dropped. */
  const guard = await p.evaluate(() => {
    const pl = player().filter(c => c.state === 'ok');
    if (pl.length < 2) return null;
    const ward = pl[0], g = pl[1];
    const x = ward.x, y = ward.y, F = ward.floor || 0;
    ward.moveTarget = null; ward.target = null; ward.attackMove = null;
    g.moveTarget = null; g.target = null; g.targetManual = false; g.attackMove = null;
    g.guardTarget = ward; g.x = x - 1.5; g.y = y;
    const foe = makeChar('Menace', 'bandit', x + 2.0, y, { atk: 20, tough: 20 });
    foe.floor = F; foe.target = ward; foe.__probe = true;
    chars.push(foe);
    let took = false;
    for (let i = 0; i < 20 && !took; i++) { update(1 / 30); if (g.target === foe) took = true; }
    /* ---------- AND THE GUARD HAS TO BE PUT DOWN BEFORE IT WILL LOOK UP ----------
       The first cut spliced the ward out while the guard still had the threat, and the guard
       kept its ward — on the rewritten build AND on the build before it, identically. That is
       not the check failing, it is `ai` returning at `if(c.target) return` some two and a half
       thousand lines above the bodyguard block: a guard with a quarry does not re-read its
       ward at all, which was exactly as true of the `chars.includes` this replaced. So the
       quarry is taken away first, and what is then measured is the thing that changed. */
    const wi = chars.indexOf(ward); if (wi >= 0) chars.splice(wi, 1);
    const fi0 = chars.indexOf(foe); if (fi0 >= 0) chars.splice(fi0, 1);
    g.target = null; g.windup = null; g.moveTarget = null;
    update(1 / 30); update(1 / 30);
    const letGo = !g.guardTarget;
    chars.push(ward);
    g.guardTarget = null; g.target = null;
    return { took, letGo };
  });
  R.andAGuardStillStepsInAndStillLetsGo = !guard ? '!! NOTHING TO MEASURE — fewer than two able bodies in the squad'
    : (guard.took && guard.letGo)
    ? `a guard put a threat on its ward inside twenty steps through the grid sweep, and dropped a ward that was spliced out of the roster without an includes() to tell it`
    : `!! THE GUARD MISSED ITS THREAT OR KEPT A WARD THAT LEFT THE WORLD (${JSON.stringify(guard)})`;

  /* ---- 6. AND THE STEP IS CHEAPER — PRINTED, NOT ASSERTED ----
     A millisecond on a shared machine is a coin. The counts above are the claim; this is here so
     a regression shows up as a number somebody can look at, and it is deliberately not a gate. */
  const cost = await p.evaluate(() => {
    const D = 1 / 30;
    for (let i = 0; i < 20; i++) update(D);
    const runs = [];
    for (let k = 0; k < 5; k++) {
      const t0 = performance.now();
      for (let i = 0; i < 200; i++) update(D);
      runs.push((performance.now() - t0) / 200);
    }
    runs.sort((a, b2) => a - b2);
    return { med: +runs[2].toFixed(3), bodies: chars.length };
  });
  R.andTheStepCostsThisMuch = `${cost.med} ms a sim step with ${cost.bodies} bodies, against a 33.3ms budget at 30Hz — colour only, not a gate`;

  await b.close();
  for (const e of errs) console.log(e);
  for (const k of Object.keys(R)) console.log(`*** ${k}: ${R[k]}`);
})();
