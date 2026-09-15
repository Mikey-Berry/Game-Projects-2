#!/usr/bin/env node
/* AN AUDIT OF THE LIVING WORLD: who works, who breeds, and whether the shelves move.
 *
 *   "Who has jobs and how many NPCs are idle or jobless? Are they still properly giving birth
 *    and carrying on legacies after our changes to the birthing mechanics? I'd just like to
 *    audit how the craft/trade system and all that is working."
 *
 * Three questions, one run, because they are the same run: the world has to go forward some
 * days before any of them has an answer, and running it three times would be three different
 * worlds. Reports rather than asserts — this is an instrument, not a claim. Anything it turns
 * up that IS a fault gets a claim of its own afterwards, in a file that fails on it.
 *
 *   node tools/_census.js [game.html] [days]
 */
const { chromium } = require('playwright');
const path = require('path');
const gamePath = (a) => path.resolve(a ? (path.isAbsolute(a) ? a : path.join(__dirname, a)) : path.join(__dirname, 'game.html'));

(async () => {
  const DAYS = Number(process.argv[3] || 12);
  const b = await chromium.launch({
    executablePath: process.env.DUSTWARD_CHROME || undefined,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'],
  });
  const errs = [];
  const p = await b.newPage({ viewport: { width: 700, height: 500 } });
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message.slice(0, 200)));
  await p.goto('file://' + gamePath(process.argv[2]), { waitUntil: 'load' });
  await p.waitForTimeout(3000);
  await p.evaluate(() => { document.getElementById('btn-start').click(); });
  await p.waitForTimeout(4000);

  const out = await p.evaluate(async (DAYS) => {
    const L = [];
    const say = (s) => L.push(s);
    const pct = (n, d) => d ? (n / d * 100).toFixed(0) + '%' : '—';

    /* ---------- run the world, counting the things that only happen at dawn ---------- */
    const tally = {births: 0, lost: 0, weds: 0, grown: 0, died: 0, leftTown: 0};
    const realLog = window.log;
    window.log = (txt, k) => {
      const s = String(txt);
      if (/is born|gives birth|delivered/i.test(s)) tally.births++;
      if (/did not live|stillborn|lost the child|came to nothing/i.test(s)) tally.lost++;
      if (/wed|married|marries/i.test(s)) tally.weds++;
      if (/comes of age|is grown|takes up/i.test(s)) tally.grown++;
      return realLog(txt, k);
    };
    const stock0 = {};
    for (const t of towns) stock0[t.name] = {...(t.stock || {})};
    const pop0 = chars.filter(c => c.state !== 'dead').length;
    const civ0 = chars.filter(c => c.civ && c.state !== 'dead').length;

    const wasPaused = paused, wasSpeed = (typeof speed !== 'undefined' ? speed : 1);
    paused = false;
    const startDay = day;
    let steps = 0;
    while (day < startDay + DAYS && steps < 400000) { update(1 / 6); steps++; }
    paused = wasPaused;
    window.log = realLog;

    /* ================= 1. WHO WORKS ================= */
    say('=== 1. WHO HAS A JOB ===');
    const alive = chars.filter(c => c.state !== 'dead');
    const byFaction = {};
    for (const c of alive) byFaction[c.faction] = (byFaction[c.faction] || 0) + 1;
    say(`  world population ${alive.length} (was ${pop0} at dawn on day ${startDay}), over ${DAYS} days`);
    say('  ' + Object.entries(byFaction).sort((a, c) => c[1] - a[1])
      .map(([k, v]) => `${k} ${v}`).join(' · '));

    const civs = alive.filter(c => c.civ);
    const kids = civs.filter(c => (c.age || 99) < 16);
    const adults = civs.filter(c => (c.age || 99) >= 16);
    const working = adults.filter(c => c.trade);
    const idle = adults.filter(c => !c.trade);
    say(`  townsfolk ${civs.length}: ${adults.length} grown, ${kids.length} children`);
    say(`  GROWN WITH A TRADE ${working.length} (${pct(working.length, adults.length)}) · `
      + `IDLE ${idle.length} (${pct(idle.length, adults.length)})`);
    const tradeN = {};
    for (const c of working) tradeN[c.trade] = (tradeN[c.trade] || 0) + 1;
    say('  trades: ' + Object.entries(tradeN).sort((a, c) => c[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(' · '));
    /* per town, because one dead town would hide inside a world average */
    say('  per town — grown / with a trade / idle / children:');
    for (const t of towns) {
      const here = civs.filter(c => c.homeTown === t);
      const ad = here.filter(c => (c.age || 99) >= 16);
      const wk = ad.filter(c => c.trade);
      say(`    ${t.name.padEnd(12)} ${String(ad.length).padStart(3)} / ${String(wk.length).padStart(3)} / `
        + `${String(ad.length - wk.length).padStart(3)} / ${String(here.length - ad.length).padStart(3)}`
        + (t.sacked ? '   SACKED' : '') + (t.plague > 0 ? '   PLAGUE' : ''));
    }
    /* and the ones who are nobody's townsfolk */
    const drift = alive.filter(c => c.faction === 'drifter');
    say(`  drifters on the road ${drift.length} — no trade by design, they are walking somewhere`);
    /* the player's own */
    const mine = alive.filter(c => c.faction === 'player');
    const myLiving = mine.filter(c => !c.undead);
    const myIdle = myLiving.filter(c => !c.job && !c.job2 && !c.cmd && !c.under);
    say(`  YOURS ${mine.length} (${myLiving.length} living): ${myLiving.length - myIdle.length} on a job or an order, ${myIdle.length} idle`);

    /* ================= 2. BIRTHS AND LEGACIES ================= */
    say('');
    say('=== 2. BIRTHS AND WHAT THEY INHERIT ===');
    const preg = alive.filter(c => (c.pregnant || 0) > 0);
    const wed = alive.filter(c => c.spouse);
    const over = alive.filter(c => (c.overdue || 0) > 0);
    say(`  over ${DAYS} days the log recorded ${tally.births} births and ${tally.lost} that did not live`);
    say(`  right now: ${wed.length} wed, ${preg.length} carrying, ${over.length} overdue`);
    say(`  townsfolk went ${civ0} → ${civs.length} (${civs.length - civ0 >= 0 ? '+' : ''}${civs.length - civ0})`);
    const bornKids = civs.filter(c => c.wasChild || (c.age || 99) < 16);
    say(`  children in the world ${kids.length}; bodies carrying the wasChild mark ${bornKids.length}`);
    /* THE LEGACY QUESTION: a child that grew up should mostly be doing its parent's trade */
    const grownKids = civs.filter(c => c.wasChild && (c.age || 0) >= 16);
    const withTrade = grownKids.filter(c => c.trade);
    say(`  grown-up children ${grownKids.length}, of whom ${withTrade.length} carry a trade`);
    const legacy = alive.filter(c => c.legacyTrade);
    say(`  bodies carrying a legacyTrade: ${legacy.length}`);
    /* homes, which the birth rule requires */
    const homes = pBuilds.filter(b2 => b2.type === 'home').length;
    const inns = buildings.filter(b2 => /inn|tavern/i.test(b2.label || '')).length;
    say(`  your homesteads ${homes}; town inns ${inns} — the two places a delivery is allowed`);

    /* ================= 3. CRAFT AND TRADE ================= */
    say('');
    say('=== 3. WHAT THE SHELVES DID ===');
    const moved = {}, allKeys = new Set();
    for (const t of towns) {
      const a = stock0[t.name] || {}, z = t.stock || {};
      for (const k of Object.keys(a)) allKeys.add(k);
      for (const k of Object.keys(z)) allKeys.add(k);
    }
    for (const k of allKeys) {
      let d = 0, n0 = 0, n1 = 0;
      for (const t of towns) { const a = (stock0[t.name] || {})[k] || 0, z = (t.stock || {})[k] || 0; n0 += a; n1 += z; d += z - a; }
      moved[k] = {d, n0, n1};
    }
    const rows = Object.entries(moved).sort((a, c) => c[1].d - a[1].d);
    say(`  town stock across all ${towns.length} towns, day ${startDay} → ${day}:`);
    for (const [k, v] of rows) {
      if (v.n0 === 0 && v.n1 === 0) continue;
      const nm = (ITEMS[k] || {}).name || k;
      say(`    ${nm.slice(0, 22).padEnd(23)} ${String(v.n0).padStart(5)} → ${String(v.n1).padStart(5)}  `
        + `${v.d > 0 ? '+' : ''}${v.d}`);
    }
    /* THE AETHER-CELL CHECK: anything a vendor LISTS that no town anywhere HOLDS */
    const listed = new Set();
    for (const k of Object.keys(VENDOR_STOCK)) for (const it of VENDOR_STOCK[k]) listed.add(it);
    const held = new Set();
    for (const t of towns) for (const k of Object.keys(t.stock || {})) if (t.stock[k] > 0) held.add(k);
    const empty = [...listed].filter(k => !held.has(k));
    say(`  vendor lists name ${listed.size} goods; ${empty.length} of them are on NO shelf in the world:`);
    say('    ' + (empty.length ? empty.map(k => (ITEMS[k] || {}).name || k).join(', ') : '(none — every listed good exists somewhere)'));
    /* and are the caravans moving */
    const cara = towns.filter(t => t.caravanOut).length;
    const carts = alive.filter(c => c.cart || c.mobileVendor).length;
    say(`  caravans out ${cara}; carts and travelling vendors on the map ${carts}`);
    /* the player's own benches */
    const benches = {};
    for (const b2 of pBuilds) if (RECIPES[b2.type]) benches[b2.type] = (benches[b2.type] || 0) + 1;
    say(`  your benches: ${Object.keys(benches).length ? Object.entries(benches).map(([k, v]) => `${k} ${v}`).join(' · ') : '(none built)'}`);
    return {lines: L, errs: []};
  }, DAYS);

  console.log(out.lines.join('\n'));
  if (errs.length) { console.log('\nPAGE ERRORS:'); errs.slice(0, 6).forEach(e => console.log('  ' + e)); }
  await b.close();
})();
