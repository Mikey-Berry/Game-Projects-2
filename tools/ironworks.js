#!/usr/bin/env node
/* CAN A PLAYER ACTUALLY GET IRON.
 *
 * "Iron is STILL not a naturally occurring resource — or it is at least indistinguishable from
 *  normal rock and I haven't come across it yet. Also, towns still do not sell it at all. I
 *  thought this was supposed to have been fixed previously but it is not."
 *
 * It is reported as one complaint and it is three separate things, which is exactly why it kept
 * coming back: a previous pass fixed the half that had a mechanism (the seams exist, and
 * `findNode` returns them) and left the two halves that are about a PLAYER finding them.
 *
 *   · How much of it is there, and how far from anywhere anyone walks.
 *   · Whether you can tell one from a boulder at a glance. A vein you cannot recognise is not
 *     in the world as far as the person playing is concerned.
 *   · Whether anybody sells it. A town that carries iron in its stock and lists it on no
 *     vendor is a town that does not sell iron.
 *
 * Every assertion is about REACHING it, not about the data existing.
 *
 *   node tools/ironworks.js [game.html]
 */
const { chromium } = require('playwright');
const path = require('path');
const gamePath = (a) => path.resolve(a ? (path.isAbsolute(a) ? a : path.join(__dirname, a)) : path.join(__dirname, 'game.html'));

