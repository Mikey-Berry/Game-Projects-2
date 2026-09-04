#!/usr/bin/env node
/* WHAT A GRAFT IS WORTH, ASKED OF EVERY PLACE THAT READS THE TABLE.
 *
 * `PROS_TIER` and `prosVal` were declared between two statements of `moveSpeedRaw`, which
 * made them locals of that one function. Legal, silent, and invisible from the two other
 * readers: `atkPower` threw `prosVal is not defined` for any body with a grafted arm — on
 * every swing, from inside `update()`, which unwound the rest of that sim step with it — and
 * the WEAR button consumed the graft, marked the limb fitted, and then threw on
 * `PROS_TIER[tier]` before the log line, so the player saw nothing happen. Twelve days, no
 * harness, and `moveSpeedRaw` itself worked perfectly the whole time because the table was
 * right there beside it.
 *
 * So this asks the three readers separately, and it asks the sim rather than the function
 * for the one that matters: a grafted fighter standing next to an enemy, driven through the
 * real `update()`, with the question being whether a blow ever lands and whether the step
 * survives. The direct `atkPower` call is the smoking gun; the sim case is the injury.
 *
 *   node tools/grafts.js [game.html]
 */
const { chromium } = require('playwright');
const path = require('path');
const gamePath = (a) => path.resolve(a ? (path.isAbsolute(a) ? a : path.join(__dirname, a)) : path.join(__dirname, 'game.html'));

