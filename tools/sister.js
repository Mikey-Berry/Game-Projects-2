#!/usr/bin/env node
/* SHE IS FOUND, AND THEN WHAT?
 *
 * "After going through everything to find Lyre — asking around three towns, walking out to the
 *  corpse-field, finding the cairn, tracking down a scholar, walking out AGAIN — she doesn't
 *  even join the party?"
 *
 * MEASURED ON THE BUILD THAT SHIPPED THE COMPLAINT: the whole three-leg search resolves, she
 * spawns, she is not hostile, she says one line that reads the world correctly — and then
 * `talkTo` sets `questDone = true` and returns. She stands in that field for the rest of the
 * run. Eleven years, three towns, two crossings of the waste, and the payoff is a bark.
 *
 * So this file asserts the SHAPE of a relationship, not the existence of a flag:
 *
 *   · she joins on the spot, as a full member, with LOW regard — an ally who has not decided
 *     about you is a different thing from an ally, and the number has to say so;
 *   · the arc actually moves. Beats fire on what the player DOES, one at a time, spaced;
 *   · both ends are reachable. Play it her way and she commits and hands over the closing;
 *     play it against her and she warns you once, then goes — and going is not `departSquad`
 *     dropping her into the drifter pool, it is her walking back out to the fields;
 *   · and having gone, she can be talked back — once. The second time is the last time.
 *   · all of it survives a save, because an eleven-year search that resets on reload is worse
 *     than one that never paid off.
 *
 *   node tools/sister.js [game.html]
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
  await p.waitForSelector('#btn-start', { state: 'attached', timeout: 60000 });
  /* PAUSE IN THE SAME EVALUATE AS THE CLICK. A warm-up spent unpaused runs hundreds of live
     frames through the same rnd() stream every assertion below is standing on. */
  await p.evaluate(() => { document.getElementById('btn-start').click(); paused = true; });
  await p.waitForTimeout(2600);

  const out = await p.evaluate(() => {
    const R = {};
    paused = true;
    const guard = (keys, fn) => {
      try { fn(); } catch (e) { for (const k of keys) if (R[k] === undefined) R[k] = '!! ' + String(e.message).slice(0, 100).toUpperCase(); }
    };

    /* ---------- 0. GET TO HER ----------
       Three legs, walked the way origin.js walks them. Nothing here is under test; it is the
       staging, and if it breaks, origin.js is the file that says so. */
    let him = null, her = null;
    guard(['sheIsFound'], () => {
      him = applyCreation('human', 'dark', 'lyonart');
      for (const t of towns.slice(0, 4)) askAfterLyre(t, t.leader);
      const site = corpseSites[search.siteId];
      him.x = site.x; him.y = site.y;
      for (let i = 0; i < 20 && !search.cairn; i++) lyreTick(4);
      const sc = makeChar('Ledger Scholar', 'town', him.x + 2, him.y, { magic: 30 });
      sc.scholar = true; sc.neutral = true; chars.push(sc);
      tellScholarOfTheCairn(sc);
      const site2 = corpseSites[search.siteId2 >= 0 ? search.siteId2 : search.siteId];
      him.x = site2.x; him.y = site2.y;
      for (let i = 0; i < 40 && !search.met; i++) lyreTick(4);
      her = chars.find(c => c.bossKey === 'lyre');
      R.sheIsFound = her ? `${her.name}, standing in the field` : '!! THE SEARCH DID NOT PRODUCE HER';
    });

    /* ---------- 1. SHE JOINS ----------
       The complaint, stated as a number. `talkTo` is the only door the player has — there is
       no ctx-menu recruit branch for a bossKey, and `recruitWanderer` wants a `wanderKey` she
       does not carry. So whatever joining her means, it has to happen on the far side of one
       conversation. */
    guard(['sheJoins', 'andSheIsAFullMember', 'butSheHasNotDecided'], () => {
      talkTo(her);
      R.sheJoins = her.faction === 'player'
        ? 'one conversation and she is with you'
        : `!! AFTER TALKING TO HER SHE IS STILL faction='${her.faction}' — SHE NEVER JOINS`;
      const inSquad = player().includes(her);
      R.andSheIsAFullMember = (inSquad && !her.neutral && her.state === 'ok' && !her.settler)
        ? `a full member — ${player().length} of them now`
        : `!! IN player(): ${inSquad}, neutral: ${her.neutral}, state: ${her.state}`;
      /* LOW, AND ON THE RIGHT SIDE OF THE EXIT. She has to read as unconvinced in the panel
         (STRAINED, not blank) without being one bad day from walking out at -60. */
      const v = her.regard || 0;
      R.butSheHasNotDecided = (v <= -10 && v > -50 && regardBand(v).key === 'strained')
        ? `at ${v} she reads ${regardBand(v).label} — with you, not decided about you`
        : `!! JOINS AT REGARD ${v} (${regardBand(v).label}) — WANTED A LOW, STRAINED NUMBER`;
    });

    /* ---------- 2. AND TALKING TO HER AGAIN DOES NOT RE-RECRUIT HER ----------
       Every join path in this file is one conversation, and a second conversation with a
       member of your own squad must not reset the number the arc is standing on. */
    guard(['andJoiningIsOnce'], () => {
      her.regard = 12;
      talkTo(her);
      R.andJoiningIsOnce = Math.abs((her.regard || 0) - 12) < 0.001
        ? 'and talking to her again is a conversation, not a second recruitment'
        : `!! A SECOND TALK RESET HER REGARD TO ${her.regard}`;
      her.regard = -25;
    });

    /* ---------- 3. THE ARC MOVES, AND IT MOVES ON WHAT YOU DID ----------
       A "loyalty arc" that is a decaying counter is a timer. Each beat has to be answerable
       to a fact about the world: she has watched a tear close, or she has watched you raise
       ten more of the dead, or there is a town that bars its doors when it hears your name. */
    guard(['theArcHasBeats', 'andTheyFireOnWhatYouDid', 'andOneAtATime'], () => {
      R.theArcHasBeats = (typeof sisterArc === 'object' && Array.isArray(SISTER_BEATS) && SISTER_BEATS.length >= 5)
        ? `${SISTER_BEATS.length} beats, keyed and gated`
        : '!! THERE IS NO ARC — NO sisterArc / SISTER_BEATS';
      /* the terms: one day in, she says what this is. Nothing else is true yet. */
      const before = Object.keys(sisterArc.said).length;
      day += 2; sisterTick();
      R.andTheyFireOnWhatYouDid = (Object.keys(sisterArc.said).length > before && sisterArc.said.terms)
        ? `a day in she sets the terms: "${(her.bubble && her.bubble.text || '').slice(0, 44)}..."`
        : '!! TWO DAYS IN THE SQUAD AND SHE HAS SAID NOTHING';
      /* and the rest do not all fall out at once */
      const n1 = Object.keys(sisterArc.said).length;
      day += 1; sisterTick(); sisterTick(); sisterTick();
      R.andOneAtATime = Object.keys(sisterArc.said).length <= n1 + 1
        ? 'and they come one at a time, not as a wall of text'
        : `!! ${Object.keys(sisterArc.said).length - n1} BEATS IN ONE DAY`;
    });

    /* ---------- 4. THE WORK MOVES HER ----------
       She has spent eleven years closing tears by hand. Closing one where she can see it is
       the single most direct statement anyone in this game can make to her, and it must be
       worth more than a conversation. */
    guard(['closingATearCounts'], () => {
      const v0 = her.regard || 0;
      const r = openRift(him.x + 4, him.y);
      her.x = r.x + 1; her.y = r.y;
      closeRift(r, him);
      for (let i = 0; i < 4; i++) { day += 3; sisterTick(); }
      R.closingATearCounts = (her.regard || 0) > v0 + 3
        ? `she watches a tear close and goes ${v0.toFixed(0)} → ${(her.regard || 0).toFixed(0)}`
        : `!! A SEALED TEAR MOVED HER ${v0.toFixed(0)} → ${(her.regard || 0).toFixed(0)}`;
    });

    /* ---------- 5. THE OTHER END: SHE WARNS YOU ONCE ----------
       Somebody who walks out with no warning is a bug report. The arc has to have a rung the
       player can read and act on before the last one. */
    guard(['sheWarnsYouFirst', 'andThenSheGoes', 'andGoingIsNotDrifting'], () => {
      her.regard = -48;
      for (let i = 0; i < 6 && !sisterArc.warned; i++) { day += 3; sisterTick(); }
      R.sheWarnsYouFirst = sisterArc.warned
        ? `at ${her.regard} she names the condition: "${(her.bubble && her.bubble.text || '').slice(0, 44)}..."`
        : '!! SHE NEVER WARNS — SHE JUST GOES';
      /* and past it, she goes. `regardTick` rolls 25% a day for an ordinary mercenary; she is
         the sister, and the arc is what decides, so this asks for a deterministic exit. */
      her.regard = -70;
      let gone = false;
      for (let i = 0; i < 30 && !gone; i++) { day += 1; sisterTick(); regardTick(); gone = her.faction !== 'player'; }
      R.andThenSheGoes = gone
        ? `pushed past ${-60} she leaves, on day ${day}`
        : '!! THIRTY DAYS AT REGARD -70 AND SHE IS STILL TAKING ORDERS';
      /* SHE IS NOT A MERCENARY. departSquad turns a leaver into a drifter who wanders the
         roads with everybody else's leavers. She goes back to the corpse-fields and the work,
         which is where she was for eleven years and the only place she was ever going. */
      R.andGoingIsNotDrifting = (her.faction === 'exile' && her.neutral && sisterArc.left)
        ? `she goes back to the fields as an exile, not into the drifter pool`
        : `!! SHE LEFT AS faction='${her.faction}' neutral=${her.neutral} — THAT IS THE MERCENARY EXIT`;
    });

    /* ---------- 6. AND SHE CAN BE TALKED BACK — ONCE ---------- */
    guard(['sheCanBeTalkedBack', 'butRefusesIfNothingChanged', 'andTheSecondTimeIsTheLast'], () => {
      him.lich = true;
      talkTo(her);
      R.butRefusesIfNothingChanged = her.faction !== 'player'
        ? 'a lich asking her to come back gets the answer a lich deserves'
        : '!! SHE WALKED BACK INTO THE SQUAD OF THE MAN SHE JUST LEFT';
      him.lich = false;
      for (const t of towns) { t.rep = 20; t.bounty = 0; }
      noticeTier = 0;
      talkTo(her);
      R.sheCanBeTalkedBack = (her.faction === 'player' && sisterArc.returns === 1)
        ? `put right, she comes back — once, at ${(her.regard || 0).toFixed(0)}`
        : `!! faction='${her.faction}' returns=${sisterArc.returns} — SHE CANNOT BE TALKED BACK`;
      her.regard = -70;
      let gone = false;
      for (let i = 0; i < 30 && !gone; i++) { day += 1; sisterTick(); regardTick(); gone = her.faction !== 'player'; }
      talkTo(her);
      R.andTheSecondTimeIsTheLast = (her.faction !== 'player' && sisterArc.done === 'gone')
        ? 'and the second leaving is the last one — she does not come back twice'
        : `!! SHE CAME BACK A SECOND TIME (faction='${her.faction}', done='${sisterArc.done}')`;
    });

    /* ---------- 7. THE OTHER ENDING ----------
       Reached from a clean run: she commits, stops needing to be paid, and hands over the one
       thing she has that he does not — how to close a tear for a fraction of what it costs
       him. A commitment with no consequence is a log line. */
    guard(['orSheCommits', 'andCommittingIsWorthSomething'], () => {
      sisterArc.done = ''; sisterArc.left = 0; sisterArc.returns = 0;
      her.faction = 'player'; her.neutral = false; her.leaving = null;
      her.regard = 72;
      const cost0 = riftSealCost();
      for (let i = 0; i < 8 && !sisterArc.committed; i++) { day += 3; sisterTick(); }
      R.orSheCommits = (sisterArc.committed && her.devoted !== false)
        ? `played her way she throws in: "${(her.bubble && her.bubble.text || '').slice(0, 44)}..."`
        : '!! THERE IS NO COMMITTING END — SHE TOPS OUT AS AN ORDINARY DEVOTED MERCENARY';
      const cost1 = riftSealCost();
      const cheaper = Object.keys(cost0).some(k => (cost1[k] || 0) < cost0[k]);
      R.andCommittingIsWorthSomething = cheaper
        ? `and she teaches the closing: ${costText(cost0)} becomes ${costText(cost1)}`
        : `!! CLOSING A TEAR STILL COSTS ${costText(cost1)} — THE COMMITMENT BUYS NOTHING`;
    });

    /* ---------- 8. AND ALL OF IT RIDES THE SAVE ----------
       The search already survives a reload. An arc that does not is the same bug one layer up:
       she is in the squad after the load with no memory of how she got there. */
    guard(['theArcSurvivesTheSave'], () => {
      const snap = JSON.parse(JSON.stringify(snapshot()));
      const want = { committed: sisterArc.committed, said: Object.keys(sisterArc.said).length, returns: sisterArc.returns };
      restore(snap);
      const back = chars.find(c => c.bossKey === 'lyre');
      const ok = back && back.faction === 'player' && sisterArc.committed === want.committed &&
        Object.keys(sisterArc.said).length === want.said && sisterArc.returns === want.returns;
      R.theArcSurvivesTheSave = ok
        ? `reload keeps her, her ${want.said} beats and the commitment`
        : `!! RELOAD LOST THE ARC (she: ${back ? back.faction : 'GONE'}, beats ${back ? Object.keys(sisterArc.said).length : '-'}/${want.said}, committed ${sisterArc.committed}/${want.committed})`;
    });

    return R;
  });

  const bad = Object.values(out).filter(v => typeof v === 'string' && v.startsWith('!!'));
  for (const [k, v] of Object.entries(out)) console.log('  ' + k.padEnd(30) + v);
  for (const e of errs) console.log('  ' + e);
  console.log('');
  console.log(bad.length || errs.length ? `SHE IS FOUND AND NOTHING FOLLOWS (${bad.length + errs.length})`
                                        : 'SHE IS FOUND, SHE COMES, AND IT GOES SOMEWHERE');
  await b.close();
  process.exit(bad.length || errs.length ? 1 : 0);
})();
