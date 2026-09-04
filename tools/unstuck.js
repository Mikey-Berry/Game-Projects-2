#!/usr/bin/env node
/* A BODY THAT IS GETTING NOWHERE HAS TO TRY SOMETHING ELSE.
 *
 * "Caravans on walls sometimes still happens. Actually NPC pathing in general could use some
 *  work. It's rare but they still get stuck on mountains or outside on city walls. These
 *  situations should have a fallback of some sort."
 *
 * `roads.js` already samples the world's own caravans and reports zero stalls over nine days,
 * which is exactly why this file exists and does not do that: the fault is RARE, and a sampler
 * that watches the ordinary case will keep saying everything is fine. So every staging here is
 * a body deliberately placed in the bad spot — pinned outside a town wall, walled into a pocket
 * of mountain, and standing on a solid tile — and the question is not whether it is stuck but
 * whether it is still stuck a minute later.
 *
 * THE OLD LOOP HAD NO ESCALATION IN IT AT ALL, which is the whole bug: `findPath` fails, the
 * body walks a STRAIGHT LINE into the rock, `pathFail` suppresses the re-flood for four
 * seconds, and then it asks the identical question from the identical tile. Nothing in that
 * ever tried anything different.
 *
 *   node tools/unstuck.js [game.html]
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
      try { fn(); } catch (e) { for (const k of keys) if (R[k] === undefined) R[k] = '!! ' + String(e.message).slice(0, 110).toUpperCase(); }
    };
    /* READ DEFENSIVELY, so the negative control still MEASURES. `unstuckN` does not exist on a
       build without the fallback; naming it straight throws, the guard catches it, and the whole
       section reports one ReferenceError — which proves a counter is new and says nothing about
       whether anybody got unstuck. Degraded to 0, the old build answers the real question. */
    const UN = () => (typeof unstuckN === 'number' ? unstuckN : 0);
    const made = [];
    const wipe = () => { while (made.length) { const c = made.pop(); const i = chars.indexOf(c); if (i >= 0) chars.splice(i, 1); } };
    const body = (x, y) => {
      const c = makeChar('Walker', 'town', x, y, { atk: 4, def: 4, tough: 8, ath: 5 });
      c.state = 'ok'; c.__probe = true;
      chars.push(c); made.push(c);
      return c;
    };
    /* run travel by hand rather than through the world tick, so the only thing being measured
       is the pathing — a body ticked by `physics` also fights, flees and gets hungry */
    const walk = (c, gx, gy, secs) => {
      const n = Math.round(secs / 0.1);
      for (let i = 0; i < n; i++) { if (travel(c, gx, gy, 0.1, 1.2)) return { got: true, at: i * 0.1 }; }
      return { got: false, at: secs };
    };

    /* ---------- 1. PINNED OUTSIDE A TOWN WALL ----------
       The caravan case, made deliberate: stood against the outside of the ring and told to walk
       to the middle. The gate is somewhere else entirely. */
    guard(['itFindsItsWayInsideTheWalls'], () => {
      wipe();
      const t = towns.find(x => x.def.wall && x.walls && x.walls.length);
      const r = t.def.wall.r;
      /* a tile just outside the ring, on the far side from the gate */
      let sx = Math.round(t.x + r + 2), sy = Math.round(t.y);
      for (let k = 0; k < 40 && isBlocked(sx, sy); k++) { sy++; }
      const c = body(sx + 0.5, sy + 0.5);
      const d0 = dist(c.x, c.y, t.x, t.y);
      const got = walk(c, t.x, t.y, 90);
      const d1 = dist(c.x, c.y, t.x, t.y);
      R._wall = `${t.name}: started ${d0.toFixed(1)} tiles out, ended ${d1.toFixed(1)} after ${got.at.toFixed(0)}s`;
      R.itFindsItsWayInsideTheWalls = (got.got || d1 < d0 - 3)
        ? `a body stood against the outside of ${t.name}'s wall and told to walk to the middle gets there — ${d0.toFixed(0)} tiles out to ${d1.toFixed(1)} in ${got.at.toFixed(0)} seconds`
        : `!! STILL ${d1.toFixed(1)} TILES OUT AFTER ${got.at.toFixed(0)}s (started ${d0.toFixed(1)})`;
    });

    /* ---------- 2. AND THE FALLBACK ACTUALLY FIRES ----------
       A pocket the pathfinder genuinely cannot solve, so the escalation is forced rather than
       hoped for. Without a counter this file could pass on a build with no fallback at all
       simply because every staging happened to be solvable. */
    guard(['theFallbackFires', 'andItGetsOutOfASealedPocket'], () => {
      wipe();
      const me = player()[0];
      /* wall a body into a three-by-three box of solid ground */
      const bx = Math.round(me.x) + 26, by = Math.round(me.y) + 26;
      const ring = [];
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        if (Math.abs(dx) !== 2 && Math.abs(dy) !== 2) continue;
        const k = bkey(bx + dx, by + dy);
        if (!blocked.has(k)) { blocked.add(k); ring.push(k); }
      }
      const c = body(bx + 0.5, by + 0.5);
      const before = UN();
      walk(c, me.x, me.y, 40);
      R._fired = `the fallback escalated ${UN() - before} times for one walled-in body`;
      R.theFallbackFires = UN() > before
        ? `a body that cannot get anywhere escalates instead of retrying the same failed path forever — ${UN() - before} escalations in forty seconds`
        : '!! THE BODY MADE NO PROGRESS AND NOTHING EVER TRIED ANYTHING DIFFERENT';
      /* and the narrow last resort: a body standing ON a solid tile cannot path off it, so it
         is put on open ground. Gated to the fourth failure, which is why this needs the time. */
      wipe();
      const stuck = body(bx + 0.5, by + 0.5);
      blocked.add(bkey(bx, by));                     /* the tile under its own feet */
      const wasBlocked = isBlocked(stuck.x, stuck.y);
      walk(stuck, me.x, me.y, 40);
      const freed = !isBlocked(stuck.x, stuck.y);
      R.andItGetsOutOfASealedPocket = (wasBlocked && freed)
        ? 'and a body standing inside solid rock — which can never path off the tile it is on — is put back on open ground rather than shoving at the stone for the rest of the game'
        : `!! startedBlocked=${wasBlocked} endedFree=${freed}`;
      for (const k of ring) blocked.delete(k);
      blocked.delete(bkey(bx, by));
      wipe();
    });

    /* ---------- 3. AND IT LEAVES A BODY THAT IS FINE ALONE ----------
       The important half. An escalation that fires on ordinary travel would send every unit in
       the game on detours it did not need, and would look like the pathing getting worse. */
    guard(['butAnOrdinaryWalkIsUntouched', 'andArrivalIsStillArrival'], () => {
      wipe();
      const me = player()[0];
      const q = findOpenNear(me.x + 30, me.y + 18, 8);
      const c = body(me.x + 1, me.y + 1);
      const before = UN();
      const got = walk(c, q.x, q.y, 90);
      R._plain = `an open-country walk of ${dist(me.x, me.y, q.x, q.y).toFixed(0)} tiles: arrived=${got.got} after ${got.at.toFixed(0)}s, ${UN() - before} escalations`;
      R.butAnOrdinaryWalkIsUntouched = (UN() === before)
        ? `and a body walking ${dist(me.x, me.y, q.x, q.y).toFixed(0)} tiles of open country never escalates once — the fallback is for bodies going nowhere, not a tax on everybody`
        : `!! AN ORDINARY WALK ESCALATED ${UN() - before} TIMES`;
      R.andArrivalIsStillArrival = got.got
        ? `and it arrives, in ${got.at.toFixed(0)} seconds — the detour never fires on it and travel still reports the journey finished`
        : `!! IT NEVER ARRIVED (${got.at.toFixed(0)}s)`;
      wipe();
    });

    return R;
  });

  const bad = Object.values(out).filter(v => typeof v === 'string' && v.startsWith('!!'));
  for (const [k, v] of Object.entries(out)) console.log('  ' + (k.startsWith('_') ? ('· ' + k.slice(1)).padEnd(32) : k.padEnd(32)) + ' ' + v);
  for (const e of errs) console.log('  ' + e);
  console.log('');
  console.log(bad.length || errs.length ? `THEY ARE STILL SHOVING AT THE ROCK (${bad.length + errs.length})`
                                        : 'A BODY GETTING NOWHERE TRIES SOMETHING ELSE, AND ONE THAT IS FINE IS LEFT ALONE');
  await b.close();
  process.exit(bad.length || errs.length ? 1 : 0);
})();
