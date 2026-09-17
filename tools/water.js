#!/usr/bin/env node
/* WHAT THE GOLDEN AGE THREW AWAY, AND WHAT IT WAS AFTER.
 *
 *   "Salt should perhaps be producible… or harvestable? I'm thinking of removing river fish and
 *    exchanging that for like, saltwater, which then requires Golden Age tech to desalinate
 *    (this is where the major cities were built around, desalination plants essentially.)"
 *   "…water serve as a logistical cog in the context of crafting, farming. Definitely no thirst
 *    mechanics. Perhaps wells could provide basic watering needs, while the desalination
 *    machinery does the heavy duty, city-wide conversion."
 *
 * The inversion is the design: the Golden Age desalinated and discarded the salt; the survivors
 * evaporate and discard the water. Saltmere lives on the waste product of a dead civilisation.
 *
 * AND IT STARTS WITH A BUG THE COAST LEFT BEHIND. All three ocean bands are written to `terr`
 * as 3 so the thirty other water checks in the file keep working, which means that on the day
 * the sea arrived the CRUST and the DEAD WHITE became fishing grounds — the dead white being,
 * by its own description, what the crust becomes when nobody has walked on it for an age.
 *
 * THE NUMBERS THAT DECIDED THE DESIGN, measured before any of it was written:
 *   · inland water          0 tiles — there is none. Every drop is the ring.
 *   · brine band       69,583 tiles, 19,763 within reach of a shore tile
 *   · crust band       90,795 tiles, ZERO within reach
 *   · dead white      273,858 tiles
 * So the pans cannot be walked to, and the first design — a hand cutting salt off the crust —
 * was for a place no hand can stand. Salt comes off the PAN and out of the PLANT instead.
 *
 *   node tools/water.js [game.html]
 */
const { chromium } = require('playwright');
const path = require('path');
const gamePath = (a) => path.resolve(a ? (path.isAbsolute(a) ? a : path.join(__dirname, a)) : path.join(__dirname, 'game.html'));

