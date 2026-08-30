#!/usr/bin/env node
/* HOW LONG THE READING TAKES.
 *
 * Two reports about the same bench:
 *
 *   1. "Research is still pretty fast in general, especially with multiple people at the
 *      bench." The crew curve said the right thing — a second mind is worth most of another
 *      hand, a third less, a fourth has nowhere to stand — and said it only INSIDE one bench.
 *      Benches summed flat, so the curve was one bench away from being sidestepped entirely.
 *   2. "Studying old formulae to convert into insight should also take time. It should not be
 *      an instant transfer type thing." It was a button: click, the formulae vanish, the pool
 *      jumps. No bench, no scholar, no clock.
 *
 * Measured in game-HOURS of work rather than seconds of wall clock, which is what the design
 * is actually written in and the only figure that is stable under suite load.
 *
 *   node tools/study.js [game.html]
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
  await p.waitForTimeout(3000);
  /* START AND STOP IN THE SAME BREATH. A click followed by a wait lets the world run for
     however many frames the machine manages, which is not a fixed number and drops when a
     sixty-harness suite is loading the box — so every body is somewhere slightly different
     by the time this probe stages anything, and the numbers below inherit it. Measured on
     one unchanged build before this was applied here: flank.js gave 1.67 / 1.67 / 1.09 over
     three runs, and guns.js split three-to-two on an md5 that had not moved. Pausing inside
     the same evaluate leaves no frames at all between the two. Every file below sets
     `paused` for itself anyway; this only removes the window before its first statement. */
  await p.evaluate(() => { document.getElementById('btn-start').click(); paused = true; });
  await p.waitForTimeout(3000);

  const out = await p.evaluate(() => {
    const R = {};
    paused = true;

    let gx = 0, gy = 0;
    outer:
    for (let y = 60; y < H - 60; y += 5) for (let x = 60; x < W - 60; x += 5) {
      if (isBlocked(x + 0.5, y + 0.5)) continue;
      if (towns.some(t => dist(t.x, t.y, x, y) < 70)) continue;
      let ok = true;
      for (let j = -6; j <= 6 && ok; j++) for (let i = -6; i <= 6 && ok; i++)
        if (isBlocked(x + i + 0.5, y + j + 0.5)) ok = false;
      if (ok) { gx = x; gy = y; break outer; }
    }
    R.ground = gx ? `staged on open waste at ${gx},${gy}` : '!! NO OPEN GROUND';

    const wipe = () => {
      for (let i = chars.length - 1; i >= 0; i--) if (chars[i].__probe) chars.splice(i, 1);
      for (let i = pBuilds.length - 1; i >= 0; i--) if (pBuilds[i].__probe) pBuilds.splice(i, 1);
    };
    /* benches and crew, staged the way the camp actually holds them: `researchRate` counts
       bodies on the STUDY job within 3.2 tiles of a bench's centre */
    const stage = (benches, per) => {
      wipe();
      for (let n = 0; n < benches; n++) {
        const bx = gx + n * 8, by = gy;
        pBuilds.push({ type: 'r_bench', x: bx, y: by, w: 2, h: 2, floor: 0, hp: 90, maxHp: 90, progress: 1, __probe: true });
        for (let k = 0; k < per; k++) {
          const c = makeChar('Scholar', 'player', bx + 1, by + 1 + k * 0.4, { atk: 4, def: 4, tough: 8, ath: 6, magic: 20 });
          c.job = 'research'; c.__probe = true;
          chars.push(c);
        }
      }
      return researchRate();
    };

    const one = stage(1, 1), full = stage(1, 3), three = stage(3, 3), five = stage(5, 3);
    /* A GUARD, NOT A PROOF, and the tolerance says so. At 0.12 this also happened to fail on
       the old build for reading 1.16 — which is not what the line claims to be about. It
       checks one thing: the drag landed on the crowded end, not on the lone scholar. */
    R.aLoneScholarIsUnchanged = Math.abs(one - 1) < 0.25
      ? `one scholar at one bench still works at ${one.toFixed(2)}x — the low end is not being punished`
      : `!! A LONE SCHOLAR NOW WORKS AT ${one.toFixed(2)}x — THE FIX LANDED ON THE WRONG END`;
    R.aSecondBenchStillHelps = three > full * 1.3
      ? `and a camp of three staffed benches still beats one (${full.toFixed(2)}x -> ${three.toFixed(2)}x)`
      : `!! EXTRA BENCHES BUY NOTHING AT ALL (${full.toFixed(2)}x vs ${three.toFixed(2)}x) — THAT IS A DIFFERENT BUG`;
    /* the actual complaint: nine scholars must not be nine times one */
    R.benchesShareOneCurve = three < one * 5.5
      ? `but nine scholars are worth ${(three / one).toFixed(1)}x one, not nine — the benches share a curve`
      : `!! NINE SCHOLARS ARE WORTH ${(three / one).toFixed(1)}x ONE — BENCHES STILL SUM FLAT`;
    /* WHAT THE CURVE ACTUALLY PROMISES, which is not what the first draft of this line
       claimed. A power curve gives constant RELATIVE falloff, so the fifth bench is not
       worthless — it pays about three-quarters of what the third did. That is the real
       shape and the assertion says so; asserting "the fifth bench is a shed" would have
       been a sentence I liked rather than a thing I built. */
    R.eachBenchPaysLessThanTheLast = (five - three) < (three - full)
      ? `and benches four and five add ${(five - three).toFixed(2)}x where two and three added ${(three - full).toFixed(2)}x`
      : `!! BENCHES FOUR AND FIVE PAY AS WELL AS TWO AND THREE — THE CURVE IS NOT BITING`;

    /* ---- the tree takes longer in hours of work, not just in rate ---- */
    {
      stage(1, 1);
      cats = 999999;
      for (const k of Object.keys(stash)) stash[k] = 99999;
      research.done = {}; research.active = null; research.left = 0; research.study = null;
      const t = TECHS.construction;
      /* GUARDED so this file can be pointed at an older build for an A/B run. Referring to
         `RESEARCH_DRAG` bare threw a ReferenceError inside the evaluate on the build before
         it existed, which crashes the probe rather than failing the assertion — and a harness
         that cannot run against the broken build cannot prove it catches the bug. */
      const drag = (typeof RESEARCH_DRAG !== 'undefined') ? RESEARCH_DRAG : 1;
      research.active = 'construction'; research.left = t.hours * drag;
      R.theTreeIsLonger = research.left > t.hours
        ? `Construction is ${Math.round(research.left)}h of work where the table says ${t.hours}`
        : `!! THE TABLE HOURS ARE UNCHANGED (${research.left} vs ${t.hours})`;
      /* and it still finishes — a drag that never completes is a wall, not a pace */
      let h = 0;
      while (research.active && h < 4000) { researchTick(1); h++; }
      R.theTreeStillFinishes = !research.active && research.done.construction
        ? `and it still completes, after ${h} hours of a lone scholar's time`
        : `!! IT NEVER FINISHES (${Math.round(research.left)}h left after ${h} hours)`;
    }

    /* ---- the reading ---- */
    {
      stage(1, 2);
      research.done = {}; research.active = null; research.left = 0; research.study = null;
      research.rp = 0;
      const key = FORMULA_KEYS[0];
      for (const k of FORMULA_KEYS) stash[k] = 0;
      stash[key] = 4;
      const worth = ITEMS[key].rp * 4;

      /* the panel's own button, not a hand-rolled copy of it */
      openResearch();
      const btn = [...document.querySelectorAll('#modalbody button')].find(x => x.textContent.trim() === 'STUDY ALL');
      R.theStudyButtonIsThere = btn ? `the bench offers STUDY ALL for ${stash[key]} ${ITEMS[key].name}` : '!! NO STUDY ALL BUTTON';
      const rp0 = research.rp;
      if (btn) btn.click();
      R.studyingIsNotInstant = research.rp === rp0
        ? 'clicking it gives no insight on the spot'
        : `!! INSIGHT STILL ARRIVES THE INSTANT YOU CLICK (+${research.rp - rp0})`;
      R.theFormulaeAreCommitted = (stash[key] || 0) === 0
        ? 'the formulae have gone to the bench and are spent'
        : `!! THE FORMULAE WERE NOT TAKEN (${stash[key]} left)`;
      R.thereIsAReadingToDo = research.study && research.study.docs.length === 4 && research.study.left > 0
        ? `and there are ${research.study.docs.length} documents on the desk worth ${studyLeftRp()} insight, the first ${Math.ceil(research.study.left)}h off`
        : '!! NOTHING WAS QUEUED — THE FORMULAE WENT NOWHERE';

      /* ---------- THE INSIGHT DRIPS, ONE DOCUMENT AT A TIME ----------
         "Reading a ton of old formulae at once basically chunks it into one GIANT research
          project. That's fine — but the actual insight gleaned should drip out over time per
          formula studied, not be held in reserve until the entire goliath project finishes."
         So the test is not whether the total arrives. It is whether ANY of it arrives before
         the last page is turned — the old build paid nothing at all until the whole stack was
         done, and would sail through an assertion that only checked the final number. */
      let h = 0, firstPay = -1;
      while (research.study && h < 4000) {
        researchTick(1); h++;
        if (firstPay < 0 && research.rp > 0) firstPay = h;
      }
      R.theInsightDripsOut = (firstPay > 0 && firstPay < h * 0.5 && research.rp === worth)
        ? `the first document pays at hour ${firstPay} of ${h} — a quarter of the stack is not held hostage to the rest, and the total still comes to ${worth}`
        : `!! FIRST PAYMENT AT HOUR ${firstPay} OF ${h} (rp ${research.rp}, wanted ${worth})`;

      /* ---------- AND THE TREE RUNS BESIDE IT, OFF A SPLIT CREW ----------
         The rule used to be "one bench, one job" — reading returned out of `researchTick`
         before the tech project was touched at all. The note asked for the opposite: workable
         at the same time, but not by the same person. Two scholars means one on each. */
      research.rp = 0;
      stash[key] = 4;
      openResearch();
      const btn2 = [...document.querySelectorAll('#modalbody button')].find(x => x.textContent.trim() === 'STUDY ALL');
      if (btn2) btn2.click();
      research.active = 'construction'; research.left = 500;
      const left0 = research.left, read0 = studyLeftRp();
      const sides = benchSides();
      R.theCrewIsSplit = (sides.read.length === 1 && sides.tree.length === 1)
        ? 'two scholars at one bench go one to the desk and one to the tree — nobody works both'
        : `!! ${sides.read.length} ON THE DESK AND ${sides.tree.length} ON THE TREE, FROM A CREW OF 2`;
      for (let i = 0; i < 5; i++) researchTick(1);
      R.bothAdvanceAtOnce = (research.left < left0 && research.study && research.study.left > 0 && studyLeftRp() <= read0)
        ? `and both cranks turn: the project ${Math.round(left0)}h -> ${Math.round(research.left)}h while the desk works down its stack`
        : `!! tech ${left0} -> ${research.left}, desk ${read0} -> ${studyLeftRp()}`;
      /* AND NEITHER SIDE GETS THE WHOLE CREW'S CURVE. One mind is 1.0x; two on one job is
         1.7x. Split, each side must be at 1.0 — that is the whole of "two researchers
         shouldn't have 2x speed for BOTH". */
      const splitRate = researchRate(), splitRead = studyRate();
      research.study = null;
      const soloRate = researchRate();
      R.neitherSideGetsTheWholeCrew = (Math.abs(splitRate - 1) < 0.05 && Math.abs(splitRead - 1) < 0.05 && soloRate > splitRate * 1.3)
        ? `split, each side runs at ${splitRate.toFixed(2)}x; put both minds on the tree alone and it is ${soloRate.toFixed(2)}x`
        : `!! SPLIT ${splitRate.toFixed(2)}/${splitRead.toFixed(2)}, WHOLE CREW ON ONE ${soloRate.toFixed(2)}`;
      research.active = null; research.left = 0;
    }

    /* ---- and none of it happens with nobody at the bench ---- */
    {
      wipe();
      research.study = beginReading(['formula_t', 'formula_t']);
      const wasLeft = research.study.left;
      research.active = 'smithing'; research.left = 40;
      for (let i = 0; i < 20; i++) researchTick(1);
      R.anEmptyBenchReadsNothing = research.study.left === wasLeft && research.left === 40
        ? 'an empty bench reads nothing and researches nothing — the work does not do itself'
        : `!! WORK HAPPENS WITH NOBODY THERE (study ${research.study.left}, tech ${research.left})`;
      research.study = null; research.active = null; research.left = 0;
    }

    /* ---- the reading rides the save ---- */
    {
      research.study = beginReading(['formula_t', 'formula_w']);
      const snap = JSON.parse(JSON.stringify(snapshot()));
      /* THE WHOLE STACK, not just the hours. A save that carried the clock and dropped the
         documents would restore a desk that can never pay out. */
      R.theReadingRidesTheSave = snap.research && snap.research.study && snap.research.study.docs
        && snap.research.study.docs.length === 2 && snap.research.study.left > 0
        ? 'and a reading in progress rides the save with every document still on the desk'
        : `!! A READING IN PROGRESS IS LOST ON SAVE (${JSON.stringify(snap.research && snap.research.study)})`;
      research.study = null;
    }

    /* ================ AND A CRAFT IS WORK TOO ================
       The other half of the same report: "converting wood/stone into building materials — the
       craftsman should take a tad more time (sort of like the green bar built up when
       harvesting materials)." It used to resolve inside the click. */
    {
      wipe();
      research.done.construction = true;
      const bench = { type: 'workbench', x: gx, y: gy, w: 2, h: 2, floor: 0, hp: 90, maxHp: 90, progress: 1, __probe: true };
      pBuilds.push(bench);
      const smith = makeChar('Hand', 'player', gx + 1, gy + 1, { atk: 4, def: 4, tough: 8, ath: 6, crafting: 10 });
      smith.__probe = true; chars.push(smith);
      stash.wood = 100; stash.stone = 100;
      const mats0 = campHas('mats'), wood0 = stash.wood;

      const r = RECIPES.workbench.find(x => x.out === 'mats');
      smith.craftJob = { kind: 'workbench', out: 'mats', want: 1, done: 0, ruined: 0, made: {},
                         t: 0, dur: craftDur(smith, 'workbench'), bx: gx + 1, by: gy + 1 };
      const dur = smith.craftJob.dur;
      R.aCraftTakesTime = dur > 0.5
        ? `one Build Materials is ${dur.toFixed(1)}s of work for a hand with crafting 10`
        : `!! A CRAFT STILL TAKES NO TIME (${dur}s)`;

      /* half way through: nothing made, and NOTHING SPENT — an interrupted batch must be free */
      craftTick(smith, dur * 0.5);
      R.nothingIsSpentUpFront = stash.wood === wood0 && campHas('mats') === mats0
        ? 'half way through, no wood is gone and no materials exist yet'
        : `!! THE COST WAS TAKEN BEFORE THE WORK WAS DONE (wood ${wood0} -> ${stash.wood})`;
      R.theBarIsDrawable = smith.craftJob.t > 0 && smith.craftJob.dur > 0
        ? 'and there is progress for the work bar to read'
        : '!! NO PROGRESS FOR THE BAR TO SHOW';

      craftTick(smith, dur * 0.6);
      R.theCraftLands = campHas('mats') > mats0 && stash.wood < wood0
        ? `and when the work is done the materials are made (${mats0} -> ${campHas('mats')}) and the wood is spent`
        : `!! THE WORK FINISHED AND NOTHING WAS MADE (mats ${mats0} -> ${campHas('mats')})`;
      R.aSingleOrderEnds = !smith.craftJob
        ? 'a one-item order clears itself when it is done'
        : '!! THE JOB NEVER ENDS';

      /* walking away pauses rather than cancels, and costs nothing */
      smith.craftJob = { kind: 'workbench', out: 'mats', want: 5, done: 0, ruined: 0, made: {},
                         t: 0, dur, bx: gx + 1, by: gy + 1 };
      smith.x = gx + 20; smith.y = gy + 20;
      const wood1 = stash.wood;
      for (let i = 0; i < 20; i++) craftTick(smith, dur);
      R.awayFromTheBenchNothingHappens = stash.wood === wood1 && smith.craftJob && smith.craftJob.done === 0
        ? 'and a crafter who walks off the bench makes nothing and spends nothing until they come back'
        : `!! WORK CONTINUES AWAY FROM THE BENCH (done ${smith.craftJob && smith.craftJob.done}, wood ${wood1} -> ${stash.wood})`;
      /* and a new order takes them off it, with nothing lost */
      clearOrders(smith);
      R.aNewOrderCancelsCleanly = !smith.craftJob && stash.wood === wood1
        ? 'a new order takes them off the bench and nothing unmade was paid for'
        : `!! CANCELLING LEAKS (job ${!!smith.craftJob}, wood ${wood1} -> ${stash.wood})`;
    }

    wipe();
    return R;
  });

  console.log('=== THE BENCH, AND HOW LONG IT TAKES ===\n');
  for (const [k, v] of Object.entries(out)) console.log('  ' + k.padEnd(32) + v);
  const bad = Object.values(out).map(String).filter(v => v.startsWith('!!'));
  console.log('\n' + (bad.length ? '*** ' + bad.join('\n*** ')
    : 'THE TREE IS SLOWER, THE BENCHES SHARE A CURVE, AND READING A FORMULA IS WORK'));
  if (errs.length) { console.log('errs:', errs.length); errs.slice(0, 4).forEach(e => console.log('  ' + e)); }
  await b.close();
  if (bad.length) process.exitCode = 1;
})();
