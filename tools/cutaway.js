#!/usr/bin/env node
/* WALLS AND CEILINGS GIVE WAY TO YOUR PEOPLE.
 *
 * "We still haven't perfected the mechanics where walls/ceilings become clear or see through when
 *  entered. This is a top priority to truly make the game feel three dimensional and explorable
 *  rather than flat." (2026-10-03)
 *
 * One rule in the shader patch, for the shared structure materials only (see AND WHAT STANDS
 * BETWEEN YOU in the game). These claims hold it to that:
 *
 *   1. it is the structures that take it: a wall's shader carries the cut, and so does a tree's
 *      (they share the material cache, and a canopy thinned over your people is the right
 *      answer); a body's and the ground's do not
 *   2. a building one of yours walks into is cut above that storey's ceiling, and the same building
 *      with nobody inside it is not
 *   3. on an upper storey the cut moves up with them: it is the storey they are on that loses its
 *      ceiling, not the ground floor's
 *   4. a structure between the camera and your people is opened where they are: the pixels over
 *      them change when the cone is on, and the cone is shut when the camera is aimed somewhere
 *      none of yours is standing
 *
 * Anything starting '!!' fails the build.
 *
 *   node tools/cutaway.js [game.html]
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
  await p.waitForTimeout(2000);

  const out = await p.evaluate(() => {
    const R = {};
    paused = true; hour = 11;
    const guard = (keys, fn) => {
      try { fn(); } catch (e) { for (const k of keys) if (R[k] === undefined) R[k] = '!! ' + String(e.message).slice(0, 110).toUpperCase(); }
    };
    const mine = player();
    const me = mine[0];
    const park = (x, y) => mine.forEach((c, i) => { c.x = x + 40 + i; c.y = y + 40; c.floor = 0; });
    const aim = (x, y, dst) => { camX = camSX = x; camY = camSY = y; camDist = camDistTarget = dst || 22; camPitch = camPitchT = 0.85; camYaw = camYawT = 0.4; camFollow = false; };
    const cutOf = (v) => { for (let i = 0; i < DW_CUT.n.value; i++) { const a = DW_CUT.a.value[i]; if (Math.abs(a.x - v.cx) < 0.01 && Math.abs(a.y - v.cz) < 0.01) return DW_CUT.b.value[i].z; } return null; };

    /* ---------- 1. ONLY STRUCTURES TAKE IT ---------- */
    guard(['onlyStructuresAreCut'], () => {
      render();
      const has = (m) => { const pr = m && renderer.properties.get(m).currentProgram; return pr ? !!pr.getUniforms().map.dwCutN : null; };
      let wall = null, body = null, tree = null;
      scene.traverse(o => {
        if (!wall && o.isMesh && o.material && !Array.isArray(o.material) && o.material.dwCut && renderer.properties.get(o.material).currentProgram) wall = o;
        if (!tree && o.isInstancedMesh && o.count > 20 && !o.material.dwCut && renderer.properties.get(o.material).currentProgram) tree = o;
      });
      const e = charMeshes.get(me.id);
      e && e.g.traverse(o => { if (!body && o.isMesh && o.material && !Array.isArray(o.material) && renderer.properties.get(o.material).currentProgram) body = o; });
      const ground = scene.children.find(o => o.name === 'ground' && renderer.properties.get(o.material).currentProgram);
      /* a tree may be nowhere in view, so its material is asked through the hook itself */
      const hook = (m) => { const sh = { vertexShader: THREE.ShaderLib.lambert.vertexShader, fragmentShader: THREE.ShaderLib.lambert.fragmentShader, uniforms: {} }; m.onBeforeCompile(sh); return !!sh.uniforms.dwCutN; };
      const treeMat = tree ? tree.material : [...nodeInstances.values()][0][0].im.material;
      const got = { wall: has(wall && wall.material), body: has(body && body.material), tree: hook(treeMat), ground: has(ground && ground.material) };
      R.onlyStructuresAreCut = got.wall === true && got.tree === true && got.body === false && got.ground === false
        ? 'a wall\'s shader carries the cut, and a tree\'s; a body\'s and the ground\'s do not'
        : `!! THE WRONG THINGS ARE CUT: ${JSON.stringify(got)}`;
    });

    /* ---------- 2. A BUILDING YOU WALK INTO ---------- */
    const B = buildings.filter(b2 => !b2.citadel && b2.town && b2.w >= 5 && b2.h >= 4).sort((a, c) => c.w * c.h - a.w * a.h)[0];
    guard(['enteringCutsTheCeiling', 'butNotForAStranger'], () => {
      const cx = B.x + B.w / 2, cy = B.y + B.h / 2;
      const v = cutVolumesAt(cx, cy).find(q => q.ref === B);
      park(cx, cy); aim(cx, cy); render();
      const outside = cutOf(v);
      me.x = cx; me.y = cy; render();
      const inside = cutOf(v);
      const floor0 = v.y0;
      R.enteringCutsTheCeiling = inside !== null && inside > floor0 + 1.8 && inside < floor0 + 3.2
        ? `with one of yours inside ${B.label || 'a building'}, everything of it above ${(inside - floor0).toFixed(1)} over its floor is cut`
        : `!! WALKING INTO ${String(B.label || 'A BUILDING').toUpperCase()} CUT NOTHING (${inside})`;
      R.butNotForAStranger = outside === null
        ? 'and with all of yours outside it, it stands whole'
        : `!! IT WAS CUT WITH NOBODY OF YOURS IN IT (at ${outside})`;
    });

    /* ---------- 3. UPSTAIRS ---------- */
    guard(['theStoreyYouAreOnLosesItsCeiling'], () => {
      const cit = buildings.find(b2 => b2.citadel);
      if (!cit) { R.theStoreyYouAreOnLosesItsCeiling = '!! NO CITADEL TO CLIMB'; return; }
      const cx = cit.x + cit.w / 2, cy = cit.y + cit.h / 2;
      const v = cutVolumesAt(cx, cy).find(q => q.ref === cit);
      park(cx, cy); me.x = cit.x + 1.5; me.y = cit.y + 1.5; me.floor = 0; activeFloor = 0; aim(cx, cy); render();
      const ground = cutOf(v);
      me.floor = 2; activeFloor = 2; render();
      const up = cutOf(v);
      me.floor = 0; activeFloor = 0;
      R.theStoreyYouAreOnLosesItsCeiling = ground !== null && up !== null && Math.abs((up - ground) - floorY(2)) < 0.01
        ? `in the citadel the cut stands ${(ground - v.y0).toFixed(1)} over the ground floor, and moves up ${floorY(2).toFixed(1)} with somebody two storeys up`
        : `!! THE CUT DID NOT FOLLOW THEM UP: ${ground} on the ground, ${up} two up`;
    });

    /* ---------- 4. SEEING PAST WHAT IS IN THE WAY ---------- */
    guard(['aWallInTheWayOpens', 'butNotWhereNoneOfYoursIs'], () => {
      const cx = B.x + B.w / 2, cy = B.y + B.h / 2;
      park(cx, cy);
      /* one of yours just behind the building, as the camera looks */
      me.x = cx; me.y = cy; me.floor = 0;
      aim(cx, cy, 30); render();
      const g = document.createElement('canvas'), x = g.getContext('2d', { willReadFrequently: true });
      const grab = () => { g.width = renderer.domElement.width; g.height = renderer.domElement.height; x.drawImage(renderer.domElement, 0, 0); return x.getImageData((g.width >> 1) - 20, (g.height >> 1) - 20, 40, 40).data; };
      /* the roof hiding rule for houses is older and separate; take it out of the question */
      const roofs0 = B._roof ? B._roof.visible : null;
      const keepSync = syncRoofs; syncRoofs = () => {};
      if (B._roof) B._roof.visible = true;
      const keepN = DW_CUT.n.value;
      const shoot = (coneOn) => { const s0 = CUT_SEE_R; updateCutaway(DW_CUT.see.value.y); DW_CUT.n.value = 0; if (!coneOn) DW_CUT.see.value.w = 0; renderer.render(scene, camera); return grab(); };
      render();
      const on = shoot(true), off = shoot(false);
      syncRoofs = keepSync; if (B._roof) B._roof.visible = roofs0; DW_CUT.n.value = keepN;
      let changed = 0;
      for (let i = 0; i < on.length; i += 4) if (Math.abs(on[i] - off[i]) + Math.abs(on[i + 1] - off[i + 1]) + Math.abs(on[i + 2] - off[i + 2]) > 40) changed++;
      /* the same frame both times, so with the cone shut not one pixel would move */
      R.aWallInTheWayOpens = changed > 80
        ? `with one of yours inside ${B.label || 'a building'} and its roof forced on, ${changed} of 1600 pixels round them change when the cone is open`
        : `!! THE ROOF OVER YOUR PEOPLE DOES NOT OPEN: ${changed} of 1600 pixels change`;
      park(cx, cy); aim(cx + 200, cy + 200); render();
      R.butNotWhereNoneOfYoursIs = DW_CUT.see.value.w === 0
        ? 'and with the camera aimed where none of yours stands, the cone is shut'
        : `!! THE CONE IS OPEN OVER ${DW_CUT.see.value.w} TILES WITH NOBODY OF YOURS THERE`;
    });
    return R;
  });

  const bad = Object.values(out).filter(v => typeof v === 'string' && v.startsWith('!!'));
  for (const [k, v] of Object.entries(out)) console.log('  ' + k.padEnd(34) + ' ' + v);
  for (const e of errs) console.log('  ' + e);
  console.log('');
  console.log(bad.length || errs.length ? `*** THE WALLS STAND IN THE WAY (${bad.length + errs.length}) ***` : 'WALLS AND CEILINGS GIVE WAY TO YOUR PEOPLE');
  await b.close();
  process.exit(bad.length || errs.length ? 1 : 0);
})();
