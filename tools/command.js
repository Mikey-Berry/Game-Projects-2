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
  /* ---------- PAUSE IN THE SAME EVALUATE AS THE CLICK ----------
     This file already carries two notes explaining that its forage block was flaky because
     "the harness starts the world and then waits in REAL time before touching it, so a loaded
     machine has burned a different number of `rnd()` calls before the band is even made", and
     both times the answer was to widen the step budget — 60, then 240. It went red again at
     240 on a full-suite run, at 0/0, on a box running about 1.6x slower than the one the
     budget was tuned on. Widening a budget does not remove a variable; it moves the threshold.
     The variable is the 2500ms of live frames, and `paused` only gates the RAF loop's own
     `update` — a direct `update(dt)` still runs — so this harness, which drives every tick
     itself through `step()`, loses nothing by freezing the world it never wanted running. */
  await p.evaluate(() => { document.getElementById('btn-start').click(); paused = true; });
  await p.waitForTimeout(2500);

  const out = await p.evaluate(() => {
    const R = {};
    const step = (secs, dt = 0.25) => { for (let i = 0; i < secs / dt; i++) update(dt); };
    const openNear = (x, y, r) => findOpenNear(x, y, r);

    /* Where to stage the test bands. Captured ONCE, off the player's own body, because a
       later block fast-forwards a week of game time and everybody in the world — including
       that body — starves in it. Re-reading `player()[0]` after that throws. */
    const HOME = { x: player()[0].x, y: player()[0].y };

    /* Tearing a test band down. `chars.splice(chars.indexOf(o), 1)` looks obviously right and
       is a trap: on a body that is no longer in `chars` the index is -1, splice(-1, 1) removes
       the LAST element instead, and five of those in a row quietly deleted the player's own
       character — which is why the two blocks after this one threw on `player()[0].x`. */
    const disband = (band) => {
      band.forEach(o => {
        standDown(o, true);
        o.under = null;
        const i = chars.indexOf(o);
        if (i >= 0) chars.splice(i, 1);
      });
    };

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
      const at = openNear(HOME.x + 26, HOME.y + 26, 8);
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
      disband(band);
    }

    /* ---------------- 2. FORAGE: do they find a chest and open it ---------------- */
    {
      const at = openNear(HOME.x - 30, HOME.y + 18, 8);
      const band = mk5(at);
      const cdr = band[0];
      /* two chests inside the order's ground and one well outside it, so "inside the ground"
         is doing work rather than being a coincidence */
      /* ON OPEN GROUND, like everything else this harness places. The chests used to go down
         at raw offsets from the band's spot, and a raw offset in this world lands inside a
         boulder often enough to matter: the band would sweep its ground, fail to reach the
         one chest standing in a rock, decide the ground was clear and come home. Three runs
         of an identical build reported "missed a chest" twice and "opened both" once, and
         nothing was wrong with the forage order at all. The same mistake put companions
         inside walls at character creation earlier in this project. */
      const cp = (dx, dy) => { const q = openNear(at.x + dx, at.y + dy, 4); return { x: q.x, y: q.y, opened: false, loot: { cats: 100, items: {} } }; };
      const c1 = cp(9, 5), c2 = cp(-7, -9), far = cp(90, 0);
      chests.push(c1, c2, far);
      giveCommand(cdr, band, 'forage', { x: cdr.x, y: cdr.y }, 22);
      /* GENEROUS, ON PURPOSE. This block was flaky at 60 steps and the flake was not in the
         feature: worldgen is seeded, but the harness starts the world and then waits in REAL
         time before touching it, so a loaded machine has burned a different number of `rnd()`
         calls before the band is even made. The band then walks a different route to the same
         two chests. Two runs of the identical build gave "opened both" and "missed one". The
         question is whether a forage order sweeps its ground, not whether it does so within a
         step budget that happens to suit an unloaded machine — so it gets four times the room
         and the assertion means what it says again. */
      let sweeps = 0;
      for (; sweeps < 240 && !(c1.opened && c2.opened); sweeps++) step(6);
      /* AND SAY WHY, IF NOT. `MISSED A CHEST (0/0)` names the symptom and nothing else — it
         cannot tell a band that swept the wrong ground from one that never got the order. */
      const nearest = (ch) => Math.min(...band.map(u => dist(u.x, u.y, ch.x, ch.y))).toFixed(1);
      R.foundTheChests = (c1.opened && c2.opened) ? `opened both inside the ground, in ${sweeps} sweeps`
        : `MISSED A CHEST (${c1.opened ? 1 : 0}/${c2.opened ? 1 : 0}) — closest approach ${nearest(c1)} and ${nearest(c2)} tiles, order ${cdr.cmd ? cdr.cmd.phase : 'CLOSED OUT'}`;
      R.leftTheFarOne = !far.opened ? 'left the one outside the order' : 'WANDERED TO THE FAR CHEST';
      /* and having cleared it, they come home rather than standing in the field */
      for (let i = 0; i < 200 && cdr.cmd; i++) step(6);
      R.cameHome = !cdr.cmd ? 'ground cleared, order closed out' : 'STILL OUT THERE (' + cdr.cmd.phase + ')';
      [c1, c2, far].forEach(ch => chests.splice(chests.indexOf(ch), 1));
      disband(band);
    }

    /* ---------------- 3. THE JUDGEMENT: do they break off, and does the captain matter ---- */
    {
      const grits = {};
      for (const conv of ['ambitious', 'cold', 'compassion']) {
        const at = openNear(HOME.x + 40, HOME.y - 34, 8);
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
        disband(band);
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
      const at = openNear(HOME.x - 40, HOME.y - 26, 8);
      const band = mk5(at);
      const cdr = band[0];
      giveCommand(cdr, band, 'patrol', { x: cdr.x, y: cdr.y }, 24);
      step(6);
      cdr.state = 'dead';
      step(6);
      R.captainFalls = band.slice(1).every(o => !o.under) ?
        'the band is released when he dies' : 'SOLDIERS STILL FOLLOWING A CORPSE';
      disband(band);
    }

    /* ---------------- 5. AN ORDER MUST SURVIVE A SAVE ---------------- */
    {
      const at = openNear(HOME.x + 18, HOME.y - 40, 8);
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
    /* ---------------- 6. A DUTY, NOT AN ERRAND: tours across days ---------------- */
    try {
      const at = openNear(HOME.x - 18, HOME.y + 44, 8);
      const band = mk5(at);
      const cdr = band[0];
      giveCommand(cdr, band, 'patrol', { x: cdr.x, y: cdr.y }, 20);
      R.patrolIsDuty = cdr.cmd.standing ? 'a patrol is a standing duty' : 'PATROL CLOSES OUT LIKE AN ERRAND';
      cdr.cmd.nightIn = false;                 /* let the clock run without the curfew */
      let sawRest = false, tours = 0;
      for (let i = 0; i < 220 && cdr.cmd; i++) {
        step(6);
        /* a week of fast-forward starves everybody; this block is about the duty, and the
           captain dying of anything is already covered above */
        for (const o of band) { o.hunger = 100; }
        if (cdr.cmd && cdr.cmd.phase === 'rest') sawRest = true;
        if (cdr.cmd) tours = Math.max(tours, cdr.cmd.tours);
      }
      R.theyRest = sawRest ? 'they stand to at home between tours' : 'NEVER STOOD DOWN TO REST';
      R.theyGoAgain = tours >= 2 ? `walked ${tours} tours unasked` : 'ONLY EVER WENT OUT ONCE (' + tours + ')';
      R.stillPosted = cdr.cmd ? 'still on the books after ' + tours + ' tours'
        : cdr.state === 'dead' ? `the captain died on tour ${tours} — released, not lost`
        : 'THE DUTY CLOSED ITSELF OUT AFTER ' + tours;
      /* the curfew: with `nightIn` set they must not begin a tour after dark */
      if (cdr.cmd) {
        cdr.cmd.nightIn = true; cdr.cmd.phase = 'rest'; cdr.cmd.restUntil = 0;
        const wasHour = hour; hour = 22;
        step(12);
        R.curfew = (cdr.cmd && cdr.cmd.phase === 'rest') ? 'they will not begin a tour in the dark'
          : 'MARCHED OUT AT NIGHT ANYWAY';
        hour = wasHour;
      }
      disband(band);
    } catch(e){ R.dutyBlock = 'THREW: ' + e.message; }
    /* ---------------- 7. WHAT IS IN THE BAND ---------------- */
    try {
      const at = openNear(HOME.x + 52, HOME.y + 10, 8);

      /* a surgeon lets the captain press further, and patches people up in the field */
      const band = mk5(at);
      const cdr = band[0];
      /* Bind the band FIRST. `medicOf` walks `bandOf`, which is "everyone whose `under` is
         this captain" — before the order is given that set is empty, so the first version of
         this measured a captain standing alone and reported the surgeon doing nothing. */
      giveCommand(cdr, band, 'patrol', { x: cdr.x, y: cdr.y }, 18);
      const bare = +grit(cdr).toFixed(3);
      band[1].stats.medic = 30;
      const withDoc = +grit(cdr).toFixed(3);
      R.surgeonCounts = withDoc < bare ? `a surgeon presses on: ${bare} -> ${withDoc}` :
        'THE SURGEON CHANGES NOTHING (' + bare + ')';
      R.surgeonFound = medicOf(cdr) === band[1] ? 'the best hand is picked' : 'NO SURGEON FOUND';
      /* wound somebody enough to be worth treating, then see if she goes to work */
      band[2].parts['l.arm'].hp = 40; band[2].parts['l.arm'].bleed = 1.2; band[2].blood = 62;
      let treated = false;
      for (let i = 0; i < 30 && !treated; i++) { step(2); if (band[1].healTarget === band[2]) treated = true; }
      R.fieldSurgery = treated ? 'she goes to work in the field' : 'NOBODY EVER TREATED ANYBODY';
      const before = band[2].parts['l.arm'].bleed;
      for (let i = 0; i < 40; i++) step(3);
      R.woundCloses = band[2].parts['l.arm'].bleed < before ? 'the bleed is stopped out there' :
        'THE WOUND NEVER CLOSED';
      disband(band);

      /* a mule means the sweep can go on longer before it has to come in */
      const b2 = mk5(openNear(HOME.x + 52, HOME.y - 12, 8));
      const c2 = b2[0];
      const noMule = haulCap(c2);
      b2[1].mule = true; b2[1].beast = true;
      giveCommand(c2, b2, 'forage', { x: c2.x, y: c2.y }, 20);
      R.muleCarries = haulCap(c2) > noMule ? `a mule takes the load from ${noMule} to ${haulCap(c2)}` :
        'THE MULE CARRIES NOTHING';
      disband(b2);
    } catch(e){ R.bandBlock = 'THREW: ' + e.message; }
    /* ---------------- 8. THEY REPORT WHAT THEY SEE ---------------- */
    try {
      const at = openNear(HOME.x - 52, HOME.y - 8, 8);
      const band = mk5(at);
      const cdr = band[0];
      giveCommand(cdr, band, 'patrol', { x: cdr.x, y: cdr.y }, 16);
      /* put a body of bandits in front of them and listen */
      const foes = [];
      for (let i = 0; i < 7; i++) {
        const q = openNear(cdr.x + 9 + (i % 3), cdr.y + 8 + Math.floor(i / 3), 3);
        const f = makeChar('Raider', 'bandit', q.x, q.y, { atk: 8, def: 8, tough: 8, ath: 5 });
        chars.push(f); foes.push(f);
      }
      const beforeEv = events.length;
      const lines = [];
      const realLog = window.log;
      window.log = (t, k) => { lines.push(String(t)); realLog(t, k); };
      for (let i = 0; i < 14; i++) step(1);
      window.log = realLog;
      const call = lines.find(l => /sends word/.test(l));
      R.theyReport = call ? call.replace(/^.*sends word: /, '') : 'NO CONTACT REPORT';
      R.reportCounts = call && /\d+ of them/.test(call) ? 'with a count' : 'NO COUNT IN THE CALL';
      R.reportBearing = call && /(north|south|east|west|waste)/.test(call) ? 'and a bearing' : 'NO BEARING IN THE CALL';
      R.reportIsNews = events.length > beforeEv && events.some(e => e.kind === 'contact') ?
        'it reaches the world news' : 'THE CALL NEVER LEFT THE LOG';
      /* and it must not repeat itself every tick at the same lot of them */
      const lines2 = [];
      window.log = (t, k) => { lines2.push(String(t)); realLog(t, k); };
      for (let i = 0; i < 6; i++) step(1);
      window.log = realLog;
      R.reportThrottled = lines2.filter(l => /sends word/.test(l)).length <= 1 ?
        'one call per contact, not one per tick' : 'THE BAND WILL NOT STOP TALKING';
      foes.forEach(f => { const i = chars.indexOf(f); if (i >= 0) chars.splice(i, 1); });
      disband(band);
    } catch(e){ R.reportBlock = 'THREW: ' + e.message; }
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
