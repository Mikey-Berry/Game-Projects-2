#!/usr/bin/env node
/* THE THREE MIMICS, CLOSE ENOUGH TO JUDGE.
 *
 * Not a test — a camera. `mimics.js` asserts that each line puts real geometry on a real body
 * (22/17/24 boxes against a plain human's 10) and that the Fallen and the Messenger share the
 * old-god motif. Every one of those is a number, and none of them can tell you whether a face
 * READS: "more hair covering the face, exaggerated eyes, no visible mouth" is a judgement
 * about a picture and there is no assertion that stands in for looking at one.
 *
 * Three things `lines.js` does wrong for this particular question, all of them right for its
 * own: it dresses the body (a helmet hides the entire head, which on a succubus is the whole
 * of what anybody is tuning), it frames the WHOLE body so a face is forty pixels across, and
 * it builds one body per line so a palette of six skins shows exactly one of them.
 *
 *   node tools/mimicpix.js [outdir] [game.html]
 *
 * writes  mimic-bodies.png     three lines, bare, front / three-quarter / behind
 *         mimic-faces.png      the same three heads, close
 *         mimic-succubus.png   her face across all six skins her line can come in
 *         mimic-atplay.png     and what the three of them look like at the camera you play at
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const OUTDIR = path.resolve(process.argv[2] || __dirname);
const gamePath = (a) => path.resolve(a ? (path.isAbsolute(a) ? a : path.join(__dirname, a)) : path.join(__dirname, 'game.html'));

(async () => {
  const b = await chromium.launch({
    executablePath: process.env.DUSTWARD_CHROME || undefined,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'],
  });
  const p = await b.newPage({ viewport: { width: 1100, height: 760 }, deviceScaleFactor: 2 });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message.slice(0, 200)));
  await p.goto('file://' + gamePath(process.argv[3]), { waitUntil: 'load' });
  await p.waitForTimeout(3000);
  await p.evaluate(() => document.getElementById('btn-start').click());
  await p.waitForTimeout(2500);

  /* ---------- stage: flat open ground, noon, no fog, no HUD ---------- */
  const info = await p.evaluate(() => {
    paused = true; syncPauseBtn(); hour = 11;
    debugSeeAll = true;
    if (typeof fogPlane !== 'undefined') fogPlane.visible = false;
    if (typeof syncDecorFogFull === 'function') syncDecorFogFull();
    document.querySelectorAll('.hud,#charpanel,#invpanel,#minimap,#log,#tip,#squadbar,#buildbar,#touchbar')
      .forEach(el => el.style.setProperty('display', 'none', 'important'));
    const me = player()[0];
    let spot = null;
    for (const pad of [8, 6, 4]) {
      for (let r = 40; r < 240 && !spot; r += 4) for (let a = 0; a < 24 && !spot; a++) {
        const x = me.x + Math.cos(a / 24 * 6.283) * r, y = me.y + Math.sin(a / 24 * 6.283) * r;
        if (x < pad + 2 || y < pad + 2 || x >= self.W - pad - 2 || y >= self.H - pad - 2) continue;
        let ok = true;
        for (let dy = -pad; dy <= pad && ok; dy++) for (let dx = -pad; dx <= pad && ok; dx++) {
          const ix = Math.floor(x) + dx, iy = Math.floor(y) + dy;
          if (isBlocked(ix + 0.5, iy + 0.5, 0) || terr[iy * self.W + ix] === 3 || decorAt(ix, iy)) ok = false;
        }
        if (ok) spot = { x, y };
      }
      if (spot) break;
    }
    if (!spot) return { fail: 'NO OPEN GROUND' };
    window.__spot = spot;
    const t = SUBRACES.mimic || {};
    return { keys: Object.keys(t), labels: Object.values(t).map(v => v.label),
             skins: (t.succubus && t.succubus.skins) || [] };
  });
  if (info.fail) { console.log('*** ' + info.fail); await b.close(); process.exitCode = 1; return; }

  /* ---------- one bare body, and a shot of it ----------
     BARE IS THE POINT. `makeChar` rolls kit, and a helmet covers the entire head — which on a
     line whose face is the thing being tuned is the only part that matters. Cleared, and the
     rig rebuilt, because the mesh is cached against a signature that names the weapon and the
     armour: clearing the fields without dropping the cached rig leaves the old dressed body on
     screen and the picture lies. */
  const stage = async (opts) => {
    await p.evaluate((o) => {
      chars.length = 0;
      charMeshes.forEach(e => { if (e.g && e.g.parent) e.g.parent.remove(e.g); });
      charMeshes.clear();
      const s = window.__spot;
      const c = makeChar('X', 'player', s.x, s.y,
        { race: 'mimic', sub: o.key, atk: 10, def: 10, tough: 10, ath: 6, sex: o.sex || 'm' });
      c.weapon = null; c.armor = null; c.pack = null; c.helm = null;
      if (o.skin) c.skinShift = o.skin;      /* the one override that sits above the line's palette */
      c.dir = 0; c.state = 'ok';
      chars.push(c); window.__id = c.id;
    }, opts);
    await p.waitForTimeout(2600);
  };
  const shoot = async (yaw, framing) => p.evaluate(({ yaw, framing }) => {
    const e = charMeshes.get(window.__id);
    if (!e) return null;
    e.rotY = yaw; e.g.rotation.set(0, yaw, 0);
    e.g.updateWorldMatrix(true, true);
    /* frame on the HEAD GROUP for a face and on the whole rig for a body. `headG` is where the
       skull, the horns and everything a line draws on its own face are parented. */
    const box = new THREE.Box3().setFromObject(framing === 'face' && e.headG ? e.headG : e.g);
    const ctr = box.getCenter(new THREE.Vector3());
    const span = Math.max(box.max.y - box.min.y, box.max.x - box.min.x, 0.2);
    const r = span * (framing === 'face' ? 0.95 : 0.62);
    const cam = camera.clone();
    cam.aspect = 1; cam.fov = 34;
    cam.position.set(ctr.x, ctr.y + r * (framing === 'face' ? 0.02 : 0.05), ctr.z + r * 3.2);
    cam.lookAt(ctr); cam.updateProjectionMatrix();
    const cv = renderer.domElement;
    const w0 = cv.width, h0 = cv.height, sw = cv.style.width, sh = cv.style.height;
    renderer.setSize(520, 520, false);
    renderer.render(scene, cam);
    const url = cv.toDataURL('image/png');
    renderer.setSize(w0, h0, false);
    cv.style.width = sw; cv.style.height = sh;
    return url.split(',')[1];
  }, { yaw, framing });

  /* ---------- the contact sheet ---------- */
  const sheet = async (rows, cols, title, file) => {
    const data = await p.evaluate(async ({ rows, cols, title }) => {
      const all = await Promise.all(rows.map(r => Promise.all(r.shots.map(d => d ? new Promise(res => {
        const im = new Image(); im.onload = () => res(im); im.src = 'data:image/png;base64,' + d;
      }) : null))));
      const w = 340, h = 340, LBL = 30, TOP = 34;
      const cv = document.createElement('canvas');
      cv.width = w * rows.length; cv.height = TOP + (h + LBL) * all[0].length;
      const g = cv.getContext('2d');
      g.fillStyle = '#12100d'; g.fillRect(0, 0, cv.width, cv.height);
      g.fillStyle = '#c8a86a'; g.font = 'bold 17px monospace';
      g.fillText(title, 10, 22);
      all.forEach((row, i) => {
        row.forEach((im, j) => {
          const top = TOP + j * (h + LBL);
          g.fillStyle = j === 0 ? '#e8dcc4' : '#8a8272';
          g.font = j === 0 ? 'bold 18px monospace' : '14px monospace';
          g.fillText(j === 0 ? rows[i].label : cols[j], i * w + 10, top + 21);
          if (!im) return;
          const k = Math.min(w / im.width, h / im.height);
          g.drawImage(im, i * w + (w - im.width * k) / 2, top + LBL, im.width * k, im.height * k);
          g.strokeStyle = '#3a342a'; g.strokeRect(i * w + 0.5, top + LBL + 0.5, w - 1, h - 1);
        });
      });
      return cv.toDataURL('image/png').split(',')[1];
    }, { rows, cols, title });
    const out = path.join(OUTDIR, file);
    fs.writeFileSync(out, Buffer.from(data, 'base64'));
    console.log('  ' + file.padEnd(22) + rows.length + ' × ' + rows[0].shots.length);
    return out;
  };

  const written = [];

  /* ============ 1. BODIES, BARE ============ */
  {
    const rows = [];
    for (let i = 0; i < info.keys.length; i++) {
      await stage({ key: info.keys[i] });
      const shots = [];
      for (const yaw of [0, 0.9, 3.14]) shots.push(await shoot(yaw, 'body'));
      const n = await p.evaluate(() => {
        const e = charMeshes.get(window.__id); if (!e) return 0;
        let n = 0; e.g.traverse(o => { if (o.isMesh) n++; }); return n;
      });
      rows.push({ label: info.labels[i] + '  (' + n + ')', shots });
    }
    written.push(await sheet(rows, ['front', 'three-quarter', 'from behind'],
      'THE THREE MIMIC LINES — no kit, so the body is the line and not the loot', 'mimic-bodies.png'));
  }

  /* ============ 2. FACES, CLOSE ============ */
  {
    const rows = [];
    for (let i = 0; i < info.keys.length; i++) {
      await stage({ key: info.keys[i] });
      const shots = [];
      for (const yaw of [0, 0.8]) shots.push(await shoot(yaw, 'face'));
      rows.push({ label: info.labels[i], shots });
    }
    written.push(await sheet(rows, ['face on', 'three-quarter'],
      'THE SAME THREE HEADS, CLOSE — hair over the face, the eyes, and whether there is a mouth', 'mimic-faces.png'));
  }

  /* ============ 3. HER WHOLE PALETTE ============
     Six hides in the table and one body per line elsewhere, so five of them have never been
     looked at. `skinShift` is the doppelganger's own override and it sits above the line's
     palette in the colour ladder, which makes it the honest way to ask for a specific one. */
  if (info.skins.length) {
    const rows = [];
    for (const skin of info.skins) {
      await stage({ key: 'succubus', skin });
      const shots = [];
      for (const f of ['face', 'body']) shots.push(await shoot(0, f));
      rows.push({ label: skin, shots });
    }
    written.push(await sheet(rows, ['face', 'and at length'],
      'SUCCUBUS — all six hides her line can come in, chalk through soot', 'mimic-succubus.png'));
  }

  /* ============ 4. AND AT THE CAMERA YOU ACTUALLY PLAY AT ============
     A face that reads at three times zoom and vanishes at play distance is not a face that
     reads. This is the game's own camera, untouched, with the three of them standing together
     — which is also the only shot that shows whether the three lines tell APART. */
  {
    const shot = await p.evaluate((keys) => {
      chars.length = 0;
      charMeshes.forEach(e => { if (e.g && e.g.parent) e.g.parent.remove(e.g); });
      charMeshes.clear();
      const s = window.__spot;
      keys.forEach((k, i) => {
        const c = makeChar('X' + i, 'player', s.x + (i - 1) * 1.6, s.y, {
          race: 'mimic', sub: k, atk: 10, def: 10, tough: 10, ath: 6, sex: 'm' });
        c.weapon = null; c.armor = null; c.pack = null;
        c.dir = 0; c.state = 'ok';
        chars.push(c);
      });
      camX = camSX = s.x; camY = camSY = s.y; camFollow = false;
      return { x: s.x, y: s.y };
    }, info.keys);
    void shot;
    /* THE ZOOM IS `camDist`, and it LERPS toward `camDistTarget` — setting the target and
       shooting immediately photographs the journey. Set both. */
    await p.evaluate(() => { camDist = camDistTarget = 13; });
    await p.waitForTimeout(3200);
    const out = path.join(OUTDIR, 'mimic-atplay.png');
    /* READ THE CANVAS, DO NOT ASK PLAYWRIGHT FOR A SCREENSHOT. `page.screenshot` waits for the
       page to go quiet and this one never does — a game loop rendering every frame is exactly
       the thing it is waiting for, so it times out after thirty seconds having done nothing.
       The canvas is right there and every other shot in this file already comes off it. */
    /* THE SAME BLOCK EVERY OTHER SHOT IN THIS FILE USES, and for the same reason. The context
       has no `preserveDrawingBuffer`, so the back buffer is gone by the time anything outside
       a draw call asks for it: `page.screenshot` timed out waiting for a game loop to go quiet
       (it never does), and a bare `toDataURL` afterwards came back with a blank sheet. Set the
       size, render, read, put it back — all in one breath. The only difference from `shoot` is
       that the camera is the LIVE one, left exactly where the game put it. */
    const data = await p.evaluate(() => {
      const cam = camera.clone();
      cam.aspect = 1000 / 620; cam.updateProjectionMatrix();
      const cv = renderer.domElement;
      const w0 = cv.width, h0 = cv.height, sw = cv.style.width, sh = cv.style.height;
      renderer.setSize(1000, 620, false);
      renderer.render(scene, cam);
      const url = cv.toDataURL('image/png');
      renderer.setSize(w0, h0, false);
      cv.style.width = sw; cv.style.height = sh;
      return url.split(',')[1];
    });
    fs.writeFileSync(out, Buffer.from(data, 'base64'));
    console.log('  mimic-atplay.png       the game camera, all three together');
    written.push(out);
  }

  for (const e of errs) console.log('  PAGEERROR ' + e);
  console.log('\n' + written.length + ' sheets written to ' + OUTDIR);
  await b.close();
})();
