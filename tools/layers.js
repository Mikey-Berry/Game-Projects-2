#!/usr/bin/env node
/* THE STOREY YOU ARE ON, AND THE ROOM YOU ARE IN.
 *
 *   "The mini-map should have separate layers for the underground sections. Align this with the
 *    little banner that tracks what layer you're at so it's easy to tell."
 *   "some doors lead to a boss room, which would then seem to lead to another hallway on the
 *    other side... but there is no door to open that side."
 *
 * THE MAP. The surface minimap is the whole world — 1440 tiles in 128 pixels — so a warren
 * chamber is two pixels on it and a corridor is none. The underground layer is a LOCAL window
 * of 132 tiles around your own people, in the storey's own colour, and it needs its own memory
 * because the fog is one flat W x H grid that cannot say which parts of the Sump you have
 * walked. Three tones, and all three are asserted: rock, open ground in the depth's tint, and
 * ground you have never seen.
 *
 * THE RINGS. `chamber` walls its entire perimeter but the one door tile, so at build time every
 * chamber has exactly one way in. `wall` refuses to write outside `wx>1 && wy>1 && wx<W-1 &&
 * wy<H-1` — a sane guard on the map border — and `deck` has no such guard, so a chamber whose
 * ring fell on the boundary got its FLOOR laid and its WALL dropped. Measured before the fix: 1
 * room of 179, and it was a VAULT, with nineteen tiles of its top wall simply absent.
 * The claim is deliberately about ALL chambers and not about the boundary, because "a ring with
 * a hole in it and no door in the hole" is the property that matters and the border was only
 * the way it happened this time.
 *
 * Anything starting '!!' fails the build.
 *
 *   node tools/layers.js [game.html]
 */
const { chromium } = require('playwright');
const path = require('path');
const gamePath = (a) => path.resolve(a ? (path.isAbsolute(a) ? a : path.join(__dirname, a)) : path.join(__dirname, 'game.html'));

