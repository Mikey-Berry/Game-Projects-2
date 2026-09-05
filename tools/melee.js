#!/usr/bin/env node
/* TWO NOTES ABOUT HOW A FIGHT BEHAVES.
 *
 *   1. "the AI prioritizes ONE target at the expense of everything else — they will
 *       suicidally charge past even large crowds and take tons of opportunity attacks on
 *       the chin and not really care"
 *   2. "not noticing many melee animations playing, just the overhead swipe one"
 *
 * The first is a behaviour and can be measured: stage a runner, a quarry across the field,
 * and a picket line in between, then count the passing cuts it eats and whether it ever
 * deals with anybody. The second is partly a number (which strokes get CHOSEN) and partly a
 * picture (whether the chosen stroke is what you SEE) — the number lives here, the picture
 * lives in tools/moves.js, which renders one row per move.
 *
 *   node tools/melee.js [game.html]
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
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message.slice(0, 220)));
  await p.goto('file://' + gamePath(process.argv[2]), { waitUntil: 'load' });
  await p.waitForTimeout(3000);
  await p.evaluate(() => document.getElementById('btn-start').click());
  await p.waitForTimeout(2500);

  const out = await p.evaluate(() => {
    const R = {};
    const born = [];
    /* makeChar does not push to `chars`; anything that pushes must remove itself, and
       splice(indexOf(x), 1) on an absent element deletes the LAST element instead. */
    /* ---------- PIN THE LINE, OR THE ROLL IS PART OF THE MEASUREMENT ----------
       `makeChar` with no race rolls a human subrace, and a line carries stats: Ironscar-bred
       is +3 atk +3 blades, Orchard-bred is -1 atk. Six of those on each side is a different
       fight every time the world's PRNG stream moves — this file went red the day fourteen
       bodies were added to worldgen a thousand lines above it, on a build where nothing about
       melee had changed at all. Dustborn is the line with no bonuses and no gaps, which is the
       only honest control for a question about the COMBAT and not about the draw. */
    const mk = (f, o, x, y) => { const c = makeChar('X', f, x, y, Object.assign({ race: 'human', sub: 'dustborn' }, o)); c.state = 'ok'; chars.push(c); born.push(c); return c; };
    const clean = () => { for (const c of born) { const i = chars.indexOf(c); if (i >= 0) chars.splice(i, 1); } born.length = 0; };

    /* open ground, or the picket line ends up inside a wall and nobody meets anybody */
    let S = { x: 600, y: 600 };
    outer: for (let y = 60; y < H - 60; y += 9) for (let x = 60; x < W - 60; x += 9) {
      let ok = true;
      for (let j = -8; j <= 8 && ok; j++) for (let i = -3; i <= 12; i++) if (isBlocked(x + i, y + j, 0)) { ok = false; break; }
      if (ok) { S = { x, y }; break outer; }
    }
    /* ---------- AND CLEAR THE PEOPLE OFF IT, NOT JUST CHECK THE ROCKS ----------
       The note above already records this file going red when bodies were added to worldgen,
       and pins the subrace so the DRAW cannot decide the fight. That is half of it: the search
       above asks `isBlocked`, which knows about terrain and nothing about who is standing on
       it, so the world's own wanderers were still free to walk into the middle of a staged
       picket line and take the runner's attention — or shove the line out of his path so that
       he never has to deal with it at all, which is what "an ordered unit walks through a line
       untouched by the idea" turned out to mean. Nobody but this probe's own bodies is on the
       field now. */
    for (let i = chars.length - 1; i >= 0; i--)
      if (dist(chars[i].x, chars[i].y, S.x, S.y) < 40) chars.splice(i, 1);
    for (let i = corpses.length - 1; i >= 0; i--)
      if (dist(corpses[i].x, corpses[i].y, S.x, S.y) < 40) corpses.splice(i, 1);
    /* AND FLATTEN THE FIELD, so the only thing left that can differ between two builds is the
       fight itself. The search above accepts the first box that happens to be clear, which is a
       different box on every world — and a self-contained fight on verified-open ground should
       not care where it is held. Carving it removes the last way the map can get a vote. */
    for (let j = -12; j <= 12; j++) for (let i = -8; i <= 20; i++)
      blocked.delete(bkey(Math.round(S.x) + i, Math.round(S.y) + j, 0));
    rebuildCharGrid();

    /* ---------- 1. THE RUN THROUGH THE LINE ----------
       A runner, a quarry ten tiles away, and six hostiles standing between them. Count the
       passing cuts the runner takes and whether it ever turns on anybody. */
    const charge = (manual, withLine = true) => {
      /* ---------- BLOOD IS NOT THE ONLY WAY TO GO DOWN ----------
         `blood = 1e6` was meant to make these bodies unkillable so the file could count cuts
         instead of deaths, and it does not: `updateState` drops anybody whose VITAL PARTS are
         at or below zero, whatever is in the veins. Six katana-armed bandits put the runner on
         the ground in about ninety ticks, `physics` calls `clearOrders` on a body going down —
         which wipes the order this whole case is about — and the loop then skips it forever
         because it is no longer 'ok'. So `orderNotSuicide` was reading whether the runner
         happened to switch target BEFORE it was knocked out, which is a coin flip on a chaotic
         seven-hundred-tick fight: it flipped the day fourteen bodies were added to worldgen a
         thousand lines above, on a build where nothing about melee had changed.
         The parts go up with the blood. Now the fight runs to the end and the question is the
         one in the assertion. */
      const unkillable = (c) => {
        c.blood = c.maxBlood = 1e6;
        for (const k of PARTS) { c.parts[k].max = 1e6; c.parts[k].hp = 1e6; }
      };
      const runner = mk('player', { atk: 18, def: 14, tough: 14, ath: 10, blades: 20 }, S.x, S.y);
      runner.weapon = 'w_kat'; runner.armor = 'a_lea';
      unkillable(runner);                            /* we are counting cuts, not deaths */
      const quarry = mk('bandit', { atk: 4, def: 8, tough: 40, ath: 2 }, S.x + 10, S.y);
      unkillable(quarry);
      const line = [];
      for (let i = 0; withLine && i < 6; i++) {
        const o = mk('bandit', { atk: 16, def: 12, tough: 12, ath: 8, blades: 15 },
          S.x + 4 + (i % 2) * 0.9, S.y - 2.5 + i * 1.0);
        o.weapon = 'w_kat'; unkillable(o);
        line.push(o);
      }
      runner.target = quarry; runner.targetManual = manual;
      /* A REAL ORDER SETS `orderTarget` TOO — see the right-click chain, which writes
         `m.target = foe; m.targetManual = true; m.orderTarget = foe`. Setting only the first two
         is not an order, it is half of one, and the "an order deferred is not an order lost"
         branch in `physics` reads the third. */
      if (manual) runner.orderTarget = quarry;
      rebuildCharGrid();
      /* Count the cuts taken ON THE WAY IN, not the cuts taken once the brawl has started.
         The first version counted every jab across the whole run, which with unkillable
         bodies is an endless melee — it reported 40 and was measuring the length of the
         fight, not the recklessness of the approach. */
      let cuts = 0, everSwitched = false, closest = 99;
      for (let t = 0; t < 700; t++) {
        for (const o of line) o.oppCd = Math.max(0, (o.oppCd || 0) - 0.05);
        for (const c of [runner, ...line, quarry]) if (c.state === 'ok') { ai(c, 0.05); physics(c, 0.05); }
        /* the world's own opportunity pass, lifted out of update() so this stays a unit test */
        for (const o of line) {
          if ((o.oppCd || 0) > 0) continue;
          if (dist(o.x, o.y, runner.x, runner.y) > 1.45) continue;
          if (runner.target === o) continue;
          o.oppCd = 1.5; attack(o, runner);
          if (!everSwitched) cuts++;             /* the approach, not the brawl after it */
        }
        if (runner.target && runner.target !== quarry) everSwitched = true;
        closest = Math.min(closest, dist(runner.x, runner.y, quarry.x, quarry.y));
        rebuildCharGrid();
      }
      const r = { cuts, everSwitched, closest: +closest.toFixed(1),
                  remembered: runner.orderTarget === quarry };
      clean();
      return r;
    };

    const auto = charge(false);
    R.autoCharge = `an auto-acquired quarry: ${auto.cuts} passing cuts taken, ` +
      (auto.everSwitched ? 'and the line got dealt with' : 'and the line was ignored the whole way');
    R.doesNotSuicide = auto.everSwitched
      ? 'a body walking into a line engages the line'
      : '!! IT WALKS THROUGH THE LINE WITHOUT EVER LOOKING SIDEWAYS';
    R.cutsTaken = auto.cuts <= 6
      ? `${auto.cuts} passing cuts on the way in`
      : `!! ${auto.cuts} PASSING CUTS — still charging through`;

    /* A PLAYER'S ORDER, WHICH IS A DIFFERENT QUESTION.
       The first version of this asserted that a right-clicked target is reached THROUGH a
       picket line — and that assertion is the bug, restated. Nobody walks through six men
       with blades; being unable to is the whole point of the note. What an order has to
       guarantee is that it is not silently eaten: on clear ground it is carried out, and
       when something interrupts it, it resumes once the interruption is dealt with. */
    /* ---------- WHAT AN ORDER ACTUALLY PROMISES, WHICH IS NOT WHAT THIS USED TO ASK ----------
       The old claim required an ORDERED charge to stop and fight the men in the way. That is
       the opposite of the rule: the interpose branch in `physics` is gated
       `!(c.targetManual && c.faction === 'player')`, with the comment "a player's own explicit
       order is never overridden — right-clicking a particular man means that man, and the
       passing cuts are the price you chose". It passed only when some other branch happened to
       take the target away, and measured across three builds with the field swept and the
       ground flattened it came out 93 cuts / 3 cuts / 94 cuts.
       Requiring the runner to REACH the quarry through the line is no better, and this file's
       own preamble says why: "Nobody walks through six men with blades; being unable to is the
       whole point of the note." Measured, that is 3 to 4 times in five.
       The preamble also states the two things an order really guarantees, and they are the two
       claims below: ON CLEAR GROUND it is carried out, and WHEN SOMETHING INTERRUPTS IT the
       order is remembered rather than silently eaten — which is the `orderTarget` branch in
       `physics`, "an order deferred, not an order lost". Both are rules, and neither is a
       coin. */
    const open = charge(true, false);
    const man = charge(true, true);
    R.manualOrder = `ordered on clear ground: closest ${open.closest}; ordered through a picket line: ` +
      `closest ${man.closest}, ${man.cuts} cuts, order ${man.remembered ? 'still held' : 'DROPPED'}`;
