#!/usr/bin/env node
/* WHAT A STOREY NOBODY IS ON IS ALLOWED TO COST.
 *
 *   "How do games like Kenshi manage a world of that size and yet keep the FPS and overall
 *    impact so low? Any tricks we can pull out?" … "the FPS drop is pretty killer especially
 *    on the laptop."
 *
 * Kenshi's answer is that it does not simulate most of its world, and that what it stops
 * simulating it ABSTRACTS rather than freezes. Measured here before a line was written: of
 * 1,748 bodies alive, 1,133 were on a storey with no player unit anywhere on it — and only 166
 * of those were idle. Twelve hundred bodies were walking and fighting each other four storeys
 * under a player who could not see, reach, or be reached by any of it, and the existing `_far`
 * tier could not help, because it drops a body to 4Hz only when it has no quarry and a gaunt
 * chasing a bandit on the Sump has one.
 *
 * Three changes, and this file is mostly about the two ways they could go wrong quietly:
 *
 *   · A COLD TIER gated on the storey rather than on the body's mood. The risk is a seam the
 *     player can find — something cold that should not be, or time lost on a floor so a body
 *     never arrives.
 *   · `stepToward` BOUNDS A LONG STEP. It tested collision at the destination and nowhere
 *     between, which was exact only while every step was a sixth of a tile. A cold body woken
 *     with a third of a second in hand covers a tile and a half, and would have walked through
 *     chamber rings — the leak this repo has spent a year closing, arriving through the front
 *     door.
 *   · `hostile` IS MEMOISED on a key built from every field it reads. The risk here is the
 *     worst in the file: a key that misses a field makes two bodies interchangeable that are
 *     not, and the failure is SILENT and in the direction of things not fighting that should.
 *     Section 4 exists for that one claim and nothing else.
 *
 * Anything starting '!!' fails the build.
 *
 *   node tools/cold.js [game.html]
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
  const NO_COLD = '!! NOTHING TO MEASURE — this build has no cold tier';
  const NO_MEMO = '!! NOTHING TO MEASURE — this build does not memoise the enmity';

  /* ---- 1. THE WORLD IS MOSTLY SOMEWHERE YOU ARE NOT ----
     The premise, counted rather than assumed. If this ever stops being true the tier below is
     buying nothing and should go. */
  const census = await p.evaluate(() => {
    for (let i = 0; i < 60; i++) update(1 / 30);
    const alive = chars.filter(c => c.state !== 'dead');
    const pl = alive.filter(u => u.faction === 'player');
    const warm = new Set(pl.map(u => u.floor || 0));
    const cold = alive.filter(c => c._cold);
    return {
      alive: alive.length, warmFloors: [...warm],
      offWarmFloors: alive.filter(c => !warm.has(c.floor || 0)).length,
      cold: cold.length,
      coldMoving: cold.filter(c => c.moveTarget || (c.path && c.path.length)).length,
      coldFighting: cold.filter(c => c.target || c.windup).length,
      coldByFloor: cold.reduce((a, c) => { a[c.floor || 0] = (a[c.floor || 0] || 0) + 1; return a; }, {}),
      coldOnAWarmFloor: cold.filter(c => warm.has(c.floor || 0)).length,
      coldAndYours: cold.filter(c => c.faction === 'player').length,
      hasFlag: alive.some(c => c._cold !== undefined),
    };
  });
  R.mostOfTheWorldIsElsewhere = !census.hasFlag ? NO_COLD
    : (census.cold > 200 && census.offWarmFloors > census.alive * 0.3)
    ? `${census.cold} of ${census.alive} bodies are on a storey you are not on — ${census.coldMoving} of them walking and ${census.coldFighting} mid-fight, which is what the old tier could not reach`
    : `!! THE COLD TIER IS BUYING NOTHING (${JSON.stringify(census)})`;
  /* and the two ways it must never be wrong, both asserted as exact zeroes */
  R.andNeverOnYourOwnFloor = !census.hasFlag ? NO_COLD
    : (census.coldOnAWarmFloor === 0 && census.coldAndYours === 0)
    ? `nothing on a storey one of yours is standing on is ever cold, and nothing of yours ever is — 0 and 0, on floors ${JSON.stringify(census.warmFloors)}`
    : `!! SOMETHING IS COLD THAT SHOULD NOT BE (${census.coldOnAWarmFloor} on your floor, ${census.coldAndYours} of yours)`;

  /* ---- 2. AND ONE BODY OF YOURS WARMS A WHOLE STOREY ----
     Driven rather than reasoned about: walk somebody down and watch the floor wake up. This is
     the seam a player would find by walking along it, so it is tested by walking along it. */
  const warmUp = await p.evaluate(() => {
    if (typeof DEPTHS === 'undefined') return null;
    const me = player().find(c => c.state === 'ok');
    if (!me) return null;
    const F = DEPTHS[1];
    const before = chars.filter(c => (c.floor || 0) === F && c.state !== 'dead' && c._cold).length;
    const onF = chars.filter(c => (c.floor || 0) === F && c.state !== 'dead' && c.faction !== 'player').length;
    const h = undercroft.halls.find(H => H.f === F);
    me.x = h.x; me.y = h.y; me.floor = F; me.moveTarget = null; me.target = null;
    for (let i = 0; i < 6; i++) update(1 / 30);
    const after = chars.filter(c => (c.floor || 0) === F && c.state !== 'dead' && c._cold).length;
    /* and the storey below it is still cold — warming is per-floor, not "underground is awake" */
    const deeper = chars.filter(c => (c.floor || 0) === DEPTHS[2] && c.state !== 'dead' && c.faction !== 'player');
    const deeperCold = deeper.filter(c => c._cold).length;
    return { F, onF, before, after, deeper: deeper.length, deeperCold };
  });
  R.oneOfYoursWarmsTheStorey = !warmUp ? NO_COLD
    : (warmUp.before > 20 && warmUp.after === 0 && warmUp.deeperCold === warmUp.deeper && warmUp.deeper > 0)
    ? `walking one body onto ${warmUp.F} wakes all ${warmUp.onF} of them (${warmUp.before} cold → 0) and leaves the storey below it asleep (${warmUp.deeperCold}/${warmUp.deeper})`
    : `!! A STOREY DID NOT WAKE, OR THE WRONG ONE DID (${JSON.stringify(warmUp)})`;

  /* ---- 3. AND NOTHING WALKS THROUGH ROCK, HOWEVER LONG THE STEP ----
     `stepToward` samples the destination and nothing between. At full rate a body covers a
     sixth of a tile and that was always exact; a cold body covers a tile and a half. Driven at
     an absurd `dt` — far longer than the tier will ever hand it — because a bound that only
     holds at the rate it was tuned for is not a bound. */
  const rock = await p.evaluate(() => {
    if (typeof stepToward !== 'function') return null;
    /* ---------- SEARCH THE WHOLE WORLD FOR ONE, NOT THE FIRST ROOM'S TOP ROW ----------
       The first cut looked along `rooms[0]`'s north wall of `caves[0]` and reported NOTHING TO
       MEASURE — a chamber's north ring very often has the approach tunnel arriving at it, so
       the tile either side is open on one and rock on the other. What is wanted is any ring
       tile anywhere with clear floor on BOTH sides along one axis, which is a thing forty-five
       warrens have hundreds of. */
    let wall = null;
    outer:
    for (const cv of caves) for (const rm of (cv.rooms || [])) {
      const F = rm.f;
      for (let x = rm.x0 + 2; x < rm.x1 - 1; x++) {
        for (const y of [rm.y0, rm.y1]) {
          if (!blocked.has(bkey(x, y, F))) continue;
          if (isBlocked(x + 0.5, y - 1.5, F) || isBlocked(x + 0.5, y + 1.5, F)) continue;
          if (isBlocked(x + 0.5, y - 2.5, F) || isBlocked(x + 0.5, y + 2.5, F)) continue;
          wall = { x: x + 0.5, y: y + 0.5, f: F };
          break outer;
        }
      }
    }
    if (!wall) return null;
    const F = wall.f;
    const probe = makeChar('Probe', 'bandit', wall.x, wall.y - 2, { ath: 30 });
    probe.floor = F; probe.noFight = true; probe.__probe = true;
    chars.push(probe);
    const y0 = probe.y;
    const res = [];
    for (const dt of [1 / 30, 0.3, 1.0, 3.0]) {
      probe.x = wall.x; probe.y = y0; probe._pinBy = null;
      stepToward(probe, wall.x, wall.y + 2, dt);
      /* crossed means it ended up on the far side of the wall row */
      res.push({ dt, endY: +probe.y.toFixed(2), crossed: probe.y > wall.y + 0.5 });
    }
    const i = chars.indexOf(probe); if (i >= 0) chars.splice(i, 1);
    return { wall, startY: +y0.toFixed(2), res, moved: res.some(r => r.endY > y0 + 0.3) };
  });
  R.noStepWalksThroughRock = !rock ? '!! NOTHING TO MEASURE — no warren wall to walk at'
    : (!rock.res.some(r => r.crossed) && rock.moved)
    ? `a body aimed through a chamber wall is stopped by it at every step size tried — ${rock.res.map(r => r.dt + 's→' + r.endY).join(', ')} against a wall at ${rock.wall.y}, and it does close on it rather than refusing to move`
    : `!! A LONG STEP WALKED THROUGH ROCK (${JSON.stringify(rock)})`;

  /* ---- 4. AND THE MEMOISED ENMITY IS THE ENMITY ----
     THE CLAIM THIS FILE EXISTS FOR. `hostile` is keyed on a string built from every field the
     rule reads; if that key misses one, two bodies become interchangeable that are not, and the
     failure is silent and in the direction of things NOT fighting that should. So it is not
     argued, it is checked: thousands of real pairs from the live world, memo against raw, both
     orders round. The count of HOSTILE pairs is reported and asserted non-trivial, because a
     comparison where every answer is `false` agrees perfectly and proves nothing. */
  const exact = await p.evaluate(() => {
    if (typeof hostileRaw !== 'function') return null;
    rebuildCharGrid();                       /* keys fresh */
    const alive = chars.filter(c => c.state !== 'dead');
    /* a spread rather than a slice: walk the roster at a stride so the sample crosses every
       faction in the world rather than the first two hundred bodies worldgen happened to make */
    const step = Math.max(1, Math.floor(alive.length / 120));
    const pick = [];
    for (let i = 0; i < alive.length; i += step) pick.push(alive[i]);
    let pairs = 0, agree = 0, hostilePairs = 0;
    const bad = [];
    for (const a of pick) for (const c of pick) {
      if (a === c) continue;
      const m = hostile(a, c), r = hostileRaw(a, c);
      pairs++;
      if (m === r) agree++; else if (bad.length < 4) bad.push({ a: a._hk, b: c._hk, memo: m, raw: r });
      if (r) hostilePairs++;
    }
    return { pairs, agree, hostilePairs, bad, keys: new Set(alive.map(c => c._hk)).size, bodies: alive.length };
  });
  R.theMemoisedEnmityIsTheEnmity = !exact ? NO_MEMO
    : (exact.pairs > 5000 && exact.agree === exact.pairs && exact.hostilePairs > 200)
    ? `${exact.pairs} real pairs, both orders round: the table and the rule agree on every one, and ${exact.hostilePairs} of them are hostile so it is not agreeing about nothing — ${exact.bodies} bodies collapse to ${exact.keys} distinct keys`
    : `!! THE MEMO DISAGREES WITH THE RULE (${exact.pairs - exact.agree} of ${exact.pairs}: ${JSON.stringify(exact.bad)})`;

  /* ---- 4b. AND THE KEY TELLS TWO BODIES APART THAT THE RULE TELLS APART ----
     The section above samples the world as it is; these two are the specific collisions that
     would be catastrophic and that a sample might simply not contain. A concealed risen and a
     bare one are the same body to everything except the one field that decides whether the
     Purge swings at it; a provoked neutral and a calm one likewise. */
  const apart = await p.evaluate(() => {
    if (typeof hKey !== 'function') return null;
    const me = player().find(c => c.state === 'ok');
    const bare = makeChar('Risen A', 'player', me.x + 2, me.y, { tough: 10 });
    const hid = makeChar('Risen B', 'player', me.x + 3, me.y, { tough: 10 });
    bare.undead = true; hid.undead = true; hid.shrouded = true;
    chars.push(bare, hid);
    const kept = (typeof deepFolk !== 'undefined' && deepFolk[0]) || null;
    let calm = null, cross = null;
    if (kept) { calm = hKey(kept); kept.provoked = true; kept.neutral = false; cross = hKey(kept);
                kept.provoked = false; kept.neutral = true; }
    const out = { bare: hKey(bare), hid: hKey(hid), calm, cross };
    for (const c of [bare, hid]) { const i = chars.indexOf(c); if (i >= 0) chars.splice(i, 1); }
    return out;
  });
  R.andTheKeyTellsThemApart = !apart ? NO_MEMO
    : (apart.bare !== apart.hid && apart.calm !== apart.cross)
    ? `a concealed risen and a bare one get different keys (${apart.bare} vs ${apart.hid}), and provoking one of the Kept changes its key (${apart.calm} → ${apart.cross}) — the two collisions that would have been silent`
    : `!! TWO BODIES THE RULE TELLS APART SHARE A KEY (${JSON.stringify(apart)})`;

  /* ---- 5. AND A COLD BODY STILL ARRIVES, AND A COLD FIGHT STILL ENDS ----
     The tier accumulates `dt` and hands it over whole, so nothing should be lost — but "should"
     is the word this repo has been burned by. Both are driven through the real sim. */
  const arrives = await p.evaluate(() => {
    if (typeof DEPTHS === 'undefined') return null;
    /* ---------- MEASURED AS GROUND COVERED, NOT AS AN ORDER OBEYED ----------
       The first cut shoved a `moveTarget` into a gaunt and watched it fail to arrive. That is
       not the cold tier: `moveTarget` is a field the body's OWN ai owns, and it cleared it
       within the second — at any clock rate. A probe that commands an NPC through a field its
       ai overwrites is measuring the ai, and it measured 2.2 tiles of 486 while `physics` was
       being called at exactly the right rate with exactly the right `dt`.
       What the tier actually promises is that time is not LOST — a body on the slow clock gets
       the whole accumulated `dt` handed to it, so it should cover the same ground per second as
       the same bodies on a fast one. So: the same bodies, the same storey, thirty seconds each
       way, with nothing touched but whether one of yours is standing down there. */
    const F = DEPTHS[2];
    const me = player().find(c => c.state === 'ok');
    if (!me) return null;
    const home = { x: me.x, y: me.y, f: me.floor || 0 };
    const h = undercroft.halls.find(H => H.f === F);
    const walked = (secs) => {
      const pool = chars.filter(c => (c.floor || 0) === F && c.state === 'ok' && c.faction !== 'player');
      const p0 = pool.map(c => ({ c, x: c.x, y: c.y }));
      let d = 0;
      for (let i = 0; i < secs * 30; i++) {
        const was = p0.map(o => ({ x: o.c.x, y: o.c.y }));
        update(1 / 30);
        for (let k = 0; k < p0.length; k++) d += dist(was[k].x, was[k].y, p0[k].c.x, p0[k].c.y);
      }
      return { n: pool.length, tiles: +d.toFixed(0), cold: pool.filter(c => c._cold).length };
    };
    me.x = home.x; me.y = home.y; me.floor = home.f;
    const cold = walked(20);
    me.x = h.x - 40; me.y = h.y - 40; me.floor = F; me.noFight = true; me.moveTarget = null;
    for (let i = 0; i < 4; i++) update(1 / 30);
    const warm = walked(20);
    me.x = home.x; me.y = home.y; me.floor = home.f;
    return { cold, warm, ratio: warm.tiles ? +(cold.tiles / warm.tiles).toFixed(2) : 0 };
  });
  R.theSlowClockCostsNoGround = !arrives ? NO_COLD
    : (arrives.cold.cold === arrives.cold.n && arrives.warm.cold === 0 && arrives.ratio > 0.6)
    ? `the same ${arrives.cold.n} bodies on the Sump cover ${arrives.cold.tiles} tiles in twenty seconds cold against ${arrives.warm.tiles} warm (${arrives.ratio}x) — the slow clock hands the time over whole rather than dropping it`
    : `!! THE SLOW CLOCK LOSES GROUND (${JSON.stringify(arrives)})`;

  const resolves = await p.evaluate(() => {
    if (typeof DEPTHS === 'undefined') return null;
    /* ---------- TWELVE BODIES AND A TOTAL, NOT TWO BODIES AND A DEATH ----------
       The first cut staged one raider against one quarry and asked whether either died. It is
       far too noisy a question to answer anything with: the same pair on a WARM floor came back
       at 72, 85 and 86 blood on three consecutive runs and never killed anybody either, so the
       red line it printed about the cold floor was describing variance. A melee of twelve,
       scored on total blood lost, and run at the SAME SPOT on the same storey with nothing
       changed but whether one of yours is standing forty tiles away — which is the only
       variable this claim is about. */
    const F = DEPTHS[2];
    const h = undercroft.halls.find(H => H.f === F);
    const me = player().find(o => o.state === 'ok');
    if (!h || !me) return null;
    const home = { x: me.x, y: me.y, f: me.floor || 0 };
    const bout = (warm, secs) => {
      if (warm) { me.x = h.x - 40; me.y = h.y - 40; me.floor = F; }
      else { me.x = home.x; me.y = home.y; me.floor = home.f; }
      me.target = null; me.moveTarget = null; me.noFight = true;
      const all = [];
      for (let k = 0; k < 6; k++) {
        const a = makeChar('R' + k, 'bandit', h.x + k * 0.1, h.y, { atk: 34, def: 10, tough: 24, ath: 12, weapon: 'w_kat' });
        const c = makeChar('Q' + k, 'cannibal', h.x + k * 0.1 + 1.0, h.y, { atk: 30, def: 10, tough: 24, ath: 12, weapon: 'w_club' });
        for (const o of [a, c]) { o.floor = F; o.caveDweller = true; chars.push(o); all.push(o); }
      }
      rebuildCharGrid();
      const b0 = all.reduce((s2, o) => s2 + o.blood, 0);
      for (let i = 0; i < secs * 30; i++) update(1 / 30);
      const alive = all.filter(o => o.state !== 'dead');
      const out = { lost: Math.round(b0 - alive.reduce((s2, o) => s2 + o.blood, 0)),
                    down: all.length - alive.filter(o => o.state === 'ok').length,
                    cold: all.filter(o => o._cold).length };
      for (const o of all) { const i = chars.indexOf(o); if (i >= 0) chars.splice(i, 1); }
      return out;
    };
    const cold = bout(false, 45);
    const warm = bout(true, 45);
    me.x = home.x; me.y = home.y; me.floor = home.f;
    return { cold, warm, ratio: warm.lost ? +(cold.lost / warm.lost).toFixed(2) : 0 };
  });
  R.andAColdFightIsAFight = !resolves ? NO_COLD
    : (resolves.cold.cold === 12 && resolves.warm.cold === 0 && resolves.cold.lost > 8 &&
       resolves.cold.lost >= resolves.warm.lost * 0.5)
    ? `twelve bodies left to it on the Sump take ${resolves.cold.lost} blood off each other in forty-five seconds against ${resolves.warm.lost} for the same fight with somebody watching (${resolves.ratio}x) — nobody is waiting for an audience`
    : `!! A FIGHT ON A COLD STOREY IS NOT A FIGHT (${JSON.stringify(resolves)})`;

  /* ---- 6. AND IT IS ACTUALLY CHEAPER ----
     Reported with the call counts beside it, because the counts hold under suite load and a
     timing does not. The threshold is on the COUNTS. */
  const cost = await p.evaluate(() => {
    for (let i = 0; i < 150; i++) update(1 / 30);
    const real = {}, cnt = {};
    for (const n of ['hostileRaw', 'physics', 'ai']) {
      if (typeof window[n] !== 'function') continue;
      real[n] = window[n]; cnt[n] = 0;
      window[n] = function (...a) { cnt[n]++; return real[n].apply(this, a); };
    }
    const N = 60;
    for (let i = 0; i < N; i++) update(1 / 30);
    for (const n in real) window[n] = real[n];
    const runs = [];
    for (let r = 0; r < 3; r++) { const t0 = performance.now(); for (let i = 0; i < N; i++) update(1 / 30); runs.push((performance.now() - t0) / N); }
    return { ms: +Math.min(...runs).toFixed(2), chars: chars.length,
             physics: Math.round(cnt.physics / N), ai: Math.round(cnt.ai / N),
             hostileRaw: Math.round((cnt.hostileRaw || 0) / N) };
  });
  R.andItIsActuallyCheaper = (cost.physics < 700 && cost.ai < 350 && cost.hostileRaw < 3000)
    ? `${cost.physics} physics and ${cost.ai} ai calls a step over ${cost.chars} bodies, and ${cost.hostileRaw} trips through the enmity rule where there were 8,761 — ${cost.ms}ms a step here`
    : `!! THE WORK DID NOT GO DOWN (${JSON.stringify(cost)})`;

  console.log('=== THE SLOW CLOCK ===\n');
  for (const [k, v] of Object.entries(R)) console.log('  ' + k.padEnd(30) + v);
  const bad = Object.values(R).map(String).filter(v => v.startsWith('!!'));
  console.log('\n' + (bad.length ? '*** ' + bad.join('\n*** ') : 'THE WORLD KEEPS GOING WHERE NOBODY IS LOOKING, AND COSTS ALMOST NOTHING FOR IT'));
  if (errs.length) { console.log('errs:', errs.length); errs.slice(0, 4).forEach(e => console.log('  ' + e)); }
  await b.close();
  if (bad.length) process.exitCode = 1;
})();
