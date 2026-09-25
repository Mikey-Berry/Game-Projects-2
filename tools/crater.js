#!/usr/bin/env node
/* THE CRATER AT THE MIDDLE OF THE WORLD.
 *
 * The lore bible puts the kingdom "at the centre", annihilated in brilliant light, and calls the
 * crater the largest landmark in the world. The world is now built around it. This asks, on two
 * seeds, whether it is where it says and whether everything else keeps out of it; and on the
 * default seed, whether the rim is a wall with ways through, whether its ground and its sky say
 * what it is, and whether walking in tells you so in order.
 *
 *   1. it is at the dead centre of the map, in every world asked
 *   2. the world is built around it: no town, Bastion, Guild or slaver camp in the approach; no
 *      ruin, sundered site, redoubt, camp, massif or way down in the glass; no trade road through
 *      it; and nothing worldgen placed left standing in the glass
 *   3. the rim is a wall, and the breaches are the ways in: a path from the lip to the floor
 *      exists, never crosses the wall, and has to go round to a breach to get there
 *   4. the shape: a floor held above the water, a crest over five units high, the approach rising
 *      toward it; nothing grows in the glass; the approach keeps its (dead) trees
 *   5. the air changes: the fog over the crater is not the fog outside it, and the veil stands
 *   6. walking in says what it is, once each and in order, and opens a thread that points there
 *   7. a save from before the crater is refused, and says why
 *
 * Anything starting '!!' fails the build.
 *
 *   node tools/crater.js [game.html]
 */
const { chromium } = require('playwright');
const path = require('path');
const gamePath = (a) => path.resolve(a ? (path.isAbsolute(a) ? a : path.join(__dirname, a)) : path.join(__dirname, 'game.html'));

