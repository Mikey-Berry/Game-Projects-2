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
    return R;
  });

  console.log('=== ' + (process.argv[2] || 'game.html') + ' ===\n');
  for (const [k, v] of Object.entries(out)) {
    console.log('  ' + k.padEnd(18) + (typeof v === 'object' ? JSON.stringify(v) : v));
  }
  const bad = JSON.stringify(out).match(/should|LOST|KILLED|WALKED OUT|STILL INSIDE|NOT REGISTERED/);
  console.log('\n' + (bad ? '*** SOMETHING IS NOT WIRED ***' : 'THE LAW WORKS'));
  if (errs.length) console.log('errs:', errs.length, errs.slice(0, 4));
  await b.close();
})();
