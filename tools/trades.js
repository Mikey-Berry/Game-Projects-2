#!/usr/bin/env node
/* WHAT A TOWN LOOKS LIKE IT DOES, AND HOW OLD IT IS.
 *
 * Three things went into a body that had colour and nothing else:
 *
 *   TRADE. Every townsman has had one since worldgen — smith, miner, brewer, crafter, farmer,
 *   hunter, fisher, salter — and it decided what they sold and what their children grew up to
 *   be, and was invisible. A scorched apron, knees that have been knelt on, a strap that
 *   carries something.
 *
 *   AGE. It decided how well somebody fought and how soon they died and did nothing to the
 *   body but shrink the children. Everyone from sixteen to the grave was the same
 *   thirty-year-old. Now the limbs thin, the height goes, the hair greys and the spine goes
 *   forward — as a fraction of the LINE's own life, because a human has sixty-two years and a
 *   homunculus has thirty-four.
 *
 *   HAIR. There were two heads of hair in the game: a man got a slab and maybe a beard, a
 *   woman got the slab and usually a fall down the back. Shape is the half that reads at this
 *   camera and it was the half that never varied.
 *
 * The claim that matters most is the LAST one: none of this may touch `rnd()`. Worldgen is a
 * single stream and a draw spent looking at a body moves every body placed after it.
 *
 *   node tools/trades.js [out.png] [game.html]
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const OUT = path.resolve(process.argv[2] || path.join(__dirname, 'trades.png'));
const gamePath = (a) => path.resolve(a ? (path.isAbsolute(a) ? a : path.join(__dirname, a)) : path.join(__dirname, 'game.html'));
const TRADES = ['smith', 'miner', 'brewer', 'crafter', 'farmer', 'hunter', 'fisher', 'salter'];

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

  const R = await p.evaluate((TRADES) => {
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
    const one = (set) => {
      const c = makeChar('P', 'player', window.__spot.x, window.__spot.y,
        Object.assign({ atk: 8, def: 8, tough: 8, race: 'human', sex: 'm', age: 30 }, set.opts || {}));
      c.state = 'ok'; c.weapon = null; c.armor = null;
      Object.assign(c, set.set || {});
      chars.push(c);
      syncChars(0.05); syncChars(0.05);
      return { c, e: charMeshes.get(c.id) };
    };
    /* how many boxes a body came to — the merged buffers make this the honest count of
       "did geometry actually land on it", which is all a probe can ask of a costume */
    const tris = (e) => {
      let t = 0;
      e.g.traverse(o => {
        if (!o.isMesh || !o.geometry) return;
        const g = o.geometry;
        t += g.index ? g.index.count / 3 : g.attributes.position.count / 3;
      });
      return Math.round(t);
    };

    /* ---------- THE SAME BODY, TWICE ----------
       A delta between two bodies is not a delta at all. Every `makeChar` mints a fresh id, and
       off that id come the frame, the hair style, the beard and the colouring — so the first
       version of this measured a smith against a DIFFERENT PERSON and reported the apron as
       negative twelve triangles. What it was really measuring was one body's topknot against
       another's crop.
       A character is mutated instead, its mesh dropped, and `syncChars` builds it again: same
       id, same hair, same frame, and the only thing that moved is the field under test. That
       is also the real code path — `colorKeyOf` carries `trade` now, so a townsman who takes
       up a trade rebuilds exactly this way in play. */
    const rebuilt = (c) => {
      const e0 = charMeshes.get(c.id);
      if (e0 && e0.g && e0.g.parent) e0.g.parent.remove(e0.g);
      charMeshes.delete(c.id);
      syncChars(0.05); syncChars(0.05);
      return charMeshes.get(c.id);
    };
    const delta = (mutate) => {
      clear();
      const { c, e } = one({});
      const before = tris(e);
      mutate(c);
      const after = tris(rebuilt(c));
      clear();
      return after - before;
    };

    /* ---------- 1. EVERY TRADE PUTS SOMETHING ON THE BODY ---------- */
    const got = {}, missing = [];
    for (const t of TRADES) {
      got[t] = delta(c => { c.trade = t; });
      if (got[t] <= 0) missing.push(t);
    }
    out.tradeSizes = TRADES.map(t => `${t} +${got[t]}`).join(', ');
    out.everyTradeShows = missing.length ? `!! NOTHING LANDED ON: ${missing.join(', ')}`
      : `all ${TRADES.length} trades put geometry on the body, ${Math.min(...Object.values(got))}-${Math.max(...Object.values(got))} tris of it`;

    /* ---------- 2. AND IT STANDS DOWN UNDER ARMOUR ---------- */
    clear();
    {
      const { c } = one({ set: { armor: 'a_lea' } });
      const before = tris(charMeshes.get(c.id));
      c.trade = 'smith';
      const after = tris(rebuilt(c));
      out.armourWins = after === before
        ? 'a smith in armour wears the armour and not the apron — one answer to the question, not two'
        : `!! AN APRON WENT ON OVER A BREASTPLATE (${before} -> ${after})`;
      clear();
    }

    /* ---------- 3. AGE MOVES THE BODY, AND IT IS THE SAME BODY ---------- */
    clear();
    const ages = {};
    {
      const { c, e } = one({ opts: { age: 20 } });
      ages[20] = { stoop: +(e.stoop || 0).toFixed(3), sy: +e.baseSY.toFixed(4) };
      for (const a of [38, 50, 58]) {
        c.age = a;
        const e2 = rebuilt(c);
        ages[a] = { stoop: +(e2.stoop || 0).toFixed(3), sy: +e2.baseSY.toFixed(4) };
      }
      clear();
    }
    out.ageReadings = Object.entries(ages).map(([a, v]) => `${a}: stoop ${v.stoop}, height ${v.sy}`).join(' | ');
    out.ageBendsTheBody = (ages[20].stoop === 0 && ages[58].stoop > 0.15 && ages[58].sy < ages[20].sy && ages[50].stoop > ages[38].stoop)
      ? `the same body at 58 stoops ${ages[58].stoop} and stands ${((1 - ages[58].sy / ages[20].sy) * 100).toFixed(1)}% shorter than it did at 20, and the ramp is monotone`
      : `!! AGE DOES NOT BEND THE BODY: ${out.ageReadings}`;
    /* and it is the LINE's own life, not a number of years: a homunculus has 34 and is old at 30 */
    clear();
    const hu = one({ opts: { race: 'homunculus', age: 30 } }).e.stoop;
    clear();
    const ht = one({ opts: { race: 'human', age: 30 } }).e.stoop;
    clear();
    out.ageIsAFractionOfALife = (hu > 0.1 && ht === 0)
      ? `at thirty a homunculus is near the end of its thirty-four and stoops ${hu.toFixed(2)}; a human of the same age has not started`
      : `!! AGE IS BEING READ AS YEARS, NOT AS A FRACTION OF A LIFE (homunculus ${hu}, human ${ht})`;

    /* ---------- 4. HAIR IS A SHAPE, AND EVERY SHAPE HAPPENS ---------- */
    clear();
    const styles = {};
    for (let i = 0; i < 300; i++) {
      const { e } = one({ opts: { sex: i % 2 ? 'f' : 'm' } });
      styles[e.hairStyle || 'none'] = (styles[e.hairStyle || 'none'] || 0) + 1;
      clear();
    }
    const keys = Object.keys(styles).sort();
    out.hairSpread = keys.map(k => `${k} ${(styles[k] / 300 * 100).toFixed(0)}%`).join(', ');
    out.everyHairStyleHappens = (keys.length === 8 && !styles.none)
      ? `all eight styles turn up in 300 heads — ${out.hairSpread}`
      : `!! ONLY ${keys.length} HAIR STYLES IN 300 HEADS: ${out.hairSpread}`;

    /* ---------- 5. AND NONE OF IT SPENT THE WORLD ---------- */
    clear();
    const keep = [];
    for (const t of TRADES) keep.push(one({ set: { trade: t }, opts: { age: 55 } }).c);
    const before = seed;
    charMeshes.forEach(x => { if (x.g && x.g.parent) x.g.parent.remove(x.g); });
    charMeshes.clear();
    syncChars(0.05); syncChars(0.05);
    out.costsNothingFromTheWorldStream = (seed === before)
      ? `eight bodies with a trade, a beard and a stoop rebuilt and \`seed\` has not moved (${before})`
      : `!! REBUILDING SPENT ${seed - before} OF THE WORLD STREAM`;
    clear();
    return out;
  }, TRADES);

  /* the eight trades in a row, and a row of ages beside them */
  const shot = await p.evaluate(async (TRADES) => {
    const me = window.__spot;
    chars.length = 0;
    charMeshes.forEach(e => { if (e.g && e.g.parent) e.g.parent.remove(e.g); });
    charMeshes.clear();
    document.querySelectorAll('.hud,#charpanel,#invpanel,#minimap,#log,#tip,#squadbar,#buildbar,#touchbar')
      .forEach(el => el.style.setProperty('display', 'none', 'important'));
    /* ONE ROW IN THE WORLD AT A TIME. The first version built both rows and then took two
       photographs of a scene that contained all sixteen bodies — so each panel showed the
       other panel's row standing behind its own, and neither read as anything. A sheet of two
       rows is two scenes, not one scene shot twice. */
    const rows = [
      TRADES.map(t => ({ trade: t, age: 32 })),
      [20, 30, 38, 44, 50, 55, 59, 62].map(a => ({ age: a })),
    ];
    const png = [];
    for (const row of rows) {
      chars.length = 0;
      charMeshes.forEach(e => { if (e.g && e.g.parent) e.g.parent.remove(e.g); });
      charMeshes.clear();
      const made = [];
      row.forEach((r, j) => {
        const c = makeChar('T', 'player', me.x + (j - 3.5) * 1.05, me.y,
          { atk: 8, def: 8, tough: 8, race: 'human', sex: 'm', age: r.age });
        c.state = 'ok'; c.dir = 0; c.weapon = null; c.armor = null;
        if (r.trade) c.trade = r.trade;
        chars.push(c); made.push(c);
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
      cam.aspect = 3.1; cam.fov = 28;
      const back = Math.max(s.x, s.y * 3.1) * 1.02;
      cam.position.set(ctr.x, ctr.y + back * 0.16, ctr.z + back);
      cam.lookAt(ctr); cam.updateProjectionMatrix();
      const cv0 = renderer.domElement;
      const w0 = cv0.width, h0 = cv0.height, sw = cv0.style.width, sh = cv0.style.height;
      renderer.setSize(1400, 452, false);
      renderer.render(scene, cam);
      png.push(cv0.toDataURL('image/png').split(',')[1]);
      renderer.setSize(w0, h0, false);
      cv0.style.width = sw; cv0.style.height = sh;
    }
    /* stack the two rows with a caption on each */
    const ims = await Promise.all(png.map(d => new Promise(res => {
      const im = new Image(); im.onload = () => res(im); im.src = 'data:image/png;base64,' + d;
    })));
    const L = 28;
    const cv = document.createElement('canvas');
    cv.width = ims[0].width; cv.height = (ims[0].height + L) * 2;
    const g = cv.getContext('2d');
    g.fillStyle = '#12100d'; g.fillRect(0, 0, cv.width, cv.height);
    const caps = ['THE TRADES \u2014   ' + TRADES.join('      '),
                  'THE YEARS  \u2014   20      30      38      44      50      55      59      62'];
    ims.forEach((im, i) => {
      const y = i * (im.height + L);
      g.fillStyle = '#8fd8c0'; g.font = 'bold 16px monospace';
      g.fillText(caps[i], 12, y + 20);
      g.drawImage(im, 0, y + L);
    });
    return cv.toDataURL('image/png').split(',')[1];
  }, TRADES);

  fs.writeFileSync(OUT, Buffer.from(shot, 'base64'));
  for (const [k, v] of Object.entries(R)) console.log('  ' + k.padEnd(30) + v);
  for (const e of errs) console.log('  PAGEERROR: ' + e);
  console.log('\n  ' + path.basename(OUT));
  const bad = Object.values(R).map(String).filter(v => v.startsWith('!!'));
  console.log('\n' + (bad.length || errs.length ? 'THE TOWN IS STILL ANONYMOUS' : 'A TOWN HAS TRADES AND AGES IN IT'));
  await b.close();
  process.exit(bad.length || errs.length ? 1 : 0);
})();
