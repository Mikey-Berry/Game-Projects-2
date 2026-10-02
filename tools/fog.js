#!/usr/bin/env node
/* THE MAP IS DRAWN; ONLY THE EYES ARE SCARCE.
 *
 * "Whole map is drawn but we keep the current sight range and that is where the tint difference
 *  (and what the player can actually see) appears. Also the free roam camera is tethered to the
 *  nearest squad members, so you cannot simply free camera roam the whole map."
 *
 * The black sheet is gone. Every surface shader reads one byte a tile (`fogData`) and washes
 * itself grey where nobody of yours is looking; `vis` keeps its three states for the back end
 * only. This file looks at the pixels a player looks at, comparing the same ground with the
 * tint switched on and off (`fogPlane.visible`, the switch every picture harness flips):
 *
 *   1. what stands on the ground takes the tint too: a tree, a wall and the ground all compile
 *      with the sight map in their shader, and the stars do not
 *   2. ground in sight beside the party draws as bright with the tint as without it
 *   3. ground never seen is DRAWN, washed grey and dimmer, not black
 *   4. ground once seen and now out of sight draws exactly as ground never seen does
 *   5. a tree on ground nobody has ever seen is standing
 *   6. a stranger out of sight is not drawn; in sight, they are
 *   7. the minimap draws the whole country, washes what is out of sight, and leaves what is in
 *      sight clear. It reads sight by the block, not by one tile per pixel
 *   8. the camera cannot be panned more than CAM_TETHER from the nearest of your people, any of
 *      them will do as an anchor, and the F9 reveal lets it off the lead
 *
 * Anything starting '!!' fails the build.
 *
 *   node tools/fog.js [game.html]
 */
const { chromium } = require('playwright');
const path = require('path');
const gamePath = (a) => path.resolve(a ? (path.isAbsolute(a) ? a : path.join(__dirname, a)) : path.join(__dirname, 'game.html'));

