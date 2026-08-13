#!/usr/bin/env node
/* THE SCULPTED HEADS, close enough to judge.
 *
 * `faces.js` frames whole bodies, which is right for "is the coat black and dusty" and
 * useless for "is the head on straight". A baked asset has four ways to be wrong and all of
 * them are invisible at body distance: scale, height on the neck, which way it faces, and
 * whether the box head underneath it was actually hidden. So this puts the camera on the
 * head, one row per person, front and three-quarter.
 *
 *   node tools/heads.js out.png [game.html]
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const gamePath = (a) => path.resolve(a ? (path.isAbsolute(a) ? a : path.join(__dirname, a)) : path.join(__dirname, 'game.html'));
const OUT = path.resolve(process.argv[2] || path.join(__dirname, 'heads.png'));
const WHO = [
  { face: 'lyonart', label: "Lyonart d'Alagadda", race: 'human', sex: 'm', armor: 'a_lea' },
  { face: 'saga', label: 'Saga Wordsworth', race: 'hollow', sex: 'm', armor: 'a_pla' },
  { face: 'ilsabet', label: "Ilsabet d'Alagadda", race: 'human', sex: 'f', armor: 'a_lea' },
];

(async () => {
  const b = await chromium.launch({
    executablePath: process.env.DUSTWARD_CHROME || undefined,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'],
  });
  const p = await b.newPage({ viewport: { width: 900, height: 760 }, deviceScaleFactor: 2 });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message.slice(0, 200)));
  await p.goto('file://' + gamePath(process.argv[3]), { waitUntil: 'load' });
  await p.waitForTimeout(3000);
  await p.evaluate(() => document.getElementById('btn-start').click());
  await p.waitForTimeout(2000);

  const spot = await p.evaluate(() => {
    paused = true; syncPauseBtn(); hour = 11;
    debugSeeAll = true;
    if (typeof fogPlane !== 'undefined') fogPlane.visible = false;
    if (typeof syncDecorFogFull === 'function') syncDecorFogFull();
    const me = player()[0];
    for (const pad of [6, 4, 3]) {
      for (let r = 40; r < 240; r += 4) for (let a = 0; a < 24; a++) {
        const x = me.x + Math.cos(a / 24 * 6.283) * r, y = me.y + Math.sin(a / 24 * 6.283) * r;
        if (x < pad + 2 || y < pad + 2 || x >= self.W - pad - 2 || y >= self.H - pad - 2) continue;
        let ok = true;
        for (let dy = -pad; dy <= pad && ok; dy++) for (let dx = -pad; dx <= pad && ok; dx++) {
          const ix = Math.floor(x) + dx, iy = Math.floor(y) + dy;
          if (isBlocked(ix + 0.5, iy + 0.5, 0) || terr[iy * self.W + ix] === 3 || decorAt(ix, iy)) ok = false;
        }
        if (ok) return { x, y };
      }
    }
    return null;
  });
  if (!spot) { console.log('*** NO OPEN GROUND'); await b.close(); process.exitCode = 1; return; }

  const rows = [];
  for (const w of WHO) {
    const shots = [];
    await p.evaluate(({ w, spot }) => {
      chars.length = 0;
      charMeshes.forEach(e => { if (e.g && e.g.parent) e.g.parent.remove(e.g); });
      charMeshes.clear();
      const c = makeChar(w.label, 'player', spot.x, spot.y,
        { atk: 14, def: 12, tough: 12, ath: 6, weapon: 'w_kat', armor: w.armor, race: w.race });
      c.face = w.face; c.sex = w.sex; c.dir = 0;
      if (w.face === 'saga') c.hollowTier = 1;
      chars.push(c); window.__id = c.id;
      /* THE EYE GOES ON THE HEAD, NOT THE FEET. The camera always looks at ground level plus
         0.8 (`focusY`), and a head sits at about 1.95 — so a close camera framed the belt
         and the first run of this photographed three torsos. There is no look-at-height dial,
         so the body is dropped instead: sink it until the head is where the camera is
         already pointing. It is a portrait rig, not a change to the game. */
      window.__spot = spot;
      camX = camSX = spot.x; camY = camSY = spot.y;
      camDist = camDistTarget = 1.55; camPitch = camPitchT = 0.02;
      camYaw = camYawT = 0; camFollow = false; selected = [];
      document.querySelectorAll('.hud,#charpanel,#invpanel,#minimap,#log,#tip,#squadbar,#buildbar,#touchbar')
        .forEach(el => el.style.setProperty('display', 'none', 'important'));
    }, { w, spot });
    await p.waitForTimeout(3500);
    for (const yaw of [0, 0.95]) {
      /* ---------- A PORTRAIT CAMERA OF ITS OWN ----------
         The game's camera always looks at ground level plus 0.8, and there is no dial for
         that height — so a head at 1.6 projects to twelve pixels from the top of the frame
         whatever you do with distance or pitch, and three attempts at hand-picked crops all
         photographed the belt. Rather than bend the game's camera into a portrait rig, render
         ONE frame through a camera of our own, aimed at the head, and read the canvas back in
         the same tick before the loop composites over it. */
      const shot = await p.evaluate((yaw) => {
        const e = charMeshes.get(window.__id);
        e.rotY = yaw; e.g.rotation.set(0, yaw, 0);
        e.g.updateWorldMatrix(true, true);
        const bb = new THREE.Box3().setFromObject(e.sculptHead);
        const ctr = bb.getCenter(new THREE.Vector3());
        const r = Math.max(bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z);
        const cam = camera.clone();
        cam.aspect = 1; cam.fov = 32;
        const d = r * 2.4;
        cam.position.set(ctr.x, ctr.y + r * 0.10, ctr.z + d);
        cam.lookAt(ctr);
        cam.updateProjectionMatrix();
        const cv = renderer.domElement;
        const w0 = cv.width, h0 = cv.height, sw = cv.style.width, sh = cv.style.height;
        renderer.setSize(560, 560, false);
        renderer.render(scene, cam);
        const url = cv.toDataURL('image/png');
        renderer.setSize(w0, h0, false);
        cv.style.width = sw; cv.style.height = sh;
        return url.split(',')[1];
      }, yaw);
      shots.push(shot);
    }
    const state = await p.evaluate(() => {
      const e = charMeshes.get(window.__id);
      if (!e) return { ok: false, why: 'no mesh' };
      let sculpt = 0, boxes = 0;
      for (const ch of e.headG.children) {
        if (!ch.visible) continue;
        if (ch === e.sculptHead) sculpt += ch.geometry.index.count / 3;
        else boxes++;
      }
      const bb = e.sculptHead ? new THREE.Box3().setFromObject(e.sculptHead) : null;
      /* ---------- AND IT HAS TO BE THE SIZE OF A HEAD ----------
         This harness reported the sculpt's dimensions from the first day and never once
         compared them to anything, so three heads at sixty per cent of the size of everybody
         else's passed it cleanly for as long as they were wrong. A number nothing is measured
         AGAINST is not a check.
         The reference is a plain box head on a plain body, built here rather than remembered,
         because the thing being matched is whatever the rig currently produces. The first fit
         was sized against the head CUBE alone — but a box head is a cube with a hair slab on
         top and usually a beard below, and it is the whole assembly a player sees. */
      let ref = null;
      {
        const keep = chars.slice();
        chars.length = 0;
        const pm = makeChar('Ref', 'player', window.__spot.x, window.__spot.y, { sex: 'm' });
        pm.state = 'ok'; chars.push(pm);
        syncChars(0.05); syncChars(0.05);
        const pe = charMeshes.get(pm.id);
        if (pe) {
          const pb = new THREE.Box3();
          pe.headG.updateWorldMatrix(true, true);
          pe.headG.traverse(o => {
            if (!o.isMesh) return;
            let v = o.visible, q = o.parent; while (q && v) { v = q.visible; q = q.parent; }
            if (v) pb.expandByObject(o);
          });
          const pbb = new THREE.Box3().setFromObject(pe.g);
          ref = { h: pb.max.y - pb.min.y, body: pbb.max.y - pbb.min.y };
        }
        const pe2 = charMeshes.get(pm.id);
        if (pe2 && pe2.g && pe2.g.parent) pe2.g.parent.remove(pe2.g);
        charMeshes.delete(pm.id);
        chars.length = 0; for (const k of keep) chars.push(k);
      }
      let sized = 'no reference body';
      if (bb && ref) {
        const bodyBB = new THREE.Box3().setFromObject(e.g);
        const mine = (bb.max.y - bb.min.y) / (bodyBB.max.y - bodyBB.min.y);
        const theirs = ref.h / ref.body;
        const r = mine / theirs;
        /* Band, not a target: these are sculpted heads on a blocky rig and they will never
           match to the centimetre. A box head carries a beard the sculpts do not, so the
           honest range runs a little short of parity. The fit this was written against sits
           at 0.76-0.84; the fit it was written to catch sat at 0.60. */
        sized = r >= 0.70 && r <= 1.15
          ? `head is ${(mine * 100).toFixed(1)}% of body against a box head's ${(theirs * 100).toFixed(1)}%`
          : `!! THE HEAD IS THE WRONG SIZE — ${(mine * 100).toFixed(1)}% of body against a box head's ${(theirs * 100).toFixed(1)}% (${r.toFixed(2)}x)`;
      }
      return { ok: !!e.sculptHead, sculpt, boxes, sized, top: bb ? +bb.max.y.toFixed(2) : 0, bot: bb ? +bb.min.y.toFixed(2) : 0,
               wide: bb ? +(bb.max.x - bb.min.x).toFixed(2) : 0 };
    });
    rows.push({ w, shots, state });
    console.log(`  ${w.face.padEnd(9)} ${state.ok ? state.sculpt + ' tris' : '!! NO SCULPT'}` +
      `  ${state.boxes ? '!! ' + state.boxes + ' BOX PARTS STILL SHOWING' : 'box head hidden'}` +
      `  y ${state.bot}..${state.top}  w ${state.wide}`);
  }

  const payload = rows.map(r => ({ label: r.w.label, imgs: r.shots }));
  const sheet = await p.evaluate(async (payload) => {
    const all = await Promise.all(payload.map(r => Promise.all(r.imgs.map(d => new Promise(res => {
      const im = new Image(); im.onload = () => res(im); im.src = 'data:image/png;base64,' + d;
    })))));
    /* the computed crops are all different sizes, so each is letterboxed into one cell */
    const w = 380, h = 380, LBL = 30;
    const cv = document.createElement('canvas');
    cv.width = w * 2; cv.height = (h + LBL) * all.length;
    const g = cv.getContext('2d');
    g.fillStyle = '#12100d'; g.fillRect(0, 0, cv.width, cv.height);
    all.forEach((row, r) => {
      const top = r * (h + LBL);
      g.fillStyle = '#e8dcc4'; g.font = 'bold 19px monospace';
      g.fillText(payload[r].label, 10, top + 21);
      row.forEach((im, i) => {
        const k = Math.min(w / im.width, h / im.height);
        const dw = im.width * k, dh = im.height * k;
        g.drawImage(im, i * w + (w - dw) / 2, top + LBL + (h - dh) / 2, dw, dh);
        g.strokeStyle = '#3a342a'; g.strokeRect(i * w + 0.5, top + LBL + 0.5, w - 1, h - 1);
      });
    });
    return cv.toDataURL('image/png').split(',')[1];
  }, payload);
  fs.writeFileSync(OUT, Buffer.from(sheet, 'base64'));

  for (const r of rows) console.log(`  ${String(r.w.face).padEnd(9)} ${r.state.sized}`);
  const bad = rows.filter(r => !r.state.ok || r.state.boxes || String(r.state.sized).startsWith('!!'));
  console.log(`\n${path.basename(OUT)} — ` + (bad.length ? '*** ' + bad.map(r => r.w.face).join(', ') + ' WRONG'
    : 'THREE HEADS, AND NOTHING LEFT OF THE BOXES'));
  if (errs.length) { console.log('errs:', errs.length); errs.slice(0, 3).forEach(e => console.log('  ' + e)); }
  await b.close();
  if (bad.length) process.exitCode = 1;
})();
