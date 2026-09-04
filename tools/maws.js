#!/usr/bin/env node
/* HOW OFTEN THE MAW ASKS, AND WHETHER IT STILL HEARS THE ANSWER.
 *
 * Chrome's sampling profiler over six hundred sim steps on day one put `mawQuarry` at 45-51%
 * of every step. Two things composed into that: the search walked the whole roster AGAIN for
 * every candidate (`chars.some(m => m.mawTarget === o)` inside both loops, so one search cost
 * (down + corpses) × chars and grew with the corpse count), and a searcher that found
 * nothing asked again next tick — 151 bodies carry `eatsDead` in a fresh world, one had a
 * quarry, and the other 150 re-ran the search thirty times a second. 60µs a search, 9ms of a
 * 19ms step.
 *
 * The fix is a claimed-set built once per search and a retry timer after a miss. Neither is
 * visible in play, which is exactly why this exists: a timer that never expires, or a claimed
 * set that claims too much, would ALSO make the sim faster. So the count is asserted (it is
 * a count, not a timing, and holds under suite load), and then the behaviour is asked
 * directly — a corpse put down in front of a Maw that has already missed once is still
 * taken, and two Maws still never claim the same body. The cost of one search is printed as
 * a WATCH, not asserted, because a timing under load is a coin.
 *
 *   node tools/maws.js [game.html]
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
  await p.waitForSelector('#btn-start', { state: 'attached', timeout: 60000 });
  await p.evaluate(() => { document.getElementById('btn-start').click(); paused = true; });
  await p.waitForTimeout(2600);

  const out = await p.evaluate(() => {
    const R = {};
    paused = true;
    const guard = (keys, fn) => {
      try { fn(); } catch (e) { for (const k of keys) if (R[k] === undefined) R[k] = '!! ' + String(e.message).slice(0, 120).toUpperCase(); }
    };
    const retry = typeof MAW_RETRY === 'number' ? MAW_RETRY : 0;
    const step = (n) => { for (let i = 0; i < n; i++) update(SIM_DT); };

    /* ---------- HOW OFTEN THE WORLD'S OWN MAWS ASK ----------
       The live world, three seconds of it, with `mawQuarry` counted rather than timed. On the
       build before, every searcher without a quarry asked every physics tick. */
    guard(['aMissIsNotAskedAgainNextTick', 'WATCH_oneSearchCosts'], () => {
      const searchers = chars.filter(c => c.eatsDead && c.state === 'ok').length;
      const orig = mawQuarry;
      let asks = 0, us = 0;
      mawQuarry = function () { asks++; const t0 = performance.now(); const r = orig.apply(this, arguments); us += (performance.now() - t0) * 1000; return r; };
      step(90);
      mawQuarry = orig;
      const cap = searchers * 4;   /* one ask, then at most two more inside 3s at a 1.5-2.4s retry, with headroom */
      R.aMissIsNotAskedAgainNextTick = asks <= cap
        ? `${searchers} searchers asked ${asks} times in 90 steps (cap ${cap}) — a miss waits ${retry}s before asking again`
        : `!! ${searchers} SEARCHERS ASKED ${asks} TIMES IN 90 STEPS — ${(asks / 90).toFixed(0)} A TICK, THE SEARCH IS RE-RUN EVERY TICK`;
      R.WATCH_oneSearchCosts = `${asks ? (us / asks).toFixed(0) : '?'}µs per mawQuarry over ${asks} calls, ${corpses.length} corpses and ${chars.filter(c => c.state === 'down').length} down in the world`;
    });

    /* ---------- AND A MISS IS STILL FOLLOWED BY A HIT ----------
       Somewhere with nobody in it: no town lamps, no other Maws to claim the body first, no
       enemy to make ours fight instead of eat. A coarse sweep of the map, deterministic. */
    const quiet = () => {
      for (let y = 40; y < H - 40; y += 24) for (let x = 40; x < W - 40; x += 24) {
        const px = x + 0.5, py = y + 0.5;
        if (isBlocked(px, py, 0) || isBlocked(px + 6, py, 0) || isBlocked(px + 3, py, 0)) continue;
        if (nearestTownDist(px, py) < 34) continue;
        if (charsNear(px, py, 48).length) continue;
        return { x: px, y: py };
      }
      return null;
    };
    const corpseAt = (x, y) => {
      const c = makeChar('X', 'drifter', x, y, { race: 'human', sub: 'dustborn' });
      c.state = 'dead'; c.deadAt = day; c.__probe = true; chars.push(c); corpses.push(c); return c;
    };
    const born = [];
    guard(['aCorpseInReachIsStillTaken'], () => {
      const q = quiet(); if (!q) throw new Error('no quiet ground found for the staging');
      const maw = spawnGaunt('maw', q.x, q.y); maw.__probe = true; born.push(maw);
      maw.target = null; maw.mawTarget = null; maw.hunt = null;
      rebuildCharGrid();
      step(6);                                   /* it asks, finds nothing, and starts its wait */
      const waited = maw.mawSearchT > 0;
      const body = corpseAt(q.x + 6, q.y); born.push(body);
      rebuildCharGrid();
      let steps = 0;
      const limit = Math.ceil((retry + 1.2) / SIM_DT) + 30;   /* the longest wait, and then some */
      for (; steps < limit && maw.mawTarget !== body; steps++) { update(SIM_DT); if (maw.target) maw.target = null; }
      R.aCorpseInReachIsStillTaken = maw.mawTarget === body
        ? `a Maw that had already missed ${waited ? 'and was waiting ' : ''}takes a corpse put down six tiles off after ${steps} steps (${(steps * SIM_DT).toFixed(1)}s)`
        : `!! THE MAW NEVER TOOK THE CORPSE IN ${steps} STEPS (${(steps * SIM_DT).toFixed(1)}s) — mawTarget is ${maw.mawTarget ? 'something else' : 'null'}, mawSearchT ${maw.mawSearchT}`;
      maw.state = 'gone';
    });

    /* ---------- AND ONE BODY IS STILL ONE MEAL ---------- */
    guard(['andTwoMawsDoNotClaimOneBody'], () => {
      for (const c of born) c.state = 'gone';
      const q = quiet(); if (!q) throw new Error('no quiet ground found for the second staging');
      const m1 = spawnGaunt('maw', q.x, q.y), m2 = spawnGaunt('maw', q.x + 3, q.y);
      for (const m of [m1, m2]) { m.__probe = true; m.target = null; m.mawTarget = null; m.hunt = null; m.mawSearchT = 0; born.push(m); }
      const body = corpseAt(q.x + 6, q.y); born.push(body);
      rebuildCharGrid();
      let steps = 0;
      const limit = Math.ceil((retry + 1.2) / SIM_DT) + 30;
      for (; steps < limit && !(m1.mawTarget === body || m2.mawTarget === body); steps++) { update(SIM_DT); m1.target = null; m2.target = null; }
      step(Math.ceil((retry + 0.5) / SIM_DT));   /* long enough for the other one to have asked again */
      const claims = [m1, m2].filter(m => m.mawTarget === body).length;
      R.andTwoMawsDoNotClaimOneBody = claims === 1
        ? `two Maws beside one corpse: exactly one claims it, the other keeps looking`
        : claims === 0 ? `!! NEITHER MAW TOOK THE CORPSE IN ${steps} STEPS` : `!! BOTH MAWS CLAIM THE SAME CORPSE`;
    });

    for (const c of born) c.state = 'gone';
    return R;
  });

  const bad = Object.values(out).filter(v => typeof v === 'string' && v.startsWith('!!'));
  for (const [k, v] of Object.entries(out)) console.log('  ' + k.padEnd(32) + v);
  for (const e of errs) console.log('  ' + e);
  console.log('');
  console.log(bad.length || errs.length ? `THE MAW IS ASKING THE WHOLE WORLD EVERY TICK (${bad.length + errs.length})`
                                        : 'THE MAW ASKS ONCE, WAITS, AND STILL EATS');
  await b.close();
  process.exit(bad.length || errs.length ? 1 : 0);
})();
