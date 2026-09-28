#!/usr/bin/env node
/* LYRE, UNCLOUDED.
 *
 * "Lyre's reaching divine immortality should have a unique model, similar to Lyonart's lich.
 *  They parallel each other in this sense. Please create a custom model for her."
 *
 * Lyonart ascends in his own coat with his own head changed (`LICHFACE`); Lyre ascends the same
 * way on the other road (`UNCLOUDFACE`). Asked of real bodies built by the real `syncChars`:
 *
 *   1. Lyre, ascended through `ascendDivine` — the rite's own call — is rebuilt on the next
 *      draw. `immortal` was not in `colorKeyOf`, so an Unclouding changed nothing on screen until
 *      the body next left the view and came back: true of every divine ascendant, not just her
 *   2. and what is built is HER: not the Vigil's robe, her own rig in her own coat, the finished
 *      face painted on (no mouth, no brow, lidless light), porcelain skin, and the light that
 *      gets out of her — a ring behind the head, the throat, both wrists — all of it lit
 *   3. anybody else who takes the Unclouding still becomes the Vigil
 *   4. and the living Lyre is untouched: her own face, no ring
 *
 * Anything starting '!!' fails the build.
 *
 *   node tools/unclouded.js [game.html]
 */
const { chromium } = require('playwright');
const path = require('path');
const gamePath = (a) => path.resolve(a ? (path.isAbsolute(a) ? a : path.join(__dirname, a)) : path.join(__dirname, 'game.html'));

(async () => {
  const b = await chromium.launch({
    executablePath: process.env.DUSTWARD_CHROME || undefined,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'],
  });
  const p = await b.newPage({ viewport: { width: 900, height: 700 } });
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message.slice(0, 200)));
  await p.goto('file://' + gamePath(process.argv[2]), { waitUntil: 'load', timeout: 90000 });
  await p.waitForSelector('#btn-start', { state: 'attached', timeout: 60000 });
  await p.evaluate(() => document.getElementById('btn-start').click());
  await p.waitForTimeout(2600);

  const out = await p.evaluate(() => {
    paused = true;
    const L = [], bad = (m) => L.push('!! ' + m), ok = (m) => L.push('   ' + m);
    if (typeof UNCLOUDFACE === 'undefined') { bad('no UNCLOUDFACE: Lyre ascends into the Vigil like anybody else'); return L; }
    const me = player()[0];
    camX = camSX = me.x; camY = camSY = me.y; camFollow = false;
    const mkAt = (name, dx, o) => {
      const q = findOpenNear(Math.round(me.x) + dx, Math.round(me.y) + 2, 2);
      const c = makeChar(name, 'player', q.x, q.y, Object.assign({atk: 12, def: 12, tough: 12, magic: 30, gift: 'divine', armor: 'a_lea'}, o));
      chars.push(c); return c;
    };
    const lyre = mkAt('Lyre', 2, {sex: 'f'}); lyre.face = 'lyre';
    const other = mkAt('Somebody', -2, {sex: 'f'});
    charEpoch++; rebuildCharGrid(); syncChars(0); render();
    const e0 = charMeshes.get(lyre.id);
    if (!e0) { bad('the living Lyre has no mesh in view'); return L; }
    /* what a built body has on it */
    const lit = (e) => { let n = 0; e.g.traverse(o => { if (o.isMesh && o.geometry === TORG && o.material && o.material.emissiveIntensity > 0.3) n++; }); return n; };
    const decalKeys = (e) => { const k = []; e.g.traverse(o => { if (o.isMesh && o.material && o.material.map) for (const [key, t] of PAINTED) if (t.map === o.material.map) k.push(key); }); return k; };
    const headCol = (e) => e.head && e.head.material && e.head.material.color ? '#' + e.head.material.color.getHexString() : null;

    /* 4, the living one first */
    const k0 = decalKeys(e0);
    if (lit(e0)) bad(`4. the living Lyre already wears ${lit(e0)} rings of light`);
    else if (!k0.some(k => /^named:lyre:\d/.test(k))) bad(`4. the living Lyre's face: ${k0.join(', ') || 'none'}`);
    else ok(`4. the living Lyre: ${k0.join(', ')}, no ring`);

    /* 1 */
    const key0 = e0.colorKey;
    ascendDivine(lyre);
    syncChars(0); render();
    const e1 = charMeshes.get(lyre.id);
    if (e1 === e0 || (e1 && e1.colorKey === key0)) bad('1. the Unclouding changed nothing on screen: the mesh was not rebuilt');
    else ok('1. ascended through ascendDivine, and rebuilt on the next draw');

    /* 2 */
    if (e1) {
      const k1 = decalKeys(e1), rings = lit(e1), skin = headCol(e1);
      const bits = [];
      if (uncloudedBody(lyre) || authoredBody(lyre)) bits.push('she is an authored body (the Vigil robe)');
      if (!k1.includes('named:lyre:unclouded')) bits.push(`her face is ${k1.join(', ') || 'none'}, not the finished one`);
      if (rings < 4) bits.push(`${rings} lit rings on her (want the halo, the throat and two wrists)`);
      if (!skin || new THREE.Color(skin).getHSL({}).l < 0.8) bits.push(`skin ${skin} is not porcelain`);
      /* the halo stands BEHIND the head, and is the widest thing above her shoulders */
      let halo = null; e1.headG.traverse(o => { if (o.isMesh && o.geometry === TORG && o.position.z < -0.1) halo = o; });
      if (!halo) bits.push('no ring behind the head');
      if (bits.length) bad('2. ' + bits.join('; '));
      else ok(`2. her own rig and coat, ${k1.filter(k => k.startsWith('named')).join(', ')}, skin ${skin}, ${rings} rings of light (halo at z ${halo.position.z.toFixed(2)})`);
    }

    /* 3 */
    ascendDivine(other);
    syncChars(0); render();
    if (!uncloudedBody(other)) bad('3. somebody else took the Unclouding and is not the Vigil');
    else if (charMeshes.get(other.id) && lit(charMeshes.get(other.id))) bad('3. the Vigil has Lyre\'s rings');
    else ok('3. anybody else who takes it is still the Vigil');
    return L;
  });
  for (const l of out) console.log(l);
  for (const e of errs) console.log('!! ' + e);
  const failed = out.some(l => l.startsWith('!!')) || errs.length;
  console.log(failed ? 'FAIL' : 'PASS');
  await b.close();
  process.exit(failed ? 1 : 0);
})();
