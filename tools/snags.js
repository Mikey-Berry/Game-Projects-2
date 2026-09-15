#!/usr/bin/env node
/* SEVEN THINGS THAT WERE REPORTED IN ONE BREATH.
 *
 * They have nothing in common except that a player hit all of them in one session, so they are
 * asked in one file rather than seven. Each claim carries the sentence that produced it.
 *
 *   1. "The leader of Hollowmere's name fluctuates between high warden and elder sometimes.
 *       Then randomly decides on one."
 *      `Array.prototype.sort` SORTS IN PLACE, and the caravan's night-shelter line called it on
 *      the global `towns` array. A town is stored as an INDEX in `isLeader`, `warF` and `warT`,
 *      so one caravan bedding down re-pointed every leader in the world at a different town.
 *
 *   2. "The walls of Copperhold don't always do their job — you can walk right through them at
 *       certain points."
 *      `raiseMountains` carved its trails open AFTER `placeTownAt` laid the ring, and Copperhold
 *      is the one walled town with mountains placed around it on purpose. THE CLAIM IS A
 *      WHOLE-WORLD INVARIANT AND NOT A COPPERHOLD ONE, because whether a trail happens to land
 *      on masonry is a draw: measured on the old build, the default seed leaks 4 tiles, seed 91
 *      leaks 8, and seeds 7 and 404 leak none at all. A claim written against Copperhold's four
 *      tiles would pass on two thirds of the worlds with the bug still in them. Every wall tile
 *      of every walled town is asked of `isBlocked`, which is the function feet ask.
 *
 *   3. "With the harvest job active, it appears I can harvest dead things from underground
 *       layers too." — `dist` is x/y and has never had a storey in it.
 *
 *   4. "Going from attended to seen usually happens very quickly. There should be a bit more of
 *       a curve. (This happened to me at around 13 risen.)"
 *
 *   5. "It would be nice if the d'Alagadda family's road cloaks were always black."
 *
 *   6. "After raising a dark-gifted squad member as an undead they keep their alchemy, right?
 *       Except they can't use binding circles."
 *
 *   7. "You can still research lichdom the old way as long as you don't talk to the demilich."
 *
 * Anything starting '!!' fails the build.
 *
 *   node tools/snags.js [game.html]
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
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message.slice(0, 200)));
  await p.goto('file://' + gamePath(process.argv[2]), { waitUntil: 'load' });
  await p.waitForTimeout(3000);
  await p.evaluate(() => { document.getElementById('btn-start').click(); paused = true; });
  await p.waitForTimeout(3000);

  const out = await p.evaluate(() => {
    const R = {};
    paused = true;
    const DT = 1 / 30;

    /* ---- 1. A LEADER'S TOWN IS AN INDEX, AND THE ARRAY MUST NOT MOVE ----
       Asked as the thing the player SAW: who each leader is the leader of, before and after a
       caravan beds down for the night. The order of `towns` is the mechanism; the titles are
       the symptom, and a claim about the symptom cannot be satisfied by moving the bug. */
    {
      const nameOf = () => chars.filter(c => c.isLeader !== undefined && c.isLeader !== null && towns[c.isLeader])
        .map(c => c.name + ' of ' + towns[c.isLeader].name);
      const order = towns.map(t => t.name).join('|');
      const before = nameOf().join('|');
      /* a wagon, at night, a long way from the nearest town — the exact call site */
      const wasHour = hour;
      hour = 23;
      const cv = makeChar('Probe Wagon', 'town', 700, 700, { atk: 2, def: 2, tough: 8, ath: 4 });
      cv.__probe = true; cv.floor = 0; cv.caravan = { waitT: 0, leg: 0 }; chars.push(cv);
      rebuildCharGrid();
      for (let i = 0; i < 60; i++) { cv.state = 'ok'; ai(cv, DT); }
      const after = nameOf().join('|');
      const order2 = towns.map(t => t.name).join('|');
      hour = wasHour;
      for (let i = chars.length - 1; i >= 0; i--) if (chars[i].__probe) chars.splice(i, 1);
      rebuildCharGrid();
      const moved = order !== order2;
      R.aLeaderKeepsTheirTown = (!moved && before === after && before.length)
        ? `${before.split('|').length} leaders still lead the towns they led after a caravan bedded down for the night`
        : `!! THE TOWNS WERE REORDERED BY A CARAVAN (array moved ${moved}) — e.g. ${before.split('|')[0]} became ${after.split('|')[0] || 'nobody'}`;
    }

    /* ---- 2. A WALL THAT IS NOT BLOCKED IS NOT A WALL ----
       Every wall tile of every walled town, asked of `isBlocked` — which is the function the
       player's feet ask. One hole is a hole. */
    {
      const holes = [];
      for (const t of towns) for (const w of (t.walls || []))
        if (!isBlocked(w.x + 0.5, w.y + 0.5, 0)) holes.push(t.name + ' ' + w.x + ',' + w.y);
      const walled = towns.filter(t => (t.walls || []).length).length;
      R.theWallsHoldAllRound = holes.length === 0
        ? `every tile of every wall on ${walled} walled towns is blocked — ${towns.reduce((a, t) => a + (t.walls || []).length, 0)} of them`
        : `!! ${holes.length} WALL TILES YOU CAN WALK THROUGH — ${holes.slice(0, 5).join(' · ')}`;
    }

    /* ---- 3. A HARVESTER DOES NOT REACH THROUGH THE FLOOR ----
       Two corpses: one directly under the hand three storeys down, one on its own floor and
       further away. The near one is the trap — the old scan is x/y and would take it. */
    {
      const me = player()[0];
      const spot = { x: Math.round(me.x) + 20, y: Math.round(me.y) + 20 };
      const hand = makeChar('Probe Reaper', 'player', spot.x, spot.y, { atk: 3, def: 3, tough: 8 });
      hand.__probe = true; hand.floor = 0; hand.job = 'carrion'; hand.job2 = null; chars.push(hand);
      clearOrders(hand);
      const mkBody = (x, y, f) => {
        const c = makeChar('Probe Carrion ' + f, 'bandit', x, y, { atk: 1, def: 1, tough: 5 });
        c.__probe = true; c.floor = f; c.state = 'dead'; c.deadAt = day - 0.02; c.blood = 0;
        chars.push(c); corpses.push(c); return c;
      };
      const below = mkBody(spot.x + 1, spot.y, -3);        /* one tile away, three storeys down */
      const same = mkBody(spot.x + 12, spot.y, 0);         /* twelve tiles away, same storey */
      rebuildCharGrid();
      hand.carrScanT = 0;
      for (let i = 0; i < 4; i++) { hand.state = 'ok'; hand.carrScanT = 0; physics(hand, DT); }
      const got = hand.carrBody;
      R.theHarvestStaysOnItsFloor = (got === same)
        ? 'a hand set to HARVEST walks twelve tiles to a body on its own floor rather than one tile to a body three storeys down'
        : `!! IT REACHED THROUGH THE FLOOR — it picked ${got ? (got === below ? 'the corpse three storeys below it' : got.name) : 'nothing at all'}`;
      for (let i = corpses.length - 1; i >= 0; i--) if (corpses[i].__probe) corpses.splice(i, 1);
      for (let i = chars.length - 1; i >= 0; i--) if (chars[i].__probe) chars.splice(i, 1);
      rebuildCharGrid();
    }

    /* ---- 4. THE LADDER IS A CURVE ----
       Counted in RAISINGS, which is the unit the report is in: "this happened to me at around
       13 risen". A plain raising is 1.15 points. The shape wanted is easy to get noticed and
       hard to get SEEN, so each step has to cost meaningfully more than the last. */
    {
      const wasN = noticed, wasT = noticeTier;
      noticed = 0; noticeTier = 0;
      const at = [];
      for (let i = 1; i <= 400 && at.length < 3; i++) {
        bumpNotice(1.15);                        /* one ordinary raising, the figure the report used */
        if (noticeTier === at.length + 1) at.push(i);
      }
      noticed = wasN; noticeTier = wasT;
      const [w, a2, s] = at;
      const steps = at.length === 3 ? [w, a2 - w, s - a2] : null;
      R.theLadderIsACurve = (steps && steps[1] > steps[0] * 1.8 && steps[2] > steps[1] * 1.4)
        ? `WATCHED at ${w} raisings, ATTENDED ${steps[1]} later, SEEN ${steps[2]} after that — each rung costs about double the one below it`
        : `!! THE RUNGS ARE A STRAIGHT LINE (${at.join(', ')} raisings; steps ${steps ? steps.join(', ') : 'never reached'})`;
      R.andGettingNoticedIsEasy = (w && w <= 13)
        ? `and the first rung is cheap — ${w} raisings turns a head, which is the half of the report that asked for less, not more`
        : `!! NOTHING NOTICES A THIRTEEN-STRONG HOST (first rung at ${w || 'never'})`;
    }

    /* ---- 5. ONE HOUSE DOES NOT WEAR ROAD BROWN ----
       Asked of the built rig, not of the string that builds it: two identical bodies in the
       same Road Cloak, one marked to the house, and their meshes compared. The cache key is
       checked in the same breath because two bodies that differ only in house and share a key
       get each other's rig — which is the exact bug this file has already recorded twice. */
    {
      /* ONE BODY, BUILT TWICE. Skin, hair and cloth are hashed off `c.id`, so two different
         bodies differ in a dozen colours and the claim would be reading noise. The same body
         with the house flag flipped differs in exactly one thing. */
      const subj = makeChar('Probe Cloak', 'player', 4, 4, { atk: 3, def: 3, tough: 8 });
      subj.__probe = true; subj.floor = 0; subj.cloak = 'k_road'; subj.house = null;
      /* THE AUTHORED COLOUR IS A VERTEX ATTRIBUTE BY THE TIME THE RIG EXISTS. `obox` bakes its
         boxes into merged buckets with one white material and per-vertex colour, so reading
         `material.color` off the rig returns white and reading `_bc` off the proxies returns
         two colours out of fourteen — measured, both, before this landed on the right one. */
      const colours = (c) => {
        const out = new Set();
        buildCharMesh(c).g.traverse(o => {
          const a = o.geometry && o.geometry.attributes && o.geometry.attributes.color;
          if (!a) return;
          for (let i = 0; i < a.count; i++) {
            const h = (Math.round(a.getX(i) * 255) << 16) | (Math.round(a.getY(i) * 255) << 8) | Math.round(a.getZ(i) * 255);
            out.add('#' + h.toString(16).padStart(6, '0'));
          }
        });
        return out;
      };
      const keyPlain = typeof colorKeyOf === 'function' ? colorKeyOf(subj) : '';
      const cp = colours(subj);
      subj.house = 'alagadda';
      const keyNoble = typeof colorKeyOf === 'function' ? colorKeyOf(subj) : '';
      const cn = colours(subj);
      const keys = [keyPlain, keyNoble];
      const BLACK = '#1c1a1e', BROWN = '#4a3b2c';
      R.theHouseWearsBlack = (cp.has(BROWN) && cn.has(BLACK) && !cn.has(BROWN))
        ? 'the same Road Cloak is road brown on a stranger and black on a body marked to the house'
        : `!! THE CLOAK IS THE SAME ON BOTH (stranger brown ${cp.has(BROWN)}, house black ${cn.has(BLACK)}, house still brown ${cn.has(BROWN)})`;
      R.andTheyDoNotShareARig = keys[0] !== keys[1]
        ? 'and they do not share a mesh-cache key, so neither ever wears the other\'s coat'
        : '!! TWO BODIES DIFFERING ONLY IN HOUSE SHARE A CACHE KEY';
      /* and it is livery, not gear, so a reload keeps it */
      const me = player()[0];
      const wasHouse = me.house;
      me.house = 'alagadda';
      const snap = snapshot();
      me.house = null;
      restore(snap);
      const back = charById.get(me.id) || player().find(c => c.name === me.name);
      R.andTheLiverySurvivesALoad = (back && back.house === 'alagadda')
        ? 'and the house is written to the save, so a reload does not put the prince back in a tan coat'
        : `!! THE HOUSE IS LOST ON RELOAD (${back ? back.house : 'body gone'})`;
      const me2 = player().find(c => c.name === me.name); if (me2) me2.house = wasHouse || null;
    }

    /* ---- 6. A RISEN CASTER KEEPS THE ART IT DIED WITH ----
       The circle refused a dark-gifted lieutenant for being dead. Asked through `openBinding`,
       which is the door the player uses, rather than through the predicate inside it. */
    {
      const me = player()[0];
      const circle = { type: 'circle', x: Math.round(me.x) + 30, y: Math.round(me.y) + 30, w: 2, h: 2,
                       floor: 0, hp: 90, maxHp: 90, progress: 1, __probe: true };
      pBuilds.push(circle);
      const dead = makeChar('Probe Lieutenant', 'player', circle.x + 1, circle.y + 1,
                            { atk: 6, def: 6, tough: 12, magic: 30 });
      dead.__probe = true; dead.floor = 0; dead.gift = 'dark';
      dead.undead = true; dead.lieutenant = true; dead.lich = false;
      chars.push(dead); rebuildCharGrid();
      /* nobody living is anywhere near it, so the only candidate is the risen one */
      const living = player().filter(c => c !== dead && c.state === 'ok' && dist(c.x, c.y, circle.x + 1, circle.y + 1) < 6);
      for (const c of living) { c.__moved = { x: c.x, y: c.y }; c.x += 200; }
      rebuildCharGrid();
      document.getElementById('modal').style.display = 'none'; modalOpen = false;
      openBinding(circle);
      const opened = modalOpen && /BINDING/i.test(document.getElementById('modaltitle').textContent);
      const sub = document.getElementById('modalsub').textContent;
      document.getElementById('modalclose').click();
      for (const c of player()) if (c.__moved) { c.x = c.__moved.x; c.y = c.__moved.y; delete c.__moved; }
      R.aRisenCasterHoldsALeash = (opened && sub.includes('Probe Lieutenant'))
        ? 'a dark-gifted lieutenant that came back dead opens the circle it was locked out of'
        : `!! THE CIRCLE STILL REFUSES A RISEN CASTER (opened ${opened}, ritualist "${sub.slice(0, 60)}")`;
      for (let i = chars.length - 1; i >= 0; i--) if (chars[i].__probe) chars.splice(i, 1);
      for (let i = pBuilds.length - 1; i >= 0; i--) if (pBuilds[i].__probe) pBuilds.splice(i, 1);
      rebuildCharGrid();
    }

    /* ---- 7. THE DEMILICH IS THE ONLY ROAD ----
       The rite was never actually acquirable this way — `researchBegin` refuses — but the LIST
       grew a QUEUE button with a price on it the moment anything else was running, which is a
       gate that reads as the intended path. Asked in both states of the bench, because the bug
       was that one state told the truth and the other did not. */
    {
      const wasA = research.active, wasQ = research.queue.slice(), wasDone = research.done;
      const bench = { type: 'r_bench', x: 4, y: 4, w: 2, h: 2, floor: 0, hp: 9, maxHp: 9, progress: 1, __probe: true };
      pBuilds.push(bench);
      research.done = { ...research.done };
      for (const k of ['construction', 'rites_binding', 'rites_deep', 'necromancy', 'alchemy']) if (TECHS[k]) research.done[k] = true;
      research.rp = 9999; cats = 99999;
      const rowFor = () => {
        openResearch();
        const html = document.getElementById('modalbody').innerHTML;
        document.getElementById('modalclose').click();
        const i = html.indexOf('The Last Rite');
        return i < 0 ? '' : html.slice(i, i + 420);
      };
      research.active = null; research.queue.length = 0;
      const idle = rowFor();
      research.active = 'construction'; research.queue.length = 0;
      const busy = rowFor();
      research.active = wasA; research.queue.length = 0; for (const k of wasQ) research.queue.push(k);
      research.done = wasDone;
      for (let i = pBuilds.length - 1; i >= 0; i--) if (pBuilds[i].__probe) pBuilds.splice(i, 1);
      const favour = /walked this road first/;
      const button = /data-q="last_rite"|>START/;
      R.theDemilichIsTheOnlyRoad = (favour.test(idle) && favour.test(busy) && !button.test(idle) && !button.test(busy))
        ? 'The Last Rite asks for the favor of the one who walked the road first — with the bench idle and with a project already running'
        : `!! IT IS STILL OFFERED FOR SALE (idle: ${favour.test(idle) ? 'gated' : 'buyable'}, busy: ${favour.test(busy) ? 'gated' : 'buyable'})`;
    }
    return R;
  });

  console.log('=== SEVEN THINGS REPORTED IN ONE BREATH ===\n');
  for (const [k, v] of Object.entries(out)) console.log('  ' + k.padEnd(28) + v);
  const bad = Object.values(out).map(String).filter(v => v.startsWith('!!'));
  if (errs.length) { console.log(''); errs.slice(0, 4).forEach(e => console.log('  ' + e)); }
  console.log('\n' + (bad.length || errs.length
    ? '*** ' + [...bad, ...errs].join('\n*** ')
    : 'SEVEN SNAGS, AND NONE OF THEM SNAGS'));
  await b.close();
  process.exit(bad.length || errs.length ? 1 : 0);
})();
