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
 *  16. the roads go round it: every town is on one network, no road comes inside the approach,
 *      and a road between towns on opposite sides follows the ring (both seeds)
 *  17. and so does everybody on the world's business: a caravaneer and a soldier sent across
 *      the map walk the ring and arrive, a trip between towns the roads do not join directly is
 *      strung together from roads, and one of yours sent the same way goes where they are sent
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
      /* 16. the roads */
      let roadNote = '';
      if (typeof craterRingNodes !== 'undefined') {
        const lab = towns.map((_, i) => i); const find = (i) => lab[i] === i ? i : (lab[i] = find(lab[i]));
        for (const rt of tradeRoutes) lab[find(rt.aI)] = find(rt.bI);
        const islands = towns.filter((_, i) => find(i) !== find(0)).map(t => t.name);
        if (islands.length) bits.push(`${islands.join(', ')} ${islands.length > 1 ? 'are' : 'is'} off the road network`);
        const inside = tradeRoutes.filter(rt => rt.wps.some(w => within(w.x, w.y, R.approach))).length;
        if (inside) bits.push(`${inside} roads come inside the approach`);
        const gate = t => ({ x: t.x, y: t.y + (t.def.wall ? t.def.wall.r + 2 : 4) });
        const across = tradeRoutes.filter(rt => craterCrosses(gate(towns[rt.aI]).x, gate(towns[rt.aI]).y, gate(towns[rt.bI]).x, gate(towns[rt.bI]).y, CRATER_AVOID_R));
        const onRing = across.filter(rt => rt.wps.some(w => Math.abs(craterD(w.x, w.y) - CRATER_RING_R) < 20));
        if (onRing.length < across.length) bits.push(`${across.length - onRing.length} roads across the crater do not follow the ring`);
        roadNote = `; all ${towns.length} towns are on one network of ${tradeRoutes.length} roads, none inside the approach, ${across.length} of them round the ring`;
      } else bits.push('there is no ring to route round in this build');
      const nearest = Math.min(...towns.map(t => craterD(t.x, t.y)));
      return { bits, nearest: Math.round(nearest), roads: tradeRoutes.length, roadNote };
    });
    const tag = seed ? `seed ${seed}` : 'the default seed';
    if (r.none) { out['builtAround' + (seed || '')] = '!! THERE IS NO CRATER IN THIS BUILD'; await p.close(); continue; }
    out[seed ? 'builtAroundSeed1' : 'builtAround'] = r.bits.length ? `!! ${tag.toUpperCase()}: ${r.bits.join('; ').toUpperCase()}`
      : `on ${tag} it is at the dead centre, the nearest town is ${r.nearest} tiles out, nothing named or walled stands in the approach or the glass${r.roadNote}`;
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
      /* ---- 8. held, day and night ---- */
      {
        const own = (k) => chars.filter(c => c.craterOwn === k && c.state !== 'dead');
        const g0 = own('glass'), b0 = own('bowl'), m0 = own('messenger');
        const bits = [];
        if (typeof CRATER_POP === 'undefined') bits.push('nothing lives in the crater in this build');
        else {
          if (g0.length < CRATER_POP.glass.want) bits.push(`${g0.length} of ${CRATER_POP.glass.want} hold the glass`);
          if (b0.length < CRATER_POP.bowl.want) bits.push(`${b0.length} of ${CRATER_POP.bowl.want} hold the bowl`);
          if (m0.length < CRATER_MESSENGERS) bits.push(`${m0.length} Messengers`);
          const off = [...g0, ...b0, ...m0].filter(c => { const r = craterRing(c.x, c.y); return c.craterOwn === 'glass' ? r !== 'glass' : r !== 'bowl'; });
          if (off.length) bits.push(`${off.length} stand outside their ring`);
          if (m0.some(m => !/Messenger/.test(m.name))) bits.push('a "Messenger" is not one');
          const peace = m0.every(m => [...g0, ...b0].every(g => !hostile(m, g)));
          if (!peace) bits.push('the Messengers are at war with the crater\'s Watchers');
          /* and the dawn */
          hour = 5.9; gauntDawn && gauntDawn();
          const g1 = own('glass').length + own('bowl').length + own('messenger').length;
          if (g1 < g0.length + b0.length + m0.length) bits.push(`the dawn took ${g0.length + b0.length + m0.length - g1} of them`);
        }
        R.theCraterIsHeld = bits.length ? `!! ${bits.join('; ').toUpperCase()}`
          : `${g0.length} Watchers hold the glass and ${b0.length} the bowl, with ${m0.length} Messengers at peace among them, and the dawn takes none of them`;
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
          const kept = chars.filter(c => (c.craterOwn === 'glass' || c.craterOwn === 'bowl' || c.craterOwn === 'messenger') && c.state !== 'dead');
          if (kept.some(g => hostile(cu, g))) bits.push('it is at war with the crater\'s own');
        }
        R.theGuardianStands = bits.length ? `!! ${bits.join('; ').toUpperCase()}`
          : `the Guardian at the Gate, a Messenger with ${cu.maxBlood} blood, stands ${craterD(cu.x, cu.y).toFixed(0)} tiles from the middle at peace with everything the crater keeps`;
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
        const trip = (name, faction) => {
          const a = 0.9, sx = C.x + Math.cos(a) * 300, sy = C.y + Math.sin(a) * 300;
          const gx = C.x - Math.cos(a) * 300, gy = C.y - Math.sin(a) * 300;
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
          if (t.minD < C.approach) bits.push(`${who} came within ${Math.round(t.minD)} of the middle`);
        }
        if (!(mine.minD < C.approach)) bits.push(`one of yours sent straight across kept out too (${Math.round(mine.minD)})`);
        if (via && via.minD < C.approach) bits.push(`the way from ${via.from} to ${via.to} comes within ${Math.round(via.minD)}`);
        R.travellersGoRound = bits.length ? `!! ${bits.join('; ').toUpperCase()}`
          : `sent across the map, a caravaneer and a soldier walk the ring and arrive (${Math.round(cara.secs)}s and ${Math.round(sold.secs)}s, never nearer than ${Math.round(Math.min(cara.minD, sold.minD))} to the middle)` +
            `${via ? `; ${via.from} to ${via.to} is strung together from ${via.hops} roads and keeps ${Math.round(via.minD)} out` : ''}` +
            `; one of yours sent the same way walks in to ${Math.round(mine.minD)}, because you sent them`;
      } else R.travellersGoRound = '!! NOBODY IN THIS BUILD KNOWS TO GO ROUND';
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
