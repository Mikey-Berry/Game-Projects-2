#!/usr/bin/env node
/* THE WATCHERS, CLOSE ENOUGH TO JUDGE.
 *
 * Not a test — a camera. `watchrigs.js` asserts the things a number can carry: that Choir-Kin
 * has a rig of its own rather than the quadruped fallback, that the new ones stand upright,
 * that no two share a part count, that a Choir-Kin is 2.97 times taller than it is wide against
 * a dust hound's 0.56. Every one of those is a proportion, and not one of them can answer
 * "does it read as an eldritch horror or as an animal", which is a judgement about a picture.
 *
 * So: every kind of Watcher, bare, at three angles, plus the dust hound they used to borrow —
 * because the complaint was a COMPARISON and the sheet should carry both halves of it.
 *
 *   node tools/gauntpix.js [outdir] [game.html]
 *
 * writes  gaunt-watchers.png   every kind, front / three-quarter / behind
 *         gaunt-atplay.png     and what they look like at the camera you actually play at
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
  p.on('pageerror', e => errs.push(String(e.message).slice(0, 200)));
  await p.goto('file://' + gamePath(process.argv[3]), { waitUntil: 'load' });
  await p.waitForSelector('#btn-start', { state: 'attached', timeout: 60000 });
  await p.evaluate(() => document.getElementById('btn-start').click());
  await p.waitForTimeout(2600);

  const info = await p.evaluate(() => {
    paused = true; syncPauseBtn(); hour = 11;
    debugSeeAll = true;
    if (typeof fogPlane !== 'undefined') fogPlane.visible = false;
    if (typeof syncDecorFogFull === 'function') syncDecorFogFull();
    document.querySelectorAll('.hud,#charpanel,#invpanel,#minimap,#log,#tip,#squadbar,#buildbar,#touchbar')
      .forEach(el => el.style.setProperty('display', 'none', 'important'));
    /* ---------- LOOSEN THE PAD BEFORE GIVING UP ----------
       A seven-tile square with no boulder, no tree, no water and nothing blocking anywhere
       within 260 tiles of the start is a demand this map does not always meet — mimicpix walks
       the pad down from 8 to 4 for the same reason and this one did not, so it reported "NO
       OPEN GROUND" and took no pictures at all. The body is two tiles across; three is plenty. */
    const me = player()[0];
    let spot = null;
    for (const pad of [7, 5, 3, 2]) {
      for (let r = 30; r < 320 && !spot; r += 4) for (let a = 0; a < 32 && !spot; a++) {
        const x = me.x + Math.cos(a / 32 * 6.283) * r, y = me.y + Math.sin(a / 32 * 6.283) * r;
        if (x < 12 || y < 12 || x >= W - 12 || y >= H - 12) continue;
        let ok = true;
        for (let dy = -pad; dy <= pad && ok; dy++) for (let dx = -pad; dx <= pad && ok; dx++) {
          const ix = Math.floor(x) + dx, iy = Math.floor(y) + dy;
          if (isBlocked(ix + 0.5, iy + 0.5, 0) || terr[iy * W + ix] === 3 || decorAt(ix, iy)) ok = false;
        }
        if (ok) spot = { x, y };
      }
      if (spot) break;
    }
    if (!spot) return { fail: 'NO OPEN GROUND' };
    window.__spot = spot;
    return { ok: true };
  });
  if (info.fail) { console.log('*** ' + info.fail); await b.close(); process.exitCode = 1; return; }

  /* one body at a time, alone on the ground, with the cached rigs dropped between each —
     the mesh is cached per id and a stale one on screen makes the picture a lie */
  const stage = async (kind) => {
    await p.evaluate((kind) => {
      chars.length = 0;
      charMeshes.forEach(e => { if (e.g && e.g.parent) e.g.parent.remove(e.g); });
      charMeshes.clear();
      const s = window.__spot;
      const c = kind === 'hound'
        ? (() => { const h = makeChar('Dust Hound', 'wild', s.x, s.y, { atk: 8, def: 8 }); h.beast = true; h.kin = 'hound'; chars.push(h); return h; })()
        : spawnGaunt(kind, s.x, s.y);
      c.x = s.x; c.y = s.y; c.dir = 0; c.state = 'ok';
      window.__id = c.id;
    }, kind);
    await p.waitForTimeout(1800);
  };
  const shoot = async (yaw) => p.evaluate((yaw) => {
    const e = charMeshes.get(window.__id);
    if (!e) return null;
    e.rotY = yaw; e.g.rotation.set(0, yaw, 0);
    e.g.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(e.g);
    const ctr = box.getCenter(new THREE.Vector3());
    const span = Math.max(box.max.y - box.min.y, box.max.x - box.min.x, 0.2);
    const r = span * 0.68;
    const cam = camera.clone();
    cam.aspect = 1; cam.fov = 34;
    cam.position.set(ctr.x, ctr.y + r * 0.05, ctr.z + r * 3.2);
    cam.lookAt(ctr); cam.updateProjectionMatrix();
    const cv = renderer.domElement;
    const w0 = cv.width, h0 = cv.height, sw = cv.style.width, sh = cv.style.height;
    renderer.setSize(520, 520, false);
    renderer.render(scene, cam);
    const url = cv.toDataURL('image/png');
    renderer.setSize(w0, h0, false);
    cv.style.width = sw; cv.style.height = sh;
    return url.split(',')[1];
  }, yaw);

  const KINDS = [['gaunt', 'GAUNT'], ['choir', 'CHOIR-KIN'], ['shrike', 'SHRIKE'],
                 ['stalker', 'THIN STALKER'], ['larder', 'LARDER-KIN'], ['maw', 'CARRION MAW'],
                 ['hound', 'a dust hound']];
  const rows = [];
  for (const [k, label] of KINDS) {
    await stage(k);
    rows.push({ label, shots: [await shoot(0), await shoot(2.4), await shoot(Math.PI)] });
  }

  const written = [];
  {
    const data = await p.evaluate(async ({ rows, cols, title }) => {
      const all = await Promise.all(rows.map(r => Promise.all(r.shots.map(d => d ? new Promise(res => {
        const im = new Image(); im.onload = () => res(im); im.src = 'data:image/png;base64,' + d;
      }) : null))));
      const w = 300, h = 300, LBL = 28, TOP = 34;
      const cv = document.createElement('canvas');
      cv.width = w * rows.length; cv.height = TOP + (h + LBL) * 3;
      const g = cv.getContext('2d');
      g.fillStyle = '#12100d'; g.fillRect(0, 0, cv.width, cv.height);
      g.fillStyle = '#c8a86a'; g.font = 'bold 17px monospace';
      g.fillText(title, 10, 22);
      all.forEach((row, i) => row.forEach((im, j) => {
        const top = TOP + j * (h + LBL);
        g.fillStyle = j === 0 ? '#e8dcc4' : '#8a8272';
        g.font = j === 0 ? 'bold 16px monospace' : '13px monospace';
        g.fillText(j === 0 ? rows[i].label : cols[j], i * w + 8, top + 19);
        if (!im) return;
        const k2 = Math.min(w / im.width, h / im.height);
        g.drawImage(im, i * w + (w - im.width * k2) / 2, top + LBL, im.width * k2, im.height * k2);
        g.strokeStyle = '#3a342a'; g.strokeRect(i * w + 0.5, top + LBL + 0.5, w - 1, h - 1);
      }));
      return cv.toDataURL('image/png').split(',')[1];
    }, { rows, cols: ['', 'three-quarter', 'from behind'], title: 'THE WATCHERS — every kind, bare, and the animal they used to borrow' });
    const out = path.join(OUTDIR, 'gaunt-watchers.png');
    fs.writeFileSync(out, Buffer.from(data, 'base64'));
    console.log('  gaunt-watchers.png     every kind at three angles, with a dust hound for scale');
    written.push(out);
  }

  /* and at the camera you actually play at, which is the only one that matters */
  {
    await p.evaluate(() => {
      chars.length = 0;
      charMeshes.forEach(e => { if (e.g && e.g.parent) e.g.parent.remove(e.g); });
      charMeshes.clear();
      const s = window.__spot;
      ['gaunt', 'choir', 'shrike'].forEach((k, i) => {
        const g2 = spawnGaunt(k, s.x + (i - 1) * 2.4, s.y);
        g2.x = s.x + (i - 1) * 2.4; g2.y = s.y; g2.dir = 0; g2.state = 'ok';
      });
      const h = makeChar('Dust Hound', 'wild', s.x + 3.6, s.y, { atk: 8, def: 8 });
      h.beast = true; h.kin = 'hound'; h.x = s.x + 3.6; h.y = s.y; h.state = 'ok'; chars.push(h);
      camX = camSX = s.x + 0.6; camY = camSY = s.y;
      camDist = camDistTarget = 15; camPitch = camPitchT = 0.62; camYaw = camYawT = 0; camFollow = false;
    });
    await p.waitForTimeout(2600);
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
    const out = path.join(OUTDIR, 'gaunt-atplay.png');
    fs.writeFileSync(out, Buffer.from(data, 'base64'));
    console.log('  gaunt-atplay.png       gaunt, choir, shrike and a hound at play distance');
    written.push(out);
  }

  for (const e of errs) console.log('  PAGEERROR ' + e);
  console.log('\n' + written.length + ' sheets written to ' + OUTDIR);
  await b.close();
})();
