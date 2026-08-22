#!/usr/bin/env node
/* WHAT A BODY LAY IN, DOES IT COME UP WEARING?
 *
 * "Raising certain enemies who have been dead for a while (like army soldiers) tends to raise
 * them without their armor/weapons. While their corpse quality should lower, they should keep
 * the armor/weapons they had upon their death. (Perhaps rusty or lower quality equipment if
 * they have been dead for a while.)"
 *
 * The ledger asked which of two things was happening before anything was touched — the kit
 * stripped at the raise, or already gone off the corpse by the time the rite ran — because
 * they have different fixes and only one is in the rite. It was the first, and deliberate:
 * `if(rot < 0.7) r.armor = null` and `if(rot < 0.5) r.weapon = null`, against a DECAY ladder
 * that puts `spoiled` at 0.66 and `bones` at 0.44. Five days dead, no armour. Eleven, nothing.
 *
 * So this raises the SAME corpse at all four stages of decay and reads what it stood up
 * holding. Four raises, one body, one variable.
 *
 *   node tools/kitrot.js [game.html]
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

    let gx = 0, gy = 0;
    outer:
    for (let y = 60; y < H - 60; y += 5) for (let x = 60; x < W - 60; x += 5) {
      if (isBlocked(x + 0.5, y + 0.5)) continue;
      if (towns.some(t => dist(t.x, t.y, x, y) < 70)) continue;
      let ok = true;
      for (let j = -8; j <= 8 && ok; j++) for (let i = -8; i <= 8 && ok; i++)
        if (isBlocked(x + i + 0.5, y + j + 0.5)) ok = false;
      if (ok) { gx = x; gy = y; break outer; }
    }
    R.ground = gx ? `staged on open waste at ${gx},${gy}` : '!! NO OPEN GROUND';

    const wipe = () => {
      for (let i = chars.length - 1; i >= 0; i--) if (chars[i].__probe) chars.splice(i, 1);
      for (let i = corpses.length - 1; i >= 0; i--) if (corpses[i].__probe) corpses.splice(i, 1);
      rebuildCharGrid();
    };
    /* a necromancer strong enough that the rite is never the thing that fails */
    const nec = makeChar('Probe Necromancer', 'player', gx, gy, { atk: 4, def: 4, tough: 8, magic: 40 });
    nec.__probe = false; nec.gift = 'dark'; nec.floor = 0;
    chars.push(nec); nec.mana = rawMaxMana(nec);

    /* ---------- ONE SOLDIER, RAISED AT FOUR AGES ----------
       The same body, the same kit, the same necromancer: only how long it lay out changes. */
    const soldier = (ageDays) => {
      const c = makeChar('Probe Soldier', 'town', gx + 2, gy, { atk: 10, def: 10, tough: 14 });
      c.__probe = true; c.floor = 0;
      /* MASTERWORK, so the whole ladder is visible. A PLAIN item can only fall one rung
         before it floors at Crude, and a probe carrying one reports `c` for both spoiled and
         bare bones — true, and it makes "the wear is gradual" pass without ever showing more
         than one step. The floor is worth testing too, and gets its own case below. */
      c.weapon = 'w_kat_m'; c.armor = 'a_pla_m';
      c.state = 'dead'; c.deadAt = day - ageDays; c.looted = false;
      chars.push(c); corpses.push(c); rebuildCharGrid();
      return c;
    };
    const kitOf = (r) => (r ? [r.weapon || 'nothing', r.armor || 'nothing'] : ['(no body)', '(no body)']);
    /* ---------- A SUCCESSFUL RAISE DOES NOT CHANGE `chars.length` ----------
       `castRaise` SPLICES the corpse out and PUSHES the risen, so the count is identical
       across a success and the first version of this file read every raise as a refusal and
       reported "(no body)" six times. tools/raise.js has this written down already, from the
       same mistake. Take the set difference. */
    const raise = (body) => {
      const before = new Set(chars);
      nec.mana = 9999; nec.castCd = 0;
      castRaise(nec, body);
      const made = chars.filter(c => !before.has(c));
      for (const m of made) m.__probe = true;
      return made[0] || null;
    };
    const raiseAt = (ageDays) => {
      const body = soldier(ageDays);
      const stage = decayStage(body).label;
      const r = raise(body);
      const out2 = { stage, kit: kitOf(r), r };
      wipe();
      return out2;
    };

    /* w_sword / a_mail exist? if the keys are wrong every assertion below is meaningless */
    R.kit = (ITEMS.w_kat && ITEMS.a_pla && ITEMS.w_kat_c && ITEMS.a_pla_c)
      ? `raising a soldier in a ${ITEMS.w_kat.name} and ${ITEMS.a_pla.name}, which come in four grades`
      : '!! THE PROBE\'S CHOSEN KIT DOES NOT EXIST IN THIS BUILD';

    const fresh = raiseAt(0), cool = raiseAt(3), spoil = raiseAt(7), bone = raiseAt(20);
    R.fresh   = `${fresh.stage}: ${fresh.kit.join(' + ')}`;
    R.cooling = `${cool.stage}: ${cool.kit.join(' + ')}`;
    R.spoiled = `${spoil.stage}: ${spoil.kit.join(' + ')}`;
    R.bones   = `${bone.stage}: ${bone.kit.join(' + ')}`;

    /* ---------- IT KEEPS WHAT IT DIED IN ---------- */
    R.aFreshBodyRisesArmed = (fresh.kit[0] === 'w_kat_m' && fresh.kit[1] === 'a_pla_m')
      ? 'a body raised the day it fell stands up in exactly what it died in'
      : `!! A FRESH BODY ROSE WITH ${fresh.kit.join(' + ')}`;
    R.andSoDoesAnOldOne = (bone.kit[0] !== 'nothing' && bone.kit[1] !== 'nothing')
      ? `and one twenty days in the sun still stands up armed and armoured — ${bone.kit.join(' + ')}`
      : `!! A LONG-DEAD BODY ROSE WITH ${bone.kit.join(' + ')}`;
    R.andTheOneInBetween = (spoil.kit[0] !== 'nothing' && spoil.kit[1] !== 'nothing')
      ? `and a spoiled one keeps both too — ${spoil.kit.join(' + ')}`
      : `!! A SPOILED BODY ROSE WITH ${spoil.kit.join(' + ')}`;

    /* ---------- BUT THE YEARS TELL ON IT ----------
       The ask was NOT "kit survives intact" — that would make a battlefield ten days old worth
       exactly as much as one from this morning, and there would be no reason ever to hurry. */
    const grade = (k) => (k && ITEMS[k] ? (ITEMS[k].tier || 'n') : null);
    const rank = (k) => ['c', 'n', 'f', 'm'].indexOf(grade(k));
    R.grades = `grades by stage: ${[fresh, cool, spoil, bone].map(x => `${x.stage} ${grade(x.kit[0])}/${grade(x.kit[1])}`).join(' · ')}`;
    /* AND THE KIT HAS TO STILL BE THERE TO BE WORSE. `rank(null)` is -1, which is duly less
       than Masterwork — so on the build that DELETED the gear this sentence was satisfied by
       there being no gear, and read green while describing the bug. A comparison that a
       missing value satisfies is not a comparison. */
    const has = (x) => x.kit[0] !== 'nothing' && x.kit[1] !== 'nothing';
    R.butTheYearsTellOnIt = (has(bone) && has(fresh) &&
                             rank(bone.kit[0]) < rank(fresh.kit[0]) && rank(bone.kit[1]) < rank(fresh.kit[1]))
      ? 'and it comes up the worse for it — a long-dead body\'s kit is a lower grade than a fresh one\'s'
      : `!! TWENTY DAYS IN THE SUN COST THE KIT NOTHING (${grade(fresh.kit[0])} then, ${grade(bone.kit[0])} now)`;
    R.andItIsAGradualThing = ([fresh, cool, spoil, bone].every(has) &&
                              rank(spoil.kit[1]) <= rank(cool.kit[1]) && rank(bone.kit[1]) <= rank(spoil.kit[1]))
      ? 'and it is a ladder, not a cliff — each stage of rot is no kinder to the gear than the last'
      : `!! THE WEAR IS NOT MONOTONIC (${[fresh, cool, spoil, bone].map(x => grade(x.kit[1])).join(' → ')})`;
    /* a body two days dead has serviceable gear — the rot has to be worth outrunning, and
       also worth not panicking about */
    R.andTwoDaysCostsNothing = (grade(cool.kit[0]) === grade(fresh.kit[0]))
      ? 'while a body only a few days old is still wearing what it wore — the hurry is real but it is not a stopwatch'
      : `!! THREE DAYS ALREADY COST A GRADE (${grade(fresh.kit[0])} → ${grade(cool.kit[0])})`;

    /* ---------- AND THE LADDER HAS A FLOOR, NOT A TRAPDOOR ----------
       The whole point of the change is that kit is never destroyed by lying out. A plain
       item is one rung off the bottom, so twenty days must leave it Crude and not gone. */
    {
      const plain = soldier(20);
      plain.weapon = 'w_kat'; plain.armor = 'a_pla';
      const r = raise(plain);
      R.floor = r ? `a plain katana and iron plate, twenty days out: ${r.weapon} + ${r.armor}` : '!! NO BODY';
      R.theLadderHasAFloor = (r && r.weapon === 'w_kat_c' && r.armor === 'a_pla_c')
        ? 'and plain kit twenty days in the sun bottoms out at Crude rather than falling through to nothing'
        : `!! PLAIN KIT ENDED AS ${r ? r.weapon + ' + ' + r.armor : '(no body)'}`;
      wipe();
    }

    /* ---------- AND A UNIQUE HAS NO RUNG TO FALL TO ---------- */
    {
      const uniq = soldier(20);
      uniq.weapon = 'w_kingsfang';
      const r = raise(uniq);
      R.aUniqueDoesNotWeather = (r && r.weapon === 'w_kingsfang')
        ? 'and a named blade off a twenty-day corpse is still that blade — a unique has no grade to fall from'
        : `!! A UNIQUE WEAPON CAME UP AS ${r ? r.weapon : '(no body)'}`;
      wipe();
    }

    /* ---------- AND A LOOTED CORPSE STILL RISES EMPTY ----------
       The control. Nothing here should give a body back kit that somebody already took. */
    {
      const picked = soldier(0);
      picked.looted = true;
      const r = raise(picked);
      R.aPickedCorpseStillRisesEmpty = (r && !r.weapon && !r.armor)
        ? 'and a corpse somebody already went through still stands up with nothing'
        : `!! A LOOTED CORPSE ROSE WITH ${r ? kitOf(r).join(' + ') : '(no body)'}`;
      wipe();
    }

    const ni = chars.indexOf(nec); if (ni >= 0) chars.splice(ni, 1);
    return R;
  });

  const bad = Object.values(out).filter(v => typeof v === 'string' && v.startsWith('!!'));
  for (const [k, v] of Object.entries(out)) console.log('  ' + k.padEnd(30) + v);
  for (const e of errs) console.log('  ' + e);
  console.log('');
  console.log(bad.length || errs.length
    ? `THE DEAD ARE STILL BEING STRIPPED (${bad.length + errs.length})`
    : 'IT COMES UP WEARING WHAT IT LAY IN, AND THE YEARS SHOW');
  await b.close();
  process.exit(bad.length || errs.length ? 1 : 0);
})();
