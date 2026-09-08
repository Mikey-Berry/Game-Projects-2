#!/usr/bin/env node
/* TWELVE THINGS THAT EACH CHANGE ONE RULE.
 *
 *   "Legendaries to start building — reference the Unbuilt doc."
 *
 * The doc set the standard this file holds to: vanity changes nothing, ordinary gear moves
 * NUMBERS, and a legendary changes EXACTLY ONE RULE. So none of the claims below asks whether
 * an item exists or whether a flag is set — every one takes a live body, reads the rule with
 * the item off, puts the item on, and reads the rule again. A legendary that does not move its
 * own function is not a legendary, it is an expensive hat.
 *
 * And the doc's one placement rule, which is the only one it stated twice: FINDABLE IN EXACTLY
 * ONE PLACE, AND THAT PLACE MUST BE DANGEROUS. Nothing in a shop. That is counted rather than
 * trusted — the shelves of all seven towns are swept for them.
 *
 * Anything starting '!!' fails the build.
 *
 *   node tools/legends.js [game.html]
 */
const { chromium } = require('playwright');
const path = require('path');
const gamePath = (a) => path.resolve(a ? (path.isAbsolute(a) ? a : path.join(__dirname, a)) : path.join(__dirname, 'game.html'));

/* the twelve, and the slot each one belongs in — the harness's own copy, so a key renamed in
   the game without renaming it here is a red claim rather than a silent pass */
const TWELVE = {
  w_stave:'weapon', w_tooth:'weapon',
  a_widow:'armor', a_eleventh:'armor', a_habit:'armor',
  h_circlet:'head',
  k_twelfth:'cloak', k_strider:'cloak', k_gaunt:'cloak',
  t_signet:'trinket', t_splinter:'trinket', t_salmortis:'trinket',
};

