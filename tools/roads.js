#!/usr/bin/env node
/* THE OTHER TWO ROADS.
 *
 * Three immortalities were found in the Golden Age and the Dark one got a whole figure. The
 * other two got a colour each: the Unclouding was pale skin and pale eyes on an otherwise
 * ordinary body, and the Sigil Rite was an ordinary man in plate with a bronze helmet on —
 * which is a picture of somebody WEARING armour, and the whole of that fiction is that there
 * is nobody in there to wear it.
 *
 * THE VIGIL is what the Unclouding leaves, and it is the hardest of the three to draw because
 * the other two are monsters and this one is a success. The horror is perfection: a body whose
 * landmarks — knuckles, a brow, a mouth, the corner of an eye — have been polished off one by
 * one into surface. Nothing is missing. Everything has been completed, and what is completed
 * is no longer anybody. The eyes have no lids and the light behind them gets out wherever she
 * is jointed.
 *
 * THE VESSEL is what the Sigil Rite pours into, and it has to read as EMPTY — which is the one
 * thing a suit of armour on a body never does. A hole at the collar with nothing behind it;
 * plates that meet where a mould's halves met rather than where a person bends; and no visor,
 * because opening it ends it.
 *
 *   node tools/roads.js [out.png] [game.html]
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const OUT = path.resolve(process.argv[2] || path.join(__dirname, 'roads.png'));
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
    /* WHAT IS ACTUALLY DRAWN. The plain body is BUILT and then hidden — `bakeBoxes` merges the
       hideable boxes into their own mesh and the visibility flags go on afterwards — so a
       walk that ignores `visible` counts a whole second body nobody can see. That is how "is
       Verity still carrying the vat marks" came back red: a homunculus's hidden plain body is
       not a human's hidden plain body, and the probe was comparing two invisible corpses. */
    const tris = (o) => {
      if (!o || typeof o.traverse !== 'function')
        throw new Error('tris() got ' + (o === undefined ? 'undefined' : (o && o.constructor && o.constructor.name) || typeof o));
      let t = 0;
      o.traverse(x => {
        if (!x.isMesh || !x.geometry) return;
        let v = x.visible, q = x.parent;
        while (q && v) { v = q.visible; q = q.parent; }
        if (!v) return;
        const g = x.geometry;
        t += g.index ? g.index.count / 3 : g.attributes.position.count / 3;
      });
      return Math.round(t);
    };
    const rebuilt = (c) => {
      const e0 = charMeshes.get(c.id);
      if (e0 && e0.g && e0.g.parent) e0.g.parent.remove(e0.g);
      charMeshes.delete(c.id);
      syncChars(0.05); syncChars(0.05);
      return charMeshes.get(c.id);
    };
    const one = (set, opts) => {
      const c = makeChar('R', 'player', window.__spot.x, window.__spot.y,
        Object.assign({ atk: 14, def: 14, tough: 14, sex: 'm', age: 30 }, opts || {}));
      c.state = 'ok'; c.weapon = null; c.armor = null;
      Object.assign(c, set || {});
      chars.push(c);
      syncChars(0.05); syncChars(0.05);
      return { c, e: charMeshes.get(c.id) };
    };
    /* every VERTEX on a bone, in world space, with the colour it was baked with. The merged
       buffers mean there is no per-box mesh left to ask, and these claims are about where one
       colour stops and another starts — so the vertices are the only honest place to look. */
    /* `skip` is not a nicety. The head bone is a CHILD of the spine, so a walk from the spine
       collects the helm too — which is how "is the collar open" came back measuring the helm's
       own comb as the top of the shell and reported a 0.67 overlap on a figure that has a hole
       in it. `lit` drops emissive meshes, because the eye test asks where the FACE ends and the
       eyes are the thing being compared against it. */
    const verts = (root, skip, dropLit) => {
      const outv = [];
      root.updateWorldMatrix(true, true);
      root.traverse(o => {
        if (skip) { let q = o; while (q) { if (q === skip) return; q = q.parent; } }
        { let v = o.visible, q2 = o.parent; while (q2 && v) { v = q2.visible; q2 = q2.parent; } if (!v) return; }
        if (dropLit && o.material && o.material.emissive && o.material.emissive.getHex() > 0) return;
        if (dropLit && o.material && o.material.transparent) return;
        if (!o.isMesh || !o.geometry || !o.geometry.attributes.position) return;
        const pos = o.geometry.attributes.position, col = o.geometry.attributes.color;
        const v = new THREE.Vector3();
        for (let i = 0; i < pos.count; i++) {
          v.set(pos.getX(i), pos.getY(i), pos.getZ(i)).applyMatrix4(o.matrixWorld);
          outv.push({ x: v.x - root.getWorldPosition(new THREE.Vector3()).x, y: v.y, z: v.z,
                      l: col ? (col.getX(i) + col.getY(i) + col.getZ(i)) / 3 : null });
        }
      });
      return outv;
    };

    /* ================= THE VIGIL ================= */
    clear();
    {
      const { c, e } = one({ immortal: 'divine' }, { gift: 'divine', sex: 'f' });
      out.vigilLit = e.glowMats.length;
      const plainOn = [e.boxBody, e.boxArm, e.boxLeg].flat().filter(m => m && m.visible).length
                    + ((e.head && e.head.visible) ? 1 : 0) + ((e.torso && e.torso.visible) ? 1 : 0);
      out.theVigilReplacesTheBody = (plainOn === 0 && tris(e.g) > 400 && e.glowMats.length >= 8)
        ? `the plain body is gone and ${tris(e.g)} triangles of her stand in its place, with ${e.glowMats.length} lit parts`
        : `!! THE VIGIL DID NOT REPLACE THE BODY (${plainOn} plain meshes showing, ${tris(e.g)} tris, ${e.glowMats.length} lit)`;

      /* SHE KEPT A PERSON'S SHAPE, which is the difference between her road and the lich's —
         a lich has no legs at all and she has two, and that is the fiction, not a detail. */
      const legTris = (e.legL ? tris(e.legL) : 0) + (e.legR ? tris(e.legR) : 0);
      const hem = new THREE.Box3().setFromObject(e.cape[e.cape.length - 1]).min.y;
      const foot = Math.min(e.kneeL ? new THREE.Box3().setFromObject(e.kneeL).min.y : 1e9,
                            e.kneeR ? new THREE.Box3().setFromObject(e.kneeR).min.y : 1e9);
      out.hemAndFeet = `hem ${hem.toFixed(3)}, feet ${foot.toFixed(3)}`;
      out.sheKeptAPersonsShape = (legTris > 0 && foot < hem - 0.02)
        ? `${legTris} triangles of leg come out from under a hem that stops short of the floor — where a lich's reaches PAST it so nothing ever cuts a line underneath (${out.hemAndFeet})`
        : `!! SHE IS A LICH IN WHITE (${legTris} leg tris, ${out.hemAndFeet})`;

      /* THE EYES STAND PROUD OF THE FACE. They were built flush at first and the face plate
         swallowed them whole: the same mistake as a phylactery behind a sternum. */
      const headFront = Math.max(...verts(e.headG, null, true).map(v => v.z));
      const eyeZs = [];
      e.headG.traverse(o => {
        if (o.isMesh && o.material && o.material.emissive && o.material.emissive.getHex() > 0) {
          eyeZs.push(new THREE.Box3().setFromObject(o).max.z);
        }
      });
      const eyeFront = eyeZs.length ? Math.max(...eyeZs) : -1e9;
      out.faceZ = `face ${headFront.toFixed(3)}, lit ${eyeFront.toFixed(3)}`;
      out.theEyesStandProudOfTheFace = eyeFront > headFront - 0.002
        ? `the lit eyes sit at or in front of everything else on the head — ${out.faceZ}`
        : `!! THE EYES ARE BURIED IN THE FACE PLATE (${out.faceZ})`;

      /* AND THE VEIL READS AGAINST HER. She is pale all over, so the one garment on her has to
         carry every bit of the separation there is. */
      const vs = verts(e.headG, null, true).filter(v => v.l !== null).map(v => v.l).sort((a, b) => a - b);
      const lo = vs[Math.floor(vs.length * 0.10)], hi = vs[Math.floor(vs.length * 0.90)];
      out.veilContrast = `${lo.toFixed(3)} to ${hi.toFixed(3)}`;
      out.theVeilReadsAgainstTheSkin = (hi - lo) > 0.12
        ? `the cloth stands ${(hi - lo).toFixed(3)} clear of the woman under it — ${out.veilContrast}`
        : `!! THE VEIL AND THE SKIN ARE ONE PALE COLUMN (${out.veilContrast})`;
      void c;
      clear();
    }

    /* AND SHE IS NOT VAT-GROWN. Verity borrows `race: 'homunculus'` for the pale skin, which
       was harmless while a homunculus was three tells and a haircut and now drags a mould
       seam, a batch stamp and an eleven-year decay clock onto a Scholar who ascended. */
    clear();
    {
      const perBone = (e) => {
        const o = {};
        for (const k of ['headG', 'spine', 'armL', 'armR', 'legL', 'legR', 'elbL', 'kneeL'])
          if (e[k]) o[k] = tris(e[k]);
        return o;
      };
      const h0 = one({ immortal: 'divine' }, { gift: 'divine', sex: 'f', race: 'human' });
      const asHuman = tris(h0.e.g);
      const boneH = perBone(h0.e);
      clear();
      const v0 = one({ immortal: 'divine' }, { gift: 'divine', sex: 'f', race: 'homunculus', age: 30 });
      const asVerity = tris(v0.e.g);
      const boneV = perBone(v0.e);
      window.__bone = {};
      for (const k of Object.keys(boneH)) if (boneH[k] !== boneV[k]) window.__bone[k] = boneH[k] + '->' + boneV[k];
      clear();
      out.sheIsNotVatGrown = asHuman === asVerity
        ? `Verity's borrowed race buys her nothing but the skin — ${asVerity} triangles either way, no seam, no batch mark, no decay clock`
        : `!! THE VAT MARKS ARE STILL ON HER (human ${asHuman}, homunculus ${asVerity}) — ${JSON.stringify(window.__bone || {})}`;
    }

    /* ================= THE VESSEL ================= */
    clear();
    {
      const { c, e } = one({ immortal: 'transmute', construct: true, big: 1.15 }, { gift: 'destruction' });
      const plainOn = [e.boxBody, e.boxArm, e.boxLeg].flat().filter(m => m && m.visible).length
                    + ((e.head && e.head.visible) ? 1 : 0) + ((e.torso && e.torso.visible) ? 1 : 0);
      out.theVesselReplacesTheBody = (plainOn === 0 && tris(e.g) > 500)
        ? `the plain body is gone and ${tris(e.g)} triangles of poured plate stand in its place`
        : `!! THE VESSEL DID NOT REPLACE THE BODY (${plainOn} plain meshes, ${tris(e.g)} tris)`;

      /* THE HOLE AT THE COLLAR, and this is the claim the whole figure rests on. The first
         build put the collar rim at spine 0.665 and the helm's chin at head-local 0.105 —
         world 1.71 against world 1.59 — so the helm was sunk a hand's width INSIDE the collar
         and the one box that says "empty" was hidden behind the one most likely to hide it.
         Measured on the vertices: the lowest point of the helm has to be clear above the
         highest point of the shell that is NOT the darkness standing in the opening. */
      const hv = verts(e.headG, null, true);
      const helmBottom = Math.min(...hv.map(v => v.y));
      const sv = verts(e.spine, e.headG, true).filter(v => v.l !== null);
      const dark = sv.filter(v => v.l < 0.06);
      const shell = sv.filter(v => v.l >= 0.06);
      const shellTop = Math.max(...shell.map(v => v.y));
      const darkTop = Math.max(...dark.map(v => v.y));
      /* how wide each of them is UP WHERE THEY MEET, which is what decides whether there is a
         ring to see into or just a lid on a jar */
      const band = (arr, lo, hi) => {
        const inb = arr.filter(v => v.y > lo && v.y < hi).map(v => Math.abs(v.x));
        return inb.length ? Math.max(...inb) : 0;
      };
      const ringLo = helmBottom, ringHi = shellTop;
      const funnelW = band(shell, ringLo, ringHi + 0.01);
      const helmW = band(hv, ringLo - 0.01, ringHi);
      out.collar = `funnel to ${shellTop.toFixed(3)} (half-width ${funnelW.toFixed(3)}), helm from ${helmBottom.toFixed(3)} (${helmW.toFixed(3)}), dark to ${darkTop.toFixed(3)}`;
      /* THE HELM SITS DOWN IN THE FUNNEL AND THERE IS A RING OF DARK AROUND IT. This claim has
         been rewritten twice and both rewrites were the figure changing under it rather than
         the claim being wrong. It first asked for a GAP between the shell and the helm, which
         was right for a collar-and-helm — and reported a 0.034 overlap on a body that visibly
         had a hole in it, because the walk was counting the hidden plain body whose head box
         is still built and still sitting inside the helm. Two wrong numbers agreed.
         Then the collar became a FUNNEL that the helm comes down inside, so an overlap is the
         intent and a gap would mean the funnel had stopped swallowing anything. What the
         figure is actually about is the RING: the funnel has to reach up past the helm's base
         AND be wider than the helm is there, or the helm is simply a lid. */
      out.theVesselIsEmptyAtTheCollar = (shellTop > helmBottom + 0.03 && funnelW > helmW + 0.03 && darkTop > helmBottom)
        ? `the helm comes down ${(shellTop - helmBottom).toFixed(3)} inside a funnel ${(funnelW - helmW).toFixed(3)} wider than it is, and the ring between them is dark all the way up — ${out.collar}`
        : `!! THE HELM IS A LID ON THE FUNNEL, NOT A THING SITTING IN IT (${out.collar})`;

      /* AND IT IS SEALED. `helmKind` still answers 'sigil' for the named one, and the armet it
         builds has a SIGHT SLIT that kit.js asserts the existence of — stacking it on top of
         this helm puts an opening over the one figure that must not have one. */
      out.theHelmIsSealed = (!e.helmParts || !e.helmParts.length)
        ? 'no armet is built over it — the sealed helm is the only thing on the head, and there is no slit in it'
        : `!! AN ARMET WENT ON OVER THE SEALED HELM (${e.helmParts.length} parts, and one of them is a sight slit)`;

      /* THE SIGILS GO OUT AS IT FAILS */
      const on = () => e.sigils.filter(m => m.material.emissive.getHex() > 0x000000).length;
      const reads = {};
      for (const blood of [100, 70, 40, 12]) { c.blood = blood; syncChars(1 / 30); reads[blood] = on(); }
      c.state = 'dead'; syncChars(1 / 30);
      reads.dead = on();
      out.sigilReadings = Object.entries(reads).map(([k, v]) => `${k}: ${v}`).join(' | ');
      out.theSigilsGoOutAsItFails = (e.sigils.length === 8 && reads[100] === 8
                                     && reads[40] < reads[70] && reads.dead === 0)
        ? `eight sigils, and they go out as the vessel fails — "when the last one goes, so does what is left of me" (${out.sigilReadings})`
        : `!! THE SIGILS ARE NOT TRACKING THE VESSEL (${e.sigils.length} of them, ${out.sigilReadings})`;
      clear();
    }

    /* ================= AND BOTH SWITCHES STILL SWITCH ================= */
    clear();
    {
      const { c, e } = one({ immortal: 'divine' }, { gift: 'divine', sex: 'f' });
      const withIt = tris(e.g);
      NATIVE_UNCLOUDED = false;
      const without = tris(rebuilt(c).g);
      NATIVE_UNCLOUDED = true;
      const back = tris(rebuilt(c).g);
      clear();
      const { c: c2, e: e2 } = one({ immortal: 'transmute', construct: true }, { gift: 'destruction' });
      const vWith = tris(e2.g);
      NATIVE_VESSEL = false;
      const vWithout = tris(rebuilt(c2).g);
      NATIVE_VESSEL = true;
      const vBack = tris(rebuilt(c2).g);
      clear();
      out.bothSwitchesStillSwitch = (without !== withIt && back === withIt && vWithout !== vWith && vBack === vWith)
        ? `each road can be put back the way it was and returned — Vigil ${withIt}/${without}/${back}, Vessel ${vWith}/${vWithout}/${vBack}`
        : `!! A SWITCH IS STUCK (Vigil ${withIt}/${without}/${back}, Vessel ${vWith}/${vWithout}/${vBack})`;
    }
    return out;
  });

  const shot = await p.evaluate(async () => {
    const me = window.__spot;
    const png = [];
    const rows = [
      { cap: 'THE VIGIL —   what the Unclouding leaves', who: 'divine' },
      { cap: 'THE VESSEL —  what the Sigil Rite pours into', who: 'transmute', close: true },
    ];
    for (const row of rows) {
      for (const hr of [11, 21]) {
        hour = hr;
        if (typeof updateSky === 'function') updateSky();
        chars.length = 0;
        charMeshes.forEach(e => { if (e.g && e.g.parent) e.g.parent.remove(e.g); });
        charMeshes.clear();
        document.querySelectorAll('.hud,#charpanel,#invpanel,#minimap,#log,#tip,#squadbar,#buildbar,#touchbar')
          .forEach(el => el.style.setProperty('display', 'none', 'important'));
        const made = [];
        for (let j = 0; j < 3; j++) {
          const c = makeChar('R', 'player', me.x + (j - 1) * 1.45, me.y,
            { atk: 14, def: 14, tough: 14, sex: row.who === 'divine' ? 'f' : 'm', age: 30,
              gift: row.who === 'divine' ? 'divine' : 'destruction' });
          c.state = 'ok'; c.weapon = null; c.armor = null;
          c.dir = j === 0 ? 0 : j === 1 ? 0.85 : 1.57;
          c.immortal = row.who;
          if (row.who === 'transmute') { c.construct = true; c.big = 1.15; c.blood = j === 2 ? 30 : c.maxBlood; }
          chars.push(c); made.push(c);
        }
        for (let i = 0; i < 14; i++) syncChars(0.05);
        const box = new THREE.Box3();
        for (const c of made) {
          const e = charMeshes.get(c.id);
          if (!e) continue;
          e.g.rotation.set(0, c.dir, 0); e.g.updateWorldMatrix(true, true);
          box.expandByObject(e.g);
        }
        const ctr = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3());
        const cam = camera.clone();
        cam.aspect = 2.6; cam.fov = 27;
        /* the Vessel is shot closer: the funnel, the name band and the mismatched shoulders are
           all things you have to be near enough to read, and a sheet that proves a silhouette
           does not prove the three details the silhouette is made of */
        const back = Math.max(s.x, s.y * 2.6) * (row.close ? 0.80 : 1.04);
        cam.position.set(ctr.x, ctr.y + back * 0.14, ctr.z + back);
        cam.lookAt(ctr); cam.updateProjectionMatrix();
        const cv0 = renderer.domElement;
        const w0 = cv0.width, h0 = cv0.height, sw = cv0.style.width, sh = cv0.style.height;
        renderer.setSize(1280, 492, false);
        renderer.render(scene, cam);
        png.push(cv0.toDataURL('image/png').split(',')[1]);
        renderer.setSize(w0, h0, false);
        cv0.style.width = sw; cv0.style.height = sh;
      }
    }
    hour = 11; if (typeof updateSky === 'function') updateSky();
    const ims = await Promise.all(png.map(d => new Promise(res => {
      const im = new Image(); im.onload = () => res(im); im.src = 'data:image/png;base64,' + d;
    })));
    const L = 28;
    const cv = document.createElement('canvas');
    cv.width = ims[0].width; cv.height = (ims[0].height + L) * 4;
    const g = cv.getContext('2d');
    g.fillStyle = '#12100d'; g.fillRect(0, 0, cv.width, cv.height);
    const caps = [rows[0].cap + '   — noon', rows[0].cap + '   — after dark',
                  rows[1].cap + '   — noon', rows[1].cap + '   — after dark, and the right-hand one is nearly spent'];
    ims.forEach((im, i) => {
      const y = i * (im.height + L);
      g.fillStyle = i < 2 ? '#ffe9b4' : '#f0c05a';
      g.font = 'bold 16px monospace';
      g.fillText(caps[i], 12, y + 20);
      g.drawImage(im, 0, y + L);
    });
    return cv.toDataURL('image/png').split(',')[1];
  });

  fs.writeFileSync(OUT, Buffer.from(shot, 'base64'));
  for (const [k, v] of Object.entries(R)) console.log('  ' + k.padEnd(30) + v);
  for (const e of errs) console.log('  PAGEERROR: ' + e);
  console.log('\n  ' + path.basename(OUT));
  const bad = Object.values(R).map(String).filter(v => v.startsWith('!!'));
  console.log('\n' + (bad.length || errs.length ? 'TWO ROADS STILL DESCRIBED AND NOT DRAWN' : 'THREE IMMORTALITIES, THREE FIGURES'));
  await b.close();
  process.exit(bad.length || errs.length ? 1 : 0);
})();
