#!/usr/bin/env node
/* The law, end to end.
 *
 * A jail is a lot of state that only matters when several systems agree — a crime has to be
 * SEEN, a guard has to choose to subdue rather than finish, a body has to be carried, a cell
 * has to hold it, a sentence has to run on the calendar, and every bit of that has to survive
 * a save. Any one of them silently not firing leaves a system that looks implemented and
 * never happens in play.
 *
 *   node tools/jail.js [game.html]
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
  p.on('pageerror', e => errs.push(e.message.slice(0, 220)));
  await p.goto('file://' + gamePath(process.argv[2]), { waitUntil: 'load' });
  await p.waitForTimeout(3000);
  await p.evaluate(() => document.getElementById('btn-start').click());
  await p.waitForTimeout(3000);

  const out = await p.evaluate(() => {
    const R = {};
    const t = towns.find(tt => !tt.def.undeadFriendly && !tt.playerRuled) || towns[0];
    R.cellsBuilt = cells.length;
    R.cellsHere = cells.filter(c => c.town === t).length;

    /* --- 1. a crime nobody sees is not a crime --- */
    const far = { x: 4, y: 4 };
    const hero = makeChar('Test Hand', 'player', far.x, far.y, { atk: 30, tough: 40 });
    hero.state = 'ok'; chars.push(hero);
    t.bounty = 0; t.wanted = false;
    R.unseen = crime('murder', far.x, far.y, hero) ? 'REGISTERED (should not)' : 'ignored';

    /* --- 2. a crime in the middle of town, in front of people --- */
    hero.x = t.x + 1; hero.y = t.y + 1;
    /* make sure somebody is standing there to see it */
    let eyes = chars.filter(o => o.faction === 'town' && o.state === 'ok' && o.homeTown === t);
    if (eyes.length) { eyes[0].x = t.x + 2; eyes[0].y = t.y + 1; }
    const got = crime('raising', hero.x, hero.y, hero);
    R.seen = got ? 'wanted, bounty ' + got.bounty : 'NOT REGISTERED (should be)';
    R.witnessFound = !!witnessNear(hero.x, hero.y, t);

    /* --- 3. guards must want them alive now --- */
    const guard = chars.find(o => o.faction === 'town' && !o.civ && o.homeTown === t && o.state === 'ok');
    R.guardWantsAlive = guard ? wantsAlive(guard, hero) : 'no guard found';

    /* --- 4. a lethal blow is capped while they are wanted --- */
    if (guard) {
      for (const k in hero.parts) hero.parts[k].hp = 10;
      const before = Math.min(...Object.values(hero.parts).map(q => q.hp));
      applyDamage(guard, hero, 'chest', 500, 'cut', true, false, true);
      const after = Math.min(...Object.values(hero.parts).map(q => q.hp));
      R.lethalCapped = (hero.state !== 'dead') ? 'survived (' + before + ' -> ' + after.toFixed(0) + ')' : 'KILLED (should be taken alive)';
    }

    /* --- 5. jailing: kit off, cell holds, sentence set --- */
    for (const k in hero.parts) hero.parts[k].hp = 100;
    hero.state = 'down';
    hero.weapon = 'w_kat'; hero.armor = 'a_pla';
    hero.inv = { remains: 3, gold_bar: 1 };
    const cell = freeCell(t);
    R.freeCellFound = !!cell;
    if (cell) {
      stripKit(hero);
      jail(hero, cell, 4);
      R.afterJail = {
        weapon: hero.weapon, armor: hero.armor, invKeys: Object.keys(hero.inv || {}).length,
        cellHolds: cell.holds === hero.id, sentence: hero.jailT, standing: hero.state,
      };
    }

    /* --- 6. a cell holds: no orders reach them --- */
    const px = hero.x, py = hero.y;
    hero.moveTarget = { x: t.x + 20, y: t.y + 20 };
    for (let i = 0; i < 60; i++) physics(hero, 1 / 30);
    R.heldInCell = Math.hypot(hero.x - px, hero.y - py) < 0.01 ? 'held' : 'WALKED OUT';

    /* --- 7. all of it through a save --- */
    restore(JSON.parse(JSON.stringify(snapshot())));
    const back = chars.find(c => c.id === hero.id);
    R.afterSave = back ? {
      stillJailed: !!back.jailedAt, sentence: back.jailT,
      kitHeld: !!back.heldKit, weaponGone: !back.weapon,
    } : 'CHARACTER LOST';

    /* --- 8. the sentence runs out and they walk --- */
    /* The clock advances by dt/HOUR_SEC, so update(0.02) moves it a thousandth of an hour
       and midnight never arrives. Push it with real hours. */
    const h2 = chars.find(c => c.id === hero.id);
    let days = 0, guard2 = 0;
    while (h2 && h2.jailedAt && guard2++ < 400) {
      const d0 = day;
      hour = 23.5; update(HOUR_SEC);
      if (day !== d0) days++;
    }
    R.released = h2 && !h2.jailedAt ? 'released' : 'STILL INSIDE after ' + days + ' days';
    R.kitReturned = h2 && h2.weapon === 'w_kat' && h2.armor === 'a_pla' ? 'kit back' :
      'KIT LOST (weapon ' + (h2 ? h2.weapon : '-') + ')';
    R.invReturned = h2 && (h2.inv || {}).remains === 3 ? 'goods back' : 'GOODS LOST';
    /* --- 9. YOUR cells: seize, hold, and the whole thing through a save --- */
    const camp = { x: t.x + 40, y: t.y + 40 };
    const pb = placeStructure('cell', Math.round(camp.x), Math.round(camp.y));
    R.playerCellMade = cells.filter(c => c.kind === 'player').length;
    const vic = makeChar('Captive', 'bandit', camp.x + 1, camp.y, { atk: 20, def: 15, tough: 20 });
    vic.state = 'down'; vic.weapon = 'w_club'; chars.push(vic);
    const taker = makeChar('Taker', 'player', camp.x + 2, camp.y, { atk: 20, ath: 40 });
    taker.state = 'ok'; chars.push(taker);
    taker.seizeTarget = vic;
    for (let i = 0; i < 900 && !vic.jailedAt; i++) physics(taker, 1 / 30);
    R.seized = vic.jailedAt ? 'in a cell of yours' : 'NEVER SEIZED';
    if (!vic.jailedAt) R.seizeDiag = {
      seizeTarget: !!taker.seizeTarget, drag: !!taker.drag, target: !!taker.target,
      takerState: taker.state, vicState: vic.state, vicCaptured: !!vic.captured,
      apart: +dist(taker.x, taker.y, vic.x, vic.y).toFixed(2),
      cellBlocked: isBlocked(camp.x + 0.9, camp.y + 0.9, 0),
      takerBlocked: isBlocked(taker.x, taker.y, 0), fleeT: taker.fleeT,
    };
    R.seizedStripped = !vic.weapon ? 'kit taken' : 'KIT NOT TAKEN';
    R.ransomWorth = ransomValue(vic);

    /* two loads must not leave two copies of the cell, nor move the prisoner */
    const snap = JSON.parse(JSON.stringify(snapshot()));
    restore(JSON.parse(JSON.stringify(snap)));
    restore(JSON.parse(JSON.stringify(snap)));
    const pcells = cells.filter(c => c.kind === 'player').length;
    const v2 = chars.find(c => c.name === 'Captive');
    R.cellsAfterTwoLoads = pcells === 1 ? '1 (correct)' : pcells + ' COPIES';
    R.prisonerAfterLoad = v2 && v2.jailedAt && v2.jailedAt.kind === 'player' ? 'still held, right cell' :
      (v2 && v2.jailedAt ? 'HELD IN THE WRONG CELL' : 'PRISONER LOST');

    /* --- 10. ransom pays out --- */
    const before = cats;
    if (v2) ransomPrisoner(v2);
    R.ransomPaid = cats > before ? '+' + (cats - before) + ' cats' : 'NO PAYMENT';
    R.cellFreedAfter = cells.filter(c => c.kind === 'player' && !c.holds).length === 1 ? 'cell free again' : 'CELL STILL FLAGGED';

    /* --- 10b. the newly wired crimes: each must register when seen --- */
    const seenAt = { x: t.x + 1, y: t.y + 1 };
    const witness = chars.find(o => o.faction === 'town' && o.state === 'ok' && o.homeTown === t);
    if (witness) { witness.x = t.x + 2; witness.y = t.y + 1; }
    const hand = makeChar('Hand', 'player', seenAt.x, seenAt.y, { atk: 20 });
    hand.state = 'ok'; chars.push(hand);
    rebuildCharGrid();

    const wanted = (fn) => { t.bounty = 0; t.wanted = false; fn(); return t.bounty; };

    /* robbing the dead: taking a body up inside the walls */
    const body = makeChar('Departed', 'town', seenAt.x, seenAt.y, {});
    body.state = 'dead'; body.homeTown = t; chars.push(body); corpses.push(body);
    R.graverob = wanted(() => takeBody(hand, body)) > 0 ? 'wanted' : 'NOT A CRIME';

    /* theft: going through a townsman's pockets in front of the town */
    const dead2 = makeChar('Neighbour', 'town', seenAt.x, seenAt.y, {});
    dead2.state = 'dead'; dead2.homeTown = t; dead2.weapon = 'w_kat'; chars.push(dead2);
    R.theft = wanted(() => lootCorpse(dead2)) > 0 ? 'wanted' : 'NOT A CRIME';

    /* contraband: a guard, close, and something in the pack the gate forbids */
    const grd = chars.find(o => o.faction === 'town' && !o.civ && o.state === 'ok' && o.homeTown === t);
    if (grd) { grd.x = seenAt.x + 1; grd.y = seenAt.y; }
    hand.inv = { remains: 2 };
    rebuildCharGrid();
    t.bounty = 0; t.wanted = false;
    for (let i = 0; i < 200 && !t.bounty; i++) contrabandCheck();
    R.contraband = t.bounty > 0 ? 'found on a search' : 'NEVER SEARCHED';
    hand.inv = {};

    /* and none of them stick when nobody is looking */
    for (const o of chars) if (o.faction === 'town' && dist(o.x, o.y, 6, 6) > 1) { /* leave them */ }
    const lone = makeChar('Lone', 'player', 5, 5, { atk: 20 });
    lone.state = 'ok'; chars.push(lone);
    const body2 = makeChar('Nobody', 'town', 5, 5, {});
    body2.state = 'dead'; chars.push(body2); corpses.push(body2);
    rebuildCharGrid();
    R.unseenGraverob = wanted(() => takeBody(lone, body2)) === 0 ? 'ignored' : 'REGISTERED UNSEEN';
    t.bounty = 0; t.wanted = false;

    /* --- 11. THE BARS. A watched cell must hold; an unwatched one must not. --- */
    const pcell = cells.find(c => c.kind === 'player');
    const runner = makeChar('Runner', 'bandit', pcell.x, pcell.y, { atk: 30, tough: 40, martial: 20 });
    runner.state = 'ok'; chars.push(runner);
    stripKit(runner); jail(runner, pcell, 0); runner.prisoner = true;

    /* watched: a warden standing on the cell */
    const warden = makeChar('Warden', 'player', pcell.x + 1, pcell.y, { atk: 20 });
    warden.state = 'ok'; chars.push(warden);
    pcell.hp = 40;
    /* charsNear reads the spatial hash, which update() rebuilds every tick. Driving physics()
       directly leaves it stale, so the warden was invisible to watchersOn and the cell read
       as unguarded. */
    for (let i = 0; i < 60 * 30; i++) { rebuildCharGrid(); physics(runner, 1 / 30); }
    R.watchedHeld = runner.jailedAt ? 'held (hp ' + Math.round(pcell.hp) + ', repaired)' : 'ESCAPED WHILE WATCHED';

    /* unwatched: EVERYONE of yours walks away. The taker from the seize test was still
       standing beside the cell and counted, quite correctly, as a guard. */
    for (const o of chars) {
      if (o.faction !== 'player' || o.jailedAt) continue;
      o.x = pcell.x + 60; o.y = pcell.y + 60;
    }
    let secs = 0;
    for (let i = 0; i < 60 * 30 * 12 && runner.jailedAt; i++) { rebuildCharGrid(); physics(runner, 1 / 30); secs += 1 / 30; }
    R.unwatchedOut = runner.jailedAt ? 'NEVER GOT OUT' : 'out after ' + Math.round(secs) + 's of work';
    R.escapeeArmed = runner.weapon !== undefined ? 'kit back on the way past' : 'kit lost';
    R.escapeeHostile = runner.provoked ? 'hostile and running' : 'NOT HOSTILE';
    R.cellRelocked = pcell.holds === 0 && pcell.hp === pcell.maxHp ? 'cell reset' : 'CELL LEFT BROKEN';

    /* --- 11b. THE WATCH TURNS OUT. The escape mechanic was well built and almost never
       seen, because nothing ever put a guard at the gaol. A town holding somebody must
       send exactly one, and that one must hold the cell. --- */
    const tc = cells.find(c => c.kind === 'town' && c.town && c.town.gaolPost);
    const tt = tc.town;
    R.gaolPostExists = !!tt.gaolPost;
    for (const o of chars) if (o.homeTown === tt && o.guard) { o.x = tt.x - 12; o.y = tt.y - 12; o.moveTarget = null; }
    const lag = makeChar('Lag', 'bandit', tc.x, tc.y, { atk: 30, tough: 40 });
    lag.state = 'ok'; chars.push(lag);
    jail(lag, tc, 9);
    let atPost = 0;
    /* ai() decides where to go, physics() walks there. Driving only physics leaves a guard
       with intent it never formed — the post logic lives in ai. */
    for (let i = 0; i < 60 * 40; i++) {
      rebuildCharGrid();
      for (const o of chars) if (o.faction === 'town' && o.guard && o.homeTown === tt) { ai(o, 1 / 30); physics(o, 1 / 30); }
    }
    for (const o of chars) if (o.faction === 'town' && o.guard && o.homeTown === tt &&
      dist(o.x, o.y, tt.gaolPost.x, tt.gaolPost.y) < 2.5) atPost++;
    R.wardenTookPost = atPost >= 1 ? atPost + ' on the gaol' : 'NOBODY CAME';
    R.notTheWholeWatch = atPost <= 2 ? 'rest stayed on their own posts' : 'WHOLE GARRISON ABANDONED THE WALLS';

    /* and with a warden there, the bars hold */
    tc.hp = 30;
    for (let i = 0; i < 60 * 40; i++) {
      rebuildCharGrid();
      for (const o of chars) if (o.faction === 'town' && o.guard && o.homeTown === tt) { ai(o, 1 / 30); physics(o, 1 / 30); }
      physics(lag, 1 / 30);
    }
    R.wardenHolds = lag.jailedAt ? 'held (hp ' + Math.round(tc.hp) + ')' : 'ESCAPED PAST THE WARDEN';

    /* cell quality varies with how well the town is run */
    const hps = [...new Set(cells.filter(c => c.kind === 'town').map(c => c.maxHp))];
    R.cellQuality = hps.length > 1 ? hps.length + ' grades: ' + Math.min(...hps) + '-' + Math.max(...hps) : 'ALL IDENTICAL';

    /* --- 12. bar progress survives a save --- */
    const runner2 = makeChar('Runner2', 'bandit', pcell.x, pcell.y, { atk: 30, tough: 40 });
    runner2.state = 'ok'; chars.push(runner2);
    jail(runner2, pcell, 0); runner2.prisoner = true;
    pcell.hp = 55;
    const idx = cells.indexOf(pcell);
    restore(JSON.parse(JSON.stringify(snapshot())));
    R.cellHpKept = Math.abs((cells[idx] ? cells[idx].hp : -1) - 55) < 1.5 ?
      'damage kept (' + Math.round(cells[idx].hp) + ')' : 'DAMAGE RESET to ' + (cells[idx] ? cells[idx].hp : '?');
    return R;
  });

  console.log('=== ' + (process.argv[2] || 'game.html') + ' ===\n');
  for (const [k, v] of Object.entries(out)) {
    console.log('  ' + k.padEnd(18) + (typeof v === 'object' ? JSON.stringify(v) : v));
  }
  /* Any SHOUTED phrase in a value is a failure marker — an allow-list of known failure
     words let "ESCAPED WHILE WATCHED" through as a pass. */
  const bad = Object.values(out).map(v => typeof v === 'object' ? JSON.stringify(v) : String(v))
    .filter(v => /\b[A-Z]{3,}(\s+[A-Z]{2,})*\b/.test(v) && !/^\d/.test(v));
  console.log('\n' + (bad.length ? '*** NOT WIRED: ' + bad.join(' | ') + ' ***' : 'THE LAW WORKS'));
  if (errs.length) console.log('errs:', errs.length, errs.slice(0, 4));
  await b.close();
})();
