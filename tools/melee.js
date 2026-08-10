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
    const mk = (f, o, x, y) => { const c = makeChar('X', f, x, y, o); c.state = 'ok'; chars.push(c); born.push(c); return c; };
    const clean = () => { for (const c of born) { const i = chars.indexOf(c); if (i >= 0) chars.splice(i, 1); } born.length = 0; };

    /* open ground, or the picket line ends up inside a wall and nobody meets anybody */
    let S = { x: 600, y: 600 };
    outer: for (let y = 60; y < H - 60; y += 9) for (let x = 60; x < W - 60; x += 9) {
      let ok = true;
      for (let j = -8; j <= 8 && ok; j++) for (let i = -3; i <= 12; i++) if (isBlocked(x + i, y + j, 0)) { ok = false; break; }
      if (ok) { S = { x, y }; break outer; }
    }

    /* ---------- 1. THE RUN THROUGH THE LINE ----------
       A runner, a quarry ten tiles away, and six hostiles standing between them. Count the
       passing cuts the runner takes and whether it ever turns on anybody. */
    const charge = (manual) => {
      const runner = mk('player', { atk: 18, def: 14, tough: 14, ath: 10, blades: 20 }, S.x, S.y);
      runner.weapon = 'w_kat'; runner.armor = 'a_lea';
      runner.blood = runner.maxBlood = 1e6;          /* we are counting cuts, not deaths */
      const quarry = mk('bandit', { atk: 4, def: 8, tough: 40, ath: 2 }, S.x + 10, S.y);
      quarry.blood = quarry.maxBlood = 1e6;
      const line = [];
      for (let i = 0; i < 6; i++) {
        const o = mk('bandit', { atk: 16, def: 12, tough: 12, ath: 8, blades: 15 },
          S.x + 4 + (i % 2) * 0.9, S.y - 2.5 + i * 1.0);
        o.weapon = 'w_kat'; o.blood = o.maxBlood = 1e6;
        line.push(o);
      }
      runner.target = quarry; runner.targetManual = manual;
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
      const r = { cuts, everSwitched, closest: +closest.toFixed(1) };
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
    const man = charge(true);
    R.manualOrder = `ordered through a picket line: ${man.cuts} cuts, and the line ${man.everSwitched ? 'still had to be fought' : 'was walked through'}`;
    R.orderNotSuicide = man.everSwitched
      ? 'even an ordered charge stops for the men in the way'
      : '!! AN ORDERED UNIT STILL WALKS THROUGH A LINE UNTOUCHED BY THE IDEA';

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
