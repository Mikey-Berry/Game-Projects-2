#!/usr/bin/env node
/* FIRE THAT LOOKS LIKE FIRE, AND A BEAST THAT FIGHTS LIKE ONE.
 *
 *   "The Wyrms have zero animations while fighting. So it just kind of looks like they walk
 *    around and everything dies around them. They're a good enemy, just aesthetically lacking."
 *
 *   "Fire and magic in general is lacklustre right now. There needs to be more flair to it,
 *    more eye candy. Fire should not just be a sprinkling of red pixels, but evoke the feel of
 *    actual flame."
 *
 * Both were true and both were one line of code. The beast rig animated a leg swing WHILE
 * MOVING and nothing in it ever moved otherwise — no windup, no strike, no head — so a grazer
 * and a war-wyrm fought identically, which is to say neither of them did. And `addSpecks` is
 * the entire visual language of every effect in the game: 3-pixel SQUARES of one flat colour on
 * random vectors, fading linearly, with DOWNWARD acceleration — which is the one thing fire
 * does not do.
 *
 * THESE ARE VISUAL CLAIMS AND THEY ARE ASKED OF THE SIMULATION BEHIND THE PICTURE — where the
 * particles go, what colour they are at each point of their life, and which joints move on which
 * frame. A screenshot cannot fail a build; a rising particle can.
 *
 *   1. flame RISES and keeps rising — the speck it replaces falls
 *   2. it COOLS along a ramp: white at the root, orange through the middle, smoke at the end
 *   3. it SWELLS and thins rather than staying one size
 *   4. a thing on fire burns every frame, not once per damage tick
 *   5. and none of it touches the seeded stream — this file has lost an afternoon to that once
 *   6. a beast winding up a blow moves: head back and up, front legs off the ground
 *   7. and it follows through — the head ends up forward of where it started
 *   8. a beast with nothing to fight is not doing any of that
 *
 * Anything starting '!!' fails the build.
 *
 *   node tools/flare.js [game.html]
 */
const { chromium } = require('playwright');
const path = require('path');
const gamePath = (a) => path.resolve(a ? (path.isAbsolute(a) ? a : path.join(__dirname, a)) : path.join(__dirname, 'game.html'));

