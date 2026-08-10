#!/usr/bin/env node
/* What this game costs, and whether a phone could hold it.
 *
 * The frame rate this reports at a phone viewport is NOT a phone prediction — everything here
 * runs on SwiftShader, which is software rasterisation with no GPU at all, and it is slower
 * than any real handset by orders of magnitude. Do not quote it as one.
 *
 * What IS device-independent, and what this exists for:
 *   - triangles submitted per frame, and WHICH mesh they belong to
 *   - draw calls and scene objects
 *   - how big a save is against a mobile storage budget
 *   - how many touch targets are under the 44px minimum, and what falls off a 393px screen
 *
 * The first thing it measured overturned the plan it was written for. The obvious suspect for
 * two million triangles was six hundred characters, and characters turned out to be 0.6% of
 * the frame — 367 triangles a body. Half the frame was the fog overlay, a single flat sheet
 * with a vertex every two tiles across the whole 1440x1440 world.
 *
 *   node tools/mobile.js [game.html]
 */
const { chromium, devices } = require('playwright');
const path = require('path');
const gamePath = (a) => path.resolve(a ? (path.isAbsolute(a) ? a : path.join(__dirname, a)) : path.join(__dirname, 'game.html'));

const PROBE = () => {
  const triOf = (o) => {
    const g = o.geometry; if (!g) return 0;
    const idx = g.index ? g.index.count : (g.attributes.position ? g.attributes.position.count : 0);
    return (idx / 3) * (o.isInstancedMesh ? o.count : 1);
  };
  /* every top-level group, by what it costs */
  const rows = [];
  for (const child of scene.children) {
    let n = 0, objs = 0;
    child.traverse(o => { if (o.isMesh) { n += triOf(o); objs++; } });
    if (n > 0) rows.push({ name: child.name || (child === fogPlane ? 'fogPlane' : '(anon ' + child.type + ')'), tris: Math.round(n), objs, vis: child.visible });
  }
  /* fold the repeats — sixty-four meshes all called "ground" is one line of information */
  const folded = {};
  for (const r of rows) {
    const k = r.name;
    folded[k] = folded[k] || { name: k, tris: 0, meshes: 0, vis: 0 };
    folded[k].tris += r.tris; folded[k].meshes++; if (r.vis) folded[k].vis++;
  }
  const heavy = Object.values(folded).sort((a, b) => b.tris - a.tris).slice(0, 6);

  let charTris = 0, built = 0, charMeshCount = 0;
  charMeshes.forEach(e => { built++; e.g.traverse(o => { if (o.isMesh) { charTris += triOf(o); charMeshCount++; } }); });

  const info = renderer.info;
  let saveKB = -1;
  try { saveKB = Math.round(JSON.stringify(snapshot()).length / 1024); } catch (e) { }

  const vw = innerWidth, vh = innerHeight;
  const panels = [...document.querySelectorAll('.hud,#charpanel,#invpanel,#minimap,#log,#squadbar,#buildbar,#topbar')]
    .filter(e => e.offsetParent !== null)
    .map(e => { const r = e.getBoundingClientRect(); return { id: e.id || e.className, off: r.right > vw + 1 || r.bottom > vh + 1 || r.left < -1 }; });
  const targets = [...document.querySelectorAll('button')].filter(e => e.offsetParent !== null)
    .map(e => { const r = e.getBoundingClientRect(); return Math.min(r.width, r.height); }).filter(v => v > 0);

  return {
    frameTris: info.render.triangles, calls: info.render.calls,
    sceneTris: rows.reduce((a, r) => a + r.tris, 0),
    heavy,
    bodies: built, charTris: Math.round(charTris),
    meshPerBody: built ? Math.round(charMeshCount / built) : 0, charMeshes: charMeshCount,
    perBody: built ? Math.round(charTris / built) : 0,
    charShare: info.render.triangles ? +(charTris / info.render.triangles * 100).toFixed(1) : 0,
    geoms: info.memory.geometries, textures: info.memory.textures,
    saveKB, chars: chars.length,
    vw, vh, dpr: devicePixelRatio, dprUsed: renderer.getPixelRatio(),
    offscreen: panels.filter(p => p.off).map(p => p.id),
    tinyTargets: targets.filter(v => v < 44).length, targets: targets.length,
    minTarget: targets.length ? Math.round(Math.min(...targets)) : null,
  };
};

