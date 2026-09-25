#!/usr/bin/env node
/* THE TOWNS AFTER DARK, AND THE VIOLET LIGHT THAT WAS ALREADY THERE.
 *
 * "Please add some more torches to the cities to build on this ambiance. Fallowend could
 *  perhaps use a purple variant to reflect their anti-gaunt lamps. (That could be a neat
 *  in-world variety for both built lamps and torches, a recipe only Fallowend knows and only
 *  getting a high rep with them will teach you.)"
 *
 * Fallowend's lanterns are not new. They have been a complete mechanic since the violet light
 * was written: six posts on the ring road, `aether_cell` fuel, seventy days a cell, thirteen
 * tiles of gaunt-turning, a finite box the Elder will not admit is empty. What they have never
 * had is a PHOTON. They draw no geometry and they are in no light list, so the one town whose
 * whole identity is the lamps on its road looked exactly like the one next door.
 *
 * So this is two halves that meet: the towns get fires, and Fallowend's get seen.
 *
 * Measured the way the overland firelight was — same ground, same hour, same camera, with the
 * fires and without them. Comparing a lit plaza against unlit waste measures terrain, not
 * light: those readings differ by 75 at noon with nothing burning anywhere.
 *
 *   node tools/lamplight.js [game.html]
 */
const { chromium } = require('playwright');
const path = require('path');
const gamePath = (a) => path.resolve(a ? (path.isAbsolute(a) ? a : path.join(__dirname, a)) : path.join(__dirname, 'game.html'));

