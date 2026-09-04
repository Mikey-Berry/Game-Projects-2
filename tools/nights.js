#!/usr/bin/env node
/* HOW OFTEN THE MOON COMES UP WRONG.
 *
 * "We need a cooldown for blood moon events too. Getting them several times in a row is rough."
 *
 * A blood moon is not a difficulty knob, it is an EVENT — the design note above it in the game
 * file says so: "Once in a long while the moon comes up wrong... It should be a thing people
 * remember, not a weekly chore." What makes it memorable is the gap before the next one, and
 * nothing in the roll enforced a gap at all: it is an independent coin flipped every dawn, and
 * an independent coin clusters. That is not a bug in the odds; it is what odds without a floor
 * do, and it is why the report says "several times in a row" about a 2.2% roll.
 *
 * So the measurement is the GAP DISTRIBUTION over thousands of nights, not the mean rate — a
 * mean of one every thirty days is perfectly consistent with three in a fortnight.
 *
 *   node tools/nights.js [game.html]
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
  await p.waitForSelector('#btn-start', { state: 'attached', timeout: 60000 });
  await p.evaluate(() => { document.getElementById('btn-start').click(); paused = true; });
  await p.waitForTimeout(2600);

  const out = await p.evaluate(() => {
    const R = {};
    paused = true;
    const guard = (keys, fn) => {
      try { fn(); } catch (e) { for (const k of keys) if (R[k] === undefined) R[k] = '!! ' + String(e.message).slice(0, 100).toUpperCase(); }
    };

    /* ---------- ROLL THE DAWN, NOT THE WORLD ----------
       A day rollover is the heaviest tick in this game — every town, every civ, the whole
       economy — and this needs thousands of them. `bloodMoonRise` reads `day`, `rnd()` and
       `eldritchTide()` and writes `bloodMoon`; drive exactly that and nothing else, or the
       probe measures the machine's patience instead of the clock. */
    const sweep = (days, stage) => {
      fractureStage = stage; fracture = FRACTURE_STAGES[stage].at;
      bloodMoon = 0; bloodMoonWarned = false;
      if (typeof bloodMoonLast !== 'undefined') bloodMoonLast = -999;
      const nights = [];
      const d0 = day;
      for (let i = 0; i < days; i++) { day++; bloodMoonSet(); bloodMoonRise(); if (bloodMoon > 0) nights.push(day); }
      day = d0;
      const gaps = nights.slice(1).map((n, i) => n - nights[i]);
      return { nights, gaps, n: nights.length, days };
    };

    /* ---------- 1. THEY STILL HAPPEN, AND THEY ARE STILL RARE ----------
       A cooldown that made them vanish would be a worse game than one that clusters them. */
    let mid = null;
    guard(['theMoonStillComesUpWrong', 'andItIsStillRare'], () => {
      mid = sweep(6000, 3);
      const per = (mid.n / mid.days * 100).toFixed(2);
      R.theMoonStillComesUpWrong = mid.n > 60
        ? `${mid.n} red moons over ${mid.days} nights at THE WATCHERS WAKE — ${per}% of nights`
        : `!! ONLY ${mid.n} RED MOONS IN ${mid.days} NIGHTS — the cooldown has strangled the event`;
      R.andItIsStillRare = mid.n / mid.days < 0.06
        ? `and rare enough to be an event rather than weather (one every ${(mid.days / mid.n).toFixed(0)} nights on average)`
        : `!! ${per}% OF NIGHTS ARE RED — that is weather, not an event`;
    });

    /* ---------- 2. THE GAP HAS A FLOOR ----------
       THE REPORT, AS A NUMBER. The mean is not the complaint — "several times in a row" is a
       statement about the SHORTEST gaps, and an independent coin has no shortest gap worth
       the name. Measured on the build that shipped the complaint, the roll cleared the flag on
       the morning after and was free to fire again the next dawn: a floor of two days, with
       nothing stopping three red moons inside a week. */
    guard(['thereIsAFloorUnderIt', 'andNoRunsOfThem'], () => {
      const min = Math.min(...mid.gaps);
      const tightN = mid.gaps.filter(g => g < 14).length;
      R._gaps = `shortest ${min}, median ${mid.gaps.slice().sort((a, b) => a - b)[mid.gaps.length >> 1]}, longest ${Math.max(...mid.gaps)} nights apart — ${tightN} of ${mid.gaps.length} pairs inside a fortnight`;
      R.thereIsAFloorUnderIt = min >= BLOOD_MOON_GAP
        ? `no two red moons come closer than ${min} nights, against a floor of ${BLOOD_MOON_GAP}`
        : `!! TWO RED MOONS ${min} NIGHTS APART — THERE IS NO FLOOR`;
      /* and the floor has to bind often enough to be the thing the player feels */
      const tight = mid.gaps.filter(g => g < 14).length;
      R.andNoRunsOfThem = tight === 0
        ? `and not one pair of them lands inside a fortnight across ${mid.gaps.length} intervals`
        : `!! ${tight} PAIRS OF RED MOONS INSIDE A FORTNIGHT (of ${mid.gaps.length})`;
    });

    /* ---------- 2b. AND ONE MOON IS ONE NIGHT ----------
       THE HALF THE GAP TEST COULD NOT SEE, and the one the report was actually about. Counting
       ROLLS says the cooldown works, and it does — no two rolls closer than sixteen days. But
       the roll used to run at the DAY ROLLOVER while a night runs 19.5 to 5.5, so one moon
       painted the last five and a half hours of the night in progress, went out at sunrise, and
       came back at dusk for four and a half more before the calendar cleared it. Two red spans
       0.6 days apart, neither of them a whole night, from a single roll — which is "blood moon
       nights twice in a row" word for word, and which no cooldown on the roll could ever touch.
       So this steps the CLOCK, a quarter hour at a time, and counts what a player counts: a
       contiguous span of `bloodMoon && isNight()`. */
    guard(['oneMoonIsOneNight', 'andTheSpanIsAWholeNight'], () => {
      const keepDay = day, keepHour = hour;
      fractureStage = 3; fracture = FRACTURE_STAGES[3].at;
      bloodMoon = 0; bloodMoonLast = -999; day = 20; hour = 0;
      const spans = [];
      let inRed = false, from = 0;
      for (let step = 0; step < 24 * 4 * 3000; step++) {
        const prevH = hour;
        hour += 0.25;
        if (prevH <= DUSK_H && hour > DUSK_H) bloodMoonRise();
        if (prevH < DAWN_H && hour >= DAWN_H) bloodMoonSet();
        if (hour >= 24) { hour -= 24; day++; }
        const red = !!bloodMoon && isNight();
        if (red && !inRed) { inRed = true; from = day + hour / 24; }
        if (!red && inRed) { inRed = false; spans.push({ from, to: day + hour / 24 }); }
      }
      const gaps = spans.slice(1).map((sp, i) => sp.from - spans[i].to).sort((a, b) => a - b);
      const hoursOf = spans.map(sp => (sp.to - sp.from) * 24);
      const shortSpan = Math.min(...hoursOf);
      const backToBack = gaps.filter(g => g < 2).length;
      day = keepDay; hour = keepHour; bloodMoon = 0; bloodMoonLast = -999;
      R._spans = `${spans.length} red spans over 3000 nights; shortest gap ${gaps[0].toFixed(2)} days, median ${gaps[gaps.length >> 1].toFixed(1)}; spans run ${shortSpan.toFixed(1)}-${Math.max(...hoursOf).toFixed(1)}h`;
      R.oneMoonIsOneNight = backToBack === 0
        ? `not one red night follows another inside two days across ${gaps.length} intervals — a moon arrives once, not as a pre-dawn and an evening 0.6 days apart`
        : `!! ${backToBack} RED NIGHTS ARRIVE WITHIN TWO DAYS OF THE LAST (of ${gaps.length})`;
      R.andTheSpanIsAWholeNight = shortSpan > 8
        ? `and each one runs the whole dark — ${shortSpan.toFixed(1)}h at the shortest, dusk to dawn, rather than being cut in half by the calendar`
        : `!! THE SHORTEST RED SPAN IS ${shortSpan.toFixed(1)} HOURS — the moon is still being clipped by midnight`;
    });

    /* ---------- 3. AND THE SKY OPENING STILL MAKES IT WORSE ----------
       The tide is meant to buy more of them as the Fracture nears. A cooldown must slow the
       clustering without flattening that curve into a constant. */
    guard(['theSkyStillDrivesIt'], () => {
      const early = sweep(6000, 0), late = sweep(6000, 5);
      R._byStage = `THE DUST FALLS ${early.n} · THE WATCHERS WAKE ${mid.n} · THE SECOND FRACTURE ${late.n}, per 6000 nights`;
      R.theSkyStillDrivesIt = (late.n > early.n * 1.15 && mid.n >= early.n)
        ? `and the sky opening still buys more of them — ${early.n} at the start against ${late.n} at the end`
        : `!! THE STAGE NO LONGER MOVES THE RATE (${early.n} / ${mid.n} / ${late.n})`;
    });

    /* ---------- 4. AND THE FIRST ONE IS NOT ON DAY ONE ----------
       There is already a `day > 12` grace. It must survive whatever the cooldown does. */
    guard(['theFirstFortnightIsQuiet'], () => {
      let early = 0;
      for (let t = 0; t < 400; t++) {
        bloodMoon = 0; if (typeof bloodMoonLast !== 'undefined') bloodMoonLast = -999;
        const d0 = day; day = 1;
        /* `day > 12`, so the twelfth is the last quiet night and the thirteenth is fair game.
           Walking to 13 here reported "13 RED MOONS INSIDE THE OPENING GRACE" about a grace
           that was doing exactly what it says. Ask for the days the rule actually covers. */
        for (let i = 0; i < 11; i++) { day++; bloodMoonSet(); bloodMoonRise(); if (bloodMoon > 0) early++; }
        day = d0;
      }
      R.theFirstFortnightIsQuiet = early === 0
        ? 'and no red moon rises in the first twelve days, over four hundred fresh worlds'
        : `!! ${early} RED MOONS INSIDE THE OPENING GRACE`;
    });

    /* ---------- 5. AND THE COOLDOWN RIDES THE SAVE ----------
       A floor that resets on reload is a floor a player can walk through by saving. */
    guard(['theFloorRidesTheSave'], () => {
      bloodMoon = 0; bloodMoonLast = -999;
      day = 400;
      for (let i = 0; i < 200 && !bloodMoon; i++) { day++; bloodMoonSet(); bloodMoonRise(); }
      const fired = bloodMoonLast;
      restore(JSON.parse(JSON.stringify(snapshot())));
      R.theFloorRidesTheSave = (fired > 0 && bloodMoonLast === fired)
        ? `and the night it last happened (${fired}) survives a reload, so saving cannot shorten the gap`
        : `!! THE COOLDOWN RESETS ON LOAD (was ${fired}, came back ${bloodMoonLast})`;
    });

    return R;
  });

  const bad = Object.values(out).filter(v => typeof v === 'string' && v.startsWith('!!'));
  for (const [k, v] of Object.entries(out)) console.log('  ' + k.padEnd(28) + v);
  for (const e of errs) console.log('  ' + e);
  console.log('');
  console.log(bad.length || errs.length ? `THE MOON COMES UP WRONG TOO OFTEN (${bad.length + errs.length})`
                                        : 'A RED MOON IS SOMETHING YOU REMEMBER, NOT SOMETHING YOU EXPECT');
  await b.close();
  process.exit(bad.length || errs.length ? 1 : 0);
})();
