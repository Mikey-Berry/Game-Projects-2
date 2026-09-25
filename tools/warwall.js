#!/usr/bin/env node
/* A WAR THAT REACHES THE WALL.
 *
 * "We killed siege mechanics previously, I think it's time to bring them all back. Both the
 *  mechanics and visuals... specifically, damaging/destroying walls."
 *
 * Two towns go to war, an army musters and marches, and then the sack is decided by a HEADCOUNT:
 *
 *     if(!defenders.length && enemyArmy.length >= 3 && !t.sacked){ t.sacked = 5; ... }
 *
 * The log says "its walls are breached and its stores put to the torch" and nothing in the game
 * has ever touched `t.walls`. The only thing that damages a town wall is a three-per-cent daily
 * EARTHQUAKE.
 *
 * Almost all of the machinery is already here, which is the surprising part. `structAt` returns
 * a town wall with hp getters; `hitStructure` swings at it; `destroyStructure` unblocks the tile
 * and splices it out of `t.walls`; and `syncTownWalls` is keyed on the wall count and the hp sum,
 * so a breach renders itself with no new geometry at all. There is even a "jammed against a wall?
 * smash through" behaviour in the AI — and it scans `pBuilds` only, which is the PLAYER's walls.
 * So a host that marched across the map to a town stands at the wall and mills about.
 *
 * Two missing links, then: what an army does when a wall stops it, and what a sack waits for.
 *
 *   node tools/warwall.js [game.html]
 */
const { chromium } = require('playwright');
const path = require('path');
const gamePath = (a) => path.resolve(a ? (path.isAbsolute(a) ? a : path.join(__dirname, a)) : path.join(__dirname, 'game.html'));

