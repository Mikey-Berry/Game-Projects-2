#!/usr/bin/env node
/* How a fight actually feels, in numbers.
 *
 * ttk.js answers "how many swings", which is a balance question. This answers "how long is
 * a swing, how much of it are you committed to, and how big is the number when it lands" —
 * which is the feel question, and the one ttk.js deliberately throws away by zeroing atkCd
 * before every blow.
 *
 * It drives physics() at a fixed dt so cadence is measured off the sim's own clock, not off
 * a hand-cranked loop. Two fighters, one of them immortal so the duel runs long enough to
 * average, and a tally of every beat:
 *
 *   cadence   swings per second of real fight time
 *   window    seconds from the decision to swing until the blow lands (the telegraph)
 *   rooted    fraction of the fight the attacker cannot move or react. Minecraft is ~0.
 *   perHit    damage that actually got through armour, per landed blow
 *   dps       the two multiplied — the balance number, which should NOT move much
 *
 * Usage: node tools/cadence.js [game.html]
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
  p.on('pageerror', e => errs.push(e.message.slice(0, 200)));
  await p.goto('file://' + gamePath(process.argv[2]), { waitUntil: 'load' });
  await p.waitForTimeout(3000);
  await p.evaluate(() => document.getElementById('btn-start').click());
  await p.waitForTimeout(2500);

  const out = await p.evaluate(() => {
    const DT = 1 / 30, SECS = 180;

    /* a clean patch of ground far from the world's own business */
    const spot = () => {
      for (let y = 40; y < H - 40; y += 7) for (let x = 40; x < W - 40; x += 7) {
        let ok = true;
        for (let j = -2; j <= 2 && ok; j++) for (let i = -2; i <= 2; i++) if (isBlocked(x + i, y + j, 0)) { ok = false; break; }
        if (ok) return { x, y };
      }
      return { x: 600, y: 600 };
    };
    const S = spot();

    function bout(wep, armor, opts) {
      opts = opts || {};
      const keep = chars.slice();
      chars.length = 0;
      if (typeof charGrid !== 'undefined' && charGrid.clear) charGrid.clear();

      const a = makeChar('A', 'player', S.x, S.y, { atk: 20, blades: 15, blunt: 15, ranged: 15, martial: 15 });
      const d = makeChar('D', 'bandit', S.x + (opts.range ? 4 : 0.7), S.y, { def: 12, tough: opts.tough || 12, ath: 10 });
      a.state = d.state = 'ok';
      a.weapon = wep; d.armor = armor || null;
      a.stance = opts.range ? 'ranged' : 'melee';
      chars.push(a, d);
      if (typeof charById !== 'undefined') { charById.set(a.id, a); charById.set(d.id, d); }

      /* the defender is a post: it does not move, does not swing back, and does not die.
         What is being measured is the attacker's own rhythm, undisturbed. */
      let hits = 0, dmg = 0, swings = 0, rooted = 0, staggers = 0, t = 0;
      let windowSum = 0, windowN = 0;
      const realApply = window.applyDamage;
      /* Record, then CALL THROUGH. An earlier version of this swallowed the blow to keep the
         post standing, and reported zero staggers for every weapon in the game — because
         stagger is decided inside applyDamage, which was never reached. The post is kept up
         by resetting its parts every frame instead. */
      window.applyDamage = function (at, de, pk, dm, wt, loud, incid, raw, ap) {
        if (de === d && at === a) { hits++; dmg += raw ? dm : mitigate(de, dm, wt, ap, at); }
        return realApply.apply(this, arguments);
      };

      let wasWind = null;
      try {
        for (let step = 0; step < SECS / DT; step++) {
          a.target = d; a.targetManual = true;
          d.x = S.x + (opts.range ? 4 : 0.7); d.y = S.y; d.state = 'ok';
          d.staggerT = 0; d.blocking = false;
          for (const k in d.parts) { d.parts[k].hp = 100; d.parts[k].bleed = 0; }
          d.blood = 100;
          physics(a, DT);
          if (a.windup || a.recoverT > 0) rooted += DT;
          if (!wasWind && a.windup) { wasWind = a.windup.dur; windowSum += a.windup.dur; windowN++; swings++; }
          if (wasWind && !a.windup) wasWind = null;
          if (d.staggerT > 0) staggers++;   /* reset every frame, so each one is a fresh event */
          t += DT;
        }
      } finally {
        window.applyDamage = realApply;
        chars.length = 0;
        for (const c of keep) chars.push(c);
      }

      return {
        cadence: +(swings / t).toFixed(2),
        window: +(windowN ? windowSum / windowN : 0).toFixed(3),
        rooted: +(rooted / t).toFixed(2),
        landed: hits,
        perHit: +(hits ? dmg / hits : 0).toFixed(1),
        dps: +(dmg / t).toFixed(1),
        stagger: +(hits ? staggers / hits : 0).toFixed(2),
      };
    }

    /* ---- does the recovery beat actually bite? ----
       A field that is set but never consulted is the classic way a "feel" change turns out
       to be nothing at all. Give a fighter a move order mid-recovery and see if they move. */
    function rootProof(wep){
      const keep = chars.slice(); chars.length = 0;
      const a = makeChar('A', 'player', S.x, S.y, { atk: 20, blades: 15, ath: 40 });
      a.state = 'ok'; a.weapon = wep; chars.push(a);
      /* No target, no fight — just a body under orders to walk. First measure how far it
         gets per frame when it is free, then plant a recovery on it and measure again.
         An earlier version of this ran the walk order against an adjacent enemy, which the
         combat branch overrides: it reported zero drift on both sides and proved nothing. */
      const walk = (recovering) => {
        a.x = S.x; a.y = S.y; a.path = null; a.pathGoal = null;
        a.windup = null; a.staggerT = 0; a.target = null;
        let moved = 0, frames = 0;
        for (let step = 0; step < 60; step++) {
          a.moveTarget = { x: S.x - 14, y: S.y };
          if (recovering) a.recoverT = 5;   /* held open so every frame is a recovery frame */
          else a.recoverT = 0;
          const px = a.x, py = a.y;
          physics(a, DT);
          moved += Math.hypot(a.x - px, a.y - py); frames++;
        }
        a.recoverT = 0;
        return frames ? moved / frames : 0;
      };
      const free = walk(false), rec = walk(true);
      try { return { driftPerFreeFrame: +free.toFixed(4), driftPerRecoveryFrame: +rec.toFixed(4),
                     rooted: rec < free * 0.02 }; }
      finally { chars.length = 0; for (const c of keep) chars.push(c); }
    }

    /* ---- do fights still end? ---- two real fighters, no puppeteering, to the death. */
    /* One duel is nearly meaningless: the same build measured a nodachi fight at 3.6s and
       at 20s on consecutive runs, because a part-based health system swings hard on which
       part a hit rolls. Average a batch. */
    function duel(wepA, wepB, armorB, n){
      const runs = [];
      for (let i = 0; i < (n || 9); i++) runs.push(duel1(wepA, wepB, armorB));
      const done = runs.filter(r => r.resolved);
      const secs = done.map(r => r.seconds).sort((x, y) => x - y);
      return {
        seconds: +(secs.reduce((x, y) => x + y, 0) / Math.max(1, secs.length)).toFixed(1),
        median: +(secs[secs.length >> 1] || 0).toFixed(1),
        resolved: done.length + '/' + runs.length,
      };
    }
    function duel1(wepA, wepB, armorB){
      const keep = chars.slice(); chars.length = 0;
      const a = makeChar('A', 'player', S.x, S.y, { atk: 22, def: 12, tough: 14, blades: 18, blunt: 18 });
      const d = makeChar('D', 'bandit', S.x + 0.8, S.y, { atk: 20, def: 12, tough: 14, blades: 15, blunt: 15 });
      a.state = d.state = 'ok'; a.weapon = wepA; d.weapon = wepB; d.armor = armorB || null;
      a.target = d; d.target = a; a.targetManual = d.targetManual = true;
      chars.push(a, d);
      let t = 0;
      try {
        for (let step = 0; step < 120 / DT; step++) {
          if (a.state === 'dead' || d.state === 'dead' || a.state === 'down' || d.state === 'down') break;
          physics(a, DT); physics(d, DT);
          t += DT;
        }
      } finally { chars.length = 0; for (const c of keep) chars.push(c); }
      return { seconds: +t.toFixed(1), resolved: t < 119 };
    }

    const roots = { katana: rootProof('w_kat'), nodachi: rootProof('w_nod') };
    const duels = {
      'katana v katana':      duel('w_kat', 'w_kat'),
      'nodachi v katana':     duel('w_nod', 'w_kat'),
      'club v katana+plate':  duel('w_club', 'w_kat', 'a_pla'),
    };

    const melee = {};
    for (const w of ['w_plank', 'w_rkat', 'w_club', 'w_kat', 'w_nod', 'w_kingsfang', 'w_pyre', 'w_sever'])
      melee[ITEMS[w].name] = bout(w, null, {});
    const armoured = {};
    for (const w of ['w_club', 'w_kat', 'w_nod'])
      armoured[ITEMS[w].name + ' vs plate'] = bout(w, 'a_pla', { tough: 24 });
    const ranged = {};
    for (const w of ['w_bow', 'w_xbow', 'w_lance'])
      ranged[ITEMS[w].name] = bout(w, null, { range: true });

    return { melee, armoured, ranged, roots, duels };
  });

  const fmt = (title, rows) => {
    console.log('\n' + title);
    console.log('  ' + 'weapon'.padEnd(20) + ['cadence', 'window', 'rooted', 'perHit', 'dps', 'stagger'].map(s => s.padStart(8)).join(''));
    for (const [k, v] of Object.entries(rows))
      console.log('  ' + k.padEnd(20) + [v.cadence, v.window, v.rooted, v.perHit, v.dps, v.stagger].map(s => String(s).padStart(8)).join(''));
  };
  console.log('=== ' + (process.argv[2] || 'game.html') + ' ===');
  fmt('MELEE, unarmoured target', out.melee);
  fmt('MELEE, iron plate', out.armoured);
  fmt('RANGED, unarmoured target', out.ranged);
  console.log('\nRECOVERY ACTUALLY ROOTS (drift per frame, world units)');
  for (const [k, v] of Object.entries(out.roots))
    console.log('  ' + k.padEnd(12) + 'free ' + String(v.driftPerFreeFrame).padStart(7) +
      '   in recovery ' + String(v.driftPerRecoveryFrame).padStart(7) +
      '   ' + (v.rooted ? 'ROOTED' : '*** NOT ROOTED ***'));
  console.log('\nFIGHTS STILL END (two real fighters, to the death)');
  for (const [k, v] of Object.entries(out.duels))
    console.log('  ' + k.padEnd(22) + 'mean ' + String(v.seconds).padStart(6) + 's   median ' +
      String(v.median).padStart(6) + 's   resolved ' + v.resolved);
  if (errs.length) console.log('\nerrs:', errs.length, errs.slice(0, 3));
  await b.close();
})();
