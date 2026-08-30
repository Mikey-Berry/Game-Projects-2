#!/usr/bin/env node
/* THE DESK: WHO IS AT IT, HOW LONG IT TAKES, AND WHETHER ANYBODY GETS BETTER AT SITTING THERE.
 *
 * Three notes about the same building:
 *   · "The current scriptorium UI is really clunky. For one, it allows you to train anyone,
 *      anywhere. It should ONLY train the person at the bench — implying that they are
 *      studying. And as with the pattern we've been working on, it should take time to train
 *      them. The UI itself can be reworked with these principles in mind."
 *   · "Studying should have a separate skill related to it. I feel like we talked about this
 *      before but I don't see anything in the UI that indicates someone can improve in
 *      studying (a skill very distinct from say, labor)."
 *   · "Reading a ton of old formulae at once basically chunks it into one GIANT research
 *      project... the actual insight gleaned should drip out over time per formula studied."
 *
 * `study.js` owns the bench arithmetic — the crew curve, the split, the drip. This file is
 * about the SCRIPTORIUM, which was a shop counter: every living body in the squad listed with
 * four buttons apiece, and pressing one moved an attunement tier the instant you pressed it,
 * from anywhere on the map. Nothing about it was a building.
 *
 * THE HARD PART OF TESTING A UI IS THAT ITS ABSENCE LOOKS LIKE ITS PRESENCE. A panel listing
 * nobody passes "does not list the man across the map" for the wrong reason, so every claim
 * here is a pair: the person at the desk IS there and the person forty tiles away IS NOT.
 *
 *   node tools/scholars.js [game.html]
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
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message.slice(0, 200)));
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

    let gx = 0, gy = 0;
    outer:
    for (let y = 60; y < H - 60; y += 5) for (let x = 60; x < W - 60; x += 5) {
      if (towns.some(t => dist(t.x, t.y, x, y) < 70)) continue;
      let ok = true;
      for (let j = -7; j <= 7 && ok; j++) for (let i = -7; i <= 7 && ok; i++)
        if (isBlocked(x + i + 0.5, y + j + 0.5)) ok = false;
      if (ok) { gx = x; gy = y; break outer; }
    }
    R._where = gx ? `staged on open waste at ${gx},${gy}` : '!! NO OPEN GROUND';

    const made = [];
    const wipe = () => {
      while (made.length) { const c = made.pop(); const i = chars.indexOf(c); if (i >= 0) chars.splice(i, 1); }
      for (let i = pBuilds.length - 1; i >= 0; i--) if (pBuilds[i].__probe) pBuilds.splice(i, 1);
    };
    const put = (name, x, y, o) => {
      const c = makeChar(name, 'player', x, y, Object.assign({ atk: 6, def: 6, tough: 10, ath: 6, magic: 6 }, o || {}));
      c.state = 'ok'; c.x = x; c.y = y;
      chars.push(c); made.push(c);
      return c;
    };
    const desk = () => {
      const b2 = { type: 'script', x: gx, y: gy, w: 2, h: 2, floor: 0, hp: 90, maxHp: 90, progress: 1, __probe: true };
      pBuilds.push(b2);
      return b2;
    };
    const panel = () => {
      const el = document.getElementById('modalbody');
      return el ? el.textContent : '';
    };

    /* ---------- 1. THE STUDY SKILL EXISTS AND IS ON THE SHEET ---------- */
    guard(['thereIsAStudySkill', 'andItIsOnTheCharacterSheet'], () => {
      wipe();
      const u = put('Reader', gx, gy);
      R.thereIsAStudySkill = typeof u.stats.study === 'number' && u.stats.study >= 1
        ? `every body carries a study skill (a fresh one starts at ${u.stats.study})`
        : `!! THERE IS NO STUDY SKILL (${u.stats.study})`;
      /* ON THE SHEET, which is the actual complaint: "I don't see anything in the UI that
         indicates someone can improve in studying." */
      selected = [u];
      refreshCharPanel();
      const sheet = (document.getElementById('stats') || {}).textContent || '';
      R.andItIsOnTheCharacterSheet = /study/i.test(sheet)
        ? 'and it is written on the character sheet beside labor, where a player can watch it move'
        : `!! STUDY IS NOT ON THE SHEET (${sheet.slice(0, 90)})`;
    });

    /* ---------- 2. AND IT GROWS FROM BENCH WORK, AND SETS THE PACE ---------- */
    guard(['sittingAtABenchTeachesIt', 'andASharperScholarReadsFaster'], () => {
      wipe();
      const bench = { type: 'r_bench', x: gx, y: gy, w: 2, h: 2, floor: 0, hp: 90, maxHp: 90, progress: 1, __probe: true };
      pBuilds.push(bench);
      const u = put('Scholar', gx + 1, gy + 1, { labor: 5 });
      u.job = 'research';
      research.done = {}; research.active = 'construction'; research.left = 500; research.study = null; research.queue = [];
      const s0 = u.stats.study, l0 = u.stats.labor;
      paused = false; for (let i = 0; i < 400; i++) update(0.1); paused = true;
      R.sittingAtABenchTeachesIt = (u.stats.study > s0 && u.stats.labor === l0)
        ? `forty seconds at a bench takes study ${s0.toFixed(1)} -> ${u.stats.study.toFixed(2)} and leaves labor where it was — a distinct skill, not a rename of the shovel`
        : `!! study ${s0} -> ${u.stats.study.toFixed(2)}, labor ${l0} -> ${u.stats.labor.toFixed(2)}`;
      /* and the bench reads it: a sharper scholar is a faster one */
      const slow = researchRate();
      u.stats.study = 60;
      const fast = researchRate();
      u.stats.study = s0;
      R.andASharperScholarReadsFaster = fast > slow * 1.15
        ? `and the pace reads it: study 60 works at ${(fast / slow).toFixed(2)}x a raw hand's rate`
        : `!! STUDY DOES NOT SET THE PACE (${slow.toFixed(2)} -> ${fast.toFixed(2)})`;
      research.active = null; research.left = 0;
    });

    /* ---------- 3. THE SCRIPTORIUM TEACHES THE PERSON AT THE DESK, AND NOBODY ELSE ----------
       IN A PAIR. A panel that lists nobody passes "does not list the man across the map" for
       entirely the wrong reason, so both halves are asserted off one render. */
    guard(['onlyThePupilAtTheDesk'], () => {
      wipe();
      const d = desk();
      const near = put('Pupil', gx + 1, gy + 1.4);
      const far = put('Absent', gx + 40, gy + 40);
      research.rp = 200;
      openScriptorium(d);
      const txt = panel();
      const listsNear = txt.includes('Pupil'), listsFar = txt.includes('Absent');
      R.onlyThePupilAtTheDesk = (listsNear && !listsFar)
        ? 'the panel lists the body standing at the desk and not the one forty tiles away — which is the whole of "it should ONLY train the person at the bench"'
        : `!! atTheDesk=${listsNear} acrossTheMap=${listsFar}`;
      closeModal();
    });

    /* ---------- 4. AND A COURSE TAKES HOURS ---------- */
    guard(['tuitionIsNotInstant', 'theCourseRuns', 'andBuysExactlyOneTier'], () => {
      wipe();
      const d = desk();
      const u = put('Pupil', gx + 1, gy + 1.4);
      u.gift = 'dark';
      research.rp = 200;
      const tier0 = attOf(u, 'dark'), rp0 = research.rp;
      openScriptorium(d);
      /* THE BUTTON FOR THE ART BEING ASSERTED. Picking the first course button on the row buys
         whichever branch `BRANCHES` happens to list first, and then the test reads a different
         art's tier and reports that nothing was learned. */
      const btn = [...document.querySelectorAll('#modalbody [data-study]')].find(x => x.dataset.study.endsWith('|dark'));
      R.tuitionIsNotInstant = btn ? '' : '!! THE DESK OFFERS NO COURSE AT ALL';
      if (btn) {
        btn.click();
        R.tuitionIsNotInstant = (attOf(u, 'dark') === tier0 && d.tuition && d.tuition.left > 0)
          ? `pressing it starts ${Math.ceil(d.tuition.left)}h of work and moves nothing — the tier does not arrive on the click`
          : `!! tier ${tier0} -> ${attOf(u, 'dark')} on the click, tuition ${JSON.stringify(d.tuition)}`;
        R._fee = `it cost ${rp0 - research.rp} insight up front`;
        /* run the clock. The pupil is at the desk, so it should tick. */
        const h0 = d.tuition.left;
        for (let i = 0; i < 5; i++) scriptTick(1);
        R.theCourseRuns = d.tuition && d.tuition.left < h0
          ? `and the hours come off it while they sit there (${Math.ceil(h0)}h -> ${Math.ceil(d.tuition.left)}h)`
          : `!! THE COURSE DOES NOT ADVANCE (${h0} -> ${d.tuition ? d.tuition.left : 'gone'})`;
        let n = 0;
        while (d.tuition && n < 400) { scriptTick(1); n++; }
        R.andBuysExactlyOneTier = (attOf(u, 'dark') === tier0 + 1 && !d.tuition)
          ? `and after ${n + 5} hours it buys ONE tier — ${tier0} to ${attOf(u, 'dark')}, not a tier and a slice of the next`
          : `!! ${tier0} -> ${attOf(u, 'dark')} after ${n} more hours (tuition ${!!d.tuition})`;
      } else { R.theCourseRuns = '!! not reached'; R.andBuysExactlyOneTier = '!! not reached'; }
      closeModal();
    });

    /* ---------- 5. AND IT STOPS IF THEY WALK OFF ----------
       "Implying that they are studying" is a claim about where the body is, every hour, not
       only at the moment the order was given. */
    guard(['walkingOffStopsTheLesson', 'andComingBackResumesIt'], () => {
      wipe();
      const d = desk();
      const u = put('Pupil', gx + 1, gy + 1.4);
      research.rp = 200;
      d.tuition = { who: u.id, br: 'dark', left: 30, fee: 10, stalled: false };
      rebuildCharGrid();
      u.x = gx + 30; u.y = gy + 30;
      const before = d.tuition.left;
      for (let i = 0; i < 5; i++) scriptTick(1);
      R.walkingOffStopsTheLesson = (d.tuition.left === before && d.tuition.stalled)
        ? 'a pupil who wanders off stops learning — the hours stop coming off the course'
        : `!! THE LESSON RAN WITHOUT THEM (${before} -> ${d.tuition.left})`;
      u.x = gx + 1; u.y = gy + 1.4;
      rebuildCharGrid();
      for (let i = 0; i < 3; i++) scriptTick(1);
      R.andComingBackResumesIt = d.tuition.left < before
        ? `and it picks straight back up when they sit down again (${before}h -> ${Math.ceil(d.tuition.left)}h)`
        : `!! IT NEVER RESUMES (${before} -> ${d.tuition.left})`;
    });

    /* ---------- 6. CALLING IT OFF REFUNDS THE FEE, NOT THE HOURS ---------- */
    guard(['callingItOffRefundsTheFee'], () => {
      wipe();
      const d = desk();
      const u = put('Pupil', gx + 1, gy + 1.4);
      research.rp = 100;
      d.tuition = { who: u.id, br: 'dark', left: 30, fee: 10, stalled: false };
      openScriptorium(d);
      const cb = [...document.querySelectorAll('#modalbody button')].find(x => /CALL IT OFF/.test(x.textContent));
      const rp0 = research.rp;
      if (cb) cb.click();
      R.callingItOffRefundsTheFee = (cb && !d.tuition && research.rp === rp0 + 10)
        ? `abandoning a course hands the 10 insight back (${rp0} -> ${research.rp}) and leaves the hours spent`
        : `!! button=${!!cb} tuition=${!!d.tuition} rp ${rp0} -> ${research.rp}`;
      closeModal();
    });

    /* ---------- 7. AND A COURSE IN PROGRESS RIDES THE SAVE ----------
       Forty hours of somebody's life is exactly the sort of thing this project keeps dropping
       across a boundary — see the ledger, five times now. */
    guard(['theCourseRidesTheSave'], () => {
      wipe();
      const d = desk();
      const u = put('Pupil', gx + 1, gy + 1.4);
      d.tuition = { who: u.id, br: 'dark', left: 22, fee: 10, stalled: false };
      const snap = JSON.parse(JSON.stringify(snapshot()));
      const row = snap.pBuilds.find(x => x.type === 'script' && x.tuition);
      R.theCourseRidesTheSave = (row && row.tuition.left === 22 && row.tuition.br === 'dark')
        ? 'a course in progress is written into the save with its pupil, its art and its hours'
        : `!! THE COURSE IS LOST ON SAVE (${JSON.stringify(row && row.tuition)})`;
      wipe();
    });

    return R;
  });

  const bad = Object.values(out).filter(v => typeof v === 'string' && v.startsWith('!!'));
  for (const [k, v] of Object.entries(out)) console.log('  ' + k.padEnd(30) + v);
  for (const e of errs) console.log('  ' + e);
  console.log('');
  console.log(bad.length || errs.length ? `THE SCRIPTORIUM IS STILL A SHOP COUNTER (${bad.length + errs.length})`
                                        : 'ONE PUPIL, ONE DESK, AND THE HOURS IT TAKES');
  await b.close();
  process.exit(bad.length || errs.length ? 1 : 0);
})();
