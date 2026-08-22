#!/usr/bin/env node
/* HOW FAR YOU SEE, WHAT YOU CAN REACH, AND WHAT YOU CAN BUILD A BODY OUT OF.
 *
 * Three items that all come down to a number being wrong somewhere nobody looked:
 *
 *   1. "A watchtower... allows for much further vision, like mountains but even more
 *      expanded." The building already existed, with a deck and a stair. It stamped the same
 *      11 tiles of sight every other building does, and `heightAt` reads the TERRAIN — so a
 *      lookout standing on the deck saw exactly what they saw standing in the mud beside it.
 *   2. "The sundered sites sometimes hide the actual loot chests within the giant head/bone
 *      texture." The cache was placed at the site's exact centre, which is also where all
 *      three monuments are centred.
 *   3. "For the shaping sliders — those should have a set ceiling independent of caster skill.
 *      A lich is capable of creating godly undead with almost maxed shaping." The ceiling was
 *      `shapeBudget(caster) + 4`, and six axes at five apiece is thirty.
 *
 *   node tools/reach.js [game.html]
 */
const { chromium } = require('playwright');
const path = require('path');
const gamePath = (a) => path.resolve(a ? (path.isAbsolute(a) ? a : path.join(__dirname, a)) : path.join(__dirname, 'game.html'));

