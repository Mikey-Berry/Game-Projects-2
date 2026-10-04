#!/usr/bin/env node
/* WHO YOU MEET ON THE ROAD, AND WHAT YOU DO ABOUT IT.
 *
 * "Let's also add the following 'roadside stop with a choice' ideas: bandits demanding a toll or
 *  food; an Order patrol questioning your faith out in the waste; refugees asking for help. These
 *  should not be so common as to be intrusive... not all bandits should be immediately hostile and
 *  there should be an opportunity to negotiate like this." (2026-10-03)
 *
 *   1. RARE: no stop on the first day, none while the world is paused, none for a squad standing
 *      still, none inside a town's reach, and a long quiet after each one
 *   2. each of the three is staged up the road ahead of one of yours who is walking: they come up
 *      the road, nobody draws while they do, and the scene opens when they are close enough to talk
 *   3. the toll: paying it costs exactly the toll and not a blow is struck; they walk off and are
 *      gone once nobody can see them. Drawing steel makes it a fight.
 *   4. the Order: a tithe pays them off; with the dead walking beside you, the question changes and
 *      the tithe is not on the table
 *   5. the people with nothing: food given is food gone, and it is a mercy your people have views
 *      on; taking them in makes them yours
 *
 * Anything starting '!!' fails the build.
 *
 *   node tools/roadside.js [game.html]
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
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message.slice(0, 200)));
  await p.goto('file://' + gamePath(process.argv[2]), { waitUntil: 'load', timeout: 120000 });
  await p.waitForSelector('#btn-start', { state: 'attached', timeout: 120000 });
  await p.evaluate(() => { document.getElementById('btn-start').click(); paused = true; });
  await p.waitForFunction(() => { try { return player().length > 0; } catch (e) { return false; } }, null, { timeout: 180000, polling: 1000 });
  await p.waitForTimeout(1500);

  const out = await p.evaluate(() => {
    const R = {};
    const guard = (keys, fn) => {
      try { fn(); } catch (e) { for (const k of keys) if (R[k] === undefined) R[k] = '!! ' + String(e.message).slice(0, 120).toUpperCase(); }
    };
    if (typeof roadsideStart !== 'function') { R.thereAreRoadsideStops = '!! NO ROADSIDE STOPS IN THIS BUILD'; return R; }
    hour = 10;
    const mine = player();
    const me = mine.find(c => !c.undead && c.state === 'ok') || mine[0];
    /* a stretch of open waste well out of every town's reach, for the staging */
    let open = null;
    for (let k = 0; k < 4000 && !open; k++) {
      const x = 80 + Math.floor(hash2(k, 77) * (W - 160)), y = 80 + Math.floor(hash2(k * 3, 91) * (H - 160));
      if (!roadsideGround(x, y) || tileAt(x, y) === 3) continue;
      let ok = true;
      for (let j = y - 30; j <= y + 30 && ok; j += 3) for (let i = x - 30; i <= x + 30; i += 3) if (isBlocked(i, j, 0) || tileAt(i, j) === 3) { ok = false; break; }
      if (ok && !charsNear(x, y, 60).length) open = { x, y };
    }
    if (!open) { R.thereIsOpenWaste = '!! NO OPEN WASTE TO STAGE ON'; return R; }
    const park = () => { for (const c of mine) if (c !== me) { c.x = open.x - 4 + Math.random(); c.y = open.y + 2 + Math.random(); c.floor = 0; c.target = null; } };
    const walk = () => { me.x = open.x; me.y = open.y; me.floor = 0; me.state = 'ok'; me.target = null; clearOrders(me); me.moveTarget = { x: open.x + 40, y: open.y }; };
    const clearStop = () => {
      const st = roadside.active;
      if (st) for (const c of st.bodies) { const i = chars.indexOf(c); if (i >= 0) chars.splice(i, 1); }
      roadside.active = null; $('modal').style.display = 'none'; modalOpen = false;
    };
    const click = (prefix) => {
      const btn = [...$('modalbody').querySelectorAll('button')].find(x => x.textContent.startsWith(prefix));
      if (!btn) return false; btn.click(); return true;
    };
    const opts = () => [...$('modalbody').querySelectorAll('button')].map(x => x.textContent.split(' — ')[0]);
    /* run the approach until the scene opens, the way the world would */
    const approach = (st) => {
      const blows = [];
      const real = attack;
      attack = function (a, d) { if (st.bodies.includes(a) || st.bodies.includes(d)) blows.push(1); return real.apply(this, arguments); };
      try {
        for (let t = 0; t < 900 && !st.scene; t++) {
          if (t % 5 === 0) rebuildCharGrid();
          for (const c of st.bodies) if (c.state === 'ok') { ai(c, 0.05); physics(c, 0.05); }
          me.moveTarget = null;
          if (t % 40 === 0) roadsideRun(st);
        }
      } finally { attack = real; }
      return blows.length;
    };

    /* ---------- 1. RARE ---------- */
    guard(['itIsRare'], () => {
      park(); walk();
      const was = { day, paused, next: roadside.next };
      const tries = (label) => { let n = 0; const keep = rnd; let fired = 0; for (let i = 0; i < 400; i++) { _roadT = 0; roadsideTick(2); if (roadside.active) { fired++; clearStop(); } } return fired; };
      /* stack the dice: every gate below is asked with the roll forced through */
      const realRnd = rnd; rnd = () => 0;
      let day1, still, inTown, pausedN, cooled;
      try {
        day = 1; paused = false; roadside.next = 0; day1 = tries();
        day = 4;
        clearOrders(me); me.band = null; still = tries();
        walk(); const t0 = towns[0]; const sx = me.x, sy = me.y; me.x = t0.x + 3; me.y = t0.y + 3; inTown = tries(); me.x = sx; me.y = sy;
        paused = true; pausedN = tries(); paused = false;
        roadside.next = nowH() + 10; cooled = tries();
        roadside.next = 0; walk();
        _roadT = 0; roadsideTick(2); const fired = !!roadside.active; clearStop();
        R.itIsRare = !day1 && !still && !inTown && !pausedN && !cooled && fired
          ? `even with every roll forced: no stop on the first day, none paused, none standing still, none in a town's reach, none inside the quiet after one — and one for somebody walking the waste on day 4. Unforced, about ${(ROADSIDE_RATE * 24).toFixed(2)} a day of walking, and ${ROADSIDE_GAP[0]} to ${ROADSIDE_GAP[1]} hours of quiet after each`
          : `!! STOPS WHERE THERE SHOULD BE NONE: day 1 ${day1}, standing still ${still}, in town ${inTown}, paused ${pausedN}, cooling ${cooled}; walking the waste ${fired}`;
      } finally { rnd = realRnd; day = Math.max(was.day, 4); paused = true; roadside.next = was.next; }
    });

    /* ---------- 2 & 3. THE TOLL ---------- */
    guard(['theyComeUpTheRoadWithoutDrawing', 'payingTheTollIsThePrice', 'andTheyAreGoneAfter', 'orItIsAFight'], () => {
      park(); walk();
      const st = roadsideStart('toll', me);
      const d0 = Math.min(...st.bodies.map(c => dist(c.x, c.y, me.x, me.y)));
      const calm = st.bodies.every(c => !hostile(c, me) && !hostile(me, c));
      const blows = approach(st);
      const o = opts();
      R.theyComeUpTheRoadWithoutDrawing = st.scene && calm && !blows && d0 > 10 && o.some(x => x.startsWith('PAY THE')) && o.some(x => x.startsWith('DRAW STEEL'))
        ? `${st.bodies.length} toll-takers start ${d0.toFixed(0)} tiles up the road, come down it with nobody drawing, and stop to talk: ${o.join(' / ')}`
        : `!! THE TOLL DID NOT PLAY: scene ${st.scene}, calm ${calm}, blows ${blows}, from ${d0.toFixed(1)}, options ${o.join(' / ')}`;
      const c0 = cats; const toll = Number((o.find(x => x.startsWith('PAY THE')) || '').replace(/\D/g, ''));
      click('PAY THE');
      const paid = c0 - cats;
      /* and after: they go, and once nobody can see them, they are gone */
      let t = 0;
      for (; t < 2400 && roadside.active; t++) {
        if (t % 5 === 0) rebuildCharGrid();
        for (const c of st.bodies) if (c.state === 'ok' && chars.includes(c)) { ai(c, 0.05); physics(c, 0.05); }
        if (t % 40 === 0) roadsideRun(st);
        /* nobody of yours follows them up the road */
      }
      const struck = st.bodies.some(c => c.target && c.target.faction === 'player');
      R.payingTheTollIsThePrice = paid === toll && !struck
        ? `paying it costs exactly the ${toll} asked, and nobody raises a hand`
        : `!! THE TOLL WAS ${toll}, ${paid} WAS TAKEN, AND A TARGET WAS ${struck ? 'TAKEN' : 'NOT TAKEN'}`;
      const gone = st.bodies.filter(c => chars.includes(c)).length;
      R.andTheyAreGoneAfter = !roadside.active && !gone
        ? `and they walk off up the road and are gone once none of yours can see them (${(t * 0.05).toFixed(0)}s)`
        : `!! THEY ARE STILL HERE: ${gone} of ${st.bodies.length} after ${(t * 0.05).toFixed(0)}s, stop ${roadside.active ? 'still open' : 'closed'}`;
      clearStop();
      /* again, and this time the answer is steel */
      park(); walk();
      const st2 = roadsideStart('toll', me);
      approach(st2);
      click('DRAW STEEL');
      const fight = st2.bodies.filter(c => c.state === 'ok' && hostile(c, me) && c.target && c.target.faction === 'player').length;
      R.orItIsAFight = fight === st2.bodies.filter(c => c.state === 'ok').length && fight > 0
        ? `and drawing steel instead turns all ${fight} of them on your people`
        : `!! DRAWING STEEL DID NOT START A FIGHT: ${fight} of ${st2.bodies.length} hostile and on you`;
      clearStop();
    });

    /* ---------- 4. THE ORDER ---------- */
    guard(['aTitheSatisfiesThem', 'butNotWithTheDeadBesideYou'], () => {
      park(); walk();
      const st = roadsideStart('order', me);
      approach(st);
      const o = opts();
      const c0 = cats; const tithe = Number((o.find(x => x.startsWith('TITHE')) || '').replace(/\D/g, ''));
      click('TITHE');
      R.aTitheSatisfiesThem = st.scene && tithe > 0 && c0 - cats === tithe && st.bodies.every(c => c.roadsideLeaving)
        ? `a Bastion patrol stops your people and asks whose light they walk by (${o.join(' / ')}); a tithe of ${tithe} sends them on their way`
        : `!! THE PATROL: scene ${st.scene}, options ${o.join(' / ')}, tithe ${tithe}, paid ${c0 - cats}`;
      clearStop();
      /* one of yours walking openly dead */
      park(); walk();
      const dead = mine.find(c => c !== me) || me;
      const was = { undead: dead.undead, x: dead.x, y: dead.y };
      dead.undead = true; dead.x = me.x - 2; dead.y = me.y;
      try {
        const st2 = roadsideStart('order', me);
        approach(st2);
        const o2 = opts(), title = $('modalsub').textContent;
        R.butNotWithTheDeadBesideYou = revealedUndead(dead) && st2.scene && !o2.some(x => x.startsWith('TITHE')) && /walks with/.test(title)
          ? `and with the dead walking beside you the question is what walks with you, and a tithe is not on offer (${o2.join(' / ')})`
          : `!! THE PATROL DID NOT SEE THE DEAD: revealed ${revealedUndead(dead)}, options ${o2.join(' / ')}`;
        clearStop();
      } finally { dead.undead = was.undead; dead.x = was.x; dead.y = was.y; }
    });

    /* ---------- 5. PEOPLE WITH NOTHING ---------- */
    guard(['foodGivenIsAMercy', 'andTakingThemInMakesThemYours'], () => {
      park(); walk();
      stash.meat = Math.max(stash.meat || 0, 12);
      const st = roadsideStart('refugees', me);
      approach(st);
      const f0 = roadsideFood();
      const realDeed = deed; const seen = [];
      deed = function (k) { seen.push(k); return realDeed.apply(this, arguments); };
      try { click('GIVE THEM 4 RATIONS'); } finally { deed = realDeed; }
      R.foodGivenIsAMercy = f0 - roadsideFood() === 4 && seen.includes('mercy') && st.bodies.every(c => c.roadsideLeaving)
        ? `${st.bodies.length} people with nothing come up the road; four rations given are four rations gone, and it goes on the ledger as a mercy`
        : `!! THE FOOD: ${f0 - roadsideFood()} rations went, deeds ${JSON.stringify(seen)}`;
      clearStop();
      park(); walk();
      const st2 = roadsideStart('refugees', me);
      approach(st2);
      click('TAKE THEM IN');
      const joined = st2.bodies.filter(c => c.faction === 'player' && chars.includes(c)).length;
      R.andTakingThemInMakesThemYours = joined === st2.bodies.length && !roadside.active
        ? `and taking them in instead makes all ${joined} of them yours`
        : `!! TAKING THEM IN: ${joined} of ${st2.bodies.length} joined`;
      for (const c of st2.bodies) { const i = chars.indexOf(c); if (i >= 0) chars.splice(i, 1); }
      clearStop(); refreshSquadBar();
    });
    return R;
  });

  const bad = Object.values(out).filter(v => typeof v === 'string' && v.startsWith('!!'));
  for (const [k, v] of Object.entries(out)) console.log('  ' + k.padEnd(34) + ' ' + v);
  for (const e of errs) console.log('  ' + e);
  console.log('');
  console.log(bad.length || errs.length ? `*** THE ROAD IS WRONG (${bad.length + errs.length}) ***` : 'SOMEBODY WAS WAITING ON THE ROAD');
  await b.close();
  process.exit(bad.length || errs.length ? 1 : 0);
})();
