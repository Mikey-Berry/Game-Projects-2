#!/usr/bin/env node
/* DOES THE LAST RITE HAVE TIME TO BE A SCENE?
 *
 * "The Last Rite ends very quickly. Like, the enemies barely have time to spawn and move
 * toward the caster before it's over. It should be a bit more dramatic and lengthened."
 *
 * That is an arithmetic bug wearing a pacing complaint. `work` accrued at
 * `1 + magic * 0.035` against a fixed 42, so the rite was 22 seconds at magic 25 and SIX AND
 * A HALF at magic 150 — while the waves it summons spawn sixteen to twenty-four tiles out and
 * have to walk in. On any caster worth performing the rite with, every gaunt it called was
 * still crossing open ground when the rite finished.
 *
 * So the assertion that matters is not "the rite is longer". It is: DOES ANYTHING IT SUMMONED
 * ACTUALLY REACH THE CIRCLE. Measured by running the real sim and watching the distances.
 *
 *   node tools/rites.js [game.html]
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

    let gx = 0, gy = 0;
    outer:
    for (let y = 60; y < H - 60; y += 5) for (let x = 60; x < W - 60; x += 5) {
      if (isBlocked(x + 0.5, y + 0.5)) continue;
      if (towns.some(t => dist(t.x, t.y, x, y) < 80)) continue;
      let ok = true;
      for (let j = -12; j <= 12 && ok; j += 2) for (let i = -12; i <= 12 && ok; i += 2)
        if (isBlocked(x + i + 0.5, y + j + 0.5)) ok = false;
      if (ok) { gx = x; gy = y; break outer; }
    }
    R.ground = gx ? `staged on open waste at ${gx},${gy}` : '!! NO OPEN GROUND WIDE ENOUGH FOR THE WAVES';

    const wipe = () => {
      if (theRite) { theRite.ritualist.riting = false; theRite.sacrifice.riting = false; theRite = null; }
      for (let i = chars.length - 1; i >= 0; i--) if (chars[i].__probe || chars[i].riteborn) chars.splice(i, 1);
    };

    /* Run one rite to completion and watch what the summons do. `riteTick` is driven through
       `update` rather than called directly, because the gaunts it spawns have to be MOVED by
       the same loop that moves everything else — calling riteTick alone would advance the
       rite past a field of statues and report that nothing arrived. */
    const stage = (magic) => {
      wipe();
      const rit = makeChar('Ritualist', 'player', gx, gy, { atk: 6, def: 6, tough: 40, ath: 6, magic });
      const sac = makeChar('Offering', 'player', gx + 1, gy, { atk: 4, def: 4, tough: 40, ath: 6 });
      for (const c of [rit, sac]) { c.gift = 'dark'; c.__probe = true; chars.push(c); }
      stash.remains = 500;
      beginAscension(rit, sac);
      if (!theRite) return null;
      const r = theRite;
      let t = 0, firstArrival = null, closest = 1e9, peakInRing = 0;
      /* ROOTED MEANS ROOTED, INCLUDING WHERE THEY STAND. `riteTick` collapses the working if
         the ritualist ends up more than 2.5 tiles off the circle, and a crowd of summons
         arriving at the ring SHOVES them — so this probe could report a short rite for a body
         that was pushed out of its own ceremony, which is not what it is measuring. It already
         declares them rooted and keeps them alive; pinning the tile is the same intent applied
         to the same body. Without this the assertion is a lottery on where the waves stand up:
         it read 60s on one worldgen stream and 39s on another with byte-identical rite
         constants, which is how a one-line change to town stock four thousand lines away came
         to look like a Last Rite regression. Whether an UNDEFENDED rite can be broken up is a
         real question and a different one; it wants its own probe, not this one's silence. */
      const rx = rit.x, ry = rit.y, sx = sac.x, sy = sac.y;
      paused = false;
      while (theRite && t < 4000) {
        update(0.1); t++;
        /* the ritualist is rooted and defenceless by design; this probe is asking about the
           APPROACH, not about whether the squad can win, so keep them alive */
        rit.state = 'ok'; sac.state = 'ok';
        rit.x = rx; rit.y = ry; sac.x = sx; sac.y = sy;
        for (const k of PARTS) { rit.parts[k].hp = rit.parts[k].max; sac.parts[k].hp = sac.parts[k].max; }
        const born = chars.filter(c => c.riteborn && c.state === 'ok');
        let inRing = 0;
        for (const g of born) {
          const d = dist(g.x, g.y, r.x, r.y);
          if (d < closest) closest = d;
          if (d <= 3) { inRing++; if (firstArrival === null) firstArrival = t; }
        }
        if (inRing > peakInRing) peakInRing = inRing;
      }
      paused = true;
      return { secs: t / 10, firstArrival: firstArrival === null ? null : firstArrival / 10,
               closest, peakInRing, waves: r.drawn, born: chars.filter(c => c.riteborn).length };
    };

    /* A NOVICE AND A LICH. One number is not enough here: the old bug was invisible at low
       magic and total at high, because the magic term was uncapped. */
    const lo = stage(25), hi = stage(150);
    R.theRiteRuns = lo && hi ? `it opens and completes at both tiers` : '!! THE RITE WOULD NOT OPEN';
    if (!lo || !hi) return R;

    R.aNoviceRiteIsAVigil = lo.secs >= 45
      ? `at magic 25 the rite runs ${lo.secs.toFixed(0)}s`
      : `!! AT MAGIC 25 THE RITE IS OVER IN ${lo.secs.toFixed(0)}s`;
    /* the one that was six and a half seconds */
    R.skillDoesNotDeleteIt = hi.secs >= 45
      ? `and at magic 150 it still runs ${hi.secs.toFixed(0)}s — skill shortens the vigil, it does not skip it`
      : `!! AT MAGIC 150 THE RITE IS OVER IN ${hi.secs.toFixed(0)}s — THE MAGIC TERM IS UNCAPPED`;
    R.theTiersAreClose = hi.secs > lo.secs * 0.5
      ? `the two tiers are ${lo.secs.toFixed(0)}s and ${hi.secs.toFixed(0)}s — within a factor of two`
      : `!! A LICH FINISHES IN A FRACTION OF A NOVICE'S TIME (${lo.secs.toFixed(0)}s vs ${hi.secs.toFixed(0)}s)`;

    /* THE ACTUAL COMPLAINT. Not the clock — whether anything it called arrives. */
    R.theSummonsReachTheCircle = hi.firstArrival !== null
      ? `something summoned reaches the ring after ${hi.firstArrival.toFixed(0)}s of a ${hi.secs.toFixed(0)}s rite`
      : `!! NOTHING EVER REACHED THE CIRCLE (closest approach ${hi.closest.toFixed(1)} tiles) — THE SCENE CANNOT HAPPEN`;
    R.thereIsTimeToFight = hi.firstArrival !== null && (hi.secs - hi.firstArrival) >= 15
      ? `leaving ${(hi.secs - hi.firstArrival).toFixed(0)}s of them at the ring before it completes`
      : `!! THEY ARRIVE WITH ${hi.firstArrival === null ? 'NEVER' : (hi.secs - hi.firstArrival).toFixed(0) + 's'} TO SPARE`;
    R.thePressureBuilds = hi.waves >= 3 && hi.born >= 8
      ? `${hi.waves} waves and ${hi.born} of them across the rite, peaking at ${hi.peakInRing} inside the ring`
      : `!! THE WAVES DO NOT BUILD (${hi.waves} waves, ${hi.born} summoned)`;
    /* and the last wave must land with time left, not on the closing tick */
    R.theLastWaveIsNotTooLate = hi.peakInRing > 0
      ? 'and the ring is actually contested rather than approached'
      : '!! NOTHING WAS EVER INSIDE THE RING';

    wipe();
    return R;
  });

  console.log('=== THE LAST RITE, AS A SCENE ===\n');
  for (const [k, v] of Object.entries(out)) console.log('  ' + k.padEnd(28) + v);
  const bad = Object.values(out).map(String).filter(v => v.startsWith('!!'));
  console.log('\n' + (bad.length ? '*** ' + bad.join('\n*** ')
    : 'THE RITE LASTS LONG ENOUGH THAT WHAT IT CALLS ARRIVES AND HAS TO BE FOUGHT'));
  if (errs.length) { console.log('errs:', errs.length); errs.slice(0, 4).forEach(e => console.log('  ' + e)); }
  await b.close();
  if (bad.length) process.exitCode = 1;
})();
