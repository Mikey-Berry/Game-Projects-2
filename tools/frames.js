#!/usr/bin/env node
/* A CROWD IS SUPPOSED TO BE A POPULATION.
 *
 * Every body used to roll a colouring and almost nothing else: five skins, six hair colours,
 * and about seven percent of height between the tallest person in the game and the shortest.
 * Colour is a few pixels at this camera. The OUTLINE is the whole figure, and every body had
 * the same one.
 *
 * `build` — shoulder, pelvis, chest, limb and the two scales — already existed and was used by
 * exactly one line in the game. Bodies roll a frame off it now. This checks four things about
 * that, and the last two are the ones that would actually break something:
 *
 *   1. EVERY ARCHETYPE HAPPENS, and roughly as often as its weight says. A table with a
 *      weight nobody ever rolls is a table with dead rows in it.
 *   2. THE FRAMES ARE ACTUALLY DIFFERENT SHAPES. Numbers in a table prove nothing — the
 *      claim is that the geometry moved, so the geometry is what gets measured. A heavy body
 *      has to come out measurably wider against its own height than a slight one.
 *   3. IT IS STABLE. A body that walks out of view and back is rebuilt from scratch, and a
 *      frame that came off a fresh roll would hand it a new silhouette every time. Same id,
 *      same frame, every rebuild — this is the trap `phase` and the demilich's heap both
 *      record, and it is worth a claim of its own.
 *   4. IT DOES NOT TOUCH THE WORLD STREAM. Worldgen's `rnd()` is a single sequence and every
 *      body placed after a draw shifts if somebody spends one. Rolling a frame must cost
 *      nothing from it, or looking at a character changes the world.
 *
 *   node tools/frames.js [out.png] [game.html]
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const OUT = path.resolve(process.argv[2] || path.join(__dirname, 'frames.png'));
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
  await p.evaluate(() => { document.getElementById('btn-start').click(); paused = true; });
  await p.waitForTimeout(3000);

  const R = await p.evaluate(() => {
    paused = true; hour = 11; debugSeeAll = true;
    if (typeof updateSky === 'function') updateSky();
    /* THE FOG PLANE IS WHY THE GROUND CAME BACK BLACK. Unexplored ground is covered, and a
       probe that stages bodies somewhere the player has never walked photographs the cover.
       Every other sheet in here lifts it the same way. */
    if (typeof fogPlane !== 'undefined') fogPlane.visible = false;
    if (typeof syncDecorFogFull === 'function') syncDecorFogFull();
    const out = {};
    /* THE SPOT IS KEPT BEFORE ANYTHING IS CLEARED. `clear()` empties `chars`, so `player()`
       comes back empty and every later `player()[0]` is undefined — which is a crash in the
       probe, not a finding. */
    const me = player()[0];
    /* OPEN GROUND, ON A LADDER. The first version staged the line-up on the player's own
       tile, which is inside a town: six bodies went up behind a warehouse and the sheet came
       back as a photograph of a wall. The second asked for twelve clear tiles in every
       direction and found nowhere at all in a 1440-square world — 1,078 candidates, none of
       them clear — so it fell straight back to the tile it was trying to avoid. A clearance
       this probe wants and cannot have is worse than a smaller one it can, so it asks for a
       lot, then for less, then for less again. `lich.js` takes the same ladder for the same
       reason. */
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
    out.stagedOnOpenGround = spot ? 'the line-up has clear ground to stand on'
      : '!! NO OPEN GROUND ANYWHERE — the line-up is against a wall and tells you nothing';
    window.__spot = spot || { x: me.x + 3, y: me.y + 3 };
    const clear = () => {
      chars.length = 0;
      charMeshes.forEach(e => { if (e.g && e.g.parent) e.g.parent.remove(e.g); });
      charMeshes.clear();
    };
    /* the body without what it is holding — a weapon is a child of the elbow and would be
       measured as part of the frame */
    const spanOf = (e) => {
      const w = e.weapon, par = w && w.parent;
      if (par) par.remove(w);
      const bb = new THREE.Box3();
      e.g.updateWorldMatrix(true, true);
      bb.expandByObject(e.g);
      if (par) par.add(w);
      return bb.getSize(new THREE.Vector3());
    };
    const one = (id, sex) => {
      const c = makeChar('P' + id, 'player', me.x, me.y,
        { atk: 8, def: 8, tough: 8, race: 'human', sex: sex || 'm', age: 30 });
      c.state = 'ok'; c.weapon = null; c.armor = null;
      chars.push(c);
      syncChars(0.05); syncChars(0.05);
      return { c, e: charMeshes.get(c.id) };
    };

    /* ---------- 1. THE SPREAD ---------- */
    const seen = {}, sz = {};
    clear();
    for (let i = 0; i < 240; i++) {
      const { e } = one(i, i % 2 ? 'f' : 'm');
      const k = e.frame || 'none';
      seen[k] = (seen[k] || 0) + 1;
      const s = spanOf(e);
      (sz[k] = sz[k] || []).push({ w: s.x, h: s.y });
      chars.length = 0;
      charMeshes.forEach(x => { if (x.g && x.g.parent) x.g.parent.remove(x.g); });
      charMeshes.clear();
    }
    const names = Object.keys(seen).sort();
    out.spread = names.map(k => `${k} ${(seen[k] / 240 * 100).toFixed(0)}%`).join(', ');
    out.everyFrameHappens = (names.length === 6 && !seen.none)
      ? `all six frames turn up in 240 bodies — ${out.spread}`
      : `!! ONLY ${names.length} FRAMES IN 240 BODIES: ${out.spread}`;

    /* ---------- 2. AND THEY ARE DIFFERENT SHAPES ----------
       Against the body's OWN height, because an archetype moves both and a raw width would
       report a tall thin body as a broad one. */
    const mean = k => {
      const a = sz[k] || [];
      return a.reduce((t, v) => t + v.w / v.h, 0) / (a.length || 1);
    };
    const ratios = names.map(k => [k, mean(k)]).sort((a, b) => a[1] - b[1]);
    out.ratios = ratios.map(([k, v]) => `${k} ${v.toFixed(3)}`).join(', ');
    const lo = ratios[0], hi = ratios[ratios.length - 1];
    out.framesAreDifferentShapes = (hi[1] / lo[1] > 1.20)
      ? `the widest frame is ${(hi[1] / lo[1]).toFixed(2)}x the narrowest against its own height — ${hi[0]} ${hi[1].toFixed(3)} against ${lo[0]} ${lo[1].toFixed(3)}`
      : `!! EVERY FRAME IS THE SAME SHAPE: ${hi[0]} ${hi[1].toFixed(3)} vs ${lo[0]} ${lo[1].toFixed(3)}`;

    /* ---------- 3 AND 4. THE SAME BODIES, REBUILT ----------
       THE SAME CHARACTERS, NOT FRESH ONES WITH THE SAME NAMES. `makeChar` mints a new id and
       spends from the world stream doing it, so a probe that makes a second batch is comparing
       twelve bodies against twelve DIFFERENT bodies and reporting a stable roll as broken.
       What a rebuild actually is: the character objects stay, `charMeshes` is dropped, and
       `syncChars` builds again — which is exactly what happens when a body walks out of view
       and back. Both claims ride on that, so both are measured across it. */
    clear();
    const keep = [];
    for (let i = 0; i < 16; i++) keep.push(one(i).c);
    const first = keep.map(c => { const e = charMeshes.get(c.id); return e.frame + ':' + e.baseSX.toFixed(4); });
    const before = seed;
    charMeshes.forEach(x => { if (x.g && x.g.parent) x.g.parent.remove(x.g); });
    charMeshes.clear();
    syncChars(0.05); syncChars(0.05);
    const second = keep.map(c => { const e = charMeshes.get(c.id); return e.frame + ':' + e.baseSX.toFixed(4); });
    out.stableAcrossRebuilds = first.join('|') === second.join('|')
      ? `${keep.length} bodies dropped and rebuilt come back with the frame they had`
      : `!! A REBUILD CHANGED THE FRAME: ${first.slice(0, 3)} -> ${second.slice(0, 3)}`;
    out.costsNothingFromTheWorldStream = (seed === before)
      ? `and rebuilding all ${keep.length} left \`seed\` exactly where it was (${before})`
      : `!! REBUILDING BODIES SPENT ${seed - before} OF THE WORLD STREAM`;
    clear();

    /* ---------- and the line build still wins where it is stated ---------- */
    clear();
    const succ = [];
    for (let i = 0; i < 40; i++) {
      const c = makeChar('S' + i, 'player', me.x, me.y,
        { atk: 8, def: 8, tough: 8, race: 'mimic', sub: 'succubus', sex: 'f', age: 30 });
      c.state = 'ok'; chars.push(c);
      syncChars(0.05); syncChars(0.05);
      const e = charMeshes.get(c.id);
      succ.push(e.frame);
      chars.length = 0;
      charMeshes.forEach(x => { if (x.g && x.g.parent) x.g.parent.remove(x.g); });
      charMeshes.clear();
    }
    out.aStatedFrameStillVaries = new Set(succ).size >= 4
      ? `a line that states its own build still gets ${new Set(succ).size} frames across 40 bodies — it composes, it does not replace`
      : `!! A STATED BUILD COLLAPSED THE ROLL: ${new Set(succ).size} frames in 40`;
    clear();
    return out;
  });

  /* and a line-up to look at */
  const shot = await p.evaluate(async () => {
    const me = window.__spot;
    chars.length = 0;
    charMeshes.forEach(e => { if (e.g && e.g.parent) e.g.parent.remove(e.g); });
    charMeshes.clear();
    document.querySelectorAll('.hud,#charpanel,#invpanel,#minimap,#log,#tip,#squadbar,#buildbar,#touchbar')
      .forEach(el => el.style.setProperty('display', 'none', 'important'));
    /* EIGHT IN A ROW, AND WHATEVER THE ROLL GIVES THEM. An earlier version hunted for one of
       each frame and then staged them by NAME — but a frame comes off the id, which `makeChar`
       mints fresh, so the six bodies photographed were never the six that were picked. It was
       labelling a line-up it had not built. The question this sheet answers is "does a crowd
       look like a population", so: a crowd, unposed, each one labelled with the frame it
       actually has. */
    const made = [];
    for (let j = 0; j < 8; j++) {
      const c = makeChar('L' + j, 'player', me.x + (j - 3.5) * 1.15, me.y,
        { atk: 8, def: 8, tough: 8, race: 'human', sex: j % 3 === 0 ? 'f' : 'm', age: 30 });
      c.state = 'ok'; c.dir = 0; c.weapon = null; c.armor = null;
      chars.push(c); made.push(c);
    }
    for (let i = 0; i < 10; i++) syncChars(0.05);
    const ids = [];
    const box = new THREE.Box3();
    for (const c of made) {
      const e = charMeshes.get(c.id);
      if (!e) continue;
      ids.push(e.frame + (c.sex === 'f' ? '\u2640' : ''));
      e.g.rotation.set(0, 0, 0); e.g.updateWorldMatrix(true, true);
      box.expandByObject(e.g);
    }
    const ctr = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3());
    const cam = camera.clone();
    cam.aspect = 2.4; cam.fov = 32;
    /* ABOVE THE LINE AND LOOKING DOWN ON IT, which is where the play camera sits. Level with
       the middle of a body the shot catches the ground edge-on and half the sheet comes back
       as a black band. */
    const back = Math.max(s.x, s.y * 2.4) * 1.25;
    cam.position.set(ctr.x, ctr.y + back * 0.30, ctr.z + back);
    cam.lookAt(ctr); cam.updateProjectionMatrix();
    const cv = renderer.domElement;
    const w0 = cv.width, h0 = cv.height, sw = cv.style.width, sh = cv.style.height;
    renderer.setSize(1200, 500, false);
    renderer.render(scene, cam);
    const url = cv.toDataURL('image/png');
    renderer.setSize(w0, h0, false);
    cv.style.width = sw; cv.style.height = sh;
    return { png: url.split(',')[1], order: ids.join('  ') };
  });

  fs.writeFileSync(OUT, Buffer.from(shot.png, 'base64'));
  for (const [k, v] of Object.entries(R)) console.log('  ' + k.padEnd(30) + v);
  console.log('\n  ' + path.basename(OUT) + ' — left to right: ' + shot.order);
  const bad = Object.values(R).map(String).filter(v => v.startsWith('!!'));
  for (const e of errs) console.log('  PAGEERROR: ' + e);
  console.log('\n' + (bad.length || errs.length ? 'THE CROWD IS STILL ONE PERSON' : 'A CROWD IS A POPULATION'));
  await b.close();
  process.exit(bad.length || errs.length ? 1 : 0);
})();
