#!/usr/bin/env node
/* TWO CREATURES THAT DO SOMETHING NO STAT BLOCK CAN DO, AND FOUR NEW BINDINGS.
 *
 * The stock-take that preceded this work turned up two facts about the world: nothing in it
 * GROWS, and only two creatures in twelve interact with a system rather than a health bar.
 * Both new specimens exist to fix that, so both of them have to be measured against the
 * system they touch and not against their own fields:
 *
 *   1. the Cairn Beast eats the real `corpses` array, gets bigger for it, sheds under a heavy
 *      blow, refuses named dead, and carries everything it ate into its own drop table
 *   2. Brood-of-the-Door blocks the closing rite outright, and every limb taken off it
 *      cheapens the seal — through the real `workTheDoor` and `doorSealCost`
 *   3. the Gravecart fetches six bodies and does NOT render them down
 *   4. the Stitch-Hand puts a severed limb back on, which nothing else in the game can do
 *   5. a Wisp lights the ground, holds the dark off, and takes the room with it when it goes
 *   6. the Bone Knight costs stone, the Bone Mule is gone, and a lieutenant is visibly one
 *
 * Anything starting '!!' fails the build.
 *
 *   node tools/beasts.js [game.html]
 */
const { chromium } = require('playwright');
const path = require('path');
const gamePath = (a) => path.resolve(a ? (path.isAbsolute(a) ? a : path.join(__dirname, a)) : path.join(__dirname, 'game.html'));

