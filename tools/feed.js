#!/usr/bin/env node
/* WHOSE ATTENTION IS IT, AND WHOSE FEED IS IT.
 *
 *   "Currently, attention (or 'notice') increases at an exponential rate. Within the first few
 *    days of the game I'm already noticed and attended."
 *   "I really don't care that a random caravan guard cast Ainzopha'ar's Light halfway across
 *    the world... we need a much quieter log so that it's open for more important stuff. These
 *    kind of announcements could MAYBE be useful if they pop up within an area I can see."
 *
 * MEASURED BEFORE ANYTHING WAS WRITTEN, one game day with the player standing still and casting
 * nothing: `noticed` went 4.6 to 37.3 and the dial went UNNOTICED → ATTENDED. Every point came
 * from somebody else — 27.8 from the `deep` faction, 7.5 from townsfolk, across 143 casts and 5
 * raisings, and 0.00 from the player. The Attention is the Old Ones noticing YOU, and it was
 * counting every working by every caster in a world of seventeen hundred bodies. The three new
 * storeys added a great many casters, which is why it got worse rather than why it was wrong.
 *
 * THE RISK IN THE FIX IS OVER-SILENCING, and a feed that says nothing passes a test that only
 * counts lines. So the claims come in pairs: the stranger goes quiet AND your own work still
 * speaks; the dial ignores the world AND still moves for you.
 *
 * Anything starting '!!' fails the build.
 *
 *   node tools/feed.js [game.html]
 */
const { chromium } = require('playwright');
const path = require('path');
const gamePath = (a) => path.resolve(a ? (path.isAbsolute(a) ? a : path.join(__dirname, a)) : path.join(__dirname, 'game.html'));

