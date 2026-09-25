#!/usr/bin/env node
/* A FIRE ON THE SURFACE, AFTER DARK.
 *
 * "the torch lighting is looking amazing. (Honestly I think we should maybe incorporate that
 *  into the overworld too.)"
 *
 * It was one line: `syncTorchLights` begins `if(activeFloor >= 0){ … return; }`, so the three
 * point lights the underworld runs on are held at zero everywhere above ground, at every hour.
 * The pool on the floor is gated the same way, on `darkFloor(c)`. A torch at midnight on the
 * grass was a stick with a sprite on it.
 *
 * The gate wants to be DARKNESS, not depth — but only for the look. `darkFloor` is also the
 * gameplay predicate for being blind, and surface night is deliberately not that: nobody asked
 * for a torch to become mandatory after sunset. So the renderer gets its own test and the
 * rules keep theirs, and one of the claims below is exactly that separation.
 *
 * The other half is the negative, and it is the one that decides whether this is an
 * improvement or noise: at noon a torch must put NOTHING on the ground. An orange dinner plate
 * under everybody in full sun is the failure mode the old comment was guarding against, and it
 * is the reason the gate is a curve rather than a boolean.
 *
 *   node tools/nightfire.js [game.html]
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

  /* one body on open ground, on the surface, with a torch that will not burn out */
  await p.evaluate(() => {
    paused = true;
    const me = player()[0];
    me.floor = 0; me.state = 'ok'; me.weapon = 'w_torch'; me.torchH = 999;
    camX = camSX = me.x; camY = camSY = me.y; camDist = camDistTarget = 26;
    camFollow = true; selected = [me]; activeFloor = 0;
    window.__me = me.id;
  });

  /* ---------- THE RIG IS BUILT BY THE RENDER LOOP, NOT BY `update` ----------
     A first cut set the hour, ran six sim steps in-page and read the torch pool straight back:
     `charMeshes` had not been rebuilt, so the pool was missing underground too and the claim
     that nothing had changed down there failed on the CONTROL. Set the hour, let real frames
     go by, then read. */
  const at = async (h, torch = true) => {
    await p.evaluate(([hh, tt]) => {
      const me = chars.find(c => c.id === window.__me);
      me.weapon = tt ? 'w_torch' : 'w_kat'; me.torchH = 999;
      hour = hh; updateSky();
      for (let i = 0; i < 6; i++) update(1 / 30);
    }, [h, torch]);
    await p.waitForTimeout(1200);
    return p.evaluate((hh) => {
    hour = hh;
    updateSky();
    syncTorchLights();
    renderer.render(scene, camera);
    const me = chars.find(c => c.id === window.__me);
    const e = charMeshes.get(me.id);
    const lights = TORCH_LIGHTS.filter(l => l.intensity > 0.01).length;
    const pool = !!(e && e.torchPool && e.torchPool.visible);
    /* the brightest pixel on the ground beside the body, against ground well outside any
       fire — the only question that matters is whether a torch changes what you can see */
    const src = renderer.domElement;
    const cvs = document.createElement('canvas');
    cvs.width = src.width; cvs.height = src.height;
    const cx = cvs.getContext('2d');
    cx.drawImage(src, 0, 0);
    const lum = (wx, wz) => {
      const v = new THREE.Vector3(wx, groundY(wx, wz) + 0.1, wz).project(camera);
      const px = Math.round((v.x * 0.5 + 0.5) * cvs.width), py = Math.round((-v.y * 0.5 + 0.5) * cvs.height);
      if (px < 6 || py < 6 || px > cvs.width - 7 || py > cvs.height - 7) return null;
      const im = cx.getImageData(px - 5, py - 5, 11, 11).data;
      let best = 0;
      for (let i = 0; i < im.length; i += 4) best = Math.max(best, 0.299 * im[i] + 0.587 * im[i + 1] + 0.114 * im[i + 2]);
      return best;
    };
    /* ---------- THE SAME GROUND, WITH THE FIRE AND WITHOUT IT ----------
       The first cut compared ground beside the body against ground seven tiles off and called
       the difference the torch. It is not: those two points differ by 75 at NOON, with no
       torch anywhere, because they are different bits of terrain at different angles to the
       sun. The only way to measure a light is to take one reading with it and one without it
       at the same spot, same hour, same camera — so the hour is sampled twice and the body's
       weapon is the only thing that moves. */
    return {
      hour: hh, lights, pool,
      lit: lum(me.x + 1.4, me.y + 1.4),
      away: lum(me.x + 7.5, me.y + 7.5),
      sceneLights: (() => { let n = 0; scene.traverse(o => { if (o.isLight) n++; }); return n; })(),
      blind: typeof darkFloor === 'function' ? darkFloor(me) : null,
    };
    }, h);
  };

  const night = await at(0);
  const nightOut = await at(0, false);
  const noon = await at(12);
  const noonOut = await at(12, false);
  const dusk = await at(19.5);
  await p.evaluate(() => { const me = chars.find(c => c.id === window.__me); me.weapon = 'w_torch'; me.torchH = 999; });
  /* and the same body underground, which must not have changed */
  await p.evaluate(() => {
    const me = chars.find(c => c.id === window.__me);
    const h = undercroft.halls.find(q => q.f === -1);
    me.floor = -1; me.x = h.x + 0.5; me.y = h.y + 0.5;
    camX = camSX = me.x; camY = camSY = me.y; activeFloor = -1;
    hour = 12; updateSky();
  });
  await p.waitForTimeout(2500);
  const under = await p.evaluate(() => {
    syncTorchLights();
    const me = chars.find(c => c.id === window.__me);
    const e = charMeshes.get(me.id);
    return { lights: TORCH_LIGHTS.filter(l => l.intensity > 0.01).length,
             pool: !!(e && e.torchPool && e.torchPool.visible),
             blind: darkFloor(me) };
  });

  const R = {};
  const gain = (a, c) => (a.lit === null || c.lit === null) ? null : +(a.lit - c.lit).toFixed(1);
  const nightGain = gain(night, nightOut), noonGain = gain(noon, noonOut);
  R._night = `midnight on the grass: ${night.lights} of 3 fires lit, pool ${night.pool ? 'drawn' : 'hidden'}; the same ground reads ${night.lit} with the torch and ${nightOut.lit} with it stowed`;
  R._noon = `noon on the same spot: ${noon.lights} of 3 fires lit, pool ${noon.pool ? 'drawn' : 'hidden'}; ${noon.lit} with the torch against ${noonOut.lit} without`;
  R._dusk = `half past seven: ${dusk.lights} of 3 fires lit, pool ${dusk.pool ? 'drawn' : 'hidden'}`;

  R.aTorchLightsTheGroundAfterDark = (nightGain !== null && night.lights > 0 && night.pool && nightGain >= 25)
    ? `a torch carried at midnight throws real light on the grass — the same patch reads ${nightGain} brighter with it out, off ${night.lights} of the three point lights`
    : `!! A TORCH DOES NOTHING ON THE SURFACE AT MIDNIGHT (${night.lights} lights, pool ${night.pool}, the ground gains ${nightGain})`;

  R.andNothingAtAllAtNoon = (noon.lights === 0 && !noon.pool && noonGain !== null && Math.abs(noonGain) < 6)
    ? `and at noon it puts nothing on the ground at all — no light spent, no pool drawn, the same patch within ${Math.abs(noonGain)} of itself either way`
    : `!! A TORCH IS STILL BURNING IN FULL SUN (${noon.lights} lights, pool ${noon.pool}, the ground gains ${noonGain}) — AN ORANGE PLATE UNDER EVERYBODY AT MIDDAY`;

  R.andItComesUpAtDusk = (dusk.lights > 0 || dusk.pool)
    ? `by half past seven it has begun to tell — ${dusk.lights} lit, pool ${dusk.pool ? 'drawn' : 'hidden'}`
    : `!! NOTHING HAPPENS AT DUSK — THE LIGHT SWITCHES ON RATHER THAN COMING UP`;

  /* ---- THE TWO NEGATIVES ---- */
  R.andTheSurfaceIsStillNotTheDark = (night.blind === false)
    ? `and midnight on the grass is still not the dark: a body standing in it is not blind, because this is a look and not a rule`
    : `!! SURFACE NIGHT NOW READS AS THE DARK — A TORCH HAS BECOME MANDATORY AFTER SUNSET (darkFloor ${night.blind})`;

  /* THE COUNT, NOT THE BRIGHTNESS. This file holds its three fires at intensity zero rather
     than removing them precisely so the light count never changes — three.js rebuilds every
     Lambert shader in the scene when it does, and the frame that happens on is the frame you
     walk into the dark. A first cut of this claim compared the count against an unrelated
     number and asserted 11 === 3. */
  R.andThereAreStillExactlyThreeFires = (night.sceneLights === noon.sceneLights && noon.sceneLights === dusk.sceneLights)
    ? `the scene holds the same ${night.sceneLights} lights at midnight, at dusk and at noon — none added, none removed, no shader rebuilt`
    : `!! THE LIGHT COUNT MOVED BETWEEN HOURS (${night.sceneLights} at midnight, ${dusk.sceneLights} at dusk, ${noon.sceneLights} at noon)`;

  R.andTheUndercroftIsUnchanged = (under.lights > 0 && under.pool && under.blind === true)
    ? `and underground at noon it is exactly as it was — ${under.lights} fires lit, pool drawn, and the body is still blind without one`
    : `!! THE UNDERCROFT CHANGED (${under.lights} lights, pool ${under.pool}, blind ${under.blind})`;

  console.log('\n=== A FIRE ON THE SURFACE, AFTER DARK ===\n');
  const bad = [];
  for (const k of Object.keys(R)) {
    const v = String(R[k]);
    console.log('  ' + k.padEnd(36) + v);
    if (v.startsWith('!!')) bad.push(v);
  }
  for (const e of errs) bad.push(e);
  console.log('');
  for (const v of bad) console.log('*** ' + v);
  await b.close();
  process.exit(bad.length ? 1 : 0);
})();
