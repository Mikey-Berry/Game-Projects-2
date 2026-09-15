#!/usr/bin/env node
/* A STOREY NOBODY IS ON DOES NOT TICK AT ALL.
 *
 * "I wonder if we could completely freeze the lower levels until a squad member actually
 *  explores them? I get that they are actively simulated at all times right now for fighting etc
 *  but it seems pointless since the underground won't ever really contribute to the world's
 *  economy and exists purely as a combat and exploration layer."
 *
 * Measured before it was built, because the `_cold` tier already throttled the depths and the
 * question was whether throttling had left anything worth taking:
 *     1145 of 1777 bodies are below ground (64%) — floors -1/-2/-3 hold 671/331/143
 *     41% of physics calls and 30% of ai calls were going below ground
 *     a step cost 8.66ms; the same step with the depths lifted clean out cost 2.50ms
 * Seventy-one per cent. The cold tier cut how often those bodies THINK and left everything else:
 * still visited every step, still separated, still moved at 3-15Hz, two of them for every one on
 * the surface.
 *
 *   1. nothing below ground thinks or moves while nobody of yours is down there — counted at
 *      `ai` and `physics`, which is where the claim actually lives
 *   2. and the frozen are not in the grid either, so `separate` and `charsNear` never see them
 *   3. THE SURFACE IS UNTOUCHED. This is the half that makes the change safe rather than cheap:
 *      the world's economy is up here and none of it may freeze
 *   4. your own garrison keeps its clock on a storey you left — a garrison is for holding ground
 *   5. walking down THAWS it, in one step, with no accumulated debt dumped into the first tick
 *   6. and a frozen warren does not quietly die of old age while nobody is looking — which is
 *      [109] arrived at from a different direction, and the one way this change could empty the
 *      depths without anybody seeing it happen
 *
 * Anything starting '!!' fails the build.
 *
 *   node tools/frozen.js [game.html]
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
  await p.evaluate(() => { document.getElementById('btn-start').click(); paused = true; });
  await p.waitForTimeout(3000);

  const out = await p.evaluate(() => {
    const R = {};
    const hasFreeze = typeof bodyFrozen === 'function' && typeof warmFloors !== 'undefined';

    /* count where the work goes, by floor, over a run of real steps. The wrapper is the only
       honest way to ask "did this body think", and it is removed before anything is timed —
       nothing here is a millisecond claim. */
    const tally = (steps) => {
      const rAi = ai, rPh = physics;
      const a = {}, h = {};
      ai = function(c){ const f = c.floor || 0; a[f] = (a[f] || 0) + 1; return rAi.apply(this, arguments); };
      physics = function(c){ const f = c.floor || 0; h[f] = (h[f] || 0) + 1; return rPh.apply(this, arguments); };
      paused = false;
      for(let i = 0; i < steps; i++) update(1 / 30);
      paused = true;
      ai = rAi; physics = rPh;
      const below = o => Object.keys(o).filter(f => +f < 0).reduce((s, f) => s + o[f], 0);
      const above = o => Object.keys(o).filter(f => +f >= 0).reduce((s, f) => s + o[f], 0);
      return {aiDn: below(a), aiUp: above(a), phDn: below(h), phUp: above(h)};
    };

    const census = {};
    for(const c of chars){ const f = c.floor || 0; census[f] = (census[f] || 0) + 1; }
    const belowN = chars.filter(c => (c.floor || 0) < 0).length;

    /* ---- 1. NOTHING DOWN THERE THINKS ---- */
    const t = tally(90);
    R.theDepthsAreStill = t.aiDn === 0 && t.phDn === 0
      ? `${belowN} of ${chars.length} bodies are below ground and not one of them thought or moved in 90 steps (${t.aiUp} ai and ${t.phUp} physics calls, all of them on the surface)`
      : `!! THE DEPTHS ARE STILL BEING SIMULATED (${t.aiDn} ai and ${t.phDn} physics calls below ground)`;

    /* ---- 3. AND THE SURFACE IS UNTOUCHED ----
       Asked second because it is the claim that stops this being a cheap win: the towns, the
       caravans, the wars and the seats are all up here and none of it may stop. */
    R.theSurfaceStillRuns = t.aiUp > 100 && t.phUp > 100
      ? `and the surface is untouched — ${t.aiUp} ai and ${t.phUp} physics calls on floors 0 and up, which is where the economy is`
      : `!! THE SURFACE HAS BEEN FROZEN TOO (${t.aiUp} ai, ${t.phUp} physics)`;

    if(!hasFreeze){
      for(const k of ['notInTheGrid','yourGarrisonKeepsItsClock','walkingDownThaws','noDebtOnThaw','noQuietDeaths'])
        R[k] = '!! THERE IS NO FREEZE IN THIS BUILD';
      return R;
    }

    /* ---- 2. AND THEY ARE NOT IN THE GRID ---- */
    {
      let filed = 0;
      for(const [, a] of charGrid) for(const c of a) if(bodyFrozen(c)) filed++;
      R.notInTheGrid = filed === 0
        ? 'and none of them is in the grid, so `separate` and every `charsNear` the surface asks never walk past them either'
        : `!! ${filed} FROZEN BODIES ARE STILL FILED IN THE GRID`;
    }

    /* ---- 4. YOUR OWN PEOPLE ARE NOT FROZEN ---- */
    {
      const me = player().find(c => c.state === 'ok');
      const back = {x: me.x, y: me.y, f: me.floor || 0};
      /* put one of yours on a storey and leave nobody else there */
      const deep = chars.find(c => (c.floor || 0) === -2 && c.faction !== 'player');
      const g = player().filter(c => c.state === 'ok')[1] || me;
      const gb = {x: g.x, y: g.y, f: g.floor || 0};
      g.floor = -3; g.x = deep ? deep.x : g.x; g.y = deep ? deep.y : g.y;
      rebuildCharGrid();
      R.yourGarrisonKeepsItsClock = !bodyFrozen(g)
        ? 'one of yours left on a storey is never frozen — a garrison is for holding ground, and there are a handful of them against eleven hundred others'
        : '!! YOUR OWN GARRISON FREEZES WITH THE ROCK';
      g.floor = gb.f; g.x = gb.x; g.y = gb.y;
      me.x = back.x; me.y = back.y; me.floor = back.f;
      rebuildCharGrid();
    }

    /* ---- 5 & 6. WALKING DOWN THAWS IT, AND NO DEBT ARRIVES WITH YOU ---- */
    {
      const F = -2;
      const crowd = chars.filter(c => (c.floor || 0) === F && c.state === 'ok' && c.faction !== 'player');
      const me = player().find(c => c.state === 'ok');
      const back = {x: me.x, y: me.y, f: me.floor || 0};
      /* the accumulators must not have grown through the freeze, or the first warm tick hands
         `ai` however long the storey sat there */
      const debt = crowd.reduce((m, c) => Math.max(m, c._aiAcc || 0, c._phAcc || 0), 0);
      me.floor = F; me.x = crowd[0].x; me.y = crowd[0].y;
      const t2 = tally(20);
      R.walkingDownThaws = t2.aiDn > 0 && t2.phDn > 0
        ? `and standing one of yours on floor ${F} wakes it: ${t2.aiDn} ai and ${t2.phDn} physics calls down there in twenty steps`
        : `!! THE STOREY STAYS FROZEN WITH SOMEBODY STANDING ON IT (${t2.aiDn} ai, ${t2.phDn} physics)`;
      R.noDebtOnThaw = debt < 1
        ? `and it carries no debt down with it — the largest accumulator on the storey was ${debt.toFixed(2)}s, because a frozen body is skipped BEFORE its clock is touched`
        : `!! A THAWED STOREY DUMPS ${debt.toFixed(1)}s OF SAVED-UP TIME INTO ITS FIRST TICK`;
      me.floor = back.f; me.x = back.x; me.y = back.y;
      rebuildCharGrid();
    }

    /* ---- 6. AND NOBODY DIES OF OLD AGE DOWN THERE WHILE NOBODY IS LOOKING ---- */
    {
      const F = -1;
      const living = chars.filter(c => (c.floor || 0) === F && c.state === 'ok' && !c.undead && !c.beast);
      if(!living.length){ R.noQuietDeaths = 'no living bodies on floor -1 to age'; }
      else {
        for(const c of living) c.age = 200;            /* far past any deathAge in the game */
        const was = living.length;
        const d0 = day;
        paused = false;
        for(let i = 0; i < 60 && day < d0 + 3; i++){ hour = 23.98; update(0.25); }
        paused = true;
        const left = living.filter(c => c.state !== 'dead' && chars.includes(c)).length;
        R.noQuietDeaths = left === was
          ? `and three nights pass with ${was} two-hundred-year-old bodies on a frozen storey and not one of them dies of it — the depths do not empty themselves off-screen`
          : `!! A FROZEN WARREN AGED ITSELF TO DEATH (${was} -> ${left} over three nights)`;
      }
    }
    return R;
  });

  console.log('=== A STOREY NOBODY IS ON ===\n');
  for (const [k, v] of Object.entries(out)) console.log('  ' + k.padEnd(24) + v);
  const bad = Object.values(out).map(String).filter(v => v.startsWith('!!'));
  console.log('\n' + (bad.length ? '*** ' + bad.join('\n*** ') : 'THE ROCK KEEPS ITS OWN COUNSEL'));
  if (errs.length) { console.log('errs:', errs.length); errs.slice(0, 4).forEach(e => console.log('  ' + e)); }
  await b.close();
  if (bad.length) process.exitCode = 1;
})();
