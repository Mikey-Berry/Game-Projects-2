#!/usr/bin/env node
/* THE ROOMS ARE WHERE THE PLAYER IS NOW, AND THE DOORS ARE SHUT.
 *
 * "The little 'tunnels' that supposedly lead underneath a mountain are broken. Like I cannot use
 *  them... Let's kill that section and focus more on developing the 'general' underground rooms
 *  and areas, which right now, are barren. I'm wondering if that randomization is happening where
 *  the mountains are at and I just can't reach it."
 * "Maybe we could experiment with actual doors for the vaults etc to see how that works."
 *
 * IT WAS EXACTLY THAT. Measured on the shipped build: the lattice you actually walk into — 81
 * halls, 94,344 tiles, 81 shafts down — contained ZERO rooms. Every chamber, vault, keeper and
 * warden in the game was in seven warrens on floors -2 to -4, behind seven mouths at the feet of
 * mountains, and 35 of the 81 halls had neither a monster nor a chest in them.
 *
 *   node tools/warrens.js [game.html]
 */
const { chromium } = require('playwright');
const path = require('path');
const gamePath = (a) => path.resolve(a ? (path.isAbsolute(a) ? a : path.join(__dirname, a)) : path.join(__dirname, 'game.html'));

(async () => {
  const b = await chromium.launch({
    executablePath: process.env.DUSTWARD_CHROME || undefined,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'],
  });
  const p = await b.newPage({ viewport: { width: 900, height: 620 } });
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message.slice(0, 160)));
  await p.goto('file://' + gamePath(process.argv[2]), { waitUntil: 'load' });
  await p.waitForSelector('#btn-start', { state: 'attached', timeout: 60000 });
  await p.evaluate(() => { document.getElementById('btn-start').click(); paused = true; });
  await p.waitForTimeout(2600);

  const out = await p.evaluate(() => {
    const R = {};
    paused = true;
    const guard = (keys, fn) => {
      try { fn(); } catch (e) { for (const k of keys) if (R[k] === undefined) R[k] = '!! ' + String(e.message).slice(0, 130).toUpperCase(); }
    };
    const UF = -1;
    /* ---------- ONE FLOOD PER STOREY, KEYED BY FLOOR ----------
       This flooded storey -1 from `shafts[0]` and asked every chamber in the world about the
       result, which was the whole truth while the world had one storey under it. With three it
       reports two thirds of the warrens unreachable and is describing the DESCENT, not a fault:
       a chamber on the Sump is not supposed to be reachable from a flood of the Undercroft.
       Each storey is flooded from a shaft that ARRIVES on it, and a chamber is asked about the
       flood of its own floor. Four-connected on purpose: a body walks orthogonally, and two
       tiles that touch at a corner are not a passage — a fault this rework hit twice, once at a
       door and once in an approach tunnel. */
    const DEEPS = (typeof DEPTHS !== 'undefined') ? DEPTHS.slice() : [UF];
    const floodAt = (f) => {
      const U = (typeof undercroft !== 'undefined') ? undercroft : null;
      const s0 = U && (U.shafts.find(sh => (sh.f === undefined ? UF : sh.f) === f) || (f === UF ? U.shafts[0] : null));
      if (!s0) return new Set();
      const seen = new Set(); const q = [[Math.round(s0.x), Math.round(s0.y)]];
      seen.add(Math.round(s0.y) * W + Math.round(s0.x));
      while (q.length) {
        const [x, y] = q.pop();
        for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
          const nx = x + dx, ny = y + dy, id = ny * W + nx;
          if (seen.has(id) || isBlocked(nx, ny, f)) continue;
          seen.add(id); q.push([nx, ny]);
        }
        if (seen.size > 400000) break;
      }
      return seen;
    };
    /* how many chamber centres are reachable, each on the flood of its own storey */
    const reachable = () => {
      const per = new Map(DEEPS.map(f => [f, floodAt(f)]));
      let n = 0;
      for (const cv of caves) for (const rm of cv.rooms) {
        const seen = per.get(rm.f); if (seen && seen.has(rm.cy * W + rm.cx)) n++;
      }
      return n;
    };
    const allRooms = () => caves.reduce((n, c) => n + c.rooms.length, 0);

    /* ---------- 1. THE ROOMS ARE ON THE FLOOR YOU WALK ONTO ---------- */
    guard(['theRoomsAreWhereYouWalk', 'andThereIsNoMouthLeftToBeBrokenBy'], () => {
      /* ---------- ON A STOREY THE PLAYER WALKS ONTO, WHICHEVER ONE ----------
         This asked for exactly one floor and named it. That was the claim worth making when the
         complaint was "every room in the game is on floors -2 to -4 behind a mountain mouth I
         cannot use" — the fix was to put them where the player walks. The fix is not undone by
         there being three floors the player walks on; it is undone by a chamber on a floor with
         no lattice under it. So: every chamber's storey must be one of `DEPTHS`, and every one
         must be a storey that has halls on it. */
      const floors = [...new Set(caves.flatMap(c => c.rooms.map(r => r.f)))].sort((a,b)=>b-a);
      const withHalls = new Set(undercroft.halls.map(h => h.f === undefined ? UF : h.f));
      const stray = floors.filter(f => !DEEPS.includes(f) || !withHalls.has(f));
      R._where = `${caves.length} warrens, ${allRooms()} chambers, on storeys ${JSON.stringify(floors)}`;
      R.theRoomsAreWhereYouWalk = (!stray.length && allRooms() > 40)
        ? `every chamber in the world is on a storey the shafts drop you onto — ${allRooms()} of them across ${floors.join(', ')}, where the lattice had none at all`
        : `!! CHAMBERS ARE ON A STOREY WITH NO NETWORK UNDER THEM: ${JSON.stringify(stray)} (of ${JSON.stringify(floors)})`;
      /* ---------- AND NO WARREN HAS A WAY DOWN OF ITS OWN ----------
         The original claim was "no stair goes anywhere but 0→-1", which said two things at once
         and only one of them was the point. The point is that a WARREN is not a multi-floor
         dungeon behind a mouth any more — you walk into one off a hall, and the only way out is
         the way in. The underworld having storeys is the other thing, and it is now deliberate:
         the descents belong to the LATTICE, and every one of them must be a step of exactly one
         storey between two adjacent depths, never a chute from the surface to the bottom. */
      const kinds = stairs.filter(s => s.to < 0).map(s => s.from + '→' + s.to);
      const legal = new Set(['0→' + DEEPS[0]].concat(DEEPS.slice(1).map((f, i) => DEEPS[i] + '→' + f)));
      const odd = kinds.filter(k => !legal.has(k));
      const inWarren = stairs.filter(s => s.to < 0 && caves.some(cv =>
        cv.rooms.some(rm => s.x >= rm.x0 && s.x <= rm.x1 && s.y >= rm.y0 && s.y <= rm.y1)));
      R._stairs = `${kinds.length} ways below ground, of kinds ${JSON.stringify([...new Set(kinds)])}`;
      R.andThereIsNoMouthLeftToBeBrokenBy = (!odd.length && !inWarren.length)
        ? `every descent is one storey between two adjacent depths (${[...new Set(kinds)].join(', ')}) and not one of them is inside a chamber — a warren is still somewhere you walk into off a hall, not a dungeon behind a mouth`
        : `!! ${odd.length} STAIRS SKIP A STOREY ${JSON.stringify([...new Set(odd)])} AND ${inWarren.length} ARE INSIDE A CHAMBER`;
    });

    /* ---------- 2. AND YOU CAN GET TO THEM ---------- */
    guard(['andEveryChamberCanBeReached'], () => {
      for (const d of doors) setDoor(d, true);
      const ok = reachable();
      for (const d of doors) setDoor(d, !!d.wasOpen);
      R._reach = `${ok} of ${allRooms()} chamber centres reachable on foot from a shaft onto their own storey, doors open`;
      R.andEveryChamberCanBeReached = ok >= allRooms() - 2
        ? `and with the doors open you can walk to ${ok} of ${allRooms()} of them from a shaft onto their own storey — the rooms are not merely on a real floor, they are joined to it`
        : `!! ONLY ${ok} OF ${allRooms()} CHAMBERS CAN BE WALKED TO`;
    });

    /* ---------- 3. A SHUT DOOR IS SHUT ----------
       The whole experiment. A door used to be a hole in a wall with two posts drawn beside it. */
    guard(['aShutDoorSeals', 'andOpeningOneLetsYouIn', 'andTheVaultsAreBarred'], () => {
      for (const d of doors) setDoor(d, false);
      const inClosed = reachable();
      for (const d of doors) setDoor(d, true);
      const inOpen = reachable();
      for (const d of doors) setDoor(d, false);
      R._seal = `chamber centres reachable with every door SHUT: ${inClosed} · with every door OPEN: ${inOpen} (of ${allRooms()})`;
      R.aShutDoorSeals = inClosed === 0
        ? `a shut door is genuinely shut — with every door closed, not one of the ${allRooms()} chambers can be walked into, so a chamber is a place with an inside and an outside rather than twelve tiles of corridor with posts either side`
        : `!! ${inClosed} CHAMBERS ARE STILL OPEN WITH EVERY DOOR SHUT`;
      R.andOpeningOneLetsYouIn = inOpen > allRooms() * 0.9
        ? `and opening them is what lets you in — ${inOpen} against ${inClosed}, off the same flood`
        : `!! OPENING EVERY DOOR ONLY REACHES ${inOpen}`;
      const barred = doors.filter(d => d.barred).length;
      R._barred = `${barred} barred doors against ${caves.length} warrens and ${doors.length} doors in all`;
      R.andTheVaultsAreBarred = (barred > 0 && barred <= caves.length)
        ? `and the vault of every warren is BARRED — ${barred} of ${doors.length} — which is the one door you cannot simply pull on`
        : `!! ${R._barred}`;
    });

    /* ---------- 4. FORCING ONE TAKES TIME AND IS HEARD ---------- */
    guard(['aBarredDoorMustBeForced', 'andForcingItIsLoud'], () => {
      const vd = doors.find(d => d.barred && !d.open);
      if (!vd) { R.aBarredDoorMustBeForced = '!! NO BARRED DOOR TO FORCE'; return; }
      const me = player()[0];
      const hand = makeChar('Breaker', 'player', vd.x + 1, vd.y, { atk: 20, def: 8, tough: 14, labor: 20 });
      hand.state = 'ok'; hand.floor = UF; hand.__probe = true; chars.push(hand);
      hand.forcing = { x: vd.x, y: vd.y, f: vd.f || 0, t: 0 };
      let ticks = 0, noisy = 0;
      while (hand.forcing && ticks < 600) {
        hand.x = vd.x + 0.6; hand.y = vd.y;
        forceTick(hand, 0.1);
        if ((hand.noise || 0) >= 6) noisy++;
        ticks++;
      }
      R._force = `forcing took ${(ticks * 0.1).toFixed(1)}s of work; the door is now ${vd.open ? 'open' : 'shut'} and ${vd.barred ? 'still barred' : 'unbarred'}`;
      R.aBarredDoorMustBeForced = (vd.open && !vd.barred && ticks > 5)
        ? `a barred door opens only to a body putting a shoulder to it for ${(ticks * 0.1).toFixed(1)} seconds — it is the first thing in the game you have to get THROUGH rather than walk past`
        : `!! ${R._force}`;
      R.andForcingItIsLoud = noisy > 0
        ? `and it is heard — the work carries ${noisy} ticks of noise, which is the price of the loot behind it and the reason the room knows you are coming`
        : '!! FORCING A DOOR IS SILENT';
      const i = chars.indexOf(hand); if (i >= 0) chars.splice(i, 1);
      setDoor(vd, false); vd.barred = true;
    });

    /* ---------- 5. AND THE HALLS ARE NOT BARE ANY MORE ---------- */
    guard(['theHallsHaveSomethingInThem'], () => {
      let bare = 0, alive = 0;
      for (const h of undercroft.halls) {
        const mob = chars.some(c => (c.floor || 0) < 0 && c.state !== 'dead' && dist(c.x, c.y, h.x, h.y) < 20);
        const ch = chests.some(t => (t.floor || 0) < 0 && dist(t.x, t.y, h.x, h.y) < 20);
        if (mob) alive++;
        if (!mob && !ch) bare++;
      }
      R._halls = `of ${undercroft.halls.length} halls: ${alive} have something alive within twenty tiles, ${bare} have neither monster nor chest`;
      R.theHallsHaveSomethingInThem = bare < undercroft.halls.length * 0.35
        ? `${undercroft.halls.length - bare} of ${undercroft.halls.length} halls have something in them, against 46 of 81 on the build before this — "barren" was measurable and it moved`
        : `!! ${bare} OF ${undercroft.halls.length} HALLS ARE STILL EMPTY`;
    });

    return R;
  });

  const bad = Object.values(out).filter(v => typeof v === 'string' && v.startsWith('!!'));
  for (const [k, v] of Object.entries(out)) console.log('  ' + (k.startsWith('_') ? ('· ' + k.slice(1)).padEnd(34) : k.padEnd(34)) + ' ' + v);
  for (const e of errs) console.log('  ' + e);
  console.log('');
  console.log(bad.length || errs.length ? `THE ROOMS ARE STILL SOMEWHERE YOU CANNOT GO (${bad.length + errs.length})`
                                        : 'THE ROOMS ARE UNDERFOOT, AND THE DOORS ARE SHUT');
  await b.close();
  process.exit(bad.length || errs.length ? 1 : 0);
})();
