#!/usr/bin/env node
/* THREE DEPTHS, AND THE BANDS THAT NEVER RAN.
 *
 *   "Let's start on the Warren bands. This can simply apply to the underground in general —
 *    three depths of progressively challenging terrain."
 *
 * The underworld was one storey. `stockRoom` has drawn from three tables since the warrens were
 * written and has never once reached the first or the third, and there were THREE faults stacked
 * on those six lines, each of which hid the next:
 *
 *   · `cv.menace` was assigned AFTER `placeCave` returned, and `placeCave` is what runs the
 *     stocking. Every chamber in the world was filled off a menace of `undefined` — the 0.5
 *     default, the middle table. 447 gaunts under the world and not one bandit, ever.
 *   · and the scalar itself was `near / 190`, the distance to the nearest way out, which came
 *     out between 0.01 and 0.05 for all twenty-eight warrens in the sampled world because there
 *     are eighty-two shafts and one is always close. Fixing the ordering ALONE would have moved
 *     every warren from the middle table to the shallow one and still never reached the deep.
 *   · and when the first two were fixed and the shallow branch finally ran, it produced NOTHING:
 *     it calls `makeChar` directly, which builds a body and does not put it in `chars`. Twenty-
 *     four warrens stocked a hundred and one chambers with bandits that were named, armed and
 *     given a torch, and never added to the world. No error. Every count unchanged.
 *
 * So the claims below do not ask whether a table exists. Every one of them counts BODIES in the
 * world, per storey, and the file's centre of gravity is section 5.
 *
 * Anything starting '!!' fails the build.
 *
 *   node tools/depths.js [game.html]
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
  await p.goto('file://' + gamePath(process.argv[2]), { waitUntil: 'load' });
  await p.waitForTimeout(3000);
  await p.evaluate(() => document.getElementById('btn-start').click());
  await p.waitForTimeout(3500);
  const R = {};
  const NOTHING = '!! NOTHING TO MEASURE — this build has one storey under the world';

  /* ---- 1. THERE ARE THREE STOREYS, AND EACH IS THINNER THAN THE ONE ABOVE ----
     Not "the constant says three": three networks with halls in them and open ground under
     them. The thinning is the design — three copies of the same map would be three times the
     walking and none of the descent. */
  const shape = await p.evaluate(() => {
    if (typeof DEPTHS === 'undefined' || DEPTHS.length < 2) return null;
    return {
      depths: DEPTHS.slice(),
      halls: DEPTHS.map(f => undercroft.halls.filter(h => h.f === f).length),
      tiles: DEPTHS.map((f, i) => undercroft.deep[i] || 0),
      y: DEPTHS.map(f => floorY(f)),
      d01: DEPTHS.map(f => depth01(f)),
    };
  });
  R.threeStoreysUnderTheWorld = !shape ? NOTHING
    : (shape.depths.length === 3 && shape.halls.every(n => n > 0) && shape.tiles.every(n => n > 0))
    ? `${shape.depths.join(', ')} — ${shape.halls.join(' / ')} halls on ${shape.tiles.map(n => (n/1000).toFixed(0)+'k').join(' / ')} tiles, at ${shape.y.join(' / ')} units down`
    : `!! THE UNDERWORLD IS NOT THREE STOREYS (${JSON.stringify(shape)})`;
  R.andEachIsThinnerThanTheOne = !shape ? NOTHING
    : (shape.halls[0] > shape.halls[1] && shape.halls[1] > shape.halls[2] &&
       shape.tiles[0] > shape.tiles[1] && shape.tiles[1] > shape.tiles[2])
    ? `each storey a smaller net than the one above — halls ${shape.halls.join(' > ')}, tiles ${shape.tiles.map(n=>(n/1000).toFixed(0)+'k').join(' > ')}, so a wrong turn on the Sump costs what it should`
    : `!! A DEEPER STOREY IS NOT THINNER (halls ${shape.halls}, tiles ${shape.tiles})`;
  /* and the storeys are a real drop apart rather than the 3.4-unit crawlspace `UNDER_DROP`
     exists to prevent — the argument that produced that constant applies to -2 and -3 too */
  R.andEachIsARealDropBelowIt = !shape ? NOTHING
    : (shape.y[0] - shape.y[1] >= 10 && shape.y[1] - shape.y[2] >= 10 && shape.y[0] === -22)
    ? `${Math.abs(shape.y[0]-shape.y[1])} units of rock between one depth and the next, and the Undercroft has not moved (${shape.y[0]})`
    : `!! THE DEEPER STOREYS ARE A CRAWLSPACE, OR -1 MOVED (${shape.y})`;

  /* ---- 2. AND YOU CAN WALK FROM THE SKY TO THE BOTTOM ----
     THE CLAIM THAT MAKES THE REST WORTH ANYTHING. A storey nothing can reach is a storey that
     does not exist, and the first cut of the descent placement shipped exactly that: two ways
     down to the Deepworks in the whole world and none at all to the Sump, because it looked for
     a landing within five tiles of a hall and the two lattices only overlap on about seven per
     cent of their tiles. Flood each storey from a stair that ARRIVES on it, and require the next
     stair down to be standing on ground the flood actually reached. */
  const walk = await p.evaluate(() => {
    if (typeof DEPTHS === 'undefined') return null;
    const flood = (f, sx, sy) => {
      const seen = new Set(); const q = [[Math.round(sx), Math.round(sy)]];
      seen.add(Math.round(sy) * W + Math.round(sx));
      while (q.length) {
        const [x, y] = q.pop();
        for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
          const nx = x + dx, ny = y + dy, id = ny * W + nx;
          if (nx < 2 || ny < 2 || nx >= W-2 || ny >= H-2) continue;
          if (seen.has(id) || isBlocked(nx, ny, f)) continue;
          seen.add(id); q.push([nx, ny]);
        }
        if (seen.size > 600000) break;
      }
      return seen;
    };
    const out = [];
    const top = stairs.find(s => s.from === 0 && s.to === DEPTHS[0]);
    if (!top) return { noWayIn: true };
    let reach = flood(DEPTHS[0], top.x, top.y);
    for (let i = 0; i < DEPTHS.length; i++) {
      const f = DEPTHS[i];
      const halls = undercroft.halls.filter(h => h.f === f);
      out.push({ f, halls: halls.length,
                 reached: halls.filter(h => reach.has(Math.round(h.y) * W + Math.round(h.x))).length });
      if (i + 1 >= DEPTHS.length) break;
      const dn = DEPTHS[i + 1];
      const ways = stairs.filter(s => s.from === f && s.to === dn);
      const usable = ways.filter(s => reach.has(s.y * W + s.x));
      out[out.length - 1].waysDown = ways.length;
      out[out.length - 1].waysDownYouCanGetTo = usable.length;
      if (!usable.length) { out.push({ f: dn, deadEnd: true }); break; }
      reach = flood(dn, usable[0].x, usable[0].y);
    }
    return { out, surfaceShafts: stairs.filter(s => s.from === 0).length };
  });
  const allReached = walk && walk.out && walk.out.every(o => !o.deadEnd && o.halls === o.reached);
  R.andYouCanWalkFromSkyToSump = !walk ? NOTHING
    : allReached
    ? `every hall on every storey reachable from a surface shaft — ${walk.out.map(o => `${o.f}: ${o.reached}/${o.halls}`).join(', ')}`
    : `!! A STOREY CANNOT BE REACHED, OR A HALL ON IT CANNOT (${JSON.stringify(walk)})`;
  /* and the ways down thin out with the ways in: eighty-odd from the sky, a dozen or so to the
     Deepworks, a handful to the Sump. That gradient is most of what makes the bottom feel like
     the bottom rather than another corridor. */
  const ways = walk && walk.out ? walk.out.filter(o => o.waysDown !== undefined).map(o => o.waysDown) : [];
  R.andTheWayDownGetsRarer = !walk ? NOTHING
    : (walk.surfaceShafts > ways[0] && ways[0] > ways[1] && ways[1] > 0)
    ? `${walk.surfaceShafts} ways into the ground, ${ways[0]} on to the Deepworks, ${ways[1]} to the Sump — you have to find the next one`
    : `!! THE DESCENTS DO NOT THIN OUT, OR ONE STOREY HAS NONE (surface ${walk.surfaceShafts}, then ${ways})`;

  /* ---- 3. NOTHING IS CUT ON THE WRONG STOREY ----
     The quiet catastrophe this change could produce and nobody would see for a year: a warren
     carved at -1 around a hall whose coordinates came off the Sump's lattice. Walkable, drawn as
     stone, connected to nothing — the same leak `warrens.js` and `under.js` measure from two
     sides, reintroduced from a third. Every wall, room and door of a cave must be on the cave's
     own floor, and the cave's floor must be a floor its hall is actually on. */
  const strata = await p.evaluate(() => {
    if (typeof DEPTHS === 'undefined') return null;
    let badWall = 0, badDoor = 0, badRoom = 0, noFloor = 0;
    for (const cv of caves) {
      const f = cv.f;
      if (f === undefined || !DEPTHS.includes(f)) { noFloor++; continue; }
      for (const w of cv.walls) if (w.f !== f) badWall++;
      for (const d of cv.doors) if ((d.f || 0) !== f) badDoor++;
      for (const rm of cv.rooms) if (rm.f !== f) badRoom++;
    }
    /* and every body a warren stocked stands on its own warren's floor */
    let badBody = 0;
    const byId = new Map(caves.map(cv => [cv.id, cv]));
    for (const c of chars) {
      if (!c.caveId) continue;
      const cv = byId.get(c.caveId);
      if (cv && c.floor !== cv.f) badBody++;
    }
    return { caves: caves.length, badWall, badDoor, badRoom, noFloor, badBody,
             byFloor: DEPTHS.map(f => caves.filter(cv => cv.f === f).length) };
  });
  R.nothingIsCutOnTheWrongStorey = !strata ? NOTHING
    : (!strata.badWall && !strata.badDoor && !strata.badRoom && !strata.noFloor && !strata.badBody)
    ? `${strata.caves} warrens spread ${strata.byFloor.join(' / ')} across the three storeys, and every wall, door, room and body of each is on its own`
    : `!! SOMETHING WAS CUT ON A FLOOR IT DOES NOT BELONG TO (${JSON.stringify(strata)})`;

  /* ---- 4. THE PALEFRONDS AND THE ALTARS KNOW WHICH STOREY THEY ARE ON ----
     The renderer draws camera-local decor by walking these two lists, and both were drawn at
     `floorY(UNDER)` unconditionally. Unfixed, every frond in the world would stand at -22 and
     the Sump would be bare rock while the Undercroft grew three storeys of fronds in one place. */
  const decor = await p.evaluate(() => {
    if (typeof DEPTHS === 'undefined') return null;
    return {
      flora: DEPTHS.map(f => undercroft.flora.filter(F => (F.f === undefined ? -1 : F.f) === f).length),
      altars: DEPTHS.map(f => deepAltars.filter(a => (a.floor === undefined ? -1 : a.floor) === f).length),
      floraNoFloor: undercroft.flora.filter(F => F.f === undefined).length,
    };
  });
  R.theDecorIsOnItsOwnStorey = !decor ? NOTHING
    : (decor.flora.every(n => n > 0) && decor.altars.every(n => n > 0) && !decor.floraNoFloor)
    ? `fronds ${decor.flora.join(' / ')} and vigil stones ${decor.altars.join(' / ')}, each on the storey it grew on`
    : `!! DECOR IS STACKED ON ONE FLOOR (${JSON.stringify(decor)})`;

  /* ---- 5. THE THREE BANDS, AND THIS IS WHAT THE FILE IS FOR ----
     Counted as BODIES IN `chars`, per storey, because the last fault in this branch was a
     constructor that built a perfectly good bandit and never added it to the world. A claim
     that read the table, or the branch, or even the returned object would have passed on a
     build with a hundred and one empty rooms in it.
     Shallow is PEOPLE and deep is Larder-Kin, and each has to be absent from the other end —
     the positive alone would pass on a build that put bandits on all three floors. */
  const bands = await p.evaluate(() => {
    if (typeof DEPTHS === 'undefined') return null;
    const byId = new Map(caves.map(cv => [cv.id, cv]));
    const inWarren = chars.filter(c => c.caveId && byId.has(c.caveId) && c.state !== 'dead');
    const at = (f) => inWarren.filter(c => byId.get(c.caveId).f === f);
    const tally = (arr) => arr.reduce((a, c) => { const k = c.gauntKind || c.faction; a[k] = (a[k]||0)+1; return a; }, {});
    return {
      shallow: tally(at(DEPTHS[0])), mid: tally(at(DEPTHS[1])), deep: tally(at(DEPTHS[2])),
      torchesShallow: at(DEPTHS[0]).filter(c => c.weapon === 'w_torch').length,
      shallowN: at(DEPTHS[0]).length, midN: at(DEPTHS[1]).length, deepN: at(DEPTHS[2]).length,
    };
  });
  const nz = (o, k) => o[k] || 0;
  R.theThreeBandsFinallyRun = !bands ? NOTHING
    : (nz(bands.shallow, 'bandit') > 20 && nz(bands.deep, 'larder') > 0 &&
       !nz(bands.deep, 'bandit') && !nz(bands.mid, 'bandit') && !nz(bands.shallow, 'larder'))
    ? `shallow ${nz(bands.shallow,'bandit')} bandits and no Larder-Kin, deep ${nz(bands.deep,'larder')} Larder-Kin and no bandits, middle ${JSON.stringify(bands.mid)}`
    : `!! THE BANDS ARE STILL COLLAPSED (shallow ${JSON.stringify(bands.shallow)} / mid ${JSON.stringify(bands.mid)} / deep ${JSON.stringify(bands.deep)})`;
  /* and the shallow band's own detail, which was written correct and unreached for a year: about
     one bandit in three is holding a torch instead of a weapon, which is what makes a room of
     them a fight with a shape rather than a room of blind men */
  R.andABanditBroughtALight = !bands ? NOTHING
    : (bands.torchesShallow > 0 && bands.torchesShallow < nz(bands.shallow, 'bandit'))
    ? `${bands.torchesShallow} of ${nz(bands.shallow,'bandit')} shallow bandits are carrying the light rather than a weapon — kill that one and the rest are in your trouble`
    : `!! NOBODY DOWN THERE BROUGHT A FIRE (${bands.torchesShallow} of ${nz(bands.shallow,'bandit')})`;

  /* ---- 6. AND IT PAYS MORE THE FURTHER DOWN IT IS ----
     Measured as a MEAN over every hall chest on each storey, not as a spot check on one: the
     loot roll is random per chest and any single pair of chests can come out either way round. */
  const pays = await p.evaluate(() => {
    if (typeof DEPTHS === 'undefined') return null;
    const worth = (ch) => {
      const L = ch.loot || {}; let v = L.cats || 0;
      for (const k in (L.items || {})) v += (ITEMS[k] ? ITEMS[k].base : 40) * L.items[k];
      return v;
    };
    return DEPTHS.map(f => {
      const cs = chests.filter(c => (c.floor || 0) === f && !c.vault && c.loot);
      return { f, n: cs.length, mean: cs.length ? Math.round(cs.reduce((s, c) => s + worth(c), 0) / cs.length) : 0 };
    });
  });
  R.andItPaysMoreFurtherDown = !pays ? NOTHING
    : (pays.every(o => o.n > 0) && pays[0].mean < pays[1].mean && pays[1].mean < pays[2].mean)
    ? `a hall chest is worth ${pays.map(o => o.mean).join(' → ')} as you go down (${pays.map(o=>o.n).join('/')} chests), which is the answer to why anybody would`
    : `!! THE DEPTHS DO NOT PAY (${JSON.stringify(pays)})`;

  /* ---- 7. AND THE TOOTH IS AT THE BOTTOM ----
     "Should be held by a boss underground" was one sentence when underground was one storey.
     The item the doc gave a whole mechanic to belongs on the deepest floor there is. */
  const tooth = await p.evaluate(() => {
    if (typeof DEPTHS === 'undefined') return null;
    const holders = chars.filter(c => c.weapon === 'w_tooth');
    const deepest = DEPTHS[DEPTHS.length - 1];
    const vaultsBy = DEPTHS.map(f => caves.filter(cv => cv.vault && cv.f === f).length);
    /* and the four vault legendaries: the best of them should be on the deepest storey a vault
       reached, not merely the furthest from a town */
    const legendVaults = chests.filter(c => c.vault && c.loot && Object.keys(c.loot.items || {})
      .some(k => ITEMS[k] && ITEMS[k].legend)).map(c => c.floor);
    return { holders: holders.length, floors: holders.map(c => c.floor), deepest, vaultsBy, legendVaults,
             name: holders[0] ? holders[0].name : null };
  });
  R.theToothIsAtTheBottom = !tooth ? NOTHING
    : (tooth.holders === 1 && tooth.floors[0] === tooth.deepest)
    ? `${tooth.name} holds it, on ${tooth.deepest} — the deepest floor in the world, and there is exactly one of it`
    : (tooth.holders === 1 && tooth.vaultsBy[tooth.vaultsBy.length - 1] === 0)
    ? `!! THE TOOTH IS ON ${tooth.floors[0]}, NOT ${tooth.deepest} (${JSON.stringify(tooth)})`
    : `!! THE TOOTH IS NOT ON THE DEEPEST FLOOR (${JSON.stringify(tooth)})`;

  /* ---- 8. AND A SQUAD ORDERED DOWN ACTUALLY ARRIVES ----
     End to end, through the real order and the real sim. `useStairs` has walked multi-storey
     descents since the tower — `stairToward` hunts the next stair on the piece of floor you just
     stepped onto — so this asserts that the underworld's new shafts are ordinary stairs to it.
     The body is put on the first shaft rather than walked across a continent to find one; what
     is under test is the CHAIN of three descents, not the pathfinder. */
  const trip = await p.evaluate(() => {
    if (typeof DEPTHS === 'undefined') return null;
    const deepest = DEPTHS[DEPTHS.length - 1];
    const me = player().find(c => !c.undead && c.state === 'ok') || player()[0];
    if (!me) return null;
    const top = stairs.find(s => s.from === 0 && s.to === DEPTHS[0]);
    if (!top) return null;
    me.x = top.x + 0.5; me.y = top.y + 0.5; me.floor = 0;
    me.path = null; me.pathGoal = null; me.onStair = null; me.target = null;
    me.noFight = true;                       /* the trip is the subject, not a fight on the way */
    orderFloor(me, deepest, me.x, me.y);
    const saw = new Set([0]);
    for (let i = 0; i < 4000 && me.floor !== deepest; i++) { update(0.1); saw.add(me.floor || 0); }
    return { landed: me.floor, deepest, storeysSeen: [...saw].sort((a,b)=>b-a), want: me.wantFloor };
  });
  R.andASquadOrderedDownArrives = !trip ? NOTHING
    : (trip.landed === trip.deepest)
    ? `ordered to the bottom and got there, one order and three shafts — through ${trip.storeysSeen.join(' → ')}`
    : `!! THE ORDER DID NOT REACH THE BOTTOM (${JSON.stringify(trip)})`;

  /* ---- 9. AND THE STOREY SURVIVES A SAVE ----
     The floor a body is on is the one piece of this that lives in the save rather than being
     rebuilt by worldgen — the tiles all come back from the same seed, the bodies do not. */
  const saved = await p.evaluate(() => {
    if (typeof DEPTHS === 'undefined' || typeof snapshot !== 'function') return null;
    const before = DEPTHS.map(f => chars.filter(c => (c.floor || 0) === f && c.state !== 'dead').length);
    const blob = JSON.parse(JSON.stringify(snapshot()));
    restore(blob);
    const after = DEPTHS.map(f => chars.filter(c => (c.floor || 0) === f && c.state !== 'dead').length);
    /* and the rock: a warren's ring on a deep storey has to come back as rock, not as floor */
    const rock = DEPTHS.map(f => caves.filter(cv => cv.f === f)
      .reduce((n, cv) => n + cv.walls.filter(w => blocked.has(bkey(w.x, w.y, w.f))).length, 0));
    const walls = DEPTHS.map(f => caves.filter(cv => cv.f === f).reduce((n, cv) => n + cv.walls.length, 0));
    return { before, after, rock, walls };
  });
  R.andTheStoreySurvivesASave = !saved ? NOTHING
    : (saved.before.join() === saved.after.join() && saved.rock.every((n, i) => n === saved.walls[i]))
    ? `${saved.after.join(' / ')} bodies come back on the storeys they were on, and every warren wall on every storey is still rock`
    : `!! A SAVE MOVED SOMEBODY BETWEEN STOREYS, OR A DEEP WALL CAME BACK AS FLOOR (${JSON.stringify(saved)})`;

  /* ---- 10. AND THE BUCKET INDEX ANSWERS FOR THE STOREY YOU ARE ON ----
     `syncUndercroft` said `if(activeFloor !== UNDER) return;` and meant "the underground", which
     was the same sentence while there was one of them. Left alone, standing on the Sump would
     have drawn no floor plate, no rim and no fronds — a body suspended in blackness, which reads
     as a renderer that does not work rather than as one comparison being wrong.
     ASSERTED ON THE INDEX, NOT ON A MESH COUNT. `flushBoxBatch` merges the whole window into a
     couple of geometries, so counting meshes says the same number whether the floor plate is
     fourteen thousand tiles or one — it cannot tell the failure from the success. What the
     renderer actually walks is `undercroft.grid`, keyed with the depth folded in above the
     bucket row, so this asks the index the same question the renderer asks it: at a hall on
     storey f, hand back that storey's tiles and not another's. A fold that collided would show
     up here as one depth answering for a bucket that belongs to a different one. */
  const index = await p.evaluate(() => {
    if (typeof DEPTHS === 'undefined') return null;
    const B = undercroft.bucket, out = {};
    for (let i = 0; i < DEPTHS.length; i++) {
      const f = DEPTHS[i];
      const h = undercroft.halls.find(H => H.f === f);
      if (!h) { out[f] = { noHall: true }; continue; }
      const bx0 = Math.floor(h.x / B), by0 = Math.floor(h.y / B);
      let mine = 0, foreign = 0;
      for (let j = -2; j <= 2; j++) for (let k = -2; k <= 2; k++) {
        const key = (i * 16777216) + ((by0 + j) * 4096) + (bx0 + k);
        const a = undercroft.grid.get(key);
        if (!a) continue;
        for (const t of a) {
          const x = t % W, y = (t - x) / W;
          /* the tile the index handed back for THIS depth must be open on this depth */
          if (decks.has(bkey(x, y, f))) mine++; else foreign++;
        }
      }
      out[f] = { mine, foreign };
    }
    return out;
  });
  const idxOK = index && Object.values(index).every(o => o.mine > 200 && !o.foreign && !o.noHall);
  R.theIndexAnswersForThisStorey = !index ? NOTHING
    : idxOK
    ? `the bucket index hands back its own storey's ground at a hall on each — ${Object.entries(index).map(([f,o]) => f+': '+o.mine).join(', ')} tiles, none of them another floor's`
    : `!! THE DEPTH-FOLDED BUCKET KEY IS WRONG (${JSON.stringify(index)})`;

  /* ---- AND THE DEPTHS ARE STILL THERE WHEN YOU ARRIVE ----
     "all the underground fights resolve well before I ever go there. So I usually just find
      bloody aftermaths and that's it."
     It was not a fight. `spawnGaunt` stamps `nightborn` — "the dark made it; the dawn unmakes
     it" — and `gauntDawn` deletes every nightborn gaunt each morning. Seven other places in
     the file clear that flag for gaunts that are meant to STAY; the depths forgot, so the two
     floors stocked entirely with gaunt-kin evaporated before the first noon.
     MEASURED, one game day with nobody underground: 17 bodies died in the whole world and 412
     were DELETED — 88 off the Undercroft, 216 off the Deepworks, 108 off the Sump. The
     aftermath was never a battlefield; it was an empty room and the violet motes `gauntDawn`
     leaves behind.
     TWO CLAIMS, because the flag and the outcome are different failures. A resident that
     carries the flag is the bug; a floor that empties is the symptom, and it could arrive
     again by some other route. */
  const dawn = await p.evaluate(() => {
    if (typeof DEPTHS === 'undefined') return null;
    const resident = chars.filter(c => c.state !== 'dead' && (c.floor || 0) < 0 &&
                                       (c.caveDweller || c.undercroft) && c.faction === 'gaunt');
    const flagged = resident.filter(c => c.nightborn);
    const before = {};
    for (const c of chars) { if (c.state === 'dead' || c.faction === 'player') continue;
      const f = c.floor || 0; if (f < 0) before[f] = (before[f] || 0) + 1; }
    /* a whole game day, with nobody of yours below ground */
    const startDay = day;
    for (let i = 0, n = Math.round(24 * HOUR_SEC * 30); i < n; i++) update(1 / 30);
    const after = {};
    for (const c of chars) { if (c.state === 'dead' || c.faction === 'player') continue;
      const f = c.floor || 0; if (f < 0) after[f] = (after[f] || 0) + 1; }
    const kept = {};
    for (const f of Object.keys(before)) kept[f] = +(((after[f] || 0) / before[f])).toFixed(2);
    return { residents: resident.length, flagged: flagged.length, before, after, kept,
             days: day - startDay, worst: Math.min(...Object.values(kept)) };
  });
  R.theDeepIsNotCollectedAtDawn = !dawn ? NOTHING
    : dawn.residents < 50 ? '!! NOTHING TO MEASURE — barely anything lives down there to collect'
    : dawn.flagged === 0
    ? `all ${dawn.residents} gaunt-kin living in the warrens and halls are exempt from the dawn — 0 still carry the flag that deletes them`
    : `!! ${dawn.flagged} OF ${dawn.residents} DEPTH RESIDENTS WILL BE DELETED AT DAWN (${JSON.stringify(dawn.kept)})`;
  R.andTheFloorsAreStillPeopledTomorrow = !dawn ? NOTHING
    : (dawn.worst > 0.8)
    ? `a whole game day passes with nobody underground and every storey is still peopled — ${Object.entries(dawn.kept).map(([f, v]) => f + ' kept ' + Math.round(v * 100) + '%').join(', ')}, against 32% and 26% before the dawn exemption`
    : `!! A STOREY EMPTIED OVERNIGHT (${JSON.stringify(dawn)})`;

  /* ---- AND WHAT YOU RAISE DOWN HERE STAYS DOWN HERE ----
     "Raising an undead underground sends them to the surface instead of raising them on the
      same level that they were on."
     `castRaise` took the risen body's x and y off the corpse and never mentioned its FLOOR, and
     `makeChar` defaults that to 0 — so a body raised on the Sump stood up on the surface, at
     the right map coordinates and four storeys from the necromancer who called it. Driven on
     each depth in turn, because a fix that works on -1 and not on -3 is the shape this file
     has caught twice before. */
  const raised = await p.evaluate(() => {
    if (typeof DEPTHS === 'undefined' || typeof castRaise !== 'function') return null;
    const me = player().find(c => c.state === 'ok');
    if (!me) return null;
    const home = { x: me.x, y: me.y, f: me.floor || 0 };
    me.stats.magic = 60; me.att = me.att || {}; me.att.dark = 3;
    const out = [];
    for (const F of DEPTHS) {
      const h = undercroft.halls.find(H => H.f === F);
      if (!h) { out.push({ F, skip: 'no hall' }); continue; }
      me.x = h.x; me.y = h.y; me.floor = F; me.mana = 999; me.castCd = 0;
      /* a corpse of our own making, lying on that storey */
      const body = makeChar('Late ' + (-F), 'bandit', h.x + 1, h.y, { atk: 5, def: 5, tough: 5 });
      body.floor = F; chars.push(body);
      body.state = 'dead'; body.deadAt = day; corpses.push(body);
      const before = chars.length;
      castRaise(me, body);
      const r = chars.slice(before).find(c => c.undead) ||
                chars.filter(c => c.undead && c.master === me).slice(-1)[0];
      out.push({ F, raisedOn: r ? (r.floor || 0) : null, ok: !!r && (r.floor || 0) === F });
      /* put the world back */
      for (const c of [r, body]) { if (!c) continue; const i = chars.indexOf(c); if (i >= 0) chars.splice(i, 1); }
      const ci = corpses.indexOf(body); if (ci >= 0) corpses.splice(ci, 1);
    }
    me.x = home.x; me.y = home.y; me.floor = home.f;
    return out;
  });
  R.andWhatYouRaiseDownHereStaysDownHere = !raised ? NOTHING
    : raised.some(o => o.skip) ? '!! NOTHING TO MEASURE — a storey had no hall to stand in'
    : raised.every(o => o.ok)
    ? `a body raised on each storey stands up on the storey it died on — ${raised.map(o => o.F + '→' + o.raisedOn).join(', ')}`
    : `!! THE RISEN CAME UP ON THE WRONG FLOOR (${JSON.stringify(raised)})`;

  console.log('=== THREE DEPTHS ===\n');
  for (const [k, v] of Object.entries(R)) console.log('  ' + k.padEnd(30) + v);
  const bad = Object.values(R).map(String).filter(v => v.startsWith('!!'));
  console.log('\n' + (bad.length ? '*** ' + bad.join('\n*** ') : 'THE UNDERWORLD HAS A BOTTOM, AND IT IS WORSE DOWN THERE'));
  if (errs.length) { console.log('errs:', errs.length); errs.slice(0, 4).forEach(e => console.log('  ' + e)); }
  await b.close();
  if (bad.length) process.exitCode = 1;
})();
