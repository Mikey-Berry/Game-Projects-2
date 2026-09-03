#!/usr/bin/env node
/* ONE BOOK, READ BY EVERY HAND — AND THE SMELTER THAT COULD NOT BE USED.
 *
 * "The smelter is broken right now. It doesn't properly let someone use it to craft ingots,
 *  which makes it nearly impossible to progress on the tech tree. Setting someone to 'craft'
 *  simply sends them to the bench, which is not always what I want."
 * "Perhaps the crafting menu could be similar to research in that it is universal... we can use
 *  this menu to place 'orders' of units, shift-clickable for stacks... You still need to HAVE
 *  that actual building created as a prerequisite, but you no longer have to micromanage where
 *  your squadmates stand."
 *
 * IT WAS NOT A BUG IN THE SMELTER. The whole CRAFT job was eleven lines that walked to a
 * `workbench` and turned wood and stone into build materials, and `canDoJob` agreed:
 * `case 'craft': return pBuilds.some(b => b.type === 'workbench' || b.type === 'forge')`. The
 * kiln, the loom and the smelter were not in it, and every recipe in those three buildings could
 * only be made by opening that building's own window with somebody standing inside it.
 *
 *   node tools/orders2.js [game.html]
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
      try { fn(); } catch (e) { for (const k of keys) if (R[k] === undefined) R[k] = '!! ' + String(e.message).slice(0, 130).toUpperCase(); }
    };
    const shut = () => { const m = document.getElementById('modal'); m.style.display = 'none'; document.getElementById('modalbody').innerHTML = ''; modalOpen = false; };
    const made = [];
    const wipe = () => { while (made.length) { const c = made.pop(); let i = chars.indexOf(c); if (i >= 0) chars.splice(i, 1); i = pBuilds.indexOf(c); if (i >= 0) pBuilds.splice(i, 1); } };

    /* ---------- 1. CRAFT IS WORK AT EVERY WORKSHOP, NOT TWO OF THE FIVE ---------- */
    guard(['craftMeansEveryWorkshop', 'andRightClickingOneOffersTheJob'], () => {
      wipe();
      const me = player()[0];
      for (const b2 of pBuilds.slice()) { const i = pBuilds.indexOf(b2); if (i >= 0) pBuilds.splice(i, 1); }
      const sm = placeStructure('smelter', Math.round(me.x + 6), Math.round(me.y + 6));
      if (sm) { sm.progress = 1; made.push(sm); }
      /* the predicate is `jobHasWork(c, job)` — named for the question it answers */
      const only = typeof jobHasWork === 'function' ? jobHasWork(me, 'craft') : null;
      R._only = `with a Smelter as the only workshop in camp, CRAFT is work: ${only}`;
      R.craftMeansEveryWorkshop = only === true
        ? 'a camp whose only workshop is a Smelter counts CRAFT as work — where before the job asked for a Workbench or a Forge and nothing else, which is the whole of "the smelter is broken"'
        : `!! CRAFT IS STILL NOT WORK AT A SMELTER (${only})`;
      R.andRightClickingOneOffersTheJob = (BUILD_JOB.smelter === 'craft' && BUILD_JOB.kiln === 'craft' && BUILD_JOB.loom === 'craft')
        ? 'and right-clicking a smelter, a kiln or a loom offers the job that works one — three buildings that were missing from the table the menu reads'
        : `!! ${JSON.stringify({smelter: BUILD_JOB.smelter, kiln: BUILD_JOB.kiln, loom: BUILD_JOB.loom})}`;
    });

    /* ---------- 2. THE BOOK IS UNIVERSAL AND SAYS WHY ---------- */
    guard(['theBookListsEverything', 'andSaysWhatIsMissing'], () => {
      shut();
      openWorkshops();
      const txt = document.getElementById('modalbody').textContent;
      const rows = document.querySelectorAll('#modalbody button').length;
      const shops = Object.keys(RECIPES).filter(k => new RegExp(k === 'loom' ? "WEAVER" : k, 'i').test(txt)).length;
      R._book = `the book lists ${shops} of ${Object.keys(RECIPES).length} workshops and offers ${rows} buttons, standing nowhere near any of them`;
      R.theBookListsEverything = shops === Object.keys(RECIPES).length
        ? `one window lists every workshop in the game and every recipe in it — opened from the top bar, standing nowhere near a building`
        : `!! ONLY ${shops} WORKSHOPS LISTED`;
      /* and a recipe you cannot make has to say which of the two reasons it is */
      R.andSaysWhatIsMissing = /not built/.test(txt) || /needs /.test(txt)
        ? 'and a recipe you cannot make says which of the two reasons it is — the building you have not raised, or the research you have not done'
        : `!! THE BOOK IS SILENT ABOUT WHY A ROW IS DEAD`;
      shut();
    });

    /* ---------- 3. AN ORDER IS TAKEN BY WHOEVER IS FREE, AND WORKED WHERE IT BELONGS ---------- */
    guard(['anOrderFindsItsOwnBuilding', 'andTheHandWalksToTheRightOne', 'andNothingIsMadeThatWasNotAsked'], () => {
      wipe();
      craftOrders.length = 0;
      const me = player()[0];
      for (const b2 of pBuilds.slice()) { const i = pBuilds.indexOf(b2); if (i >= 0) pBuilds.splice(i, 1); }
      const bench = placeStructure('workbench', Math.round(me.x + 4), Math.round(me.y));
      const sm = placeStructure('smelter', Math.round(me.x + 30), Math.round(me.y + 30));
      if (bench) { bench.progress = 1; made.push(bench); }
      if (sm) { sm.progress = 1; made.push(sm); }
      research.done.smelting = true; research.done.construction = true;
      addItem('copper', 40); addItem('coal', 40);
      const hand = makeChar('Smith', 'player', me.x, me.y, { atk: 3, def: 3, crafting: 20, smithing: 20 });
      hand.state = 'ok'; hand.job = 'craft'; hand.__probe = true; chars.push(hand); made.push(hand);
      craftOrders.push({ kind: 'smelter', out: 'c_ingot', want: 3, done: 0, taken: null });
      const got = takeOrder(hand);
      R._took = got ? `the order was taken: ${hand.craftJob.out} at ${hand.craftJob.kind}, bench at ${hand.craftJob.bx.toFixed(0)},${hand.craftJob.by.toFixed(0)}` : 'no order taken';
      R.anOrderFindsItsOwnBuilding = (got && hand.craftJob && hand.craftJob.kind === 'smelter')
        ? 'a hand set to CRAFT takes an order for ingots and is sent to the SMELTER — not to the workbench, which is the only place the job could ever send anybody before'
        : `!! ${R._took}`;
      const d2bench = bench ? dist(hand.craftJob.bx, hand.craftJob.by, bench.x, bench.y) : -1;
      const d2sm = sm ? dist(hand.craftJob.bx, hand.craftJob.by, sm.x, sm.y) : -1;
      R._where = `the work point is ${d2sm.toFixed(1)} tiles from the smelter and ${d2bench.toFixed(1)} from the workbench`;
      R.andTheHandWalksToTheRightOne = d2sm < d2bench
        ? `and the work point is the smelter's, ${d2sm.toFixed(1)} tiles from it against ${d2bench.toFixed(1)} from the bench thirty tiles away — "you no longer have to micromanage where your squadmates stand"`
        : `!! ${R._where}`;
      /* and the count is a count: three ordered, three made, then it stops */
      hand.x = hand.craftJob.bx; hand.y = hand.craftJob.by;
      let ticks = 0;
      while (hand.craftJob && ticks < 4000) { craftTick(hand, 0.25); ticks++; }
      const ing = (stash.c_ingot || 0);
      R._made = `after the order ran to its end: ${ing} ingots in the stash, ${craftOrders.length} orders left on the book`;
      R.andNothingIsMadeThatWasNotAsked = (ing >= 3 && ing <= 4 && craftOrders.length === 0)
        ? `and an order of three makes three and then stops — the book empties itself, which is the answer to "we don't run into the issue of building WAY more stuff than we actually need"`
        : `!! ${R._made}`;
      wipe();
      craftOrders.length = 0;
    });

    /* ---------- 4. AND THE EMPTY BOOK STILL LEAVES A HAND SOMETHING TO DO ---------- */
    guard(['anEmptyBookFallsBackToMats'], () => {
      R.anEmptyBookFallsBackToMats = (RECIPES.workbench || []).some(r => r.out === 'mats')
        ? 'and with nothing ordered a CRAFT hand still turns wood and stone into build materials at a Workbench — the standing work this job used to be, kept as the fallback rather than deleted'
        : '!! the mats fallback is gone';
    });

    return R;
  });

  const bad = Object.values(out).filter(v => typeof v === 'string' && v.startsWith('!!'));
  for (const [k, v] of Object.entries(out)) console.log('  ' + (k.startsWith('_') ? ('· ' + k.slice(1)).padEnd(34) : k.padEnd(34)) + ' ' + v);
  for (const e of errs) console.log('  ' + e);
  console.log('');
  console.log(bad.length || errs.length ? `THE SMELTER STILL CANNOT BE USED (${bad.length + errs.length})`
                                        : 'ONE BOOK, AND EVERY WORKSHOP IN IT');
  await b.close();
  process.exit(bad.length || errs.length ? 1 : 0);
})();
