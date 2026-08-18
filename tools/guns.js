#!/usr/bin/env node
/* DOES ANY OF THE ORDNANCE ACTUALLY FIRE?
 *
 * "Gunnery job currently seems to do absolutely nothing. Same with turrets. Also the Aetheric
 * Lance seemed broken and incapable of firing anything, even when held by a non-alchemist."
 *
 * Three separate weapons wearing one complaint, and the earlier pass established that all the
 * parts exist — `emplacementTick`, an `EMPL` table with both mounts, a buildable turret. So
 * the failure is in the middle, and the only way to find which joint is to drive the whole
 * chain: build the mount, put a body on the GUNNERY job, stand something hostile in front of
 * it, and check every gate on the way to a bolt leaving the rail.
 *
 *   node tools/guns.js [game.html]
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
  await p.evaluate(() => document.getElementById('btn-start').click());
  await p.waitForTimeout(3000);

  const out = await p.evaluate(() => {
    const R = {};
    paused = true;

    /* open ground well away from anything that would join in */
    let gx = 0, gy = 0;
    outer:
    for (let y = 60; y < H - 60; y += 5) for (let x = 60; x < W - 60; x += 5) {
      if (isBlocked(x + 0.5, y + 0.5)) continue;
      if (towns.some(t => dist(t.x, t.y, x, y) < 70)) continue;
      let ok = true;
      for (let j = -6; j <= 6 && ok; j++) for (let i = -6; i <= 6 && ok; i++)
        if (isBlocked(x + i + 0.5, y + j + 0.5)) ok = false;
      if (ok) { gx = x; gy = y; break outer; }
    }
    R.ground = gx ? `staged on open waste at ${gx},${gy}` : '!! NO OPEN GROUND';

    const wipe = () => {
      for (let i = chars.length - 1; i >= 0; i--) if (chars[i].__probe) chars.splice(i, 1);
      for (let i = pBuilds.length - 1; i >= 0; i--) if (pBuilds[i].__probe) pBuilds.splice(i, 1);
      projectiles.length = 0;
    };
    /* a mount, placed the way `completeBlueprint` leaves one rather than by hand, so the
       fields `emplacementTick` reads are the ones the game writes */
    const mount = (type, x, y) => {
      const bt = BUILD_TYPES[type];
      const bd = { type, x, y, w: bt.w, h: bt.h, floor: 0, hp: 200, maxHp: 200,
                   progress: 1, cool: 0, shots: 0, facing: 0, __probe: true };
      pBuilds.push(bd);
      return bd;
    };
    const crew = (x, y, opts) => {
      const c = makeChar('Gunner', 'player', x, y, { atk: 10, def: 10, tough: 12, ath: 8, gunnery: 20, ...(opts || {}) });
      c.job = 'gunner'; c.__probe = true;
      chars.push(c);
      return c;
    };
    const foe = (x, y) => {
      const c = makeChar('Raider', 'bandit', x, y, { atk: 10, def: 8, tough: 40, ath: 6 });
      c.__probe = true; c.autoFight = false;
      chars.push(c);
      return c;
    };
    const run = (n) => { paused = false; for (let i = 0; i < n; i++) update(0.1); paused = true; };

    /* ================== 1. THE TURRET ================== */
    {
      wipe();
      const t = mount('turret', gx, gy);
      R.turretIsAnEmplacement = emplSpec(t)
        ? `a built turret resolves to ${emplSpec(t).name}, range ${emplSpec(t).range}`
        : '!! A BUILT TURRET IS NOT AN EMPLACEMENT — emplSpec RETURNS NULL';

      const g = crew(gx + 2, gy + 2);
      const f = foe(gx + 6, gy);
      R.thereIsWorkToDo = jobHasWork(g, 'gunner')
        ? 'the GUNNERY job reports work available with a turret standing'
        : '!! jobHasWork SAYS THERE IS NOTHING TO DO WITH A TURRET IN THE CAMP';
      R.theCrewIsAllowed = emplUsableBy(t, g)
        ? 'and an ungifted hand is allowed to work it'
        : '!! AN ORDINARY HAND IS NOT ALLOWED TO WORK A TURRET';

      /* THE WALK, WITH A RAID ALREADY UNDER WAY. This is the case that fails, and it has to be
         staged in that order: with the camp quiet the crew mans the gun in eight seconds and
         everything downstream passes, which is why the job looked fine to a probe and dead to
         a player. The foe is standing before the crew sets out. */
      const hp0 = f.blood;
      run(400);
      const d = dist(g.x, g.y, t.x + 0.5, t.y + 0.5);
      R.theCrewReachesTheMount = d <= 1.35
        ? `the crew walks to the mount and stops ${d.toFixed(2)} tiles off it`
        : `!! THE CREW STOPS ${d.toFixed(2)} TILES AWAY — emplGunner NEEDS 1.35 OR CLOSER, SO NOBODY EVER MANS IT`;
      R.theCrewTakesHold = emplGunner(t) === g
        ? 'and emplGunner recognises it as the hand on the weapon'
        : `!! NOBODY IS RECOGNISED AT THE MOUNT (manning ${g.manning}, job ${g._ej || g.job}, floor ${g.floor || 0}/${t.floor || 0})`;
      R.theTurretFires = (t.shots || 0) > 0
        ? `and it fires — ${t.shots} bolts in 40s`
        : `!! THE TURRET NEVER FIRES (cool ${(t.cool || 0).toFixed(1)}, gunner ${t.gunnerId}, shots ${t.shots || 0})`;
      R.theBoltsLand = f.blood < hp0 || f.state !== 'ok'
        ? `and the bolts land on the thing it was aimed at (${hp0} -> ${Math.max(0, f.blood).toFixed(0)} blood, ${f.state})`
        : '!! THE BOLTS DO NOT ARRIVE — THE TURRET FIRES INTO NOTHING';
      /* A LIVE TARGET TO ASK ABOUT. The first version asked `emplTarget` after the run and
         reported that the turret was blind — it was not, it had already killed the only
         hostile on the field. Ask the question of something still standing. */
      const f2 = foe(gx + 6, gy + 1);
      run(2);   /* `charsNear` reads a grid rebuilt inside update(); a body pushed while paused is invisible to it */
      R.theTurretPicksATarget = emplTarget(t, emplSpec(t)) === f2
        ? 'and it picks up the next hostile to walk into its arc'
        : '!! THE TURRET CANNOT SEE A HOSTILE SIX TILES AWAY IN THE OPEN';
      R.theCrewLearnsTheMachine = g.stats.gunnery > 20
        ? `the crew learns the machine at the machine (gunnery ${g.stats.gunnery.toFixed(1)})`
        : `!! FIRING TEACHES NOTHING (gunnery still ${g.stats.gunnery.toFixed(1)})`;
    }

    /* ================== 2. THE EMPLACED LANCE ================== */
    {
      wipe();
      const t = mount('lance', gx, gy);
      const spec = emplSpec(t);
      R.lanceIsAnEmplacement = spec ? `the emplaced lance resolves to ${spec.name}, range ${spec.range}` : '!! THE EMPLACED LANCE HAS NO SPEC';
      /* nullOnly: a gifted hand must be refused and an ungifted one accepted. Both halves,
         because a rule that refuses everybody is indistinguishable from a broken weapon. */
      const gifted = crew(gx + 2, gy + 2, {}); gifted.gift = 'dust';
      const deaf = crew(gx + 2, gy - 2, {}); deaf.gift = null;
      R.theLanceRefusesTheGifted = !emplUsableBy(t, gifted)
        ? 'and it refuses a gifted hand, as the cascade requires'
        : '!! A GIFTED HAND CAN WORK THE LANCE — THE nullOnly RULE IS NOT APPLIED';
      R.theLanceTakesTheDeaf = emplUsableBy(t, deaf)
        ? 'while the alchemically deaf may hold it'
        : '!! THE LANCE REFUSES EVERYBODY, WHICH IS WHY IT LOOKS BROKEN';
      const f = foe(gx + 8, gy);
      run(500);
      R.theEmplacedLanceFires = (t.shots || 0) > 0
        ? `it fires — ${t.shots} bolts, and the raider is at ${Math.max(0, f.blood).toFixed(0)} blood`
        : `!! THE EMPLACED LANCE NEVER FIRES (gunner ${t.gunnerId}, cool ${(t.cool || 0).toFixed(1)})`;
    }

    /* ================== 3. THE HANDHELD LANCE ================== */
    /* "even when held by a non-alchemist" is the important half of the report: the weapon
       runs on pre-Fall cells out of the camp stash, and with none in the stash it says so
       once, per BODY, and then goes quiet forever. */
    {
      wipe();
      stash.aether_cell = 0;
      const c = makeChar('Lancer', 'player', gx, gy, { atk: 20, def: 10, tough: 12, ath: 8, weapon: 'w_lance' });
      c.gift = null; c.__probe = true; chars.push(c);
      const f = foe(gx + 5, gy);
      c.target = f; c.targetManual = true;
      const w = ITEMS.w_lance;
      R.theLanceIsCarryable = !ITEMS.w_lance.nullOnly || !c.gift
        ? 'an ungifted hand may carry the Aether Lance'
        : '!! THE LANCE CANNOT BE CARRIED AT ALL';
      const dry = lanceFire(c, w);
      R.aDryLanceRefuses = dry === false
        ? 'with no cells in the stash it will not fire, which is the design'
        : '!! A DRY LANCE FIRES ANYWAY — THE CHARGE RULE DOES NOTHING';
      stash.aether_cell = 20;
      c._lanceDry = false; c.heat = 0;
      const cells0 = stash.aether_cell;
      const wet = lanceFire(c, w);
      R.aChargedLanceFires = wet === true && stash.aether_cell === cells0 - 1
        ? `with cells in the stash it fires and spends one (${cells0} -> ${stash.aether_cell})`
        : `!! A CHARGED LANCE STILL WILL NOT FIRE (returned ${wet}, cells ${cells0} -> ${stash.aether_cell})`;
      /* and through the real attack path, not just the helper */
      c.atkCd = 0; c.heat = 0;
      const hp0 = f.blood, cells1 = stash.aether_cell;
      run(200);
      R.theLanceLandsInPlay = f.blood < hp0 || f.state !== 'ok'
        ? `and in play it actually hits — the raider drops from ${hp0} to ${Math.max(0, f.blood).toFixed(0)}, ${cells1 - stash.aether_cell} cells spent`
        : `!! THE LANCE DOES NO DAMAGE IN PLAY (cells spent ${cells1 - stash.aether_cell}, atkCd ${c.atkCd.toFixed(2)})`;
      /* the overheat is the cost that makes it interesting; it must actually bite */
      c.heat = 0; stash.aether_cell = 200;
      for (let i = 0; i < 12; i++) lanceFire(c, w);
      R.theLanceCooksItsHand = (c.parts && c.parts['r.arm'] && c.parts['r.arm'].hp < c.parts['r.arm'].max)
        ? 'and worked hard it cooks the hand that holds it'
        : '!! FIRING IT TWELVE TIMES IN A ROW COSTS THE WIELDER NOTHING';
    }

    wipe();
    return R;
  });

  console.log('=== THE ORDNANCE ===\n');
  for (const [k, v] of Object.entries(out)) console.log('  ' + k.padEnd(28) + v);
  const bad = Object.values(out).map(String).filter(v => v.startsWith('!!'));
  console.log('\n' + (bad.length ? '*** ' + bad.join('\n*** ') : 'THE TURRET, THE EMPLACED LANCE AND THE HANDHELD LANCE ALL FIRE'));
  if (errs.length) { console.log('errs:', errs.length); errs.slice(0, 4).forEach(e => console.log('  ' + e)); }
  await b.close();
  if (bad.length) process.exitCode = 1;
})();
