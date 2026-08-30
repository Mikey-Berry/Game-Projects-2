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
  /* START AND STOP IN THE SAME BREATH. A click followed by a wait lets the world run for
     however many frames the machine manages, which is not a fixed number and drops when a
     sixty-harness suite is loading the box — so every body is somewhere slightly different
     by the time this probe stages anything, and the numbers below inherit it. Measured on
     one unchanged build before this was applied here: flank.js gave 1.67 / 1.67 / 1.09 over
     three runs, and guns.js split three-to-two on an md5 that had not moved. Pausing inside
     the same evaluate leaves no frames at all between the two. Every file below sets
     `paused` for itself anyway; this only removes the window before its first statement. */
  await p.evaluate(() => { document.getElementById('btn-start').click(); paused = true; });
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
      const wasAtk = friend.stats.atk;
      friend.state = 'dead'; friend.deadAt = day;
      chars.push(friend); corpses.push(friend);
      const risen = castRaise(necro, friend) !== false ?
        chars.find(o => o.lieutenant && o.name === 'Wren Ashmouth') : null;
      R.theyComeBack = risen ? 'a companion rises as a lieutenant' : '!! A COMPANION ROSE AS A NUMBER';
      R.keptTheirName = risen && risen.name === 'Wren Ashmouth' ? 'with their own name' : '!! NAME LOST';
      /* Compare against what the BODY actually had, not against the 22 that was asked for.
         A character's line adds to its starting stats, so `atk: 22` is a request and not a
         result, and an assertion against the literal was testing the character creator
         rather than the raise. What this block is about is whether a lieutenant comes back
         as itself. */
      R.keptThemself = risen && risen.conviction === 'loyal' && risen.regard === 44 &&
        Math.abs(risen.stats.atk - wasAtk) < 0.01 ? 'conviction, regard and prowess intact' :
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

    /* ---------- WHAT IS UNDER THE MOUNTAIN STAYS UNDER THE MOUNTAIN ----------
       The 2D overlay paints over the finished frame with no depth test, so every marker it
       drew for a body in the caves — the name, the health bar, the intent line — hung in the
       air above the rock, and the whole warren advertised its contents from the surface. The
       minimap did the same thing, because a cave is stored at the coordinates of the hill on
       top of it. The 3D pass had answered this question for walls all along: a storey is open
       only while one of your own is standing on it. This checks the overlay agrees.

       Asserted through the same expression the renderer uses rather than by counting pixels,
       because what is being pinned is the RULE. A pixel test here would pass just as happily
       on a camera that happened to be pointing the other way. */
    {
      const openFloors = () => {
        const o = { 0: true };
        for (const c of chars) if (c.faction === 'player' && c.state !== 'dead') o[c.floor || 0] = true;
        return o;
      };
      const elsewhere = chars.filter(c => (c.floor || 0) !== 0 && c.state !== 'dead');
      R.thereIsSomethingDownThere = elsewhere.length > 4
        ? `${elsewhere.length} bodies are on a floor of their own`
        : `!! NOTHING IS UNDERGROUND TO TEST WITH (${elsewhere.length})`;
      const mine = player()[0];
      const wasF = mine.floor;
      mine.floor = 0;
      const shownFromAbove = elsewhere.filter(c => openFloors()[c.floor || 0]).length;
      R.nothingShowsThroughRock = shownFromAbove === 0
        ? 'standing on the surface, not one of them is drawn'
        : `!! ${shownFromAbove} MARKERS PAINT STRAIGHT THROUGH THE MOUNTAIN`;
      /* and it is hiding, not deleting: go down and the floor you are on fills in */
      const deep = elsewhere.slice().sort((a, b) => (a.floor || 0) - (b.floor || 0))[0];
      if (deep) {
        mine.floor = deep.floor;
        const o = openFloors();
        const shown = elsewhere.filter(c => o[c.floor || 0]).length;
        const onThatFloor = elsewhere.filter(c => (c.floor || 0) === deep.floor).length;
        R.goDownAndYouSeeIt = shown === onThatFloor && shown > 0
          ? `put one of yours on floor ${deep.floor} and its ${shown} show, and nothing from the other floors`
          : `!! WENT DOWN AND SAW ${shown} OF ${onThatFloor} ON THAT FLOOR`;
      }
      mine.floor = wasF;
    }

    /* ---------- A CROP IS NOT A COMPANION ----------
       A cadaver grown in the Ossuary is made under the player's faction, because it is yours —
       and every other test in the raise path read that as "this was somebody who stood with
       you". So meat grown in a house came back as a LIEUTENANT: name kept, face kept,
       conviction kept, and one of the two or three slots a necromancer ever gets. */
    try {
      const necro = player().find(c => c.gift === 'dark' && !c.undead && c.state === 'ok');
      if (!necro) { R.grownCrop = '!! NO NECROMANCER TO TEST WITH'; }
      else {
        necro.stats.magic = 60; necro.mana = 999;
        research.done.necromancy = true;
        const q = findOpenNear(necro.x + 4, necro.y + 4, 6);
        const crop = makeChar('Grown Cadaver', 'player', q.x, q.y, { atk: 12, def: 11, tough: 12 });
        crop.state = 'dead'; crop.grown = true; crop.deadAt = day;
        chars.push(crop); corpses.push(crop);
        const before = chars.filter(o => o.lieutenant).length;
        castRaise(necro, crop);
        const after = chars.filter(o => o.lieutenant).length;
        R.grownCrop = after === before
          ? 'a grown cadaver rises as one of the risen, not a lieutenant'
          : '!! MEAT GROWN IN A HOUSE CAME BACK AS A LIEUTENANT';
        /* and the thing it must not break: somebody who actually lived beside you still does */
        const q2 = findOpenNear(necro.x + 6, necro.y + 6, 6);
        const friend = makeChar('Someone Who Stood With You', 'player', q2.x, q2.y, { atk: 12, def: 11, tough: 12 });
        friend.state = 'dead'; friend.deadAt = day;
        chars.push(friend); corpses.push(friend);
        const b2 = chars.filter(o => o.lieutenant).length;
        castRaise(necro, friend);
        R.companionsStillRise = chars.filter(o => o.lieutenant).length > b2
          ? 'and a companion still comes back as themselves'
          : '!! THE FIX ATE THE LIEUTENANTS TOO';
      }
    } catch (e) { R.grownCrop = '!! THREW: ' + e.message; }

    /* ---------- THE MAGE IS NOT MINDLESS ----------
       It is issued in the RANGED stance, and the panel row that shows stances asked
       `c.undead && !c.lich` — so it drew "☠ mindless — always aggressive" instead, for the
       mage, the servitor and every lieutenant. The job row beside it had been asking
       `mindedDead` all along, which is why STUDY worked and the stance did not. */
    try {
      for (const k of Object.keys(TECHS)) research.done[k] = true;
      for (const k of ['remains', 'copper', 'fabric', 'hide', 'stone', 'wood', 'w_bow']) stash[k] = 999;
      const nec = player().find(c => c.gift === 'dark' && !c.undead && c.state === 'ok');
      const circ = { x: nec.x + 3, y: nec.y + 3 };
      const born = (kind) => { const b0 = chars.slice(); nec.mana = 999; craftUndead(kind, nec, circ, null); return chars.find(c => !b0.includes(c)); };
      const mage = born('mage'), brute = born('brute');
      R.mageHasAMind = mage && mindedDead(mage) ? 'a skeleton mage counts as minded' : '!! THE MAGE IS STILL MINDLESS';
      R.mageStance = mage && mage.stance === 'ranged' ? 'and it stands in the ranged band' : `!! THE MAGE IS IN ${mage && mage.stance}`;
      /* THE PANEL ITSELF, NOT AN EXPRESSION THAT RESEMBLES IT. The first version of this
         asserted `mindedDead(mage)` and passed on the broken build, because `mindedDead` was
         never the thing that was wrong — the stance ROW asked its own question. Checking a
         proxy for the code under test is how this bug survived in the first place. So: open
         the panel on a real mage and count the buttons that are actually in the DOM. */
      if(mage){
        selected = [mage];
        refreshCharPanel();
        const row = document.getElementById('stancerow');
        const btns = row ? row.querySelectorAll('button').length : 0;
        const saysMindless = !!row && /mindless/i.test(row.textContent);
        R.stanceRowOpens = (btns >= 3 && !saysMindless)
          ? `the panel offers the mage ${btns} stances`
          : `!! THE PANEL GIVES THE MAGE ${btns} STANCE BUTTONS${saysMindless ? ' AND CALLS IT MINDLESS' : ''}`;
        /* and the brute must still be told it is mindless, or this went too far */
        selected = [brute];
        refreshCharPanel();
        const row2 = document.getElementById('stancerow');
        R.bruteRowClosed = row2 && /mindless/i.test(row2.textContent) && row2.querySelectorAll('button').length === 0
          ? 'and still tells you a hollow brute has no mind'
          : '!! THE PANEL NOW OFFERS STANCES TO A MINDLESS BRUTE';
        selected = [];
      }
      /* the real predicate, not a proxy: `jobHasWork` is what decides whether a body with the
         STUDY job actually has study to do, and it wants a bench in the world to say yes. */
      {
        pBuilds.push({ type: 'r_bench', x: nec.x, y: nec.y, w: 2, h: 2 });
        const magePasses = jobHasWork(mage, 'research'), brutePasses = jobHasWork(brute, 'research');
        pBuilds.pop();
        R.mageCanStudy = (magePasses && !brutePasses)
          ? 'and with a bench in the world it has study to do, where a brute does not'
          : `!! STUDY GATE IS WRONG (mage ${magePasses}, brute ${brutePasses})`;
      }
      /* the brute must stay mindless, or this became "everything off the circle thinks" */
      R.bruteStaysDumb = brute && !mindedDead(brute)
        ? 'a hollow brute is still mindless' : '!! THE BRUTE STARTED THINKING';
      /* and it has a body of its own rather than the generic risen rig */
      R.mageLooksLikeOne = mage && mage.kin === 'mage' ? 'and a shape of its own off the circle'
        : '!! THE MAGE WEARS THE PLAIN RISEN BODY';
    } catch (e) { R.mageHasAMind = '!! THREW: ' + e.message; }

    /* ---------- NOBODY CUTS UP THE DEAD FOR A LIVING AND KEEPS THE FAITH ----------
       The devout lines are written as objections to exactly this — "you put a soul out of its
       rest to carry a sack" — so a dark-gifted devout complained, in its own voice, about the
       thing it does all day. */
    {
      const N = 4000;
      let darkDevout = 0, plainDevout = 0;
      const seen = {};
      for (let i = 0; i < N; i++) {
        if (rollConviction('dark') === 'devout') darkDevout++;
        const k = rollConviction(null);
        if (k === 'devout') plainDevout++;
        seen[k] = 1;
      }
      R.noDevoutNecros = darkDevout === 0
        ? `not one devout dark alchemist in ${N} rolls` : `!! ${darkDevout} DEVOUT NECROMANCERS IN ${N} ROLLS`;
      R.devoutStillExists = plainDevout > N * 0.05
        ? `and the devout are still ${(100 * plainDevout / N).toFixed(0)}% of everybody else`
        : '!! THE FIX DELETED THE DEVOUT ENTIRELY';
      R.convictionsIntact = Object.keys(seen).length >= 7
        ? `${Object.keys(seen).length} convictions still roll` : `!! ONLY ${Object.keys(seen).length} CONVICTIONS ROLL`;
      /* and a body actually built with the gift never carries it */
      let bad = 0;
      for (let i = 0; i < 600; i++) {
        const c = makeChar('X', 'player', 600, 600, { gift: 'dark' });
        if (c.conviction === 'devout') bad++;
      }
      R.builtNecrosAgree = bad === 0 ? 'and no body built dark-gifted comes out devout'
        : `!! ${bad} OF 600 DARK-GIFTED BODIES CAME OUT DEVOUT`;
    }

    /* ---------- THE SKULL RIDES AT HEAD HEIGHT ----------
       It hung at 1.15 in its OWN local space, and the whole rig is scaled by `c.big` — 0.55
       for a servitor — so the skull actually floated with its centre 0.49 above the ground.
       Knee height. It read as a skull rolling along the dirt. */
    try {
      const nec2 = player().find(c => c.gift === 'dark' && !c.undead && c.state === 'ok');
      const b0 = chars.slice(); nec2.mana = 999;
      craftUndead('servitor', nec2, { x: nec2.x + 3, y: nec2.y + 3 }, null);
      const sv = chars.find(c => !b0.includes(c));
      sv.state = 'ok';
      for (let i = 0; i < 40; i++) syncChars(0.05);
      const es = charMeshes.get(sv.id), me2 = player().find(c => !c.undead && c.state === 'ok');
      const em = charMeshes.get(me2.id);
      const spanOf = (root) => {
        const bb = new THREE.Box3();
        root.updateWorldMatrix(true, true);
        root.traverse(o => { if (!o.isMesh) return; let v = o.visible, q = o.parent; while (q && v) { v = q.visible; q = q.parent; } if (v) bb.expandByObject(o); });
        return bb;
      };
      if (!es || !es.float || !em) { R.skullRides = '!! COULD NOT BUILD BOTH BODIES'; }
      else {
        const sb = spanOf(es.float), hb = spanOf(em.headG);
        const skullMid = (sb.min.y + sb.max.y) / 2 - groundY(sv.x, sv.y);
        /* The yardstick has to be a body of KNOWN size, not whichever body worldgen happened
           to roll first. `baseSY` is a coin-flip on sex plus a hash of the id — a male dustborn
           stands about 10% taller than a female one — so the living head that this reads for a
           reference moves 0.17 between worlds, which is most of the tolerance. This assertion
           went red for exactly that reason: six new wanderers upstream shifted the worldgen RNG,
           the first crew member came up male instead of female, and the head rose from 1.65 to
           1.82 while the skull sat exactly where it always had. Divide the reference by its own
           body's world scale so it is the head height of a canonical 1.0 body either way. */
        const wsc = new THREE.Vector3(); em.g.getWorldScale(wsc);
        const headMid = ((hb.min.y + hb.max.y) / 2 - groundY(me2.x, me2.y)) / (wsc.y || 1);
        R.skullRides = Math.abs(skullMid - headMid) < 0.28
          ? `the bound skull floats at ${skullMid.toFixed(2)} against a head at ${headMid.toFixed(2)} on a body of standard build`
          : `!! THE SKULL FLOATS AT ${skullMid.toFixed(2)} AND A STANDARD HEAD IS AT ${headMid.toFixed(2)}`;
      }
    } catch (e) { R.skullRides = '!! THREW: ' + e.message; }

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
