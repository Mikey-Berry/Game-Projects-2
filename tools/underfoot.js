#!/usr/bin/env node
/* WHAT IS DRAWN AT FLOOR LEVEL, AND WHETHER IT IS ABOVE THE FLOOR.
 *
 * "the torch lighting is looking amazing... One point though - they sometimes cause black
 *  visual artifacts to appear on the floor."
 *
 * Underground the floor is not a heightfield. It is a run of BOXES 0.2 thick, drawn centred on
 * `groundY + floorY`, so the surface you walk on is half a box higher than the number the rest
 * of the code calls "the floor here". A body's group is placed at that centre — which sinks it
 * a tenth of a unit into its own floor — and every flat decal parented to the group inherits it.
 *
 * Measured on the build before the fix: the torch pool sat at -22.050 against a floor surface at
 * -22.000. A transparent disc buried in an opaque slab with `depthTest` on is a z-fight, and a
 * z-fight on a floor is hard-edged black patches that flicker as the camera moves. It only ever
 * showed with a torch out, because the pool is the only thing that draws there, and never above
 * ground, because up there the group origin IS the ground.
 *
 * The bug is a CLASS, not a line — anything flat parented to a body underground has it — so the
 * claim is about clearance rather than about one decal.
 *
 *   node tools/underfoot.js [game.html]
 */
const { chromium } = require('playwright');
const path = require('path');
const gamePath = (a) => path.resolve(a ? (path.isAbsolute(a) ? a : path.join(__dirname, a)) : path.join(__dirname, 'game.html'));