(async () => {
  const b = await chromium.launch({
    executablePath: process.env.DUSTWARD_CHROME || undefined,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'],
  });
  const p = await b.newPage({ viewport: { width: 1000, height: 700 } });
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message.slice(0, 240)));
  await p.goto('file://' + gamePath(process.argv[2]), { waitUntil: 'load' });
  await p.waitForTimeout(3000);
  await p.evaluate(() => document.getElementById('btn-start').click());
  await p.waitForTimeout(4000);
  const R = {};
  const NOTHING = '!! NOTHING TO MEASURE — this build has no depths';

  /* ---- 1. EVERY CHAMBER RING IS WHOLE, AND ITS ONE HOLE IS A DOOR ---- */
  const rings = await p.evaluate(() => {
    if (typeof caves === 'undefined') return null;
    let rooms = 0, vaults = 0, leaky = 0, leakyVaults = 0, holes = 0, doorless = 0;
    const worst = [];
    for (const cv of caves) for (const rm of (cv.rooms || [])) {
      rooms++; if (rm.vault) vaults++;
      const F = rm.f;
      const doorSet = new Set((cv.doors || []).filter(d => d.f === F).map(d => d.x + ',' + d.y));
      const open = [];
      for (let x = rm.x0; x <= rm.x1; x++) for (const y of [rm.y0, rm.y1])
        if (!isBlocked(x + 0.5, y + 0.5, F) && !doorSet.has(x + ',' + y)) open.push([x, y]);
      for (let y = rm.y0 + 1; y <= rm.y1 - 1; y++) for (const x of [rm.x0, rm.x1])
        if (!isBlocked(x + 0.5, y + 0.5, F) && !doorSet.has(x + ',' + y)) open.push([x, y]);
      if (!doorSet.size) doorless++;
      if (open.length) {
        leaky++; holes += open.length; if (rm.vault) leakyVaults++;
        if (worst.length < 4) worst.push({ f: F, vault: !!rm.vault, holes: open.length, at: open.slice(0, 3) });
      }
    }
    return { rooms, vaults, leaky, leakyVaults, holes, doorless, worst };
  });
  R.everyChamberRingIsWhole = !rings ? NOTHING
    : rings.rooms < 50 ? '!! NOTHING TO MEASURE — barely any chambers in this world'
    : (rings.leaky === 0 && rings.doorless === 0)
    ? `all ${rings.rooms} chambers across the storeys — ${rings.vaults} of them vaults — are sealed but for a registered door: 0 holes, 0 without a door`
    : `!! A CHAMBER CAN BE WALKED INTO WITHOUT OPENING ANYTHING (${JSON.stringify(rings)})`;

  /* ---- 2. THE MAP CHANGES STOREY WITH THE BANNER ----
     Three tones counted exactly, because "it looks different" is satisfied by a blank square. */
  const map = await p.evaluate(() => {
    if (typeof DEPTHS === 'undefined' || typeof renderUnderMinimap !== 'function') return null;
    const tone = (F) => {
      renderMinimap();
      const d = mmcx.getImageData(0, 0, 128, 128).data;
      const t = (F !== undefined && DEPTH_TINT[String(F)]) || '#000000';
      const tr = parseInt(t.slice(1, 3), 16), tg = parseInt(t.slice(3, 5), 16), tb = parseInt(t.slice(5, 7), 16);
      let rock = 0, open = 0, dark = 0;
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i], g = d[i + 1], b2 = d[i + 2];
        if (r === 18 && g === 16 && b2 === 22) rock++;
        else if (Math.abs(r - tr) < 3 && Math.abs(g - tg) < 3 && Math.abs(b2 - tb) < 3) open++;
        else if (r === 9 && g === 8 && b2 === 11) dark++;
      }
      return { rock, open, dark };
    };
    activeFloor = 0;
    const surface = tone();
    const F = DEPTHS[1];
    const h = undercroft.halls.find(H => H.f === F);
    const me = player().find(c => c.state === 'ok');
    if (!h || !me) return null;
    me.x = h.x; me.y = h.y; me.floor = F;
    for (let i = 0; i < 40; i++) update(1 / 30);
    activeFloor = F;
    const walked = tone(F);
    activeFloor = DEPTHS[2];              /* a storey nobody has ever been on */
    const never = tone(DEPTHS[2]);
    activeFloor = 0;
    return { surface, walked, never, F, deepest: DEPTHS[2],
             seen: (underSeen.get(F) || { size: 0 }).size, tint: DEPTH_TINT[String(F)] };
  });
  R.theMapChangesStoreyWithTheBanner = !map ? NOTHING
    : (map.surface.rock === 0 && map.surface.open === 0 && map.walked.rock > 30 && map.walked.open > 30)
    ? `standing on ${map.F} draws that storey instead of the surface — ${map.walked.rock} tiles of rock and ${map.walked.open} of open ground in ${map.tint}, the same colour the banner wears, off ${map.seen} tiles walked`
    : `!! THE MAP DID NOT CHANGE STOREY (${JSON.stringify(map)})`;
  R.andAStoreyYouHaveNotWalkedShowsNothing = !map ? NOTHING
    : (map.never.rock === 0 && map.never.open === 0 && map.never.dark > 16000)
    ? `and ${map.deepest}, which nobody has been down to, gives away nothing at all — no rock, no ground, ${map.never.dark} of 16384 pixels unlit`
    : `!! THE MAP HANDS YOU A STOREY YOU HAVE NEVER WALKED (${JSON.stringify(map.never)})`;

  await b.close();
  console.log('=== THE STOREY AND THE ROOM ===\n');
  for (const [k, v] of Object.entries(R)) console.log('  ' + k.padEnd(38) + v);
  const bad = Object.values(R).map(String).filter(v => v.startsWith('!!'));
  console.log('\n' + (bad.length ? '*** ' + bad.join('\n*** ') : 'ONE MAP PER STOREY, AND EVERY ROOM HAS A DOOR'));
  if (errs.length) { console.log('errs:', errs.length); errs.slice(0, 4).forEach(e => console.log('  ' + e)); }
  if (bad.length) process.exitCode = 1;
})();
