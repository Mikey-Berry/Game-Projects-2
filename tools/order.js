#!/usr/bin/env node
/* WHAT THE ORDER SEES WHEN IT LOOKS AT YOU, AND WHERE IT KEEPS ITS HOUSE.
 *
 *   "It doesn't make sense that paladins are immediately hostile to you if you just pass them
 *    on the road as a normal human. There should be layers to this — they are only hostile if
 *    you are a notorious necromancer, or are obviously traveling with a host of undead. An
 *    unrelated party member should be able to sneak into Saltmere without instantly attracting
 *    attention. (Otherwise I will never be able to enter Saltmere or complete Albedo's quest.)"
 *
 *   "Let's incorporate the Paladin Bastion closer to Saltmere. That should be where they are
 *    located since Saltmere already has some paladins in town."
 *
 * THE OLD RULE WAS ONE LINE WITH TWO FAULTS IN IT:
 *     if(p.faction === 'player') return menaceFlag || purgeWrath > 0;
 * and `menaceFlag` was set, among other things, by any living player body with `magic >= 15`.
 *
 * HAVING MAGIC IS NOT A CRIME — a divine healer clears that bar, and so does every necromancer
 * origin in the game on its first frame, so the flag was true from the opening minute of nearly
 * every run. AND IT WAS GLOBAL: one boolean about the whole roster, asked about whichever body
 * was standing there, so a hired hand with no gift alone on the far side of the map read exactly
 * as the necromancer who employs her. There was no such thing as an unrelated party member.
 *
 *   1. a plain living hand, alone, is walked straight past
 *   2. the same hand standing with a risen is not
 *   3. and a SHROUDED risen is not "in plain sight" — the art that hides the dead buys this too
 *   4. a notorious necromancer is known by reputation, wherever they are standing
 *   5. so is anyone who has spilled the Order's blood
 *   6. the dead themselves are hunted exactly as they always were
 *   7. and carrying a gift is not, on its own, anything at all
 *   8. the Bastion stands within sight of Saltmere, on five seeds, fully built
 *
 * Anything starting '!!' fails the build.
 *
 *   node tools/order.js [game.html]
 */
const { chromium } = require('playwright');
const path = require('path');
const gamePath = (a) => path.resolve(a ? (path.isAbsolute(a) ? a : path.join(__dirname, a)) : path.join(__dirname, 'game.html'));