(async () => {
  const b = await chromium.launch({
    executablePath: process.env.DUSTWARD_CHROME || undefined,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'],
  });
  const p = await b.newPage({ viewport: { width: 900, height: 600 } });
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message.slice(0, 200)));
  await p.goto('file://' + gamePath(process.argv[2]), { waitUntil: 'load' });
  await p.waitForTimeout(3000);
  /* START AND STOP IN THE SAME BREATH. A click followed by a wait lets the world run for
     however many frames the machine manages, which is not a fixed number and drops when a
     sixty-harness suite is loading the box — so every body is somewhere slightly different
     by the time this probe stages anything, and the numbers below inherit it. Measured on
     one unchanged build before this was applied here: flank.js gave 1.67 / 1.67 / 1.09 over
     three runs, and guns.js split three-to-two on an md5 that had not moved. Pausing inside
     the same evaluate leaves no frames at all between the two. Every file below sets
     `paused` for itself anyway; this only removes the window before its first statement. */
  await p.evaluate(() => { document.getElementById('btn-start').click(); paused = true; });
  await p.waitForTimeout(3000);

  const out = await p.evaluate(() => {
    const R = {};
    paused = true;

    /* flat open ground, far from towns: a hillside would add its own sight bonus and the
       whole question here is what the BUILDING is worth */
    let gx = 0, gy = 0;
    outer:
    for (let y = 70; y < H - 70; y += 4) for (let x = 70; x < W - 70; x += 4) {
      if (isBlocked(x + 0.5, y + 0.5)) continue;
      if (towns.some(t => dist(t.x, t.y, x, y) < 80)) continue;
      let ok = true, h0 = heightAt(x, y);
      for (let j = -6; j <= 6 && ok; j++) for (let i = -6; i <= 6 && ok; i++) {
        if (isBlocked(x + i + 0.5, y + j + 0.5)) ok = false;
        else if (Math.abs(heightAt(x + i, y + j) - h0) > 0.35) ok = false;
      }
      if (ok) { gx = x; gy = y; break outer; }
    }
    R.ground = gx ? `staged on flat open waste at ${gx},${gy}` : '!! NO FLAT OPEN GROUND';

    /* ============ 1. THE WATCHTOWER ============ */
    const seenTiles = () => { let n = 0; for (let i = 0; i < vis.length; i++) if (vis[i] === 2) n++; return n; };
    const wipe = () => {
      for (let i = chars.length - 1; i >= 0; i--) if (chars[i].__probe) chars.splice(i, 1);
      for (let i = pBuilds.length - 1; i >= 0; i--) if (pBuilds[i].__probe) pBuilds.splice(i, 1);
    };
    /* noon, no storm — sight is a function of both and neither is under test */
    hour = 13; weather.storm = 0;

    const shed = { type: 'shack', x: gx, y: gy, w: 2, h: 2, floor: 0, hp: 90, maxHp: 90, progress: 1, __probe: true };
    pBuilds.push(shed);
    computeVision();
    const withShed = seenTiles();
    wipe();

    const twr = { type: 'tower', x: gx, y: gy, w: 3, h: 3, floor: 0, hp: 200, maxHp: 200, progress: 1, __probe: true };
    pBuilds.push(twr);
    computeVision();
    const withTower = seenTiles();
    R.aTowerSeesFurtherThanAShed = withTower > withShed * 1.5
      ? `a watchtower opens ${withTower - withShed} more tiles than a shack on the same ground`
      : `!! A WATCHTOWER SEES NO FURTHER THAN A SHACK (${withShed} vs ${withTower} tiles)`;

    /* ---------- AND THE QUESTION A PLAYER ACTUALLY ASKS ----------
       "The watchtower barely increases sight range. It's hardly worth building." The
       tower-against-a-shack number above is real and it passed, and it is not what anybody
       wants to know. Nobody builds a tower INSTEAD of a shack on empty ground — they build it
       where their people already are, and the thing they feel is what it shows them that they
       could not already see. So measure the MARGINAL gain: a lookout standing on the ground,
       and then the same lookout with a tower over them. */
    wipe(); computeVision();
    const look = makeChar('Lookout', 'player', gx + 1.5, gy + 1.5, { atk: 4, def: 4, tough: 8, ath: 6 });
    look.__probe = true; chars.push(look);
    look.floor = 0; computeVision();
    const bare = seenTiles();

    const twr2 = { type: 'tower', x: gx, y: gy, w: 3, h: 3, floor: 0, hp: 200, maxHp: 200, progress: 1, __probe: true };
    pBuilds.push(twr2);
    computeVision();
    const empty = seenTiles();
    look.floor = 1; computeVision();
    const manned = seenTiles();

    R.sight = `a lookout on open ground sees ${bare} tiles · with an empty tower ${empty} · standing on its deck ${manned}`;
    /* An empty tower over your own camp adds a thin ring and always did; that is not a defect,
       it is what an empty tower is. It must still add something, or the building does nothing
       at all when nobody is up it. */
    R.anEmptyTowerStillWatchesItsGround = empty > bare
      ? `an empty tower over your own people is worth ${empty - bare} tiles they did not have`
      : `!! AN EMPTY TOWER SHOWS YOU NOTHING NEW (${bare} vs ${empty})`;
    /* And the build has to be worth making. A mountain shoulder — the best view in the game
       that costs nothing but a climb — is 48 tiles; a tower with somebody in it has to beat
       what its own lookout sees standing in the mud by a margin you can see on the map, not
       by a four-tile ring. Half again as much ground is the bar. */
    R.andAMannedOneIsWorthTheStone = manned > bare * 1.5
      ? `and putting somebody on the deck is worth ${manned - bare} more — ${(manned / bare).toFixed(2)}x the ground they had`
      : `!! A MANNED WATCHTOWER IS BARELY WORTH BUILDING (${bare} on the ground, ${manned} on the deck, ${(manned / bare).toFixed(2)}x)`;
    /* the lookout is what makes the difference, not the masonry */
    R.andItIsTheLookoutThatDoesIt = manned > empty
      ? `and it is the body up there that does it — ${manned - empty} tiles over the same tower standing empty`
      : `!! A LOOKOUT ON THE DECK ADDS NOTHING OVER AN EMPTY TOWER (${empty} vs ${manned})`;
    wipe();
    computeVision();

    /* ============ 2. THE SUNDERED CACHES ============ */
    /* The monuments are centred on the site and are large: the skull is a 13x11 dome and its
       jaw reaches z 10. A chest inside that is a chest you cannot see or tell apart from one
       you already opened. Measured against the geometry's own reach, not a guessed number. */
    const BONE_REACH = 10;
    const buried = [];
    for (const s of corpseSites) {
      const c = chests.filter(ch => dist(ch.x, ch.y, s.x, s.y) < s.r)
        .sort((a, b2) => dist(a.x, a.y, s.x, s.y) - dist(b2.x, b2.y, s.x, s.y))[0];
      if (!c) { buried.push(`site ${s.id}: no cache at all`); continue; }
      const d = dist(c.x, c.y, s.x, s.y);
      if (d < BONE_REACH) buried.push(`site ${s.id} at ${d.toFixed(1)}`);
    }
    R.everySiteHasACache = corpseSites.length > 0
      ? `${corpseSites.length} sundered sites in the world`
      : '!! NO SUNDERED SITES TO CHECK';
    R.cachesAreNotInsideTheBones = buried.length === 0
      ? `every cache stands clear of the monument (all beyond ${BONE_REACH} tiles of centre)`
      : `!! CACHES BURIED IN THE GEOMETRY: ${buried.join(', ')}`;
    /* and outside is no good if it is inside a rock instead */
    const unreachable = corpseSites.map(s => chests.filter(ch => dist(ch.x, ch.y, s.x, s.y) < s.r + 6)
      .sort((a, b2) => dist(a.x, a.y, s.x, s.y) - dist(b2.x, b2.y, s.x, s.y))[0])
      .filter(c => c && isBlocked(c.x, c.y));
    R.cachesStandOnOpenGround = unreachable.length === 0
      ? 'and every one of them is on ground a body can walk onto'
      : `!! ${unreachable.length} CACHES ARE INSIDE BLOCKED TILES`;
    /* still THEIRS, though — a cache pushed out of the skull and into the next county is a
       different bug */
    const strayed = corpseSites.filter(s => {
      const c = chests.filter(ch => dist(ch.x, ch.y, s.x, s.y) < s.r + 6)
        .sort((a, b2) => dist(a.x, a.y, s.x, s.y) - dist(b2.x, b2.y, s.x, s.y))[0];
      return !c || dist(c.x, c.y, s.x, s.y) > s.r + 4;
    });
    R.cachesStillBelongToTheSite = strayed.length === 0
      ? 'and still close enough to read as part of the site'
      : `!! ${strayed.length} CACHES WANDERED OFF THEIR SITE`;

    /* ============ 3. THE SHAPING CEILING ============ */
    const axes = SHAPE_AXES.length, maxAll = axes * SHAPE_MAX;
    const novice = makeChar('Novice', 'player', gx, gy, { atk: 4, def: 4, tough: 8, ath: 6, magic: 6 });
    const lich = makeChar('Archlich', 'player', gx, gy, { atk: 4, def: 4, tough: 8, ath: 6, magic: 150 });
    for (const c of [novice, lich]) { c.gift = 'dark'; c.__probe = true; chars.push(c); }
    lich.lich = true; lich.undead = true;
    research.done.necromancy = true; research.done.ossuary_rites = true;

    const cn = shapeCeiling(novice), cl = shapeCeiling(lich);
    R.theCeilingIgnoresTheCaster = cn === cl
      ? `a novice and an archlich share one ceiling: ${cn} points across ${axes} axes`
      : `!! THE CEILING STILL SCALES WITH THE CASTER (novice ${cn}, lich ${cl})`;
    R.theCeilingForbidsAPerfectBody = cl < maxAll
      ? `and it is below ${maxAll} — every axis at ${SHAPE_MAX} is out of reach for anybody`
      : `!! A LICH CAN STILL MAX EVERY AXIS (ceiling ${cl}, all-maxed costs ${maxAll})`;
    /* the tradeoff has to BITE: pushing two axes to the top must cost real ground elsewhere */
    const left = cl - 2 * SHAPE_MAX;
    R.twoExtremesCostTheRest = left < (axes - 2) * 2
      ? `two axes at ${SHAPE_MAX} leaves ${left} points for the other ${axes - 2}, which is under neutral — a real trade`
      : `!! TWO EXTREMES STILL LEAVE ${left} POINTS FOR ${axes - 2} AXES — NOTHING IS GIVEN UP`;
    /* and the rite must actually enforce it, not just the panel */
    {
      const greedy = {};
      for (const ax of SHAPE_AXES) greedy[ax.k] = SHAPE_MAX;
      R.theRiteRefusesIt = shapeSpent(greedy) > shapeCeiling(lich)
        ? `and the rite itself measures the all-maxed shape at ${shapeSpent(greedy)} against ${cl}`
        : '!! THE ALL-MAXED SHAPE IS WITHIN THE CEILING THE RITE CHECKS';
    }
    /* skill still buys the thing it should: the same shape, for free */
    {
      const shape = {};
      for (const ax of SHAPE_AXES) shape[ax.k] = 2;
      shape[SHAPE_AXES[0].k] = SHAPE_MAX; shape[SHAPE_AXES[1].k] = SHAPE_MAX;
      const nCost = Object.values(shapeCost(shape, novice)).reduce((a, b2) => a + b2, 0);
      const lCost = Object.values(shapeCost(shape, lich)).reduce((a, b2) => a + b2, 0);
      R.skillStillBuysSomething = lCost < nCost
        ? `skill still pays: the same shape costs a novice ${nCost} materials and the lich ${lCost}`
        : `!! SKILL NOW BUYS NOTHING AT THE BENCH (novice ${nCost}, lich ${lCost})`;
    }

    wipe();
    computeVision();
    return R;
  });

  console.log('=== SIGHT, CACHES, AND THE SHAPING CEILING ===\n');
  for (const [k, v] of Object.entries(out)) console.log('  ' + k.padEnd(34) + v);
  const bad = Object.values(out).map(String).filter(v => v.startsWith('!!'));
  console.log('\n' + (bad.length ? '*** ' + bad.join('\n*** ')
    : 'THE TOWER SEES, THE CACHES ARE FINDABLE, AND NOBODY GETS A PERFECT BODY'));
  if (errs.length) { console.log('errs:', errs.length); errs.slice(0, 4).forEach(e => console.log('  ' + e)); }
  await b.close();
  if (bad.length) process.exitCode = 1;
})();