(async () => {
  const b = await chromium.launch({
    executablePath: process.env.DUSTWARD_CHROME || undefined,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'],
  });
  const errs = [];
  const p = await b.newPage({ viewport: { width: 1000, height: 700 } });
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message.slice(0, 200)));
  await p.goto('file://' + gamePath(process.argv[2]), { waitUntil: 'load' });
  await p.waitForTimeout(3000);
  await p.evaluate(() => { document.getElementById('btn-start').click(); paused = true; });
  await p.waitForTimeout(3000);

  const R = await p.evaluate(() => {
    const O = {};
    paused = true;
    const guard = (keys, fn) => {
      try { fn(); } catch (e) { for (const k of keys) if (O[k] === undefined) O[k] = '!! ' + String(e.message).slice(0, 130).toUpperCase(); }
    };
    /* THE DAY ROLL-OVER IS INLINE IN `update`, not a function anything can call — it fires when
       `hour` crosses 24. So a claim about what happens at dawn pushes the clock to the edge and
       takes one real step, with `paused` lifted for exactly that step. */
    const rollDay = () => { const was = paused; paused = false; hour = 23.999; update(1 / 30); paused = was; };
    /* ---------- THE BANDS CLAIM RUNS ON EVERY BUILD, AND THAT IS THE POINT ----------
       Fishing the dead white is not a fault in the water feature — it is a fault in
       `gatherKindAt`, and `gatherKindAt` is the same function on both builds. Blanking the
       whole file with one "this build has no water" would hide the only claim here that can
       fail on the old build for its own reason, which is the reported bug. So the early exit
       covers the chain claims only, and the shore is measured either way. */
    const CHAIN = ['aWellWillNotSinkOnTheFlats', 'aWellDrawsWater', 'aPanBoilsBrineToSalt',
                   'thePlantIsFoundNotResearched', 'andItBeatsThePanOnBothCounts', 'aDryFieldYieldsAQuarter'];
    const noChain = (typeof BUILD_TYPES === 'undefined' || !BUILD_TYPES.well);

    /* ---- 1. THE BANDS ---- */
    guard(['nothingLivesInTheDeadSalt', 'theShoreGivesTwoThings'], () => {
      const seen = {0: new Set(), 1: new Set(), 2: new Set(), 3: new Set()};
      const counts = {0: 0, 1: 0, 2: 0, 3: 0};
      for (let y = 3; y < H - 3; y += 2) for (let x = 3; x < W - 3; x += 2) {
        if (tileAt(x, y) !== 3) continue;
        const br = brimAt(x, y);
        counts[br]++;
        const g = gatherKindAt(x + 0.5, y + 0.5, 0);
        seen[br].add(g ? g.kind : 'nothing');
      }
      const say = (n) => [...seen[n]].sort().join('+') || '(no tiles)';
      O._bands = `sampled: inland ${counts[0]} → ${say(0)} · brine ${counts[1]} → ${say(1)} · `
        + `crust ${counts[2]} → ${say(2)} · dead ${counts[3]} → ${say(3)}`;
      /* ---------- ASK THE RULE, NOT THE GEOMETRY ----------
         Walking the map and finding no fish on the pans proves nothing, and the first cut of
         this claim found that out by going GREEN ON THE CONTROL. The reason is the measurement
         at the top of this file: the crust starts fourteen tiles from land and ZERO of its
         90,795 tiles has a shore tile within the three `gatherKindAt` searches. So on the old
         build the rule happily offered a fish for a crust tile and the world simply never put
         anybody in a position to ask. The bug was LATENT, not live — a true statement about the
         code and a false one about play, and worth saying plainly rather than claiming a catch
         that was never catchable.
         So the claim forces the situation the geometry withholds: one tile of dry land beside a
         pan, the question put, the land put back. Control answers `fish`. This build answers
         nothing, on a pan it can now reach — which is the rule being right rather than the map
         being lucky. */
      let cx = 0, cy = 0;
      outer2: for (let y = 5; y < H - 5; y += 2) for (let x = 5; x < W - 5; x += 2)
        if (tileAt(x, y) === 3 && brimAt(x, y) === BRIM_CRUST) { cx = x; cy = y; break outer2; }
      let forced = 'NO CRUST TILE IN THIS WORLD';
      if (cx) {
        const i2 = cy * W + (cx - 1), was = terr[i2];
        terr[i2] = 1;                                 /* one tile of dry land beside the pan */
        const g2 = gatherKindAt(cx + 0.5, cy + 0.5, 0);
        terr[i2] = was;
        forced = g2 ? g2.kind : 'nothing';
      }
      O._forced = `a crust tile with a shore tile forced beside it offers: ${forced} `
        + `(unforced, ZERO of the ${counts[2]} sampled crust tiles can be stood next to at all)`;
      const pansDead = forced === 'nothing' && !seen[2].has('fish') && !seen[3].has('fish');
      O.nothingLivesInTheDeadSalt = pansDead
        ? `nothing is fished off the pans even when a shore is forced next to one — the rule asks `
          + `which band it is looking at now, rather than trusting fourteen tiles of open water to `
          + `keep anybody from asking`
        : `!! THE PANS ARE STILL FISHABLE (forced: ${forced}; walked: crust ${say(2)}, dead ${say(3)})`;
      O.theShoreGivesTwoThings = seen[1].has('fish')
        ? `while the brine band, the one a person on the shore can actually reach, still gives fish`
        : `!! THE LIVING WATER GIVES NOTHING EITHER (${say(1)}) — the fix has eaten the fishery`;
    });

    /* ---- 2. AND THE JOB DECIDES WHICH OF THE TWO YOU COME BACK WITH ---- */
    guard(['aJobDecidesWhichYouGet'], () => {
      const me = player()[0];
      if (typeof NODE_JOB === 'undefined' || !NODE_JOB.brine) {
        O.aJobDecidesWhichYouGet = '!! THERE IS NO SALTWORK JOB IN THIS BUILD'; return; }
      const f = findNode(me, 'fish'), sw = findNode(me, 'saltwork');
      O.aJobDecidesWhichYouGet = (f && f.kind === 'fish' && sw && sw.kind === 'brine')
        ? `and one shore is two trades: a hand on FISH comes back with fish, a hand on SALTWORK `
          + `comes back with brine, off the same water`
        : `!! THE SHORE DOES NOT SORT ITSELF (fisher: ${f ? f.kind : 'nothing'}, saltworker: ${sw ? sw.kind : 'nothing'})`;
    });

    /* ---- 3. A WELL IS FOR INLAND GROUND ---- */
    guard(['aWellWillNotSinkOnTheFlats', 'aWellDrawsWater'], () => {
      if (noChain) { O.aWellWillNotSinkOnTheFlats = O.aWellDrawsWater = '!! THIS BUILD HAS NO WELLS'; return; }
      /* find a shore tile and the flats beside it, so both cases are the same stretch of coast */
      let dry = null, flat = null;
      for (let y = 6; y < H - 6 && !(dry && flat); y += 3) for (let x = 6; x < W - 6; x += 3) {
        if (!flat && tileAt(x, y) === 3 && brimAt(x, y)) {
          /* the land tile beside the water is what a well would be sunk on if it could */
          for (let d = 1; d < 6 && !flat; d++) if (tileAt(x - d, y) !== 3) flat = {x: x - d + 1, y};
        }
        if (!dry && tileAt(x, y) !== 3 && !brimAt(x, y) && !isBlocked(x + 0.5, y + 0.5, 0)) {
          let ok = true;
          for (let j = 0; j < 2 && ok; j++) for (let i = 0; i < 2; i++)
            if (isBlocked(x + i + 0.5, y + j + 0.5, 0) || brimAt(x + i, y + j)) ok = false;
          if (ok) dry = {x, y};
        }
      }
      /* THE REFUSAL IS ASKED THROUGH `tryBuild`, which is the door the build bar uses, and with
         the stores stocked so a refusal cannot be about the cost. */
      for (const k of ['stone', 'mats', 'wood']) addItem(k, 200);
      const onFlat = flat ? tryBuild('well', Math.floor(flat.x), Math.floor(flat.y), true) : null;
      const before = pBuilds.length;
      const onDry = dry ? tryBuild('well', dry.x, dry.y, true) : false;
      O._sites = `flats at ${flat ? flat.x + ',' + flat.y : '?'}, inland at ${dry ? dry.x + ',' + dry.y : '?'}`;
      O.aWellWillNotSinkOnTheFlats = (onFlat === false && onDry)
        ? `a well is refused on the salt and raised on inland ground — sink a shaft in a pan and `
          + `you get brine, which you can already scoop off the top for nothing`
        : `!! THE FLATS RULE IS WRONG (on the salt: ${onFlat}, inland: ${onDry})`;

      /* ---------- AND `tryBuild` STAKES A BLUEPRINT, IT DOES NOT RAISE A BUILDING ----------
         Which is correct and is the whole point of asking it about the REFUSAL above — that is
         the door the build bar uses. But the thing that draws water is a finished well, and a
         blueprint is a hole with a peg in it. `placeStructure` is what a finished build calls,
         so the production half is staged with that. The first cut of this read `pBuilds` after
         a successful `tryBuild` and found nothing, and said the well drew no water. */
      placeStructure('well', dry.x, dry.y, 0);
      const w = pBuilds.slice(before).find(x2 => x2.type === 'well');
      if (!w) { O.aWellDrawsWater = '!! NO WELL WAS RAISED TO DRAW FROM'; return; }
      w.progress = 1;
      const had = campHas('water');
      for (const b2 of pBuilds) if (b2.type === 'farm') b2.off = true;   /* nothing else drinking */
      rollDay();
      const now = campHas('water');
      O.aWellDrawsWater = now > had
        ? `and a finished one lifts ${now - had} water in a day — enough for about two fields, `
          + `which is deliberately not enough for three`
        : `!! THE WELL DRAWS NOTHING (${had} → ${now})`;
    });

    /* ---- 4 & 5. THE TWO WAYS TO WORK BRINE ---- */
    guard(['aPanBoilsBrineToSalt', 'thePlantIsFoundNotResearched', 'andItBeatsThePanOnBothCounts'], () => {
      if (noChain) { O.aPanBoilsBrineToSalt = O.thePlantIsFoundNotResearched =
        O.andItBeatsThePanOnBothCounts = '!! THIS BUILD HAS NO WAY TO WORK BRINE'; return; }
      const pan = (RECIPES.saltpan || []).find(r => r.out === 'salt');
      const dw = (RECIPES.desal || []).find(r => r.out === 'water');
      const ds = (RECIPES.desal || []).find(r => r.out === 'salt');
      O.aPanBoilsBrineToSalt = (pan && pan.cost.brine && !pan.tech)
        ? `the pan takes ${pan.cost.brine} brine for ${pan.n} salt and asks no tech for it — a bed of `
          + `mud and a scraper, which is the survivors' method and Saltmere's whole trade`
        : `!! THE PAN DOES NOT BOIL BRINE (${JSON.stringify(pan || null)})`;
      /* THE GATE IS THE SCHEMATIC, not a research project. Asked of `buildLock`, which is what
         the build bar actually consults, and of the research table, which must NOT contain it. */
      const locked = buildLock('desal');
      const inTechTree = typeof TECHS !== 'undefined' && !!TECHS.golden_water;
      O.thePlantIsFoundNotResearched = (locked && !inTechTree && dw && dw.tech === 'golden_water')
        ? `and the plant is locked behind "${locked}" — a thing you find, not a project you start: `
          + `there is no entry for it in the research table at all`
        : `!! THE PLANT IS NOT SCHEMATIC-GATED (lock "${locked}", in the tech tree: ${inTechTree})`;
      O.andItBeatsThePanOnBothCounts = (dw && ds && pan
          && (dw.n / dw.cost.brine) > 0 && (ds.n / ds.cost.brine) > (pan.n / pan.cost.brine))
        ? `and six brine through the plant gives ${dw.n} water AND ${ds.n} salt — better on the salt alone `
          + `(${(ds.n / ds.cost.brine).toFixed(2)} a barrel against the pan's ${(pan.n / pan.cost.brine).toFixed(2)}) `
          + `before the water is counted, which is what nine lost generations is supposed to feel like`
        : `!! THE PLANT IS NOT WORTH CROSSING THE WORLD FOR (water ${JSON.stringify(dw)}, salt ${JSON.stringify(ds)})`;
    });

    /* ---- 6. AND THE FIELDS DRINK ---- */
    guard(['aDryFieldYieldsAQuarter'], () => {
      if (noChain) { O.aDryFieldYieldsAQuarter = '!! FIELDS IN THIS BUILD DO NOT DRINK'; return; }
      /* two identical days on the same field, differing only in whether there is water to spend.
         One field, run twice — two farms are not comparable, and this file has paid for that. */
      for (const b2 of pBuilds) if (b2.type === 'well') b2.off = true;
      let farm = pBuilds.find(b2 => b2.type === 'farm');
      if (!farm) {
        const me = player()[0];
        const q = findOpenNear(Math.floor(me.x) + 4, Math.floor(me.y), 6);
        placeStructure('farm', Math.floor(q.x), Math.floor(q.y), 0);
        farm = pBuilds.find(b2 => b2.type === 'farm');
        if (farm) farm.progress = 1;
      }
      if (!farm) { O.aDryFieldYieldsAQuarter = '!! NO FIELD TO WATER'; return; }
      farm.off = false;
      const run = (giveWater) => {
        campTake('water', campHas('water'));            /* empty the cistern */
        campTake('fruit', campHas('fruit'));
        if (giveWater) addItem('water', 50);
        farm.tended = true;
        rollDay();
        return campHas('fruit');
      };
      const wet = run(true), dryY = run(false);
      O._yield = `the same field, tended both days: ${wet} greenfruit watered, ${dryY} dry`;
      O.aDryFieldYieldsAQuarter = (wet > 0 && dryY > 0 && dryY < wet * 0.55)
        ? `a tended field that gets no water yields ${dryY} against ${wet} — the earth is not nothing, `
          + `but it is not a farm either, which is the difference between building one and decorating with one`
        : `!! WATER DOES NOT DECIDE THE CROP (${wet} watered, ${dryY} dry)`;
    });
    return O;
  });

  console.log('=== WHAT THE GOLDEN AGE THREW AWAY ===\n');
  for (const [k, v] of Object.entries(R)) console.log('  ' + k.padEnd(32) + v);
  const bad = Object.values(R).map(String).filter(v => v.startsWith('!!'));
  if (errs.length) { console.log(''); errs.slice(0, 4).forEach(e => console.log('  ' + e)); }
  console.log('\n' + (bad.length || errs.length
    ? '*** ' + [...bad, ...errs].join('\n*** ')
    : 'THE SHORE IS WORKED, THE FIELDS DRINK, AND THE PLANT IS STILL LOST'));
  await b.close();
  process.exitCode = (bad.length || errs.length) ? 1 : 0;
})();
