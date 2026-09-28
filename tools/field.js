#!/usr/bin/env node
/* THE FIELD AFTER A FIGHT, CHECKED IN PLAY (the 2026-09-26 play notes).
 *
 *   1. down is not dead: a downed body pulses pale, a corpse loses its colour
 *   2. the mass reanimation is seen: a circle the size of the working, a leyline to every body
 *      that will rise, a filling ring, and all of it gone once the rite has landed
 *   3. EXECUTE finishes downed foes on its own, and only foes: not one somebody of yours was
 *      told to seize, not a prisoner, and not while a live enemy is still close
 *   4. a firebolt into a scrum can take whoever is tangled with the target, as an arrow can
 *   5. a mage is better than an equally skilled crossbow over a short fight, and not by three
 *      times over: magic 40 against atk and ranged 40, into plate, fifteen seconds
 *
 * Anything starting '!!' fails the build.
 *
 *   node tools/field.js [game.html]
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
  await p.waitForTimeout(1500);
  await p.evaluate(() => document.getElementById('btn-start').click());
  await p.waitForTimeout(2500);

  /* a stretch of open waste with nobody on it, the clock held at noon */
  const setup = await p.evaluate(() => {
    paused = true; hour = 12;
    let q = null;
    for (let t = 0; t < 400 && !q; t++) {
      const x = 80 + ((t * 977) % (W - 160)), y = 80 + ((t * 613) % (H - 160));
      if (nearestTownDist(x, y) > 70 && (typeof craterD !== 'function' || craterD(x, y) > 240) && !isBlocked(x, y) && !isBlocked(x + 7, y)) q = { x, y };
    }
    for (const c of chars) if (c.state !== 'dead' && dist(c.x, c.y, q.x, q.y) < 40) c.x += 300;
    const me = player()[0];
    for (const c of player()) { c.x = q.x + 30; c.y = q.y + 30; c.moveTarget = null; }
    me.x = q.x; me.y = q.y;
    window.__q = q; window.__me = me;
    rebuildCharGrid();
    return { ok: !!q };
  });
  const frames = async (n) => { for (let i = 0; i < n; i++) await p.evaluate(() => new Promise(r => { hour = 12; syncChars(1 / 60); requestAnimationFrame(() => r()); })); };
  const out = {};

  /* ---- 1. down is not dead ---- */
  await p.evaluate(() => {
    const q = window.__q, me = window.__me;
    const mk = (n, dx) => { const v = makeChar(n, 'bandit', q.x + dx, q.y + 2, { atk: 5, tough: 10 }); v.__probe = true; chars.push(v); return v; };
    window.__down = mk('Downed', 2); window.__down.state = 'down'; window.__down.downT = 999;
    window.__dead = mk('Dead', 4); kill(window.__dead, me);
    window.__alive = mk('Standing', 6); window.__alive.noFight = true;
    rebuildCharGrid(); computeVision();
    camX = camSX = q.x + 3; camY = camSY = q.y + 2; camDist = camDistTarget = 20;
  });
  await frames(24);
  Object.assign(out, await p.evaluate(() => {
    const R = {}, e = (c) => charMeshes.get(c.id);
    const glow = (c) => { const x = e(c); return x ? Math.max(...x.mats.map(m => m.emissive.r)) : -1; };
    const sat = (c) => { const x = e(c); if (!x) return -1; let s = 0; for (const m of x.mats) { const cl = m.color, mx = Math.max(cl.r, cl.g, cl.b), mn = Math.min(cl.r, cl.g, cl.b); s += mx > 0 ? (mx - mn) / mx : 0; } return s / x.mats.length; };
    const gd = glow(window.__down), gdead = glow(window.__dead), sd = sat(window.__dead), sa = sat(window.__alive);
    R.downIsNotDead = gd > 0.1 && gdead < 0.05 && sd >= 0 && sd < sa * 0.7
      ? `a downed body glows ${gd.toFixed(2)} and a corpse ${gdead.toFixed(2)}; the corpse keeps ${(sd / sa * 100).toFixed(0)}% of a living body's colour`
      : `!! DOWNED GLOW ${gd.toFixed(2)}, CORPSE GLOW ${gdead.toFixed(2)}, CORPSE SATURATION ${sd.toFixed(2)} AGAINST ${sa.toFixed(2)} ALIVE`;
    return R;
  }));

  /* ---- 2. the rite is seen ---- */
  await p.evaluate(() => {
    const q = window.__q, me = window.__me;
    me.gift = 'dark'; me.att = { divine: 0, destruction: 0, dark: 3, dust: 0 }; me.stats.magic = 40; me.mana = 999;
    for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2; const v = makeChar('Raider ' + i, 'bandit', q.x + Math.cos(a) * 7, q.y + Math.sin(a) * 7, { atk: 5, tough: 10 }); v.__probe = true; chars.push(v); kill(v, me); }
    rebuildCharGrid();
    window.__began = beginMassRaise(me);
    if (theRaising) { theRaising.work = MASS_WORK * 0.5; theRaising.t = 5; }
  });
  await frames(6);
  Object.assign(out, await p.evaluate(() => {
    const R = {};
    const n = corpses.filter(b => massRaisable(window.__me, b)).length;
    const fx = typeof raiseFx !== 'undefined' ? raiseFx : null;
    const lines = fx && fx.lines.geometry.index ? fx.lines.geometry.index.count / 6 / 10 : 0;
    const disc = fx && fx.circle.geometry.boundingSphere ? fx.circle.geometry.boundingSphere : null;
    if (fx && !disc) fx.circle.geometry.computeBoundingSphere();
    const r = fx ? fx.circle.geometry.boundingSphere.radius : 0;
    window.__rite = { fx: !!fx, lines, n, r, prog: !!(fx && fx.prog.geometry.attributes.position), began: window.__began };
    return R;
  }));
  await p.evaluate(() => completeMassRaise());
  await frames(80);
  Object.assign(out, await p.evaluate(() => {
    const x = window.__rite, gone = typeof raiseFx === 'undefined' || !raiseFx;
    return { theRiteIsSeen: x.began && x.fx && x.lines === x.n && x.n > 0 && x.r >= MASS_RADIUS && x.prog && gone
      ? `the rite over ${x.n} of the dead draws a circle ${x.r.toFixed(1)} across its middle, ${x.lines} leylines, one to each, and a filling ring; once it lands, it is gone`
      : `!! RITE ${JSON.stringify(x)}, CLEARED AFTER ${gone}` };
  }));

  /* ---- 3. EXECUTE ---- */
  Object.assign(out, await p.evaluate(() => {
    const R = {}, q = window.__q;
    for (let i = chars.length - 1; i >= 0; i--) if (chars[i].__probe) chars.splice(i, 1);
    const ex = makeChar('Headsman', 'player', q.x, q.y, { atk: 30, def: 30, tough: 60 }); ex.__probe = true; chars.push(ex);
    setJob(ex, 'execute');
    const down = (n, dx, dy) => { const v = makeChar(n, 'bandit', q.x + dx, q.y + dy, { atk: 5, tough: 10 }); v.__probe = true; v.state = 'down'; v.downT = 1e6; chars.push(v); return v; };
    const foe = down('Foe', 6, 0), kept = down('Kept', -6, 0), far = down('Far', 30, 0);
    const holder = makeChar('Holder', 'player', q.x - 40, q.y, { atk: 5, tough: 60 }); holder.__probe = true; chars.push(holder);
    holder.seizeTarget = kept;
    const step = (secs) => { for (let i = 0; i < secs * 30; i++) { hour = 12; foe.downT = kept.downT = far.downT = 1e6; for (const v of [foe, kept, far]) if (v.state !== 'dead') v.state = 'down'; holder.seizeTarget = kept; holder.x = q.x - 40; update(1 / 30); } };
    /* a live enemy close by: it waits */
    const live = makeChar('Live', 'bandit', q.x + 5, q.y + 3, { atk: 1, tough: 200 }); live.__probe = true; live.noFight = true; live.speedMult = 0; live.blood = live.maxBlood = 1e6; chars.push(live);
    rebuildCharGrid();
    step(4);
    R.waited = foe.state === 'down';
    /* and then it falls, the way a fight ends: killed, not spirited away */
    kill(live, null); ex.target = null; rebuildCharGrid();
    step(12);
    R.executeJob = R.waited && foe.state === 'dead' && kept.state === 'down' && far.state === 'down'
      ? 'a hand on EXECUTE waits while a live enemy is close, then finishes the downed foe beside it; it leaves one somebody was told to seize, and one past its reach'
      : `!! WAITED ${R.waited}; FOE ${foe.state}, THE ONE BEING SEIZED ${kept.state}, THE FAR ONE ${far.state}`;
    delete R.waited;
    for (let i = chars.length - 1; i >= 0; i--) if (chars[i].__probe) chars.splice(i, 1);
    for (let i = corpses.length - 1; i >= 0; i--) if (corpses[i].__probe) corpses.splice(i, 1);
    rebuildCharGrid();
    return R;
  }));

  /* ---- 4. a bolt into a scrum ---- */
  Object.assign(out, await p.evaluate(() => {
    const q = window.__q;
    const mage = makeChar('Mage', 'player', q.x, q.y, { atk: 10, magic: 20 }); mage.__probe = true; chars.push(mage);
    const foe = makeChar('Foe', 'bandit', q.x + 6, q.y, { atk: 1 }); foe.__probe = true; chars.push(foe);
    const ally = makeChar('Ally', 'player', q.x + 6.5, q.y, { atk: 1 }); ally.__probe = true; chars.push(ally);
    let stray = 0;
    /* every cast teaches, so the caster is held at magic 20 or the stray chance falls away as it learns */
    for (let i = 0; i < 400; i++) { projectiles.length = 0; mage.mana = 999; mage.stats.magic = 20; castFirebolt(mage, foe); if (projectiles.length && projectiles[0].target === ally) stray++; }
    projectiles.length = 0;
    for (let i = chars.length - 1; i >= 0; i--) if (chars[i].__probe) chars.splice(i, 1);
    rebuildCharGrid();
    return { boltsStray: stray > 20 && stray < 200 ? `a firebolt at a foe tangled with one of yours took the ally ${stray} times in 400` : `!! A BOLT INTO A SCRUM TOOK THE ALLY ${stray} TIMES IN 400` };
  }));

  /* ---- 5. the mage against the crossbow ---- */
  Object.assign(out, await p.evaluate(() => {
    const q = window.__q;
    const hp = (d) => d.blood + Object.values(d.parts).reduce((s, x) => s + x.hp, 0);
    const run = (mk) => {
      let tot = 0;
      for (let rep = 0; rep < 8; rep++) {
        const d = makeChar('Dummy', 'bandit', q.x + 7, q.y, { atk: 0, def: 10, tough: 20 }); d.__probe = true;
        d.armor = 'a_pla'; d.noFight = true; d.speedMult = 0; d.provoked = true; d.blood = d.maxBlood = 1e6;
        for (const k in d.parts) { d.parts[k].hp = 1e6; d.parts[k].max = 1e6; }
        chars.push(d);
        const a = mk(); a.__probe = true; a.x = q.x; a.y = q.y; a.floor = 0; chars.push(a); a.target = d; a.targetManual = true; a.autoFight = true;
        rebuildCharGrid();
        const h0 = hp(d);
        for (let i = 0; i < 15 * 30; i++) { hour = 12; update(1 / 30); a.target = d; d.x = q.x + 7; d.y = q.y; }
        tot += (h0 - hp(d)) / 15;
        for (let i = chars.length - 1; i >= 0; i--) if (chars[i].__probe) chars.splice(i, 1);
        projectiles.length = 0; rebuildCharGrid();
      }
      return tot / 8;
    };
    const xbow = run(() => { const c = makeChar('Shooter', 'player', 0, 0, { atk: 40, def: 20, tough: 40, ranged: 40 }); c.weapon = 'w_xbow'; c.stance = 'ranged'; return c; });
    const mage = run(() => { const c = makeChar('Mage', 'player', 0, 0, { atk: 10, def: 20, tough: 40, magic: 40 }); makeAlchemist(c, 'destruction', [], 40); c.stats.magic = 40; c.att = { divine: 0, destruction: 3, dark: 0, dust: 0 }; c.stance = 'ranged'; c.mana = rawMaxMana(c); return c; });
    const k = mage / xbow;
    return { aMageIsBetterNotThreeTimesBetter: k > 1.05 && k < 2.4
      ? `over fifteen seconds into plate a magic-40 mage does ${mage.toFixed(1)} a second against ${xbow.toFixed(1)} for a crossbow at atk and ranged 40: ${k.toFixed(2)} times (it was about 2.8)`
      : `!! MAGE ${mage.toFixed(1)} AGAINST CROSSBOW ${xbow.toFixed(1)}: ${k.toFixed(2)} TIMES` };
  }));

  const bad = Object.values(out).filter(v => typeof v === 'string' && v.startsWith('!!'));
  for (const [k, v] of Object.entries(out)) console.log('  ' + k.padEnd(34) + ' ' + v);
  for (const e of errs) console.log('  ' + e);
  console.log('');
  const which = Object.keys(out).filter(k => typeof out[k] === 'string' && out[k].startsWith('!!'));
  console.log(bad.length || errs.length ? `*** THE FIELD READS WRONG (${bad.length + errs.length}): ${[...which, ...errs.map(() => 'pageerror')].join(', ')} ***`
                                        : 'THE FIELD READS RIGHT');
  await b.close();
  process.exit(bad.length || errs.length ? 1 : 0);
})();
