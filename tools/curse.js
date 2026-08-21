#!/usr/bin/env node
/* MALATHUUN'S CURSE: a sundered site stands up.
 *
 * "A world event, like the blood moon. A sundered site... stands up. (A carrion beast spawns
 *  somewhere in the world, not fully grown but not nascent either.)"
 *
 * WHAT IS MEASURED, and why each is measured this way:
 *
 *   · The trigger is driven by putting real bodies on the ground and running the real tick,
 *     not by calling the curse directly — the whole design claim is that the player's own
 *     housekeeping is the dial, and a probe that calls the function has not tested the dial.
 *     It is asserted in BOTH directions: a tidy field must NOT produce one, or "it fires" is
 *     satisfied by something that fires always.
 *   · Half-grown is asserted as a band with a ceiling as well as a floor. A one-sided test
 *     passes on a beast that arrived at full size, which is the other half of the report.
 *   · The cache is checked for CONSERVATION, not just for absence: the site must stop being
 *     lootable AND the same goods must be findable on the thing that walked off. Deleting
 *     them would pass an "is it still there" test and be a worse game.
 *
 *   node tools/curse.js [game.html]
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
  await p.evaluate(() => document.getElementById('btn-start').click());
  await p.waitForFunction(() => document.getElementById('startoverlay').style.display === 'none', null, { timeout: 60000 });

  const out = await p.evaluate(() => {
    const R = {};
    paused = true;

    R.thereAreSites = corpseSites.length >= 3
      ? `${corpseSites.length} sundered sites in the world`
      : `!! NO SUNDERED GROUND TO STAND UP (${corpseSites.length} sites)`;

    /* every site knows which chest is its own — the Curse cannot take the right goods without it */
    const linked = corpseSites.filter(s => s.cacheIdx >= 0 && chests[s.cacheIdx]).length;
    R.everySiteKnowsItsCache = linked === corpseSites.length
      ? `every one of the ${linked} knows which chest is its own`
      : `!! ${corpseSites.length - linked} SITE(S) CANNOT FIND THEIR OWN CACHE`;

    const liveCurses = () => chars.filter(c => c.cursed && c.state !== 'dead');
    const clearFodder = () => { corpses.length = 0; };
    /* lay unclaimed dead on the ground the way a fought-over field does */
    const layDead = (n, x, y) => {
      for (let i = 0; i < n; i++) {
        const d = makeChar('Fallen' + i, 'bandit', x + (i % 9) - 4, y + ((i / 9) | 0) - 4, { atk: 4, def: 4, tough: 10, ath: 4 });
        d.state = 'dead'; d.__probe = true;
        chars.push(d); corpses.push(d);
      }
    };
    const runDays = (n) => {
      paused = false;
      for (let i = 0; i < n * 40; i++) update(0.5);
      paused = true;
    };

    const site0 = corpseSites[0];

    /* ---------- 1. A TIDY FIELD SUMMONS NOTHING ----------
       The negative control, and it runs FIRST: if this fails, everything below is worthless. */
    {
      clearFodder();
      day = 40;
      const before = liveCurses().length;
      runDays(6);
      R.aTidyFieldIsSafe = liveCurses().length === before
        ? 'six days with nothing on the ground and the sites stay sites'
        : '!! A CURSE FIRED WITH NO DEAD ON THE GROUND — the dial is not the dial';
    }

    /* ---------- 2. AND A FIELD YOU LEFT DOES NOT ---------- */
    let beast = null;
    {
      clearFodder();
      day = 40;
      /* SNAPSHOT EVERY CACHE, NOT THE ONE WE EXPECT TO BE TAKEN. The first draft of this file
         recorded site[0]'s goods and then asserted the beast was carrying them — and the Curse
         quite correctly rose somewhere else, so the probe reported a destroyed cache for a
         cache that was sitting untouched in a different county. Which site answers is the
         game's choice to make; the harness's job is to find out which one it was afterwards. */
      const snap = corpseSites.map(s => ({
        s, idx: s.cacheIdx,
        wasOpen: chests[s.cacheIdx] ? chests[s.cacheIdx].opened : true,
        items: (chests[s.cacheIdx] && chests[s.cacheIdx].loot && chests[s.cacheIdx].loot.items)
          ? { ...chests[s.cacheIdx].loot.items } : null,
      }));
      layDead(90, corpseSites[0].x, corpseSites[0].y);
      /* ---------- CATCH IT AS IT STANDS UP ----------
         "Not fully grown but not nascent either" is a claim about the moment it ARRIVES, and
         the first version of this read `big` at the end of a four-day run — by which time the
         thing had eaten the ninety bodies that summoned it and stood at 7.1x, one stride off
         the ceiling. The probe was measuring the appetite, not the arrival, and it happened to
         read 3.6x the first time only because the run ended before it had finished its meal.
         Step the world and snapshot the first tick a cursed body exists.
         THE POSITION IS PART OF THAT SNAPSHOT and was left out of it, which is the same fault
         twice in one block. "It rose from sundered ground" is a claim about where it STOOD UP;
         the probe read the beast's tile after four more game days of it hunting, and duly
         reported 26 tiles from the nearest site for a thing that `malathuunsCurse` spawns ON a
         site by construction — `spawnCairnBeast(true, site, true)`, there is no other place it
         can appear. It went red on a change to how bodies walk to a fight, which moved the
         beast and touched nothing about the rite. Catch the tile with the size. */
      let bornBig = null, bornAte = null, bornX = null, bornY = null;
      paused = false;
      for (let i = 0; i < 4 * 40 && bornBig === null; i++) {
        update(0.5);
        const c0 = liveCurses()[0];
        if (c0) { bornBig = c0.big; bornAte = c0.ate || 0; bornX = c0.x; bornY = c0.y; }
      }
      for (let i = 0; i < 4 * 40; i++) update(0.5);
      paused = true;
      const now = liveCurses();
      R.theFieldsGetUp = now.length >= 1
        ? `ninety unclaimed dead and the ground answered: ${now[0].name}`
        : `!! NINETY BODIES ON THE GROUND AND NOTHING STOOD UP (${corpses.length} still lying there)`;
      beast = now[0] || null;
      if (beast) {
        /* ---------- 3. NOT NASCENT, NOT FULL ---------- */
        R.itArrivesHalfGrown = bornBig > 2.6 && bornBig < CAIRN_CAP * 0.7
          ? `it stands up at ${bornBig.toFixed(1)}x on ${bornAte} bodies — past the Sixfold, well under the ${CAIRN_CAP}x ceiling`
          : `!! IT ARRIVED AT ${bornBig === null ? 'never' : bornBig.toFixed(1) + 'x'} (ceiling ${CAIRN_CAP}) — nascent or already finished`;
        /* and it is not finished: the ceiling is still somewhere it can get to */
        R.andItGoesOnEating = beast.big > bornBig
          ? `and it goes on eating what is lying there — ${bornBig.toFixed(1)}x at the rite, ${beast.big.toFixed(1)}x four days later`
          : `!! IT NEVER GREW AFTER ARRIVING (${bornBig.toFixed(1)}x -> ${beast.big.toFixed(1)}x)`;
        R.itIsStillACairnBeast = beast.bossKey === 'cairn' && (beast.ate || 0) > 0
          ? `and it is an ordinary Cairn Beast underneath (ate ${beast.ate}), so it still grows and still sheds`
          : `!! IT IS NOT A CAIRN BEAST (bossKey ${beast.bossKey}, ate ${beast.ate})`;
        /* ---------- 4. IT ROSE FROM A SITE, NOT FROM NOWHERE ---------- */
        const nearest = corpseSites.map(s => dist(s.x, s.y, bornX, bornY)).sort((u, v) => u - v)[0];
        const wandered = corpseSites.map(s => dist(s.x, s.y, beast.x, beast.y)).sort((u, v) => u - v)[0];
        R.itRoseFromTheGround = nearest <= 20
          ? `it stood up ${nearest.toFixed(0)} tiles from sundered ground (and was ${wandered.toFixed(0)} away four days later, which is its business)`
          : `!! IT ROSE ${nearest.toFixed(0)} TILES FROM THE NEAREST SITE — that is not a site standing up`;
        /* ---------- 5. THE GOODS WALKED OFF, THEY WERE NOT DELETED ----------
           Whichever cache changed state during the run is the one that was taken. */
        const taken = snap.filter(e => !e.wasOpen && chests[e.idx] && chests[e.idx].opened);
        R.theGroundIsSpent = taken.length === 1
          ? `the ground it came out of is spent — cache ${taken[0].idx} is no longer there to loot`
          : `!! ${taken.length} CACHES CHANGED HANDS — a site that stood up should spend exactly its own`;
        const carries = taken.length === 1 && taken[0].items
          && Object.keys(taken[0].items).every(k => (beast.dropItems || {})[k] >= taken[0].items[k]);
        R.itCarriesWhatItTook = carries
          ? `and every last thing that was in it is on the thing that got up (${Object.entries(taken[0].items).map(([k, v]) => k + '×' + v).join(', ')})`
          : `!! THE CACHE WAS DESTROYED RATHER THAN CARRIED (ground held ${taken[0] ? JSON.stringify(taken[0].items) : 'nothing'}, beast drops ${JSON.stringify(beast.dropItems)})`;
      }
    }

    /* ---------- 6. IT IS A WORLD EVENT, NOT JUST A SPAWN ---------- */
    {
      const ev = events.filter(e => e.kind === 'curse');
      R.theWorldIsTold = ev.length >= 1
        ? `the world hears about it: "${ev[ev.length - 1].text.slice(0, 78)}…"`
        : '!! NOTHING WAS ANNOUNCED — it is a spawn, not an event';
      R.itHasWeight = DREAD_WEIGHT.curse > DREAD_WEIGHT.sundered && DREAD_WEIGHT.curse > DREAD_WEIGHT.bloodmoon
        ? `and it lands heavier than a blood moon or a sundering (${DREAD_WEIGHT.curse} vs ${DREAD_WEIGHT.bloodmoon}/${DREAD_WEIGHT.sundered})`
        : `!! IT CARRIES NO MORE WEIGHT THAN THE WEATHER (${DREAD_WEIGHT.curse})`;
      const rows = Object.keys(DREAD_TRAIT).filter(k => k !== 'craven');
      const opinionated = rows.filter(k => DREAD_TRAIT[k].curse !== undefined);
      R.everySeatHasAView = opinionated.length === rows.length
        ? `and every kind of seat has a view on it — the pious most of all (×${DREAD_TRAIT.pious.curse})`
        : `!! ${rows.length - opinionated.length} SEAT TYPE(S) HAVE NO OPINION: ${rows.filter(k => DREAD_TRAIT[k].curse === undefined).join(', ')}`;
      R.itIsRareEnough = typeof CURSE_GAP !== 'undefined' && CURSE_GAP >= 3 && typeof CURSE_FODDER !== 'undefined' && CURSE_FODDER > CAIRN_PER_BODY * 2
        ? `it wants ${CURSE_FODDER} bodies and ${CURSE_GAP} days between, against ${CAIRN_PER_BODY} for an ordinary one`
        : '!! IT IS NOT RARE — this is weather, not an event';
    }

    return R;
  });

  console.log("=== MALATHUUN'S CURSE ===\n");
  for (const [k, v] of Object.entries(out)) console.log('  ' + k.padEnd(26) + v);
  const bad = Object.values(out).map(String).filter(v => v.startsWith('!!'));
  console.log('\n' + (bad.length ? '*** ' + bad.join('\n*** ')
    : 'THE FIELDS YOU DID NOT CLEAR STAND UP, AND THEY TAKE THE GROUND WITH THEM'));
  if (errs.length) { console.log('errs:', errs.length); errs.slice(0, 4).forEach(e => console.log('  ' + e)); }
  await b.close();
  if (bad.length) process.exitCode = 1;
})();
