#!/usr/bin/env node
/* THE NON-COMBAT SHAPING AXES MUST DO SOMETHING IN THE SIM, not just set a field.
 *
 * Every one of these is the kind of thing that can be declared in a table, read perfectly by
 * a human, and never once reach the game — so none of it is read off SHAPE_AXES. Severance
 * goes through the real `applyDamage`, plating through the real damage-type matrix, notice
 * through the real `hostNoiseTick`, the leash through the real `leashTick`, and learning
 * through the real `xpGain`.
 *
 * It used to print numbers and nothing else, which meant it could not fail a build no matter
 * what it measured. It has verdicts now. Anything starting '!!' fails.
 *
 *   node tools/axes.js [game.html]
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
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message.slice(0, 240)));
  p.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text().slice(0, 240)); });
  await p.goto('file://' + gamePath(process.argv[2]), { waitUntil: 'load' });
  await p.waitForTimeout(3000);
  await p.evaluate(() => document.getElementById('btn-start').click());
  await p.waitForTimeout(2500);

  const out = await p.evaluate(() => {
    const R = {};
    /* neutral on every axis THE GAME CURRENTLY HAS. Read off SHAPE_AXES rather than written
       out, so an axis added or dropped cannot leave this probe quietly shaping a body with a
       key nothing reads — which is exactly what happened when QUIET and WILL went away and
       this file kept passing them. */
    const N = {};
    for (const ax of SHAPE_AXES) N[ax.k] = 2;
    R.axes = `the bench offers ${SHAPE_AXES.map(a => a.label).join(', ')}`;
    R.axesGone = (!('quiet' in N) && !('will' in N))
      ? 'QUIET and WILL are gone, and MIND stands where they were'
      : '!! A RETIRED AXIS IS STILL ON THE BENCH';
    const shaped = (sh) => {
      const c = makeChar('S', 'bandit', 700, 700, { tough: 10 });
      c.state = 'ok'; c.blood = c.maxBlood = 1e6;
      applyShape(c, { ...N, ...sh });
      return c;
    };

    /* --- KNIT: does a shoddy body actually lose limbs faster? --- */
    const severRate = (knit) => {
      let sev = 0;
      for (let i = 0; i < 400; i++) {
        const d = shaped({ knit }); for (const k in d.parts) d.parts[k].hp = -60;
        const a = makeChar('A', 'player', 701, 700, { atk: 20 });
        applyDamage(a, d, 'l.arm', 30, 'cut', false);
        if (d.parts['l.arm'].severed) sev++;
      }
      return +(sev / 400 * 100).toFixed(1);
    };
    const kn0 = severRate(0), kn2 = severRate(2), kn5 = severRate(5);
    R.knit = `severance on a cut limb deep in the red: shoddy ${kn0}%, neutral ${kn2}%, seamless ${kn5}%`;
    R.knitBites = (kn0 > kn2 && kn2 > kn5 && kn5 < 5)
      ? 'and the ladder runs the right way, with seamless very nearly sealed'
      : '!! KNIT DOES NOT CHANGE SEVERANCE';

    /* --- PLATING: does it go through the damage-type matrix? --- */
    const hit = (plate, wt) => {
      let lost = 0;
      for (let i = 0; i < 250; i++) {
        const d = shaped({ plate }); d.blood = d.maxBlood = 1e6;
        for (const k in d.parts) { d.parts[k].hp = 1e6; d.parts[k].max = 1e6; }
        const a = makeChar('A', 'player', 701, 700, { atk: 20 });
        const b0 = d.blood + Object.values(d.parts).reduce((s, q) => s + q.hp, 0);
        applyDamage(a, d, 'chest', 30, wt, false);
        lost += b0 - (d.blood + Object.values(d.parts).reduce((s, q) => s + q.hp, 0));
      }
      return +(lost / 250).toFixed(1);
    };
    const bare = hit(2, 'cut'), boneC = hit(3, 'cut'), chitC = hit(5, 'cut');
    R.plating = `a nominal 30 cut: bare ${bare}, bone-plated ${boneC}, chitinous ${chitC}`;
    R.platingBites = (boneC < bare && chitC < bare)
      ? 'and both kinds of graft turn a cut'
      : '!! PLATING DOES NOT REDUCE ANYTHING';

    /* --- NOISE IS NOT A SLIDER ANY MORE, IT FOLLOWS MASS ---
       The QUIET axis is gone; the mechanic it fed is not. A host is still heard, and what it
       is heard by still matters — so the property under test moved from "can you buy silence"
       to "does a bigger host still cost you notice". */
    const noiseRun = (mass) => {
      for (let i = chars.length - 1; i >= 0; i--) if (chars[i]._t) chars.splice(i, 1);
      noticed = 0; noticeTier = 0;
      for (let i = 0; i < 12; i++) { const u = shaped({ mass }); u._t = true; u.faction = 'player'; u.undead = true; chars.push(u); }
      for (let d = 0; d < 200; d++) hostNoiseTick();
      const n = noticed;
      for (let i = chars.length - 1; i >= 0; i--) if (chars[i]._t) chars.splice(i, 1);
      return +n.toFixed(2);
    };
    const nWiry = noiseRun(0), nMid = noiseRun(2), nHuge = noiseRun(5);
    R.noise = `notice from a host of twelve over 200 ticks: wiry ${nWiry}, neutral ${nMid}, colossal ${nHuge}`;
    R.noiseFollowsMass = (nHuge > nMid && nMid > nWiry)
      ? 'a bigger host is still a louder one — the cost survived the slider going away'
      : '!! NOISE NO LONGER FOLLOWS MASS';

    /* --- MIND, part 1: the leash --- */
    const master = makeChar('M', 'player', 800, 800, { magic: 20 }); master.state = 'ok'; chars.push(master);
    const frayAt = (mind, away) => {
      const u = shaped({ mind }); u.faction = 'player'; u.undead = true; u.master = master;
      u.x = 800 + away; u.y = 800; chars.push(u);
      leashTick();
      const r = { leash: u.leash, frayed: !!u.frayed, atk: +atkPower(u).toFixed(1), speed: +moveSpeed(u).toFixed(2) };
      const i = chars.indexOf(u); if (i >= 0) chars.splice(i, 1);
      return r;
    };
    const hollowNear = frayAt(0, 5), hollowFar = frayAt(0, 40);
    const awakeFar = frayAt(5, 40), awakeVeryFar = frayAt(5, 400);
    R.mindLeash = `hollow frays past ${hollowNear.leash} tiles; awake is still whole at 400`;
    R.mindLeashBites = (!hollowNear.frayed && hollowFar.frayed && !awakeFar.frayed && !awakeVeryFar.frayed)
      ? `and a frayed body is measurably worse — atk ${hollowFar.atk} against ${hollowNear.atk}`
      : `!! THE LEASH DOES NOT TRACK MIND (${JSON.stringify({ hollowNear, hollowFar, awakeFar })})`;

    /* --- MIND, part 2: does it learn faster? Through the real xpGain, not the table. --- */
    /* TWO TRAPS, BOTH HIT ON THE WAY TO THIS VERSION.
       SMALL DOSES: the first version handed out 20 raw points of atk and reported the awake
       body learning 1.26x the neutral one — because it had run into `skillCap` and was
       measuring the ceiling rather than the rate. A multiplier can only be read where nobody
       is capped.
       AND AVERAGE: `makeChar` rolls a race and a subrace, and a subrace carries a PER-SKILL
       learning rate that multiplies the very number under test. One body per tier means one
       roll of that, so the second version read 1.26x again — this time because the awake body
       happened to come out of a line that learns blades at 0.7. Forty bodies a tier washes out
       both the subrace and the age roll. */
    const learnBy = (mind) => {
      let tot = 0;
      for (let n = 0; n < 40; n++) {
        const u = shaped({ mind }); u.faction = 'player'; u.undead = true;
        u.stats.atk = 1;
        for (let i = 0; i < 50; i++) xpGain(u, 'atk', 0.1);
        tot += u.stats.atk - 1;
      }
      return +(tot / 40).toFixed(2);
    };
    const lHollow = learnBy(0), lMid = learnBy(2), lAwake = learnBy(5);
    R.mindLearnCap = (lMid < skillCap(shaped({})) - 5)
      ? `measured well below the ${Math.round(skillCap(shaped({})))} skill ceiling`
      : '!! THE LEARNING PROBE IS MEASURING THE CEILING, NOT THE RATE';
    R.mindLearns = `5 raw points of practice, averaged over 40 bodies: hollow ${lHollow} atk, neutral ${lMid}, awake ${lAwake}`;
    R.mindLearnsBites = (lAwake > lMid * 1.3 && lHollow < lMid * 0.8)
      ? 'and the awake body is genuinely learning its trade where the hollow one is not'
      : '!! MIND DOES NOT REACH THE LEARNING RATE';

    /* --- MIND, part 3: the closed door. This is what makes the bottom of the axis cheap. --- */
    {
      /* STOCK THE STORE FIRST. `canPromote` ends on `canAfford(PROMOTE_COST)`, so on a fresh
         world every one of these comes back false for want of a tome and the probe reads it
         as the gate being broken. Pay for the thing you are not testing. */
      for (const k of Object.keys(PROMOTE_COST)) stash[k] = (stash[k] || 0) + 99;
      const mk = (mind) => {
        const u = shaped({ mind });
        u.faction = 'player'; u.undead = true; u.crafted = true; u.master = master; u.kills = 99;
        return u;
      };
      const hollow = mk(0), mid = mk(2), awake = mk(5);
      const cH = canPromote(hollow, master), cM = canPromote(mid, master), cA = canPromote(awake, master);
      R.mindGate = (!cH.ok && cM.ok && cA.ok)
        ? `a hollow body cannot be raised up (${cH.why}); a neutral and an awake one can`
        : `!! THE ASCENSION GATE IS WRONG (hollow ${cH.ok}, neutral ${cM.ok}, awake ${cA.ok})`;
      R.mindCheaper = (promoteKills(awake) < promoteKills(mid))
        ? `and an awake one needs ${promoteKills(awake)} lives against ${promoteKills(mid)}`
        : '!! AN AWAKE BODY IS NO CLOSER TO A NAME THAN A NEUTRAL ONE';
      R.mindMinded = (mindedDead(awake) && !mindedDead(mid))
        ? 'an awake body counts as minded, so it can be set to work that wants one — a neutral cannot'
        : `!! MINDEDNESS DOES NOT FOLLOW MIND (awake ${mindedDead(awake)}, neutral ${mindedDead(mid)})`;
      /* the gate has to survive a save, or a hollow body launders itself clean through one */
      chars.push(hollow);
      const sv0 = snapshot();
      restore(JSON.parse(JSON.stringify(sv0)));
      const h2 = chars.find(c => c.id === hollow.id);
      R.mindGateSaved = (h2 && h2.noMind && !canPromote(h2, chars.find(c => c.id === master.id)).ok)
        ? 'and it is still closed after a save'
        : '!! A HOLLOW BODY LAUNDERS ITSELF CLEAN THROUGH A SAVE';
    }

    /* --- AND A SAVE WRITTEN BEFORE MIND EXISTED still loads.
       An old body carries shape.will and shape.quiet and no mind at all; it must come back
       leashed as it was built, learning at the ordinary rate, and still able to be raised up.
       Nothing already standing in somebody's world is allowed to get worse. */
    {
      const old = makeChar('Legacy', 'player', 700, 700, { tough: 10 });
      old.state = 'ok'; old.undead = true; old.crafted = true; old.master = master; old.kills = 99;
      old.shape = { mass: 2, force: 2, haste: 2, knit: 4, plate: 3, quiet: 0, will: 5 };
      old.knit = 0.3; old.natArmor = { def: 0.18, cls: 'plate' }; old.noise = 1.5; old.leash = 80;
      chars.push(old);
      const sv = snapshot();
      const j = JSON.parse(JSON.stringify(sv));
      /* strip the new fields the way a save written by the old build would not have them */
      for (const cs of j.chars) { delete cs.mindTier; delete cs.learnMult; delete cs.noMind; }
      restore(j);
      const o2 = chars.find(c => c.id === old.id);
      R.legacyLoads = o2 ? `a pre-MIND body comes back with leash ${o2.leash}, knit ${o2.knit}` : '!! THE OLD BODY DID NOT SURVIVE THE LOAD';
      R.legacyUnharmed = (o2 && o2.leash === 80 && !o2.noMind && !o2.learnMult && canPromote(o2, chars.find(c => c.id === master.id)).ok)
        ? 'keeps the leash it was built with, learns at the ordinary rate, and can still be raised up'
        : `!! A PRE-MIND BODY WAS DAMAGED BY THE LOAD (leash ${o2 && o2.leash}, noMind ${o2 && o2.noMind})`;
      R.legacyMigrated = (o2 && o2.shape && o2.shape.mind === 5)
        ? 'and its old WILL reads through as MIND on the bench'
        : `!! THE OLD WILL VALUE DID NOT MIGRATE (${o2 && o2.shape && o2.shape.mind})`;
    }

    /* --- and every derived field survives a save --- */
    {
      const keep = shaped({ knit: 4, plate: 5, mass: 4, mind: 5 });
      keep.faction = 'player'; keep.undead = true; chars.push(keep);
      const before = { knit: keep.knit, nat: keep.natArmor ? { ...keep.natArmor } : null,
                       noise: keep.noise, leash: keep.leash, mind: keep.mindTier, learn: keep.learnMult };
      const sv = snapshot();
      keep.knit = null; keep.natArmor = null; keep.noise = null; keep.leash = null; keep.mindTier = null; keep.learnMult = null;
      restore(JSON.parse(JSON.stringify(sv)));
      const k2 = chars.find(c => c.id === keep.id);
      const after = k2 ? { knit: k2.knit, nat: k2.natArmor ? { ...k2.natArmor } : null,
                           noise: k2.noise, leash: k2.leash, mind: k2.mindTier, learn: k2.learnMult } : null;
      R.saveLoad = JSON.stringify(before) === JSON.stringify(after)
        ? 'every shaped field comes back byte-for-byte'
        : `!! A SHAPED FIELD WAS LOST IN A SAVE (${JSON.stringify(before)} vs ${JSON.stringify(after)})`;
    }
    return R;
  });

  console.log('\n=== THE SHAPING AXES, IN THE SIM ===\n');
  for (const [k, v] of Object.entries(out)) console.log('  ' + k.padEnd(18) + v);
  const bad = Object.values(out).filter(v => typeof v === 'string' && v.startsWith('!!'));
  if (errs.length) console.log('\n' + errs.slice(0, 5).join('\n'));
  console.log('\n' + (bad.length || errs.length
    ? `FAIL — ${bad.length} verdict(s), ${errs.length} error(s)`
    : 'EVERY AXIS REACHES THE SIM'));
  await b.close();
  process.exit(bad.length || errs.length ? 1 : 0);
})();
