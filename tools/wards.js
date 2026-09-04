#!/usr/bin/env node
/* WHO IS ASKED ABOUT THE LIGHT, AND WHETHER THE LIGHT STILL WORKS.
 *
 * Two readers ask whether a body stands inside Ainzopha'ar's Light: `wardedFrom(c)`, for a
 * gaunt deciding whether its quarry is protected, and `wardSears(c)`, for whether an undead
 * body takes more from a blow — asked of every undead in `bodyTick` and on every hit in
 * `mitigate` — and a THIRD copy sat inline in `physics`, asked for every gaunt every tick
 * whether a light was near enough to turn from. All three walked the ENTIRE roster per call
 * to find the two or three bodies (on day one, none) holding a ward. After the Maw was fixed
 * the set was the next line on Chrome's profiler: `isConcentrating` 6.1% and `wardedFrom`
 * 4.2% of an 8.2ms step with no light lit — and the first fix covered only `wardedFrom`,
 * because the profiler files a loop's cost under its callee, not under the name of the loop,
 * and the inline copy had no name at all. 113 gaunts × 1,067 bodies = 120k asks a step, which
 * is why the per-step count below is an assertion and not a watch.
 *
 * The candidates are now gathered once per step in `rebuildCharGrid`, where every body is
 * already being looked at, and `startConcentration` adds a light raised mid-step. So the
 * assertion is a COUNT (how many bodies one call asks), because a count holds under suite
 * load and a timing does not — and then every way the candidate list could go stale is asked
 * directly, because a list that is never rebuilt would also be fast: a light raised this tick
 * with no rebuild, a light let go this tick with no rebuild, a caster gone down, the other
 * side of the line, the wrong storey, out of range, and a save round trip.
 *
 *   node tools/wards.js [game.html]
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
    const home = player()[0];
    const open = (r0) => {
      for (let r = r0; r < r0 + 12; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = Math.floor(home.x) + dx + 0.5, y = Math.floor(home.y) + dy + 0.5;
        if (!isBlocked(x, y, 0) && !charsNear(x, y, 2).length) return { x, y };
      }
      return null;
    };
    const born = [];
    const mk = (f, x, y) => {
      const c = makeChar('X', f, x, y, { race: 'human', sub: 'dustborn' });
      c.state = 'ok'; c.hunger = 100; c.__probe = true; chars.push(c); born.push(c); return c;
    };
    const count = (fn) => { const orig = isConcentrating; let n = 0; isConcentrating = function () { n++; return orig.apply(this, arguments); }; try { fn(); } finally { isConcentrating = orig; } return n; };

    /* ---------- HOW MANY BODIES ONE CALL ASKS ----------
       Asked of the function directly, so the count is the algorithm and nothing else: the
       roster walk asks every body in the world; the candidate list asks the ones holding a
       light, which on day one is none. */
    guard(['oneCallAsksTheLightsNotTheWorld', 'andTheLiveWorldAsksAFewABody'], () => {
      rebuildCharGrid();
      const probe = home;
      const N = 50;
      const asked = count(() => { for (let i = 0; i < N; i++) wardedFrom(probe); });
      const dead = chars.find(c => c.undead && c.state === 'ok') || probe;
      const seared = count(() => { for (let i = 0; i < N; i++) wardSears(dead); });
      const near = typeof lightNear === 'function' ? count(() => { for (let i = 0; i < N; i++) lightNear(probe, WARD_RADIUS + 1.5); }) : 0;
      const lit = chars.filter(c => c.state === 'ok' && c.concentrating && c.concentrating.key === 'warding').length;
      const cap = N * (lit + 2);
      R.oneCallAsksTheLightsNotTheWorld = (asked <= cap && seared <= cap && near <= cap)
        ? `${N} calls each to wardedFrom, wardSears and lightNear asked ${asked}, ${seared} and ${near} bodies whether they hold a light (${lit} lit in the world, cap ${cap})`
        : `!! ${N} CALLS ASKED THE WHOLE ROSTER OF ${chars.length}: wardedFrom ${asked} (${(asked / N).toFixed(0)} a call), wardSears ${seared} (${(seared / N).toFixed(0)} a call), lightNear ${near}`;
      /* and what the live world does with it: hunters with a quarry, over one second */
      let wf = 0; const ow = wardedFrom;
      wardedFrom = function () { wf++; return ow.apply(this, arguments); };
      const t0 = performance.now();
      const n = count(() => { for (let i = 0; i < 30; i++) update(SIM_DT); });
      const ms = performance.now() - t0;
      wardedFrom = ow;
      /* `isConcentrating` has other callers — physics and ai ask it of a body about its own
         spells — so the count is every caller's; but those are a few per body, and a roster
         walk per gaunt is a thousand per gaunt. Eight a body is generous headroom. */
      const perStep = n / 30, cap2 = chars.length * 8;
      R.andTheLiveWorldAsksAFewABody = perStep <= cap2
        ? `${(wf / 30).toFixed(0)} wardedFrom calls a step in the live world and ${perStep.toFixed(0)} isConcentrating calls a step from every caller (cap ${cap2}), ${(ms / 30).toFixed(1)}ms a step with the counters on`
        : `!! ${perStep.toFixed(0)} isConcentrating CALLS A STEP IN THE LIVE WORLD (cap ${cap2}) — ${(perStep / chars.length).toFixed(0)} A BODY, SOMETHING IS STILL WALKING THE ROSTER`;
    });

    /* ---------- AND THE LIGHT STILL WORKS, EVERY WAY IT COULD STOP ----------
       A candidate list that is never rebuilt, or one that misses a light raised between
       rebuilds, would ALSO have passed the count above. */
    let caster, friend;
    guard(['aBodyInsideTheLightIsWarded'], () => {
      const s = open(4);
      caster = mk('player', s.x, s.y);
      friend = mk('player', s.x + 3, s.y);
      const foe = mk('bandit', s.x - 3, s.y);
      const far = mk('player', s.x + WARD_RADIUS + 4, s.y);
      const upstairs = mk('player', s.x, s.y + 3); upstairs.floor = 1;
      startConcentration(caster, 'warding', 1, true, true);
      rebuildCharGrid();
      const got = [wardedFrom(friend) === caster, wardedFrom(foe) === null, wardedFrom(far) === null, wardedFrom(upstairs) === null];
      R.aBodyInsideTheLightIsWarded = got.every(Boolean)
        ? `a friend three tiles from the light is warded; an enemy beside it, a friend ${WARD_RADIUS + 4} tiles off and one a storey up are not`
        : `!! THE LIGHT: friend ${got[0]}, enemy-not ${got[1]}, far-not ${got[2]}, upstairs-not ${got[3]}`;
      foe.state = 'gone'; far.state = 'gone'; upstairs.state = 'gone';
    });

    guard(['andTheSearStillBurnsTheDead'], () => {
      /* the sear asks nothing about faction — a paladin's light burns your risen and yours burns
         theirs — and nothing at all about the living */
      const s = open(7);
      const mine = mk('player', s.x + 2, s.y); mine.undead = true;
      const theirs = mk('bandit', s.x - 2, s.y); theirs.undead = true;
      const living = mk('bandit', s.x, s.y + 2);
      const farDead = mk('player', s.x + WARD_RADIUS + 4, s.y); farDead.undead = true;
      const c3 = mk('player', s.x, s.y);
      startConcentration(c3, 'warding', 1, true, true);
      rebuildCharGrid();
      const got = [wardSears(mine) === c3, wardSears(theirs) === c3, wardSears(living) === null, wardSears(farDead) === null];
      endConcentration(c3, true);
      const out = wardSears(mine);
      R.andTheSearStillBurnsTheDead = (got.every(Boolean) && out === null)
        ? 'the sear reaches your risen and theirs alike, not the living, not the dead out of range, and not once the light is let go'
        : `!! THE SEAR: own-undead ${got[0]}, their-undead ${got[1]}, living-not ${got[2]}, far-not ${got[3]}, after let-go ${out ? 'STILL SEARED' : 'gone'}`;
      for (const c of [mine, theirs, living, farDead, c3]) c.state = 'gone';
    });

    guard(['andALesserGauntStillTurnsFromIt'], () => {
      /* the inline copy in physics is what made a gaunt turn away. Drive the real loop: a gaunt
         put down beside a lit caster should be further from it a second later, not closer. */
      const s = open(11);
      const c4 = mk('player', s.x, s.y);
      startConcentration(c4, 'warding', 1, true, true);
      const g = spawnGaunt('gaunt', s.x + 4, s.y); g.__probe = true; born.push(g);
      g.target = c4; g.targetManual = true; g.hunt = null;
      rebuildCharGrid();
      const d0 = dist(g.x, g.y, c4.x, c4.y);
      for (let i = 0; i < 30; i++) { update(SIM_DT); c4.x = s.x; c4.y = s.y; }
      const d1 = dist(g.x, g.y, c4.x, c4.y);
      endConcentration(c4, true);
      R.andALesserGauntStillTurnsFromIt = (d1 > d0 + 1 && g.target !== c4)
        ? `a gaunt put down beside the light lets go of its quarry and is ${d1.toFixed(1)} tiles off a second later (from ${d0.toFixed(1)})`
        : `!! THE GAUNT DID NOT TURN: ${d0.toFixed(1)} -> ${d1.toFixed(1)} tiles, target ${g.target === c4 ? 'STILL THE CASTER' : g.target ? 'somebody else' : 'none'}`;
      c4.state = 'gone'; g.state = 'gone';
    });

    guard(['andALightRaisedThisTickIsSeenThisTick'], () => {
      /* no rebuild between the raise and the ask — this is the mid-step case */
      const s = open(9);
      const c2 = mk('player', s.x, s.y), f2 = mk('player', s.x + 2, s.y);
      rebuildCharGrid();                       /* the pass ran BEFORE the light was lit */
      const before = wardedFrom(f2);
      startConcentration(c2, 'warding', 1, true, true);
      const after = wardedFrom(f2);
      R.andALightRaisedThisTickIsSeenThisTick = (before === null && after === c2)
        ? 'a light raised after the pass, with no rebuild, wards the body beside it the same tick'
        : `!! RAISED MID-STEP: before ${before ? 'warded' : 'not'}, after ${after === c2 ? 'warded' : after ? 'by somebody else' : 'NOT WARDED'}`;
      c2.state = 'gone'; f2.state = 'gone';
    });

    guard(['andALightLetGoIsGoneAtOnce'], () => {
      rebuildCharGrid();
      const lit = wardedFrom(friend) === caster;
      endConcentration(caster, true);          /* no rebuild: the list still holds the caster */
      const letGo = wardedFrom(friend);
      startConcentration(caster, 'warding', 1, true, true);
      rebuildCharGrid();
      const relit = wardedFrom(friend) === caster;
      caster.state = 'down';                   /* still concentrating on paper; the body is on the ground */
      const downed = wardedFrom(friend);
      caster.state = 'ok';
      R.andALightLetGoIsGoneAtOnce = (lit && letGo === null && relit && downed === null)
        ? 'let go with no rebuild and the friend is unwarded at once; lit again and it holds; the caster down and it is gone again'
        : `!! STALE LIGHT: lit ${lit}, after let-go ${letGo ? 'STILL WARDED' : 'gone'}, relit ${relit}, caster down ${downed ? 'STILL WARDED' : 'gone'}`;
    });

    /* ---------- AND IT RIDES THE SAVE ----------
       `concentrating` is written and read back; the candidate list is not, and must not need
       to be — the first update() after a load rebuilds it before any hunter asks. */
    guard(['andItRidesTheSave'], () => {
      caster.name = 'Probe Warder'; friend.name = 'Probe Friend';
      rebuildCharGrid();
      restore(JSON.parse(JSON.stringify(snapshot())));
      const c = chars.find(x => x.name === 'Probe Warder' && x.faction === 'player');
      const f = chars.find(x => x.name === 'Probe Friend' && x.faction === 'player');
      if (!c || !f) throw new Error('the probe bodies did not come back from the save');
      const raw = wardedFrom(f);                 /* before any rebuild: whatever the list holds is stale objects */
      update(SIM_DT);                            /* the first step after a load rebuilds the pass */
      const kept = c.concentrating && c.concentrating.key === 'warding';
      const warded = wardedFrom(f) === c;
      R.andItRidesTheSave = (kept && warded)
        ? `after a save and a load the caster still holds the light and the friend is warded on the first step (${raw === c ? 'and even before it' : 'not before it, which is the documented limit'})`
        : `!! AFTER A LOAD: concentrating ${kept ? 'kept' : 'LOST'}, friend ${warded ? 'warded' : 'NOT WARDED'}`;
      c.__probe = true; f.__probe = true;
      endConcentration(c, true);
    });

    for (const c of chars) if (c.__probe) c.state = 'gone';
    return R;
  });

  const bad = Object.values(out).filter(v => typeof v === 'string' && v.startsWith('!!'));
  for (const [k, v] of Object.entries(out)) console.log('  ' + k.padEnd(40) + v);
  for (const e of errs) console.log('  ' + e);
  console.log('');
  console.log(bad.length || errs.length ? `THE LIGHT IS ASKED OF THE WHOLE WORLD (${bad.length + errs.length})`
                                        : 'THE LIGHT IS ASKED OF THOSE WHO HOLD IT, AND IT STILL BURNS');
  await b.close();
  process.exit(bad.length || errs.length ? 1 : 0);
})();
