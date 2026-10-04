#!/usr/bin/env node
/* THE CALCINE WOOD (ruled 2026-10-03, LORE-SEAMS §12.8).
 *
 *   "As for the ash woods, the Calcine Wood is good for now as far as a name. Raised corpses take
 *    on a blackened coloration (black bones) if left there long enough, and yield stronger
 *    undead. Dangers include ash squalls, which require a hat to protect against unless you're
 *    undead (acid rain basically)."
 *
 *   1. the wood stands past the crater's ridge and off the headland, keeps clear of every town's
 *      walls, is a WOOD (the heart thick with trees), and says its name the first time you walk in
 *   2. a body left lying in it goes black after CALCINE_H game-hours, not before, and not outside it
 *   3. and comes up stronger than a plain body raised the same way, black in the rebuild key
 *   4. a risen standing in it goes black too, and stronger once, not again and again
 *   5. the squall keeps a clock every save agrees on and the world's stream never hears of: about
 *      half the days, an hour and a half to three and a half long
 *   6. in a squall the bare-headed living are burned at the scalp, down to SQUALL_FLOOR and no
 *      further; a cap, a roof (a shack of yours), being dead, or being outside the wood keeps it
 *      off; out of a squall nobody burns
 *   7. a save and a load keep the black bones and the hours already spent
 *
 * Anything starting '!!' fails the build.
 *
 *   node tools/calcine.js [game.html]
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
  await p.goto('file://' + gamePath(process.argv[2]), { waitUntil: 'load', timeout: 90000 });
  await p.waitForSelector('#btn-start', { state: 'attached', timeout: 60000 });
  await p.evaluate(() => { document.getElementById('btn-start').click(); paused = true; });
  await p.waitForTimeout(2600);

  const out = await p.evaluate(() => {
    const R = {};
    paused = true;
    const guard = (keys, fn) => {
      try { fn(); } catch (e) { for (const k of keys) if (R[k] === undefined) R[k] = '!! ' + String(e.message).slice(0, 110).toUpperCase(); }
    };
    if (typeof BIOME_ASH === 'undefined' || !biomeCentre.ash) { R.theWoodStandsPastTheRidge = '!! THERE IS NO CALCINE WOOD IN THIS BUILD'; return R; }
    const A = biomeCentre.ash;
    const me = player()[0];
    const born = [];
    /* A DUSTBORN, NOT WHOEVER THE DICE MADE: `makeChar` rolls a line when it is not told one, and a
       line's flat bonus lands on the corpse's stats — the plain body and the black one have to
       start level, or "stronger" is measuring two different rolls (the same fault mishap.js and
       dark.js carried) */
    const mk = (name, f, x, y, o) => { const c = makeChar(name, f, x, y, Object.assign({ race: 'human', sub: 'dustborn' }, o || {})); c.floor = 0; chars.push(c); born.push(c); return c; };
    const wipe = () => {
      for (const c of born) { let i = chars.indexOf(c); if (i >= 0) chars.splice(i, 1); i = corpses.indexOf(c); if (i >= 0) corpses.splice(i, 1); }
      born.length = 0; rebuildCharGrid();
    };
    /* the clock, an hour at a time, with nothing else in the world moving */
    const rebase = () => { _ashLastH = null; calcineTick(); };
    const adv = (h, step) => { step = step || 1; for (let k = 0; k < h; k += step) { hour += step; while (hour >= 24) { hour -= 24; day++; } calcineTick(); } };
    /* deep in the wood, open ground, nobody else about */
    const spot = (minK) => {
      for (let t = 0; t < 60000; t++) {
        const x = Math.round(A.x + ((t * 977) % 201) - 100), y = Math.round(A.y + ((t * 613) % 201) - 100);
        if (biomeAt(x, y) !== BIOME_ASH || biomeK[y * W + x] < (minK || 0.9) || isBlocked(x + 0.5, y + 0.5)) continue;
        let clear = true;
        for (let j = -3; j <= 3 && clear; j++) for (let i = -3; i <= 3; i++) if (isBlocked(x + i + 0.5, y + j + 0.5) || biomeAt(x + i, y + j) !== BIOME_ASH) { clear = false; break; }
        if (!clear) continue;
        return { x: x + 0.5, y: y + 0.5 };
      }
      return null;
    };
    const outside = () => {
      for (let r = A.R * 2; r < A.R * 4; r += 7) for (let a = 0; a < 6.28; a += 0.4) {
        const x = Math.round(A.x + Math.cos(a) * r), y = Math.round(A.y + Math.sin(a) * r);
        if (x < 5 || y < 5 || x > W - 5 || y > H - 5 || biomeAt(x, y) || isBlocked(x + 0.5, y + 0.5) || inHeadland(x, y, 4)) continue;
        return { x: x + 0.5, y: y + 0.5 };
      }
      return null;
    };
    const parkSquad = () => { for (const c of player()) { c.x = 30; c.y = 30; c.floor = 0; } rebuildCharGrid(); };
    parkSquad();

    /* ---------- 1. WHERE IT STANDS, AND WHAT IT IS ---------- */
    guard(['theWoodStandsPastTheRidge', 'itIsAWood', 'andItSaysItsName'], () => {
      let n = 0, onHead = 0, inTown = 0, heart = 0, heartTrees = 0;
      for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
        if (biomeAt(x, y) !== BIOME_ASH) continue;
        n++;
        if (inHeadland(x, y)) onHead++;
        if (towns.some(t => dist(t.x, t.y, x, y) < (t.clearR || 20) + 8)) inTown++;
        if (biomeK[y * W + x] >= 0.9 && terr[y * W + x] !== 2 && terr[y * W + x] !== 3) { heart++; if (rawDecorAt(x, y) === 'tree') heartTrees++; }
      }
      const cd = craterD(A.x, A.y), edge = CRATER.range + CRATER.ridge + 7;
      R._ground = `centre ${A.x},${A.y}, ${n} tiles, ${Math.round(cd)} from the crater (the headland runs to ${edge})`;
      R.theWoodStandsPastTheRidge = (n > 15000 && onHead === 0 && inTown === 0 && cd > edge)
        ? `the wood stands ${Math.round(cd - edge)} tiles past the crater's ridge, ${n} tiles of it, with none on the headland and none inside a town's walls`
        : `!! ${n} TILES, ${onHead} ON THE HEADLAND, ${inTown} IN A TOWN, CENTRE ${Math.round(cd)} FROM THE CRATER (RIDGE AT ${edge})`;
      const share = heart ? heartTrees / heart : 0;
      R.itIsAWood = share >= 0.10
        ? `and it is a wood: ${(share * 100).toFixed(0)}% of the open ground at its heart stands a black trunk (the plain grows one tile in fourteen of its grass)`
        : `!! ONLY ${(share * 100).toFixed(1)}% OF THE HEART HAS A TREE ON IT`;
      const s = spot();
      const was = !!biomeState.seen[BIOME_ASH];
      me.x = s.x; me.y = s.y; me.state = 'ok';
      _biomeT = 0; biomeTick(1);
      const told = [...document.querySelectorAll('#log div, #log p')].slice(-4).map(e => e.textContent).join(' // ');
      R.andItSaysItsName = (!was && biomeState.seen[BIOME_ASH] && told.includes(BIOMES[BIOME_ASH].enter.slice(0, 30)))
        ? `walking in says so, once: "${BIOMES[BIOME_ASH].enter}"`
        : `!! SEEN BEFORE ${was}, AFTER ${!!biomeState.seen[BIOME_ASH]}, LOG "${told.slice(0, 120)}"`;
      parkSquad();
    });

    /* ---------- 2 and 3. A BODY LEFT IN IT, AND WHAT IT COMES UP AS ---------- */
    guard(['aBodyLeftInItGoesBlack', 'andRisesStronger'], () => {
      const s = spot(), o = outside();
      /* low numbers, so the rite's ceiling is the corpse's own and both come up level before the wood is counted */
      const stats = { atk: 3, def: 3, tough: 3, ath: 6 };
      const inW = mk('Probe Lain', 'bandit', s.x, s.y, stats), half = mk('Probe Half', 'bandit', s.x + 2, s.y, stats), out2 = mk('Probe Elsewhere', 'bandit', o.x, o.y, stats);
      for (const c of [inW, half, out2]) kill(c, me);
      rebase();
      adv(CALCINE_H - 1);
      const early = inW.calcined;
      /* the half-way body is carried out of the wood before its time, and stays as it was */
      half.x = o.x + 2; half.y = o.y;
      adv(2);
      R._clock = `after ${CALCINE_H - 1}h: ${early}; after ${CALCINE_H + 1}h: in the wood ${inW.calcined} (${inW.ashH.toFixed(1)}h), carried out at half ${!!half.calcined} (${(half.ashH || 0).toFixed(1)}h), elsewhere ${!!out2.calcined}`;
      R.aBodyLeftInItGoesBlack = (!early && inW.calcined && !half.calcined && !out2.calcined)
        ? `a body left ${CALCINE_H} hours in the wood goes black to the marrow — not an hour sooner, not one carried out before its time, and not one lying anywhere else`
        : `!! ${R._clock}`;
      R._black = { id: inW.id };
      /* the same rite on both, the same caster, the same day */
      me.x = s.x - 1; me.y = s.y; me.state = 'ok';
      /* THE SAME DICE FOR BOTH. The rite's own `makeChar` rolls a line for the risen, and a line
         that takes a point of arm off survives the ceiling — so two raisings of level bodies are
         not level unless they draw the same numbers. Pocketed, so nothing after this sees it. */
      const pocket = seed;
      let plainR, blackR;
      try {
        seed = 424242; plainR = castRaise(me, out2, { free: true, quiet: true });
        seed = 424242; blackR = castRaise(me, inW, { free: true, quiet: true });
      } finally { seed = pocket; }
      born.push(plainR, blackR);
      const k = (a, b2) => (b2 ? a / b2 : 0);
      const ratios = ['atk', 'def', 'tough'].map(s2 => k(blackR.stats[s2], plainR.stats[s2]));
      const bloodK = k(blackR.maxBlood, plainR.maxBlood);
      R._raised = `plain ${['atk', 'def', 'tough'].map(s2 => plainR.stats[s2]).join('/')} blood ${plainR.maxBlood}; black ${['atk', 'def', 'tough'].map(s2 => blackR.stats[s2]).join('/')} blood ${blackR.maxBlood}`;
      R.andRisesStronger = (blackR.calcined && !plainR.calcined && ratios.every(r => r >= 1.2) && bloodK >= 1.2 && colorKeyOf(blackR) !== colorKeyOf(plainR) && colorKeyOf(blackR).endsWith('|X'))
        ? `and raised, it comes up ${Math.round((bloodK - 1) * 100)}% harder than a plain body raised by the same hand (${R._raised}), and black on screen — the one corpse that rises stronger than it fell`
        : `!! ${R._raised}; black ${blackR.calcined}, plain ${plainR.calcined}, keys ${colorKeyOf(blackR).slice(-6)} / ${colorKeyOf(plainR).slice(-6)}`;
      R._blackRisen = blackR.id;
      /* kept for the save claim */
      born.splice(born.indexOf(blackR), 1);
      wipe();
    });

    /* ---------- 4. AND A RISEN STANDING IN IT ---------- */
    guard(['aRisenStandingInItBlackensOnce'], () => {
      const s = spot(), o = outside();
      const body = mk('Probe Fodder', 'bandit', o.x, o.y, { atk: 3, def: 3, tough: 3 });
      kill(body, me);
      me.x = o.x - 1; me.y = o.y;
      const r = castRaise(me, body, { free: true, quiet: true });
      born.push(r);
      const before = { atk: r.stats.atk, blood: r.maxBlood };
      r.x = s.x; r.y = s.y; r.state = 'ok';
      rebase();
      adv(CALCINE_H - 1);
      const early = !!r.calcined;
      adv(2);
      const once = { atk: r.stats.atk, blood: r.maxBlood };
      adv(CALCINE_H * 3);
      const later = { atk: r.stats.atk, blood: r.maxBlood };
      R.aRisenStandingInItBlackensOnce = (!early && r.calcined && once.atk > before.atk && later.atk === once.atk && later.blood === once.blood)
        ? `a risen stood in the wood goes black at ${CALCINE_H} hours and comes up harder (atk ${before.atk} → ${once.atk}, blood ${before.blood} → ${once.blood}), and three times as long again adds nothing — it happens once`
        : `!! EARLY ${early}, BLACK ${!!r.calcined}, ATK ${before.atk} → ${once.atk} → ${later.atk}, BLOOD ${before.blood} → ${once.blood} → ${later.blood}`;
      wipe();
    });

    /* ---------- 5. THE SQUALL'S CLOCK ---------- */
    guard(['theSquallKeepsAClockNotADie'], () => {
      const s0 = seed;
      let days = 0, lens = [], same = true;
      for (let d = 1; d <= 400; d++) {
        const w = squallOf(d), w2 = squallOf(d);
        if (JSON.stringify(w) !== JSON.stringify(w2)) same = false;
        if (w) { days++; lens.push(w.b - w.a); }
      }
      for (let i = 0; i < 500; i++) squallOn();
      const share = days / 400, lo = Math.min(...lens), hi = Math.max(...lens);
      R.theSquallKeepsAClockNotADie = (same && seed === s0 && share > 0.35 && share < 0.65 && lo >= 1.5 && hi <= 3.5)
        ? `a squall comes on ${(share * 100).toFixed(0)}% of days, ${lo.toFixed(1)} to ${hi.toFixed(1)} hours long, off the day's own hash — the same on every load, and not one draw on the world's stream`
        : `!! SAME ${same}, STREAM MOVED ${seed !== s0}, SHARE ${share.toFixed(2)}, LENGTHS ${lo.toFixed(2)}-${hi.toFixed(2)}`;
    });

    /* ---------- 6. WHO THE ASH BURNS ---------- */
    guard(['theBareHeadedBurn', 'butACapARoofOrDeathKeepsItOff', 'andItStopsShortOfKilling', 'andOutOfASquallNobodyBurns'], () => {
      const s = spot(0.95), o = outside();
      let d = day + 1; while (!squallOf(d)) d++;
      const w = squallOf(d);
      const bare = mk('Probe Bare', 'player', s.x, s.y), capped = mk('Probe Capped', 'player', s.x + 1, s.y), dead = mk('Probe Risen', 'player', s.x + 2, s.y);
      capped.head = 'h_cap'; dead.undead = true;
      const far = mk('Probe Elsewhere', 'player', o.x, o.y);
      /* a shack of yours, raised the way the build bar raises one, with somebody inside it */
      let sh = null;
      for (let j = -12; j <= 12 && !sh; j += 3) for (let i = -12; i <= 12; i += 3) {
        const tx = Math.floor(s.x) + i, ty = Math.floor(s.y) + j + 6;
        let ok = true;
        for (let yy = ty; yy < ty + 3 && ok; yy++) for (let xx = tx; xx < tx + 3; xx++) if (isBlocked(xx + 0.5, yy + 0.5) || biomeAt(xx, yy) !== BIOME_ASH) { ok = false; break; }
        if (ok) { placeStructure('shack', tx, ty); sh = pBuilds[pBuilds.length - 1]; sh.__probe = true; break; }
      }
      const housed = mk('Probe Housed', 'player', sh.x + 1.5, sh.y + 1.5);
      const all = [bare, capped, dead, far, housed];
      day = d; hour = w.a - d * 24 + 0.1;
      rebase();
      const h0 = all.map(c => c.parts.head.hp);
      hour += 0.5; calcineTick();
      const h1 = all.map(c => c.parts.head.hp);
      R._burn = all.map((c, i) => `${c.name.replace('Probe ', '')} ${h0[i]}→${h1[i].toFixed(0)}`).join(', ');
      R.theBareHeadedBurn = (h1[0] < h0[0] - 10 && squallOn())
        ? `in a squall, the living bare-headed in the wood lose ${(h0[0] - h1[0]).toFixed(0)} off the head in half an hour`
        : `!! ${R._burn}, SQUALL ${!!squallOn()}`;
      R.butACapARoofOrDeathKeepsItOff = (h1[1] === h0[1] && h1[2] === h0[2] && h1[3] === h0[3] && h1[4] === h0[4])
        ? 'while a cap, being dead, standing outside the wood, or the roof of a shack of yours keeps every point of it off'
        : `!! ${R._burn}`;
      bare.parts.head.hp = SQUALL_FLOOR + 5;
      hour += 0.5; calcineTick();
      const fl = bare.parts.head.hp;
      R.andItStopsShortOfKilling = (fl === SQUALL_FLOOR && bare.state === 'ok')
        ? `and it burns a head down to ${SQUALL_FLOOR} and no further: it puts somebody in a bad way, it does not put them in the ground`
        : `!! A HEAD AT ${SQUALL_FLOOR + 5} WENT TO ${fl} (${bare.state})`;
      /* the day after, out of its window */
      let dd = d + 1; while (squallOf(dd)) dd++;
      day = dd; hour = 12; rebase();
      bare.parts.head.hp = 100;
      hour += 1; calcineTick();
      R.andOutOfASquallNobodyBurns = (bare.parts.head.hp === 100 && !squallOn())
        ? 'and on a day the ash stays up, nobody in the wood is touched'
        : `!! OUT OF A SQUALL THE BARE HEAD WENT TO ${bare.parts.head.hp} (squall ${!!squallOn()})`;
      const i = pBuilds.indexOf(sh); if (i >= 0) pBuilds.splice(i, 1);
      wipe();
    });

    /* ---------- 7. THE SAVE ---------- */
    guard(['andItRidesTheSave'], () => {
      const s = spot();
      const lying = mk('Probe Waiting', 'bandit', s.x, s.y, { atk: 3, def: 3, tough: 3 });
      kill(lying, me);
      lying.ashH = 12.5;
      const black = chars.find(c => c.id === R._blackRisen);
      const bid = black ? black.id : -1, lid = lying.id;
      restore(JSON.parse(JSON.stringify(snapshot())));
      const b2 = chars.find(c => c.id === bid), l2 = chars.find(c => c.id === lid);
      R.andItRidesTheSave = (b2 && b2.calcined && l2 && !l2.calcined && Math.abs((l2.ashH || 0) - 12.5) < 0.01 && colorKeyOf(b2).endsWith('|X'))
        ? `and a save and a load keep a black risen black, and a body half-way there half-way there (${l2.ashH}h of ${CALCINE_H})`
        : `!! AFTER A LOAD: BLACK RISEN ${b2 ? b2.calcined : 'missing'}, WAITING BODY ${l2 ? (l2.calcined + ' at ' + l2.ashH) : 'missing'}`;
    });

    delete R._black;
    return R;
  });

  const bad = Object.values(out).filter(v => typeof v === 'string' && v.startsWith('!!'));
  for (const [k, v] of Object.entries(out)) console.log('  ' + (k.startsWith('_') ? ('· ' + k.slice(1)).padEnd(34) : k.padEnd(34)) + ' ' + (typeof v === 'string' ? v : JSON.stringify(v)));
  for (const e of errs) console.log('  ' + e);
  console.log('');
  console.log(bad.length || errs.length ? `THE WOOD IS STILL ONLY TREES (${bad.length + errs.length})`
                                        : 'THE BONE GOES BLACK IN THE WOOD, AND THE ASH FINDS THE BARE-HEADED');
  await b.close();
  process.exit(bad.length || errs.length ? 1 : 0);
})();
