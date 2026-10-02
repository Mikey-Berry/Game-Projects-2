#!/usr/bin/env node
/* A SKYLINE TO STEER BY.
 *
 * "I do like the idea of a unique skyline. Let's: make the sundered sites bigger, and only named
 *  once reached; add golden age tower ruins; add a massive, toppled [...] Project ARK."
 *
 * With the map drawn whole (tools/fog.js) the things that stand up off it are what a player reads
 * the country by. The Sundered sites' own claims are in tools/sundered.js. This file holds the
 * rest, one group per piece as each lands:
 *
 *   1. the Golden-Age towers: about six to a 1440-square of map, spread out, clear of every town,
 *      road, hamlet and Sundered site; all three ways a tower ends up (standing, leaning, snapped)
 *      are on the map; each is drawn, and as tall as it says it is
 *   2. they are things: the foot is solid, a snapped tower's fallen length is solid along where it
 *      lies, nothing grows through either, and all of it is still solid after a reload
 *   3. each has a cache at its foot, on ground you can stand on
 *   4. a tower is named only once one of yours stands at it, not when it is seen from far off,
 *      and the save remembers which
 *
 * Anything starting '!!' fails the build.
 *
 *   node tools/skyline.js [game.html]
 */
const { chromium } = require('playwright');
const path = require('path');
const gamePath = (a) => path.resolve(a ? (path.isAbsolute(a) ? a : path.join(__dirname, a)) : path.join(__dirname, 'game.html'));

