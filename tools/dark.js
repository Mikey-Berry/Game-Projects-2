#!/usr/bin/env node
/* THE DARK, AND WHAT IT COSTS THE PEOPLE STANDING IN IT.
 *
 *   "Let's also build out the darkness mechanics properly so that going into the underground
 *    feels like a genuine expedition. For the player, it should feel 'dark' but not impossible
 *    to see. The real toll of darkness is exacted upon the characters in it, not the player's
 *    own view. Portable light comes from torches. They can be built as emplacements, but also
 *    held as weapons. Risen and undead in general do not need light to see. Beyond shortening
 *    sight, darkness should penalize actions taken by anyone who does not have a source of
 *    light — attacks miss more often, labor is greatly slowed or impossible, and even walking
 *    becomes difficult."
 *
 * So the claims below are not "is there a darkness flag". They are, in order: does the toll
 * land on the BODY rather than on the camera; does it land only on the people it should; and
 * is a torch a real object with a real cost that really runs out.
 *
 * Every number here is measured against a live body standing in a real hall of the undercroft,
 * with the same body used lit and unlit so nothing but the light differs. Anything starting
 * '!!' fails the build.
 *
 *   node tools/dark.js [game.html]
 */
const { chromium } = require('playwright');
const path = require('path');
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
  const NOTHING = '!! NOTHING TO MEASURE — this build has no darkness';

  /* the shared fixture: an empty stretch of a real undercroft hall, and a way to put a fresh
     living body in it. Everything below stands somebody here rather than at the origin, because
     the whole mechanism is gated on `floor < 0` and a probe at (0,0) would measure nothing. */
  await p.evaluate(() => {
    window.__hall = undercroft.halls[0];
    window.__probe = (opts) => {
      const h = window.__hall;
      const c = makeChar('Probe', 'player', h.x, h.y, Object.assign({ atk: 20, def: 10, tough: 20, ath: 10 }, opts || {}));
      c.floor = -1; c.state = 'ok'; c.job = null; c.job2 = null;
      c.guard = null; c.moveTarget = null; c.target = null;
      chars.push(c);
      return c;
    };
    /* THE UNTOUCHED WORLD, READ ONCE, BEFORE ANY SECTION BELOW PUTS A LIGHT OUT. Every claim
       after this one clears the board first, which would erase the thing this census is about. */
    window.__shallows = (() => {
      const hostile = chars.filter(c => (c.floor || 0) < 0 && c.state === 'ok' && c.faction !== 'player');
      const by = {};
      for (const c of hostile) by[c.faction] = (by[c.faction] || 0) + 1;
      return {
        hostile: hostile.length, by,
        /* the invariant: nothing that lives down there is left groping about */
        blind: hostile.filter(c => inTheDark(c)).length,
        blindKinds: [...new Set(hostile.filter(c => inTheDark(c)).map(c => c.faction))],
        bandits: hostile.filter(c => c.faction === 'bandit').length,
      };
    })();
    /* ---- and a way to empty the hall of anything that would rather fight than be measured.
       The first version of the build claim measured a builder who raised the frame for exactly
       one tick and then went to kill the stalker an earlier section had spawned four tiles
       away — a real reading of a real body doing a real thing, and not the thing under test.
       Same lesson tools/deep.js recorded: geometry that follows the thing you are measuring is
       not a measurement. `noFight` stops the probe reaching for a target; the sweep stops
       anything reaching for the probe. */
    window.__clearFoes = () => {
      for (const c of chars) {
        if (c.faction === 'player' || c.state === 'dead') continue;
        if ((c.floor || 0) >= 0) continue;
        if (dist(c.x, c.y, window.__hall.x, window.__hall.y) > 70) continue;
        c.x = 12; c.y = 12; c.target = null; c.moveTarget = null; c.guard = { x: 12, y: 12 };
      }
      rebuildCharGrid();
    };
    /* Nothing else of yours may wander into frame carrying a light. Posts are REMOVED rather
       than doused, because a doused post is a post with no pitch in it and the next `postTick`
       correctly puts a log in it — so a section that only zeroed their fuel left four posts
       from earlier sections queued up to eat the whole woodpile before the one under test
       got a look at it. That is the mechanism working; it is not this claim's business. */
    window.__clearLights = () => {
      for (const c of chars) if (c.weapon === 'w_torch') c.weapon = null;
      for (let i = pBuilds.length - 1; i >= 0; i--) if (pBuilds[i].type === 'torchpost') pBuilds.splice(i, 1);
      rebuildCharGrid();
    };
  });

  /* ---- 1. THE DARK EXISTS, AND IT IS UNDERGROUND ---- */
  const scope = await p.evaluate(() => {
    if (typeof inTheDark !== 'function') return null;
    window.__clearLights();
    const c = window.__probe();
    const below = inTheDark(c);
    c.floor = 0;
    rebuildCharGrid();
    const above = inTheDark(c);
    c.floor = -1;
    rebuildCharGrid();
    return { below, above, back: inTheDark(c) };
  });
  R.theDarkIsUnderTheWorld = !scope ? NOTHING
    : (scope.below && !scope.above && scope.back)
    ? 'a living body with no light is blind on floor -1 and sees perfectly well on the surface, and walking back down puts it out again'
    : `!! THE DARK IS NOT WHERE IT SHOULD BE (${JSON.stringify(scope)})`;

  /* ---- 2. AND THE DEAD DO NOT NEED A LAMP ----
     The load-bearing exemption. Asked of a real risen, a real gaunt and a real Kept rather
     than of the flag table, because `seesInDark` reads four different marks and a body can
     carry any one of them. */
  const exempt = await p.evaluate(() => {
    if (typeof inTheDark !== 'function') return null;
    window.__clearLights();
    const living = window.__probe();
    const risen = window.__probe(); risen.undead = true;
    const g = spawnGaunt('stalker', window.__hall.x + 1, window.__hall.y + 1);
    if (g) { g.floor = -1; chars.push(g); }
    const kept = (typeof deepFolk !== 'undefined' && deepFolk[0]) || null;
    /* AND THE OTHER HALF OF THE RULE, which the first version got wrong: a bandit sheltering in
       a warren carries `caveDweller` like everything else worldgen stocks a room with, and
       reading that flag here made every hostile thing underground exempt — leaving the dark as
       a tax paid only by your own hires. A man is a man wherever he is standing.
       BUILT RATHER THAN FOUND, because there is not one bandit under the world to find (see
       `noteTheBandsAreDead` below). The rule is what is under test, not worldgen's ability to
       produce a subject for it — and building one means this claim keeps working whichever way
       that separate bug is eventually settled. */
    const brigand = makeChar('Brigand', 'bandit', window.__hall.x + 2, window.__hall.y + 2,
                             { atk: 12, def: 10, tough: 12, ath: 6 });
    brigand.floor = -1; brigand.state = 'ok'; brigand.weapon = null;
    brigand.caveDweller = true;          /* exactly what `stockRoom` puts on them */
    chars.push(brigand);
    rebuildCharGrid();
    return {
      living: inTheDark(living), risen: inTheDark(risen),
      gaunt: g ? inTheDark(g) : null,
      kept: kept ? inTheDark(kept) : null,
      brigand: brigand ? inTheDark(brigand) : null,
      brigandIsDweller: brigand ? !!brigand.caveDweller : null,
    };
  });
  R.andTheDeadDoNotNeedALamp = !exempt ? NOTHING
    : (exempt.living && !exempt.risen && exempt.gaunt === false && exempt.kept === false &&
       exempt.brigand === true && exempt.brigandIsDweller === true)
    ? 'the living hand is blind; the risen, the gaunt and the Kept read it as ordinary ground — and a bandit sheltering in a warren is blind too, `caveDweller` or not'
    : `!! THE WRONG PEOPLE ARE BLIND (${JSON.stringify(exempt)})`;

  /* ---- 2b. AND THE DARK IS NEVER ONE-SIDED ----
     The design invariant behind the exemption, and the one a careless edit to `seesInDark`
     will break: everything that lives under the world either sees down there or is carrying a
     light. If that ever fails, the dark has stopped being a cost of going down and become a
     free advantage over whatever is waiting — which is the version of this feature that plays
     badly in exactly one direction.
     It caught its own regression on the way in. Dropping `caveDweller` from `seesInDark` (which
     was right: it means "this AI lives in this warren" and worldgen puts it on the bandits too)
     silently blinded the whole redoubt garrison — 28 bodies standing inside a sealed Golden-Age
     complex that still has its own power. Read off the untouched world, before any section
     below has put a light out. */
  const shallows = await p.evaluate(() => window.__shallows || null);
  R.andTheDarkIsNeverOneSided = !shallows ? NOTHING
    : (shallows.hostile > 100 && shallows.blind === 0)
    ? `${shallows.hostile} bodies under the world — ${Object.entries(shallows.by).map(([k, n]) => k + ' ' + n).join(', ')} — and not one of them is in the dark`
    : `!! SOMETHING DOWN THERE IS GROPING ABOUT (${shallows.blind} of ${shallows.hostile} blind: ${JSON.stringify(shallows.blindKinds)})`;
  /* AND A STANDING FINDING, printed rather than asserted, because it is not this feature's bug:
     there is not one bandit under the world. `cv.menace` is assigned by `seedWarrens` AFTER
     `placeCave` runs the stocking, so `d01` falls to its 0.5 default and every room in every
     warren draws the middle table — the shallow and deep bands have never once been used. See
     the note in `stockRoom`. */
  R.noteTheBandsAreDead = !shallows ? NOTHING
    : `NOTE (not this feature's): ${shallows.bandits} bandits under the world. \`cave.menace\` is set after the rooms are stocked, so all three warren bands collapse to the middle one`;

  /* ---- 3. A TORCH IS A LIGHT, AND IT LIGHTS THE ROOM ----
     Including for people who are not carrying it — a fire lights the room for whoever is
     standing in it, which is the whole reason a column can be lit by two of them. */
  const torch = await p.evaluate(() => {
    if (typeof torchLit !== 'function') return null;
    window.__clearLights();
    const bearer = window.__probe();
    const near = window.__probe(); near.x = bearer.x + 3;   /* inside TORCH_R (5.5) */
    const far = window.__probe(); far.x = bearer.x + 12;    /* well outside it */
    const before = { bearer: inTheDark(bearer), near: inTheDark(near), far: inTheDark(far) };
    bearer.weapon = 'w_torch'; bearer.torchH = 10;
    rebuildCharGrid();
    const after = { bearer: inTheDark(bearer), near: inTheDark(near), far: inTheDark(far) };
    return { before, after, R: TORCH_R, lit: torchLit(bearer) };
  });
  R.aTorchLightsTheRoom = !torch ? NOTHING
    : (torch.before.bearer && torch.before.near && torch.before.far &&
       !torch.after.bearer && !torch.after.near && torch.after.far)
    ? `all three blind in an empty hall; one torch lit and the bearer and the body three tiles off can both see, while the one twelve tiles away still cannot (radius ${torch.R})`
    : `!! THE TORCH DOES NOT LIGHT WHAT IT SHOULD (${JSON.stringify(torch)})`;

  /* ---- 4. AND SO DOES A POST, WHICH DOES NOT WALK OFF ---- */
  const post = await p.evaluate(() => {
    if (!BUILD_TYPES.torchpost) return null;
    window.__clearLights();
    const h = window.__hall;
    const c = window.__probe(); c.x = h.x + 6; c.y = h.y;    /* inside 8.5, outside a torch's 5.5 */
    const blind = inTheDark(c);
    const b2 = placeStructure('torchpost', Math.round(h.x), Math.round(h.y), -1);
    rebuildCharGrid();
    const lit = inTheDark(c);
    c.x = h.x + 14;
    rebuildCharGrid();
    const away = inTheDark(c);
    return { blind, lit, away, fuel: b2.fuel, floor: b2.floor, R: TORCH_POST_R, posts: litPosts.length };
  });
  R.andAPostHoldsTheGround = !post ? NOTHING
    : (post.blind && !post.lit && post.away && post.floor === -1 && post.fuel > 0)
    ? `a post raised in the hall opens ${post.R} tiles of it — blind at six tiles before, seeing after, blind again at fourteen — and it stands on floor ${post.floor} with ${post.fuel} hours in it`
    : `!! THE POST IS NOT A LIGHT (${JSON.stringify(post)})`;

  /* ---- 5. THE SIGHT NUMBER, AND THE LIE IT USED TO TELL ----
     `stampVision` is the one place the radius reaches the fog, so that is where it is read
     from — the claim is about what the code CHOOSES, not about what a flood fill of the fog
     sheet happens to look like afterwards.
     The second half is the standing bug: the surface curve was being applied underground, so
     a sealed tunnel was brighter at noon than at midnight. */
  const sight = await p.evaluate(() => {
    if (typeof computeVision !== 'function') return null;
    window.__clearLights();
    /* one body of yours in the world, so there is exactly one answer to read */
    const keep = chars.filter(c => c.faction === 'player' && c.state !== 'dead');
    for (const c of keep) c.faction = '_parked';
    const c = window.__probe();
    const real = stampVision;
    let got = [];
    stampVision = (x, y, r) => { if (Math.abs(x - c.x) < 0.01 && Math.abs(y - c.y) < 0.01) got.push(r); };
    const read = () => { got = []; computeVision(); return got.length ? got[0] : -1; };
    hour = 0; const blindNight = read();
    hour = 12; const blindNoon = read();
    c.weapon = 'w_torch'; c.torchH = 10; rebuildCharGrid();
    const lit = read();
    c.weapon = null; c.undead = true; rebuildCharGrid();
    const dead = read();
    c.undead = false; c.floor = 0; rebuildCharGrid();
    hour = 12; const surfaceNoon = read();
    stampVision = real;
    for (const o of keep) o.faction = 'player';
    return { blindNight, blindNoon, lit, dead, surfaceNoon };
  });
  R.sightShortensButIsNotAPinhole = !sight ? NOTHING
    : (sight.blindNight > 8 && sight.blindNight < sight.lit && sight.blindNight < sight.dead &&
       sight.dead < sight.lit && sight.surfaceNoon > sight.lit)
    ? `${sight.blindNight} tiles blind, ${sight.dead} for something that needs no light, ${sight.lit} with a torch — against ${Math.round(sight.surfaceNoon)} on the surface at noon. A room, not a letterbox.`
    : `!! THE SIGHT LADDER IS WRONG (${JSON.stringify(sight)})`;
  R.andNoSunReachesDownThere = !sight ? NOTHING
    : (sight.blindNight === sight.blindNoon)
    ? `midnight and noon both see ${sight.blindNoon} tiles in a sealed tunnel — the surface day curve is no longer consulted twenty-two units down`
    : `!! THE SKY IS STILL BEING ASKED UNDERGROUND (midnight ${sight.blindNight}, noon ${sight.blindNoon})`;

  /* ---- 6. ATTACKS MISS MORE, AND A SHOT MISSES MOST ---- */
  const swing = await p.evaluate(() => {
    if (typeof hitChance !== 'function' || !BUILD_TYPES.torchpost) return null;
    window.__clearLights();
    /* EVENLY MATCHED, DELIBERATELY. The first version gave the attacker twenty-four attack
       against ten defence and every lit reading came back 0.94 — the clamp ceiling — so the
       measured gap was whatever the penalty had left over after the clamp had eaten the rest
       of it, and the ranged claim went red on a mechanic that was working. A pair this close
       leaves the whole term visible, and the claim asserts the exact number rather than "some
       difference". */
    const a = window.__probe({ atk: 12 });
    const d = window.__probe({ def: 12 });
    d.x = a.x + 1;
    a.weapon = 'w_kat'; rebuildCharGrid();
    const meleeBlind = hitChance(a, d);
    a.weapon = 'w_bow'; rebuildCharGrid();
    const rangedBlind = hitChance(a, d);
    /* the same pair, the same weapons, with a post burning beside them */
    const b2 = placeStructure('torchpost', Math.round(a.x), Math.round(a.y), -1);
    rebuildCharGrid();
    const rangedLit = hitChance(a, d);
    a.weapon = 'w_kat'; rebuildCharGrid();
    const meleeLit = hitChance(a, d);
    b2.fuel = 0; rebuildCharGrid();
    return { meleeBlind, meleeLit, rangedBlind, rangedLit };
  });
  const mGap = swing ? swing.meleeLit - swing.meleeBlind : 0;
  const rGap = swing ? swing.rangedLit - swing.rangedBlind : 0;
  R.blindHandsMiss = !swing ? NOTHING
    : (swing.meleeLit < 0.9 && swing.rangedLit < 0.9 &&
       Math.abs(mGap - 0.20) < 0.01 && Math.abs(rGap - 0.34) < 0.01)
    ? `the same swing lands ${(swing.meleeLit * 100).toFixed(0)}% of the time in the light and ${(swing.meleeBlind * 100).toFixed(0)}% out of it; the same shot, ${(swing.rangedLit * 100).toFixed(0)}% against ${(swing.rangedBlind * 100).toFixed(0)}% — the bow, which needed eyes, loses ${(rGap * 100).toFixed(0)} points against the blade's ${(mGap * 100).toFixed(0)}`
    : `!! THE DARK DOES NOT SPOIL A BLOW (${JSON.stringify(swing)} gaps ${mGap.toFixed(3)}/${rGap.toFixed(3)})`;

  /* ---- 7. AND WALKING IS SLOWER ---- */
  const pace = await p.evaluate(() => {
    if (typeof moveSpeed !== 'function') return null;
    window.__clearLights();
    const c = window.__probe();
    const blind = moveSpeedRaw(c);
    c.weapon = 'w_torch'; c.torchH = 10; rebuildCharGrid();
    const lit = moveSpeedRaw(c);
    return { blind, lit, k: blind / lit };
  });
  R.andTheGoingIsSlow = !pace ? NOTHING
    : (pace.k > 0.4 && pace.k < 0.75)
    ? `${pace.blind.toFixed(2)} tiles a second picking over rock it cannot see against ${pace.lit.toFixed(2)} with a torch — ${(pace.k * 100).toFixed(0)}% of the pace`
    : `!! WALKING IN THE DARK IS FREE (${JSON.stringify(pace)})`;

  /* ---- 8. LABOUR CRAWLS ----
     Not `darkWorkK` asked directly, which would only prove the function returns what it says.
     Two identical bodies given the same gather order, driven through the same thirty seconds
     of real `physics`, and the sacks compared. */
  const work = await p.evaluate(() => {
    if (typeof physics !== 'function') return null;
    window.__clearLights();
    window.__clearFoes();
    const run = (lit) => {
      const c = window.__probe({ labor: 20 });
      c.noFight = true;
      c.gather = { sx: c.x, sy: c.y, kind: 'stone' };
      if (lit) { c.weapon = 'w_torch'; c.torchH = 999; }
      rebuildCharGrid();
      for (let i = 0; i < 900; i++) physics(c, 1 / 30);
      const got = invCount(c, 'stone') * 5 + c.gatherT;
      c.state = 'dead';
      return got;
    };
    const blind = run(false);
    const lit = run(true);
    return { blind, lit, ratio: lit > 0 ? blind / lit : -1 };
  });
  R.labourByFeelIsBarelyLabour = !work ? NOTHING
    : (work.lit > 20 && work.ratio > 0.05 && work.ratio < 0.35)
    ? `thirty seconds at the same seam: ${work.lit.toFixed(0)} units of work with a torch, ${work.blind.toFixed(0)} without — ${(work.ratio * 100).toFixed(0)}% of the rate`
    : `!! THE DARK DOES NOT SLOW THE SHOVEL (${JSON.stringify(work)})`;

  /* ---- 9. AND A FRAME DOES NOT GO UP AT ALL ----
     The one trade that stops rather than slows: you cannot raise a thing you cannot see. */
  const raise = await p.evaluate(() => {
    if (typeof physics !== 'function' || !BUILD_TYPES.torchpost) return null;
    window.__clearLights();
    window.__clearFoes();
    const h = window.__hall;
    const run = (lit) => {
      const bp = { type: 'torchpost', x: Math.round(h.x) + 3, y: Math.round(h.y) + 3, w: 1, h: 1,
                   floor: -1, need: {}, got: {}, progress: 0 };
      blueprints.push(bp);
      const c = window.__probe({ labor: 20 });
      c.noFight = true;
      c.x = bp.x; c.y = bp.y; c.job = 'build';
      let torchB = null;
      if (lit) { torchB = placeStructure('torchpost', bp.x + 1, bp.y, -1); }
      rebuildCharGrid();
      for (let i = 0; i < 600 && blueprints.includes(bp); i++) physics(c, 1 / 30);
      const prog = blueprints.includes(bp) ? bp.progress : 1;
      const i2 = blueprints.indexOf(bp); if (i2 >= 0) blueprints.splice(i2, 1);
      if (torchB) torchB.fuel = 0;
      c.state = 'dead';
      return prog;
    };
    const blind = run(false);
    const lit = run(true);
    return { blind, lit };
  });
  R.andNothingIsRaisedInTheDark = !raise ? NOTHING
    : (raise.blind === 0 && raise.lit > 0.1)
    ? `twenty seconds on the same frame: ${(raise.lit * 100).toFixed(0)}% raised with a post burning beside it, and exactly nothing without one`
    : `!! THE BUILD GATE IS NOT A GATE (${JSON.stringify(raise)})`;

  /* ---- 10. THE TORCH BURNS DOWN, AND ONLY WHERE IT IS DOING SOMETHING ---- */
  const burn = await p.evaluate(() => {
    if (typeof torchTick !== 'function') return null;
    window.__clearLights();
    const c = window.__probe();
    c.weapon = 'w_torch'; c.torchH = TORCH_HOURS;
    /* six hours on the surface: a torch is not taxed for walking across a field */
    c.floor = 0;
    for (let i = 0; i < 6; i++) torchTick(1);
    const aboveLeft = c.torchH;
    /* six hours below: it burns */
    c.floor = -1;
    for (let i = 0; i < 6; i++) torchTick(1);
    const belowLeft = c.torchH;
    return { full: TORCH_HOURS, aboveLeft, belowLeft };
  });
  R.aTorchBurnsWhereItIsWorking = !burn ? NOTHING
    : (burn.aboveLeft === burn.full && Math.abs(burn.belowLeft - (burn.full - 6)) < 0.01)
    ? `six hours in daylight takes nothing off it; six hours below takes six, ${burn.belowLeft} of ${burn.full} left — so the count you set out with is the clock on the expedition, not a tax on walking round a town`
    : `!! THE TORCH DOES NOT BURN THE WAY IT SHOULD (${JSON.stringify(burn)})`;

  /* ---- 11. IT RELIGHTS FROM THE PACK, AND THEN IT DOES NOT ----
     "Burn out, carry spares." Which has to mean the pack empties, or it is not a resource —
     and has to mean it relights itself, or it is forty clicks. */
  const spares = await p.evaluate(() => {
    if (typeof torchTick !== 'function') return null;
    window.__clearLights();
    for (const k of Object.keys(stash)) if (k === 'w_torch') delete stash[k];
    addItem('w_torch', 2);
    const c = window.__probe();
    c.weapon = 'w_torch'; c.torchH = TORCH_HOURS;
    const packed = stash.w_torch || 0;
    /* three torches' worth of hours, with two in the pack */
    let relit = 0;
    for (let i = 0; i < TORCH_HOURS * 3 + 2; i++) {
      const had = c.weapon;
      torchTick(1);
      if (!had && c.weapon === 'w_torch') relit++;
    }
    return { packed, left: stash.w_torch || 0, weapon: c.weapon, relit };
  });
  R.andTheSparesRunOut = !spares ? NOTHING
    : (spares.packed === 2 && spares.left === 0 && spares.weapon === null)
    ? `two in the pack and thirty-two hours below: both drawn and lit without a click, and the hand comes out of it empty`
    : `!! THE PACK IS BOTTOMLESS OR THE RELIGHT NEVER HAPPENS (${JSON.stringify(spares)})`;

  /* ---- 12. AND A POST EATS A LOG A DAY, OR IT GOES OUT ---- */
  const feed = await p.evaluate(() => {
    if (typeof postTick !== 'function' || !BUILD_TYPES.torchpost) return null;
    window.__clearLights();
    const h = window.__hall;
    const b2 = placeStructure('torchpost', Math.round(h.x) - 4, Math.round(h.y), -1);
    b2.fuel = 12;                                  /* half a day left in it */
    /* `campHas` counts the stash as well as the bins, and a fresh world has no bins — the
       first version of this stocked a Storage Bin that did not exist and measured a post
       starving beside a full store. */
    delete stash.wood; addItem('wood', 3);
    const woodBefore = campHas('wood');
    postTick();                                    /* it runs dry and the stores refill it */
    const afterFed = b2.fuel;
    const woodAfter = campHas('wood');
    /* now empty the stores and let it run down again */
    delete stash.wood;
    for (const x of pBuilds) if (x.store) x.store.wood = 0;
    for (const o of chars) if (o.inv) delete o.inv.wood;
    b2.fuel = 12;
    postTick();
    const afterDry = b2.fuel;
    b2.fuel = 0;
    return { afterFed, afterDry, woodBefore, woodAfter, fed: woodBefore > woodAfter };
  });
  R.aPostIsAStandingCost = !feed ? NOTHING
    : (feed.afterFed > 12 && feed.afterDry === 0 && feed.woodAfter === feed.woodBefore - 1)
    ? `a post down to twelve hours pulls one log out of the stores (${feed.woodBefore} to ${feed.woodAfter}) and comes back to ${feed.afterFed} hours; with the stores empty the same post goes dark`
    : `!! THE POST BURNS FOR NOTHING (${JSON.stringify(feed)})`;

  /* ---- 13. THE POST IS THE ONLY THING THAT GOES DOWN THERE ----
     A blueprint has never carried a storey in this file: staking a bin while the camera was
     underground tested surface rock, built on the surface, and drew twenty-two units over your
     head. That is now refused out loud, and the one build that belongs down here is not. */
  const stake = await p.evaluate(() => {
    if (typeof tryBuild !== 'function' || !BUILD_TYPES.torchpost) return null;
    const h = window.__hall;
    const wasFloor = activeFloor;
    const n0 = blueprints.length;
    activeFloor = -1;
    const bin = tryBuild('bin', Math.round(h.x) + 5, Math.round(h.y) + 5, true);
    const post = tryBuild('torchpost', Math.round(h.x) + 5, Math.round(h.y) + 5, true);
    const bp = blueprints[blueprints.length - 1];
    const bpFloor = bp ? (bp.floor || 0) : null;
    activeFloor = 0;
    const binUp = tryBuild('bin', Math.round(h.x) + 7, Math.round(h.y) + 7, true);
    const bpUp = blueprints[blueprints.length - 1];
    const upFloor = bpUp ? (bpUp.floor || 0) : null;
    blueprints.length = n0;
    activeFloor = wasFloor;
    return { bin, post, bpFloor, binUp, upFloor };
  });
  R.onlyTheFireGoesDown = !stake ? NOTHING
    : (stake.bin === false && stake.post === true && stake.bpFloor === -1 && stake.binUp === true && stake.upFloor === 0)
    ? 'a Storage Bin staked underground is refused rather than silently raised on the hillside above; a Pitch Post is taken and carries floor -1; and the same bin on the surface still stakes at floor 0'
    : `!! THE FLOOR STAMP IS WRONG (${JSON.stringify(stake)})`;

  /* ---- 14. THE OTHER LIGHTS IN THE GAME STILL COUNT ----
     Ainzopha'ar's Light and a Wisp were both lights before any of this existed. If the dark
     had only known about torches they would have become the one answer, and two mechanics the
     player already owns would have quietly stopped meaning anything underground. */
  const others = await p.evaluate(() => {
    if (typeof litNear !== 'function') return null;
    window.__clearLights();
    const c = window.__probe();
    const caster = window.__probe({ magic: 40 });
    caster.x = c.x + 4;
    const dark0 = inTheDark(c);
    caster.concentrating = { key: 'warding', t: 99, mobile: true, exclusive: true };
    rebuildCharGrid();
    const byWard = inTheDark(c);
    caster.concentrating = null;
    const wisp = window.__probe(); wisp.x = c.x + 5; wisp.lamp = true; wisp.undead = true;
    rebuildCharGrid();
    const byWisp = inTheDark(c);
    wisp.lamp = false; rebuildCharGrid();
    return { dark0, byWard, byWisp, after: inTheDark(c) };
  });
  R.theOldLightsStillCount = !others ? NOTHING
    : (others.dark0 && !others.byWard && !others.byWisp && others.after)
    ? 'a hand blind in an empty hall can see by Ainzopha\'ar\'s Light and can see by a Wisp, and is blind again when both go'
    : `!! THE DARK ONLY KNOWS ABOUT TORCHES (${JSON.stringify(others)})`;

  /* ---- 15. AND ALL OF IT SURVIVES A SAVE ----
     A post that came back brimming, or came back on the surface, would be an outpost you let
     go dark relighting itself on a reload; a torch that came back full would not be a resource. */
  const saved = await p.evaluate(() => {
    if (typeof snapshot !== 'function' || !BUILD_TYPES.torchpost) return null;
    window.__clearLights();
    const h = window.__hall;
    const b2 = placeStructure('torchpost', Math.round(h.x) - 7, Math.round(h.y), -1);
    b2.fuel = 33;
    const c = player()[0];
    const wasWep = c.weapon;
    c.weapon = 'w_torch'; c.torchH = 4.5;
    const s = snapshot();
    b2.fuel = 999; c.torchH = 999;
    restore(JSON.parse(JSON.stringify(s)));
    const p2 = pBuilds.find(x => x.type === 'torchpost' && x.x === Math.round(h.x) - 7) || null;
    const c2 = player().find(x => x.weapon === 'w_torch') || null;
    const out = { fuel: p2 ? p2.fuel : null, floor: p2 ? (p2.floor || 0) : null,
                  torchH: c2 ? c2.torchH : null };
    if (c2) c2.weapon = wasWep;
    return out;
  });
  R.itSurvivesASave = !saved ? NOTHING
    : (saved.fuel === 33 && saved.floor === -1 && saved.torchH === 4.5)
    ? `the post comes back with ${saved.fuel} hours in it on floor ${saved.floor}, and the half-burnt torch comes back half-burnt (${saved.torchH})`
    : `!! THE DARK DOES NOT SURVIVE A RELOAD (${JSON.stringify(saved)})`;

  /* ---- 16. AND THE ROOM LOOKS LIKE THE RULES SAY IT DOES ----
     The one claim about the camera. Every number above is a fact about a body; if the scene
     is still lit at 0.62 of hemisphere then none of it is legible and the feature is a set of
     invisible penalties. Read off the live scene rather than the source. */
  const look = await p.evaluate(() => {
    if (typeof updateSky !== 'function') return null;
    const wasFloor = activeFloor;
    activeFloor = 0; hour = 12; updateSky();
    const day = { hemi: hemi.intensity, far: scene.fog.far };
    activeFloor = -1; updateSky();
    const under = { hemi: hemi.intensity, far: scene.fog.far };
    const lights = (typeof TORCH_LIGHTS !== 'undefined') ? TORCH_LIGHTS.length : -1;
    /* every one of them is in the scene and stays there, or the shader recompiles the frame
       you carry a torch into a dark room */
    const parented = (typeof TORCH_LIGHTS !== 'undefined')
      ? TORCH_LIGHTS.every(l => l.parent === scene && l.visible) : false;
    activeFloor = wasFloor; updateSky();
    return { day, under, lights, parented };
  });
  R.andTheRoomLooksDark = !look ? NOTHING
    : (look.under.hemi < look.day.hemi * 0.5 && look.under.far < look.day.far && look.lights === 3 && look.parented)
    ? `noon runs at ${look.day.hemi.toFixed(2)} of hemisphere light and the undercroft at ${look.under.hemi.toFixed(2)}, with the fog in to ${look.under.far} — and ${look.lights} point lights held in the scene at zero rather than added and removed`
    : `!! THE UNDERCROFT IS STILL A LIT BASEMENT (${JSON.stringify(look)})`;

  console.log('=== THE DARK ===\n');
  for (const [k, v] of Object.entries(R)) console.log('  ' + k.padEnd(32) + v);
  const bad = Object.values(R).map(String).filter(v => v.startsWith('!!'));
  console.log('\n' + (bad.length ? '*** ' + bad.join('\n*** ') : 'IT IS DARK DOWN THERE, AND IT COSTS SOMETHING'));
  if (errs.length) { console.log('errs:', errs.length); errs.slice(0, 4).forEach(e => console.log('  ' + e)); }
  await b.close();
  if (bad.length) process.exitCode = 1;
})();
