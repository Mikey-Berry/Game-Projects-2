#!/usr/bin/env node
/* A LIMB OF THE ECONOMY WITH NO ROOT.
 *
 * "There should be a building that makes fabric. Currently there seems to be no way to make
 * it. If necessary, we should create a new form of raw material to process into cloth."
 *
 * The ledger asked to verify the claim before building anything — whether fabric was genuinely
 * unmakeable or merely unbuyable. It was genuinely unmakeable: the only thing in the world
 * that produced cloth was the NPC town CRAFTER, turning hide into fabric to stock a market you
 * can buy from. The player could spend it and never make it, and it is spent everywhere.
 *
 * The first assertion here is therefore about the SHAPE OF THE ECONOMY rather than about any
 * building: for every material the player is asked to spend, is there something the player can
 * do that produces it. That question outlives this one item — the next dead-ended material
 * will fail the same line without anybody having to notice it by hand.
 *
 *   node tools/cloth.js [game.html]
 */
const { chromium } = require('playwright');
const path = require('path');
const gamePath = (a) => path.resolve(a ? (path.isAbsolute(a) ? a : path.join(__dirname, a)) : path.join(__dirname, 'game.html'));

(async () => {
  const b = await chromium.launch({
    executablePath: process.env.DUSTWARD_CHROME || undefined,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'],
  });
  const p = await b.newPage({ viewport: { width: 1000, height: 720 } });
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message.slice(0, 200)));
  await p.goto('file://' + gamePath(process.argv[2]), { waitUntil: 'load' });
  await p.waitForTimeout(3000);
  await p.evaluate(() => { document.getElementById('btn-start').click(); paused = true; });
  await p.waitForTimeout(3000);

  const out = await p.evaluate(() => {
    const R = {};
    paused = true;

    /* ---------- CAN THE PLAYER MAKE FABRIC AT ALL? ---------- */
    const madeBy = [];
    for (const kind of Object.keys(RECIPES))
      for (const r of RECIPES[kind]) if (r.out === 'fabric') madeBy.push(kind);
    R.sources = madeBy.length ? `fabric is made at: ${madeBy.join(', ')}` : 'nothing the player owns makes fabric';
    R.thePlayerCanMakeCloth = madeBy.length > 0
      ? `fabric can be made — at the ${madeBy.map(k => (BUILD_TYPES[k] || {}).name || k).join(', ')}`
      : '!! NOTHING THE PLAYER CAN BUILD PRODUCES FABRIC, AND IT IS SPENT EVERYWHERE';

    /* ---------- AND THE SAME QUESTION, ASKED OF EVERY MATERIAL ----------
       This is the assertion worth keeping. Walk everything the player is asked to SPEND — the
       build costs, the bench recipes, the binding recipes — and ask of each whether anything
       the player can do produces it. A material with a sink and no source is a dead end
       whatever its name is, and this line will find the next one without being told. */
    {
      const spent = new Set();
      const eat = (cost) => { for (const k in (cost || {})) spent.add(k); };
      for (const k in BUILD_TYPES) { eat(BUILD_TYPES[k].cost); if (BUILD_TYPES[k].mats) spent.add('mats'); }
      for (const kind in RECIPES) for (const r of RECIPES[kind]) eat(r.cost);
      for (const k in UNDEAD_TYPES) eat(UNDEAD_TYPES[k].cost);

      const made = new Set();
      for (const kind in RECIPES) for (const r of RECIPES[kind]) made.add(r.out);
      /* everything the ground, the water and the dead give up directly */
      for (const k of ['wood', 'stone', 'iron_ore', 'copper', 'coal', 'fish', 'fruit', 'meat',
                       'hide', 'hide_lev', 'remains', 'vflesh', 'lead', 'mats', 'bone'])
        made.add(k);
      /* NOT `type !== 'trade'`. The first version filtered those out believing `trade` meant
         "a thing you buy" — it means "a trade good", and both FABRIC and HIDE carry it. So the
         one material this file exists for was excluded from the general check by the general
         check's own filter, and `noMaterialIsADeadEnd` read green on the build where fabric
         could not be made. */
      const orphans = [...spent].filter(k => !made.has(k) && ITEMS[k]);
      R.orphans = orphans.length ? `spent but unmakeable: ${orphans.join(', ')}` : 'every material with a sink has a source';
      R.noMaterialIsADeadEnd = orphans.length === 0
        ? 'and nothing else in the economy is spent without being makeable — the next dead end fails this line'
        : `!! ${orphans.length} MATERIAL(S) ARE SPENT AND CANNOT BE MADE: ${orphans.join(', ')}`;
    }

    /* ---------- IT IS A BUILDING, AND IT IS OFFERED ---------- */
    {
      const inBar = BUILD_CATS.some(([, keys]) => keys.includes('loom'));
      R.itIsInTheBuildBar = (BUILD_TYPES.loom && BUILD_TYPES.loom.cost && inBar)
        ? `the ${BUILD_TYPES.loom.name} is offered in the build bar for ${Object.entries(BUILD_TYPES.loom.cost).map(([k, v]) => v + ' ' + ITEMS[k].name).join(' + ')}`
        : '!! THERE IS NO WEAVER\'S SHED IN THE BUILD MENU';
    }

    /* ---------- AND IT ACTUALLY WEAVES ----------
       Driven through the real panel and the real craft tick, because a recipe table entry is
       not a feature until somebody can press the button and the cloth appears in the stores. */
    {
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

      research.done.construction = true;
      /* ---------- A BUILD WITHOUT THE SHED MUST GO RED, NOT THROW ----------
         Everything below reaches for `BUILD_TYPES.loom`, which is the thing under test. On the
         build before it exists that is `undefined`, and reading `.w` off it takes the whole
         evaluate down — including the economy assertions above, which had already found the
         defect and would never have been printed. Report and stop. */
      if (!BUILD_TYPES.loom || !RECIPES.loom) {
        R.itIsInTheBuildBar = '!! THERE IS NO WEAVER\'S SHED IN THIS BUILD AT ALL';
        R.theShedOffersCloth = '!! NO SHED, NO PANEL, NO CLOTH';
        R.andTheClothArrives = '!! NOTHING THE PLAYER CAN BUILD PRODUCES FABRIC';
        R.andItCostsHide = '!! NOTHING TO COST ANYTHING';
        return R;
      }
      const bt = BUILD_TYPES.loom;
      const shed = { type: 'loom', x: gx, y: gy, w: bt.w, h: bt.h, floor: 0, hp: 100, maxHp: 100, growth: 0, __probe: true };
      pBuilds.push(shed);
      const weaver = makeChar('Probe Weaver', 'player', gx + 1, gy + 2.2, { atk: 3, def: 3, tough: 8, crafting: 30 });
      weaver.__probe = true; weaver.floor = 0; chars.push(weaver); rebuildCharGrid();

      const hide0 = campHas('hide'), cloth0 = campHas('fabric');
      addItem('hide', 6);

      openCrafting('loom', shed);
      const rows = [...document.querySelectorAll('#modalbody .trow')].map(x => x.textContent);
      R.panel = `the shed offers: ${rows.map(r => r.split(' ')[0]).join(', ') || '(nothing)'}`;
      const btn = [...document.querySelectorAll('#modalbody [data-cr]')].find(x => x.dataset.cr === 'fabric');
      R.theShedOffersCloth = btn
        ? 'right-clicking the shed offers CRAFT on fabric'
        : `!! THE SHED'S PANEL HAS NO FABRIC BUTTON — it lists ${JSON.stringify(rows)}`;
      if (btn) {
        /* ---------- A BATCH, BECAUSE ONE CRAFT IS A 4% COIN ----------
           This pressed CRAFT once and asserted fabric appeared. `craftTick` ruins a
           non-gear item 4% of the time, so the claim was a coin that had been landing the
           right way — until the underground rework moved the worldgen random stream and it
           landed the other way: 1 hide consumed, 0 fabric, "THE SHED PRODUCED NO FABRIC" on a
           build where the shed works perfectly. Measured on the build before that rework, the
           same probe read 1 hide and 2 fabric.
           Shift-click is a full shift's work, which the panel itself advertises, and it is the
           honest way to ask "does the shed weave" — the run stops when the six hide staged
           above run out, so it also walks the materials-ran-out path on the way. */
        btn.dispatchEvent(new MouseEvent('click', { shiftKey: true, bubbles: true }));
        /* the order is placed; the work happens at the bench, a bit at a time */
        for (let i = 0; i < 60 * 120 && weaver.craftJob; i++) { weaver.state = 'ok'; craftTick(weaver, 1 / 30); }
      }
      const gotCloth = campHas('fabric') - cloth0, spentHide = 6 - (campHas('hide') - hide0);
      R.weaving = `it consumed ${spentHide} hide and produced ${gotCloth} fabric`;
      R.andTheClothArrives = gotCloth > 0
        ? `and a shift at it puts ${gotCloth} fabric in the stores`
        : '!! THE SHED PRODUCED NO FABRIC';
      R.andItCostsHide = spentHide > 0
        ? `and it costs hide to do it — ${spentHide} of them`
        : '!! CLOTH CAME OUT OF NOTHING';

      document.getElementById('modal').style.display = 'none'; modalOpen = false;
      for (let i = pBuilds.length - 1; i >= 0; i--) if (pBuilds[i].__probe) pBuilds.splice(i, 1);
      for (let i = chars.length - 1; i >= 0; i--) if (chars[i].__probe) chars.splice(i, 1);
    }

    return R;
  });

  const bad = Object.values(out).filter(v => typeof v === 'string' && v.startsWith('!!'));
  for (const [k, v] of Object.entries(out)) console.log('  ' + k.padEnd(26) + v);
  for (const e of errs) console.log('  ' + e);
  console.log('');
  console.log(bad.length || errs.length
    ? `THE CLOTH STILL HAS TO BE BOUGHT (${bad.length + errs.length})`
    : 'HIDE IN, CLOTH OUT, IN A BUILDING YOU PUT UP YOURSELF');
  await b.close();
  process.exit(bad.length || errs.length ? 1 : 0);
})();
