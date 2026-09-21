#!/usr/bin/env node
/* IT FORGED ITSELF OUT OF WHAT IT THOUGHT A GOD WAS MADE OF.
 *
 * A Fallen is a Messenger that put the eldritch down and built itself a body in the image of
 * statuary — a mimicry of a mimicry, and the joke is the whole line. `oldGodPlate` builds the
 * motif and the Messenger shares it, because they are the same stuff.
 *
 * It was PALE STONE, and that was wrong twice. Wrong for the world — the homunculi are
 * bloodless, the Hollows are grey-violet, half the statuary is sandstone, and the Messenger it
 * used to be is pale stone too, so the one line that CHOSE its own body looked like four other
 * things. And wrong for the render: `oldGodPlate` lightened the base by a seventh and darkened
 * it by a quarter, so a chest, pectorals, a belly line and a set of ribs were all carved at
 * thirteen percent off the colour they were carved in, under a sun that flattens that to
 * nothing. Every shape was there and none of it was visible.
 *
 *   1. IT IS DARK NOW, and the carving reads BECAUSE it is dark — the highlight goes lighter
 *      and the vein goes to metal, taking its direction from the stone rather than from a
 *      fixed multiplier.
 *   2. THE MESSENGER IS UNTOUCHED. Same function, same motif, pale stone, opposite material —
 *      which is a better contrast than the two of them sharing one.
 *   3. THE MANTLE HANGS off `e.cape` instead of being a slab bolted to a shoulder.
 *   4. AND IT CHIPS. `voidDeath` is on this line and the race note says the Fallen come apart
 *      the way a Watcher does; a thing made of stone does not bruise. Six fractures open as
 *      the blood goes and they stay open.
 *
 *   node tools/fallen.js [out.png] [game.html]
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const OUT = path.resolve(process.argv[2] || path.join(__dirname, 'fallen.png'));
const gamePath = (a) => path.resolve(a ? (path.isAbsolute(a) ? a : path.join(__dirname, a)) : path.join(__dirname, 'game.html'));

(async () => {
  const b = await chromium.launch({
    executablePath: process.env.DUSTWARD_CHROME || undefined,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'],
  });
  const p = await b.newPage({ viewport: { width: 900, height: 700 } });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message.slice(0, 220)));
  await p.goto('file://' + gamePath(process.argv[3]), { waitUntil: 'load' });
  await p.waitForSelector('#btn-start', { state: 'attached', timeout: 60000 });
  await p.evaluate(() => { document.getElementById('btn-start').click(); paused = true; });
  await p.waitForTimeout(3000);

  const R = await p.evaluate(() => {
    paused = true; hour = 11; debugSeeAll = true;
    if (typeof updateSky === 'function') updateSky();
    if (typeof fogPlane !== 'undefined') fogPlane.visible = false;
    if (typeof syncDecorFogFull === 'function') syncDecorFogFull();
    const out = {};
    const me = player()[0];
    let spot = null;
    for (const pad of [10, 7, 5]) {
      for (let r = 40; r < 240 && !spot; r += 4) for (let a = 0; a < 24 && !spot; a++) {
        const x = me.x + Math.cos(a / 24 * 6.283) * r, y = me.y + Math.sin(a / 24 * 6.283) * r;
        if (x < pad + 4 || y < pad + 4 || x >= W - pad - 4 || y >= H - pad - 4) continue;
        let ok = true;
        for (let dy = -pad; dy <= pad && ok; dy++) for (let dx = -pad; dx <= pad && ok; dx++) {
          const ix = Math.floor(x) + dx, iy = Math.floor(y) + dy;
          if (isBlocked(ix + 0.5, iy + 0.5, 0) || terr[iy * W + ix] === 3 || decorAt(ix, iy)) ok = false;
        }
        if (ok) spot = { x, y };
      }
      if (spot) break;
    }
    window.__spot = spot || { x: me.x, y: me.y };
    const clear = () => {
      chars.length = 0;
      charMeshes.forEach(e => { if (e.g && e.g.parent) e.g.parent.remove(e.g); });
      charMeshes.clear();
    };
    const one = (set, opts) => {
      const c = makeChar('F', 'player', window.__spot.x, window.__spot.y,
        Object.assign({ atk: 10, def: 10, tough: 10, race: 'mimic', sub: 'fallen', sex: 'm', age: 30 }, opts || {}));
      c.state = 'ok'; c.weapon = null; c.armor = null;
      Object.assign(c, set || {});
      chars.push(c);
      syncChars(0.05); syncChars(0.05);
      return { c, e: charMeshes.get(c.id) };
    };
    const lum = (hex) => { const k = new THREE.Color(hex); return (k.r + k.g + k.b) / 3; };

    /* ---------- 1. IT IS WROUGHT OUT OF ORE ---------- */
    clear();
    {
      const skins = SUBRACES.mimic.fallen.skins || [SUBRACES.mimic.fallen.skin];
      const bright = skins.filter(s2 => lum(s2) > 0.25);
      out.stock = skins.join(' ') + '  (mean lum ' + (skins.reduce((t, s2) => t + lum(s2), 0) / skins.length).toFixed(3) + ')';
      out.itIsWroughtFromOre = (skins.length >= 3 && !bright.length)
        ? `${skins.length} blacks with different casts in them, none of them above 0.25 luminance — ${out.stock}`
        : `!! THE STOCK IS NOT ORE: ${out.stock}`;
    }

    /* ---------- 2. AND THE CARVING READS AGAINST IT ----------
       The claim is about CONTRAST, so contrast is what gets measured: the lightest thing on
       the body against the darkest, in the colours the build actually chose. */
    clear();
    {
      const { e } = one();
      const cols = [];
      e.g.traverse(o => {
        if (!o.isMesh || !o.geometry || !o.geometry.attributes.color) return;
        const a = o.geometry.attributes.color;
        for (let i = 0; i < a.count; i += 3) cols.push((a.getX(i) + a.getY(i) + a.getZ(i)) / 3);
      });
      cols.sort((x, y) => x - y);
      const lo = cols[Math.floor(cols.length * 0.10)], hi = cols[Math.floor(cols.length * 0.90)];
      out.contrast = `${lo.toFixed(3)} to ${hi.toFixed(3)}`;
      out.theCarvingReads = (hi - lo > 0.12)
        ? `the carving stands ${(hi - lo).toFixed(3)} clear of the stone it is cut in — ${out.contrast}`
        : `!! THE CARVING IS THE SAME COLOUR AS THE STONE (${out.contrast})`;
      clear();
    }

    /* ---------- 3. THE MESSENGER IS UNTOUCHED ----------
       A MESSENGER IS NOT A MIMIC SUB. It is `gauntKind`, on its own rig branch entirely — the
       first version of this asked for `sub: 'messenger'`, got an ordinary mimic with no motif
       on it, and reported that the Messenger had lost something it had never been given. */
    clear();
    {
      const m = spawnGaunt('messenger', window.__spot.x + 2, window.__spot.y);
      syncChars(0.05); syncChars(0.05);
      const e = m && charMeshes.get(m.id);
      out.andTheMessengerIsStillStone = (e && e.oldGod)
        ? 'a Messenger still wears the same motif, in the pale stone it always had — one function, two materials, and that is a better contrast than the two of them sharing one'
        : `!! THE MESSENGER LOST THE MOTIF (spawned ${!!m}, built ${!!e})`;
      clear();
    }

    /* ---------- 4. THE MANTLE HANGS ---------- */
    clear();
    {
      const { e } = one();
      out.capeSegments = e.cape ? e.cape.length : 0;
      const still = e.cape ? e.cape.map(s2 => s2.rotation.x) : [];
      /* walk it: the animator drags a cape a beat behind the body, so a hanging mantle must
         move when the body does and a bolted-on slab must not */
      const c2 = chars[0];
      for (let i = 0; i < 40; i++) { c2.x += 0.05; syncChars(1 / 30); }
      const moved = e.cape ? e.cape.map((s2, i) => Math.abs(s2.rotation.x - still[i])) : [];
      const most = moved.length ? Math.max(...moved) : 0;
      out.theMantleHangs = (e.cape && e.cape.length >= 3 && most > 0.02)
        ? `the mantle is ${e.cape.length} segments on \`e.cape\` and the walk drags it ${most.toFixed(3)} rad behind the body`
        : `!! THE MANTLE IS STILL BOLTED ON (${out.capeSegments} segments, ${most.toFixed(3)} rad)`;
      clear();
    }

    /* ---------- 5. AND IT CHIPS ---------- */
    clear();
    {
      const { c, e } = one();
      const shown = () => e.fractures.filter(f => f.visible).length;
      const reads = {};
      for (const blood of [100, 70, 40, 10]) {
        c.blood = blood; syncChars(1 / 30);
        reads[blood] = shown();
      }
      c.state = 'dead'; syncChars(1 / 30);
      reads.dead = shown();
      out.fractureReadings = Object.entries(reads).map(([k, v]) => `${k}: ${v}`).join(' | ');
      out.itChipsAsItGoes = (e.fractures && e.fractures.length === 6 && reads[100] === 0
                             && reads[40] > reads[70] && reads.dead === 6)
        ? `a statue does not bruise — it opens one more fracture per sixth of its blood and wears all six dead (${out.fractureReadings})`
        : `!! THE FRACTURES ARE NOT TRACKING THE DAMAGE: ${out.fractureReadings}`;
      clear();
    }
    return out;
  });

  const shot = await p.evaluate(async () => {
    const me = window.__spot;
    const png = [];
    for (const [hr, h] of [[11, 470], [21, 470]]) {
      hour = hr;
      if (typeof updateSky === 'function') updateSky();
      chars.length = 0;
      charMeshes.forEach(e => { if (e.g && e.g.parent) e.g.parent.remove(e.g); });
      charMeshes.clear();
      document.querySelectorAll('.hud,#charpanel,#invpanel,#minimap,#log,#tip,#squadbar,#buildbar,#touchbar')
        .forEach(el => el.style.setProperty('display', 'none', 'important'));
      const made = [];
      [100, 55, 12].forEach((blood, j) => {
        const c = makeChar('F', 'player', me.x + (j - 1) * 1.55, me.y,
          { atk: 10, def: 10, tough: 10, race: 'mimic', sub: 'fallen', sex: 'm', age: 30 });
        c.state = 'ok'; c.dir = 0; c.weapon = null; c.armor = null; c.blood = blood;
        chars.push(c); made.push(c);
      });
      /* THE MESSENGER STAYS OUT OF THE PICTURE. It is its own rig off `gauntKind`, it is
         `big: 1.2`, and `spawnGaunt` puts it where it can stand rather than where it was
         asked to — so including it in the group's bounding box threw the camera off the three
         bodies this sheet is about and photographed an empty field with a skull in the corner.
         The claim about it above is where it belongs; a sheet is not the place to prove it. */
      for (let i = 0; i < 14; i++) syncChars(0.05);
      const box = new THREE.Box3();
      for (const c of made) {
        const e = charMeshes.get(c.id);
        if (!e) continue;
        e.g.rotation.set(0, 0, 0); e.g.updateWorldMatrix(true, true);
        box.expandByObject(e.g);
      }
      const ctr = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3());
      const cam = camera.clone();
      cam.aspect = 1300 / h; cam.fov = 28;
      const back = Math.max(s.x, s.y * (1300 / h)) * 1.10;
      cam.position.set(ctr.x, ctr.y + back * 0.16, ctr.z + back);
      cam.lookAt(ctr); cam.updateProjectionMatrix();
      const cv0 = renderer.domElement;
      const w0 = cv0.width, h0 = cv0.height, sw = cv0.style.width, sh = cv0.style.height;
      renderer.setSize(1300, h, false);
      renderer.render(scene, cam);
      png.push(cv0.toDataURL('image/png').split(',')[1]);
      renderer.setSize(w0, h0, false);
      cv0.style.width = sw; cv0.style.height = sh;
    }
    hour = 11; if (typeof updateSky === 'function') updateSky();
    const ims = await Promise.all(png.map(d => new Promise(res => {
      const im = new Image(); im.onload = () => res(im); im.src = 'data:image/png;base64,' + d;
    })));
    const L = 28;
    const cv = document.createElement('canvas');
    cv.width = ims[0].width; cv.height = (ims[0].height + L) * 2;
    const g = cv.getContext('2d');
    g.fillStyle = '#12100d'; g.fillRect(0, 0, cv.width, cv.height);
    const caps = ['NOON —        WHOLE          HALF SPENT        NEARLY OUT       AND A MESSENGER',
                  'AFTER DARK —  WHOLE          HALF SPENT        NEARLY OUT       AND A MESSENGER'];
    ims.forEach((im, i) => {
      const y = i * (im.height + L);
      g.fillStyle = '#c9a94e'; g.font = 'bold 16px monospace';
      g.fillText(caps[i], 12, y + 20);
      g.drawImage(im, 0, y + L);
    });
    return cv.toDataURL('image/png').split(',')[1];
  });

  fs.writeFileSync(OUT, Buffer.from(shot, 'base64'));
  for (const [k, v] of Object.entries(R)) console.log('  ' + k.padEnd(28) + v);
  for (const e of errs) console.log('  PAGEERROR: ' + e);
  console.log('\n  ' + path.basename(OUT));
  const bad = Object.values(R).map(String).filter(v => v.startsWith('!!'));
  console.log('\n' + (bad.length || errs.length ? 'IT IS STILL A MAN WITH SUBTLE ABS' : 'FORGED OUT OF WHAT IT THOUGHT A GOD WAS'));
  await b.close();
  process.exit(bad.length || errs.length ? 1 : 0);
})();
