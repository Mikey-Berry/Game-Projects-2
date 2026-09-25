#!/usr/bin/env node
/* WHAT IS LEFT OF A TOWN THAT ENDED.
 *
 * "Let's add some visuals for sacks and plagues." — and, when asked which: "Two flavors of
 * sack would be best, as you described."
 *
 * A town has been able to end two different ways since long before either of them had anything
 * to look at. `t.sacked = 5` is a host through the breach and the stores put to the torch.
 * `fallToTheDark` is order reaching zero — "whatever came over its wall is still in there" —
 * and it sets 9. An audit of the seams found both of them worth exactly ZERO PIXELS: a sacked
 * town and the town next to it were the same picture, against a nightfall control that moved
 * 410,806 of 416,000.
 *
 * Three things make this harness harder than it looks, all of them written into it below:
 * `box()` batches into an InstancedMesh, so nothing about a ruin can be found by walking the
 * scene graph by position; the roofs are RETAINED meshes that no dyn group owns, so the test
 * that matters is whether a town comes back WHOLE; and the fire has to be thrown off `vrnd`,
 * because a flame on `rnd` would walk the world's seed for as long as the town burned.
 *
 *   node tools/scars.js [game.html]
 */
const { chromium } = require('playwright');
const path = require('path');
const gamePath = (a) => path.resolve(a ? (path.isAbsolute(a) ? a : path.join(__dirname, a)) : path.join(__dirname, 'game.html'));