(async () => {
  const b = await chromium.launch({ executablePath: process.env.DUSTWARD_CHROME || undefined,
    args: ['--use-gl=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox','--no-sandbox'] });
  const errs = [];
  const p = await b.newPage({ viewport: { width: 900, height: 600 } });
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
    const drive = (secs, dt = 0.05) => {
      for (let i = 0; i < secs / dt; i++) {
        rebuildCharGrid();
        for (const c of chars) if (c.state !== 'dead') { ai(c, dt); physics(c, dt); }
      }
    };
    const probes = [];
    const wipe = () => {
      for (let i = chars.length - 1; i >= 0; i--) if (chars[i].__probe) chars.splice(i, 1);
      probes.length = 0; rebuildCharGrid();
    };
    /* a soldier of town `fromI`, at war with `t`, standing against one of its wall tiles */
    const besieger = (fromI, t, w, extra) => {
      const c = makeChar('Besieger', 'warband', w.x + 0.5, w.y - 1.2,
        { atk: 40, def: 20, tough: 40, ath: 7, weapon: 'w_nod', armor: 'a_pla' });
      c.state = 'ok'; c.warF = fromI; c.warT = towns.indexOf(t);
      c.armyEnds = day + 10; c.attackMove = { x: t.x, y: t.y };
      c.__probe = true;
      Object.assign(c, extra || {});
      chars.push(c); probes.push(c); return c;
    };

    /* ---------- THE PREMISE ---------- */
    const atk = towns.find(t => t.def.wall && !t.def.undeadFriendly);
    const def = towns.find(t => t !== atk && t.def.wall && !t.def.undeadFriendly);
    guard(['_premise', 'thereIsAWalledTownToBesiege'], () => {
      O._premise = `${towns.filter(t => t.def.wall).length} of ${towns.length} towns are walled; ${def ? def.name : '—'} holds ${def ? def.walls.length : 0} wall tiles`;
      O.thereIsAWalledTownToBesiege = (atk && def && def.walls.length > 20)
        ? `${atk.name} can march on ${def.name}, which stands behind ${def.walls.length} tiles of ${def.def.wall.mat}`
        : `!! NOTHING TO BESIEGE (${atk && atk.name} vs ${def && def.name})`;
    });

    /* ---------- 1. AN ARMY BREAKS THE WALL THAT STOPS IT ---------- */
    guard(['_wall', 'anArmyBreaksTheWallItIsJammedAgainst'], () => {
      wipe();
      atk.warWith = def; def.warWith = atk; atk.warDay = day; def.warDay = day;
      const w = def.walls.find(q => q) ;
      const hp0 = w.hp;
      besieger(towns.indexOf(atk), def, w);
      const c0 = probes[0];
      drive(30);
      const hp1 = w.hp;
      /* WHETHER IT IS EVEN JAMMED. The smash-through the AI already has fires on `stuckT`
         crossing 1.2 seconds, so if the besieger is strolling about rather than pressed against
         the wall then no change to what it scans would help it. */
      O._wall = `wall at ${w.x},${w.y}: ${hp0} hp before, ${hp1.toFixed(0)} after thirty seconds` +
        ` — stuckT ${(c0.stuckT || 0).toFixed(2)}, structTarget ${c0.structTarget ? c0.structTarget.kind : 'none'}`;
      O.anArmyBreaksTheWallItIsJammedAgainst = hp1 < hp0 - 1
        ? `a host stopped by a wall takes it apart — ${hp0} to ${hp1.toFixed(0)} hp`
        : `!! THE WALL IS UNTOUCHED (${hp0} to ${hp1.toFixed(0)}) — the host stands at it and mills about`;
      wipe();
      w.hp = hp0;
    });

    /* ---------- 2. AND A BREACH IS A REAL HOLE IN THE MAP ----------
       The renderer needs nothing new: `syncTownWalls` is keyed on the wall count and the hp
       sum, so a tile leaving `t.walls` redraws the wall by itself. What has to be true is that
       the tile stops being BLOCKED, or the breach is a picture of a hole nobody can walk through. */
    guard(['_breach', 'andABreachIsARealHoleInTheMap'], () => {
      wipe();
      const w = def.walls[Math.floor(def.walls.length / 2)];
      const before = { n: def.walls.length, blocked: isBlocked(w.x + 0.5, w.y + 0.5, 0) };
      w.hp = 12;                                    /* one good swing from falling */
      besieger(towns.indexOf(atk), def, w);
      drive(30);
      const gone = !def.walls.includes(w);
      const after = { n: def.walls.length, blocked: isBlocked(w.x + 0.5, w.y + 0.5, 0) };
      O._breach = `wall tiles ${before.n} → ${after.n}; that tile blocked ${before.blocked} → ${after.blocked}`;
      O.andABreachIsARealHoleInTheMap = (gone && before.blocked && !after.blocked && after.n === before.n - 1)
        ? `the tile comes out of the wall list and stops blocking — ${before.n} tiles to ${after.n}, and you can walk through where it stood`
        : `!! NO BREACH (gone ${gone}, blocked ${before.blocked}→${after.blocked}, ${before.n}→${after.n})`;
      wipe();
    });

    /* ---------- 3. AND A SACK WAITS FOR IT ----------
       THE DAY DOES NOT ROLL OVER BY ITSELF IN A HARNESS. The war resolution hangs off
       `if(hour >= 24){ hour -= 24; day++; ... }` inside `update`, and HOUR_SEC is 8 — a day is
       192 simulated seconds. A first cut drove `update(0.5)` a hundred and twenty times, which
       is seven and a half game HOURS, so the sack block never ran once and the claim came back
       green on a control that sacks a town through an unbroken wall. It was measuring nothing.
       So the clock is walked to the edge of midnight and stepped over deliberately.
       And the claim is in two halves, because "walls intact, no sack" passes just as well on a
       build where nothing is ever sacked at all. The breached half is the control for it. */
    const rollDay = () => {
      const d0 = day;
      paused = false; hour = 23.4;
      for (let i = 0; i < 60 && day === d0; i++) update(0.5);
      paused = true;
      return day > d0;
    };
    /* the headcount condition, exactly: no defenders left and three of the enemy standing.
       THE TOWN PUTS GUARDS BACK UP. A day turning is also a day of the town repopulating, so
       killing the watch once and then turning three days left two guards standing by the third
       — and the intact half of the claim passed on a headcount that was never satisfied rather
       than on the breach gate. The watch is put down again before every single roll, and what
       was standing at the last one is reported, so a vacuous pass is visible in the output. */
    const killGuards = () => {
      let n = 0;
      for (const c of chars) if (c.faction === 'town' && c.homeTown === def && c.guard && c.state === 'ok') { c.state = 'dead'; n++; }
      return n;
    };
    const stageSack = () => {
      wipe();
      def.sacked = 0;
      /* THE RING AT FULL STRENGTH IS WHATEVER IS STANDING NOW. `wall0` is written once at
         worldgen, and the two claims above genuinely took two tiles off this town — so by the
         time the sack is staged the world already reads as breached and the intact half of the
         claim was measuring a town with a hole in it. It came back sacked, correctly, and the
         claim called that a failure of the gate. Re-baselining here is not papering over it:
         "intact" has to mean intact as of this test, and the breached half below then moves
         the count DOWN from that line. */
      def.wall0 = def.walls.length;
      atk.warWith = def; def.warWith = atk; atk.warDay = day; def.warDay = day;
      killGuards();
      for (let i = 0; i < 4; i++) besieger(towns.indexOf(atk), def, def.walls[i * 3]);
    };
    /* turn `n` days, putting the watch down and counting both sides immediately before each
       roll — the state the sack block will actually read when it runs */
    let atRoll = '';
    const turnDays = (n) => {
      let rolled = 0;
      for (let d = 0; d < n && !def.sacked; d++) {
        killGuards();
        const held = chars.filter(c => c.faction === 'town' && c.homeTown === def && c.guard && c.state === 'ok').length;
        const host = chars.filter(c => c.faction === 'warband' && c.warT === towns.indexOf(def) && c.state === 'ok').length;
        atRoll = `${host} besiegers, ${held} defenders`;
        if (rollDay()) rolled++;
      }
      return rolled;
    };
    guard(['_sack', 'aSackWaitsForTheWallToFall', 'andABreachedTownStillFalls'], () => {
      stageSack();
      const n0 = def.walls.length;
      const rolled = turnDays(3);
      const intactSack = def.sacked;
      const intactAt = atRoll;

      /* and now the same three days with a hole in the ring. The tiles come out through
         `destroyStructure`, the way an army takes them, and they are taken from the SOUTH face
         so the pace claim below still has a whole north face to work on. The ring stays
         breached for the rest of the run; nothing downstream measures it. */
      stageSack();
      let broke = 0;
      for (const w of def.walls.filter(q => q.y > def.y).slice(0, 3)) {
        const st = structAt(w.x + 0.5, w.y + 0.5);
        if (st && st.kind === 'twall') { destroyStructure(st); broke++; }
      }
      turnDays(3);
      const breachedSack = def.sacked;

      O._sack = `${rolled} day(s) turned, and at the last roll ${intactAt}:` +
        ` ${n0} tiles whole -> sacked=${intactSack}; ${broke} tiles broken -> sacked=${breachedSack}`;
      O.aSackWaitsForTheWallToFall = (rolled && !intactSack && /\b0 defenders/.test(intactAt))
        ? 'a town with its walls still standing is not sacked by a headcount — the host has to get in first'
        : !rolled ? '!! THE DAY NEVER TURNED — THE SACK BLOCK WAS NEVER REACHED'
          : intactSack ? `!! SACKED THROUGH AN UNBROKEN WALL (${n0} tiles still standing, sacked=${intactSack})`
            : `!! VACUOUS — THE HEADCOUNT WAS NEVER SATISFIED (${intactAt}), SO THE WALL PROVED NOTHING`;
      O.andABreachedTownStillFalls = breachedSack
        ? `and one with ${broke} tiles of its ring on the ground is taken as it always was`
        : `!! A BREACHED TOWN WAS NOT SACKED EITHER (${broke} tiles down, ${atRoll}) — the claim above is measuring nothing`;
      def.sacked = 0;
      atk.warWith = def; def.warWith = atk; atk.warDay = day; def.warDay = day;
      wipe();
    });

    /* ---------- 3b. AND THE RAMPART FALLS WITH IT ----------
       A town wall tile is two things: a solid tile in `blocked` and a floor in `decks`, because
       the wall-top is where archers stand. `destroyStructure` only ever deleted the first, so
       a breach left a walkable tile hanging in the air over the hole. And `decks` has no
       `baseDecks` to be rebuilt from on a load — `restore` resets `blocked` and never touches
       it — so removing the deck at all means the load path has to put it back, or an intact
       save restored after a siege comes back with the stone standing and nothing on top of it.
       Both directions are checked here because neither one alone is safe to make. */
    guard(['_rampart', 'aBreachTakesItsRampartWithIt', 'andALoadPutsBothBack'], () => {
      wipe();
      const w = def.walls[Math.floor(def.walls.length / 3)];
      const deckKey = bkey(w.x, w.y, 1);
      const before = decks.has(deckKey);
      const save = JSON.parse(JSON.stringify(snapshot()));
      const st = structAt(w.x + 0.5, w.y + 0.5);
      if (st && st.kind === 'twall') destroyStructure(st);
      const afterBreach = { deck: decks.has(deckKey), solid: blocked.has(bkey(w.x, w.y)) };
      restore(JSON.parse(JSON.stringify(save)));
      const back = def.walls.some(q => q.x === w.x && q.y === w.y);
      const afterLoad = { deck: decks.has(deckKey), solid: blocked.has(bkey(w.x, w.y)) };
      O._rampart = `wall-top at ${w.x},${w.y}: decked ${before} -> breached ${afterBreach.deck}/${afterBreach.solid} -> loaded ${afterLoad.deck}/${afterLoad.solid} (wall back ${back})`;
      O.aBreachTakesItsRampartWithIt = (before && !afterBreach.deck && !afterBreach.solid)
        ? 'a tile that falls stops being a floor as well as a wall — no rampart left hanging over the breach'
        : `!! THE RAMPART SURVIVED THE WALL (decked ${before} -> ${afterBreach.deck}, solid ${afterBreach.solid})`;
      O.andALoadPutsBothBack = (back && afterLoad.deck && afterLoad.solid)
        ? 'and loading an intact save after a siege brings back the stone and the walk on top of it'
        : `!! A LOADED WALL CAME BACK WITHOUT ITS RAMPART (wall ${back}, decked ${afterLoad.deck}, solid ${afterLoad.solid})`;
      wipe();
      def.sacked = 0;
      atk.warWith = def; def.warWith = atk; atk.warDay = day; def.warDay = day;
    });

    /* ---------- 4. AND THE MASONS COME BACK ----------
       The sack claim above leaves this town three tiles short, which is exactly the state this
       one wants: a ring with a hole in it and nobody at the gate. Without masonry a breach is
       permanent — the town reads `breached` for the rest of the campaign and the next host to
       arrive sacks it on a headcount without laying a hand on the wall. */
    guard(['_masons', 'butNotWhileTheHostIsAtTheGate', 'aBreachDoesNotStayOpenForever'], () => {
      wipe();
      def.sacked = 0;
      const short = def.wall0 - def.walls.length;
      /* a standing tile taken down to almost nothing, to watch strength come back as well as count */
      const hurt = def.walls[0]; hurt.hp = 10;

      /* at war: nothing moves */
      atk.warWith = def; def.warWith = atk; atk.warDay = day; def.warDay = day;
      const nWar = def.walls.length, hpWar = hurt.hp;
      for (let d = 0; d < 3; d++) { def.warWith = atk; atk.warWith = def; def.warDay = day; rollDay(); }
      const nWarAfter = def.walls.length, hpWarAfter = hurt.hp;
      const heldAtWar = nWarAfter === nWar && hpWarAfter === hpWar;

      /* at peace: the ring comes back. Wars are declared inside the day roll, so the peace has
         to be re-imposed after every one of them or a fresh grudge stops the masons and the
         claim goes red for a reason that has nothing to do with masonry. */
      const peaceDay = () => { for (const t of towns) t.warWith = null; rollDay(); for (const t of towns) t.warWith = null; };
      let days = 0;
      while (days < 10 && def.walls.length < def.wall0) { peaceDay(); days++; }
      const backUp = def.walls.length;
      while (days < 20 && hurt.hp < hurt.maxHp) { peaceDay(); days++; }

      O._masons = `${short} tiles down and one tile at 10 of ${hurt.maxHp} hp — three days at war left ${nWarAfter} tiles` +
        ` and that tile at ${hpWarAfter.toFixed(0)} hp; ${days} days at peace left ${backUp} of ${def.wall0} tiles and that tile at ${hurt.hp.toFixed(0)} hp`;
      O.butNotWhileTheHostIsAtTheGate = heldAtWar
        ? `masons do not work with a host at the gate — three days at war moved neither the count nor a hurt tile's strength`
        : `!! THE WALL REBUILT ITSELF DURING A SIEGE (${nWar} tiles and ${hpWar} hp became ${nWarAfter} and ${hpWarAfter.toFixed(0)})`;
      O.aBreachDoesNotStayOpenForever = (backUp === def.wall0 && hurt.hp >= hurt.maxHp && short > 0)
        ? `and a town at peace relays its ring — ${short} tiles back up and a near-dead tile back to full in ${days} days`
        : short === 0 ? '!! NOTHING WAS BROKEN, SO NOTHING COULD BE REBUILT — the claim is vacuous'
          : `!! THE BREACH DID NOT CLOSE (${backUp} of ${def.wall0} tiles after ${days} days, hurt tile at ${hurt.hp.toFixed(0)} of ${hurt.maxHp})`;
      for (const t of towns) t.warWith = null;
      wipe();
    });

    /* ---------- THE NEGATIVES ---------- */
    guard(['andAHostDoesNotEatItsOwnWall'], () => {
      wipe();
      const w = atk.walls[0];
      const hp0 = w.hp;
      besieger(towns.indexOf(atk), def, w);      /* of `atk`, standing at `atk`'s own wall */
      drive(20);
      O.andAHostDoesNotEatItsOwnWall = w.hp >= hp0 - 1
        ? `a soldier of ${atk.name} stood at ${atk.name}'s own wall leaves it alone (${hp0} hp)`
        : `!! A HOST BROKE ITS OWN TOWN'S WALL (${hp0} to ${w.hp.toFixed(0)})`;
      w.hp = hp0; wipe();
    });

    /* ---------- AND HOW LONG IT TAKES A REAL HOST ----------
       The claims above use a deliberately strong probe — atk 40 with a maul — because they are
       about whether the wall can be touched at all. That says nothing about PACE, and pace is
       the whole feel of a siege: a stone ring that falls in a few seconds of game time is not a
       siege, it is a door. So this one musters an army the way the world does, with the stats
       the world rolls, and times it against a real stone wall.

       A MUSTER IS A ROLLED QUANTITY, so the bar is set against the spread and not against one
       draw. The first cut of this asserted `secs >= 20` because the one run it had taken twenty
       seconds; adding the sack claim ahead of it moved the PRNG into a different phase, the
       same code came back at ten, and the claim reported a regression in a build where nothing
       about the wall had changed. `tools/_siegepace.js` walks fourteen musters at COPPERHOLD's
       900hp stone: hosts of 12–15, first tile down in 12–30s, median 20, and 14 of 14 runs got
       through. The bar is 8s and 60s — clear of both ends of that spread, and still tight
       enough to catch the two things worth catching: a tile that falls in one swing-cycle (a
       door) and a ring nobody can ever open (a wall that is only scenery). */
    guard(['_pace', 'aStoneWallIsNotADoor'], () => {
      wipe();
      const n0 = def.walls.length;
      const before = chars.length;
      spawnArmy(towns.indexOf(atk), def);
      const host = chars.slice(before);
      for (const c of host) c.__probe = true;
      /* put them at the ring, which is where a march would eventually deliver them */
      const face = def.walls.filter(w => Math.abs(w.y - (def.y - def.def.wall.r)) < 1.5).slice(0, 12);
      for (const w of face) w.hp = w.maxHp;
      host.forEach((c, i) => { const w = face[i % Math.max(1, face.length)]; if (w) { c.x = w.x + 0.5; c.y = w.y - 1.3; } });
      let secs = 0;
      while (secs < 90 && def.walls.length === n0) { drive(2); secs += 2; }
      const fell = n0 - def.walls.length;
      O._pace = `${host.length} soldiers of ${atk.name} at a ${def.def.wall.mat} wall (${def.def.wall.hp} hp a tile):` +
        ` first tile ${fell ? 'fell after ' + secs + 's' : 'still standing at ' + secs + 's'} — measured spread 12–30s, median 20s`;
      O.aStoneWallIsNotADoor = (fell > 0 && secs >= 8 && secs <= 60)
        ? `a mustered host needs ${secs} seconds to open the first tile of ${def.def.wall.mat} — a siege, not a door`
        : fell === 0
          ? `!! A REAL HOST NEVER GOT THROUGH AT ALL IN ${secs} SECONDS — the ring is scenery`
          : `!! THE FIRST TILE FELL IN ${secs} SECONDS, OUTSIDE THE MEASURED 12–30s BAND`;
      for (const w of face) if (def.walls.includes(w)) w.hp = w.maxHp;
      wipe();
    });

    /* THE PLAYER'S WALLS ARE GUARDED ELSEWHERE, ON PURPOSE. A claim here that a raider still
       smashes through your camp needs a raider, a victim behind the wall and nothing else in
       the world interfering — and staged in a live camp the raider was beaten down by the
       squad before it ever reached the wall. `walls.js` and `siege.js` already own that
       ground; duplicating it badly here would be a regression guard that fails for its own
       reasons. Both are run against this change instead. */
    atk.warWith = null; def.warWith = null;
    return O;
  });

  console.log('\n=== A WAR THAT REACHES THE WALL ===\n');
  const bad = [];
  for (const k of Object.keys(R)) {
    const v = String(R[k]);
    console.log('  ' + k.padEnd(38) + v.slice(0, 220));
    if (v.startsWith('!!')) bad.push(v);
  }
  for (const e of errs) bad.push(e);
  console.log('');
  for (const v of bad) console.log('*** ' + v);
  await b.close();
  process.exit(bad.length ? 1 : 0);
})();
