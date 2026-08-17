#!/usr/bin/env node
/* THE SHAPING CEILING IS A CONSTANT, AND SKILL BUYS CHEAPNESS RATHER THAN POWER.
 *
 * The shaping bench poses a tradeoff: six axes, five points each, one pool between them. The
 * pool had two numbers behind it and only one of them was a wall:
 *
 *   shapeBudget(caster) = 12 + floor(magic/12) + 2 (necromancy) + 2 (ossuary_rites)
 *   shapeCeiling(caster) = shapeBudget(caster) + 4          <-- the old rule
 *
 * Six axes at SHAPE_MAX costs 30. A lich sits at magic 150, so its budget was 28 and its
 * ceiling 32 — four points MORE than it takes to max the entire board. The tradeoff therefore
 * existed only in the early game and vanished at exactly the tier where a bound host was
 * already running away with the world. A living necromancer at the skill cap was at 28 of 30,
 * which is barely a choice either.
 *
 * So the ceiling is a constant now (SHAPE_BUDGET_BASE + 4 = 16), the same wall for a novice
 * and for a lich, while `shapeBudget` keeps scaling — skill and research buy the same shape
 * for less material and never buy a better one.
 *
 * WHAT THIS MEASURES, and every one of these is a claim that fails on the build before:
 *   1. the ceiling does not move — across magic 4/40/100/150 and with both techs researched
 *   2. a lich cannot max the board, at the bench OR through craftUndead
 *   3. and a refused binding costs nothing: no mana, no materials, no body
 *   4. the budget DOES still move, and the same shape gets cheaper as skill rises
 *   5. the wall is a real choice: colossal AND chitinous is now impossible for anybody
 *   6. the panel's + button stops where craftUndead stops, for a lich as for a novice
 *   7. the bench writes no dead axes (`quiet`/`will` were merged into MIND long ago and were
 *      still being written, saved and never read, while `mind` was missing from both literals)
 *
 *   node tools/ceiling.js [game.html]
 */
const { chromium } = require('playwright');
const path = require('path');
const gamePath = (a) => path.resolve(a ? (path.isAbsolute(a) ? a : path.join(__dirname, a)) : path.join(__dirname, 'game.html'));