(async () => {
  const b = await chromium.launch({ executablePath: process.env.DUSTWARD_CHROME || undefined,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 900, height: 600 } });
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message.slice(0, 200)));
  await p.goto('file://' + gamePath(process.argv[2]), { waitUntil: 'load', timeout: 90000 });
  await p.waitForFunction(() => !!document.getElementById('btn-start'), null, { timeout: 60000 });
  await p.evaluate(() => { document.getElementById('btn-start').click(); paused = true; });
  await p.waitForFunction(() => typeof chars !== 'undefined' && chars.length > 0, null, { timeout: 60000 });
  await p.waitForTimeout(2500);

  const R = await p.evaluate(() => {
    const O = {};
    const guard = (keys, fn) => {
      try { fn(); } catch (e) { for (const k of keys) if (O[k] === undefined) O[k] = '!! ' + String(e.message).slice(0, 150).toUpperCase(); }
    };
    /* the biggest walled town, stood over at a height where a roof is a roof */
    const t = towns.filter(q => q.def.wall).sort((a, b2) =>
      buildings.filter(x => x.town === b2).length - buildings.filter(x => x.town === a).length)[0];
    const mine = buildings.filter(x => x.town === t && !x.citadel && x._roof);
    camX = camSX = t.x; camY = camSY = t.y; camDist = camDistTarget = 30;
    camFollow = false; activeFloor = 0;
    /* ---------- THE CAMERA IS PLACED IN THE RENDER LOOP, NOT BY `camX` ----------
       `camX`/`camY` are TARGETS that the frame loop eases `camSX`/`camSY` towards, and the
       actual `camera.position.set(...)` happens inside the render function this harness does
       not call. Setting the targets and then calling `renderer.render` directly leaves the
       camera wherever the game put it last — out at the player's start, nowhere near this
       town. The first cut did exactly that and reported that a torched town, a town that fell
       to the dark and a whole one were all the same picture, to the pixel, at 0 of 15000: it
       was photographing empty waste three hundred tiles away, three times. */
    camPitch = camPitchT = 0.82; camYaw = camYawT = 0.6;
    const look = () => {
      const focusY = Math.max(0, groundY(t.x, t.y)) + 0.8;
      const horiz = Math.cos(camPitch) * camDist;
      camera.position.set(t.x + Math.sin(camYaw) * horiz, focusY + Math.sin(camPitch) * camDist, t.y + Math.cos(camYaw) * horiz);
      camera.lookAt(t.x, focusY, t.y);
      camera.updateMatrixWorld();
    };

    /* ---------- ONE FRAME, NOTHING STEPPED ----------
       Every reading below is: set the state, run the same sync pass the render loop runs, draw
       one frame, read it. Nothing about the world moves between two frames that are compared,
       which is the trap `lamplight.js` fell into and documented — a sim allowed to run between
       an A and a B reported a 32-point gain on a build that had no town fires in it. */
    const STRIDE = 6;
    /* ---------- THE CONTROL MUST STILL RENDER ----------
       A harness that throws on the build before the change cannot be A/B'd: every claim comes
       back "!! SYNCTOWNSCAR IS NOT DEFINED", which says the function is new and nothing at all
       about whether a ruin was visible. Called through a check, the old build draws its
       unchanged picture and the pixel claims report the real pre-change number, which is the
       zero the seam audit found. */
    const scar = () => { if (typeof syncTownScar === 'function') syncTownScar(); };
    const frame = () => {
      look();
      syncTownWalls(); scar(); syncRoofs(); syncTorchLights();
      renderer.render(scene, camera);
      const src = renderer.domElement;
      const cvs = document.createElement('canvas');
      cvs.width = src.width; cvs.height = src.height;
      const cx = cvs.getContext('2d');
      cx.drawImage(src, 0, 0);
      const im = cx.getImageData(0, 0, cvs.width, cvs.height).data;
      const out = [];
      for (let y = 0; y < cvs.height; y += STRIDE) for (let x = 0; x < cvs.width; x += STRIDE) {
        const i = (y * cvs.width + x) * 4;
        out.push(im[i], im[i + 1], im[i + 2]);
      }
      return out;
    };
    /* how many sampled pixels moved, and by how much on average where they did */
    const diff = (a, b2) => {
      let n = 0, sum = 0;
      for (let i = 0; i < a.length; i += 3) {
        const d = Math.abs(a[i] - b2[i]) + Math.abs(a[i + 1] - b2[i + 1]) + Math.abs(a[i + 2] - b2[i + 2]);
        if (d > 18) { n++; sum += d; }
      }
      return { n, of: a.length / 3, mean: n ? +(sum / n).toFixed(1) : 0 };
    };
    const setKind = (k) => { t.sacked = k ? (k === 'dark' ? 9 : 5) : 0; t.sackKind = k; };

    /* ---------- THE PREMISE ---------- */
    guard(['_premise', 'aTownCanEndTwoWays'], () => {
      setKind(null);
      const before = t.sacked;
      fallToTheDark(t);
      const dark = t.sackKind;
      setKind(null);
      O._premise = `${t.name}, ${mine.length} roofed buildings; fallToTheDark set sacked=9 kind="${dark}", the war sack sets 5 kind="torch"`;
      O.aTownCanEndTwoWays = (before === 0 && dark === 'dark')
        ? `a town can end two ways and the two are told apart by kind, not by a counter that ticks through both`
        : `!! THE TWO ENDINGS ARE NOT DISTINGUISHABLE (fallToTheDark left kind ${JSON.stringify(dark)})`;
    });

    /* ---------- 1. A RUIN IS A DIFFERENT PICTURE ---------- */
    guard(['_pixels', 'aBurntTownIsADifferentPicture', 'andSoIsOneThatFellToTheDark', 'andTheTwoAreNotTheSamePicture'], () => {
      /* THE BARS ARE SET OFF THE MEASUREMENT, WITH ROOM. Nothing in the scar is rolled — the
         fallen roofs are picked by `hash2`, the camera is fixed and the hour is fixed — so
         these numbers are the same on every run of a given build: 5115, 6155 and 6142 sampled
         pixels of 15000 when this was written. A third of the smallest of them is the bar, so
         a change to the town's palette or the camera cannot turn the claim red on its own,
         and losing any one of the three beats (roofs, ground, doorways) still would. */
      hour = 12; updateSky();
      setKind(null); const whole = frame();
      setKind('torch'); const burnt = frame();
      setKind('dark'); const fallen = frame();
      setKind(null);
      const dB = diff(whole, burnt), dD = diff(whole, fallen), dBD = diff(burnt, fallen);
      O._pixels = `of ${dB.of} sampled pixels at noon: burnt moved ${dB.n} (mean ${dB.mean}), fallen moved ${dD.n} (mean ${dD.mean}), and burnt vs fallen ${dBD.n}`;
      O.aBurntTownIsADifferentPicture = dB.n > 1500
        ? `a torched town is ${dB.n} pixels different from the town that was standing there`
        : `!! A SACKED TOWN LOOKS LIKE A WHOLE ONE (${dB.n} of ${dB.of} pixels moved)`;
      O.andSoIsOneThatFellToTheDark = dD.n > 1500
        ? `and a town that fell to the dark is ${dD.n} pixels different from it too`
        : `!! A TOWN THAT FELL TO THE DARK LOOKS LIKE A WHOLE ONE (${dD.n} of ${dD.of} pixels moved)`;
      O.andTheTwoAreNotTheSamePicture = dBD.n > 1500
        ? `and the two endings are ${dBD.n} pixels apart from each other — which is the whole point of having two`
        : `!! THE TWO FLAVOURS OF SACK ARE THE SAME PICTURE (${dBD.n} of ${dBD.of} pixels apart)`;
    });

    /* ---------- 2. AND THEY DIFFER IN WHAT THEY TAKE AWAY ----------
       A pixel count says something changed, not that the right thing changed. Fire takes the
       roofs off; whatever came through the door at the other kind of ending took nobody's roof. */
    guard(['_roofs', 'fireTakesTheRoofsOff', 'andTheDarkLeavesThemOn'], () => {
      const hues = () => new Set(mine.filter(x => !x._fallen).map(x => x._roof.material.color.getHexString()));
      /* `_roofMat0` does not exist on the old build either, and a claim measured against
         `undefined` would call every roof "charred" */
      const charredOf = () => mine.filter(x => !x._fallen && x._roofMat0 && x._roof.material !== x._roofMat0).length;
      const whole = hues().size;
      setKind('torch'); scar(); syncRoofs();
      const fellIn = mine.filter(x => x._fallen).length;
      const charred = charredOf();
      const hidden = mine.filter(x => !x._roof.visible).length;
      const charHues = hues().size;
      setKind('dark'); scar(); syncRoofs();
      const darkFell = mine.filter(x => x._fallen).length;
      const darkUp = mine.filter(x => x._roof.visible).length;
      const darkHues = hues().size;
      setKind(null);
      O._roofs = `${whole} roof colours in a living town; torched: ${fellIn} of ${mine.length} fell in, ${charred} charred, ${hidden} hidden, ${charHues} colour(s) left;` +
        ` fell-to-the-dark: ${darkFell} fell in, ${darkUp} still up, ${darkHues} colour(s) left`;
      O.fireTakesTheRoofsOff = (fellIn > 0 && fellIn < mine.length && charred > 0 && hidden === fellIn && charHues === 1)
        ? `fire takes ${fellIn} of ${mine.length} roofs down and chars the other ${charred} to one colour — a burnt street is not a street any more`
        : `!! A TORCHED TOWN'S ROOFS ARE WRONG (${fellIn} fell in, ${charred} charred, ${hidden} hidden, ${charHues} colours of ${mine.length})`;
      /* NOT "the material is untouched". The dark ending dims each roof off ITS OWN colour, so
         the material is a different object — what has to be true is that nothing came down and
         the town still reads as the town it was, which is a street that still has more than
         one colour in it. Charring is the opposite and collapses them all to one. */
      O.andTheDarkLeavesThemOn = (darkFell === 0 && darkUp === mine.length && darkHues === whole && whole > 1)
        ? `and the other ending leaves all ${mine.length} standing and keeps the street's ${darkHues} colours, only colder — nothing burned there`
        : `!! A TOWN THAT FELL TO THE DARK DOES NOT READ AS ONE (${darkFell} fell in, ${darkUp} of ${mine.length} up, ${darkHues} colours against ${whole} whole)`;
    });

    /* ---------- 3. A RUIN KEEPS NO LAMPS ---------- */
    guard(['_lamps', 'everyRuinPutsItsLampsOut'], () => {
      hour = 23; updateSky();
      const ours = townFires.filter(f => f.town === t);
      setKind(null); scar(); syncTorchLights();
      const litHeads = ours.filter(f => f.head && f.head.visible).length;
      const readings = {};
      for (const k of ['torch', 'dark']) {
        setKind(k); scar(); syncTorchLights();
        readings[k] = {
          heads: ours.filter(f => f.head && f.head.visible).length,
          pools: ours.filter(f => f.pool && f.pool.visible).length,
        };
      }
      setKind(null); scar(); syncTorchLights();
      O._lamps = `${ours.length} lamps in ${t.name}: ${litHeads} alight whole, ` +
        `${readings.torch.heads} heads / ${readings.torch.pools} pools when torched, ${readings.dark.heads} / ${readings.dark.pools} when fallen`;
      O.everyRuinPutsItsLampsOut = (litHeads > 0 && !readings.torch.heads && !readings.torch.pools && !readings.dark.heads && !readings.dark.pools)
        ? `${litHeads} lamps burn in a living town and not one of them in either kind of ruin`
        : litHeads === 0 ? '!! THE TOWN HAD NO LAMPS LIT TO PUT OUT — the claim is vacuous'
          : `!! A RUIN IS STILL LIT (torched ${readings.torch.heads}/${readings.torch.pools}, fallen ${readings.dark.heads}/${readings.dark.pools} of ${ours.length})`;
    });

    /* ---------- 4. AND A TOWN THAT COMES BACK COMES BACK WHOLE ----------
       THE ROOFS ARE NOT THE SCAR GROUP'S CHILDREN. `b._roof` is retained, built once with the
       town and never disposed, so charring one is a one-way change unless every pass sets every
       building. This is the claim that catches that, and it is the reason the scar's build
       walks all of `buildings` rather than only the ones belonging to a ruin. */
    guard(['_back', 'aTownThatComesBackComesBackWhole'], () => {
      hour = 12; updateSky();
      setKind(null); const whole = frame();
      setKind('torch'); frame();
      setKind(null); const after = frame();
      const d = diff(whole, after);
      const own = mine.filter(x => x._roofMat0 && x._roof.material === x._roofMat0 && x._roof.visible && !x._fallen).length;
      O._back = `after burning and rebuilding: ${own} of ${mine.length} roofs are their own again, and the picture is ${d.n} of ${d.of} pixels off the one before the fire`;
      O.aTownThatComesBackComesBackWhole = (own === mine.length && d.n < 40)
        ? `a town whose sack runs out gets every roof back — ${own} of ${mine.length}, and the same picture it had`
        : `!! THE SCAR DOES NOT COME OFF (${own} of ${mine.length} roofs restored, ${d.n} pixels still changed)`;
    });

    /* ---------- 5. THE KIND SURVIVES A SAVE ----------
       A ruin that loads back as the wrong kind of ruin is worse than one that does not load at
       all: the town would quietly change how it ended. */
    guard(['_save', 'theKindOfEndingSurvivesASave'], () => {
      setKind('dark');
      const ti = towns.indexOf(t);
      const s = JSON.parse(JSON.stringify(snapshot()));
      setKind(null);
      restore(JSON.parse(JSON.stringify(s)));
      const back = towns[ti];
      const saved = (s.townState || s.towns || [])[ti] || {};
      O._save = `written to the save as sacked=${saved.sacked} kind=${JSON.stringify(saved.sackKind)}, loaded back as sacked=${back.sacked} kind=${JSON.stringify(back.sackKind)}`;
      O.theKindOfEndingSurvivesASave = (back.sacked > 0 && back.sackKind === 'dark')
        ? 'a town that fell to the dark loads back as a town that fell to the dark, not as a burnt one'
        : `!! THE KIND OF ENDING DID NOT SURVIVE THE SAVE (sacked ${back.sacked}, kind ${JSON.stringify(back.sackKind)})`;
      towns[ti].sacked = 0; towns[ti].sackKind = null;
    });

    /* ---------- 6. AND THE FIRE OWES THE WORLD NOTHING ----------
       `addSpecks` draws on `rnd()`, which IS the world's seeded stream. A burning town throws
       flame four times a second for as long as it burns, and off `rnd` that would walk the seed
       for days of play — every raid, every birth and every ore in the ground afterwards would
       come out somewhere else. `seed` and `vseed` are both plain globals, so this is measured
       rather than argued: the world's counter must not move, and the visual one must, or
       nothing was thrown and the claim is empty. */
    guard(['_stream', 'theFireIsThrownOffTheVisualStream'], () => {
      const tt = towns.filter(q => q.def.wall)[0];
      tt.sacked = 5; tt.sackKind = 'torch';
      camSX = tt.x; camSY = tt.y;
      const s0 = seed, v0 = vseed;
      for (let i = 0; i < 200; i++) if (typeof ruinTick === 'function') ruinTick();
      const s1 = seed, v1 = vseed;
      tt.sacked = 0; tt.sackKind = null;
      O._stream = `200 ticks of a burning town: world seed ${s0} -> ${s1}, visual seed ${v0} -> ${v1}`;
      O.theFireIsThrownOffTheVisualStream = (s1 === s0 && v1 !== v0)
        ? 'two hundred ticks of a town on fire moved the visual stream and left the world\'s seed exactly where it was'
        : s1 !== s0 ? `!! THE FIRE WALKS THE WORLD'S SEED (${s0} -> ${s1}) — every roll the world makes afterwards is different`
          : '!! NOTHING WAS THROWN AT ALL (the visual seed did not move), so the claim above is empty';
    });

    for (const q of towns) { q.sacked = 0; q.sackKind = null; }
    return O;
  });

  console.log('\n=== WHAT IS LEFT OF A TOWN THAT ENDED ===\n');
  const bad = [];
  for (const k of Object.keys(R)) {
    const v = String(R[k]);
    console.log('  ' + k.padEnd(34) + v);
    if (v.startsWith('!!')) bad.push(v);
  }
  console.log('\n' + (bad.length ? '*** ' + bad.join('\n*** ')
    : 'A BURNT TOWN AND A TOWN THAT FELL ARE TWO DIFFERENT RUINS, AND BOTH COME BACK'));
  if (errs.length) { console.log('errs:', errs.length); errs.slice(0, 4).forEach(e => console.log('  ' + e)); }
  await b.close();
  if (bad.length) process.exitCode = 1;
})();
