#!/usr/bin/env node
/* TWO WAYS OF NOT PAYING FOR A HOST.
 *
 * "New spell: Old Bones. Reanimates a small group of temporary undead soldiers from long dead
 * bones. They only last one day while the old magic holds them together, but are useful in a
 * pinch."
 *
 * "New spell: Mass Reanimation. Raise all dead creatures in a large radius. They last three
 * days, but consume the majority of the caster's concentration. The casting itself is also an
 * extensive, time-consuming ritual."
 *
 * The binding is the whole economy of the dark art — a necromancer's ceiling is how many of
 * the dead they can hold at once, and the soulbound, the research and the lich are all bought
 * against it. Both of these step around that ceiling, so the thing worth testing is not
 * "does it raise something" (of course it does) but WHAT IT COSTS INSTEAD. A spell that
 * raises free and keeps free is the end of the ceiling and would not read as a bug in any
 * outcome test — the army would simply be bigger and everything would still work.
 *
 * So: the clock actually runs out, the head room is actually taken, the rite can actually be
 * interrupted, and neither of them quietly puts a permanent host on the binding.
 *
 *   node tools/hosts.js [game.html]
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
    const DT = 1 / 30;

    if (typeof SPELLS !== 'object' || !SPELLS.oldbones || !SPELLS.massraise) {
      R.theSpellsExist = '!! ONE OR BOTH SPELLS ARE NOT IN THE BOOK';
      return R;
    }
    R.theSpellsExist = `OLD BONES (${SPELLS.oldbones.cost} mana, magic ${SPELLS.oldbones.minMag}) and ` +
                       `MASS REANIMATION (${SPELLS.massraise.cost}, magic ${SPELLS.massraise.minMag})`;

    /* open ground well away from anybody's shrine, since both rites refuse hallowed dirt */
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

    const wipe = () => {
      for (let i = chars.length - 1; i >= 0; i--) if (chars[i].__probe) chars.splice(i, 1);
      for (let i = corpses.length - 1; i >= 0; i--) if (corpses[i].__probe) corpses.splice(i, 1);
      selected = selected.filter(c => !c.__probe);
      if (theRaising) { theRaising = null; }
    };
    const nec = (mag) => {
      const c = makeChar('Probe Necromancer', 'player', gx, gy, { atk: 5, def: 5, tough: 12, magic: mag });
      c.__probe = true; c.state = 'ok'; c.gift = 'dark'; c.floor = 0;
      c.att = { divine: 0, destruction: 0, dark: 3, dust: 0 };
      c.attXp = { divine: 0, destruction: 0, dark: 0, dust: 0 };
      c.mana = rawMaxMana(c); chars.push(c); return c;
    };
    const layOut = (x, y) => {
      const d = makeChar('Probe Dead', 'bandit', x, y, { atk: 6, def: 5, tough: 10 });
      d.__probe = true; d.floor = 0; d.state = 'dead'; d.deadAt = day + hour / 24;
      d.rot = 'fresh'; corpses.push(d); return d;
    };
    const mineOf = (c) => chars.filter(x => x.master === c && x.state !== 'dead');

    /* ================= OLD BONES ================= */
    {
      wipe();
      const n = nec(30);
      const before = risenLoad(n), cap = risenCap(n);
      const ok = castOldBones(n, gx + 2, gy);
      const host = mineOf(n);
      R.oldBones = `at magic 30 it calls ${host.length} up out of nothing, on a binding of ${before}/${cap}`;
      R.itNeedsNoCorpse = (ok && host.length >= 2 && corpses.filter(x => x.__probe).length === 0)
        ? `and it took no body to do it — there was not one within a hundred tiles`
        : `!! OLD BONES RAISED ${host.length} AND CONSUMED ${corpses.filter(x => x.__probe).length} CORPSE(S)`;

      /* THE CEILING IS THE POINT. Nothing here is bound, so the binding must not move — and a
         necromancer who is already full must still be able to cast it, which is the "in a
         pinch" the report is asking for. */
      R.andNothingOfItIsBound = risenLoad(n) === before
        ? `and the binding did not move — still ${risenLoad(n)}/${cap} with ${host.length} of them standing`
        : `!! ${host.length} PROPPED BODIES TOOK ${risenLoad(n) - before} SLOTS OFF THE BINDING`;
      /* AND EVERY OTHER PLACE THE HOST IS COUNTED. "These temporary undead should NOT count
         towards the total under the necromancer's control" — and the player reads that total
         off three different numbers, not one. `bindLoads` stamps the strain, `upkeepBodies`
         bills the larder. Only `hostSize` counts them, deliberately: twenty of the dead
         walking beside you is twenty as far as the world is concerned. */
      refreshBindStrain();
      R.andNorIsItStrainOrUpkeep = (!(n._bindW > 0) && !upkeepBodies().some(u => u.propped))
        ? `and neither the strain (${n._bindW || 0}) nor the larder counts them`
        : `!! STRAIN ${n._bindW} AND ${upkeepBodies().filter(u => u.propped).length} OF THEM ON UPKEEP`;

      /* AND THE DAY ACTUALLY RUNS OUT. The one thing that makes it fair, and the one thing an
         outcome test would never notice — an army that never leaves just looks like an army. */
      const one = host[0];
      const hoursLeft = one ? one.tempT : 0;
      let ticks = 0;
      const LIMIT = 30 * (HOUR_SEC * 30);
      while (mineOf(n).length && ticks < LIMIT) { ticks++; for (const u of [...mineOf(n)]) { u.state = 'ok'; physics(u, DT); } }
      const gameHours = (ticks * DT) / HOUR_SEC;
      R.andTheDayRunsOut = (mineOf(n).length === 0 && gameHours > 20 && gameHours < 28)
        ? `and after ${gameHours.toFixed(1)} game-hours — one day, as promised — every one of them was gone`
        : `!! ${mineOf(n).length} STILL STANDING AFTER ${gameHours.toFixed(1)} GAME-HOURS (started at ${hoursLeft})`;

      /* AND IT LEAVES NOTHING BEHIND. A body held up by a working that ran out is not a
         casualty: no corpse to harvest, no corpse to raise a second time, and no death for the
         squad to have a view about. Otherwise this is a corpse printer. */
      R.andItLeavesNothingToHarvest = corpses.filter(x => x.__probe || x.name === 'Old Bones').length === 0
        ? 'and it left no bodies behind — a working that runs out is not a death'
        : `!! IT LEFT ${corpses.filter(x => x.__probe || x.name === 'Old Bones').length} HARVESTABLE CORPSE(S)`;
    }

    /* ---------- AND IT SURVIVES BEING TICKED AT ALL ----------
       Reported: "Skeletons from the Old Bones spell crumble to dust almost instantly after
       summoning, rendering them effectively useless." The case above drives `physics` by hand
       and never saw it, because the thing that killed them lives in `bodyTick`: `updateState`
       collapses anybody whose blood is under a FLAT 40, the bodies were poured with 34, and an
       undead in the collapse branch goes straight to `kill`. They were dead inside a quarter
       of a second, having never once been alive. Run the REAL `update` and count survivors. */
    {
      wipe();
      const n = nec(30);
      castOldBones(n, n.x + 2, n.y);
      const ids = mineOf(n).map(u => u.id);
      const DT = 1 / 30;
      for (let i = 0; i < 30 * 4; i++) update(DT);
      const up = ids.filter(id => chars.some(x => x.id === id && x.state !== 'dead')).length;
      R.andTheyDoNotCrumbleOnTheSpot = (ids.length >= 2 && up === ids.length)
        ? `and all ${up} of them are still standing four seconds later — the pool clears the collapse floor`
        : `!! ${ids.length - up}/${ids.length} CRUMBLED WITHIN FOUR SECONDS OF BEING CALLED UP`;

      /* ---------- AND WHAT THEY CARRY IS NOT AN ITEM SOURCE ----------
         "Their items return to the stash, which is basically a recipe for infinite item
         farming." It was: `kill` returns a dead player-undead's kit to the wagon, which is
         right for a corpse you dressed and wrong for a weapon the spell minted. Measured on
         the build before: one cast put two clubs in the stash, for sixteen mana, repeatable.
         Asked as a DIFFERENCE across a cast-and-kill cycle, because the stash is not empty. */
      const armed = ids.map(id => chars.find(x => x.id === id)).filter(u => u && u.weapon);
      R.andTheyComeUpArmed = armed.length === ids.length
        ? `and every one of them came up holding something (${[...new Set(armed.map(u => ITEMS[u.weapon].name))].join(', ')})`
        : `!! ONLY ${armed.length}/${ids.length} OF THEM CARRY A WEAPON`;
      const before = JSON.stringify(stash);
      for (const id of ids) { const u = chars.find(x => x.id === id); if (u) kill(u, null); }
      R.andTheKitGoesWithThem = JSON.stringify(stash) === before
        ? 'and killing the lot of them put nothing at all in the wagon — the working takes back what it lent'
        : `!! THE STASH MOVED WHEN THEY DIED: ${before.slice(0, 90)} → ${JSON.stringify(stash).slice(0, 90)}`;

      /* AND THE PLAYER CANNOT SIMPLY TAKE IT OFF THEM, which is the same farm through a
         different door — five doors, and a farm only needs one of them left open. */
      wipe();
      const n2 = nec(30);
      castOldBones(n2, n2.x + 2, n2.y);
      const one = mineOf(n2).find(u => u.weapon);
      const mate = player().find(u => u.state === 'ok' && !u.propped);
      const s0 = JSON.stringify(stash);
      const doors = one ? [
        unequipSlot(one, 'weapon'),
        (one.inv = { w_club: 1 }, giveItem(one, mate, 'w_club', 1)),
        dropFromInv(one, 'w_club', 1),
      ] : [true];
      R.andNoDoorLetsItOff = (one && doors.every(x => x === false) && JSON.stringify(stash) === s0 && one.weapon)
        ? 'and unequip, hand-over and drop are all refused — the kit is part of the body'
        : `!! A DOOR IS OPEN: unequip ${doors[0]}, give ${doors[1]}, drop ${doors[2]}`;
      wipe();
    }

    /* ================= MASS REANIMATION ================= */
    {
      wipe();
      const n = nec(40);
      const cap = risenCap(n);
      /* twenty of the dead in a ring, which is comfortably more than any binding holds */
      for (let i = 0; i < 20; i++) {
        const a = (i / 20) * Math.PI * 2, d = 3 + (i % 4) * 2.5;
        layOut(gx + Math.cos(a) * d, gy + Math.sin(a) * d);
      }
      /* and one well outside the radius, so "a large radius" still means a radius */
      const far = layOut(gx + MASS_RADIUS + 6, gy);

      const poolBefore = maxMana(n);
      const started = beginMassRaise(n);
      R.theRiteOpens = started ? `the rite opens over 20 of the dead` : '!! THE RITE WOULD NOT OPEN';

      /* IT IS A RITE, NOT A CAST. Long enough to be a scene, and the caster is rooted while it
         runs — the Last Rite's own lesson, which was six and a half seconds long for a year
         because an uncapped magic multiplier ate a fixed-length job. */
      let t = 0;
      while (theRaising && t < 300) { t += DT; massRaiseTick(DT); }
      R.andItTakesRealTime = (t > 20 && t < 200)
        ? `and at magic 40 it took ${t.toFixed(0)} seconds of standing still — a scene, not a cast`
        : `!! THE RITE TOOK ${t.toFixed(1)}s AT MAGIC 40`;

      const host = mineOf(n);
      R.andEverythingNearGetsUp = host.length >= 15
        ? `and ${host.length} of the twenty stood up together`
        : `!! ONLY ${host.length}/20 STOOD UP`;
      R.andThereIsStillARadius = corpses.indexOf(far) >= 0
        ? `and the one lying ${(MASS_RADIUS + 6)} tiles out is still lying there`
        : '!! IT RAISED SOMETHING OUTSIDE ITS OWN RADIUS';

      /* THE HEAD ROOM IS THE COST. "Consume the majority of the caster's concentration" — so
         the pool has to visibly go, and it has to STAY gone while they stand. */
      const poolAfter = maxMana(n);
      R.andItCostsMostOfTheirHead = (isConcentrating(n, 'massraise') && poolAfter < poolBefore * 0.5)
        ? `and holding them costs ${(100 * (1 - poolAfter / poolBefore)).toFixed(0)}% of the pool — ${poolBefore.toFixed(0)} down to ${poolAfter.toFixed(0)}`
        : `!! THE HOST COSTS ${(100 * (1 - poolAfter / poolBefore)).toFixed(0)}% OF THE POOL (concentrating: ${isConcentrating(n, 'massraise')})`;

      /* AND IT DOES NOT GO ON THE BINDING EITHER — twenty is past any ceiling in the game, so
         if these were bound the cap would have refused most of them and nobody would notice
         except by counting. */
      R.andTwentyIsPastAnyCeiling = (host.length > cap && risenLoad(n) === 0)
        ? `and ${host.length} is past a ceiling of ${cap}, on a binding still reading ${risenLoad(n)}`
        : `!! ${host.length} RAISED AGAINST A CEILING OF ${cap}, BINDING AT ${risenLoad(n)}`;

      /* LETTING GO DISMISSES THEM. The release valve, and the reason the lock is bearable. */
      endConcentration(n, true);
      R.andLettingGoEndsThem = (mineOf(n).length === 0 && maxMana(n) > poolBefore * 0.9)
        ? 'and letting the concentration go puts every one of them down and gives the pool back'
        : `!! ${mineOf(n).length} STILL STANDING AFTER THE CASTER LET GO (pool ${maxMana(n).toFixed(0)}/${poolBefore.toFixed(0)})`;
    }

    /* ================= AND THE RITE CAN BE BROKEN ================= */
    {
      wipe();
      const n = nec(40);
      for (let i = 0; i < 6; i++) layOut(gx + 2 + i * 0.6, gy + 1);
      beginMassRaise(n);
      for (let i = 0; i < 60; i++) massRaiseTick(DT);
      n.x = gx + 9;                     /* driven off the working */
      massRaiseTick(DT);
      R.andTheRiteCanBeBroken = (!theRaising && mineOf(n).length === 0)
        ? 'and walking the caster off their own circle collapses it with nothing raised'
        : `!! THE RITE SURVIVED THE CASTER LEAVING (open: ${!!theRaising}, up: ${mineOf(n).length})`;
      wipe();
    }

    /* ---------- AND A HANDFUL OF BONE SOLDIERS IS NOT AN ARMY ----------
       Reported: "raising Old Bones massively speeds up the notice dial. I don't think it
       should, as they are weak undead and not a genuine threat." Two dials count a host and
       both were counting these: `hostSize`, through the `bindWeight || 1` trap `risenLoad`
       already carries a note about (0 || 1 is 1, so a weightless body weighed a full one), and
       `hostNoiseTick`, where anything undead defaults to 0.75.
       MEASURED ON THE DIALS, NOT ON THE NEEDLE. A first version ran the world for ten seconds
       with each host and diffed `noticed` — which came out NEGATIVE, because `update` also
       DECAYS the dial and advances a world that has other reasons to move it. The two inputs
       are deterministic and are exactly what the fix changed; the needle is just f(inputs). */
    try {
      const me = player().find(c => c.stats.magic > 0) || player()[0];
      const born = [];
      const clean = () => { for (const c of born) { const i2 = chars.indexOf(c); if (i2 >= 0) chars.splice(i2, 1); } born.length = 0; };
      const stage = (n, propped) => {
        clean();
        for (let i2 = 0; i2 < n; i2++) {
          const u = makeChar('R', 'player', me.x + 0.4 + i2 * 0.4, me.y, { atk: 5, def: 5, tough: 5 });
          u.undead = true; u.state = 'ok'; u.master = me; u.noFight = true;
          if (propped) { u.propped = true; u.bindWeight = 0; }
          chars.push(u); born.push(u);
        }
      };
      /* what one tick of the noise dial costs, with the needle reset either side */
      const noise = () => { const was = noticed; noticed = 0; hostNoiseTick(); const d = noticed; noticed = was; return d; };
      /* and the weight the host reads as, which is what feeds the standing bump and the
         menace flag — recomputed by the game itself rather than by a copy of the formula.
         It lives on a ONE-SECOND sub-tick inside `update`, so a single frame never reaches it
         and the first version of this read 0 for a host of eight bound risen. */
      const weight = () => { for (let i2 = 0; i2 < 40; i2++) update(1 / 30); return hostSize; };

      clean();          const noise0 = noise(), w0 = weight();
      stage(8, false);  const noiseB = noise(), wB = weight();
      stage(8, true);   const noiseP = noise(), wP = weight();
      clean(); noticed = 0; noticeTier = 0;

      R._notice = `host weight: none ${w0}, eight bound ${wB}, eight propped ${wP} · ` +
                  `noise a tick: none ${noise0.toFixed(4)}, bound ${noiseB.toFixed(4)}, propped ${noiseP.toFixed(4)}`;
      const heavier = wB - w0, lighter = wP - w0;
      R.bonesWeighNothing = (heavier >= 7 && lighter <= 0.01)
        ? `and eight bone soldiers add ${lighter} to the host's weight where eight bound risen add ${heavier} — nothing is holding them`
        : `!! PROPPED BODIES WEIGH ${lighter} AGAINST A BOUND ${heavier}`;
      const ratio = noiseB > 1e-9 ? noiseP / noiseB : (noiseP > 0 ? 99 : 0);
      R.bonesAreQuiet = (noiseB > 0 && ratio < 0.34)
        ? `and they raise the dial at ${(ratio * 100).toFixed(0)}% of a bound host's rate — heard, but not an army`
        : `!! BONE SOLDIERS COST ${(ratio * 100).toFixed(0)}% OF A BOUND HOST (${noiseP.toFixed(4)} against ${noiseB.toFixed(4)})`;
    } catch (e) { R.bonesAreQuiet = '!! ' + String(e.message).slice(0, 80).toUpperCase(); }

    return R;
  });

  const bad = Object.values(out).filter(v => typeof v === 'string' && v.startsWith('!!'));
  for (const [k, v] of Object.entries(out)) console.log('  ' + k.padEnd(30) + v);
  for (const e of errs) console.log('  ' + e);
  console.log('');
  console.log(bad.length || errs.length
    ? `A HOST THAT COSTS NOTHING IS NOT A HOST (${bad.length + errs.length})`
    : 'TWO HOSTS, AND BOTH OF THEM ARE PAID FOR');
  await b.close();
  process.exit(bad.length || errs.length ? 1 : 0);
})();
