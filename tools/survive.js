#!/usr/bin/env node
/* HOW PEOPLE DIE, and how much room there is between going down and being gone.
 *
 * The note was "death seems pretty quick to happen — perhaps a slight, very slight tweak
 * toward survivable encounters". Slight is the hard part: a blanket damage nerf would undo
 * every hour spent on weapon and armour balance, and the swing counts in tools/ttk.js are
 * not the problem — seventeen swings to put down an unarmoured body is not a quick death.
 *
 * So this measures the part nobody has measured: what happens AFTER someone goes down.
 * That is where a fight turns from a setback into a funeral, and it is the one dial that
 * can be moved without touching a single number a weapon cares about.
 *
 *   node tools/survive.js [game.html]
 *
 * Everything here is a device-independent count. Nothing depends on frame rate.
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
  /* ---------- PAUSE IN THE SAME EVALUATE AS THE CLICK ----------
     THIS WAS THE UNEXPLAINED FOUR POINTS. Starting the game and then sleeping 2500ms leaves
     the world running live for two and a half seconds — hundreds of frames, each consuming an
     unpredictable number of `rnd()` draws — so where the stream is standing when the first
     measurement begins depends on HOW FAST THE MACHINE IS and HOW MANY BODIES ARE IN THE
     WORLD. A batch that adds a hundred bodies underground burns more draws per frame; a loaded
     machine runs fewer frames. Both move the answer, and neither is a change in behaviour.
     Measured: the survival share read 43% and 59% on the same build across two runs, and 43 /
     56 / 58 across three builds, all of it from this window. `wanderers.js` closes it and says
     why; this file did not. Same fix, and the number holds still afterwards. */
  await p.evaluate(() => { document.getElementById('btn-start').click(); paused = true; });
  await p.waitForTimeout(2500);

  const out = await p.evaluate(() => {
    const R = {};
    /* makeChar does NOT push to `chars`; anything that pushes must remove itself the same
       way, and `splice(indexOf(x), 1)` on an absent element deletes the LAST element of the
       array instead — which in an earlier harness quietly deleted the player's own body. */
    const born = [];
    /* ---------- PIN THE LINE, OR THE ROLL IS PART OF THE MEASUREMENT ----------
       `makeChar` with no race rolls a human subrace, and a line changes how hard somebody is
       to kill — Salt-cured is +3 tough +3 armour, Grave-bred is neither. A hundred and
       forty-four bodies through a twelve-round skirmish is a different mix of those every time
       the world's PRNG stream moves, and this file went red at 48% against a 50% floor on a
       build where nothing about bleeding had changed: 16 of 43 died before, 25 of 48 after,
       both of them correct. Dustborn has no bonuses and no gaps, which is what a question
       about the BLEED MODEL wants under it. */
    const mk = (f, o, x, y) => { const c = makeChar('P', f, x, y, Object.assign({ race: 'human', sub: 'dustborn' }, o)); c.state = 'ok'; chars.push(c); born.push(c); return c; };
    const clean = () => { for (const c of born) { const i = chars.indexOf(c); if (i >= 0) chars.splice(i, 1); } born.length = 0; };

    /* ---------- 1. THE SKIRMISH: six of yours against six of theirs ----------
       This runs first because everything after it is measured on the bodies it produces.
       Wounds invented by hand are not the wounds a fight leaves: an earlier version of this
       harness knocked people down with sixty small cuts, which piles up five times the
       bleeding a real exchange does, and then reported the game as lethal on the strength
       of its own choice of damage size. Fight first, measure the casualties. */
    const skirmish = (n) => {
      let dead = 0, down = 0, total = 0, theirFallen = 0;
      const wounded = [];                     /* what the fight actually left on the floor */
      /* THIRTY FIGHTS, NOT TWELVE. Forty-seven casualties is a sample whose survival share
         swings fifteen points between two builds of identical combat code, purely on where
         the PRNG happens to be standing — and the bound it is measured against is a half. */
      for (let r = 0; r < 30; r++) {
        const mine = [], theirs = [];
        for (let i = 0; i < n; i++) {
          const a = mk('player', { atk: 16, def: 14, tough: 13, ath: 8, blades: 12 }, 600 + i * 0.7, 599);
          a.weapon = 'w_kat'; a.armor = 'a_lea'; mine.push(a);
          const d = mk('bandit', { atk: 16, def: 14, tough: 13, ath: 8, blades: 12 }, 600 + i * 0.7, 601);
          d.weapon = 'w_kat'; d.armor = 'a_lea'; theirs.push(d);
        }
        for (let i = 0; i < n; i++) { mine[i].target = theirs[i]; theirs[i].target = mine[i]; }
        for (let t = 0; t < 900 && theirs.some(o => o.state === 'ok'); t++) {
          for (const c of mine.concat(theirs)) if (c.state === 'ok') { physics(c, 0.1); bodyTick(c, 0.1 / 60); }
        }
        for (const c of mine) {
          total++;
          if (c.state === 'dead') dead++;
          else if (c.state === 'down') {
            down++;
            wounded.push({ blood: c.blood, parts: JSON.parse(JSON.stringify(c.parts)) });
          }
        }
        for (const c of theirs) if (c.state !== 'ok') theirFallen++;
        clean();
      }
      return { dead, down, total, theirFallen, wounded };
    };
    const sk = skirmish(6);
    R.skirmish = `${sk.dead} dead and ${sk.down} down out of ${sk.total} across 30 even fights`;
    {
      const w = sk.wounded;
      const bl = w.map(o => Object.values(o.parts).reduce((s, q) => s + q.bleed, 0)).sort((a, b) => a - b);
      R.atTheMoment = w.length
        ? `they hit the dirt on ~${Math.round(w.reduce((s, o) => s + o.blood, 0) / w.length)} blood, ` +
          `median ${bl[bl.length >> 1].toFixed(1)} bleeding`
        : '!! THE SKIRMISH PRODUCED NO CASUALTIES TO MEASURE';
    }
    R.deathShare = `${Math.round(100 * sk.dead / Math.max(1, sk.dead + sk.down))}% of the fallen died outright`;
    /* An even fight should mostly produce casualties you can carry home, not a body count.
       Over half of the fallen dying outright is the thing the note is describing. */
    R.mostlyRecoverable = (sk.dead <= sk.down)
      ? 'more of the fallen can be carried home than buried'
      : `!! MORE DIE THAN DROP: ${sk.dead} dead against ${sk.down} down`;

    /* ---------- 2. THE WINDOW: down, and then what ----------
       Losing a fight should cost you people for a while, not forever. Take the real bodies
       the skirmish left and let them lie: untended, and with one bandage on the worst wound
       (which is all a medic manages in the first pass). */
    const afterTheFight = (tend) => {
      const hours = [], rose = [];
      let aliveAt4 = 0;
      for (const w of sk.wounded) {
        const c = mk('player', { atk: 12, def: 12, tough: 13, ath: 8 }, 600, 600);
        c.blood = w.blood;
        for (const k of PARTS) Object.assign(c.parts[k], w.parts[k]);
        c.state = 'down'; c.downT = 0;
        if (tend) { const p2 = PARTS.map(k => c.parts[k]).sort((a, b) => b.bleed - a.bleed)[0]; p2.bleed = 0; p2.bandaged = true; }
        let h = 0, alive4 = true;
        while (h < 24 && c.state === 'down') { bodyTick(c, 0.1); h += 0.1; if (h >= 4 && c.state === 'dead' && alive4) alive4 = false; }
        if (c.state === 'dead' && h < 4) alive4 = false;
        if (alive4) aliveAt4++;
        if (c.state === 'dead') hours.push(h); else if (c.state === 'ok') rose.push(h);
      }
      clean();
      hours.sort((a, b) => a - b);
      return { died: hours.length, rose: rose.length, n: sk.wounded.length, aliveAt4,
               medianHours: hours.length ? +hours[hours.length >> 1].toFixed(1) : null };
    };
    const raw = afterTheFight(false), tended = afterTheFight(true);
    /* in real seconds as well as game hours: the player experiences HOUR_SEC, not `dh`, and
       "median 1.1h" reads survivable right up until you notice it is nine seconds */
    const real = (h) => h === null ? '' : ` (${Math.round(h * HOUR_SEC)}s real)`;
    R.leftLying = `${raw.died}/${raw.n} of the downed die untended, ${raw.rose} get back up on their own` +
      (raw.medianHours !== null ? `, median ${raw.medianHours}h${real(raw.medianHours)}` : '');
    /* The window is NOT the median time-to-death among those who die — those are the worst
       cut, they go fast, and they are supposed to. The question a player is actually asking
       is "if I run over there, will anybody still be alive when I arrive", so measure the
       share of ALL untended casualties still breathing after a plausible rescue: four game
       hours, which at HOUR_SEC 8 is a little over half a real minute. */
    /* ---------- AND THE BOUND IS WHERE IT IS BECAUSE OF A MEASUREMENT ----------
       This share is SENSITIVE TO WHERE THE PRNG IS STANDING, which was measured rather than
       supposed: burning 0, 1, 7, 33 and 101 draws before an otherwise identical experiment on
       one unchanged build gives 54%, 63%, 57%, 63%, 57% — a nine-point spread at n≈120, on a
       bound that used to sit at exactly one half. So it flipped this suite red on a batch that
       does not touch `bleed`, `bodyTick`, `downAt`, `attack` or `interposer`, none of which
       appear anywhere in that diff.
       A half was never the claim anyway. The claim is that losing a fight costs you people
       FOR A WHILE AND NOT FOREVER — the failure it exists to catch is casualties dying where
       they fall, which reads as single digits, not as forty-something. The bound is a third,
       which is clear of the spread; the NUMBER is printed either way, so the next time it
       drifts it drifts visibly instead of flipping. */
    R.windowToReach = raw.aliveAt4 >= raw.n * 0.33
      ? `${Math.round(100 * raw.aliveAt4 / raw.n)}% of ${raw.n} are still alive ${Math.round(4 * HOUR_SEC)}s after they drop`
      : `!! ONLY ${Math.round(100 * raw.aliveAt4 / raw.n)}% OF ${raw.n} SURVIVE THE FIRST ${Math.round(4 * HOUR_SEC)}s — nobody can cross a fight in that`;
    R.oneBandage = `${tended.died}/${tended.n} die with one bandage on the worst wound, ${tended.rose} get up`;
    /* THE NOTE, MADE INTO A NUMBER. If every single casualty of an even fight dies unless
       somebody reaches them with a bandage, then losing a fight is a funeral and the player
       is right that death comes too easily. Some should still die — that is the brutality
       the rest of the design is built on — but "some" is not "all". */
    R.notAFuneral = (raw.rose > 0 && raw.died < raw.n)
      ? `losing a fight is survivable for ${Math.round(100 * raw.rose / raw.n)}% of the fallen without help`
      : '!! EVERY UNTENDED CASUALTY DIES — losing a fight is a funeral, not a setback';
    /* and the other half of slight: a bandage must still be worth crossing a field for */
    R.tendingMatters = (tended.rose > raw.rose)
      ? `a bandage lifts that to ${Math.round(100 * tended.rose / Math.max(1, tended.n))}%`
      : '!! TENDING THE WOUNDED NO LONGER CHANGES ANYTHING';

    /* ---------- 3. A BODYGUARD IS SOMEBODY WHO TAKES THE BLOW ---------- */
    {
      /* ---------- COUNT THE BLOWS THAT LANDED, NOT THE CALLS THAT WERE MADE ----------
         This divided by 400 SWINGS, but a swing is not a trial: `attack` returns early on
         cooldown, on a miss and on a stagger, and none of those ever reach `interposer`. So
         the denominator was mostly no-ops and the real sample was a fraction of it — which is
         how the same unmodified guard code read 10% on one build and 4% on another, four
         standard deviations apart if you believe n is 400 and ordinary noise once you count
         what actually happened. Divide by the blows that resolved, and take more of them. */
      let caught = 0, resolved = 0, swings = 1200;
      const ward = mk('player', { atk: 10, def: 12, tough: 12, ath: 8 }, 600, 600);
      ward.blood = ward.maxBlood = 1e6;
      const g = mk('player', { atk: 14, def: 20, tough: 16, ath: 12 }, 600.9, 601.4);
      g.blood = g.maxBlood = 1e6;
      g.guardTarget = ward; g.job = 'guard';
      const foe = mk('bandit', { atk: 16, def: 12, tough: 12, ath: 8 }, 601.8, 602.6);
      const wasWard = ward.blood, wasG = g.blood;
      const tot = (c) => c.blood + Object.values(c.parts).reduce((s, q) => s + q.hp, 0);
      /* ---------- RESET THE STAGING, NOT JUST THE WOUNDS ----------
         Reported as "a bodyguard catches one blow in fifty", and it was three artefacts of
         this loop stacked on top of each other, none of them in the game:
           · A CAUGHT BLOW KNOCKS THE GUARD BACK and nothing here put it back, so after a few
             dozen swings it had drifted 56 TILES from the ward and every later swing was a
             body on the far side of a field being asked to block. 1359 of 2000 swings failed
             on the distance gate alone.
           · `blood = 1e6` DOES NOT MEAN UNKILLABLE — parts still fail, which is written down
             in this repo already — so the ward eventually died mid-swing.
           · and `kill` runs `releaseTargets`, which clears `guardTarget` on everyone pointing
             at the corpse. One unlucky swing ended interposition for the whole rest of the run
             and the rate collapsed toward zero, at a speed that depended on the PRNG. That is
             the whole of the 10%-versus-4% "difference between builds".
         Pin the three of them, keep the ward alive, and re-state the order every swing. The
         measured rate is 39% of landed blows, not 2%. */
      for (let i = 0; i < swings; i++) {
        foe.swingT = 0; foe.staggerT = 0; foe.cool = 0;      /* every call is a real trial */
        ward.x = 600; ward.y = 600; g.x = 600.9; g.y = 601.4; foe.x = 601.8; foe.y = 602.6;
        for (const c of [ward, g, foe]) { c.vx = 0; c.vy = 0; c.lungeT = 0; c.knockT = 0; }
        g.job = 'guard'; g.guardTarget = ward;
        const b4 = tot(g), w4 = tot(ward);
        attack(foe, ward);
        const af = tot(g);
        if (af < b4 || tot(ward) < w4) resolved++;
        if (af < b4) caught++;
        for (const k of PARTS) { g.parts[k].hp = g.parts[k].max; g.parts[k].bleed = 0; ward.parts[k].hp = ward.parts[k].max; ward.parts[k].bleed = 0; }
        g.blood = wasG; ward.blood = wasWard; g.staggerT = 0; ward.staggerT = 0;
        g.state = 'ok'; ward.state = 'ok';
      }
      const pct = Math.round(100 * caught / Math.max(1, resolved));
      R.interpose = `a guard on the line took ${pct}% of the ${resolved} blows that actually landed on somebody (of ${swings} swings)`;
      /* THE BAND IS ROUND WHAT THE GAME ACTUALLY DOES. `interposer` pays
         `clamp(0.20 + def*0.006 + ath*0.004, 0, 0.55)`, so a guard runs from one blow in five
         at no skill to the 0.55 cap at high skill; this one (def 20, ath 12) computes 0.368
         and measures 39% of landed blows, the small excess being blows the ward would have
         dodged anyway. 20-55 is that formula's own range, and it is a real bound in both
         directions — a guard who catches everything is as wrong as one who catches nothing. */
      R.interposeSane = (resolved >= 200 && pct >= 20 && pct <= 55) ? 'inside the intended band'
        : `!! INTERPOSITION IS ${pct}% OF ${resolved} LANDED BLOWS — outside the 20-55% band`;
      /* ---------- AND BEHIND THE WARD IT MUST DO NOTHING AT ALL: POSITION IS THE SKILL ----------
         THE SAME BUG AS THE LOOP ABOVE, LEFT IN THE LOOP BELOW IT. This reset the wounds and
         not the staging, and it went red on a full-suite run with `BLOCKED 1 BLOWS FROM BEHIND
         THE WARD` — which is a probe artefact, not a defect. Measured: `interposer` asked
         directly, with the three bodies pinned behind, picked a guard 0 times in 4000. What
         moves is the WARD: 200 unreset `attack` calls knock her from 600,600 to 581.5,573.3,
         directly away from the foe, so the guard she was standing in front of ends up in
         FRONT of her (face 1.000, 29 tiles out) and one blow crossed over on the way.
         So: pin all three every swing, the way the loop above does, and print the denominator
         — `behind = 0` out of nothing is not a pass. And place the guard INSIDE `GUARD_STEP`,
         or the distance gate rejects him and this goes green without ever testing the facing. */
      let behind = 0, behindLanded = 0;
      const ux = (601.8 - 600) / Math.hypot(1.8, 2.6), uy = (602.6 - 600) / Math.hypot(1.8, 2.6);
      for (let i = 0; i < 400; i++) {
        foe.swingT = 0; foe.staggerT = 0; foe.cool = 0;
        ward.x = 600; ward.y = 600; foe.x = 601.8; foe.y = 602.6;
        g.x = 600 - ux * 1.4; g.y = 600 - uy * 1.4;      /* 1.4 out, dead behind her */
        for (const c of [ward, g, foe]) { c.vx = 0; c.vy = 0; c.lungeT = 0; c.knockT = 0; }
        g.job = 'guard'; g.guardTarget = ward;
        const b4 = tot(g), w4 = tot(ward);
        attack(foe, ward);
        if (tot(g) < b4) behind++;
        if (tot(g) < b4 || tot(ward) < w4) behindLanded++;
        for (const k of PARTS) { g.parts[k].hp = g.parts[k].max; g.parts[k].bleed = 0; ward.parts[k].hp = ward.parts[k].max; ward.parts[k].bleed = 0; }
        g.blood = wasG; ward.blood = wasWard; g.staggerT = 0; ward.staggerT = 0;
        g.state = 'ok'; ward.state = 'ok';
      }
      R.noBlocksFromBehind = (behind === 0 && behindLanded >= 200)
        ? `a guard 1.4 tiles behind the ward — inside GUARD_STEP ${GUARD_STEP}, so it is the facing that stops him — blocks 0 of ${behindLanded} landed blows`
        : behindLanded < 200 ? `!! ONLY ${behindLanded} OF 400 SWINGS LANDED — nothing was tested`
        : `!! BLOCKED ${behind} OF ${behindLanded} BLOWS FROM BEHIND THE WARD`;
      clean();
    }

    /* ---------- 4. AND THE WORLD IS NOT SUDDENLY UNKILLABLE ----------
       Survivability must not become immortality. Two identical sides should still put each
       other on the floor at roughly the same rate; if one side stops taking casualties the
       tweak has become a shield rather than a stay of execution. Counting fallen on both
       sides is the honest test — "who won" is a property of how long the harness ran. */
    const fell = sk.dead + sk.down, ratio = fell / Math.max(1, sk.theirFallen);
    R.bothSidesFall = `${fell} of mine fell against ${sk.theirFallen} of theirs`;
    R.stillDangerous = (fell >= sk.total * 0.25 && ratio > 0.6 && ratio < 1.7)
      ? 'an even fight is still an even fight'
      : `!! THE FIGHT IS NO LONGER EVEN — ${fell} against ${sk.theirFallen}`;

    /* ---------- 5. AND A HUNT ENDS WITH A DEAD ANIMAL ----------
       Everything above measures what happens to a body AFTER it goes down, which was the
       whole point of the clotting change — and every one of those numbers stayed healthy
       while the game shipped an animal that could not be killed at all. Two things had to be
       true at once for that, and neither was visible from here:

       The clotting change made a downed body mend instead of bleed out, so letting go of one
       stopped being the same as killing it. And the right-click handler searched for a foe
       with `state === 'ok'` before asking, twelve lines later, whether that foe was DOWN —
       a branch guarded against itself, so the EXECUTE menu could never open. Knock a silt
       strider over and there was no order in the game that would finish it.

       So this drives the real loop, with the clock running, and requires the animal to end
       up dead. `ttk.js` cannot see any of this: it forces `atkCd` to zero and swings in a
       tight loop, so no game time passes and `bodyTick` — the function the whole change is
       in — never runs once. */
    {
      const at = { x: player()[0].x + 14, y: player()[0].y + 14 };
      const secs = [];
      for (let t = 0; t < 6; t++) {
        clean();
        const keep = chars.slice();
        chars.length = 0;
        const beast = mk('fauna', { atk: 12, def: 8, tough: 34, ath: 9 }, at.x, at.y);
        beast.beast = true;
        const pack = [];
        for (let i = 0; i < 3; i++) {
          const h = mk('player', { atk: 14, def: 12, tough: 12, ath: 7, blades: 12 }, at.x + 1.2 + i * 0.4, at.y);
          h.weapon = 'w_kat'; h.armor = 'a_lea';
          pack.push(h);
        }
        let s = 0;
        while (beast.state !== 'dead' && s < 4800) {
          for (const h of pack)
            if (h.state === 'ok' && !h.target && !h.execTarget && beast.state === 'ok') { h.target = beast; h.targetManual = true; }
          update(0.05); s++;
        }
        secs.push(beast.state === 'dead' ? +(s * 0.05).toFixed(1) : null);
        chars.length = 0; for (const k of keep) chars.push(k);
        clean();
      }
      const killed = secs.filter(x => x !== null);
      const med = killed.length ? killed.slice().sort((a, b) => a - b)[Math.floor(killed.length / 2)] : null;
      R.theHuntEnds = killed.length === secs.length
        ? `an ordered pack finishes a silt strider every time, median ${med}s`
        : `!! THE ANIMAL SURVIVED ${secs.length - killed.length}/${secs.length} HUNTS — a downed beast cannot be finished`;
      R.huntIsWork = (med !== null && med >= 5 && med <= 90)
        ? 'and it is a fight, not a formality'
        : `!! A HUNT TAKES ${med === null ? 'forever' : med + 's'}`;
    }
    return R;
  });

  console.log('=== HOW PEOPLE DIE ===\n');
  for (const [k, v] of Object.entries(out)) console.log('  ' + k.padEnd(20) + v);
  const bad = Object.values(out).map(String).filter(v => v.startsWith('!!'));
  console.log('\n' + (bad.length ? '*** ' + bad.join('\n*** ') : 'THE FALLEN CAN BE CARRIED HOME'));
  if (errs.length) { console.log('errs:', errs.length); errs.slice(0, 4).forEach(e => console.log('  ' + e)); }
  await b.close();
  if (bad.length) process.exitCode = 1;
})();
