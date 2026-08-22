#!/usr/bin/env node
/* WHAT DOES A SHOT COST THE LEGS, AND WHAT DOES A BLADE COST THE EXIT?
 *
 * "Kiting should slow down the ranged attacker. It doesn't make sense that someone could run
 * backwards at full speed while still firing projectiles. And catching a ranged attacker in
 * melee should somewhat lock them down from fleeing again. (Somewhat — they should reasonably
 * be able to escape if, say, an ally also engages that enemy.)"
 *
 * THE TO-DO NOTE SAID TO FIND OUT WHO IS ACTUALLY DOING THE KITING FIRST, and the first answer
 * this probe went looking for was WRONG, which is worth more than the right one.
 *
 * THE WRONG ANSWER — a seam between two functions. The auto-fight branch plainly refuses to
 * fire on the move (`if(d > w.range){ travel(...); return; }`, commented exactly that), so the
 * kiting had to be getting in around it. The draw is opened in the combat branch and loosed a
 * tick later, `clearOrders` drops the target and never touches `c.windup`, and a move order in
 * between therefore looked like it would walk the archer out from under its own draw and loose
 * the arrow at a sprint. Measured, tick by tick, on the build before the fix: it does not.
 * `ai()` opens with `if(c.state !== 'ok' || c.faction === 'player') return;` — every player
 * unit is driven by `physics`, orders and combat and all, and `physics` returns early for the
 * whole length of a windup under a comment that already says "feet planted while the swing is
 * committed". There is no seam. Case 1 below is what is left of that hunt, and it passes on
 * BOTH builds on purpose: it is the control that says the draw really is rooted, which is the
 * premise the rest of the file rests on.
 *
 * THE RIGHT ANSWER IS ARITHMETIC, and it is why no flag was ever going to show it. A hunting
 * bow at atk 10 is a 2.3-second cycle of which the rooted draw is 0.45. Root it perfectly and
 * the archer still walks four fifths of every cycle at a dead run — measured at 86% of the
 * ground the same archer covers doing nothing but running. THE RELOAD IS THE ONLY PART OF THE
 * CYCLE BIG ENOUGH TO PAY FOR THE SHOT, so that is where the cost goes.
 *
 * Nothing here reads a flag; every case measures GROUND COVERED, which is the unit the
 * complaint is written in. Every case is driven through the same two calls the right-click
 * handler makes — `clearOrders` then `routeTo` — because a probe that sets `moveTarget` by
 * hand is not testing the order the player actually gives.
 *
 * PATH LENGTH, NOT NET DISPLACEMENT. The first version of case 2 measured `|x - x0|` and
 * reported 9.2 tiles for a kite that had in fact run most of forty: a kiting archer walks
 * BACK into range between shots, so the two cancel and the number flatters the build. Every
 * distance below is accumulated per tick. Case 1 had the same disease in miniature — it
 * counted a flat 1.4 seconds, including the tiles walked AFTER the loose, when the archer is
 * entitled to run — and so read 3.7 tiles on one build and 2.4 on the other, two numbers that
 * were both measuring the wrong thing.
 *
 *   node tools/kiting.js [game.html]
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
  await p.waitForTimeout(3000);
  /* START AND STOP IN THE SAME BREATH. A click followed by a wait lets the world run for
     however many frames the machine manages, which is not a fixed number and drops when a
     sixty-harness suite is loading the box — so every body is somewhere slightly different
     by the time this probe stages anything, and the numbers below inherit it. Measured on
     one unchanged build before this was applied here: flank.js gave 1.67 / 1.67 / 1.09 over
     three runs, and guns.js split three-to-two on an md5 that had not moved. Pausing inside
     the same evaluate leaves no frames at all between the two. Every file below sets
     `paused` for itself anyway; this only removes the window before its first statement. */
  await p.evaluate(() => { document.getElementById('btn-start').click(); paused = true; });
  await p.waitForTimeout(3000);

  const out = await p.evaluate(() => {
    const R = {};
    paused = true;

    /* open ground, well clear of anything that would wander into the measurement */
    let gx = 0, gy = 0;
    outer:
    for (let y = 60; y < H - 60; y += 5) for (let x = 60; x < W - 60; x += 5) {
      if (isBlocked(x + 0.5, y + 0.5)) continue;
      if (towns.some(t => dist(t.x, t.y, x, y) < 70)) continue;
      let ok = true;
      for (let j = -16; j <= 16 && ok; j++) for (let i = -16; i <= 16 && ok; i++)
        if (isBlocked(x + i + 0.5, y + j + 0.5)) ok = false;
      if (ok) { gx = x; gy = y; break outer; }
    }
    R.ground = gx ? `staged on open waste at ${gx},${gy}` : '!! NO OPEN GROUND';

    const wipe = () => {
      for (let i = chars.length - 1; i >= 0; i--) if (chars[i].__probe) chars.splice(i, 1);
      projectiles.length = 0;
    };
    const archer = (x, y, o) => {
      const c = makeChar('Archer', 'player', x, y,
        { atk: 10, def: 8, tough: 14, ath: 6, ranged: 10, ...(o || {}) });
      c.weapon = 'w_bow'; c.__probe = true; c.autoFight = false; c.stance = 'free';
      chars.push(c);
      return c;
    };
    const foe = (x, y, o) => {
      const c = makeChar('Raider', 'bandit', x, y, { atk: 8, def: 8, tough: 90, ath: 6, ...(o || {}) });
      c.__probe = true;
      chars.push(c);
      return c;
    };
    const ally = (x, y) => {
      const c = makeChar('Shieldman', 'player', x, y, { atk: 10, def: 10, tough: 60, ath: 6 });
      c.weapon = 'w_kat'; c.__probe = true;
      chars.push(c);
      return c;
    };
    /* a body pushed into `chars` while paused is not in the spatial grid yet, and `charsNear`
       reads the grid — two ticks of the real loop put it there */
    const settle = () => { paused = false; update(0.05); update(0.05); paused = true; };
    /* run n tenth-second ticks, accumulating how far `who` actually walked */
    const step = (n, who, each) => {
      let covered = 0;
      paused = false;
      for (let i = 0; i < n; i++) {
        const px = who ? who.x : 0, py = who ? who.y : 0;
        if (each) each(i);
        update(0.1);
        if (who) covered += Math.hypot(who.x - px, who.y - py);
      }
      paused = true;
      return covered;
    };
    /* the foe stands where it was put. Every case here measures the ARCHER's feet, and a
       raider that walks changes the distance under the answer. */
    const anchor = (f) => { const ax = f.x, ay = f.y; return () => { f.x = ax; f.y = ay; f.moveTarget = null; f.path = null; }; };

    /* ============ 1. THE CONTROL: THE DRAW REALLY IS ROOTED ============
       This is the case that passes on both builds, and it is here for the same reason the dry
       lance is in gunnery.js: it is what keeps the rest of the file honest. If the draw were
       NOT rooted, every ground measurement below would be measuring a different bug.
       The loose is read off `atkCd` JUMPING — `fireRanged` is the only thing that resets it —
       and not off the target's blood, which is a pool that drains over the following seconds
       and rounds a real hit up to "100 -> 100" on the way past. */
    {
      wipe();
      const a = archer(gx, gy);
      const f = foe(gx + 5, gy, { autoFight: false });
      const hold = anchor(f);
      settle();
      a.target = f; a.targetManual = true;
      let opened = 0;
      step(12, null, () => { hold(); if (a.windup) opened++; });
      R.theDrawOpens = opened > 0
        ? 'an ordered archer opens a draw within 1.2s'
        : `!! THE ARCHER NEVER DRAWS AT ALL (atkCd ${a.atkCd.toFixed(2)}, target ${!!a.target})`;

      /* THE WINDOW IS THE DRAW, NOT THE MINUTE AROUND IT. The first version of this ran a flat
         1.4s and counted every tile in it — including the ones walked AFTER the loose, when the
         archer is entitled to run. It read 3.7 tiles on a build that let the shot go at a
         sprint and 2.4 on one that plants the feet, which makes the two look like the same
         answer. Ordered: give the run order on the tick the draw opens, and stop counting on
         the tick the arrow leaves. */
      a.atkCd = 0; a.windup = null; a.reloadT = 0; a.target = f; a.targetManual = true;
      let ordered = false, loosed = false, drewAtAll = false, walked = 0, prevCd = a.atkCd;
      paused = false;
      for (let i = 0; i < 40 && !loosed; i++) {
        hold();
        if (!ordered && a.windup) {
          ordered = drewAtAll = true;
          clearOrders(a); routeTo(a, gx - 20, gy, 0);   /* exactly what a right-click on open ground does */
        }
        const px = a.x, py = a.y;
        update(0.1);
        if (ordered) walked += Math.hypot(a.x - px, a.y - py);
        if (a.atkCd > prevCd + 0.5) loosed = true;
        prevCd = a.atkCd;
      }
      paused = true;
      R.aShotFiredOnTheRun = !drewAtAll
        ? '!! THE STAGING FAILED — NO DRAW EVER OPENED TO GIVE THE RUN ORDER INTO'
        : !loosed
          ? `a run order mid-draw costs the shot outright — nothing leaves the bow`
          : walked > 0.8
            ? `!! A MOVE ORDER MID-DRAW STILL LOOSES — the arrow leaves after ${walked.toFixed(1)} tiles of running`
            : `the draw plants the feet: the arrow leaves after ${walked.toFixed(2)} tiles, from where the archer was standing`;
    }

    /* ============ 2. WHAT THE SHOOTING COSTS IN GROUND ============
       Twelve seconds of a player kiting as hard as the order system allows: order the shot the
       instant the bow is ready, order the run the instant the draw is up. Then the same twelve
       seconds with the same archer told only to run. The question is the ratio — an archer who
       can shoot for free covers the same ground either way. */
    {
      wipe();
      const a = archer(gx, gy);
      const f = foe(gx + 5, gy, { autoFight: false });
      const hold = anchor(f);
      settle();
      let shots = 0, prevCd = a.atkCd;
      const kited = step(120, a, () => {
        hold();
        if (a.atkCd > prevCd + 0.5) shots++;
        prevCd = a.atkCd;
        if (!a.windup && a.atkCd <= 0) { clearOrders(a); a.target = f; a.targetManual = true; }
        else if (a.windup && !a.moveTarget) { clearOrders(a); routeTo(a, gx - 40, gy, 0); }
      });

      wipe();
      const b2 = archer(gx, gy);
      settle();
      const plain = step(120, b2, () => { if (!b2.moveTarget) routeTo(b2, gx - 40, gy, 0); });

      const pct = plain > 0 ? kited / plain : 1;
      R._kiteDetail = `12s: kiting covers ${kited.toFixed(1)} tiles on ${shots} shots, the same archer just running covers ${plain.toFixed(1)}`;
      R.shootingCostsGround = shots < 2
        ? `!! THE MICRO NEVER GOT A SECOND SHOT OFF (${shots} in 12s) — THIS CASE IS MEASURING NOTHING`
        : pct < 0.75
          ? `a kiting archer covers ${(pct * 100).toFixed(0)}% of the ground a running one does — the shooting is paid for in tempo`
          : `!! A KITING ARCHER COVERS ${(pct * 100).toFixed(0)}% OF FREE RUNNING (${kited.toFixed(1)} OF ${plain.toFixed(1)} TILES) — THE SHOOTING IS FREE`;
    }

    /* ============ 3-5. A BLADE ON YOU, AND THE RUN ORDER ============
       Same archer, same order, four seconds of it: alone, with a swordsman on them, and with
       a swordsman on them whom an ally has by the throat. */
    const escape = (withAlly, withFoe) => {
      const a = archer(gx, gy);
      const f = withFoe ? foe(gx + 1.1, gy, { weapon: 'w_kat' }) : null;
      const al = (withAlly && f) ? ally(gx + 1.1, gy + 1.0) : null;
      settle();
      const keep = () => {
        if (f) { f.target = a; f.targetManual = true; }
        if (al) { al.target = f; al.targetManual = true; }
        if (!a.moveTarget) routeTo(a, gx - 30, gy, 0);   /* and the player keeps clicking */
      };
      keep();
      clearOrders(a); routeTo(a, gx - 30, gy, 0);
      keep();
      /* WHAT THE GRIP IS WORTH WHILE IT IS ON. The ground numbers alone cannot tell "the ally
         halved the grip" apart from "the pin never registered in the ally case" — both land
         near free running, because a body that gets loose stays loose.
         TAKEN AS A MINIMUM OVER THE RUN, NOT A SNAPSHOT. Read once, two ticks in, it said 1.00
         for the unrelieved case on a build that demonstrably slows it: the separation pass had
         shoved the two apart that frame, and the chase closed again a moment later. A grip that
         comes and goes is still a grip; the tightest it reaches is the honest number.
         Detail, not an assertion — the ground is what the complaint is written in. */
      let grip = null;
      const tiles = step(40, a, () => {
        keep();
        if (a._pinK !== undefined && (grip === null || a._pinK < grip)) grip = a._pinK;
      });
      return { tiles, grip };
    };
    let held = 0, sprung = 0, free = 0, gripHeld = null, gripSprung = null;
    wipe(); free = escape(false, false).tiles;
    wipe(); { const e = escape(false, true); held = e.tiles; gripHeld = e.grip; }
    wipe(); { const e = escape(true, true); sprung = e.tiles; gripSprung = e.grip; }
    R._gripDetail = gripHeld === null
      ? 'no pin factor on this build — the grip is not implemented'
      : `tightest grip during the run: alone with the blade ${gripHeld.toFixed(2)}, with an ally on it ${gripSprung.toFixed(2)}`;
    R.theAllyIsWhatLoosensIt = gripHeld === null
      ? `!! NOTHING SETS A GRIP FACTOR AT ALL`
      : gripSprung > gripHeld + 0.2
        ? `and it is the ally that loosens the grip, not the distance — ${gripHeld.toFixed(2)} alone against ${gripSprung.toFixed(2)} relieved`
        : `!! THE GRIP READS THE SAME WITH AND WITHOUT RELIEF (${gripHeld.toFixed(2)} / ${gripSprung.toFixed(2)}) — THE GROUND NUMBERS BELOW ARE MEASURING DISTANCE, NOT THE CLAUSE`;

    R._escapeDetail = `4s of running: alone ${free.toFixed(1)} tiles, pinned ${held.toFixed(1)}, pinned-with-relief ${sprung.toFixed(1)}`;
    R.anUnengagedRunnerIsFree = free > 10
      ? `an archer with nobody on them covers ${free.toFixed(1)} tiles in 4s — full speed, untouched`
      : `!! THE CONTROL IS SLOW TOO (${free.toFixed(1)} tiles in 4s) — SOMETHING IS SLOWING EVERYONE, NOT JUST THE ENGAGED`;
    R.aBladeHoldsThem = held < free * 0.75
      ? `a swordsman on them cuts the retreat to ${held.toFixed(1)} tiles, ${(held / free * 100).toFixed(0)}% of free running`
      : `!! A SWORDSMAN ON THEM COSTS NOTHING — ${held.toFixed(1)} TILES AGAINST ${free.toFixed(1)} FREE, THEY SIMPLY WALK OFF`;
    R.anAllySpringsThePin = sprung > held * 1.25 && sprung <= free * 1.05
      ? `and an ally with their hands full of that swordsman buys the way out — ${sprung.toFixed(1)} tiles against ${held.toFixed(1)}`
      : sprung > free * 1.05
        ? `!! RELIEF MAKES THEM FASTER THAN FREE RUNNING (${sprung.toFixed(1)} vs ${free.toFixed(1)})`
        : `!! AN ALLY ENGAGING THE PINNER CHANGES NOTHING — ${sprung.toFixed(1)} TILES AGAINST ${held.toFixed(1)} PINNED`;

    wipe();
    return R;
  });

  console.log('=== KITING: WHAT A SHOT COSTS THE LEGS ===\n');
  for (const [k, v] of Object.entries(out)) console.log('  ' + (k.startsWith('_') ? ('· ' + k.slice(1)).padEnd(30) : k.padEnd(30)) + v);
  const bad = Object.values(out).map(String).filter(v => v.startsWith('!!'));
  console.log('\n' + (bad.length ? '*** ' + bad.join('\n*** ') : 'SHOOTING COSTS TEMPO, AND A BLADE COSTS THE EXIT'));
  if (errs.length) { console.log('errs:', errs.length); errs.slice(0, 4).forEach(e => console.log('  ' + e)); }
  await b.close();
  if (bad.length) process.exitCode = 1;
})();