(async () => {
  const b = await chromium.launch({
    executablePath: process.env.DUSTWARD_CHROME || undefined,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'],
  });
  const p = await b.newPage({ viewport: { width: 900, height: 600 } });
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message.slice(0, 200)));
  await p.goto('file://' + gamePath(process.argv[2]), { waitUntil: 'load' });
  await p.waitForSelector('#btn-start', { state: 'attached', timeout: 60000 });
  await p.evaluate(() => { document.getElementById('btn-start').click(); paused = true; });
  await p.waitForTimeout(2600);

  const out = await p.evaluate(() => {
    const R = {};
    paused = true;
    const guard = (keys, fn) => {
      try { fn(); } catch (e) { for (const k of keys) if (R[k] === undefined) R[k] = '!! ' + String(e.message).slice(0, 110).toUpperCase(); }
    };

    /* ---------- 1. IS IT IN THE GROUND, AND WHERE ----------
       Counted by sweeping the MAP rather than by reading `oreFields`: a field is a circle, and
       what a player can walk up to and swing at is the tiles inside it that actually outcrop —
       `rawDecorAt` wants dry ground and a height over 0.90, so a field can be mostly nothing. */
    let iron = [], copper = [];
    guard(['ironIsInTheGround', 'andThereIsEnoughOfItToFind'], () => {
      for (let y = 4; y < H - 4; y += 2) for (let x = 4; x < W - 4; x += 2) {
        const d = rawDecorAt(x, y);
        if (d === 'ivein') iron.push([x, y]);
        else if (d === 'cvein') copper.push([x, y]);
      }
      R._seams = `${oreFields.filter(f => f.kind === 'ivein').length} iron fields and ${oreFields.filter(f => f.kind === 'cvein').length} copper, sampled at ${iron.length * 4} iron outcrops against ${copper.length * 4} copper`;
      R.ironIsInTheGround = iron.length > 0
        ? `iron outcrops exist — ${iron.length * 4} tiles of it across the map`
        : '!! THERE IS NO IRON IN THE GROUND ANYWHERE';
      /* AND ENOUGH THAT WALKING INTO SOME IS NOT A LOTTERY. Copper is the control: the same
         mechanism, the same generator, and nobody has ever reported not finding copper. */
      R.andThereIsEnoughOfItToFind = iron.length >= copper.length * 0.6
        ? `and there is ${(iron.length / Math.max(1, copper.length)).toFixed(2)}x as much of it as copper, which nobody has ever failed to find`
        : `!! ${(iron.length / Math.max(1, copper.length)).toFixed(2)}x AS MUCH IRON AS COPPER — one is findable and the other is a lottery`;
    });

    /* ---------- 2. IS ANY OF IT NEAR ANYWHERE ANYONE GOES ----------
       A seam in the far corner of a 1440-tile map is a seam nobody meets. Ask the towns. */
    guard(['everySeatHasIronWithinAWalk'], () => {
      const far = [];
      let worst = 0;
      for (const t of towns) {
        let best = 1e9;
        for (const [x, y] of iron) best = Math.min(best, dist(t.x, t.y, x, y));
        worst = Math.max(worst, best);
        if (best > 260) far.push(`${t.name} ${best === 1e9 ? 'never' : Math.round(best)}`);
      }
      R.everySeatHasIronWithinAWalk = far.length === 0
        ? `and every one of the ${towns.length} seats has iron within a day's walk of its gate (worst ${Math.round(worst)} tiles)`
        : `!! NO IRON WITHIN 260 TILES OF: ${far.join(', ')}`;
    });

    /* ---------- 3. CAN YOU TELL IT FROM A ROCK ----------
       This is the half of the report that a mechanism test cannot see, and the half that was
       actually reported: "indistinguishable from normal rock". The world draws a vein as a dark
       base with a coloured crust on top, and a boulder as a base of its own. If the base
       colours are close and the crust is small, a player sweeping a hillside sees boulders.
       Copper's crust is the control — a bright green nobody misses. */
    const hex = (s) => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
    const far = (a, b2) => { const [r1, g1, b1] = hex(a), [r2, g2, b3] = hex(b2); return Math.hypot(r1 - r2, g1 - g2, b1 - b3); };
    guard(['anIronSeamLooksLikeIron', 'andItsCrustIsAsPlainAsCoppers'], () => {
      const M = NODE_LOOK;
      R._look = `rock ${M.rock.base} · copper ${M.cvein.base}+${M.cvein.crust}@${M.cvein.crustSz} · iron ${M.ivein.base}+${M.ivein.crust}@${M.ivein.crustSz}`;
      const cSep = far(M.cvein.crust, M.rock.base), iSep = far(M.ivein.crust, M.rock.base);
      R.anIronSeamLooksLikeIron = iSep >= 90
        ? `an iron crust is ${iSep.toFixed(0)} from boulder grey, against copper's ${cSep.toFixed(0)} — both unmistakable`
        : `!! AN IRON CRUST IS ${iSep.toFixed(0)} FROM BOULDER GREY (copper manages ${cSep.toFixed(0)}) — it reads as a rock`;
      /* and the mark has to be big enough to see from the camera, not just a different colour */
      R.andItsCrustIsAsPlainAsCoppers = M.ivein.crustSz >= M.cvein.crustSz
        ? `and its crust is ${M.ivein.crustSz} against copper's ${M.cvein.crustSz} — as easy to pick out at a distance`
        : `!! THE IRON CRUST IS ${M.ivein.crustSz} AGAINST COPPER'S ${M.cvein.crustSz} — a smaller mark on a duller stone`;
    });

    /* ---------- 4. AND DOES ANYBODY SELL IT ----------
       The towns already CARRY iron — `seed('iron', ...)` puts 14 to 22 in the pit and one to
       four everywhere else. None of it was on a vendor's list, so it sat in the town's stock
       where nothing could ever buy it. Asked through the real shop filter. */
    guard(['someoneSellsIron', 'andThePitSellsTheMostOfIt'], () => {
      /* THE SHOPS ARE A GLOBAL ARRAY WITH A `town` ON THEM, not a list hanging off the town.
         `(t.vendors || [])` is always empty, so the first version of this said "lists it
         nowhere" about every seat whatever the stock lists said — right answer, no evidence. */
      const sells = (t, k) => vendors.some(v => v.town === t && VENDOR_STOCK[v.vt] && VENDOR_STOCK[v.vt].includes(k));
      const withIron = towns.filter(t => sells(t, 'iron'));
      R._shops = towns.map(t => `${t.name} ${Math.round(t.stock && t.stock.iron || 0)}${sells(t, 'iron') ? '' : ' (unlisted)'}`).join(' · ');
      R.someoneSellsIron = withIron.length >= towns.length
        ? `every one of the ${towns.length} seats puts iron on a counter`
        : `!! ${towns.length - withIron.length} OF ${towns.length} SEATS CARRY IRON AND LIST IT NOWHERE`;
      const pit = towns.find(t => t.def.key === 'ironscar');
      R.andThePitSellsTheMostOfIt = (pit && (pit.stock.iron || 0) >= 12)
        ? `and the pit that is named for it holds ${Math.round(pit.stock.iron)} of it`
        : `!! THE IRON PIT HOLDS ${pit ? Math.round(pit.stock.iron || 0) : 'NO'} IRON`;
    });

    /* ---------- 5. AND THE ORE IS WORTH DIGGING ----------
       A seam you can find and a bar you can buy are two different economies; the miner's one
       has to end in an ingot. `findNode` is what a working hand asks. */
    guard(['aMinerCanFindASeam'], () => {
      /* ---------- ASKED WHERE A MINER WOULD ACTUALLY BE STANDING ----------
         `findNode` sweeps 34 tiles, so asking it from a town gate asks whether that seat has a
         seam in its own back garden — a question about the map's POLITICS, not about whether
         iron is reachable, and the honest answer for six of seven is no. Iron belongs to the
         pit; that is the design and it should stay. What has to be true is that every field is
         one a hand can actually be put to work on, and that one is within reach of each seat
         (which the walk assertion above covers). */
      const me = player()[0];
      const was = { x: me.x, y: me.y };
      const fields = oreFields.filter(f => f.kind === 'ivein');
      let worked = 0;
      for (const f of fields) { me.x = f.x; me.y = f.y; if (findNode(me, 'iron_ore')) worked++; }
      me.x = was.x; me.y = was.y;
      R.aMinerCanFindASeam = (fields.length >= 4 && worked === fields.length)
        ? `and a hand standing on any of the ${fields.length} iron fields is put straight to work on it`
        : fields.length < 4 ? `!! ONLY ${fields.length} IRON FIELDS IN THE WHOLE WORLD`
        : `!! ${fields.length - worked} OF ${fields.length} IRON FIELDS HAVE NOTHING A MINER CAN WORK`;
    });

    return R;
  });

  const bad = Object.values(out).filter(v => typeof v === 'string' && v.startsWith('!!'));
  for (const [k, v] of Object.entries(out)) console.log('  ' + k.padEnd(30) + v);
  for (const e of errs) console.log('  ' + e);
  console.log('');
  console.log(bad.length || errs.length ? `IRON IS STILL SOMETHING YOU READ ABOUT (${bad.length + errs.length})`
                                        : 'IRON IS IN THE GROUND, ON THE SHELVES, AND YOU CAN SEE IT');
  await b.close();
  process.exit(bad.length || errs.length ? 1 : 0);
})();
