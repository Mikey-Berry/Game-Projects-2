#!/usr/bin/env node
/* WHERE THE CAPTAIN WALKS, AND WHAT A BAND DOES BEFORE IT COMES IN.
 *
 * "Right now, the commander leads from the front — meaning he's often the first to die and
 *  collapse the whole team. Commanders should lead from the rear, at the very least. Ideally,
 *  an army should march according to its composition (melee at the front, ranged behind, and
 *  then commander(s) at the rear)."
 *
 * "Give the command to a group that's already at your base, or at a central location. They go
 *  forage/scouting for a few days. After any engagements, they take their time, loot everything,
 *  and then return to the exact point from where they started with a full report."
 *
 * The march order is one line of the bodyguard code: a band member with nothing on it walks to
 * `{x: w.x, y: w.y}` — the captain's own tile — so the column converges on him from behind and
 * he is the point of the arrow by construction. Losing him ends the order for everybody, which
 * is why it reads as collapsing the team rather than as losing a man.
 *
 * The round trip is three separate things and only the first of them is about walking:
 *   · the break-off conditions fire on the captain being cut, which is the state a band is in
 *     the moment a fight ENDS — so the bodies it just made are left on the ground
 *   · "home" is a four-tile circle and then a `standDown` wherever they happen to be standing
 *   · and the report is a tally of two numbers
 *
 * Each is measured as itself rather than as "the forage order feels finicky".
 *
 *   node tools/marchorder.js [game.html]
 */
const { chromium } = require('playwright');
const path = require('path');
const gamePath = (a) => path.resolve(a ? (path.isAbsolute(a) ? a : path.join(__dirname, a)) : path.join(__dirname, 'game.html'));

