#!/usr/bin/env node
/* Seven things reported from actual play, each pinned so it cannot come back.
 *
 * These are not features — they are the specific ways this game was annoying or broken in
 * somebody's hands, and every one of them passed a syntax check and every other harness in
 * this directory while it was happening. That is the point: a phylactery duplicating under
 * overkill and a walk cycle that runs at the same rate whatever the speed are both invisible
 * to anything that does not go and look.
 *
 *   node tools/notes.js [game.html]
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
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message.slice(0, 220)));
  p.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text().slice(0, 220)); });
  await p.goto('file://' + gamePath(process.argv[2]), { waitUntil: 'load' });
  await p.waitForTimeout(3000);
  await p.evaluate(() => document.getElementById('btn-start').click());
  await p.waitForTimeout(2500);

  const out = await p.evaluate(() => {
    const R = {};
    const step = (secs, dt = 0.25) => { for (let i = 0; i < secs / dt; i++) update(dt); };
    const HOME = { x: player()[0].x, y: player()[0].y };

    /* ---------- 1. ONE JAR, ONE SPARK ----------
       A lich taken down by six blows in the same frame shed six phylacteries, because
       updateState runs at the end of every applyDamage and the body was never marked spent. */
    try {
      const q = findOpenNear(HOME.x + 20, HOME.y + 20, 6);
      const li = makeChar('Test Lich', 'player', q.x, q.y, { atk: 20, def: 20, tough: 20, ath: 6, magic: 40 });
      li.lich = true; li.undead = true;
      chars.push(li);
      /* a dozen things swinging at it, and every one of them holding the reference */
      const mob = [];
      for (let i = 0; i < 8; i++) {
        const r = findOpenNear(li.x + 2, li.y + 2, 3);
        const f = makeChar('Mob ' + i, 'bandit', r.x, r.y, { atk: 30, def: 8, tough: 8, ath: 6 });
        f.target = li; f.provoked = true;
        chars.push(f); mob.push(f);
      }
      const before = phylacteries.length;
      /* Overkill in one frame, the way a swarm actually does it — but sized to DOWN it, not
         to obliterate it. A vital part past -50 calls `kill()` directly and returns before
         `updateState` ever runs, so a probe that hits for 400 tests a different code path
         entirely and reports zero phylacteries from a lich that was never shed at all. */
      for (const f of mob) applyDamage(f, li, 'chest', 26, 'cut', false, true);
      const shed = phylacteries.length - before;
      R.oneSpark = shed === 1 ? 'one phylactery from one lich' : `!! SHED ${shed} PHYLACTERIES FROM ONE LICH`;
      /* and nobody is left swinging at the empty spot it used to occupy */
      R.noGhostFight = mob.every(f => f.target !== li) ? 'the mob lets go of the body' :
        '!! ENEMIES STILL SWINGING AT NOTHING (' + mob.filter(f => f.target === li).length + ')';
      phylacteries.length = before;
      [li, ...mob].forEach(o => { const i = chars.indexOf(o); if (i >= 0) chars.splice(i, 1); });
    } catch (e) { R.sparkBlock = '!! THREW: ' + e.message; }

    /* ---------- 2. THE HALLOWED GROUND IS MENTIONED ONCE ---------- */
    try {
      const sh = shrines.find(s2 => !s2.broken);
      if (!sh) { R.holyOnce = '!! NO SHRINE TO TEST'; }
      else {
        sh.told = false;
        const q = findOpenNear(sh.x + 2, sh.y + 2, 3);
        const necro = makeChar('Necro', 'player', q.x, q.y, { atk: 5, def: 5, tough: 5, ath: 5, magic: 40, gift: 'dark' });
        chars.push(necro);
        const corpse = makeChar('Somebody', 'town', q.x + 1, q.y, { atk: 3, def: 3, tough: 3 });
        corpse.state = 'dead'; corpse.deadAt = day; corpses.push(corpse);
        const said = [];
        const realLog = window.log;
        window.log = (t, k) => { said.push(String(t)); realLog(t, k); };
        for (let i = 0; i < 12; i++) castRaise(necro, corpse);
        window.log = realLog;
        const n = said.filter(l => /hallowed|holding\. Break the shrine/i.test(l)).length;
        R.holyOnce = n <= 1 ? `told once in twelve attempts` : `!! TOLD ${n} TIMES IN TWELVE ATTEMPTS`;
        corpses.splice(corpses.indexOf(corpse), 1);
        [necro, corpse].forEach(o => { const i = chars.indexOf(o); if (i >= 0) chars.splice(i, 1); });
      }
    } catch (e) { R.holyBlock = '!! THREW: ' + e.message; }

    /* ---------- 3. HOLLOWMERE KEEPS NO SHRINE ---------- */
    try {
      const hm = towns.find(t => t.def.undeadFriendly);
      R.necroTown = hm ? (shrines.some(s2 => s2.town === hm) ? '!! HOLLOWMERE STILL HAS A SHRINE' :
        'no shrine over the necromancers') : '!! NO UNDEAD-FRIENDLY TOWN';
      R.necroGround = hm ? (!consecratedAt(hm.x, hm.y) ? 'and its ground answers' :
        '!! HOLLOWMERE GROUND IS STILL HALLOWED') : '!! NO UNDEAD-FRIENDLY TOWN';
    } catch (e) { R.townBlock = '!! THREW: ' + e.message; }

    /* ---------- 4. A CONTRABAND STOP IS A CONVERSATION, NOT A SENTENCE ---------- */
    try {
      const t = towns.find(t2 => !t2.playerRuled && !t2.def.undeadFriendly);
      const q = findOpenNear(t.x, t.y, 4);
      const c = makeChar('Carrier', 'player', q.x, q.y, { atk: 8, def: 8, tough: 8, ath: 5 });
      chars.push(c);
      /* the shared pool is loaded and the person is clean: this must NOT be a stop */
      stash.tome = 4;
      c.inv = {};
      R.stashIsSafe = contrabandOn(c).length === 0 ? 'the squad stash is not on your person' :
        '!! THE STASH STILL PUTS EVERYBODY AT RISK';
      c.inv = { tome: 1 };
      R.personIsSearched = contrabandOn(c).length === 1 ? 'what you carry is what they find' :
        '!! NOTHING FOUND ON A CARRIER';
      /* the odds have to move with the world rather than being a coin */
      const wasRep = t.rep, wasB = t.bounty;
      t.rep = 60; t.bounty = 0;
      const liked = talkOdds(c, t, ['tome']);
      t.rep = -60; t.bounty = 800;
      const hated = talkOdds(c, t, ['tome']);
      t.rep = wasRep; t.bounty = wasB;
      R.talkReadsWorld = liked > hated + 0.2 ? `${(liked * 100) | 0}% liked vs ${(hated * 100) | 0}% wanted` :
        '!! THE CHECK IGNORES THE WORLD';
      /* and being stopped must not be an instant bounty */
      const bBefore = t.bounty || 0;
      theStop(c, makeChar('Watch', 'town', c.x + 1, c.y, { atk: 10, def: 10, tough: 10 }), t, ['tome']);
      R.stopIsAPause = (modalOpen && (t.bounty || 0) === bBefore) ?
        'it stops the world and asks, before any bounty' : '!! A STOP STILL CONVICTS ON SIGHT';
      const btns = [...document.querySelectorAll('#modalbody button')].map(x => x.textContent.split('—')[0].trim());
      R.stopOffers = btns.length >= 4 ? btns.join(' / ') : '!! TOO FEW WAYS OUT (' + btns.join(',') + ')';
      document.getElementById('modal').style.display = 'none'; modalOpen = false; _stopOpen = false;
      stash.tome = 0;
      const i = chars.indexOf(c); if (i >= 0) chars.splice(i, 1);
    } catch (e) { R.stopBlock = '!! THREW: ' + e.message; }

    /* ---------- 6. A COMPANION COMES BACK AS THEMSELF ---------- */
    try {
      /* Ground that is open AND unconsecrated. `findOpenNear` is fine about walls and says
         nothing about shrines, and this test sat on hallowed ground the moment an unrelated
         edit elsewhere shifted the seeded rnd() stream — where castRaise correctly refuses and
         the probe reported the raise broken. A test that depends on where the dice land is
         not a test. */
      let q = null;
      for (let r = 6; r < 90 && !q; r += 6) for (let a2 = 0; a2 < 12 && !q; a2++) {
        const cand = findOpenNear(HOME.x + Math.cos(a2) * r, HOME.y + Math.sin(a2) * r, 4);
        if (!consecratedAt(cand.x, cand.y) && !townAt(cand.x, cand.y)) q = cand;
      }
      if (!q) throw new Error('no unconsecrated ground to raise on');
      const necro = makeChar('Necro', 'player', q.x, q.y, { atk: 5, def: 5, tough: 5, ath: 5, magic: 60, gift: 'dark' });
      chars.push(necro);
      const friend = makeChar('Wren Ashmouth', 'player', q.x + 1, q.y, { atk: 22, def: 19, tough: 15, ath: 9 });
      friend.conviction = 'loyal'; friend.regard = 44; friend.face = null; friend.sex = 'f';
      friend.state = 'dead'; friend.deadAt = day;
      chars.push(friend); corpses.push(friend);
      const risen = castRaise(necro, friend) !== false ?
        chars.find(o => o.lieutenant && o.name === 'Wren Ashmouth') : null;
      R.theyComeBack = risen ? 'a companion rises as a lieutenant' : '!! A COMPANION ROSE AS A NUMBER';
      R.keptTheirName = risen && risen.name === 'Wren Ashmouth' ? 'with their own name' : '!! NAME LOST';
      R.keptThemself = risen && risen.conviction === 'loyal' && risen.regard === 44 &&
        Math.abs(risen.stats.atk - 22) < 0.01 ? 'conviction, regard and prowess intact' :
        '!! CAME BACK A STRANGER';
      /* a beast still does not get a name */
      const gq = findOpenNear(HOME.x + 30, HOME.y - 24, 5);
      const brute = makeChar('Carrion Maw', 'gaunt', gq.x, gq.y, { atk: 26, def: 12, tough: 38 });
      brute.beast = true; brute.gauntKind = 'maw'; brute.state = 'dead'; brute.deadAt = day;
      chars.push(brute); corpses.push(brute);
      const before = chars.filter(o => o.lieutenant).length;
      castRaise(necro, brute);
      R.beastsStayNameless = chars.filter(o => o.lieutenant).length === before ?
        'a maw is still just a maw' : '!! A BEAST BECAME A LIEUTENANT';
    } catch (e) { R.riseBlock = '!! THREW: ' + e.message; }

    return R;
  });

  /* ---------- 5. A SHAMBLING THING SHAMBLES ----------
     This one cannot be answered inside the sim: the walk cycle is advanced by the RENDER
     loop, off `e.phase` on the mesh, and the first version of this check re-implemented the
     gait formula in the probe and compared it against itself — which passes on the broken
     build, because the broken build's animator simply never consults it. So: two real bodies
     at very different speeds, both actually walking, and read the phase the animator wrote. */
  const gait = await (async () => {
    await p.evaluate(() => {
      debugSeeAll = true; paused = false; speed = 1;
      const HOME = { x: player()[0].x, y: player()[0].y };
      const mkWalker = (name, ath, big) => {
        const q = findOpenNear(HOME.x - 24, HOME.y - 24, 8);
        const c = makeChar(name, 'player', q.x, q.y, { atk: 5, def: 5, tough: 20, ath });
        c.big = big; c.undead = true; c.crafted = true;
        c.moveTarget = { x: clamp(q.x + 70, 3, W - 4), y: q.y };
        chars.push(c);
        return c;
      };
      const slow = mkWalker('Golem', 1, 1.5);
      const quick = mkWalker('Skitter', 40, 0.9);
      /* `syncChars` builds a bounded number of meshes per frame and there are six hundred
         bodies in this world; two new ones at the end of the queue can wait a very long time.
         Put the camera on them so they are the ones in view, and clear the rest. */
      for(const o of [...chars]) if(o !== slow && o !== quick) chars.splice(chars.indexOf(o), 1);
      camFollow = false; camX = camSX = slow.x; camY = camSY = slow.y;
      camDist = camDistTarget = 14;
      window.__gait = { slow: slow.id, quick: quick.id, sSlow: moveSpeed(slow), sQuick: moveSpeed(quick) };
    });
    await p.waitForTimeout(6000);                 /* meshes are built a few per frame */
    const t0 = await p.evaluate(() => {
      const g = window.__gait;
      const ph = (id) => { const e = charMeshes.get(id); return e ? e.phase : null; };
      return { s: ph(g.slow), q: ph(g.quick), sSlow: g.sSlow, sQuick: g.sQuick };
    });
    await p.waitForTimeout(3500);
    const t1 = await p.evaluate(() => {
      const g = window.__gait;
      const ph = (id) => { const e = charMeshes.get(id); return e ? e.phase : null; };
      const c = (id) => chars.find(o => o.id === id);
      return { s: ph(g.slow), q: ph(g.quick), moved: [c(g.slow), c(g.quick)].every(o => o && o.moveTarget) };
    });
    if (t0.s == null || t1.s == null || t0.q == null) return { R: { gaitFollows: '!! NO MESH TO READ' } };
    const dS = t1.s - t0.s, dQ = t1.q - t0.q;
    return {
      R: {
        slowIsSlow: t0.sQuick > t0.sSlow * 1.4 ? `${t0.sSlow.toFixed(2)} vs ${t0.sQuick.toFixed(2)} tiles/s` :
          '!! THE TWO MOVE AT THE SAME PACE',
        gaitFollows: (dS > 0.5 && dQ > dS * 1.4) ?
          `the animator itself ran ${dS.toFixed(1)} rad for the golem and ${dQ.toFixed(1)} for the quick one` :
          `!! THE LEGS CYCLE AT THE SAME RATE (${dS.toFixed(1)} / ${dQ.toFixed(1)})`,
      },
    };
  })();
  Object.assign(out, gait.R);

  console.log('=== FROM THE NOTES ===\n');
  for (const [k, v] of Object.entries(out)) console.log('  ' + k.padEnd(19) + v);
  /* An explicit marker, not a shape. The first version flagged anything in capitals, which
     meant the list of ways out of a contraband stop — TALK / BRIBE / HAND IT OVER / FIGHT —
     was read as a failure because it is, correctly, in capitals. */
  const bad = Object.values(out).map(String).filter(v => v.startsWith('!!'));
  console.log('\n' + (bad.length ? '*** STILL WRONG: ' + bad.join(' | ') + ' ***' : 'ALL SEVEN NOTES ANSWERED'));
  if (errs.length) { console.log('errs:', errs.length); errs.slice(0, 4).forEach(e => console.log('  ' + e)); }
  await b.close();
  if (bad.length) process.exitCode = 1;
})();