(async () => {
  const b = await chromium.launch({ executablePath: process.env.DUSTWARD_CHROME || undefined,
    args: ['--use-gl=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox','--no-sandbox'] });
  const errs = [];
  const p = await b.newPage({ viewport: { width: 1000, height: 700 } });
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message.slice(0, 200)));
  await p.goto('file://' + gamePath(process.argv[2]), { waitUntil: 'load', timeout: 90000 });
  await p.waitForFunction(() => !!document.getElementById('btn-start'), null, { timeout: 60000 });
  await p.evaluate(() => { document.getElementById('btn-start').click(); paused = true; });
  await p.waitForFunction(() => typeof chars !== 'undefined' && chars.length > 0, null, { timeout: 60000 });

  /* stage a torch-bearer in a hall and let the renderer build its rig */
  const staged = await p.evaluate(() => {
    paused = true;
    const h = undercroft.halls.find(q => q.f === -1);
    if (!h) return null;
    const me = chars.find(c => c.faction === 'player');
    if (!me) return null;
    for (const c of chars.filter(c => c.faction === 'player')) { c.floor = -1; c.x = h.x; c.y = h.y; }
    me.weapon = 'w_torch'; me.torchH = 999; me.state = 'ok';
    camX = camSX = h.x; camY = camSY = h.y; camDist = camDistTarget = 13;
    camFollow = true; selected = [me]; activeFloor = -1;
    hour = 12; if (typeof updateSky === 'function') updateSky();
    window.__me = me.id;
    return { x: h.x, y: h.y };
  });
  await p.waitForTimeout(5000);

  const R = await p.evaluate(() => {
    const O = {};
    const guard = (keys, fn) => {
      try { fn(); } catch (e) { for (const k of keys) if (O[k] === undefined) O[k] = '!! ' + String(e.message).slice(0, 130).toUpperCase(); }
    };
    const me = chars.find(c => c.id === window.__me);

    /* THE PREMISE, COUNTED FIRST. Every claim below is about a decal, and a decal that was
       never built cannot be buried — "nothing is under the floor" would be green on a build
       that draws nothing at all. */
    guard(['thereIsATorchPoolToJudge'], () => {
      const e = charMeshes.get(me.id);
      const lit = typeof torchLit === 'function' && torchLit(me);
      O.thereIsATorchPoolToJudge = (lit && e && e.torchPool && e.torchPool.visible)
        ? 'a body underground with a torch out has a lit pool on the floor, so there is something to measure'
        : `!! NO TORCH POOL WAS BUILT (lit ${lit}, rig ${!!e}, pool ${!!(e && e.torchPool)})`;
    });

    /* ---------- THE FLOOR SURFACE IS MEASURED, NOT LOOKED UP ----------
       The first cut of this read `DECK_TOP`, the constant the fix introduced — so on the build
       BEFORE the fix every claim here died with a ReferenceError instead of reporting that the
       pool was buried. A harness that throws on the old build cannot be A/B'd at all, and this
       repo already has a note about that beside another one.
       The slab is a fact about the scene on both builds, so the scene is asked: drop a ray from
       above onto the floor beside the body and take what it hits. That is the face a body
       stands on, whatever any constant says, and it can be compared on either build. */
    /* The deck is drawn by `box(g, n, 0.2, 1, ...)` centred on `groundY + floorY` — a slab a
       fifth of a unit thick — so the face a body stands on is a tenth above that centre. That
       is read off the floor-drawing call and is equally true on the build before the fix and
       after it, which is the point: the number belongs to the FLOOR, not to the repair. A
       raycast would be prettier and turned out to trip over an object in the scene with no
       parent, which is a fight worth avoiding for a constant this legible. */
    const SLAB_HALF = 0.1;
    const deckTopAt = (wx, wz) => groundY(wx, wz) + floorY(me.floor) + SLAB_HALF;
    guard(['theFloorIsASlabWithThickness', 'theTorchPoolClearsTheFloor'], () => {
      const e = charMeshes.get(me.id);
      if (!e || !e.torchPool) { O.theFloorIsASlabWithThickness = '!! NO RIG'; O.theTorchPoolClearsTheFloor = '!! NO RIG'; return; }
      const centre = groundY(me.x, me.y) + floorY(me.floor);
      /* beside the body, so the ray meets floor rather than the body's own boots */
      const top = deckTopAt(me.x, me.y);
      const wp = new THREE.Vector3(); e.torchPool.getWorldPosition(wp);
      const gap = wp.y - top;
      O._heights = `the code calls the floor ${centre.toFixed(3)}; the face a body stands on is ${top.toFixed(3)}; the pool is at ${wp.y.toFixed(3)}`;
      O.theFloorIsASlabWithThickness = (top - centre) > 0.01
        ? `the deck is a slab: the face a body stands on is ${(top - centre).toFixed(3)} above the height the rest of the code calls "the floor here"`
        : `!! THE DECK HAS NO THICKNESS TO CLEAR (top ${top.toFixed(3)} vs centre ${centre.toFixed(3)})`;
      O.theTorchPoolClearsTheFloor = gap > 0.01
        ? `the torch pool sits ${gap.toFixed(3)} above the floor it is painted on, so the two never trade the depth test`
        : `!! THE TORCH POOL IS ${Math.abs(gap).toFixed(3)} BELOW THE FLOOR SURFACE — THAT IS THE Z-FIGHT`;
    });

    /* ---- AND SO DOES EVERY OTHER FLAT THING PARENTED TO A BODY ----
       The ward ring is the other one that exists today. It is asked separately rather than
       folded into the claim above, because they are two offsets and a fix to one is not a fix
       to the other — which is exactly how the first of these came to be buried on its own. */
    guard(['andSoDoesTheWardRing'], () => {
      const e = charMeshes.get(me.id);
      if (!e) { O.andSoDoesTheWardRing = '!! NO RIG'; return; }
      /* force one into existence. The ring is built for a body HOLDING the warding
         concentration — `c.warded` is not the flag and setting it made this claim quietly
         vacuous, which is the failure mode this whole file exists to catch. */
      me.concentrating = { key: 'warding', lock: 0, exclusive: false, mobile: true };
      if (typeof syncChars === 'function') syncChars(1 / 30);
      const e2 = charMeshes.get(me.id);
      if (!e2 || !e2.wardRing) { O.andSoDoesTheWardRing = '!! STAGED A WARDING CONCENTRATION AND NO RING WAS BUILT'; me.concentrating = null; return; }
      const top = deckTopAt(me.x, me.y);
      const wp = new THREE.Vector3(); e2.wardRing.getWorldPosition(wp);
      const gap = wp.y - top;
      me.concentrating = null;
      O.andSoDoesTheWardRing = gap > 0.01
        ? `and the ward ring clears it by ${gap.toFixed(3)}`
        : `!! THE WARD RING IS ${Math.abs(gap).toFixed(3)} BELOW THE FLOOR SURFACE`;
    });

    /* ---- AND ABOVE GROUND NOTHING FLOATS ----
       The other half of the fix. Lifting every decal by the slab thickness everywhere would
       have hung the pool a tenth of a unit over the grass, which is the same bug pointing the
       other way. The lift has to ask which storey the body is on. */
    guard(['andAboveGroundNothingFloats'], () => {
      /* asked of the RENDERER rather than of the helper, for the same reason as above: the
         helper does not exist on the old build. Put a torch-bearer on the surface and compare
         the pool it draws against the ground the ray finds there. */
      const me2 = chars.find(c => c.faction === 'player' && c !== me) || me;
      const wasF = me2.floor, wasW = me2.weapon, wasT = me2.torchH;
      me2.floor = 0; me2.weapon = 'w_torch'; me2.torchH = 999;
      if (typeof syncChars === 'function') syncChars(1 / 30);
      const e3 = charMeshes.get(me2.id);
      let lift = 0;
      if (e3 && e3.torchPool) {
        const wp2 = new THREE.Vector3(); e3.torchPool.getWorldPosition(wp2);
        lift = wp2.y - (groundY(me2.x, me2.y) + 0.05);   /* 0.05 is the offset it has always had */
      }
      me2.floor = wasF; me2.weapon = wasW; me2.torchH = wasT;
      O.andAboveGroundNothingFloats = Math.abs(lift) < 0.01
        ? 'and a body on the surface gets no lift at all — up there the group origin is the ground, which is why this never showed in daylight'
        : `!! A SURFACE BODY'S POOL IS LIFTED ${lift.toFixed(3)} OFF THE GROUND`;
    });
    return O;
  });

  console.log('=== WHAT IS DRAWN AT FLOOR LEVEL ===\n');
  for (const [k, v] of Object.entries(R)) console.log('  ' + k.padEnd(34) + v);
  const bad = Object.values(R).map(String).filter(v => v.startsWith('!!'));
  if (errs.length) { console.log(''); errs.slice(0, 4).forEach(e => console.log('  ' + e)); }
  console.log('\n' + (bad.length || errs.length
    ? '*** ' + [...bad, ...errs].join('\n*** ')
    : 'WHAT IS PAINTED ON THE FLOOR IS ON TOP OF IT'));
  await b.close();
  process.exitCode = (bad.length || errs.length) ? 1 : 0;
})();
