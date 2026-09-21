#!/usr/bin/env node
/* POURED, STAMPED, AND ON A CLOCK.
 *
 * A homunculus had three tells and a haircut: pale skin, white eyes, and a white slab on the
 * crown. That is less than a beard, for the one line in the game whose entire story is that it
 * was GROWN — to order, in a vat, with a working name and a batch number, and eleven years to
 * be good at something in.
 *
 *   1. THE PURPOSE PICKS THE FRAME. A thing poured for a job does not get a body at random,
 *      and a vat that turns out haulers turns out haulers. Two with the same purpose come out
 *      the same shape; a hauler and a clerk do not.
 *   2. AND IT IS READ OFF THE WORK where there is any — a smith was poured to lift.
 *   3. THE MOULD LEAVES A SEAM and the pourers leave a mark.
 *   4. ELEVEN YEARS. `aged` is a fraction of THIS line's life, so the number that greys a
 *      human at fifty does this at twenty-five, and it gives out at the edges first.
 *
 *   node tools/vat.js [out.png] [game.html]
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const OUT = path.resolve(process.argv[2] || path.join(__dirname, 'vat.png'));
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
    const tris = (e) => {
      let t = 0;
      e.g.traverse(o => {
        if (!o.isMesh || !o.geometry) return;
        const g = o.geometry;
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
      const c = makeChar('V', 'player', window.__spot.x, window.__spot.y,
        Object.assign({ atk: 8, def: 8, tough: 8, race: 'homunculus', sex: 'm', age: 16 }, opts || {}));
      c.state = 'ok'; c.weapon = null; c.armor = null;
      Object.assign(c, set || {});
      chars.push(c);
      syncChars(0.05); syncChars(0.05);
      return { c, e: charMeshes.get(c.id) };
    };

    /* ---------- 1. EVERY PURPOSE TURNS UP, AND EACH ONE IS ONE SHAPE ---------- */
    clear();
    const byPurpose = {};
    for (let i = 0; i < 240; i++) {
      const { e } = one();
      (byPurpose[e.purpose || 'none'] = byPurpose[e.purpose || 'none'] || new Set()).add(e.frame);
      clear();
    }
    const purposes = Object.keys(byPurpose).sort();
    const mixed = purposes.filter(k => byPurpose[k].size !== 1);
    out.purposes = purposes.map(k => `${k}:${[...byPurpose[k]].join('/')}`).join(', ');
    out.aPurposeIsOneShape = (purposes.length === 5 && !mixed.length && !byPurpose.none)
      ? `all five purposes turn up across 240 pourings and each one is exactly one frame — ${out.purposes}`
      : `!! A VAT IS TURNING OUT MIXED STOCK: ${mixed.join(', ') || out.purposes}`;
    /* and the frames are actually different from each other */
    const frames = new Set(purposes.map(k => [...byPurpose[k]][0]));
    out.andThePurposesDiffer = frames.size === purposes.length
      ? `and no two purposes share a frame — ${frames.size} shapes for ${purposes.length} jobs`
      : `!! TWO JOBS COME OUT THE SAME SHAPE: ${[...frames].join(', ')}`;

    /* ---------- 2. AND IT IS READ OFF THE WORK WHERE THERE IS ANY ---------- */
    clear();
    const byTrade = {};
    for (const t of ['smith', 'crafter', 'hunter', 'farmer']) {
      const { e } = one({ trade: t });
      byTrade[t] = e.purpose;
      clear();
    }
    out.tradePurposes = Object.entries(byTrade).map(([t, v]) => `${t}->${v}`).join(', ');
    out.theWorkDecidesThePurpose = (byTrade.smith === 'hauler' && byTrade.crafter === 'clerk'
                                    && byTrade.hunter === 'runner' && byTrade.farmer === 'labour')
      ? `a homunculus at a trade was poured for it — ${out.tradePurposes}`
      : `!! THE TRADE IS NOT REACHING THE PURPOSE: ${out.tradePurposes}`;

    /* ---------- 3. THE SEAM AND THE MARK ---------- */
    clear();
    {
      /* AGAINST A BALD HUMAN, or the delta is mostly hair. A homunculus wears a crown slab
         where a human wears whichever of eight styles it rolled, so comparing the two
         subtracts a topknot and adds a lid and reports the difference as if it were seams.
         Bodies are poured until one comes out bald, and then only the pouring is left in the
         measurement. */
      let c = null, e = null;
      for (let i = 0; i < 400 && !c; i++) {
        const t = one({}, { race: 'human' });
        if (t.e.hairStyle === 'bald') { c = t.c; e = t.e; }
        else {
          chars.pop();
          if (t.e.g && t.e.g.parent) t.e.g.parent.remove(t.e.g);
          charMeshes.delete(t.c.id);
        }
      }
      const asHuman = tris(e);
      c.race = 'homunculus';
      const asPoured = tris(rebuilt(c));
      out.pouredIsMoreThanPale = asPoured > asHuman + 96
        ? `the same bald body poured instead of born carries ${asPoured - asHuman} more triangles of seam, stamp and crown`
        : `!! BEING POURED IS STILL ONLY A COLOUR (${asHuman} -> ${asPoured})`;
      clear();
    }

    /* ---------- 4. AND IT GIVES OUT ON THIS LINE'S OWN CLOCK ---------- */
    clear();
    {
      const { c, e } = one({}, { age: 16 });
      const young = { t: tris(e), a: +(1 - e.baseSY / e.baseSY).toFixed(3) };
      /* THE STOOP GOES IN THE READING TOO. When the triangle counts sat flat across three ages
         there was no way to tell from the numbers whether the stages were not firing or `aged`
         was not moving — two very different bugs with one symptom. It was `aged` all along on
         the first go and the stages on the second, and both were invisible until the input and
         the output were printed side by side. */
      const seen = {};
      seen[16] = { t: tris(e), s: +(e.stoop || 0).toFixed(2) };
      for (const a of [22, 27, 31, 34]) {
        c.age = a;
        const e2 = rebuilt(c);
        seen[a] = { t: tris(e2), s: +(e2.stoop || 0).toFixed(2) };
      }
      out.decayReadings = Object.entries(seen).map(([a, v]) => `${a}y: ${v.t}t/stoop ${v.s}`).join(' | ');
      const steps = new Set(Object.values(seen).map(v => v.t));
      out.itGivesOutAtTheEdges = (steps.size >= 4 && seen[34].t > seen[27].t && seen[27].t > seen[16].t)
        ? `the same body carries more of the waxing at every reading of its thirty-four, in ${steps.size} distinct stages — ${out.decayReadings}`
        : `!! THE CLOCK IS NOT SHOWING (${steps.size} stages): ${out.decayReadings}`;
      void young;
      clear();
    }
    /* a human at the same ages has none of it, because thirty-four is most of a homunculus
       and half a human */
    clear();
    {
      const hu = one({}, { age: 30 }).e.stoop;
      clear();
      const ht = one({}, { race: 'human', age: 30 }).e.stoop;
      clear();
      out.thirtyIsNotThirty = (hu > 0.1 && ht === 0)
        ? `at thirty a homunculus stoops ${hu.toFixed(2)} and a human has not begun`
        : `!! THE CLOCK IS BEING READ IN YEARS (homunculus ${hu}, human ${ht})`;
    }

    /* ---------- 5. AND THE EYES ARE ACTUALLY LIT ---------- */
    clear();
    {
      const { e } = one();
      for (let i = 0; i < 30; i++) syncChars(1 / 30);
      const lum = (m) => (m.emissive.r + m.emissive.g + m.emissive.b) / 3;
      const live = e.glowMats.filter(m => lum(m) > 0.05).length;
      out.theEyesAreLit = live >= 2
        ? `${live} lit parts survive a second of frames — a homunculus's eyes are emissive again`
        : `!! THE EYES ARE STILL BEING BLACKED OUT BY THE FRAME LOOP (${live} of ${e.glowMats.length})`;
      clear();
    }
    return out;
  });

  const shot = await p.evaluate(async () => {
    const me = window.__spot;
    const png = [];
    const rows = [
      { cap: 'POURED FOR —   HAULER      LABOUR      RUNNER       CLERK      SOLDIER',
        set: ['hauler', 'labour', 'runner', 'clerk', 'soldier'].map(P => ({ P, age: 16 })) },
      { cap: 'ELEVEN YEARS —   16          22          26           30          34',
        set: [16, 22, 26, 30, 34].map(a => ({ P: 'labour', age: a })) },
    ];
    for (const row of rows) {
      chars.length = 0;
      charMeshes.forEach(e => { if (e.g && e.g.parent) e.g.parent.remove(e.g); });
      charMeshes.clear();
      document.querySelectorAll('.hud,#charpanel,#invpanel,#minimap,#log,#tip,#squadbar,#buildbar,#touchbar')
        .forEach(el => el.style.setProperty('display', 'none', 'important'));
      const made = [];
      /* the purpose is not settable directly — it is derived — so a body is poured over and
         over until the vat gives up the one this column is about. Honest: what is
         photographed is what the derivation actually produces. */
      row.set.forEach((r, j) => {
        let c = null;
        for (let k = 0; k < 400 && !c; k++) {
          const t = makeChar('V', 'player', me.x + (j - 2) * 1.15, me.y,
            { atk: 8, def: 8, tough: 8, race: 'homunculus', sex: 'm', age: r.age });
          t.state = 'ok'; t.dir = 0; t.weapon = null; t.armor = null;
          chars.push(t); syncChars(0.05);
          const e = charMeshes.get(t.id);
          if (e && e.purpose === r.P) c = t;
          else {
            chars.pop();
            if (e && e.g && e.g.parent) e.g.parent.remove(e.g);
            charMeshes.delete(t.id);
          }
        }
        if (c) made.push(c);
      });
      for (let i = 0; i < 12; i++) syncChars(0.05);
      const box = new THREE.Box3();
      for (const c of made) {
        const e = charMeshes.get(c.id);
        if (!e) continue;
        e.g.rotation.set(0, 0, 0); e.g.updateWorldMatrix(true, true);
        box.expandByObject(e.g);
      }
      const ctr = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3());
      const cam = camera.clone();
      cam.aspect = 2.9; cam.fov = 28;
      const back = Math.max(s.x, s.y * 2.9) * 1.06;
      cam.position.set(ctr.x, ctr.y + back * 0.16, ctr.z + back);
      cam.lookAt(ctr); cam.updateProjectionMatrix();
      const cv0 = renderer.domElement;
      const w0 = cv0.width, h0 = cv0.height, sw = cv0.style.width, sh = cv0.style.height;
      renderer.setSize(1300, 448, false);
      renderer.render(scene, cam);
      png.push(cv0.toDataURL('image/png').split(',')[1]);
      renderer.setSize(w0, h0, false);
      cv0.style.width = sw; cv0.style.height = sh;
    }
    const ims = await Promise.all(png.map(d => new Promise(res => {
      const im = new Image(); im.onload = () => res(im); im.src = 'data:image/png;base64,' + d;
    })));
    const L = 28;
    const cv = document.createElement('canvas');
    cv.width = ims[0].width; cv.height = (ims[0].height + L) * 2;
    const g = cv.getContext('2d');
    g.fillStyle = '#12100d'; g.fillRect(0, 0, cv.width, cv.height);
    ims.forEach((im, i) => {
      const y = i * (im.height + L);
      g.fillStyle = '#cfe8ff'; g.font = 'bold 16px monospace';
      g.fillText(rows[i].cap, 12, y + 20);
      g.drawImage(im, 0, y + L);
    });
    return cv.toDataURL('image/png').split(',')[1];
  });

  fs.writeFileSync(OUT, Buffer.from(shot, 'base64'));
  for (const [k, v] of Object.entries(R)) console.log('  ' + k.padEnd(26) + v);
  for (const e of errs) console.log('  PAGEERROR: ' + e);
  console.log('\n  ' + path.basename(OUT));
  const bad = Object.values(R).map(String).filter(v => v.startsWith('!!'));
  console.log('\n' + (bad.length || errs.length ? 'THE VAT IS TURNING OUT THE SAME THING' : 'POURED TO ORDER, AND ON THE CLOCK'));
  await b.close();
  process.exit(bad.length || errs.length ? 1 : 0);
})();
