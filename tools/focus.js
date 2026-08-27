#!/usr/bin/env node
/* WHO A SQUAD DECIDES TO KILL.
 *
 * "The attack-move command AI isn't very intelligent. For example, all of my troops will
 *  attempt to attack the FIRST thing they see, and swarm around it, even though there are
 *  other more viable targets they could be engaging. This results in them getting mowed down
 *  by the other enemy units."
 *
 * Both places a body picks a fight call `nearestEnemy`, which is a pure distance sort. Eight
 * people standing next to each other therefore compute the same answer eight times: the whole
 * line piles onto one body while everything behind it shoots them in the back, and the pile
 * is not a bug in any one unit's logic — it is what identical inputs produce.
 *
 * So nothing here asserts "they picked the right one". A single unit's choice is not the
 * subject. What is measured is the SHAPE OF THE GROUP'S DECISION: how many of them stack on
 * one body, how many distinct fights are actually joined, whether the thing shooting at them
 * gets answered, whether a nearly-dead body gets finished — and, at the end, whether any of it
 * is worth anything, which is a body count over many fights rather than an opinion.
 *
 *   node tools/focus.js [game.html]
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
      try { fn(); } catch (e) { for (const k of keys) if (R[k] === undefined) R[k] = '!! ' + String(e.message).slice(0, 110).toUpperCase(); }
    };
    const step = (secs, dt = 1 / 30) => { for (let i = 0; i < secs / dt; i++) update(dt); };

    /* ---------- GROUND WITH NOBODY ELSE'S BUSINESS ON IT ----------
       Anything that wanders in joins the fight, and a fight with an extra body in it is a
       different fight. Find open waste, then clear it. */
    let gx = 0, gy = 0;
    outer:
    for (let y = 80; y < H - 80; y += 7) for (let x = 80; x < W - 80; x += 7) {
      if (nearestTownDist(x, y) < 90) continue;
      let ok = true;
      for (let dy = -8; dy <= 8 && ok; dy++) for (let dx = -8; dx <= 8; dx++) if (isBlocked(x + dx, y + dy)) { ok = false; break; }
      if (ok) { gx = x; gy = y; break outer; }
    }
    R._where = `staged on open waste at ${gx},${gy}`;

    const probes = [];
    const wipe = () => {
      for (let i = chars.length - 1; i >= 0; i--) if (chars[i].__probe || dist(chars[i].x, chars[i].y, gx, gy) < 60) chars.splice(i, 1);
      probes.length = 0;
    };
    const put = (fac, x, y, o) => {
      const q = findOpenNear(Math.round(x), Math.round(y), 5) || { x, y };
      const c = makeChar(o.name || fac, fac, q.x, q.y, { atk: 14, def: 12, tough: 14, ath: 8, ...o });
      c.__probe = true; c.state = 'ok'; chars.push(c); probes.push(c);
      return c;
    };
    /* ---------- AND SOMETIMES EXACTLY WHERE YOU PUT THEM ----------
       `findOpenNear` spirals outward off anything already standing there, and the pair trials
       below depend on two spots being the SAME two spots in both orientations. It moved a pair
       staged 2 tiles apart to 5.94 and 11.36 tiles out — one of them past the nine-tile scan
       entirely — so the trial was reading a one-candidate list and reporting a preference.
       Where the geometry is the control, the geometry is not negotiable. */
    const putAt = (fac, x, y, o) => {
      const c = makeChar(o.name || fac, fac, x, y, { atk: 14, def: 12, tough: 14, ath: 8, ...o });
      c.__probe = true; c.state = 'ok'; c.x = x; c.y = y; chars.push(c); probes.push(c);
      return c;
    };
    /* eight of mine in a line, the way a squad arrives */
    /* THE LINE GOES WHERE THE LINE IS PUT, for the same reason the pair does: `findOpenNear`
       moved a body asked for at (gx-6, gy-3) to (gx-6.8, gy-6.5), and once the line is scattered
       the two "identical" spots in a pair trial are no longer identical distances from it. */
    const mine = (n) => { const a = []; for (let i = 0; i < n; i++) a.push(putAt('player', gx - 6, gy - 3 + i * 0.9, { name: 'Mine' + i, weapon: 'w_kat', armor: 'a_lea' })); return a; };

    /* ================== 1. THE PILE ==================
       One tough body at the front and five more behind it, all of them inside the same nine
       tiles. Every one of the six is reachable and hostile; the question is only how the eight
       divide themselves between them. */
    guard(['theyDoNotAllPileOn', 'andTheFightIsShared'], () => {
      wipe();
      const us = mine(8);
      const them = [];
      them.push(putAt('bandit', gx - 2, gy, { name: 'Front', tough: 40, def: 26, weapon: 'w_club' }));
      /* INSIDE THE NINE TILES, ALL SIX OF THEM. Staged at gx+3..gx+4 the back rank sat right on
         the scan boundary, so "one of six engaged" was partly the radius and not the choice. */
      for (let i = 0; i < 5; i++) them.push(putAt('bandit', gx + 1 + (i % 2) * 0.9, gy - 3 + i * 1.4, { name: 'Back' + i, weapon: 'w_xbow' }));
      for (const u of us) { u.attackMove = { x: gx + 8, y: gy }; u.scanT = 0; }
      step(1.2);
      const on = new Map();
      for (const u of us) if (u.target) on.set(u.target, (on.get(u.target) || 0) + 1);
      const counts = [...on.values()].sort((a, b) => b - a);
      const engaged = [...us].filter(u => u.target).length;
      R._spread = `${engaged} of 8 engaged, spread ${counts.join('/')} across ${on.size} of ${them.length} enemies`;
      R.theyDoNotAllPileOn = (engaged >= 6 && counts[0] <= 4)
        ? `the heaviest stack is ${counts[0]} of the ${engaged} who engaged, not all of them`
        : engaged < 6 ? `!! ONLY ${engaged} OF 8 PICKED A FIGHT AT ALL — nothing was measured`
        : `!! ${counts[0]} OF ${engaged} WENT FOR THE SAME BODY`;
      R.andTheFightIsShared = on.size >= 3
        ? `and ${on.size} different enemies are being fought at once`
        : `!! THE WHOLE LINE IS FIGHTING ${on.size} OF ${them.length} ENEMIES`;
    });

    /* ================== 2. AND IT IS NOT JUST SPREADING FOR THE SAKE OF IT ==================
       A chooser that scattered the squad evenly across everything in sight would pass the test
       above and be worse than what it replaced. Three things it must still get right. */

    /* ---------- TWO CANDIDATES, AND POSITION IS NOT ONE OF THE DIFFERENCES ----------
       An early version of the shooter test stood the two bandits at gy-1 and gy+1 and reported
       4 of 4 for the right one — ON THE BUILD THAT HAD NO CHOOSER AT ALL. Four units strung
       along a line are not equidistant from two bodies, so `nearestEnemy` had a favourite and
       it happened to be the correct answer. The fix is to deny the probe that explanation: run
       every pair trial TWICE with the two swapped between the same two spots, and require the
       property under test to win from BOTH. Anything decided by geometry wins one and loses
       the other. Also: half a second, one scan sweep — long enough to choose, short enough
       that no bolt has landed, and the trial checks that too rather than assuming it. */
    const pairTrial = (label, dress) => {
      let wins = 0, tally = [], contaminated = false;
      let reach = '';
      for (const flip of [false, true]) {
        wipe();
        const us = mine(4);
        const cy = gy - 1.65;                       /* the middle of the line of four */
        const a = putAt('bandit', gx + 1, cy - 1.5, { name: 'A', weapon: 'w_club' });
        const b2 = putAt('bandit', gx + 1, cy + 1.5, { name: 'B', weapon: 'w_club' });
        const subject = flip ? b2 : a, control = flip ? a : b2;
        dress(subject, control, us);
        for (const u of us) { u.scanT = 0; u.attackMove = { x: gx + 9, y: gy }; }
        const full = us.map(u => u.blood);
        step(0.5);
        /* BOTH OF THEM HAVE TO BE ASKABLE. A candidate outside the nine-tile scan is not a
           candidate that lost — it is one that was never offered, and the trial would be
           reporting a preference between one thing and nothing. */
        /* the quantity the check is about: the furthest either candidate ever is from anybody */
        const far = Math.max(...us.map(u => Math.max(dist(u.x, u.y, a.x, a.y), dist(u.x, u.y, b2.x, b2.y))));
        const both = far < 9;
        if (!both) reach = `!! ONE OF THE PAIR IS OUTSIDE THE SCAN (worst ${far.toFixed(1)} tiles) — it was never offered`;
        if (us.some((u, i) => u.blood < full[i] - 0.001)) contaminated = true;
        const onS = us.filter(u => u.target === subject).length;
        const onC = us.filter(u => u.target === control).length;
        tally.push(`${onS}-${onC}`);
        if (onS > onC) wins++;
      }
      return { wins, tally: tally.join(' and '), contaminated, reach };
    };

    /* the one already aiming at you outranks the one that is not */
    guard(['theyAnswerTheGunTrainedOnThem'], () => {
      const t = pairTrial('shooter', (subject, control, us) => {
        subject.weapon = 'w_xbow'; subject.stance = 'ranged';
        subject.target = us[0]; subject.targetManual = true;
        control.noFight = true;
      });
      R.theyAnswerTheGunTrainedOnThem = t.reach ? t.reach
        : t.contaminated
        ? '!! A BOLT LANDED INSIDE THE WINDOW — this measured retaliation, not the choice'
        : t.wins === 2
        ? `the one aiming at them wins from either side of the line (${t.tally}), before a shot is fired`
        : `!! THE SHOOTER WON ${t.wins} OF 2 ORIENTATIONS (${t.tally}) — position is deciding this, not the gun`;
    });

    /* ---------- A BODY ONE BLOW FROM FALLING IS WORTH CONVERGING ON ----------
       It takes a weapon off the field for good, which spreading for its own sake does not.
       AND 14% BLOOD WAS NOT A STATE. The first staging set the subject to a tenth of its
       blood and got 0 of 4 in both orientations — not a tie-break the chooser lost, an
       assertion about a body that cannot be standing: `updateState` puts a human on the
       ground below 40 of 100, so "a bandit at 14 blood" is a corpse-in-waiting the scan is
       right to skip. Forty-five is the real version of this decision — upright, and one good
       hit from not being. */
    guard(['theyFinishTheNearlyDead'], () => {
      const t = pairTrial('hurt', (subject, control) => {
        subject.blood = 45;                    /* against a downAt of 40 for a human */
        subject.noFight = true; control.noFight = true;
      });
      R.theyFinishTheNearlyDead = t.reach ? t.reach
        : t.wins === 2
        ? `the one at 45 blood — five above the floor it drops at — wins from either side of the line (${t.tally})`
        : `!! THE HURT ONE WON ${t.wins} OF 2 ORIENTATIONS (${t.tally})`;
    });

    /* AND AN ORDER IS AN ORDER — as far as the CHOOSER is concerned.
       `retaliate` deliberately lets a knife in the ribs outrank the man across the field, and
       it does that to manual targets too; the first version of this probe forbade that and
       reported 1 of 4 "dropping" a target for a reason that has nothing to do with picking
       one. The subject here is the acquisition path, so the closer body is given `noFight`:
       it is a hostile standing in the way and nothing else, and a chooser that reaches past
       `targetManual` will still take the bait. */
    guard(['aNamedTargetIsObeyed'], () => {
      wipe();
      const us = mine(4);
      const near = put('bandit', gx - 1, gy, { name: 'Near', weapon: 'w_club' });
      near.noFight = true;
      const far = put('bandit', gx + 2, gy, { name: 'Far', weapon: 'w_club' });
      far.noFight = true;
      for (const u of us) { u.target = far; u.targetManual = true; u.scanT = 0; }
      step(1.2);
      const kept = us.filter(u => u.target === far).length;
      R.aNamedTargetIsObeyed = kept === 4
        ? 'all four keep the target you named, with a closer one standing right there'
        : `!! ${4 - kept} OF 4 DROPPED THE TARGET YOU NAMED FOR ${near.name}`;
    });

    /* and they must not spend the fight changing their minds */
    guard(['theyDoNotThrash'], () => {
      wipe();
      const us = mine(6);
      for (let i = 0; i < 5; i++) put('bandit', gx + 4 + (i % 2) * 1.5, gy - 3 + i * 1.5, { name: 'B' + i, weapon: 'w_club' });
      for (const u of us) { u.scanT = 0; u.attackMove = { x: gx + 9, y: gy }; }
      const seen = us.map(() => new Set());
      for (let i = 0; i < 90; i++) { step(0.1); us.forEach((u, k) => { if (u.target) seen[k].add(u.target.id); }); }
      const worst = Math.max(...seen.map(s => s.size));
      R.theyDoNotThrash = worst <= 3
        ? `over nine seconds the busiest of them held ${worst} different targets, not a new one every scan`
        : `!! ONE OF THEM WENT THROUGH ${worst} TARGETS IN NINE SECONDS`;
    });

    /* ================== 3. AND IT IS WORTH SOMETHING ==================
       "This results in them getting mowed down by the other enemy units." That is a body count,
       and a body count is the only claim here worth making — the rest is mechanism. Many
       identical fights, because one fight is a coin. */
    guard(['andTheyStopGettingMownDown'], () => {
      /* THE STAGING IS THE REPORT. A brute at the front that is barely worth hitting, and the
         rank behind it that is doing the actual killing — that is the shape of the fight the
         note describes, and the reason piling onto the nearest body is fatal rather than
         merely suboptimal. The first version made the front body killable, so the pile was
         winning anyway and the outcome measured nothing. */
      let standing = 0, fights = 0, bows = 0;
      for (let t = 0; t < 14; t++) {
        wipe();
        const us = mine(6);
        const wall = put('bandit', gx - 2, gy, { name: 'Wall', tough: 90, def: 38, atk: 10, weapon: 'w_club', armor: 'a_pla' });
        wall.blood = wall.maxBlood = 900;
        const rank = [];
        for (let i = 0; i < 5; i++) rank.push(put('bandit', gx + 4, gy - 4 + i * 1.9, { name: 'Bow' + i, atk: 26, weapon: 'w_xbow', armor: 'a_lea' }));
        for (const e of rank) e.stance = 'ranged';
        for (const u of us) { u.attackMove = { x: gx + 9, y: gy }; u.scanT = 0; }
        step(60);
        standing += us.filter(u => u.state === 'ok').length;
        bows += rank.filter(e => e.state !== 'ok').length;
        fights++;
      }
      const avg = standing / fights, kills = bows / fights;
      R._battle = `over ${fights} fights of 6 against an unkillable brute and 5 crossbows: ${avg.toFixed(2)} of mine still standing, ${kills.toFixed(2)} of the 5 bows down`;
      R.andTheyStopGettingMownDown = (avg >= 2.5 && kills >= 2)
        ? `and the line answers the rank instead of the wall — ${avg.toFixed(2)} of 6 standing, ${kills.toFixed(2)} bows down`
        : `!! ${avg.toFixed(2)} OF 6 SURVIVE AND ${kills.toFixed(2)} BOWS FALL — the line is still throwing itself at the brute`;
    });

    wipe();
    return R;
  });

  const bad = Object.values(out).filter(v => typeof v === 'string' && v.startsWith('!!'));
  for (const [k, v] of Object.entries(out)) console.log('  ' + k.padEnd(30) + v);
  for (const e of errs) console.log('  ' + e);
  console.log('');
  console.log(bad.length || errs.length ? `THE WHOLE LINE IS FIGHTING ONE MAN (${bad.length + errs.length})`
                                        : 'A SQUAD PICKS ITS FIGHTS LIKE A SQUAD');
  await b.close();
  process.exit(bad.length || errs.length ? 1 : 0);
})();
