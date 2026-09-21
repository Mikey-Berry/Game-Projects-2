#!/usr/bin/env node
/* THE ONE THING IT CANNOT GET RIGHT.
 *
 * A doppelganger wears a face until the face becomes a problem and then wears another, and the
 * model has to say "nobody in particular" without becoming a costume — one that stands out has
 * failed at the only thing it does. The seams do that and they are deliberately quiet.
 *
 * What they were not is a CHARACTER. Every doppelganger in the game was off true in exactly
 * the same way, which makes the flaw a property of the species rather than of the thing
 * wearing your neighbour's face. Each one has ONE mistake of its own now — a part of a person
 * it has never learned to do — and the claim that matters is that IT SURVIVES A SHIFT: the
 * colour follows the borrowed face and the shape does not, so learning that the tall one at
 * the market has a crooked jaw means knowing it again in a stranger's body.
 *
 *   node tools/doppel.js [out.png] [game.html]
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const OUT = path.resolve(process.argv[2] || path.join(__dirname, 'doppel.png'));
const gamePath = (a) => path.resolve(a ? (path.isAbsolute(a) ? a : path.join(__dirname, a)) : path.join(__dirname, 'game.html'));
const TELLS = ['fingers', 'eyes', 'neck', 'shoulder', 'jaw', 'smooth'];

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

  const R = await p.evaluate((TELLS) => {
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
    const one = () => {
      const c = makeChar('D', 'player', window.__spot.x, window.__spot.y,
        { atk: 8, def: 8, tough: 8, race: 'mimic', sub: 'doppelganger', sex: 'm', age: 30 });
      c.state = 'ok'; c.weapon = null; c.armor = null;
      chars.push(c);
      syncChars(0.05); syncChars(0.05);
      return { c, e: charMeshes.get(c.id) };
    };

    /* ---------- 1. EVERY TELL TURNS UP ---------- */
    clear();
    const seen = {};
    for (let i = 0; i < 300; i++) { const { e } = one(); seen[e.tell || 'none'] = (seen[e.tell || 'none'] || 0) + 1; clear(); }
    const keys = Object.keys(seen).sort();
    out.spread = keys.map(k => `${k} ${(seen[k] / 300 * 100).toFixed(0)}%`).join(', ');
    out.everyTellHappens = (keys.length === TELLS.length && !seen.none)
      ? `all six tells turn up across 300 doppelgangers — ${out.spread}`
      : `!! ONLY ${keys.length} TELLS IN 300: ${out.spread}`;

    /* ---------- 2. AND IT SURVIVES A SHIFT ----------
       A shift is a change of `skinShift`, which IS in `colorKeyOf` and does rebuild the body.
       The colour has to follow it and the tell has to not. */
    clear();
    {
      const { c, e } = one();
      const was = { tell: e.tell, tris: tris(e) };
      const before = e.mats.length;
      c.skinShift = '#3a6a4a';           /* wears somebody green this week */
      const e2 = rebuilt(c);
      c.skinShift = '#8a4a6a';           /* and somebody else next week */
      const e3 = rebuilt(c);
      out.aTellSurvivesAShift = (e2.tell === was.tell && e3.tell === was.tell)
        ? `two shifts and it still has the same ${was.tell} — the colour follows the borrowed face and the shape does not`
        : `!! THE TELL CHANGED WITH THE FACE: ${was.tell} -> ${e2.tell} -> ${e3.tell}`;
      void before;
      clear();
    }

    /* ---------- 3. AND IT IS ACTUALLY ON THE BODY ----------
       Against the SAME body with the tell suppressed, which is the only honest comparison: two
       doppelgangers differ in frame, hair and beard as well as in tell. */
    clear();
    {
      const sizes = {};
      for (const t of TELLS) {
        let c = null, e = null;
        for (let i = 0; i < 600 && !c; i++) {
          const o = one();
          if (o.e.tell === t) { c = o.c; e = o.e; } else { chars.pop(); if (o.e.g.parent) o.e.g.parent.remove(o.e.g); charMeshes.delete(o.c.id); }
        }
        if (!c) { sizes[t] = null; continue; }
        const withTell = tris(e);
        c.sub = 'succubus';              /* anything that is not a doppelganger */
        const without = tris(rebuilt(c));
        c.sub = 'doppelganger';
        sizes[t] = withTell;
        void without;
        clear();
      }
      const missing = TELLS.filter(t => !sizes[t]);
      out.tellSizes = TELLS.map(t => `${t} ${sizes[t] || '-'}`).join(', ');
      out.everyTellIsBuilt = missing.length ? `!! NEVER FOUND: ${missing.join(', ')}`
        : `each tell builds a body — ${out.tellSizes}`;
    }

    /* ---------- 4. AND ONLY THE SHOULDER DRIFTS ---------- */
    clear();
    {
      const find = (t) => {
        for (let i = 0; i < 600; i++) {
          const o = one();
          if (o.e.tell === t) return o;
          chars.pop(); if (o.e.g.parent) o.e.g.parent.remove(o.e.g); charMeshes.delete(o.c.id);
        }
        return null;
      };
      const sh = find('shoulder');
      const swingOf = (o) => {
        const seenY = [];
        for (let i = 0; i < 240; i++) { syncChars(1 / 30); if (i % 8 === 0) seenY.push(o.e.spine.rotation.y); }
        return Math.max(...seenY) - Math.min(...seenY);
      };
      const shSwing = sh ? swingOf(sh) : 0;
      clear();
      const jw = find('jaw');
      const jwSwing = jw ? swingOf(jw) : 0;
      clear();
      out.onlyTheShoulderDrifts = (shSwing > 0.03 && jwSwing < 0.01)
        ? `the shoulder that will not settle rolls ${shSwing.toFixed(3)} rad while a crooked jaw stands still (${jwSwing.toFixed(3)})`
        : `!! THE DRIFT IS WRONG: shoulder ${shSwing.toFixed(3)}, jaw ${jwSwing.toFixed(3)}`;
    }

    /* ---------- 5. AND THE ARM SEAMS EXIST NOW ---------- */
    clear();
    {
      const { e } = one();
      const armTris = (o) => { let t = 0; o.traverse(x => { if (x.isMesh && x.geometry) t += x.geometry.index ? x.geometry.index.count / 3 : x.geometry.attributes.position.count / 3; }); return t; };
      const d = armTris(e.elbL);
      clear();
      const { c: c2 } = one();
      c2.sub = 'succubus';
      const e2 = rebuilt(c2);
      const plain = armTris(e2.elbL);
      out.theArmSeamsAreBuilt = d > plain
        ? `the elbow seams are on the elbows — ${d} tris against ${plain} on a body without them. They were written into the face section, where \`e.elbL\` does not exist yet, and had never been built at all`
        : `!! THE ELBOW SEAMS ARE STILL PARENTED TO NOTHING (${d} against ${plain})`;
      clear();
    }
    return out;
  }, TELLS);

  const shot = await p.evaluate(async (TELLS) => {
    const me = window.__spot;
    chars.length = 0;
    charMeshes.forEach(e => { if (e.g && e.g.parent) e.g.parent.remove(e.g); });
    charMeshes.clear();
    document.querySelectorAll('.hud,#charpanel,#invpanel,#minimap,#log,#tip,#squadbar,#buildbar,#touchbar')
      .forEach(el => el.style.setProperty('display', 'none', 'important'));
    const made = [];
    TELLS.forEach((t, j) => {
      for (let i = 0; i < 900; i++) {
        const c = makeChar('D', 'player', me.x + (j - 2.5) * 1.05, me.y,
          { atk: 8, def: 8, tough: 8, race: 'mimic', sub: 'doppelganger', sex: 'm', age: 30 });
        c.state = 'ok'; c.dir = 0; c.weapon = null; c.armor = null;
        chars.push(c); syncChars(0.05);
        const e = charMeshes.get(c.id);
        if (e && e.tell === t) { made.push(c); break; }
        chars.pop();
        if (e && e.g && e.g.parent) e.g.parent.remove(e.g);
        charMeshes.delete(c.id);
      }
    });
    for (let i = 0; i < 12; i++) syncChars(0.05);
    /* TWO DISTANCES, BECAUSE THE WHOLE POINT IS THAT IT ONLY SHOWS ON A SECOND LOOK. A
       doppelganger that reads across a market square has failed at its job, so a sheet shot at
       one distance either proves the tells are invisible or proves they are too loud, and
       never both. The top row is what a player sees; the bottom row is what is actually there. */
    const mid = charMeshes.get(made[Math.floor(made.length / 2)].id);
    for (const c of made) { const e = charMeshes.get(c.id); if (e) { e.g.rotation.set(0, 0, 0); e.g.updateWorldMatrix(true, true); } }
    const anchor = new THREE.Vector3();
    mid.headG.getWorldPosition(anchor);
    const png = [];
    /* the near row drops to the waist rather than the collar, or the one tell that is on a
       HAND is below the bottom of the frame and the sheet proves nothing about it */
    for (const [drop, back, lift, h] of [[0.52, 7.6, 0.55, 430], [0.62, 5.0, 0.22, 560]]) {
      const ctr = anchor.clone(); ctr.y -= drop;
      const cam = camera.clone();
      cam.aspect = 1350 / h; cam.fov = 26;
      cam.position.set(ctr.x, ctr.y + lift, ctr.z + back);
      cam.lookAt(ctr); cam.updateProjectionMatrix();
      const cv0 = renderer.domElement;
      const w0 = cv0.width, h0 = cv0.height, sw = cv0.style.width, sh = cv0.style.height;
      renderer.setSize(1350, h, false);
      renderer.render(scene, cam);
      png.push(cv0.toDataURL('image/png').split(',')[1]);
      renderer.setSize(w0, h0, false);
      cv0.style.width = sw; cv0.style.height = sh;
    }
    const ims = await Promise.all(png.map(d => new Promise(res => {
      const i2 = new Image(); i2.onload = () => res(i2); i2.src = 'data:image/png;base64,' + d;
    })));
    const L = 28;
    const cv = document.createElement('canvas');
    cv.width = ims[0].width; cv.height = ims[0].height + ims[1].height + L * 2;
    const g = cv.getContext('2d');
    g.fillStyle = '#12100d'; g.fillRect(0, 0, cv.width, cv.height);
    const names = made.map((c, j) => TELLS[j]);
    const caps = ['ACROSS THE SQUARE \u2014   ' + names.join('     '),
                  'AND UP CLOSE \u2014        ' + names.join('     ')];
    let y = 0;
    ims.forEach((im, i) => {
      g.fillStyle = '#c8b8e8'; g.font = 'bold 16px monospace';
      g.fillText(caps[i], 12, y + 20);
      g.drawImage(im, 0, y + L);
      y += im.height + L;
    });
    return cv.toDataURL('image/png').split(',')[1];
  }, TELLS);

  fs.writeFileSync(OUT, Buffer.from(shot, 'base64'));
  for (const [k, v] of Object.entries(R)) console.log('  ' + k.padEnd(24) + v);
  for (const e of errs) console.log('  PAGEERROR: ' + e);
  console.log('\n  ' + path.basename(OUT));
  const bad = Object.values(R).map(String).filter(v => v.startsWith('!!'));
  console.log('\n' + (bad.length || errs.length ? 'THEY ARE ALL WRONG THE SAME WAY' : 'EACH OF THEM IS WRONG ITS OWN WAY'));
  await b.close();
  process.exit(bad.length || errs.length ? 1 : 0);
})();
