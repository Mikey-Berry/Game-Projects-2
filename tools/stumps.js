#!/usr/bin/env node
/* WHAT HAPPENS TO A TREE YOU CUT DOWN.
 *
 * "Trees/rocks that get fully mined or felled do not always disappear from the map.
 *  Especially trees."
 *
 * Two different claims live inside that sentence and they want different measurements:
 *
 *   · DOES IT GO. The instanced mesh has to actually be pushed out of sight, on every node
 *     type, and stay out through the things that redraw decor — the fog standing tiles back
 *     up as you explore, a debug reveal, a reload.
 *   · AND DOES IT STAY GONE. A thing that vanishes and is standing there again three minutes
 *     later is, from the chair, a thing that did not disappear. This is the half a yes/no test
 *     cannot see, so the measurement is DAYS, not a boolean.
 *
 *   node tools/stumps.js [game.html]
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
  /* the decor instances only exist once the renderer has built its chunks */
  await p.evaluate(() => { try { render(); } catch (e) {} });

  const out = await p.evaluate(() => {
    const R = {};
    paused = true;
    const guard = (keys, fn) => {
      try { fn(); } catch (e) { for (const k of keys) if (R[k] === undefined) R[k] = '!! ' + String(e.message).slice(0, 110).toUpperCase(); }
    };

    /* ---------- LIFT THE FOG BEFORE ASKING WHETHER A TREE IS DRAWN ----------
       Decor on unexplored ground is parked at the same hidden matrix depletion uses, and at
       the start of a run that is nearly the whole map — so the first version of this reported
       "tree was already not drawn" about four perfectly healthy nodes and never tested
       anything. With the reveal on, `shouldUp` is true everywhere, and a node that is not
       drawn is not drawn because it was worked out. It also makes the two redraw passes below
       mean more: they are the passes that stand things up, and now they have every reason to. */
    debugSeeAll = true; fogMarkAll(); syncDecorFogFull();
    try { render(); } catch (e) {}

    /* find a live node of each kind, anywhere on the map */
    const findOne = (kind) => {
      for (let y = 6; y < H - 6; y += 1) for (let x = 6; x < W - 6; x += 1)
        if (rawDecorAt(x, y) === kind && window.decorByTile && decorByTile.has(x + ',' + y)) return [x, y];
      return null;
    };
    /* IS IT ON THE SCREEN. Read the instance matrix, not a flag: `hideNodeInstance` parks the
       thing at y -50 with a scale of 0.001, so the only honest question is where the matrix
       says it is. A boolean somewhere else can be right while the tree is still standing. */
    const standing = (x, y) => {
      const refs = (window.decorByTile && decorByTile.get(x + ',' + y)) || [];
      if (!refs.length) return null;
      const m = new THREE.Matrix4();
      for (const r of refs) {
        r.im.getMatrixAt(r.i, m);
        const e = m.elements;
        const sc = Math.hypot(e[0], e[1], e[2]);
        if (sc > 0.02 && e[13] > -40) return true;
      }
      return false;
    };
    const fell = (x, y) => { for (let i = 0; i < 60 && !nodeDepleted(x, y); i++) useNode(x, y, null); };

    const kinds = ['tree', 'rock', 'cvein', 'ivein'];
    const spot = {};
    guard(['everyKindIsOnTheMap'], () => {
      const missing = [];
      for (const k of kinds) { spot[k] = findOne(k); if (!spot[k]) missing.push(k); }
      R.everyKindIsOnTheMap = missing.length === 0
        ? `found a live ${kinds.join(', a ')} to work`
        : `!! NO ${missing.join('/').toUpperCase()} ON THE MAP — nothing to measure`;
    });

    /* ---------- 1. IT GOES ---------- */
    guard(['fellingItTakesItOffTheMap'], () => {
      const bad = [];
      for (const k of kinds) {
        const [x, y] = spot[k];
        if (!standing(x, y)) { bad.push(`${k} was already not drawn`); continue; }
        fell(x, y);
        if (standing(x, y)) bad.push(`${k} at ${x},${y} is still standing after ${nodeUses.get(x + ',' + y)} swings`);
      }
      R.fellingItTakesItOffTheMap = bad.length === 0
        ? 'working a tree, a boulder, a copper seam and an iron seam to nothing takes all four off the map'
        : `!! ${bad.join(' | ')}`;
    });

    /* ---------- 2. AND THE THINGS THAT REDRAW DECOR LEAVE IT DOWN ----------
       Two passes stand decor back up — the fog as you explore, and the full resync behind the
       debug reveal — and both work off a SEPARATE ledger from the one depletion writes to. */
    guard(['theFogDoesNotPlantItAgain', 'norDoesARevealOrAReload'], () => {
      const bad = [];
      syncDecorFog();
      for (const k of kinds) if (standing(...spot[k])) bad.push(`${k} after the fog pass`);
      R.theFogDoesNotPlantItAgain = bad.length === 0
        ? 'and the fog standing tiles back up as you explore does not plant them again'
        : `!! BACK ON THE MAP: ${bad.join(', ')}`;
      const bad2 = [];
      syncDecorFogFull();
      for (const k of kinds) if (standing(...spot[k])) bad2.push(`${k} after a full resync`);
      restore(JSON.parse(JSON.stringify(snapshot())));
      try { render(); } catch (e) {}
      for (const k of kinds) if (standing(...spot[k])) bad2.push(`${k} after a reload`);
      R.norDoesARevealOrAReload = bad2.length === 0
        ? 'nor a debug reveal, nor a reload'
        : `!! BACK ON THE MAP: ${bad2.join(', ')}`;
    });

    /* ---------- 3. AND IT STAYS GONE LONG ENOUGH TO COUNT ----------
       THE HALF THE YES/NO CANNOT SEE. `regrowNodes` runs once a day and takes NODE_REGROW off
       the counter, so a node whose counter merely CROSSED the cap is under it again after one
       decrement — and a day is 192 real seconds. Measured in days-until-it-is-back, and in
       what it comes back holding, because a tree that returns with one swing left in it is a
       tree that will vanish again on the next chop. */
    guard(['aFelledNodeStaysDown', 'andComesBackWorthCutting'], () => {
      const rows = [], quick = [], thin = [];
      for (const k of kinds) {
        const [x, y] = spot[k];
        fell(x, y);
        let days = 0;
        while (days < 60 && nodeDepleted(x, y)) { regrowNodes(); days++; }
        const left = NODE_CAP[k] - (nodeUses.get(x + ',' + y) || 0);
        rows.push(`${k}: down ${days} day${days === 1 ? '' : 's'}, back with ${left.toFixed(1)} of ${NODE_CAP[k]} swings`);
        if (days < 4) quick.push(`${k} ${days}`);
        if (left < NODE_CAP[k] * 0.3) thin.push(`${k} ${left.toFixed(1)}`);
      }
      R._regrow = rows.join(' | ');
      R.aFelledNodeStaysDown = quick.length === 0
        ? 'and a worked-out node stays gone for days, not for one dawn'
        : `!! BACK AFTER ${quick.join(', ')} DAY(S) — a day is 192 real seconds, so it never looked gone`;
      R.andComesBackWorthCutting = thin.length === 0
        ? 'and comes back with real yield in it rather than as a stump with one swing left'
        : `!! COMES BACK NEARLY EXHAUSTED: ${thin.join(', ')} swings left`;
    });

    return R;
  });

  const bad = Object.values(out).filter(v => typeof v === 'string' && v.startsWith('!!'));
  for (const [k, v] of Object.entries(out)) console.log('  ' + k.padEnd(30) + v);
  for (const e of errs) console.log('  ' + e);
  console.log('');
  console.log(bad.length || errs.length ? `THE STUMPS ARE STILL STANDING (${bad.length + errs.length})`
                                        : 'WHAT YOU CUT DOWN GOES, AND STAYS GONE');
  await b.close();
  process.exit(bad.length || errs.length ? 1 : 0);
})();
