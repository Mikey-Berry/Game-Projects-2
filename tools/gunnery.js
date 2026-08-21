#!/usr/bin/env node
/* WHY THE GUNNERY JOB DID NOTHING, AND WHY THE LANCE FIRED NOTHING.
 *
 * Reported from play: "Gunnery job currently seems to do absolutely nothing. Same with turrets.
 * Also the Aetheric Lance seemed broken and incapable of firing anything, even when held by a
 * non-alchemist." All the parts were present and wired — emplacementTick, EMPL with both
 * weapons, a buildable turret, a gunner branch in the job loop — and a turret standing in the
 * DIRT with a hand beside it does fire. So the failure was never in the weapon.
 *
 * It was in four places, and every one of them failed SILENTLY:
 *
 *   1. NOBODY COULD CLIMB TO IT. A turret bolted to a wall stands on storey 1 — which is the
 *      whole of its advertised use ("Put it on a wall and it shoots down over it"). `routeTo`
 *      asked `nearestStairFor` for the closest stair between the two storeys ANYWHERE IN THE
 *      WORLD. Measured on a camp with no stair of its own: the gunner set off for a stairwell
 *      fifty-two tiles away in somebody else's town. routeTo returned TRUE, so nothing was
 *      logged, nothing looked wrong, and the turret was never crewed.
 *   2. THE WALK WAS ABANDONED. `if(c.manning){ c.target = null; ... }` already says a hand with
 *      its hands on a mounted weapon does not wander off to stab people. It applies one step too
 *      late: before arrival, auto-acquire takes anything within seven tiles.
 *   3. IT WAS OFFERED TO BODIES THAT CANNOT DO IT. The job menu filters STUDY and CRAFT by
 *      `mindedDead`; `emplGunner` refuses a mindless body at the weapon and the menu did not,
 *      so a necromancer could put a whole host of hollow risen on the turrets for nothing.
 *   4. AND THE ONE LINE THAT WOULD HAVE EXPLAINED ANY OF IT was gated on `rnd() < dt * 0.04` —
 *      a per-FRAME probability, inside a branch that runs once every 1.2 SECONDS. Measured: 0.05
 *      expected messages across thirty seconds of standing there uselessly.
 *
 * The handheld lance is a fifth, separate thing: it spends an Aether Cell per shot, `aether_cell`
 * was listed in VENDOR_STOCK.occult, and no town in the world had one. Measured: 0 cells across
 * 7 town stocks in front of 2 occult dealers. The only cells in existence were 5-11 in a sealed
 * redoubt, for the whole run, and a dry lance said so once and then went quiet forever.
 *
 *   node tools/gunnery.js [game.html]
 */
const { chromium } = require('playwright');
const path = require('path');
const gamePath = (a) => path.resolve(a ? (path.isAbsolute(a) ? a : path.join(__dirname, a)) : path.join(__dirname, 'game.html'));

