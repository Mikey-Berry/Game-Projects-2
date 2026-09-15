#!/usr/bin/env node
/* A WATCH THAT COMES WHEN SOMEBODY SHOUTS, AND RINGS THE WHOLE BASE.
 *
 * Two reports, and they are the same report twice:
 *
 *   "Someone on the far end gets attacked and no one runs to help, despite there being plenty
 *    of combat units available in the base. I don't want to increase the aggro range per se,
 *    as I also don't want my units wandering off to pick fights with enemies. But I DO want
 *    them to run to the aid of someone in or near my base that is being attacked."
 *
 *   "The patrol job is still kind of janky in a base. They only sort of awkwardly walk in the
 *    same area... I would like to select all my defense combat guys, set them to patrol, and
 *    know that they will walk around the base (not JUST the area they are originally standing
 *    at) and actively protect anyone under attack."
 *
 * The old code answered both with one thing — SIGHT. `raiseAlarm` fired when a watchman itself
 * spotted a foe inside thirteen tiles, so a labourer being cut down at the far end of a base
 * summoned nobody, because nobody had seen anything. And `patrolCentreFor` grew its arc from
 * the buildings within 22 tiles of the NEAREST one and capped the radius at 20, so the holding
 * a watchman was handed was the corner of the base it happened to be standing in.
 *
 * THE BASE HERE IS DELIBERATELY BIGGER THAN THE OLD CAP: eight sheds on a ring of radius 24
 * plus one in the middle. Under the old rule a watchman standing on the ring links only to its
 * two neighbours (18.4 tiles apart) and gets a twelve-tile holding centred on that corner; the
 * middle shed, 24 tiles off, is not even in its cluster. That is the report, reproduced.
 *
 *   1. the holding is the whole base, not the corner the body was standing in
 *   2. the watch is spread around the ring rather than bunched, and stays spread
 *   3. a blow landed on a player body leaves a cry where it landed
 *   4. and a watchman on the far side of the base walks to it
 *   5. WITHOUT the aggro range moving: a bandit standing quietly twenty tiles off is ignored
 *   6. a cry outside the holding is not this watch's business
 *   7. the cry dies with the man who swung, so nobody treks to a finished fight
 *   8. and two blows in the same scuffle are one cry, not six
 *
 * Anything starting '!!' fails the build.
 *
 *   node tools/rally.js [game.html]
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
  await p.waitForTimeout(3000);
  await p.evaluate(() => { document.getElementById('btn-start').click(); paused = true; });
  await p.waitForTimeout(3000);

  const out = await p.evaluate(() => {
    const R = {};
    paused = true;
    const DT = 1 / 30;
    const hasCry = typeof cryForHelp === 'function' && typeof cryFor === 'function';

    /* ---------- SOMEWHERE BIG ENOUGH TO HAVE A FAR END ---------- */
    let gx = 0, gy = 0;
    outer:
    for (let y = 80; y < H - 80; y += 6) for (let x = 80; x < W - 80; x += 6) {
      if (isBlocked(x + 0.5, y + 0.5)) continue;
      if (towns.some(t => dist(t.x, t.y, x, y) < 110)) continue;
      let ok = true;
      for (let j = -34; j <= 34 && ok; j += 3) for (let i = -34; i <= 34 && ok; i += 3)
        if (isBlocked(x + i + 0.5, y + j + 0.5)) ok = false;
      if (ok) { gx = x; gy = y; break outer; }
    }
    R.ground = gx ? `staged on open waste at ${gx},${gy}` : '!! NO OPEN GROUND WIDE ENOUGH';
    if (!gx) return R;

    /* ---------- A BASE, AND IT SPRAWLS ---------- */
    const RING = 24;
    const put = (x, y) => {
      const bl = { type: 'shack', x: Math.round(x), y: Math.round(y), w: 2, h: 2, floor: 0,
                   hp: 90, maxHp: 90, progress: 1, __probe: true };
      pBuilds.push(bl); return bl;
    };
    for (let i = 0; i < 8; i++) put(gx + Math.cos(i / 8 * Math.PI * 2) * RING, gy + Math.sin(i / 8 * Math.PI * 2) * RING);
    put(gx, gy);
    const mine = pBuilds.filter(x => x.__probe);

    const spawn = (name, fac, x, y, st) => {
      const c = makeChar(name, fac, x, y, st || { atk: 6, def: 5, tough: 12, ath: 5 });
      c.__probe = true; c.floor = 0; chars.push(c); return c;
    };

    /* six on the watch, standing where they happened to be standing — on one side of the ring,
       which is the situation the report describes and the one the old spread could not fix */
    const watch = [];
    for (let i = 0; i < 6; i++) {
      const w = spawn('Probe Watch ' + i, 'player', gx + RING - 2 + (i % 3), gy - 3 + i);
      w.job = 'patrol'; w.job2 = null; clearOrders(w); watch.push(w);
    }
    rebuildCharGrid();
    if (typeof assignPatrolPosts === 'function') assignPatrolPosts();

    /* ---- 1. THE HOLDING IS THE WHOLE BASE ---- */
    const ctr = patrolCentreFor(watch[0]);
    {
      const covered = mine.filter(bl => dist(bl.x, bl.y, ctr.x, ctr.y) <= ctr.r).length;
      R.theHoldingIsTheBase = covered === mine.length
        ? `a ${ctr.r.toFixed(0)}-tile holding at ${ctr.x.toFixed(0)},${ctr.y.toFixed(0)} covers all ${mine.length} buildings`
        : `!! THE HOLDING IS A CORNER OF THE BASE — ${covered} of ${mine.length} buildings inside a ${ctr.r.toFixed(0)}-tile arc at ${ctr.x.toFixed(0)},${ctr.y.toFixed(0)}`;
    }

    /* ---- 2. AND THE WATCH IS SPREAD AROUND IT ----
       Measured as the LARGEST UNWATCHED ARC: sort the six bearings from the middle of the
       holding, take the biggest gap between consecutive bodies, and average it over the walk.
       Six bodies evenly spread leave a 60-degree hole; six bodies bunched in one corner leave
       most of the circle uncovered. This is a shape, not a flag, so the bar is set from a
       measurement rather than from taste — the old build reports it in the same line. */
    let gapSum = 0, gapN = 0, gapWorst = 0;
    for (let i = 0; i < 30 * 180; i++) {
      for (const w of watch) { w.state = 'ok'; physics(w, DT); }
      if (i % 30 === 0 && i > 30 * 20) {
        const ang = watch.map(w => Math.atan2(w.y - ctr.y, w.x - ctr.x)).sort((a, b2) => a - b2);
        let big = ang[0] + Math.PI * 2 - ang[ang.length - 1];
        for (let k = 1; k < ang.length; k++) big = Math.max(big, ang[k] - ang[k - 1]);
        gapSum += big; gapN++; gapWorst = Math.max(gapWorst, big);
      }
    }
    const gapDeg = (gapSum / Math.max(1, gapN)) * 180 / Math.PI;
    R.theyRingIt = gapDeg < 150
      ? `six on watch leave an average unwatched arc of ${gapDeg.toFixed(0)} degrees (worst ${(gapWorst*180/Math.PI).toFixed(0)}) — a ring, not a huddle`
      : `!! THE WATCH IS BUNCHED — ${gapDeg.toFixed(0)} DEGREES OF THE HOLDING UNWATCHED ON AVERAGE (worst ${(gapWorst*180/Math.PI).toFixed(0)})`;
    R.andTheBearingsAreDealtOut = (() => {
      if (typeof assignPatrolPosts !== 'function') return '!! NO assignPatrolPosts';
      assignPatrolPosts();
      const angs = watch.map(w => w.patrolAng);
      const dirs = new Set(watch.map(w => w.patrolDir));
      const distinct = new Set(angs.map(a => (a === undefined ? 'x' : a.toFixed(3)))).size;
      return (distinct === watch.length && dirs.size === 1 && !angs.includes(undefined))
        ? `and \`patrolIx\` is finally read: ${distinct} distinct bearings, all going the same way round`
        : `!! THE INDICES ARE STILL WRITTEN AND NEVER READ (${distinct} distinct bearings, ${dirs.size} direction(s))`;
    })();

    /* ---------- SOMEBODY AT THE FAR END ---------- */
    const far = { x: gx - RING, y: gy };            /* the opposite side of the ring */
    const vic = spawn('Probe Digger', 'player', far.x, far.y);
    vic.job = 'labor'; clearOrders(vic);
    const foe = spawn('Probe Raider', 'bandit', far.x + 1, far.y, { atk: 8, def: 5, tough: 12, ath: 5 });
    rebuildCharGrid();
    /* whichever watchman is furthest from the trouble — the "far end" of the report */
    const runner = watch.slice().sort((a, b2) => dist(b2.x, b2.y, far.x, far.y) - dist(a.x, a.y, far.x, far.y))[0];
    const startD = dist(runner.x, runner.y, far.x, far.y);

    /* ---- 3. A BLOW LEAVES A CRY ---- */
    const hit = () => applyDamage(foe, vic, 'chest', 2, 'slash', false, false, true, 0);
    if (!hasCry) {
      R.aBlowLeavesACry = '!! NOTHING IN THIS BUILD RECORDS A CALL FOR HELP';
      R.andTheFarEndAnswers = '!! NOTHING TO ANSWER';
      R.aCryOffTheGroundIsIgnored = '!! NOTHING TO IGNORE';
      R.theCryDiesWithTheAttacker = '!! NOTHING TO DIE';
      R.oneScuffleIsOneCry = '!! NOTHING TO MERGE';
    } else {
      for (const q of cries) q.t = 0;
      hit();
      const live = cries.filter(q => q.t > 0);
      R.aBlowLeavesACry = (live.length === 1 && dist(live[0].x, live[0].y, vic.x, vic.y) < 0.001 && live[0].foe === foe)
        ? `a hostile blow on a player body leaves one cry at ${live[0].x.toFixed(0)},${live[0].y.toFixed(0)}, naming who swung`
        : `!! A BLOW LEFT ${live.length} CRIES`;

      /* ---- 8. AND A SCUFFLE IS ONE CRY ---- */
      for (let i = 0; i < 20; i++) { vic.x += 0.1; hit(); }
      vic.x = far.x;
      R.oneScuffleIsOneCry = cries.filter(q => q.t > 0).length === 1
        ? 'and twenty more blows in the same scuffle refresh that one cry rather than filling the slots'
        : `!! ONE SCUFFLE FILLED ${cries.filter(q => q.t > 0).length} SLOTS`;

      /* ---- 4. AND THE FAR END ANSWERS ---- */
      let closest = startD;
      for (let i = 0; i < 30 * 60; i++) {
        if (i % 15 === 0) hit();                  /* the fight is still going on */
        vic.state = 'ok'; vic.blood = vic.maxBlood;
        runner.state = 'ok'; physics(runner, DT);
        closest = Math.min(closest, dist(runner.x, runner.y, far.x, far.y));
        cryTick(DT);
      }
      R.andTheFarEndAnswers = closest < 14
        ? `and a watchman ${startD.toFixed(0)} tiles away closed to ${closest.toFixed(0)} — near enough to see the fight with the eyes it always had`
        : `!! NOBODY CAME — the far watchman got no closer than ${closest.toFixed(0)} of ${startD.toFixed(0)} tiles`;

      /* ---- 7. THE CRY DIES WITH THE MAN WHO SWUNG ---- */
      for (const q of cries) q.t = 0;
      hit();
      foe.state = 'down';
      R.theCryDiesWithTheAttacker = !cryFor(runner, ctr)
        ? 'and a cry whose attacker is down is dropped, so nobody treks across the yard to a finished fight'
        : '!! THE WATCH STILL ANSWERS A FIGHT THAT IS OVER';
      foe.state = 'ok';

      /* ---- 6. AND A CRY OFF THIS GROUND IS NOT ITS BUSINESS ---- */
      for (const q of cries) q.t = 0;
      const away = spawn('Probe Stray', 'player', gx + 90, gy);
      applyDamage(foe, away, 'chest', 2, 'slash', false, false, true, 0);
      R.aCryOffTheGroundIsIgnored = !cryFor(runner, ctr)
        ? 'and a hand jumped ninety tiles from the base is not this watch\'s business — the holding is the filter, not the range'
        : '!! THE WATCH ANSWERS A CRY FROM THE OTHER SIDE OF THE WASTE';
      for (const q of cries) q.t = 0;
    }

    /* ---- 5. AND THE AGGRO RANGE HAS NOT MOVED ----
       The half that was explicitly not wanted, and it took two goes to stage. The first cut
       stood a bandit twenty tiles from a watchman and ran the beat for thirty seconds: it went
       red, and correctly — the holding is twenty-nine tiles across now, so the watch WALKED to
       within sight of it in the ordinary course of its round and then saw it with the same
       thirteen tiles it always had. That is the job working, not the aggro range moving.
       So it is asked twice, neither of them a simulation: `nearestEnemy` at the exact edge of
       the old radius, which is the number itself; and a foe standing OUTSIDE the holding, which
       is the thing the report actually forbids — "I don't want my units wandering off to pick
       fights with enemies." */
    {
      for (const q of (typeof cries !== 'undefined' ? cries : [])) q.t = 0;
      const w2 = watch[0];
      w2.target = null; clearOrders(w2);
      const lurker = spawn('Probe Lurker', 'bandit', w2.x + 14.5, w2.y, { atk: 6, def: 4, tough: 10 });
      /* CLEAR THE FIELD FIRST, and this is not tidiness. The first cut of this claim read
         "14.5 tiles: seen, 11 tiles: blind" — on the CONTROL, where nothing about sight had
         changed — because a wild body was already inside the thirteen and `nearestEnemy` scores
         by `d / aggroWeight`, so it answered about that one both times. A range claim staged in
         a world with its own bandits in it measures the world. */
      const hushed = [];
      for (const o of chars) {
        if (o === lurker || o === w2 || o.state !== 'ok') continue;
        if (dist(o.x, o.y, w2.x, w2.y) < 22 && hostile(w2, o)) { hushed.push(o); o.state = 'down'; }
      }
      rebuildCharGrid();
      const atFourteen = nearestEnemy(w2, 13);
      lurker.x = w2.x + 11; rebuildCharGrid();
      const atEleven = nearestEnemy(w2, 13);
      for (const o of hushed) o.state = 'ok';
      R.theSightIsStillThirteenTiles = (!atFourteen && atEleven === lurker)
        ? `a watchman still sees exactly thirteen tiles — blind at 14.5, sighted at 11 (${hushed.length} wild bodies hushed to ask it)`
        : `!! THE SIGHT RANGE HAS MOVED (14.5 tiles: ${atFourteen ? 'seen' : 'blind'}, 11 tiles: ${atEleven === lurker ? 'seen' : 'blind'})`;

      /* and a foe standing off the holding altogether, hitting nobody, is left alone */
      lurker.x = ctr.x + ctr.r + 22; lurker.y = ctr.y;
      w2.target = null; clearOrders(w2);
      rebuildCharGrid();
      let took = false, closed = 1e9;
      for (let i = 0; i < 30 * 90; i++) {
        w2.state = 'ok'; physics(w2, DT);
        if (w2.target === lurker) { took = true; break; }
        closed = Math.min(closed, dist(w2.x, w2.y, lurker.x, lurker.y));
        if (typeof cryTick === 'function') cryTick(DT);
      }
      R.andItDoesNotWanderOffToPickFights = !took
        ? `and a bandit standing quietly off the holding is left alone through ninety seconds of the beat — the watch got no nearer than ${closed.toFixed(0)} tiles and never took it as a target`
        : '!! THE WATCH WALKED OFF ITS GROUND TO PICK A FIGHT';
    }

    for (let i = chars.length - 1; i >= 0; i--) if (chars[i].__probe) chars.splice(i, 1);
    for (let i = pBuilds.length - 1; i >= 0; i--) if (pBuilds[i].__probe) pBuilds.splice(i, 1);
    rebuildCharGrid();
    return R;
  });

  console.log('=== A WATCH THAT COMES WHEN SOMEBODY SHOUTS ===\n');
  for (const [k, v] of Object.entries(out)) console.log('  ' + k.padEnd(34) + v);
  const bad = Object.values(out).map(String).filter(v => v.startsWith('!!'));
  if (errs.length) { console.log(''); errs.slice(0, 4).forEach(e => console.log('  ' + e)); }
  console.log('\n' + (bad.length || errs.length
    ? '*** ' + [...bad, ...errs].join('\n*** ')
    : 'THE WATCH RINGS THE BASE AND ANSWERS WHAT IT CANNOT SEE'));
  await b.close();
  process.exit(bad.length || errs.length ? 1 : 0);
})();
