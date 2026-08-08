#!/usr/bin/env node
/* Commanders: does a band you sent away actually go, do the thing, and come back.
 *
 * This is a feature made almost entirely of other features — a commander writes no movement,
 * no fighting and no looting of its own, it points the existing per-unit order fields at
 * things. That makes it very easy to build something that reads correctly, passes a syntax
 * check, and then does nothing at all in play because one of the five fields it drives was
 * spelled differently than assumed, or because the tick it hangs off is throttled past the
 * point where anything happens.
 *
 * So every claim here is measured by running the real sim forward and looking at where the
 * bodies ended up, not by inspecting the order object.
 *
 *   node tools/command.js [game.html]
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
    const openNear = (x, y, r) => findOpenNear(x, y, r);

    /* a captain and four, on clear ground well away from anyone else's business */
    const mk5 = (at, conv) => {
      const made = [];
      for (let i = 0; i < 5; i++) {
        const q = openNear(at.x + (i - 2), at.y, 3);
        const c = makeChar('Band ' + i, 'player', q.x, q.y,
          { atk: 16, def: 14, tough: 14, ath: 7, weapon: 'w_kat', armor: 'a_lea' });
        chars.push(c); made.push(c);
      }
      made[0].name = 'Captain';
      if (conv) made[0].conviction = conv;
      return made;
    };

    /* ---------------- 1. PATROL: do they actually leave, and cover ground ---------------- */
    {
      const me = player()[0];
      const at = openNear(me.x + 26, me.y + 26, 8);
      const band = mk5(at);
      const cdr = band[0];
      giveCommand(cdr, band, 'patrol', { x: cdr.x, y: cdr.y }, 30);
      R.orderTaken = cdr.cmd ? 'the order is on the captain' : 'ORDER NEVER SET';
      R.bandBound = band.slice(1).every(o => o.under === cdr.id) ? 'four under him' : 'BAND NOT BOUND';
      R.noJobs = band.slice(1).every(o => !o.job) ? 'soldiers are off the tools' : 'STILL DOING CHORES';
      /* the trade has to come BACK, or one patrol costs a sawyer his trade forever */
      band[1].job = null; band[2].job = null;
      band[3].wasJob = ['wood', 'stone'];
      standDown(cdr, true);
      R.tradeReturns = (band[3].job === 'wood' && band[3].job2 === 'stone') ?
        'they go back to their trades' : 'THE TRADE IS LOST (' + band[3].job + ')';
      giveCommand(cdr, band, 'patrol', { x: cdr.x, y: cdr.y }, 30);

      const start = { x: cdr.x, y: cdr.y };
      let far = 0, visited = [];
      for (let i = 0; i < 40; i++) {
        step(6);
        far = Math.max(far, dist(cdr.x, cdr.y, start.x, start.y));
        visited.push([Math.round(cdr.x), Math.round(cdr.y)]);
      }
      R.theyMarch = far > 8 ? `walked ${far.toFixed(0)} tiles out` : 'NEVER LEFT THE SPOT (' + far.toFixed(1) + ')';
      /* a circuit, not a beeline: the ground covered has to be more than one direction */
      const xs = visited.map(v => v[0]), ys = visited.map(v => v[1]);
      const spanX = Math.max(...xs) - Math.min(...xs), spanY = Math.max(...ys) - Math.min(...ys);
      R.theyCircuit = (spanX > 10 && spanY > 10) ? `covered ${spanX}x${spanY} of ground` :
        'MARCHED IN A LINE (' + spanX + 'x' + spanY + ')';
      /* the band has to be WITH him, not left at the start */
      const spread = Math.max(...band.slice(1).map(o => dist(o.x, o.y, cdr.x, cdr.y)));
      R.bandKeepsUp = spread < 16 ? `band within ${spread.toFixed(0)} of the captain` :
        'BAND LEFT BEHIND (' + spread.toFixed(0) + ')';
      /* The leash. Read the anchor off the order BEFORE stepping — a band that finishes and
         stands down clears `cmd`, and comparing against (0,0) then reports a wander that
         never happened. The first version of this line did exactly that. */
      R.onTheLeash = far < CMD_LEASH ? `never got past ${far.toFixed(0)} of ${CMD_LEASH}` :
        'WANDERED OFF THE LEASH (' + far.toFixed(0) + ')';
      band.forEach(o => { standDown(o, true); o.under = null; chars.splice(chars.indexOf(o), 1); });
    }

    /* ---------------- 2. FORAGE: do they find a chest and open it ---------------- */
    {
      const me = player()[0];
      const at = openNear(me.x - 30, me.y + 18, 8);
      const band = mk5(at);
      const cdr = band[0];
      /* two chests inside the order's ground and one well outside it, so "inside the ground"
         is doing work rather than being a coincidence */
      const c1 = { x: at.x + 9, y: at.y + 5, opened: false, loot: { cats: 100, items: {} } };
      const c2 = { x: at.x - 7, y: at.y - 9, opened: false, loot: { cats: 100, items: {} } };
      const far = { x: at.x + 90, y: at.y, opened: false, loot: { cats: 100, items: {} } };
      chests.push(c1, c2, far);
      giveCommand(cdr, band, 'forage', { x: cdr.x, y: cdr.y }, 22);
      for (let i = 0; i < 60 && !(c1.opened && c2.opened); i++) step(6);
      R.foundTheChests = (c1.opened && c2.opened) ? 'opened both inside the ground'
        : `MISSED A CHEST (${c1.opened ? 1 : 0}/${c2.opened ? 1 : 0})`;
      R.leftTheFarOne = !far.opened ? 'left the one outside the order' : 'WANDERED TO THE FAR CHEST';
      /* and having cleared it, they come home rather than standing in the field */
      for (let i = 0; i < 60 && cdr.cmd; i++) step(6);
      R.cameHome = !cdr.cmd ? 'ground cleared, order closed out' : 'STILL OUT THERE (' + cdr.cmd.phase + ')';
      [c1, c2, far].forEach(ch => chests.splice(chests.indexOf(ch), 1));
      band.forEach(o => { standDown(o, true); o.under = null; chars.splice(chars.indexOf(o), 1); });
    }

    /* ---------------- 3. THE JUDGEMENT: do they break off, and does the captain matter ---- */
    {
      const me = player()[0];
      const grits = {};
      for (const conv of ['ambitious', 'cold', 'compassion']) {
        const at = openNear(me.x + 40, me.y - 34, 8);
        const band = mk5(at, conv);
        const cdr = band[0];
        giveCommand(cdr, band, 'patrol', { x: cdr.x, y: cdr.y }, 26);
        grits[conv] = +grit(cdr).toFixed(3);
        /* Put the band on the floor one at a time and see where he calls it. Breaking off is
           not a state you can read afterwards: home is where the order was given, they are
           standing on it, so they "march home", arrive, and the order CLOSES OUT inside the
           same second. The order going away is the signal, not a phase you can catch. */
        let brokeAt = null;
        for (let k = 1; k < band.length && brokeAt === null; k++) {
          /* Putting somebody down means HURTING them. Setting `state = 'down'` on a body with
             full blood and no wounds does nothing: `updateState` runs every tick and stands an
             uninjured man straight back up, so the band was never actually short-handed and
             the captain was right not to break off. The first version of this probe reported
             the judgement broken when the judgement was the only thing working. */
          band[k].blood = 12;
          band[k].parts.chest.hp = -20;
          band[k].state = 'down';
          for (let t = 0; t < 8 && brokeAt === null; t++) {
            step(1);
            if (!cdr.cmd || cdr.cmd.phase === 'home') brokeAt = k;
          }
        }
        grits[conv + '_broke'] = brokeAt;
        band.forEach(o => { standDown(o, true); o.under = null; chars.splice(chars.indexOf(o), 1); });
      }
      R.gritDiffers = (grits.ambitious < grits.cold && grits.cold < grits.compassion) ?
        `ambition ${grits.ambitious} < cold ${grits.cold} < compassion ${grits.compassion}` :
        'EVERY CAPTAIN IS THE SAME CAPTAIN';
      R.brokeOff = (grits.compassion_broke !== null && grits.ambitious_broke !== null) ?
        `compassion turned at ${grits.compassion_broke} down, ambition at ${grits.ambitious_broke}` :
        'NOBODY EVER BROKE OFF';
      R.softerFirst = (grits.compassion_broke !== null && grits.ambitious_broke !== null &&
        grits.compassion_broke <= grits.ambitious_broke) ?
        'the soft one turns back first' : 'THE HARD ONE TURNED BACK FIRST';
    }

    /* ---------------- 4. A CAPTAIN WHO FALLS ---------------- */
    {
      const me = player()[0];
      const at = openNear(me.x - 40, me.y - 26, 8);
      const band = mk5(at);
      const cdr = band[0];
      giveCommand(cdr, band, 'patrol', { x: cdr.x, y: cdr.y }, 24);
      step(6);
      cdr.state = 'dead';
      step(6);
      R.captainFalls = band.slice(1).every(o => !o.under) ?
        'the band is released when he dies' : 'SOLDIERS STILL FOLLOWING A CORPSE';
      band.forEach(o => { o.under = null; if (chars.includes(o)) chars.splice(chars.indexOf(o), 1); });
    }

    /* ---------------- 5. AN ORDER MUST SURVIVE A SAVE ---------------- */
    {
      const me = player()[0];
      const at = openNear(me.x + 18, me.y - 40, 8);
      const band = mk5(at);
      const cdr = band[0];
      giveCommand(cdr, band, 'patrol', { x: cdr.x, y: cdr.y }, 28);
      step(12);
      const wasId = cdr.id, wasLeg = cdr.cmd.leg;
      restore(JSON.parse(JSON.stringify(snapshot())));
      const back = chars.find(o => o.id === wasId);
      R.orderKept = (back && back.cmd && back.cmd.order === 'patrol' && back.cmd.leg === wasLeg) ?
        'the order rides the save' : 'ORDER LOST BY LOAD';
      const reBand = back ? chars.filter(o => o.under === back.id) : [];
      R.bandKept = reBand.length === 4 ? 'all four still under him' : 'BAND SCATTERED BY LOAD (' + reBand.length + ')';
      /* guardTarget is an object reference and cannot survive a save — the tick has to
         re-point it, or a loaded band stands in a field forever */
      step(4);
      R.bandRebound = reBand.length && reBand.every(o => o.guardTarget === back) ?
        'the tick re-forms them after a load' : 'LOADED BAND FOLLOWS NOBODY';
    }
    return R;
  });

  console.log('=== COMMANDERS ===\n');
  for (const [k, v] of Object.entries(out)) console.log('  ' + k.padEnd(17) + v);
  const bad = Object.values(out).map(String).filter(v => /[A-Z]{3,}\s+[A-Z]{2,}|NEVER|MISSED|LOST/.test(v));
  console.log('\n' + (bad.length ? '*** NOT WIRED: ' + bad.join(' | ') + ' ***' : 'THE BANDS GO OUT AND COME BACK'));
  if (errs.length) { console.log('errs:', errs.length); errs.slice(0, 4).forEach(e => console.log('  ' + e)); }
  await b.close();
  if (bad.length) process.exitCode = 1;
})();
