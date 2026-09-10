#!/usr/bin/env node
/* THE KEPT, AND WHAT IS DOWN THERE WITH THEM.
 *
 *   "Let's also build out the purebloods themselves — their own models and behavior. I like the
 *    idea that they dislike the light and observe you from the darkness as you approach their
 *    altar — which should open up a dialogue option to offer something. Perhaps based on what
 *    you offer, they may respond in kind. They are also hostile to all gaunts."
 *
 * Off the prehistory draft: humanity's own progenitors, who feared the sky and went underground
 * to be out from under it, whose tunnels the Golden Age dug into and built its bunkers inside,
 * who worshipped Mother until a kingdom came down and turned their god into plumbing. They are
 * still keeping the vigil. So the first thing they do about you is WATCH — and everything this
 * file measures follows from that rather than from a stat block.
 *
 * Anything starting '!!' fails the build.
 *
 *   node tools/deep.js [game.html]
 */
const { chromium } = require('playwright');
const path = require('path');
const WATCH_MIN = 6;   /* the hold band's near edge is 7; one tile of slack for crowd shove */
const gamePath = (a) => path.resolve(a ? (path.isAbsolute(a) ? a : path.join(__dirname, a)) : path.join(__dirname, 'game.html'));

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
  const NOTHING = '!! NOTHING TO MEASURE — this build has no deep faction';

  /* ---- 1. THEY ARE DOWN THERE, IN FOUR KINDS, AT AN ALTAR ---- */
  const there = await p.evaluate(() => {
    if (typeof deepFolk === 'undefined' || typeof deepAltars === 'undefined') return null;
    const by = {};
    for (const c of deepFolk) if (c.deepKin) by[c.deepKin] = (by[c.deepKin] || 0) + 1;
    return {
      folk: deepFolk.length, by, altars: deepAltars.length,
      /* BELOW, ON WHICHEVER STOREY. This asked for -1 exactly, which was the whole underworld
         while there was one of it. The Kept keep their vigil on all three depths now — the
         halls they were seeded from are spread across the lattices — and a claim that names
         one floor reports a faction spread correctly across the world as a fault. What it is
         actually asserting is that not one of them is standing on the grass. */
      allBelow: deepFolk.every(c => (c.floor || 0) < 0),
      byFloor: deepFolk.reduce((a, c) => { a[c.floor] = (a[c.floor] || 0) + 1; return a; }, {}),
      armed: deepFolk.filter(c => c.weapon === 'w_leaf' || c.weapon === 'w_socket').length,
      /* an altar with nobody keeping it is scenery */
      manned: deepAltars.filter(a => deepFolk.some(c => c.hallId === a.hall && c.deepKin)).length,
      borers: (typeof stonewakes !== 'undefined') ? stonewakes.length : -1,
      shoalN: (typeof shoals !== 'undefined') ? shoals.length : -1,
    };
  });
  R.theyAreDownThere = !there ? NOTHING
    : (there.folk > 100 && Object.keys(there.by).length === 4 && there.allBelow && there.altars > 4)
    ? `${there.folk} of them under the world — ${Object.entries(there.by).map(([k, n]) => k + ' ' + n).join(', ')} — at ${there.altars} altars, ${there.manned} of them kept`
    : `!! THE CONGREGATION IS WRONG (${JSON.stringify(there)})`;
  R.andCarryingBronze = !there ? NOTHING : there.armed > 20
    ? `${there.armed} of them carrying something older than smelting`
    : `!! NOBODY IS ARMED (${there && there.armed})`;
  R.andTheTwoOthers = !there ? NOTHING : (there.borers > 0 && there.shoalN > 3)
    ? `${there.borers} Stonewakes cutting, ${there.shoalN} shoals drifting`
    : `!! THE STONEWAKE OR THE SHOAL IS MISSING (borers ${there.borers}, shoals ${there.shoalN})`;

  /* ---- 2. WHO THEY WILL AND WILL NOT FIGHT ----
     The load-bearing rule of the whole faction, asked of a real gaunt and a real body of yours
     rather than of the table. */
  const sides = await p.evaluate(() => {
    if (typeof deepFolk === 'undefined') return null;
    const k = deepFolk.find(c => c.deepKin === 'kept');
    const g = chars.find(c => c.faction === 'gaunt' && c.state !== 'dead');
    const me = player().find(c => c.state === 'ok');
    if (!k || !g || !me) return null;
    const before = { gaunt: hostile(k, g), player: hostile(k, me), both: hostile(g, k) };
    /* and a shoalling, which is a different body with the same politics */
    const sh = deepFolk.find(c => c.shoalId != null);
    const shoal = sh ? { gaunt: hostile(sh, g), player: hostile(sh, me) } : null;
    k.provoked = true; k.neutral = false;
    const after = hostile(k, me);
    k.provoked = false; k.neutral = true;
    return { before, after, shoal, restored: hostile(k, me) };
  });
  R.theGauntsAlways = !sides ? NOTHING
    : (sides.before.gaunt && sides.before.both && sides.shoal && sides.shoal.gaunt)
    ? 'the Kept and the shoal both fight the gaunts, and the gaunts fight back — asked of real bodies, both ways round'
    : `!! THE ENMITY WITH THE GAUNTS IS NOT THERE (${JSON.stringify(sides)})`;
  R.andYouOnlyIfYouStart = !sides ? NOTHING
    : (!sides.before.player && !sides.shoal.player && sides.after && !sides.restored)
    ? 'and neither of them will raise a hand to you until you do — provoked, they will; and it is reversible'
    : `!! THEY ARE HOSTILE TO YOU BY DEFAULT (${JSON.stringify(sides)})`;

  /* ---- 3. THEY WATCH, AND A LIGHT PUSHES THEM ----
     Driven through `ai` at the real rate, with the party staged in the hall. The claim is about
     DISTANCE HELD, which is the whole characterisation — so it measures the closest they ever
     get, not where they finish. */
  const watch = await p.evaluate(async () => {
    if (typeof deepWatch !== 'function') return null;
    const a = deepAltars.find(al => deepFolk.some(c => c.hallId === al.hall && c.deepKin === 'kept'));
    if (!a) return null;
    const folk = deepFolk.filter(c => c.hallId === a.hall && c.deepKin && c.deepKin !== 'unblind');
    const me = player().find(c => c.state === 'ok');
    /* ---------- SWEEP THE HALL, AND SWEEP IT PROPERLY ----------
       The claim is about WATCHING. The first two runs measured a congregation that had walked
       off to kill a Thin Stalker — the faction working exactly as designed, and nothing to do
       with what this section asserts. A sixty-tile sweep was not enough either: a Kept looks
       twenty-two tiles from wherever it is STANDING, and it is standing ten tiles out. Every
       Watcher in the world goes to a corner, and the claim then checks that none of them found
       anything to chase, so a future regression cannot hide behind the staging. */
    for (const g of chars) if (g.faction === 'gaunt' || g.gauntKind) { g.x = 6; g.y = 6; g.floor = 0; }
    for (const c of player()) { c.x = a.x; c.y = a.y; c.floor = -1; c.moveTarget = null; c.lamp = false; }
    let k = 0;
    for (const c of folk) { const t = (k / folk.length) * Math.PI * 2;
      c.x = a.x + Math.cos(t) * 10; c.y = a.y + Math.sin(t) * 10;
      c.provoked = false; c.neutral = true; c.target = null; c.moveTarget = null; k++; }
    rebuildCharGrid();
    const closest = () => Math.min(...folk.map(c => dist(c.x, c.y, me.x, me.y)));
    let nearest = 1e9, chased = 0;
    for (let i = 0; i < 300; i++) {
      for (const c of folk) { ai(c, 1 / 30); physics(c, 1 / 30); }
      nearest = Math.min(nearest, closest());
    }
    for (const c of folk) if (c.target) chased++;
    let faced = 0;
    for (const c of folk) if (c.faceAt && dist(c.faceAt.x, c.faceAt.y, me.x, me.y) < 2) faced++;
    /* Now put a light on it. Nothing burns; they give ground.
       RE-STAGED FIRST: after ten seconds of holding they have settled at the FAR edge of the
       band, which is outside `DEEP_SHY_R` — a lamp there would correctly do nothing, and the
       claim would be measuring the band rather than the light. */
    k = 0;
    for (const c of folk) { const t = (k / folk.length) * Math.PI * 2;
      c.x = a.x + Math.cos(t) * 8; c.y = a.y + Math.sin(t) * 8; c.moveTarget = null; k++; }
    const lampD0 = closest();
    me.lamp = true;                       /* what `glareOn` looks for — a job, not a rig flag */
    rebuildCharGrid();
    for (let i = 0; i < 300; i++) for (const c of folk) { ai(c, 1 / 30); physics(c, 1 / 30); }
    const lampD1 = closest();
    me.lamp = false;
    return { n: folk.length, nearest: +nearest.toFixed(1), faced, chased,
             beforeLamp: +lampD0.toFixed(1), afterLamp: +lampD1.toFixed(1) };
  });
  R.theyHoldTheirDistance = !watch ? NOTHING
    : (watch.chased === 0 && watch.nearest >= WATCH_MIN && watch.faced >= Math.ceil(watch.n * 0.6))
    ? `ten seconds of the real AI, nothing to chase, and ${watch.n} of them never came closer than ${watch.nearest} tiles — ${watch.faced} turned to face`
    : `!! THEY DO NOT HOLD OFF, OR DO NOT LOOK (${JSON.stringify(watch)})`;
  R.andALightPushesThem = !watch ? NOTHING : watch.afterLamp > watch.beforeLamp + 2
    ? `a lamp moves them from ${watch.beforeLamp} tiles out to ${watch.afterLamp} — driven, not burned`
    : `!! THE LIGHT DOES NOTHING (${watch && watch.beforeLamp} then ${watch && watch.afterLamp})`;

  /* ---- 3b. BUT A GAUNT IS WORTH CROSSING A HALL FOR ----
     The other half of the same rule, and the reason the sweep above exists: they hold their
     distance from YOU and they do not hold it from a Watcher. Found by accident while
     diagnosing the section above, which is the best reason to keep it. */
  const hunt = await p.evaluate(() => {
    if (typeof deepWatch !== 'function') return null;
    const a = deepAltars.find(al => deepFolk.some(c => c.hallId === al.hall && c.deepKin === 'kept'));
    const k = deepFolk.find(c => c.hallId === a.hall && c.deepKin === 'kept');
    if (!k) return null;
    k.provoked = false; k.target = null; k.moveTarget = null;
    k.x = a.x; k.y = a.y;
    const g = chars.find(c => (c.faction === 'gaunt' || c.gauntKind) && c.state === 'ok');
    if (!g) return null;
    g.x = a.x + 14; g.y = a.y; g.floor = -1;
    rebuildCharGrid();
    const d0 = dist(k.x, k.y, g.x, g.y);
    for (let i = 0; i < 200; i++) { ai(k, 1 / 30); physics(k, 1 / 30); }
    return { d0: +d0.toFixed(1), d1: +dist(k.x, k.y, g.x, g.y).toFixed(1),
             target: k.target === g, name: g.name };
  });
  R.andAGauntIsWorthCrossingFor = !hunt ? NOTHING : (hunt.target && hunt.d1 < hunt.d0 - 4)
    ? `a ${hunt.name} fourteen tiles off and one of the Kept closes to ${hunt.d1} — they hold their distance from you and from nothing else`
    : `!! THEY DO NOT GO FOR THE GAUNTS (${JSON.stringify(hunt)})`;

  /* ---- 4. AND THE UNBLINDED IS NOT AFRAID OF IT ---- */
  const blind = await p.evaluate(() => {
    if (typeof deepFolk === 'undefined') return null;
    const z = deepFolk.find(c => c.deepKin === 'unblind');
    const k = deepFolk.find(c => c.deepKin === 'kept');
    if (!z || !k) return null;
    return { zShy: !!z.lightShy, kShy: !!k.lightShy, zBig: z.big, kBig: k.big, zAuto: !!z.autoFight,
             zGlare: typeof glareOn === 'function' };
  });
  R.theUnblindedIsNot = !blind ? NOTHING
    : (!blind.zShy && blind.kShy && blind.zBig > blind.kBig * 1.4 && blind.zAuto)
    ? `it is ${(blind.zBig / blind.kBig).toFixed(2)}x the size of one of the Kept, it does not hold off, and it is the only one a light does nothing to`
    : `!! THE UNBLINDED IS NOT WHAT IT SAYS (${JSON.stringify(blind)})`;

  /* ---- 5. THE OFFERING, AND THE ANSWER IN KIND ----
     Driven through `altarOffer` — the same call the button makes — and every category checked
     for the SHAPE of its answer rather than for a number, because "in kind" is the design. */
  const gift = await p.evaluate(() => {
    if (typeof altarOffer !== 'function') return null;
    const a = deepAltars[0];
    a.regard = 0; a.kin = false; a.given = [];
    for (const k in stash) delete stash[k];
    const out = {};
    const rowOf = cat => ALTAR_TABLE.find(r => r.cat === cat);
    /* the dead: they arm you */
    stash.remains = 8;
    const wep0 = (stash.w_leaf || 0) + (stash.w_socket || 0);
    out.dead = altarOffer(a, rowOf('dead')) && ((stash.w_leaf || 0) + (stash.w_socket || 0)) > wep0;
    /* something written: they read something back */
    stash.tome = 1; const rp0 = research.rp;
    out.known = altarOffer(a, rowOf('known')) && research.rp > rp0;
    /* light: they answer with the dark */
    stash.aether_cell = 1;
    out.light = altarOffer(a, rowOf('light')) && (stash.k_grave || 0) > 0 && !(stash.aether_cell || 0);
    /* gold: nothing, and it is the point */
    const goldRow = ALTAR_TABLE.find(r => r.gold);
    cats = 5000; const c0 = cats, rg0 = a.regard;
    out.gold = altarOffer(a, goldRow) && cats === c0 - goldRow.gold && a.regard === rg0;
    /* food, until they turn their backs */
    out.regardBefore = a.regard;
    /* THERE ARE TWO FOOD ROWS and `find` returns the first, which wants MEAT — the probe was
       stocking fruit and then wondering why nothing happened. Feed whatever the row asks for. */
    const foodRow = rowOf('food');
    for (let i = 0; i < 5 && !a.kin; i++) { for (const k in foodRow.need) stash[k] = foodRow.need[k] * 2; altarOffer(a, foodRow); }
    out.kin = !!a.kin;
    out.friendly = deepFolk.filter(c => c.hallId === a.hall && c.friendly).length;
    out.regardAfter = a.regard;
    return out;
  });
  R.theyAnswerInKind = !gift ? NOTHING
    : (gift.dead && gift.known && gift.light)
    ? 'bones buy bronze, a written thing buys insight, and a charge cell is put out and answered with a cloak'
    : `!! THE ANSWER DOES NOT MATCH THE OFFERING (${JSON.stringify(gift)})`;
  R.andGoldBuysNothing = !gift ? NOTHING : gift.gold
    ? 'and five hundred in coin is taken, looked at, and changes their regard by exactly zero'
    : `!! GOLD WORKS ON THEM (${JSON.stringify(gift)})`;
  R.andEventuallyTheyTurnAway = !gift ? NOTHING : (gift.kin && gift.friendly > 0)
    ? `enough of it and the vigil turns its back — regard ${Math.round(gift.regardBefore)} to ${Math.round(gift.regardAfter)}, and ${gift.friendly} of them walk the hall with you`
    : `!! THERE IS NO PAYOFF (${JSON.stringify(gift)})`;

  /* ---- 6. AND HITTING ONE ANSWERS THE WHOLE HALL ---- */
  const hit = await p.evaluate(() => {
    if (typeof deepProvoke !== 'function') return null;
    const a = deepAltars[1];
    const folk = deepFolk.filter(c => c.hallId === a.hall && c.deepKin && c.state !== 'dead');
    if (folk.length < 2) return null;
    const other = deepFolk.filter(c => c.hallId !== a.hall && c.deepKin);
    const me = player()[0];
    const before = folk.filter(c => c.provoked).length;
    /* through applyDamage, which is the path every blade, arrow and spell arrives on */
    applyDamage(me, folk[0], 'chest', 4, 'cut', false, false, false, 0);
    return { n: folk.length, before, after: folk.filter(c => c.provoked).length,
             elsewhere: other.filter(c => c.provoked).length, otherN: other.length };
  });
  R.aCongregationIsACongregation = !hit ? NOTHING
    : (hit.before === 0 && hit.after === hit.n && hit.elsewhere === 0)
    ? `one blow on one of them turns all ${hit.n} in that hall — and none of the ${hit.otherN} anywhere else, because the deep has no couriers`
    : `!! THE HALL DOES NOT ANSWER (${JSON.stringify(hit)})`;

  /* ---- 7. THE STONEWAKE MAKES ITS OWN DOOR ----
     The claim that separates it from a big animal: it does not path, it opens rock. Measured by
     counting solid tiles in front of it before and after. */
  const bore = await p.evaluate(() => {
    if (typeof stonewakeTick !== 'function' || !stonewakes.length) return null;
    const c = stonewakes[0];
    c.provoked = false;
    /* aim it at a patch of solid rock and let it cut */
    let tx = c.x, ty = c.y, found = false;
    for (let r = 6; r < 40 && !found; r += 2) for (let k = 0; k < 12 && !found; k++) {
      const ang = (k / 12) * Math.PI * 2;
      const qx = Math.round(c.x + Math.cos(ang) * r), qy = Math.round(c.y + Math.sin(ang) * r);
      if (qx < 5 || qy < 5 || qx > W - 6 || qy > H - 6) continue;
      if (isBlocked(qx + 0.5, qy + 0.5, -1)) { tx = qx; ty = qy; found = true; }
    }
    if (!found) return null;
    /* ---------- A FIXED PATCH, NOT THE GROUND ROUND A MOVING BODY ----------
       The first version counted solid tiles within six of the borer, before and after — and the
       borer MOVES, so it reported the rock going UP (48 to 68) while it was busily cutting
       through it. It had simply walked somewhere stonier. Measure the corridor it was aimed
       down, which is the thing the claim is actually about. */
    const sx0 = Math.round(c.x), sy0 = Math.round(c.y);
    const lane = [];
    { const L = Math.hypot(tx - sx0, ty - sy0) || 1;
      for (let t = 0; t <= L; t += 1) for (let o = -3; o <= 3; o++) {
        const px = Math.round(sx0 + (tx - sx0) * (t / L) - (ty - sy0) / L * o);
        const py = Math.round(sy0 + (ty - sy0) * (t / L) + (tx - sx0) / L * o);
        lane.push([px, py]);
      } }
    const solidLane = () => lane.filter(([px, py]) => isBlocked(px + 0.5, py + 0.5, -1)).length;
    c.moveTarget = { x: tx, y: ty };
    c.target = null; c.boreCd = 0;
    const s0 = solidLane(), t0 = undercroft.tiles;
    /* ---------- AND IT HAS TO WALK, OR IT CUTS THE SAME HOLE FOREVER ----------
       `stonewakeTick` opens a disc two tiles ahead of where the body IS. Ticking it without
       `physics` leaves it standing in the mouth of the one hole it made, finding that hole
       already open, and reporting ten tiles for four hundred ticks. The claim is that it makes
       a TUNNEL, so the probe has to let it travel down one. */
    for (let i = 0; i < 900; i++) { stonewakeTick(1 / 30); physics(c, 1 / 30); c.moveTarget = { x: tx, y: ty }; }
    return { opened: undercroft.tiles - t0, solidBefore: s0, solidAfter: solidLane(), laneN: lane.length,
             bored: c.bored || 0, budgetLeft: c.boreLeft, blind: !!c.construct };
  });
  R.theStonewakeMakesItsOwnDoor = !bore ? NOTHING
    : (bore.opened > 10 && bore.solidAfter < bore.solidBefore * 0.6)
    ? `it opened ${bore.opened} tiles of solid rock and drove a lane through it — ${bore.solidBefore} blocked tiles in the corridor it was aimed down, ${bore.solidAfter} afterwards`
    : `!! IT IS JUST A LARGE ANIMAL (${JSON.stringify(bore)})`;
  R.andItIsBudgeted = !bore ? NOTHING : (bore.budgetLeft >= 0 && bore.budgetLeft < 900)
    ? `and it will not carve the storey into one room: ${bore.budgetLeft} tiles left of its ${900} lifetime`
    : `!! THE BORE IS UNBOUNDED (${JSON.stringify(bore)})`;

  /* ---- 8. AND ALL OF IT SURVIVES A SAVE ---- */
  const saved = await p.evaluate(() => {
    if (typeof deepAltars === 'undefined' || !deepAltars.length) return null;
    const a = deepAltars[0];
    const s = snapshot();
    const before = { regard: a.regard, kin: !!a.kin, folk: deepFolk.length, borers: stonewakes.length,
                     kept: deepFolk.filter(c => c.deepKin === 'kept').length };
    a.regard = 0; a.kin = false; deepFolk.length = 0; stonewakes.length = 0;
    restore(JSON.parse(JSON.stringify(s)));
    const a2 = deepAltars[0];
    const after = { regard: a2.regard, kin: !!a2.kin, folk: deepFolk.length, borers: stonewakes.length,
                    kept: deepFolk.filter(c => c.deepKin === 'kept').length };
    /* and nothing in the rebuilt lists is a ghost from the world before the load */
    const ghosts = deepFolk.filter(c => !chars.includes(c)).length;
    return { before, after, ghosts, same: JSON.stringify(before) === JSON.stringify(after) };
  });
  R.itSurvivesASave = !saved ? NOTHING : (saved.same && saved.ghosts === 0)
    ? `the vigil's regard, ${saved.after.folk} bodies and ${saved.after.borers} borers all come back, with no stale references left behind`
    : `!! THE DEEP DOES NOT SURVIVE A RELOAD (${JSON.stringify(saved)})`;

  console.log('=== THE KEPT ===\n');
  for (const [k, v] of Object.entries(R)) console.log('  ' + k.padEnd(30) + v);
  const bad = Object.values(R).map(String).filter(v => v.startsWith('!!'));
  console.log('\n' + (bad.length ? '*** ' + bad.join('\n*** ') : 'SOMETHING WAS ALREADY DOWN THERE'));
  if (errs.length) { console.log('errs:', errs.length); errs.slice(0, 4).forEach(e => console.log('  ' + e)); }
  await b.close();
  if (bad.length) process.exitCode = 1;
})();