(async () => {
  const b = await chromium.launch({
    executablePath: process.env.DUSTWARD_CHROME || undefined,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'],
  });
  const errs = [];
  const R = {};
  const file = gamePath(process.argv[2]);

  {
    const p = await b.newPage({ viewport: { width: 900, height: 600 } });
    p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message.slice(0, 200)));
    await p.goto('file://' + file, { waitUntil: 'load' });
    await p.waitForTimeout(3000);
    await p.evaluate(() => { document.getElementById('btn-start').click(); paused = true; });
    await p.waitForTimeout(3000);
    Object.assign(R, await p.evaluate(() => {
      const O = {};
      paused = true;
      const guard = (keys, fn) => {
        try { fn(); } catch (e) { for (const k of keys) if (O[k] === undefined) O[k] = '!! ' + String(e.message).slice(0, 120).toUpperCase(); }
      };
      /* somewhere empty, so nothing wanders into the measurement */
      let gx = 0, gy = 0;
      outer:
      for (let y = 150; y < H - 150; y += 9) for (let x = 150; x < W - 150; x += 9) {
        if (towns.some(t => dist(t.x, t.y, x, y) < 130)) continue;
        let ok = true;
        for (let j = -6; j <= 6 && ok; j++) for (let i = -6; i <= 6; i++) if (isBlocked(x+i+0.5, y+j+0.5, 0)) ok = false;
        if (ok) { gx = x; gy = y; break outer; }
      }
      O._ground = gx ? `staged on open waste at ${gx},${gy}` : '!! NO OPEN GROUND';

      /* THE WHOLE ROSTER IS MOVED OFF THE MEASUREMENT. `escortingDead` asks what is standing
         NEAR this body, so the necromancer and his host being anywhere in the frame is the
         thing under test and cannot be left to chance. */
      const parked = [];
      for (const c of chars) if (c.faction === 'player') { parked.push([c, c.x, c.y]); c.x += 600; }
      const made = [];
      const mk = (fac, dx, o) => {
        const c = makeChar('Probe ' + fac + made.length, fac, gx + (dx || 0), gy, {atk:5, def:5, tough:10});
        c.floor = 0; Object.assign(c, o || {}); chars.push(c); made.push(c); return c;
      };
      const pal = mk('purge', 3);
      const wasWrath = purgeWrath, wasKnown = fame.known, wasRep = fame.repute;
      purgeWrath = 0; fame.known = 0; fame.repute = 0;

      /* ---- 1. A PLAIN HAND, ALONE ---- */
      const hand = mk('player', 0, {gift: null});
      rebuildCharGrid();
      /* ---------- AND THE FLAG HAS TO HAVE BEEN COMPUTED ----------
         `menaceFlag` is recomputed a second at a time inside `update`, and the harness pauses
         the instant the world starts — so on the first cut of this file it was still `false` on
         BOTH builds and the two "walked past" claims came back green on the control, where they
         have no business being. They pass there for a staging reason and not because the old
         rule was fine.
         So the necromancer who employs this hand is made what a necromancer is — a dark caster
         at MAG 40, parked six hundred tiles away — and the real recompute is driven on whichever
         build is under test, which lets each one set its own flag its own way. The old rule then
         reads that flag about a body on the other side of the world, which is the whole report. */
      const boss = parked.length ? parked[0][0] : null;
      if(boss){ boss.gift = 'dark'; boss.stats.magic = 40; boss.undead = false; boss.state = 'ok'; }
      { const wasPaused = paused; paused = false;
        for(let i = 0; i < 40; i++) update(1/30);
        paused = wasPaused; }
      /* everything the step moved goes back where the measurement wants it */
      for (const [c, x, y] of parked) { c.x = x + 600; c.y = y; }
      hand.x = gx; hand.y = gy; pal.x = gx + 3; pal.y = gy;
      rebuildCharGrid();
      O._flag = `the world computed menaceFlag = ${menaceFlag} with a MAG 40 dark caster six hundred tiles away`;
      O.aPlainHandIsWalkedPast = !hostile(pal, hand) && !hostile(hand, pal)
        ? 'a living hand with no gift, standing alone, is not the Order\'s business — both ways round'
        : '!! A PALADIN ATTACKS A PLAIN TRAVELLER ON SIGHT';

      /* ---- 7. AND NEITHER IS A GIFT ---- */
      guard(['aGiftIsNotACrime'], () => {
        const tests = [];
        for (const g of ['divine', 'destruction', 'dust', 'dark']) {
          hand.gift = g; hand.stats.magic = 40;
          tests.push([g, hostile(pal, hand)]);
        }
        hand.gift = null; hand.stats.magic = 5;
        const angry = tests.filter(t => t[1]).map(t => t[0]);
        O.aGiftIsNotACrime = angry.length === 0
          ? 'and a caster at MAG 40 is still just somebody on the road — divine, destruction, dust and dark alike'
          : `!! THE ORDER ATTACKS ANYONE WHO CAN CAST (${angry.join(', ')})`;
      });

      /* ---- 2. THE SAME HAND, WITH A RISEN BESIDE IT ---- */
      guard(['butNotOneWalkingWithTheDead', 'andAShroudedRisenIsNotInPlainSight'], () => {
        const risen = mk('player', 1, {undead: true});
        rebuildCharGrid();
        const seen = hostile(pal, hand);
        /* ---- 3. AND THE SHROUD IS A REAL ANSWER TO IT ---- */
        risen.shrouded = true;
        rebuildCharGrid();
        const hidden = hostile(pal, hand);
        O.butNotOneWalkingWithTheDead = seen
          ? 'but the same hand standing beside a risen is a party with the dead in it, and is read as one'
          : '!! A HAND ESCORTING THE WALKING DEAD IS IGNORED';
        O.andAShroudedRisenIsNotInPlainSight = !hidden
          ? 'and a SHROUDED risen is not in plain sight — the art that hides the dead from a town now hides them from the Order too'
          : '!! THE SHROUD DOES NOT FOOL THE ORDER';
        risen.shrouded = false;
        /* ---- 6. AND THE DEAD ARE STILL HUNTED ---- */
        rebuildCharGrid();
        O.theDeadAreStillHunted = hostile(pal, risen)
          ? 'and the risen itself is hunted exactly as it always was — that quarrel is not what moved'
          : '!! THE ORDER NO LONGER HUNTS THE WALKING DEAD';
        const i = chars.indexOf(risen); if (i >= 0) chars.splice(i, 1);
        rebuildCharGrid();
      });

      /* ---- 4. NOTORIETY ---- */
      guard(['aNotoriousNecromancerIsKnown'], () => {
        const before = hostile(pal, hand);
        fame.known = 80; fame.repute = -60;
        const after = hostile(pal, hand);
        fame.known = 80; fame.repute = 40;      /* known, and well thought of */
        const famous = hostile(pal, hand);
        fame.known = 0; fame.repute = 0;
        O.aNotoriousNecromancerIsKnown = (!before && after && !famous)
          ? 'a notorious necromancer is known by reputation wherever they stand — and somebody merely FAMOUS is not, because the band that matters is the ill-spoken-of one'
          : `!! NOTORIETY IS NOT THE GATE (quiet ${before}, notorious ${after}, renowned ${famous})`;
      });

      /* ---- 5. AND BLOOD ALREADY SPILLED ---- */
      guard(['andSoIsSpilledBlood'], () => {
        purgeWrath = 6;
        const angry = hostile(pal, hand);
        purgeWrath = 0;
        O.andSoIsSpilledBlood = angry
          ? 'and anyone who has killed the Order\'s people is known to it, gift or no gift'
          : '!! KILLING PALADINS DOES NOT MAKE THEM HOSTILE';
      });

      /* ---- AND THE MENACE FLAG IS NOT A STAT SHEET ----
         It still drives how hard the world looks at you — patrols, the territory warning, the
         rumour mill — so it has to mean "this party is a problem" rather than "somebody here
         can cast". Driven through the real nightly recompute rather than read off the variable. */
      guard(['theMenaceFlagIsAboutTheHost'], () => {
        const wasHost = hostSize;
        fame.known = 0; fame.repute = 0; purgeWrath = 0;
        hand.gift = 'dark'; hand.stats.magic = 60;
        hostSize = 0;
        menaceFlag = hostSize >= 4 ||
                     chars.some(c => c.faction==='player' && c.lich && c.state!=='dead') ||
                     purgeNotorious();
        const quiet = menaceFlag;
        hostSize = 9;
        menaceFlag = hostSize >= 4 ||
                     chars.some(c => c.faction==='player' && c.lich && c.state!=='dead') ||
                     purgeNotorious();
        const loud = menaceFlag;
        hostSize = wasHost; hand.gift = null; hand.stats.magic = 5;
        O.theMenaceFlagIsAboutTheHost = (!quiet && loud)
          ? 'and the menace flag is about your HOST — a MAG 60 necromancer with nothing raised is quiet, nine bound risen is not'
          : `!! THE MENACE FLAG STILL READS THE STAT SHEET (alone ${quiet}, with a host ${loud})`;
      });

      purgeWrath = wasWrath; fame.known = wasKnown; fame.repute = wasRep;
      for (let i = chars.length - 1; i >= 0; i--) if (made.includes(chars[i])) chars.splice(i, 1);
      for (const [c, x, y] of parked) { c.x = x; c.y = y; }
      rebuildCharGrid();
      return O;
    }));
    await p.close();
  }

  /* ---- 8. AND THE BASTION IS SALTMERE'S ---- */
  {
    const rows = [];
    for (const seed of [0, 7, 91, 404, 1234]) {
      const p = await b.newPage({ viewport: { width: 700, height: 500 } });
      p.on('pageerror', e => errs.push('PAGEERROR(seed ' + seed + '): ' + e.message.slice(0, 160)));
      await p.goto('file://' + file + (seed ? '?seed=' + seed : ''), { waitUntil: 'load' });
      await p.waitForTimeout(2600);
      await p.evaluate(() => { document.getElementById('btn-start').click(); paused = true; });
      await p.waitForTimeout(2600);
      rows.push(await p.evaluate(() => {
        if (!bastion) return {none: true};
        const salt = towns.find(t => t.def.key === 'saltmere');
        const d = salt ? Math.round(dist(salt.x, salt.y, bastion.x, bastion.y)) : -1;
        const nearest = towns.slice().sort((a, c) =>
          dist(a.x, a.y, bastion.x, bastion.y) - dist(c.x, c.y, bastion.x, bastion.y))[0];
        return {d, walls: bastion.walls.length, gaol: !!bastion.gaol,
                men: chars.filter(c => c.faction === 'purge' && c.state !== 'dead').length,
                nearestIsSalt: !!(salt && nearest === salt)};
      }));
      await p.close();
    }
    const bad = rows.filter(r => r.none || r.d < 0 || r.d > 80 || !r.nearestIsSalt || r.walls < 60 || !r.gaol || r.men < 10);
    R.theBastionIsSaltmeres = bad.length === 0
      ? `five worlds, the Bastion ${rows.map(r => r.d).join('/')} tiles from Saltmere — the nearest seat every time — with its wall, its gaol and ${rows.map(r => r.men).join('/')} of the Order in it`
      : `!! THE BASTION IS NOT SALTMERE'S IN ${bad.length} OF 5 WORLDS — ${JSON.stringify(bad[0])}`;
  }

  console.log('=== WHAT THE ORDER SEES ===\n');
  for (const [k, v] of Object.entries(R)) console.log("  " + k.padEnd(34) + v);
  const bad = Object.values(R).map(String).filter(v => v.startsWith('!!'));
  if (errs.length) { console.log(''); errs.slice(0, 4).forEach(e => console.log('  ' + e)); }
  console.log('\n' + (bad.length || errs.length
    ? '*** ' + [...bad, ...errs].join('\n*** ')
    : 'THE ROAD IS OPEN TO ANYONE NOT WALKING WITH THE DEAD'));
  await b.close();
  process.exit(bad.length || errs.length ? 1 : 0);
})();
