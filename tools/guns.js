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
  /* ---------- START IT AND STOP IT IN THE SAME BREATH ----------
     THIS FILE WAS NON-DETERMINISTIC AND IT WAS THIS LINE. `click()` and then three seconds of
     `waitForTimeout` lets the world run free for however many frames the machine manages in
     three seconds — which is not a fixed number, and is markedly lower when a 49-harness suite
     is loading the box. Every body in the world is therefore somewhere slightly different by
     the time the probe starts staging, and the numbers downstream inherit it.
     Measured, on ONE build with an unchanged md5: three consecutive runs gave "5 bolts, dry
     Heavy holds its fire" twice and "3 bolts, dry Heavy fires anyway" once. The assertion was
     reporting the machine's load, and it had been doing it since long before the changes it
     eventually went red on. Pausing in the same evaluate as the click leaves no frames at all
     between the two, so every run starts from the identical world. */
  await p.evaluate(() => { document.getElementById('btn-start').click(); paused = true; });
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
    /* a weapon that stops working has to SAY why, so the sentence has to be catchable */
    const logs = [];
    const _log = log; window.log = (m, k) => { logs.push(String(m)); return _log(m, k); };
    const run = (n) => { paused = false; for (let i = 0; i < n; i++) update(0.1); paused = true; };
    /* run, and hold the named bodies on their tiles while it runs. Seventy seconds is a long
       time to leave a raider standing in the open: it wanders off the arc being measured, and
       the emplacement's shot count becomes a fact about where the raider went. */
    const runPinned = (n, bodies) => {
      const at = bodies.map(c => ({ c, x: c.x, y: c.y }));
      paused = false;
      for (let i = 0; i < n; i++) {
        for (const a of at) { a.c.x = a.x; a.c.y = a.y; a.c.moveTarget = null; a.c.path = null; }
        update(0.1);
      }
      paused = true;
    };
    /* ---------- AND THE GROUND REALLY IS EMPTY ----------
       The search above says "open ground well away from anything that would join in" and only
       ever checked the TERRAIN. Wanderers, hunting parties and anything driven out of a town
       are none of them terrain, and over seventy seconds of simulation one of them reaching
       the staged raider is the difference between "the dry Heavy held its fire" and "something
       shot my control". Enforce what the comment already promised. */
    const clearGround = (r) => {
      let n = 0;
      for (let i = chars.length - 1; i >= 0; i--) {
        const c = chars[i];
        if (c.__probe) continue;
        if (dist(c.x, c.y, gx, gy) < r) { chars.splice(i, 1); n++; }
      }
      return n;
    };
    R._groundIsClear = `${clearGround(45)} bodies moved off the measuring ground`;

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
      /* ---------- THE HEAVY IS THE ONE THAT EATS CELLS NOW ----------
         It used to spend nothing at all while the handheld paid for every trigger pull. Dry
         first, because a weapon that fires on an empty stash makes the whole supply line
         decorative, and a dry emplacement is now a thing a player can actually build. */
      stash.aether_cell = 0;
      const f0 = foe(gx + 8, gy);
      logs.length = 0;
      runPinned(200, [f0]);
      R.aDryHeavyHoldsItsFire = (t.shots || 0) === 0 && f0.blood === 100
        ? 'with an empty stash the Heavy will not fire at all'
        : `!! A DRY HEAVY FIRES ANYWAY (${t.shots} bolts) — the charge rule does nothing`;
      R.aDryHeavySaysWhereCellsComeFrom = logs.some(l => /Heavy Aetheric Lance is dry/.test(l) && /scavenged/.test(l) && /(Dustport|Hollowmere|occult dealers|redoubt)/.test(l))
        ? `and it says why, and where they come from: "${(logs.find(l => /is dry/.test(l)) || '').slice(0, 92)}…"`
        : `!! A DRY HEAVY IS UNEXPLAINED (said ${logs.find(l => /dry/.test(l)) || 'nothing'})`;
      /* now feed it */
      stash.aether_cell = 20;
      const cells0 = stash.aether_cell;
      const f = foe(gx + 8, gy);
      runPinned(500, [f]);
      R.theEmplacedLanceFires = (t.shots || 0) > 0
        ? `fed, it fires — ${t.shots} bolts, and the raider is at ${Math.max(0, f.blood).toFixed(0)} blood`
        : `!! THE EMPLACED LANCE NEVER FIRES (gunner ${t.gunnerId}, cool ${(t.cool || 0).toFixed(1)}, cells ${stash.aether_cell})`;
      R.andTheHeavySpendsCells = stash.aether_cell < cells0
        ? `and it spends them doing it — ${cells0} -> ${stash.aether_cell} for ${t.shots} bolts`
        : `!! THE HEAVY FIRES FOR FREE (cells still ${stash.aether_cell})`;
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
      /* ---------- AND THE HANDHELD IS NOT AMMUNITION-FED ANY MORE ----------
         Ammunition on the thing your people carry made the gunline an expensive annoyance and
         the weapon a museum piece between resupplies. The charges moved to the emplacement,
         which is where the supply line belongs. Asserted with an EMPTY stash, because "it
         fires" is worth nothing if the probe left cells lying about. */
      const cells0 = stash.aether_cell;
      const dry = lanceFire(c, w);
      R.theHandheldNeedsNoAmmunition = dry === true && stash.aether_cell === cells0
        ? `it fires on an empty stash and spends nothing (${cells0} -> ${stash.aether_cell})`
        : `!! THE HANDHELD STILL WANTS FEEDING (returned ${dry}, cells ${cells0} -> ${stash.aether_cell})`;
      c._lanceDry = false; c.heat = 0;
      /* ---------- AND THROUGH THE REAL ATTACK PATH, NOT JUST THE HELPER ----------
         THIS WAS A COIN FLIP AND IS NOW A BURST, which is the treatment gunnery.js already had
         for the same disease. The old version ran 20 seconds against a raider free to walk and
         asserted on what was, in practice, a single hit roll — so it read "THE LANCE DOES NO
         DAMAGE IN PLAY" whenever anything upstream moved the worldgen stream by one draw, a
         failure that says nothing whatever about the lance. What made it one shot is not the
         rate of fire (3.7s at atk 20, so 20 seconds is five shots) but the raider: it crosses
         the five tiles in about a second and a half, and a body inside 1.7 tiles makes the
         lance stop shooting and start swinging. The probe was measuring the first shot of a
         fight and then a wrestle.
         PIN THE RAIDER'S TILE, the same way rites.js had to pin the ritualist's — the point
         here is the weapon, not the footrace — and let it fire a good handful of times. The
         windups are counted so a window that fires nothing says so rather than reading as a
         miss, which is the failure the old one could not tell apart from the real bug. */
      c.atkCd = 0; c.heat = 0;
      /* A WALL, NOT AN OPPONENT. The raider `foe()` hands out is tough 40 against a 44-damage
         lance: it goes down on the third hit and the burst ends there, which is the single hit
         roll coming back in disguise. This one soaks. */
      const soak = makeChar('Butt', 'bandit', gx + 5, gy, { atk: 6, def: 8, tough: 400, ath: 1 });
      soak.__probe = true; soak.autoFight = false; soak.noFight = true; soak.speedMult = 0.0001;
      chars.push(soak);
      f.x = gx + 14; f.y = gy + 14;                  /* the old target out of the way entirely */
      c.target = soak; c.targetManual = true;
      const hp0 = soak.blood, cells1 = stash.aether_cell;
      /* THE SHOT IS READ OFF `atkCd` JUMPING, not off a windup being open on the frame the
         probe happens to look, and not off the raider's blood — a pool that drains over the
         following seconds and rounds a real hit up to "100 -> 100" on the way past.
         `fireRanged` is the only thing that resets that cooldown, so a jump IS a loose.
         SIXTY SECONDS AND NOT FORTY, because the lance cooks: heat past the frame's tolerance
         burns the hand and the wielder stops to cool. Forty seconds got three shots out of a
         weapon that nominally fires every 3.7, which is the overheat working, not a stall —
         but three is one away from the floor this assertion sets, and a measurement standing
         on its own threshold is the fragile thing this rewrite was for. */
      let shots = 0, prevCd = c.atkCd, dealt = 0;
      paused = false;
      for (let i = 0; i < 600; i++) {
        /* pinned, because the point here is the weapon and not a footrace: a body that closes
           to inside 1.7 tiles makes the lance stop shooting and start swinging, and the probe
           would then be measuring the first shot of a fight and then a wrestle */
        soak.x = gx + 5; soak.y = gy; soak.moveTarget = null; soak.path = null;
        update(0.1);
        if (c.atkCd > prevCd + 0.5) shots++;
        prevCd = c.atkCd;
      }
      dealt = hp0 - soak.blood;
      paused = true;
      R.theLanceLandsInPlay = shots < 4
        ? `!! ONLY ${shots} SHOTS IN 60s — THIS IS BACK TO BEING A SINGLE HIT ROLL, NOT A MEASUREMENT`
        : dealt > 0 || soak.state !== 'ok'
          ? `and in play it actually hits — ${shots} shots put ${dealt.toFixed(0)} blood through the mark`
          : `!! THE LANCE DOES NO DAMAGE IN PLAY OVER ${shots} SHOTS (atkCd ${c.atkCd.toFixed(2)})`;
      /* and it still costs the camp nothing to do it — the charges live on the emplacement */
      R.andItStillSpendsNoCells = stash.aether_cell === cells1
        ? `and sixty seconds of it spends not one cell (${cells1} -> ${stash.aether_cell})`
        : `!! THE HANDHELD DRANK ${cells1 - stash.aether_cell} CELLS IN PLAY`;
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
