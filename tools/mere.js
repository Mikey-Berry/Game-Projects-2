#!/usr/bin/env node
/* HOLLOWMERE, WHOSE WALLS ARE ITS DEAD.
 *
 * "Hollowmere is fine as is, but more wardens/necromancers. Should check on the necromancers
 * there — sometimes I feel that they don't properly raise corpses as guards."
 *
 * The check came first and the rite turned out to be fine: six paupers in the yard, two
 * keepers at full mana, first one up 3.5 game-seconds in and all six standing inside a minute.
 * What was wrong was arithmetic and staffing, and both are invisible from inside one morning:
 *
 *   1. two keepers at a cap of three is a standing dead of exactly SIX, for the whole game
 *   2. the paupers' field was seeded ONCE and never refilled, so a player arriving on day four
 *      finds a mortuary with nothing in it and four necromancers with nothing to do
 *   3. "the wardens' fire and the gravekeepers' dead are gate enough" — and the wardens did
 *      not exist. Zero of them, in the one town with no wall.
 *
 * So this measures the town as a garrison rather than the rite as a spell: who is posted, what
 * the yard holds tomorrow, and whether the dead actually end up standing around the town.
 *
 * Anything starting '!!' fails the build.
 *
 *   node tools/mere.js [game.html]
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
  await p.goto('file://' + gamePath(process.argv[2]), { waitUntil: 'load' });
  await p.waitForTimeout(3000);
  await p.evaluate(() => { document.getElementById('btn-start').click(); paused = true; });
  await p.waitForTimeout(2500);

  const out = await p.evaluate(() => {
    const R = {};
    /* ---------- A CONTROL MUST REPORT, NOT CRASH ----------
       Run against the build before this work, every one of these is simply absent, and a bare
       reference took the whole file down with a ReferenceError — so the negative control proved
       nothing except that the symbol is new. Reach for them through `typeof` and the old build
       goes red with readings, which is what a control is for. */
    const burials = () => { if(typeof hollowmereBurials === 'function') hollowmereBurials(); };
    const yardCap = (typeof YARD_CAP === 'number') ? YARD_CAP : 6;
    const keeperCap = (typeof KEEPER_RISEN_CAP === 'number') ? KEEPER_RISEN_CAP : 3;
    const roamerCap = (typeof ROAMER_RISEN_CAP === 'number') ? ROAMER_RISEN_CAP : 3;
    const hm = towns.find(t => t.def.undeadFriendly);
    R.town = hm ? `${hm.name}, unwalled, at ${Math.round(hm.x)},${Math.round(hm.y)}` : '!! NO UNDEAD-FRIENDLY TOWN';
    if(!hm) return R;

    /* ---- WHO IS POSTED ---- */
    const keepers = chars.filter(c => c.npcNecro && c.homeTown === hm && c.state !== 'dead');
    R.keepers = keepers.length >= 4
      ? `${keepers.length} gravekeepers: ${keepers.map(k => k.name.split(' ')[1]).join(', ')}`
      : `!! ONLY ${keepers.length} GRAVEKEEPER(S)`;
    const wardens = chars.filter(c => c.bogWarden && c.state !== 'dead');
    R.wardens = wardens.length >= 4
      ? `${wardens.length} bog wardens at the approaches`
      : `!! THE LORE PROMISES WARDENS AND THERE ARE ${wardens.length}`;
    /* AND THEY HAVE TO CARRY THE FIRE, not just the name. The boast is specifically about
       fire; a warden with no destruction branch is a guard in a hat. */
    const arts = wardens.filter(w => attOf(w, 'destruction') >= 1 && w.arts && Object.keys(w.arts).length);
    R.wardensBurn = arts.length === wardens.length && wardens.length
      ? `and every one of them carries fire (${Object.keys(wardens[0].arts).join(', ')})`
      : `!! ${wardens.length - arts.length} WARDEN(S) CARRY NO FIRE AT ALL`;
    /* AND THEY ARE OUTSIDE THE ROOFS. A warden standing in the bar is not a gate. */
    const ring = wardens.map(w => dist(w.x, w.y, hm.x, hm.y));
    R.wardensRing = ring.length && Math.min(...ring) > 12
      ? `posted ${Math.round(Math.min(...ring))}-${Math.round(Math.max(...ring))} tiles out, at the approaches`
      : `!! A WARDEN IS STANDING ${Math.round(Math.min(...ring))} TILES FROM THE SQUARE`;
    const golems = chars.filter(c => c.golem && c.homeTown === hm && c.state !== 'dead');
    R.golems = golems.length >= 3 ? `${golems.length} bone golems still at the fences` : `!! ONLY ${golems.length} GOLEMS`;

    /* ---- THE YARD ---- */
    const inYard = () => corpses.filter(c2 => raisableBody(c2) && dist(c2.x, c2.y, hm.x, hm.y) < 14).length;
    R.yardSeeded = inYard() >= 6 ? `${inYard()} bodies lying in the paupers' field` : `!! THE YARD HOLDS ${inYard()}`;

    /* ---- AND THEN THE TOWN IS LEFT TO WORK ----
       Driven through the real `update()`, not by calling castRaise: the whole question is
       whether the ROUND happens on its own, and a hand-cast proves only that the spell exists.
       Two hundred seconds is a long morning and comfortably more than the 3s scan interval —
       an earlier read of this watched a live render for less than ONE scan and concluded the
       rite was broken, which is a fact about the observer. */
    paused = false;
    const raisedOf = () => chars.filter(c2 => c2.undead && !c2.golem && c2.state !== 'dead' &&
      keepers.includes(c2.master)).length;
    for(let i = 0; i < 1200; i++) update(0.1);
    R.theyRaise = raisedOf() >= 5
      ? `the keepers put ${raisedOf()} of the six on their feet, unasked, in one morning`
      : `!! ONLY ${raisedOf()} OF THE SIX RAISED IN A WHOLE MORNING`;
    /* ---------- AND THE CEILING IS THE DEFECT, NOT THE MORNING ----------
       Six raised out of six lying is CORRECT and it was the whole of what the old build could
       ever do: two keepers times a cap of three, off a field seeded once. Reading the first
       morning alone cannot tell those apart, so run a week — burial, morning, burial — and ask
       whether the town's dead ever get past the number it used to be stuck at forever. */
    const wasSix = raisedOf();
    for(let d = 0; d < 6; d++){
      burials();
      for(let i = 0; i < 700; i++) update(0.1);
    }
    const grown = raisedOf();
    R.wallGrows = grown > 6 && grown > wasSix
      ? `and a week of burials takes the standing dead from ${wasSix} to ${grown}, past the old ceiling of six`
      : `!! A WEEK LATER THE TOWN STILL FIELDS ${grown} (WAS ${wasSix})`;
    const standing = grown;
    /* AS GUARDS, which is the word in the report. A risen with no post is a retinue. */
    const posted = chars.filter(c2 => c2.undead && !c2.golem && c2.state !== 'dead' &&
      keepers.includes(c2.master) && c2.guard).length;
    R.theyPost = posted >= standing - 4 && posted > 0
      ? `${posted} of them given a post around the town rather than kept as a retinue`
      : `!! ${posted}/${standing} OF THE RISEN WERE GIVEN A POST`;
    /* and spread out, not stacked on the mortuary step */
    const ds = chars.filter(c2 => c2.undead && !c2.golem && c2.state !== 'dead' && keepers.includes(c2.master))
      .map(c2 => dist(c2.x, c2.y, hm.x, hm.y));
    R.theySpread = ds.length && Math.max(...ds) - Math.min(...ds) > 3
      ? `standing ${Math.round(Math.min(...ds))} to ${Math.round(Math.max(...ds))} tiles out`
      : `!! EVERY RISEN IS IN ONE SPOT`;

    /* ---- AND THE YARD IS NOT A ONE-MORNING SCENE ----
       The whole defect, stated as a measurement: after the keepers clear it, does the field
       ever hold anything again. Run the day tick itself rather than waiting out 24 game-hours
       of world, because what is being tested is the burial, not the clock. */
    /* ---------- AND THE POST MUST NOT PARK THEM OUTSIDE THEIR OWN RITE ----------
       This is the report, isolated from luck. A posted body is dragged back to its flagstone
       the moment it strays 1.5 tiles, and whether a keeper reached a corpse came down to
       whether `travel` happened to overshoot the post in the right direction: measured on one
       build, the same two keepers reached 3.5 tiles from a cold start on one run and settled
       at 5.5 — half a tile outside a five-tile rite — on another.
       So put a body exactly where the leash is worst: just past the post, far enough that
       standing on the flagstone is out of range. If the claim owns the walk, they fetch it.
       Everything else is cleared out of the way first so this is the only body they can want. */
    for(const c2 of corpses.slice()) if(dist(c2.x, c2.y, hm.x, hm.y) < 14){
      const i = corpses.indexOf(c2); if(i >= 0) corpses.splice(i, 1);
      const j = chars.indexOf(c2); if(j >= 0) chars.splice(j, 1);
    }
    const k0 = keepers[0];
    k0.x = k0.guard.x; k0.y = k0.guard.y;
    k0.mana = maxMana(k0); k0.castCd = 0; k0.moveTarget = null; k0.necroBody = null;
    for(const r of chars.filter(c2 => c2.master === k0)) r.master = null;   /* room under the cap */
    /* ---------- AND THE BAIT HAS TO SATISFY BOTH ENDS AT ONCE ----------
       This used `findOpenNear(post.x + 6.5, post.y, 3)`, which is sixty random darts in a box —
       the README's own lesson, ignored here. On one seed it threw the body 9.7 tiles from the
       post, and a post sits 6 tiles from the square, so the corpse was outside the FOURTEEN the
       scan looks in and the keeper was entirely right to ignore it. The probe reported a
       gravekeeper doing the correct thing as a failure.
       So the spot is searched for rather than thrown at: far enough out that standing on the
       flagstone cannot reach it, near enough the square that it is in the yard at all, and
       walked round the compass so that whichever quarter is clear on this seed is the one used. */
    const px = k0.guard.x, py = k0.guard.y, want = SPELLS.raise.range + 1.6;
    let bx = 0, by = 0;
    for(let step = 0; step < 32 && !bx; step++){
      const ang = (step / 32) * Math.PI * 2;
      const qx = Math.round(px + Math.cos(ang) * want), qy = Math.round(py + Math.sin(ang) * want);
      if(isBlocked(qx + 0.5, qy + 0.5)) continue;
      if(dist(qx, qy, hm.x, hm.y) > 12) continue;
      bx = qx + 0.5; by = qy + 0.5;
    }
    const bait = bx ? makeChar('Pauper', 'town', bx, by, {atk:5, def:5, tough:5}) : null;
    if(bait){ bait.state = 'dead'; bait.homeTown = hm; bait.deadAt = day + hour/24;
              chars.push(bait); corpses.push(bait); }
    const gap0 = bait ? dist(px, py, bait.x, bait.y) : 0;
    const inYardR = bait ? dist(bait.x, bait.y, hm.x, hm.y) : 99;
    for(let i = 0; i < 900; i++) update(0.1);
    R.leashYields = !bait
      ? '!! NOWHERE TO STAGE THE BAIT — THIS PROVES NOTHING'
      : gap0 <= SPELLS.raise.range
        ? `!! THE BAIT LANDED AT ${gap0.toFixed(1)}, INSIDE THE RITE — THIS PROVES NOTHING`
        : inYardR >= 14
          ? `!! THE BAIT LANDED ${inYardR.toFixed(1)} FROM THE SQUARE, OUTSIDE THE YARD — THIS PROVES NOTHING`
          : !corpses.includes(bait)
            ? `a body ${gap0.toFixed(1)} tiles past the post — and a ${SPELLS.raise.range}-tile rite — is fetched and raised anyway`
            : `!! A KEEPER SAT AT ITS POST WHILE A BODY LAY ${gap0.toFixed(1)} TILES OFF, ${inYardR.toFixed(1)} FROM THE SQUARE`;

    /* DRAIN IT FIRST. By the end of the week above the field is sitting near its cap, and
       "8 became 10" is not evidence that a burial happens — the number has nowhere to go.
       Empty the yard by hand and then ask for three nights, which is the question. */
    for(const c2 of corpses.slice()) if(dist(c2.x, c2.y, hm.x, hm.y) < 14){
      const i = corpses.indexOf(c2); if(i >= 0) corpses.splice(i, 1);
      const j = chars.indexOf(c2); if(j >= 0) chars.splice(j, 1);
    }
    const was = inYard();
    for(let d = 0; d < 3; d++) burials();
    const now = inYard();
    R.yardRefills = was === 0 && now >= 3
      ? `and an emptied yard fills again: ${was} to ${now} over three nights`
      : `!! AN EMPTIED YARD WENT ${was} TO ${now} IN THREE NIGHTS`;
    /* and it does not become a pile */
    for(let d = 0; d < 30; d++) burials();
    R.yardCapped = inYard() <= yardCap + 2
      ? `capped at ${inYard()} rather than growing without bound`
      : `!! THIRTY NIGHTS OF BURIALS MADE A PILE OF ${inYard()}`;

    /* ---- AND THE CAP IS TWO NUMBERS, NOT ONE ---- */
    R.capsDiffer = keeperCap > roamerCap
      ? `a keeper stands ${keeperCap} where a roamer drives ${roamerCap}`
      : `!! A KEEPER AND A ROAMER HOLD THE SAME ${keeperCap}`;
    const roamers = chars.filter(c2 => c2.roamNecro && c2.state !== 'dead');
    const overRoam = roamers.filter(r => risenCount(r) > roamerCap).length;
    R.roamersHeld = overRoam === 0
      ? `and the ${roamers.length} roamers on the road are still held to theirs`
      : `!! ${overRoam} ROAMER(S) ARE OVER THE ROAMER CAP`;
    return R;
  });

  console.log('=== HOLLOWMERE ===\n');
  for (const [k, v] of Object.entries(out)) console.log('  ' + k.padEnd(16) + v);
  const bad = Object.values(out).map(String).filter(v => v.startsWith('!!'));
  console.log('\n' + (bad.length ? '*** ' + bad.join('\n*** ') : 'THE BOG KEEPS ITS OWN GATE'));
  if (errs.length) { console.log('errs:', errs.length); errs.slice(0, 4).forEach(e => console.log('  ' + e)); }
  await b.close();
  if (bad.length) process.exitCode = 1;
})();
