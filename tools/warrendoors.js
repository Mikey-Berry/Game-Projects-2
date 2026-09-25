#!/usr/bin/env node
/* THE DOORWAYS OF THE UNDERCROFT, AND WHETHER YOU CAN SEE ONE OR GET THROUGH IT.
 *
 * "Quite a few hallways/rooms in the undercroft simply dead-end without a door to pass through.
 *  Also the doors in general are really hard to see visually, and tend to be extremely narrow.
 *  Sometimes the hallway leading to the door is also extremely narrow. I understand that the
 *  undercroft should not necessarily be WIDE, but it's like a pencil path that only one undead
 *  can pass through at a time."
 *
 * Four complaints, and the first two turned out to be one bug. `rebuildCaveWalls` keeps a ring
 * tile "where `blocked` says there is rock" — and a SHUT DOOR IS BLOCKED, because that is how a
 * shut door is implemented. So every closed door in the world was pushed onto the list the
 * renderer draws as rock, and the rock box is bigger in every dimension than the door slab
 * drawn inside it. Measured on the control: 176 of 176. Every door in the game was sealed
 * inside a block of stone the moment it shut, which is not a door that is hard to see, it is a
 * door that is not drawn at all — and a corridor ending at one is a corridor that dead-ends
 * into rock with no door to pass through, which is the sentence the report opens with.
 *
 * The other two are widths and are measured as widths: the doorway itself, and the narrowest
 * point of the corridor between the doorway and the hall it comes off.
 *
 *   node tools/warrendoors.js [game.html]
 */
const { chromium } = require('playwright');
const path = require('path');
const gamePath = (a) => path.resolve(a ? (path.isAbsolute(a) ? a : path.join(__dirname, a)) : path.join(__dirname, 'game.html'));

