#!/usr/bin/env node
/* HOW A LINE BEHAVES WHEN IT CLOSES, AND WHAT IT COSTS TO LEAVE ONE.
 *
 * Two reports, and they turned out to share a page of code:
 *
 *   1. "The melee pathing system seems to have gone a bit janky. Everyone tries to beeline
 *       towards the enemy and gets caught on allies. They should attempt to flank around
 *       where possible."
 *   2. "Kiting should slow down the ranged attacker... And catching a ranged attacker in
 *       melee should somewhat lock them down from fleeing again. (Somewhat — they should
 *       reasonably be able to escape if, say, an ally also engages that enemy.)"
 *
 * WHAT IS MEASURED, and why each is measured the way it is:
 *
 *   · FLANKING is an angular question, not a distance one. Six bodies all standing 1.2 tiles
 *     from a target could be in a neat ring or all in a heap on one side, and only the
 *     BEARINGS tell them apart. So the probe counts how many of the eight sectors around the
 *     target end up occupied, which is the same quantity the game itself now steers on.
 *   · GRINDING is measured as ground covered, not as a final position: a body wedged behind
 *     its own front rank still ends up near the enemy eventually, so "did it arrive" hides
 *     the bug. What it cannot do while wedged is MOVE, so the probe watches the slowest
 *     member of the back rank and asks whether it ever got anywhere.
 *   · The two speed rules are measured against a CONTROL body standing in identical
 *     circumstances minus the one thing being tested, because `moveSpeed` is a stack of a
 *     dozen multipliers and an absolute number here would be asserting the whole stack.
 *
 *   node tools/press.js [game.html]
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
  await p.waitForFunction(() => {
    const bs = document.getElementById('btn-start');
    return bs && typeof chars !== 'undefined' && chars.length > 0;
  }, null, { timeout: 60000 });
  await p.evaluate(() => document.getElementById('btn-start').click());
  await p.waitForFunction(() => document.getElementById('startoverlay').style.display === 'none', null, { timeout: 60000 });

  const out = await p.evaluate(() => {
    const R = {};
    paused = true;

    /* open ground, well away from anybody the world placed */
    let gx = 0, gy = 0;
    outer:
    for (let y = 60; y < H - 60; y += 6) for (let x = 60; x < W - 60; x += 6) {
      if (isBlocked(x + 0.5, y + 0.5)) continue;
      if (towns.some(t => dist(t.x, t.y, x, y) < 80)) continue;
      let ok = true;
      for (let j = -10; j <= 10 && ok; j += 2) for (let i = -10; i <= 10 && ok; i += 2)
        if (isBlocked(x + i + 0.5, y + j + 0.5)) ok = false;
      if (ok) { gx = x; gy = y; break outer; }
    }
    R.ground = gx ? `staged on open waste at ${gx},${gy}` : '!! NO OPEN GROUND WIDE ENOUGH';

    const wipe = () => { for (let i = chars.length - 1; i >= 0; i--) if (chars[i].__probe) chars.splice(i, 1); };
    const mk = (name, f, x, y, o) => {
      const c = makeChar(name, f, x, y, o || {});
      c.state = 'ok'; c.__probe = true; chars.push(c); return c;
    };
    const run = (n) => { paused = false; for (let i = 0; i < n; i++) update(0.1); paused = true; };
    const sector = (o, t) => (((Math.atan2(o.y - t.y, o.x - t.x) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2) * 8 | 0) % 8;

    /* ================== 1. TWELVE ONTO ONE ==================
       All twelve start on the SAME side, which is the case that queues: the far side of the
       target is open ground and nobody ever went round to it.
       TWELVE AND NOT SIX, and the number is the point. At six the old build and the new one
       both put four of eight sectors round the target and this file proved nothing — six
       bodies fit round a man without anybody having to queue, so the bug cannot show. At
       twelve the same measurement separates them completely: SEVEN of the twelve ended up
       stacked in one sector on the old build, trailing back to 4.5 tiles, against a maximum
       of two per sector and a 2.2-2.5 ring on this one. Pick the crowd size where the thing
       being measured is actually forced to happen. */
    {
      wipe();
      const mark = mk('Mark', 'bandit', gx, gy, { atk: 6, def: 8, tough: 400, ath: 1 });
      mark.noFight = true; mark.speedMult = 0.0001;   /* it stands still and soaks: this is about the approach */
      const squad = [];
      for (let i = 0; i < 12; i++) {
        const a = mk('A' + i, 'player', gx - 8 - (i % 4) * 0.7, gy - 3 + i * 0.55, { atk: 20, def: 10, tough: 60, ath: 10 });
        a.target = mark; a.targetManual = false; a.autoFight = true;
        squad.push(a);
      }
      const start = squad.map(a => ({ a, x: a.x, y: a.y }));
      run(140);

      /* THE CAP IS 3 AND THAT IS DELIBERATE — "a body only has so many sides", so three engage
         and the rest hold at spear-length. Asserting six arrive would be asserting against the
         game's own rule. What is asked here is that three DO get hold of it. */
      const inClose = squad.filter(a => dist(a.x, a.y, mark.x, mark.y) < 2.6);
      R.theyGetThere = inClose.length >= 9
        ? `${inClose.length} of 12 reach it — three with hold of it, the rest waiting at spear-length`
        : `!! ONLY ${inClose.length} OF 12 CLOSED — the back of the line never arrived (${squad.map(a => dist(a.x,a.y,mark.x,mark.y).toFixed(1)).sort().join(', ')})`;
      /* THE TWO ASSERTIONS THE WHOLE FILE IS FOR, and they count everybody rather than only
         the three who got hold: the ones waiting their turn are just as much part of the
         shape, and a queue is a queue whether it is touching the target or standing behind it.
         `maxPerSector` is the sharper of the two — "how many sides are occupied" can look
         respectable while one of those sides holds most of the squad. */
      const ring = squad.filter(a => dist(a.x, a.y, mark.x, mark.y) < 5.0);
      const hist = [0,0,0,0,0,0,0,0];
      for (const a of ring) hist[sector(a, mark)]++;
      const sectors = hist.filter(n => n > 0).length, maxPer = Math.max(...hist);
      R.theySpreadAround = sectors >= 5
        ? `the ${ring.length} of them around it stand on ${sectors} of 8 sides`
        : `!! ${ring.length} BODIES ON ${sectors} SIDE(S) — the line is queueing, not flanking`;
      /* THE LINE IS AT 5 AND NOT AT 3, and the difference matters. The queue this exists to
         catch puts SEVEN of twelve into one eighth of the circle; the fixed build has measured
         2, 3 and 4 across three different revisions while the sides-occupied count went 6, 7,
         7 — which is to say the worst-cluster number bounces at the margin for reasons that
         have nothing to do with queueing (bodies get whatever weapon `makeChar` rolls them,
         and a bow behaves differently in contact from an axe). A threshold pinned to one
         build's exact arrangement is a threshold that fails on the next unrelated change,
         which is what happened. Five separates the bug from the fix with room, and 12 bodies
         over 8 sectors averages 1.5, so five in one is still plainly a heap. */
      R.nobodyStacksUp = maxPer <= 5
        ? `and no side holds more than ${maxPer} of them (a queue puts 7 there)`
        : `!! ${maxPer} OF THEM PILED ONTO ONE SIDE — that is the queue, measured`;
      /* nobody wedged: the least-travelled body still has to have gone somewhere */
      const moved = start.map(s => dist(s.x, s.y, s.a.x, s.a.y)).sort((u, v) => u - v);
      R.nobodyIsWedged = moved[0] > 3.5
        ? `the least-travelled of them still covered ${moved[0].toFixed(1)} tiles`
        : `!! SOMEBODY BARELY MOVED (${moved[0].toFixed(1)} tiles) — jammed on their own side`;
    }

    /* ================== 2. THROUGH YOUR OWN RANKS ==================
       One body ordered at a target with a wall of its OWN people in the way. An ally was the
       case the slide rule did not cover, and it is the common one. */
    {
      wipe();
      const mark = mk('Mark2', 'bandit', gx + 8, gy, { atk: 6, def: 8, tough: 400, ath: 1 });
      mark.noFight = true; mark.speedMult = 0.0001;
      for (let i = 0; i < 5; i++) {
        const w = mk('Wall' + i, 'player', gx + 2.0, gy - 2 + i, { atk: 8, def: 8, tough: 60, ath: 1 });
        w.stance = 'hold'; w.speedMult = 0.0001;    /* a picket of your own that will not step aside */
      }
      const runner = mk('Runner', 'player', gx, gy, { atk: 20, def: 10, tough: 60, ath: 12 });
      runner.target = mark; runner.targetManual = true;
      const d0 = dist(runner.x, runner.y, mark.x, mark.y);
      run(160);
      const d1 = dist(runner.x, runner.y, mark.x, mark.y);
      R.pastYourOwnLine = d1 < 2.0
        ? `a body ordered through five of its own closed to ${d1.toFixed(1)} tiles`
        : `!! STUCK BEHIND ITS OWN SIDE (${d0.toFixed(1)} -> ${d1.toFixed(1)} tiles)`;
    }

    /* ================== 3. THE LOOSE COSTS YOUR FEET ==================
       Two identical archers. One has just fired; the other has not. Nothing else differs. */
    {
      wipe();
      /* ONE BODY, NOT TWO. The first draft used a second archer as the control and it drifted
         by 1% — `makeChar` rolls a subrace onto whatever stats it is handed, so two bodies
         asked for identically are not identical. The only honest control for a multiplier is
         the same body with the multiplier off. */
      const shot = mk('Shot', 'player', gx, gy, { atk: 14, def: 8, tough: 40, ath: 9, weapon: 'w_bow' });
      shot.shotT = 0;
      const base = moveSpeed(shot);
      shot.shotT = 1.15;                     /* exactly what a loose leaves behind */
      const dragged = moveSpeed(shot);
      shot.shotT = 0;
      R.aLooseIsFree = Math.abs(moveSpeed(shot) - base) < 1e-9
        ? 'the same archer, unshot, is the control'
        : `!! THE CONTROL DRIFTED (${base.toFixed(3)} vs ${moveSpeed(shot).toFixed(3)})`;
      R.shootingCostsGround = dragged < base * 0.85
        ? `and one that has just loosed moves at ${(dragged / base * 100).toFixed(0)}% of that`
        : `!! A SHOT COSTS NOTHING (${base.toFixed(2)} -> ${dragged.toFixed(2)}) — shoot and scoot is free`;
    }

    /* ================== 3b. TOO CLOSE TO SHOOT IS NOT NOTHING TO DO ==================
       The other half of the same branch. A body holding a ranged weapon refuses to fire
       inside 1.7 tiles — correctly — and used to stop there, so anything that reached an
       archer got to beat it to death while it stood with its guard up. Measured through the
       real loop, with the enemy already in contact so there is no approach to confuse it. */
    {
      wipe();
      const archer = mk('Lancer', 'player', gx, gy, { atk: 26, def: 10, tough: 60, ath: 8, weapon: 'w_lance' });
      archer.gift = null;                              /* the lance refuses a gifted hand */
      archer.autoFight = true;
      const thug = mk('Thug', 'bandit', gx + 0.85, gy, { atk: 6, def: 6, tough: 400, ath: 1 });
      thug.noFight = true; thug.speedMult = 0.0001;   /* it stands in contact and soaks */
      archer.target = thug; archer.targetManual = true;
      const hp0 = thug.blood;
      /* WATCH WHILE IT RUNS. The no-shoot rule is about what happens DURING the fight, and a
         windup lasts a fraction of a second — reading `archer.windup` after 12 seconds would
         sample one arbitrary frame and call it a proof. */
      let sawRanged = 0, sawMelee = 0, closest = 9;
      paused = false;
      for (let i = 0; i < 120; i++) {
        update(0.1);
        const dd = dist(archer.x, archer.y, thug.x, thug.y);
        if (dd < closest) closest = dd;
        /* ONLY WHILE INSIDE THE RULE'S RANGE. `separate()` pushes hostile bodies apart to 0.8
           and keeps shoving, so a body staged in contact drifts back out past 1.7 during a
           long run and is then perfectly entitled to shoot. Counting every draw over the whole
           run reported 24 violations for a body that never once loosed inside its own guard —
           the probe was measuring the separation, not the rule. */
        if (archer.windup && dd < 1.7) (archer.windup.kind === 'ranged' ? sawRanged++ : sawMelee++);
      }
      paused = true;
      R.cornersFightBack = thug.blood < hp0
        ? `an archer with somebody on its chest defends itself — the thug drops from ${hp0} to ${Math.max(0, thug.blood).toFixed(0)}`
        : `!! IT STANDS THERE AND TAKES IT (thug still at ${thug.blood.toFixed(0)}, archer atkCd ${archer.atkCd.toFixed(1)})`;
      /* ---------- AND A BOW DOES NOT ----------
         THE FIRST VERSION OF THIS FIX SENT EVERY RANGED BODY INTO THE BRAWL, bows included,
         and `command.js` found it inside the hour: a foraging band came home 5 dead of 5,
         commander included. `blocking` multiplies an attacker's hit chance by as little as
         0.30 and halves the stagger roll, so archers had been quietly living on it every time
         something reached them — standing and guarding is the RIGHT answer for a bow, and the
         wrong one only for a weapon with a spike on the end of it. Both halves are pinned here
         so the next person to widen this branch has to mean it. */
      {
        const bowman = mk('Bowman', 'player', gx, gy + 6, { atk: 26, def: 10, tough: 60, ath: 8, weapon: 'w_bow' });
        bowman.autoFight = true;
        const brute = mk('Brute', 'bandit', gx + 0.85, gy + 6, { atk: 6, def: 6, tough: 400, ath: 1 });
        brute.noFight = true; brute.speedMult = 0.0001;
        bowman.target = brute; bowman.targetManual = true;
        /* MEASURED WHERE THE RULE APPLIES, again. "The brute took no damage" is the wrong
           reading: `separate()` shoves the pair apart past 1.7 and the bowman then quite
           correctly shoots it. What must never happen is a bow SWINGING at arm's length
           instead of guarding — so count melee windups inside the threshold, not damage. */
        let guarded = 0, bowSwings = 0;
        paused = false;
        for (let i = 0; i < 120; i++) {
          update(0.1);
          const dd = dist(bowman.x, bowman.y, brute.x, brute.y);
          if (dd < 1.7) {
            if (bowman.blocking) guarded++;
            if (bowman.windup && bowman.windup.kind !== 'ranged') bowSwings++;
          }
        }
        paused = true;
        R.aBowKeepsItsGuard = bowSwings === 0 && guarded > 20
          ? `a bow at the same range keeps its guard up instead — ${guarded} frames blocking inside 1.7 tiles and not one swing`
          : `!! A BOWMAN IS BRAWLING (${bowSwings} swings inside 1.7, blocked ${guarded}) — that is what killed the forage band`;
      }
      /* and the rule this is built on has to survive: nobody looses an arrow into a body at
         arm's length. Both halves matter — a fix that simply deleted the 1.7-tile refusal
         would pass the assertion above and break the thing the refusal is for. */
      R.stillWillNotShoot = sawMelee > 0 && sawRanged === 0
        ? `and it swings rather than shooting — ${sawMelee} melee windups inside 1.7 tiles and not one draw (closest ${closest.toFixed(2)})`
        : `!! IT IS ${sawRanged ? 'SHOOTING FROM INSIDE ITS OWN GUARD (' + sawRanged + ' draws under 1.7)' : 'NOT SWINGING EITHER'}`;
    }

    /* ================== 4. HELD, AND LET GO ==================
       The escape clause is the interesting half: it is not a timer, it is whether the body
       holding you has somebody else on it. */
    {
      wipe();
      const archer = mk('Quarry', 'player', gx, gy, { atk: 10, def: 8, tough: 40, ath: 9, weapon: 'w_bow' });
      const holder = mk('Holder', 'bandit', gx + 1.0, gy, { atk: 18, def: 10, tough: 60, ath: 9, weapon: 'w_sword' });
      holder.target = archer;
      run(2);                                 /* separate() stamps the contact */
      const free0 = (() => { const o = archer._pinnedBy; archer._pinnedBy = null; const v = moveSpeed(archer); archer._pinnedBy = o; return v; })();
      const held = moveSpeed(archer);
      R.caughtIsCaught = held < free0 * 0.7
        ? `an archer with a blade on it moves at ${(held / free0 * 100).toFixed(0)}% of its own pace`
        : `!! A BLADE IN YOUR FACE COSTS NOTHING (${free0.toFixed(2)} -> ${held.toFixed(2)})`;
      /* now a friend arrives and takes the holder's attention */
      const rescue = mk('Rescue', 'player', gx + 1.7, gy + 0.5, { atk: 20, def: 10, tough: 60, ath: 9, weapon: 'w_sword' });
      rescue.target = holder;
      run(2);
      const afterRescue = moveSpeed(archer);
      R.aFriendGetsYouOut = afterRescue > held * 1.5
        ? `and once an ally engages the same body it is loose again (${(afterRescue / free0 * 100).toFixed(0)}% of pace)`
        : `!! A RESCUE CHANGES NOTHING (${held.toFixed(2)} -> ${afterRescue.toFixed(2)}) — the pin has no way out`;
      R.theHolderIsTheReason = (holder._contacts || 0) >= 2
        ? `because the holder now has ${holder._contacts} of them to deal with, not one`
        : `!! THE HOLDER NEVER NOTICED THE SECOND BODY (contacts ${holder._contacts})`;
      wipe();
    }

    return R;
  });

  console.log('=== CLOSING A LINE, AND LEAVING ONE ===\n');
  for (const [k, v] of Object.entries(out)) console.log('  ' + k.padEnd(26) + v);
  const bad = Object.values(out).map(String).filter(v => v.startsWith('!!'));
  console.log('\n' + (bad.length ? '*** ' + bad.join('\n*** ')
    : 'A LINE SPREADS AROUND WHAT IT CLOSES ON, AND LEAVING A FIGHT COSTS SOMETHING'));
  if (errs.length) { console.log('errs:', errs.length); errs.slice(0, 4).forEach(e => console.log('  ' + e)); }
  await b.close();
  if (bad.length) process.exitCode = 1;
})();