(async () => {
  const b = await chromium.launch({
    executablePath: process.env.DUSTWARD_CHROME || undefined,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'],
  });
  const p = await b.newPage({ viewport: { width: 1000, height: 700 } });
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message.slice(0, 160)));
  await p.goto('file://' + gamePath(process.argv[2]), { waitUntil: 'load', timeout: 120000 });
  await p.waitForSelector('#btn-start', { state: 'attached', timeout: 120000 });
  await p.evaluate(() => document.getElementById('btn-start').click());
  await p.waitForFunction(() => { try { return player().length > 0; } catch (e) { return false; } }, null, { timeout: 180000, polling: 1000 });
  await p.waitForTimeout(2500);

  const out = await p.evaluate(() => {
    const R = {};
    paused = true; hour = 12; debugSeeAll = false; fogPlane.visible = true;
    const me = player()[0];
    const look = (cx, cy) => { camX = camSX = cx; camY = camSY = cy; camDist = camDistTarget = 40; camFollow = false; };

    /* the same ground pixels with the tint on and off, over the spot the camera is put on.
       Brightness and saturation both: out of sight is meant to be greyer AND dimmer. */
    const g = document.createElement('canvas');
    const x = g.getContext('2d', { willReadFrequently: true });
    const v = new THREE.Vector3();
    const shot = (pts) => {
      render();
      g.width = renderer.domElement.width; g.height = renderer.domElement.height;
      x.drawImage(renderer.domElement, 0, 0);
      let s = 0, sat = 0, k = 0;
      for (const q of pts) {
        v.set(q.x, groundY(q.x, q.y), q.y).project(camera);
        const sx = Math.round((v.x + 1) / 2 * g.width), sy = Math.round((1 - v.y) / 2 * g.height);
        if (sx < 0 || sy < 0 || sx >= g.width || sy >= g.height) continue;
        const d = x.getImageData(sx, sy, 1, 1).data;
        s += (d[0] + d[1] + d[2]) / 3; sat += Math.max(d[0], d[1], d[2]) - Math.min(d[0], d[1], d[2]); k++;
      }
      return k ? { b: s / k, s: sat / k } : { b: NaN, s: NaN };
    };
    const ratio = (cx, cy, pts) => {
      look(cx, cy);
      fogPlane.visible = true; const on = shot(pts);
      fogPlane.visible = false; const off = shot(pts);
      fogPlane.visible = true;
      return { on: +on.b.toFixed(1), off: +off.b.toFixed(1), r: +(on.b / off.b).toFixed(2), sOn: +on.s.toFixed(1), sOff: +off.s.toFixed(1) };
    };
    const patch = (cx, cy, want) => {
      const pts = [];
      for (let dx = -6; dx <= 6; dx += 2) for (let dy = -6; dy <= 6; dy += 2) {
        const wx = Math.floor(cx + dx) + 0.5, wy = Math.floor(cy + dy) + 0.5;
        if (isBlocked(wx, wy, 0) || terr[Math.floor(wy) * W + Math.floor(wx)] === 3) continue;
        if (want != null && vis[Math.floor(wy) * W + Math.floor(wx)] !== want) continue;
        pts.push({ x: wx, y: wy });
      }
      return pts;
    };
    /* the tether would drag the camera home between shots; the reveal is not wanted for the
       pixels, so the tether is let off by hand for them and tested on its own at the end */
    const tether = tetherCam; tetherCam = () => {};

    /* ---- 1. the shaders ---- */
    {
      render();
      const has = (m) => { const pr = m && renderer.properties.get(m).currentProgram; return pr ? !!pr.getUniforms().map.dwSight : null; };
      let tree = null, wall = null;
      scene.traverse(o => {
        if (!tree && o.isInstancedMesh && o.count > 20 && renderer.properties.get(o.material).currentProgram) tree = o;
        if (!wall && o.isMesh && !o.isInstancedMesh && o.geometry && o.geometry.type === 'BoxGeometry' && o.material && !Array.isArray(o.material) && renderer.properties.get(o.material).currentProgram) wall = o;
      });
      const groundM = scene.children.find(o => o.name === 'ground' && renderer.properties.get(o.material).currentProgram);
      /* the stars are a ring round the middle of the map and are culled from most views, so they
         are asked through the hook itself, with three's own points shader, as the sun is */
      const hook = (m, lib) => { const sh = { vertexShader: THREE.ShaderLib[lib].vertexShader, fragmentShader: THREE.ShaderLib[lib].fragmentShader, uniforms: {} }; m.onBeforeCompile(sh); return !!sh.uniforms.dwSight; };
      const got = { decor: has(tree && tree.material), box: has(wall && wall.material), ground: has(groundM && groundM.material),
        stars: hook(starMat, 'points'), sun: hook(sunSprite.material, 'sprite'), pointsElse: hook(new THREE.PointsMaterial(), 'points') };
      R.everythingStandingTakesTheTint = got.decor && got.box && got.ground && !got.stars && !got.sun && got.pointsElse
        ? 'the ground, the instanced decor and a built box all read the sight map in their shaders; the stars and the sun do not'
        : `!! THE TINT MISSES SOMETHING: ${JSON.stringify(got)}`;
    }

    /* ---- 2. in sight ---- */
    computeVision(); fogDirty = true; redrawFog();
    let seen = null;
    {
      const pts = patch(me.x, me.y, 2);
      const q = ratio(me.x, me.y, pts);
      seen = q;
      R.whatYouSeeIsLit = pts.length >= 10 && q.r >= 0.9
        ? `ground in sight beside the party draws at ${q.on} with the tint on and ${q.off} with it off (${q.r}), over ${pts.length} tiles`
        : `!! GROUND IN PLAIN SIGHT IS TINTED: ${q.on} with it on against ${q.off} with it off (${q.r}) over ${pts.length} tiles`;
    }

    /* a stretch of open, never-seen ground away from anybody, but inside the tether so the
       camera could honestly be there */
    const far = (() => {
      for (let r = 44; r < 62; r += 4) for (let a = 0; a < 6.28; a += 0.3) {
        const cx = me.x + Math.cos(a) * r, cy = me.y + Math.sin(a) * r;
        if (cx < 40 || cy < 40 || cx > W - 40 || cy > H - 40) continue;
        const pts = patch(cx, cy, 0);
        if (pts.length >= 30) return { x: cx, y: cy };
      }
      return null;
    })();

    /* ---- 3. never seen ---- */
    let never = null;
    if (!far) R.whatYouNeverSawIsDrawnGrey = '!! NO OPEN, UNSEEN GROUND TO LOOK AT';
    else {
      const pts = patch(far.x, far.y, 0);
      const q = ratio(far.x, far.y, pts);
      never = q;
      const drawn = q.r >= 0.45, dim = q.r <= 0.85, grey = q.sOn < q.sOff * 0.7;
      R.whatYouNeverSawIsDrawnGrey = drawn && dim && grey
        ? `ground never seen is drawn, at ${q.on} with the tint against ${q.off} without (${q.r}), and greyer (spread ${q.sOn} against ${q.sOff})`
        : `!! GROUND NEVER SEEN IS ${!drawn ? 'BLACKED OUT' : !dim ? 'NOT DIMMED' : 'NOT GREYED'}: ${q.on} against ${q.off} (${q.r}), spread ${q.sOn} against ${q.sOff}`;
    }

    /* ---- 4. remembered draws as never seen ---- */
    if (far && never) {
      const r0 = 14, touched = [];
      for (let y = Math.floor(far.y - r0); y <= far.y + r0; y++) for (let x2 = Math.floor(far.x - r0); x2 <= far.x + r0; x2++) {
        const i = y * W + x2; if (vis[i] === 0) { vis[i] = 1; touched.push(i); }
      }
      fogMarkAll(); fogDirty = true; redrawFog();
      const q = ratio(far.x, far.y, patch(far.x, far.y, 1));
      for (const i of touched) vis[i] = 0;
      fogMarkAll(); fogDirty = true; redrawFog();
      R.rememberingIsNotSeeing = Math.abs(q.r - never.r) <= 0.03 && q.r < seen.r - 0.1
        ? `ground once seen and out of sight draws at ${q.r} of its untinted self, as ground never seen does (${never.r})`
        : `!! REMEMBERED GROUND DRAWS DIFFERENTLY FROM UNSEEN GROUND: ${q.r} against ${never.r} (in sight ${seen.r})`;
    }

    /* ---- 5. a tree nobody has seen ---- */
    {
      let found = null, standing = 0, n = 0;
      const m = new THREE.Matrix4();
      for (const [k, refs] of nodeInstances) {
        const [tx, ty] = k.split(',').map(Number);
        if (vis[ty * W + tx] !== 0 || rawDecorAt(tx, ty) !== 'tree' || nodeDepleted(tx, ty)) continue;
        n++;
        let up = false;
        for (const r of refs) { r.im.getMatrixAt(r.i, m); if (Math.hypot(m.elements[0], m.elements[1], m.elements[2]) > 0.02 && m.elements[13] > -40) up = true; }
        if (up) standing++; else if (!found) found = k;
        if (n >= 400) break;
      }
      R.theTreesStandEverywhere = n >= 50 && standing === n
        ? `all ${n} trees sampled on ground nobody has ever seen are standing`
        : `!! TREES ON UNSEEN GROUND ARE LAID DOWN: ${standing} of ${n} standing (first down at ${found})`;
    }

    /* ---- 6. strangers ---- */
    if (far) {
      const st = chars.find(c => c.faction !== 'player' && c.state === 'ok' && !c.vip && (c.floor || 0) === 0);
      if (!st) R.strangersOutOfSightAreNotDrawn = '!! NOBODY TO MOVE';
      else {
        const keep = { x: st.x, y: st.y, path: st.path, moveTarget: st.moveTarget };
        const drawnAt = (x2, y2) => { st.x = x2; st.y = y2; st.path = null; st.moveTarget = null; rebuildCharGrid(); render(); const e = charMeshes.get(st.id); return !!(e && e.inScene && e.g.visible); };
        const out = drawnAt(far.x, far.y);
        const inn = drawnAt(me.x + 3, me.y + 3);
        Object.assign(st, keep); rebuildCharGrid(); render();
        R.strangersOutOfSightAreNotDrawn = !out && inn
          ? `${st.name} is not drawn out of sight on drawn ground, and is drawn beside the party`
          : `!! ${st.name}: drawn out of sight ${out}, drawn in sight ${inn}`;
      }
    }

    /* ---- 7. the minimap ---- */
    {
      computeVision();
      redrawMinimapFog();
      const fd = mmFog.getContext('2d').getImageData(0, 0, 128, 128).data;
      let clear = 0, washed = 0, black = 0, litBlocks = 0, wrong = 0;
      for (let by = 0; by < 128; by++) for (let bx = 0; bx < 128; bx++) {
        let lit = false;
        const y0 = Math.floor(by * H / 128), y1 = Math.floor((by + 1) * H / 128), x0 = Math.floor(bx * W / 128), x1 = Math.floor((bx + 1) * W / 128);
        for (let y = y0; y < y1 && !lit; y++) for (let x2 = x0; x2 < x1; x2++) if (vis[y * W + x2] === 2) { lit = true; break; }
        const a = fd[(by * 128 + bx) * 4 + 3];
        if (a === 255) black++;
        if (lit) { litBlocks++; if (a === 0) clear++; else wrong++; }
        else if (a > 0 && a < 160) washed++; else wrong++;
      }
      R.theMinimapShowsTheCountry = black === 0 && wrong === 0 && litBlocks > 0 && washed === 128 * 128 - litBlocks
        ? `no minimap pixel is blacked out: the ${litBlocks} blocks in sight are clear and the other ${washed} take a light wash`
        : `!! THE MINIMAP: ${black} black, ${wrong} wrong, ${clear} of ${litBlocks} in-sight blocks clear, ${washed} washed`;
    }

    /* ---- 8. the lead ---- */
    {
      tetherCam = tether;
      const near = () => Math.min(...player().map(c => Math.hypot(c.x - camX, c.y - camY)));
      const bad = [];
      camX = me.x + 500; camY = me.y + 380; tetherCam();
      const d1 = near();
      if (d1 > CAM_TETHER + 0.01) bad.push(`panned out it stopped ${d1.toFixed(1)} from the nearest`);
      if (d1 < CAM_TETHER - 1) bad.push(`panned out it stopped short, at ${d1.toFixed(1)}`);
      camX = me.x + 20; camY = me.y - 15; tetherCam();
      if (Math.hypot(camX - me.x - 20, camY - me.y + 15) > 0.01) bad.push('inside the lead it was moved anyway');
      /* any body of yours is an anchor: send one far off and the camera may sit beside them */
      const two = player()[1];
      if (two) {
        const keep = { x: two.x, y: two.y };
        const ax = clamp(me.x + 400, 60, W - 60), ay = clamp(me.y + 300, 60, H - 60);
        two.x = ax; two.y = ay;
        camX = ax + 30; camY = ay; tetherCam();
        if (Math.hypot(camX - ax - 30, camY - ay) > 0.01) bad.push('a second body far off was not an anchor');
        Object.assign(two, keep);
      }
      debugSeeAll = true; camX = me.x + 500; camY = me.y + 380; tetherCam();
      if (Math.hypot(camX - me.x - 500, camY - me.y - 380) > 0.01) bad.push('the F9 reveal did not let it off the lead');
      debugSeeAll = false;
      look(me.x, me.y);
      R.theCameraIsOnALead = bad.length === 0
        ? `a pan out stops ${CAM_TETHER} from the nearest of the squad; inside that it is left alone; any of them is an anchor; F9 lets it go`
        : `!! THE LEAD: ${bad.join(' | ')}`;
    }
    return R;
  });

  const bad = Object.values(out).filter(v => typeof v === 'string' && v.startsWith('!!'));
  for (const [k, v] of Object.entries(out)) console.log('  ' + k.padEnd(28) + ' ' + v);
  for (const e of errs) console.log('  ' + e);
  console.log('');
  console.log(bad.length || errs.length ? `*** THE FOG IS WRONG (${bad.length + errs.length}) ***` : 'THE MAP IS DRAWN; ONLY THE EYES ARE SCARCE');
  await b.close();
  process.exit(bad.length || errs.length ? 1 : 0);
})();
