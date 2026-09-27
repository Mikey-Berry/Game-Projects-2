#!/usr/bin/env node
/* PLAY NOTES, 2026-09-27, CHECKED IN PLAY. One claim or more per note, each staged the way a
 * player meets it.
 *
 *   1. the kit screen follows whoever you pick in the squad bar, and a group opens on its first
 *   2. a search at the gate finds a handful (5 to 10 of a thing), off the person or out of the
 *      cart — not the whole of it
 *   3. going quietly settles the town's account: no bounty after the cell door shuts, nobody
 *      sent after a prisoner, and nobody touches them in the cell
 *   4. a sentence served in Greenrest ends on a street with a way out of town, not inside the
 *      Dame's walls
 *   5. the Aldercott yard gate is shut until you are let in and open after; the house's stairs
 *      reach both upper storeys and back (two flights share a stairwell)
 *   6. a wreck in the rust barrens gives scrap metal, not ingots: it melts down at a poor rate and
 *      makes a few cheap things, and the Rusted Automatons still drop the ingots
 *   7. a bar sells food off the town's shelf, and the shelf runs out
 *   8. a nest you have taken the bounty on is marked on the minimap (and on screen, as a ward is)
 *
 * Anything starting '!!' fails the build.
 *
 *   node tools/playnotes.js [game.html]
 */
const { chromium } = require('playwright');
const path = require('path');
const gamePath = (a) => path.resolve(a ? (path.isAbsolute(a) ? a : path.join(__dirname, a)) : path.join(__dirname, 'game.html'));

