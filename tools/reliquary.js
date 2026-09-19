#!/usr/bin/env node
/* THE WHOLE FIGURE, NOT THE HEAD.
 *
 * tools/native.js frames a head on its bone at a fixed radius, because comparing two skulls
 * means both halves have to sit in the frame the same way. That framing is exactly wrong for
 * the question this file asks, which is whether the lich READS — silhouette, proportion, what
 * the eye lands on first — and none of that survives a crop at the neck.
 *
 * So: the whole body on its own bounds, at four yaws, STANDING and WALKING. The walk matters
 * because `e.authored` animates a thing that is pulled rather than one that steps: the trail
 * on `e.cape` lags a beat behind and only kicks out when the body is moving, so a still shot
 * is half the design. `moving` is `c.x - e.lastX` over a frame, so the walking pass simply
 * drags the body a little between `syncChars` calls and lets the real animator do the rest.
 *
 * It also CHECKS THE RIG rather than only photographing it, because a figure that looks right
 * in a still and has lost its soul lamp is worse than one that looks wrong:
 *
 *   - the authored flag is set, or the animator never runs the float at all
 *   - `e.soulLamp` exists and is what the animator breathes
 *   - `e.cape` has segments and `capeLift` is a hem's, not a cloak's
 *   - the plain body boxes are hidden, or a skeleton wears a body inside it
 *   - no MeshBasicMaterial is registered in `e.mats`, which is walked every frame writing
 *     `m.emissive` that a basic material has not got
 *
 *   node tools/reliquary.js [out.png] [game.html]
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const OUT = path.resolve(process.argv[2] || path.join(__dirname, 'reliquary.png'));
const PAD = Number(process.env.RELIQ_PAD || 0.60);
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
      if (x < 12 || y < 12 || x >= W - 12 || y >= H - 12) continue;
      let ok = true;
      /* WIDE, because the camera sees far past the tile the subject stands on. A ±5
         clearance put a palisade and three trees directly behind the head, and a figure
         judged against a fence is being judged against a fence. */
      for (let dy = -12; dy <= 12 && ok; dy++) for (let dx = -12; dx <= 12 && ok; dx++) {
        const ix = Math.floor(x) + dx, iy = Math.floor(y) + dy;
        if (isBlocked(ix + 0.5, iy + 0.5, 0) || terr[iy * W + ix] === 3 || decorAt(ix, iy)) ok = false;
      }
      if (ok) spot = { x, y };
    }
    /* open ground is not guaranteed on every seed; the player's own tile is at worst
       a busier backdrop, which is still a picture rather than a crash */
    window.__spot = spot || { x: me.x, y: me.y };
    document.querySelectorAll('.hud,#charpanel,#invpanel,#minimap,#log,#tip,#squadbar,#buildbar,#touchbar')
      .forEach(el => el.style.setProperty('display', 'none', 'important'));
  });

  /* NATIVE_ART decides which lich gets built, and `weaponGeo`'s cache and `charMeshes` are
     both keyed past it — so the switch changes nothing already on screen until the entities
     are dropped and the build runs again. Same trick as tools/native.js, same reason. */
  const stage = async (native) => {
    await p.evaluate((nat) => {
      NATIVE_ART = nat;
      chars.length = 0;
      charMeshes.forEach(e => { if (e.g && e.g.parent) e.g.parent.remove(e.g); });
      charMeshes.clear();
      const s = window.__spot;
      /* the GENERIC lich: no `face`, which is what picks Lyonart's head instead */
      const c = makeChar('Reliquary', 'player', s.x, s.y, { atk: 16, def: 14, tough: 30, sex: 'm' });
      c.lich = true; c.undead = true; c.face = null; c.dir = 0; c.state = 'ok';
      c.weapon = null; c.armor = null;
      chars.push(c); window.__id = c.id;
    }, native);
    await p.waitForTimeout(2400);
  };

  /* One column of the sheet. `walk` drags the body between frames so the animator's own
     `moving` test fires and the trail gets dragged out behind it. */
  /* THE HOUR IS PART OF THE SUBJECT. This figure's two lit parts cost nothing at noon on
     white sand and carry the whole read after dark, and a lich is met in a crypt at least as
     often as in a market square — so judging it only at eleven in the morning judges half of
     it. `updateSky` is what the game itself calls when the hour turns. */
  const setHour = async (h) => {
    await p.evaluate((hh) => {
      hour = hh;
      if (typeof updateSky === 'function') updateSky();
      if (typeof syncDecorFogFull === 'function') syncDecorFogFull();
    }, h);
    await p.waitForTimeout(700);
  };

  const shoot = async (walk) => {
    const shots = [];
    for (const [lbl, yaw] of [['front', 0.0], ['three-quarter', 0.85], ['profile', 1.57], ['back', 3.14]]) {
      const shot = await p.evaluate(async ({ yaw, walk, pad }) => {
        const c = chars.find(x => x.id === window.__id);
        const e = charMeshes.get(window.__id);
        c.dir = yaw;
        if (walk) {
          /* twelve frames of real travel, so the float, the lean and the drag are all at
             the point in their cycle a moving body has them at — not frame zero */
          for (let i = 0; i < 12; i++) {
            c.x += Math.cos(yaw) * 0.045; c.y += Math.sin(yaw) * 0.045;
            syncChars(1 / 30);
          }
        } else {
          for (let i = 0; i < 6; i++) syncChars(1 / 30);
        }
        e.g.rotation.set(0, yaw, 0);
        e.g.updateWorldMatrix(true, true);
        const bb = new THREE.Box3().setFromObject(e.g);
        const ctr = bb.getCenter(new THREE.Vector3());
        const sz = bb.getSize(new THREE.Vector3());
        const r = Math.max(sz.x, sz.y, sz.z) * pad;
        const cam = camera.clone();
        cam.aspect = 1; cam.fov = 34;
        /* slightly above the middle and a touch down on it, which is where a player's
           camera actually sits — a dead-level shot flatters a silhouette that would not
           hold up in the game */
        cam.position.set(ctr.x, ctr.y + r * 0.55, ctr.z + r * 3.0);
        cam.lookAt(ctr); cam.updateProjectionMatrix();
        const cv = renderer.domElement;
        const w0 = cv.width, h0 = cv.height, sw = cv.style.width, sh = cv.style.height;
        renderer.setSize(520, 520, false);
        renderer.render(scene, cam);
        const url = cv.toDataURL('image/png');
        renderer.setSize(w0, h0, false);
        cv.style.width = sw; cv.style.height = sh;
        return url.split(',')[1];
      }, { yaw, walk, pad: PAD });
      shots.push({ lbl, shot });
    }
    return shots;
  };

  const rows = [];
  await stage(true);
  const rig = await p.evaluate(() => {
    const e = charMeshes.get(window.__id);
    const R = {};
    R.authored = !!e.authored;
    R.soulLamp = !!(e.soulLamp && e.soulLamp.material && 'emissiveIntensity' in e.soulLamp.material);
    R.capeSegments = e.cape ? e.cape.length : 0;
    R.capeLift = e.capeLift;
    R.plainBodyHidden = (e.boxBody || []).every(o => !o.visible) &&
                        (e.boxLeg || []).every(o => !o.visible) &&
                        (!e.head || !e.head.visible) && (!e.torso || !e.torso.visible);
    R.basicInMats = (e.mats || []).filter(m => m.isMeshBasicMaterial).length;
    /* what it costs: merged buffers plus the handful of lit meshes that cannot merge */
    let meshes = 0, tris = 0;
    e.g.traverse(o => {
      if (!o.isMesh || !o.geometry) return;
      meshes++;
      const g = o.geometry;
      tris += g.index ? g.index.count / 3 : g.attributes.position.count / 3;
    });
    R.meshes = meshes; R.tris = Math.round(tris);
    const bb = new THREE.Box3().setFromObject(e.g);
    const sz = bb.getSize(new THREE.Vector3());
    R.height = +sz.y.toFixed(3); R.width = +sz.x.toFixed(3);
    /* HOW FAR THE HEM IS FROM THE FLOOR, SIGNED. tools/lich.js asks only that the robe come
       DOWN far enough, because a gap under a robe with no legs in it is the failure it was
       written for — so it is one-sided, and a hem that hangs a quarter of a metre through the
       ground passes it. A curtain of loose bone has the opposite failure available to it, and
       on a slope the buried end is the one a player sees. `e.lichLift` is the float the
       animator adds past every joint, so the clearance is measured with it. */
    const base = new THREE.Vector3(); e.g.getWorldPosition(base);
    R.hemToFloor = +(bb.min.y - base.y + (e.lichLift || 0)).toFixed(3);
    return R;
  });
  rows.push({ label: 'THE RELIQUARY — standing, noon', shots: await shoot(false) });
  rows.push({ label: 'THE RELIQUARY — walking, noon', shots: await shoot(true) });
  await setHour(21);
  rows.push({ label: 'THE RELIQUARY — after dark', shots: await shoot(false) });
  await setHour(11);

  const sheet = await p.evaluate(async (rows) => {
    const all = await Promise.all(rows.map(r => Promise.all(r.shots.map(s => new Promise(res => {
      const im = new Image(); im.onload = () => res(im); im.src = 'data:image/png;base64,' + s.shot;
    })))));
    const w = 330, h = 330, L = 26;
    const cv = document.createElement('canvas');
    cv.width = w * 4; cv.height = (h + L) * all.length;
    const g = cv.getContext('2d');
    g.fillStyle = '#12100d'; g.fillRect(0, 0, cv.width, cv.height);
    all.forEach((row, i) => row.forEach((im, j) => {
      const cx = j * w, cy = i * (h + L);
      g.fillStyle = '#8fd8c0'; g.font = 'bold 14px monospace';
      g.fillText(j === 0 ? rows[i].label : rows[i].shots[j].lbl, cx + 8, cy + 17);
      const k = Math.min(w / im.width, h / im.height);
      g.drawImage(im, cx + (w - im.width * k) / 2, cy + L, im.width * k, im.height * k);
      g.strokeStyle = '#3a342a'; g.strokeRect(cx + 0.5, cy + L + 0.5, w - 1, h - 1);
    }));
    return cv.toDataURL('image/png').split(',')[1];
  }, rows);

  fs.writeFileSync(OUT, Buffer.from(sheet, 'base64'));

  const bad = [];
  if (!rig.authored) bad.push('e.authored is not set — the float never runs');
  if (!rig.soulLamp) bad.push('no soul lamp for the animator to breathe');
  if (!rig.capeSegments) bad.push('nothing on e.cape — the trail cannot drag');
  if (!(rig.capeLift > 0 && rig.capeLift < 0.25)) bad.push(`capeLift ${rig.capeLift} is a cloak's, not a hem's`);
  if (!rig.plainBodyHidden) bad.push('the plain body boxes are still visible under the bone');
  if (rig.basicInMats) bad.push(`${rig.basicInMats} MeshBasicMaterial registered in e.mats`);
  if (rig.hemToFloor < -0.06) bad.push(`the hem hangs ${(-rig.hemToFloor * 100).toFixed(0)}cm through the ground`);
  if (rig.hemToFloor > 0.10) bad.push(`the hem stops ${(rig.hemToFloor * 100).toFixed(0)}cm short of the ground`);
  for (const [k, v] of Object.entries(rig)) console.log('  ' + k.padEnd(16) + v);
  for (const e of errs) console.log('  PAGEERROR: ' + e);
  console.log('');
  console.log(path.basename(OUT));
  console.log(bad.length || errs.length ? 'THE RIG IS BROKEN: ' + bad.join('; ') : 'THE RIG HOLDS');
  await b.close();
  process.exit(bad.length || errs.length ? 1 : 0);
})();
