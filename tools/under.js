#!/usr/bin/env node
/* IS THERE ANYTHING UNDER THE REST OF THE MAP?
 *
 * "The 'cave under mountains' system is still terribly broken. I'm starting to think the
 *  'floor transfer' should be taken FAR more extreme (think an elevator lol) and an entirely
 *  NEW area built 100% underneath the entire map, not just under these single mountains."
 *
 * What was there, measured rather than described: seven warrens, 4,015 tiles of floor between
 * them across a 1440x1440 world, and 1.7% OF THE MAP within forty tiles of a mouth. "Under the
 * mountains" was not a description of the feature, it was the extent of it.
 *
 * So the assertions here are about EXTENT and REACH, which is what the report is about — is
 * there something under an arbitrary corner of the map, can you get down to it from wherever
 * you are standing, and is it one place rather than sixty-four disconnected rooms. That last
 * one is the assertion that would catch the worst version of this feature: a generator that
 * produces halls everywhere and joins none of them looks identical on every other measure.
 *
 *   node tools/under.js [game.html]
 */
const { chromium } = require('playwright');
const path = require('path');
const gamePath = (a) => path.resolve(a ? (path.isAbsolute(a) ? a : path.join(__dirname, a)) : path.join(__dirname, 'game.html'));

(async () => {
  const b = await chromium.launch({
    executablePath: process.env.DUSTWARD_CHROME || undefined,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'],
  });
  const p = await b.newPage({ viewport: { width: 1000, height: 720 } });
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message.slice(0, 200)));
  await p.goto('file://' + gamePath(process.argv[2]), { waitUntil: 'load' });
  await p.waitForTimeout(3000);
  await p.evaluate(() => { document.getElementById('btn-start').click(); paused = true; });
  await p.waitForTimeout(3000);

  const out = await p.evaluate(() => {
    const R = {};
    paused = true;
    const guard = (keys, fn) => {
      try { fn(); } catch (e) {
        for (const k of keys) if (R[k] === undefined) R[k] = '!! ' + String(e.message).slice(0, 80).toUpperCase();
      }
    };
    const U = (typeof undercroft !== 'undefined') ? undercroft : null;
    const F = (typeof UNDER !== 'undefined') ? UNDER : -1;

    /* ---------- 1. IT IS UNDER THE WHOLE MAP ----------
       Sampled on a coarse grid over the entire world rather than counted, because a count is
       a number about the generator and this is a question about the MAP: stand anywhere and
       ask whether there is anything beneath you. */
    guard(['thereIsSomethingUnderIt'], () => {
      let near = 0, tot = 0;
      for (let y = 30; y < H; y += 30) for (let x = 30; x < W; x += 30) {
        tot++;
        let hit = false;
        for (let r = 0; r <= 60 && !hit; r += 6)
          for (let a = 0; a < 12 && !hit; a++) {
            const qx = Math.round(x + Math.cos(a / 12 * 6.283) * r), qy = Math.round(y + Math.sin(a / 12 * 6.283) * r);
            if (qx > 1 && qy > 1 && qx < W - 1 && qy < H - 1 && decks.has(bkey(qx, qy, F))) hit = true;
          }
        if (hit) near++;
      }
      const pct = near / tot;
      R._extent = `${(pct * 100).toFixed(1)}% of the map has floor within sixty tiles beneath it`;
      R.thereIsSomethingUnderIt = pct > 0.85
        ? `and it is under the map rather than under the mountains — ${(pct * 100).toFixed(1)}% of it`
        : `!! ONLY ${(pct * 100).toFixed(1)}% OF THE MAP HAS ANYTHING UNDER IT`;
    });

    /* ---------- 2. AND IT IS ONE PLACE ----------
       THE ASSERTION THAT CATCHES THE WORST VERSION OF THIS. A generator that scatters sixty
       halls across the map and joins none of them scores identically on extent, on tile count
       and on every picture — and is sixty rooms you can never walk between. Flood from one
       tile and see how much of the network the flood reaches. */
    guard(['andItIsOnePlace'], () => {
      let start = null;
      for (const [, arr] of U.grid) { if (arr.length) { start = arr[0]; break; } }
      if (start === null) { R.andItIsOnePlace = '!! NO TILES AT ALL'; return; }
      const seen = new Set([start]);
      const q = [start];
      for (let i = 0; i < q.length; i++) {
        const t = q[i], x = t % W, y = (t - x) / W;
        for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
          const nx = x + dx, ny = y + dy, nt = ny * W + nx;
          if (seen.has(nt)) continue;
          if (nx < 1 || ny < 1 || nx >= W - 1 || ny >= H - 1) continue;
          if (isBlocked(nx + 0.5, ny + 0.5, F)) continue;
          seen.add(nt); q.push(nt);
        }
      }
      /* AGAINST WHAT IS ACTUALLY OPEN DOWN THERE, not against the dig's own counter. The
         counter skips tiles that were already open, and the warrens deck this floor too, so
         the flood reached 100.4% of it — a denominator that can be exceeded is not a
         denominator. Count the open floor of storey F the way `isBlocked` counts it. */
      let openTiles = 0;
      for (const k of decks) {
        if (Math.floor(k / FLOOR_SPAN) - 4 !== F) continue;
        if (!blocked.has(k)) openTiles++;
      }
      const frac = seen.size / Math.max(1, openTiles);
      R._flood = `one flood from one tile reaches ${seen.size} of ${openTiles} open tiles on storey ${F}`;
      R.andItIsOnePlace = frac > 0.92
        ? `and you can walk from any of it to any of it — one flood reaches ${(frac * 100).toFixed(1)}% of the network`
        : `!! IT IS IN PIECES — ONE FLOOD REACHES ${(frac * 100).toFixed(1)}%`;
      /* and the halls are IN it, which the flood above cannot say on its own: a network that
         is connected to itself but leaves half the halls walled off is still broken */
      const orphan = U.halls.filter(h => !seen.has(Math.round(h.y) * W + Math.round(h.x)));
      R.andEveryHallIsOnIt = orphan.length === 0
        ? `and all ${U.halls.length} halls are on it`
        : `!! ${orphan.length}/${U.halls.length} HALLS ARE WALLED OFF FROM THE REST`;
    });

    /* ---------- 3. AND YOU CAN GET DOWN TO IT FROM WHEREVER YOU ARE ----------
       "a place you cannot get into from where you are standing is not under you in any sense
       that matters." The measure is the WORST case, not the average — a mean distance to a
       shaft is flattered by the ones clustered together. */
    guard(['andThereIsAWayDownNearby'], () => {
      const ways = stairs.filter(st => st.to <= F && st.from === 0);
      let worst = 0, wx = 0, wy = 0;
      for (let y = 40; y < H; y += 40) for (let x = 40; x < W; x += 40) {
        let d = 1e9;
        for (const st of ways) d = Math.min(d, dist(st.x, st.y, x, y));
        if (d > worst) { worst = d; wx = x; wy = y; }
      }
      R._ways = `${ways.length} ways down from the surface; worst corner is ${Math.round(worst)} tiles from one`;
      R.andThereIsAWayDownNearby = (ways.length >= 20 && worst < 200)
        ? `and the furthest anywhere on the map gets from a way down is ${Math.round(worst)} tiles, across ${ways.length} of them`
        : `!! ${ways.length} WAYS DOWN, WORST CORNER ${Math.round(worst)} TILES OUT`;
    });

    /* ---------- 4. AND THE TRANSFER IS ONE ACTION ----------
       "the 'floor transfer' should be taken FAR more extreme (think an elevator lol)". Four
       staircases in sequence is the thing being complained about, so the claim is that ONE
       crossing takes a body from the surface to the bottom — driven through `useStairs`, the
       function the game itself uses, rather than by setting `floor`. */
    /* AND IT IS A LONG WAY, asked on its own. A storey down is a cellar; the report asked for
       an elevator, and the difference is a number. Kept out of the shaft probe below so it
       still answers on a build that has no shafts — which is the build that needs answering. */
    guard(['andItIsAWayDownNotAStep'], () => {
      const drop = -floorY(F);
      R.andItIsAWayDownNotAStep = drop >= 4 * FLOOR_H
        ? `and it is ${drop.toFixed(1)} units down — ${(drop / FLOOR_H).toFixed(1)} storeys in one go, not a step into a cellar`
        : `!! THE UNDERWORLD IS ${drop.toFixed(1)} DOWN, WHICH IS ${(drop / FLOOR_H).toFixed(1)} STOREYS`;
    });
    guard(['oneStepTakesYouDown'], () => {
      const sh = U.shafts[Math.floor(U.shafts.length / 2)];
      const c = player().find(u => u.state !== 'dead');
      const wasX = c.x, wasY = c.y, wasF = c.floor;
      c.floor = 0; c.x = sh.x + 0.5; c.y = sh.y + 0.5; c.onStair = null;
      c.wantFloor = F;
      useStairs(c);
      const landed = c.floor;
      const standing = !isBlocked(c.x, c.y, c.floor);
      c.x = wasX; c.y = wasY; c.floor = wasF; c.wantFloor = null; c.onStair = null;
      R.oneStepTakesYouDown = (landed === F && standing)
        ? `one crossing takes them from the surface to storey ${landed}, and there is floor under them when they get there`
        : `!! LANDED ON ${landed} (wanted ${F}), standing ${standing}`;
    });

    /* ---------- 5. AND THE WARRENS ARE PART OF IT ----------
       Seven sealed pockets with a ladder each is what was there. If the vaults at the bottom
       of them are not reachable from the network, the network is a second thing beside the
       old thing rather than the floor the old thing hangs off. */
    guard(['andTheOldWarrensHangOffIt'], () => {
      /* ON THE NETWORK, not merely beside open floor. The first version of this asked whether
         there was any storey-F tile within six of the mouth, which is true of every warren
         that ever existed — their own landing IS a storey-F tile — so it was green on the
         build with seven sealed pockets and proved nothing. The claim is that you can WALK
         from the network to the mouth, so it is asked as a walk: flood from a hall and see
         which mouths the flood arrives at. */
      const start = U.halls[0];
      const s0 = Math.round(start.y) * W + Math.round(start.x);
      const seen = new Set([s0]), q = [s0];
      for (let i = 0; i < q.length; i++) {
        const t = q[i], x = t % W, y = (t - x) / W;
        for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
          const nx = x + dx, ny = y + dy, nt = ny * W + nx;
          if (seen.has(nt) || nx < 1 || ny < 1 || nx >= W - 1 || ny >= H - 1) continue;
          if (isBlocked(nx + 0.5, ny + 0.5, F)) continue;
          seen.add(nt); q.push(nt);
        }
      }
      const joined = caves.filter(cv => seen.has(cv.mouth.y * W + cv.mouth.x)).length;
      R.andTheOldWarrensHangOffIt = joined === caves.length
        ? `and you can walk from a hall to the mouth of all ${caves.length} of the old warrens — they are the deep ends of one place now, not seven pockets`
        : `!! ONLY ${joined}/${caves.length} WARRENS CAN BE WALKED TO FROM THE NETWORK`;
    });

    /* ---------- 6. AND IT IS NOT AN EMPTY BASEMENT ---------- */
    guard(['andSomethingLivesDownThere'], () => {
      const denizens = chars.filter(c => c.undercroft && c.state !== 'dead').length;
      const finds = chests.filter(ch => (ch.floor || 0) === F).length;
      R.andSomethingLivesDownThere = (denizens >= 30 && finds >= 8)
        ? `and there are ${denizens} things living in it and ${finds} things left in it`
        : `!! ${denizens} DENIZENS, ${finds} FINDS`;
    });

    /* ---------- 6c. AND SO DO THE WARRENS ----------
       Found by the assertion above coming back with FOUR HUNDRED MORE open tiles than went in:
       `baseBlocked` is the world as generated and `restore` rebuilds `blocked` from it, but it
       is captured long before `seedCaves` runs — so every wall the cave generator raised was
       dropped on the first reload and a warren that was a set of chambers before you saved was
       open floor afterwards. Both halves are asserted, because they fail independently: the
       ROCK (can you still not walk through it) and the LIST the renderer draws from, which the
       load path used to reset to empty and never refill.
       RUN BEFORE THE OTHER ROUND-TRIP, not after: the undercroft's save assertion below does
       a `restore` of its own, and on a build with this bug that first restore has already
       eaten the walls — so measured second, the baseline reads zero and the red line says
       "ROCK 0 → 0" about a warren that was perfectly solid when the run started. */
    guard(['andSoDoTheWarrens'], () => {
      if(!caves.length){ R.andSoDoTheWarrens = '!! NO CAVES'; return; }
      const rock = () => caves.reduce((n, cv) => n + (cv.rooms || []).reduce((m, rm) => {
        let c = 0;
        for(let i = rm.x0; i <= rm.x1; i++){ if(blocked.has(bkey(i, rm.y0, rm.f))) c++; if(blocked.has(bkey(i, rm.y1, rm.f))) c++; }
        for(let j = rm.y0; j <= rm.y1; j++){ if(blocked.has(bkey(rm.x0, j, rm.f))) c++; if(blocked.has(bkey(rm.x1, j, rm.f))) c++; }
        return m + c;
      }, 0), 0);
      /* UNIQUE TILES, not list length. Chambers are free to overlap, so a tile on two rings
         is pushed twice by the generator and once by the rebuild — 1759 entries against 1516
         tiles, describing the same rock. Counting entries would read a tidier list as a loss. */
      const drawn = () => { const u = new Set(); for(const cv of caves) for(const w of cv.walls) u.add(bkey(w.x, w.y, w.f)); return u.size; };
      const drawnBefore = drawn(), rockBefore = rock();
      restore(JSON.parse(JSON.stringify(snapshot())));
      const rockAfter = rock(), drawnAfter = drawn();
      R.andSoDoTheWarrens = (rockBefore > 500 && rockAfter === rockBefore && drawnAfter === drawnBefore)
        ? `and a warren is still a warren after a save — ${rockAfter} tiles of rock still solid and all ${drawnAfter} of them still drawn`
        : `!! ROCK ${rockBefore} → ${rockAfter}, DRAWN ${drawnBefore} → ${drawnAfter}`;
    });

    /* ---------- 6b. AND IT IS STILL THERE AFTER A SAVE ----------
       REASONING IS NOT MEASURING. The argument that the undercroft survives a reload is sound
       — `restore` never clears `decks`, and the tiles the tunnels carve open are dropped from
       `baseBlocked` as well as from `blocked` — and the same kind of argument was sound about
       `coilSpeaker`, `guildFolk` and `coilHeld`, all three of which were missing from the save
       and invisible until somebody reloaded. A world regenerated from the seed and then
       patched is exactly where a floor can quietly grow back. */
    guard(['andItSurvivesASave'], () => {
      const openAt = () => {
        let n = 0;
        for (const k of decks) { if (Math.floor(k / FLOOR_SPAN) - 4 === F && !blocked.has(k)) n++; }
        return n;
      };
      const before = openAt();
      const probe = U.halls.map(h => bkey(Math.round(h.x), Math.round(h.y), F));
      const standingBefore = probe.filter(k => decks.has(k) && !blocked.has(k)).length;
      restore(JSON.parse(JSON.stringify(snapshot())));
      const after = openAt();
      const standingAfter = probe.filter(k => decks.has(k) && !blocked.has(k)).length;
      /* the shafts are stairs, and a stair the reload forgot is an underworld with no way in */
      const ways = stairs.filter(st => st.from === 0 && st.to <= F).length;
      R.andItSurvivesASave = (after === before && standingAfter === standingBefore && ways >= 20)
        ? `and it comes back off a save — ${after} open tiles against ${before}, all ${standingAfter} hall floors still there, ${ways} ways down`
        : `!! ${before} OPEN TILES WENT IN AND ${after} CAME BACK (halls ${standingBefore}→${standingAfter}, ways down ${ways})`;
    });

    /* ---------- 7. AND THE SURFACE DID NOT MOVE ----------
       THE CONTROL, and it is the one that matters most here: this change altered `floorY`,
       which every storey in the game reads — ramparts, tower decks, redoubt floors. If a
       rampart is now twenty-two units underground, the undercroft was not worth it. */
    guard(['andUpstairsIsUnchanged'], () => {
      const ok = floorY(0) === 0 && Math.abs(floorY(1) - FLOOR_H) < 1e-9 && Math.abs(floorY(3) - 3 * FLOOR_H) < 1e-9;
      R.andUpstairsIsUnchanged = ok
        ? `and a rampart is still one storey up (${floorY(1).toFixed(1)}) and a third storey still three (${floorY(3).toFixed(1)})`
        : `!! FLOOR 1 IS AT ${floorY(1)}, FLOOR 3 AT ${floorY(3)}`;
    });

    return R;
  });

  const bad = Object.values(out).filter(v => typeof v === 'string' && v.startsWith('!!'));
  for (const [k, v] of Object.entries(out)) console.log('  ' + k.padEnd(30) + v);
  for (const e of errs) console.log('  ' + e);
  console.log('');
  console.log(bad.length || errs.length
    ? `THERE IS STILL NOTHING UNDER THE MAP (${bad.length + errs.length})`
    : 'THE WHOLE MAP HAS SOMETHING UNDERNEATH IT');
  await b.close();
  process.exit(bad.length || errs.length ? 1 : 0);
})();
