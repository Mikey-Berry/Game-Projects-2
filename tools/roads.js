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

    /* ================= THE VESSEL, AND THERE ARE FOUR OF IT =================
       The Sigil Rite is jury-rigged alchemy that worked, not a formula that is followed, so
       what you get poured into is what somebody could build. Four patterns, rolled once at the
       pouring and then yours for good. The claims below are in two halves: the ones every
       vessel has to pass whatever shape it came out (it replaces the body, it is sealed, its
       name goes dark as it fails) and the one thing each pattern exists to do that the other
       three do not — because four patterns that pass the same four tests are one pattern in
       four colours, which is the thing this was built to avoid. */
    clear();
    {
      const PATS = ['funnel', 'plate', 'armature', 'canister'];

      /* THE POUR IS A ROLL AND IT HAS TO SPREAD. `vesselPattern` falls back to `hash2` off the
         id for anyone the world minted before the roll existed, and a hash that lands on one
         key for two thirds of the ids would ship a game with one vessel in it and three
         rumours. */
      const counts = {};
      for (let i = 1; i <= 6000; i++) { const k = vesselPattern({ id: i }); counts[k] = (counts[k] || 0) + 1; }
      out.pourSpread = PATS.map(k => `${k} ${((counts[k] || 0) / 60).toFixed(1)}%`).join(' | ');
      out.everyPatternGetsPoured = PATS.every(k => (counts[k] || 0) > 600)
        ? `all four come up, none of them rare enough to be a rumour — ${out.pourSpread}`
        : `!! THE POUR DOES NOT SPREAD OVER FOUR PATTERNS (${out.pourSpread})`;

      /* HOW MUCH OF ITS OWN SILHOUETTE EACH ONE FILLS. Rays straight through the torso from
         the front, counted against the torso's own bounding box — which is the only honest way
         to ask "can you see through this", because a frame and a drum have the same vertices
         doing completely different work and a triangle count cannot tell them apart. */
      /* THE OUTLINE ITSELF, on a grid normalised to the figure's own box. A triangle count and
         a height cannot tell a flared collar from a bolted drum — they came back 0.055 apart on
         two bodies nobody would confuse for a second, which is the probe being wrong about what
         it was asked, not the models being the same. What "not a reskin" means is that the
         SHAPE differs, so the shape is what gets sampled: rays through the whole figure from the
         front, scaled into its own bounds, and two patterns are the same body only if the same
         cells come back filled. */
      const silhouette = (e, nx, ny) => {
        const meshes = [];
        e.g.updateWorldMatrix(true, true);
        e.g.traverse(o => {
          { let v = o.visible, q = o.parent; while (q && v) { v = q.visible; q = q.parent; } if (!v) return; }
          if (o.isMesh && o.geometry) meshes.push(o);
        });
        const box = new THREE.Box3();
        for (const m of meshes) box.expandByObject(m);
        const rc = new THREE.Raycaster();
        const o0 = new THREE.Vector3(), d0 = new THREE.Vector3(0, 0, -1);
        const grid = [];
        for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
          o0.set(box.min.x + (box.max.x - box.min.x) * (i + 0.5) / nx,
                 box.min.y + (box.max.y - box.min.y) * (j + 0.5) / ny, box.max.z + 3);
          rc.set(o0, d0);
          grid.push(rc.intersectObjects(meshes, false).length > 0 ? 1 : 0);
        }
        return grid;
      };
      const openFrac = (e) => {
        const skip = [e.headG, e.armL, e.armR, e.legL, e.legR, e.elbL, e.elbR, e.kneeL, e.kneeR].filter(Boolean);
        const meshes = [];
        e.spine.updateWorldMatrix(true, true);
        e.spine.traverse(o => {
          for (const s of skip) { let q = o; while (q) { if (q === s) return; q = q.parent; } }
          { let v = o.visible, q2 = o.parent; while (q2 && v) { v = q2.visible; q2 = q2.parent; } if (!v) return; }
          if (o.isMesh && o.geometry) meshes.push(o);
        });
        const box = new THREE.Box3();
        for (const m of meshes) box.expandByObject(m);
        const rc = new THREE.Raycaster();
        const o0 = new THREE.Vector3(), d0 = new THREE.Vector3(0, 0, -1);
        let hit = 0, tot = 0;
        for (let i = 1; i <= 17; i++) for (let j = 1; j <= 17; j++) {
          o0.set(box.min.x + (box.max.x - box.min.x) * i / 18,
                 box.min.y + (box.max.y - box.min.y) * j / 18, box.max.z + 3);
          rc.set(o0, d0);
          tot++;
          if (rc.intersectObjects(meshes, false).length) hit++;
        }
        return hit / tot;
      };

      const M = {};
      for (const key of PATS) {
        clear();
        const { c, e } = one({ immortal: 'transmute', construct: true, big: 1.15, vesselPattern: key },
                             { gift: 'destruction' });
        const plainOn = [e.boxBody, e.boxArm, e.boxLeg].flat().filter(m => m && m.visible).length
                      + ((e.head && e.head.visible) ? 1 : 0) + ((e.torso && e.torso.visible) ? 1 : 0);
        const whole = new THREE.Box3().setFromObject(e.g);
        const hv = verts(e.headG, null, true);
        const litZ = [];
        e.headG.traverse(o => {
          if (o.isMesh && o.material && o.material.emissive && o.material.emissive.getHex() > 0)
            litZ.push(new THREE.Box3().setFromObject(o).max.z);
        });
        const sv = verts(e.spine, e.headG, true).filter(v => v.l !== null);
        const reads = {};
        for (const blood of [100, 70, 40, 12]) {
          c.blood = blood; syncChars(1 / 30);
          reads[blood] = e.sigils.filter(m => m.material.emissive.getHex() > 0).length;
        }
        c.state = 'dead'; syncChars(1 / 30);
        reads.dead = e.sigils.filter(m => m.material.emissive.getHex() > 0).length;
        c.state = 'ok'; c.blood = c.maxBlood; syncChars(1 / 30);
        M[key] = {
          tris: tris(e.g), plainOn, sigils: e.sigils.length, reads,
          helmParts: (e.helmParts && e.helmParts.length) || 0,
          height: whole.max.y - whole.min.y,
          width: whole.max.x - whole.min.x,
          open: openFrac(e),
          /* IN THE HEAD'S OWN FRAME. Measured off the spine's world box first, and all four
             came back 0.10-0.14 off centre — that was the spine box being lopsided (one
             mismatched shoulder, one intake) swamping the thing being asked about. `verts`
             already hands back x relative to the bone it walked, so use that. */
          headOffX: (Math.min(...hv.map(v => v.x)) + Math.max(...hv.map(v => v.x))) / 2,
          faceZ: Math.max(...hv.map(v => v.z)),
          litZ: litZ.length ? Math.max(...litZ) : null,
          helmBottom: Math.min(...hv.map(v => v.y)),
          shellTop: Math.max(...sv.filter(v => v.l >= 0.06).map(v => v.y)),
          darkTop: Math.max(...sv.filter(v => v.l < 0.06).map(v => v.y)),
          sil: silhouette(e, 14, 22),
          hv, sv,
        };
        clear();
      }
      window.__M = M;

      /* ---------- WHAT ALL FOUR OWE ---------- */
      out.theVesselReplacesTheBody = PATS.every(k => M[k].plainOn === 0 && M[k].tris > 500)
        ? `every pattern stands in place of the plain body — ${PATS.map(k => `${k} ${M[k].tris}`).join(', ')} triangles`
        : `!! A PATTERN LEFT THE PLAIN BODY SHOWING (${PATS.map(k => `${k} ${M[k].plainOn}/${M[k].tris}`).join(', ')})`;

      /* AND IT IS SEALED, on all four. `helmKind` still answers 'sigil' for the named one, and
         the armet it builds has a SIGHT SLIT that kit.js asserts the existence of — stacking it
         on any of these puts an opening over a figure that decides for itself where its one
         opening goes, or whether it has one at all. */
      out.theHelmIsSealed = PATS.every(k => M[k].helmParts === 0)
        ? 'no armet is built over any of the four — each pattern owns its own head, and the slit the armet carries never lands on one of them'
        : `!! AN ARMET WENT ON OVER A VESSEL (${PATS.map(k => `${k} ${M[k].helmParts}`).join(', ')})`;

      /* THE NAME GOES DARK AS IT FAILS. "I REMEMBER A NAME. I DO NOT REMEMBER IF IT WAS MINE."
         Struck into a bronze band on every pattern, because the band is what the rite puts
         there rather than what the smith did — it is the questline, not an ornament. */
      out.sigilReadings = PATS.map(k => `${k} ${Object.entries(M[k].reads).map(([b, v]) => b + ':' + v).join('/')}`).join(' | ');
      out.theNameGoesDarkOnAllFour = PATS.every(k => {
        const m = M[k];
        return m.sigils >= 8 && m.reads[100] === m.sigils && m.reads[40] < m.reads[70] && m.reads.dead === 0;
      })
        ? `every vessel carries its name and every name burns down as the vessel does — ${out.sigilReadings}`
        : `!! A PATTERN IS NOT TRACKING ITS OWN FAILURE (${out.sigilReadings})`;

      /* ---------- AND WHAT MAKES THEM FOUR AND NOT ONE ----------
         Not a colour test and not a triangle test. Each of these asks for the one thing that
         pattern was built to say, and the four things are mutually exclusive: a funnel that
         opens at the throat cannot also be a shut harness, and a frame you can see through
         cannot also be a sealed drum. */
      out.shapes = PATS.map(k => `${k} h${M[k].height.toFixed(2)} w${M[k].width.toFixed(2)} fill${M[k].open.toFixed(2)}`).join(' | ');

      /* THE FUNNEL — the ceremonial pour, one of the eleven. The collar does not narrow at a
         throat, it FLARES, and the helm comes down inside it with a ring of dark round it.
         This claim has been rewritten twice and both rewrites were the figure changing under
         it rather than the claim being wrong; what it is finally about is the RING. */
      {
        const m = M.funnel;
        const band = (arr, lo, hi) => {
          const inb = arr.filter(v => v.y > lo && v.y < hi).map(v => Math.abs(v.x));
          return inb.length ? Math.max(...inb) : 0;
        };
        const shell = m.sv.filter(v => v.l >= 0.06);
        const funnelW = band(shell, m.helmBottom, m.shellTop + 0.01);
        const helmW = band(m.hv, m.helmBottom - 0.01, m.shellTop);
        out.collar = `funnel to ${m.shellTop.toFixed(3)} (half-width ${funnelW.toFixed(3)}), helm from ${m.helmBottom.toFixed(3)} (${helmW.toFixed(3)}), dark to ${m.darkTop.toFixed(3)}`;
        out.theFunnelIsEmptyAtTheCollar = (m.shellTop > m.helmBottom + 0.03 && funnelW > helmW + 0.03 && m.darkTop > m.helmBottom)
          ? `the helm comes down ${(m.shellTop - m.helmBottom).toFixed(3)} inside a collar ${(funnelW - helmW).toFixed(3)} wider than it is, and the ring between them is dark all the way up — ${out.collar}`
          : `!! THE HELM IS A LID ON THE FUNNEL, NOT A THING SITTING IN IT (${out.collar})`;
      }

      /* THE HARNESS — a complete suit of war plate with a person poured into it, and it is
         ENORMOUS, because a harness is built around a body and this one was built around a
         bigger body than his. It is shut everywhere except ONE place: a grille, with the dark
         behind it and two small lights a long way back in that dark. The Vigil's eyes had to
         stand PROUD of her face or the plate swallowed them; this one is the exact opposite
         claim, and it is the only figure in the game you can look INTO. */
      {
        const m = M.plate;
        out.grille = `face ${m.faceZ.toFixed(3)}, lights ${m.litZ === null ? 'none' : m.litZ.toFixed(3)}`;
        out.theHarnessHasSomethingBehindTheGrille =
          (m.litZ !== null && m.litZ < m.faceZ - 0.04 && M.plate.height > Math.max(M.funnel.height, M.armature.height, M.canister.height))
            ? `it stands taller than any other pattern and its lights sit ${(m.faceZ - m.litZ).toFixed(3)} back behind the bars — you look into this one, you do not look at it (${out.grille}, ${out.shapes})`
            : `!! THE GRILLE HAS NOTHING BEHIND IT, OR THE HARNESS IS NOT THE BIG ONE (${out.grille}, ${out.shapes})`;
      }

      /* THE ARMATURE — "a crude transfer leaves shreds of consciousness piloting a decaying
         object." Not a suit at all: hoops, a bar up the back, struts for limbs. You can see
         straight through the middle of it from any angle, which nothing else in the world
         allows, and that is the whole of it. */
      {
        const others = ['funnel', 'plate', 'canister'].map(k => M[k].open);
        out.theArmatureIsAFrameYouCanSeeThrough = (M.armature.open < Math.min(...others) - 0.15)
          ? `only ${(M.armature.open * 100).toFixed(0)}% of its own outline is solid, against ${others.map(v => (v * 100).toFixed(0) + '%').join('/')} for the shells — there is nothing in the middle of it and you can tell (${out.shapes})`
          : `!! THE ARMATURE IS A SHELL LIKE THE REST (${out.shapes})`;
      }

      /* THE CANISTER — poured into a sealed drum that was never meant to hold anybody. The
         head is not a head: a cupola bolted on OFF CENTRE, where there was room. Everything
         about this one says the shape came first and the person was fitted to it. */
      {
        const off = Math.abs(M.canister.headOffX);
        out.headOffsets = PATS.map(k => `${k} ${M[k].headOffX.toFixed(3)}`).join(' | ');
        out.theCanistersHeadIsBoltedOnWhereThereWasRoom =
          (off > 0.02 && PATS.filter(k => k !== 'canister').every(k => Math.abs(M[k].headOffX) < off - 0.015))
            ? `its cupola sits ${off.toFixed(3)} off the drum's axis while every other pattern is square on its shoulders — nobody centred this one because there was nothing to centre it on (${out.headOffsets})`
            : `!! THE CANISTER'S HEAD IS ON STRAIGHT (${out.headOffsets})`;
      }

      /* AND NO TWO OF THEM ARE THE SAME BODY IN A DIFFERENT PAINT. Pairwise, on the three
         numbers that survive a recolour: how much metal is in it, how tall it stands, and how
         much of its own outline it fills. */
      {
        const pairs = [];
        let worst = 1e9, worstPair = '';
        for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) {
          const a = M[PATS[i]], b2 = M[PATS[j]];
          /* how many cells of the normalised outline disagree — scale is divided out on
             purpose, so "it is the same body, bigger" counts as the same body */
          let diff = 0;
          for (let n = 0; n < a.sil.length; n++) if (a.sil[n] !== b2.sil[n]) diff++;
          const d = diff / a.sil.length;
          pairs.push(`${PATS[i]}/${PATS[j]} ${d.toFixed(3)}`);
          if (d < worst) { worst = d; worstPair = PATS[i] + '/' + PATS[j]; }
        }
        out.patternDistance = pairs.join(' | ');
        out.noTwoPatternsAreAReskin = worst > 0.12
          ? `the closest two are ${worstPair}, and even scaled onto each other ${(worst * 100).toFixed(0)}% of their outline disagrees — four shapes, not one shape in four paints (${out.patternDistance})`
          : `!! TWO PATTERNS ARE THE SAME BODY (${out.patternDistance})`;
      }

      /* THE POUR IS ROLLED ONCE AND THEN IT IS YOURS. A pattern that came back different off a
         save, or off a re-etch, would be a second ascension nobody asked for — and the mesh
         has to notice, which is `colorKeyOf`: without the pattern in the key the character
         keeps whichever body was built first and the roll does nothing you can see. */
      {
        clear();
        const { c } = one({}, { gift: 'destruction', sex: 'm' });
        c.vesselPattern = null; c.immortal = null;
        ascendTransmute(c);
        const rolled = c.vesselPattern;
        const keyA = colorKeyOf(c);
        c.vesselPattern = PATS.find(k => k !== rolled);
        const keyB = colorKeyOf(c);
        c.vesselPattern = rolled;
        ascendTransmute(c);                       /* a second ascension must not re-roll it */
        const stillRolled = c.vesselPattern;
        const snap = (typeof snapshot === 'function' ? snapshot() : null);
        const row = snap && (snap.chars || []).find(r => r && r.name === c.name);
        const inSave = row ? row.vesselPattern : undefined;
        c._shed = false; c.blood = 0;
        const before = phylacteries.length;
        shedHusk(c);
        const husk = phylacteries[phylacteries.length - 1];
        const inHusk = (phylacteries.length > before && husk && husk.soul) ? husk.soul.vesselPattern : undefined;
        phylacteries.pop();
        clear();
        out.pourCarry = `rolled ${rolled}, second ascension ${stillRolled}, save ${inSave}, husk ${inHusk}, key changes ${keyA !== keyB}`;
        out.whatTheyPouredYouIntoStays =
          (PATS.includes(rolled) && stillRolled === rolled && inSave === rolled && inHusk === rolled && keyA !== keyB)
            ? `the pour is rolled once and then carried — the save keeps it, the husk keeps it, a re-etch puts them back in the same shape, and the mesh key notices when it changes (${out.pourCarry})`
            : `!! THE POUR DOES NOT SURVIVE (${out.pourCarry})`;
      }
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
    const PATS = ['funnel', 'plate', 'armature', 'canister'];
    const rows = [
      { cap: 'THE VIGIL —   what the Unclouding leaves', who: 'divine', n: 3 },
      { cap: 'THE VESSEL —  four patterns: funnel, harness, armature, canister', who: 'transmute', n: 4, close: true },
      /* AND THE HEADS ON THEIR OWN. Four figures at full height in one 1280-wide strip puts
         about a hundred pixels on each of them, and every decision that separates these four
         is above the shoulders: a collar the helm sits down inside, a grille with lights back
         in the dark, a flame in a cage, a cupola bolted on off centre. A sheet that cannot
         resolve them is not evidence — this is the panel that caught the lantern rendering as
         a black brick while every number about it came back green. */
      { cap: 'THE VESSEL —  and what each of them has instead of a face', who: 'transmute', n: 4, heads: true },
    ];
    for (const row of rows) {
      /* the head row is shot at dusk on purpose: everything it exists to show is a LIT part
         — two lights back behind a grille, a flame in a cage, a strip of glow in a slit — and
         at noon the sun washes all three of them out to the same pale grey as the plate. */
      for (const hr of (row.heads ? [19] : [11, 21])) {
        hour = hr;
        if (typeof updateSky === 'function') updateSky();
        chars.length = 0;
        charMeshes.forEach(e => { if (e.g && e.g.parent) e.g.parent.remove(e.g); });
        charMeshes.clear();
        document.querySelectorAll('.hud,#charpanel,#invpanel,#minimap,#log,#tip,#squadbar,#buildbar,#touchbar')
          .forEach(el => el.style.setProperty('display', 'none', 'important'));
        const made = [];
        /* the Vessel row is ONE OF EACH PATTERN rather than three of the same man at three
           angles — the whole question this sheet now has to answer is whether four poured
           bodies read as four different things, and three views of one of them cannot say. */
        for (let j = 0; j < row.n; j++) {
          const c = makeChar('R', 'player', me.x + (j - (row.n - 1) / 2) * (row.heads ? 1.40 : 1.55), me.y,
            { atk: 14, def: 14, tough: 14, sex: row.who === 'divine' ? 'f' : 'm', age: 30,
              gift: row.who === 'divine' ? 'divine' : 'destruction' });
          c.state = 'ok'; c.weapon = null; c.armor = null;
          c.dir = row.heads ? 0 : row.n === 4 ? (j === 3 ? 0.9 : 0) : (j === 0 ? 0 : j === 1 ? 0.85 : 1.57);
          c.immortal = row.who;
          if (row.who === 'transmute') {
            c.construct = true; c.big = 1.15;
            c.vesselPattern = PATS[j % PATS.length];
            c.blood = (j === 3 && !row.heads) ? 34 : c.maxBlood;   /* and the last one is nearly spent */
          }
          chars.push(c); made.push(c);
        }
        for (let i = 0; i < 14; i++) syncChars(0.05);
        const box = new THREE.Box3();
        for (const c of made) {
          const e = charMeshes.get(c.id);
          if (!e) continue;
          e.g.rotation.set(0, c.dir, 0); e.g.updateWorldMatrix(true, true);
          if (!row.heads) { box.expandByObject(e.g); continue; }
          /* VISIBLE geometry only. `Box3.expandByObject` walks everything under the bone and
             does not look at `visible`, so framing on the raw head bone framed the hidden
             plain body along with it — a 2.21-unit-tall "head" on a figure whose head is half
             a metre, which is why the sheet came back with the four of them shoved into the
             bottom of the panel. */
          (e.headG || e.g).traverse(o => {
            if (!o.isMesh || !o.geometry) return;
            let v = o.visible, q = o.parent; while (q && v) { v = q.visible; q = q.parent; }
            if (v) box.expandByObject(o);
          });
        }
        if (row.heads) box.expandByScalar(0.18);
        const ctr = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3());
        /* the head row gets a taller panel of its own. Four helmets across a 2.6:1 strip is
           about a hundred pixels each, which is the framing that let a black brick pass for a
           lantern in the first place. */
        const PW = 1280, PH = row.heads ? 660 : 492;
        const cam = camera.clone();
        cam.aspect = PW / PH; cam.fov = 27;
        /* the Vessel is shot closer: the funnel, the name band and the mismatched shoulders are
           all things you have to be near enough to read, and a sheet that proves a silhouette
           does not prove the three details the silhouette is made of */
        const back = Math.max(s.x / cam.aspect, s.y) * 2.6 * (row.heads ? 0.96 : row.close ? 0.92 : 1.04);
        cam.position.set(ctr.x, ctr.y + back * (row.heads ? -0.02 : 0.14), ctr.z + back);
        cam.lookAt(ctr); cam.updateProjectionMatrix();
        const cv0 = renderer.domElement;
        const w0 = cv0.width, h0 = cv0.height, sw = cv0.style.width, sh = cv0.style.height;
        renderer.setSize(PW, PH, false);
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
    cv.width = Math.max(...ims.map(im => im.width));
    cv.height = ims.reduce((a, im) => a + im.height + L, 0);
    const g = cv.getContext('2d');
    g.fillStyle = '#12100d'; g.fillRect(0, 0, cv.width, cv.height);
    const caps = [rows[0].cap + '   — noon', rows[0].cap + '   — after dark',
                  rows[1].cap + '   — noon', rows[1].cap + '   — after dark, and the canister is nearly spent',
                  rows[2].cap + '   — at dusk, when the lit parts read'];
    let yc = 0;
    ims.forEach((im, i) => {
      g.fillStyle = i < 2 ? '#ffe9b4' : '#f0c05a';
      g.font = 'bold 16px monospace';
      g.fillText(caps[i], 12, yc + 20);
      g.drawImage(im, 0, yc + L);
      yc += im.height + L;
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
