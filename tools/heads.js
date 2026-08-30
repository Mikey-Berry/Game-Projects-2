#!/usr/bin/env node
/* THE SCULPTED HEADS, close enough to judge.
 *
 * `faces.js` frames whole bodies, which is right for "is the coat black and dusty" and
 * useless for "is the head on straight". A baked asset has four ways to be wrong and all of
 * them are invisible at body distance: scale, height on the neck, which way it faces, and
 * whether the box head underneath it was actually hidden. So this puts the camera on the
 * head, one row per person, front and three-quarter.
 *
 *   node tools/heads.js out.png [game.html]
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const gamePath = (a) => path.resolve(a ? (path.isAbsolute(a) ? a : path.join(__dirname, a)) : path.join(__dirname, 'game.html'));
const OUT = path.resolve(process.argv[2] || path.join(__dirname, 'heads.png'));
/* Czarina joined these when her model arrived; the count is read off the list now
   rather than written into the summary line, which said THREE for a while after it was four. */
const WHO = [
  { face: 'lyonart', label: "Lyonart d'Alagadda", race: 'human', sex: 'm', armor: 'a_lea' },
  { face: 'saga', label: 'Saga Wordsworth', race: 'hollow', sex: 'm', armor: 'a_pla' },
  { face: 'lyre', label: "Lyre d'Alagadda", race: 'human', sex: 'f', armor: 'a_lea' },
  { face: 'czarina', label: 'Czarina', race: 'hollow', sex: 'f', armor: 'a_pla' },
];

