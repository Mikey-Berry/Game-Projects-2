#!/usr/bin/env node
/* THE WYRM, AT A SIZE YOU CAN JUDGE.
 *
 * "Wyrms should be bigger. Also their wing geometry is currently off."
 *
 * Neither half of that is a number. `wyrm.js` asserts the animal is larger than a grazer by a
 * bound, that the sweep reaches a rank, that the breath is a line — all true of a creature
 * whose wings are on backwards. Scale relative to a MAN is the thing being judged and there is
 * no assertion that stands in for putting one next to the other and looking.
 *
 * So: the wyrm beside a plain human at the same camera, from four angles, and the wing on its
 * own big enough to see what the spars are doing.
 *
 *   node tools/wyrmpix.js [outdir] [game.html]
 *
 * writes  wyrm-scale.png   the animal beside a man, four angles
 *         wyrm-wing.png    the wing close, from in front / above / behind / head on
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

  const info = await p.evaluate(() => {
    paused = true; syncPauseBtn(); hour = 11;
    debugSeeAll = true;
    if (typeof fogPlane !== 'undefined') fogPlane.visible = false;
    if (typeof syncDecorFogFull === 'function') syncDecorFogFull();
    document.querySelectorAll('.hud,#charpanel,#invpanel,#minimap,#log,#tip,#squadbar,#buildbar,#touchbar')
      .forEach(el => el.style.setProperty('display', 'none', 'important'));
    const me = player()[0];
    let spot = null;
    for (const pad of [10, 8, 6]) {
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
    return { ok: 1 };
  });
  if (info.fail) { console.log('*** ' + info.fail); await b.close(); process.exitCode = 1; return; }

  /* ---------- the animal, and a man standing beside it for scale ----------
     THE MAN IS THE ASSERTION. "Bigger" is a comparison and there is nothing to compare a
     wyrm to on an empty plain — a lone animal fills whatever frame you give it and reads
     the same at any size in the file. */
  await p.evaluate(() => {
    /* COPY THE ANIMAL THE GAME MADE, do not rebuild one. `big` is a mesh scale AND is fed
       into reach and pick radius, and it is set at the spawn site — a hand-staged wyrm comes
       out at 1.0 and every picture of it is a picture of an animal that is not in the game.
       Read the fields off a live one so the sheet cannot drift from the spawner. */
    const real = chars.find(c => c.kin === 'wyrm');
    const src = real ? {big: real.big, sweep: real.sweep, dir: 0} : {big: 1};
    chars.length = 0;
    charMeshes.forEach(e => { if (e.g && e.g.parent) e.g.parent.remove(e.g); });
    charMeshes.clear();
    const s = window.__spot;
    const wy = makeChar('W', 'fauna', s.x, s.y, { atk: 20, def: 20, tough: 30, ath: 6 });
    wy.beast = true; wy.kin = 'wyrm'; wy.bossKey = 'wyrm'; wy.dir = 0; wy.state = 'ok';
    wy.big = src.big; wy.neutral = true;
    window.__big = src.big;
    chars.push(wy); window.__wy = wy.id;
    const man = makeChar('M', 'player', s.x + 4.5, s.y, { atk: 5, def: 5, tough: 5, ath: 5, sex: 'm', age: 30 });
    man.weapon = null; man.armor = null; man.helm = null; man.pack = null;
    man.dir = 0; man.state = 'ok';
    chars.push(man); window.__man = man.id;
  });
  await p.waitForTimeout(3000);

  const shoot = async (mode, yaw, ids) => p.evaluate(({ mode, yaw, ids }) => {
    const box = new THREE.Box3();
    let any = false;
    for (const id of ids) {
      const e = charMeshes.get(id === 'wy' ? window.__wy : window.__man);
      if (!e) continue;
      if (id === 'wy') { e.rotY = 0; e.g.rotation.set(0, 0, 0); }
      e.g.updateWorldMatrix(true, true);
      e.g.traverse(o => { if (o.isMesh) box.expandByObject(o); });
      any = true;
    }
    if (!any) return null;
    const ctr = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const span = Math.max(size.x, size.y, size.z, 0.3);
    const r = span * (mode === 'wing' ? 0.55 : 0.70);
    const cam = camera.clone();
    cam.aspect = 1; cam.fov = 34;
    const el = mode === 'wing' ? 0.55 : 0.22;
    cam.position.set(ctr.x + Math.sin(yaw) * r * 3.0 * Math.cos(el),
                     ctr.y + r * 3.0 * Math.sin(el),
                     ctr.z + Math.cos(yaw) * r * 3.0 * Math.cos(el));
    cam.lookAt(ctr); cam.updateProjectionMatrix();
    const cv = renderer.domElement;
    const w0 = cv.width, h0 = cv.height, sw = cv.style.width, sh = cv.style.height;
    renderer.setSize(560, 560, false);
    renderer.render(scene, cam);
    const url = cv.toDataURL('image/png');
    renderer.setSize(w0, h0, false);
    cv.style.width = sw; cv.style.height = sh;
    return url.split(',')[1];
  }, { mode, yaw, ids });

  const sheet = async (rows, cols, title, file) => {
    const data = await p.evaluate(async ({ rows, cols, title }) => {
      const all = await Promise.all(rows.map(r => Promise.all(r.shots.map(d => d ? new Promise(res => {
        const im = new Image(); im.onload = () => res(im); im.src = 'data:image/png;base64,' + d;
      }) : null))));
      const w = 380, h = 380, LBL = 28, TOP = 34;
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
          g.font = j === 0 ? 'bold 17px monospace' : '14px monospace';
          g.fillText(j === 0 ? rows[i].label : cols[j], i * w + 10, top + 20);
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
    console.log('  ' + file.padEnd(20) + rows.length + ' × ' + rows[0].shots.length);
    return out;
  };

  /* ============ 1. BESIDE A MAN ============ */
  {
    const rows = [];
    for (const [lbl, yaw] of [['side on', 0], ['three-quarter', 0.8], ['head on', 1.57], ['from behind', 3.6]]) {
      rows.push({ label: lbl, shots: [await shoot('scale', yaw, ['wy', 'man'])] });
    }
    await sheet(rows, [''], 'THE WYRM BESIDE A MAN — the man is the ruler', 'wyrm-scale.png');
  }

  /* ============ 2. THE WING ============ */
  {
    const rows = [];
    for (const [lbl, yaw] of [['from the front', 0.4], ['from outboard', 1.57], ['from above/behind', 2.6], ['head on', 3.14]]) {
      rows.push({ label: lbl, shots: [await shoot('wing', yaw, ['wy'])] });
    }
    await sheet(rows, [''], 'THE WING, CLOSE — spar, membrane, and the fold', 'wyrm-wing.png');
  }

  /* the numbers that go with the pictures */
  const dims = await p.evaluate(() => {
    /* MESHES ONLY. `setFromObject` swallows the nameplate sprite and the selection ring,
       which put a man at 2.12 tall and 1.0 across — neither of which is the man. */
    const grab = (id) => {
      const e = charMeshes.get(id); if (!e) return null;
      e.g.updateWorldMatrix(true, true);
      const b = new THREE.Box3(); let n = 0;
      e.g.traverse(o => { if (o.isMesh) { b.expandByObject(o); n++; } });
      const s = b.getSize(new THREE.Vector3());
      return { len: +s.z.toFixed(2), hgt: +s.y.toFixed(2), wid: +s.x.toFixed(2), boxes: n };
    };
    return { wyrm: grab(window.__wy), man: grab(window.__man) };
  });
  const w = dims.wyrm, m = dims.man;
  console.log(`  wyrm  ${w.len} long  ${w.hgt} tall  ${w.wid} across   (${w.boxes} boxes)`);
  console.log(`  man   ${m.len} long  ${m.hgt} tall  ${m.wid} across   (${m.boxes} boxes)`);
  const big = await p.evaluate(() => window.__big);
  console.log(`  ratio ${(w.len / m.hgt).toFixed(2)}x a man's height long, ${(w.hgt / m.hgt).toFixed(2)}x tall, ${(w.wid / m.wid).toFixed(2)}x wide   (big = ${big})`);
  for (const e of errs) console.log('  PAGEERROR: ' + e);
  await b.close();
})();
