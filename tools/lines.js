#!/usr/bin/env node
/* EVERY LINE OF A RACE, SIDE BY SIDE.
 *
 * A subrace can be given a skin colour in one line of a table and look, in that table, like a
 * finished piece of work. At play distance a colour is not a skin: two bodies of the same
 * silhouette in slightly different browns are the same character, and the only honest way to
 * know whether a line reads is to stand them next to each other and look.
 *
 *   node tools/lines.js golem out.png        # one race, every line
 *   node tools/lines.js chimera out.png
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const RACE = process.argv[2] || 'golem';
const OUT = path.resolve(process.argv[3] || path.join(__dirname, 'lines-' + RACE + '.png'));
const gamePath = (a) => path.resolve(a ? (path.isAbsolute(a) ? a : path.join(__dirname, a)) : path.join(__dirname, 'game.html'));

(async () => {
  const b = await chromium.launch({
    executablePath: process.env.DUSTWARD_CHROME || undefined,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'],
  });
  const p = await b.newPage({ viewport: { width: 900, height: 760 }, deviceScaleFactor: 2 });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message.slice(0, 200)));
  await p.goto('file://' + gamePath(process.argv[4]), { waitUntil: 'load' });
  await p.waitForTimeout(3000);
  await p.evaluate(() => document.getElementById('btn-start').click());
  await p.waitForTimeout(2000);

  const info = await p.evaluate((race) => {
    paused = true; syncPauseBtn(); hour = 11;
    debugSeeAll = true;
    if (typeof fogPlane !== 'undefined') fogPlane.visible = false;
    if (typeof syncDecorFogFull === 'function') syncDecorFogFull();
    const me = player()[0];
    let spot = null;
    for (const pad of [7, 5, 4]) {
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
    return { keys: Object.keys(SUBRACES[race] || {}), labels: Object.values(SUBRACES[race] || {}).map(v => v.label) };
  }, RACE);
  if (info.fail || !info.keys.length) { console.log('*** ' + (info.fail || 'no lines for ' + RACE)); await b.close(); process.exitCode = 1; return; }

  const rows = [];
  for (const key of info.keys) {
    const shots = [];
    await p.evaluate(({ race, key }) => {
      chars.length = 0;
      charMeshes.forEach(e => { if (e.g && e.g.parent) e.g.parent.remove(e.g); });
      charMeshes.clear();
      const s = window.__spot;
      const c = makeChar('X', 'player', s.x, s.y, { race, sub: key, atk: 12, def: 12, tough: 12, ath: 6, sex: 'm' });
      c.dir = 0; c.state = 'ok';
      chars.push(c); window.__id = c.id;
      document.querySelectorAll('.hud,#charpanel,#invpanel,#minimap,#log,#tip,#squadbar,#buildbar,#touchbar')
        .forEach(el => el.style.setProperty('display', 'none', 'important'));
    }, { race: RACE, key });
    await p.waitForTimeout(3200);
    for (const yaw of [0, 2.5]) {
      const shot = await p.evaluate((yaw) => {
        const e = charMeshes.get(window.__id);
        if (!e) return null;
        e.rotY = yaw; e.g.rotation.set(0, yaw, 0);
        e.g.updateWorldMatrix(true, true);
        const bb = new THREE.Box3().setFromObject(e.g);
        const ctr = bb.getCenter(new THREE.Vector3());
        const r = Math.max(bb.max.y - bb.min.y, bb.max.x - bb.min.x) * 0.62;
        const cam = camera.clone();
        cam.aspect = 1; cam.fov = 34;
        cam.position.set(ctr.x, ctr.y + r * 0.05, ctr.z + r * 3.2);
        cam.lookAt(ctr); cam.updateProjectionMatrix();
        const cv = renderer.domElement;
        const w0 = cv.width, h0 = cv.height, sw = cv.style.width, sh = cv.style.height;
        renderer.setSize(460, 460, false);
        renderer.render(scene, cam);
        const url = cv.toDataURL('image/png');
        renderer.setSize(w0, h0, false);
        cv.style.width = sw; cv.style.height = sh;
        return url.split(',')[1];
      }, yaw);
      shots.push(shot);
    }
    const n = await p.evaluate(() => {
      const e = charMeshes.get(window.__id);
      if (!e) return 0;
      let n = 0, tris = 0;
      e.g.traverse(o => { if (!o.isMesh) return; let v = o.visible, q = o.parent; while (q && v) { v = q.visible; q = q.parent; } if (v) { n++; tris += o.geometry.index ? o.geometry.index.count / 3 : 0; } });
      return { n, tris };
    });
    rows.push({ key, label: info.labels[info.keys.indexOf(key)], shots });
    console.log(`  ${key.padEnd(11)} ${n.n} meshes, ${n.tris} tris`);
  }

  const sheet = await p.evaluate(async ({ rows, race }) => {
    const all = await Promise.all(rows.map(r => Promise.all(r.shots.map(d => new Promise(res => {
      const im = new Image(); im.onload = () => res(im); im.src = 'data:image/png;base64,' + d;
    })))));
    const w = 330, h = 330, LBL = 28;
    const cv = document.createElement('canvas');
    cv.width = w * all.length; cv.height = (h + LBL) * 2;
    const g = cv.getContext('2d');
    g.fillStyle = '#12100d'; g.fillRect(0, 0, cv.width, cv.height);
    all.forEach((row, i) => {
      row.forEach((im, j) => {
        const top = j * (h + LBL);
        if (j === 0) { g.fillStyle = '#e8dcc4'; g.font = 'bold 18px monospace'; g.fillText(rows[i].label, i * w + 10, top + 20); }
        else { g.fillStyle = '#8a8272'; g.font = '14px monospace'; g.fillText('(from behind)', i * w + 10, top + 19); }
        const k = Math.min(w / im.width, h / im.height);
        g.drawImage(im, i * w + (w - im.width * k) / 2, top + LBL, im.width * k, im.height * k);
        g.strokeStyle = '#3a342a'; g.strokeRect(i * w + 0.5, top + LBL + 0.5, w - 1, h - 1);
      });
    });
    return cv.toDataURL('image/png').split(',')[1];
  }, { rows, race: RACE });

  fs.writeFileSync(OUT, Buffer.from(sheet, 'base64'));
  console.log(`${path.basename(OUT)} — ${rows.length} lines of ${RACE}`);
  if (errs.length) { console.log('errs:', errs.length); errs.slice(0, 3).forEach(e => console.log('  ' + e)); }
  await b.close();
})();