(async () => {
  const b = await chromium.launch({
    executablePath: process.env.DUSTWARD_CHROME || undefined,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'],
  });
  const p = await b.newPage({ viewport: { width: 1000, height: 700 } });
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message.slice(0, 240)));
  await p.goto('file://' + gamePath(process.argv[2]), { waitUntil: 'load' });
  await p.waitForTimeout(3000);
  await p.evaluate(() => document.getElementById('btn-start').click());
  await p.waitForTimeout(3500);
  const R = {};

  /* ---- 1. A DAY OF SOMEBODY ELSE'S WORK DOES NOT RAISE YOUR ATTENTION ---- */
  const idle = await p.evaluate(() => {
    if (typeof bumpNotice !== 'function') return null;
    const by = {};
    const rBump = window.bumpNotice;
    let who = null;
    for (const n of ['spendCast', 'castRaise']) {
      if (typeof window[n] !== 'function') continue;
      const f = window[n];
      window[n] = function (c) { const prev = who; who = (c && c.faction) || '?';
        try { return f.apply(this, arguments); } finally { who = prev; } };
    }
    window.bumpNotice = function (amt) {
      if (amt > 0) { const k = who || '(world)'; by[k] = +((by[k] || 0) + amt).toFixed(2); }
      return rBump.apply(this, arguments);
    };
    const n0 = noticed, t0 = noticeTier;
    for (let i = 0, n = Math.round(24 * HOUR_SEC * 30); i < n; i++) update(1 / 30);
    window.bumpNotice = rBump;
    const fromOthers = Object.entries(by).filter(([k]) => k !== 'player')
      .reduce((s, [, v]) => s + v, 0);
    return { n0: +n0.toFixed(1), n1: +noticed.toFixed(1), t0, t1: noticeTier, by, fromOthers: +fromOthers.toFixed(2) };
  });
  R.theAttentionIsYoursAlone = !idle ? '!! NOTHING TO MEASURE — no notice dial in this build'
    : (idle.fromOthers === 0 && idle.t1 <= idle.t0)
    ? `a whole game day of the world's own casting and raising adds nothing to your Attention — 0.00 from anybody who is not yours, and the dial sat at tier ${idle.t1} (it was 4.6 → 37.3 and UNNOTICED → ATTENDED before)`
    : `!! SOMEBODY ELSE'S WORKING IS STILL CLIMBING YOUR DIAL (${JSON.stringify(idle)})`;

  /* ---- 2. AND IT STILL MOVES WHEN THE HAND IS YOURS ----
     The half that makes the claim above mean something: a dial that never moves is not a fix. */
  const mine = await p.evaluate(() => {
    const me = player().find(c => c.state === 'ok');
    if (!me || typeof spendCast !== 'function') return null;
    const key = Object.keys(SPELLS)[0];
    const before = noticed;
    me.mana = maxMana(me) + 50;
    for (let i = 0; i < 6; i++) { me.castCd = 0; spendCast(me, key); }
    return { before: +before.toFixed(2), after: +noticed.toFixed(2), key };
  });
  R.andItStillMovesWhenTheHandIsYours = !mine ? '!! NOTHING TO MEASURE — nobody of yours able to cast'
    : (mine.after > mine.before)
    ? `six workings of your own take the dial from ${mine.before} to ${mine.after} — it is still listening, it is just listening to you`
    : `!! YOUR OWN WORKING NO LONGER REGISTERS (${JSON.stringify(mine)})`;

  /* ---- 3. A STRANGER ACROSS THE MAP IS NOT NEWS, AND ONE IN FRONT OF YOU IS ----
     Both halves in one evaluate, on the SAME body, with nothing changed but where it stands. */
  const sight = await p.evaluate(() => {
    const me = player().find(c => c.state === 'ok');
    if (!me || typeof worthTelling !== 'function') return null;
    const far = chars.find(c => c.faction !== 'player' && c.state === 'ok' &&
                                dist(c.x, c.y, me.x, me.y) > 200);
    if (!far) return 'nofar';
    const lines = [];
    const rLog = window.log;
    window.log = function (t) { lines.push(String(t)); return rLog.apply(this, arguments); };
    /* across the map */
    const homeF = { x: far.x, y: far.y, f: far.floor || 0 };
    endConcentration(far, true);
    startConcentration(far, Object.keys(SPELLS)[0], 0, false, false);
    const quiet = lines.length;
    /* and now standing next to you, on your floor, in live sight */
    far.x = me.x + 1.5; far.y = me.y; far.floor = me.floor || 0;
    computeVision(); computeVision();
    endConcentration(far, true);
    startConcentration(far, Object.keys(SPELLS)[0], 0, false, false);
    const loud = lines.length;
    window.log = rLog;
    endConcentration(far, true);
    far.x = homeF.x; far.y = homeF.y; far.floor = homeF.f;
    return { quiet, loud, vis: visAt(me.x + 1.5, me.y), name: far.name };
  });
  R.aStrangerAcrossTheMapIsNotNews = !sight ? '!! NOTHING TO MEASURE — no distant body to test with'
    : sight === 'nofar' ? '!! NOTHING TO MEASURE — nobody far enough away'
    : (sight.quiet === 0 && sight.loud > 0)
    ? `the same body concentrating two hundred tiles away writes nothing and standing at your shoulder writes a line — 0 then ${sight.loud}`
    : `!! THE FEED IS EITHER STILL SHOUTING OR HAS GONE DEAF (${JSON.stringify(sight)})`;

  /* ---- 4. AND A FLOOR IS NOT A DISTANCE ----
     `visAt` is a flat grid with no notion of storeys, so the floor test has to come first or a
     priest four floors down under a lit square reads as being in plain sight. */
  const below = await p.evaluate(() => {
    if (typeof DEPTHS === 'undefined' || typeof worthTelling !== 'function') return null;
    const me = player().find(c => c.state === 'ok');
    const ghost = chars.find(c => c.faction !== 'player' && c.state === 'ok');
    if (!me || !ghost) return null;
    const home = { x: ghost.x, y: ghost.y, f: ghost.floor || 0 };
    ghost.x = me.x + 1; ghost.y = me.y; ghost.floor = me.floor || 0;
    computeVision(); computeVision();
    const sameFloor = worthTelling(ghost);
    ghost.floor = DEPTHS[2];                       /* same x/y, four storeys down */
    const deepDown = worthTelling(ghost);
    ghost.x = home.x; ghost.y = home.y; ghost.floor = home.f;
    return { sameFloor, deepDown, lit: visAt(me.x + 1, me.y) };
  });
  R.andAFloorIsNotADistance = !below ? '!! NOTHING TO MEASURE — no depths in this build'
    : (below.sameFloor === true && below.deepDown === false && below.lit === 2)
    ? `a body standing on lit ground beside you is news and the same body on the Sump directly beneath it is not — the fog is a flat grid and the storey is asked first`
    : `!! THE SIGHT TEST READS THROUGH THE FLOOR (${JSON.stringify(below)})`;

  /* ---- 5. AND NOBODY ELSE'S SURGEON SPENDS YOUR CLOTH ----
     `useBandageCharge` draws on `stash.bandage`, and the healing tick is the one healing path
     in the file, so every priest in the world was reaching into your pack — and then saying so
     in your feed when it came up empty. */
  const cloth = await p.evaluate(() => {
    if (typeof useBandageCharge !== 'function') return null;
    stash.bandage = 40; kitOpen = 8;
    const before = bandageChargesTotal();
    /* somebody else's medic, working on somebody else, for a good long while */
    const medic = chars.find(c => c.faction !== 'player' && c.state === 'ok');
    const pat = chars.find(c => c !== medic && c.faction === (medic && medic.faction) && c.state === 'ok');
    if (!medic || !pat) return null;
    for (let i = 0, n = Math.round(6 * HOUR_SEC * 30); i < n; i++) update(1 / 30);
    return { before, after: bandageChargesTotal() };
  });
  R.andNobodyElsesSurgeonSpendsYourCloth = !cloth ? '!! NOTHING TO MEASURE — no bandage kit in this build'
    : (cloth.after >= cloth.before)
    ? `six hours of the world tending its own wounded leaves your kit at ${cloth.after} of ${cloth.before} charges — they are not in your pack any more`
    : `!! STRANGERS ARE STILL SPENDING YOUR BANDAGES (${cloth.before} → ${cloth.after})`;

  await b.close();
  console.log('=== THE FEED, AND THE DIAL ===\n');
  for (const [k, v] of Object.entries(R)) console.log('  ' + k.padEnd(34) + v);
  const bad = Object.values(R).map(String).filter(v => v.startsWith('!!'));
  console.log('\n' + (bad.length ? '*** ' + bad.join('\n*** ') : 'THE DIAL IS YOURS, AND SO IS THE FEED'));
  if (errs.length) { console.log('errs:', errs.length); errs.slice(0, 4).forEach(e => console.log('  ' + e)); }
  if (bad.length) process.exitCode = 1;
})();
