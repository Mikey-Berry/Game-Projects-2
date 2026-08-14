#!/usr/bin/env node
/* THE AUTHORED WEAPONS, IN A HAND.
 *
 * A baked model arrives in a unit box, centred on its own bounding volume and scaled so its
 * longest axis is exactly 1. None of "how long is it", "where is the grip" or "which way does
 * it point" survives that, and all three are properties of whoever exported the file rather
 * than of this game. So they cannot be reasoned out — they have to be looked at, and the only
 * view that matters is the one the game actually draws: hung off `e.elbR`, at rest and
 * mid-swing, next to the box weapon it replaces.
 *
 * The fit can be overridden on the command line so the numbers can be found in one browser
 * session instead of one rebuild of a 1.4 MB HTML file per guess:
 *
 *   node tools/wepglb.js out.png
 *   node tools/wepglb.js out.png '{"w_sever":{"s":0.95,"y":-0.6,"rz":180}}'
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const gamePath = (a) => path.resolve(a ? (path.isAbsolute(a) ? a : path.join(__dirname, a)) : path.join(__dirname, 'game.html'));
const OUT = path.resolve(process.argv[2] || path.join(__dirname, 'wepglb.png'));
const OVERRIDE = process.argv[3] ? JSON.parse(process.argv[3]) : null;

(async () => {
  const b = await chromium.launch({
    executablePath: process.env.DUSTWARD_CHROME || undefined,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'],
  });
  const p = await b.newPage({ viewport: { width: 900, height: 820 }, deviceScaleFactor: 2 });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message.slice(0, 200)));
  await p.goto('file://' + gamePath(process.argv[4]), { waitUntil: 'load' });
  await p.waitForTimeout(3000);
  await p.evaluate(() => document.getElementById('btn-start').click());
  await p.waitForTimeout(2000);

  const keys = await p.evaluate((OVERRIDE) => {
    paused = true; syncPauseBtn(); hour = 11; debugSeeAll = true;
    if (typeof fogPlane !== 'undefined') fogPlane.visible = false;
    if (typeof syncDecorFogFull === 'function') syncDecorFogFull();
    if (OVERRIDE) for (const k of Object.keys(OVERRIDE)) Object.assign(WEPFIT[k], OVERRIDE[k]);
    const me = player()[0];
    let spot = null;
    for (const pad of [6, 5, 4]) {
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
    window.__spot = spot;
    document.querySelectorAll('.hud,#charpanel,#invpanel,#minimap,#log,#tip,#squadbar,#buildbar,#touchbar')
      .forEach(el => el.style.setProperty('display', 'none', 'important'));
    return Object.keys(WEPFIT);
  }, OVERRIDE);

  /* one row per authored weapon; the last row is a box weapon for the size comparison, since
     "does it read as the right length" is a question about the other weapons in the game */
  const rows = [];
  for (const key of [...keys, 'w_nod']) {
    const shots = [];
    await p.evaluate((key) => {
      chars.length = 0;
      charMeshes.forEach(e => { if (e.g && e.g.parent) e.g.parent.remove(e.g); });
      charMeshes.clear();
      const s = window.__spot;
      const c = makeChar('X', 'player', s.x, s.y, { atk: 16, def: 14, tough: 14, ath: 8, sex: 'm' });
      c.weapon = key; c.armor = 'a_lea'; c.dir = 0; c.state = 'ok';
      chars.push(c); window.__id = c.id;
    }, key);
    await p.waitForTimeout(2800);
    /* at rest from two angles, then mid-swing — a weapon can hang correctly and still sweep
       through the body once the arm moves, and the swing is where the grip offset shows */
    for (const [lbl, yaw, swing, onWep] of [['at rest', 0.0, 0, 0], ['mid-swing', 0.5, 1, 0], ['close', 0.9, 0, 1]]) {
      const shot = await p.evaluate(({ yaw, swing, onWep }) => {
        const e = charMeshes.get(window.__id), c = chars.find(x => x.id === window.__id);
        e.rotY = yaw; e.g.rotation.set(0, yaw, 0);
        if (swing) {
          /* drive the real animator into a swing rather than posing the arm by hand, so what
             is photographed is the pose the game produces */
          c.windup = { t: 0.02, kind: 'melee', dur: 0.26, move: (typeof pickMove === 'function' ? pickMove(c) : null) };
          for (let i = 0; i < 8; i++) syncChars(0.03);
        }
        e.g.updateWorldMatrix(true, true);
        /* The body shots answer "does it hang right". They cannot answer "is the muzzle
           pointing the way a muzzle should" — at body distance a lance is four pixels wide.
           So the last frame is the camera on the WEAPON's own bounds. */
        const bb = new THREE.Box3().setFromObject(onWep && e.weapon ? e.weapon : e.g);
        const ctr = bb.getCenter(new THREE.Vector3());
        const r = Math.max(bb.max.y - bb.min.y, bb.max.x - bb.min.x, onWep ? bb.max.z - bb.min.z : 0) * 0.60;
        const cam = camera.clone();
        cam.aspect = 1; cam.fov = 34;
        cam.position.set(ctr.x, ctr.y + r * 0.05, ctr.z + r * 3.2);
        cam.lookAt(ctr); cam.updateProjectionMatrix();
        const cv = renderer.domElement;
        const w0 = cv.width, h0 = cv.height, sw = cv.style.width, sh = cv.style.height;
        renderer.setSize(440, 440, false);
        renderer.render(scene, cam);
        const url = cv.toDataURL('image/png');
        renderer.setSize(w0, h0, false);
        cv.style.width = sw; cv.style.height = sh;
        return url.split(',')[1];
      }, { yaw, swing, onWep });
      shots.push({ lbl, shot });
    }
    /* and the numbers that decide whether the fit is right at all */
    const m = await p.evaluate(() => {
      const e = charMeshes.get(window.__id);
      if (!e || !e.weapon) return null;
      e.g.updateWorldMatrix(true, true);
      const wb = new THREE.Box3().setFromObject(e.weapon);
      const bb = new THREE.Box3().setFromObject(e.g);
      const sz = wb.getSize(new THREE.Vector3());
      /* the fist is the anchor everything is judged against */
      const fist = new THREE.Vector3();
      e.elbR.getWorldPosition(fist);
      fist.y -= 0.30;
      return {
        len: +Math.max(sz.x, sz.y, sz.z).toFixed(3),
        tris: e.weapon.geometry.index ? e.weapon.geometry.index.count / 3 : 0,
        lowest: +(wb.min.y - bb.min.y).toFixed(3),
        reachBelowFist: +(fist.y - wb.min.y).toFixed(3),
        gripOffFist: +wb.getCenter(new THREE.Vector3()).distanceTo(fist).toFixed(3),
      };
    });
    rows.push({ key, shots, m });
    console.log(`  ${key.padEnd(9)} ${m ? `${m.len} long, ${m.tris} tris, reaches ${m.reachBelowFist} below the fist, centre ${m.gripOffFist} off it` : 'NO WEAPON MESH'}`);
  }

  const sheet = await p.evaluate(async (rows) => {
    const all = await Promise.all(rows.map(r => Promise.all(r.shots.map(s => new Promise(res => {
      const im = new Image(); im.onload = () => res(im); im.src = 'data:image/png;base64,' + s.shot;
    })))));
    const w = 300, h = 300, L = 26;
    const cv = document.createElement('canvas');
    cv.width = w * 3; cv.height = (h + L) * all.length;
    const g = cv.getContext('2d');
    g.fillStyle = '#12100d'; g.fillRect(0, 0, cv.width, cv.height);
    all.forEach((row, i) => row.forEach((im, j) => {
      const cx = j * w, cy = i * (h + L);
      g.fillStyle = '#e8dcc4'; g.font = 'bold 14px monospace';
      g.fillText(j === 0 ? rows[i].key : rows[i].shots[j].lbl, cx + 8, cy + 17);
      const k = Math.min(w / im.width, h / im.height);
      g.drawImage(im, cx + (w - im.width * k) / 2, cy + L, im.width * k, im.height * k);
      g.strokeStyle = '#3a342a'; g.strokeRect(cx + 0.5, cy + L + 0.5, w - 1, h - 1);
    }));
    return cv.toDataURL('image/png').split(',')[1];
  }, rows);

  fs.writeFileSync(OUT, Buffer.from(sheet, 'base64'));
  console.log(path.basename(OUT));
  if (errs.length) { console.log('errs:', errs.length); errs.slice(0, 3).forEach(e => console.log('  ' + e)); }
  await b.close();
})();
