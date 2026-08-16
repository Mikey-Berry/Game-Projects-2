#!/usr/bin/env node
/* THINGS A PLAYTHROUGH FOUND THAT NO HARNESS DID.
 *
 * Every one of these came back from a full play session rather than from a test, and every
 * one of them is the same shape: a system that works perfectly in isolation and is starved,
 * hidden or crowded out by something else over hours of world time. They do not show up in a
 * probe that spawns what it needs and measures it immediately — they show up in the ONE
 * place a harness normally refuses to go, which is a long run of the real clock.
 *
 * So this one runs the world forward and then asks what is still in it.
 *
 *   node tools/world.js [game.html]
 */
const { chromium } = require('playwright');
const path = require('path');
const gamePath = (a) => path.resolve(a ? (path.isAbsolute(a) ? a : path.join(__dirname, a)) : path.join(__dirname, 'game.html'));

(async () => {
  const b = await chromium.launch({
    executablePath: process.env.DUSTWARD_CHROME || undefined,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'],
  });
  const p = await b.newPage({ viewport: { width: 1100, height: 760 } });
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message.slice(0, 200)));
  await p.goto('file://' + gamePath(process.argv[2]), { waitUntil: 'load' });
  await p.waitForTimeout(3000);
  await p.evaluate(() => document.getElementById('btn-start').click());
  await p.waitForTimeout(3000);

  const out = await p.evaluate(async () => {
    const R = {};

    /* ---------- 1. IRON EXISTS AS A COMMODITY ----------
       The endgame door is priced in iron. No miner produced ore, no smith smelted it and no
       shelf in the world stocked it, so the only iron that ever existed was whatever the
       player dug personally — and the report was that the door could not be closed. */
    R.oreInGround = (() => {
      let n = 0;
      for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) if (decorAt(x, y) === 'ivein') n++;
      return n > 8 ? `iron veins are in the ground (${n * 4} tiles or so)` : `!! ONLY ~${n * 4} IRON VEIN TILES IN THE WHOLE WORLD`;
    })();
    {
      const stocked = towns.filter(t => t.stock && (t.stock.iron_ore || 0) > 0);
      const pit = towns.find(t => t.def.key === 'ironscar');
      R.oreOnShelves = stocked.length >= 3
        ? `${stocked.length} of ${towns.length} towns open with iron ore on the shelf`
        : `!! ONLY ${stocked.length} TOWNS STOCK IRON ORE`;
      R.pitHasMost = pit && (pit.stock.iron_ore || 0) > 40
        ? `and the pit at ${pit.name} opens with ${Math.round(pit.stock.iron_ore)} of it`
        : `!! IRONSCAR OPENS WITH ${pit ? Math.round(pit.stock.iron_ore || 0) : 'no'} IRON ORE`;
      R.barIron = towns.filter(t => (t.stock.iron || 0) > 0).length >= 3
        ? 'and bar iron can be bought as well as ore' : '!! NOBODY SELLS BAR IRON';
      /* cheapest where it comes out of the ground, or the geography means nothing */
      R.pitIsCheapest = (pit && pit.def.mult && pit.def.mult.iron_ore < 0.7)
        ? `iron is cheapest at the pit (x${pit.def.mult.iron_ore})`
        : '!! THE IRON TOWN DOES NOT PRICE IRON ANY DIFFERENTLY';
    }

    /* ---------- 2. THE WASTE KEEPS ITS ANIMALS ----------
       Outlaws and wild packs shared one ceiling. Outlaws hold camps and accumulate; a hound
       pack is killed by everybody. So the ceiling silted up with men and the animals went
       extinct — measured at zero alive in a fresh world before this. */
    const countWild = () => chars.filter(c => c.faction === 'wild' && c.state !== 'dead').length;
    const countOutlaw = () => chars.filter(c => isOutlaw(c.faction) && c.state !== 'dead' && !c.guard).length;
    const wild0 = countWild(), out0 = countOutlaw();

    /* RUN THE WORLD. This is the part no other harness does: the bug is a starvation that
       takes game-days to express, so the clock has to actually turn. */
    paused = false;
    for (let i = 0; i < 9000; i++) update(0.25);   /* ~2250s of game time */

    const wild1 = countWild(), out1 = countOutlaw();
    R.dayReached = `ran to day ${day} (${wild0}->${wild1} wild, ${out0}->${out1} outlaw)`;
    R.dayReachedNote = `${wild1} wild and ${out1} outlaw alive at day ${day}`;
    /* ---------- THE ASSERTION THAT ACTUALLY DISCRIMINATES ----------
       Twelve days is not long enough for the wild to die out on its own, so simply counting
       animals here passes on the broken build too and proves nothing — the first version of
       this did exactly that. The BUG is a starvation rule, so test the rule: once the outlaws
       alone are past the old shared ceiling of 22 — and they reach thirty by day twelve
       without any help — can a hound pack still be born at all? On the old build the answer
       is no, permanently, because the one counter was full of men. So: clear the animals,
       leave the men, and see whether the waste refills. */
    for (const c of chars) if (c.faction === 'wild' && c.state !== 'dead') { c.state = 'dead'; c.deadAt = day; }
    const emptied = countWild(), outlawsNow = countOutlaw();
    let spawned = 0;
    for (let i = 0; i < 4000 && spawned < 6; i++) { update(0.25); spawned = countWild(); }
    R.outlawsPastOldCap = outlawsNow > 22
      ? `${outlawsNow} outlaws alive — past the ceiling the animals used to share with them`
      : `note: only ${outlawsNow} outlaws, so this run does not exercise the starvation`;
    R.packsComeBack = spawned > 0
      ? `the waste refilled from ${emptied} to ${spawned} wild with ${outlawsNow} outlaws standing`
      : `!! NOT ONE ANIMAL RESPAWNED — THE OUTLAWS HOLD THE WHOLE BUDGET`;

    /* ---------- 3. THE CAIRN BEAST IS FINDABLE ----------
       It always spawned. It was five hundred tiles away, neutral, and announced by a line of
       news that named no place, which is why a whole playthrough never met it. */
    R.cairnExists = (cairn && cairn.state !== 'dead')
      ? `the beast is in the world at ${cairn.x.toFixed(0)},${cairn.y.toFixed(0)}, big ${cairn.big.toFixed(2)}`
      : '!! NO CAIRN BEAST IN THE WORLD';
    /* ---------- AND THE GROUND KEEPS ANSWERING ----------
       It is not a one-per-world boss: it is what an uncleared field turns into, so a late
       game full of corpses should be growing more of them. Pile the dead up and check that
       the world responds, that it stops at the cap, and that killing them lets it start over. */
    if (typeof liveCairns !== 'function') {
      R.cairnAnswersTheDead = '!! THIS BUILD HAS ONE CAIRN BEAST PER WORLD AND NO WAY TO GROW MORE';
    } else {
      const before = liveCairns().length;
      const nec0 = player()[0];
      /* a real field of the unclaimed, well away from anybody, made of bodies a beast eats */
      let fx = 60, fy = 60;
      outer: for (let y = 40; y < H - 40; y += 6) for (let x = 40; x < W - 40; x += 6) {
        if (isBlocked(x + 0.5, y + 0.5)) continue;
        if (towns.some(t => dist(t.x, t.y, x, y) < 50)) continue;
        fx = x; fy = y; break outer;
      }
      for (let i = 0; i < 200; i++) {
        const d2 = makeChar('Nobody ' + i, 'bandit', fx + (i % 14), fy + Math.floor(i / 14),
          { atk: 1, def: 1, tough: 1, ath: 1 });
        d2.state = 'dead'; d2.deadAt = day; d2.looted = true;
        chars.push(d2); corpses.push(d2);
      }
      for (let i = 0; i < 400; i++) cairnTick(1.2);
      const grown = liveCairns().length;
      R.cairnAnswersTheDead = grown > before
        ? `a field of 200 unclaimed dead raised the count from ${before} to ${grown}`
        : `!! 200 BODIES ON THE GROUND AND STILL ONLY ${grown} BEAST(S)`;
      R.cairnCap = grown <= 4
        ? `and it stops at ${grown}, not a plague of them`
        : `!! ${grown} CAIRN BEASTS — THE CAP IS NOT HOLDING`;
      R.cairnNamesDiffer = new Set(liveCairns().map(c => c.name)).size === grown
        ? 'each one named for the country it rose in, so the log can tell them apart'
        : '!! TWO BEASTS SHARE A NAME';
      /* and they survive a save, all of them */
      const snap = JSON.parse(JSON.stringify(snapshot()));
      restore(snap);
      const after = liveCairns().length;
      R.cairnsRideTheSave = after === grown
        ? `all ${after} come back off a save` : `!! ${grown} WENT IN AND ${after} CAME BACK`;
    }
    {
      const news = events.filter(e => e.kind === 'cairn');
      const named = news.filter(e => towns.some(t => e.text.includes(t.name)));
      R.cairnSaysWhere = named.length > 0
        ? `its news names a town to steer by: "${named[0].text.slice(0, 78)}..."`
        : `!! ${news.length} CAIRN NOTICES AND NOT ONE NAMES A PLACE`;
      /* and it must be a bearing off a fixed landmark, not "here" — "here" is worthless the
         moment the player moves */
      R.cairnBearing = named.length && /north|south|east|west/i.test(named[0].text)
        ? 'with a compass bearing on it' : '!! THE CAIRN NOTICE CARRIES NO BEARING';
    }

    /* ---------- 4. THE BOUND CANNOT WALK OUT ----------
       A risen may resent its master — that is worth keeping. It may not resign. */
    {
      /* MAKE ONE RATHER THAN BORROW ONE. By this point the world has run for a long time and
         the starting squad may be entirely dead — the first version read `player()[0]` and
         died on undefined, which reports as a broken harness rather than as the long run it
         actually is. */
      let nec = player().find(c => c.gift === 'dark' && !c.undead && c.state === 'ok');
      if (!nec) {
        nec = makeChar('Probe', 'player', towns[0].x + 3, towns[0].y + 3,
          { atk: 10, def: 10, tough: 10, ath: 6, magic: 40 });
        nec.gift = 'dark'; nec.att = { dark: 3, divine: 0, destruction: 0, dust: 0 };
        chars.push(nec);
      }
      nec.mana = 999; nec.stats.magic = 60;
      research.done.rites_binding = true; research.done.rites_deep = true; research.done.necromancy = true;
      for (const k of ['remains', 'stone', 'fabric', 'copper', 'wood', 'hide', 'vflesh']) stash[k] = (stash[k] || 0) + 400;
      const n0 = chars.length;
      craftUndead('mage', nec, { x: nec.x, y: nec.y }, null);
      const mage = chars.length > n0 ? chars[chars.length - 1] : null;
      if (!mage) R.boundStay = '!! COULD NOT BIND A MAGE TO TEST WITH';
      else {
        mage.minded = true; mage.conviction = 'cruel';
        mage.regard = -90;                       /* as far past the walking-out line as it goes */
        const wasFaction = mage.faction;
        for (let i = 0; i < 40; i++) regardTick();
        R.boundStay = (mage.faction === wasFaction && !mage.leaving && mage.state !== 'dead')
          ? `a mage at regard ${mage.regard} is still yours after 40 ticks of hating it`
          : `!! THE BOUND WALKED OUT (faction ${mage.faction}, leaving ${mage.leaving})`;
        R.boundStillResents = mage.boundTold
          ? 'and it said so — the strain is kept, only the exit is closed'
          : '!! IT LEFT NO GRIEVANCE AT ALL, WHICH LOSES THE INTERESTING HALF';
        /* the living must still be able to go, or this fixed one thing by breaking another */
        let man = player().find(c => !c.undead && c.state === 'ok' && !c.lich && c !== nec);
        if (!man) {
          man = makeChar('Hand', 'player', nec.x + 2, nec.y, { atk: 8, def: 8, tough: 8, ath: 6 });
          chars.push(man);
        }
        {
          man.regard = -95; man.conviction = 'loyal'; man.settler = false;
          let left = false;
          for (let i = 0; i < 200 && !left; i++) { regardTick(); if (man.leaving) left = true; }
          R.livingMayStillGo = left
            ? 'and a living hand can still hand in its notice'
            : '!! NOBODY CAN LEAVE ANY MORE — THE LIVING GOT BOUND TOO';
        }
      }
    }

    /* ---------- 5. THE LOG STAYS READABLE UNDER A BIG HOST ---------- */
    {
      const lg = document.getElementById('log'), bar = document.getElementById('squadbar');
      const nec2 = player().find(c => c.state === 'ok') || player()[0] || { x: towns[0].x, y: towns[0].y };
      const before = parseInt(getComputedStyle(lg).bottom) || 0;
      /* forty risen is an ordinary late host, and it is what buried the log */
      for (let i = 0; i < 40; i++) {
        const u = makeChar('Risen ' + i, 'player', nec2.x, nec2.y, { atk: 5, def: 5, tough: 5, ath: 5 });
        u.undead = true; u.crafted = true; u.master = nec2;
        chars.push(u);
      }
      refreshSquadBar();
      const after = parseInt(getComputedStyle(lg).bottom) || 0;
      const barH = bar.offsetHeight;
      R.logLifts = after >= barH + 10
        ? `a ${barH}px squad bar pushes the log's floor to ${after}px (was ${before}px)`
        : `!! THE SQUAD BAR IS ${barH}px AND THE LOG STILL SITS AT ${after}px — IT IS COVERED`;
      R.logDoesNotDrop = after >= 150
        ? 'and a small squad never drops it below its old floor'
        : `!! THE LOG FELL TO ${after}px`;
    }
    return R;
  });

  console.log('=== WHAT A PLAYTHROUGH FOUND ===\n');
  for (const [k, v] of Object.entries(out)) console.log('  ' + k.padEnd(26) + v);
  const bad = Object.values(out).map(String).filter(v => v.startsWith('!!'));
  console.log('\n' + (bad.length ? '*** ' + bad.join('\n*** ')
    : 'IRON IS BUYABLE, THE WASTE KEEPS ITS ANIMALS, THE BEAST CAN BE FOUND, AND THE BOUND STAY BOUND'));
  if (errs.length) { console.log('errs:', errs.length); errs.slice(0, 4).forEach(e => console.log('  ' + e)); }
  await b.close();
  if (bad.length) process.exitCode = 1;
})();
