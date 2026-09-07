#!/usr/bin/env node
/* WHAT IT WAS STEEPED IN COMES UP WITH IT.
 *
 * "Allies with high 'magic' skill (and trained in a certain branch of alchemy) should keep
 *  that when raised as a lieutenant — basically make them a skeleton mage. (And giving them
 *  the skeleton mage skin/model would be a nice touch.)"
 *
 * Measured on the build before the fix (f4c0bc4 and every build before it): a living
 * alchemist with `magic` 20 and the destruction branch at ADEPT was raised as a lieutenant
 * and came up with gift `null`, `att` all zeroes, `arts` gone, and `spellsFor` returning an
 * EMPTY LIST. `magic` was carried at a flat half — the one stat exempt from `lieuRot` — into
 * a body with no branch to spend it in, so the number on the panel was decoration. The rite
 * that is supposed to keep a person kept everything about them except the thing they had
 * spent their life on.
 *
 * Every claim here is driven through the real rite (`castRaise`) on a body made by the real
 * death path (`kill`), and the casting claim is driven through the game's own AI tick rather
 * than by calling `castFirebolt` — a probe that calls the cast function has proved the cast
 * function exists, which was never in doubt.
 *
 *   node tools/steeped.js [game.html]
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
  await p.evaluate(() => { document.getElementById('btn-start').click(); paused = true; });
  await p.waitForFunction(() => document.getElementById('startoverlay').style.display === 'none', null, { timeout: 60000 });

  const out = await p.evaluate(() => {
    const R = {};
    paused = true;

    /* open waste, well away from any town: consecrated ground refuses the rite outright and a
       raising inside somebody's walls is a crime with witnesses */
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
    const mk = (name, f, x, y, o) => {
      const c = makeChar(name, f, x, y, o || {});
      c.state = 'ok'; c.__probe = true; chars.push(c); return c;
    };

    const necro = mk('Adept', 'player', gx, gy, { atk: 8, def: 8, tough: 40, ath: 8, magic: 60 });
    necro.gift = 'dark'; necro.lich = true;
    necro.att = { divine: 0, destruction: 0, dark: 3, dust: 0 };
    necro.mana = 999;

    /* THE ALCHEMIST, built the way the world builds one: a gift, a trained branch, an art in
       the hand, and the ranged stance that goes with all three. */
    const born = { atk: 9, def: 7, tough: 22, ath: 8, magic: 20, labor: 6 };
    /* ---------- PIN THE LINE, AND MEASURE THE BODY YOU ACTUALLY GOT ----------
       `makeChar` draws a race and a subrace, and their modifiers move the stats — so comparing
       a raised lieutenant against the LITERAL asked for at staging compares two different
       bodies. It passed for as long as the world's random stream happened to hand this probe a
       plain human, and read "MAGIC IS STILL TAXED (magic 20 of 20, atk 12 of 9)" the moment the
       stream moved: magic, the thing under test, was perfect, and atk was somebody else's. */
    const mkAlch = (name, x, y) => {
      const a = mk(name, 'player', x, y, { ...born });
      a.race = 'human'; a.sub = null;
      Object.assign(a.stats, born);
      a.gift = 'destruction';
      a.att = { divine: 0, destruction: 2, dark: 0, dust: 0 };
      a.attXp = { divine: 0, destruction: 140, dark: 0, dust: 0 };
      a.arts = { emberrot: true };
      a.stance = 'ranged';
      a.mana = maxMana(a);
      return a;
    };

    /* ---------- 1. THE CONTROL: ALIVE, SHE IS A CASTER ---------- */
    const alive = mkAlch('Verrin Sallow', gx + 2, gy);
    const wasAlive = { ...alive.stats };   /* what she ACTUALLY had, not what was asked for */
    const aliveSpells = spellsFor(alive).map(e => e[0]);
    R.aliveSheIsACaster = aliveSpells.length >= 2 && aliveSpells.includes('firebolt')
      ? `a living adept of destruction, magic ${alive.stats.magic}, knows ${aliveSpells.length}: ${aliveSpells.join(' ')}`
      : `!! THE CONTROL IS NOT A CASTER TO BEGIN WITH (${aliveSpells.join(' ') || 'nothing'}) — nothing below means anything`;

    /* `castRaise` HANDS BACK THE BODY IT MADE, and `chars` does not grow: the rite splices the
       corpse out of the roster and pushes the risen in, so a probe that watches `chars.length`
       (as this one first did) sees a delta of zero and concludes nothing was raised. Take the
       return value. */
    const raiseIt = (body) => {
      necro.mana = 999; necro.castCd = 0;
      const made = castRaise(necro, body);
      if (made && made.lieutenant) { made.__probe = true; return made; }
      return null;
    };

    /* ---------- 2. DEAD, SHE STILL IS ---------- */
    kill(alive, necro);
    R.aBodyToRaise = corpses.includes(alive)
      ? 'she leaves a body, as any companion does'
      : '!! THE CONTROL NEVER LEFT A BODY';
    const lt = raiseIt(alive);
    R.itRisesAsHer = lt && lt.lieutenant && lt.name === 'Verrin Sallow'
      ? `raised as a lieutenant, still ${lt.name}, wear ${lt.lieuWear}`
      : `!! THE RAISING DID NOT PRODUCE HER (${lt && lt.name})`;

    const ltSpells = lt ? spellsFor(lt).map(e => e[0]) : [];
    R.theArtComesUpWithHer = lt && lt.gift === 'destruction' && attOf(lt, 'destruction') === 2 && ltSpells.length === aliveSpells.length
      ? `the branch survives whole — still an adept of destruction, still knows ${ltSpells.length}: ${ltSpells.join(' ')}`
      : `!! THE ART DID NOT SURVIVE THE RAISING (gift ${lt && lt.gift}, destruction ${lt && attOf(lt, 'destruction')}, spells ${ltSpells.join(' ') || 'none'} vs ${aliveSpells.length} alive)`;

    /* the climb to the next tier is not restarted, and there is a pool to cast out of */
    R.sheDoesNotStartOver = lt && lt.attXp && lt.attXp.destruction === 140 && lt.mana >= SPELLS.firebolt.cost
      ? `and she does not start the climb over — ${lt.attXp.destruction} toward master, ${Math.round(lt.mana)} mana in the pool`
      : `!! PROGRESS OR POOL LOST (attXp ${lt && lt.attXp && lt.attXp.destruction}, mana ${lt && Math.round(lt.mana)})`;

    /* ---------- 3. THE FIRST RAISING TAKES NOTHING SHE HAD ----------
       `lieuRot` is 1.00 off the fresh body, and every other stat comes up whole at that rung.
       Magic used to be the one exemption — a flat half — which is the number this asks about. */
    R.deathDoesNotHalveHer = lt && lt.stats.magic === wasAlive.magic && lt.stats.atk === wasAlive.atk
      ? `fresh off the ground she is whole: magic ${lt.stats.magic} and atk ${lt.stats.atk}, as she was`
      : `!! MAGIC IS STILL TAXED APART FROM EVERYTHING ELSE (magic ${lt && lt.stats.magic} of ${wasAlive.magic}, atk ${lt && lt.stats.atk} of ${wasAlive.atk})`;

    /* ---------- 4. AND SHE LOOKS LIKE WHAT SHE IS ---------- */
    R.sheComesUpAMage = lt && lt.kin === 'mage'
      ? 'she takes the skeleton mage frame — burnt bone, the mantle, the ember at the ribs'
      : `!! SHE COMES UP ON THE GENERIC RISEN RIG (kin ${lt && lt.kin})`;

    /* ---------- 5. AND SHE THROWS IT ----------
       Ordered onto a target the way a player orders one — `target` set, `targetManual` — and
       then the world is allowed to run. Nothing here calls a cast function. */
    let bolted = null;
    if (lt) {
      const foe = mk('Outrider', 'bandit', gx + 8, gy, { atk: 10, def: 10, tough: 30, ath: 8 });
      const foeBlood0 = foe.blood, mana0 = lt.mana;
      lt.target = foe; lt.targetManual = true; lt.castCd = 0;
      paused = false;
      let sawBolt = false;
      for (let i = 0; i < 400 && foe.state === 'ok'; i++) {
        update(0.05);
        if (projectiles.some(q => q.caster === lt)) sawBolt = true;
      }
      paused = true;
      bolted = { sawBolt, spent: Math.round(mana0 - lt.mana), hurt: Math.round(foeBlood0 - foe.blood), dead: foe.state !== 'ok' };
    }
    R.andSheThrowsIt = bolted && bolted.spent > 0 && (bolted.hurt > 0 || bolted.dead)
      ? `told to fight, she works the art: ${bolted.spent} mana spent, ${bolted.hurt} blood off the target${bolted.dead ? ', and it went down' : ''}${bolted.sawBolt ? ', bolts in the air' : ''}`
      : `!! SHE STANDS THERE (${bolted ? JSON.stringify(bolted) : 'never raised'})`;

    /* ---------- 6. THE ART IS KNOWLEDGE; THE STRENGTH TO WORK IT IS NOT ----------
       Run down the ladder. The TIER must not move — an adept rises an adept however far the
       body has gone — while `magic` walks down with atk and the rest, and the frame drops
       back to the ordinary risen rig once there is not enough left to work the art. */
    const rungs = [];
    let cur = lt, guard = 0;
    while (cur && guard++ < 6) {
      kill(cur, necro);
      if (!corpses.includes(cur)) break;
      const next = raiseIt(cur);
      if (!next) break;
      cur = next;
      rungs.push({ wear: cur.lieuWear, tier: attOf(cur, 'destruction'), magic: cur.stats.magic, atk: cur.stats.atk, kin: cur.kin || null });
    }
    const tiersHeld = rungs.length >= 2 && rungs.every(r => r.tier === 2);
    const magicFell = rungs.length >= 2 && rungs[rungs.length - 1].magic < rungs[0].magic;
    R.sheRemembersMoreThanSheCanWork = tiersHeld && magicFell
      ? `four rungs down she is still an adept, and can do less with it every time: magic ${wasAlive.magic} -> ${rungs.map(r => r.magic).join(' -> ')}`
      : `!! THE ART AND THE STRENGTH DID NOT COME APART (${JSON.stringify(rungs)})`;
    /* and the frame follows the strength, not the knowledge */
    /* THIS HAS TO SEE THE FRAME CHANGE, NOT MERELY BE ABSENT. Asking only "is the weakest rung
       not a mage" passes on the build before the fix, where nothing is ever a mage on any
       rung — green on exactly the bug above. It must see a mage's frame held while the
       strength is there and dropped when it goes. */
    const held = rungs.filter(r => r.magic >= 8);
    const fell = rungs.find(r => r.magic < 8);
    R.andTheFrameFollowsTheStrength = !rungs.length ? '!! NEVER GOT DOWN THE LADDER'
      : !held.length || !fell ? `!! THE LADDER DID NOT CROSS THE LINE ON THIS RUN (${rungs.map(r => r.magic).join(' -> ')}) — cannot tell`
      : held.every(r => r.kin === 'mage') && fell.kin !== 'mage'
        ? `and the frame follows the strength, not the knowledge: a mage's while ${held.map(r => r.magic).join(' and ')} magic held it up, and at ${fell.magic} she is a swordsman who used to read`
        : `!! THE FRAME DOES NOT TRACK THE STRENGTH (${JSON.stringify(rungs)})`;

    /* ---------- 7. AND A LABOURER IS NOT MADE A MAGE ----------
       The negative control INSIDE this build: somebody with no gift and no branch has to come
       up exactly as they always did. A change that hands the mage rig to every lieutenant
       would pass every claim above. */
    const plain = mk('Ordell Vane', 'player', gx + 4, gy + 3, { atk: 30, def: 20, tough: 40, ath: 10, labor: 12 });
    plain.gift = null; plain.att = { divine: 0, destruction: 0, dark: 0, dust: 0 };
    kill(plain, necro);
    const plainLt = raiseIt(plain);
    const plainSpells = plainLt ? spellsFor(plainLt).map(e => e[0]) : ['<never raised>'];
    R.aLabourerIsNotMadeAMage = plainLt && !plainLt.gift && plainLt.kin !== 'mage' && plainSpells.length === 0
      ? 'somebody who never read a formula comes up on the ordinary risen rig with nothing to cast'
      : `!! THE RIG IS BEING HANDED OUT (gift ${plainLt && plainLt.gift}, kin ${plainLt && plainLt.kin}, spells ${plainSpells.join(' ') || 'none'})`;

    /* ---------- 8. WHAT THIS COSTS: A DARK LIEUTENANT HAS A BINDING OF ITS OWN ----------
       Not a defect and not asserted as one — reported, because it is the consequence of the
       change that is worth arguing about. A necromancer companion raised as a lieutenant can
       work the dark art, and `risenCap` is per-caster, so it carries a second pool. */
    const dk = mk('Sable', 'player', gx - 3, gy + 3, { atk: 6, def: 6, tough: 20, ath: 7, magic: 22 });
    dk.gift = 'dark'; dk.att = { divine: 0, destruction: 0, dark: 2, dust: 0 };
    const capAlive = risenCap(dk);
    kill(dk, necro);
    const dkLt = raiseIt(dk);
    R.noteASecondBinding = dkLt
      ? `a raised necromancer keeps the dark art and a binding of its own: cap ${capAlive} alive, ${risenCap(dkLt)} raised (master's own cap ${risenCap(necro)}) — reported, not asserted`
      : 'the dark companion did not raise — nothing to report';

    wipe();
    return R;
  });

  console.log('=== WHAT IT WAS STEEPED IN COMES UP WITH IT ===\n');
  for (const [k, v] of Object.entries(out)) console.log('  ' + k.padEnd(31) + v);
  if (errs.length) console.log('\n' + errs.join('\n'));
  const bad = Object.values(out).map(String).filter(v => v.startsWith('!!')).concat(errs);
  console.log('\n' + (bad.length ? '*** ' + bad.join('\n*** ')
    : 'A RAISED CASTER KEEPS THE ART WHOLE AND LOSES THE STRENGTH TO WORK IT'));
  await b.close();
  process.exit(bad.length ? 1 : 0);
})();
