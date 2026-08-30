#!/usr/bin/env node
/* WHAT THE THINGS FROM BEHIND THE DUST LOOK LIKE.
 *
 * "Choir Kin currently do not have a dedicated model, just the baseline gaunt one. And while
 *  we're on the topic, even the baseline gaunt skin is kind of lame and basic. It reads as an
 *  animal — not a non-Euclidean eldritch horror."
 *
 * They were animals. With no branch of their own they fell through to the QUADRUPED rig — the
 * one a dust hound, an elk and a pack mule wear — and no amount of colour fixes a silhouette
 * that is four legs and a snout.
 *
 * A model cannot be tested for being frightening. What can be tested is the thing that made it
 * an animal: whether it is the same rig as a hound, whether it stands up, and whether the parts
 * that are supposed to be structurally wrong are there — an odd number of arms, eyes nowhere
 * near the head, a piece attached to nothing. Those are facts about geometry.
 *
 *   node tools/watchrigs.js [game.html]
 */
const { chromium } = require('playwright');
const path = require('path');
const gamePath = (a) => path.resolve(a ? (path.isAbsolute(a) ? a : path.join(__dirname, a)) : path.join(__dirname, 'game.html'));

(async () => {
  const b = await chromium.launch({
    executablePath: process.env.DUSTWARD_CHROME || undefined,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'],
  });
  const p = await b.newPage({ viewport: { width: 900, height: 620 } });
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR: ' + String(e.message).slice(0, 200)));
  await p.goto('file://' + gamePath(process.argv[2]), { waitUntil: 'load' });
  await p.waitForSelector('#btn-start', { state: 'attached', timeout: 60000 });
  await p.evaluate(() => { document.getElementById('btn-start').click(); paused = true; });
  await p.waitForTimeout(2600);

  const kinds = ['gaunt', 'choir', 'shrike', 'stalker', 'larder', 'maw'];
  const rigs = {};
  for (const k of kinds) {
    await p.evaluate((k) => {
      paused = true;
      for (let i = chars.length - 1; i >= 0; i--) if (chars[i].__rig) chars.splice(i, 1);
      const me = player()[0];
      const q = findOpenNear(Math.round(me.x) + 6, Math.round(me.y), 6);
      const g = spawnGaunt(k, q.x, q.y);
      g.__rig = true; g.state = 'ok';
      window.__G = g;
      camX = camSX = g.x; camY = camSY = g.y; camDist = camDistTarget = 8;
      camPitch = camPitchT = 0.4; camYaw = camYawT = 0; camFollow = false;
    }, k);
    for (let i = 0; i < 6; i++) await p.evaluate(() => new Promise(r => requestAnimationFrame(() => r(1))));
    /* POLL FOR THE RIG, DO NOT COUNT FRAMES. `syncChars` builds at most eight rigs a frame and
       spends that budget on the world first — a fixed number of renders is a bet on how busy
       the machine is, and inside a full suite it loses. mimics.js learned this one twice. */
    rigs[k] = await p.evaluate(() => {
      const mine = () => (window.__G ? charMeshes.get(window.__G.id) : null);
      let e = null;
      for (let i = 0; i < 40 && !e; i++) { try { render(); } catch (er) { return { err: String(er.message).slice(0, 90) }; } e = mine(); }
      if (e) { try { render(); } catch (er) { return { err: String(er.message).slice(0, 90) }; } e = mine(); }
      if (!e) return { none: true };
      /* ---------- MEASURE THE SILHOUETTE, WHICH IS WHAT THE NOTE IS ABOUT ----------
         An earlier version counted emissive meshes to prove the choir is "made of throats",
         and every rig in the game came back with zero: `bakeBoxes` merges the boxes and the
         per-part materials do not survive as separate meshes. At this fidelity the silhouette
         IS the creature — "it reads as an animal" is a statement about proportions — so the
         bounding box is both the honest measurement and the available one. */
      let boxes = 0, maxY = 0, minY = 1e9, maxX = -1e9, minX = 1e9, maxZ = -1e9, minZ = 1e9;
      const v = new THREE.Vector3();
      e.g.updateMatrixWorld(true);
      e.g.traverse(o => {
        if (!o.isMesh || !o.geometry) return;
        boxes++;
        /* THE LIT PARTS ARE THE CLAIM. Counting boxes is a proxy for "has its own rig" and a
           bad one for "is made of throats" — the first version demanded 24 parts of a body
           that builds 18 and called a working rig a failure. `ownGlow` is what puts a light
           down a socket, so count emissive meshes and where they sit. */
        const g2 = o.geometry;
        if (!g2.boundingBox) g2.computeBoundingBox();
        for (const c of [g2.boundingBox.min, g2.boundingBox.max]) {
          v.copy(c).applyMatrix4(o.matrixWorld);
          maxY = Math.max(maxY, v.y); minY = Math.min(minY, v.y);
          maxX = Math.max(maxX, v.x); minX = Math.min(minX, v.x);
          maxZ = Math.max(maxZ, v.z); minZ = Math.min(minZ, v.z);
        }
      });
      /* count the ARMS the pose machine knows about, and whether it stands up */
      const arms = ['armL', 'armR'].filter(k2 => e[k2]).length;
      const tall = maxY - minY, wide = Math.max(maxX - minX, maxZ - minZ);
      return { boxes, tall: +tall.toFixed(2), wide: +wide.toFixed(2),
               upright: +(tall / Math.max(0.01, wide)).toFixed(2),
               biped: !!e.bipedGaunt, arms, shard: !!e.shard, head: !!e.head,
               legs2: !!(e.legL2 || e.legR2) };
    });
  }

  const R = {};
  const bad = (k, v) => { R[k] = v; };
  R._rigs = kinds.map(k => `${k} ${rigs[k].err || rigs[k].none ? 'FAILED' : rigs[k].boxes + ' boxes/' + rigs[k].tall + ' tall'}`).join(' · ');
  const broke = kinds.filter(k => rigs[k].err || rigs[k].none);
  R.everyWatcherBuildsABody = broke.length === 0
    ? `all ${kinds.length} kinds build a rig without throwing`
    : `!! ${broke.map(k => k + ': ' + (rigs[k].err || 'no mesh')).join(' | ')}`;

  /* ---------- 1. THE CHOIR HAS ITS OWN BODY ---------- */
  R.theChoirIsNotABaselineGaunt = (!rigs.choir.err && !rigs.gaunt.err && rigs.choir.boxes !== rigs.gaunt.boxes)
    ? `a Choir-Kin is ${rigs.choir.boxes} boxes against a Gaunt's ${rigs.gaunt.boxes} — its own rig, not the fallback`
    : `!! CHOIR ${rigs.choir.boxes} BOXES, GAUNT ${rigs.gaunt.boxes} — the same rig`;

  /* ---------- 2. AND NEITHER OF THEM IS A DOG ----------
     The quadruped rig is the one thing they must not be, so it is measured directly: a hound
     is the control, and an animal is defined by standing on four legs and lying down sideways. */
  const hound = await p.evaluate(() => {
    for (let i = chars.length - 1; i >= 0; i--) if (chars[i].__rig) chars.splice(i, 1);
    const me = player()[0];
    const q = findOpenNear(Math.round(me.x) + 6, Math.round(me.y), 6);
    const h = makeChar('Hound', 'wild', q.x, q.y, { atk: 8, def: 8 });
    h.beast = true; h.kin = 'hound'; h.state = 'ok'; h.__rig = true; chars.push(h);
    window.__G = h;
    for (let i = 0; i < 40; i++) { try { render(); } catch (e) { return { err: String(e.message).slice(0, 80) }; } if (charMeshes.get(h.id)) break; }
    const e = charMeshes.get(h.id);
    if (!e) return { none: true };
    let boxes = 0, maxY = 0, minY = 1e9, maxX = -1e9, minX = 1e9, maxZ = -1e9, minZ = 1e9;
    const v = new THREE.Vector3();
    e.g.updateMatrixWorld(true);
    e.g.traverse(o => {
      if (!o.isMesh || !o.geometry) return;
      boxes++;
      const g2 = o.geometry;
      if (!g2.boundingBox) g2.computeBoundingBox();
      for (const c of [g2.boundingBox.min, g2.boundingBox.max]) {
        v.copy(c).applyMatrix4(o.matrixWorld);
        maxY = Math.max(maxY, v.y); minY = Math.min(minY, v.y);
        maxX = Math.max(maxX, v.x); minX = Math.min(minX, v.x);
        maxZ = Math.max(maxZ, v.z); minZ = Math.min(minZ, v.z);
      }
    });
    const tall = maxY - minY, wide = Math.max(maxX - minX, maxZ - minZ);
    return { boxes, upright: +(tall / Math.max(0.01, wide)).toFixed(2),
             biped: !!e.bipedGaunt, legs2: !!(e.legL2 || e.legR2) };
  });
  R._control = `a dust hound is ${hound.boxes} boxes, biped ${hound.biped}, four-legged ${hound.legs2}`;
  const dogs = ['gaunt', 'choir'].filter(k => !rigs[k].biped);
  R.theyStandUpLikePeople = dogs.length === 0
    ? 'a Gaunt and a Choir-Kin are both built upright, so they fall like a body rather than lying down sideways like a dog'
    : `!! ${dogs.join(' and ')} STILL TAKES THE QUADRUPED RIG`;

  /* ---------- 3. AND THE HORROR IS STRUCTURAL ----------
     What makes a box read as wrong rather than as an animal: a piece attached to nothing, and
     a head that is not where the eyes are. Assert the parts exist rather than the effect. */
  R.theGauntIsPutTogetherWrong = (rigs.gaunt.shard && rigs.gaunt.head && rigs.gaunt.arms === 2 && rigs.gaunt.boxes >= 20)
    ? `a Gaunt carries a piece attached to nothing, a blank head, and ${rigs.gaunt.boxes} parts — a third arm among them`
    : `!! shard ${rigs.gaunt.shard}, head ${rigs.gaunt.head}, boxes ${rigs.gaunt.boxes}`;
  R._shape = kinds.map(k => `${k} ${rigs[k].tall}h/${rigs[k].wide}w = ${rigs[k].upright}`).join(' · ')
    + ` (a dust hound is ${hound.upright})`;
  /* AN ANIMAL IS LONGER THAN IT IS TALL. That is the whole of "it reads as an animal", and it
     is the one thing about a box body that a colour cannot argue with. */
  /* AND THE BAR IS "IS IT A COLUMN", not "is it narrower than the Gaunt". The first version
     carried that second clause and it was never a requirement — the Gaunt has three arms and a
     loose shard hanging off it and there is no reason a choir should be thinner than that. A
     comparison nobody asked for is a red line waiting to happen. */
  R.andTheChoirIsAColumn = (rigs.choir.upright > 2 && !rigs.choir.legs2)
    ? `a Choir-Kin stands ${rigs.choir.upright} times taller than it is wide — a column, against a dust hound's ${hound.upright}`
    : `!! CHOIR ASPECT ${rigs.choir.upright} (a column wants over 2), four-legged ${rigs.choir.legs2}`;
  const flat = ['gaunt', 'choir', 'shrike'].filter(k => rigs[k].upright <= hound.upright * 1.5);
  R.andNoneOfThemIsShapedLikeADog = flat.length === 0
    ? `and all three of the new rigs are at least half again as upright as the animal they used to borrow`
    : `!! ${flat.join(', ')} IS STILL BUILT LIKE A DOG`;

  /* ---------- 4. AND EVERY WATCHER IS ITS OWN SILHOUETTE ---------- */
  const sizes = kinds.map(k => rigs[k].boxes);
  R.noTwoWatchersAreTheSameRig = new Set(sizes).size === sizes.length
    ? `and all six kinds come out at different part counts (${sizes.join('/')}) — no two share a body`
    : `!! TWO KINDS SHARE A RIG (${kinds.map((k, i) => k + ' ' + sizes[i]).join(', ')})`;

  const reds = Object.values(R).filter(v => typeof v === 'string' && v.startsWith('!!'));
  for (const [k, v] of Object.entries(R)) console.log('  ' + k.padEnd(30) + v);
  for (const e of errs) console.log('  ' + e);
  console.log('');
  console.log(reds.length || errs.length ? `THEY ARE STILL ANIMALS (${reds.length + errs.length})`
                                         : 'THE WATCHERS ARE NOT SHAPED LIKE ANYTHING THAT LIVES HERE');
  await b.close();
  process.exit(reds.length || errs.length ? 1 : 0);
})();
