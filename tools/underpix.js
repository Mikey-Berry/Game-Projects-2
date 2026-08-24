#!/usr/bin/env node
/* WHAT IT LOOKS LIKE DOWN THERE, AND WHETHER YOU CAN SEE ANYTHING AT ALL.
 *
 * "an entirely NEW area built 100% underneath the entire map"
 *
 * Two things no assertion can answer: whether a tunnel reads as a tunnel rather than as a grey
 * path floating in the dark, and whether the way DOWN is visible from the surface — a shaft
 * you cannot see is a feature nobody finds. Four shots: the headframe on the surface, the
 * squad standing on it, the hall they arrive in, and a tunnel between two halls.
 *
 *   node tools/underpix.js [outdir] [game.html]
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

  await p.evaluate(() => {
    paused = true; syncPauseBtn(); hour = 11;
    debugSeeAll = true;
    if (typeof fogPlane !== 'undefined') fogPlane.visible = false;
    if (typeof syncDecorFogFull === 'function') syncDecorFogFull();
    document.querySelectorAll('.hud,#charpanel,#invpanel,#minimap,#log,#tip,#squadbar,#buildbar,#touchbar')
      .forEach(el => el.style.setProperty('display', 'none', 'important'));
  });

  /* put the squad on a shaft, then under it */
  const info = await p.evaluate(() => {
    const sh = undercroft.shafts[Math.floor(undercroft.shafts.length / 2)];
    window.__sh = sh;
    const hall = sh.hall;
    /* a tunnel tile: the far side of the hall, out along a corridor */
    let far = null, fd = 0;
    for (const [bk, arr] of undercroft.grid) {
      for (const t of arr) {
        const x = t % W, y = (t - x) / W;
        const d = dist(x, y, hall.x, hall.y);
        if (d > fd && d < 90) { fd = d; far = { x, y }; }
      }
    }
    window.__far = far;
    return { shaft: sh, hall: { x: hall.x, y: hall.y }, far, fd: Math.round(fd), halls: undercroft.halls.length,
             shafts: undercroft.shafts.length, tiles: undercroft.tiles };
  });

  const place = async (x, y, floor) => {
    await p.evaluate(({ x, y, floor }) => {
      for (const c of player()) { c.x = x + (Math.random() - 0.5) * 2.2; c.y = y + (Math.random() - 0.5) * 2.2; c.floor = floor; clearOrders(c); }
      const me = player()[0];
      /* BOTH CAMERA PAIRS. `camX/camY` is what the game aims at; `camSX/camSY` is where the
         camera IS, and it chases the target at a rate that depends on frame time — with the
         clock paused it can sit eighty tiles behind, which is a picture of the wrong place.
         Set the smoothed pair too and the shot is of what was asked for. */
      camX = me.x; camY = me.y; camSX = me.x; camSY = me.y; camInit = true;
      activeFloor = floor;
      /* AND SELECT THEM. The camera's vertical anchor follows the SELECTION, not
         `activeFloor` — `camFY` lerps toward `floorY(selected[0].floor)`. A probe that moves
         bodies underground without selecting any of them photographs the surface from above,
         correctly, and looks exactly like a renderer that does not work. */
      selected.length = 0; for (const c of player()) selected.push(c);
      camFY = floorY(floor);
      camDist = camDistTarget = 15; camPitch = 0.72;
    }, { x, y, floor });
    await p.waitForTimeout(2400);
  };

  const shoot = async () => p.evaluate(() => {
    const cv = renderer.domElement;
    const w0 = cv.width, h0 = cv.height, sw = cv.style.width, sh2 = cv.style.height;
    renderer.setSize(760, 560, false);
    camera.aspect = 760 / 560; camera.updateProjectionMatrix();
    renderer.render(scene, camera);
    const url = cv.toDataURL('image/png');
    renderer.setSize(w0, h0, false);
    camera.aspect = w0 / h0; camera.updateProjectionMatrix();
    cv.style.width = sw; cv.style.height = sh2;
    return url.split(',')[1];
  });

  const shots = [];
  const labels = [];

  await place(info.shaft.x + 0.5, info.shaft.y + 0.5, 0);
  shots.push(await shoot()); labels.push('the headframe, from the surface');

  await p.evaluate(() => { camDist = camDistTarget = 42; });
  await p.waitForTimeout(1600);
  shots.push(await shoot()); labels.push('and from a field away');

  await place(info.hall.x + 0.5, info.hall.y + 0.5, -1);
  shots.push(await shoot()); labels.push('the hall under it');

  await place(info.far.x + 0.5, info.far.y + 0.5, -1);
  shots.push(await shoot()); labels.push(`a tunnel, ${info.fd} tiles out`);

  const data = await p.evaluate(async ({ shots, labels }) => {
    const all = await Promise.all(shots.map(d => new Promise(res => {
      const im = new Image(); im.onload = () => res(im); im.src = 'data:image/png;base64,' + d;
    })));
    const w = 760, h = 560, LBL = 30, TOP = 34, COLS = 2;
    const rows = Math.ceil(all.length / COLS);
    const cv = document.createElement('canvas');
    cv.width = w * COLS; cv.height = TOP + (h + LBL) * rows;
    const g = cv.getContext('2d');
    g.fillStyle = '#12100d'; g.fillRect(0, 0, cv.width, cv.height);
    g.fillStyle = '#c8a86a'; g.font = 'bold 17px monospace';
    g.fillText('THE UNDERCROFT — one floor, under the whole map', 10, 22);
    all.forEach((im, i) => {
      const cx = (i % COLS) * w, cy = TOP + Math.floor(i / COLS) * (h + LBL);
      g.fillStyle = '#e8dcc4'; g.font = 'bold 16px monospace';
      g.fillText(labels[i], cx + 10, cy + 20);
      g.drawImage(im, cx, cy + LBL, w, h);
      g.strokeStyle = '#3a342a'; g.strokeRect(cx + 0.5, cy + LBL + 0.5, w - 1, h - 1);
    });
    return cv.toDataURL('image/png').split(',')[1];
  }, { shots, labels });
  fs.writeFileSync(path.join(OUTDIR, 'undercroft.png'), Buffer.from(data, 'base64'));
  console.log(`  undercroft.png      ${info.halls} halls, ${info.shafts} shafts, ${info.tiles} tiles of floor`);
  for (const e of errs) console.log('  PAGEERROR: ' + e);
  await b.close();
})();