(async () => {
  const b = await chromium.launch({
    executablePath: process.env.DUSTWARD_CHROME || undefined,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'],
  });
  const out = {};
  const errs = [];
  const open = async (seed) => {
    const p = await b.newPage({ viewport: { width: 1000, height: 700 } });
    p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message.slice(0, 160)));
    await p.goto('file://' + gamePath(process.argv[2]) + (seed ? '?seed=' + seed : ''), { waitUntil: 'load', timeout: 120000 });
    await p.waitForSelector('#btn-start', { state: 'attached', timeout: 90000 });
    return p;
  };

  /* ---- 1 & 2, on two worlds ---- */
  for (const seed of [null, 1]) {
    const p = await open(seed);
    const r = await p.evaluate(() => {
      if (typeof CRATER === 'undefined') return { none: true };
      const bits = [];
      const at = CRATER.x === W / 2 && CRATER.y === H / 2;
      if (!at) bits.push(`it is at ${CRATER.x},${CRATER.y}, not the middle`);
      const R = CRATER;
      const within = (x, y, r) => craterD(x, y) < r;
      for (const t of towns) if (within(t.x, t.y, R.approach + 8)) bits.push(`${t.name} stands ${Math.round(craterD(t.x, t.y))} from the middle`);
      if (bastion && within(bastion.x, bastion.y, R.approach)) bits.push('the Bastion is in the approach');
      if (guild && within(guild.x, guild.y, R.approach)) bits.push('the Guild is in the approach');
      if (slaverCamp && within(slaverCamp.x, slaverCamp.y, R.approach)) bits.push('the slaver camp is in the approach');
      const inGlass = (list, name, xy) => { const n = list.filter(o => within(...xy(o), R.glass)).length; if (n) bits.push(`${n} ${name} in the glass`); };
      inGlass(ruins, 'ruins', o => [o.x, o.y]);
      inGlass(corpseSites, 'sundered sites', o => [o.x, o.y]);
      inGlass(redoubts, 'redoubts', o => [o.x, o.y]);
      inGlass(camps, 'camps', o => [o.x, o.y]);
      inGlass(mountains.map(m => ({ x: m.x, y: m.y })), 'massifs', o => [o.x, o.y]);
      inGlass(stairs.filter(s => s.from === 0 && s.to < 0), 'ways down', o => [o.x, o.y]);
      const roads = tradeRoutes.filter(rt => rt.wps.some(w => within(w.x, w.y, R.glass))).length;
      if (roads) bits.push(`${roads} trade roads run through the glass`);
      const strays = chars.filter(c => (c.floor || 0) === 0 && !c.craterOwn && within(c.x, c.y, R.glass)).map(c => c.name);
      if (strays.length) bits.push(`${strays.length} bodies left in the glass (${strays.slice(0, 3).join(', ')})`);
      const nearest = Math.min(...towns.map(t => craterD(t.x, t.y)));
      return { bits, nearest: Math.round(nearest), roads: tradeRoutes.length };
    });
    const tag = seed ? `seed ${seed}` : 'the default seed';
    if (r.none) { out['builtAround' + (seed || '')] = '!! THERE IS NO CRATER IN THIS BUILD'; await p.close(); continue; }
    out[seed ? 'builtAroundSeed1' : 'builtAround'] = r.bits.length ? `!! ${tag.toUpperCase()}: ${r.bits.join('; ').toUpperCase()}`
      : `on ${tag} it is at the dead centre, the nearest town is ${r.nearest} tiles out, nothing named or walled stands in the approach or the glass, and none of the ${r.roads} trade roads crosses it`;
    if (seed) { await p.close(); continue; }

    /* ---- 3 to 7, on the default world ---- */
    await p.waitForTimeout(1200);
    await p.evaluate(() => document.getElementById('btn-start').click());
    await p.waitForTimeout(2500);
    Object.assign(out, await p.evaluate(() => {
      const R = {};
      paused = true;
      const C = CRATER;
      /* ---- 3. the wall and the breaches ---- */
      {
        /* start on the lip halfway between two breaches, where the wall is as far from a way
           through as it gets, and ask for the middle of the floor */
        const bs = [...CRATER_BREACHES].map(a => ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)).sort((a, b) => a - b);
        let gapA = 0, gapW = -1;
        for (let i = 0; i < bs.length; i++) {
          const a0 = bs[i], a1 = i + 1 < bs.length ? bs[i + 1] : bs[0] + Math.PI * 2;
          if (a1 - a0 > gapW) { gapW = a1 - a0; gapA = (a0 + a1) / 2; }
        }
        const sx = C.x + Math.cos(gapA) * (C.rim + 7), sy = C.y + Math.sin(gapA) * (C.rim + 7);
        let wall = 0, ring = 0;
        for (let i = 0; i < 720; i++) { const a = i / 720 * Math.PI * 2; const Rr = C.rim + craterWobble(a) - 2.5;
          ring++; if (isBlocked(C.x + Math.cos(a) * Rr, C.y + Math.sin(a) * Rr)) wall++; }
        const pathIn = findPath(sx, sy, C.x + 5, C.y + 5);
        let crossed = 0;
        if (pathIn) for (const n of pathIn) {
          const a = craterAng(n.x, n.y), d = craterD(n.x, n.y), Rr = C.rim + craterWobble(a);
          if (d > Rr - 5.5 && d < Rr && craterBreachAt(a) < 0.35) crossed++;
        }
        const straight = dist(sx, sy, C.x + 5, C.y + 5);
        const walked = pathIn ? pathIn.reduce((acc, n, i) => i ? acc + dist(n.x, n.y, pathIn[i - 1].x, pathIn[i - 1].y) : 0, 0) : 0;
        const bits = [];
        if (wall / ring < 0.85) bits.push(`the wall covers only ${Math.round(100 * wall / ring)}% of the ring`);
        if (wall === ring) bits.push('the wall has no breach in it');
        if (!pathIn) bits.push('there is no way from the lip to the floor');
        else {
          if (crossed) bits.push(`the way in crosses the wall at ${crossed} steps`);
          if (walked < straight * 1.3) bits.push(`the way in is ${walked.toFixed(0)} tiles against ${straight.toFixed(0)} straight: it did not have to go round`);
        }
        R.theRimIsAWall = bits.length ? `!! ${bits.join('; ').toUpperCase()}`
          : `the inner wall stands on ${Math.round(100 * wall / ring)}% of the ring and ${CRATER_BREACHES.length} breaches open it; from the lip between two of them the way to the floor is ${walked.toFixed(0)} tiles against ${straight.toFixed(0)} straight, and never crosses the wall`;
      }
      /* ---- 4. the shape and the growth ---- */
      {
        const bits = [];
        let floorMax = -9, floorMin = 9;
        for (let i = 0; i < 60; i++) { const a = i * 0.7, d = (i % 10) * 6; const h = heightAt(C.x + Math.cos(a) * d, C.y + Math.sin(a) * d); floorMax = Math.max(floorMax, h); floorMin = Math.min(floorMin, h); }
        let crest = 0, n = 0;
        for (let i = 0; i < 360; i++) { const a = i / 360 * Math.PI * 2; if (craterBreachAt(a) > 0) continue; const Rr = C.rim + craterWobble(a); crest += heightAt(C.x + Math.cos(a) * (Rr + 1.5), C.y + Math.sin(a) * (Rr + 1.5)); n++; }
        crest /= n;
        const hIn = heightAt(C.x, C.y + C.glass), hOut = heightAt(C.x, C.y + C.approach + 20);
        if (floorMin < -0.14) bits.push(`the floor dips to ${floorMin.toFixed(2)}, under the water plane`);
        if (floorMax > 0.6) bits.push(`the floor rises to ${floorMax.toFixed(2)}`);
        if (crest < 5.5) bits.push(`the crest averages ${crest.toFixed(2)}`);
        if (!(hIn > hOut + 0.4)) bits.push(`the approach does not rise toward it (${hOut.toFixed(2)} outside, ${hIn.toFixed(2)} at the glass)`);
        let growsIn = 0, trees = 0;
        for (let y = C.y - C.glass; y < C.y + C.glass; y += 2) for (let x = C.x - C.glass; x < C.x + C.glass; x += 2) {
          if (craterD(x, y) >= C.glass) continue;
          const d0 = rawDecorAt(x, y); if (d0 === 'tree' || d0 === 'shrub') growsIn++;
        }
        for (let y = C.y - C.approach; y < C.y + C.approach; y += 2) for (let x = C.x - C.approach; x < C.x + C.approach; x += 2) {
          const d = craterD(x, y); if (d < C.glass || d >= C.approach) continue;
          if (rawDecorAt(x, y) === 'tree') trees++;
        }
        if (growsIn) bits.push(`${growsIn} living things grow in the glass`);
        if (!trees) bits.push('the approach has no trees left to stand dead in it');
        R.theShapeOfIt = bits.length ? `!! ${bits.join('; ').toUpperCase()}`
          : `a floor between ${floorMin.toFixed(2)} and ${floorMax.toFixed(2)}, a crest averaging ${crest.toFixed(1)}, the approach rising from ${hOut.toFixed(2)} to ${hIn.toFixed(2)}; nothing grows in the glass and the approach keeps ${trees} trees (sampled), drawn dead`;
      }
      /* ---- 5. the air ---- */
      {
        const far = { x: C.x, y: C.y + C.approach + 200 };
        const sample = (x, y) => { camX = camSX = x; camY = camSY = y; activeFloor = 0; hour = 12; updateSky(); return { c: scene.fog.color.getHex(), far: scene.fog.far }; };
        const out0 = sample(far.x, far.y), in0 = sample(C.x, C.y + 60);
        const bits = [];
        if (out0.c === in0.c) bits.push('the fog over the crater is the fog outside it');
        if (!(in0.far < out0.far)) bits.push('the fog does not draw in over the crater');
        if (typeof craterVeil === 'undefined' || !craterVeil.grp.visible) bits.push('there is no veil over the bowl');
        R.theAirChanges = bits.length ? `!! ${bits.join('; ').toUpperCase()}`
          : `the fog over the crater is #${in0.c.toString(16)} against #${out0.c.toString(16)} outside and draws in from ${out0.far.toFixed(0)} to ${in0.far.toFixed(0)}; the veil stands over the bowl`;
      }
      /* ---- 6. walking in ---- */
      {
        const me = player()[0];
        const lines = [];
        const _log = log; log = (t, k) => { lines.push(String(t)); return _log(t, k); };
        const heard = [];
        try {
          for (const [ring, d] of [['approach', 170], ['glass', 110], ['rim', 81.5], ['bowl', 30]]) {
            me.x = C.x + d; me.y = C.y; me.floor = 0;
            const n0 = lines.length;
            _crT = 0; craterTick(2);
            _crT = 0; craterTick(2);                                  /* and a second tick says nothing new */
            heard.push([ring, lines.slice(n0).filter(l => CRATER_LINES[ring].includes(l)).length, lines.length - n0]);
          }
        } finally { log = _log; }
        const th = threads.find(t => t.key === 'crater');
        const bits = [];
        for (const [ring, got] of heard) if (got !== CRATER_LINES[ring].length) bits.push(`the ${ring} said ${got} of its ${CRATER_LINES[ring].length} lines`);
        if (!th) bits.push('no thread was opened');
        else if (!th.mark || dist(th.mark.x, th.mark.y, C.x, C.y) > 1) bits.push('the thread does not point at the middle');
        R.walkingIn = bits.length ? `!! ${bits.join('; ').toUpperCase()}`
          : `walking in says the approach, the glass, the lip and the floor once each and in that order, and "The crater" goes in the journal marked at the middle`;
      }
      /* ---- 7. an old save ---- */
      {
        const lines = [];
        const _log = log; log = (t, k) => { lines.push(String(t)); return _log(t, k); };
        try { restore({ v: 20 }); } finally { log = _log; }
        R.oldSavesAreRefused = lines.some(l => /predates the crater/.test(l))
          ? 'a save from before the crater (v20) is refused, and the refusal says the crater is why'
          : `!! A V20 SAVE WAS NOT REFUSED FOR THE CRATER (${lines.join(' | ').slice(0, 120)})`;
      }
      return R;
    }));
    await p.close();
  }

  const bad = Object.values(out).filter(v => typeof v === 'string' && v.startsWith('!!'));
  for (const [k, v] of Object.entries(out)) console.log('  ' + k.padEnd(20) + ' ' + v);
  for (const e of errs) console.log('  ' + e);
  console.log('');
  console.log(bad.length || errs.length ? `*** THE CRATER IS WRONG (${bad.length + errs.length}) ***` : 'THE WORLD IS BUILT AROUND THE CRATER');
  await b.close();
  process.exit(bad.length || errs.length ? 1 : 0);
})();
