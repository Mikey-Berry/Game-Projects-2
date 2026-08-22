#!/usr/bin/env node
/* AN ACCIDENT IS NOT A DECLARATION OF WAR.
 *
 * "Friendly fire by ranged allies onto escort mission people sometimes makes them turn
 * hostile, and actually counts as an attack against that whole city. For one, this should be
 * accepted as a simple reality of battle by NPCs and not an intentional attack. Second, the
 * town should not instantly turn against me — they would need a witness to properly deliver
 * the news. We have the bones of that mechanic built, so we just need to incorporate it
 * properly."
 *
 * Both halves were built and neither was wired up. `applyDamage` takes an `incid` argument
 * meaning "incidental", and `crime` and the `provoked` rule both already honour it — but the
 * projectile impact passed `false` unconditionally, so `p.ff`, computed at the moment of
 * loosing and carried the whole length of the flight, was dropped on arrival. And the standing
 * penalty ran with no witness check at all, in a file whose crime system opens with "nobody is
 * wanted for what nobody saw".
 *
 * So this fires REAL ARROWS through the real projectile mill and reads what the town thinks
 * afterwards. The distinction under test is intent, so every case is the same arrow — what
 * changes is whether it was meant.
 *
 *   node tools/mishap.js [game.html]
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
  await p.evaluate(() => { document.getElementById('btn-start').click(); paused = true; });
  await p.waitForTimeout(3000);

  const out = await p.evaluate(() => {
    const R = {};
    paused = true;

    /* open road, well clear of every town — an escort is walking country, not a plaza */
    let gx = 0, gy = 0;
    outer:
    for (let y = 60; y < H - 60; y += 5) for (let x = 60; x < W - 60; x += 5) {
      if (isBlocked(x + 0.5, y + 0.5)) continue;
      if (towns.some(t => dist(t.x, t.y, x, y) < 90)) continue;
      let ok = true;
      for (let j = -8; j <= 8 && ok; j++) for (let i = -8; i <= 8 && ok; i++)
        if (isBlocked(x + i + 0.5, y + j + 0.5)) ok = false;
      if (ok) { gx = x; gy = y; break outer; }
    }
    R.ground = gx ? `staged on open road at ${gx},${gy}, ninety tiles from any town` : '!! NO OPEN GROUND';

    const home = towns[0];
    const wipe = () => {
      for (let i = chars.length - 1; i >= 0; i--) if (chars[i].__probe) chars.splice(i, 1);
      for (let i = corpses.length - 1; i >= 0; i--) if (corpses[i].__probe) corpses.splice(i, 1);
      rebuildCharGrid();
    };
    /* the ward: a townsperson of somewhere, walking with you, exactly as takeContract makes one */
    const ward = (x, y) => {
      const w = makeChar('Probe Ward', 'town', x, y, { atk: 3, def: 4, tough: 40 });
      w.__probe = true; w.civ = true; w.vip = true; w.neutral = true; w.homeTown = home;
      w.floor = 0; w.blood = w.maxBlood = 4000;
      for (const k in w.parts) { w.parts[k].hp = w.parts[k].max = 400; }
      chars.push(w); rebuildCharGrid(); return w;
    };
    const archer = (x, y) => {
      const c = makeChar('Probe Archer', 'player', x, y, { atk: 6, def: 4, tough: 10, ranged: 6 });
      c.__probe = true; c.floor = 0; chars.push(c); rebuildCharGrid(); return c;
    };
    /* ONE ARROW, THROUGH THE REAL MILL. `ff` is the only thing that differs between the two
       cases below — same shooter, same target, same damage, same flight. */
    const loose = (from, at, ff) => {
      projectiles.length = 0;
      projectiles.push({ x: from.x, y: from.y - 0.5, target: at, speed: 13, floor: 0,
                         dmg: 6, caster: from, wt: 'pierce', ap: 0, ff, arrow: false });
      for (let i = 0; i < 40 && projectiles.length; i++) updateProjectiles(1 / 30);
      projectiles.length = 0;
    };

    /* ---------- A STRAY ARROW INTO YOUR OWN WARD ---------- */
    {
      const w = ward(gx + 3, gy), a = archer(gx, gy);
      const rep0 = home.rep, bounty0 = home.bounty || 0;
      loose(a, w, true);
      R.stray = `after a stray arrow: ward provoked ${!!w.provoked}, hostile ${hostile(a, w)}, rep ${rep0} -> ${home.rep}, bounty ${bounty0} -> ${home.bounty || 0}`;
      R.aStrayArrowIsNotAnAttack = !w.provoked
        ? 'a ward clipped by your own archer does not turn on you — it is a battle, not a betrayal'
        : '!! A STRAY ARROW TURNED THE ESCORT WARD HOSTILE';
      R.andTheCityNeverHears = home.rep === rep0
        ? `and their city thinks exactly what it thought — standing unchanged at ${home.rep}`
        : `!! A STRAY ARROW NINETY TILES AWAY COST ${(rep0 - home.rep).toFixed(0)} STANDING WITH THEIR WHOLE CITY`;
      wipe();
    }

    /* ---------- AND THE SAME ARROW, MEANT ----------
       The control that keeps this honest: if an accident costs nothing, a deliberate shot has
       to still cost something, or the fix has simply removed the consequence. */
    {
      const w = ward(gx + 3, gy), a = archer(gx, gy);
      /* somebody of theirs on the road to see it — the witness the report asked for */
      const eye = makeChar('Probe Drover', 'town', gx + 5, gy + 1, { atk: 2, def: 2, tough: 8 });
      eye.__probe = true; eye.homeTown = home; eye.floor = 0; chars.push(eye); rebuildCharGrid();
      const rep0 = home.rep;
      loose(a, w, false);
      R.aimed = `after an aimed arrow with somebody watching: provoked ${!!w.provoked}, rep ${rep0} -> ${home.rep}`;
      R.butAnAimedOneStillCosts = home.rep < rep0
        ? `while shooting them on purpose in front of one of theirs still costs ${(rep0 - home.rep).toFixed(0)} standing`
        : '!! SHOOTING A TOWNSPERSON ON PURPOSE, WATCHED, COSTS NOTHING AT ALL';
      R.andTheyDoTurn = !!w.provoked
        ? 'and they do turn on you for it, which is the difference the report is about'
        : '!! AN AIMED ARROW DID NOT PROVOKE THEM EITHER — THE FIX WENT TOO FAR';
      wipe();
    }

    /* ---------- AND NOBODY IS WANTED FOR WHAT NOBODY SAW ----------
       The second half of the report, and getting it staged right took a correction. The first
       version fired an aimed arrow at a ward on an empty road and expected no standing to be
       lost — and standing WAS lost, correctly: `witnessNear` looks for any living townsperson
       with line of sight, and THE VICTIM IS ONE. A traveller you shot who lives will of course
       tell their town. There is no such thing as "nobody saw" while the victim is still on
       their feet, and an assertion that expects one is describing a rule nobody wants.
       The real unwitnessed case is the one the crime table already names: a killing blow, on
       an empty road, with nobody else in sight. A dead victim carries no tale — `witnessNear`
       requires `state === 'ok'` — which is the same rule `crime` has always run murder on. */
    {
      const w = ward(gx + 3, gy);
      w.blood = w.maxBlood = 6;
      for (const k in w.parts) { w.parts[k].hp = w.parts[k].max = 3; }
      const a = archer(gx, gy);
      const rep0 = home.rep;
      loose(a, w, false);
      /* NOT `=== 'dead'`. One arrow puts a body DOWN in this game rather than killing it —
         that is the whole survivability design, and `survive.js` is built on it. What the
         assertion actually needs is that the victim is not on their feet to carry a tale,
         which is `state !== 'ok'` either way. */
      R.unseen = `after a felling shot with nobody of theirs left standing: victim ${w.state}, rep ${rep0} -> ${home.rep}`;
      R.andNobodyIsWantedForWhatNobodySaw = (w.state !== 'ok' && home.rep === rep0)
        ? 'and putting somebody down on an empty road costs no standing — the news has to reach them by somebody'
        : `!! AN UNWITNESSED ATTACK COST ${(rep0 - home.rep).toFixed(0)} STANDING (victim ${w.state})`;
      wipe();
    }

    /* ---------- BUT ONE PAIR OF EYES IS ENOUGH ----------
       The control for the control. If killing them unseen is free, killing them in front of
       somebody must not be, or the witness gate has simply turned the penalty off. */
    {
      const w = ward(gx + 3, gy);
      w.blood = w.maxBlood = 6;
      for (const k in w.parts) { w.parts[k].hp = w.parts[k].max = 3; }
      const a = archer(gx, gy);
      const eye = makeChar('Probe Drover', 'town', gx + 5, gy + 1, { atk: 2, def: 2, tough: 8 });
      eye.__probe = true; eye.homeTown = home; eye.floor = 0; chars.push(eye); rebuildCharGrid();
      const rep0 = home.rep;
      loose(a, w, false);
      R.seen = `the same felling shot with one drover watching: rep ${rep0} -> ${home.rep}`;
      R.butOnePairOfEyesIsEnough = home.rep < rep0
        ? `while the same blow in front of one of theirs costs ${(rep0 - home.rep).toFixed(0)} standing — a witness is all it takes`
        : '!! A WITNESSED KILLING COST NOTHING — THE GATE HAS TURNED THE PENALTY OFF';
      wipe();
    }

    return R;
  });

  const bad = Object.values(out).filter(v => typeof v === 'string' && v.startsWith('!!'));
  for (const [k, v] of Object.entries(out)) console.log('  ' + k.padEnd(34) + v);
  for (const e of errs) console.log('  ' + e);
  console.log('');
  console.log(bad.length || errs.length
    ? `AN ACCIDENT IS STILL A DECLARATION OF WAR (${bad.length + errs.length})`
    : 'AN ACCIDENT IS AN ACCIDENT, AND THE NEWS TRAVELS BY SOMEBODY');
  await b.close();
  process.exit(bad.length || errs.length ? 1 : 0);
})();
