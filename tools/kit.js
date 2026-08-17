#!/usr/bin/env node
/* THE AUTHORED KIT, LOOKED AT.
 *
 * Three things arrived as GLBs or as numbers in a fit table, and not one of them can be
 * checked with an assertion. "The lance is the size of a pen", "the helmet looks awful",
 * "use his own head when he ascends" — every one of those is a judgement about a picture, so
 * this renders the pictures. `faces.js` already does this for the four named origins; this is
 * the same idea for the three that came later, and it exists so a fit number can be found in
 * one browser session instead of one rebuild of a 1.8 MB file per guess.
 *
 *   node tools/kit.js [outdir] [game.html]
 *   node tools/kit.js . game.html '{"w_lance":{"s":2.4,"y":-0.2}}'
 *
 * The override is applied to WEPFIT/HEADFIT/HELMFIT by table, so one run can move a head and
 * a weapon at once without touching the source.
 *
 * Writes three sheets:
 *   kit-ascend.png  Lyonart living and ascended, front and back — the coat must survive and
 *                   only the head change.
 *   kit-helm.png    The redoubt helm against a bare box head, a named sculpt and the runic
 *                   helm, because "blends with the other heads" is a comparison and cannot be
 *                   judged from the helmet alone.
 *   kit-lance.png   The Aether Lance carried and levelled, beside a nodachi for length.
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const OUTDIR = path.resolve(process.argv[2] || __dirname);
const gamePath = (a) => path.resolve(a ? (path.isAbsolute(a) ? a : path.join(__dirname, a)) : path.join(__dirname, 'game.html'));
const OVERRIDE = process.argv[4] ? JSON.parse(process.argv[4]) : null;

(async () => {
  const b = await chromium.launch({
    executablePath: process.env.DUSTWARD_CHROME || undefined,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'],
  });
  const p = await b.newPage({ viewport: { width: 1400, height: 720 }, deviceScaleFactor: 2 });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message.slice(0, 200)));
  await p.goto('file://' + gamePath(process.argv[3]), { waitUntil: 'load' });
  await p.waitForTimeout(3000);
  await p.evaluate(() => document.getElementById('btn-start').click());
  await p.waitForTimeout(2500);

  /* one open patch of ground, found once and reused for all three sheets */
  const ground = await p.evaluate((OVERRIDE) => {
    paused = true; syncPauseBtn(); hour = 11;
    debugSeeAll = true;
    if (typeof fogPlane !== 'undefined') fogPlane.visible = false;
    if (typeof syncDecorFogFull === 'function') syncDecorFogFull();
    if (OVERRIDE) for (const [k, v] of Object.entries(OVERRIDE)) {
      for (const T of [typeof WEPFIT !== 'undefined' && WEPFIT, typeof HEADFIT !== 'undefined' && HEADFIT,
                       typeof HELMFIT !== 'undefined' && HELMFIT]) if (T && T[k]) Object.assign(T[k], v);
    }
    document.querySelectorAll('.hud,#charpanel,#invpanel,#minimap,#log,#tip,#squadbar,#buildbar,#touchbar')
      .forEach(el => el.style.setProperty('display', 'none', 'important'));
    const me = player()[0];
    for (const pad of [7, 5, 4]) {
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
  }, OVERRIDE);
  if (!ground) { console.log('*** NO OPEN GROUND ANYWHERE'); await b.close(); process.exitCode = 1; return; }

  /* Build a row of bodies from a spec, wait for syncChars to make the geometry, freeze the
     facings, shoot it. syncChars builds a bounded number of rigs per frame, so the world is
     cleared first and then given real time — a probe that shoots too early photographs an
     empty field and calls the model missing. */
  const sheet = async (name, rows, cam) => {
    const info = await p.evaluate(({ rows, ground, cam }) => {
      chars.length = 0;
      charMeshes.forEach(e => { if (e.g && e.g.parent) e.g.parent.remove(e.g); });
      charMeshes.clear();
      const ids = [];
      rows.forEach((r, i) => {
        const c = makeChar(r.name || 'Body ' + i, r.faction || 'player',
          ground.x + (i - (rows.length - 1) / 2) * (cam.gap || 1.5), ground.y,
          { atk: 14, def: 12, tough: 12, ath: 6, weapon: r.weapon || null, armor: r.armor || null,
            race: r.race || 'human' });
        Object.assign(c, r.set || {});
        c.dir = 0;
        chars.push(c); ids.push({ id: c.id, back: !!r.back, aim: !!r.aim, side: r.side || 0 });
      });
      /* the thing they are aiming at: far enough out to be off camera, alive enough to be a
         legal target (`state === 'ok'` is what the facing code checks) */
      if (rows.some(r => r.aim)) {
        const mk = makeChar('mark', 'bandit', ground.x + 40, ground.y,
          { atk: 1, def: 1, tough: 1, ath: 1 });
        chars.push(mk); window.__mark = mk;
      } else window.__mark = null;
      window.__ids = ids;
      camX = camSX = ground.x; camY = camSY = ground.y;
      camDist = camDistTarget = cam.dist; camPitch = camPitchT = cam.pitch;
      camYaw = camYawT = 0.0; camFollow = false; selected = [];
      return ids.length;
    }, { rows, ground, cam });

    await p.waitForTimeout(4000);
    const built = await p.evaluate(() => {
      /* Drive the real animator to the pose we want to photograph rather than posing the rig
         by hand: `aim` sets the sim state a firing body is actually in, and then the frames
         below let syncChars carry aimK from carry to level exactly as it would in play. */
      for (const r of window.__ids) {
        const c = chars.find(x => x.id === r.id), e = charMeshes.get(r.id);
        if (!c) continue;
        /* A BODY FACES WHAT IT IS SHOOTING AT. `want` comes from atan2 on the target, so the
           first version of this — which set `c.target = c` just to trip the firing state —
           pinned every aiming body to atan2(0,0) = 0 and photographed the levelled lance
           end-on, which is a dot. The mark stands well off to one side and out of frame, so
           the body turns across the camera on its own and the pose is seen in profile. */
        if (r.aim) {
          c.windup = { kind: 'ranged', t: 0.28, dur: 0.55 };
          c.target = window.__mark;
        }
        if (e) { e.rotY = r.side ? r.side * Math.PI / 2 : (r.back ? Math.PI : 0); e.g.rotation.set(0, e.rotY, 0); }
      }
      for (let i = 0; i < 60; i++) syncChars(1 / 30);
      for (const r of window.__ids) {
        const e = charMeshes.get(r.id);
        if (e && !r.aim) { e.rotY = r.side ? r.side * Math.PI / 2 : (r.back ? Math.PI : 0); e.g.rotation.set(0, e.rotY, 0); }
      }
      return window.__ids.filter(r => charMeshes.has(r.id)).length;
    });
    await p.waitForTimeout(500);
    const out = path.join(OUTDIR, name);
    /* A helmet is judged at head scale. The camera cannot get closer without losing the row,
       so the SHOT is cropped rather than the camera moved — `clip` is in CSS pixels of the
       viewport, and it keeps every body in the same frame while filling it with heads. */
    await p.screenshot(cam.clip ? { path: out, clip: cam.clip } : { path: out });
    console.log(`  ${name.padEnd(18)} ${built}/${info} bodies` + (built < info ? '  *** GEOMETRY MISSING ***' : ''));
  };

  console.log('=== THE AUTHORED KIT ===\n');

  /* ---- 1. THE ASCENSION. The claim is that everything below the collar survives it. ---- */
  await sheet('kit-ascend.png', [
    { name: "Lyonart", weapon: 'w_kat', armor: 'a_lea', set: { face: 'lyonart' } },
    { name: "Lyonart", weapon: 'w_kat', armor: 'a_lea', set: { face: 'lyonart' }, back: true },
    { name: "Lyonart Ascended", weapon: 'w_kat', armor: 'a_lea', set: { face: 'lyonart', lich: true, undead: true } },
    { name: "Lyonart Ascended", weapon: 'w_kat', armor: 'a_lea', set: { face: 'lyonart', lich: true, undead: true }, back: true },
    /* the robed lich beside him, because the whole point is that he is NOT this */
    { name: "A Deathless", weapon: 'w_kat', set: { lich: true, undead: true } },
  ], { dist: 4.6, pitch: 0.10, gap: 1.15 });

  /* ---- 2. THE HELM, against the heads it has to sit among ---- */
  const helmRow = [
    { name: 'Redoubt', faction: 'redoubt', race: 'homunculus', weapon: 'w_lance', armor: 'a_carap' },
    { name: 'Bare head', weapon: 'w_kat', armor: 'a_pla' },
    { name: 'Redoubt', faction: 'redoubt', race: 'homunculus', weapon: 'w_lance', armor: 'a_carap' },
    { name: 'A sculpt', weapon: 'w_kat', armor: 'a_lea', set: { face: 'lyonart' } },
    { name: 'Redoubt', faction: 'redoubt', race: 'homunculus', weapon: 'w_lance', armor: 'a_carap', back: true },
  ];
  await sheet('kit-helm.png', helmRow, { dist: 4.4, pitch: 0.10, gap: 1.15 });
  /* the same row again, cropped to the heads, because "blends with the other heads" is a
     judgement about a band 200 pixels tall and the full body shot cannot show it */
  await sheet('kit-helm-close.png', helmRow,
    { dist: 3.0, pitch: 0.06, gap: 0.95, clip: { x: 0, y: 40, width: 1400, height: 260 } });

  /* ---- 3. THE LANCE, carried and levelled, with a nodachi for scale ---- */
  await sheet('kit-lance.png', [
    { name: 'Carried', weapon: 'w_lance', armor: 'a_carap' },
    { name: 'Carried', weapon: 'w_lance', armor: 'a_carap', side: 1 },
    /* SIDE ON. A lance levelled down range and photographed from down range is a dot — the
       first version of this sheet showed the aim pose end-on and told me nothing. */
    { name: 'Levelled', weapon: 'w_lance', armor: 'a_carap', aim: true },
    { name: 'Levelled', weapon: 'w_lance', armor: 'a_carap', aim: true },
    { name: 'Nodachi', weapon: 'w_nod', armor: 'a_pla' },
    { name: 'Sundering Edge', weapon: 'w_sever', armor: 'a_pla' },
  ], { dist: 6.2, pitch: 0.06, gap: 1.35 });

  /* ---------- AND THE PART THAT IS NOT A JUDGEMENT ----------
     The sheets above are for a person to look at. These are the claims underneath them that
     a machine can hold: the lance actually changes pose, the helm is actually square, and the
     ascension actually keeps the body. Every one of them was a bug at some point in getting
     here, and none would have shown up in any other harness. */
  const R = await p.evaluate((ground) => {
    const out = {};
    const span = (o) => { const bb = new THREE.Box3(); o.updateWorldMatrix(true, true); bb.expandByObject(o); return bb; };
    /* `ground`, not `player()[0]` — the sheets above emptied `chars`, and the first version of
       this read a position off a squad that no longer existed */
    const mk = (setup) => {
      chars.length = 0; charMeshes.forEach(e => e.g && e.g.parent && e.g.parent.remove(e.g)); charMeshes.clear();
      const c = makeChar('probe', setup.faction || 'player', ground.x, ground.y,
        { atk: 10, def: 10, tough: 10, ath: 6, weapon: setup.weapon || null, race: setup.race || 'human' });
      Object.assign(c, setup.set || {});
      chars.push(c);
      let mark = null;
      if (setup.aim) {
        mark = makeChar('mark', 'bandit', ground.x + 40, ground.y, { atk: 1, def: 1, tough: 1, ath: 1 });
        chars.push(mark);
        c.windup = { kind: 'ranged', t: 0.28, dur: 0.55 }; c.target = mark;
      }
      for (let i = 0; i < 90; i++) syncChars(1 / 30);
      return { c, e: charMeshes.get(c.id) };
    };
    /* the weapon's long axis in WORLD space — the model runs down its own +Z */
    const aimDir = (e) => {
      const q = new THREE.Quaternion(); e.weapon.getWorldQuaternion(q);
      return new THREE.Vector3(0, 0, 1).applyQuaternion(q);
    };

    /* ---- THE LANCE IS NOT A PEN ---- */
    {
      const { c, e } = mk({ weapon: 'w_lance' });
      const s = new THREE.Vector3(); e.g.getWorldScale(s);
      const bb = span(e.weapon), body = span(e.g);
      const len = Math.max(bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z) / s.y;
      const bodyH = (body.max.y - body.min.y) / s.y;
      out.lanceReaches = len > bodyH * 0.85
        ? `the lance is ${len.toFixed(2)} against a ${bodyH.toFixed(2)} body — it out-reaches its wielder`
        : `!! THE LANCE IS ${len.toFixed(2)} AGAINST A ${bodyH.toFixed(2)} BODY — STILL A PEN`;
      /* and longer than the longest sword, or "lance" is a lie */
      const nod = mk({ weapon: 'w_nod' });
      const ns = new THREE.Vector3(); nod.e.g.getWorldScale(ns);
      const nb = span(nod.e.weapon);
      const nlen = Math.max(nb.max.x - nb.min.x, nb.max.y - nb.min.y, nb.max.z - nb.min.z) / ns.y;
      out.lanceOutreaches = len > nlen * 1.4
        ? `and ${(len / nlen).toFixed(1)}x a nodachi's ${nlen.toFixed(2)}`
        : `!! A LANCE AT ${len.toFixed(2)} BARELY BEATS A NODACHI AT ${nlen.toFixed(2)}`;
    }
    /* ---- AND IT IS CARRIED ONE WAY AND FIRED ANOTHER ---- */
    {
      const carried = mk({ weapon: 'w_lance' });
      const cd = aimDir(carried.e), ck = carried.e.aimK || 0;
      out.lanceCarried = (cd.y > 0.9 && ck < 0.2)
        ? `carried, it stands upright — dir.y ${cd.y.toFixed(2)}, aimK ${ck.toFixed(2)}`
        : `!! A CARRIED LANCE POINTS (${cd.x.toFixed(2)},${cd.y.toFixed(2)},${cd.z.toFixed(2)}) WITH aimK ${ck.toFixed(2)}`;
      const level = mk({ weapon: 'w_lance', aim: true });
      const ld = aimDir(level.e), lk = level.e.aimK || 0;
      out.lanceLevelled = (Math.abs(ld.y) < 0.22 && lk > 0.8)
        ? `firing, it comes level — dir.y ${ld.y.toFixed(2)}, aimK ${lk.toFixed(2)}`
        : `!! A FIRING LANCE POINTS (${ld.x.toFixed(2)},${ld.y.toFixed(2)},${ld.z.toFixed(2)}) WITH aimK ${lk.toFixed(2)}`;
      out.lanceTwoPoses = (cd.y - Math.abs(ld.y) > 0.6)
        ? 'the two poses are genuinely different, not one pose twice'
        : '!! THE CARRY AND THE LEVEL ARE THE SAME POSE';
      /* a sword must not have acquired a second pose along with it */
      const sw = mk({ weapon: 'w_nod' });
      out.swordUnaffected = (!sw.e.wepAim && !sw.e.wepRest)
        ? 'and nothing else in the rack grew an aim pose'
        : '!! A NODACHI HAS AN AIM POSE';
    }
    /* ---- THE HELM IS SQUARE, AND THE SIZE OF A HEAD ---- */
    {
      const { e } = mk({ faction: 'redoubt', race: 'homunculus' });
      if (!e || !e.helm) out.helm = '!! NO HELM BUILT ON A REDOUBT HOMUNCULUS';
      else {
        const s = new THREE.Vector3(); e.g.getWorldScale(s);
        const bb = span(e.helm);
        const w = (bb.max.x - bb.min.x) / s.x, h = (bb.max.y - bb.min.y) / s.y, d = (bb.max.z - bb.min.z) / s.z;
        /* the model is 0.71 x 0.77 x 1.00 in its own box, so a UNIFORM scale lands it half
           again as deep as it is wide. That is the bug this guards. */
        out.helmSquare = Math.abs(w - d) < 0.06
          ? `the helm is ${w.toFixed(3)} wide by ${d.toFixed(3)} deep — square enough to be a head`
          : `!! THE HELM IS ${w.toFixed(3)} WIDE AND ${d.toFixed(3)} DEEP — IT IS A SNOUT AGAIN`;
        /* a box head cube is about 0.31; a helm goes OVER one, so it must not be smaller */
        out.helmSized = (w > 0.31 && w < 0.40 && h > 0.31 && h < 0.42)
          ? `and ${w.toFixed(3)} x ${h.toFixed(3)}, which sits over a 0.31 box head`
          : `!! THE HELM IS ${w.toFixed(3)} x ${h.toFixed(3)} AGAINST A 0.31 HEAD`;
      }
    }
    /* ---- HE ASCENDS WITHOUT LOSING HIS COAT ----
       Guarded rather than assumed: run against a build that predates this and the whole
       evaluate would die on a ReferenceError, which reports as a crashed harness instead of
       as the missing feature it actually is. */
    if (typeof headKeyOf !== 'function' || typeof LICHFACE === 'undefined') {
      out.ascendedHead = '!! THIS BUILD HAS NO NAMED-LICH HEAD MACHINERY AT ALL';
    } else {
      const living = mk({ set: { face: 'lyonart' } });
      const risen = mk({ set: { face: 'lyonart', lich: true, undead: true } });
      out.ascendedHead = (risen.e && risen.e.sculptHead && headKeyOf(risen.c) === 'lyonlich')
        ? `ascended, he wears his own ${headKeyOf(risen.c)} head`
        : `!! THE ASCENDED HEAD IS ${risen.e && risen.e.sculptHead ? headKeyOf(risen.c) : 'MISSING'}`;
      out.headChanges = headKeyOf(living.c) === 'lyonart' && headKeyOf(risen.c) !== headKeyOf(living.c)
        ? 'and it is not the head he had' : '!! THE RITE DID NOT CHANGE HIS HEAD';
      const legs = (risen.e.boxLeg || []).some(m => m.visible);
      const torso = risen.e.torso && risen.e.torso.visible;
      out.keepsHisCoat = (legs && torso)
        ? 'the body under it is the one he always had — legs and torso still standing'
        : `!! THE ASCENSION STRIPPED HIS BODY (legs ${legs}, torso ${torso})`;
      out.notRobed = !risen.e.lich && !risen.e.authored && !risen.e.hood
        ? 'and he is not wearing the Deathless robe'
        : '!! A NAMED LICH GOT THE STANDARD ROBE ANYWAY';
      /* the rig is cached by colorKeyOf, so if the key does not move, a Lyonart already on
         screen keeps his living head straight through the rite */
      out.rigRebuilds = colorKeyOf(living.c) !== colorKeyOf(risen.c)
        ? 'and the mesh key moves, so a body already on screen is rebuilt'
        : '!! THE MESH KEY IS UNCHANGED — HE WOULD ASCEND AND LOOK IDENTICAL';
    }
    /* ---- AND A NAMELESS ONE IS STILL THE DEATHLESS ---- */
    {
      const { e } = mk({ set: { lich: true, undead: true } });
      const legs = (e.boxLeg || []).some(m => m.visible);
      out.robedLichIntact = (e.lich && e.authored && e.hood && !legs)
        ? 'a lich with no name of its own still arrives in the robe, with no legs under it'
        : `!! THE ORDINARY LICH BROKE (robe ${!!e.lich}, hood ${!!e.hood}, legs ${legs})`;
    }
    return out;
  }, ground);
  console.log('');
  for (const [k, v] of Object.entries(R)) console.log('  ' + k.padEnd(18) + v);
  const bad = Object.values(R).map(String).filter(v => v.startsWith('!!'));
  console.log('\n' + (bad.length ? '*** ' + bad.join('\n*** ')
    : 'HE KEEPS HIS COAT, THE HELM IS A HEAD, AND THE LANCE COMES UP TO FIRE'));
  if (bad.length) process.exitCode = 1;
  if (errs.length) { console.log('\nerrs:', errs.length); errs.slice(0, 4).forEach(e => console.log('  ' + e)); }
  await b.close();
})();
