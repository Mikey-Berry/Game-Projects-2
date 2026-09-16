#!/usr/bin/env node
/* THE SHELVES, AND WHERE WHAT IS ON THEM COMES FROM.
 *
 *   "I'd just like to audit how the craft/trade system and all that is working."
 *
 * `tools/_census.js` ran the world twenty-four days and came back with three things that were
 * not opinions:
 *
 *   · hide 49 → 4 and fabric 58 → 32, in a world where the only thing that MAKES fabric needs
 *     a hide. The crafter's cloak line read `take('fabric', 4) && take('hide')` — and `&&`
 *     short-circuits LEFT TO RIGHT, so on a shelf with cloth and no hide the four fabric were
 *     already spent when the hide test failed and the `if` came out false. Execution fell
 *     through the chain below it and burnt a FIFTH fabric on a bandage.
 *   · meat 55 → 662, rum 54 → 586. Nothing in the world eats. Every trade in `workShift` puts
 *     and the brewer alone takes, so food was not an economy, it was a warehouse.
 *   · thirteen goods that a vendor quotes a price for and no shelf anywhere holds — the
 *     aether-cell mistake, thirteen more times.
 *
 * Every claim here is about the DAY ROLL-OVER, which is inline in `update` and not a function
 * anything can call, so each one pushes `hour` to 23.999 and takes a single unpaused step.
 *
 *   node tools/larder.js [game.html]
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
    const rollDay = () => { const was = paused; paused = false; hour = 23.999; update(1 / 30); paused = was; };

    /* ---- 1. THE FABRIC LEAK ----
       Staged rather than sampled: a crafter, a shelf with cloth and NO hide, and the one shift
       the bug lives in. `workShift` is callable directly, which is the door here — the day
       roll-over would run four hundred other shifts and bury the four bolts in noise. */
    guard(['aCrafterWithNoHideSpendsNoCloth'], () => {
      const t = towns[0];
      const c = chars.find(o => o.civ && o.homeTown === t && o.trade);
      if (!c) { O.aCrafterWithNoHideSpendsNoCloth = '!! NO TOWNSPERSON WITH A TRADE TO STAGE'; return; }
      const wasTrade = c.trade, wasStock = Object.assign({}, t.stock);
      c.trade = 'crafter';
      /* THE PREMISE FIRST. A claim that counts zero spends has to show the branch was reachable:
         with no hide on the shelf the cloak line must be refused EVERY time, so any fabric that
         moves is the leak and nothing else. Twelve hundred shifts, because the cloak line opens
         on an 0.18 roll and one shift proves nothing either way. */
      let spent = 0, bandages = 0, cloaks = 0;
      for (let i = 0; i < 1200; i++) {
        t.stock = {fabric: 40, hide: 0, wood: 0};
        const before = t.stock.fabric;
        workShift(t, c);
        c.workOwed = false;
        const bandage = t.stock.bandage || 0;
        const cloak = Object.keys(t.stock).filter(k => (ITEMS[k] || {}).tierOf === 'k_road')
          .reduce((n, k) => n + t.stock[k], 0);
        const used = before - (t.stock.fabric || 0);
        /* a bandage is one fabric and it is a legitimate spend; anything past that is the leak */
        if (used > (bandage ? 1 : 0)) spent += used - (bandage ? 1 : 0);
        bandages += bandage; cloaks += cloak;
      }
      c.trade = wasTrade; t.stock = wasStock;
      O._leak = `1200 hideless shifts: ${bandages} bandages, ${cloaks} cloaks, ${spent} fabric spent on nothing`;
      O.aCrafterWithNoHideSpendsNoCloth = (cloaks === 0 && bandages > 0 && spent === 0)
        ? `a crafter who cannot reach a hide made ${bandages} bandages and burnt ${spent} cloth on the cloak `
          + `he could not make — the availability test comes before the spend now, the way the brewer above him already did it`
        : `!! ${spent} FABRIC VANISHED ACROSS 1200 HIDELESS SHIFTS (${cloaks} cloaks, ${bandages} bandages)`;
    });

    /* ---- 2. THE HUNTER'S SKIN SCALES ----
       Not "is the number bigger" — the reported fault is that hide was the ONE output in the
       whole switch that never read `tradeSkill`, so a hunter of forty years took the same skin
       as one on his first week. Two bodies, same town, same shelf, different skill. The house
       rule applies: this is a rolled quantity, so it is measured over a run rather than once. */
    guard(['anOldHandTakesMoreHide'], () => {
      const t = towns[0];
      const c = chars.find(o => o.civ && o.homeTown === t && o.trade);
      if (!c) { O.anOldHandTakesMoreHide = '!! NO TOWNSPERSON TO STAGE'; return; }
      const wasTrade = c.trade, wasSkill = c.tradeSkill, wasStock = Object.assign({}, t.stock);
      c.trade = 'hunter';
      const run = (sk) => {
        c.tradeSkill = sk; let n = 0;
        for (let i = 0; i < 600; i++) { t.stock = {}; c.tradeSkill = sk; workShift(t, c); c.workOwed = false; n += t.stock.hide || 0; }
        return n / 600;
      };
      const green = run(1), old = run(58);
      c.trade = wasTrade; c.tradeSkill = wasSkill; t.stock = wasStock;
      O._hide = `hide per shift: ${green.toFixed(2)} at skill 1, ${old.toFixed(2)} at skill 58`;
      O.anOldHandTakesMoreHide = (old > green * 1.3 && green > 0.6)
        ? `a hunter's skin yield reads his trade the way his meat already did — ${green.toFixed(2)} a shift green, `
          + `${old.toFixed(2)} at the top of the trade, against a crafter who spends about 0.59`
        : `!! HIDE DOES NOT SCALE WITH THE TRADE (${green.toFixed(2)} green, ${old.toFixed(2)} old)`;
    });

    /* ---- 3. THE TOWN EATS ----
       Through the day roll-over, not through a hand-called helper, because the whole complaint
       is that nothing in the WORLD eats — a sink that only fires when a probe calls it is the
       same nothing. Production runs on the same tick, so the claim is about the draw: a town
       stuffed with food loses some of it overnight. */
    guard(['aTownEatsOvernight', 'andAStrickenTownStillEats'], () => {
      const t = towns[0];
      const mouths = chars.filter(c => c.civ && c.homeTown === t && c.state !== 'dead').length;
      if (mouths < 4) { O.aTownEatsOvernight = '!! NOBODY LIVES IN THE FIRST TOWN'; O.andAStrickenTownStillEats = '!! SAME'; return; }
      /* PRODUCTION IS THE CONFOUND and it is removed rather than hoped about: with no food on
         the shelf at all there is nothing to eat, so the draw has to be visible against a pile
         big enough that one night of hunters cannot refill it. */
      const stuff = () => { t.stock = Object.assign({}, t.stock, {meat: 400, fish: 400, fruit: 400}); };
      stuff();
      const before = 1200;
      rollDay();
      const after = (t.stock.meat || 0) + (t.stock.fish || 0) + (t.stock.fruit || 0);
      const ate = before - after;
      O._eaten = `${mouths} mouths in ${t.name}: 1200 food went to ${after} overnight (net ${ate >= 0 ? '-' : '+'}${Math.abs(ate)})`;
      O.aTownEatsOvernight = (ate > 0)
        ? `${t.name} drew ${ate} off the larder in one night against ${mouths} living townsfolk — `
          + `food is a flow now rather than a pile that only ever grows`
        : `!! ${t.name} ATE NOTHING (1200 -> ${after})`;
      /* AND THE SIEGE CLAIM. The production loop opens `if(t.plague > 0 || t.sacked > 0)
         continue`; the sink is deliberately outside it, because work stops under ruin and
         hunger does not. Staged with plague ON, so production cannot mask the draw at all. */
      const wasPlague = t.plague;
      t.plague = 3;
      stuff();
      rollDay();
      const sickAfter = (t.stock.meat || 0) + (t.stock.fish || 0) + (t.stock.fruit || 0);
      t.plague = wasPlague;
      O._sick = `under plague: 1200 food went to ${sickAfter}`;
      O.andAStrickenTownStillEats = (1200 - sickAfter > 0)
        ? `a town under plague makes nothing and still eats ${1200 - sickAfter} — which is what makes a siege a siege`
        : `!! A STRICKEN TOWN EATS NOTHING (1200 -> ${sickAfter})`;
    });

    /* ---- 4. NO LEGENDARY IS FOR SALE ----
       Asked for directly, and the answer was already good news — the rule held, but it held
       because a comment said so. It is enforced here instead, in both directions: not on a
       vendor's list, and not in a town's stock either, since the shelf is what the list is
       read against. */
    guard(['noLegendIsOnAnyList', 'andNoneIsOnAnyShelf'], () => {
      const legends = Object.keys(ITEMS).filter(k => ITEMS[k].legend);
      if (!legends.length) { O.noLegendIsOnAnyList = '!! NO LEGENDARIES IN THIS BUILD'; O.andNoneIsOnAnyShelf = '!! SAME'; return; }
      const listed = new Set();
      for (const vt of Object.keys(VENDOR_STOCK)) for (const k of VENDOR_STOCK[vt]) listed.add(k);
      if (typeof VENDOR_TAKES !== 'undefined')
        for (const vt of Object.keys(VENDOR_TAKES)) for (const k of VENDOR_TAKES[vt]) listed.add(k);
      const forSale = legends.filter(k => listed.has(k));
      O._legend = `${legends.length} legendaries audited against ${listed.size} tradeable goods`;
      O.noLegendIsOnAnyList = forSale.length === 0
        ? `none of the ${legends.length} legendaries is on a vendor's list or a vendor's counter — `
          + `a rule that was true and only written down in a comment is a rule a claim keeps now`
        : `!! FOR SALE: ${forSale.map(k => ITEMS[k].name).join(', ').toUpperCase()}`;
      const shelved = [];
      for (const t of towns) for (const k of legends) if ((t.stock || {})[k] > 0) shelved.push(t.name + ':' + ITEMS[k].name);
      O.andNoneIsOnAnyShelf = shelved.length === 0
        ? `and no town anywhere holds one in stock, so there is no shelf for one to reach by accident`
        : `!! ON A SHELF: ${shelved.join(', ').toUpperCase()}`;
    });

    /* ---- 5. EVERY LISTED GOOD HAS A SOURCE ----
       This is the claim that turns "delisted" from a hole into a decision. A vendor may quote a
       price for a thing the town has none of TODAY — that is just an empty shelf — but it must
       not quote a price for a thing that cannot arrive: no seeding, no recipe, no chest table.
       Three sources counted, because the world has three. */
    guard(['everyThingForSaleComesFromSomewhere'], () => {
      const held = new Set();
      for (const t of towns) for (const k of Object.keys(t.stock || {})) if (t.stock[k] > 0) held.add(ITEMS[k] ? (ITEMS[k].tierOf || k) : k);
      /* the chest table is a private const inside `rollChestLoot`, so it is read the only way a
         probe can read it: by rolling it, a lot, and seeing what falls out */
      const fromChests = new Set();
      for (let i = 0; i < 4000; i++) {
        const l = rollChestLoot();
        for (const k of Object.keys((l && l.items) || {})) fromChests.add(ITEMS[k] ? (ITEMS[k].tierOf || k) : k);
      }
      const craftable = new Set();
      for (const grp of Object.keys(RECIPES || {})) for (const r of RECIPES[grp]) craftable.add(r.out);
      const orphans = [];
      for (const vt of Object.keys(VENDOR_STOCK)) for (const k of VENDOR_STOCK[vt]) {
        if (held.has(k) || fromChests.has(k) || craftable.has(k)) continue;
        orphans.push((ITEMS[k] || {}).name || k);
      }
      O._sources = `shelves ${held.size} goods, chests ${fromChests.size}, recipes ${craftable.size}`;
      O.everyThingForSaleComesFromSomewhere = orphans.length === 0
        ? `every good a vendor lists has a way into the world — a shelf, a chest or a bench. `
          + `The thirteen the audit found are gone: the plain ones are seeded, the rest are delisted on purpose`
        : `!! NO SOURCE ANYWHERE FOR: ${[...new Set(orphans)].join(', ').toUpperCase()}`;
    });

    /* ---- 6. AND THE TWO TOWNS NAMED AFTER A TRADE NOBODY PRACTISED ---- */
    guard(['thePitHasMiners', 'theFlatsHaveSalters'], () => {
      const pit = towns.find(t => t.def.key === 'ironscar');
      const flats = towns.find(t => t.def.key === 'saltmere');
      if (!pit || !flats) { O.thePitHasMiners = '!! IRONSCAR OR SALTMERE MISSING'; O.theFlatsHaveSalters = '!! SAME'; return; }
      const miners = chars.filter(c => c.civ && c.homeTown === pit && c.trade === 'miner').length;
      const salters = chars.filter(c => c.civ && c.homeTown === flats && c.trade === 'salter').length;
      O.thePitHasMiners = miners > 0
        ? `Ironscar works its own pit with ${miners} miners — `
          + `which also means \`workShift\`'s premium iron branch, keyed on this town, can finally run`
        : '!! IRONSCAR STILL HAS NO MINERS';
      /* AND THE PRODUCE, not just the headcount: a rota entry that yields nothing is a job title */
      const wasStock = Object.assign({}, flats.stock);
      const salter = chars.find(c => c.civ && c.homeTown === flats && c.trade === 'salter');
      let salt = 0, brine = 0;
      if (salter) for (let i = 0; i < 400; i++) { flats.stock = {}; workShift(flats, salter); salter.workOwed = false; salt += flats.stock.salt || 0; brine += flats.stock.brine || 0; }
      flats.stock = wasStock;
      O._flats = `${salters} salters; 400 shifts put up ${salt} salt and ${brine} brine`;
      O.theFlatsHaveSalters = (salters > 0 && salt > 0 && brine > 0)
        ? `Saltmere rakes its own pans — ${salters} salters turning out ${(salt / 400).toFixed(2)} salt and `
          + `${(brine / 400).toFixed(2)} brine a shift, in the one town whose whole identity is the flats`
        : `!! SALTMERE MAKES NO SALT (${salters} salters, ${salt} salt, ${brine} brine over 400 shifts)`;
    });
    return O;
  });

  console.log('=== THE SHELVES, AND WHERE WHAT IS ON THEM COMES FROM ===\n');
  for (const [k, v] of Object.entries(R)) console.log('  ' + k.padEnd(36) + v);
  const bad = Object.values(R).map(String).filter(v => v.startsWith('!!'));
  if (errs.length) { console.log(''); errs.slice(0, 4).forEach(e => console.log('  ' + e)); }
  console.log('\n' + (bad.length || errs.length
    ? '*** ' + [...bad, ...errs].join('\n*** ')
    : 'NOTHING LEAKS, THE TOWNS EAT, AND EVERY PRICE HAS A THING BEHIND IT'));
  await b.close();
  process.exitCode = (bad.length || errs.length) ? 1 : 0;
})();