(async () => {
  const b = await chromium.launch({ executablePath: process.env.DUSTWARD_CHROME || undefined,
    args: ['--use-gl=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox','--no-sandbox'] });
  const errs = [];
  const p = await b.newPage({ viewport: { width: 1000, height: 700 } });
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message.slice(0, 200)));
  await p.goto('file://' + gamePath(process.argv[2]), { waitUntil: 'load', timeout: 90000 });
  await p.waitForFunction(() => !!document.getElementById('btn-start'), null, { timeout: 60000 });
  await p.evaluate(() => { document.getElementById('btn-start').click(); paused = true; });
  await p.waitForFunction(() => typeof chars !== 'undefined' && chars.length > 0, null, { timeout: 60000 });

  /* stand a body at a warren door with a torch, so the renderer builds that warren's geometry
     and the lintel claim has something to look at */
  await p.evaluate(() => {
    paused = true;
    /* THE NORMAL LIVES ON THE ROOM, NOT ON THE DOOR RECORD. `chamber` works out which edge it
       snapped the doorway to and writes `nx/ny` onto `rm.door`; the entry pushed onto the
       global `doors` list carries neither. A first cut of this file read `d.nx`, got undefined
       for every door in the world, and two claims quietly measured nothing at all. */
    const cv = caves.find(c => (c.f === undefined ? -1 : c.f) === -1 && c.doors && c.doors.length);
    const dr = cv && cv.doors.find(d => (d.f || 0) === -1);
    const rm0 = dr && (cv.rooms || []).find(r => r.id === dr.roomId);
    const nrm = (rm0 && rm0.door) ? rm0.door : { nx: 0, ny: 0 };
    window.__door = dr ? { x: dr.x, y: dr.y, f: dr.f || 0, nx: nrm.nx || 0, ny: nrm.ny || 0 } : null;
    if (!dr) return;
    const me = chars.find(c => c.faction === 'player');
    for (const c of chars.filter(c => c.faction === 'player')) { c.floor = -1; c.x = dr.x + (nrm.nx || 0) * 3 + 0.5; c.y = dr.y + (nrm.ny || 0) * 3 + 0.5; }
    me.weapon = 'w_torch'; me.torchH = 999; me.state = 'ok';
    camX = camSX = me.x; camY = camSY = me.y; camDist = camDistTarget = 14;
    camFollow = true; selected = [me]; activeFloor = -1;
    hour = 12; if (typeof updateSky === 'function') updateSky();
  });
  await p.waitForTimeout(5000);

  const R = await p.evaluate(() => {
    const O = {};
    const guard = (keys, fn) => {
      try { fn(); } catch (e) { for (const k of keys) if (O[k] === undefined) O[k] = '!! ' + String(e.message).slice(0, 130).toUpperCase(); }
    };
    const open = (x, y, f) => { const k = bkey(x, y, f); return decks.has(k) && !blocked.has(k); };
    /* a door's tiles: the one it was always keyed on, plus any leaves a wider doorway adds.
       Read off the door object rather than assumed, so this counts the same thing on a build
       that has no leaves at all. */
    const tilesOf = (d) => {
      const t = [{ x: d.x, y: d.y }];
      for (const q of (d.w || [])) if (q.x !== d.x || q.y !== d.y) t.push({ x: q.x, y: q.y });
      return t;
    };
    const under = doors.filter(d => (d.f || 0) < 0);

    /* THE PREMISE. Every claim below is about a door underground, and "no door is drawn as
       rock" is green on a world with no doors in it. */
    guard(['_premise', 'thereAreDoorsUnderTheWorldToJudge'], () => {
      O._premise = `${under.length} doors on the deep storeys, in ${caves.length} warrens`;
      O.thereAreDoorsUnderTheWorldToJudge = under.length >= 20
        ? `${under.length} shut doorways under the world, so there is something to walk up to`
        : `!! ONLY ${under.length} DOORS UNDERGROUND — NOTHING TO MEASURE`;
    });

    /* ---------- A SHUT DOOR IS NOT ROCK ----------
       `cv.walls` is the list the renderer draws as stone. `rebuildCaveWalls` derives it from
       `blocked`, and `setDoor(d, false)` blocks the doorway — that is how a shut door stops a
       body. The two facts are not the same fact, and the derivation cannot tell them apart. */
    guard(['aShutDoorIsNeverDrawnAsRock'], () => {
      const dk = new Set();
      for (const d of doors) for (const t of tilesOf(d)) dk.add(bkey(t.x, t.y, d.f || 0));
      let hit = 0, total = 0;
      for (const cv of caves) for (const w of cv.walls) { total++; if (dk.has(bkey(w.x, w.y, w.f))) hit++; }
      O.aShutDoorIsNeverDrawnAsRock = hit === 0
        ? `not one of the ${total} stones the renderer draws stands in a doorway`
        : `!! ${hit} DOORWAY TILES ARE IN THE ROCK LIST — THE RENDERER DRAWS STONE OVER ${hit} OF ${doors.length} DOORS`;
    });

    /* ---------- AND IT STILL SEALS ----------
       The negative half, and the one that matters: whatever is done to make a doorway visible
       or wide, every tile of it must still be impassable while it is shut, or a chamber is an
       alcove and the whole mechanic is decoration again. */
    guard(['andAShutDoorIsStillShutOnEveryTileOfIt'], () => {
      let leaks = 0, tiles = 0;
      for (const d of under) { if (d.open) continue; for (const t of tilesOf(d)) { tiles++; if (open(t.x, t.y, d.f || 0)) leaks++; } }
      O.andAShutDoorIsStillShutOnEveryTileOfIt = leaks === 0
        ? `all ${tiles} tiles of the shut doorways are impassable`
        : `!! ${leaks} OF ${tiles} SHUT DOORWAY TILES ARE WALKABLE`;
    });

    /* ---------- THE DOORWAY IS WIDE ENOUGH FOR TWO ----------
       "the doors... tend to be extremely narrow". A doorway is one tile, so a host of forty
       goes through it one at a time forever. Three is a doorway two can walk abreast. */
    guard(['_wide', 'aDoorwayTakesMoreThanOneBodyAtATime'], () => {
      const ws = under.map(d => tilesOf(d).length).sort((a, b2) => a - b2);
      const med = ws[Math.floor(ws.length / 2)];
      const ones = ws.filter(w => w < 2).length;
      O._wide = `doorway widths: min ${ws[0]}, median ${med}, max ${ws[ws.length - 1]} — ${ones} of ${ws.length} are one tile`;
      O.aDoorwayTakesMoreThanOneBodyAtATime = med >= 3
        ? `the median doorway is ${med} tiles across, so two can go through shoulder to shoulder`
        : `!! THE MEDIAN DOORWAY IS ${med} TILE(S) ACROSS — ${ones} OF ${ws.length} ARE SINGLE FILE`;
    });

    /* ---------- AND SO IS THE WAY TO IT ----------
       "Sometimes the hallway leading to the door is also extremely narrow... a pencil path that
       only one undead can pass through at a time."
       Measured where the complaint lives: step out of the doorway and walk the approach until
       it opens into something hall-sized, taking the narrowest cross-section on the way. The
       HALL is what the approach is measured against — the lattice bores itself five to six
       wide, so anything much under that is a bottleneck the player did not choose. */
    guard(['_approach', 'andTheWayUpToItIsNotAPencilPath'], () => {
      const HALLW = 5;
      const widthAt = (x, y, f, axis) => {      /* axis 0 = across x, 1 = across y */
        let w = 1;
        if (axis === 0) { for (let i = 1; i <= 8 && open(x + i, y, f); i++) w++; for (let i = 1; i <= 8 && open(x - i, y, f); i++) w++; }
        else { for (let i = 1; i <= 8 && open(x, y + i, f); i++) w++; for (let i = 1; i <= 8 && open(x, y - i, f); i++) w++; }
        return w;
      };
      const normals = new Map();
      for (const cv of caves) for (const rm of (cv.rooms || []))
        if (rm.door) normals.set(cv.id + ':' + rm.id, rm.door);
      const narrows = [];
      let noNormal = 0;
      for (const d of under) {
        const f = d.f || 0;
        const nd = normals.get(d.caveId + ':' + d.roomId);
        const nx = nd ? (nd.nx || 0) : 0, ny = nd ? (nd.ny || 0) : 0;
        if (!nx && !ny) { noNormal++; continue; }
        let cx = d.x + nx, cy = d.y + ny, px = d.x, py = d.y, worst = 99;
        for (let step = 0; step < 40; step++) {
          if (!open(cx, cy, f)) break;
          const w = Math.min(widthAt(cx, cy, f, 0), widthAt(cx, cy, f, 1));
          if (w >= HALLW) break;                 /* arrived somewhere hall-sized */
          if (w < worst) worst = w;
          /* follow the corridor away from the door */
          const nbs = [];
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const qx = cx + dx, qy = cy + dy;
            if (qx === px && qy === py) continue;
            if (open(qx, qy, f)) nbs.push([qx, qy]);
          }
          if (nbs.length !== 1) break;
          px = cx; py = cy; cx = nbs[0][0]; cy = nbs[0][1];
        }
        if (worst < 99) narrows.push(worst);
      }
      narrows.sort((a, b2) => a - b2);
      const pencil = narrows.filter(w => w <= 2).length;
      O._approach = `${under.length - noNormal} doorways with a known normal; ${narrows.length} sit down a corridor narrower than a hall` +
        (narrows.length ? `: min ${narrows[0]}, median ${narrows[Math.floor(narrows.length / 2)]} — ${pencil} are two tiles or less` : '');
      /* the vacuous case is its own failure: no normals means nothing was walked */
      O.andTheWayUpToItIsNotAPencilPath = noNormal >= under.length
        ? `!! NOT ONE DOORWAY HAD A NORMAL TO WALK OUT ALONG — NOTHING WAS MEASURED`
        : pencil === 0
          ? `no doorway in the world is reached down a corridor two tiles wide or narrower`
          : `!! ${pencil} OF ${under.length - noNormal} DOORWAYS ARE REACHED DOWN A PENCIL PATH (NARROWEST ${narrows[0]} TILES)`;
    });

    /* ---------- AND A CORRIDOR GOES SOMEWHERE ----------
       "Quite a few hallways/rooms in the undercroft simply dead-end."
       A tile with one open neighbour is the end of something. At a doorway that is correct and
       is the point — the corridor ends at a door. Anywhere else it is a carve that was severed
       by a wall raised after it, and the player walks it for twenty-five tiles to find rock. */
    guard(['_blind', 'andACorridorEndsAtADoorwayRatherThanAtNothing'], () => {
      const dk = new Set();
      for (const d of doors) for (const t of tilesOf(d)) dk.add(t.y * W + t.x);
      let blind = 0, atDoor = 0;
      const seen = [];
      for (const [bk, arr] of undercroft.grid) {
        if (Math.floor(bk / 16777216) !== 0) continue;         /* the Undercroft, where the player walks */
        for (const id of arr) {
          const x = id % W, y = Math.floor(id / W);
          if (!open(x, y, -1)) continue;
          let nb = 0;
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (open(x + dx, y + dy, -1)) nb++;
          if (nb > 1) continue;
          let door = dk.has(id);
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (dk.has((y + dy) * W + (x + dx))) door = true;
          if (door) atDoor++; else { blind++; if (seen.length < 6) seen.push(x + ',' + y); }
        }
      }
      O._blind = `${atDoor} corridors end at a doorway, ${blind} end at nothing${seen.length ? ' — ' + seen.join(' ') : ''}`;
      O.andACorridorEndsAtADoorwayRatherThanAtNothing = blind === 0
        ? `every dead end on the Undercroft is a doorway; not one corridor stops at bare rock`
        : `!! ${blind} CORRIDORS ON THE UNDERCROFT DEAD-END INTO ROCK WITH NO DOOR`;
    });

    /* ---------- AND YOU CAN SEE IT FROM FURTHER THAN THE TORCH REACHES ----------
       Underground the sun is off, the fill is 0.20 and there are exactly three point lights in
       the world. A Lambert box in a doorway past the torch is black, and so is the rock beside
       it, so "hard to see" can be a true sentence about a door drawn perfectly correctly.
       MEASURED AS PIXELS, because that is what the complaint is about. Every box in the warren
       goes through `box()`, which batches into instanced meshes — so there is nothing at the
       doorway's coordinates to traverse and an earlier cut of this claim scanned the whole
       scene by accident and passed on a build that draws stone over the door. Render a frame,
       read the canvas where the doorway projects, and compare it with the wall two tiles along
       the same face. If a doorway is not brighter than the stone beside it, it is not visible,
       whatever is in the scene graph. */
    guard(['_lintel', 'andADoorwayShowsItselfInTheDark'], () => {
      const d = window.__door;
      if (!d || (!d.nx && !d.ny)) { O.andADoorwayShowsItselfInTheDark = '!! NO WARREN DOOR WAS STAGED'; return; }
      renderer.render(scene, camera);
      const src = renderer.domElement;
      const cvs = document.createElement('canvas');
      cvs.width = src.width; cvs.height = src.height;
      cvs.getContext('2d').drawImage(src, 0, 0);
      const cx2 = cvs.getContext('2d');
      const gy = groundY(d.x + 0.5, d.y + 0.5) + floorY(d.f);
      /* THE WHOLE HEIGHT OF IT, not one guessed elevation. The first cut sampled a fixed 1.1
         above the floor and read the door slab — the lintel sits near the top of the opening
         and the claim reported it missing while it was in the scene graph the whole time.
         Take the brightest pixel anywhere up the column, which is what an eye does. */
      const lum = (wx, wz) => {
        let best = null;
        for (let h = 0.3; h <= FLOOR_H; h += 0.25) {
          const v = new THREE.Vector3(wx, gy + h, wz).project(camera);
          const px = Math.round((v.x * 0.5 + 0.5) * cvs.width), py = Math.round((-v.y * 0.5 + 0.5) * cvs.height);
          if (px < 4 || py < 4 || px > cvs.width - 5 || py > cvs.height - 5) continue;
          const im = cx2.getImageData(px - 3, py - 3, 7, 7).data;
          for (let i = 0; i < im.length; i += 4) {
            const L = 0.299 * im[i] + 0.587 * im[i + 1] + 0.114 * im[i + 2];
            if (best === null || L > best) best = L;
          }
        }
        return best;
      };
      /* the doorway, and the wall three tiles along the face it is cut into — far enough to
         clear a three-tile span, which is the point of the other claims */
      const ax = d.nx ? 0 : 1, ay = d.nx ? 1 : 0;
      const at = lum(d.x + 0.5, d.y + 0.5);
      const beside = lum(d.x + 0.5 + ax * 3, d.y + 0.5 + ay * 3);
      if (at === null || beside === null) { O.andADoorwayShowsItselfInTheDark = '!! THE DOORWAY DID NOT PROJECT ONTO THE CANVAS'; return; }
      O._lintel = `brightest pixel at the doorway ${at.toFixed(0)}, on the wall beside it ${beside.toFixed(0)}`;
      O.andADoorwayShowsItselfInTheDark = at >= beside + 40
        ? `the doorway reads ${at.toFixed(0)} against ${beside.toFixed(0)} for the stone beside it — it is the brightest thing on that wall`
        : `!! THE DOORWAY READS ${at.toFixed(0)} AGAINST ${beside.toFixed(0)} FOR THE STONE BESIDE IT — IT IS NOT DISTINGUISHABLE FROM THE WALL`;
    });

    /* ---------- AND THE SPAN COMES BACK OFF A SAVE ----------
       `d.w` is new state on a persisted object, and the save path rebuilds the global door list
       out of `cv.doors` and pushes every door's state back through `setDoor`. If the span does
       not survive that, a three-tile doorway reloads as a one-tile doorway with two walkable
       holes beside it — which is worse than never widening it. */
    guard(['andTheDoorwaysComeBackOffASave'], () => {
      const before = under.map(d => tilesOf(d).length).reduce((a, c) => a + c, 0);
      restore(JSON.parse(JSON.stringify(snapshot())));
      const back = doors.filter(d => (d.f || 0) < 0);
      const after = back.map(d => tilesOf(d).length).reduce((a, c) => a + c, 0);
      let leaks = 0;
      for (const d of back) { if (d.open) continue; for (const t of tilesOf(d)) if (open(t.x, t.y, d.f || 0)) leaks++; }
      const rock = new Set();
      for (const cv of caves) for (const w of cv.walls) rock.add(bkey(w.x, w.y, w.f));
      let stoned = 0;
      for (const d of back) for (const t of tilesOf(d)) if (rock.has(bkey(t.x, t.y, d.f || 0))) stoned++;
      O.andTheDoorwaysComeBackOffASave = (after === before && leaks === 0 && stoned === 0)
        ? `${after} doorway tiles come back off a save, all still shut and none of them drawn as rock`
        : `!! AFTER A SAVE: ${after} DOORWAY TILES AGAINST ${before}, ${leaks} WALKABLE, ${stoned} DRAWN AS ROCK`;
    });

    return O;
  });

  console.log('\n=== THE UNDERCROFT DOORWAYS ===\n');
  const bad = [];
  for (const k of Object.keys(R)) {
    const v = String(R[k]);
    console.log('  ' + k.padEnd(44) + v);
    if (v.startsWith('!!')) bad.push(v);
  }
  for (const e of errs) bad.push(e);
  console.log('');
  for (const v of bad) console.log('*** ' + v);
  await b.close();
  process.exit(bad.length ? 1 : 0);
})();
