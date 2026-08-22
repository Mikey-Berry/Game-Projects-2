#!/usr/bin/env node
/* TWO NEW WATCHERS, AND WHAT MAKES EACH OF THEM A CREATURE RATHER THAN A STAT LINE.
 *
 *   "Eyes of Ainzopha'ar: swarms of floating eyes. Their gaze lights heretics aflame with
 *    holy fire. (Ranged enemy, incorporates destruction alchemy.)"
 *
 *   "Messengers: intelligent Watchers... capable of learning and growing... They do not use
 *    technology, relying on latent eldritch power to wield weapons composed of fire and
 *    light. (Their weapons are not lootable...) Late game, some walk among the Paladins."
 *
 * WHAT IS MEASURED, and why each is measured that way:
 *
 *   · THE GAZE IS TESTED THROUGH ARMOUR, because that is the whole design claim. A rot-fire
 *     burns on a timer rather than landing as a blow, so plate is no answer to it — and the
 *     binding-circle findings say a bound host's survivability comes out of `def`. Asserting
 *     "it does damage" would pass on a creature that plate turns off, which is the one
 *     creature this was not supposed to be.
 *   · THE MESSENGER'S GROWTH IS DRIVEN THROUGH THE REAL `xpGain` against a REAL CONTROL — an
 *     ordinary Gaunt fed exactly the same experience. An absolute number here would be
 *     asserting the xp curve; the ratio is the claim.
 *   · UNLOOTABLE IS ASSERTED AS "THERE IS NOTHING THERE", not as a flag. The note's whole
 *     point is that a body with no `weapon` and a `clawWt` cannot be disarmed by construction,
 *     so the test looks for the absence of an item, not the presence of a rule.
 *
 *   node tools/watchers.js [game.html]
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
  /* START AND STOP IN THE SAME BREATH. A click followed by a wait lets the world run for
     however many frames the machine manages, which is not a fixed number and drops when a
     sixty-harness suite is loading the box — so every body is somewhere slightly different
     by the time this probe stages anything, and the numbers below inherit it. Measured on
     one unchanged build before this was applied here: flank.js gave 1.67 / 1.67 / 1.09 over
     three runs, and guns.js split three-to-two on an md5 that had not moved. Pausing inside
     the same evaluate leaves no frames at all between the two. Every file below sets
     `paused` for itself anyway; this only removes the window before its first statement. */
  await p.evaluate(() => { document.getElementById('btn-start').click(); paused = true; });
  await p.waitForFunction(() => document.getElementById('startoverlay').style.display === 'none', null, { timeout: 60000 });

  const out = await p.evaluate(() => {
    const R = {};
    paused = true;

    let gx = 0, gy = 0;
    outer:
    for (let y = 60; y < H - 60; y += 6) for (let x = 60; x < W - 60; x += 6) {
      if (isBlocked(x + 0.5, y + 0.5)) continue;
      if (towns.some(t => dist(t.x, t.y, x, y) < 80)) continue;
      let ok = true;
      for (let j = -8; j <= 8 && ok; j += 2) for (let i = -8; i <= 8 && ok; i += 2)
        if (isBlocked(x + i + 0.5, y + j + 0.5)) ok = false;
      if (ok) { gx = x; gy = y; break outer; }
    }
    R.ground = gx ? `staged on open waste at ${gx},${gy}` : '!! NO OPEN GROUND';

    const wipe = () => { for (let i = chars.length - 1; i >= 0; i--) if (chars[i].__probe) chars.splice(i, 1); };
    const mark = () => { for (const c of chars) if (!c.__seen) { c.__seen = 1; } };
    const run = (n) => { paused = false; for (let i = 0; i < n; i++) update(0.1); paused = true; };

    R.bothExist = (GAUNTS.eye && GAUNTS.messenger && GAUNTS.herald)
      ? `the table carries ${GAUNTS.eye.name}, ${GAUNTS.messenger.name} and ${GAUNTS.herald.name}`
      : '!! THE NEW WATCHERS ARE NOT IN THE GAUNTS TABLE';
    if (!GAUNTS.eye || !GAUNTS.messenger) return R;

    /* ================== 1. THE FLIGHT ================== */
    {
      wipe();
      const before = chars.length;
      const flight = spawnEyeFlight(gx, gy);
      for (const e of flight) e.__probe = true;
      R.itArrivesAsAFlight = flight.length >= 4 && chars.length - before === flight.length
        ? `a flight stands up ${flight.length} strong, as bodies rather than as one thing drawn several times`
        : `!! THE SWARM IS NOT A SWARM (${flight.length} bodies)`;
      const sq = new Set(flight.map(e => e.squad && e.squad.id));
      R.theFlightIsOneThing = sq.size === 1 && [...sq][0]
        ? 'and they share one squad, so they arrive and hunt together'
        : `!! THE FLIGHT HAS NO SHARED SQUAD (${sq.size} ids)`;
      /* individually nothing: it has to be thinnable, or a swarm is just a tougher body */
      const e0 = flight[0];
      R.eachOneIsNothing = e0.maxBlood <= 30 && e0.big < 0.6
        ? `each is ${e0.big}x across with ${e0.maxBlood} blood — a flight is thinned, not out-tanked`
        : `!! AN EYE IS A HEAVY BODY (${e0.big}x, ${e0.maxBlood} blood)`;
      R.itIsWiredToCast = e0.arts && e0.arts.emberrot && e0.stance === 'ranged' && e0.onlyArt
        ? `and it holds off and looks: ${e0.stance}, one art (${e0.onlyArt}), ${Math.round(e0.mana)} mana`
        : `!! AN EYE CANNOT CAST (arts ${JSON.stringify(e0.arts)}, stance ${e0.stance})`;
    }

    /* ================== 2. THE GAZE GOES THROUGH PLATE ==================
       The design claim, and the reason this creature was asked for. Measured as TWO IDENTICAL
       BODIES, one in plate and one bare, taking the same gaze — because "it does damage" would
       pass on a creature plate turns off, and an absolute number would be asserting the burn
       rate. If armour is no answer, the two take the same wound.
       AND IT IS MEASURED IN LIMBS, NOT BLOOD. `applyDot` calls `applyDamage` against a PART;
       blood is what bleeds out of the wound afterwards. The first version of this read `blood`
       and reported a single point of loss for a fire that had done fifty, which said nothing
       about armour at all. */
    {
      wipe();
      const hurt = (c) => PARTS.reduce((n, k) => n + (c.parts[k].max - c.parts[k].hp), 0);
      const mk2 = (name, armor) => {
        const c = makeChar(name, 'player', gx + 3, gy + (armor ? 0 : 4),
          { atk: 20, def: 90, tough: 90, ath: 6, ...(armor ? { armor } : {}) });
        c.state = 'ok'; c.__probe = true; c.undead = true; chars.push(c); return c;
      };
      const plated = mk2('Bone Knight', 'a_pla');
      const bare = mk2('Bare Knight', null);
      const eye = spawnGaunt('eye', gx + 6, gy); eye.__probe = true;
      eye.mana = 999; eye.castCd = 0;
      castEmberRot(eye, plated);
      castEmberRot(eye, bare);
      R.theGazeCatches = !!plated.dot && !!bare.dot
        ? `the gaze sets a rot-fire in both (${plated.dot.dps.toFixed(1)} dps for ${plated.dot.t}s)`
        : '!! THE GAZE DOES NOTHING';
      run(80);
      const hp = hurt(plated), hb = hurt(bare);
      R.theGazeBurns = hp > 10
        ? `and it burns — ${hp.toFixed(0)} points of wound through a def of ${plated.stats.def} and a plate coat`
        : `!! THE GAZE DID ALMOST NOTHING (${hp.toFixed(0)} points)`;
      /* the actual claim: the plate made no difference */
      R.andPlateIsNoAnswer = hp >= hb * 0.9
        ? `and the plate bought nothing — ${hp.toFixed(0)} wounded in armour against ${hb.toFixed(0)} bare`
        : `!! PLATE BLUNTED THE GAZE (${hp.toFixed(0)} vs ${hb.toFixed(0)} bare) — this creature was meant to be the counter to armour`;
    }

    /* ================== 3. THE MESSENGER LEARNS ==================
       Against a real control fed exactly the same experience: the ratio is the claim, not
       the absolute, or this is an assertion about the xp curve. */
    {
      wipe();
      /* THE CONTROL IS ANOTHER MESSENGER WITH THE MULTIPLIER TAKEN OFF, not an ordinary Gaunt.
         The first version compared against a Gaunt and reported the Messenger learning SLOWER
         — because `xpGain` yields less the higher the stat already is, and a Messenger starts
         at atk 26 against a Gaunt's 22. The starting line swamped the effect. Two bodies of
         the same kind differing in exactly the thing under test is the only honest control. */
      const m = spawnGaunt('messenger', gx, gy); m.__probe = true;
      const ord = spawnGaunt('messenger', gx + 2, gy); ord.__probe = true;
      ord.learnMult = 0;
      const plain = spawnGaunt('gaunt', gx + 4, gy); plain.__probe = true;
      R.itIsAWatcher = m.faction === 'gaunt' && m.gauntKind === 'messenger' && CULL_FOES.gaunt === 'watchers'
        ? 'it counts as a Watcher for the cull and the bounty board'
        : `!! IT IS NOT A WATCHER (faction ${m.faction}, kind ${m.gauntKind})`;
      R.itIsNotUnmadeByDawn = m.nightborn === false
        ? 'and the dawn does not collect it, so there is time for it to become something'
        : '!! IT IS NIGHTBORN — it is deleted before it can learn anything';
      /* A SMALL DOSE, DELIBERATELY. The first version fed 200 points of experience and both
         bodies came out at exactly 74.0 gained — because the skill ceiling is 100 and they had
         both simply maxed. A multiplier on the RATE is invisible once everything involved has
         finished; the assertion has to land while there is still road ahead. */
      const mA = m.stats.atk, oA = ord.stats.atk;
      for (let i = 0; i < 20; i++) { xpGain(m, 'atk', 0.2); xpGain(ord, 'atk', 0.2); }
      const mGain = m.stats.atk - mA, oGain = ord.stats.atk - oA;
      R.itLearnsFasterThanItsKin = oGain > 0 && mGain > oGain * 1.3
        ? `on identical experience and an identical starting line it gains ${(mGain / oGain).toFixed(2)}x (${mGain.toFixed(1)} vs ${oGain.toFixed(1)} atk)`
        : `!! IT LEARNS NO FASTER THAN ITS OWN KIND WITH THE MULTIPLIER OFF (${mGain.toFixed(1)} vs ${oGain.toFixed(1)})`;
      R.andNothingElseHostileDoes = !plain.learnMult
        ? 'and it is alone out there — an ordinary Gaunt carries no learnMult at all'
        : `!! ORDINARY GAUNTS LEARN TOO (learnMult ${plain.learnMult}) — the creature is not the creature`;
    }

    /* ================== 4. FIRE AND LIGHT, WHICH IS NOT AN ITEM ================== */
    {
      wipe();
      const m = spawnGaunt('messenger', gx, gy); m.__probe = true;
      R.itCarriesNothing = !m.weapon && !m.armor && (m.clawDmg || 0) > 8
        ? `it holds no item at all and fights with a claw of ${m.clawDmg}`
        : `!! IT IS CARRYING KIT (weapon ${m.weapon}, armor ${m.armor})`;
      R.andTheWoundIsFire = m.clawWt === 'burn'
        ? 'and the wound reads as burn, not as a fist'
        : `!! ITS WEAPON OF FIRE AND LIGHT LANDS LIKE A PUNCH (clawWt ${m.clawWt})`;
      /* unlootable BY CONSTRUCTION: there is no item on the body to take */
      m.state = 'dead';
      const drops = { ...(m.dropItems || {}), ...(m.weapon ? { [m.weapon]: 1 } : {}) };
      R.andThereIsNothingToLoot = Object.keys(drops).length === 0
        ? 'and a dead one leaves nothing to pick up — not by a flag, but because there was never an item'
        : `!! ITS WEAPON CAN BE LOOTED (${JSON.stringify(drops)})`;
      const h = spawnGaunt('herald', gx + 2, gy); h.__probe = true;
      R.theHeraldIsTheAlchemist = h.arts && h.arts.emberrot && h.onlyArt === 'destruction' && attCap(h, 'divine') === 0
        ? 'the Herald knows fire and is capped at zero in every other branch, however long it lives'
        : `!! THE HERALD IS NOT AN ALCHEMIST (arts ${JSON.stringify(h.arts)}, onlyArt ${h.onlyArt})`;
      R.andItSpeaks = (m.barks || []).length >= 2 && (h.barks || []).length >= 2
        ? `and both of them talk: "${m.barks[0]}"`
        : '!! THEY ARE SILENT — the ancient tongue costs nothing and is missing';
      wipe();
    }

    return R;
  });

  console.log("=== THE EYES, AND THE MESSENGERS ===\n");
  for (const [k, v] of Object.entries(out)) console.log('  ' + k.padEnd(26) + v);
  const bad = Object.values(out).map(String).filter(v => v.startsWith('!!'));
  console.log('\n' + (bad.length ? '*** ' + bad.join('\n*** ')
    : 'A FLIGHT BURNS THROUGH PLATE, AND ONE THING OUT THERE IS GETTING BETTER AT THIS'));
  if (errs.length) { console.log('errs:', errs.length); errs.slice(0, 4).forEach(e => console.log('  ' + e)); }
  await b.close();
  if (bad.length) process.exitCode = 1;
})();
