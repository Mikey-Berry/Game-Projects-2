#!/usr/bin/env node
/* THE ORDER, THE COIL, AND THE YARD — the three things in this world that are not a town and
 * not your problem, and which between them did almost nothing.
 *
 * "Neutral factions should be expanded a bit. For example, Paladins should drag off citizens
 * suspected of performing necromancy. The five ouroboros cult members selected at world start
 * should be added to — five is way too few... neutral faction bases should be bigger. The
 * Paladin Bastion needs to be expanded to include a bigger jail... Perhaps they capture and
 * execute heretics at a set schedule (a week after capture or something) — creating an
 * interesting opportunity to possibly escape. They can also execute by putting them on a pole
 * and lighting it on fire, leaving it as a warning sign (and permanently altering the world).
 * The merc guild should also have a bigger base and essentially operate as a small city."
 *
 * The Order hunted the player on `purgeWrath` and did nothing else — a faction whose whole
 * premise is that it burns people for the gift had never once taken anybody. So the weight
 * here is on the SEQUENCE, because every step of it can be true while the one after it is
 * not: seized, held, held for a WEEK (the window is the feature), burned on the day, and a
 * stake left standing afterwards that survives a save. A permanent alteration that does not
 * round-trip is a session decoration.
 *
 *   node tools/purge.js [game.html]
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

    /* Every block below is fenced. A harness that throws on the build BEFORE the feature
       exists cannot be A/B'd — the run dies at the first missing name and the other seven
       claims never report, so you cannot tell which of them the change actually moved. A
       ReferenceError is a legitimate finding here and it is recorded as one. */
    const guard = (keys, fn) => {
      try { fn(); } catch (e) {
        for (const k of keys) if (R[k] === undefined) R[k] = '!! ' + String(e.message).slice(0, 80).toUpperCase();
      }
    };

    /* ---------- 1. THE BASTION IS A FORTRESS AND IT HAS A GAOL ---------- */
    if (typeof bastion === 'undefined' || !bastion) { R.thereIsABastion = '!! THERE IS NO BASTION'; return R; }
    guard(['thereIsABastion', 'andItHasSomewhereToPutPeople'], () => {
      const cellsHere = cells.filter(c => c.kind === 'purge');
      const order = chars.filter(c => c.faction === 'purge' && c.state !== 'dead');
      const halls = buildings.filter(b2 => !b2.town && dist(b2.x, b2.y, bastion.x, bastion.y) < 20);
      R.thereIsABastion = `${bastion.walls.length} of wall, ${halls.length} halls, ${order.length} of the Order, ${cellsHere.length} cells`;
      R.andItHasSomewhereToPutPeople = (cellsHere.length >= 4 && bastion.walls.length > 70 && order.length >= 15)
        ? `and it is a fortress rather than a waypoint — ${cellsHere.length} cells and ${order.length} of them inside it`
        : `!! ${cellsHere.length} CELLS, ${bastion.walls.length} WALL, ${order.length} PALADINS`;
    });

    /* ---------- 2. THEY TAKE SOMEBODY ----------
       And never one of yours. A system that could quietly delete a squad member into a cell
       on the far side of the map is a different feature from the one that was asked for. */
    let held = null;
    guard(['theyTakeSomebody', 'andNeverOneOfYours'], () => {
      const t = towns.find(t2 => !t2.def.undeadFriendly && !t2.sacked);
      held = seizeSuspect(t);
      R.theyTakeSomebody = (held && held.jailedAt && held.jailedAt.kind === 'purge')
        ? `${held.name} of ${t.name} is in a Bastion cell`
        : '!! NOBODY WAS TAKEN';
      R.andNeverOneOfYours = (() => {
        /* COUNT THE DRAWS THAT LANDED. A pool that is empty for an unrelated reason returns
           null forty times and this reads as forty clean draws — the exact shape of the bug
           that hid here for a whole run, where `!c.isLeader` tested a sentinel of -1 and
           emptied the pool. A green needs the draws to have happened. */
        let tries = 0, drew = 0;
        for (let i = 0; i < 40; i++) { const s2 = suspectNear(t); if (s2) drew++; if (s2 && s2.faction === 'player') tries++; }
        if (drew < 35) return `!! ONLY ${drew}/40 DRAWS FOUND ANYBODY AT ALL`;
        return tries === 0 ? `and ${drew} draws never once landed on one of your own`
                           : `!! ${tries}/40 SUSPECTS WERE PLAYER UNITS`;
      })();
    });

    /* Three, four and five are the SEQUENCE and only make sense on a body that was actually
       taken; six, seven and eight are not, so they are not gated behind it. A build that
       cannot seize anybody should still report on the yard and the cult. */
    if (held) guard(['andTheyHaveAWeek', 'andNothingHappensUntilTheDay', 'andThenTheyBurn', 'andTheStakeHasANameOnIt'], () => {
      const due = held.burnDay;
      R.andTheyHaveAWeek = (due - day) >= 6
        ? `and the fire is ${due - day} days off, which is time to hear about it and cross the map`
        : `!! THEY BURN IN ${due - day} DAY(S)`;
      let burnedEarly = 0;
      for (let d = 0; d < 6; d++) { day++; questionTick(); if (held.state === 'dead') burnedEarly++; }
      R.andNothingHappensUntilTheDay = burnedEarly === 0
        ? 'and six days of the Order going about its business did not touch them'
        : '!! THEY WERE BURNED BEFORE THE DAY';
      const pyres0 = pyres.length;
      day = due; questionTick();
      R.andThenTheyBurn = (held.state === 'dead' && pyres.length === pyres0 + 1)
        ? `and on the day they burn, and the world is one stake heavier (${pyres.length})`
        : `!! ON THE DAY: state ${held.state}, pyres ${pyres0} → ${pyres.length}`;
      R.andTheStakeHasANameOnIt = pyres.length && pyres[pyres.length - 1].name === held.name
        ? `and the pole at the gate is ${pyres[pyres.length - 1].name}'s`
        : '!! THE STAKE IS ANONYMOUS';
    });

    /* ---------- 4. AND IT IS STILL THERE AFTER A SAVE ----------
       "permanently altering the world" — a permanence that does not round-trip is a session
       decoration, and this is the only assertion in the file that can tell the difference. */
    if (held) guard(['andItSurvivesASave'], () => {
      const before = pyres.length, nm = pyres[pyres.length - 1].name;
      restore(JSON.parse(JSON.stringify(snapshot())));
      R.andItSurvivesASave = (pyres.length === before && pyres.some(q => q.name === nm))
        ? `and all ${pyres.length} of them come back off a save, names and all`
        : `!! ${before} STAKES WENT IN AND ${pyres.length} CAME BACK`;
    });

    /* ---------- 5. AND GETTING THEM OUT ACTUALLY STOPS IT ----------
       The escape has to be worth making. If the burning fires on a body nobody is holding any
       more, the window is decorative. */
    guard(['andAnEscapeEndsIt'], () => {
      const t = towns.find(t2 => !t2.def.undeadFriendly && !t2.sacked);
      const v = seizeSuspect(t);
      if (!v) R.andAnEscapeEndsIt = '!! COULD NOT STAGE A SECOND SEIZURE';
      else {
        const due = v.burnDay;
        v.jailedAt.holds = 0; v.jailedAt = null;      /* exactly what walking them out does */
        day = due + 2;
        const n0 = pyres.length;
        questionTick();
        R.andAnEscapeEndsIt = (v.state !== 'dead' && pyres.length === n0 && !v.heretic)
          ? 'and somebody walked out of the cell before the day is somebody the fire never gets'
          : `!! THEY BURNED ANYWAY (state ${v.state}, pyres ${n0} → ${pyres.length})`;
      }
    });

    /* ---------- 6. AND SOMETHING MOVES INTO THE YARD ----------
       Reported: "I don't see the Messengers hanging around with the Paladins... only on day
       40." Both halves are asserted: not before day 45, and reliably after it — the old path
       was a 22% roll on a HUNT, which needs purgeWrath to reach 9 and resets it, so the true
       rate was one sighting every forty-odd days on a column you had to intercept. */
    guard(['andSomethingMovesIntoTheYard'], () => {
      day = 30;
      for (let i = 0; i < 60; i++) bastionGuestTick();
      const early = chars.filter(c => c.bastionGuest && c.state !== 'dead').length;
      day = 60;
      let after = 0;
      for (let i = 0; i < 200 && !after; i++) { bastionGuestTick(); after = chars.filter(c => c.bastionGuest && c.state !== 'dead').length; }
      const guest = chars.find(c => c.bastionGuest);
      R.andSomethingMovesIntoTheYard = (early === 0 && after === 1 && guest && guest.faction === 'purge' &&
                                        dist(guest.x, guest.y, bastion.x, bastion.y) < 14)
        ? 'and after day 45 a Watcher takes up residence in the Bastion yard — a place you can go and look at'
        : `!! GUESTS: ${early} before day 45, ${after} after (faction ${guest && guest.faction})`;
    });

    /* ---------- 7. THE COIL IS A CULT AND NOT FIVE PEOPLE ---------- */
    guard(['theCoilIsACult', 'andItRecruits'], () => {
      const members = chars.filter(c => c.coil && c.state !== 'dead');
      const spread = new Set(members.map(c => c.homeTown && c.homeTown.name)).size;
      const speakers = members.filter(c => c.coilSpeaker).length;
      R.theCoilIsACult = (members.length >= 15 && spread >= 4 && speakers >= 4)
        ? `${members.length} of them across ${spread} towns, ${speakers} of them speaking for a cell`
        : `!! ${members.length} CULTISTS ACROSS ${spread} TOWNS (${speakers} speakers)`;
      /* and the number can move, which is why five was never going to be enough on its own */
      const n0 = members.length;
      for (let d = 0; d < 40; d++) { day++; coilTick(); }
      R.andItRecruits = chars.filter(c => c.coil && c.state !== 'dead').length > n0
        ? `and forty days of quiet talking took it from ${n0} to ${chars.filter(c => c.coil && c.state !== 'dead').length}`
        : `!! IT DID NOT GROW IN FORTY DAYS (${n0})`;
    });

    /* ---------- 8. AND THE YARD IS A PLACE PEOPLE LIVE ----------
       "since right now they just have a bunch of dudes sitting around doing nothing" — so the
       test is not the wall, it is whether anybody in there has anything to do. */
    guard(['theYardIsASmallCity', 'andItsHandsHaveABench'], () => {
      if (!guild) { R.theYardIsASmallCity = '!! THERE IS NO GUILD'; return; }
      const halls = buildings.filter(b2 => !b2.town && dist(b2.x, b2.y, guild.x, guild.y) < 20);
      const folk = chars.filter(c => c.faction === 'guild' && c.state !== 'dead');
      const hands = folk.filter(c => c.trade);
      const posted = hands.filter(c => typeof tradePost === 'function' && tradePost(c, c.homeTown || null));
      R.theYardIsASmallCity = (halls.length >= 5 && folk.length >= 25 && hands.length >= 5)
        ? `${halls.length} halls, ${folk.length} on the books, ${hands.length} of them holding a trade`
        : `!! ${halls.length} HALLS, ${folk.length} PEOPLE, ${hands.length} TRADES`;
      R.andItsHandsHaveABench = hands.length >= 5 && posted.length >= Math.ceil(hands.length * 0.6)
        ? `and ${posted.length} of ${hands.length} have a bench to stand at — the same work the towns do`
        : `!! ONLY ${posted.length}/${hands.length} OF THE GUILD'S HANDS HAVE ANYWHERE TO WORK`;
    });

    return R;
  });

  const bad = Object.values(out).filter(v => typeof v === 'string' && v.startsWith('!!'));
  for (const [k, v] of Object.entries(out)) console.log('  ' + k.padEnd(32) + v);
  for (const e of errs) console.log('  ' + e);
  console.log('');
  console.log(bad.length || errs.length
    ? `THE NEUTRALS ARE STILL SCENERY (${bad.length + errs.length})`
    : 'THE ORDER TAKES PEOPLE, AND THE STAKES STAY UP');
  await b.close();
  process.exit(bad.length || errs.length ? 1 : 0);
})();