(async () => {
  const b = await chromium.launch({
    executablePath: process.env.DUSTWARD_CHROME || undefined,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'],
  });
  const p = await b.newPage({ viewport: { width: 900, height: 620 } });
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message.slice(0, 160)));
  await p.goto('file://' + gamePath(process.argv[2]), { waitUntil: 'load', timeout: 120000 });
  await p.waitForSelector('#btn-start', { state: 'attached', timeout: 120000 });
  await p.evaluate(() => { document.getElementById('btn-start').click(); paused = true; });
  await p.waitForFunction(() => { try { return player().length > 0; } catch (e) { return false; } }, null, { timeout: 180000, polling: 1000 });
  await p.waitForTimeout(2000);

  const out = await p.evaluate(() => {
    const R = {};
    paused = true;
    const guard = (keys, fn) => {
      try { fn(); } catch (e) { for (const k of keys) if (R[k] === undefined) R[k] = '!! ' + String(e.message).slice(0, 110).toUpperCase(); }
    };

    /* ---------- 1. THE TOWERS ARE ON THE MAP, AND TALL ---------- */
    guard(['theTowersStandApart', 'allThreeEndings', 'andTheyAreDrawnTall'], () => {
      const bad = [];
      for (const tw of towers) {
        if (towns.some(t => dist(t.x, t.y, tw.x, tw.y) < 110)) bad.push(`tower ${tw.id} crowds a town`);
        if (nearRoad(tw.x, tw.y, 24)) bad.push(`tower ${tw.id} is on a road`);
        if (hamlets.some(h => dist(h.x, h.y, tw.x, tw.y) < 70)) bad.push(`tower ${tw.id} is in a hamlet's fields`);
        if (corpseSites.some(s => dist(s.x, s.y, tw.x, tw.y) < 75)) bad.push(`tower ${tw.id} is on Sundered ground`);
        if (towers.some(o => o !== tw && dist(o.x, o.y, tw.x, tw.y) < 240)) bad.push(`tower ${tw.id} has a neighbour within 240`);
      }
      const want = Math.round(6 * W * H / (1440 * 1440));
      R.theTowersStandApart = towers.length >= want - 2 && !bad.length
        ? `${towers.length} Golden-Age towers (wanted ${want}), each 240 or more from the next and clear of every town, road, hamlet and Sundered site`
        : `!! THE TOWERS: ${towers.length} of ${want}; ${bad.slice(0, 4).join('; ')}`;
      const kinds = {};
      for (const tw of towers) kinds[tw.kind] = (kinds[tw.kind] || 0) + 1;
      R.allThreeEndings = kinds.standing && kinds.leaning && kinds.snapped
        ? `standing ${kinds.standing}, leaning ${kinds.leaning}, snapped ${kinds.snapped}`
        : `!! NOT EVERY ENDING IS ON THE MAP: ${JSON.stringify(kinds)}`;
      /* each tower's meshes, found by where they stand, and how high the tallest of them reaches */
      const meshes = scene.children.filter(o => o.name === 'tower');
      const short = [];
      for (const tw of towers) {
        const mine = meshes.filter(m => { const s = m.geometry.boundingSphere; return s && Math.hypot(s.center.x - tw.x, s.center.z - tw.y) < 40; });
        let top = -Infinity;
        for (const m of mine) { const pa = m.geometry.attributes.position.array; for (let i = 1; i < pa.length; i += 3) if (pa[i] > top) top = pa[i]; }
        const rise = top - groundY(tw.x, tw.y);
        const need = tw.kind === 'snapped' ? 12 : tw.kind === 'leaning' ? 30 : 42;
        if (!mine.length || rise < need) short.push(`${tw.kind} ${tw.id} rises ${rise.toFixed(0)}`);
      }
      const tallest = Math.max(...towers.map(t => t.h));
      R.andTheyAreDrawnTall = !short.length && meshes.length >= towers.length
        ? `every tower is drawn (${meshes.length} meshes, a few a tower), the standing ones 42 or more above the ground and the tallest ${tallest.toFixed(0)}`
        : `!! TOWERS DRAWN SHORT OR NOT AT ALL: ${short.slice(0, 5).join(', ') || meshes.length + ' meshes'}`;
    });

    /* ---------- 2. THEY ARE THINGS ---------- */
    guard(['theFootIsSolid', 'soIsWhatFell', 'nothingGrowsThroughThem', 'andAReloadKeepsThemSolid'], () => {
      const footOpen = towers.filter(tw => !isBlocked(tw.x, tw.y) || !isBlocked(tw.x + 3, tw.y) || !isBlocked(tw.x, tw.y - 3));
      R.theFootIsSolid = !footOpen.length
        ? `you cannot walk into the foot of any of the ${towers.length}`
        : `!! ${footOpen.length} TOWERS CAN BE WALKED THROUGH AT THE FOOT`;
      const snapped = towers.filter(tw => tw.fall);
      const along = (tw, d) => [tw.x + Math.sin(tw.ang) * d, tw.y + Math.cos(tw.ang) * d];
      const openFall = snapped.filter(tw => [10, tw.fall * 0.5 + 6, tw.fall].some(d => !isBlocked(...along(tw, d))));
      R.soIsWhatFell = snapped.length && !openFall.length
        ? `and the fallen length of each of the ${snapped.length} snapped ones is solid where it lies, ${Math.min(...snapped.map(t => t.fall))} to ${Math.max(...snapped.map(t => t.fall))} tiles of it`
        : `!! A FALLEN LENGTH CAN BE WALKED THROUGH: ${openFall.map(t => t.id).join(', ') || 'no snapped towers'}`;
      const grown = [];
      for (const tw of towers) {
        for (let j = tw.y - 8; j <= tw.y + 8; j++) for (let i = tw.x - 8; i <= tw.x + 8; i++)
          if (dist(i, j, tw.x, tw.y) < 8 && rawDecorAt(i, j)) grown.push(`${tw.id}@${i},${j}`);
        if (tw.fall) for (let d = 8; d < tw.fall; d += 2) { const [fx, fy] = along(tw, d); if (rawDecorAt(Math.floor(fx), Math.floor(fy))) grown.push(`${tw.id} fall@${d}`); }
      }
      R.nothingGrowsThroughThem = !grown.length
        ? 'and no tree, rock or seam stands inside a tower or the length lying beside one'
        : `!! DECOR INSIDE A TOWER: ${grown.slice(0, 5).join(', ')}`;
      restore(JSON.parse(JSON.stringify(snapshot())));
      const lost = towers.filter(tw => !isBlocked(tw.x, tw.y) || (tw.fall && !isBlocked(...along(tw, tw.fall * 0.5 + 6))));
      R.andAReloadKeepsThemSolid = !lost.length
        ? 'and every foot and fallen length is still solid after a save and reload'
        : `!! A RELOAD TOOK ${lost.length} TOWERS' STONE: ${lost.map(t => t.id).join(', ')}`;
    });

    /* ---------- 3. A CACHE AT THE FOOT ---------- */
    guard(['eachHasACache'], () => {
      const bad = towers.filter(tw => {
        const ch = chests[tw.cacheIdx];
        return !ch || isBlocked(ch.x, ch.y) || dist(ch.x, ch.y, tw.x, tw.y) > 16 || !Object.keys(ch.loot.items).length;
      });
      R.eachHasACache = !bad.length
        ? `each tower has a cache within 16 tiles of its foot, on open ground (${towers.map(t => Object.keys(chests[t.cacheIdx].loot.items).filter(k => k !== 'scrap')[0]).join(', ')})`
        : `!! ${bad.length} TOWERS HAVE NO CACHE YOU CAN REACH: ${bad.map(t => t.id).join(', ')}`;
    });

    /* ---------- 4. NAMED BY GOING THERE ---------- */
    guard(['seeingATowerDoesNotNameIt', 'standingAtItDoes', 'andTheSaveRemembers'], () => {
      const me = player()[0], keep = player().map(c => ({ c, x: c.x, y: c.y }));
      const tw = towers.slice().sort((a, b2) => dist(b2.x, b2.y, me.x, me.y) - dist(a.x, a.y, me.x, me.y))[0];
      const named0 = towers.filter(t => t.reached).length;
      const off = findOpenNear(tw.x + 24, tw.y, 2);
      for (const c of player()) { c.x = off.x; c.y = off.y; }
      hour = 12; computeVision(); witnessTick();
      const inSight = visAt(tw.x, tw.y) === 2;
      R.seeingATowerDoesNotNameIt = named0 === 0 && inSight && !tw.reached
        ? `no tower is named on a new world, and one in plain sight ${dist(off.x, off.y, tw.x, tw.y).toFixed(0)} tiles off is still not`
        : `!! NAMED WITHOUT BEING REACHED: ${named0} at the start; in sight ${inSight}, reached ${tw.reached}`;
      const at = findOpenNear(tw.x + 10, tw.y + 4, 2);
      me.x = at.x; me.y = at.y; computeVision(); witnessTick();
      R.standingAtItDoes = tw.reached && towers.filter(t => t.reached).length === 1
        ? `and one of yours at ${dist(at.x, at.y, tw.x, tw.y).toFixed(0)} tiles from its foot names that one, and only that one`
        : `!! STANDING AT IT: reached ${tw.reached}, ${towers.filter(t => t.reached).length} named`;
      for (const k of keep) { k.c.x = k.x; k.c.y = k.y; }
      computeVision();
      restore(JSON.parse(JSON.stringify(snapshot())));
      R.andTheSaveRemembers = towers.find(t => t.id === tw.id).reached && towers.filter(t => t.reached).length === 1
        ? 'and a save and reload keeps it named'
        : `!! THE RELOAD FORGOT: ${towers.filter(t => t.reached).map(t => t.id).join(',') || 'none'} named`;
    });

    return R;
  });

  const bad = Object.values(out).filter(v => typeof v === 'string' && v.startsWith('!!'));
  for (const [k, v] of Object.entries(out)) console.log('  ' + k.padEnd(28) + ' ' + v);
  for (const e of errs) console.log('  ' + e);
  console.log('');
  console.log(bad.length || errs.length ? `*** THE SKYLINE IS WRONG (${bad.length + errs.length}) ***` : 'THERE IS A SKYLINE TO STEER BY');
  await b.close();
  process.exit(bad.length || errs.length ? 1 : 0);
})();