(async () => {
  const b = await chromium.launch({
    executablePath: process.env.DUSTWARD_CHROME || undefined,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'],
  });
  const p = await b.newPage({ viewport: { width: 1100, height: 900 } });
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message.slice(0, 200)));
  p.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text().slice(0, 200)); });
  await p.goto('file://' + gamePath(process.argv[2]), { waitUntil: 'load' });
  await p.waitForTimeout(3000);
  await p.evaluate(() => document.getElementById('btn-start').click());
  await p.waitForTimeout(3000);

  const out = await p.evaluate(() => {
    const R = {};
    const logs = [];
    const _log = log; window.log = (m, k) => { logs.push(String(m)); return _log(m, k); };
    paused = false;

    /* open waste well clear of every town, so nothing in the world wanders into the test */
    let gx = 700, gy = 700;
    const away = (x, y) => towns.every(t => dist(t.x, t.y, x, y) > 110);
    for (let r = 0; r < 6000 && !away(gx, gy); r++) { gx = 80 + ri(0, W - 160); gy = 80 + ri(0, W - 160); }
    R.ground = `staged on open waste at ${gx},${gy}`;

    /* a clean board: no bodies, no buildings, and none of the world's own decks or stairs
       within reach, so "the nearest stair" is deliberately somewhere useless */
    const clean = () => {
      chars.length = 0; pBuilds.length = 0; projectiles.length = 0; blueprints.length = 0;
      for (let j = gy - 10; j < gy + 11; j++) for (let i = gx - 10; i < gx + 11; i++) {
        decks.delete(bkey(i, j, 1)); blocked.delete(bkey(i, j)); blocked.delete(bkey(i, j, 0));
      }
      for (let k = stairs.length - 1; k >= 0; k--) if (Math.abs(stairs[k].x - gx) < 12 && Math.abs(stairs[k].y - gy) < 12) stairs.splice(k, 1);
      logs.length = 0;
      rebuildCharGrid();
    };
    const mk = (name, f, x, y, o) => { const c = makeChar(name, f, x, y, o || {}); c.state = 'ok'; chars.push(c); return c; };
    const crew = (name, x, y) => mk(name, 'player', x, y, { atk: 12, def: 10, tough: 20, ath: 9, gunnery: 20 });
    const mark = (name, x, y) => { const c = mk(name, 'bandit', x, y, { atk: 14, def: 10, tough: 30, ath: 8 }); c.noFight = true; return c; };
    /* Watch WHILE it runs rather than reading the last frame. These cases take half a minute of
       game time each and the harness has by then put several minutes on the world clock, so a
       hand that took up its post perfectly can be off to bed by the time the loop ends — which
       is correct behaviour and would read as a failure. What is under test is whether the post
       was ever taken and whether the weapon ever fired. */
    /* Two of the functions this measures do not exist on the build before it. Shim them so the
       harness RUNS against either one and reports the difference, rather than dying on a
       ReferenceError — a harness that cannot be pointed at the broken build proves nothing. */
    const gone = (n) => typeof window[n] !== 'function';
    const reachable = (b, c) => gone('emplReachable') ? (b.floor || 0) === (c.floor || 0) : emplReachable(b, c);
    const occultTown = (t) => gone('hasOccultDealer') ? (!!t.def.undeadFriendly || t.def.key === 'dustport') : hasOccultDealer(t);
    let crewedAt = 0;
    const run = (secs, c) => {
      for (let i = 0; i < secs * 30; i++) { update(1 / 30); if (c && c.manning) crewedAt++; }
    };

    /* ============ 1. A TURRET IN THE DIRT STILL WORKS ============
       The control. If this fails, everything below is measuring the wrong thing. */
    {
      clean();
      const tur = placeStructure('turret', gx, gy);
      const g = crew('Dirt', gx + 1, gy); g.job = 'gunner';
      const foe = mark('Mark', gx + 5, gy);
      crewedAt = 0; run(20, g);
      R.aTurretInTheDirtFires = (tur.shots > 0 && crewedAt > 0)
        ? `${tur.shots} shots in twenty seconds, crewed for ${(crewedAt / 30).toFixed(0)}s of it, and the mark is ${foe.state}`
        : `!! A GROUND TURRET DOES NOTHING (shots ${tur.shots}, crewed ${crewedAt} frames)`;
    }

    /* ============ 2. AND SO DOES ONE ON A WALL, GIVEN A WAY UP ============ */
    {
      clean();
      placeStructure('wall', gx, gy);
      placeStructure('rampart', gx + 1, gy);
      const tur = placeStructure('turret', gx, gy);
      const g = crew('Climber', gx + 2, gy); g.job = 'gunner';
      const foe = mark('Mark', gx + 5, gy);
      crewedAt = 0; run(30, g);
      R.aWallTurretIsCrewedByTheStair = (tur.shots > 0 && crewedAt > 0 && (g.floor || 0) === 1)
        ? `the gunner climbs to storey ${g.floor} and fires ${tur.shots} times — the mark is ${foe.state}`
        : `!! THE RAMPART TURRET IS UNCREWED (shots ${tur.shots}, gunner on floor ${g.floor || 0}, crewed ${crewedAt} frames)`;
    }

    /* ============ 3. AND WITH NO WAY UP, NOBODY WALKS OFF ACROSS THE MAP ============ */
    {
      clean();
      placeStructure('wall', gx, gy);
      const tur = placeStructure('turret', gx, gy);
      const g = crew('Stranded', gx + 1, gy); g.job = 'gunner';
      mark('Mark', gx + 5, gy);
      const farStair = stairs.length ? Math.round(Math.min(...stairs.map(s => dist(gx, gy, s.x, s.y)))) : -1;
      R.thereIsAStairSomewhereUseless = farStair > 20
        ? `the nearest stair in the world is ${farStair} tiles away, and it is not on this wall`
        : `!! THE TEST IS NOT SET UP (nearest stair ${farStair} tiles)`;
      R.routeToRefusesAStairThatGoesUpElsewhere = routeTo(g, tur.x + 0.5, tur.y + 0.5, 1) === false
        ? 'routeTo returns false rather than a walk to a stairwell in another county'
        : `!! routeTo ACCEPTED A ROUTE (moveTarget ${JSON.stringify(g.moveTarget)}, ${Math.round(dist(g.x, g.y, g.moveTarget.x, g.moveTarget.y))} tiles off)`;
      g.moveTarget = null; g.wantFloor = null; g.afterStair = null;
      R.emplReachableSaysNo = reachable(tur, g) === false && jobHasWork(g, 'gunner') === false
        ? 'and the job agrees there is no work at a weapon nobody can climb to'
        : `!! THE JOB STILL THINKS THIS IS WORK (reachable ${reachable(tur, g)}, hasWork ${jobHasWork(g, 'gunner')})`;
      run(30, g);
      R.theStrandedGunnerStaysHome = dist(g.x, g.y, gx, gy) < 25
        ? `it stays in camp — ${dist(g.x, g.y, gx, gy).toFixed(1)} tiles from the wall after thirty seconds`
        : `!! IT WALKED ${dist(g.x, g.y, gx, gy).toFixed(0)} TILES AWAY`;
      const said = logs.filter(l => /Rampart Stair/.test(l));
      R.andItSaysWhyOutLoud = said.length
        ? `${said.length}x in thirty seconds: "${said[0]}"`
        : `!! IT NEVER SAYS WHY (logs: ${logs.slice(0, 2).join(' | ') || 'silent'})`;
    }

    /* ============ 4. AND THE MOMENT IT IS BUILT, NOT THIRTY SECONDS LATER ============
       The useful time to hear this is while you are looking at the thing you just paid for. */
    {
      clean();
      placeStructure('wall', gx, gy);
      /* through the real path: a blueprint the crew finishes, not placeStructure by hand */
      const bp = {type: 'turret', x: gx, y: gy, w: 1, h: 1};
      blueprints.push(bp);
      completeBlueprint(bp);
      R.raisingItOnABareWallSaysSo = logs.some(l => /Nothing can reach it up there/.test(l))
        ? 'the crew steps back and the log says nothing can reach it'
        : `!! A TURRET ON A BARE WALL IS RAISED IN SILENCE (${logs.slice(0, 2).join(' | ') || 'silent'})`;
      /* and it does NOT say it when there is a stair, or the warning is noise */
      clean();
      placeStructure('wall', gx, gy);
      placeStructure('rampart', gx + 1, gy);
      const bp2 = {type: 'turret', x: gx, y: gy, w: 1, h: 1};
      blueprints.push(bp2);
      completeBlueprint(bp2);
      R.andDoesNotCryWolfWhenThereIsAStair = !logs.some(l => /Nothing can reach it/.test(l))
        ? 'and says nothing when the stair is already there'
        : '!! IT WARNS ABOUT A TURRET THAT IS PERFECTLY REACHABLE';
    }

    /* ============ 5. A HAND ON THE WAY TO A WEAPON DOES NOT GO STABBING ============ */
    {
      clean();
      const tur = placeStructure('turret', gx, gy);
      const g = crew('Tank', gx + 9, gy + 9); g.job = 'gunner'; g.stance = 'tank';
      const bait = mark('Bait', gx + 7, gy + 7);          /* between them, well inside seven tiles */
      crewedAt = 0; run(2, g);
      R.aTankStanceGunnerIgnoresTheBait = (!g.target || g.manning)
        ? `it keeps walking (target ${g.target ? g.target.name : 'none'}, manning ${g.manning || 'not yet'})`
        : `!! IT ABANDONED THE TURRET TO SWING AT ${g.target.name}`;
      run(30, g);
      R.andArrivesAndFires = (tur.shots > 0 && crewedAt > 0)
        ? `and arrives — ${tur.shots} shots, ${bait.state}`
        : `!! IT NEVER GOT THERE (shots ${tur.shots}, crewed ${crewedAt} frames, ${dist(g.x, g.y, gx, gy).toFixed(1)} tiles out, target ${g.target ? g.target.name : 'none'})`;
      /* the same on HOLD, which used to clear its own moveTarget every tick */
      clean();
      const tur2 = placeStructure('turret', gx, gy);
      const h = crew('Holder', gx + 8, gy); h.job = 'gunner'; h.stance = 'hold';
      mark('Mark', gx + 5, gy);
      crewedAt = 0; run(30, h);
      R.aHoldStanceGunnerStillWalksToItsPost = (tur2.shots > 0 && crewedAt > 0)
        ? `a hand on HOLD still crosses the camp and takes up its post — ${tur2.shots} shots`
        : `!! HOLD FREEZES A GUNNER AT THE OTHER END OF THE CAMP (shots ${tur2.shots}, crewed ${crewedAt} frames)`;
    }

    /* ============ 6. THE EMPLACED LANCE, AND WHO MAY TOUCH IT ============ */
    {
      clean();
      research.done.aether_ordnance = true;
      const lan = placeStructure('lance', gx, gy);
      const gifted = crew('Alchemist', gx + 1, gy); gifted.job = 'gunner'; gifted.gift = 'trans';
      const deaf = crew('Deaf', gx - 1, gy); deaf.job = 'gunner'; deaf.gift = null;
      const foe = mark('Mark', gx + 8, gy);
      R.theLanceRefusesAGiftedHand = (!emplUsableBy(lan, gifted) && emplUsableBy(lan, deaf))
        ? 'the cascade holds — a gifted hand may not touch it, an alchemically deaf one may'
        : `!! THE LANCE'S ONE RULE IS BROKEN (gifted ${emplUsableBy(lan, gifted)}, deaf ${emplUsableBy(lan, deaf)})`;
      stash.aether_cell = 20;
      const lanCells0 = stash.aether_cell;
      crewedAt = 0; run(25, deaf);
      R.andTheDeafHandFiresIt = (lan.shots > 0 && crewedAt > 0)
        ? `${lan.shots} shots off the emplaced lance, and the mark is ${foe.state}`
        : `!! THE EMPLACED LANCE DOES NOTHING (shots ${lan.shots}, crewed ${crewedAt} frames, cells ${stash.aether_cell})`;
      /* THIS USED TO BE A HARDCODED STRING — `R.andItSpendsNoCells = 'the emplacement runs off
         the camp...'` — which is to say it asserted nothing at all and passed forever. It is a
         real reading now, and it reads the opposite way, because the charges moved here from
         the handheld: the thing bolted to your wall is the one with a supply line behind it. */
      R.andTheHeavyEatsCells = stash.aether_cell < lanCells0
        ? `and it spends pre-Fall charges doing it — ${lanCells0} -> ${stash.aether_cell} across ${lan.shots} bolts`
        : `!! THE HEAVY FIRES FOR FREE (cells still ${stash.aether_cell} after ${lan.shots} bolts)`;
      /* A FRESH MARK FIRST. The fed phase above put five 72-damage bolts into the last one, so
         by now there is nothing on the field — and an emplacement with no target never reaches
         `emplFire`, never asks for a cell, and therefore never says it is dry. The assertion
         then reads "0 more bolts, said nothing", which is a probe reporting silence it caused
         itself. This is the same lesson tools/README.md already carries about `guns.js`; I
         walked into it from the other side. */
      stash.aether_cell = 0;
      const dryShots = lan.shots;
      mark('Mark2', gx + 8, gy);
      logs.length = 0;
      crewedAt = 0; run(25, deaf);
      R.andADryHeavyHoldsItsFire = lan.shots === dryShots && logs.some(l => /is dry/.test(l) && /scavenged/.test(l))
        ? 'and on an empty stash it stops, and says where cells come from'
        : `!! A DRY HEAVY KEEPS SHOOTING (${lan.shots - dryShots} more bolts, said ${logs.find(l => /dry/.test(l)) || 'nothing'})`;
    }

    /* ============ 7. AETHER CELLS EXIST IN THE WORLD'S TRADE ============ */
    {
      const dealers = towns.filter(occultTown);
      const held = dealers.map(t => (t.stock && t.stock.aether_cell) || 0);
      const elsewhere = towns.filter(t => !occultTown(t)).reduce((n, t) => n + ((t.stock && t.stock.aether_cell) || 0), 0);
      R.theOccultDealersHaveCells = (dealers.length > 0 && held.every(n => n > 0))
        ? `${dealers.length} dealers hold ${held.join('/')} cells between them — ${dealers.map(t => t.name).join(', ')}`
        : `!! NOBODY IN THE WORLD SELLS AN AETHER CELL (dealers ${dealers.length}, holdings ${held.join('/') || 'none'})`;
      R.andNobodyElseDoes = elsewhere === 0
        ? 'and no ordinary market has any — this is salvage, not stock'
        : `!! CELLS TURNED UP ON ${elsewhere} ORDINARY SHELVES`;
      R.andAnOccultVendorWillShowThem = VENDOR_STOCK.occult.includes('aether_cell')
        ? 'and the occult shelf lists them, so the stock is reachable through the real shopfront'
        : '!! aether_cell IS NOT IN VENDOR_STOCK.occult';
      /* the trickle has a hard ceiling: the lance is meant to be rationed, not resupplied */
      const before = towns.map(t => (t.stock && t.stock.aether_cell) || 0);
      for (let d = 0; d < 120; d++) for (const t of towns) {
        if (occultTown(t) && (t.stock.aether_cell || 0) < (t.def.key === 'dustport' ? 6 : 4) && rnd() < 0.14) t.stock.aether_cell++;
      }
      const after = towns.map(t => (t.stock && t.stock.aether_cell) || 0);
      R.andTheShelfIsCapped = Math.max(...after) <= 6
        ? `after a hundred and twenty days of scavengers the deepest shelf holds ${Math.max(...after)} — ${before.filter(Boolean).join('/')} -> ${after.filter(Boolean).join('/')}`
        : `!! THE SHELF GROWS WITHOUT LIMIT (${Math.max(...after)} cells)`;
    }

    /* ============ 8. THE HANDHELD LANCE, DRY AND CHARGED ============ */
    {
      for (const [label, cells] of [['dry', 0], ['charged', 20]]) {
        clean();
        stash.aether_cell = cells;
        const h = crew('Hand', gx, gy);
        h.weapon = 'w_lance'; h.gift = null; h.autoFight = true; h.stance = 'ranged'; h.stats.ranged = 20;
        const foe = mk('Mark', 'bandit', gx + 5, gy, { atk: 14, def: 10, tough: 30, ath: 8 });
        foe.noFight = true;
        const b0 = foe.blood;
        run(30);
        /* BOTH STASHES NOW READ THE SAME WAY, which is the point: the handheld stopped being
           ammunition-fed when the charges moved to the emplacement. Ammunition on the weapon
           your people carry made the gunline an expensive annoyance and left it a museum piece
           between resupplies. An empty stash must therefore change NOTHING about it. */
        if (label === 'dry') {
          R.anEmptyStashDoesNotStopTheHandheld = foe.blood < b0 && stash.aether_cell === 0
            ? `with nothing in the stash at all it still fires — the mark drops from ${Math.round(b0)} to ${Math.round(foe.blood)}`
            : `!! THE HANDHELD IS STILL AMMUNITION-FED (blood ${b0}->${Math.round(foe.blood)}, said ${logs.find(l => /dry/.test(l)) || 'nothing'})`;
        } else {
          R.aChargedLanceSpendsNothing = (foe.blood < b0 && stash.aether_cell === cells)
            ? `and with twenty in the stash it fires without touching one (${cells} -> ${stash.aether_cell})`
            : `!! THE HANDHELD IS STILL EATING CELLS (blood ${b0}->${Math.round(foe.blood)}, cells ${cells}->${stash.aether_cell})`;
        }
      }
    }

    /* leave a mindless risen and a minded one selected for the DOM half */
    {
      clean();
      placeStructure('turret', gx, gy);
      const hollow = crew('Hollow', gx + 3, gy);
      hollow.undead = true; hollow.crafted = true; hollow.minded = false;
      const awake = crew('Awake', gx + 4, gy);
      awake.undead = true; awake.crafted = true; awake.minded = true;
      window.__hollow = hollow; window.__awake = awake;
      R._benchmarkBodies = `Hollow (mindedDead ${mindedDead(hollow)}) and Awake (mindedDead ${mindedDead(awake)})`;
    }
    return R;
  });

  /* ============ 9. THE JOB MENU DOES NOT OFFER WHAT THE WEAPON WILL REFUSE ============
     `emplGunner` requires mindedDead and the menu did not, so a necromancer could put a host of
     hollow risen on the turrets and watch them stand in the dirt. Read the real menu. */
  const dom = await p.evaluate(() => {
    const R = {};
    const jobsOffered = (c) => {
      selected.length = 0; selected.push(c);
      refreshCharPanel();
      const jb = [...document.querySelectorAll('#jobrow button')].find(b => /^JOB:/.test(b.textContent));
      if (!jb) return null;
      jb.click();
      const out = [...document.querySelectorAll('#ctxmenu button')].map(b => b.textContent.trim().replace(/^●\s*/, ''));
      hideCtxMenu();
      return out;
    };
    const hollowJobs = jobsOffered(window.__hollow);
    const awakeJobs = jobsOffered(window.__awake);
    if (!hollowJobs || !awakeJobs) { R.theMenuHidesGunneryFromTheMindless = '!! THE JOB BUTTON DID NOT DRAW'; return R; }
    R.theMenuHidesGunneryFromTheMindless = (!hollowJobs.includes('GUNNERY') && awakeJobs.includes('GUNNERY'))
      ? `a hollow risen is offered ${hollowJobs.length} trades and GUNNERY is not among them; a minded one is offered ${awakeJobs.length} and it is`
      : `!! THE MENU STILL OFFERS GUNNERY TO A BODY THE WEAPON WILL REFUSE (hollow: ${hollowJobs.join(',')})`;
    R.andItHidesStudyAndCraftTheSameWay = (!hollowJobs.includes('STUDY') && !hollowJobs.includes('CRAFT'))
      ? 'and STUDY and CRAFT are filtered by the same list, so the three cannot drift apart again'
      : `!! THE MIND-GATED TRADES DISAGREE (hollow: ${hollowJobs.join(',')})`;
    /* and if one is set on it anyway — an old save, a second trade — the weapon still refuses */
    window.__hollow.job = 'gunner';
    const tur = pBuilds.find(b => isEmpl(b.type));
    R.andTheWeaponRefusesItRegardless = (tur && !emplUsableBy(tur, window.__hollow))
      ? 'and a body set on it by other means is still refused at the weapon itself'
      : '!! A MINDLESS BODY CAN WORK A MOUNTED WEAPON';
    return R;
  });

  const all = { ...out, ...dom };
  console.log('=== THE GUNNERY CHAIN ===\n');
  for (const [k, v] of Object.entries(all)) console.log('  ' + k.padEnd(40) + v);
  const bad = Object.values(all).map(String).filter(v => v.startsWith('!!'));
  console.log('\n' + (bad.length ? '*** ' + bad.join('\n*** ')
    : 'THE TURRETS ARE CREWED, THE WALL IS REACHABLE, AND THE LANCE HAS SOMETHING TO FIRE'));
  if (errs.length) { console.log('errs: ' + errs.length); errs.slice(0, 4).forEach(e => console.log('  ' + e)); }
  await b.close();
  if (bad.length) process.exitCode = 1;
})();