(async () => {
  const b = await chromium.launch({
    executablePath: process.env.DUSTWARD_CHROME || undefined,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'],
  });
  const url = 'file://' + gamePath(process.argv[2]);
  const run = async (label, ctxOpts) => {
    const ctx = await b.newContext(ctxOpts);
    const p = await ctx.newPage();
    const errs = [];
    p.on('pageerror', e => errs.push(e.message.slice(0, 160)));
    await p.goto(url, { waitUntil: 'load' });
    await p.waitForTimeout(3000);
    await p.evaluate(() => document.getElementById('btn-start').click());
    await p.waitForTimeout(8000);          /* let syncChars finish building bodies */
    const r = await p.evaluate(PROBE);
    await ctx.close();
    return { label, r, errs };
  };

  const desk = await run('DESKTOP 1280x800', { viewport: { width: 1280, height: 800 } });
  const phone = await run('PHONE  393x851', { ...devices['Pixel 5'] });

  for (const { label, r, errs } of [desk, phone]) {
    console.log('=== ' + label + ' ===');
    console.log(`  frame            ${r.frameTris.toLocaleString()} tris in ${r.calls} calls`);
    console.log(`  scene total      ${r.sceneTris.toLocaleString()} tris`);
    console.log('  heaviest:');
    for (const h of r.heavy)
      console.log(`    ${h.name.padEnd(16)} ${String(h.tris).padStart(9)} tris` +
        (h.meshes > 1 ? `  (${h.meshes} meshes, ${h.vis} visible)` : ''));
    console.log(`  characters       ${r.bodies} bodies, ${r.charTris.toLocaleString()} tris (${r.perBody}/body) — ${r.charShare}% of the frame`);
    console.log(`                   ${r.charMeshes} meshes (${r.meshPerBody}/body) — ${r.calls ? Math.round(r.charMeshes / r.calls * 100) : 0}% of the draw calls`);
    console.log(`  memory           ${r.geoms} geometries, ${r.textures} textures`);
    console.log(`  save             ${r.saveKB} KB` + (r.saveKB > 4096 ? '   *** OVER A 4MB MOBILE BUDGET ***' : r.saveKB > 2048 ? '   (mobile localStorage is ~5MB)' : ''));
    if (label.startsWith('PHONE')) {
      /* The renderer caps its own pixel ratio, so quote the one it USES rather than the one
         the device reports — the first version of this line multiplied by the raw dpr and
         claimed a framebuffer half again bigger than the one actually being drawn. */
      console.log(`  viewport         ${r.vw}x${r.vh}, device dpr ${r.dpr}, renderer using ${r.dprUsed}` +
        ` → drawing ${Math.round(r.vw * r.dprUsed)}x${Math.round(r.vh * r.dprUsed)}`);
      console.log(`  touch targets    ${r.tinyTargets}/${r.targets} under 44px, smallest ${r.minTarget}px` +
        (r.tinyTargets ? '   *** UNDER THE MINIMUM ***' : ''));
      console.log(`  off-screen       ${r.offscreen.length ? r.offscreen.join(', ') + '   *** CLIPPED ***' : 'nothing clipped'}`);
    }
    if (errs.length) console.log('  errs:', errs.slice(0, 2));
    console.log('');
  }

  /* Two lists, and the difference matters because this runs in `npm run check`.
     HOLD is ground already taken: a regression here should stop a commit.
     OPEN is mobile work not started yet — reporting it every run is the point of having the
     number, but failing the build on it would block every commit until the whole port lands. */
  const t = desk.r.frameTris, ph = phone.r;
  const hold = [], open = [];
  if (t > 900000) hold.push(`FRAME IS ${(t / 1000).toFixed(0)}k TRIS — was brought under the ~900k line for a mid handset, and has gone back over`);
  if (desk.r.calls > 2500) hold.push(`${desk.r.calls} DRAW CALLS`);
  if (ph.saveKB > 4096) hold.push(`SAVE IS ${ph.saveKB}KB — past a mobile storage budget`);
  if (ph.tinyTargets > ph.targets * 0.5) open.push(`${ph.tinyTargets}/${ph.targets} touch targets under 44px (mobile UI not started)`);
  if (ph.offscreen.length) open.push(`${ph.offscreen.join('/')} renders off-screen at 393px (mobile UI not started)`);
  /* read the real per-body mesh count rather than a number typed in when it was 28 */
  if (desk.r.calls > 400) open.push(`${desk.r.calls} draw calls (bodies are ${desk.r.meshPerBody} meshes each now)`);
  for (const o of open) console.log('    (open) ' + o);
  console.log(hold.length ? '*** REGRESSED: ' + hold.join('\n*** ') : 'WITHIN THE BUDGET THAT HAS BEEN TAKEN');
  await b.close();
  if (hold.length) process.exitCode = 1;
})();