(async () => {
  const b = await chromium.launch({
    executablePath: process.env.DUSTWARD_CHROME || undefined,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'],
  });
  const p = await b.newPage({ viewport: { width: 900, height: 760 }, deviceScaleFactor: 2 });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message.slice(0, 200)));
  await p.goto('file://' + gamePath(process.argv[3]), { waitUntil: 'load' });
  await p.waitForTimeout(3000);
  /* START AND STOP IN THE SAME BREATH. A click followed by a wait lets the world run for
     however many frames the machine manages, which is not a fixed number and drops when a
     sixty-harness suite is loading the box — so every body is somewhere slightly different
     by the time this probe stages anything, and the numbers below inherit it. Measured on
     one unchanged build before this was applied here: flank.js gave 1.67 / 1.67 / 1.09 over
     three runs, and guns.js split three-to-two on an md5 that had not moved. Pausing inside
     the same evaluate leaves no frames at all between the two. Every file below sets
     `paused` for itself anyway; this only removes the window before its first statement. */
  await p.evaluate(() => { document.getElementById('btn-start').click(); paused = true; });
  await p.waitForTimeout(2000);

  const spot = await p.evaluate(() => {
    paused = true; syncPauseBtn(); hour = 11;
    debugSeeAll = true;
    if (typeof fogPlane !== 'undefined') fogPlane.visible = false;
    if (typeof syncDecorFogFull === 'function') syncDecorFogFull();
    const me = player()[0];
    for (const pad of [6, 4, 3]) {
      for (let r = 40; r < 240; r += 4) for (let a = 0; a < 24; a++) {
        const x = me.x + Math.cos(a / 24 * 6.283) * r, y = me.y + Math.sin(a / 24 * 6.283) * r;
        if (x < pad + 2 || y < pad + 2 || x >= self.W - pad - 2 || y >= self.H - pad - 2) continue;
        let ok = true;
        for (let dy = -pad; dy <= pad && ok; dy++) for (let dx = -pad; dx <= pad && ok; dx++) {
          const ix = Math.floor(x) + dx, iy = Math.floor(y) + dy;
          if (isBlocked(ix + 0.5, iy + 0.5, 0) || terr[iy * self.W + ix] === 3 || decorAt(ix, iy)) ok = false;
        }
        if (ok) return { x, y };
      }
    }
    return null;
  });
  if (!spot) { console.log('*** NO OPEN GROUND'); await b.close(); process.exitCode = 1; return; }
  /* counted before a single portrait is staged, because staging one empties the world */
  await p.evaluate(() => { window.__helmedAtBoot = chars.filter(c => helmOf(c)).length; });

  const rows = [];
  for (const w of WHO) {
    const shots = [];
    await p.evaluate(({ w, spot }) => {
      chars.length = 0;
      charMeshes.forEach(e => { if (e.g && e.g.parent) e.g.parent.remove(e.g); });
      charMeshes.clear();
      const c = makeChar(w.label, 'player', spot.x, spot.y,
        { atk: 14, def: 12, tough: 12, ath: 6, weapon: 'w_kat', armor: w.armor, race: w.race });
      c.face = w.face; c.sex = w.sex; c.dir = 0;
      if (w.face === 'saga' || w.face === 'czarina') c.hollowTier = 1;
      chars.push(c); window.__id = c.id;
      /* THE EYE GOES ON THE HEAD, NOT THE FEET. The camera always looks at ground level plus
         0.8 (`focusY`), and a head sits at about 1.95 — so a close camera framed the belt
         and the first run of this photographed three torsos. There is no look-at-height dial,
         so the body is dropped instead: sink it until the head is where the camera is
         already pointing. It is a portrait rig, not a change to the game. */
      window.__spot = spot;
      camX = camSX = spot.x; camY = camSY = spot.y;
      camDist = camDistTarget = 1.55; camPitch = camPitchT = 0.02;
      camYaw = camYawT = 0; camFollow = false; selected = [];
      document.querySelectorAll('.hud,#charpanel,#invpanel,#minimap,#log,#tip,#squadbar,#buildbar,#touchbar')
        .forEach(el => el.style.setProperty('display', 'none', 'important'));
    }, { w, spot });
    await p.waitForTimeout(3500);
    for (const yaw of [0, 0.95]) {
      /* ---------- A PORTRAIT CAMERA OF ITS OWN ----------
         The game's camera always looks at ground level plus 0.8, and there is no dial for
         that height — so a head at 1.6 projects to twelve pixels from the top of the frame
         whatever you do with distance or pitch, and three attempts at hand-picked crops all
         photographed the belt. Rather than bend the game's camera into a portrait rig, render
         ONE frame through a camera of our own, aimed at the head, and read the canvas back in
         the same tick before the loop composites over it. */
      const shot = await p.evaluate((yaw) => {
        const e = charMeshes.get(window.__id);
        e.rotY = yaw; e.g.rotation.set(0, yaw, 0);
        e.g.updateWorldMatrix(true, true);
        const bb = new THREE.Box3().setFromObject(e.sculptHead);
        const ctr = bb.getCenter(new THREE.Vector3());
        const r = Math.max(bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z);
        const cam = camera.clone();
        cam.aspect = 1; cam.fov = 32;
        const d = r * 2.4;
        cam.position.set(ctr.x, ctr.y + r * 0.10, ctr.z + d);
        cam.lookAt(ctr);
        cam.updateProjectionMatrix();
        const cv = renderer.domElement;
        const w0 = cv.width, h0 = cv.height, sw = cv.style.width, sh = cv.style.height;
        renderer.setSize(560, 560, false);
        renderer.render(scene, cam);
        const url = cv.toDataURL('image/png');
        renderer.setSize(w0, h0, false);
        cv.style.width = sw; cv.style.height = sh;
        return url.split(',')[1];
      }, yaw);
      shots.push(shot);
    }
    const state = await p.evaluate(() => {
      const e = charMeshes.get(window.__id);
      if (!e) return { ok: false, why: 'no mesh' };
      let sculpt = 0, boxes = 0;
      for (const ch of e.headG.children) {
        if (!ch.visible) continue;
        if (ch === e.sculptHead) sculpt += ch.geometry.index.count / 3;
        else boxes++;
      }
      const bb = e.sculptHead ? new THREE.Box3().setFromObject(e.sculptHead) : null;
      /* ---------- AND IT HAS TO BE THE SIZE OF A HEAD ----------
         This harness reported the sculpt's dimensions from the first day and never once
         compared them to anything, so three heads at sixty per cent of the size of everybody
         else's passed it cleanly for as long as they were wrong. A number nothing is measured
         AGAINST is not a check.
         The reference is a plain box head on a plain body, built here rather than remembered,
         because the thing being matched is whatever the rig currently produces. The first fit
         was sized against the head CUBE alone — but a box head is a cube with a hair slab on
         top and usually a beard below, and it is the whole assembly a player sees. */
      let ref = null;
      {
        const keep = chars.slice();
        chars.length = 0;
        const pm = makeChar('Ref', 'player', window.__spot.x, window.__spot.y, { sex: 'm' });
        pm.state = 'ok'; chars.push(pm);
        syncChars(0.05); syncChars(0.05);
        const pe = charMeshes.get(pm.id);
        if (pe) {
          const pb = new THREE.Box3();
          pe.headG.updateWorldMatrix(true, true);
          pe.headG.traverse(o => {
            if (!o.isMesh) return;
            let v = o.visible, q = o.parent; while (q && v) { v = q.visible; q = q.parent; }
            if (v) pb.expandByObject(o);
          });
          const pbb = new THREE.Box3().setFromObject(pe.g);
          ref = { h: pb.max.y - pb.min.y, body: pbb.max.y - pbb.min.y };
        }
        const pe2 = charMeshes.get(pm.id);
        if (pe2 && pe2.g && pe2.g.parent) pe2.g.parent.remove(pe2.g);
        charMeshes.delete(pm.id);
        chars.length = 0; for (const k of keep) chars.push(k);
      }
      let sized = 'no reference body';
      if (bb && ref) {
        const bodyBB = new THREE.Box3().setFromObject(e.g);
        const mine = (bb.max.y - bb.min.y) / (bodyBB.max.y - bodyBB.min.y);
        const theirs = ref.h / ref.body;
        const r = mine / theirs;
        /* Band, not a target: these are sculpted heads on a blocky rig and they will never
           match to the centimetre. The band has been TIGHTENED once. It first ran 0.70-1.15,
           written around a fit that deliberately sat short of parity — and it duly passed a
           set of heads that were reported from play as undersized twice. The fit is parity
           now and measures 0.95-1.04, so the floor comes up to where it can actually catch
           the thing that kept being wrong. */
        sized = r >= 0.88 && r <= 1.15
          ? `head is ${(mine * 100).toFixed(1)}% of body against a box head's ${(theirs * 100).toFixed(1)}%`
          : `!! THE HEAD IS THE WRONG SIZE — ${(mine * 100).toFixed(1)}% of body against a box head's ${(theirs * 100).toFixed(1)}% (${r.toFixed(2)}x)`;
      }
      return { ok: !!e.sculptHead, sculpt, boxes, sized, top: bb ? +bb.max.y.toFixed(2) : 0, bot: bb ? +bb.min.y.toFixed(2) : 0,
               wide: bb ? +(bb.max.x - bb.min.x).toFixed(2) : 0 };
    });
    rows.push({ w, shots, state });
    console.log(`  ${w.face.padEnd(9)} ${state.ok ? state.sculpt + ' tris' : '!! NO SCULPT'}` +
      `  ${state.boxes ? '!! ' + state.boxes + ' BOX PARTS STILL SHOWING' : 'box head hidden'}` +
      `  y ${state.bot}..${state.top}  w ${state.wide}`);
  }

  const payload = rows.map(r => ({ label: r.w.label, imgs: r.shots }));
  const sheet = await p.evaluate(async (payload) => {
    const all = await Promise.all(payload.map(r => Promise.all(r.imgs.map(d => new Promise(res => {
      const im = new Image(); im.onload = () => res(im); im.src = 'data:image/png;base64,' + d;
    })))));
    /* the computed crops are all different sizes, so each is letterboxed into one cell */
    const w = 380, h = 380, LBL = 30;
    const cv = document.createElement('canvas');
    cv.width = w * 2; cv.height = (h + LBL) * all.length;
    const g = cv.getContext('2d');
    g.fillStyle = '#12100d'; g.fillRect(0, 0, cv.width, cv.height);
    all.forEach((row, r) => {
      const top = r * (h + LBL);
      g.fillStyle = '#e8dcc4'; g.font = 'bold 19px monospace';
      g.fillText(payload[r].label, 10, top + 21);
      row.forEach((im, i) => {
        const k = Math.min(w / im.width, h / im.height);
        const dw = im.width * k, dh = im.height * k;
        g.drawImage(im, i * w + (w - dw) / 2, top + LBL + (h - dh) / 2, dw, dh);
        g.strokeStyle = '#3a342a'; g.strokeRect(i * w + 0.5, top + LBL + 0.5, w - 1, h - 1);
      });
    });
    return cv.toDataURL('image/png').split(',')[1];
  }, payload);
  fs.writeFileSync(OUT, Buffer.from(sheet, 'base64'));

  for (const r of rows) console.log(`  ${String(r.w.face).padEnd(9)} ${r.state.sized}`);

  /* ---------- AND THE FACE HAS TO BE AS SMOOTH AS THE ONE IT WAS ASKED TO MATCH ----------
     Reported of Lyre's second bake: "her face looks awful, like an old grandma with those
     heavy lines. Could you smooth it out to be more like Lyonart's face while keeping the red
     eyes intact?" That is a measurable complaint, and the sheet above cannot make it — a
     picture is judged by eye, and the eye is not in the suite.

     MEASURE THE FINE DETAIL, NOT THE CONTRAST. Global luminance spread is the obvious number
     and it is the wrong one: most of Lyre's spread is near-white hair against skin, which is
     large-scale shading that has to stay, and a sweep against it plateaued at 36.7 while the
     creases were still there. What a painted wrinkle is, precisely, is a vertex that sits far
     from the ones touching it — so that is what this reads.

     THE BOUND IS A RATIO, not a number, because the request was comparative. Lyonart is the
     reference face the note names; Lyre sits at 1.12x him today, and 1.6x is where "smoothed
     to look like his" stops being true. Saga and Czarina go through the same gate at 1.82x
     and 1.20x — Saga is a hollow with a deliberately blotched hide, so he is exempted BY NAME
     rather than by widening the bound until it stops catching anything.

     AND THE EYES SURVIVE IT. "Keeping the red eyes intact" is the half of the request a
     heavier smoothing pass would quietly take away: irises are 38 vertices out of 2,004, so
     bleeding them into the skin costs two per cent of the mesh and nothing else would notice.
     Counted here, in the shipped table, rather than trusted to the baker that made them. */
  const skin = await p.evaluate(() => {
    const stat = (k) => {
      const g = headGeo(k);
      const C = g.attributes.color.array, I = g.index.array, n = g.attributes.color.count;
      const adj = Array.from({ length: n }, () => []);
      for (let t = 0; t < I.length; t += 3) {
        const a = I[t], b = I[t + 1], c = I[t + 2];
        adj[a].push(b, c); adj[b].push(a, c); adj[c].push(a, b);
      }
      const L = v => 0.2126 * C[v * 3] + 0.7152 * C[v * 3 + 1] + 0.0722 * C[v * 3 + 2];
      const d = [];
      let red = 0;
      for (let v = 0; v < n; v++) {
        const r = C[v * 3], gg = C[v * 3 + 1], b = C[v * 3 + 2];
        if (r - Math.max(gg, b) > 0.16) red++;
        const a = adj[v]; if (!a.length) continue;
        let s = 0; for (const u of a) s += L(u);
        d.push(Math.abs(L(v) - s / a.length) * 255);
      }
      d.sort((x, y) => x - y);
      return { detail: d.reduce((x, y) => x + y, 0) / d.length, red };
    };
    const out = {};
    for (const k of ['lyonart', 'saga', 'lyre', 'czarina']) out[k] = stat(k);
    return out;
  });
  {
    const ref = skin.lyonart.detail;
    const rough = [];
    for (const k of Object.keys(skin)) {
      if (k === 'lyonart' || k === 'saga') continue;   /* the reference, and the blotched hollow */
      const r = skin[k].detail / ref;
      if (r > 1.6) rough.push(`${k} at ${r.toFixed(2)}x (${skin[k].detail.toFixed(1)} against ${ref.toFixed(1)})`);
    }
    console.log('  facesAreSmooth  ' + (rough.length
      ? '!! PAINTED LINES ARE BACK — ' + rough.join(', ')
      : 'lyre ' + (skin.lyre.detail / ref).toFixed(2) + 'x and czarina '
        + (skin.czarina.detail / ref).toFixed(2) + "x Lyonart's fine detail"));
    if (rough.length) process.exitCode = 1;
    console.log('  redEyesSurvive  ' + (skin.lyre.red >= 20
      ? `Lyre keeps ${skin.lyre.red} red vertices through the smoothing`
      : `!! THE SMOOTHING ATE LYRE'S EYES — ${skin.lyre.red} red vertices left`));
    if (skin.lyre.red < 20) process.exitCode = 1;
  }

  /* ---------- AND THE HELMETS ----------
     A helm goes on the same bone as an authored face and hides the same things, so it has the
     same four ways to be wrong — and one more: it is chosen by WHO SOMEBODY IS rather than by
     a field they carry, so the rule that picks it can quietly stop matching anybody and leave
     a feature that renders perfectly for nobody. */
  const helm = await p.evaluate(() => {
    const R = {};
    const at = player()[0];
    const mk = (setup) => {
      chars.length = 0;
      charMeshes.forEach(e => { if (e.g && e.g.parent) e.g.parent.remove(e.g); });
      charMeshes.clear();
      const c = makeChar('H', 'player', window.__spot.x, window.__spot.y, { atk: 10, def: 10, tough: 10 });
      setup(c); c.state = 'ok'; chars.push(c);
      for (let i = 0; i < 40; i++) syncChars(0.05);
      return { c, e: charMeshes.get(c.id) };
    };
    /* the rule itself, before any geometry */
    /* the keys are the creatures now rather than the bakes they used to name */
    R.whoWearsOne = (helmOf({ bossKey: 'sigil' }) === 'sigil'
                  && helmOf({ faction: 'redoubt', race: 'homunculus' }) === 'redoubt'
                  && !helmOf({ faction: 'town' })
                  && !helmOf({ faction: 'redoubt', race: 'homunculus', undead: true }))
      ? 'the Sigil-Bound and the redoubt soldiers, and nobody else'
      : '!! THE HELMET RULE PICKS THE WRONG PEOPLE';
    /* AND THE RULE STILL MATCHES SOMEBODY THE WORLD SPAWNS, counted at boot and carried here
       — the rows above empty `chars` for each portrait, so asking the live array at this point
       is asking about a world this harness has already deleted. The first version of this
       reported that nobody in the world wore a helmet, from a world containing nobody at all. */
    R.someoneOutThere = window.__helmedAtBoot > 0
      ? `${window.__helmedAtBoot} bodies in a fresh world are wearing one`
      : '!! NOBODY IN A FRESH WORLD MATCHES THE HELMET RULE';
    const bad = [];
    /* ---------- THE HELMS ARE BOXES NOW, AND THE CLAIMS MOVED WITH THEM ----------
       There is no `e.helm` any more: both helms are built out of `obox` and merged into the
       body's own buffers by `bakeBoxes`, so no separate helmet mesh survives to measure. The
       proxies keep the real transforms, so the span comes off `e.helmParts`.
       ONE CLAIM CHANGED IN KIND and is worth being explicit about. The baked helm REPLACED the
       box head — everything under it was hidden. A built one COVERS it instead, which is what
       a helmet does and what makes the neck read properly, so "nothing shows through" is now
       the wrong question and "does it enclose the skull" is the right one. */
    for (const [lbl, setup] of [['sigil', c => { c.bossKey = 'sigil'; c.big = 1.35; c.construct = true; }],
                                ['redoubt', c => { c.faction = 'redoubt'; c.race = 'homunculus'; }]]) {
      const { c, e } = mk(setup);
      if (!e || !e.helmParts || !e.helmParts.length) { bad.push(lbl + ' HAS NO HELMET BUILT'); continue; }
      const box = new THREE.Box3();
      for (const o of e.helmParts) {
        const h = new THREE.Vector3(o.scale.x / 2, o.scale.y / 2, o.scale.z / 2);
        box.expandByPoint(new THREE.Vector3().copy(o.position).sub(h));
        box.expandByPoint(new THREE.Vector3().copy(o.position).add(h));
      }
      /* it has to swallow the skull, or the head pokes out of its own helmet */
      if (e.head) {
        const hh = new THREE.Vector3(e.head.scale.x / 2, e.head.scale.y / 2, e.head.scale.z / 2);
        const hi = new THREE.Vector3().copy(e.head.position).sub(hh);
        const ha = new THREE.Vector3().copy(e.head.position).add(hh);
        const covers = box.min.x <= hi.x + 0.01 && box.max.x >= ha.x - 0.01
                    && box.min.y <= hi.y + 0.01 && box.max.y >= ha.y - 0.01;
        if (!covers) bad.push(`THE ${lbl.toUpperCase()} HELM DOES NOT ENCLOSE THE SKULL`);
      }
      /* head-sized, measured against the body on the same rig rather than against a number */
      e.g.updateWorldMatrix(true, true);
      const bb = new THREE.Box3().setFromObject(e.g);
      const scl = new THREE.Vector3(); e.g.getWorldScale(scl);
      const ratio = ((box.max.y - box.min.y) * scl.y) / (bb.max.y - bb.min.y);
      if (!(ratio > 0.10 && ratio < 0.42)) bad.push(`${lbl} IS ${(ratio * 100).toFixed(0)}% OF THE BODY`);
    }
    R.helmetsFit = bad.length ? '!! ' + bad.join('; ') : 'both helms enclose the box head and are head-sized';
    /* ONE GEOMETRY FOR EVERY WEARER — a redoubt garrison is a dozen of them */
    {
      chars.length = 0;
      charMeshes.forEach(e => { if (e.g && e.g.parent) e.g.parent.remove(e.g); });
      charMeshes.clear();
      const born = [];
      for (let i = 0; i < 3; i++) {
        const c = makeChar('S' + i, 'redoubt', window.__spot.x + i * 0.6, window.__spot.y, { atk: 10, def: 10, tough: 10 });
        c.race = 'homunculus'; c.state = 'ok'; chars.push(c); born.push(c);
      }
      for (let i = 0; i < 40; i++) syncChars(0.05);
      /* THE OLD CLAIM WAS "one geometry shared by the garrison", which was about a baked mesh
         being cached rather than re-imported per body. A built helm cannot have that fault: it
         is boxes, merged into each body's own buffers, so there is no helmet geometry to
         duplicate in the first place. What is still worth pinning is that every soldier gets
         the SAME helmet — a per-body roll would show up here as differing part counts. */
      const counts = new Set(), missing = [];
      for (const c of born) {
        const e = charMeshes.get(c.id);
        if (!e || !e.helmParts) { missing.push(c.name); continue; }
        counts.add(e.helmParts.length);
        if (e.helm) missing.push(c.name + ' STILL HAS A BAKED HELM MESH');
      }
      R.oneHelmet = (!missing.length && counts.size === 1)
        ? `and a garrison of ${born.length} all get the same ${[...counts][0]}-box helm, merged into their own buffers`
        : `!! GARRISON HELMS DISAGREE (counts ${[...counts].join('/') || 'none'}${missing.length ? '; ' + missing.join(', ') : ''})`;
    }
    return R;
  }).catch(e => ({ helmBlock: '!! THREW: ' + String(e).slice(0, 140) }));
  for (const [k, v] of Object.entries(helm)) console.log('  ' + k.padEnd(16) + v);
  const helmBad = Object.values(helm).map(String).filter(v => v.startsWith('!!'));
  const bad = rows.filter(r => !r.state.ok || r.state.boxes || String(r.state.sized).startsWith('!!'));
  if (helmBad.length) { console.log('\n*** ' + helmBad.join('\n*** ')); process.exitCode = 1; }
  console.log(`\n${path.basename(OUT)} — ` + (bad.length ? '*** ' + bad.map(r => r.w.face).join(', ') + ' WRONG'
    : WHO.length + ' SCULPTED HEADS AND TWO HELMS, AND NOTHING LEFT OF THE BOXES'));
  if (errs.length) { console.log('errs:', errs.length); errs.slice(0, 3).forEach(e => console.log('  ' + e)); }
  await b.close();
  if (bad.length) process.exitCode = 1;
})();
