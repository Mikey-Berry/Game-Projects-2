#!/usr/bin/env node
/* HOW OFTEN SOMETHING COMES AT YOUR GATE.
 *
 * "There needs to be some sort of cooldown for raids/paladin patrols against my outpost. I get
 * that there is a lot against me in the world, but right now it just feels like I'm constantly
 * playing on the defense to survive and struggling to catch my breath."
 *
 * The ask is PACING, not difficulty, and the reason a cooldown on any one system does not work
 * is that four independent things dispatch at the outpost and none of them knows the others
 * exist: bandits at a flat 25% a day, a Purge patrol daily under the cap, an Inquisitor on its
 * own fortnight, and the hunt on wrath crossing nine — including from inside `kill`, so
 * beating off a patrol could summon the hunt in the same breath.
 *
 * So the thing to measure is not "does a raid happen" — it always did — but the DISTRIBUTION
 * OF GAPS between arrivals over a long run. Sixty game-days of a real outpost with a real host,
 * counting every dispatch and the days between them. Two failures, not one: too crowded (the
 * complaint) and silenced altogether (the overcorrection, which would be worse — a besieged
 * necromancer nobody besieges is not a game).
 *
 *   node tools/siege.js [game.html]
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
      for (let j = -10; j <= 10 && ok; j++) for (let i = -10; i <= 10 && ok; i++)
        if (isBlocked(x + i + 0.5, y + j + 0.5)) ok = false;
      if (ok) { gx = x; gy = y; break outer; }
    }
    R.ground = gx ? `staged on open waste at ${gx},${gy}` : '!! NO OPEN GROUND';

    /* AN OUTPOST WORTH BESIEGING. The bandit clause wants three buildings; the Purge wants
       `menaceFlag` and a host to be angry about. Both are staged rather than played into,
       because playing into them takes a hundred game-days and measures the world's patience
       rather than the pacing rule. */
    for (let i = 0; i < 4; i++) {
      const bt = BUILD_TYPES['shack'];
      pBuilds.push({ type: 'shack', x: gx + i * 3, y: gy, w: bt.w, h: bt.h, floor: 0, hp: 90, maxHp: 90, growth: 0, __probe: true });
    }
    /* ---------- AND A HOST, RAISED RATHER THAN DECLARED ----------
       The first version set `menaceFlag = true; hostSize = 20` by hand, and the day tick
       recomputes both from the actual roster on its first pass — so they were back to the
       real world's values before a single day rolled over, and the PURGE PATROL, which is
       half of what the report names, never fired once in sixty days. The measurement looked
       fine and covered two of the four systems. Raise a real host and the flags follow. */
    const host = [];
    for (let i = 0; i < 20; i++) {
      const u = makeChar('Probe Risen', 'player', gx + (i % 5) - 2, gy + 3 + Math.floor(i / 5), { atk: 6, def: 6, tough: 12 });
      u.__probe = true; u.undead = true; u.job = null; u.floor = 0;
      chars.push(u); host.push(u);
    }
    rebuildCharGrid();
    /* ---------- AND IT HAS TO STILL BE STANDING AT THE END ----------
       Sixty days is long enough for the Purge to kill the host that provoked it, and a host
       that dies halfway through stops provoking anything — so the second half of the run
       measures a quiet world and calls it good pacing. Worse, it dies at a DIFFERENT point on
       each build, so the two runs are not comparable at all.
       ONCE A DAY IS NOT OFTEN ENOUGH: a hunt can wipe twenty risen inside a single day, and
       `hostSize` is recomputed at the rollover BEFORE the top-up runs, so the menace flag
       still dropped on sixteen of sixty days. They are stood back up every step instead. That
       makes the host a fixture rather than a participant, which is exactly what is wanted —
       the question is the tempo of what gets SENT, not whether the probe can survive it. */
    const standTheHostUp = () => {
      for (const u of host) {
        if (!chars.includes(u)) chars.push(u);
        const ci = corpses.indexOf(u); if (ci >= 0) corpses.splice(ci, 1);
        u.state = 'ok'; u.blood = u.maxBlood; u.raised = false; u.target = null;
        for (const k in u.parts) { u.parts[k].hp = u.parts[k].max; u.parts[k].severed = false; }
        u.x = gx + (host.indexOf(u) % 5) - 2; u.y = gy + 3 + Math.floor(host.indexOf(u) / 5);
      }
      rebuildCharGrid();
    };
    purgeWrath = 6;                /* high enough that the Inquisitor and the hunt are both live */
    lastInquestDay = -99;

    /* ---------- COUNT EVERY DISPATCH, BY WATCHING THE SPAWNERS ----------
       Not by counting bodies: a raid that spawns and walks into a Cairn Beast leaves no
       raiders to count, and a patrol that arrives while another is standing there is
       indistinguishable by headcount. Wrap the four entry points and record the DAY. */
    const realPurge = spawnPurge, realInquest = spawnInquest;
    const at = [];
    spawnPurge = function (hunt) { at.push({ d: day, what: hunt ? 'hunt' : 'patrol' }); return realPurge.apply(this, arguments); };
    spawnInquest = function () { at.push({ d: day, what: 'inquest' }); return realInquest.apply(this, arguments); };
    /* ---------- RAIDS ARE COUNTED OFF THE NOTICE, NOT OFF THE SPAWNER ----------
       The first version wrapped `spawnHostileSquad` and counted every bandit squad in the
       world — the waste spawns bandits for its own reasons all day, and it reported eleven
       "raids" in sixty days of which almost none were aimed at the outpost. The outpost raid
       is the one that says so out loud, and the chronicle carries the day it said it on. */
    const chron0 = chronicle.length;

    const DAYS = 60;
    const d0 = day;
    /* ---------- THERE IS NO `dayTick` TO CALL ----------
       The day rollover lives inline inside `update`, so the only honest way to reach the sixty
       days is to run the world. At HOUR_SEC 8 that is 11520 sim-seconds; stepping it at half a
       game-hour a call keeps it to a few thousand iterations. A coarse step distorts MOVEMENT,
       which is not what is being measured here — every dispatch under test is decided on the
       day rollover, and the rollover does not care how it got there. */
    let guard = 0, lastDay = day, menaceDays = 0, dayCount = 0, hostSeen = 0;
    while (day - d0 < DAYS && guard++ < 20000) {
      update(4);
      standTheHostUp();
      if (day !== lastDay) { lastDay = day; dayCount++; if (menaceFlag) menaceDays++; hostSeen = Math.max(hostSeen, hostSize); }
    }
    R.ran = `ran ${day - d0} game-days in ${guard} steps`;
    spawnPurge = realPurge; spawnInquest = realInquest;
    for (const e of chronicle.slice(chron0)) {
      if (!/raiding party is moving on your outpost/i.test(e.m)) continue;
      /* repeats collapse into one entry carrying a count — expand it back out */
      for (let k = 0; k < (e.n || 1); k++) at.push({ d: e.d, what: 'raid' });
    }

    const hits = at.slice().sort((a, b2) => a.d - b2.d);
    const gaps = [];
    for (let i = 1; i < hits.length; i++) gaps.push(hits[i].d - hits[i - 1].d);
    const worst = gaps.length ? Math.min(...gaps) : 99;
    const mean = gaps.length ? gaps.reduce((a, b2) => a + b2, 0) / gaps.length : 99;
    const sameDay = gaps.filter(g => g === 0).length;

    R.host = `a host of ${hostSeen.toFixed(0)} at the gate; the Purge had something to be angry about on ${menaceDays} of ${dayCount} days`;
    R.theStagingHeld = (menaceDays >= dayCount * 0.9)
      ? 'and it had it for the whole run, so the patrol path was live throughout'
      : `!! THE STAGING DISSOLVED — MENACE HELD ONLY ${menaceDays} OF ${dayCount} DAYS`;
    R.tally = `${hits.length} dispatches in ${DAYS} game-days: ` +
      Object.entries(hits.reduce((m, h) => (m[h.what] = (m[h.what] || 0) + 1, m), {}))
        .map(([k, v]) => `${v} ${k}`).join(', ');
    R.gaps = gaps.length
      ? `gaps between them: shortest ${worst}, mean ${mean.toFixed(1)}, ${sameDay} landed on the same day as another`
      : 'nothing arrived at all';

    /* ---------- IT STILL COMES ----------
       The overcorrection is worse than the complaint. A necromancer nobody besieges is not the
       game, so this fails on silence before it fails on crowding. */
    R.theWorldStillComesForYou = hits.length >= 4
      ? `something still comes for the outpost — ${hits.length} times in ${DAYS} days`
      : `!! THE WORLD STOPPED COMING (${hits.length} dispatches in ${DAYS} DAYS)`;
    /* ---------- AND NOT ALL AT ONCE ----------
       Four days is the shortest quiet any of the four kinds owes, so nothing should ever
       arrive inside three of another. */
    R.andNotOnTopOfEachOther = worst >= 3
      ? `and never inside three days of the last one — shortest gap in ${DAYS} days was ${worst}`
      : `!! TWO PRESSURES LANDED ${worst} DAY(S) APART`;
    R.andNeverOnTheSameDay = sameDay === 0
      ? 'and never two on one day, which is the shape the report was describing'
      : `!! ${sameDay} PAIR(S) ARRIVED ON THE SAME DAY`;

    /* ---------- THE CLOCK IS SHARED, WHICH IS THE WHOLE POINT ----------
       A per-system cooldown would pass everything above for the wrong reason — each kind
       spaced from its own last, all four still able to land together. Drive it directly:
       stamp one kind, and ask whether a DIFFERENT kind is held off by it. */
    /* THE CLOCK IS THE THING UNDER TEST, so a build without it must go RED here rather than
       throwing a ReferenceError and taking the sixty days of measurement above down with it. */
    if (typeof siegeSent !== 'function' || typeof siegeClear !== 'function') {
      R.oneKindHoldsOffAnother = '!! THERE IS NO SHARED CLOCK — EACH SYSTEM DISPATCHES ON ITS OWN';
      R.andTheQuietEnds = '!! THERE IS NO SHARED CLOCK TO RUN OUT';
    } else {
      siegeQuietUntil = -99;
      siegeSent('raid');
      R.oneKindHoldsOffAnother = !siegeClear()
        ? `a raid buys ${SIEGE_QUIET.raid} days of quiet from EVERYTHING, not just from raids`
        : '!! A DISPATCH DOES NOT HOLD OFF THE OTHERS';
      const before = day;
      day = siegeQuietUntil;
      R.andTheQuietEnds = siegeClear()
        ? 'and when the quiet is up, the world is free to come again — this delays, it does not cancel'
        : '!! THE QUIET NEVER ENDS';
      day = before;
      siegeQuietUntil = -99;
    }
    /* and the hunt that used to land mid-fight now waits its turn */
    {
      const src = kill.toString();
      R.theHuntWaitsItsTurn = /purgeHuntActive\(\)\s*&&\s*siegeClear\(\)/.test(src)
        ? 'and killing a paladin no longer summons the hunt into the fight that earned it'
        : '!! THE HUNT CAN STILL SPAWN FROM INSIDE kill() WITH NO CLOCK ON IT';
    }

    for (let i = pBuilds.length - 1; i >= 0; i--) if (pBuilds[i].__probe) pBuilds.splice(i, 1);
    for (let i = chars.length - 1; i >= 0; i--) if (chars[i].__probe) chars.splice(i, 1);
    return R;
  });

  const bad = Object.values(out).filter(v => typeof v === 'string' && v.startsWith('!!'));
  for (const [k, v] of Object.entries(out)) console.log('  ' + k.padEnd(28) + v);
  for (const e of errs) console.log('  ' + e);
  console.log('');
  console.log(bad.length || errs.length
    ? `STILL NO ROOM TO BREATHE (${bad.length + errs.length})`
    : 'IT STILL COMES FOR YOU, BUT IT TAKES TURNS');
  await b.close();
  process.exit(bad.length || errs.length ? 1 : 0);
})();
