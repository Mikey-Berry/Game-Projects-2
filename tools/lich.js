#!/usr/bin/env node
/* THE LICH, front and back, standing and walking.
 *
 * A body is the one thing here that cannot be checked with a number, and the lich is the
 * only authored body in the game — everything else is boxes hung on the rig. This stages
 * one under a close camera so the silhouette can be looked at instead of asserted, and
 * captures it mid-stride as well as standing, because the note that started this was about
 * the WALK: legs flailing under a robe that should be gliding.
 *
 *   node tools/lich.js out.png [game.html]
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const gamePath = (a) => path.resolve(a ? (path.isAbsolute(a) ? a : path.join(__dirname, a)) : path.join(__dirname, 'game.html'));
const OUT = path.resolve(process.argv[2] || path.join(__dirname, 'lich.png'));

(async () => {
  const b = await chromium.launch({
    executablePath: process.env.DUSTWARD_CHROME || undefined,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'],
  });
  const p = await b.newPage({ viewport: { width: 460, height: 470 }, deviceScaleFactor: 2 });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message.slice(0, 200)));
  await p.goto('file://' + gamePath(process.argv[3]), { waitUntil: 'load' });
  await p.waitForTimeout(3000);
  await p.evaluate(() => document.getElementById('btn-start').click());
  await p.waitForTimeout(2000);

  const info = await p.evaluate(() => {
    paused = true; syncPauseBtn(); hour = 11;
    debugSeeAll = true;
    if (typeof fogPlane !== 'undefined') fogPlane.visible = false;
    if (typeof syncDecorFogFull === 'function') syncDecorFogFull();
    const me = player()[0];
    let spot = null;
    for (const pad of [6, 4, 3]) {
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
    if (!spot) return { fail: 'NO OPEN GROUND ANYWHERE' };
    chars.length = 0;
    charMeshes.forEach(e => { if (e.g && e.g.parent) e.g.parent.remove(e.g); });
    charMeshes.clear();
    const c = makeChar('The Deathless', 'player', spot.x, spot.y,
      { atk: 20, def: 18, tough: 16, ath: 8, magic: 40, gift: 'dark' });
    c.undead = true; c.lich = true; c.dir = 0; c.state = 'ok';
    chars.push(c);
    window.__id = c.id;
    camX = camSX = spot.x; camY = camSY = spot.y;
    camDist = camDistTarget = 3.4; camPitch = camPitchT = 0.10;
    camYaw = camYawT = 0.0; camFollow = false; selected = [];
    return { at: spot };
  });
  if (info.fail) { console.log('*** ' + info.fail); await b.close(); process.exitCode = 1; return; }

  await p.waitForTimeout(4000);
  await p.evaluate(() => {
    document.querySelectorAll('.hud,#charpanel,#invpanel,#minimap,#log,#tip,#squadbar,#buildbar,#touchbar')
      .forEach(el => el.style.setProperty('display', 'none', 'important'));
  });

  /* four looks: standing front, standing back, and two frames of a walk a third of a stride
     apart — the walk is the whole reason this exists */
  const shots = [];
  const labels = ['standing, front', 'standing, back', 'walking', 'walking, later'];
  for (let i = 0; i < 4; i++) {
    await p.evaluate((i) => {
      const c = chars.find(x => x.id === window.__id), e = charMeshes.get(window.__id);
      c.x = window.__sx === undefined ? (window.__sx = c.x) : window.__sx;
      if (i < 2) { c.vx = c.vy = 0; c._spd = 0; }
      else {
        /* A real walk: give it somewhere to be and let physics carry it, so the animator
           sees the same `realSpd` it would in play rather than a number we made up. The
           camera has to go with it — the first version let it walk thirty tiles out of frame
           and then photographed the empty desert it left behind. */
        c.moveTarget = { x: c.x, y: c.y - 30 };
        for (let t = 0; t < (i === 2 ? 26 : 40); t++) { physics(c, 0.05); }
        camX = camSX = c.x; camY = camSY = c.y;
      }
      if (e) { e.rotY = i === 1 ? Math.PI : 0; e.g.rotation.set(0, e.rotY, 0); }
    }, i);
    await p.waitForTimeout(650);
    shots.push((await p.screenshot({ clip: { x: 90, y: 40, width: 280, height: 400 } })).toString('base64'));
  }

  const sheet = await p.evaluate(async ({ shots, labels }) => {
    const ims = await Promise.all(shots.map(d => new Promise(res => {
      const im = new Image(); im.onload = () => res(im); im.src = 'data:image/png;base64,' + d;
    })));
    const w = ims[0].width, h = ims[0].height, LBL = 30;
    const cv = document.createElement('canvas');
    cv.width = w * ims.length; cv.height = h + LBL;
    const g = cv.getContext('2d');
    g.fillStyle = '#12100d'; g.fillRect(0, 0, cv.width, cv.height);
    ims.forEach((im, i) => {
      g.drawImage(im, i * w, LBL);
      g.fillStyle = '#e8dcc4'; g.font = 'bold 17px monospace';
      g.fillText(labels[i], i * w + 8, 21);
      g.strokeStyle = '#3a342a'; g.strokeRect(i * w + 0.5, LBL + 0.5, w - 1, h - 1);
    });
    return cv.toDataURL('image/png').split(',')[1];
  }, { shots, labels });

  fs.writeFileSync(OUT, Buffer.from(sheet, 'base64'));

  /* The picture is the point, but a few things about it can be counted — and every one of
     these was broken at some point in the hour it took to build. */
  const R = await p.evaluate(() => {
    const out = {};
    const e = charMeshes.get(window.__id), c = chars.find(x => x.id === window.__id);
    if (!e) return { built: '!! NO GEOMETRY AT ALL' };
    out.built = 'the body builds';
    /* the plain box body must be hidden. It is hidden AFTER bakeBoxes now, because before
       the bake `e.boxBody` holds proxies that the bake then replaces with fresh visible
       meshes — which is why a purple slab sat across the shoulders and the waist. */
    const stillOn = [e.boxBody, e.boxArm, e.boxLeg].flat().filter(m => m && m.visible).length;
    out.plainHidden = stillOn === 0 ? 'the plain box body is hidden'
      : `!! ${stillOn} PLAIN BODY MESHES STILL SHOWING THROUGH THE ROBE`;
    /* geometry: how low does it reach, and is there anything where legs would be */
    let lo = 1e9, hi = -1e9, vis = 0;
    e.g.traverse(o => {
      if (!o.isMesh) return;
      let v = o.visible, q = o.parent; while (q && v) { v = q.visible; q = q.parent; }
      if (!v) return;
      vis++;
      const bb = new THREE.Box3().setFromObject(o);
      lo = Math.min(lo, bb.min.y); hi = Math.max(hi, bb.max.y);
    });
    out.meshes = `${vis} visible meshes, ${lo.toFixed(2)} to ${hi.toFixed(2)}`;
    out.reachesGround = lo < 0.06 ? 'the hem reaches the ground'
      : `!! THE ROBE STOPS ${lo.toFixed(2)} ABOVE THE GROUND — there is a gap where the legs were`;
    out.headKept = hi > 1.85 ? 'and the authored head is still on it' : '!! THE HEAD IS MISSING';
    /* the legs must be frozen whatever the animator is doing */
    out.legsFrozen = (Math.abs(e.legL.rotation.x) < 0.02 && Math.abs(e.legR.rotation.x) < 0.02)
      ? 'the legs do not swing' : `!! THE LEGS ARE STILL WALKING (${e.legL.rotation.x.toFixed(2)})`;
    /* And it floats: run the animator a moment and watch the lift change. The animator is
       not a function of its own — it lives inside `syncChars(dt)`, which is the thing to
       drive. Reaching for an `animChar` that does not exist threw the whole probe. */
    const a = e.lichLift || 0;
    for (let i = 0; i < 30; i++) syncChars(0.05);
    const b2 = e.lichLift || 0;
    out.floats = (b2 > 0 && Math.abs(b2 - a) > 0.001) ? `it rides ${(b2 * 100).toFixed(0)}cm off the ground and breathes`
      : `!! IT IS NOT FLOATING (${a.toFixed(3)} -> ${b2.toFixed(3)})`;
    return out;
  }).catch(err => ({ probe: '!! THE PROBE THREW: ' + String(err).slice(0, 120) }));

  console.log(`${path.basename(OUT)}\n`);
  for (const [k, v] of Object.entries(R)) console.log('  ' + k.padEnd(14) + v);
  const bad = Object.values(R).map(String).filter(v => v.startsWith('!!'));
  console.log('\n' + (bad.length ? '*** ' + bad.join('\n*** ') : 'THE DEATHLESS ARRIVES'));
  if (errs.length) { console.log('errs:', errs.length); errs.slice(0, 3).forEach(e => console.log('  ' + e)); }
  await b.close();
  if (bad.length) process.exitCode = 1;
})();
