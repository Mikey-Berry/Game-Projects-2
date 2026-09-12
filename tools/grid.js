#!/usr/bin/env node
/* THE GRID IS FILED, NOT REBUILT — AND THE COUNTS SAY SO.
 *
 * "Still fighting performance issues on the laptop."
 *
 * `rebuildCharGrid` cleared a Map of seventeen hundred entries and refilled it on EVERY sim
 * step, which is one of three whole-world passes that scale with the speed button — at 5x the
 * world did it a hundred and fifty times a second. And almost nothing had moved: `CELL` is eight
 * tiles and a body walks about 3.4 tiles a second, so it crosses a cell line roughly once every
 * two and a half seconds. The old pass re-filed 1777 bodies to relocate about twenty-five.
 *
 * COUNTS ARE THE CLAIM AND A MILLISECOND IS COLOUR — this repo's own rule, and it is the reason
 * this file exists rather than a stopwatch. A shared container cannot separate a five per cent
 * change from its own noise, but it can count Map operations exactly, and "how many bodies were
 * re-filed this step" is not a matter of opinion.
 *
 *   1. a step re-files only the bodies that actually changed cell — a small fraction of the roster
 *   2. and the grid is still EXACTLY right afterwards: same membership as a full rebuild
 *   3. a body that stops being `ok` comes out of the grid
 *   4. a body spliced out of `chars` without anybody unfiling it is CAUGHT, not left to rot —
 *      this is the one way a filed grid can hand `charsNear` a corpse that is not there
 *   5. `restore` regrids, because it replaces the roster wholesale
 *   6. and the dead `_phSkip` flag is gone from every body
 *
 * Anything starting '!!' fails the build.
 *
 *   node tools/grid.js [game.html]
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
    const incremental = typeof gridFile === 'function' && typeof regridAll === 'function';

    /* a true picture of the grid, built from nothing, to measure the filed one against */
    const census = () => {
      const m = new Map();
      for(const [k, a] of charGrid) for(const c of a) m.set(c, (m.get(c) || 0) + 1);
      return m;
    };
    const wantCensus = () => {
      const m = new Map();
      for(const c of chars) if(c.state === 'ok') m.set(c, 1);
      return m;
    };
    const sameMembership = () => {
      const got = census(), want = wantCensus();
      if(got.size !== want.size) return `size ${got.size} vs ${want.size}`;
      for(const [c, n] of got){
        if(n !== 1) return `${c.name} filed ${n} times`;
        if(!want.has(c)) return `${c.name} is in the grid and should not be`;
      }
      /* and in the RIGHT bucket, not merely present */
      for(const [k, a] of charGrid) for(const c of a){
        const want2 = ((c.y / CELL) | 0) * GW + ((c.x / CELL) | 0);
        if(k !== want2) return `${c.name} filed in ${k}, belongs in ${want2}`;
      }
      return null;
    };

    /* ---- 1. HOW MANY BODIES MOVE BUCKET IN A STEP ----
       Counted by watching `_gk` across a real step rather than by wrapping anything: a wrapper
       in this loop is exactly the thing the whole change is about not paying for.
       THE WORLD IS RUN FIRST ON EITHER BUILD, and the reason is written here because the first
       cut got it wrong in both directions: it ran the steps only on the new build, so against
       the old one `stillExact` went red because a paused world straight off `btn-start` is
       mid-step stale — a property the old code has too — and `noDeadFlag` went GREEN because
       nothing had run yet to write the flag it was looking for. Both builds get the same forty
       steps before anything is asked. */
    paused = false;
    let worst = 0, total = 0, steps = 0;
    for(let i = 0; i < 40; i++){
      const was = new Map();
      if(incremental) for(const c of chars) was.set(c, c._gk);
      update(1 / 30);
      if(incremental){ let moved = 0; for(const c of chars) if(was.get(c) !== c._gk) moved++;
                       worst = Math.max(worst, moved); total += moved; }
      steps++;
    }
    paused = true;

    if(!incremental){
      R.onlyTheMovers = `!! THE GRID IS STILL CLEARED AND REFILLED EVERY STEP — all ${chars.length} of them`;
      rebuildCharGrid();
      R.stillExact = sameMembership() ? '!! AND IT IS NOT EVEN RIGHT' : 'the old full rebuild is at least correct';
      for(const k of ['downComesOut','aDepartureIsCaught','restoreRegrids'])
        R[k] = '!! NOTHING TO ASK — THERE IS NO FILED GRID';
      R.noDeadFlag = chars.some(c => c._phSkip !== undefined)
        ? `!! THE DEAD \`_phSkip\` FLAG IS STILL BEING WRITTEN (${chars.filter(c => c._phSkip !== undefined).length} bodies carry it)`
        : 'no dead flag';
      return R;
    }

    const avg = total / steps, n = chars.length;
    R.onlyTheMovers = avg < n * 0.2
      ? `${avg.toFixed(0)} of ${n} bodies change bucket in an average step (worst ${worst}) — the old pass re-filed all ${n}, every step, at every speed`
      : `!! THE STEP STILL TOUCHES MOST OF THE ROSTER (${avg.toFixed(0)} of ${n})`;

    /* ---- 2. AND IT IS STILL EXACT, ASKED WHERE THE INVARIANT ACTUALLY HOLDS ----
       The first cut of this claim censused the grid straight after the last `update()` returned
       and read 1665 filed against 1663 wanted — which looked like a leak in the filing and is
       not. `rebuildCharGrid` is the FIRST thing in `update`, and bodies die, get reaped and are
       born LATER in the same step, so between the end of one step and the top of the next the
       grid is stale by however many bodies left after it ran. That was equally true of the full
       rebuild this replaces — it is where the pass sits, not how it works — and it is harmless
       because every reader inside a step runs after the pass. So the invariant is asked at the
       top of a step, and the drift is asserted to HEAL rather than to never happen. */
    const drifted = sameMembership();
    rebuildCharGrid();
    const bad = sameMembership();
    R.stillExact = !bad
      ? 'and at the top of a step the filed grid holds exactly what a rebuild from nothing would'
        + (drifted ? ' — including after mid-step departures, which the next pass sweeps up' : '')
      : `!! THE FILED GRID HAS DRIFTED — ${bad}`;

    /* ---- 3. A BODY THAT GOES DOWN COMES OUT ---- */
    {
      const v = chars.find(c => c.state === 'ok' && c.faction !== 'player');
      v.state = 'down';
      rebuildCharGrid();
      const inGrid = [...charGrid.values()].some(a => a.includes(v));
      v.state = 'ok'; rebuildCharGrid();
      const back = [...charGrid.values()].some(a => a.includes(v));
      R.downComesOut = !inGrid && back
        ? 'a body that stops being `ok` is unfiled, and filed again when it gets up'
        : `!! A DOWNED BODY IS STILL IN THE GRID (down ${inGrid}, back up ${back})`;
    }

    /* ---- 4. AND A DEPARTURE IS CAUGHT ----
       The one way a filed grid goes wrong: `chars.splice` is called from twenty-odd places and
       none of them unfiles. The guard has to notice without being told. */
    {
      const v = chars.find(c => c.state === 'ok' && c.faction !== 'player' && !c.protagonist);
      const i = chars.indexOf(v);
      chars.splice(i, 1);                       /* exactly what the game does, from everywhere */
      rebuildCharGrid();
      const ghost = [...charGrid.values()].some(a => a.includes(v));
      const byId = charById.get(v.id) === v;
      R.aDepartureIsCaught = !ghost && !byId
        ? 'a body spliced out of the roster is gone from the grid on the next pass, unfiled by nobody'
        : `!! A DEPARTED BODY HAUNTS THE GRID (in a bucket ${ghost}, in charById ${byId})`;
      chars.splice(i, 0, v); rebuildCharGrid();
    }

    /* ---- 5. RESTORE REPLACES THE ROSTER, SO IT REGRIDS ---- */
    {
      const snap = snapshot();
      restore(snap);
      const bad2 = sameMembership();
      R.restoreRegrids = !bad2
        ? 'and a load regrids, so nothing asks `charsNear` about the world that was open a moment ago'
        : `!! THE GRID SURVIVES A LOAD IT SHOULD NOT — ${bad2}`;
    }

    /* ---- 6. THE DEAD FLAG ---- */
    R.noDeadFlag = !chars.some(c => c._phSkip !== undefined)
      ? 'and `_phSkip` — written three times a body a step and read by nothing, in the game or the suite — is gone'
      : `!! THE DEAD FLAG IS STILL WRITTEN (${chars.filter(c => c._phSkip !== undefined).length} bodies carry it)`;
    return R;
  });

  console.log('=== THE GRID IS FILED, NOT REBUILT ===\n');
  for (const [k, v] of Object.entries(out)) console.log('  ' + k.padEnd(20) + v);
  const bad = Object.values(out).map(String).filter(v => v.startsWith('!!'));
  console.log('\n' + (bad.length ? '*** ' + bad.join('\n*** ') : 'NOTHING IS REFILED THAT DID NOT MOVE'));
  if (errs.length) { console.log('errs:', errs.length); errs.slice(0, 4).forEach(e => console.log('  ' + e)); }
  await b.close();
  if (bad.length) process.exitCode = 1;
})();
