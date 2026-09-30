#!/usr/bin/env node
/* THE CRATER ON ITS HEADLAND IN THE NORTH-EAST.
 *
 * The lore bible puts the kingdom "at the centre", annihilated in brilliant light, and calls the
 * crater the largest landmark in the world. The world is now built around it. This asks, on two
 * seeds, whether it is where it says and whether everything else keeps out of it; and on the
 * default seed, whether the rim is a wall with ways through, whether its ground and its sky say
 * what it is, and whether walking in tells you so in order.
 *
 *   1. it stands on a headland in the north-east, in every world asked (moved there 2026-09-28,
 *      v24): the sea round its far side, a ridge on the landward side, and ONE gorge through it —
 *      shut, a flood from the bowl reaches nothing off the headland; open, you can walk in
 *   2. and the world keeps off the whole headland: no town, Bastion, Guild, slaver camp, ruin,
 *      sundered site, redoubt, camp, massif or way down on it; no trade road onto it; and nothing
 *      worldgen placed left standing on it
 *   3. the rim is a wall, and the breaches are the ways in: a path from the lip to the floor
 *      exists, never crosses the wall, and has to go round to a breach to get there
 *   4. the shape: a floor held above the water, a crest over five units high, the walk in rising
 *      toward it; nothing grows in the glass; the Ashfall and the Scorch keep their (dead) trees
 *   5. the air changes: the fog over the crater is not the fog outside it, and the veil stands
 *   6. walking in says what it is, stretch by stretch (the Marches, the Ashfall, the Scorch, the
 *      glass, the lip, the floor), once each and in order, opens a thread that points there, and
 *      moves the thread on at each
 *   7. a save from before the crater is refused, and says why
 *   8. the glass and the bowl are held, day and night: the crater's Watchers are placed, are not
 *      unmade at dawn, and the Messengers stand in the bowl at peace with the rest of them
 *   9. what is killed grows back, and never within sight of one of yours
 *  10. the light comes back at night: strikes are telegraphed, land on and around whoever of
 *      yours is in the glass, burn what they land on, and spare the Watchers; none by day
 *  11. the capital's footings stand in the bowl and a colonnade round the middle; nothing
 *      within twenty-four tiles of the centre but the colonnade, and every cache can be walked to
 *  12. the caches are there, and the one in the colonnade is the richest
 *  13. the Guardian at the Gate stands at the middle, a Messenger, at peace with what the
 *      crater keeps
 *  14. the Second Fracture opens the Door at the bottom of the bowl, and the Guardian is gone
 *      rather than dead
 *  15. killed first, it stays dead, something larger notices, and the sky comes on faster:
 *      the Fracture lurches at once and its daily rate goes up for the rest of the run
 *  (13b) and it fights like the second-to-last thing: 900 blood, a flight of Eyes over it, the
 *      light called down on whoever is at it, and a turn at two thirds of its blood
 *  16. the roads go round it: every town is on one network, no road comes inside the Ashfall,
 *      and a road whose line would cross the headland follows the ring outside the ridge (both seeds)
 *  17. and so does everybody on the world's business: a caravaneer and a soldier sent from one
 *      side of the headland to the other walk the ring round the ridge and arrive, a trip between towns the roads do not join directly is
 *      strung together from roads, and one of yours sent the same way goes where they are sent
 *  18. the walk in is gradual (phase 2, "more gradual, fitting for a final boss arena"): along the
 *      line from the gorge to the lip, the depth everything reads never falls and never jumps;
 *      the ground climbs through every stretch and has no cliff in it; the colour goes out of
 *      the dust stretch by stretch, darkens through the Scorch, and never changes at a line; the
 *      scrub is gone from the Ashfall in and the Scorch has fewer trees than the Ashfall
 *  19. the danger ramps: the Marches are safe (nothing native, nothing arrives by night on them or
 *      for anybody on them, and nothing on the headland follows anybody onto them); the Ashfall
 *      is empty by day and walked at night; the Scorch holds a few by day and more at night;
 *      the dawn takes the night's back; the light comes down in the Scorch at night, sparse and
 *      about half as hard, and not at all on the Marches; and a world where nobody goes onto
 *      the headland draws no dice for any of it
 *  20. the breaches face the gorge (phase 3): two, the main one within ten degrees of the gorge's
 *      bearing and wider, the flank fifty to seventy degrees round; none on the seaward half; a
 *      walk from the end of the road to the floor; two Watchers posted at each
 *  21. the pass is held: a barricade closes the gorge but for a gap; nobody holds it until one of
 *      yours comes near, then five of the Order and a Messenger (not counted abroad); they call
 *      it at thirty tiles without touching a party the Order has no quarrel with; at the
 *      barricade, from either side, all six close; they let go once you walk off; "stand aside"
 *      starts it; cleared, the post is made up a week on, never in sight; the save keeps it
 *  22. the way there: a road from the network to the Order's camp and no further, not a trade
 *      road (both seeds); asked for news, people tell of it with a bearing, which opens the
 *      journal marked at the pass, once; walking onto the Marches moves the mark to the middle
 *  23. the clock adds a little: nothing more at the start of the clock and no extra die; at the
 *      end never more than thirty percent, and only with yours on the headland
 *  24. nothing past the Marches: a wall is refused from the Ashfall in and in the gorge, allowed on
 *      the Marches; a Wayline Circle is refused on the headland and allowed outside the gorge
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
      if (typeof inHeadland !== 'function') return { none: true };
      /* 1. ON ITS HEADLAND: in the north-east quarter, the sea behind it, and the gorge the one
         way in — sealed, a flood of the ground floor from the bowl reaches nothing off the
         headland; open, there is a walk from the mouth of the gorge to the Ashfall */
      const R = CRATER;
      if (!(R.x > W * 0.75 && R.y < H * 0.25)) bits.push(`it is at ${R.x},${R.y}, not in the north-east`);
      let wet = 0, ring = 0;
      for (let a = -Math.PI; a < Math.PI; a += 0.02) {
        if (Math.cos(a - CRATER_GORGE_A) > -0.5) continue;     /* the half facing away from the mainland */
        const r2 = craterEdge(a) + R.ridge + 4; ring++;
        if (tileAt(R.x + Math.cos(a) * r2, R.y + Math.sin(a) * r2) === 3) wet++;
      }
      if (wet < ring * 0.8) bits.push(`only ${wet} of ${ring} points round its seaward side are sea`);
      const gorge = [], R1 = R.range + R.ridge + 10;
      for (let y = Math.floor(R.y - R1); y <= R.y + R1; y++) for (let x = Math.floor(R.x - R1); x <= R.x + R1; x++) {
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const d = craterD(x + 0.5, y + 0.5);
        if (d > R.range - 12 && d < R1 && inCraterGorge(x + 0.5, y + 0.5)) { const k = bkey(x, y, 0); if (!blocked.has(k)) { blocked.add(k); gorge.push(k); } }
      }
      const seen = new Uint8Array(W * H), q = [Math.floor(R.y) * W + Math.floor(R.x)];
      seen[q[0]] = 1; let leak = null;
      while (q.length && !leak) {
        const i = q.pop(), x = i % W, y = (i / W) | 0;
        if (!inHeadland(x, y)) { leak = { x, y }; break; }
        for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
          const nx = x + dx, ny = y + dy, k = ny * W + nx;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H || seen[k] || terr[k] === 3 || blocked.has(bkey(nx, ny, 0))) continue;
          seen[k] = 1; q.push(k);
        }
      }
      for (const k of gorge) blocked.delete(k);
      if (leak) bits.push(`with the gorge shut the headland still leaks, at ${leak.x},${leak.y}`);
      const mouth = { x: R.x + Math.cos(CRATER_GORGE_A) * (R1 + 12), y: R.y + Math.sin(CRATER_GORGE_A) * (R1 + 12) };
      const inner = { x: R.x + Math.cos(CRATER_GORGE_A) * R.ashfall, y: R.y + Math.sin(CRATER_GORGE_A) * R.ashfall };
      if (!findPath(mouth.x, mouth.y, inner.x, inner.y, 0, 200000)) bits.push('there is no walk in through the gorge');
      /* 2. and the world keeps off the whole headland, not only the glass */
      const on = (x, y) => inHeadland(x, y);
      for (const t of towns) if (on(t.x, t.y)) bits.push(`${t.name} stands on the headland`);
      if (bastion && on(bastion.x, bastion.y)) bits.push('the Bastion is on the headland');
      if (guild && on(guild.x, guild.y)) bits.push('the Guild is on the headland');
      if (slaverCamp && on(slaverCamp.x, slaverCamp.y)) bits.push('the slaver camp is on the headland');
      const onIt = (list, name, xy) => { const n = list.filter(o => on(...xy(o))).length; if (n) bits.push(`${n} ${name} on the headland`); };
      onIt(ruins, 'ruins', o => [o.x, o.y]);
      onIt(corpseSites, 'sundered sites', o => [o.x, o.y]);
      onIt(redoubts, 'redoubts', o => [o.x, o.y]);
      onIt(camps, 'camps', o => [o.x, o.y]);
      onIt(mountains.map(m => ({ x: m.x, y: m.y })), 'massifs', o => [o.x, o.y]);
      onIt(stairs.filter(s => s.from === 0 && s.to < 0), 'ways down', o => [o.x, o.y]);
      const roads = tradeRoutes.filter(rt => rt.wps.some(w => on(w.x, w.y))).length;
      if (roads) bits.push(`${roads} trade roads run onto the headland`);
      const strays = chars.filter(c => (c.floor || 0) === 0 && !c.craterOwn && !c.gatePost && c.state !== 'dead' && on(c.x, c.y)).map(c => c.name);
      if (strays.length) bits.push(`${strays.length} bodies left on the headland (${strays.slice(0, 3).join(', ')})`);
      const within = (x, y, r) => craterD(x, y) < r;
      /* 16. the roads */
      let roadNote = '';
      if (typeof craterRingNodes !== 'undefined') {
        const lab = towns.map((_, i) => i); const find = (i) => lab[i] === i ? i : (lab[i] = find(lab[i]));
        for (const rt of tradeRoutes) lab[find(rt.aI)] = find(rt.bI);
        const islands = towns.filter((_, i) => find(i) !== find(0)).map(t => t.name);
        if (islands.length) bits.push(`${islands.join(', ')} ${islands.length > 1 ? 'are' : 'is'} off the road network`);
        const inside = tradeRoutes.filter(rt => rt.wps.some(w => within(w.x, w.y, R.ashfall))).length;
        if (inside) bits.push(`${inside} roads come inside the Ashfall`);
        const gate = t => ({ x: t.x, y: t.y + (t.def.wall ? t.def.wall.r + 2 : 4) });
        const across = tradeRoutes.filter(rt => craterCrosses(gate(towns[rt.aI]).x, gate(towns[rt.aI]).y, gate(towns[rt.bI]).x, gate(towns[rt.bI]).y, CRATER_AVOID_R));
        const onRing = across.filter(rt => rt.wps.some(w => Math.abs(craterD(w.x, w.y) - CRATER_RING_R) < 20));
        if (onRing.length < across.length) bits.push(`${across.length - onRing.length} roads across the crater do not follow the ring`);
        roadNote = `; all ${towns.length} towns are on one network of ${tradeRoutes.length} roads, none inside the Ashfall, ${across.length} of them round the ring`;
      } else bits.push('there is no ring to route round in this build');
      const nearest = Math.min(...towns.map(t => craterD(t.x, t.y)));
      /* 22, first part: the road out to the Order's post, on this seed too */
      let passRoad;
      if (typeof craterRoad === 'undefined' || typeof passAt !== 'function') passRoad = '!! THERE IS NO ROAD TO THE PASS IN THIS BUILD';
      else {
        const w = craterRoad.wps, camp = passAt(20, 0), pb = [];
        let len = 0;
        for (let i = 1; i < w.length; i++) len += dist(w[i].x, w[i].y, w[i - 1].x, w[i - 1].y);
        if (w.length < 4) pb.push('there is no road out to the pass');
        else {
          const ends = [w[0], w[w.length - 1]];
          if (!ends.some(e => dist(e.x, e.y, camp.x, camp.y) < 8)) pb.push('the road does not end at the Order\'s camp');
          if (!ends.some(e => tradeRoutes.some(rt => rt.wps.some(q => dist(q.x, q.y, e.x, e.y) < 8)))) pb.push('the road does not join the network');
          const onto = w.filter(q => craterD(q.x, q.y) < craterEdge(craterAng(q.x, q.y)) + R.ridge).length;
          if (onto) pb.push(`${onto} of its waypoints are in the gorge or on the headland`);
          if (tradeRoutes.includes(craterRoad)) pb.push('it is a trade road');
        }
        passRoad = pb.length ? `!! ${pb.join('; ').toUpperCase()}`
          : `a road ${Math.round(len)} tiles long runs from the network out to the Order's camp at the mouth of the gorge and no further, and no caravan runs it`;
      }
      return { bits, nearest: Math.round(nearest), roads: tradeRoutes.length, roadNote, passRoad };
    });
    const tag = seed ? `seed ${seed}` : 'the default seed';
    if (r.none) { out['builtAround' + (seed || '')] = '!! THERE IS NO CRATER IN THIS BUILD'; await p.close(); continue; }
    out[seed ? 'theRoadToThePassSeed1' : 'theRoadToThePass'] = r.passRoad;
    out[seed ? 'builtAroundSeed1' : 'builtAround'] = r.bits.length ? `!! ${tag.toUpperCase()}: ${r.bits.join('; ').toUpperCase()}`
      : `on ${tag} it stands on its headland in the north-east, the sea round its far side and the gorge the only way in (shut, nothing off the headland can be reached from the bowl); the nearest town is ${r.nearest} tiles out, and nothing the world places stands on the headland${r.roadNote}`;
    if (seed) { await p.close(); continue; }

    /* ---- 3 to 7, on the default world ---- */
    await p.waitForTimeout(1200);
    await p.evaluate(() => document.getElementById('btn-start').click());
    await p.waitForTimeout(2500);
    Object.assign(out, await p.evaluate(() => {
      const R = {};
      paused = true;
      const C = CRATER;
      /* ---- 19, first part: nobody on the headland, nothing drawn. Asked first, while the glass
         and the bowl are full, so the crater's own restock draws nothing either ---- */
      {
        const s0 = seed, walkIn = () => chars.filter(c => ['scorch', 'scorchNight', 'ashfall'].includes(c.craterOwn) && c.state !== 'dead').length;
        const onHead = player().filter(c => inHeadland(c.x, c.y)).length;
        for (const hr of [12, 23]) { hour = hr; for (let i = 0; i < 200; i++) craterDangerTick(0.5); }
        R._noDice = onHead ? `!! ${onHead} OF YOURS START ON THE HEADLAND`
          : seed !== s0 || walkIn() ? `!! WITH NOBODY ON THE HEADLAND THE CRATER DREW DICE (${seed !== s0}) AND MADE ${walkIn()} OF THE WALK IN'S OWN` : 'ok';
        hour = 12;
      }
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
        const pathIn = findPath(sx, sy, C.x + 5, C.y + 5, 0, 200000);
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
        const hIn = heightAt(C.x, C.y + C.glass), hOut = heightAt(C.x, C.y + C.ashfall + 20);
        if (floorMin < -0.14) bits.push(`the floor dips to ${floorMin.toFixed(2)}, under the water plane`);
        if (floorMax > 0.6) bits.push(`the floor rises to ${floorMax.toFixed(2)}`);
        if (crest < 5.5) bits.push(`the crest averages ${crest.toFixed(2)}`);
        if (!(hIn > hOut + 0.4)) bits.push(`the walk in does not rise toward it (${hOut.toFixed(2)} in the Marches, ${hIn.toFixed(2)} at the glass)`);
        let growsIn = 0, trees = 0;
        for (let y = C.y - C.glass; y < C.y + C.glass; y += 2) for (let x = C.x - C.glass; x < C.x + C.glass; x += 2) {
          if (craterD(x, y) >= C.glass) continue;
          const d0 = rawDecorAt(x, y); if (d0 === 'tree' || d0 === 'shrub') growsIn++;
        }
        for (let y = C.y - C.ashfall; y < C.y + C.ashfall; y += 2) for (let x = C.x - C.ashfall; x < C.x + C.ashfall; x += 2) {
          const d = craterD(x, y); if (d < C.glass || d >= C.ashfall) continue;
          if (rawDecorAt(x, y) === 'tree') trees++;
        }
        if (growsIn) bits.push(`${growsIn} living things grow in the glass`);
        if (!trees) bits.push('the Ashfall and the Scorch have no trees left to stand dead in them');
        R.theShapeOfIt = bits.length ? `!! ${bits.join('; ').toUpperCase()}`
          : `a floor between ${floorMin.toFixed(2)} and ${floorMax.toFixed(2)}, a crest averaging ${crest.toFixed(1)}, the walk in rising from ${hOut.toFixed(2)} in the Marches to ${hIn.toFixed(2)} at the glass; nothing grows in the glass and the Ashfall and the Scorch keep ${trees} trees (sampled), drawn dead`;
      }
      /* ---- 5. the air ---- */
      {
        const far = { x: C.x, y: C.y + C.ashfall + 200 };
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
          /* down the gorge's own line, so every stand is on the headland whatever side it is */
          const A = CRATER_GORGE_A;
          for (const [ring, d] of typeof CRATER_STEPS === 'undefined' ? [] : [['marches', 222], ['ashfall', 180], ['scorch', 145], ['glass', 110], ['rim', 81.5], ['bowl', 30]]) {
            me.x = C.x + Math.cos(A) * d; me.y = C.y + Math.sin(A) * d; me.floor = 0;
            const n0 = lines.length;
            _crT = 0; craterTick(2);
            _crT = 0; craterTick(2);                                  /* and a second tick says nothing new */
            const th0 = threads.find(t => t.key === 'crater');
            heard.push([ring, lines.slice(n0).filter(l => CRATER_LINES[ring].includes(l)).length, craterRing(me.x, me.y), th0 ? th0.step : '']);
          }
        } finally { log = _log; }
        const th = threads.find(t => t.key === 'crater');
        const bits = [];
        for (const [ring, got, was, step] of heard) {
          if (was !== ring) bits.push(`the stand for the ${ring} is in the ${was}`);
          if (got !== CRATER_LINES[ring].length) bits.push(`the ${ring} said ${got} of its ${CRATER_LINES[ring].length} lines`);
          if (step !== CRATER_STEPS[ring]) bits.push(`the journal did not move on at the ${ring}`);
        }
        if (!heard.length) bits.push('the walk in has no stretches in this build');
        else if (!th) bits.push('no thread was opened');
        else if (!th.mark || dist(th.mark.x, th.mark.y, C.x, C.y) > 1) bits.push('the thread does not point at the middle');
        R.walkingIn = bits.length ? `!! ${bits.join('; ').toUpperCase()}`
          : `walking in says the Marches, the Ashfall, the Scorch, the glass, the lip and the floor once each and in that order; "The crater" goes in the journal marked at the middle and moves on at each`;
      }
      /* ---- 8. held, day and night ---- */
      {
        const own = (k) => chars.filter(c => c.craterOwn === k && c.state !== 'dead');
        const g0 = [...own('glass'), ...own('breach')], b0 = own('bowl'), m0 = own('messenger');
        const gWant = CRATER_POP.glass.want + (CRATER_POP.breach ? CRATER_POP.breach.want : 0);
        const bits = [];
        if (typeof CRATER_POP === 'undefined') bits.push('nothing lives in the crater in this build');
        else {
          if (g0.length < gWant) bits.push(`${g0.length} of ${gWant} hold the glass`);
          if (b0.length < CRATER_POP.bowl.want) bits.push(`${b0.length} of ${CRATER_POP.bowl.want} hold the bowl`);
          if (m0.length < CRATER_MESSENGERS) bits.push(`${m0.length} Messengers`);
          const off = [...g0, ...b0, ...m0].filter(c => { const r = craterRing(c.x, c.y); return c.craterOwn === 'glass' || c.craterOwn === 'breach' ? r !== 'glass' : r !== 'bowl'; });
          if (off.length) bits.push(`${off.length} stand outside their ring`);
          if (m0.some(m => !/Messenger/.test(m.name))) bits.push('a "Messenger" is not one');
          const peace = m0.every(m => [...g0, ...b0].every(g => !hostile(m, g)));
          if (!peace) bits.push('the Messengers are at war with the crater\'s Watchers');
          /* and the dawn */
          hour = 5.9; gauntDawn && gauntDawn();
          const g1 = own('glass').length + own('breach').length + own('bowl').length + own('messenger').length;
          if (g1 < g0.length + b0.length + m0.length) bits.push(`the dawn took ${g0.length + b0.length + m0.length - g1} of them`);
        }
        R.theCraterIsHeld = bits.length ? `!! ${bits.join('; ').toUpperCase()}`
          : `${g0.length} Watchers hold the glass (${own('breach').length} of them posted at the breaches) and ${b0.length} the bowl, with ${m0.length} Messengers at peace among them, and the dawn takes none of them`;
      }
      /* ---- 9. it grows back, unseen ---- */
      if (typeof CRATER_POP !== 'undefined') {
        const me = player()[0];
        const kill = (k) => { for (const c of chars) if (c.craterOwn === k && c.state !== 'dead') { c.state = 'dead'; } };
        kill('glass');
        /* one of yours stands in the glass; everything regrown must be out of their sight */
        me.x = CRATER.x + 105; me.y = CRATER.y; me.floor = 0;
        for (let i = 0; i < 400; i++) craterDangerTick(0.5);
        const regrown = chars.filter(c => c.craterOwn === 'glass' && c.state !== 'dead');
        const seen = regrown.filter(c => dist(c.x, c.y, me.x, me.y) < 36).length;
        R.itGrowsBack = regrown.length >= CRATER_POP.glass.want && !seen
          ? `a cleared glass regrows to ${regrown.length} over two hundred hours, and none of them inside thirty-six tiles of the one of yours standing in it`
          : `!! THE CLEARED GLASS REGREW ${regrown.length} OF ${CRATER_POP.glass.want}, ${seen} OF THEM IN SIGHT`;
      } else R.itGrowsBack = '!! NOTHING TO REGROW IN THIS BUILD';
      /* ---- 10. the light at night ---- */
      if (typeof strikeTick !== 'undefined') {
        const me = player()[0];
        for (const c of chars) if (c.craterOwn === 'glass' && c.state !== 'dead') c.state = 'dead';   /* nothing else in the glass hurting anybody */
        const hp = (o) => PARTS.reduce((a, k) => a + o.parts[k].hp, 0);
        me.x = CRATER.x + 105; me.y = CRATER.y; me.floor = 0; me.state = 'ok';
        for (const k of PARTS) { me.parts[k].hp = me.parts[k].max; me.parts[k].bleed = 0; }
        me.blood = me.maxBlood;
        const g = spawnGaunt('gaunt', me.x + 0.5, me.y); g.nightborn = false; g.noFight = true; g.x = me.x + 0.5; g.y = me.y; g.floor = 0;
        const gHp0 = hp(g);
        /* by day, nothing */
        hour = 12; craterStrikes.length = 0; _strikeT = 0;
        for (let i = 0; i < 300; i++) { strikeTick(1 / 30); me.x = CRATER.x + 105; me.y = CRATER.y; }
        const byDay = craterStrikes.length;
        /* by night: stand still for twenty seconds */
        hour = 23; _strikeT = 0;
        const hp0 = hp(me);
        let warned = 0, landed = 0, near = 0;
        const seenStrikes = new Set();
        for (let i = 0; i < 600; i++) {
          strikeTick(1 / 30);
          for (const st of craterStrikes) {
            if (!seenStrikes.has(st)) { seenStrikes.add(st); warned++; if (dist(st.x, st.y, me.x, me.y) < 8) near++; }
            if (st.hit && !st._counted) { st._counted = true; landed++; }
          }
          me.x = CRATER.x + 105; me.y = CRATER.y; g.x = me.x + 0.5; g.y = me.y;
          if (me.state === 'dead') break;
        }
        const took = hp0 - hp(me), gTook = gHp0 - hp(g);
        const bits = [];
        if (byDay) bits.push(`${byDay} strikes by day`);
        if (!warned) bits.push('no strike came in twenty seconds of night');
        if (warned && near < warned) bits.push(`${warned - near} strikes landed away from the one standing there`);
        if (!(took > 0)) bits.push('nothing burned the one standing in the glass');
        if (gTook > 0) bits.push(`the light burned the Watcher beside them (${gTook.toFixed(0)})`);
        R.theLightComesBack = bits.length ? `!! ${bits.join('; ').toUpperCase()}`
          : `none by day; at night ${warned} strikes in twenty seconds, each ringed on the glass for ${STRIKE_WARN}s before it lands, all within eight tiles of the one standing there, who lost ${took.toFixed(0)} across the body, while the Watcher beside them lost nothing`;
        chars.splice(chars.indexOf(g), 1);
      } else R.theLightComesBack = '!! NO LIGHT COMES DOWN IN THIS BUILD';
      /* ---- 11. the capital ---- */
      if (typeof CRATER_RUINS !== 'undefined') {
        const W0 = CRATER_RUINS.walls, bits = [];
        const inner = W0.filter(w => craterD(w.x + 0.5, w.y + 0.5) < 22).length;
        const blockedAll = craterRuinTiles().every(([x, y]) => isBlocked(x + 0.5, y + 0.5));
        if (W0.length < 150) bits.push(`only ${W0.length} wall stones stand`);
        if (inner) bits.push(`${inner} stones stand inside twenty-two tiles of the middle`);
        if (CRATER_RUINS.pillars.length !== 12) bits.push(`the colonnade has ${CRATER_RUINS.pillars.length} pillars`);
        if (!blockedAll) bits.push('some of the stone can be walked through');
        const from = { x: CRATER.x + 8, y: CRATER.y - 8 };
        const unreached = CRATER_RUINS.vaults.filter(v => !findPath(from.x, from.y, v.x, v.y));
        if (unreached.length) bits.push(`${unreached.length} caches cannot be walked to from the floor`);
        R.theCapitalStands = bits.length ? `!! ${bits.join('; ').toUpperCase()}`
          : `${W0.length} stones of the capital's footings stand on a turned grid, none inside the flash's twenty-four tiles but the colonnade of 12 (${CRATER_RUINS.pillars.filter(p => p.fallen).length} fallen), all of it solid, and every cache can be walked to from the floor`;
      } else R.theCapitalStands = '!! NO CAPITAL IN THIS BUILD';
      /* ---- 12. the caches ---- */
      {
        const cc = chests.filter(c => c.crater && !c.opened);
        const heart = CRATER_RUINS && chests.find(c => c.crater && c.vault && dist(c.x, c.y, CRATER.x, CRATER.y) < 14);
        const worth = (c) => (c.loot.cats || 0) + 200 * ((c.loot.items.formula_p || 0) + (c.loot.items.codex || 0));
        const richest = cc.length ? cc.reduce((a, b) => worth(b) > worth(a) ? b : a) : null;
        R.theCachesAreThere = cc.length >= 7 && heart && richest === heart
          ? `${cc.length} caches in the crater, and the one in the colonnade is the richest (${heart.loot.cats} coin, ${heart.loot.items.formula_p} preserved formulae, ${heart.loot.items.codex} codices)`
          : `!! ${cc.length} CACHES; THE COLONNADE'S IS ${heart ? (richest === heart ? 'RICHEST' : 'NOT THE RICHEST') : 'MISSING'}`;
      }
      /* ---- 13 to 15. the Guardian at the Gate and the Door ---- */
      {
        const cu = chars.find(c => c.bossKey === 'guardian' && c.state !== 'dead');
        const bits = [];
        if (!cu) bits.push('nobody stands at the middle');
        else {
          if (craterD(cu.x, cu.y) > 10) bits.push(`the Guardian stands ${craterD(cu.x, cu.y).toFixed(0)} from the middle`);
          if (cu.gauntKind !== 'messenger') bits.push('the Guardian is not a Messenger');
          if (cu.name !== 'The Guardian at the Gate') bits.push(`it is called ${cu.name}`);
          /* the Eyes open when one of yours first comes into the Ashfall, not at the making of
             the world: none before, and a flight once somebody is there */
          const eyes0 = chars.filter(c => c.craterOwn === 'gateEye' && c.state !== 'dead').length;
          if (!eyes0 || !cu.eyesUp) {
            const w = makeChar('Walker', 'player', CRATER.x + CRATER.ashfall - 20, CRATER.y, { tough: 90 }); w.__probe = true; w.floor = 0; chars.push(w);
            rebuildCharGrid(); guardianTick(1 / 30);
            chars.splice(chars.indexOf(w), 1); rebuildCharGrid();
          }
          const eyes = chars.filter(c => c.craterOwn === 'gateEye' && c.state !== 'dead');
          if (eyes0 && !cu.eyesUp) bits.push(`${eyes0} Eyes were over it before anybody came`);
          if (cu.maxBlood < 900) bits.push(`it has ${cu.maxBlood} blood`);
          if (eyes.length < 4 || eyes.some(e => hostile(cu, e))) bits.push(`${eyes.length} Eyes keep station over it${eyes.some(e => hostile(cu, e)) ? ', at war with it' : ''}`);
          const kept = chars.filter(c => (c.craterOwn === 'glass' || c.craterOwn === 'breach' || c.craterOwn === 'bowl' || c.craterOwn === 'messenger') && c.state !== 'dead');
          if (kept.some(g => hostile(cu, g))) bits.push('it is at war with the crater\'s own');
        }
        /* and it fights like the second-to-last thing: the light comes down on whoever is at it,
           and at two thirds of its blood the sky opens wider */
        if (cu) {
          const q = { x: cu.x + 6, y: cu.y };
          const f = makeChar('Challenger', 'player', q.x, q.y, { atk: 30, def: 30, tough: 90 }); f.__probe = true; f.noFight = true; chars.push(f);
          rebuildCharGrid();
          const s0 = craterStrikes.length; let called = 0;
          for (let i = 0; i < 30 * 12; i++) { const n0 = craterStrikes.length; guardianTick(1 / 30); strikeTick(1 / 30); if (craterStrikes.length > n0) called += craterStrikes.length - n0; }
          const e0 = chars.filter(c => c.craterOwn === 'gateEye' && c.state !== 'dead').length;
          cu.blood = cu.maxBlood * 0.6; guardianTick(1 / 30);
          const e1 = chars.filter(c => c.craterOwn === 'gateEye' && c.state !== 'dead').length;
          const turned = cu.gatePhase === 1 && e1 > e0;
          cu.blood = cu.maxBlood; cu.gatePhase = 0; craterStrikes.length = 0;
          for (let i = chars.length - 1; i >= 0; i--) if (chars[i].__probe) chars.splice(i, 1);
          rebuildCharGrid();
          R.theGuardianFights = called >= 2 && turned
            ? `with one of yours at it for twelve seconds it calls the light down ${called} times, and at two thirds of its blood it turns: ${e1 - e0} more Eyes and a ring of light`
            : `!! IN TWELVE SECONDS IT CALLED ${called} STRIKES; AT TWO THIRDS OF ITS BLOOD IT ${turned ? 'TURNED' : 'DID NOT TURN'} (EYES ${e0} -> ${e1})`;
        }
        R.theGuardianStands = bits.length ? `!! ${bits.join('; ').toUpperCase()}`
          : `the Guardian at the Gate, a Messenger with ${cu.maxBlood} blood and ${chars.filter(c => c.craterOwn === 'gateEye' && c.state !== 'dead').length} Eyes over it, stands ${craterD(cu.x, cu.y).toFixed(0)} tiles from the middle at peace with everything the crater keeps`;
        /* the Door */
        const ev0 = events.length;
        const d = openTheDoor();
        const gone = !chars.some(c => c.bossKey === 'guardian' && c.state !== 'dead');
        const said = events.slice(ev0).map(e => e.text || '').join(' ');
        R.theDoorOpensInTheBowl = d && dist(d.x, d.y, CRATER.x, CRATER.y) < 1 && gone && !bossSlain.guardian && /Guardian at the Gate is gone/.test(said) && broodAlive()
          ? 'at the Second Fracture the Door opens at the bottom of the bowl with the Brood in it, and the Guardian is gone from it, not killed'
          : `!! THE DOOR OPENED AT ${d ? Math.round(d.x) + ',' + Math.round(d.y) : 'NOWHERE'} (GUARDIAN ${gone ? 'gone' : 'still there'}, SLAIN ${!!bossSlain.guardian}, BROOD ${!!broodAlive()})`;
        /* killed first */
        const c2 = spawnGuardian();
        if (!c2) R.killedItStaysDead = '!! NO SECOND GUARDIAN COULD BE STOOD UP TO KILL';
        else {
          const n0 = noticed || 0, f0 = fracture, a0 = fractureAccel();
          kill(c2, player()[0]);
          const again = spawnGuardian();
          const lurch = fracture - f0, rate = fractureAccel() - a0;
          R.killedItStaysDead = bossSlain.guardian && (noticed || 0) > n0 && !again && Math.abs(lurch - GATE_LURCH) < 1e-6 && Math.abs(rate - GATE_RATE) < 1e-6
            ? `killed, it goes in the ledger, the Attention rises by ${((noticed || 0) - n0).toFixed(1)}, the Fracture lurches ${lurch.toFixed(1)} and runs ${rate.toFixed(2)} a day faster, and it does not come back`
            : `!! KILLED: LEDGER ${!!bossSlain.guardian}, ATTENTION ${n0} -> ${noticed}, FRACTURE +${lurch.toFixed(2)} (WANT ${GATE_LURCH}), RATE +${rate.toFixed(2)} (WANT ${GATE_RATE}), BACK AGAIN ${!!again}`;
          fracture = f0; fractureStage = fractureStageOf(f0);
        }
      }
      /* ---- 17. travellers go round ---- */
      if (typeof craterShuns !== 'undefined') {
        /* EITHER SIDE OF THE HEADLAND, ON THE MAINLAND. Staged across the middle of a crater
           that stood in the middle of the world; in the north-east corner both of those ends
           are out at sea. West of the ridge to south of it is a straight line that runs over
           the headland, which is the trip that has to go round. */
        const trip = (name, faction) => {
          const out = C.range + C.ridge + 70, aS = CRATER_GORGE_A + 0.75, aG = CRATER_GORGE_A - 0.75;
          const sx = C.x + Math.cos(aS) * out, sy = C.y + Math.sin(aS) * out;
          const gx = C.x + Math.cos(aG) * out, gy = C.y + Math.sin(aG) * out;
          const s0 = findOpenNear(sx, sy, 6), g0 = findOpenNear(gx, gy, 6);
          const c = makeChar(name, faction, s0.x, s0.y, { atk: 10, def: 10, tough: 60, ath: 6 });
          c.__probe = true; c.noFight = true; chars.push(c);
          let minD = 1e9, arrived = false, i = 0;
          for (; i < 16000 && !arrived; i++) { arrived = travel(c, g0.x, g0.y, 1 / 30, 1.5); minD = Math.min(minD, craterD(c.x, c.y)); }
          chars.splice(chars.indexOf(c), 1);
          return { minD, arrived, secs: i / 30 };
        };
        const cara = trip('Caravaneer', 'town'), sold = trip('Soldier', 'warband'), mine = trip('Sent', 'player');
        /* and a trip the roads do not make in one */
        let via = null;
        for (let i = 0; i < towns.length && !via; i++) for (let j = 0; j < towns.length && !via; j++) {
          if (i === j || routeFor(towns[i], towns[j])) continue;
          const rt = routeVia(towns[i], towns[j]);
          if (rt) via = { from: towns[i].name, to: towns[j].name, hops: rt.hops, minD: Math.min(...rt.wps.map(w => craterD(w.x, w.y))) };
        }
        const bits = [];
        for (const [who, t] of [['a caravaneer', cara], ['a soldier', sold]]) {
          if (!t.arrived) bits.push(`${who} sent across the map did not arrive in ${Math.round(t.secs)}s`);
          if (t.minD < C.ashfall) bits.push(`${who} came within ${Math.round(t.minD)} of the middle`);
        }
        /* NOT "WALKS IN BECAUSE YOU SENT THEM" ANY MORE: the ridge stands between, so one of yours
           goes round it too — not steered by the ring, but by the ground. What is asked is that
           the pathing finds its own way round and gets there. */
        if (!mine.arrived) bits.push(`one of yours sent the same way did not arrive in ${Math.round(mine.secs)}s`);
        if (via && via.minD < C.ashfall) bits.push(`the way from ${via.from} to ${via.to} comes within ${Math.round(via.minD)}`);
        R.travellersGoRound = bits.length ? `!! ${bits.join('; ').toUpperCase()}`
          : `sent from one side of the headland to the other, a caravaneer and a soldier walk the ring and arrive (${Math.round(cara.secs)}s and ${Math.round(sold.secs)}s, never nearer than ${Math.round(Math.min(cara.minD, sold.minD))} to the middle)` +
            `${via ? `; ${via.from} to ${via.to} is strung together from ${via.hops} roads and keeps ${Math.round(via.minD)} out` : ''}` +
            `; one of yours sent the same way is not steered by the ring, finds its own way round the ridge, and arrives (${Math.round(mine.secs)}s)`;
      } else R.travellersGoRound = '!! NOBODY IN THIS BUILD KNOWS TO GO ROUND';
      /* ---- 18. the walk in is gradual ---- */
      {
        const A = CRATER_GORGE_A, ux = Math.cos(A), uy = Math.sin(A), vx = -uy, vy = ux;
        const E = craterEdge(A), lip = C.rim + 14, bits = [], SC = C.scorch || 160, AF = C.ashfall || 200;
        const depthOf = typeof craterDepth === 'function' ? craterDepth : null;
        if (!depthOf) bits.push('there is no one depth that the walk in reads');
        const at = (r, side) => ({ x: C.x + ux * r + vx * side, y: C.y + uy * r + vy * side });
        /* the depth, a tile at a time, walking in */
        let prevK = -1, fell = 0, jump = 0;
        for (let r = E + 4; r >= C.glass; r -= 1) {
          const q = at(r, 0), k = depthOf ? depthOf(q.x, q.y) : 0;
          if (prevK >= 0) { if (k < prevK - 1e-9) fell++; jump = Math.max(jump, k - prevK); }
          prevK = k;
        }
        if (fell) bits.push(`the depth falls ${fell} times walking in`);
        if (jump > 0.02) bits.push(`the depth jumps ${jump.toFixed(3)} in one tile`);
        /* the ground: a band forty tiles across, averaged, climbs through every stretch; and no
           tile on the line steps more than half a unit (there is no cliff until the lip) */
        const band = (r) => { let h = 0, n = 0; for (let sd = -20; sd <= 20; sd += 4) { const q = at(r, sd); h += heightAt(q.x, q.y); n++; } return h / n; };
        const hs = [['the Marches', 218], ['the Ashfall', 180], ['the Scorch', 145], ['the glass', 112]].map(([nm, r]) => [nm, band(r)]);
        for (let i = 1; i < hs.length; i++) if (!(hs[i][1] > hs[i - 1][1] + 0.15)) bits.push(`the ground does not climb from ${hs[i - 1][0]} (${hs[i - 1][1].toFixed(2)}) to ${hs[i][0]} (${hs[i][1].toFixed(2)})`);
        let step = 0;
        for (let r = E - 1; r > lip; r -= 1) { const a0 = at(r, 0), a1 = at(r - 1, 0); step = Math.max(step, Math.abs(heightAt(a1.x, a1.y) - heightAt(a0.x, a0.y))); }
        if (step > 0.5) bits.push(`the ground steps ${step.toFixed(2)} in one tile on the way in`);
        /* the colour, read off the headland's own texture: averaged over a patch 48 tiles across
           and 4 deep every four tiles in, so it is the stretch and not the grain being measured */
        let tex = null;
        scene.traverse(o => { if (!tex && o.name === 'ground' && o.material.map && o.material.map.repeat.x > 1.01) tex = o.material.map; });
        let colNote = '';
        if (!tex) bits.push('the headland has no texture of its own');
        else {
          const img = tex.image, HLX = W / tex.repeat.x, HLY = H / tex.repeat.y, HX0 = -tex.offset.x * HLX, HY0 = (tex.offset.y - 1 + H / HLY) * HLY;
          const px = img.getContext('2d').getImageData(0, 0, img.width, img.height).data, kx = img.width / HLX, ky = img.height / HLY;
          const patch = (r) => {
            let rr = 0, gg = 0, bb = 0, n = 0;
            for (let dr = -2; dr <= 2; dr += 0.5) for (let sd = -24; sd <= 24; sd += 0.5) {
              const q = at(r + dr, sd), ix = Math.floor((q.x - HX0) * kx), iy = Math.floor((q.y - HY0) * ky), o = (iy * img.width + ix) * 4;
              rr += px[o]; gg += px[o + 1]; bb += px[o + 2]; n++;
            }
            rr /= n; gg /= n; bb /= n;
            return { lum: 0.3 * rr + 0.59 * gg + 0.11 * bb, chroma: Math.max(rr, gg, bb) - Math.min(rr, gg, bb) };
          };
          const P = []; for (let r = Math.floor(E) + 8; r >= C.glass - 12; r -= 4) P.push([r, patch(r)]);
          const by = (r) => P.reduce((a, b) => Math.abs(b[0] - r) < Math.abs(a[0] - r) ? b : a)[1];
          const mOut = by(E - 8), mar = by(AF + 8), ash = by(AF - 20), sco = by(SC - 15), gla = by(C.glass - 10);
          if (!(mOut.chroma > mar.chroma && mar.chroma > ash.chroma && ash.chroma > sco.chroma)) bits.push(`the colour does not go out of the dust stretch by stretch (chroma ${[mOut, mar, ash, sco].map(p => p.chroma.toFixed(1)).join(', ')})`);
          if (!(sco.lum < ash.lum - 15)) bits.push(`the Scorch is not darker than the Ashfall (${sco.lum.toFixed(0)} against ${ash.lum.toFixed(0)})`);
          if (!(gla.lum > sco.lum + 60)) bits.push(`the glass does not stand out of the Scorch (${gla.lum.toFixed(0)} against ${sco.lum.toFixed(0)})`);
          let worst = 0, worstR = 0;
          for (let i = 1; i < P.length; i++) { if (P[i - 1][0] > E - 4) continue; if (P[i][0] < C.glass + 12) break; const dl = Math.abs(P[i][1].lum - P[i - 1][1].lum); if (dl > worst) { worst = dl; worstR = P[i][0]; } }
          if (worst > 16) bits.push(`the ground changes by ${worst.toFixed(0)} in four tiles at ${worstR}: a line (${P.map(q => q[0] + ':' + q[1].lum.toFixed(0)).join(' ')})`);
          colNote = `; the colour goes out of it (chroma ${mOut.chroma.toFixed(0)} in the outer Marches, ${mar.chroma.toFixed(0)}, ${ash.chroma.toFixed(0)}, ${sco.chroma.toFixed(0)} in the Scorch), the Scorch darkens to ${sco.lum.toFixed(0)} against the Ashfall's ${ash.lum.toFixed(0)} and the glass stands at ${gla.lum.toFixed(0)}, and no four tiles on the way change it by more than ${worst.toFixed(0)}`;
        }
        /* what grows: no scrub from the Ashfall in, fewer trees in the Scorch than the Ashfall */
        let shrubs = 0, tA = 0, nA = 0, tS = 0, nS = 0;
        for (let y = C.y - AF; y < C.y + AF; y++) for (let x = C.x - AF; x < C.x + AF; x++) {
          const d = craterD(x, y); if (d < C.glass || d >= AF || terr[y * W + x] === 3) continue;
          const dd = rawDecorAt(x, y);
          if (dd === 'shrub') shrubs++;
          if (terr[y * W + x] === 0) { if (d < SC) { nS++; if (dd === 'tree') tS++; } else { nA++; if (dd === 'tree') tA++; } }
        }
        if (shrubs) bits.push(`${shrubs} shrubs grow in the Ashfall and the Scorch`);
        if (nS && nA && !(tS / nS < tA / nA * 0.8)) bits.push(`the Scorch keeps as many trees as the Ashfall (${(tS / nS * 100).toFixed(1)}% against ${(tA / nA * 100).toFixed(1)}%)`);
        R.theWalkInIsGradual = bits.length ? `!! ${bits.join('; ').toUpperCase()}`
          : `from the gorge to the lip the depth only ever grows, never more than ${jump.toFixed(3)} a tile; the ground climbs ${hs.map(h => h[1].toFixed(2)).join(' -> ')} through the Marches, the Ashfall, the Scorch and the glass, never stepping more than ${step.toFixed(2)} in a tile${colNote}; no scrub from the Ashfall in, and the Scorch keeps ${nS ? (tS / nS * 100).toFixed(1) : '-'}% of its trees to the Ashfall's ${nA ? (tA / nA * 100).toFixed(1) : '-'}%`;
      }
      /* ---- 19. the danger ramps ---- */
      if (typeof craterRefuge !== 'function' || !CRATER_POP.scorch) R.theDangerRamps = '!! THE WALK IN HOLDS NOTHING OF ITS OWN IN THIS BUILD, AND THE MARCHES ARE NO REFUGE';
      else {
        const bits = [];
        if (R._noDice !== 'ok') bits.push(R._noDice.replace(/^!! /, '').toLowerCase());
        const A = CRATER_GORGE_A, at = (r) => ({ x: C.x + Math.cos(A) * r, y: C.y + Math.sin(A) * r });
        const mine = player().filter(c => c.state !== 'dead');
        const home = mine.map(c => ({ c, x: c.x, y: c.y }));
        const standAll = (r) => mine.forEach((c, i) => { const q = at(r - (i % 3)); c.x = q.x + (i % 2); c.y = q.y; c.floor = 0; });
        const own = (k) => chars.filter(c => c.craterOwn === k && c.state !== 'dead');
        /* the Marches, by day: the Scorch fills, and nothing else */
        standAll(222); hour = 12;
        for (let i = 0; i < 20 * 240; i++) craterDangerTick(1 / 240);
        const dayS = own('scorch'), dayN = own('scorchNight').length + own('ashfall').length;
        if (dayS.length < CRATER_POP.scorch.want) bits.push(`by day only ${dayS.length} of ${CRATER_POP.scorch.want} hold the Scorch`);
        if (dayN) bits.push(`${dayN} of the night's are out by day`);
        if (dayS.some(g => craterRing(g.x, g.y) !== 'scorch')) bits.push('a Scorch post stands outside the Scorch');
        /* and by night: the Ashfall is walked and the Scorch thickens, all of it the night's */
        hour = 23;
        for (let i = 0; i < 20 * 240; i++) craterDangerTick(1 / 240);
        const nA = own('ashfall'), nS = own('scorchNight');
        if (nA.length < CRATER_POP.ashfall.want) bits.push(`at night only ${nA.length} of ${CRATER_POP.ashfall.want} walk the Ashfall`);
        if (nS.length < CRATER_POP.scorchNight.want) bits.push(`at night only ${nS.length} more come into the Scorch`);
        if ([...nA, ...nS].some(g => !g.nightborn)) bits.push('the night\'s own are not the night\'s');
        if (nA.some(g => craterRing(g.x, g.y) !== 'ashfall')) bits.push('an Ashfall post stands outside the Ashfall');
        const inSight = [...dayS, ...nA, ...nS].filter(g => mine.some(c => dist(c.x, c.y, g.x, g.y) < 36)).length;
        if (inSight) bits.push(`${inSight} were put down in sight of yours`);
        if (chars.some(c => c.faction === 'gaunt' && c.state !== 'dead' && !(c.floor || 0) && craterRefuge(c.x, c.y))) bits.push('something of the dark stands on the Marches');
        /* nothing arrives by night, for anybody on the Marches: and outside the gorge, it does */
        const arrivals = () => chars.filter(c => c.nightSpawn && c.state !== 'dead').length;
        const clearNight = () => { for (let i = chars.length - 1; i >= 0; i--) if (chars[i].nightSpawn) chars.splice(i, 1); };
        const s0 = seed;
        /* at A STILLNESS: in the first week of the clock the night sends nothing anywhere
           (LEGENDS FIRST), which would make the Marches prove nothing */
        const fr0 = fracture; fracture = Math.max(fracture, FRACTURE_STAGES[1].at); fractureStage = fractureStageOf(fracture);
        clearNight(); hour = 23;
        for (let i = 0; i < 60; i++) gauntTick(0.5);
        const onMarches = arrivals();
        clearNight(); standAll(C.range + C.ridge + 40);
        for (let i = 0; i < 60; i++) gauntTick(0.5);
        const outside = arrivals();
        clearNight();
        fracture = fr0; fractureStage = fractureStageOf(fracture);
        if (onMarches) bits.push(`${onMarches} came by night for the ones on the Marches`);
        if (!outside) bits.push('nothing came by night outside the gorge either, so the Marches prove nothing');
        /* the dawn takes the night's back */
        standAll(222); hour = 5.9; gauntDawn();
        const kept = own('ashfall').length + own('scorchNight').length;
        if (kept) bits.push(`the dawn left ${kept} of the night's`);
        if (own('scorch').length < dayS.length) bits.push('the dawn took the Scorch\'s own');
        /* the refuge: a Scorch post after one of yours lets go when they step onto the Marches */
        /* posted where it stands, so its own leash is not what lets go */
        const g = dayS[0], me = mine[0], post = g && { ...g.guard };
        const pull = (r) => { const q = at(r); me.x = q.x; me.y = q.y; const gq = at(C.ashfall - 3); g.x = gq.x + 0.5; g.y = gq.y; g.guard = { x: g.x, y: g.y }; g.target = me; g.path = null; rebuildCharGrid(); ai(g, 1 / 30); physics(g, 1 / 30); return g.target === me; };
        let lets = null, holds = null;
        if (g && me) { hour = 12; lets = !pull(C.ashfall + 12); holds = pull(C.ashfall - 12); g.guard = post; g.x = post.x; g.y = post.y; g.target = null; g.moveTarget = null; }
        if (lets === false) bits.push('a Watcher followed one of yours onto the Marches');
        if (holds === false) bits.push('a Watcher let go of one of yours in the Ashfall too, so the Marches prove nothing');
        /* the light in the Scorch: sparse, weak, at night; none on the Marches */
        const strikeRun = (r, secs) => {
          standAll(r); hour = 23; craterStrikes.length = 0; _strikeT = 0;
          const made = [], seen = new Set(); let tt = 0;
          for (let i = 0; i < secs * 30; i++) { strikeTick(1 / 30); tt += 1 / 30; for (const st of craterStrikes) if (!seen.has(st)) { seen.add(st); made.push({ t: tt, weak: !!st.weak }); } standAll(r); }
          craterStrikes.length = 0;
          return made;
        };
        for (const c of mine) { c.state = 'ok'; c.blood = c.maxBlood; for (const k of PARTS) { c.parts[k].hp = c.parts[k].max; c.parts[k].bleed = 0; } }
        const sc = strikeRun(145, 90), gl = strikeRun(110, 30), ma = strikeRun(222, 30);
        const gap = (m) => m.length > 1 ? (m[m.length - 1].t - m[0].t) / (m.length - 1) : Infinity;
        if (!sc.length) bits.push('no light came down in the Scorch in ninety seconds of night');
        if (sc.some(m => !m.weak)) bits.push('the Scorch\'s light is as hard as the glass\'s');
        if (gl.some(m => m.weak)) bits.push('the glass\'s light is weak');
        if (sc.length > 1 && !(gap(sc) > gap(gl) * 1.5)) bits.push(`the Scorch's light is not sparser (every ${gap(sc).toFixed(1)}s against ${gap(gl).toFixed(1)}s on the glass)`);
        if (ma.length) bits.push(`${ma.length} strikes on the Marches`);
        for (const h0 of home) { h0.c.x = h0.x; h0.c.y = h0.y; }
        for (const c of mine) { c.state = 'ok'; c.blood = c.maxBlood; for (const k of PARTS) { c.parts[k].hp = c.parts[k].max; c.parts[k].bleed = 0; } }
        hour = 12; rebuildCharGrid();
        R.theDangerRamps = bits.length ? `!! ${bits.join('; ').toUpperCase()}`
          : `nobody on the headland, no dice drawn; with yours on the Marches: by day ${dayS.length} hold the Scorch and nothing else is out, by night ${nA.length} walk the Ashfall and ${nS.length} more come into the Scorch, none put down in sight, and the dawn takes the night's back; thirty hours of night send nothing for the ones on the Marches (${outside} for the same party outside the gorge); a Watcher lets go of one of yours at the Marches and holds on in the Ashfall; the light comes down in the Scorch every ${gap(sc).toFixed(1)}s at half strength (${gap(gl).toFixed(1)}s on the glass) and never on the Marches`;
        delete R._noDice;
      }
      /* ---- 20. the breaches face the gorge ---- */
      if (typeof CRATER_BREACH_WS === 'undefined') R.theBreachesFaceTheGorge = '!! THE BREACHES ARE STILL WHEREVER THE SEED PUT THEM IN THIS BUILD';
      else {
        const bits = [], A = CRATER_GORGE_A;
        const off = (a, b) => Math.abs((((a - b) % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI) - Math.PI);
        const deg = (r) => Math.round(r * 180 / Math.PI);
        if (CRATER_BREACHES.length !== 2) bits.push(`there are ${CRATER_BREACHES.length} breaches`);
        const m = off(CRATER_BREACHES[0], A), f = off(CRATER_BREACHES[1], A);
        if (!(m <= 0.18)) bits.push(`the main breach is ${deg(m)} degrees off the gorge`);
        if (!(f >= 0.86 && f <= 1.23)) bits.push(`the flank breach is ${deg(f)} degrees off the gorge`);
        let openM = 0, openF = 0, seaward = 0;
        for (let i = 0; i < 3600; i++) {
          const a = i / 3600 * 2 * Math.PI, b = craterBreachAt(a);
          if (b >= 0.35) { if (off(a, CRATER_BREACHES[0]) < 0.2) openM++; else openF++; }
          if (Math.cos(a - A) < 0 && b > 0) seaward++;
        }
        const tiles = (n) => Math.round(n / 3600 * 2 * Math.PI * C.rim);
        if (seaward) bits.push('a breach opens on the seaward half');
        if (!(tiles(openM) > tiles(openF))) bits.push(`the main breach (${tiles(openM)} tiles) is no wider than the flank (${tiles(openF)})`);
        const q = passAt(24, 0), walk = findPath(q.x, q.y, C.x + 5, C.y + 5, 0, 400000);
        let used = '';
        if (!walk) bits.push('there is no walk from the end of the road to the floor');
        else {
          const at = walk.filter(n => { const d = craterD(n.x, n.y); return d < C.rim && d > C.rim - 12; });
          used = at.length ? (off(craterAng(at[0].x, at[0].y), CRATER_BREACHES[0]) < 0.25 ? 'the main breach' : 'the flank breach') : 'no breach';
        }
        const guards = chars.filter(c => c.craterOwn === 'breach' && c.state !== 'dead' && c.guard);
        const per = CRATER_BREACHES.map(b => guards.filter(g => off(craterAng(g.guard.x, g.guard.y), b) < 0.12 && craterD(g.guard.x, g.guard.y) > C.rim).length);
        if (per.some(n => n < 2)) bits.push(`the breaches are held by ${per.join(' and ')}`);
        R.theBreachesFaceTheGorge = bits.length ? `!! ${bits.join('; ').toUpperCase()}`
          : `two breaches: the main one ${deg(m)} degrees off the gorge's bearing and ${tiles(openM)} tiles open, the flank ${deg(f)} degrees round and ${tiles(openF)} open, none on the seaward half; from the end of the road to the floor is a walk of ${walk.length} steps through the pass and ${used}; two Watchers posted at each`;
      }
      /* ---- 21. the pass is held ---- */
      if (typeof passTick !== 'function') R.thePassIsHeld = '!! NOBODY HOLDS THE PASS IN THIS BUILD';
      else {
        const bits = [], me = player()[0], home = { x: me.x, y: me.y };
        const at = (out) => { const q = passAt(out, 0); me.x = q.x; me.y = q.y; me.floor = 0; me.state = 'ok'; rebuildCharGrid(); _passT = 0; passTick(1 / 30); };
        /* the barricade, and the gap the only way through it */
        const gt = passGateTiles();
        if (gt.length < 8) bits.push(`the barricade is ${gt.length} tiles`);
        if (gt.some(([x, y]) => !isBlocked(x + 0.5, y + 0.5))) bits.push('some of the barricade can be walked through');
        const gap = [];
        for (let y = Math.floor(PASS.y - 4); y <= PASS.y + 4; y++) for (let x = Math.floor(PASS.x - 4); x <= PASS.x + 4; x++) {
          const dx = x + 0.5 - PASS.x, dy = y + 0.5 - PASS.y, a = dx * PASS.ux + dy * PASS.uy, l = dx * PASS.vx + dy * PASS.vy;
          if (Math.abs(a) <= 1.05 && Math.abs(l) < 1.8) { const k = bkey(x, y, 0); if (!blocked.has(k)) { blocked.add(k); gap.push(k); } }
        }
        const reach = () => {
          const s = passAt(-8, 0), g = passAt(12, 0), seen = new Uint8Array(W * H), qq = [Math.floor(s.y) * W + Math.floor(s.x)];
          seen[qq[0]] = 1;
          while (qq.length) {
            const i = qq.pop(), x = i % W, y = (i / W) | 0;
            if (dist(x + 0.5, y + 0.5, g.x, g.y) < 1.5) return true;
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
              const nx = x + dx, ny = y + dy, k = ny * W + nx;
              if (nx < 0 || ny < 0 || nx >= W || ny >= H || seen[k] || terr[k] === 3 || blocked.has(bkey(nx, ny, 0))) continue;
              seen[k] = 1; qq.push(k);
            }
          }
          return false;
        };
        const shut = reach();
        for (const k of gap) blocked.delete(k);
        const open = reach();
        if (shut) bits.push('the barricade does not close the gorge even with the gap stopped');
        if (!open) bits.push('there is no way through the gap');
        /* not manned until somebody comes near */
        if (passGarrison().length || passState.manned) bits.push('the post was manned before anybody came near it');
        const abroad0 = messengersAbroad();
        at(60);
        const G = passGarrison(), pal = G.filter(c => c.faction === 'purge'), msg = G.filter(c => messengerKind(c));
        if (G.length !== 6) bits.push(`${G.length} hold the pass`);
        if (pal.length !== 5 || msg.length !== 1 || (msg[0] && msg[0].faction !== 'messenger')) bits.push(`the post is ${G.map(c => c.name).join(', ')}`);
        if (messengersAbroad() !== abroad0) bits.push('the post\'s Messenger counts against the ones abroad');
        /* told at thirty tiles, fought at the barricade, from either side; let go at a distance */
        const lines = [];
        const _log = log; log = (t, k) => { lines.push(String(t)); return _log(t, k); };
        let warned = false, early = false, war = false, set = 0, inside = false, calm = false;
        try {
          at(25);
          warned = lines.some(l => /Nobody goes through/.test(l));
          early = passState.alarm || pal.some(c => hostile(c, me));
          at(3);
          war = passState.alarm && pal.every(c => hostile(c, me)) && msg.every(c => hostile(c, me));
          set = G.filter(c => c.target === me).length;
          at(45); calm = !passState.alarm && !pal.some(c => hostile(c, me));
          at(-6); inside = passState.alarm;
          at(45);
        } finally { log = _log; }
        if (!warned) bits.push('nobody called out at thirty tiles');
        if (early) bits.push('they fought one of yours the Order had no quarrel with, short of the barricade');
        if (!war) bits.push('the post did not close at the barricade');
        if (set < G.length) bits.push(`only ${set} of ${G.length} came at the one at the barricade`);
        if (!inside) bits.push('coming out, the post let them by');
        if (!calm) bits.push('the post was still at war once they had walked off');
        /* the one way through them they offer */
        passState.alarm = false;
        TALK_TREES.pass.aside.opts[0].fn();
        if (!passState.alarm) bits.push('"stand aside" did not start the fight');
        passState.alarm = false; passState.warned = false;
        /* cleared, it is made up a week on, never in sight of yours */
        for (const c of passGarrison()) c.state = 'dead';
        const d0 = day;
        at(80);
        const atOnce = passGarrison().length;
        day = d0 + 8; at(30); const inSight = passGarrison().length;
        at(80); const madeUp = passGarrison().length;
        day = d0;
        if (atOnce) bits.push('a cleared post was made up at once');
        if (inSight) bits.push('the post was made up in sight of yours');
        if (madeUp !== 6) bits.push(`a week on the post has ${madeUp}`);
        /* and it is kept */
        const snap = snapshot();
        const kept = snap.passS && snap.passS.manned && snap.chars.filter(s => s.gatePost && s.state !== 'dead').length === 6;
        if (!kept) bits.push('the save does not keep the post');
        passState.alarm = false; passState.warned = false;
        me.x = home.x; me.y = home.y; rebuildCharGrid();
        R.thePassIsHeld = bits.length ? `!! ${bits.join('; ').toUpperCase()}`
          : `a barricade of ${gt.length} tiles closes the gorge but for a gap; nobody holds it until one of yours comes within ${PASS_MAN_R} tiles, and then five of the Order and a Messenger (not counted among the ones abroad); at thirty tiles they call it, and a party the Order has no quarrel with is not touched; at the barricade, from outside or in, all six close on the one of yours and let go once they walk off; "stand aside" starts it; cleared, the post is made up a week on and not in sight of yours, and the save keeps it`;
      }
      /* ---- 22, second part: the rumour, and the journal ---- */
      if (typeof craterRumor !== 'function') R.theWayThereIsTold = '!! NOBODY TALKS ABOUT THE CRATER IN THIS BUILD';
      else {
        const bits = [];
        const i0 = threads.findIndex(t => t.key === 'crater'), saved = i0 >= 0 ? threads.splice(i0, 1)[0] : null;
        const seenK = Object.keys(placesSeen).filter(k => k.startsWith('crater_')), seenV = seenK.map(k => placesSeen[k]);
        for (const k of seenK) delete placesSeen[k];
        const t0 = towns[0], speaker = { x: t0.x, y: t0.y, homeTown: t0 }, gate = passAt(20, 0), dir = compassFrom(t0.x, t0.y, gate.x, gate.y);
        let heard = 0;
        for (let i = 0; i < 400; i++) {
          const l = makeRumor(speaker);
          if (/There is a crater out/.test(l)) { heard++; const j = threads.findIndex(t => t.key === 'crater'); if (i < 399 && j >= 0) threads.splice(j, 1); }
        }
        const j0 = threads.findIndex(t => t.key === 'crater'); if (j0 >= 0) threads.splice(j0, 1);
        const line = craterRumor(speaker), th = threadOf('crater');
        if (!heard) bits.push('four hundred asks for news never mentioned it');
        if (!line.includes(dir)) bits.push(`the rumour does not say ${dir}`);
        if (!th || !th.mark || dist(th.mark.x, th.mark.y, gate.x, gate.y) > 1) bits.push('hearing it does not mark the pass in the journal');
        const again = craterRumor(speaker);
        if (threads.filter(t => t.key === 'crater').length !== 1) bits.push('hearing it twice opened it twice');
        const me = player()[0], home = { x: me.x, y: me.y };
        me.x = C.x + Math.cos(CRATER_GORGE_A) * 222; me.y = C.y + Math.sin(CRATER_GORGE_A) * 222; me.floor = 0;
        _crT = 0; craterTick(2);
        const th2 = threadOf('crater');
        if (!th2 || !th2.mark || dist(th2.mark.x, th2.mark.y, C.x, C.y) > 1) bits.push('walking onto the Marches did not move the mark to the middle');
        me.x = home.x; me.y = home.y;
        const j1 = threads.findIndex(t => t.key === 'crater'); if (j1 >= 0) threads.splice(j1, 1);
        if (saved) threads.push(saved);
        seenK.forEach((k, i) => { placesSeen[k] = seenV[i]; });
        R.theWayThereIsTold = bits.length ? `!! ${bits.join('; ').toUpperCase()}`
          : `asked for news, ${heard} in four hundred tell of a crater out ${dir} behind a ridge with the Order at the only gap; hearing it opens "The crater" marked at the Order's post, once, and walking onto the Marches moves the mark to the middle`;
      }
      /* ---- 23. the clock adds a little ---- */
      if (typeof craterWant !== 'function') R.theClockAddsALittle = '!! THE CRATER DOES NOT GROW WITH THE CLOCK IN THIS BUILD';
      else {
        const bits = [], fs0 = fractureStage, nt0 = noticeTier, keys = Object.keys(CRATER_POP);
        fractureStage = 0; noticeTier = 0;
        const t0 = keys.filter(k => craterWant(k, true) !== CRATER_POP[k].want);
        const P = CRATER_POP.glass, s0 = seed;
        craterKind(P); const s1 = seed; seed = s0; pick(P.kinds); const s2 = seed; seed = s0;
        fractureStage = 9; noticeTier = 5;
        const top = keys.map(k => [k, craterWant(k, true), craterWant(k, false), CRATER_POP[k].want]);
        fractureStage = fs0; noticeTier = nt0;
        if (t0.length) bits.push(`at the start of the clock ${t0.join(', ')} already want more`);
        if (s1 !== s2) bits.push('at the start of the clock the mix draws an extra die');
        const over = top.filter(([, w, , b]) => w > Math.round(b * 1.3));
        if (over.length) bits.push(`at the end of the clock ${over.map(([k, w, , b]) => `${k} wants ${w} of ${b}`).join(', ')}`);
        const away = top.filter(([, , o, b]) => o !== b);
        if (away.length) bits.push('with nobody on the headland it still grows');
        if (!top.some(([, w, , b]) => w > b)) bits.push('nothing grows at the end of the clock');
        R.theClockAddsALittle = bits.length ? `!! ${bits.join('; ').toUpperCase()}`
          : `at the start of the clock every stretch wants what it always did and the mix draws no extra die; at the end, with yours on the headland, ${top.map(([k, w, , b]) => `${k} ${b} -> ${w}`).join(', ')} (never over thirty percent), and with nobody there, the old numbers`;
      }
      /* ---- 24. nothing past the Marches ---- */
      {
        const bits = [], A = CRATER_GORGE_A;
        const openNear = (r) => {
          for (let k = 0; k < 80; k++) {
            const a = A + (k % 2 ? 1 : -1) * Math.floor(k / 2) * 0.012;
            const x = Math.floor(C.x + Math.cos(a) * r), y = Math.floor(C.y + Math.sin(a) * r);
            if ([[0, 0], [1, 0], [0, 1], [1, 1]].every(([ox, oy]) => !isBlocked(x + ox + 0.5, y + oy + 0.5))) return { x, y };
          }
          return null;
        };
        const wl0 = research.done.waylines, af0 = activeFloor;
        research.done.waylines = true; activeFloor = 0;
        const tryAt = (type, q) => { if (!q) return null; const n0 = blueprints.length; const ok = !!tryBuild(type, q.x, q.y, true); if (blueprints.length > n0) blueprints.length = n0; return ok; };
        const open2 = (p) => {
          for (let r = 0; r < 8; r++) for (let k = 0; k < 16; k++) {
            const x = Math.floor(p.x + Math.cos(k / 16 * Math.PI * 2) * r), y = Math.floor(p.y + Math.sin(k / 16 * Math.PI * 2) * r);
            if ([[0, 0], [1, 0], [0, 1], [1, 1]].every(([ox, oy]) => !isBlocked(x + ox + 0.5, y + oy + 0.5) && tileAt(x + ox, y + oy) !== 3)) return { x, y };
          }
          return { x: Math.floor(p.x), y: Math.floor(p.y) };
        };
        const along = (r) => ({ x: C.x + Math.cos(A) * r, y: C.y + Math.sin(A) * r }), E = craterEdge(A);
        const gIn = open2(along(E + 10)), gOut = open2(along(E + C.ridge + 40));
        const cases = [
          ['a wall on the Marches', 'wall', openNear(222), true],
          ['a wall in the Ashfall', 'wall', openNear(180), false],
          ['a wall in the Scorch', 'wall', openNear(145), false],
          ['a wall on the glass', 'wall', openNear(110), false],
          ['a wall in the gorge', 'wall', gIn, false],
          ['a Wayline Circle on the Marches', 'way', openNear(222), false],
          ['a Wayline Circle outside the gorge', 'way', gOut, true],
        ];
        const got = cases.map(([nm, type, q, want]) => [nm, tryAt(type, q), want]);
        research.done.waylines = wl0; activeFloor = af0;
        for (const [nm, ok, want] of got) if (ok !== want) bits.push(`${nm} was ${ok === null ? 'not tried (no open ground)' : ok ? 'allowed' : 'refused'}`);
        R.nothingPastTheMarches = bits.length ? `!! ${bits.join('; ').toUpperCase()}`
          : 'a wall can be staked on the Marches and nowhere further in (the Ashfall, the Scorch, the glass) nor in the gorge; a Wayline Circle is refused on the Marches and allowed on the mainland outside the gorge';
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