(async () => {
  const b = await chromium.launch({
    executablePath: process.env.DUSTWARD_CHROME || undefined,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'],
  });
  const p = await b.newPage({ viewport: { width: 900, height: 600 } });
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
      try { fn(); } catch (e) { for (const k of keys) if (R[k] === undefined) R[k] = '!! ' + String(e.message).slice(0, 120).toUpperCase(); }
    };
    /* open ground near the squad, found by a deterministic ring search — `findOpenNear` is
       sixty darts and moves whenever the RNG upstream does (see the README) */
    const home = player()[0];
    const open = (r0) => {
      for (let r = r0; r < r0 + 12; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = Math.floor(home.x) + dx + 0.5, y = Math.floor(home.y) + dy + 0.5;
        if (!isBlocked(x, y, 0) && !isBlocked(x + 1, y, 0) && !charsNear(x, y, 2).length) return { x, y };
      }
      return null;
    };
    const mk = (f, x, y) => {
      const c = makeChar('X', f, x, y, { race: 'human', sub: 'dustborn' });
      c.state = 'ok'; c.hunger = 100; c.__probe = true; chars.push(c); return c;
    };
    const graft = (c, part, tier) => { const pt = c.parts[part]; pt.severed = true; pt.pros = true; pt.prosTier = tier; pt.hp = pt.max; pt.bleed = 0; };
    const hpSum = (c) => c.blood + PARTS.reduce((a, k) => a + Math.max(0, c.parts[k].hp), 0);
    const sword = Object.keys(ITEMS).find(k => ITEMS[k].type === 'weapon' && !ITEMS[k].range && ITEMS[k].dmg);

    /* ---------- THE TABLE IS A GLOBAL, OR IT IS NOTHING ---------- */
    guard(['theTableIsReachable'], () => {
      const ok = typeof prosVal === 'function' && typeof PROS_TIER === 'object' && PROS_TIER[1] < PROS_TIER[2] && PROS_TIER[2] < PROS_TIER[3];
      R.theTableIsReachable = ok ? `PROS_TIER ${PROS_TIER[1]}/${PROS_TIER[2]}/${PROS_TIER[3]} and prosVal are reachable from the top level`
        : `!! prosVal IS ${typeof prosVal} AND PROS_TIER IS ${typeof PROS_TIER} FROM THE TOP LEVEL — the table is scoped inside something`;
    });

    /* ---------- A GRAFTED ARM STILL SWINGS ----------
       `atkPower` takes the better of the two arms, so one graft beside a whole arm measures the
       whole arm. Both arms go, and the graft is what is left to swing with. */
    let a, foe;
    guard(['aGraftedArmStillSwings', 'andTheTierIsTheDamage'], () => {
      const spot = open(4);
      a = mk('player', spot.x, spot.y); a.weapon = sword;
      graft(a, 'l.arm', 2); graft(a, 'r.arm', 2);
      const pw = atkPower(a);
      R.aGraftedArmStillSwings = Number.isFinite(pw) && pw > 0 ? `atkPower on two tier-2 grafts is ${pw.toFixed(2)} and does not throw`
        : `!! atkPower ON A GRAFTED ARM CAME BACK ${pw}`;
      /* and the tier is the number: no graft is the 0.35 floor, a tier-3 arm beats the one you were born with */
      const at = (t) => { a.parts['l.arm'].prosTier = t; a.parts['r.arm'].prosTier = t; return atkPower(a); };
      const t1 = at(1), t2 = at(2), t3 = at(3);
      a.parts['l.arm'].pros = false; a.parts['r.arm'].pros = false; const none = atkPower(a);
      a.parts['l.arm'].severed = false; a.parts['r.arm'].severed = false; const whole = atkPower(a);
      const order = none < t1 && t1 < t2 && t2 < whole && whole < t3;
      R.andTheTierIsTheDamage = order
        ? `and the tiers order the blow: no graft ${none.toFixed(1)} < bone ${t1.toFixed(1)} < skeleton ${t2.toFixed(1)} < the arm you were born with ${whole.toFixed(1)} < articulated ${t3.toFixed(1)}`
        : `!! THE TIERS DO NOT ORDER THE BLOW: none ${none.toFixed(1)}, t1 ${t1.toFixed(1)}, t2 ${t2.toFixed(1)}, whole ${whole.toFixed(1)}, t3 ${t3.toFixed(1)}`;
      graft(a, 'l.arm', 2); graft(a, 'r.arm', 2);
    });

    /* ---------- AND THE SIM SURVIVES THE SWING ----------
       The direct call above is the smoking gun. This is the injury: the swing happens inside
       `physics`, inside `update`, and a throw there unwinds every body after this one and
       everything `update()` does after the roster loop. Driven through the real loop, paused,
       and measured on a swing reaching `applyDamage` rather than on any flag. */
    guard(['andTheSimSurvivesTheSwing'], () => {
      foe = mk('bandit', a.x + 1.2, a.y);
      a.target = foe; a.targetManual = true; a.stance = 'melee';
      foe.target = null; foe.noFight = true;                   /* it stands there and takes it; the swing is the subject */
      rebuildCharGrid();
      /* THE SIGNAL IS THE SWING REACHING `applyDamage`, NOT THE HIT POINTS. The first version
         of this set the foe's blood to 400 so it could not go down, and then counted every
         drop in blood as a blow — and `bodyTick` settles blood back toward the body's real
         maximum, so it counted three "blows" in nineteen steps on the broken build, before a
         single windup had finished. Passing on the broken build is the one thing a probe must
         not do. `attack()` computes `atkPower` BEFORE it calls `applyDamage`, so on the broken
         build the throw lands first and this counter stays at zero. */
      const orig = applyDamage;
      let swings = 0;
      applyDamage = function (src, dst) { if (src === a && dst === foe) swings++; return orig.apply(this, arguments); };
      const hp0 = hpSum(foe), errs0 = frameErrs;
      let steps = 0, threw = null;
      try {
        for (; steps < 300 && swings < 3 && foe.state === 'ok'; steps++) update(SIM_DT);
      } catch (e) { threw = e.message; }
      applyDamage = orig;
      R.andTheSimSurvivesTheSwing = threw ? `!! update() THREW ON THE GRAFTED FIGHTER'S SWING AFTER ${steps} STEPS: ${threw}`
        : frameErrs !== errs0 ? `!! frameErrs MOVED ${errs0} -> ${frameErrs} DURING THE FIGHT`
        : swings === 0 ? `!! NO SWING RESOLVED IN ${steps} STEPS — the staging did not produce one, so nothing was measured`
        : `${swings} swings resolved in ${steps} steps through the real update(), ${(hp0 - hpSum(foe)).toFixed(0)} hp taken, and the step never unwound`;
      a.target = null; foe.state = 'gone';
    });

    /* ---------- THE WEAR BUTTON FINISHES WHAT IT STARTS ----------
       The real row in the stash panel, found by its item key and not by position (an earlier
       probe clicked "the first WEAR row" and named a helm it had not clicked). The log line is
       the assertion, because on the broken build everything BEFORE the throw still happened. */
    let body;
    guard(['theFitButtonFinishesWhatItStarts', 'andAnUpgradeHandsTheOldOneBack'], () => {
      const spot = open(9);
      body = mk('player', spot.x, spot.y);
      body.parts['r.arm'].severed = true; body.parts['r.arm'].pros = false; body.parts['r.arm'].hp = 0;
      selected.length = 0; selected.push(body);
      addItem('g_arm', 1);
      refreshInv();
      const btn = document.querySelector('[data-pros="g_arm"]');
      if (!btn) throw new Error('no WEAR row for the Bone Graft (Arm) in the stash panel');
      const n0 = chronicle.length;
      btn.onclick();
      const line = chronicle.slice(n0).map(e => e.m).find(m => /fitted with Bone Graft/.test(m));
      const pt = body.parts['r.arm'];
      R.theFitButtonFinishesWhatItStarts = (line && pt.pros && pt.prosTier === 1 && !(stash.g_arm > 0))
        ? `the bone graft goes on through the real button, the item is spent, and the log says so: "${line.slice(0, 70)}…"`
        : `!! THE BUTTON DID NOT FINISH: log ${line ? 'yes' : 'NO'}, fitted ${!!pt.pros} tier ${pt.prosTier}, graft left in stash ${stash.g_arm || 0}`;

      addItem('a_arm', 1);
      refreshInv();
      const up = document.querySelector('[data-pros="a_arm"]');
      if (!up) throw new Error('no WEAR row for the Articulated Arm');
      const n1 = chronicle.length;
      up.onclick();
      const line2 = chronicle.slice(n1).map(e => e.m).find(m => /fitted with Articulated Arm/.test(m));
      R.andAnUpgradeHandsTheOldOneBack = (line2 && pt.prosTier === 3 && stash.g_arm === 1 && !(stash.a_arm > 0))
        ? `and an articulated arm over it goes to tier 3, hands the bone graft back to the stash, and says "${line2.slice(0, 60)}…"`
        : `!! THE UPGRADE: log ${line2 ? 'yes' : 'NO'}, tier ${pt.prosTier}, bone graft back ${stash.g_arm || 0}, articulated left ${stash.a_arm || 0}`;
    });

    /* ---------- AND A LEG NEVER STOPPED WORKING, WHICH IS THE CONTROL ----------
       `moveSpeedRaw` is where the table used to live, so it read it fine on the broken build.
       If this one goes red the fix broke the reader that was never broken. */
    guard(['andALegStillReadsTheTable'], () => {
      const c = mk('player', a.x, a.y + 2);
      const whole = moveSpeedRaw(c);
      graft(c, 'l.leg', 1); graft(c, 'r.leg', 1); const t1 = moveSpeedRaw(c);
      c.parts['l.leg'].prosTier = 3; c.parts['r.leg'].prosTier = 3; const t3 = moveSpeedRaw(c);
      R.andALegStillReadsTheTable = (t1 < whole && whole < t3) ? `and legs still read it: bone ${t1.toFixed(2)} < whole ${whole.toFixed(2)} < articulated ${t3.toFixed(2)} tiles/s`
        : `!! LEG SPEEDS DO NOT ORDER: t1 ${t1.toFixed(2)}, whole ${whole.toFixed(2)}, t3 ${t3.toFixed(2)}`;
    });

    for (const c of chars) if (c.__probe) c.state = 'gone';
    return R;
  });

  const bad = Object.values(out).filter(v => typeof v === 'string' && v.startsWith('!!'));
  for (const [k, v] of Object.entries(out)) console.log('  ' + k.padEnd(34) + v);
  for (const e of errs) console.log('  ' + e);
  console.log('');
  console.log(bad.length || errs.length ? `THE GRAFT IS A LIMB NOBODY CAN USE (${bad.length + errs.length})`
                                        : 'A GRAFT IS AN ARM AGAIN');
  await b.close();
  process.exit(bad.length || errs.length ? 1 : 0);
})();
