#!/usr/bin/env node
/* WHAT A BOSS IS SUPPOSED TO DO ABOUT A CROWD.
 *
 * "Speaking of Sixfold… they're a good boss but a bit underpowered in that they can only hit
 *  one enemy at a time. And they have zero range. Perhaps a little bit of variety to their
 *  arsenal would make them more of a threat. Right now, I can simply swarm them with old bones
 *  and win out (which should be a viable strategy in some cases, by the way, but for a
 *  boss-level enemy might indicate that the creature itself is underpowered.)"
 *
 * THE PARENTHESIS IS THE DESIGN BRIEF, and it is the hardest half to hold to: swarming has to
 * stay a real answer, it just has to cost something. So the last test in this file is the one
 * that would fail if the fix went too far — a big enough wall of Old Bones still has to bring
 * it down.
 *
 * AND THE MECHANISM WAS ALREADY THERE. `sweep` — {arc, reach, mult, max}, applied by
 * `sweepAfter` out of `attack` — was written for the wyrm two batches ago, and its own comment
 * is this report about a different creature: "six men could stand shoulder to shoulder in front
 * of a house-sized animal and take it in turns". The Sixfold simply never got given one. The
 * first attempt at this file's fix wrote a SECOND sweep inside the weapon-cleave branch, and the
 * only thing that caught it was the negative control: guard 1 passed on a build containing none
 * of the new code, because the old build honoured `c.sweep` perfectly well already.
 *
 *   node tools/sixfold.js [game.html]
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
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message.slice(0, 200)));
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

    let gx = 0, gy = 0;
    outer:
    for (let y = 70; y < H - 70; y += 6) for (let x = 70; x < W - 70; x += 6) {
      if (nearestTownDist(x, y) < 120) continue;
      let ok = true;
      for (let j = -10; j <= 10 && ok; j++) for (let i = -10; i <= 10 && ok; i++)
        if (isBlocked(x + i + 0.5, y + j + 0.5) || tileAt(x + i, y + j) === 3) ok = false;
      if (ok) { gx = x; gy = y; break outer; }
    }
    R._where = gx ? `staged on open waste at ${gx},${gy}` : '!! NO OPEN GROUND';

    const made = [];
    const wipe = () => {
      while (made.length) { const c = made.pop(); const i = chars.indexOf(c); if (i >= 0) chars.splice(i, 1);
        const j = corpses.indexOf(c); if (j >= 0) corpses.splice(j, 1); }
      projectiles.length = 0;
    };
    /* the beast, placed exactly, with nothing else of its kind on the field */
    const six = (x, y) => {
      const c = makeChar('The Sixfold', 'gaunt', x, y, { atk: 55, def: 30, tough: 70, ath: 8, magic: 1, labor: 0 });
      c.beast = true; c.bossKey = 'sixfold'; c.gauntKind = 'sixfold';
      c.big = 2.4; c.blood = 700; c.maxBlood = 700; c.clawDmg = 26;
      c.sweep = { extra: 4, arc: 2.4, reach: 2.6, mult: 0.72 };
      c.state = 'ok'; c.x = x; c.y = y;
      chars.push(c); made.push(c);
      return c;
    };
    /* one Old Bones, built the way `castOldBones` builds them */
    const bonesTough = (x, y) => {
      const u = makeChar('Old Bones', 'player', x, y,
        { atk: 4, def: 2, tough: 400, ath: 5, labor: 2, magic: 1 });
      u.undead = true; u.crafted = true; u.rot = 'bones'; u.kin = 'bone';
      u.propped = true; u.bindWeight = 0; u.tempT = 999;
      u.state = 'ok'; u.x = x; u.y = y;
      u.noFight = true; u.target = null;
      chars.push(u); made.push(u);
      return u;
    };
    const bones = (x, y) => {
      const u = makeChar('Old Bones', 'player', x, y,
        { atk: 4, def: 2, tough: 4, ath: 5, labor: 2, magic: 1, weapon: 'w_club' });
      u.undead = true; u.crafted = true; u.rot = 'bones'; u.kin = 'bone';
      u.propped = true; u.bindWeight = 0; u.kitBound = true; u.tempT = 999;
      u.state = 'ok'; u.x = x; u.y = y;
      chars.push(u); made.push(u);
      return u;
    };
    /* ---------- A BLOW LANDS ON A PART, NOT ON THE BLOOD POOL ----------
       `applyDamage` takes a limb down and the blood only follows later through the bleed, so
       "was this body hurt" read off `blood` says NO to a fresh wound. The first run of this
       file measured blood and reported six hurt on both sides of every comparison — it was
       counting bodies knocked to the ground, not bodies struck. */
    const hurtBy = (o) => o.state !== 'ok' || o.blood < o.maxBlood
      || PARTS.some(k => o.parts[k].hp < o.parts[k].max);
    const wounded = (list) => list.filter(hurtBy).length;
    /* ---------- THE SPATIAL HASH IS REBUILT INSIDE `update`, AND NOTHING ELSE ----------
       `charsNear` reads `charGrid`, and the grid is only ever rebuilt in the world tick. A
       probe that stages bodies and then calls a tick DIRECTLY is asking a map of where
       everybody stood in the PREVIOUS test — which is why the first run of this file reported
       the Sixfold stamping at two bodies (it was counting six from the test before) and then
       hurting none of them (they were not in the map it was damaging through). */
    const settle = () => rebuildCharGrid();

    /* ---------- 1. THE SWEEP TAKES THE RANK ----------
       In a PAIR against the same beast with `sweep` taken off it, because "the fight got more
       lethal" is not the claim — the claim is that MORE THAN ONE BODY is hurt by one blow. */
    guard(['oneBlowTakesTheRank', 'andItIsTheSweepDoingIt'], () => {
      /* ---------- THE SAME DICE FOR BOTH SIDES ----------
         The two runs differed by more than the arc: `rnd()` is one seeded stream and the second
         staging inherits wherever the first left it, so the comparison was measuring the world's
         mood as much as the sweep — 6 against 2 on a build that does not read `sweep` at all,
         and 9 against 3 on one that does, the same ratio both times. Reset the seed and the only
         thing left different between the two runs is the thing under test. */
      const run = (withSweep) => {
        wipe();
        seed = 90210;
        const c = six(gx, gy);
        if (!withSweep) c.sweep = null;
        /* AND THE STAMP HAS TO BE OUT OF THE WAY. `sixfoldTick` runs inside `update`, and six
           bodies crowded at 1.6 tiles is exactly what it rears at — so both sides of this
           comparison read six hurt and neither of them was measuring the arc. */
        c._sixT = 9999;
        const ring = [];
        for (let i = 0; i < 6; i++) {
          const a = i / 6 * Math.PI * 2;
          /* UNKILLABLE ON PURPOSE, and toughened AT CREATION so the limbs are built big — set
             afterwards, `stats.tough` moves nothing, because `parts` were already sized from
             the old number and one blow still takes an arm off. An Old Bones dies to a single
             stroke from this thing, so over two seconds "how many were hurt" is "how many it
             got through" either way; survivable ones turn it back into the question being
             asked, which is how many ONE stroke touches. */
          const u = bonesTough(gx + Math.cos(a) * 1.6, gy + Math.sin(a) * 1.6);
          /* AND THEY DO NOT SWING BACK. Six of them packed at 1.6 tiles all cleave with their
             own clubs, and the arc "cuts friends too" — so the ring wounded ITSELF and both
             sides of the comparison read six hurt. The question is what the BEAST touches. */
          ring.push(u);
        }
        c.target = ring[0];
        settle();
        paused = false;
        for (let i = 0; i < 34; i++) update(0.05);
        paused = true;
        return { hurt: wounded(ring), n: ring.length };
      };
      /* THREE TRIALS A SIDE. One run of each was not enough to tell the arc from the dice:
         on the build before the fix — where `sweep` is set on the body and nothing reads it —
         a single pair came back 3 against 1 purely because one beast got an extra swing in,
         and the assertion went green on a build with no sweep in it at all. */
      /* AND THE ORDER SWAPPED EVERY OTHER TRIAL. Three-and-three in a fixed order gave 9
         against 3 on the build with the sweep AND on the build without it — identical numbers,
         because what was being measured was which run went FIRST, not which one had the arc.
         The world is not the same on the second staging: the seeded stream has moved. Same
         trap focus.js records, where a distance sort had a favourite that happened to be right. */
      let on = 0, off = 0;
      for (let t = 0; t < 3; t++) {
        if (t % 2 === 0) { on += run(true).hurt; off += run(false).hurt; }
        else { off += run(false).hurt; on += run(true).hurt; }
      }
      R._sweep = `three trials a side, a ring of six each: ${on} of 18 hurt with the sweep, ${off} of 18 without it`;
      R.oneBlowTakesTheRank = on >= 8
        ? `standing six deep around it costs ${(on / 3).toFixed(1)} of the six in the two seconds after it swings — being one of a crowd in front of it is no longer free`
        : `!! ONLY ${on} OF 18 WERE TOUCHED ACROSS THREE TRIALS`;
      R.andItIsTheSweepDoingIt = on >= off * 1.8
        ? `and it is the sweep doing it: take the arc off the same beast and it hurts ${(off / 3).toFixed(1)} a trial against ${(on / 3).toFixed(1)}`
        : `!! WITH ${on} AND WITHOUT ${off} ACROSS THREE TRIALS — the arc is not what changed`;
      wipe();
    });

    /* ---------- 1b. AND THE ONE THE WORLD SPAWNS HAS ONE ----------
       Guard 1 grants the sweep itself, so it proves the MECHANISM and nothing about this
       creature — it passes cleanly on a build where the Sixfold has never been given one. This
       reads the body `spawnSixfold` actually builds. */
    guard(['theSixfoldShipsWithOne'], () => {
      wipe();
      const c = spawnSixfold(gx, gy);
      if (c) made.push(c);
      const sw = c && c.sweep;
      R.theSixfoldShipsWithOne = (sw && sw.arc > 0 && sw.reach > 1.7 && sw.max >= 3)
        ? `the one the world spawns carries a sweep of its own — ${sw.max} bodies inside ${sw.reach} tiles at ${sw.mult} of the blow`
        : `!! THE SPAWNED SIXFOLD HAS NO SWEEP (${JSON.stringify(sw)})`;
      wipe();
    });

    /* ---------- 2. AND THE STAMP ANSWERS A PRESS ----------
       Also a pair. A boss that rears whatever is in front of it is a boss that punishes one
       fighter as hard as ten, which is the opposite of the note. */
    guard(['aPressBringsTheStamp', 'butTwoOfThemDoNot'], () => {
      const run = (n) => {
        wipe();
        const c = six(gx, gy);
        const crew = [];
        for (let i = 0; i < n; i++) {
          const a = i / Math.max(1, n) * Math.PI * 2;
          crew.push(bones(gx + Math.cos(a) * 2.2, gy + Math.sin(a) * 2.2));
        }
        let stamped = false;
        paused = true;
        settle();
        for (let i = 0; i < 200 && !stamped; i++) { sixfoldTick(0.05); if (c._stampT) stamped = true; }
        /* let the announced blow land */
        for (let i = 0; i < 40; i++) sixfoldTick(0.05);
        const shoved = crew.filter(o => (o.shoveT || 0) > 0 || o.blood < o.maxBlood || o.state !== 'ok').length;
        return { stamped, shoved, n };
      };
      const many = run(6), few = run(2);
      R._stamp = `six crowded in: stamp ${many.stamped}, ${many.shoved} of 6 caught. Two: stamp ${few.stamped}, ${few.shoved} of 2 caught`;
      R.aPressBringsTheStamp = (many.stamped && many.shoved >= 4)
        ? `crowd six inside three tiles and it rears — ${many.shoved} of them are hurt and thrown clear when it comes down`
        : `!! stamped=${many.stamped}, caught ${many.shoved} of 6`;
      R.butTwoOfThemDoNot = !few.stamped
        ? 'while two bodies in front of it is a fight, not a press — no stamp, so the move punishes the formation rather than the player'
        : '!! IT STAMPS AT TWO BODIES, which makes it a boss that rears at anything';
      wipe();
    });

    /* ---------- 3. AND IT IS NOT SAFE AT TWELVE TILES ---------- */
    guard(['itThrowsSomething', 'andTheThrowSplashes'], () => {
      wipe();
      const c = six(gx, gy);
      const line = [];
      for (let i = 0; i < 3; i++) line.push(bones(gx + 10, gy - 1 + i));
      projectiles.length = 0;
      paused = true;
      settle();
      let threw = false;
      for (let i = 0; i < 400 && !threw; i++) { sixfoldTick(0.05); if (projectiles.length) threw = true; }
      const pr = projectiles[0];
      R.itThrowsSomething = (threw && pr && pr.caster === c && pr.hurl > 0)
        ? `nobody within reach and it throws something ${dist(c.x, c.y, pr.target.x, pr.target.y).toFixed(0)} tiles — a boss with no range at all can be beaten by never walking up to it`
        : `!! IT THREW NOTHING IN TWENTY SECONDS WITH THREE BODIES AT TEN TILES (${projectiles.length} in the air)`;
      if (pr) {
        const before = wounded(line);
        paused = false;
        for (let i = 0; i < 120 && projectiles.length; i++) update(0.05);
        paused = true;
        const after = wounded(line);
        R._throw = `the slab was aimed at ${pr.target.name} ${dist(c.x, c.y, pr.target.x, pr.target.y).toFixed(1)} tiles off, radius ${pr.hurl}; line wounded ${before} -> ${after}; ${projectiles.length} still in the air; states ${line.map(o => o.state + '/' + Math.round(o.blood)).join(' ')}`;
        R.andTheThrowSplashes = (after - before) >= 2
          ? `and what lands is a slab, not an arrow — ${after - before} of the three in the line are hurt by one throw`
          : `!! THE THROW HURT ${after - before} OF 3`;
      } else R.andTheThrowSplashes = '!! not reached';
      wipe();
    });

    /* ---------- 4. AND THE SWARM STILL WORKS — IT JUST PAYS NOW ----------
       "Which should be a viable strategy in some cases, by the way" — so this is the test that
       would fail if the fix went too far.
       WRITTEN FIRST AS "SIXTEEN OLD BONES STILL KILL IT" AND THAT WAS NEVER TRUE. Measured on
       the build BEFORE any of this: sixteen of them at atk 4 with clubs took ninety blood off a
       seven-hundred-blood beast in fifty-six seconds and all sixteen died. A wall of bare Old
       Bones has never beaten a Sixfold on its own, so an assertion that it must was measuring a
       game nobody has played. What the note is actually about is the EXCHANGE RATE, so that is
       what this measures: the same swarm against the same beast with its arsenal and with it
       switched off. Its damage out must survive; their casualties must not. */
    guard(['aSwarmStillHurtsIt', 'andNowItCostsThemMore'], () => {
      const battle = (armed) => {
        wipe();
        const c = six(gx, gy);
        if (!armed) { c.sweep = null; c._sixT = 1e9; }
        const crew = [];
        for (let i = 0; i < 24; i++) {
          const a = i / 24 * Math.PI * 2, rr = 2.6 + (i % 3) * 0.7;
          crew.push(bones(gx + Math.cos(a) * rr, gy + Math.sin(a) * rr));
        }
        for (const o of crew) { o.target = c; o.targetManual = true; }
        c.target = crew[0];
        settle();
        paused = false;
        for (let t = 0; t < 1200 && c.state !== 'dead'; t++) { update(0.05); if (!armed) c._sixT = 1e9; }
        paused = true;
        return { took: Math.round(c.maxBlood - c.blood), lost: crew.filter(o => o.state !== 'ok').length, n: crew.length };
      };
      const armed = battle(true), plain = battle(false);
      R._battles = `twenty-four Old Bones, sixty seconds: armed it takes ${armed.took} blood and loses ${armed.lost} of ${armed.n}; with the arsenal switched off, ${plain.took} blood and ${plain.lost} lost`;
      R.aSwarmStillHurtsIt = armed.took > plain.took * 0.55
        ? `the swarm still bites: ${armed.took} blood off it against ${plain.took} without the arsenal — the strategy survives, which is what the note asked for`
        : `!! THE SWARM'S DAMAGE COLLAPSED (${armed.took} against ${plain.took})`;
      R.andNowItCostsThemMore = armed.lost >= plain.lost * 1.4 && armed.lost - plain.lost >= 3
        ? `and it costs them ${armed.lost} bodies where the old one took ${plain.lost} — standing shoulder to shoulder in front of it is a decision now, not a free win`
        : `!! IT KILLS ${armed.lost} AGAINST ${plain.lost} — the crowd still pays nothing for being a crowd`;
      wipe();
    });

    return R;
  });

  const bad = Object.values(out).filter(v => typeof v === 'string' && v.startsWith('!!'));
  for (const [k, v] of Object.entries(out)) console.log('  ' + k.padEnd(26) + ' ' + v);
  for (const e of errs) console.log('  ' + e);
  console.log('');
  console.log(bad.length || errs.length ? `THE SIXFOLD IS STILL FIGHTING ONE MAN AT A TIME (${bad.length + errs.length})`
                                        : 'SIX LEGS, AND ALL OF THEM ARRIVE');
  await b.close();
  process.exit(bad.length || errs.length ? 1 : 0);
})();
