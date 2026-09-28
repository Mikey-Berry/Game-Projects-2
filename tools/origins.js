#!/usr/bin/env node
/* THE ORIGINS ARE THE SHAPE THEY ARE.
 *
 * "Could we lock in the body type/shape for origin characters? Lyonart is always a slightly
 *  tall build, Lyre is short and thin, Saga is average, and Czarina is a bit taller than Saga.
 *  That could help prevent any future issues with the models."
 *
 * Every other body rolls its frame and its height off its id, and an origin's id is wherever
 * the counter had got to when the world placed them. So:
 *
 *   1. WHATEVER THE ID, THE SAME BODY: each origin minted twelve times over, twelve ids, one
 *      frame, one width, one height — and the frame is the one written down for them
 *   2. IN THE ORDER ASKED FOR, measured at the top of the head: Lyre < Saga < Czarina <
 *      Lyonart, Saga within a hair of an ordinary man, and Lyre the narrowest of the four
 *   3. THE HEAD IS NOT STRETCHED BY THE FRAME: an origin's head comes out as wide as it is
 *      tall in the world, so a face is drawn at the proportions it was authored at
 *   4. AND WHAT THEY BECOME KEEPS IT: Lyonart as the lich and Lyre Unclouded stand exactly as
 *      tall as they did
 *   5. NOBODY ELSE WAS LOCKED: ordinary bodies still roll more than one frame
 *
 * Anything starting '!!' fails the build. Writes a line-up: two ordinary people for scale,
 * then the four.
 *
 *   node tools/origins.js [out.png] [game.html]
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const OUT = path.resolve(process.argv[2] || path.join(__dirname, 'origins.png'));
const gamePath = (a) => path.resolve(a ? (path.isAbsolute(a) ? a : path.join(__dirname, a)) : path.join(__dirname, 'game.html'));

(async () => {
  const b = await chromium.launch({
    executablePath: process.env.DUSTWARD_CHROME || undefined,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'],
  });
  const p = await b.newPage({ viewport: { width: 900, height: 700 } });
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message.slice(0, 200)));
  await p.goto('file://' + gamePath(process.argv[3]), { waitUntil: 'load', timeout: 90000 });
  await p.waitForSelector('#btn-start', { state: 'attached', timeout: 60000 });
  await p.evaluate(() => document.getElementById('btn-start').click());
  await p.waitForTimeout(2600);

  const out = await p.evaluate(() => {
    paused = true; hour = 11; debugSeeAll = true;
    if (typeof fogPlane !== 'undefined') fogPlane.visible = false;
    const L = [], bad = (m) => L.push('!! ' + m), ok = (m) => L.push('   ' + m);
    if (typeof ORIGIN_FRAMES === 'undefined') { bad('no ORIGIN_FRAMES: an origin rolls its body off its id like anybody else'); return { L }; }
    const me = player()[0];
    /* open ground for the line-up, found before `chars` is emptied */
    let spot = null;
    outer: for (let r = 40; r < 700; r += 15) for (let a = 0; a < 24; a++) {
      const x = Math.round(me.x + Math.cos(a / 24 * Math.PI * 2) * r), y = Math.round(me.y + Math.sin(a / 24 * Math.PI * 2) * r);
      let clear = true;
      for (let j = -6; j <= 6 && clear; j++) for (let i = -8; i <= 8 && clear; i++) if (isBlocked(x + i, y + j) || tileAt(x + i, y + j) === 3) clear = false;
      if (clear) { spot = { x, y }; break outer; }
    }
    window.__spot = spot || { x: me.x, y: me.y };
    const clear = () => { chars.length = 0; charMeshes.forEach(e => { if (e.g && e.g.parent) e.g.parent.remove(e.g); }); charMeshes.clear(); };
    const WHO = {
      lyonart: { race: 'human', sex: 'm', armor: 'a_lea' },
      lyre:    { race: 'human', sex: 'f', armor: 'a_lea' },
      saga:    { race: 'hollow', sex: 'm', armor: 'a_pla', after: c => { c.hollowTier = 1; } },
      czarina: { race: 'hollow', sex: 'f', armor: 'a_pla', after: c => { c.hollowTier = 1; } },
    };
    const mint = (face, x, y, extra) => {
      const o = face ? WHO[face] : { race: 'human', sex: extra && extra.sex || 'm' };
      const c = makeChar(face || 'someone', 'player', x, y, { atk: 8, def: 8, tough: 8, race: o.race, sex: o.sex, armor: o.armor || null, weapon: null, age: 30 });
      c.state = 'ok'; c.sex = o.sex; c.dir = 0; c.age = 30;
      if (face) c.face = face;
      if (o.after) o.after(c);
      if (extra && extra.then) extra.then(c);
      chars.push(c);
      return c;
    };
    const v = new THREE.Vector3(), sv = new THREE.Vector3();
    const measure = (c) => {
      syncChars(0.05); syncChars(0.05);
      const e = charMeshes.get(c.id);
      e.g.rotation.set(0, 0, 0); e.g.updateMatrixWorld(true);
      e.head.getWorldPosition(v);
      const top = v.y - e.g.position.y;
      e.head.getWorldScale(sv);
      const hs = e.head.scale;
      return { e, frame: e.frame, sx: e.baseSX, sy: e.baseSY, top, headRatio: (sv.y / hs.y) / (sv.x / hs.x) };
    };

    /* 1 */
    const faces = Object.keys(WHO), got = {};
    let ok1 = true;
    for (const f of faces) {
      const rows = [];
      for (let i = 0; i < 12; i++) { clear(); const c = mint(f, window.__spot.x, window.__spot.y); rows.push(Object.assign({ id: c.id }, measure(c))); }
      const ids = new Set(rows.map(r => r.id)).size;
      const keys = new Set(rows.map(r => `${r.frame}|${r.sx.toFixed(5)}|${r.sy.toFixed(5)}`));
      if (ids < 12) { bad(`1. ${f}: only ${ids} distinct ids were minted — nothing was tested`); ok1 = false; }
      else if (keys.size !== 1) { bad(`1. ${f}: ${keys.size} different bodies across 12 ids: ${[...keys].slice(0, 3).join(' / ')}`); ok1 = false; }
      else if (rows[0].frame !== ORIGIN_FRAMES[f].key) { bad(`1. ${f} stands on '${rows[0].frame}', written down as '${ORIGIN_FRAMES[f].key}'`); ok1 = false; }
      got[f] = rows[0];
    }
    if (ok1) ok(`1. twelve ids each, one body each: ${faces.map(f => `${f} ${got[f].frame} ${got[f].sx.toFixed(2)}x${got[f].sy.toFixed(2)}`).join(', ')}`);

    /* 2, against the mean of a crowd of ordinary men */
    const men = [];
    for (let i = 0; i < 40; i++) { clear(); men.push(measure(mint(null, window.__spot.x, window.__spot.y, { sex: 'm' })).top); }
    const man = men.reduce((a, x) => a + x, 0) / men.length;
    const H = f => got[f].top;
    const order = faces.slice().sort((a, c) => H(a) - H(c));
    const fmt = order.map(f => `${f} ${H(f).toFixed(3)}`).join(' < ');
    if (order.join() !== 'lyre,saga,czarina,lyonart') bad(`2. shortest to tallest came out ${fmt}`);
    else if (Math.abs(H('saga') / man - 1) > 0.03) bad(`2. Saga is ${(H('saga') / man * 100).toFixed(1)}% of an ordinary man (${man.toFixed(3)}), which is not average`);
    else if (!faces.every(f => f === 'lyre' || got[f].sx > got.lyre.sx)) bad(`2. Lyre is not the narrowest: ${faces.map(f => f + ' ' + got[f].sx.toFixed(3)).join(', ')}`);
    else ok(`2. ${fmt} (head height); an ordinary man ${man.toFixed(3)}; Lyre narrowest at ${got.lyre.sx.toFixed(2)}`);

    /* 3 */
    const skew = faces.filter(f => Math.abs(got[f].headRatio - 1) > 0.002);
    if (skew.length) bad(`3. heads stretched by the frame: ${skew.map(f => `${f} ${got[f].headRatio.toFixed(3)}`).join(', ')}`);
    else ok(`3. every origin's head is as tall as it is wide in the world (${faces.map(f => got[f].headRatio.toFixed(3)).join(', ')})`);

    /* 4 */
    clear();
    const lich = measure(mint('lyonart', window.__spot.x, window.__spot.y, { then: c => { c.lich = true; c.undead = true; } }));
    clear();
    const unc = measure(mint('lyre', window.__spot.x, window.__spot.y, { then: c => { c.immortal = 'divine'; } }));
    if (lich.sy !== got.lyonart.sy || lich.frame !== got.lyonart.frame) bad(`4. the lich stands on ${lich.frame} ${lich.sy.toFixed(3)}, Lyonart on ${got.lyonart.frame} ${got.lyonart.sy.toFixed(3)}`);
    else if (unc.sy !== got.lyre.sy || unc.frame !== got.lyre.frame) bad(`4. Lyre Unclouded stands on ${unc.frame} ${unc.sy.toFixed(3)}, Lyre on ${got.lyre.frame} ${got.lyre.sy.toFixed(3)}`);
    else ok(`4. Lyonart as the lich and Lyre Unclouded keep their frames (${lich.frame} ${lich.sy.toFixed(2)}, ${unc.frame} ${unc.sy.toFixed(2)})`);

    /* 5 */
    const fr = new Set();
    for (let i = 0; i < 30; i++) { clear(); fr.add(measure(mint(null, window.__spot.x, window.__spot.y, { sex: i % 2 ? 'f' : 'm' })).frame); }
    if (fr.size < 4) bad(`5. thirty ordinary bodies came out on ${fr.size} frames`);
    else ok(`5. thirty ordinary bodies still roll ${fr.size} frames`);
    clear();
    return { L };
  });

  const shot = await p.evaluate(async () => {
    const s = window.__spot;
    document.querySelectorAll('.hud,#charpanel,#invpanel,#minimap,#log,#tip,#squadbar,#buildbar,#touchbar')
      .forEach(el => el.style.setProperty('display', 'none', 'important'));
    const row = [[null, 'm'], [null, 'f'], ['lyre'], ['saga'], ['czarina'], ['lyonart']];
    const WHO = { lyonart: ['human', 'm', 'a_lea'], lyre: ['human', 'f', 'a_lea'], saga: ['hollow', 'm', 'a_pla'], czarina: ['hollow', 'f', 'a_pla'] };
    const made = [];
    row.forEach(([f, sx], j) => {
      const [race, sex, armor] = f ? WHO[f] : ['human', sx, null];
      const c = makeChar(f || 'someone', 'player', s.x + (j - 2.5) * 1.1, s.y, { atk: 8, def: 8, tough: 8, race, sex, armor, weapon: null, age: 30 });
      c.state = 'ok'; c.sex = sex; c.dir = 0; c.age = 30; c.weapon = null;
      if (f) c.face = f;
      if (race === 'hollow') c.hollowTier = 1;
      chars.push(c); made.push(c);
    });
    for (let i = 0; i < 10; i++) syncChars(0.05);
    const box = new THREE.Box3(), labels = [];
    for (const c of made) {
      const e = charMeshes.get(c.id); if (!e) continue;
      labels.push(c.face || (c.sex === 'f' ? 'a woman (' + e.frame + ')' : 'a man (' + e.frame + ')'));
      e.rotY = 0; e.g.rotation.set(0, 0, 0); e.g.updateWorldMatrix(true, true);
      box.expandByObject(e.g);
    }
    const ctr = box.getCenter(new THREE.Vector3()), sz = box.getSize(new THREE.Vector3());
    const cam = camera.clone(); cam.aspect = 2.2; cam.fov = 30;
    const back = Math.max(sz.x, sz.y * 2.2) * 1.2;
    cam.position.set(ctr.x, ctr.y + back * 0.12, ctr.z + back);
    cam.lookAt(ctr); cam.updateProjectionMatrix();
    const cv = renderer.domElement;
    const w0 = cv.width, h0 = cv.height, sw = cv.style.width, sh = cv.style.height;
    renderer.setSize(1320, 600, false);
    renderer.render(scene, cam);
    const url = cv.toDataURL('image/png');
    renderer.setSize(w0, h0, false); cv.style.width = sw; cv.style.height = sh;
    return { png: url.split(',')[1], order: labels.join('  |  ') };
  });

  fs.writeFileSync(OUT, Buffer.from(shot.png, 'base64'));
  for (const l of out.L) console.log(l);
  console.log('\n   ' + path.basename(OUT) + ', left to right: ' + shot.order);
  for (const e of errs) console.log('!! ' + e);
  const failed = out.L.some(l => l.startsWith('!!')) || errs.length;
  console.log(failed ? 'FAIL' : 'PASS');
  await b.close();
  process.exit(failed ? 1 : 0);
})();
