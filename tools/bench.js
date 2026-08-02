// Reproducible benchmark. Usage: node bench.js <path-to-html> [label]
const { chromium } = require('playwright');
const path = require('path');
const gamePath = (a) => path.resolve(a ? (path.isAbsolute(a) ? a : path.join(__dirname, a)) : path.join(__dirname, 'game.html'));
const fs = require('fs');

const src = process.argv[2];
const label = process.argv[3] || (src || 'game');

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.DUSTWARD_CHROME || undefined,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'],
  });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message.slice(0, 300)));
  page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text().slice(0, 300)); });

  await page.goto('file://' + gamePath(src), { waitUntil: 'load' });
  await page.waitForTimeout(3000);
  await page.evaluate(() => document.getElementById('btn-start').click());
  await page.waitForTimeout(3000);

  const R = await page.evaluate(() => {
    const out = {};
    const bench = (f, n) => { f(); const t = performance.now(); for (let i = 0; i < n; i++) f(); return +((performance.now() - t) / n).toFixed(3); };

    // --- render structure ---
    let meshes = 0, tris = 0, casters = 0, receivers = 0;
    const mats = new Set(), geos = new Set();
    scene.traverse(o => {
      if (o.isMesh || o.isInstancedMesh || o.isSprite || o.isPoints || o.isLine) {
        meshes++;
        const g = o.geometry;
        if (g) { const t = g.index ? g.index.count / 3 : (g.attributes.position ? g.attributes.position.count / 3 : 0); tris += t * (o.isInstancedMesh ? o.count : 1); }
        if (o.castShadow) casters++;
        if (o.receiveShadow) receivers++;
      }
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => mats.add(m.uuid));
      if (o.geometry) geos.add(o.geometry.uuid);
    });
    renderer.render(scene, camera);
    out.render = {
      sceneObjects: meshes, sceneTris: Math.round(tris),
      drawCalls: renderer.info.render.calls, drawnTris: renderer.info.render.triangles,
      shadowCasters: casters, shadowReceivers: receivers,
      shadowMap: sun.shadow.mapSize.width, uniqMaterials: mats.size, uniqGeometries: geos.size,
      gpuGeometries: renderer.info.memory.geometries,
    };

    // --- hot micro costs ---
    out.micro = {
      screenToWorld_ms: bench(() => screenToWorld(600 + (Math.random() * 200 | 0), 400 + (Math.random() * 200 | 0)), 40),
      syncRoofs_ms: bench(() => syncRoofs(), 60),
      computeVision_ms: bench(() => computeVision(), 30),
      renderOverlay_ms: bench(() => renderOverlay(), 30),
      rebuildCharGrid_ms: bench(() => rebuildCharGrid(), 60),
      separate_ms: bench(() => separate(), 40),
    };
    // isBlocked ns/call
    { const N = 400000; const t = performance.now(); let s = 0; for (let i = 0; i < N; i++) s += isBlocked(Math.random() * W, Math.random() * H, 0) ? 1 : 0; out.micro.isBlocked_ns = +(((performance.now() - t) * 1e6) / N).toFixed(1); out.micro._s = s > 0; }
    // dist ns/call
    { const N = 2000000; const t = performance.now(); let s = 0; for (let i = 0; i < N; i++) s += dist(i % 700, (i * 7) % 700, (i * 13) % 700, (i * 3) % 700); out.micro.dist_ns = +(((performance.now() - t) * 1e6) / N).toFixed(1); out.micro._s2 = s > 0; }
    // A*
    { const N = 150; const t = performance.now(); let f = 0; for (let i = 0; i < N; i++) { const sx = 20 + Math.random() * (W - 40), sy = 20 + Math.random() * (H - 40); if (findPath(sx, sy, Math.max(2, Math.min(W - 3, sx + (Math.random() - .5) * 60)), Math.max(2, Math.min(H - 3, sy + (Math.random() - .5) * 60)), 0)) f++; } out.micro.findPath_ms = +((performance.now() - t) / N).toFixed(3); out.micro.findPath_found = f; }
    // autosave
    { let t = performance.now(); const s = snapshot(); const snapMs = performance.now() - t; t = performance.now(); const j = JSON.stringify(s); const strMs = performance.now() - t; out.save = { snapshotMs: +snapMs.toFixed(1), stringifyMs: +strMs.toFixed(1), bytes: j.length, MB: +(j.length / 1048576).toFixed(2) }; }

    out.world = { chars: chars.length, alive: chars.filter(c => c.state !== 'dead').length, player: player().length, towns: towns.length, buildings: buildings.length, day, hour: Math.round(hour) };
    return out;
  });

  // --- live frame/sim throughput over a fixed window ---
  await page.evaluate(() => {
    window.__f = 0; window.__s = 0;
    const r = window.render; window.render = function () { window.__f++; return r.apply(this, arguments); };
    const u = window.update; window.update = function () { window.__s++; return u.apply(this, arguments); };
    window.speed = 5;
  });
  await page.waitForTimeout(10000);
  const live = await page.evaluate(() => ({ frames: window.__f, steps: window.__s, fps: +fpsEMA.toFixed(1), simMs: +simMs.toFixed(2), renderMs: +renderMs.toFixed(2), drawCalls: renderer.info.render.calls, gpuGeoms: renderer.info.memory.geometries }));

  // --- leak check: force dyn-group rebuilds, watch GPU geometry count ---
  const leak = await page.evaluate(() => {
    const g0 = renderer.info.memory.geometries;
    for (let i = 0; i < 20; i++) { towns.push(towns[0]); syncWells(); renderer.render(scene, camera); towns.pop(); syncWells(); renderer.render(scene, camera); }
    return { before: g0, after: renderer.info.memory.geometries, rebuilds: 40 };
  });

  const result = { label, render: R.render, micro: R.micro, save: R.save, world: R.world, live, leak, errs: errs.slice(0, 6) };
  console.log(JSON.stringify(result, null, 2));
  fs.writeFileSync(path.join(__dirname, 'bench-' + label.replace(/[^a-z0-9]/gi, '_') + '.json'), JSON.stringify(result, null, 2));
  await browser.close();
})();
