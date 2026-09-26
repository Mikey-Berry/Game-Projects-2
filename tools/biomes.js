#!/usr/bin/env node
/* THE THREE GROUNDS, CHECKED IN PLAY (2026-09-26): the salt flats, the rust barrens, the vat bog.
 *
 *   1. each stands round the thing that made it: the flats round Saltmere, the barrens round
 *      Ironscar, the bog round the deep redoubt (and not inside it)
 *   2. and they cost a fresh world nothing: not one body is added at boot, and every sleeper
 *      lies on a bare tile
 *   3. the flats keep what dies on them at the stage it lay down in, and the dust still takes it
 *      in the end, which is the difference from brine
 *   4. a SALVAGE hand strips a wreck for iron; a FORAGE hand cuts a bloom for quickflesh
 *   5. the bog holds the living and not the dead
 *   6. something in the rust sits up when you walk up to it, and stays up through a save;
 *      the pools put out two vat-spawn each
 *   7. the minimap draws them
 *
 * Anything starting '!!' fails the build.
 *
 *   node tools/biomes.js [game.html]
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
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message.slice(0, 160)));
  await p.goto('file://' + gamePath(process.argv[2]), { waitUntil: 'load', timeout: 90000 });
  await p.waitForSelector('#btn-start', { state: 'attached', timeout: 60000 });

  /* ---- 1 and 2, on the world as it boots, before anybody has walked anywhere ---- */
  const out = await p.evaluate(() => {
    const R = {};
    if (typeof biomeAt !== 'function') {
      R.threeGroundsStandWhereTheirReasonsAre = '!! THERE ARE NO BIOMES IN THIS BUILD';
      return R;
    }
    const n = { 1: 0, 2: 0, 3: 0 };
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) { const k = biomeAt(x, y); if (k) n[k]++; }
    const salt = towns.find(t => t.def.key === 'saltmere'), iron = towns.find(t => t.def.key === 'ironscar');
    const deep = redoubts.find(r => r.deep);
    const bogBeside = deep ? [[deep.x0 - 6, deep.y], [deep.x1 + 6, deep.y], [deep.x, deep.y0 - 6], [deep.x, deep.y1 + 6]].filter(([x, y]) => biomeAt(x, y) === BIOME_VAT).length : 0;
    const bogInside = deep ? biomeAt(deep.x, deep.y) : -1;
    R._tiles = `flats ${n[1]} · barrens ${n[2]} · bog ${n[3]} tiles`;
    R.threeGroundsStandWhereTheirReasonsAre = (n[1] > 5000 && n[2] > 5000 && n[3] > 2000
      && biomeAt(salt.x, salt.y) === BIOME_SALT && biomeAt(iron.x, iron.y) === BIOME_RUST && bogBeside >= 3 && bogInside === 0)
      ? `the flats stand round Saltmere (${n[1]} tiles), the barrens round Ironscar (${n[2]}), and the bog round the deep redoubt (${n[3]}) on ${bogBeside} of its four sides and not inside it`
      : `!! FLATS ${n[1]} (SALTMERE ${biomeAt(salt.x, salt.y)}) BARRENS ${n[2]} (IRONSCAR ${biomeAt(iron.x, iron.y)}) BOG ${n[3]} (BESIDE ${bogBeside}, INSIDE ${bogInside})`;
    const woken = chars.filter(c => c.biomeOwn).length;
    const rust = biomeSleepers.filter(s => s.kind === 'automaton'), pools = biomeSleepers.filter(s => s.kind === 'pool');
    const cluttered = biomeSleepers.filter(s => rawDecorAt(Math.floor(s.x), Math.floor(s.y)) !== null).length;
    R.andTheyCostAFreshWorldNothing = (woken === 0 && rust.length >= 4 && pools.length >= 3 && cluttered === 0)
      ? `not one body is added at boot: ${rust.length} automatons and ${pools.length} pools lie dormant on bare ground until somebody walks up`
      : `!! ${woken} BIOME BODIES AT BOOT, ${rust.length} AUTOMATONS, ${pools.length} POOLS, ${cluttered} SLEEPERS UNDER DECOR`;
    return R;
  });

  await p.waitForTimeout(1500);
  await p.evaluate(() => document.getElementById('btn-start').click());
  await p.waitForTimeout(2500);

  if (!String(out.threeGroundsStandWhereTheirReasonsAre).startsWith('!! THERE ARE NO')) Object.assign(out, await p.evaluate(() => {
    const R = {};
    paused = true; hour = 12;
    const me = player()[0];
    const park = () => { for (const c of player()) { c.x = 30; c.y = 30; c.floor = 0; c.moveTarget = null; c.gather = null; c.job = null; } };
    /* nobody else near a spot, so nothing interrupts the work being measured */
    const clear = (x, y, r) => { for (const c of chars) if (c.faction !== 'player' && c.state !== 'dead' && dist(c.x, c.y, x, y) < r) c.x += 400; rebuildCharGrid(); };
    const spotIn = (id, awayFrom) => {
      for (let t = 0; t < 40000; t++) {
        const x = 2 + ((t * 977) % (W - 4)), y = 2 + ((t * 613) % (H - 4));
        if (biomeAt(x, y) !== id || biomeK[y * W + x] < 0.9 || isBlocked(x + 0.5, y + 0.5)) continue;
        if (biomeSleepers.some(s => dist(s.x, s.y, x, y) < (awayFrom || 14))) continue;
        if (towns.some(tn => dist(tn.x, tn.y, x, y) < (tn.clearR || 20) + 6)) continue;
        return { x: x + 0.5, y: y + 0.5 };
      }
      return null;
    };
    const run = (secs) => { for (let i = 0; i < secs * 30; i++) { hour = 12; update(1 / 30); } };
    park();

    /* ---- 3. the flats keep what dies on them ---- */
    {
      const on = spotIn(BIOME_SALT), off = { x: on.x, y: on.y };
      for (let r = 0; r < 400 && biomeAt(off.x, off.y); r += 3) off.x += 3;
      const a = makeChar('Salt Probe', 'bandit', on.x, on.y, {}); chars.push(a); kill(a, me);
      const z = makeChar('Dust Probe', 'bandit', off.x, off.y, {}); chars.push(z); kill(z, me);
      _biomeT = 0; biomeTick(1);
      a.deadAt -= 8; z.deadAt -= 8;
      const kept = decayStage(a).k, rotted = decayStage(z).k;
      /* and the dust still takes it: past BONE_DUST it goes at the day's turn, where brine would not */
      const b2 = makeChar('Brine Probe', 'bandit', on.x + 1, on.y, {}); chars.push(b2); kill(b2, me);
      b2.salted = true; b2.saltedAt = 0; b2.saltedBy = null;
      a.deadAt = b2.deadAt = day - BONE_DUST - 2;
      { const d0 = day; hour = 23.998; for (let i = 0; i < 600 && day === d0; i++) update(1 / 30); hour = 12; }
      const aGone = !corpses.includes(a), bKept = corpses.includes(b2);
      R.theFlatsKeepWhatDiesOnThem = (a.saltedBy === 'flats' && kept === 'fresh' && rotted !== 'fresh' && aGone && bKept)
        ? `eight days on, a body that fell on the flats is still ${kept} where one off them is ${rotted}; and the dust still takes it in the end, where a body in brine stays`
        : `!! FLATS BODY ${kept} (${a.saltedBy}), OFF THE FLATS ${rotted}, DUST TOOK IT ${aGone}, BRINE KEPT ${bKept}`;
      for (const c of [a, z, b2]) { const i = corpses.indexOf(c); if (i >= 0) corpses.splice(i, 1); const j = chars.indexOf(c); if (j >= 0) chars.splice(j, 1); }
    }

    /* ---- 4. the two trades ---- */
    const trade = (job, id, deco, item) => {
      park();
      let at = null;
      for (let y = 2; y < H - 2 && !at; y++) for (let x = 2; x < W - 2 && !at; x++) {
        if (biomeAt(x, y) !== id || decorAt(x, y) !== deco || isBlocked(x + 0.5, y + 0.5)) continue;
        if (biomeSleepers.some(s => dist(s.x, s.y, x, y) < 16)) continue;
        at = { x: x + 0.5, y: y + 0.5 };
      }
      if (!at) return { ok: false, got: 0, at: null };
      clear(at.x, at.y, 30);
      const hand = player()[1] || me;
      hand.x = at.x + 1.2; hand.y = at.y; hand.floor = 0; hand.inv = {}; hand.job = job; hand.jobNodeT = 0; hand.gather = null;
      const had = jobHasWork(hand, job);
      run(40);
      const got = (hand.inv && hand.inv[item]) || 0;
      hand.job = null; hand.gather = null;
      return { ok: had && got >= 3, got, had };
    };
    const sal = trade('salvage', BIOME_RUST, 'wreck', 'iron');
    const fog = trade('forage', BIOME_VAT, 'bloom', 'vflesh');
    R.theRustIsStrippedAndTheBogIsCut = (sal.ok && fog.ok)
      ? `forty seconds of SALVAGE at a wreck brings in ${sal.got} iron, and of FORAGE at a bloom ${fog.got} quickflesh`
      : `!! SALVAGE ${sal.got} IRON (WORK ${sal.had}), FORAGE ${fog.got} FLESH (WORK ${fog.had})`;

    /* ---- 5. the bog holds the living ---- */
    {
      park();
      const bog = spotIn(BIOME_VAT, 8), liv = makeChar('Wader', 'player', bog.x, bog.y, {}), dead = makeChar('Walker', 'player', bog.x, bog.y, {});
      dead.undead = true;
      const inL = moveSpeed(liv), inD = moveSpeed(dead);
      liv.x = dead.x = 30; liv.y = dead.y = 30;
      const outL = moveSpeed(liv), outD = moveSpeed(dead);
      R.theBogHoldsTheLivingNotTheDead = (inL < outL * 0.8 && Math.abs(inD - outD) < 1e-6)
        ? `a living body wades the bog at ${(inL / outL * 100).toFixed(0)}% of its pace; a dead one crosses it at full stride`
        : `!! LIVING ${inL.toFixed(2)}/${outL.toFixed(2)}, DEAD ${inD.toFixed(2)}/${outD.toFixed(2)}`;
    }

    /* ---- 6. what sits up, and what climbs out ---- */
    {
      park();
      const s = biomeSleepers.find(q => q.kind === 'automaton' && !biomeState.woke[q.key]);
      const pool = biomeSleepers.find(q => q.kind === 'pool' && !biomeState.woke[q.key]);
      clear(s.x, s.y, 20);
      me.x = s.x + 12; me.y = s.y; _biomeT = 0; biomeTick(1);
      const early = chars.filter(c => c.biomeOwn === 'rust').length;
      me.x = s.x + 4; me.y = s.y; _biomeT = 0; biomeTick(1);
      const woke = chars.filter(c => c.biomeOwn === 'rust');
      const au = woke[0];
      const gone = sleeperGone(Math.floor(s.x), Math.floor(s.y));
      /* and a reload does not lay it back down to wake a second time */
      restore(JSON.parse(JSON.stringify(snapshot())));
      const me2 = player()[0];
      me2.x = s.x + 3; me2.y = s.y; _biomeT = 0; biomeTick(1);
      const after = chars.filter(c => c.biomeOwn === 'rust').length;
      R.somethingInTheRustSitsUp = (early === 0 && woke.length === 1 && au && au.construct && hostile(au, me2) && dist(au.x, au.y, s.x, s.y) < 2 && gone && after === 1)
        ? `a wreck lies still at twelve tiles and sits up at four: one automaton, hostile, where the wreck was, and after a save and a reload it is still the one`
        : `!! AT 12: ${early}; AT 4: ${woke.length} (CONSTRUCT ${au && au.construct}, WRECK GONE ${gone}); AFTER A RELOAD ${after}`;
      const me3 = player()[0];
      clear(pool.x, pool.y, 20);
      me3.x = pool.x + 3; me3.y = pool.y; _biomeT = 0; biomeTick(1);
      const spawn = chars.filter(c => c.biomeOwn === 'vat');
      R.andThePoolsAreNotEmpty = (spawn.length === 2 && spawn.every(c => c.faction === 'redoubt' && c.race === 'homunculus' && c.guard && hostile(c, me3)))
        ? `walking up to a pool brings two vat-spawn out of it, unarmed, posted, and hostile: "${spawn[0].barks[2]}"`
        : `!! ${spawn.length} VAT-SPAWN FROM A POOL`;
    }

    /* ---- 7. the map ---- */
    {
      const g = mmBase.getContext('2d');
      const px = (t) => g.getImageData(Math.floor(t.x * 128 / W), Math.floor(t.y * 128 / H), 1, 1).data;
      const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
      const same = (d, h) => { const c = hex(h); return Math.abs(d[0] - c[0]) + Math.abs(d[1] - c[1]) + Math.abs(d[2] - c[2]) < 12; };
      const sp = spotIn(BIOME_SALT, 0), rp = spotIn(BIOME_RUST, 0), vp = spotIn(BIOME_VAT, 0);
      const ok = same(px(sp), BIOMES[1].col) && same(px(rp), BIOMES[2].col) && same(px(vp), BIOMES[3].col);
      R.theMapDrawsThem = ok ? 'and the minimap draws the flats, the rust and the bog in their own colours'
        : `!! MINIMAP ${[...px(sp)].slice(0, 3)} / ${[...px(rp)].slice(0, 3)} / ${[...px(vp)].slice(0, 3)}`;
    }
    return R;
  }));

  const bad = Object.values(out).filter(v => typeof v === 'string' && v.startsWith('!!'));
  for (const [k, v] of Object.entries(out)) console.log('  ' + k.padEnd(40) + ' ' + v);
  for (const e of errs) console.log('  ' + e);
  console.log('');
  const which = Object.keys(out).filter(k => typeof out[k] === 'string' && out[k].startsWith('!!'));
  console.log(bad.length || errs.length ? `*** THE GROUNDS ARE WRONG (${bad.length + errs.length}): ${[...which, ...errs.map(() => 'pageerror')].join(', ')} ***`
                                        : 'THE FLATS, THE RUST AND THE BOG ARE THERE');
  await b.close();
  process.exit(bad.length || errs.length ? 1 : 0);
})();