(async () => {
  const b = await chromium.launch({ executablePath: process.env.DUSTWARD_CHROME || undefined,
    args: ['--use-gl=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox','--no-sandbox'] });
  const errs = [];
  const p = await b.newPage({ viewport: { width: 1000, height: 700 } });
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message.slice(0, 200)));
  await p.goto('file://' + gamePath(process.argv[2]), { waitUntil: 'load', timeout: 90000 });
  await p.waitForFunction(() => !!document.getElementById('btn-start'), null, { timeout: 60000 });
  await p.evaluate(() => { document.getElementById('btn-start').click(); paused = true; });
  await p.waitForFunction(() => typeof chars !== 'undefined' && chars.length > 0, null, { timeout: 60000 });
  await p.waitForTimeout(2500);

  const R = {};
  const put = (k, v) => { R[k] = v; };

  /* ---- the premise ---- */
  const pre = await p.evaluate(() => ({
    towns: towns.length,
    lanterns: typeof lanterns !== 'undefined' ? lanterns.length : 0,
    lit: typeof lanterns !== 'undefined' ? lanterns.filter(L => L.fuel > 0).length : 0,
    townFires: typeof townFires !== 'undefined' ? townFires.length : -1,
  }));
  put('_premise', `${pre.towns} towns, ${pre.lit} of ${pre.lanterns} Fallowend lanterns burning, ${pre.townFires < 0 ? 'no town-fire list at all' : pre.townFires + ' town fires'}`);
  put('thereAreTownsAndLanternsToJudge', (pre.towns >= 5 && pre.lit >= 3)
    ? `${pre.towns} towns on the map and ${pre.lit} lanterns alight on the Fallowend road — there is something to look at`
    : `!! NOTHING TO MEASURE (${pre.towns} towns, ${pre.lit} lit lanterns)`);

  /* park the camera in a town plaza, on the surface */
  const stage = async (townKey) => p.evaluate((k) => {
    const t = towns.find(t2 => t2.def.key === k) || towns[0];
    const me = player()[0];
    me.floor = 0; me.state = 'ok'; me.weapon = 'w_kat';
    me.x = t.x + 3.5; me.y = t.y + 3.5;
    camX = camSX = t.x; camY = camSY = t.y; camDist = camDistTarget = 26;
    camFollow = false; activeFloor = 0;
    window.__t = { x: t.x, y: t.y, name: t.name, rep: t.rep || 0 };
    return window.__t;
  }, townKey);

  /* ---------- BOTH READINGS IN ONE FRAME ----------
     The first cut set the hour, toggled the fires, let the sim run and then sampled — and the
     world moves in between: bodies walk through the plaza, windows come up, the camera settles.
     It reported a 32-point "gain" on a build with no town fires in it at all, and a lantern
     that was DARKER lit than unlit. Nothing is stepped here. The hour is set, the fires are
     switched off, a frame is drawn and read; they are switched back on, a frame is drawn and
     read. The only thing that differs between the two numbers is the fire. */
  const ab = async (hour) => p.evaluate((hh) => {
    const t = window.__t;
    const sample = () => {
      syncTorchLights();
      renderer.render(scene, camera);
      const src = renderer.domElement;
      const cvs = document.createElement('canvas');
      cvs.width = src.width; cvs.height = src.height;
      const cx = cvs.getContext('2d');
      cx.drawImage(src, 0, 0);
      /* ---------- THE MEAN OF THE GROUND, NOT ITS BRIGHTEST PIXEL ----------
         A max is the wrong statistic twice over. It picks the neighbours — eight tiles either
         way around a Fallowend lantern also catches the town's own cressets, and the brightest
         pixel in that square came back amber off a fire six tiles away. And once the lamps put
         an additive disc on the floor the brightest pixel CLIPS, which flattens the very hue
         difference being measured: blue 78 against green 78 on a frame lit entirely by violet.
         A mean over the patch is what "how lit is this ground, and what colour" actually means.
         `rad` is set by the caller. */
      const rad = window.__rad || 8;
      let sum = [0, 0, 0], n = 0;
      for (let dx = -rad; dx <= rad; dx += 2) for (let dz = -rad; dz <= rad; dz += 2) {
        const wx = t.x + dx, wz = t.y + dz;
        const v = new THREE.Vector3(wx, groundY(wx, wz) + 0.15, wz).project(camera);
        const px = Math.round((v.x * 0.5 + 0.5) * cvs.width), py = Math.round((-v.y * 0.5 + 0.5) * cvs.height);
        if (px < 4 || py < 4 || px > cvs.width - 5 || py > cvs.height - 5) continue;
        const im = cx.getImageData(px - 3, py - 3, 7, 7).data;
        for (let i = 0; i < im.length; i += 4) { sum[0] += im[i]; sum[1] += im[i + 1]; sum[2] += im[i + 2]; n++; }
      }
      const bestRGB = n ? sum.map(v2 => +(v2 / n).toFixed(1)) : [0, 0, 0];
      const best = 0.299 * bestRGB[0] + 0.587 * bestRGB[1] + 0.114 * bestRGB[2];
      return { lum: +best.toFixed(1), rgb: bestRGB,
               lights: TORCH_LIGHTS.filter(l => l.intensity > 0.01).length,
               cols: TORCH_LIGHTS.filter(l => l.intensity > 0.01).map(l => '#' + l.color.getHexString()) };
    };
    hour = hh; updateSky();
    /* off */
    const tf = (typeof townFires !== 'undefined') ? townFires.splice(0, townFires.length) : null;
    const lf = (typeof lanterns !== 'undefined') ? lanterns.map(L => L.fuel) : null;
    if (lf) for (const L of lanterns) L.fuel = 0;
    const off = sample();
    /* on */
    if (tf) townFires.push(...tf);
    if (lf) lanterns.forEach((L, i) => L.fuel = lf[i]);
    const on = sample();
    return { on, off };
  }, hour);

  /* ================= 1. A TOWN BURNS AFTER DARK ================= */
  await stage('dustport');
  await p.waitForTimeout(1500);              /* let the town's geometry and the rig build once */
  const night = await ab(0);
  const noon = await ab(12);
  const nightOn = night.on, nightOff = night.off, noonOn = noon.on, noonOff = noon.off;
  const gainNight = +(nightOn.lum - nightOff.lum).toFixed(1);
  const gainNoon = +(noonOn.lum - noonOff.lum).toFixed(1);
  put('_town', `DUSTPORT plaza at midnight: ${nightOn.lum} with its fires, ${nightOff.lum} without (${nightOn.lights} lights, ${nightOn.cols.join(' ')})`);
  /* ---------- THE BAR IS A RATIO, BECAUSE THE STATISTIC MOVED ----------
     It was "gain at least 25", set against a control that read exactly 0.0 — and that number
     was calibrated to the BRIGHTEST pixel in the box. Once the sampler became a mean over the
     patch (see the note in it) the same light reads 11 instead of 78, and a bar carried over
     from the old statistic would have been a number with nothing behind it.
     A ratio survives the change: a lit town is a fifth brighter than the same town with its
     fires out, whatever the statistic. It is measured at 1.22 here, and the failure this is
     really guarding — the fires stopped lighting anything — is a ratio of exactly 1.00. The
     noise floor is not an estimate: the A/B is two renders of one frame, so noon measures 0.0. */
  const ratioNight = +(nightOn.lum / Math.max(0.01, nightOff.lum)).toFixed(2);
  put('aTownBurnsAfterDark', (nightOn.lights > 0 && ratioNight >= 1.15)
    ? `a town plaza is ${ratioNight}x its own unlit brightness at midnight — ${nightOff.lum} to ${nightOn.lum}, off ${nightOn.lights} of the three lights`
    : `!! A TOWN IS AS DARK AS THE WASTE AT MIDNIGHT (${nightOn.lights} lights, ${ratioNight}x unlit)`);
  const dT = [0, 1, 2].map(i => +(nightOn.rgb[i] - nightOff.rgb[i]).toFixed(1));
  put('_amber', `and an ordinary town's cressets lift r${dT[0]} g${dT[1]} b${dT[2]} on the same ground`);
  put('anOrdinaryTownBurnsFireColoured', dT[1] > dT[2]
    ? `a cresset in DUSTPORT lifts green by ${dT[1]} against blue by ${dT[2]} — fire-coloured, and the opposite of the lantern above, so the measurement tells the two apart`
    : `!! DUSTPORT IS NOT BURNING FIRE-COLOURED (r${dT[0]} g${dT[1]} b${dT[2]})`);
  put('andNothingBurnsAtNoon', (noonOn.lights === 0 && Math.abs(gainNoon) < 6)
    ? `and at noon the same plaza is within ${Math.abs(gainNoon)} of itself either way — the sun is doing the work`
    : `!! TOWN FIRES ARE STILL BURNING IN FULL SUN (${noonOn.lights} lights, the ground gains ${gainNoon})`);

  /* ================= 2. AND FALLOWEND BURNS VIOLET ================= */
  const fal = await p.evaluate(() => {
    if (typeof lanterns === 'undefined' || !lanterns.length) return null;
    const L = lanterns.find(l => l.fuel > 0) || lanterns[0];
    const me = player()[0];
    me.floor = 0; me.x = L.x + 2; me.y = L.y + 2;
    camX = camSX = L.x; camY = camSY = L.y; camDist = camDistTarget = 14;
    camFollow = false; activeFloor = 0;
    window.__t = { x: L.x, y: L.y, name: 'lantern', rep: 0 };
    window.__rad = 3;                       /* the lantern itself, not the street behind it */
    return { x: L.x, y: L.y, fuel: L.fuel };
  });
  let violet = null;
  if (fal) {
    await p.waitForTimeout(1500);
    const pair = await ab(0);
    violet = pair.on;
    const off = pair.off;
    const gain = +(violet.lum - off.lum).toFixed(1);
    /* ---------- HUE MEASURED AS A GAIN, NOT AS AN ABSOLUTE ----------
       "Is this pixel violet" is the wrong question: the ground is sand-coloured, so a violet
       light on it comes back a warm mauve and an absolute test on the channels reads brown. A
       first cut asked for blue above green by twelve and got eleven, on a frame where all three
       lights in the scene were demonstrably #9a6fd0.
       What a light does to a surface is the DIFFERENCE it makes to it, per channel, on the same
       ground with the fire and without. A violet lamp lifts blue more than green; an amber one
       lifts green more than blue. The town cressets below are the same measurement run the
       other way, which is what makes this one mean something. */
    const dV = [0, 1, 2].map(i => +(violet.rgb[i] - off.rgb[i]).toFixed(1));
    const isViolet = dV[2] > dV[1];
    put('_violet', `at a Fallowend lantern at midnight: ${violet.lum} lit against ${off.lum} dark, lights ${violet.cols.join(' ')}; the ground gains r${dV[0]} g${dV[1]} b${dV[2]}`);
    const ratioV = +(violet.lum / Math.max(0.01, off.lum)).toFixed(2);
    put('fallowendsLanternsAreOnTheMap', (violet.lights > 0 && ratioV >= 1.4)
      ? `the lantern the Elder keeps alight actually lights the road — ${ratioV}x the unlit ground beside it, ${off.lum} to ${violet.lum}`
      : `!! THE LANTERNS THROW NO LIGHT AT ALL (${violet.lights} lights, ${ratioV}x unlit) — a whole mechanic with no photon in it`);
    put('andTheyBurnViolet', isViolet
      ? `and it burns violet rather than fire-coloured — it lifts blue by ${dV[2]} against green by ${dV[1]} on the same ground`
      : `!! THE LANTERN IS NOT VIOLET — it lifts blue by ${dV[2]} against green by ${dV[1]}`);
  } else {
    put('fallowendsLanternsAreOnTheMap', '!! NO LANTERNS IN THIS WORLD');
    put('andTheyBurnViolet', '!! NO LANTERNS IN THIS WORLD');
  }

  /* ================= 3. THE RECIPE FALLOWEND KEEPS ================= */
  const recipe = await p.evaluate(() => {
    const post = (typeof BUILD_TYPES !== 'undefined' && BUILD_TYPES.lampviolet) || null;
    const torch = ITEMS.w_torch_v || null;
    const tech = typeof TECHS !== 'undefined' ? TECHS.violet_light : null;
    const inTree = !!tech;
    const known = !!(research.done && research.done.violet_light);
    /* is it reachable through ordinary research? it must not be */
    /* `found` is this file's own word for a tech with no START button anywhere — the Harbour
       Receipt has carried it for as long as Sella Vane has refused to write it down. */
    const researchable = !!(tech && !tech.found);
    return { post: post ? post.name : null, postCost: post ? post.cost : null,
             torch: torch ? torch.name : null, tech: tech ? tech.name : null,
             inTree, known, researchable };
  });
  put('_recipe', `violet post ${recipe.post || '—'}, violet torch ${recipe.torch || '—'}, tech ${recipe.tech || '—'}`);
  put('aVioletPostAndAVioletTorchExist', (recipe.post && recipe.torch && recipe.postCost && recipe.postCost.aether_cell)
    ? `there is a ${recipe.post} to raise and a ${recipe.torch} to carry, and the post burns an aether cell the way Fallowend's do`
    : `!! THE VIOLET VARIANT DOES NOT EXIST (post ${recipe.post}, torch ${recipe.torch})`);
  put('andTheyAreNotInTheResearchTree', (recipe.tech && !recipe.known && !recipe.researchable)
    ? `the knowledge exists, is not known at the start, and cannot be reached by research — it is somebody's to give`
    : `!! IT IS EITHER MISSING OR SIMPLY RESEARCHABLE (tech ${recipe.tech}, known ${recipe.known}, researchable ${recipe.researchable})`);

  /* ================= 4. AND ONLY AT HIGH REGARD ================= */
  const taught = await p.evaluate(() => {
    const t = towns.find(t2 => t2.def.key === 'fallowend');
    if (!t) return null;
    const leader = chars.find(c => c.isLeader !== undefined && towns[c.isLeader] === t)
                || chars.find(c => c.homeTown === t && c.isLeader !== undefined);
    if (!leader) return { noLeader: true };
    const tree = (typeof TALK_TREES !== 'undefined') ? TALK_TREES.leader : null;
    const opts = () => {
      const n = tree && tree.root;
      if (!n) return [];
      return (n.opts || []).filter(o => !o.when || o.when(leader));
    };
    const has = () => opts().some(o => o.to === 'teaching' || /teach|words|pattern/i.test(o.say || ''));
    t.rep = 0;  const atLow = has();
    t.rep = 80; const atHigh = has();
    let learned = false;
    if (atHigh) {
      const o = opts().find(o2 => o2.to === 'teaching' || /teach|words|pattern/i.test(o2.say || ''));
      const node2 = tree ? tree.teaching : null;
      const give = node2 && (node2.opts || []).find(o2 => o2.fn);
      if (give && give.fn) { give.fn(leader); learned = !!research.done.violet_light; }
    }
    return { atLow, atHigh, learned, rep: t.rep, hasNode: !!(tree && tree.teaching) };
  });
  put('_taught', taught ? JSON.stringify(taught) : 'no Fallowend');
  put('andOnlyHighRegardTeachesIt', (taught && !taught.noLeader && !taught.atLow && taught.atHigh && taught.learned)
    ? `the Elder will not raise it with a stranger and will with somebody the town thinks well of — and saying yes leaves the pattern known`
    : `!! THE ELDER NEVER TEACHES IT (${taught ? JSON.stringify(taught) : 'no town'})`);

  /* ================= 5. AND THE LIGHT DOES WHAT FALLOWEND'S DOES ================= */
  /* The point of being able to build one is that it goes where the six on their road cannot:
     the lanterns are hard-gated to the surface (`(c.floor||0) !== 0` refuses them), and the
     whole reason to want a lamp of your own is a line held underground. So it is asked there. */
  const turns = await p.evaluate(() => {
    const me = player()[0];
    const h = undercroft.halls.find(q => q.f === -1);
    if (!h) return { noHall: true };
    const gx = h.x + 0.5, gy = h.y + 0.5;
    const probe = { x: gx + 4, y: gy + 4, floor: -1 };
    const before = !!violetNear(probe);
    /* a lamp of your own, finished and fuelled, on the storey the probe is standing on */
    const lamp = { type: 'lampviolet', x: Math.round(gx), y: Math.round(gy), w: 1, h: 1,
                   floor: -1, progress: 1, fuel: 70 * 24 };
    pBuilds.push(lamp);
    rebuildCharGrid();
    const withLamp = !!violetNear(probe);
    pBuilds.splice(pBuilds.indexOf(lamp), 1);
    rebuildCharGrid();
    /* and the same trick in a hand */
    const bearer = chars.find(c => c.faction === 'player' && c.state === 'ok');
    const wasW = bearer.weapon, wasF = bearer.floor, wasX = bearer.x, wasY = bearer.y, wasH = bearer.torchH;
    bearer.floor = -1; bearer.x = gx + 2; bearer.y = gy + 2; bearer.weapon = 'w_torch_v'; bearer.torchH = 99;
    rebuildCharGrid();
    const withTorch = !!violetNear(probe);
    const litToo = torchLit(bearer);
    bearer.weapon = wasW; bearer.floor = wasF; bearer.x = wasX; bearer.y = wasY; bearer.torchH = wasH;
    rebuildCharGrid();
    const after = !!violetNear(probe);
    return { before, withLamp, withTorch, litToo, after };
  });
  put('_turns', turns.noHall ? 'no undercroft hall' : JSON.stringify(turns));
  put('aLampOfYourOwnTurnsThemToo', (turns && !turns.noHall && !turns.before && turns.withLamp && turns.withTorch && turns.litToo && !turns.after)
    ? `a Violet Lamp raised on storey -1 answers the gaunts' question the way the six on the road do, and so does a Violet Torch in a hand — and when both are gone the dark goes back to being dark`
    : `!! THE VIOLET LIGHT YOU MAKE DOES NOTHING (${JSON.stringify(turns)})`);

  /* ================= 6. AND THE LIGHT IS STILL THE LIGHT ================= */
  const budget = await p.evaluate(() => {
    let n = 0; scene.traverse(o => { if (o.isLight) n++; });
    return { n, pool: TORCH_LIGHTS.length };
  });
  put('andTheLightBudgetIsStillThree', budget.pool === 3
    ? `the fire pool is still three point lights reassigned per frame, whatever is burning — ${budget.n} lights in the scene all told`
    : `!! THE FIRE POOL CHANGED SIZE (${budget.pool})`);

  console.log('\n=== THE TOWNS AFTER DARK ===\n');
  const bad = [];
  for (const k of Object.keys(R)) {
    const v = String(R[k]);
    console.log('  ' + k.padEnd(36) + v.slice(0, 260));
    if (v.startsWith('!!')) bad.push(v);
  }
  for (const e of errs) bad.push(e);
  console.log('');
  for (const v of bad) console.log('*** ' + v);
  await b.close();
  process.exit(bad.length ? 1 : 0);
})();
