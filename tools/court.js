#!/usr/bin/env node
/* THE DEATHLESS COURT, WHICH EXISTS TO BE SPENT FROM.
 *
 * "The Deathless Court test start may need updating with some of the new tech, buildings, etc.
 *  At the very least, it looks like that start is missing some key materials... I also would
 *  like to have two liches — the deathless, plus an ascended Lyonart so I can preview/test his
 *  model. Having Lyre, Saga, and Czarina would also be helpful for testing."
 *
 * A testbed rots silently. Every other start is judged by whether it boots; this one is judged
 * by whether everything in the game can be REACHED from it, and that stops being true the day
 * somebody adds a building without thinking about a start nobody plays.
 *
 * Measured on the control: of the 22 ingredients named by a building cost or a recipe, NINE
 * were absent — lead, sundered marrow, aether cells, brine, salt, water, rum, cask rum and
 * leviathan hide — and three buildings could not be raised at all. The water chain and the rum
 * road had both arrived since the yard was last stocked.
 *
 * So the first claim is mechanical rather than a list: if the game asks for it, the Court has
 * it. The next thing added to the tech tree fails here instead of being found missing in play.
 *
 *   node tools/court.js [game.html]
 */
const { chromium } = require('playwright');
const path = require('path');
const gamePath = (a) => path.resolve(a ? (path.isAbsolute(a) ? a : path.join(__dirname, a)) : path.join(__dirname, 'game.html'));