(async () => {
  const b = await chromium.launch({ executablePath: process.env.DUSTWARD_CHROME || undefined,
    args: ['--use-gl=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox','--no-sandbox'] });
  const errs = [];
  const p = await b.newPage({ viewport: { width: 1000, height: 700 } });
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message.slice(0, 200)));
  await p.goto('file://' + gamePath(process.argv[2]), { waitUntil: 'load', timeout: 90000 });
  await p.waitForFunction(() => !!document.getElementById('btn-start'), null, { timeout: 60000 });
  await p.evaluate(() => { document.getElementById('btn-start').click(); paused = true; });
  await p.waitForFunction(() => typeof chars !== 'undefined' && chars.length > 0, null, { timeout: 60000 });
  await p.waitForTimeout(2500);

  const R = await p.evaluate(() => {
    const O = {};
    const guard = (keys, fn) => {
      try { fn(); } catch (e) { for (const k of keys) if (O[k] === undefined) O[k] = '!! ' + String(e.message).slice(0, 150).toUpperCase(); }
    };
    const step = (secs, dt = 0.25) => { for (let i = 0; i < secs / dt; i++) update(dt); };
    const isRanged = (o) => { const w = wepOf(o); return !!(w && w.range); };
    /* ---------- AND THE FOE HAS TO BE VISIBLE TO BE AN ENEMY ----------
       `nearestEnemy` refuses anything behind a wall, which is right and which quietly wrecked
       this file: `findOpenNear` put four raiders on open ground on the far side of a building
       and every contact claim measured a band that could not see them. Ring outward for a tile
       that is both open AND has a clear line from the captain, so "they met" means they met. */
    const inSight = (from, dx, dy) => {
      for (let rad = 0; rad <= 14; rad++) {
        for (let a = 0; a < Math.max(1, rad * 6); a++) {
          const th = (a / Math.max(1, rad * 6)) * Math.PI * 2;
          const q = findOpenNear(Math.round(from.x + dx + Math.cos(th) * rad),
                                 Math.round(from.y + dy + Math.sin(th) * rad), 3);
          if (!q) continue;
          if (losBlocked(from.x, from.y, q.x, q.y, 0)) continue;
          return q;
        }
      }
      return null;
    };

    /* ---------- ONE BAND, BUILT THE SAME WAY EVERY TIME ----------
       Four blades and three bows under a captain, which is a composition rather than a number
       — the whole claim about march order is that the band has parts that belong in different
       ranks, so a band of seven identical swordsmen could not fail it. */
    const raise = (at) => {
      const made = [];
      const spec = [['Captain', 'w_kat'], ['Blade 1', 'w_kat'], ['Blade 2', 'w_kat'], ['Blade 3', 'w_kat'],
                    ['Blade 4', 'w_kat'], ['Bow 1', 'w_bow'], ['Bow 2', 'w_bow'], ['Surgeon', 'w_bow']];
      for (let i = 0; i < spec.length; i++) {
        const q = findOpenNear(Math.round(at.x + (i % 4) - 1), Math.round(at.y + Math.floor(i / 4)), 4);
        const c = makeChar(spec[i][0], 'player', q.x, q.y,
          { atk: 18, def: 15, tough: 20, ath: 8, ranged: 18, medic: i === 7 ? 45 : 2,
            weapon: spec[i][1], armor: 'a_lea' });
        c.state = 'ok';
        chars.push(c); made.push(c);
      }
      return made;
    };

    const me = player()[0];
    const HOME = { x: me.x, y: me.y };

    /* ================= 1. THE ORDER OF MARCH, WITH NOTHING IN THE WAY ================= */
    let marchRanks = null;
    guard(['_premise', 'thereIsABandOfBothKindsToWatch', '_march', 'andTheColumnMarchesInItsOwnOrder'], () => {
      const band = raise(HOME);
      const cdr = band[0];
      const melee = band.filter(o => o !== cdr && !isRanged(o));
      const bows = band.filter(o => isRanged(o));
      O._premise = `a captain, ${melee.length} blades and ${bows.length} bows`;
      O.thereIsABandOfBothKindsToWatch = (melee.length >= 3 && bows.length >= 2)
        ? `${melee.length} blades and ${bows.length} bows under one captain — a composition, so the ranks have somewhere to go`
        : `!! THE BAND IS NOT OF TWO KINDS (${melee.length} MELEE, ${bows.length} RANGED)`;
      giveCommand(cdr, band, 'forage', { x: HOME.x + 40, y: HOME.y }, 48);
      step(90);
      /* the heading the column is actually walking, taken from where it has got to */
      const hx = cdr.x - HOME.x, hy = cdr.y - HOME.y;
      const L = Math.hypot(hx, hy) || 1;
      const ux = hx / L, uy = hy / L;
      const along = (o) => (o.x - cdr.x) * ux + (o.y - cdr.y) * uy;   /* + is ahead of the captain */
      const mAvg = melee.filter(o => o.state === 'ok').reduce((a, o) => a + along(o), 0) / Math.max(1, melee.filter(o => o.state === 'ok').length);
      const rAvg = bows.filter(o => o.state === 'ok').reduce((a, o) => a + along(o), 0) / Math.max(1, bows.filter(o => o.state === 'ok').length);
      marchRanks = { mAvg, rAvg, walked: L };
      O._march = `walked ${L.toFixed(0)} tiles out; ahead of the captain: blades ${mAvg.toFixed(1)}, bows ${rAvg.toFixed(1)}`;
      O.andTheColumnMarchesInItsOwnOrder = (L > 8 && mAvg > rAvg + 0.5 && rAvg > 0.5)
        ? `the blades march ${mAvg.toFixed(1)} tiles ahead of the captain and the bows ${rAvg.toFixed(1)} — melee, then ranged, then him`
        : (L <= 8 ? `!! THE BAND NEVER MARCHED (${L.toFixed(1)} TILES)`
                  : `!! THE COLUMN HAS NO ORDER — BLADES ${mAvg.toFixed(1)} AHEAD, BOWS ${rAvg.toFixed(1)}, CAPTAIN AT 0`);
      standDown(cdr, true);
      for (const o of band) o.state = 'dead';
    });

    /* ================= 2. AND WHO MEETS THE ENEMY FIRST ================= */
    guard(['_engage', 'theCaptainIsNotTheFirstThingTheEnemyMeets'], () => {
      const band = raise({ x: HOME.x, y: HOME.y + 6 });
      const cdr = band[0];
      const melee = band.filter(o => o !== cdr && !isRanged(o));
      /* a line of foes off to one side, close enough to be the thing the band is looking at */
      const foes = [];
      for (let i = 0; i < 6; i++) {
        const q = inSight(cdr, 16, i * 2 - 5) || findOpenNear(Math.round(cdr.x + 16), Math.round(cdr.y + i * 2 - 5), 6);
        const f = makeChar('Raider ' + i, 'bandit', q.x, q.y,
          { atk: 20, def: 20, tough: 90, ath: 6, weapon: 'w_club', armor: 'a_pla' });
        f.state = 'ok'; f.blood = f.maxBlood = 900;     /* they have to last long enough to be met */
        f.provoked = true; chars.push(f); foes.push(f);
      }
      giveCommand(cdr, band, 'forage', { x: cdr.x + 16, y: cdr.y }, 48);
      /* ---------- SAMPLED DURING THE ENGAGEMENT, NOT AFTER IT ----------
         The first cut stepped seventy seconds and then measured, by which time eight armed
         bodies had killed all five raiders and walked on — so it compared the standing of a
         band with nothing in front of it and reported the captain safely at the back of an
         empty field. "The first thing the enemy meets" is a question about the moments when
         there IS an enemy, so the samples are taken only while one is alive and inside contact
         range of somebody. */
      let samples = 0, sCdr = 0, sMel = 0, aheadSum = 0, rankSum = 0;
      for (let t = 0; t < 40; t++) {
        step(2);
        const alive = foes.filter(f => f.state === 'ok');
        if (!alive.length) break;
        const nearest = (o) => Math.min(...alive.map(f => dist(o.x, o.y, f.x, f.y)));
        const upMel = melee.filter(o => o.state === 'ok');
        if (!upMel.length) break;
        const dC = nearest(cdr);
        if (dC > 22 && Math.min(...upMel.map(nearest)) > 22) continue;   /* not in contact yet */
        const mm = upMel.map(nearest).sort((a, c) => a - c);
        samples++; sCdr += dC; sMel += mm[Math.floor(mm.length / 2)];
        aheadSum += upMel.filter(o => nearest(o) < dC).length / upMel.length;
        rankSum += mm.length;
      }
      if (!samples) {
        O.theCaptainIsNotTheFirstThingTheEnemyMeets = '!! THE BAND NEVER CAME INTO CONTACT — NOTHING TO MEASURE';
        O._engage = `no contact — raiders ended ${foes.map(f => f.state).join('/')}, captain ${dist(cdr.x, cdr.y, foes[0].x, foes[0].y).toFixed(0)} off the first`;
      }
      else {
        const dCdr = sCdr / samples, medMel = sMel / samples, ahead = aheadSum / samples;
        O._engage = `over ${samples} samples in contact: captain a mean ${dCdr.toFixed(1)} from the nearest live raider, the blades ${medMel.toFixed(1)}, ${(ahead * 100).toFixed(0)}% of them between him and it`;
        O.theCaptainIsNotTheFirstThingTheEnemyMeets = (dCdr > medMel + 1.5 && ahead >= 0.6)
          ? `through the fight the captain holds a mean ${dCdr.toFixed(1)} off the nearest raider against ${medMel.toFixed(1)} for the blades, with ${(ahead * 100).toFixed(0)}% of them between him and it`
          : `!! THE CAPTAIN IS IN THE FRONT RANK — A MEAN ${dCdr.toFixed(1)} FROM THE NEAREST RAIDER AGAINST ${medMel.toFixed(1)} FOR THE BLADES, WITH ONLY ${(ahead * 100).toFixed(0)}% OF THEM AHEAD OF HIM`;
      }
      standDown(cdr, true);
      for (const o of band.concat(foes)) o.state = 'dead';
    });

    /* ================= 3. WHAT A BAND DOES AFTER A FIGHT ================= */
    /* The break-off reads `cdr.blood < maxBlood * 0.45` and the band's standing, which is the
       exact state a band is in the moment a fight ends. So the order turns for home over the
       bodies it has just made. Staged as the report describes it: an engagement, then bodies
       and a chest on the ground inside the order's own circle. */
    let homeRec = null;
    guard(['_after', 'aBandThatFoughtStripsTheGroundBeforeItComesIn', 'andItComesBackToTheSpotItLeftFrom', '_report', 'andItSaysWhatItDid'], () => {
      const startN = corpses.length, chestN = chests.length;
      /* ---------- OUT IN THE WASTE, NOT AT A TOWN'S GATE ----------
         Six tiles off the start is beside GREENREST, and by this block two others have spent
         days of game time. Whether the town has turned on you by then is the world's dice: on
         the losing side the band spends the errand fighting the townsfolk, six of eight go
         down, and the three claims below report a homecoming the town ended first. The review
         of 2026-09-24 removed one daily `rnd()` draw and turned exactly that over. Same cure as
         `storeys.js`: stage past every town. */
      let WASTE = null;
      for (let r = 40; r < 240 && !WASTE; r++) for (let dy = -r; dy <= r && !WASTE; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = Math.floor(HOME.x) + dx + 0.5, y = Math.floor(HOME.y) + dy + 0.5;
        if (x < 40 || y < 40 || x >= W - 40 || y >= H - 40) continue;
        if (!towns.every(t => dist(t.x, t.y, x, y) > 70)) continue;
        if (isBlocked(x, y, 0) || isBlocked(x + 20, y, 0)) continue;
        WASTE = { x, y }; break;
      }
      const band = raise(WASTE || { x: HOME.x, y: HOME.y - 6 });
      const cdr = band[0];
      const START = { x: cdr.x, y: cdr.y };
      giveCommand(cdr, band, 'forage', { x: cdr.x + 20, y: cdr.y }, 44);
      /* ---------- A REAL ENGAGEMENT, NOT A FLAG ----------
         The first cut laid corpses on the ground and set `m.fights` by hand, which stages the
         AFTERMATH without staging the fight — so nothing in the order ever learned there had
         been one, and the claim measured a band that had simply walked past some bodies. An
         engagement is four raiders the band actually kills; the bodies it leaves are the thing
         under test, and a chest beside them is the rest of the ground. */
      const raiders = [];
      for (let i = 0; i < 4; i++) {
        const q = inSight(cdr, 12, i * 2 - 3) || findOpenNear(Math.round(cdr.x + 12), Math.round(cdr.y + i * 2 - 3), 6);
        const f = makeChar('Raider ' + i, 'bandit', q.x, q.y,
          { atk: 8, def: 6, tough: 8, ath: 4, weapon: 'w_club', armor: 'a_rag' });
        f.state = 'ok'; f.provoked = true; chars.push(f); raiders.push(f);
      }
      const cq = inSight(cdr, 14, -4) || findOpenNear(Math.round(cdr.x + 14), Math.round(cdr.y - 4), 6);
      const ch = { x: Math.round(cq.x), y: Math.round(cq.y), opened: false, floor: 0,
                   loot: { cats: 120, items: { mats: 6 } } };
      chests.push(ch);
      /* ---------- IN THE ORDER IT HAPPENS IN ----------
         The first cut cut the captain BEFORE the fight, so the break-off fired on the opening
         tick and he walked home without ever meeting anybody — the claim then measured a band
         that had never had an engagement at all, and reported it as one that left the bodies.
         The sequence the report describes is: meet them, come out of it cut, and only then
         decide whether to go home. So: contact first, the wound second.
         Whether eight armed bodies can kill four raiders is not what is under test and is not
         reliable either — left to run, three of the four walked off and the band chased them.
         `kill` is the game's own death, so these leave real corpses with real pockets. */
      let met = 0;
      for (let i = 0; i < 40; i++) {
        step(2);
        if (cdr.cmd && cdr.cmd.fights) { met = 1; break; }
      }
      cdr.blood = cdr.maxBlood * 0.40;                   /* cut, the way a captain is after one */
      for (const f of raiders) if (f.state !== 'dead') kill(f, cdr);
      /* long enough to walk twenty tiles and strip four bodies and a chest */
      const left = () => raiders.filter(f => f.state === 'dead' && !f.looted).length + (ch.opened ? 0 : 1);
      for (let i = 0; i < 30 && cdr.cmd && left(); i++) step(10);
      /* AND THEN SENT HOME, rather than waited out. A forage errand ends when every tile of its
         circle has been walked, which is six tours of open waste and most of a game week — the
         homecoming is what is under test here, not the errand's patience, and a band left to
         bleed for ten game-hours with a cut captain dies on the walk. Last tour, turn for home. */
      if (cdr.cmd) { cdr.cmd.tours = FORAGE_TOURS; cdr.cmd.phase = 'home'; }
      for (let i = 0; i < 40 && cdr.cmd; i++) step(10);
      const fell = raiders.filter(f => f.state === 'dead');
      const unstripped = fell.filter(f => !f.looted).length;
      const leftBehind = unstripped + (ch.opened ? 0 : 1);
      O._after = `the band killed ${fell.length} of 4 raiders; ${fell.length - unstripped} of those bodies stripped, chest ${ch.opened ? 'opened' : 'still shut'}, order ${cdr.cmd ? 'still out (' + cdr.cmd.phase + ')' : 'closed out'}`;
      O.aBandThatFoughtStripsTheGroundBeforeItComesIn = !fell.length
        ? `!! THE BAND NEVER KILLED ANYBODY — NO AFTERMATH TO MEASURE`
        : leftBehind === 0
          ? `every one of the ${fell.length} bodies it made and the chest beside them are stripped before it turns for home`
          : `!! IT WENT HOME OVER ${leftBehind} THING(S) IT HAD NOT PICKED UP — ${unstripped} OF ${fell.length} BODIES, CHEST ${ch.opened ? 'OPENED' : 'SHUT'}`;

      /* ---------- AND BACK TO THE SPOT IT LEFT FROM ----------
         "return to the exact point from where they started". `m.home` is the captain's tile at
         the moment the order was given, and the order closes out on a four-tile circle around
         it and a `standDown` wherever everybody happens to be standing. */
      const dBack = dist(cdr.x, cdr.y, START.x, START.y);
      const bandBack = band.filter(o => o !== cdr && o.state === 'ok').map(o => dist(o.x, o.y, START.x, START.y));
      const worst = bandBack.length ? Math.max(...bandBack) : 0;
      homeRec = { dBack, worst };
      /* THE CAPTAIN'S HALF OF THIS ALREADY WORKS and the claim is kept anyway: `m.home` is his
         tile at the moment the order was given and he walks to it, so he lands on it. What does
         not is the BAND — the order closes out on a four-tile circle and a `standDown` wherever
         everybody happens to be standing, so the column stops strung out behind him rather than
         re-forming where it set off from. Measured on the control: captain 0.00, furthest of
         the band 4.3. */
      O.andItComesBackToTheSpotItLeftFrom = (!cdr.cmd && dBack <= 1.6 && worst <= 3)
        ? `the captain finishes ${dBack.toFixed(2)} tiles from where he set out and the whole band re-forms inside ${worst.toFixed(1)}`
        : `!! IT DID NOT COME BACK TO THE SPOT — CAPTAIN ${dBack.toFixed(2)} TILES OFF, FURTHEST OF THE BAND ${worst.toFixed(1)}${cdr.cmd ? ', AND THE ORDER IS STILL OPEN' : ''}`;

      /* ---------- AND SAYS WHAT IT DID ----------
         "with a full report." What comes back is `Back, with 3 taken and 2 fought.` A report is
         how long they were gone, how much ground they covered, what they are carrying, what
         they met and what it cost — asked of the mission's own record rather than of the log,
         so this cannot be satisfied by printing a longer sentence. */
      /* `cmd.report` is `cmdSay`'s speech buffer — it holds the last line the captain said, and
         has done since the field was written — so a debrief kept there is overwritten by the
         next thing out of his mouth. The one that survives the order is on the captain. */
      const rep = cdr.lastReport || (cdr.cmd && cdr.cmd.debrief) || '';
      const has = (re) => re.test(rep);
      const parts = { time: /\bday|\bhour|night/i, ground: /tile|ground|walk/i, took: /took|taken|carr|brought|nothing/i,
                      fought: /fought|fight|met|contact|nobody/i, cost: /lost|down|hurt|cut|whole|unhurt/i };
      const got = Object.keys(parts).filter(k => has(parts[k]));
      O._report = rep ? `report: ${rep.slice(0, 220)}` : 'no report was kept on the order at all';
      O.andItSaysWhatItDid = got.length >= 4
        ? `the band comes back with a report of ${got.length} parts — ${got.join(', ')}`
        : `!! THE REPORT SAYS ${got.length} OF 5 THINGS (${got.join(', ') || 'none'}) — ${rep ? '"' + rep.slice(0, 90) + '"' : 'THERE IS NO REPORT'}`;

      const ci = chests.indexOf(ch); if (ci >= 0) chests.splice(ci, 1);
      if (cdr.cmd) standDown(cdr, true);
      for (const o of band) o.state = 'dead';
    });

    return O;
  });

  console.log('\n=== THE ORDER OF MARCH, AND THE ROUND TRIP ===\n');
  const bad = [];
  for (const k of Object.keys(R)) {
    const v = String(R[k]);
    console.log('  ' + k.padEnd(46) + v);
    if (v.startsWith('!!')) bad.push(v);
  }
  for (const e of errs) bad.push(e);
  console.log('');
  for (const v of bad) console.log('*** ' + v);
  await b.close();
  process.exit(bad.length ? 1 : 0);
})();
