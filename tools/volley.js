#!/usr/bin/env node
/* WHY YOU WOULD EVER BIND AN ARCHER.
 *
 * "Ranged skeleton mages are simply far more effective than marrow archers. Mages do not risk
 *  friendly fire, deal more damage, learn faster (and thus deal even MORE damage), and overall
 *  perform better at less risk to allies. One research tier isn't much difference and honestly
 *  makes me question why go with archers at all."
 *
 * Measured off the tables before anything moved, and the gap was worse than the note said —
 * there was no research tier between them at all. Both `rites_deep`, both bind weight 2, both
 * two Mortal Remains. A firebolt is 10 + magic*0.9 at 0.30 armour pierce with a rot-fire art on
 * top and no friendly-fire path in the code; the Sinew-Drawn Bow was nine damage at 0.04 pierce
 * that can go into your own line. And the mage OUT-RANGED it, eight tiles to seven.
 *
 * So this file does not test that an archer is good. It tests that the three things which are
 * supposed to make it worth a slot are actually true in the numbers a player is choosing
 * between — and, because raising a range is exactly the kind of change that quietly breaks a
 * flat literal somewhere downstream, that a shot at the new distance actually arrives.
 *
 *   node tools/volley.js [game.html]
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
  p.on('pageerror', e => errs.push('PAGEERROR: ' + String(e.message).slice(0, 200)));
  await p.goto('file://' + gamePath(process.argv[2]), { waitUntil: 'load' });
  await p.waitForSelector('#btn-start', { state: 'attached', timeout: 60000 });
  await p.evaluate(() => { document.getElementById('btn-start').click(); paused = true; });
  await p.waitForTimeout(2600);

  const out = await p.evaluate(() => {
    const R = {};
    paused = true;
    const guard = (keys, fn) => {
      try { fn(); } catch (e) { for (const k of keys) if (R[k] === undefined) R[k] = '!! ' + String(e.message).slice(0, 110).toUpperCase(); }
    };
    const step = (secs, dt = 1 / 30) => { for (let i = 0; i < secs / dt; i++) update(dt); };
    const A = UNDEAD_TYPES.archer, M = UNDEAD_TYPES.mage;

    /* ---------- 1. THE THREE THINGS THAT ARE SUPPOSED TO BE TRUE ---------- */
    guard(['theArcherOutRangesEverything', 'itCostsHalfASlot', 'andItArrivesWithTheBoneKnight'], () => {
      const bow = ITEMS.w_sinew.range, bolt = SPELLS.firebolt.range;
      const longest = Math.max(...Object.values(ITEMS).filter(i => i.range).map(i => i.range));
      R._reach = `sinew bow ${bow}, firebolt ${bolt}, longest weapon in the game ${longest}`;
      R.theArcherOutRangesEverything = (bow > bolt && bow >= longest)
        ? `the bow reaches ${bow} against a firebolt's ${bolt} — the archer opens, and the mage walks into a band it already owns`
        : `!! BOW ${bow}, FIREBOLT ${bolt}, LONGEST ${longest} — the reach is not the archer's`;
      R.itCostsHalfASlot = (A.weight === 1 && M.weight > A.weight)
        ? `an archer is ${A.weight} of the binding cap against a mage's ${M.weight} — two for every one`
        : `!! ARCHER WEIGHT ${A.weight}, MAGE ${M.weight}`;
      R.andItArrivesWithTheBoneKnight = (A.tech === UNDEAD_TYPES.brute.tech)
        ? `and it unlocks at ${A.tech}, with the Bone Knight — a line to hold and something behind it is the first shape a host takes`
        : `!! ARCHER NEEDS ${A.tech}, THE BONE KNIGHT ${UNDEAD_TYPES.brute.tech}`;
    });

    /* ---------- 2. AND IT DOES NOT COST NOTHING ----------
       A unit that is cheaper, earlier and longer-ranged with no compensating weakness is the
       same bug pointing the other way. The mage must still be the harder-hitting one. */
    guard(['theMageStillHitsHarder'], () => {
      const me = player()[0];
      const mag = 6 + me.stats.magic * 0.4;
      const bolt = 10 + mag * 0.9, arrow = ITEMS.w_sinew.dmg;
      /* the bolt's armour pierce lives on the projectile `castFirebolt` builds, not on the
         SPELLS entry — asking the table for it printed "undefined pierce" */
      R._punch = `a bolt lands ${bolt.toFixed(1)} at 0.30 pierce, an arrow ${arrow} at ${ITEMS.w_sinew.ap}`;
      R.theMageStillHitsHarder = bolt > arrow * 1.5
        ? `a firebolt still lands ${(bolt / arrow).toFixed(1)}x what an arrow does — the archer buys reach and numbers, not damage`
        : `!! BOLT ${bolt.toFixed(1)} AGAINST ARROW ${arrow} — the archer has no weakness left`;
    });

    /* ---------- 3. AND THE SHOT ACTUALLY ARRIVES AT THE NEW RANGE ----------
       THE REASON THIS FILE EXISTS. `updateProjectiles` resolved a ranged windup against a FLAT
       NINE — comfortably past every weapon in the game until this one went to ten. A body winds
       up at `rangedBand`, which is 9.1 tiles for this bow, and a shot past nine was discarded
       on arrival: the archer would draw, loose, and put nothing in the air, silently, at
       exactly the distances the change was made to give it. Measured by counting what leaves
       the string against what lands. */
    guard(['aShotAtFullReachLands'], () => {
      let gx = 0, gy = 0;
      outer:
      for (let y = 90; y < H - 90; y += 7) for (let x = 90; x < W - 90; x += 7) {
        if (nearestTownDist(x, y) < 120) continue;
        let ok = true;
        for (let dy = -14; dy <= 14 && ok; dy++) for (let dx = -14; dx <= 14; dx++) if (isBlocked(x + dx, y + dy)) { ok = false; break; }
        if (ok) { gx = x; gy = y; break outer; }
      }
      for (let i = chars.length - 1; i >= 0; i--) if (dist(chars[i].x, chars[i].y, gx, gy) < 70) chars.splice(i, 1);
      /* SPREAD THE OPTIONS IN. The first version built its stat block and dropped everything
         else on the floor — so the "archer" was created with no weapon at all, punched the
         post bare-handed for twelve blood, and the probe reported that arrows go nowhere. */
      const put = (fac, x, y, o) => {
        const c = makeChar(o.name, fac, x, y, { atk: 20, def: 10, tough: 16, ath: 8, ...o });
        c.state = 'ok'; c.x = x; c.y = y; chars.push(c); return c;
      };
      const rows = [], dead = [];
      for (const gap of [5, 8, 9.4]) {
        for (let i = chars.length - 1; i >= 0; i--) if (dist(chars[i].x, chars[i].y, gx, gy) < 70) chars.splice(i, 1);
        const post = put('wild', gx + gap, gy, { name: 'Post' });
        post.blood = post.maxBlood = 9000; post.noFight = true;
        const a = put('player', gx, gy, { name: 'Archer', weapon: 'w_sinew' });
        a.stance = 'ranged'; a.blood = a.maxBlood = 4000;
        a.target = post; a.targetManual = true;
        const realFire = window.fireRanged;
        let loosed = 0;
        window.fireRanged = function (c) { if (c === a) loosed++; return realFire.apply(this, arguments); };
        const b0 = post.blood;
        const px = post.x, py = post.y;
        for (let i = 0; i < 30 / (1 / 30); i++) { post.x = px; post.y = py; post.vx = post.vy = 0; update(1 / 30); }
        window.fireRanged = realFire;
        const hit = b0 - post.blood;
        rows.push(`at ${gap}: ${loosed} loosed, ${hit.toFixed(0)} blood through it`);
        if (loosed > 0 && hit <= 0) dead.push(`${gap} tiles (${loosed} shots, nothing landed)`);
        if (loosed === 0) dead.push(`${gap} tiles (it would not shoot at all)`);
      }
      R._flight = rows.join(' | ');
      R.aShotAtFullReachLands = dead.length === 0
        ? 'and a shot loosed at the far edge of the new band actually arrives, not only the close ones'
        : `!! ARROWS GO NOWHERE AT ${dead.join(', ')}`;
    });

    /* ---------- 4. AND THE HOST CAN ACTUALLY FIELD THEM ----------
       The tier and the weight are numbers in a table until the rite will run. */
    guard(['aHostCanBindTwoForEveryMage'], () => {
      research.done = { construction: true, necromancy: true, rites_binding: true };
      const me = player()[0];
      me.stats.magic = 40; me.mana = me.maxMana = 500;
      for (const k of ['remains', 'wood', 'hide', 'copper', 'fabric', 'stone']) stash[k] = 400;
      const before = chars.filter(c => c.kin === 'archer').length;
      for (let i = 0; i < 3; i++) craftUndead('archer', me, { x: me.x + 1 + i, y: me.y + 1 }, null);
      const made = chars.filter(c => c.kin === 'archer').length - before;
      const mageBlocked = !research.done[UNDEAD_TYPES.mage.tech];
      R.aHostCanBindTwoForEveryMage = (made === 3 && mageBlocked)
        ? `three archers stand up on Rites of Binding alone, at a Skeleton Mage's tier the host cannot reach yet`
        : `!! MADE ${made} OF 3 ARCHERS, mage still gated: ${mageBlocked}`;
    });

    return R;
  });

  const bad = Object.values(out).filter(v => typeof v === 'string' && v.startsWith('!!'));
  for (const [k, v] of Object.entries(out)) console.log('  ' + k.padEnd(32) + v);
  for (const e of errs) console.log('  ' + e);
  console.log('');
  console.log(bad.length || errs.length ? `THERE IS STILL NO REASON TO BIND AN ARCHER (${bad.length + errs.length})`
                                        : 'THE ARCHER OPENS THE FIGHT, AND YOU CAN AFFORD TWO');
  await b.close();
  process.exit(bad.length || errs.length ? 1 : 0);
})();
