#!/usr/bin/env node
/* THE TWO IMPORTED ASSETS, BESIDE THE BUILT ONES THAT WOULD REPLACE THEM.
 *
 * Two things in this file are baked GLB where everything around them is primitives: the Aether
 * Lance (`WEPP.lance`, 22 KB of base64) and the lich's skull (`HEADP.lyonlich`, 56 KB).
 * `NATIVE_LANCE` and `NATIVE_LICH` decide which gets drawn. This shoots the same body, the same framing and the
 * same hour both ways, so the question "which of these is better" is answered by looking.
 *
 * IT REBUILDS THE MESHES BETWEEN SHOTS AND THAT IS THE WHOLE TRICK. A character's entity is
 * cached in `charMeshes` by id, and `weaponGeo`'s cache is keyed by the switch — so flipping
 * a switch changes nothing on screen until the entities are cleared and `syncChars` builds
 * again. Without that this reports the same picture twice and calls it a match.
 *
 * Framing is `wepglb.js`'s: a cloned camera put on the SUBJECT'S OWN bounding box and rendered
 * offscreen, because at body distance a lance is four pixels wide and a skull is two.
 *
 *   node tools/native.js [out.png] [game.html]
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const OUT = path.resolve(process.argv[2] || path.join(__dirname, 'native.png'));
/* The carry can be overridden from the command line, so the angle is found in one browser
   session rather than one rebuild of a 3 MB file per guess — wepglb.js's trick, same reason:
   `rest` decides how a built weapon hangs and it cannot be reasoned out, only looked at.
     node tools/native.js out.png game.html '{"x":0.55,"y":-0.35,"pos":{"x":0.13,"y":-0.22}}' */
const REST = process.argv[4] ? JSON.parse(process.argv[4]) : null;
const PAD = Number(process.env.NATIVE_PAD || 0.62);
const gamePath = (a) => path.resolve(a ? (path.isAbsolute(a) ? a : path.join(__dirname, a)) : path.join(__dirname, 'game.html'));

