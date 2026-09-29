#!/usr/bin/env node
/* THE FOG LIES WHERE THE MAP SAYS IT DOES.
 *
 * "The whole map is pitch black, as though it were the fog effect. But it's just everywhere."
 *
 * It was. Crater phase 1 cut the fog sheet into 256-tile pieces so the renderer could skip the
 * ones off screen, and each piece kept the 0..1 texture coordinates a PlaneGeometry is born
 * with. So every piece drew the WHOLE map's fog shrunk onto itself: the world is almost all
 * unexplored, the ground went black everywhere, and the patch you had actually seen came back
 * as a speck in every piece. Every harness that looks at pixels hides the fog first, and every
 * harness about sight reads `vis`, so nothing looked at the thing a player looks at.
 *
 * This file looks at it. Each claim compares the same ground pixels with the fog sheet on and
 * off, so what stands on the ground does not matter, only what the fog does to it:
 *
 *   1. every piece reads its own window of the fog: at every vertex the texture coordinate is
 *      the world position over the map's size, as the single sheet's were
 *   2. ground in sight beside the party draws as bright under the fog as without it
 *   3. ground never seen draws black
 *   4. ground remembered but out of sight draws dimmed: darker than in sight, lighter than never
 *   5. the minimap shows every block that holds known ground. It read one tile per pixel, a
 *      block's top-left corner, and so showed about half of a road just walked
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

    /* ---- 1. the texture coordinates ---- */
    {
      let worst = 0, n = 0;
      const v = new THREE.Vector3();
      fogPlane.updateMatrixWorld(true);
      for (const m of fogPlane.children) {
        const pos = m.geometry.attributes.position, uv = m.geometry.attributes.uv;
        for (let i = 0; i < pos.count; i++) {
          v.set(pos.getX(i), pos.getY(i), pos.getZ(i)).applyMatrix4(m.matrixWorld);
          worst = Math.max(worst, Math.abs(uv.getX(i) - v.x / W), Math.abs(uv.getY(i) - (1 - v.z / H)));
          n++;
        }
      }
      R.eachPieceReadsItsWindow = worst < 1e-4
        ? `all ${fogPlane.children.length} pieces (${n} vertices) sample the fog at their own world position`
        : `!! A FOG PIECE SAMPLES THE WRONG PART OF THE FOG: a texture coordinate is ${worst.toFixed(3)} off its world position across ${fogPlane.children.length} pieces`;
    }

    /* the same ground pixels with the fog on and off, over the spot the camera is put on */
    const g = document.createElement('canvas');
    const x = g.getContext('2d', { willReadFrequently: true });
    const v = new THREE.Vector3();
    const look = (cx, cy) => { camX = camSX = cx; camY = camSY = cy; camDist = camDistTarget = 40; camFollow = false; };
    const shot = (pts) => {
      render();
      g.width = renderer.domElement.width; g.height = renderer.domElement.height;
      x.drawImage(renderer.domElement, 0, 0);
      let s = 0, k = 0;
      for (const q of pts) {
        v.set(q.x, groundY(q.x, q.y), q.y).project(camera);
        const sx = Math.round((v.x + 1) / 2 * g.width), sy = Math.round((1 - v.y) / 2 * g.height);
        if (sx < 0 || sy < 0 || sx >= g.width || sy >= g.height) continue;
        const d = x.getImageData(sx, sy, 1, 1).data; s += (d[0] + d[1] + d[2]) / 3; k++;
      }
      return k ? s / k : NaN;
    };
    const ratio = (cx, cy, pts) => {
      look(cx, cy);
      fogPlane.visible = true; const on = shot(pts);
      fogPlane.visible = false; const off = shot(pts);
      fogPlane.visible = true;
      return { on: +on.toFixed(1), off: +off.toFixed(1), r: +(on / off).toFixed(2) };
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

    /* ---- 2. in sight ---- */
    computeVision(); fogDirty = true; redrawFog();
    {
      const pts = patch(me.x, me.y, 2);
      const q = ratio(me.x, me.y, pts);
      R.whatYouSeeIsLit = pts.length >= 10 && q.r >= 0.9
        ? `ground in sight beside the party draws at ${q.on} with the fog on and ${q.off} with it off (${q.r}), over ${pts.length} tiles`
        : `!! GROUND IN PLAIN SIGHT IS UNDER THE FOG: ${q.on} with it on against ${q.off} with it off (${q.r}) over ${pts.length} tiles`;
      R._seen = q;
    }

    /* a stretch of open, never-seen ground well away from anybody */
    const far = (() => {
      for (let r = 160; r < 900; r += 40) for (let a = 0; a < 6.28; a += 0.4) {
        const cx = me.x + Math.cos(a) * r, cy = me.y + Math.sin(a) * r;
        if (cx < 40 || cy < 40 || cx > W - 40 || cy > H - 40) continue;
        const pts = patch(cx, cy, 0);
        if (pts.length >= 30) return { x: cx, y: cy };
      }
      return null;
    })();

    /* ---- 3. never seen ---- */
    if (!far) R.whatYouNeverSawIsDark = '!! NO OPEN, UNSEEN GROUND TO LOOK AT';
    else {
      const pts = patch(far.x, far.y, 0);
      const q = ratio(far.x, far.y, pts);
      R.whatYouNeverSawIsDark = q.r <= 0.15
        ? `ground never seen draws at ${q.on} under the fog against ${q.off} without it (${q.r})`
        : `!! GROUND NEVER SEEN SHOWS THROUGH THE FOG: ${q.on} against ${q.off} (${q.r})`;
    }

    /* ---- 4. remembered ---- */
    if (far) {
      const r0 = 14, touched = [];
      for (let y = Math.floor(far.y - r0); y <= far.y + r0; y++) for (let x2 = Math.floor(far.x - r0); x2 <= far.x + r0; x2++) {
        const i = y * W + x2; if (vis[i] === 0) { vis[i] = 1; touched.push(i); }
      }
      fogMarkAll(); fogDirty = true; redrawFog();
      const pts = patch(far.x, far.y, 1);
      const q = ratio(far.x, far.y, pts);
      for (const i of touched) vis[i] = 0;
      fogMarkAll(); fogDirty = true; redrawFog();
      const seenR = R._seen ? R._seen.r : 1;
      R.whatYouRememberIsDim = pts.length >= 20 && q.r > 0.2 && q.r < Math.min(0.85, seenR - 0.1)
        ? `ground remembered and out of sight draws at ${q.on} against ${q.off} without the fog (${q.r}): dimmer than ground in sight, lighter than ground never seen`
        : `!! REMEMBERED GROUND IS NOT DIMMED: ${q.on} against ${q.off} (${q.r}) over ${pts.length} tiles`;
    }
    delete R._seen;

    /* ---- 5. the minimap ---- */
    {
      const t0 = towns[0];
      const rt = towns.slice(1).map(o => routeFor(t0, o)).filter(r => r && r.wps && r.wps.length).sort((a, c) => a.wps.length - c.wps.length)[0];
      const keep = player().map(c => ({ c, x: c.x, y: c.y }));
      for (const wp of (rt ? rt.wps : [])) { for (const c of player()) { c.x = wp.x; c.y = wp.y; } computeVision(); }
      computeVision();
      redrawMinimapFog();
      const fd = mmFog.getContext('2d').getImageData(0, 0, 128, 128).data;
      let shown = 0, dark = 0, blocks = 0;
      for (let by = 0; by < 128; by++) for (let bx = 0; bx < 128; bx++) {
        let any = false;
        const y0 = Math.floor(by * H / 128), y1 = Math.floor((by + 1) * H / 128), x0 = Math.floor(bx * W / 128), x1 = Math.floor((bx + 1) * W / 128);
        for (let y = y0; y < y1 && !any; y++) for (let x2 = x0; x2 < x1; x2++) if (vis[y * W + x2] > 0) { any = true; break; }
        const a = fd[(by * 128 + bx) * 4 + 3];
        if (any) { blocks++; if (a < 255) shown++; } else if (a === 255) dark++;
      }
      for (const k of keep) { k.c.x = k.x; k.c.y = k.y; }
      computeVision();
      R.theMinimapShowsWhatYouKnow = blocks > 20 && shown === blocks && dark === 128 * 128 - blocks
        ? `after the road to the nearest town (${rt ? rt.wps.length : 0} waypoints), all ${blocks} minimap blocks holding known ground show through its fog, and the rest stay dark`
        : `!! THE MINIMAP HIDES GROUND YOU KNOW: ${shown} of ${blocks} blocks with known ground show through, and ${128 * 128 - blocks - dark} blocks with none are lit`;
    }
    return R;
  });

  const bad = Object.values(out).filter(v => typeof v === 'string' && v.startsWith('!!'));
  for (const [k, v] of Object.entries(out)) console.log('  ' + k.padEnd(28) + ' ' + v);
  for (const e of errs) console.log('  ' + e);
  console.log('');
  console.log(bad.length || errs.length ? `*** THE FOG IS WRONG (${bad.length + errs.length}) ***` : 'THE FOG LIES WHERE THE MAP SAYS');
  await b.close();
  process.exit(bad.length || errs.length ? 1 : 0);
})();
