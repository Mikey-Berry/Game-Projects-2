#!/usr/bin/env node
/* The named origins, front and back, side by side.
 *
 * A face is the one thing in this game that cannot be checked with a number. `origin.js`
 * will happily report THE PRINCE IS WHOLE while he stands there in the default hash-rolled
 * body, because every assertion in it is about state. This one exists so the claim "he has
 * long white hair and a dusty black coat" can be looked at instead of asserted.
 *
 *   node tools/faces.js out.png [game.html]
 *
 * It clears `chars` before building, because syncChars only makes a bounded number of meshes
 * per frame and a probe that spawns bodies into a populated world waits a long time for
 * geometry that may never arrive.
 */
const { chromium } = require('playwright');
const path = require('path');
const gamePath = (a) => path.resolve(a ? (path.isAbsolute(a) ? a : path.join(__dirname, a)) : path.join(__dirname, 'game.html'));
const OUT = process.argv[2] || path.join(__dirname, 'faces.png');

(async () => {
  const b = await chromium.launch({
    executablePath: process.env.DUSTWARD_CHROME || undefined,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'],
  });
  const p = await b.newPage({ viewport: { width: 1500, height: 470 }, deviceScaleFactor: 2 });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message.slice(0, 200)));
  await p.goto('file://' + gamePath(process.argv[3]), { waitUntil: 'load' });
  await p.waitForTimeout(3000);
  await p.evaluate(() => document.getElementById('btn-start').click());
  await p.waitForTimeout(1500);

  const info = await p.evaluate(() => {
    paused = true; syncPauseBtn(); hour = 11;
    /* nothing renders a non-player body without this, and the fog plane eats the ground */
    debugSeeAll = true; if (typeof fogPlane !== 'undefined') fogPlane.visible = false;
    if (typeof syncDecorFogFull === 'function') syncDecorFogFull();

    const me = player()[0];
    /* open ground with nothing in it for six tiles in any direction */
    let spot = null;
    /* try for six tiles of nothing, settle for four — a fully clear 13x13 is rare enough in
       this world that demanding one silently returned null and threw two lines later */
    for (const pad of [6, 4, 3]) {
      for (let r = 40; r < 240 && !spot; r += 4) for (let a = 0; a < 24 && !spot; a++) {
        const x = me.x + Math.cos(a / 24 * 6.283) * r, y = me.y + Math.sin(a / 24 * 6.283) * r;
        if (x < pad + 2 || y < pad + 2 || x >= self.W - pad - 2 || y >= self.H - pad - 2) continue;
        let ok = true;
        for (let dy = -pad; dy <= pad && ok; dy++) for (let dx = -pad; dx <= pad && ok; dx++) {
          const ix = Math.floor(x) + dx, iy = Math.floor(y) + dy;
          if (isBlocked(ix + 0.5, iy + 0.5, 0) || terr[iy * self.W + ix] === 3 || decorAt(ix, iy)) ok = false;
        }
        if (ok) spot = { x, y };
      }
      if (spot) break;
    }
    if (!spot) return { fail: 'NO OPEN GROUND ANYWHERE' };
    chars.length = 0;
    charMeshes.forEach(e => { if (e.g && e.g.parent) e.g.parent.remove(e.g); });
    charMeshes.clear();

    /* four bodies: each named face front-on and turned away, so the hair down the back and
       the coat's skirt are both visible in one sheet */
    const built = [];
    const rows = [
      { face: 'lyonart', name: "Lyonart d'Alagadda", weapon: 'w_kat', armor: 'a_lea', race: 'human' },
      { face: 'saga', name: 'Saga Wordsworth', weapon: 'w_kat', armor: 'a_pla', race: 'hollow' },
      { face: 'ilsabet', name: "Ilsabet d'Alagadda", weapon: 'w_kat', armor: 'a_lea', race: 'human', sex: 'f' },
    ];
    rows.forEach((r, i) => {
      for (const back of [0, 1]) {
        /* one row, all four at the same depth, so none of them is judged from further away */
        const c = makeChar(r.name, 'player', spot.x + (i * 2 + back - 2.5) * 1.35, spot.y,
          { atk: 14, def: 12, tough: 12, ath: 6, weapon: r.weapon, armor: r.armor, race: r.race });
        c.face = r.face; c.sex = r.sex || 'm'; c.dir = 0;
        if (r.face === 'saga') c.hollowTier = 1;
        chars.push(c); built.push(c.id);
      }
    });
    window.__ids = built;
    camX = camSX = spot.x; camY = camSY = spot.y;
    camDist = camDistTarget = 8.6; camPitch = camPitchT = 0.05;
    camYaw = camYawT = 0.0; camFollow = false; selected = [];
    return { at: spot, n: built.length };
  });

  /* syncChars is driven by the sim step and builds a bounded number per frame */
  await p.waitForTimeout(4000);
  const state = await p.evaluate(() => {
    /* face the front pair at the camera and the back pair away, and freeze them there */
    const ids = window.__ids;
    ids.forEach((id, i) => {
      const e = charMeshes.get(id);
      if (e) { e.rotY = (i % 2) ? Math.PI : 0; e.g.rotation.set(0, e.rotY, 0); }
    });
    document.querySelectorAll('.hud,#charpanel,#invpanel,#minimap,#log,#tip,#squadbar,#buildbar')
      .forEach(el => el.style.setProperty('display', 'none', 'important'));
    return { meshes: window.__ids.filter(id => charMeshes.has(id)).length, want: window.__ids.length };
  });
  await p.waitForTimeout(700);
  await p.screenshot({ path: OUT });
  console.log(`${path.basename(OUT)} — ${state.meshes}/${state.want} bodies built` +
    (state.meshes < state.want ? '  *** GEOMETRY MISSING ***' : ''));
  if (errs.length) { console.log('errs:', errs.length); errs.slice(0, 3).forEach(e => console.log('  ' + e)); }
  await b.close();
})();
