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
    const want = chars.filter(c => c.carry || (c.carryList && c.carryList.length));
    const got = carriers.slice();
    return {
      roster: chars.length, list: got.length, want: want.length,
      missing: want.filter(c => !got.includes(c)).length,
      extra: got.filter(c => !want.includes(c)).length,
    };
  });
  R.theHaulListIsShortNotTheRoster = !haul ? '!! NOTHING TO MEASURE — this build still walks the roster to find carriers'
    : (haul.missing === 0 && haul.extra === 0 && haul.list < haul.roster * 0.05)
    ? `the haul loop reads ${haul.list} bodies instead of ${haul.roster}, and it is exactly the set the walk found — 0 missing, 0 extra`
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
    /* the old expression, recomputed by hand: would `_nearSquad` have found anyone? */
    let nearAnyway = 0, lodWrong = 0;
    for (const c of cold) {
      const cf = c.floor || 0;
      const near = pl.some(u => (u.floor || 0) === cf && Math.abs(u.x - c.x) < 40 && Math.abs(u.y - c.y) < 40);
      if (near) nearAnyway++;
      const wouldBe = c.faction !== 'player' && !c.target && !c.windup && !near;
      if (!!c._lod !== !!wouldBe) lodWrong++;
    }
    return { cold: cold.length, squad: pl.length, nearAnyway, lodWrong };
  });
  R.aColdBodyIsNeverNearTheSquad = !imply ? '!! NOTHING TO MEASURE — no cold tier in this build'
    : !imply.cold ? '!! NOTHING TO MEASURE — nothing was cold'
    : (imply.nearAnyway === 0 && imply.lodWrong === 0)
    ? `all ${imply.cold} cold bodies re-checked against the ${imply.squad}-strong squad by hand: 0 were near it, so the skipped call could only have returned false, and 0 came out with a different _lod than the old expression gives`
    : `!! THE SHORT-CIRCUIT CHANGED AN ANSWER (${JSON.stringify(imply)})`;

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
    let checked = 0, disagree = 0, foundSomething = 0;
    const bad = [];
    for (const w of pick) {
      for (const c of [pick[(pick.indexOf(w) + 7) % pick.length]]) {
        if (c === w) continue;
        checked++;
        /* the old code, verbatim */
        const oldOn = chars.filter(o => o.state === 'ok' && o.target === w && hostile(c, o) && dist(o.x, o.y, w.x, w.y) < 9);
        const oldNear = chars.filter(o => o.state === 'ok' && hostile(c, o) && dist(o.x, o.y, w.x, w.y) < 5);
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
      }
    }
    return { checked, disagree, foundSomething, bad };
  });
  R.andTheGridFindsWhatTheRosterFound = !same ? '!! NOTHING TO MEASURE — no spatial grid'
    : (same.checked > 40 && same.disagree === 0 && same.foundSomething > 0)
    ? `the grid sweep and the roster scan agree on every one of ${same.checked} ward/guard pairs drawn from across the world, ${same.foundSomething} of which had somebody to find`
    : `!! THE GRID SWEEP FOUND A DIFFERENT SET (${JSON.stringify(same)})`;

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
    /* and now take the ward out of the world entirely — not killed, REMOVED */
    const wi = chars.indexOf(ward); if (wi >= 0) chars.splice(wi, 1);
    update(1 / 30); update(1 / 30);
    const letGo = !g.guardTarget;
    chars.push(ward);
    const fi = chars.indexOf(foe); if (fi >= 0) chars.splice(fi, 1);
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