(async () => {
  const b = await chromium.launch({ executablePath: process.env.DUSTWARD_CHROME || undefined,
    args: ['--use-gl=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox','--no-sandbox'] });
  const errs = [];
  const p = await b.newPage({ viewport: { width: 1000, height: 700 } });
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message.slice(0, 200)));
  await p.goto('file://' + gamePath(process.argv[2]), { waitUntil: 'load', timeout: 90000 });
  await p.waitForFunction(() => !!document.getElementById('btn-start'), null, { timeout: 60000 });
  await p.evaluate(() => document.getElementById('btn-start').click());
  await p.waitForFunction(() => typeof chars !== 'undefined', null, { timeout: 60000 });

  const R = await p.evaluate(() => {
    const O = {};
    const guard = (keys, fn) => {
      try { fn(); } catch (e) { for (const k of keys) if (O[k] === undefined) O[k] = '!! ' + String(e.message).slice(0, 130).toUpperCase(); }
    };
    applyCreation('human', 'dark', 'testbed');
    const mine = () => chars.filter(c => c.faction === 'player' && c.state !== 'dead');

    /* ---- 1. EVERY INGREDIENT THE GAME ASKS FOR IS IN THE YARD ----
       Derived from the game's own tables rather than from a list written here, which is the
       whole point: a list would have to be remembered, and remembering is what failed. */
    guard(['theYardHoldsEverythingTheGameAsksFor'], () => {
      const want = new Set();
      for (const k of Object.keys(BUILD_TYPES)) for (const c of Object.keys(BUILD_TYPES[k].cost || {})) want.add(c);
      for (const g of Object.keys(RECIPES)) for (const r of RECIPES[g]) for (const c of Object.keys(r.cost || {})) want.add(c);
      const missing = [...want].filter(k => campHas(k) === 0).sort();
      O._asked = `${want.size} ingredients are named by a building cost or a recipe`;
      O.theYardHoldsEverythingTheGameAsksFor = missing.length === 0
        ? `every one of the ${want.size} ingredients the game can ask for is in the yard`
        : `!! THE YARD HAS NONE OF: ${missing.map(k => (ITEMS[k] || {}).name || k).join(', ').toUpperCase()}`;
    });

    /* ---- 2. AND EVERY BUILDING CAN ACTUALLY BE RAISED ----
       Holding one of a thing is not the same as holding enough of it, and the Desalination
       Plant wants ten lead. Asked separately for that reason. */
    guard(['andEveryBuildingCanBeRaised'], () => {
      const cant = [];
      for (const k of Object.keys(BUILD_TYPES)) {
        const cost = BUILD_TYPES[k].cost || {};
        for (const c of Object.keys(cost)) if (campHas(c) < cost[c]) { cant.push(`${BUILD_TYPES[k].name} wants ${cost[c]} ${(ITEMS[c] || {}).name || c} and has ${campHas(c)}`); break; }
      }
      O.andEveryBuildingCanBeRaised = cant.length === 0
        ? `all ${Object.keys(BUILD_TYPES).length} buildings in the game can be raised out of this yard without trading for anything`
        : `!! CANNOT RAISE: ${cant.join(' | ').toUpperCase()}`;
    });

    /* ---- 3. AND EVERY FORMULA IS ALREADY READ ---- */
    guard(['andTheTreeIsFinished'], () => {
      const left = Object.keys(TECHS).filter(k => !research.done[k]);
      O.andTheTreeIsFinished = left.length === 0
        ? `all ${Object.keys(TECHS).length} formulae are recovered, so nothing here is gated behind reading`
        : `!! STILL UNREAD: ${left.join(', ').toUpperCase()}`;
    });

    /* ---- 4. TWO LICHES, AND THE SECOND ONE WEARS HIS OWN HEAD ----
       The heart of the request. `LICHFACE` maps `lyonart` to `lyonlich`, and that mapping only
       fires on a body that is BOTH that face AND a lich — a pairing the game otherwise produces
       exactly once, at the end of a questline. The claim is not that he is present; it is that
       the head resolves, because a Lyonart who ascended into the generic robe is the failure
       this is meant to let you see. */
    guard(['thereAreTwoLiches', 'andLyonartWearsHisOwnAscendedHead'], () => {
      const liches = mine().filter(c => c.lich);
      O._liches = liches.map(c => `${c.name} [${headKeyOf(c) || 'no sculpt'}]`).join(', ');
      O.thereAreTwoLiches = liches.length >= 2
        ? `${liches.length} liches stand in the yard — ${liches.map(c => c.name).join(' and ')}`
        : `!! ONLY ${liches.length} LICH IN THE COURT`;
      const ly = mine().find(c => c.face === 'lyonart');
      if (!ly) { O.andLyonartWearsHisOwnAscendedHead = '!! LYONART IS NOT IN THE COURT'; return; }
      const head = headKeyOf(ly);
      const robed = typeof robedLich === 'function' ? robedLich(ly) : null;
      O.andLyonartWearsHisOwnAscendedHead = (ly.lich && head === LICHFACE.lyonart && robed === false)
        ? `and Lyonart is ascended wearing \`${head}\` — his own head on his own body, not the Deathless robe, which is the pairing the game otherwise makes once at the end of a questline`
        : `!! LYONART'S ASCENDED HEAD DOES NOT RESOLVE (lich ${ly.lich}, head ${head}, robed ${robed})`;
    });

    /* ---- 5. AND THE OTHER THREE ARE THE BODIES THE GAME MAKES ----
       Not just "somebody named Saga". A Hollow without `hollowTier` is an ordinary man in
       plate, which is precisely the thing you would be previewing wrongly. */
    guard(['theNamedBodiesAreTheRealOnes'], () => {
      const bad = [];
      const want = {
        'Lyre d\'Alagadda': c => c.face === 'lyre' && !c.undead && c.stats.medic >= 30,
        'Saga Wordsworth':  c => c.face === 'saga' && c.race === 'hollow' && c.hollowTier >= 1,
        'Czarina':          c => c.face === 'czarina' && c.race === 'hollow' && c.hollowTier >= 1,
      };
      for (const nm of Object.keys(want)) {
        const c = mine().find(o => o.name === nm);
        if (!c) { bad.push(`${nm} is absent`); continue; }
        if (!want[nm](c)) bad.push(`${nm} is present but wrong (face ${c.face}, race ${c.race}, tier ${c.hollowTier})`);
      }
      O._named = mine().filter(c => c.face).map(c => `${c.name}:${c.face}`).join(', ');
      O.theNamedBodiesAreTheRealOnes = bad.length === 0
        ? 'Lyre, Saga and Czarina are all in the yard, each built off the numbers its own spawn uses — a Hollow with its tier, not a man in plate'
        : `!! ${bad.join(' | ').toUpperCase()}`;
    });

    /* ---- 6. AND THE COURT IS STILL A COURT ----
       A guardrail on the rest: adding five named bodies must not have cost the risen. */
    guard(['theCourtIsStillAHost'], () => {
      const risen = mine().filter(c => c.undead && !c.lich).length;
      const living = mine().filter(c => !c.undead).length;
      O.theCourtIsStillAHost = (risen >= 10 && living >= 2)
        ? `${risen} risen under the banner and ${living} living hands, because the dead cannot study or work a vat`
        : `!! THE YARD IS THIN (${risen} risen, ${living} living)`;
    });
    return O;
  });

  console.log('=== THE DEATHLESS COURT ===\n');
  for (const [k, v] of Object.entries(R)) console.log('  ' + k.padEnd(36) + v);
  const bad = Object.values(R).map(String).filter(v => v.startsWith('!!'));
  if (errs.length) { console.log(''); errs.slice(0, 4).forEach(e => console.log('  ' + e)); }
  console.log('\n' + (bad.length || errs.length
    ? '*** ' + [...bad, ...errs].join('\n*** ')
    : 'THE COURT IS STOCKED, THE TREE IS READ, AND THE FACES ARE THERE TO LOOK AT'));
  await b.close();
  process.exitCode = (bad.length || errs.length) ? 1 : 0;
})();