/* NO ASSERTION HERE, AND THAT IS THE FIX. Both promises an order actually makes already have
       their own claims below and both of them set up a REAL order: 1b, that it is carried out on
       clear ground, and 1c, that it resumes once an interruption is dealt with. What section 1
       had instead was a third claim requiring an ordered charge to stop for the men in the way —
       the opposite of the rule, whose own comment reads "a player's own explicit order is never
       overridden: the passing cuts are the price you chose" — and it passed only when some other
       branch took the target away. The number stays as a READING, because "you chose this" is
       only fair if the price is visible. */

    /* ---------- 1b. ON CLEAR GROUND, AN ORDER IS AN ORDER ---------- */
    {
      const u = mk('player', { atk: 18, def: 14, tough: 14, ath: 10, blades: 20 }, S.x, S.y);
      u.weapon = 'w_kat';
      const far = mk('bandit', { atk: 4, def: 8, tough: 40, ath: 2 }, S.x + 10, S.y);
      far.blood = far.maxBlood = 1e6;
      u.target = far; u.targetManual = true; u.orderTarget = far;
      rebuildCharGrid();
      let closest = 99;
      for (let t = 0; t < 500; t++) {
        ai(u, 0.05); physics(u, 0.05);
        closest = Math.min(closest, dist(u.x, u.y, far.x, far.y));
        rebuildCharGrid();
      }
      R.orderOnClearGround = closest < 2.0
        ? `with nothing in the way the order is carried out (closed to ${closest.toFixed(1)})`
        : `!! AN ORDER IS NOT CARRIED OUT EVEN ON EMPTY GROUND (got to ${closest.toFixed(1)})`;
      clean();
    }
    /* ---------- 1c. AN INTERRUPTED ORDER RESUMES ---------- */
    {
      const u = mk('player', { atk: 18, def: 14, tough: 14, ath: 10 }, S.x, S.y);
      const far = mk('bandit', { tough: 40 }, S.x + 9, S.y);
      const inTheWay = mk('bandit', { tough: 8 }, S.x + 1, S.y);
      far.blood = far.maxBlood = 1e6;
      u.target = far; u.targetManual = true; u.orderTarget = far;
      retaliate(u, inTheWay);
      const tookOver = u.target === inTheWay;
      inTheWay.state = 'dead';
      physics(u, 0.05);                       /* the tick that notices the body is down */
      R.orderResumes = (tookOver && u.target === far)
        ? 'and an order interrupted by a knife resumes once the knife is down'
        : `!! THE ORDER WAS EATEN BY THE INTERRUPTION (took over: ${tookOver}, back on quarry: ${u.target === far})`;
      clean();
    }

    /* ---------- 2. BEING HIT BY SOMETHING NEARER THAN YOUR QUARRY ---------- */
    {
      const v = mk('player', { atk: 14, def: 12, tough: 14, ath: 8 }, S.x, S.y);
      v.blood = v.maxBlood = 1e6;
      const far = mk('bandit', { tough: 40 }, S.x + 9, S.y);
      const near = mk('bandit', { atk: 16, tough: 12 }, S.x + 1, S.y);
      far.blood = far.maxBlood = near.blood = near.maxBlood = 1e6;
      v.target = far; v.targetManual = false;
      retaliate(v, near);
      R.turnsOnTheKnife = v.target === near
        ? 'a knife in the ribs outranks a man across the field'
        : '!! STILL LOCKED ON THE DISTANT QUARRY WHILE BEING STABBED';
      /* but not mid-melee: turning away from the man you are already trading with is worse */
      v.target = far; far.x = S.x + 1.2; far.y = S.y;
      retaliate(v, near);
      R.holdsInMelee = v.target === far
        ? 'and a fight already joined is not abandoned for a jab'
        : '!! IT DROPS THE MAN IT IS TRADING WITH FOR WHOEVER TOUCHES IT';
      clean();
    }

    /* ---------- 3. WHICH STROKES ACTUALLY GET CHOSEN ---------- */
    {
      const roll = (skill, wep, crowdN, plated) => {
        const a = mk('player', { atk: 20, blades: skill, blunt: skill, martial: skill }, S.x, S.y);
        a.weapon = wep;
        const t = mk('bandit', { tough: 12 }, S.x + 0.6, S.y);
        if (plated) t.armor = 'a_pla';
        for (let i = 0; i < crowdN; i++) mk('bandit', { tough: 10 }, S.x + Math.cos(i) * 1.2, S.y + Math.sin(i) * 1.2);
        rebuildCharGrid();
        const tally = {};
        for (let i = 0; i < 3000; i++) { const k = pickMove(a, t); tally[k] = (tally[k] || 0) + 1; }
        clean();
        return tally;
      };
      const novice = roll(0, 'w_kat', 0, false);
      const adept = roll(90, 'w_kat', 0, false);
      const swarm = roll(90, 'w_kat', 4, false);
      const pct = (o) => Object.entries(o).sort((a, b) => b[1] - a[1])
        .map(([k, v]) => `${k} ${Math.round(v / 30)}%`).join(', ');
      R.novicePicks = pct(novice);
      R.adeptPicks = pct(adept);
      R.swarmPicks = pct(swarm);
      /* no single stroke may dominate — that is the note, stated as a number */
      const worst = (o) => Math.max(...Object.values(o)) / Object.values(o).reduce((s, v) => s + v, 0);
      R.noOneStroke = (worst(novice) < 0.55 && worst(adept) < 0.55)
        ? `the commonest stroke is ${Math.round(worst(adept) * 100)}% of swings, not most of them`
        : `!! ONE STROKE IS ${Math.round(Math.max(worst(novice), worst(adept)) * 100)}% OF EVERY SWING`;
      R.crowdChangesIt = ((swarm.cleave || 0) + (swarm.spin || 0)) > ((adept.cleave || 0) + (adept.spin || 0)) * 3
        ? 'and a crowd genuinely reaches for the wide strokes'
        : '!! BEING SURROUNDED DOES NOT CHANGE WHAT THEY SWING';
    }

    /* ---------- 4. AND THE STROKE THAT IS CHOSEN IS THE STROKE THAT IS DRAWN ----------
       `swingMove` decides the damage, the stagger and the arc alike. If the animator ever
       reads a different field from the resolver, the picture and the fight come apart and
       every swing looks the same whatever the sim thinks it did. */
    {
      const a = mk('player', { atk: 20, blades: 90, tough: 20 }, S.x, S.y);
      a.weapon = 'w_kat';
      const t = mk('bandit', { tough: 90, def: 6 }, S.x + 0.7, S.y);
      t.blood = t.maxBlood = 1e6;
      a.target = t; a.targetManual = true;
      const pairs = new Set();
      let swings = 0;
      for (let i = 0; i < 3000 && pairs.size < 40; i++) {
        a.staggerT = 0;
        physics(a, 0.05);
        if (a.windup && a.windup.kind === 'melee') { pairs.add(a.windup.mv + '|' + a.swingMove); swings++; }
      }
      const mismatched = [...pairs].filter(s => s.split('|')[0] !== s.split('|')[1]);
      R.armedSwings = `${swings} melee winds observed, ${pairs.size} distinct`;
      R.arcMatchesBlow = mismatched.length === 0
        ? 'the stroke you watch is the stroke that resolved'
        : `!! THE ARC AND THE BLOW DISAGREE: ${mismatched.join(' ')}`;
      const kinds = new Set([...pairs].map(s => s.split('|')[0]));
      R.arcVariety = kinds.size >= 3 ? `${kinds.size} different arcs came up: ${[...kinds].sort().join(', ')}`
        : `!! ONLY ${kinds.size} ARC(S) EVER REACH THE ANIMATOR`;
      clean();
    }
    return R;
  });

  console.log('=== HOW A FIGHT BEHAVES ===\n');
  for (const [k, v] of Object.entries(out)) console.log('  ' + k.padEnd(18) + v);
  const bad = Object.values(out).map(String).filter(v => v.startsWith('!!'));
  console.log('\n' + (bad.length ? '*** ' + bad.join('\n*** ') : 'THEY SEE WHAT IS IN FRONT OF THEM, AND THEY DO NOT SWING THE SAME WAY TWICE'));
  if (errs.length) { console.log('errs:', errs.length); errs.slice(0, 4).forEach(e => console.log('  ' + e)); }
  await b.close();
  if (bad.length) process.exitCode = 1;
})();