(async () => {
  const b = await chromium.launch({
    executablePath: process.env.DUSTWARD_CHROME || undefined,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'],
  });
  const p = await b.newPage({ viewport: { width: 1200, height: 820 } });
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message.slice(0, 240)));
  p.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text().slice(0, 240)); });
  await p.goto('file://' + gamePath(process.argv[2]), { waitUntil: 'load' });
  await p.waitForTimeout(3000);
  await p.evaluate(() => document.getElementById('btn-start').click());
  await p.waitForTimeout(3000);
  const R = {};
  const NOTHING = '!! NOTHING TO MEASURE — this build has no legendaries';

  /* the fixture: a clean body somewhere harmless, and a way to read a rule with the item off
     and then on. Everything below uses it, because "the same body, one thing different" is the
     only shape of measurement that can tell a rule from a coincidence. */
  await p.evaluate(() => {
    window.__probe = (opts) => {
      const t = towns[0];
      const c = makeChar('Probe', 'player', t.x + 40, t.y + 40,
        Object.assign({ atk: 14, def: 12, tough: 20, ath: 10, magic: 40, armr: 20 }, opts || {}));
      c.state = 'ok'; c.floor = 0; c.job = null; c.guard = null; c.moveTarget = null; c.target = null;
      chars.push(c);
      return c;
    };
    /* read a rule with the slot empty, then with the item in it, then put the slot back */
    window.__swing = (c, slot, key, read) => {
      const was = c[slot];
      c[slot] = null; rebuildCharGrid();
      const off = read(c);
      c[slot] = key; rebuildCharGrid();
      const on = read(c);
      c[slot] = was; rebuildCharGrid();
      return { off, on };
    };
  });

  /* ---- 1. ALL TWELVE EXIST, IN THE RIGHT SLOTS, AND EVERY ONE IS MARKED ---- */
  const roster = await p.evaluate((TWELVE) => {
    if (typeof ITEMS !== 'object') return null;
    const missing = [], wrongSlot = [], unmarked = [];
    for (const [k, sl] of Object.entries(TWELVE)) {
      const it = ITEMS[k];
      if (!it) { missing.push(k); continue; }
      if (it.type !== sl) wrongSlot.push(k + ':' + it.type);
      if (!it.legend) unmarked.push(k);
    }
    return { missing, wrongSlot, unmarked, n: Object.keys(TWELVE).length };
  }, TWELVE);
  R.twelveOfThem = !roster || roster.missing.length === roster.n ? NOTHING
    : (!roster.missing.length && !roster.wrongSlot.length && !roster.unmarked.length)
    ? `all ${roster.n} are in the table, each in its own slot, each marked \`legend\``
    : `!! THE ROSTER IS WRONG (missing ${JSON.stringify(roster.missing)}, slot ${JSON.stringify(roster.wrongSlot)}, unmarked ${JSON.stringify(roster.unmarked)})`;

  /* ---- 2. AND NOT ONE OF THEM IS FOR SALE ----
     The doc's rule, and the easiest one to break by accident: adding an item to a slot list is
     how the last three slots were made buyable, and it would have made these buyable too. */
  const shops = await p.evaluate((TWELVE) => {
    if (typeof VENDOR_STOCK !== 'object') return null;
    const listed = [];
    for (const [vt, list] of Object.entries(VENDOR_STOCK))
      for (const k of list) if (TWELVE[k]) listed.push(vt + '/' + k);
    /* and nothing has crept into a town's opening books either */
    const stocked = [];
    for (const t of towns) for (const k of Object.keys(t.stock || {}))
      if (TWELVE[k] && t.stock[k] > 0) stocked.push(t.name + '/' + k);
    return { listed, stocked, towns: towns.length };
  }, TWELVE);
  R.andNoneOfThemIsForSale = !shops ? NOTHING
    : (!shops.listed.length && !shops.stocked.length)
    ? `no vendor in the game lists one and no seat of the ${shops.towns} is holding one — the shelves cannot reach them`
    : `!! A LEGENDARY IS ON A SHELF (${JSON.stringify(shops.listed)} ${JSON.stringify(shops.stocked)})`;

  /* ---- 3. EXACTLY ONE OF EACH IS IN THE WORLD, AND EACH IS BEHIND SOMETHING ----
     Counted across every path a legendary can reach you by: chest loot, a body's drop table,
     and something already in a hand. */
  const placed = await p.evaluate((TWELVE) => {
    if (typeof chests === 'undefined') return null;
    const count = {}, where = {};
    const note = (k, w) => { count[k] = (count[k] || 0) + 1; (where[k] || (where[k] = [])).push(w); };
    for (const ch of chests) if (ch.loot && ch.loot.items)
      for (const k of Object.keys(ch.loot.items))
        if (TWELVE[k]) note(k, (ch.vault ? 'vault' : 'chest') + '@' + Math.round(ch.x) + ',' + Math.round(ch.y) + (ch.floor ? 'f' + ch.floor : ''));
    for (const c of chars) {
      if (c.dropItems) for (const k of Object.keys(c.dropItems)) if (TWELVE[k]) note(k, 'drop:' + (c.bossKey || c.kin || c.deepKin || c.name));
      /* COUNTED SEPARATELY FROM THE DROP TABLE, because `lootCorpse` counts them separately:
         it adds `t.weapon` and THEN walks `t.dropItems`, so a body that both holds a thing and
         lists it hands over two. The first version of this line excluded held items that were
         also dropped — and so counted one where the game gives two, which is exactly the bug
         it was written to catch. It found it on the second reading. */
      for (const sl of EQ_SLOTS) if (c[sl] && TWELVE[c[sl]]) note(c[sl], 'held');
    }
    /* the two that are not in the world yet because they are given by an event */
    const byEvent = ['a_habit', 't_splinter'];
    const dupes = Object.keys(count).filter(k => count[k] > 1);
    const seeded = Object.keys(count).filter(k => TWELVE[k]);
    const loose = seeded.filter(k => (where[k] || []).some(w => w.startsWith('chest')));
    /* and each one somewhere of its own — two in a chest would mean two places were intended
       and one was reached, which is the failure a "one of each" count cannot see */
    const spots = seeded.map(k => (where[k] || [])[0]);
    const shared = spots.filter((w, i) => w && w.indexOf('@') > 0 && spots.indexOf(w) !== i);
    return { count, where, dupes, seeded: seeded.length, byEvent, shared,
             missing: Object.keys(TWELVE).filter(k => !count[k] && byEvent.indexOf(k) < 0), loose };
  }, TWELVE);
  R.oneEach = !placed ? NOTHING
    : (!placed.dupes.length && !placed.missing.length && placed.seeded === 10)
    ? `${placed.seeded} of them are seeded in the world exactly once each and the other two are given by an event; no duplicates anywhere`
    : `!! THE PLACEMENT IS WRONG (dupes ${JSON.stringify(placed.dupes)}, missing ${JSON.stringify(placed.missing)}, seeded ${placed.seeded})`;
  R.andBehindSomething = !placed ? NOTHING
    : (!placed.loose.length && !placed.shared.length)
    ? `and not one of them is in an ordinary chest — ${Object.entries(placed.where).map(([k, w]) => k + '@' + w[0]).join(', ')}`
    : `!! A LEGENDARY IS IN A PLAIN CHEST OR SHARING ONE (loose ${JSON.stringify(placed.loose)}, shared ${JSON.stringify(placed.shared)})`;

  /* ==================== AND NOW EACH RULE, MOVED ==================== */

  /* ---- 4. THE ARCHLICH'S STAVE: five more of the dead ---- */
  const stave = await p.evaluate(() => {
    if (!ITEMS.w_stave) return null;
    const c = window.__probe({ magic: 50 }); c.gift = 'dark';
    return window.__swing(c, 'weapon', 'w_stave', x => risenCap(x));
  });
  R.theStaveHoldsFive = !stave ? NOTHING : (stave.on - stave.off === 5)
    ? `the binding ceiling goes ${stave.off} to ${stave.on} — five more of them, through the term \`risenCap\` was already summing`
    : `!! THE STAVE HOLDS NOTHING (${JSON.stringify(stave)})`;

  /* ---- 5. WIDOW'S WEAVE: and holding them costs nothing ----
     The counterweight, so the pair is a host build rather than two of the same upgrade. */
  const widow = await p.evaluate(() => {
    if (!ITEMS.a_widow) return null;
    const c = window.__probe({ magic: 50 }); c.gift = 'dark';
    c._bindW = 9;                    /* nine bound: a real strain, not a rounding error */
    return window.__swing(c, 'armor', 'a_widow', x => bindStrain(x));
  });
  R.theWeaveTakesTheStrain = !widow ? NOTHING : (widow.off > 0.3 && widow.on === 0)
    ? `nine bound is ${(widow.off * 100).toFixed(0)}% off the pool bare and exactly none of it in the Weave`
    : `!! THE STRAIN STILL REACHES THE WEARER (${JSON.stringify(widow)})`;

  /* ---- 6. THE ELEVENTH COAT: nothing counters it ----
     Read through `mitigate` off real blows rather than off the table, because the claim is
     about what a hit DOES and the matrix is only how it gets there. */
  const coat = await p.evaluate(() => {
    if (!ITEMS.a_eleventh) return null;
    const wts = ['cut', 'pierce', 'blunt', 'burn'];
    /* ONE BODY, EIGHT READINGS. The first version made a fresh probe for each of the four
       damage types, and `makeChar` rolls a SUBRACE — several of which carry their own `vuln`
       row that `mitigate` applies after the armour. So four probes meant four different
       creatures and the Coat came back with a 1.6 spread that belonged to the bodies wearing
       it, not to the coat. Same body, one thing different, which is the rule every other claim
       in this file already keeps. */
    const d = window.__probe();
    const feel = (armor) => { d.armor = armor;
      return wts.map(w => Math.round(mitigate(d, 100, w, 0, null) * 10) / 10); };
    const plate = feel('a_pla'), coat = feel('a_eleventh');
    d.state = 'dead';
    const spread = a => Math.max(...a) - Math.min(...a);
    return { wts, plate, coat, plateSpread: +spread(plate).toFixed(1), coatSpread: +spread(coat).toFixed(1) };
  });
  R.theCoatAnswersNothing = !coat ? NOTHING
    : (coat.coatSpread < 0.6 && coat.plateSpread > 5)
    ? `plate takes ${coat.plate.join('/')} from ${coat.wts.join('/')} — a spread of ${coat.plateSpread}. The Coat takes ${coat.coat.join('/')}: a spread of ${coat.coatSpread}, so nothing counters it and nothing is good against it`
    : `!! THE COAT STILL HAS A MATCHUP (${JSON.stringify(coat)})`;

  /* ---- 7. THE UNHALLOWED HABIT: the ground stops objecting ----
     And, just as important, only for the RAISING — the two damage lines about the dead
     standing on holy ground are a different rule and must not have moved. */
  const habit = await p.evaluate(() => {
    if (!ITEMS.a_habit || typeof holyStops !== 'function') return null;
    const sh = shrines.find(s => !s.broken);
    if (!sh) return null;
    const c = window.__probe();
    c.x = sh.x; c.y = sh.y;
    const off = !!holyStops(c, sh.x, sh.y);
    c.armor = 'a_habit';
    const on = !!holyStops(c, sh.x, sh.y);
    /* the ground itself has not stopped being holy — that is the other rule */
    const stillHoly = !!consecratedAt(sh.x, sh.y);
    c.state = 'dead';
    return { off, on, stillHoly };
  });
  R.theHabitUnhallowsTheGround = !habit ? NOTHING
    : (habit.off && !habit.on && habit.stillHoly)
    ? 'a caster standing on shrine ground is refused bare and not refused in the Habit — and the ground is still consecrated, so what it does to the dead standing on it is untouched'
    : `!! THE HABIT CHANGED THE WRONG RULE (${JSON.stringify(habit)})`;

  /* ---- 8. THE CIRCLET OF THE POURING: master an art that was never yours ---- */
  const circlet = await p.evaluate(() => {
    if (!ITEMS.h_circlet) return null;
    const c = window.__probe({ magic: 60 }); c.gift = 'dark';
    const read = x => BRANCHES.map(b => attCap(x, b));
    const r = window.__swing(c, 'head', 'h_circlet', read);
    /* and it does not argue with a thing bound around one formula */
    const only = window.__probe(); only.gift = 'divine'; only.onlyArt = 'divine';
    only.head = 'h_circlet';
    const bound = BRANCHES.map(b => attCap(only, b));
    only.state = 'dead'; c.state = 'dead';
    return { off: r.off, on: r.on, bound, branches: BRANCHES };
  });
  R.theCircletWidensTheCraft = !circlet ? NOTHING
    : (circlet.off.filter(n => n === 2).length === 3 && circlet.on.every(n => n === 3) &&
       circlet.bound.filter(n => n === 3).length === 1)
    ? `a dark-gifted caster caps at ${circlet.off.join('/')} across ${circlet.branches.join('/')} and at ${circlet.on.join('/')} in the Circlet — and a thing bound around one formula still has room for exactly that one`
    : `!! THE CIRCLET WIDENS THE WRONG THING (${JSON.stringify(circlet)})`;

  /* ---- 9. SHROUD OF THE TWELFTH: not the wearer, everyone near them ----
     The whole difference between this and the Gravecloth, which hides one body. */
  const shroud = await p.evaluate(() => {
    if (!ITEMS.k_twelfth || typeof shrouders === 'undefined') return null;
    const bearer = window.__probe();
    const near = window.__probe(); near.undead = true; near.x = bearer.x + 6;   /* inside 14 */
    const far = window.__probe(); far.undead = true; far.x = bearer.x + 30;     /* well outside */
    rebuildCharGrid();
    const before = { near: revealedUndead(near), far: revealedUndead(far) };
    bearer.cloak = 'k_twelfth'; rebuildCharGrid();
    const after = { near: revealedUndead(near), far: revealedUndead(far) };
    /* and it covers your own, not a battlefield */
    const theirs = window.__probe(); theirs.undead = true; theirs.faction = 'gaunt';
    theirs.x = bearer.x + 4; rebuildCharGrid();
    const enemy = revealedUndead(theirs);
    for (const c of [bearer, near, far, theirs]) c.state = 'dead';
    rebuildCharGrid();
    return { before, after, enemy };
  });
  R.theShroudCoversTheHost = !shroud ? NOTHING
    : (shroud.before.near && shroud.before.far && !shroud.after.near && shroud.after.far && shroud.enemy)
    ? 'a risen six tiles from the bearer stops reading as risen and one thirty tiles off does not — and it covers your own rather than everything with a pulse missing'
    : `!! THE SHROUD COVERS THE WRONG PEOPLE (${JSON.stringify(shroud)})`;

  /* ---- 10. STRIDERCLOAK: plate at a duster's pace ---- */
  const strider = await p.evaluate(() => {
    if (!ITEMS.k_strider) return null;
    const c = window.__probe({ armr: 10 });
    c.armor = 'a_pla'; c.head = 'h_armet';
    const off = { pen: +armorPen(c).toFixed(3), spd: +moveSpeedRaw(c).toFixed(2) };
    c.cloak = 'k_strider';
    const on = { pen: +armorPen(c).toFixed(3), spd: +moveSpeedRaw(c).toFixed(2) };
    c.state = 'dead';
    return { off, on };
  });
  R.theCloakCarriesThePlate = !strider ? NOTHING
    : (strider.off.pen > 0.15 && strider.on.pen === 0 && strider.on.spd > strider.off.spd)
    ? `plate and an armet drag ${(strider.off.pen * 100).toFixed(0)}% off a body and nothing at all under the Stridercloak — ${strider.off.spd} tiles a second becomes ${strider.on.spd}`
    : `!! THE STRIDERCLOAK STILL WEIGHS SOMETHING (${JSON.stringify(strider)})`;

  /* ---- 11. THE GAUNT'S MANTLE: they do not pick you FIRST ----
     Not "cannot be attacked", which is what a large enough aggro weight would quietly have
     made it — so the claim asks both halves, with a second body and alone. */
  const mantle = await p.evaluate(() => {
    if (!ITEMS.k_gaunt) return null;
    const g = spawnGaunt('stalker', towns[0].x + 60, towns[0].y + 60);
    if (!g) return null;
    g.state = 'ok'; chars.push(g);
    const me = window.__probe(); me.x = g.x + 2; me.y = g.y;
    const mate = window.__probe(); mate.x = g.x + 5; mate.y = g.y;
    rebuildCharGrid();
    const before = nearestEnemy(g, 14) === me;
    me.cloak = 'k_gaunt'; rebuildCharGrid();
    const after = nearestEnemy(g, 14);
    /* and alone in a corridor with it, you are still what it has */
    mate.state = 'dead'; rebuildCharGrid();
    const alone = nearestEnemy(g, 14) === me;
    for (const c of [g, me, mate]) c.state = 'dead';
    rebuildCharGrid();
    return { before, passedOver: after === mate, alone };
  });
  R.theMantleTurnsTheirEye = !mantle ? NOTHING
    : (mantle.before && mantle.passedOver && mantle.alone)
    ? 'a stalker two tiles away takes you bare, takes the man five tiles behind you once the Mantle is on, and still takes you when there is nobody else in the room'
    : `!! THE MANTLE HIDES YOU OR DOES NOTHING (${JSON.stringify(mantle)})`;

  /* ---- 12. THE OSSUARY KING'S SIGNET: one more lieutenant ---- */
  const signet = await p.evaluate(() => {
    if (!ITEMS.t_signet) return null;
    const c = window.__probe();
    const cap = x => (x.lich ? 2 : 1) + (research.done.necromancy ? 1 : 0) + gearSum(x, 'lieu');
    return window.__swing(c, 'trinket', 't_signet', cap);
  });
  R.theSignetHoldsOneMore = !signet ? NOTHING : (signet.on - signet.off === 1)
    ? `the lieutenant ceiling goes ${signet.off} to ${signet.on}`
    : `!! THE SIGNET COMMANDS NOBODY (${JSON.stringify(signet)})`;

  /* ---- 13. MALATHUUN'S SPLINTER: free, and only while the world is coming apart ---- */
  const splinter = await p.evaluate(() => {
    if (!ITEMS.t_splinter || typeof splinterFree !== 'function') return null;
    const c = window.__probe({ magic: 60 });
    c.gift = 'destruction'; c.att = { divine: 0, destruction: 3, dark: 0, dust: 0 };
    c.trinket = 't_splinter';
    const noTear = splinterFree(c);
    /* a tear, right there */
    const r = { id: 9901, x: c.x + 6, y: c.y, floor: 0, hp: 100 };
    rifts.push(r);
    const withTear = splinterFree(c);
    /* and one on the far side of the map is not "within sight" */
    r.x = c.x + 200;
    const farTear = splinterFree(c);
    r.x = c.x + 6;
    /* now the rule itself: does a working actually cost nothing */
    c.mana = 100; spendCast(c, 'firebolt');
    const freeCast = c.mana;
    rifts.splice(rifts.indexOf(r), 1);
    c.mana = 100; c.castCd = 0; spendCast(c, 'firebolt');
    const paidCast = c.mana;
    c.state = 'dead';
    return { noTear, withTear, farTear, freeCast, paidCast, cost: SPELLS.firebolt.cost };
  });
  R.theSplinterIsFreeWhileItBleeds = !splinter ? NOTHING
    : (!splinter.noTear && splinter.withTear && !splinter.farTear &&
       splinter.freeCast === 100 && splinter.paidCast === 100 - splinter.cost)
    ? `a tear six tiles off and the working costs nothing (100 mana in, 100 out); the same tear two hundred tiles away is not within sight, and with it closed the same working costs its ${splinter.cost}`
    : `!! THE SPLINTER IS FREE ALWAYS OR NEVER (${JSON.stringify(splinter)})`;

  /* ---- 14. SAL MORTIS: the corpse keeps, and nothing eats it ---- */
  const salt = await p.evaluate(() => {
    if (!ITEMS.t_salmortis) return null;
    /* the curing, at the moment they fall */
    const a = window.__probe(); a.trinket = 't_salmortis';
    const b2 = window.__probe();
    kill(a, null); kill(b2, null);
    const cured = { warded: !!a.salted, plain: !!b2.salted };
    /* and the teeth. A Maw with two bodies in front of it takes the one with no salt on it. */
    const eater = window.__probe(); eater.faction = 'wild'; eater.beast = true; eater.eater = true;
    const meal = window.__probe(); meal.state = 'down'; meal.x = eater.x + 1;
    const warded = window.__probe(); warded.state = 'down'; warded.x = eater.x + 0.5;
    warded.trinket = 't_salmortis';
    rebuildCharGrid();
    const found = chars.find(o => o.faction !== 'wild' && !o.undead && o.state === 'down' &&
                                  !gearHas(o, 'salmortis') && dist(eater.x, eater.y, o.x, o.y) < 2.5);
    for (const c of [eater, meal, warded]) c.state = 'dead';
    return { cured, choseUnwarded: found === meal, wardedWasCloser: true };
  });
  R.salMortisKeepsAndIsNotEaten = !salt ? NOTHING
    : (salt.cured.warded && !salt.cured.plain && salt.choseUnwarded)
    ? 'the body wearing it is cured where it falls and the one beside it is not — and a Maw standing over both walks past the salted one for the meal half a tile further away'
    : `!! SAL MORTIS DOES ONE HALF OF ITS JOB (${JSON.stringify(salt)})`;

  /* ---- 15. LLAMMIALITH'S TOOTH: what it opens does not close ----
     The whole rework, driven rather than read: a real blow from a real body holding it, then
     a bandage that fails, then hours that take the limb, then the light that does not. */
  const tooth = await p.evaluate(() => {
    if (!ITEMS.w_tooth || typeof toothTick !== 'function') return null;
    const cut = (armed) => {
      const a = window.__probe({ atk: 30 });
      const d = window.__probe({ tough: 40 });
      if (armed) a.weapon = 'w_tooth';
      applyDamage(a, d, 'l.arm', 30, 'cut', false);
      const marked = d.parts['l.arm'].tooth > 0;
      return { a, d, marked };
    };
    const bare = cut(false);
    bare.a.state = bare.d.state = 'dead';
    const bit = cut(true);
    const d = bit.d;
    /* a bandage is no answer, and the medic knows before walking over */
    addItem('bandage', 5);
    const medic = window.__probe({ medic: 40 });
    const canTreat = treatable(d);
    const treated = treatOnePart(medic, d);
    const stillOpen = d.parts['l.arm'].tooth > 0;
    /* nor is time: the clot loop steps over it */
    const bleed0 = d.parts['l.arm'].bleed;
    for (let i = 0; i < 4; i++) bodyTick(d, 1);
    const bleedAfter = d.parts['l.arm'].bleed;
    /* and the clock runs out */
    for (let i = 0; i < 8; i++) bodyTick(d, 1);
    const gone = !!d.parts['l.arm'].severed;
    /* now the light, on a fresh wound */
    const bit2 = cut(true);
    const healer = window.__probe({ magic: 50 }); healer.gift = 'divine';
    castHeal(healer, bit2.d);
    const closed = !(bit2.d.parts['l.arm'].tooth > 0);
    const canTreatAfter = treatable(bit2.d);
    for (const c of [d, medic, healer, bit.a, bit2.a, bit2.d]) c.state = 'dead';
    return { bareMarked: bare.marked, bitMarked: bit.marked, canTreat, treated, stillOpen,
             bleed0: +bleed0.toFixed(2), bleedAfter: +bleedAfter.toFixed(2), gone, closed, canTreatAfter };
  });
  R.theToothDoesNotClose = !tooth ? NOTHING
    : (!tooth.bareMarked && tooth.bitMarked && !tooth.canTreat && !tooth.treated && tooth.stillOpen &&
       tooth.bleedAfter >= tooth.bleed0)
    ? `an ordinary blade leaves an ordinary wound; the Tooth leaves one the medic will not walk over for, a bandage cannot close, and four hours does not clot (${tooth.bleed0} bleeding, ${tooth.bleedAfter} after)`
    : `!! THE TOOTH LEAVES AN ORDINARY WOUND (${JSON.stringify(tooth)})`;
  R.andTheLimbGoesUnlessYouWorkIt = !tooth ? NOTHING
    : (tooth.gone && tooth.closed && tooth.canTreatAfter)
    ? 'twelve hours untended and the arm comes away — and a divine hand called to a fresh one closes it, after which cloth works on it again like any other cut'
    : `!! THE CLOCK OR THE CURE IS WRONG (${JSON.stringify(tooth)})`;

  /* ---- 16. THE TWO THAT ARE GIVEN ARE GIVEN ONCE ----
     Both events repeat — shrines reconsecrate, and there is no limit on tears — so without the
     ledger the Habit is a renewable legendary farmed off one stone. */
  const once = await p.evaluate(() => {
    if (typeof grantLegend !== 'function') return null;
    delete stash.a_habit; delete legendsGiven.a_habit;
    const first = grantLegend('a_habit', 'x');
    const afterFirst = stash.a_habit || 0;
    const second = grantLegend('a_habit', 'x');
    const afterSecond = stash.a_habit || 0;
    const third = grantLegend('a_habit', 'x');
    return { first, second, third, afterFirst, afterSecond };
  });
  R.givenOnceAndOnlyOnce = !once ? NOTHING
    : (once.first && !once.second && !once.third && once.afterFirst === 1 && once.afterSecond === 1)
    ? 'the first shrine broken yields the Habit and the second, third and every one after yield nothing'
    : `!! A LEGENDARY CAN BE FARMED (${JSON.stringify(once)})`;

  /* ---- 17. AND THE RACKS DO NOT REDISTRIBUTE THEM ----
     `gearRank` is a weapon by damage and everything else by price, which is right for a shelf
     of katanas and exactly wrong for these: the Stave does twelve damage and Sal Mortis costs
     eleven thousand. Where a legendary goes is the player's decision. */
  const racks = await p.evaluate(() => {
    if (typeof armouryRun !== 'function' || !ITEMS.w_stave || !ITEMS.a_widow || !ITEMS.t_salmortis) return null;
    const c = window.__probe();
    c.weapon = null; c.trinket = null; c.armor = null;
    for (const k of ['w_stave', 't_salmortis', 'a_widow', 'w_kat']) addItem(k, 1);
    armouryRun([c], EQ_SLOTS);
    const got = { weapon: c.weapon, trinket: c.trinket, armor: c.armor };
    c.state = 'dead';
    return got;
  });
  R.theRacksLeaveThemAlone = !racks ? NOTHING
    : (racks.weapon === 'w_kat' && !racks.trinket && !racks.armor)
    ? 'the Armoury given a Stave, a Weave, Sal Mortis and one ordinary katana hands over the katana and nothing else'
    : `!! THE RACKS ARE HANDING OUT LEGENDARIES (${JSON.stringify(racks)})`;

  /* ---- 18. AND ALL OF IT SURVIVES A SAVE ---- */
  const saved = await p.evaluate(() => {
    if (typeof snapshot !== 'function' || typeof legendsGiven === 'undefined') return null;
    legendsGiven.t_splinter = 3;
    const c = player()[0];
    const id = c.id;                 /* BY ID, not by position: `restore` rebuilds `chars` and
                                        `player()[0]` is whoever ends up first, which after a
                                        section that has created and killed a dozen probes is
                                        not reliably the same body it was before the save. */
    const wasArm = c.parts['l.arm'].tooth;
    c.parts['l.arm'].tooth = 6.5;
    /* SERIALISED FIRST, AND THAT IS NOT A FORMALITY. `snapshot()` writes `parts: c.parts` —
       a LIVE REFERENCE — because in the game it is handed straight to `JSON.stringify` and
       written to storage. A probe that takes the snapshot and then edits the body to prove the
       restore is doing something is editing the snapshot as well, and measures a save that
       never held the value. The round-trip is what makes it a snapshot. */
    const s = JSON.parse(JSON.stringify(snapshot()));
    legendsGiven.t_splinter = 0; delete legendsGiven.t_splinter;
    c.parts['l.arm'].tooth = 0;
    restore(s);
    const c2 = chars.find(x => x.id === id) || null;
    const out = { given: legendsGiven.t_splinter, wound: c2 ? c2.parts['l.arm'].tooth : null,
                  foundBody: !!c2 };
    if (c2) c2.parts['l.arm'].tooth = wasArm;
    return out;
  });
  R.itSurvivesASave = !saved ? NOTHING
    : (saved.given === 3 && saved.wound === 6.5)
    ? `the ledger remembers the Splinter was given on day ${saved.given}, and a half-run tooth wound comes back with ${saved.wound} hours left on it`
    : `!! THE LEGENDARIES DO NOT SURVIVE A RELOAD (${JSON.stringify(saved)})`;

  console.log('=== THE LEGENDARIES ===\n');
  for (const [k, v] of Object.entries(R)) console.log('  ' + k.padEnd(32) + v);
  const bad = Object.values(R).map(String).filter(v => v.startsWith('!!'));
  console.log('\n' + (bad.length ? '*** ' + bad.join('\n*** ') : 'TWELVE THINGS, TWELVE RULES, ONE OF EACH IN THE WORLD'));
  if (errs.length) { console.log('errs:', errs.length); errs.slice(0, 4).forEach(e => console.log('  ' + e)); }
  await b.close();
  if (bad.length) process.exitCode = 1;
})();