(async () => {
  const b = await chromium.launch({
    executablePath: process.env.DUSTWARD_CHROME || undefined,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'],
  });
  const p = await b.newPage({ viewport: { width: 1100, height: 760 } });
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message.slice(0, 160)));
  await p.goto('file://' + gamePath(process.argv[2]), { waitUntil: 'load', timeout: 90000 });
  await p.waitForSelector('#btn-start', { state: 'attached', timeout: 60000 });
  await p.waitForTimeout(1500);
  await p.evaluate(() => document.getElementById('btn-start').click());
  await p.waitForTimeout(2500);
  const R = {};
  const title = () => p.evaluate(() => document.getElementById('modaltitle').textContent);

  /* ---- 1. the kit screen follows the pick ---- */
  {
    await p.evaluate(() => { const [a] = player(); selected = [a]; openInventory(a); });
    const t0 = await title();
    await p.evaluate(() => { selected = [player()[1]]; });
    await p.waitForTimeout(300);
    const t1 = await title();
    await p.evaluate(() => { selected = [player()[2], player()[0]]; });
    await p.waitForTimeout(300);
    const t2 = await title();
    await p.evaluate(() => { $('modal').style.display = 'none'; modalOpen = false; selected = [player()[1]]; });
    await p.waitForTimeout(300);
    const reopened = await p.evaluate(() => modalOpen);
    const names = await p.evaluate(() => player().map(c => c.name));
    R.theKitFollowsThePick = (t0.includes(names[0]) && t1.includes(names[1]) && t2.includes(names[2]) && !reopened)
      ? `open on ${names[0]}, pick ${names[1]} and it is ${names[1]}'s; pick a group and it is the first of them (${names[2]}); shut, and a pick does not reopen it`
      : `!! THE KIT DID NOT FOLLOW ("${t0}" → "${t1}" → "${t2}", reopened after shutting ${reopened})`;
  }

  const out = await p.evaluate(() => {
    const O = {};
    paused = true;
    const me = player()[0];
    const t = towns.find(x => x.def.wall && !x.def.undeadFriendly && !x.playerRuled && freeCell(x)) || towns[0];
    const shut = () => { $('modal').style.display = 'none'; modalOpen = false; _stopOpen = false; };
    const press = (re) => { const bt = [...document.querySelectorAll('#modalbody button')].find(x => re.test(x.textContent)); if (bt) bt.click(); return !!bt; };
    /* the guard who stops you is a body in the world, standing there: in play it is always one of
       the town's own watch, and it is the witness the offence is booked on */
    const guardOf = () => { const g = makeChar('Watch', 'town', me.x + 1, me.y, { atk: 10, def: 10, tough: 10 });
      g.homeTown = t; g.state = 'ok'; g.__probe = true; chars.push(g); rebuildCharGrid(); return g; };

    /* ---- 2a. off the person ---- */
    {
      me.inv = me.inv || {}; me.inv.remains = 40;
      theStop(me, guardOf(), t, ['remains']);
      const hit = press(/^HAND IT OVER/);
      shut();
      const left = me.inv.remains || 0, took = 40 - left;
      O.aSearchFindsAHandful = (hit && took >= 5 && took <= 10)
        ? `forty remains in the pack and HAND IT OVER gives up ${took}; the other ${left} stay where they were`
        : `!! HANDING IT OVER TOOK ${took} OF 40 (button ${hit})`;
      delete me.inv.remains;
    }
    /* ---- 2b. out of the cart, going quietly ---- */
    const before = { bounty: t.bounty || 0 };
    {
      /* INSIDE THE WALLS, where a stop happens: the offence is booked to the town the body is
         standing in, and a staging out on the road books it to nobody and proves nothing */
      const q = findOpenNear(Math.round(t.x), Math.round(t.y) + 4, 6);
      me.x = q.x + 0.5; me.y = q.y + 0.5; me.floor = 0;
      rebuildCharGrid();
      stash.remains = 40;
      t.bounty = 0; t.wanted = false;
      const g = guardOf();
      /* and nobody talks the witness round: `crime` lets a silver tongue smooth over a minor
         offence at odds of about one in four, which is its own mechanic and would make this claim
         pass on the broken build whenever the dice fell that way */
      const _sp = speakerNear; speakerNear = () => null;
      theReckoning(me, g, t, CONTRABAND.remains, ['remains'], 7);
      const hit = press(/^GO PEACEFULLY/);
      shut();
      speakerNear = _sp;
      const took = 40 - (stash.remains || 0);
      O.aCartSearchFindsAHandful = (hit && took === 7)
        ? `forty remains in the cart and going quietly loses the ${took} they found, not the cart`
        : `!! THE CART LOST ${took} OF 40 (button ${hit})`;
      /* ---- 3. and it is settled ---- */
      const inCell = !!me.jailedAt;
      const hunters = chars.filter(o => o.arrestTarget === me || (o.faction === 'town' && o.target === me)).length;
      const b0 = me.blood + Object.values(me.parts).reduce((a, x) => a + x.hp, 0);
      paused = false;
      for (let i = 0; i < 300; i++) update(1 / 30);
      paused = true;
      const b1 = me.blood + Object.values(me.parts).reduce((a, x) => a + x.hp, 0);
      const hunters2 = chars.filter(o => o.arrestTarget === me || (o.faction === 'town' && o.target === me)).length;
      O.goingQuietlySettlesIt = (inCell && !t.bounty && !t.wanted && hunters === 0 && hunters2 === 0 && b1 >= b0 - 1)
        ? `in the cell at ${t.name} with no bounty on the face and nobody sent after it; ten seconds in, not a mark on them`
        : `!! IN CELL ${inCell}, BOUNTY ${t.bounty}, WANTED ${t.wanted}, HUNTING ${hunters}→${hunters2}, HURT ${Math.round(b0 - b1)}`;
      /* let them out again for whatever comes next */
      if (me.jailedAt) { me.jailedAt.holds = null; me.jailedAt = null; me.jailT = 0; returnKit(me); }
      stash.remains = 0;
      t.bounty = before.bounty;
      for (let i = chars.length - 1; i >= 0; i--) if (chars[i].__probe) chars.splice(i, 1);
    }

    /* ---- 4. out of the cells in Greenrest, onto a street that leads somewhere ---- */
    {
      const gr = towns.find(x => x.def.key === 'greenrest');
      const cell = gr && freeCell(gr);
      if (!cell) O.releasedOntoTheStreet = '!! NO CELL IN GREENREST TO SERVE A SENTENCE IN';
      else {
        stripKit(me); jail(me, cell, 1);
        hour = 23.99; paused = false;
        const d0 = day;
        for (let i = 0; i < 60 && day === d0; i++) update(1 / 30);
        paused = true;
        const free = !me.jailedAt;
        const R0 = (gr.def.wall && gr.def.wall.r) || 35;
        const out = findOpenNear(gr.x + R0 + 14, gr.y, 6);
        const path = free ? findPath(me.x, me.y, out.x, out.y, 0, 60000) : null;
        O.releasedOntoTheStreet = (free && path && path.length)
          ? `a sentence served in Greenrest walks out at ${me.x.toFixed(0)},${me.y.toFixed(0)}, ${dist(me.x, me.y, gr.x, gr.y).toFixed(1)} tiles off the middle, and there is a ${path.length}-step way out of town from there`
          : `!! RELEASED ${free} AT ${me.x.toFixed(1)},${me.y.toFixed(1)} (${dist(me.x, me.y, gr.x, gr.y).toFixed(1)} off the middle) WITH NO WAY OUT OF TOWN`;
      }
    }

    /* ---- 5. the Aldercott house: the gate is what it looks like, and the upstairs is real ---- */
    {
      const E = estate, hb = E && E.house;
      if (!E) O.theHouseHasAnUpstairs = '!! NO ESTATE IN THIS WORLD';
      else {
        const g0 = E.gate[0];
        const shutBlocks = isBlocked(g0.x + 0.5, g0.y + 0.5, 0);
        estateAdmit(null);
        const outside = { x: g0.x + 0.5, y: g0.y + 3.5 };
        for (const c of player()) { c.x = 5; c.y = 5; c.moveTarget = null; }
        me.x = outside.x; me.y = outside.y; me.floor = 0; me.jailedAt = null; me.state = 'ok';
        rebuildCharGrid();
        const walk = (x, y, f, n) => { routeTo(me, x, y, f); paused = false;
          for (let i = 0; i < n; i++) { update(1 / 30); if ((me.floor || 0) === f && !me.moveTarget && me.wantFloor == null) break; }
          paused = true; return me.floor || 0; };
        const f1 = walk(hb.x + hb.w / 2, hb.y + hb.h / 2, 1, 900);
        const f2 = walk(hb.x + hb.w / 2 + 1, hb.y + hb.h / 2, 2, 900);
        const f0 = walk(outside.x, outside.y, 0, 1500);
        const outAgain = dist(me.x, me.y, outside.x, outside.y) < 2;
        O.theHouseHasAnUpstairs = (shutBlocks && f1 === 1 && f2 === 2 && f0 === 0 && outAgain)
          ? 'shut, the yard gate stops you; let in, one of yours walks through it, into the house, up to the first floor, up to the attic, and all the way back out'
          : `!! GATE SHUT ${shutBlocks}; REACHED FLOOR ${f1} THEN ${f2}, BACK ON ${f0}, OUT AGAIN ${outAgain}`;
      }
    }

    /* ---- 6. a wreck is scrap, not an ingot; the ingots are what you fight the barrens for ---- */
    {
      const wreck = { x: 0, y: 0 };
      let got = null;
      for (let y = 0; y < H && !got; y += 2) for (let x = 0; x < W && !got; x += 2)
        if (biomeAt(x, y) === BIOME_RUST && decorAt(x, y) === 'wreck' && !isBlocked(x + 0.5, y + 0.5)) { wreck.x = x; wreck.y = y; got = gatherKindAt(x + 0.5, y + 0.5); }
      const all = Object.values(RECIPES).flat();
      const melt = all.find(r => r.out === 'iron' && r.cost.scrap);
      const uses = all.filter(r => r.cost.scrap && r.out !== 'iron').map(r => ITEMS[r.out] ? ITEMS[r.out].name : r.out);
      const bot = spawnRustAutomaton(wreck.x + 0.5, wreck.y + 0.5);
      const drops = bot && bot.dropItems ? Object.keys(bot.dropItems) : [];
      if (bot) { const i = chars.indexOf(bot); if (i >= 0) chars.splice(i, 1); }
      O.aWreckIsScrap = (got && got.kind === 'scrap' && ITEMS.scrap && ITEMS.scrap.base * 4 <= ITEMS.iron.base && melt && uses.length && drops.includes('iron'))
        ? `a wreck gives ${ITEMS.scrap.name} (${ITEMS.scrap.base} against an ingot's ${ITEMS.iron.base}); ${Object.entries(melt.cost).map(([k, v]) => v + ' ' + k).join(' + ')} melts to one ingot, and it also makes ${uses.join(', ')}; a Rusted Automaton still drops ingots`
        : `!! WRECK GIVES ${got && got.kind}, MELTS ${!!melt}, USES ${uses.join('/')}, AUTOMATON DROPS ${drops.join('/')}`;
    }

    /* ---- 7. a bar's food comes off the town's shelf, and the shelf runs out ---- */
    {
      const v = vendors.find(x => x.vt === 'bar' && x.town);
      if (!v) O.theBarRunsOut = '!! NO BAR IN THIS WORLD';
      else {
        const tw = v.town;
        tw.stock = tw.stock || {};
        tw.stock.meat = 3;
        const cats0 = cats; cats = 99999;
        const own0 = stash.meat || 0;
        openVendor(v);
        const btn = () => document.querySelector('#modalbody [data-buy="meat"]');
        const ev = new MouseEvent('click', { shiftKey: true, bubbles: true });
        if (btn()) btn().dispatchEvent(ev);
        const got = (stash.meat || 0) - own0, left = stockOf(tw, 'meat');
        const dead = btn() ? btn().disabled : null;
        if (btn()) btn().dispatchEvent(ev);
        const got2 = (stash.meat || 0) - own0;
        shut(); cats = cats0; stash.meat = own0;
        O.theBarRunsOut = (got === 3 && left === 0 && dead === true && got2 === 3)
          ? `three dried meat behind ${tw.name}'s counter and a shift-click for ten buys three, empties the shelf, and the button goes dead`
          : `!! BOUGHT ${got} OF 3 (THEN ${got2}), ${left} LEFT, BUTTON DISABLED ${dead}`;
      }
    }

    /* ---- 8. a nest you have taken the bounty on is marked on the map ---- */
    {
      for (let i = 0; i < 4 && !camps.some(c => campAlive(c) > 0); i++) spawnCamp();
      const live = camps.filter(c => campAlive(c) > 0);
      const near = (tw) => Math.min(...live.map(c => dist(c.x, c.y, tw.x, tw.y)));
      const tw = towns.slice().sort((a, b) => near(a) - near(b))[0];
      let j = null;
      for (let i = 0; i < 40 && !j; i++) { const r = rollBoardJob(tw, 'cull'); if (r && r.campId) j = r; }
      if (!j) O.theNestIsMarked = `!! ${tw.name} NEVER POSTS A NEST BOUNTY, WITH ${live.length} DENS STANDING`;
      else {
        tw.board = tw.board || { day, jobs: [] }; tw.board.jobs.push(j);
        const redAt = () => { renderMinimap(); const cp = camps.find(c => c.id === j.campId);
          const d = mmcx.getImageData(Math.round(cp.x * 128 / W) - 3, Math.round(cp.y * 128 / H) - 3, 7, 7).data;
          let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 180 && d[i + 1] < 120 && d[i + 2] < 100) n++; return n; };
        const before = redAt();
        takeContract(tw, j);
        const after = redAt();
        const i = contracts.indexOf(j); if (i >= 0) contracts.splice(i, 1);
        const gone = redAt();
        O.theNestIsMarked = (before === 0 && after >= 4 && gone === 0)
          ? `take ${tw.name}'s bounty on ${j.title.replace('BOUNTY: ', '').toLowerCase()} and a red cross goes on the minimap over the camp (${after} pixels), and comes off when the job does`
          : `!! MINIMAP RED OVER THE CAMP: ${before} BEFORE TAKING, ${after} AFTER, ${gone} ONCE THE JOB IS GONE`;
      }
    }
    return O;
  });
  Object.assign(R, out);

  const bad = Object.values(R).filter(v => typeof v === 'string' && v.startsWith('!!'));
  for (const [k, v] of Object.entries(R)) console.log('  ' + k.padEnd(34) + ' ' + v);
  for (const e of errs) console.log('  ' + e);
  console.log('');
  const which = Object.keys(R).filter(k => typeof R[k] === 'string' && R[k].startsWith('!!'));
  console.log(bad.length || errs.length ? `*** THE PLAY NOTES ARE NOT ANSWERED (${bad.length + errs.length}): ${[...which, ...errs.map(() => 'pageerror')].join(', ')} ***`
                                        : 'THE PLAY NOTES OF 2026-09-27 ARE ANSWERED');
  await b.close();
  process.exit(bad.length || errs.length ? 1 : 0);
})();
