#!/usr/bin/env node
/* DETAIL BY DISTANCE, AND A HOST DRAWN AS ONE.
 *
 * "Performance (on a desktop PC) is great… early game. Later on, it starts to crater."
 * Ruled 2026-09-27: try detail by distance, and batching identical undead.
 *
 * Staged: a necromancer's host of forty Old Bones, a squad of eight, and twenty townsfolk, all
 * in front of the camera. The same frame is drawn with both switches off and on, at three
 * zooms, and the draw calls counted — the one number the per-draw cost follows. Then:
 *
 *   1. at the default zoom the calls fall, and at every zoom they fall further with both on
 *   2. close in, every body is whole: nothing is thinned for a body the height of the screen
 *   3. zoomed right out, bodies are one shape each, and the host is not batched (it is shapes)
 *   4. the host is batched at the default zoom — one instanced mesh per part, not per body
 *   5. a member just hit leaves the batch for its flash, and comes back after
 *   6. what the rig itself hides stays hidden: a bone with an arm off is drawn with no arm,
 *      batched or not, and a body's own parts come back when the switches go off
 *   7. what it looks like: the same frame, off and on, side by side (lod.png)
 *   8. both are switches in Options, to be judged against the frame-time overlay in real play
 *
 * Anything starting '!!' fails the build.
 *
 *   node tools/lod.js [out.png] [game.html]
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const OUT = path.resolve(process.argv[2] || path.join(__dirname, 'lod.png'));
const gamePath = (a) => path.resolve(a ? (path.isAbsolute(a) ? a : path.join(__dirname, a)) : path.join(__dirname, 'game.html'));

(async () => {
  const b = await chromium.launch({
    executablePath: process.env.DUSTWARD_CHROME || undefined,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'],
  });
  const p = await b.newPage({ viewport: { width: 1200, height: 800 } });
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message.slice(0, 200)));
  await p.goto('file://' + gamePath(process.argv[3]), { waitUntil: 'load', timeout: 90000 });
  await p.waitForSelector('#btn-start', { state: 'attached', timeout: 60000 });
  await p.evaluate(() => document.getElementById('btn-start').click());
  await p.waitForTimeout(2600);

  const res = await p.evaluate(() => {
    paused = true;
    const L = [], bad = (m) => L.push('!! ' + m), ok = (m) => L.push('   ' + m);
    if (typeof LOD_ON === 'undefined' || typeof BATCH_ON === 'undefined') { bad('no LOD_ON / BATCH_ON'); return {L}; }
    for (const el of ['log', 'squadbar', 'topbar', 'minimap', 'charpanel', 'invpanel']) { const q = document.getElementById(el); if (q) q.style.display = 'none'; }
    /* open ground: the start's own plain is crowded with town, so walk out until a 40x40 is clear */
    const me = player()[0];
    let gx = null, gy = null;
    outer: for (let r = 60; r < 600; r += 20) for (let a = 0; a < 16; a++) {
      const x = Math.round(me.x + Math.cos(a / 16 * Math.PI * 2) * r), y = Math.round(me.y + Math.sin(a / 16 * Math.PI * 2) * r);
      let clear = true;
      for (let j = -22; j <= 22 && clear; j += 2) for (let i = -22; i <= 22 && clear; i += 2) if (isBlocked(x + i, y + j) || tileAt(x + i, y + j) === 3) clear = false;
      if (clear && !towns.some(t => dist(t.x, t.y, x, y) < 60)) { gx = x; gy = y; break outer; }
    }
    if (gx === null) { bad('no open ground to stage on'); return {L}; }
    /* nobody else near the stage */
    for (const c of chars) if (dist(c.x, c.y, gx, gy) < 70 && c.faction !== 'player') { c.x += 200; c.y += 200; }
    const host = [], squad = [], folk = [];
    for (const c of player()) { c.x = gx + 30; c.y = gy + 30; }
    const lead = player()[0]; lead.x = gx; lead.y = gy + 8;
    for (let i = 0; i < 40; i++) {
      const c = makeChar('Old Bones ' + i, 'player', gx - 10 + (i % 8) * 2.4, gy - 6 + Math.floor(i / 8) * 2.4, {atk: 10, def: 10, tough: 10, ath: 6});
      c.undead = true; c.rot = 'bones'; c.minded = false; c.guardTarget = null; chars.push(c); host.push(c);
    }
    for (let i = 0; i < 8; i++) { const c = makeChar('Squad ' + i, 'player', gx + 10 + (i % 4) * 2, gy + 4 + Math.floor(i / 4) * 2, {atk: 20, def: 20, tough: 20, weapon: 'w_kat', armor: 'a_lea'}); chars.push(c); squad.push(c); }
    for (let i = 0; i < 20; i++) { const c = makeChar('Folk ' + i, 'drifter', gx - 14 + (i % 10) * 3, gy + 10 + Math.floor(i / 10) * 3, {atk: 8, def: 8, tough: 8}); c.neutral = true; chars.push(c); folk.push(c); }
    for (const c of [...host, ...squad, ...folk]) { c.state = 'ok'; c.moveTarget = null; }
    charEpoch++; rebuildCharGrid();
    /* the party's own sight, not see-all: with the whole world visible, the eight rigs a frame
       the renderer builds go to two thousand bodies nobody is looking at before these */
    computeVision(); fogDirty = true;
    camFollow = false; selected = [];
    const view = (dst) => { camX = camSX = gx; camY = camSY = gy; camDist = camDistTarget = dst; camPitch = camPitchT = 0.9; camYaw = camYawT = 0; };
    const frame = () => {
      /* several frames: rigs are built at most eight a frame, and a batch forms on the frame after */
      for (let i = 0; i < 12; i++) render();
      render();
      return renderer.info.render.calls;
    };
    const set = (lod, bat) => { LOD_ON = lod; BATCH_ON = bat; };
    const R = {};
    for (const [name, dst] of [['close', 11], ['default', 28], ['far', 85]]) {
      view(dst);
      set(false, false); const off = frame();
      set(true, false); const lodOnly = frame();
      set(false, true); const batOnly = frame();
      set(true, true); const both = frame();
      const tm = (lod, bat) => { set(lod, bat); frame(); const t0 = performance.now(); for (let i = 0; i < 10; i++) render(); return (performance.now() - t0) / 10; };
      const msOff = tm(false, false), msOn = tm(true, true);
      const levels = [0, 0, 0]; for (const c of [...host, ...squad, ...folk]) { const e = charMeshes.get(c.id); if (e && e.lod >= 0) levels[e.lod]++; }
      const batched = host.filter(c => charMeshes.get(c.id) && charMeshes.get(c.id).batched).length;
      R[name] = {off, lodOnly, batOnly, both, levels, batched};
      ok(`${name.padEnd(8)} (zoom ${dst}): calls ${off} off · ${lodOnly} detail only · ${batOnly} batch only · ${both} both; bodies whole/thinned/shape ${levels.join('/')}; ${batched}/40 bones batched; a frame ${msOff.toFixed(0)} → ${msOn.toFixed(0)} ms (software GL)`);
    }
    /* 1 */
    if (!(R.default.both < R.default.off * 0.6)) bad(`1. at the default zoom both together only took the calls from ${R.default.off} to ${R.default.both}`);
    for (const k of ['close', 'default', 'far']) if (R[k].both > R[k].off) bad(`1. ${k}: more calls with it on (${R[k].both}) than off (${R[k].off})`);
    /* 2 */
    view(11); set(true, false); frame();
    const near = [...host, ...squad, ...folk].filter(c => { const e = charMeshes.get(c.id); if (!e) return false; const d = camera.position.distanceTo(e.g.position); return d < 16; });
    const thinnedNear = near.filter(c => charMeshes.get(c.id).lod !== 0);
    if (!near.length) bad('2. nobody within sixteen of the camera close in');
    else if (thinnedNear.length) bad(`2. close in, ${thinnedNear.length} of ${near.length} bodies near the camera are thinned`);
    else ok(`2. close in: all ${near.length} bodies within sixteen of the camera are whole`);
    /* 3 */
    view(85); set(true, true); frame();
    const far = [...host, ...squad, ...folk].filter(c => charMeshes.get(c.id));
    const shapes = far.filter(c => charMeshes.get(c.id).lod === 2 && charMeshes.get(c.id).imp && charMeshes.get(c.id).imp.layers.mask === 1);
    if (shapes.length < far.length * 0.8) bad(`3. zoomed out, ${shapes.length} of ${far.length} are one shape`);
    else if (host.some(c => charMeshes.get(c.id) && charMeshes.get(c.id).batched)) bad('3. zoomed out, the host is batched as well as being shapes');
    else ok(`3. zoomed out: ${shapes.length} of ${far.length} are one shape, and the host is not batched`);
    /* 4 */
    view(28); set(true, true); frame();
    const bs = [..._batches.values()];
    const hostBatch = bs.find(B => host.some(c => charMeshes.get(c.id) === B.tpl));
    if (!hostBatch) bad('4. no batch for the host at the default zoom');
    else ok(`4. the host is ${hostBatch.ims.length} instanced meshes holding ${Math.max(...hostBatch.ims.map(im => im.count))} bodies`);
    /* 5 */
    const hit = host.find(c => charMeshes.get(c.id) && charMeshes.get(c.id).batched && charMeshes.get(c.id) !== (hostBatch && hostBatch.tpl));
    if (hit) {
      hit.hitT = 0.12; frame();
      const out = !charMeshes.get(hit.id).batched && charMeshes.get(hit.id).lodParts.some(q => q.o.layers.mask === 1);
      hit.hitT = 0; frame();
      const back = charMeshes.get(hit.id).batched;
      if (!out || !back) bad(`5. a member hit: out of the batch ${out}, back after ${back}`);
      else ok('5. a member just hit is drawn as itself for the flash, and rejoins after');
    }
    /* 6 */
    const lame = host.find(c => charMeshes.get(c.id) && charMeshes.get(c.id).batched && charMeshes.get(c.id) !== (hostBatch && hostBatch.tpl));
    if (lame) {
      const e = charMeshes.get(lame.id);
      /* severed the way the game severs it: the rig reads the part every frame and hides the limb */
      lame.parts['l.arm'].severed = true;
      const arm = e.armL;
      frame();
      const armParts = e.lodParts.filter(q => q.chain.includes(arm));
      const idx = armParts.map(q => e.lodParts.indexOf(q));
      /* its arm is in no instance: every instance of an arm part sits at some OTHER body */
      const leaks = [];
      for (const i of idx) {
        const im = hostBatch.ims[i]; const m = new THREE.Matrix4();
        for (let k = 0; k < im.count; k++) { im.getMatrixAt(k, m); if (m.equals(e.lodParts[i].o.matrixWorld)) leaks.push(i); }
      }
      set(false, false); frame();
      const shownOff = armParts.filter(q => lodShown(q)).length;
      const back = e.lodParts.filter(q => q.o.layers.mask === 1).length === e.lodParts.length;
      lame.parts['l.arm'].severed = false;
      if (leaks.length) bad(`6. the arm the rig hid is drawn by the batch (${leaks.length} parts)`);
      else if (shownOff) bad('6. switched off, the hidden arm came back');
      else if (!back) bad('6. switched off, the body\'s own parts did not all come back to layer 0');
      else ok(`6. an arm the rig hid stays hidden in the batch (${armParts.length} parts) and switched off; every part comes back when the switches go off`);
    }
    /* 8: switchable from Options, so it can be judged against the frame-time overlay in play */
    openOptions();
    const btnFor = (frag) => [...document.querySelectorAll('#modalbody .trow')].find(r => r.textContent.includes(frag));
    const flip = (frag) => { const r = btnFor(frag); if (r) r.querySelector('button').click(); return !!r; };
    const had = flip('DETAIL BY DISTANCE') && flip('DRAW A HOST AS ONE');
    const offNow = !LOD_ON && !BATCH_ON && opts.lod === false && opts.batch === false;
    flip('DETAIL BY DISTANCE'); flip('DRAW A HOST AS ONE');
    const onAgain = LOD_ON && BATCH_ON && opts.lod === true && opts.batch === true;
    $('modal').style.display = 'none'; modalOpen = false;
    if (!had) bad('8. no DETAIL BY DISTANCE / DRAW A HOST AS ONE rows in Options');
    else if (!offNow || !onAgain) bad(`8. the Options rows do not switch it (off ${offNow}, back on ${onAgain})`);
    else ok('8. both switch off and on again from Options, and the choice is kept with the other dials');
    set(true, true);
    return {L, gx, gy};
  });
  for (const l of res.L) console.log(l);

  /* 7: the picture */
  if (res.gx !== undefined) {
    const shots = [];
    for (const [lod, bat, zoom, cap] of [[false, false, 28, 'default zoom, switched off'], [true, true, 28, 'default zoom, both on'],
                                         [false, false, 85, 'zoomed out, switched off'], [true, true, 85, 'zoomed out, both on']]) {
      await p.evaluate(({lod, bat, zoom}) => { LOD_ON = lod; BATCH_ON = bat; camDist = camDistTarget = zoom; for (let i = 0; i < 12; i++) render(); }, {lod, bat, zoom});
      const f = OUT.replace(/\.png$/, `_${lod ? 'on' : 'off'}_${zoom}.png`);
      await p.screenshot({ path: f });
      shots.push({ f, cap });
    }
    const imgs = shots.map(s => ({ src: 'data:image/png;base64,' + fs.readFileSync(s.f).toString('base64'), cap: s.cap }));
    const sheet = await p.evaluate(async (list) => {
      const cw = 600, ch = 400, hh = 24;
      const cv = document.createElement('canvas'); cv.width = cw * 2; cv.height = (ch + hh) * Math.ceil(list.length / 2);
      const x = cv.getContext('2d'); x.fillStyle = '#191712'; x.fillRect(0, 0, cv.width, cv.height);
      for (let i = 0; i < list.length; i++) {
        const im = new Image(); im.src = list[i].src; await im.decode();
        const cx0 = (i % 2) * cw, cy0 = Math.floor(i / 2) * (ch + hh);
        x.drawImage(im, cx0, cy0 + hh, cw, ch);
        x.fillStyle = '#c8b998'; x.font = '13px monospace'; x.fillText(list[i].cap, cx0 + 8, cy0 + 17);
      }
      return cv.toDataURL('image/png');
    }, imgs);
    fs.writeFileSync(OUT, Buffer.from(sheet.split(',')[1], 'base64'));
    for (const s of shots) fs.unlinkSync(s.f);
    console.log('   7. ' + OUT);
  }
  for (const e of errs) console.log('!! ' + e);
  const failed = res.L.some(l => l.startsWith('!!')) || errs.length;
  console.log(failed ? 'FAIL' : 'PASS');
  await b.close();
  process.exit(failed ? 1 : 0);
})();