(async () => {
  const b = await chromium.launch({
    executablePath: process.env.DUSTWARD_CHROME || undefined,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'],
  });
  const p = await b.newPage({ viewport: { width: 1000, height: 640 } });
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message.slice(0, 200)));
  await p.goto('file://' + gamePath(process.argv[2]), { waitUntil: 'load' });
  await p.waitForTimeout(3000);
  await p.evaluate(() => { document.getElementById('btn-start').click(); });
  await p.waitForTimeout(3000);

  const out = await p.evaluate(async () => {
    const R = {};
    const guard = (keys, fn) => {
      try { fn(); } catch (e) { for (const k of keys) if (R[k] === undefined) R[k] = '!! ' + String(e.message).slice(0, 130).toUpperCase(); }
    };
    if (typeof addFlame !== 'function') {
      for (const k of ['itRises', 'itCools', 'itSwells', 'itBurnsEveryFrame', 'itSpendsNoDice'])
        R[k] = '!! THIS BUILD HAS NO FLAME AT ALL';
    } else {
      paused = true;
      /* ---- 1. IT RISES ---- */
      guard(['itRises'], () => {
        particles.length = 0;
        addFlame(300, 300, 10, 1);
        const flame = particles.filter(q => q.kind === 'flame');
        const h0 = flame.map(q => q.h);
        for (let i = 0; i < 12; i++) updateParticles(1 / 30);
        const rose = flame.filter((q, i) => q.h > h0[i] + 0.05).length;
        const climbing = flame.filter(q => q.vh > 0).length;
        /* and the ordinary speck, for contrast, from the same starting height.

           THE BAR HERE IS THE SIGN OF THE VELOCITY, NOT THE COUNT OF WHO ENDED UP LOW, and the
           first draft of this claim got that wrong in the way the ledger keeps warning about.
           `addSpecks` opens with `vh: rnd()*2.5`, so whether a given speck is BELOW where it
           started after the window is a roll: gravity is 6 and the window is 14 updates long,
           which takes 2.8 off the velocity and puts the break-even launch at v0 = 1.4 — 56% of
           a uniform [0, 2.5). Asking for "more than half of ten" was therefore a 47% coin flip
           and it duly came up tails. What is NOT a roll is that 2.8 exceeds every launch speed
           the function can produce, so EVERY speck ends the window travelling downward, and a
           flame tongue's `vh` only ever decays toward zero and so can never change sign. That
           is the actual difference between buoyant and ballistic, and it holds on every seed. */
        particles.length = 0;
        addSpecks(300, 300, '#ff8a3a', 10);
        const sp = particles.slice();
        const s0 = sp.map(q => q.h);
        for (let i = 0; i < 16; i++) updateParticles(1 / 30);
        const falling = sp.filter(q => q.vh < 0).length;
        const fell = sp.filter((q, i) => q.h <= s0[i]).length;
        R.itRises = (rose === flame.length && climbing === flame.length && falling === sp.length)
          ? `all ${flame.length} tongues climb and are still climbing when they go out, while all `
            + `${sp.length} ordinary specks are travelling downward by then (${fell} already back `
            + `below where they were thrown from) — buoyant, not ballistic`
          : `!! FLAME DOES NOT RISE (${rose}/${flame.length} climbed, ${climbing}/${flame.length} `
            + `still rising; ${falling}/${sp.length} specks falling)`;
      });

      /* ---- 2. IT COOLS ---- */
      guard(['itCools'], () => {
        const root = flameRGB(0), mid = flameRGB(0.45), end = flameRGB(1);
        const lum = (c) => c[0] * 0.3 + c[1] * 0.6 + c[2] * 0.1;
        /* white-hot at the root; orange in the middle means red clearly over blue; dim at the end */
        const hot = lum(root) > 0.85 && root[2] > 0.6;
        const orange = mid[0] > 0.8 && mid[1] > 0.25 && mid[1] < 0.75 && mid[2] < 0.3;
        const cold = lum(end) < 0.30;
        R.itCools = (hot && orange && cold)
          ? `the ramp travels white (lum ${lum(root).toFixed(2)}) to orange (${mid.map(v=>v.toFixed(2)).join('/')}) to smoke (lum ${lum(end).toFixed(2)}) — a flame is not a colour, it is a journey between three`
          : `!! THE RAMP IS NOT A FLAME (root ${root.map(v=>v.toFixed(2))}, mid ${mid.map(v=>v.toFixed(2))}, end ${end.map(v=>v.toFixed(2))})`;
      });

      /* ---- 3. IT SWELLS ---- */
      guard(['itSwells'], () => {
        particles.length = 0;
        addFlame(300, 300, 8, 1);
        const f = particles.filter(q => q.kind === 'flame');
        const grows = f.filter(q => q.r1 > q.r0 * 1.6).length;
        R.itSwells = grows === f.length
          ? `every tongue opens out as it climbs — r0 to r1 is a widening of ${(f[0].r1 / f[0].r0).toFixed(1)}x, so a fire has a shape rather than a size`
          : `!! ${f.length - grows} OF ${f.length} TONGUES DO NOT SWELL`;
      });

      /* ---- 5. AND IT SPENDS NO DICE ----
         The one that matters most and looks like the least. `addFlame` is called from the DRAW
         loop, at whatever rate the machine paints. If it drew from `rnd()` — the seeded stream
         the whole simulation rides on — the frame rate would perturb the world, which is a fault
         this file has already spent an afternoon on once, under `updateDust`. */
      guard(['itSpendsNoDice'], () => {
        const before = seed;
        addFlame(300, 300, 30, 1.4);
        addGlow(300, 300, '#a970e8', 30, 1.4);
        const after = seed;
        particles.length = 0;
        R.itSpendsNoDice = before === after
          ? 'and sixty motes of fire and magic move the seeded stream not one step — they draw from `vrnd`, so the frame rate cannot reach the world'
          : '!! THE DECORATION IS DRAWING FROM THE SIMULATION\'S OWN DICE';
      });
    }

    /* ---- 4. A THING ON FIRE BURNS EVERY FRAME ----
       Driven through the real draw, because that is where the emitter lives: the old effects
       fired once per damage TICK and a body burning to death flickered like a fault. */
    const me = player().find(c => c.state === 'ok');
    R.__burn = null;
    if (me) {
      me.dot = {t: 999, tick: 0.4, dps: 0.01, src: null};
      particles.length = 0;
      paused = false;
    }
    return R;
  });

  /* let the page actually paint, then count what the draw put out */
  await p.waitForTimeout(1200);
  Object.assign(out, await p.evaluate(() => {
    const R = {};
    const flames = particles.filter(q => q.kind === 'flame').length;
    R.itBurnsEveryFrame = flames >= 4
      ? `a body on fire is carrying ${flames} live tongues at any moment — emitted by the draw, so it burns continuously instead of puffing once per damage tick`
      : `!! A BURNING BODY IS NOT ON FIRE (${flames} tongues)`;
    const me = player().find(c => c.state === 'ok');
    if (me) me.dot = null;
    return R;
  }));

  /* ---- 6, 7, 8. THE BEAST ---- */
  Object.assign(out, await p.evaluate(async () => {
    const R = {};
    paused = true;
    /* ---------- STAGED WHERE THE CAMERA ALREADY IS ----------
       A rig is built the first time the renderer LOOKS at a body, so a wyrm put down in open
       waste four hundred tiles away has no rig and the first cut of this claim reported "could
       not reach the wyrm's rig" about a build where the animation worked perfectly. Moving the
       camera to it afterwards is not enough either — the fog and the chunk culling both get a
       vote. It stands next to the party, which is where the camera is, and the claim is about
       which joints move rather than about where the thing is standing. */
    const me0 = player().find(c => c.state === 'ok') || player()[0];
    const gx = me0.x + 2.5, gy = me0.y;
    const wy = makeChar('Probe Wyrm', 'wild', gx, gy, {atk: 20, def: 10, tough: 40, ath: 6});
    wy.floor = me0.floor || 0; wy.beast = true; wy.kin = 'wyrm'; wy.big = 2.2; wy.fauna = true;
    wy.neutral = true; wy.blood = wy.maxBlood = 4000;
    chars.push(wy);
    const foe = makeChar('Probe Meat', 'player', gx + 1.2, gy, {atk: 2, def: 2, tough: 20});
    foe.floor = wy.floor; foe.blood = foe.maxBlood = 4000; chars.push(foe);
    rebuildCharGrid();
    camFollow = false; camX = gx; camY = gy;
    paused = false;
    for (let i = 0; i < 10; i++) await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    paused = true;
    window.__wy = wy; window.__foe = foe;
    return R;
  }));

  /* the rig lives in the renderer's own table; read it by driving the real draw */
  Object.assign(out, await p.evaluate(async () => {
    const R = {};
    const wy = window.__wy, foe = window.__foe;
    const snap = () => {
      /* find this body's rig by walking the scene for the group the renderer parked it in */
      /* `charMeshes`, keyed by id — the renderer builds a rig the first time a body is looked
         at and parks it there. Naming it `meshes` on the first cut simply found nothing. */
      return (typeof charMeshes !== 'undefined') ? charMeshes.get(wy.id) : null;
    };
    let e = snap();
    R.__found = !!e;
    if (!e) { R.aBeastWindsUp = '!! COULD NOT REACH THE WYRM\'S RIG'; R.andFollowsThrough = '!! NO RIG'; R.andIsStillWhenIdle = '!! NO RIG'; return R; }
    const read = () => ({ headY: e.head ? e.head.position.y : 0, headZ: e.head ? e.head.position.z : 0,
                          headX: e.head ? e.head.rotation.x : 0, legL: e.legL ? e.legL.rotation.x : 0 });
    /* ---------- DRAW WITHOUT STEPPING ----------
       The rig is posed by the DRAW and the windup is consumed by the SIM, and the first cut of
       this ran a sim step to get a frame — so `c.windup.t` went to zero and the field was gone
       before anything was painted. Every read came back at the rest pose and the claim reported
       a wyrm that does not wind up, about a build where it does. The page renders while paused;
       only `update` stops. So the windup is held still and the frames are pure draws. */
    const frame = async () => { camFollow = false; camX = wy.x; camY = wy.y; paused = true;
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); };

    /* ---- 8. IDLE, WITH NOTHING TO FIGHT ---- */
    wy.target = null; wy.windup = null;
    await frame();
    const idle = read();

    /* ---- 6. WINDING UP ---- */
    wy.target = foe;
    wy.windup = {t: 0.04, kind: 'melee', tgt: foe.id, dur: 1.0, mv: 'slash'};   /* held at k = 0.96 */
    await frame();
    const wound = read();

    /* ---- 7. AND THE FOLLOW-THROUGH ---- */
    wy.windup = null;
    await frame();
    const struck = read();

    /* ---- 8b. AND THEN IT PUTS ITSELF BACK ----
       `strikeT` drains by the render dt, so this needs real frames, not a re-read. */
    wy.target = null; wy.windup = null;
    for (let i = 0; i < 40; i++) await frame();
    const settled = read();

    R.aBeastWindsUp = (wound.headY > idle.headY + 0.05 && wound.headZ < idle.headZ - 0.02 && wound.legL < idle.legL - 0.15)
      ? `a wyrm winding up rears: head ${(wound.headY - idle.headY).toFixed(2)} higher and ${(idle.headZ - wound.headZ).toFixed(2)} further back, front legs ${(idle.legL - wound.legL).toFixed(2)} off the ground`
      : `!! THE WYRM DOES NOT WIND UP (idle ${JSON.stringify(idle)}, wound ${JSON.stringify(wound)})`;
    R.andFollowsThrough = (struck.headZ > wound.headZ + 0.05 && struck.headX > wound.headX)
      ? `and the strike throws it forward — the head ends ${(struck.headZ - wound.headZ).toFixed(2)} ahead of where it coiled, driven down through the blow`
      : `!! THERE IS NO FOLLOW-THROUGH (wound ${JSON.stringify(wound)}, struck ${JSON.stringify(struck)})`;
    /* THE GUARD, AND WHAT IT CAN AND CANNOT SAY.
       Its job is to stop the animation being "added" by simply leaving the rig permanently
       reared — a pose that looks like a fight in a screenshot and like a statue in play. But it
       can only speak about a build that moves the head at all: on one that never poses anything,
       every reading is the rest pose and the comparison is vacuously true. The first cut of this
       measured against `e._headY0`, a field that only the new code writes, so on the control it
       compared the idle pose to itself and reported green about a build with no animation in it.
       So: if nothing moved between idle and wound, say that, rather than claiming a pass. */
    const posed = Math.abs(wound.headY - idle.headY) > 1e-6 || Math.abs(wound.headZ - idle.headZ) > 1e-6;
    const back = Math.abs(settled.headY - idle.headY) < 0.02 && Math.abs(settled.headZ - idle.headZ) < 0.02
                 && Math.abs(settled.headX - idle.headX) < 0.02;
    R.andIsStillWhenIdle = !posed
      ? '-- cannot speak: this build never moves the head, so there is no permanent pose to guard against'
      : back
        ? `and it puts itself back — forty frames after the blow the head is within `
          + `${Math.max(Math.abs(settled.headY - idle.headY), Math.abs(settled.headZ - idle.headZ)).toFixed(3)} `
          + 'of where it rested, so the rear is a fight pose and not a new resting shape'
        : `!! IT STAYS REARED AT NOTHING (rest ${JSON.stringify(idle)}, settled ${JSON.stringify(settled)})`;
    return R;
  }));

  console.log('=== FIRE THAT LOOKS LIKE FIRE ===\n');
  for (const [k, v] of Object.entries(out)) if (!k.startsWith('__') && !k.startsWith('_')) console.log('  ' + k.padEnd(24) + v);
  const bad = Object.values(out).map(String).filter(v => v.startsWith('!!'));
  if (errs.length) { console.log(''); errs.slice(0, 4).forEach(e => console.log('  ' + e)); }
  console.log('\n' + (bad.length || errs.length
    ? '*** ' + [...bad, ...errs].join('\n*** ')
    : 'IT BURNS, AND THE BEAST FIGHTS'));
  await b.close();
  process.exit(bad.length || errs.length ? 1 : 0);
})();
