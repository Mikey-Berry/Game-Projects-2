#!/usr/bin/env node
/* THERE ARE TWO OF US IN HERE, AND NOW YOU CAN SEE HOW FAR ALONG IT IS.
 *
 * A Hollow is a rider in a borrowed body and it goes through two rites. `awakenHollow` logs
 * "the eyes are brighter, and something behind them is finally awake"; the Nascent rite logs
 * "the body does not change". The first was a promise the model never kept and the second
 * spent the biggest beat a Hollow has on nothing anybody could see — and `hollowTier`, which
 * is 0, then 1, then 2, has ridden the save the whole time with no geometry behind it.
 *
 * Four claims, and the last one is the one that was quietly broken for every race:
 *
 *   1. EACH TIER IS MORE THAN THE ONE BELOW IT. Same body, same id, three rebuilds.
 *   2. THE RITE IS WHAT REBUILDS IT. `hollowTier` is in `colorKeyOf`, so nothing at the rite
 *      has to know a mesh exists — the same path a change of armour takes. A tier that moved
 *      without the key moving would leave the old body on screen until something else forced
 *      a rebuild, which is the bug this is written to prevent rather than to find.
 *   3. THE PASSENGER MOVES ON ITS OWN CLOCK. A Nascent Old One's head drifts independently of
 *      the host's, and only a Nascent one's.
 *   4. AND THE LIT PARTS ARE ACTUALLY LIT. `mats` is walked every frame writing
 *      `m.emissive.setRGB(k,k,k*0.85)` with k at zero, so anything registered there has its
 *      glow blacked out before it is drawn once. `mk` registers everything it builds — so
 *      every `mk(BOXG, ownGlow(...))` in the file, which is the eyes of every Hollow,
 *      homunculus and golem in the game, was rendering as a flat coloured box. Lit parts go in
 *      `glowMats` now and this asserts the emissive survives a frame.
 *
 *   node tools/hollow.js [out.png] [game.html]
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const OUT = path.resolve(process.argv[2] || path.join(__dirname, 'hollow.png'));
const gamePath = (a) => path.resolve(a ? (path.isAbsolute(a) ? a : path.join(__dirname, a)) : path.join(__dirname, 'game.html'));

(async () => {
  const b = await chromium.launch({
    executablePath: process.env.DUSTWARD_CHROME || undefined,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'],
  });
  const p = await b.newPage({ viewport: { width: 900, height: 700 } });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message.slice(0, 220)));
  await p.goto('file://' + gamePath(process.argv[3]), { waitUntil: 'load' });
  await p.waitForSelector('#btn-start', { state: 'attached', timeout: 60000 });
  await p.evaluate(() => { document.getElementById('btn-start').click(); paused = true; });
  await p.waitForTimeout(3000);

  const R = await p.evaluate(() => {
    paused = true; hour = 11; debugSeeAll = true;
    if (typeof updateSky === 'function') updateSky();
    if (typeof fogPlane !== 'undefined') fogPlane.visible = false;
    if (typeof syncDecorFogFull === 'function') syncDecorFogFull();
    const out = {};
    const me = player()[0];
    let spot = null;
    for (const pad of [10, 7, 5]) {
      for (let r = 40; r < 240 && !spot; r += 4) for (let a = 0; a < 24 && !spot; a++) {
        const x = me.x + Math.cos(a / 24 * 6.283) * r, y = me.y + Math.sin(a / 24 * 6.283) * r;
        if (x < pad + 4 || y < pad + 4 || x >= W - pad - 4 || y >= H - pad - 4) continue;
        let ok = true;
        for (let dy = -pad; dy <= pad && ok; dy++) for (let dx = -pad; dx <= pad && ok; dx++) {
          const ix = Math.floor(x) + dx, iy = Math.floor(y) + dy;
          if (isBlocked(ix + 0.5, iy + 0.5, 0) || terr[iy * W + ix] === 3 || decorAt(ix, iy)) ok = false;
        }
        if (ok) spot = { x, y };
      }
      if (spot) break;
    }
    window.__spot = spot || { x: me.x, y: me.y };
    const clear = () => {
      chars.length = 0;
      charMeshes.forEach(e => { if (e.g && e.g.parent) e.g.parent.remove(e.g); });
      charMeshes.clear();
    };
    const tris = (e) => {
      let t = 0;
      e.g.traverse(o => {
        if (!o.isMesh || !o.geometry) return;
        const g = o.geometry;
        t += g.index ? g.index.count / 3 : g.attributes.position.count / 3;
      });
      return Math.round(t);
    };
    const rebuilt = (c) => {
      const e0 = charMeshes.get(c.id);
      if (e0 && e0.g && e0.g.parent) e0.g.parent.remove(e0.g);
      charMeshes.delete(c.id);
      syncChars(0.05); syncChars(0.05);
      return charMeshes.get(c.id);
    };
    const hollow = (tier) => {
      const c = makeChar('H', 'player', window.__spot.x, window.__spot.y,
        { atk: 10, def: 10, tough: 10, race: 'hollow', sex: 'm', age: 30 });
      c.state = 'ok'; c.weapon = null; c.armor = null; c.hollowTier = tier;
      chars.push(c);
      syncChars(0.05); syncChars(0.05);
      return { c, e: charMeshes.get(c.id) };
    };

    /* ---------- 1. THE SAME BODY, THREE TIERS ---------- */
    clear();
    const { c, e } = hollow(0);
    const n = { 0: { t: tris(e), lit: e.glowMats.length } };
    for (const tier of [1, 2]) {
      c.hollowTier = tier;
      const e2 = rebuilt(c);
      n[tier] = { t: tris(e2), lit: e2.glowMats.length };
    }
    out.tierSizes = [0, 1, 2].map(k => `tier ${k}: ${n[k].t} tris, ${n[k].lit} lit parts`).join(' | ');
    out.eachTierIsMore = (n[1].t > n[0].t && n[2].t > n[1].t && n[1].lit > n[0].lit && n[2].lit > n[1].lit)
      ? `the same body gains geometry and light at every rite — ${n[0].t}/${n[1].t}/${n[2].t} tris, ${n[0].lit}/${n[1].lit}/${n[2].lit} lit parts`
      : `!! A RITE CHANGED NOTHING: ${out.tierSizes}`;
    clear();

    /* ---------- 2. AND THE RITE IS WHAT REBUILDS IT ---------- */
    {
      const { c: c2, e: e2 } = hollow(0);
      const k0 = e2.colorKey;
      c2.hollowTier = 1;
      out.theRiteRebuildsTheBody = (colorKeyOf(c2) !== k0)
        ? 'waking a Hollow moves its `colorKey`, so the body is rebuilt by the rite and nothing at the rite has to know a mesh exists'
        : '!! THE TIER IS NOT IN THE REBUILD KEY — a woken Hollow keeps its old body until something else forces a rebuild';
      clear();
    }

    /* ---------- 3. THE PASSENGER MOVES ON ITS OWN CLOCK ---------- */
    {
      const { e: dorm } = hollow(0);
      const d0 = dorm.headG.rotation.y;
      for (let i = 0; i < 60; i++) syncChars(1 / 30);
      const dormMoved = Math.abs(dorm.headG.rotation.y - d0);
      clear();
      const { e: nas } = hollow(2);
      const seen = [];
      for (let i = 0; i < 200; i++) { syncChars(1 / 30); if (i % 10 === 0) seen.push(nas.headG.rotation.y); }
      const swing = Math.max(...seen) - Math.min(...seen);
      out.onlyTheNascentDrifts = (swing > 0.05 && dormMoved < 0.02)
        ? `a Nascent Old One's head swings ${swing.toFixed(3)} rad on a clock of its own while a dormant Hollow's stays put (${dormMoved.toFixed(3)})`
        : `!! THE DRIFT IS WRONG: nascent ${swing.toFixed(3)}, dormant ${dormMoved.toFixed(3)}`;
      clear();
    }

    /* ---------- 4. AND A LIT PART IS STILL LIT ON THE NEXT FRAME ---------- */
    {
      const { c: c3, e: e3 } = hollow(1);
      /* a whole second of frames, which is what used to black it out */
      for (let i = 0; i < 30; i++) syncChars(1 / 30);
      /* BY LUMINANCE, NOT BY THE PACKED HEX. `getHex()` is three channels crammed into one
         integer and comparing it against a threshold is not a brightness test at all: a colour
         dimmed to 0x181702 comes out as 1,577,986, which is comfortably "greater than"
         0x111111, so a lamp that had been turned almost all the way down reported as still
         burning. Average the channels instead, which is the thing the claim is about. */
      const lum = (m) => (m.emissive.r + m.emissive.g + m.emissive.b) / 3;
      const live = e3.glowMats.filter(m => m.emissive && lum(m) > 0.05).length;
      out.litPartsSurviveAFrame = (live === e3.glowMats.length && live > 0)
        ? `all ${live} lit parts still have their emissive after a second of frames — the walk over \`mats\` no longer reaches them`
        : `!! ${e3.glowMats.length - live} OF ${e3.glowMats.length} LIT PARTS WERE BLACKED OUT BY THE FRAME LOOP`;
      /* AND THEY GO OUT WHEN IT DIES, which is the one thing that list still has to do.
         `kill` is not the way to ask: it makes a corpse and takes the body out of the roster,
         so `syncChars` never walks the entity again and the question never reaches the branch
         under test. The branch reads `c.state === 'dead'`, so that is what gets set — and the
         probe then has to say whether the entity was still being synced at all, or a passing
         claim would only mean the loop stopped running. */
      c3.state = 'dead';
      const before = e3.glowMats.map(m => lum(m).toFixed(2)).join(',');
      for (let i = 0; i < 10; i++) syncChars(1 / 30);
      const after = e3.glowMats.map(m => lum(m).toFixed(2)).join(',');
      const stillOn = e3.glowMats.filter(m => m.emissive && lum(m) > 0.05).length;
      out.andTheyGoOutWhenItDies = (stillOn === 0 && after !== before)
        ? 'and they go out when the body dies — a corpse with the lights still on is worse than one that never lit up'
        : `!! ${stillOn} OF ${e3.glowMats.length} LIT PARTS ARE STILL BURNING ON A CORPSE (${before} -> ${after})`;
      clear();
    }
    return out;
  });

  const shot = await p.evaluate(async () => {
    const me = window.__spot;
    const png = [];
    for (const hr of [11, 21]) {
      hour = hr;
      if (typeof updateSky === 'function') updateSky();
      chars.length = 0;
      charMeshes.forEach(e => { if (e.g && e.g.parent) e.g.parent.remove(e.g); });
      charMeshes.clear();
      document.querySelectorAll('.hud,#charpanel,#invpanel,#minimap,#log,#tip,#squadbar,#buildbar,#touchbar')
        .forEach(el => el.style.setProperty('display', 'none', 'important'));
      const made = [];
      [0, 1, 2].forEach((tier, j) => {
        const c = makeChar('H', 'player', me.x + (j - 1) * 1.25, me.y,
          { atk: 10, def: 10, tough: 10, race: 'hollow', sex: 'm', age: 30 });
        c.state = 'ok'; c.dir = 0; c.weapon = null; c.armor = null; c.hollowTier = tier;
        chars.push(c); made.push(c);
      });
      for (let i = 0; i < 12; i++) syncChars(0.05);
      /* ON THE HEADS, AND ON THE MIDDLE ONE'S. Everything that separates the three tiers is
         above the collar, so a sheet framed on three whole bodies puts all of it in about nine
         pixels. But a bounding box over all three is no good either: they roll their own
         frames, so the box is driven by whichever happens to be tallest and the shot slides
         off centre. The MIDDLE body's own head bone is the anchor, and the radius is fixed. */
      const mid = charMeshes.get(made[1].id);
      for (const c of made) {
        const e = charMeshes.get(c.id);
        if (!e) continue;
        e.g.rotation.set(0, 0, 0); e.g.updateWorldMatrix(true, true);
      }
      const ctr = new THREE.Vector3();
      mid.headG.getWorldPosition(ctr);
      ctr.y += 0.22;
      const cam = camera.clone();
      cam.aspect = 2.2; cam.fov = 26;
      cam.position.set(ctr.x, ctr.y + 0.10, ctr.z + 4.05);
      cam.lookAt(ctr); cam.updateProjectionMatrix();
      const cv0 = renderer.domElement;
      const w0 = cv0.width, h0 = cv0.height, sw = cv0.style.width, sh = cv0.style.height;
      renderer.setSize(1200, 545, false);
      renderer.render(scene, cam);
      png.push(cv0.toDataURL('image/png').split(',')[1]);
      renderer.setSize(w0, h0, false);
      cv0.style.width = sw; cv0.style.height = sh;
    }
    hour = 11; if (typeof updateSky === 'function') updateSky();
    const ims = await Promise.all(png.map(d => new Promise(res => {
      const im = new Image(); im.onload = () => res(im); im.src = 'data:image/png;base64,' + d;
    })));
    const L = 28;
    const cv = document.createElement('canvas');
    cv.width = ims[0].width; cv.height = (ims[0].height + L) * 2;
    const g = cv.getContext('2d');
    g.fillStyle = '#12100d'; g.fillRect(0, 0, cv.width, cv.height);
    const caps = ['NOON   —        DORMANT              AWAKENED             NASCENT OLD ONE',
                  'AFTER DARK —    DORMANT              AWAKENED             NASCENT OLD ONE'];
    ims.forEach((im, i) => {
      const y = i * (im.height + L);
      g.fillStyle = '#f2d016'; g.font = 'bold 16px monospace';
      g.fillText(caps[i], 12, y + 20);
      g.drawImage(im, 0, y + L);
    });
    return cv.toDataURL('image/png').split(',')[1];
  });

  fs.writeFileSync(OUT, Buffer.from(shot, 'base64'));
  for (const [k, v] of Object.entries(R)) console.log('  ' + k.padEnd(26) + v);
  for (const e of errs) console.log('  PAGEERROR: ' + e);
  console.log('\n  ' + path.basename(OUT));
  const bad = Object.values(R).map(String).filter(v => v.startsWith('!!'));
  console.log('\n' + (bad.length || errs.length ? 'THE RIDER IS STILL INVISIBLE' : 'ONE OF US IS POLITE ABOUT IT'));
  await b.close();
  process.exit(bad.length || errs.length ? 1 : 0);
})();