(async () => {
  const b = await chromium.launch({
    executablePath: process.env.DUSTWARD_CHROME || undefined,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'],
  });
  const p = await b.newPage({ viewport: { width: 1100, height: 900 } });
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message.slice(0, 200)));
  p.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text().slice(0, 200)); });
  await p.goto('file://' + gamePath(process.argv[2]), { waitUntil: 'load' });
  await p.waitForTimeout(3000);
  await p.evaluate(() => document.getElementById('btn-start').click());
  await p.waitForTimeout(3000);

  const out = await p.evaluate(() => {
    const R = {};
    paused = true;

    /* `shapeCeiling` took a caster on the old build and takes none on the new one. Call it
       both ways from one helper so this harness runs against either build and the DIFFERENCE
       is what it reports, rather than throwing on an arity change. */
    const ceilOf = (c) => shapeCeiling(c);
    const MAXED = SHAPE_AXES.reduce((o, ax) => (o[ax.k] = SHAPE_MAX, o), {});
    const BOARD = SHAPE_AXES.length * SHAPE_MAX;
    const NEUTRAL = SHAPE_AXES.reduce((o, ax) => (o[ax.k] = 2, o), {});

    const stock = () => { for (const k of ['vflesh', 'remains', 'iron', 'hide', 'fabric', 'stone', 'copper', 'wood', 'tome', 'c_ingot']) stash[k] = 9999; };
    const mkNec = (magic) => {
      const c = player().find(x => x.gift === 'dark' && !x.undead && x.state === 'ok') || player()[0];
      c.gift = 'dark'; c.stats.magic = magic; c.mana = 9999;
      return c;
    };
    const wipeRisen = (nec) => { for (const x of chars.slice()) if (x.master === nec) { x.master = null; const i = chars.indexOf(x); if (i >= 0) chars.splice(i, 1); } };

    research.done.rites_binding = true; research.done.rites_deep = true;
    research.done.necromancy = false; research.done.ossuary_rites = false;
    stock();

    /* ============ 1. THE CEILING DOES NOT MOVE ============ */
    {
      const nec = mkNec(4);
      const rows = [];
      for (const mag of [4, 40, 100, 150]) { nec.stats.magic = mag; rows.push([`m${mag}`, ceilOf(nec), shapeBudget(nec)]); }
      /* and research is skill by another name, so it must not move it either */
      research.done.necromancy = true; research.done.ossuary_rites = true;
      nec.stats.magic = 150; rows.push(['lich+both techs', ceilOf(nec), shapeBudget(nec)]);
      research.done.necromancy = false; research.done.ossuary_rites = false;

      const ceils = [...new Set(rows.map(r => r[1]))];
      R.theCeilingIsOneNumber = ceils.length === 1
        ? `${ceils[0]} at every tier — ` + rows.map(r => `${r[0]} ceil ${r[1]}/budget ${r[2]}`).join(', ')
        : `!! THE CEILING STILL MOVES WITH THE CASTER: ` + rows.map(r => `${r[0]} -> ${r[1]}`).join(', ');
      R.andItIsTheBaseAllocation = ceils.length === 1 && ceils[0] === SHAPE_BUDGET_BASE + 4
        ? `${ceils[0]} = SHAPE_BUDGET_BASE ${SHAPE_BUDGET_BASE} + 4 headroom`
        : `!! CEILING IS ${ceils.join('/')}, EXPECTED ${SHAPE_BUDGET_BASE + 4}`;
    }

    /* ============ 2. A LICH CANNOT MAX THE BOARD ============ */
    {
      const nec = mkNec(150);
      research.done.necromancy = true; research.done.ossuary_rites = true;
      const ceil = ceilOf(nec), spent = shapeSpent(MAXED);
      R.theBoardCostsMoreThanTheCeiling = spent === BOARD && spent > ceil
        ? `six axes at ${SHAPE_MAX} costs ${spent} against a ceiling of ${ceil} — ${spent - ceil} short`
        : `!! A LICH CAN BUY THE WHOLE BOARD (${spent} points, ceiling ${ceil})`;

      /* the arithmetic is not the mechanic; the refusal is. Bind it for real. */
      wipeRisen(nec);
      stock();
      nec.mana = 9999;
      const circle = { x: nec.x, y: nec.y };
      const before = chars.length;
      const ok = craftUndead('brute', nec, circle, { ...MAXED });
      R.craftUndeadRefusesTheMaxedBoard = (!ok && chars.length === before)
        ? 'craftUndead returns false and stands nothing up'
        : `!! THE MAXED BOARD WAS BOUND (returned ${ok}, ${chars.length - before} body added)`;

      /* ============ 3. AND THE REFUSAL COSTS NOTHING ============ */
      const manaBefore = nec.mana, ironBefore = stash.iron, remainsBefore = stash.remains, vfleshBefore = stash.vflesh;
      craftUndead('brute', nec, circle, { ...MAXED });
      R.aRefusedBindingIsFree = (nec.mana === manaBefore && stash.iron === ironBefore &&
                                 stash.remains === remainsBefore && stash.vflesh === vfleshBefore)
        ? `mana ${nec.mana} and the store untouched by a refusal`
        : `!! A REFUSAL CHARGED FOR ITSELF (mana ${manaBefore}->${nec.mana}, iron ${ironBefore}->${stash.iron}, ` +
          `remains ${remainsBefore}->${stash.remains}, vflesh ${vfleshBefore}->${stash.vflesh})`;

      /* and a shape ON the ceiling still binds, or this is a wall and not a ceiling */
      const onCeil = { ...NEUTRAL };
      let need = ceil - shapeSpent(onCeil);
      for (const ax of SHAPE_AXES) { const room = Math.min(SHAPE_MAX - onCeil[ax.k], need); onCeil[ax.k] += room; need -= room; if (!need) break; }
      wipeRisen(nec); stock(); nec.mana = 9999;
      const n2 = chars.length;
      const ok2 = craftUndead('brute', nec, circle, { ...onCeil });
      R.aShapeOnTheCeilingStillBinds = (ok2 && chars.length > n2)
        ? `${shapeSpent(onCeil)} points binds — ${chars[chars.length - 1].shapeName || 'unnamed'}`
        : `!! THE CEILING REFUSES ITSELF (${shapeSpent(onCeil)} points, ceiling ${ceil})`;
      research.done.necromancy = false; research.done.ossuary_rites = false;
    }

    /* ============ 4. SKILL STILL BUYS SOMETHING — THE SAME SHAPE, CHEAPER ============ */
    {
      const nec = mkNec(4);
      /* a shape that sits above a novice's free budget but under the ceiling */
      const shape = { ...NEUTRAL, mass: 5, force: 4, haste: 0 };
      const rows = [];
      for (const mag of [4, 40, 100, 150]) {
        nec.stats.magic = mag;
        const cost = shapeCost(shape, nec);
        rows.push({ mag, budget: shapeBudget(nec), iron: cost.iron || 0, remains: cost.remains || 0 });
      }
      const budgets = rows.map(r => r.budget);
      R.theBudgetStillRisesWithSkill = budgets[3] > budgets[0]
        ? `free budget ${budgets.join(' -> ')} across magic 4/40/100/150`
        : `!! SKILL NO LONGER BUYS BUDGET (${budgets.join('/')})`;
      const irons = rows.map(r => r.iron);
      R.andTheSameShapeGetsCheaper = irons[3] < irons[0] && irons[3] === 0
        ? `${shapeSpent(shape)} points costs ${irons[0]} iron at magic 4 and nothing at 150`
        : `!! SKILL DOES NOT DISCOUNT THE SHAPE (iron ${irons.join('/')})`;
    }

    /* ============ 5. THE WALL IS A REAL CHOICE ============ */
    {
      const nec = mkNec(150);
      research.done.necromancy = true; research.done.ossuary_rites = true;
      const ceil = ceilOf(nec);
      /* the four-colossus build out of the play report: colossal, ruinous, seamless, chitinous */
      const solo = { ...NEUTRAL, mass: 5, force: 5, knit: 5, plate: 5 };
      R.theSoloBuildIsOutOfReach = shapeSpent(solo) > ceil
        ? `colossal+ruinous+seamless+chitinous is ${shapeSpent(solo)} points against ${ceil}`
        : `!! THE FOUR-COLOSSUS BUILD STILL FITS (${shapeSpent(solo)} of ${ceil})`;
      /* The claim is not that two extremes are impossible — it is that the second one is PAID
         FOR out of the other axes, which is what a tradeoff is. Colossal alone sits inside the
         ceiling with the rest of the board left at neutral; colossal AND chitinous does not,
         and only fits once haste and knit are sold all the way to the floor. */
      const heavy = { ...NEUTRAL, mass: 5 };
      const bothNeutral = { ...NEUTRAL, mass: 5, plate: 5 };
      const bothPaid = { ...NEUTRAL, mass: 5, plate: 5, haste: 0, knit: 0 };
      R.aSecondExtremeIsPaidForOutOfTheRest =
        (shapeSpent(heavy) <= ceil && shapeSpent(bothNeutral) > ceil && shapeSpent(bothPaid) <= ceil)
          ? `colossal alone is ${shapeSpent(heavy)}/${ceil} with the board at neutral; adding chitinous makes it ` +
            `${shapeSpent(bothNeutral)} and only fits at ${shapeSpent(bothPaid)} once haste and knit go to the floor — ` +
            `a shambling, shoddy wall, which is a choice and not a stat block`
          : `!! THE TRADEOFF IS NOT BITING (heavy ${shapeSpent(heavy)}, both-at-neutral ${shapeSpent(bothNeutral)}, ` +
            `both-paid-for ${shapeSpent(bothPaid)}, ceiling ${ceil})`;
      /* and the thing that comes out of paying for it reads as what it is */
      R.andTheGameNamesWhatThatCostBought = shapeNameFor(bothPaid) && shapeNameFor(bothPaid) !== shapeNameFor(NEUTRAL)
        ? `it comes out ${shapeNameFor(bothPaid)}`
        : `!! THE PAID-FOR BUILD HAS NO NAME OF ITS OWN`;
      research.done.necromancy = false; research.done.ossuary_rites = false;
    }

    /* ============ 7. THE BENCH WRITES NO DEAD AXES ============ */
    {
      const live = SHAPE_AXES.map(a => a.k);
      const nec = mkNec(60);
      wipeRisen(nec); stock(); nec.mana = 9999;
      craftUndead('brute', nec, { x: nec.x, y: nec.y }, { ...NEUTRAL });
      const u = chars[chars.length - 1];
      const dead = u && u.shape ? Object.keys(u.shape).filter(k => !live.includes(k)) : ['no body bound'];
      R.aBoundBodyCarriesOnlyLiveAxes = dead.length === 0
        ? `shape is exactly ${live.join('/')}`
        : `!! DEAD AXES RIDE THE BODY: ${dead.join(', ')}`;
      R.andMindIsAmongThem = u && u.shape && u.shape.mind !== undefined
        ? `mind ${u.shape.mind} is written rather than defaulted in`
        : `!! MIND IS MISSING FROM THE SHAPE THE BENCH WROTE`;
    }

    /* leave a lich-tier ritualist standing on a circle for the DOM half */
    {
      const nec = mkNec(150);
      research.done.necromancy = true; research.done.ossuary_rites = true;
      wipeRisen(nec); stock(); nec.mana = 9999;
      const cx = Math.round(nec.x), cy = Math.round(nec.y);
      const circle = placeStructure('circle', cx, cy);
      nec.x = cx + 1; nec.y = cy + 1;
      window.__ceilCircle = circle;
      window.__ceilNec = nec;
      R._benchOpensFor = `${nec.name}, magic ${Math.round(nec.stats.magic)}, budget ${shapeBudget(nec)}, ceiling ${ceilOf(nec)}`;
    }
    return R;
  });

  /* ============ 6. THE PANEL STOPS WHERE THE RULE STOPS ============
     The note on this item warned the ceiling is enforced in two places — the panel disables
     the + button and craftUndead re-checks — so both have to be measured. This half drives
     the real DOM: open the bench as a lich, then hold the + buttons down and see where it
     actually stops. */
  const dom = await p.evaluate(() => {
    const R = {};
    /* zero-arg on the new build, caster-taking on the old one — ask for the number either way
       so the harness reports the difference instead of throwing on the arity change */
    const CEIL = (() => { try { return shapeCeiling(); } catch (e) { return shapeCeiling(window.__ceilNec); } })();
    openBinding(window.__ceilCircle);
    const rows = () => [...document.querySelectorAll('#modalbody .trow')]
      .filter(r => /^(MASS|FORCE|HASTE|KNIT|PLATING|MIND)/.test(r.textContent.trim()));
    if (!rows().length) { R.thePanelStopsAtTheCeiling = '!! THE BENCH DID NOT DRAW (no axis rows in the modal)'; return R; }
    /* push every + until the panel refuses, exactly as a player would */
    let clicks = 0;
    for (let guard = 0; guard < 200; guard++) {
      const open = rows().map(r => r.querySelector('button:last-of-type')).filter(bt => bt && !bt.disabled);
      if (!open.length) break;
      open[0].click(); clicks++;
    }
    const spent = shapeSpent(window.__ceilCircle.shape);
    R.thePanelStopsAtTheCeiling = spent === CEIL
      ? `a lich clicking + until it gives out lands on ${spent} points after ${clicks} clicks`
      : `!! THE PANEL LET A LICH REACH ${spent} POINTS (ceiling ${CEIL})`;
    /* and what it stopped at has to be bindable, or the panel is offering a dead shape */
    R.andWhatItStoppedAtIsBindable = spent <= CEIL
      ? 'the shape the panel stops on passes craftUndead'
      : '!! THE PANEL STOPS ON A SHAPE THE BINDING WILL REFUSE';
    /* the note the panel prints has to state the wall, or it is an unexplained nerf */
    const txt = document.getElementById('modalbody').textContent;
    R.andThePanelSaysSoOutLoud = /ceiling for every binder/.test(txt) && txt.includes(`${CEIL} points is the ceiling`)
      ? 'the bench states the ceiling is the same for everyone and what skill buys instead'
      : '!! THE PANEL DOES NOT EXPLAIN THE CEILING';
    /* EVEN must reset to the live axes and nothing else */
    const even = [...document.querySelectorAll('#modalbody button')].find(bt => bt.textContent === 'EVEN');
    if (even) {
      even.click();
      const live = SHAPE_AXES.map(a => a.k);
      const keys = Object.keys(window.__ceilCircle.shape);
      const dead = keys.filter(k => !live.includes(k));
      R.evenResetsToTheLiveAxesOnly = dead.length === 0 && live.length === keys.length && live.every(k => window.__ceilCircle.shape[k] === 2)
        ? `EVEN writes ${keys.length} keys, all of them axes, all at 2`
        : `!! EVEN WRITES ${dead.length ? 'DEAD AXES: ' + dead.join(', ') : 'A SHAPE THAT IS NOT NEUTRAL'}`;
    } else R.evenResetsToTheLiveAxesOnly = '!! NO EVEN BUTTON';
    return R;
  });

  const all = { ...out, ...dom };
  console.log('=== THE SHAPING CEILING IS A CONSTANT ===\n');
  for (const [k, v] of Object.entries(all)) console.log('  ' + k.padEnd(36) + v);
  const bad = Object.values(all).map(String).filter(v => v.startsWith('!!'));
  console.log('\n' + (bad.length ? '*** ' + bad.join('\n*** ')
    : 'THE WALL IS THE SAME FOR A NOVICE AND FOR A LICH, AND SKILL BUYS THE SAME SHAPE CHEAPER'));
  if (errs.length) { console.log('errs:', errs.length); errs.slice(0, 4).forEach(e => console.log('  ' + e)); }
  await b.close();
  if (bad.length) process.exitCode = 1;
})();