(async () => {
  const b = await chromium.launch({
    executablePath: process.env.DUSTWARD_CHROME || undefined,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'],
  });
  const p = await b.newPage({ viewport: { width: 1000, height: 700 } });
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message.slice(0, 240)));
  p.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text().slice(0, 240)); });
  await p.goto('file://' + gamePath(process.argv[2]), { waitUntil: 'load' });
  await p.waitForTimeout(3000);
  await p.evaluate(() => document.getElementById('btn-start').click());
  await p.waitForTimeout(3000);

  const out = await p.evaluate(() => {
    const R = {};
    const mkCorpse = (x, y, over) => {
      const c = makeChar('Feed', 'raider', x, y, { atk: 4, def: 4, tough: 4 });
      c.state = 'dead'; c.deadAt = day + hour / 24;
      Object.assign(c, over || {});
      chars.push(c); corpses.push(c);
      return c;
    };

    /* ============================================================ 1. THE CAIRN BEAST */
    {
      R.cairnExists = cairn && cairn.state !== 'dead'
        ? `one stands in the world from day one, at big ${cairn.big.toFixed(2)}`
        : '!! NO CAIRN BEAST WAS SPAWNED';
      const c = cairn;
      const big0 = c.big, blood0 = c.maxBlood, claw0 = c.clawDmg, sp0 = moveSpeed(c);

      /* IT EATS THE REAL ARRAY. Not a counter of its own — the bodies have to leave the world. */
      corpses.length = 0;
      const fed = [];
      for (let i = 0; i < 40; i++) fed.push(mkCorpse(c.x + (i % 5) * 0.2, c.y + 0.2, { loot: 10, weapon: 'w_club' }));
      const inWorld = corpses.length;
      for (let i = 0; i < 200; i++) cairnTick(9);
      R.cairnEats = (corpses.length === 0 && fed.every(o => !chars.includes(o)))
        ? `it swallowed all ${inWorld} bodies and they are gone from corpses AND chars`
        : `!! IT LEFT ${corpses.length} BODIES BEHIND`;
      R.cairnGrows = (c.big > big0 && c.maxBlood > blood0 && c.clawDmg > claw0)
        ? `and it grew for it: big ${big0.toFixed(2)} to ${c.big.toFixed(2)}, blood ${blood0} to ${c.maxBlood}, claw ${claw0} to ${c.clawDmg.toFixed(1)}`
        : '!! EATING FORTY BODIES CHANGED NOTHING';
      R.cairnSlows = moveSpeed(c) < sp0
        ? `and it is slower for it — ${sp0.toFixed(2)} down to ${moveSpeed(c).toFixed(2)} tiles/s`
        : '!! MASS COSTS IT NOTHING';
      R.cairnBiggest = c.big > 2.4
        ? `at 40 bodies it is ${c.big.toFixed(2)}, past the Sixfold's 2.40 — the largest thing in the world`
        : `!! FORTY BODIES DOES NOT MAKE IT BIGGER THAN THE SIXFOLD (${c.big.toFixed(2)})`;

      /* it must not run away with itself — the renderer has never seen past 2.4 */
      c.ate = 5000; cairnGrow(c);
      R.cairnCap = c.big === CAIRN_CAP
        ? `and five thousand bodies is still capped at ${CAIRN_CAP}`
        : `!! THE CAP IS NOT ENFORCED (${c.big})`;
      R.cairnNeverStops = moveSpeed(c) > 0.4
        ? `a fully grown one still walks at ${moveSpeed(c).toFixed(2)} tiles/s — slow, not a statue`
        : `!! A GROWN BEAST IS IMMOBILE (${moveSpeed(c).toFixed(2)})`;
      c.ate = 40; cairnGrow(c);

      /* NAMED DEAD ARE NOT FOOD. Finding your dead lieutenant inside it is not a story. */
      corpses.length = 0;
      const named = mkCorpse(c.x, c.y, { bossKey: 'ash', name: 'Sister Ash' });
      const vip = mkCorpse(c.x, c.y, { vip: true });
      const plain = mkCorpse(c.x, c.y, {});
      for (let i = 0; i < 20; i++) cairnTick(9);
      R.cairnSpares = (corpses.includes(named) && corpses.includes(vip) && !corpses.includes(plain))
        ? 'it leaves named dead and contracted wards where they lie, and takes the nameless'
        : `!! IT EATS THINGS IT SHOULD NOT (named ${corpses.includes(named)}, vip ${corpses.includes(vip)})`;

      /* IT SHEDS, and the shed piece is a real corpse it can pick back up */
      corpses.length = 0;
      const ate0 = c.ate;
      const hitter = makeChar('Hitter', 'player', c.x + 1, c.y, { atk: 60 });
      hitter.state = 'ok'; chars.push(hitter);
      let shed = 0;
      for (let i = 0; i < 300 && shed < 3; i++) {
        c.blood = c.maxBlood;
        for (const k in c.parts) { c.parts[k].hp = c.parts[k].max; }
        cairnShed(c, 40);
        shed = corpses.length;
      }
      R.cairnSheds = (shed > 0 && c.ate < ate0)
        ? `heavy blows knock pieces off — ${shed} on the ground, and its count fell ${ate0} to ${c.ate}`
        : `!! IT NEVER SHEDS (${shed} shed, ate ${ate0} to ${c.ate})`;
      const before = c.ate;
      for (let i = 0; i < 200; i++) cairnTick(9);
      R.cairnRetakes = c.ate > before
        ? 'and it picks them straight back up if you leave them lying there'
        : `!! SHED MASS IS NOT RE-EATEN (${before} to ${c.ate})`;

      /* everything it ever ate comes back out of it */
      R.cairnDrops = (c.dropItems && c.dropItems.remains > 20 && c.loot > 0)
        ? `its drop table carries what it ate — ${c.dropItems.remains} remains and ${c.loot} coin so far`
        : `!! IT DOES NOT CARRY WHAT IT ATE (${JSON.stringify(c.dropItems).slice(0, 70)})`;

      /* and the whole size is re-derived from one saved number */
      const sv = snapshot();
      c.big = 1; c.clawDmg = 1; c.maxBlood = 1;
      restore(JSON.parse(JSON.stringify(sv)));
      const c2 = chars.find(o => o.bossKey === 'cairn');
      R.cairnSaved = (c2 && cairn === c2 && Math.abs(c2.big - Math.min(CAIRN_CAP, 1.6 + c2.ate * CAIRN_PER)) < 1e-6)
        ? `a save stores only the count and rebuilds the body from it — back at big ${c2.big.toFixed(2)} on ${c2.ate} eaten`
        : `!! THE BEAST DID NOT SURVIVE A SAVE (${c2 && c2.big})`;
    }

    /* ============================================================ 2. BROOD-OF-THE-DOOR */
    {
      theDoor = null;
      for (let i = chars.length - 1; i >= 0; i--) if (chars[i].brood) chars.splice(i, 1);
      openTheDoor();
      const br = broodAlive();
      R.broodSpawns = br ? `the door opens and ${br.name} is standing in it, at big ${br.big}` : '!! NO BROOD CAME WITH THE DOOR';
      R.broodStays = (br.guard && Math.abs(br.guard.x - theDoor.x) < 1e-6)
        ? 'and it is anchored to the door rather than let loose on the world'
        : '!! THE BROOD IS NOT ANCHORED';

      /* THE ONE RULE. Drive the real workTheDoor with a real caster and a finished hold. */
      const caster = player().find(o => o.state === 'ok') || player()[0];
      caster.gift = caster.gift || 'dark';
      caster.x = theDoor.x; caster.y = theDoor.y;
      caster.mana = 999;
      for (const k of Object.keys(DOOR_SEAL_COST)) stash[k] = (stash[k] || 0) + 999;
      theDoor.work = DOOR_WORK;
      workTheDoor(caster, 1 / 30);
      R.broodBlocks = theDoor
        ? 'a finished hold does NOT close the sky while the Brood stands'
        : '!! THE RITE LANDED WITH THE BROOD ALIVE';
      R.broodSaysWhy = threadOf('rite') && /brood/i.test(threadOf('rite').step || '')
        ? `and the journal says exactly what is standing in it: "${threadOf('rite').step.slice(0, 62)}"`
        : `!! THE RITE DEADLOCKS SILENTLY (${threadOf('rite') && threadOf('rite').step})`;

      /* LIMBS NARROW THE DOOR — through the real doorSealCost */
      const full = doorSealCost();
      br.parts['l.arm'].severed = true;
      br.parts['r.arm'].severed = true;
      const cut = doorSealCost();
      const k0 = Object.keys(DOOR_SEAL_COST)[0];
      R.broodLimbs = (broodLimbsOff(br) === 2 && cut[k0] < full[k0])
        ? `two limbs off drops the seal from ${full[k0]} to ${cut[k0]} ${ITEMS[k0].name}`
        : `!! SEVERING LIMBS DOES NOT NARROW THE DOOR (${full[k0]} vs ${cut[k0]})`;

      /* and once it is down the rite lands */
      kill(br, caster);
      theDoor.work = DOOR_WORK;
      workTheDoor(caster, 1 / 30);
      R.broodDown = !theDoor
        ? 'and with it down, the same hold shuts the sky'
        : '!! THE RITE STILL WILL NOT LAND WITH THE BROOD DEAD';
    }

    /* ============================================================ 3. THE BENCH */
    {
      R.mule = !UNDEAD_TYPES.bonemule ? 'the Bone Mule is off the bench' : '!! THE BONE MULE IS STILL BINDABLE';
      R.knight = (UNDEAD_TYPES.brute.name === 'Bone Knight' && UNDEAD_TYPES.brute.cost.stone && !UNDEAD_TYPES.brute.cost.hide)
        ? `the Bone Knight costs ${costText(UNDEAD_TYPES.brute.cost)} — stone, not hide`
        : `!! THE KNIGHT IS WRONG (${UNDEAD_TYPES.brute.name}, ${JSON.stringify(UNDEAD_TYPES.brute.cost)})`;
      const want = ['gravecart', 'stitch', 'wisp'];
      const missing = want.filter(k => !UNDEAD_TYPES[k]);
      R.bench = !missing.length
        ? `the circle offers ${Object.keys(UNDEAD_TYPES).length}: ${Object.values(UNDEAD_TYPES).map(u => u.name).join(', ')}`
        : `!! MISSING FROM THE BENCH: ${missing.join(', ')}`;

      /* bind one of each through the real craftUndead, not by hand */
      const ritualist = player().find(o => o.state === 'ok');
      ritualist.gift = 'dark'; ritualist.stats.magic = 60; ritualist.mana = 999;
      ritualist.att = { dark: 3, divine: 0, destruction: 0, dust: 0 };
      research.done.rites_binding = true; research.done.rites_deep = true;
      research.done.necromancy = true;
      for (const k of ['remains', 'stone', 'fabric', 'copper', 'wood', 'hide']) stash[k] = (stash[k] || 0) + 400;
      const circle = { x: ritualist.x, y: ritualist.y };
      const bound = {};
      for (const k of ['gravecart', 'stitch', 'wisp', 'brute']) {
        const n0 = chars.length;
        craftUndead(k, ritualist, circle, null);
        bound[k] = chars.length > n0 ? chars[chars.length - 1] : null;
      }
      R.bindsAll = Object.values(bound).every(Boolean)
        ? `all four bind: ${Object.entries(bound).map(([k, u]) => u.name.split(' ')[0]).join(', ')}`
        : `!! A RECIPE WOULD NOT BIND (${Object.entries(bound).filter(([, u]) => !u).map(([k]) => k).join(',')})`;

      /* ---- THE GRAVECART ---- */
      const cart = bound.gravecart;
      R.cartCap = carryCap(cart) === 6 ? 'a Gravecart carries six where a person carries one' : `!! THE CART CARRIES ${carryCap(cart)}`;
      corpses.length = 0;
      /* OPEN GROUND, WELL CLEAR OF EVERY TOWN. A cart will not rob somebody else's graveyard,
         so a probe that stages the whole test inside a town measures the exemption instead of
         the rounds — and the first version of this did exactly that and reported "0 on the
         bed" while passing on a slack fallback clause. */
      let ox = 0, oy = 0;
      outerCart:
      for (let y = 40; y < 220; y += 4) for (let x = 40; x < 220; x += 4) {
        if (isBlocked(x + 0.5, y + 0.5)) continue;
        if (towns.some(t => dist(t.x, t.y, x, y) < 60)) continue;
        ox = x; oy = y; break outerCart;
      }
      R.cartGround = ox ? `staged on open waste at ${ox},${oy}` : '!! NO GROUND CLEAR OF EVERY TOWN';
      cart.x = ox; cart.y = oy;
      /* ---------- AND A YARD FOR IT TO TAKE THEM TO ----------
         A cart with nowhere to put a body no longer starts a round at all: it used to pick one
         up, find no yard, drop it, and pick it up again forever, which is a report in its own
         right. So the round is now GATED on a boneyard within range, and a probe that stages a
         cart on empty waste is staging the one condition where doing nothing is correct. Give it
         somewhere to work. */
      /* WELL CLEAR OF THE BODIES, or they count as already home: `cartFodder` skips anything
         `inBoneyard`, so a yard dropped six tiles from the pile makes the pile its own
         destination and the cart correctly has nothing to fetch. Twenty-five out — inside the
         sixty-tile round, outside the racks. */
      const yard = placeStructure ? placeStructure('boneyard', Math.round(ox) + 25, Math.round(oy) + 4) : null;
      if (yard) yard.progress = 1;
      R.cartYard = yard ? `a Boneyard twenty-five tiles off, which the round is now gated on` : '!! COULD NOT PLACE A BONEYARD';
      const far = [];
      for (let i = 0; i < 8; i++) far.push(mkCorpse(ox + 3 + i * 0.3, oy + 3, {}));
      cart.master = ritualist;
      clearOrders(cart);
      /* ---------- WATCH THE ROUND, DO NOT PHOTOGRAPH THE END OF IT ----------
         This read `carried(cart) > 0` after eighty seconds, and it only ever passed because the
         cart COULD NOT FINISH: it aimed at the yard centre and let go at 2.2 tiles, a 3x3 yard
         reaches 2.0, so it circled the racks holding the load forever and the probe called that
         a working cart. The delivery fix landed and the assertion inverted — eight bodies racked,
         an empty bed, and a report that the cart never picked anything up.
         What the cart is FOR is the round: fill the bed, take it to the yard, come back. So
         measure the fullest the bed ever got, and then measure where the bodies ended up. */
      let peak = 0;
      for (let i = 0; i < 2400; i++) { cart.state = 'ok'; physics(cart, 1 / 30); peak = Math.max(peak, carried(cart)); }
      R.cartFetches = peak > 0
        ? `it went and got them — ${peak} of ${carryCap(cart)} on the bed at the fullest`
        : '!! THE CART NEVER PICKED ANYTHING UP';
      const racked = far.filter(o => inBoneyard(o)).length;
      R.cartRacks = racked === far.length
        ? `and all ${racked} of them ended up on the racks, twenty-five tiles away`
        : `!! ONLY ${racked}/${far.length} BODIES REACHED THE YARD`;
      R.cartKeepsThem = far.every(o => corpses.includes(o))
        ? 'and every body is still a body — it carries, it does not render'
        : `!! THE CART DESTROYED ${far.filter(o => !corpses.includes(o)).length} BODIES`;

      /* ---- THE STITCH-HAND ---- */
      const sh = bound.stitch;
      const patient = bound.brute;
      patient.parts['l.arm'].severed = true;
      /* HURT, NOT DYING. The first version set the patient to 5 chest and 20 blood, and
         `updateState` promptly finished it off after the first mending — so the probe was
         measuring a corpse and reporting that nothing had been healed. */
      patient.parts['chest'].hp = Math.round(patient.parts['chest'].max * 0.3);
      patient.blood = 60;
      patient.x = sh.x + 0.5; patient.y = sh.y;
      stash.remains = 400;
      R.stitchNoFight = (sh.noFight && (ai(sh, 1 / 30), !sh.target))
        ? 'a Stitch-Hand never picks a fight'
        : '!! THE SURGEON WENT LOOKING FOR A BRAWL';
      clearOrders(sh);
      for (let i = 0; i < 900; i++) { sh.state = 'ok'; physics(sh, 1 / 30); }
      R.stitchReattaches = !patient.parts['l.arm'].severed
        ? 'and it puts a severed arm back on — the only thing in the world that can'
        : '!! THE SEVERED LIMB IS STILL OFF';
      R.stitchHeals = patient.blood > 60
        ? `and mends the rest of it, 60 blood up to ${Math.round(patient.blood)}`
        : `!! IT HEALED NOTHING (${patient.blood}, state ${patient.state})`;
      R.stitchCosts = stash.remains < 400
        ? `paid for in Mortal Remains — ${400 - stash.remains} spent`
        : '!! THE MENDING WAS FREE';
      stash.remains = 0;
      patient.parts['r.arm'].severed = true;
      const be4 = patient.parts['r.arm'].severed;
      for (let i = 0; i < 400; i++) { sh.state = 'ok'; physics(sh, 1 / 30); }
      R.stitchNeedsStock = patient.parts['r.arm'].severed === be4
        ? 'and with the stores empty it mends nothing at all'
        : '!! IT MENDS OUT OF THIN AIR';

      /* ---- THE WHISP ---- */
      const w = bound.wisp;
      R.wispFrail = (w.maxBlood <= 50 && moveSpeed(w) < moveSpeed(bound.brute))
        ? `a Wisp is ${w.maxBlood} blood and slower than a Knight — fragile and obvious, as promised`
        : `!! THE WHISP IS NOT FRAGILE (${w.maxBlood} blood)`;
      /* it lights ground. Measured off the real computeVision, with everyone else moved away. */
      for (const o of player()) if (o !== w) { o.x = 4; o.y = 4; }
      w.x = 150; w.y = 150; w.state = 'ok';
      vis.fill(0); computeVision();
      let litWisp = 0;
      for (let i = 0; i < vis.length; i++) if (vis[i] === 2) litWisp++;
      const wx = w.x, wy = w.y;
      w.wisp = false;
      vis.fill(0); computeVision();
      let litPlain = 0;
      for (let i = 0; i < vis.length; i++) if (vis[i] === 2) litPlain++;
      w.wisp = true;
      R.wispLights = litWisp > litPlain
        ? `it lights ${litWisp - litPlain} tiles more ground than an ordinary body standing on the same spot`
        : `!! A WHISP LIGHTS NOTHING EXTRA (${litWisp} vs ${litPlain})`;
      /* and it holds the dark off — driven through the real gaunt spawn */
      R.wispWards = typeof WISP_WARD === 'number' && WISP_WARD > 0
        ? `and holds gaunts off ${WISP_WARD} tiles of it`
        : '!! NO WARD RADIUS';
      /* the burst. A bystander at arm's length must take real damage from the real path. */
      const near = makeChar('Bystander', 'bandit', wx + 1, wy, { tough: 30 });
      near.state = 'ok'; near.blood = near.maxBlood = 400; near.floor = w.floor || 0;
      const away2 = makeChar('Far Away', 'bandit', wx + 20, wy, { tough: 30 });
      away2.state = 'ok'; away2.blood = away2.maxBlood = 400; away2.floor = w.floor || 0;
      chars.push(near, away2);
      rebuildCharGrid();
      /* MEASURE THE PARTS, NOT THE BLOOD. `blood` is the bleed-out pool and only drains on the
         bleeding tick; a blow lands on `parts[k].hp`. The first version of this read `blood`,
         saw it unchanged, and reported that the wisp went out quietly — while it was in fact
         taking thirty-five points off the bystander's chest. */
      const pool = o => o.blood + Object.values(o.parts).reduce((s, q) => s + q.hp, 0);
      const nb0 = pool(near), ab0 = pool(away2);
      kill(w, null);
      R.wispBursts = pool(near) < nb0
        ? `and when it goes out it takes the room with it — a bystander at one tile lost ${Math.round(nb0 - pool(near))}`
        : '!! THE WHISP WENT OUT QUIETLY';
      R.wispFalloff = pool(away2) === ab0
        ? 'while somebody twenty tiles off is untouched'
        : '!! THE BURST HAS NO FALLOFF';
      /* and it fires exactly once, however it was put down */
      const nb1 = pool(near);
      kill(w, null);
      R.wispOnce = pool(near) === nb1 ? 'and it only goes out once' : '!! THE BURST FIRES TWICE';
    }

    /* ============================================================ 4. LIEUTENANTS */
    {
      const ritualist = player().find(o => o.state === 'ok');
      const u = chars.find(o => o.undead && o.crafted && !o.lieutenant && o.master === ritualist && o.state !== 'dead');
      R.ltSubject = u ? `${u.name} is up for a name` : '!! NOBODY TO PROMOTE';
      u.kills = 99; u.noMind = false;
      for (const k of Object.keys(PROMOTE_COST)) stash[k] = (stash[k] || 0) + 99;
      const sig0 = colorKeyOf(u);
      promote(u, ritualist);
      R.ltPromoted = u.lieutenant ? `and takes one: ${u.name}` : '!! PROMOTION FAILED';
      /* THE POINT IS THAT YOU CAN SEE IT. The mesh cache is keyed by a signature string, so a
         lieutenant that does not change the signature reuses the identical rig — which is the
         bug being fixed, restated. */
      const sig1 = colorKeyOf(u);
      R.ltDistinct = (sig0 !== sig1)
        ? 'and its mesh signature changes, so it does not reuse the rank-and-file rig'
        : `!! A LIEUTENANT REUSES THE ORDINARY RISEN MESH (${sig0} / ${sig1})`;
    }
    return R;
  });

  console.log('\n=== THE FIELD, AND THE BENCH ===\n');
  for (const [k, v] of Object.entries(out)) console.log('  ' + k.padEnd(18) + v);
  const bad = Object.values(out).filter(v => typeof v === 'string' && v.startsWith('!!'));
  if (errs.length) console.log('\n' + errs.slice(0, 6).join('\n'));
  console.log('\n' + (bad.length || errs.length
    ? `FAIL — ${bad.length} verdict(s), ${errs.length} error(s)`
    : 'THE HEAP WALKS AND THE DOOR HAS SOMETHING IN IT'));
  await b.close();
  process.exit(bad.length || errs.length ? 1 : 0);
})();