(async () => {
  const b = await chromium.launch({
    executablePath: process.env.DUSTWARD_CHROME || undefined,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'],
  });
  const p = await b.newPage({ viewport: { width: 900, height: 700 } });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message.slice(0, 200)));
  await p.goto('file://' + gamePath(process.argv[3]), { waitUntil: 'load' });
  await p.waitForSelector('#btn-start', { state: 'attached', timeout: 60000 });
  await p.evaluate(() => document.getElementById('btn-start').click());
  await p.waitForTimeout(3200);

  await p.evaluate(() => {
    paused = true; hour = 11; debugSeeAll = true;
    if (typeof updateSky === 'function') updateSky();
    if (typeof fogPlane !== 'undefined') fogPlane.visible = false;
    if (typeof syncDecorFogFull === 'function') syncDecorFogFull();
    const me = player()[0];
    let spot = null;
    for (let r = 40; r < 240 && !spot; r += 4) for (let a = 0; a < 24 && !spot; a++) {
      const x = me.x + Math.cos(a / 24 * 6.283) * r, y = me.y + Math.sin(a / 24 * 6.283) * r;
      if (x < 10 || y < 10 || x >= W - 10 || y >= H - 10) continue;
      let ok = true;
      for (let dy = -6; dy <= 6 && ok; dy++) for (let dx = -6; dx <= 6 && ok; dx++) {
        const ix = Math.floor(x) + dx, iy = Math.floor(y) + dy;
        if (isBlocked(ix + 0.5, iy + 0.5, 0) || terr[iy * W + ix] === 3 || decorAt(ix, iy)) ok = false;
      }
      if (ok) spot = { x, y };
    }
    window.__spot = spot;
    document.querySelectorAll('.hud,#charpanel,#invpanel,#minimap,#log,#tip,#squadbar,#buildbar,#touchbar')
      .forEach(el => el.style.setProperty('display', 'none', 'important'));
  });

  /* what each row photographs: who to stage, and what to put the camera on */
  const SUBJECTS = (process.env.NATIVE_ONLY || 'lance,hood').split(',').map(k => ({
    lance: { key: 'lance', label: 'Aether Lance', onPart: 'weapon' },
    /* the GENERIC lich: no `face`, so `headKeyOf` is null and the whole head is `LICHP.hood` —
       which is not a hood. Its own note calls it "a hooded skull with a gold band". */
    hood:  { key: 'hood',  label: "lich's hooded skull", onPart: 'head' },
    /* and Lyonart's, which is a different asset and a different judgement */
    lyon:  { key: 'lyon',  label: "Lyonart ascended", onPart: 'head' },
  })[k]).filter(Boolean);

  const rows = [];
  for (const sub of SUBJECTS) {
    for (const mode of ['glb', 'native']) {
      const shots = [];
      await p.evaluate(({ key, mode, rest }) => {
        /* every switch, because a row sets only the one its subject is drawn by and leaving
           the others alone keeps each row honest about what it is comparing */
        NATIVE_LANCE = (mode === 'native');
        NATIVE_LICH = (mode === 'native');
        NATIVE_LYONLICH = (mode === 'native');
        if (rest && WEAPONS.w_lance) WEAPONS.w_lance.rest = rest;
        /* every cached entity goes, or the switch changes nothing that is already built */
        chars.length = 0;
        charMeshes.forEach(e => { if (e.g && e.g.parent) e.g.parent.remove(e.g); });
        charMeshes.clear();
        const s = window.__spot;
        const c = makeChar('X', 'player', s.x, s.y, { atk: 16, def: 14, tough: 14, ath: 8, sex: 'm' });
        c.dir = 0; c.state = 'ok';
        if (key === 'lance') { c.weapon = 'w_lance'; c.armor = 'a_lea'; }
        else if (key === 'hood') { c.lich = true; c.undead = true; c.face = null; }
        else { c.lich = true; c.undead = true; c.face = 'lyonart'; }
        chars.push(c); window.__id = c.id;
      }, { key: sub.key, mode, rest: REST });
      await p.waitForTimeout(2600);

      for (const [lbl, yaw] of [['front', 0.0], ['three-quarter', 0.7], ['profile', 1.55]]) {
        const shot = await p.evaluate(({ yaw, onPart, pad }) => {
          const e = charMeshes.get(window.__id);
          e.rotY = yaw; e.g.rotation.set(0, yaw, 0);
          e.g.updateWorldMatrix(true, true);
          /* THE HEAD IS FRAMED ON ITS BONE AND A FIXED RADIUS, not on a bounding box.
             The two heads do not have the same bounds — the crown's points drag the native
             one's centre up and its jaw out of frame — and a comparison whose two halves are
             framed differently is not a comparison. The weapon still takes its own bounds,
             where matching length is the point. */
          let ctr, r;
          if (onPart === 'weapon') {
            const bb = new THREE.Box3().setFromObject(e.weapon || e.g);
            ctr = bb.getCenter(new THREE.Vector3());
            const sz = bb.getSize(new THREE.Vector3());
            r = Math.max(sz.x, sz.y, sz.z) * pad;
          } else {
            /* ON THE HEAD'S OWN CENTRE AND A FIXED RADIUS. The bone's origin plus a constant
               was close enough while both heads were a single mesh hung at the same offset;
               a head built as boxes sits where its boxes sit, and the constant cropped it at
               the brow. So: the CENTRE comes from what is actually on the bone, and the
               RADIUS stays fixed, because two halves framed at two sizes is not a
               comparison. */
            const hb = new THREE.Box3().setFromObject(e.headG);
            ctr = hb.isEmpty() ? e.headG.getWorldPosition(new THREE.Vector3())
                               : hb.getCenter(new THREE.Vector3());
            r = 0.46 * pad;
          }
          const cam = camera.clone();
          cam.aspect = 1; cam.fov = 34;
          cam.position.set(ctr.x, ctr.y + r * 0.10, ctr.z + r * 3.0);
          cam.lookAt(ctr); cam.updateProjectionMatrix();
          const cv = renderer.domElement;
          const w0 = cv.width, h0 = cv.height, sw = cv.style.width, sh = cv.style.height;
          renderer.setSize(460, 460, false);
          renderer.render(scene, cam);
          const url = cv.toDataURL('image/png');
          renderer.setSize(w0, h0, false);
          cv.style.width = sw; cv.style.height = sh;
          return url.split(',')[1];
        }, { yaw, onPart: sub.onPart, pad: PAD });
        shots.push({ lbl, shot });
      }

      const m = await p.evaluate((onPart) => {
        const e = charMeshes.get(window.__id);
        /* a built head is not ONE mesh — its boxes are merged into whatever buckets
           `bakeBoxes` made — so fall back to the bone and add up what hangs off it */
        const t = onPart === 'weapon' ? e.weapon : (e.sculptHead || e.hood || e.headG);
        if (!t) return null;
        let tris = 0;
        t.traverse(o => {
          if (!o.isMesh || !o.geometry) return;
          const g = o.geometry;
          tris += g.index ? g.index.count / 3 : g.attributes.position.count / 3;
        });
        if (!tris) return null;
        const bb = new THREE.Box3().setFromObject(t);
        const sz = bb.getSize(new THREE.Vector3());
        return { tris: Math.round(tris), len: +Math.max(sz.x, sz.y, sz.z).toFixed(3) };
      }, sub.onPart);

      rows.push({ label: `${sub.label} — ${mode === 'glb' ? 'IMPORTED GLB' : 'BUILT NATIVE'}`, shots, m });
      console.log(`  ${sub.label.padEnd(14)} ${mode.padEnd(7)} ${m ? `${String(m.tris).padStart(5)} tris, ${m.len} across` : '(no mesh found)'}`);
    }
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
      g.fillStyle = /NATIVE/.test(rows[i].label) ? '#8fd8c0' : '#e8dcc4';
      g.font = 'bold 14px monospace';
      g.fillText(j === 0 ? rows[i].label : rows[i].shots[j].lbl, cx + 8, cy + 17);
      if (j === 2 && rows[i].m) {
        g.fillStyle = '#9a9184'; g.font = '12px monospace';
        g.fillText(`${rows[i].m.tris} tris`, cx + w - 78, cy + 17);
      }
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
