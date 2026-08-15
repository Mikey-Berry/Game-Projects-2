#!/usr/bin/env node
/* THE THINGS YOU ARE IN THE MIDDLE OF, AND WHETHER THE GAME EVER SAYS SO.
 *
 * Two notes came back saying the same thing in different words: the search for Lyre "gives
 * absolutely zero leads whatsoever", and reaching the second Fracture creates urgency with
 * "zero clarity on how to actually stop what's happening". Both quests were fully implemented.
 * Both were also genuinely unfindable, because the only place either first step was ever
 * stated was one line of a log that keeps seven lines.
 *
 * So the property under test is not "does the quest work" — it always did — it is "can the
 * next move be read off a surface that is still there an hour later".
 *
 *   1. a thread opens with a first step, survives a save, and shows up in the CHRONICLES panel
 *   2. Lyre's search is three legs, and each one leaves a step behind
 *   3. Saga's readings write down what he last heard
 *   4. the closing rite is learnable from the world, early, before the sky opens
 *   5. the escort ward is findable
 *   6. a ranged dark caster does not empty its pool re-marking a marked target
 *
 * Anything starting '!!' fails the build.
 *
 *   node tools/threads.js [game.html]
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
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message.slice(0, 240)));
  p.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text().slice(0, 240)); });
  await p.goto('file://' + gamePath(process.argv[2]), { waitUntil: 'load' });
  await p.waitForTimeout(3000);
  await p.evaluate(() => document.getElementById('btn-start').click());
  await p.waitForTimeout(3000);

  const out = await p.evaluate(() => {
    const R = {};
    const stepOf = k => { const t = threadOf(k); return t ? t.step : null; };

    /* ============================================================ 1. THE PANEL */
    {
      threads.length = 0;
      threadSet('probe', 'A test thread', 'Go and do the thing.', { hint: 'the thing is over there' });
      R.threadOpens = (threadsOpen() === 1 && stepOf('probe') === 'Go and do the thing.')
        ? 'a thread opens with a step on it'
        : '!! A THREAD DID NOT OPEN';
      /* restating the same step must not re-announce it — a tick that repeats itself is spam */
      const before = chronicle.length;
      threadSet('probe', 'A test thread', 'Go and do the thing.');
      R.threadQuiet = chronicle.length === before
        ? 'and restating the same step says nothing'
        : '!! A THREAD RE-ANNOUNCES ITS OWN STEP';
      threadSet('probe', 'A test thread', 'Now go and do the other thing.');
      R.threadMoves = (chronicle.length > before && stepOf('probe').startsWith('Now go'))
        ? 'a NEW step is announced once and replaces the old one'
        : '!! A THREAD DOES NOT ADVANCE';

      /* IT HAS TO BE ON A SURFACE. This is the whole point of the note: a step that exists only
         in a seven-line log is a step that does not exist. Drive the real panel. */
      openChronicles();
      const txt = document.getElementById('modalbody').textContent;
      R.threadOnPanel = txt.includes('Now go and do the other thing')
        ? 'and CHRONICLES opens on it, with the step written out'
        : `!! THE STEP IS NOT ON THE PANEL (${txt.slice(0, 90)})`;
      document.getElementById('modal').style.display = 'none';

      /* and it survives a save, or reloading is how you lose track of what you were doing */
      const sv = snapshot();
      threads.length = 0;
      restore(JSON.parse(JSON.stringify(sv)));
      R.threadSaved = stepOf('probe') === 'Now go and do the other thing.'
        ? 'and it comes back word for word after a save'
        : `!! A THREAD DID NOT SURVIVE A SAVE (${stepOf('probe')})`;
      threadDone('probe', 'Done with it.');
      R.threadCloses = (threadsOpen() === 0 && threadOf('probe').done)
        ? 'and closing one takes it off the open count'
        : '!! A FINISHED THREAD IS STILL OPEN';
      threads.length = 0;
    }

    /* ============================================================ 2. THE SEARCH FOR LYRE */
    {
      threads.length = 0;
      const me = player()[0];
      startTheSearch(me);
      R.lyreOpens = /hall/i.test(stepOf('lyre') || '')
        ? `it opens by naming the first move: "${stepOf('lyre')}"`
        : `!! THE SEARCH DOES NOT SAY WHERE TO START (${stepOf('lyre')})`;
      R.lyreTwoSites = (search.siteId >= 0 && search.siteId2 >= 0 && search.siteId2 !== search.siteId)
        ? 'and the whole trail exists from day one — two different fields, rolled at the start'
        : `!! THE TRAIL IS ONE HOP (${search.siteId} / ${search.siteId2})`;

      /* leg one: three halls */
      const asked = [];
      for (const t of towns) {
        if (search.found) break;
        askAfterLyre(t, t.leader || null);
        asked.push(stepOf('lyre'));
      }
      R.lyreCounts = asked.slice(0, 2).every(sx => /more|halls/i.test(sx || ''))
        ? 'each hall told leaves a count behind — "two of three have told you what they know"'
        : `!! THE HALL COUNT IS NOT TRACKED (${JSON.stringify(asked.slice(0, 2))})`;
      R.lyreFound = (search.found && /corpse-field|walk/i.test(stepOf('lyre') || ''))
        ? `three tellings place her, with a bearing: "${(stepOf('lyre') || '').slice(-52)}"`
        : `!! THREE HALLS DID NOT PLACE HER (${stepOf('lyre')})`;

      /* leg two: the field she was put out at is not where she is */
      const site = corpseSites[search.siteId];
      for (const c of player()) { c.x = site.x; c.y = site.y; }
      lyreTick(99);
      R.lyreCairn = (search.cairn && !search.met)
        ? 'walking out there finds a cairn and a field of sealed tears, and she is NOT standing in it'
        : `!! THE FIRST FIELD RESOLVES THE WHOLE QUEST (cairn ${search.cairn}, met ${search.met})`;
      R.lyreCairnStep = /scholar|marrow/i.test(stepOf('lyre') || '')
        ? 'and the step names who would know where a field stopped producing'
        : `!! THE SECOND LEG HAS NO LEAD (${stepOf('lyre')})`;

      /* standing in the second field must do nothing until somebody has been told */
      const site2 = corpseSites[search.siteId2];
      for (const c of player()) { c.x = site2.x; c.y = site2.y; }
      lyreTick(99); lyreTick(99);
      R.lyreGated = !search.met
        ? 'and blundering into the right field early does not skip the leg'
        : '!! THE SECOND FIELD RESOLVES WITHOUT THE LEAD';

      /* leg three: a scholar reads the ledger, then she is there */
      const sc = makeChar('Probe Scholar', 'town', site2.x + 2, site2.y, { magic: 30 });
      sc.scholar = true; sc.neutral = true; chars.push(sc);
      const told = tellScholarOfTheCairn(sc);
      R.lyreLedger = (told && search.told && /ledger|quiet|newest/i.test(stepOf('lyre') || ''))
        ? 'a scholar keeps a ledger of the fields that went quiet, and names the newest'
        : `!! THE SCHOLAR HAS NOTHING TO SAY (${told}, ${stepOf('lyre')})`;
      lyreTick(99);
      const her = chars.find(c => c.bossKey === 'lyre');
      R.lyreMet = (search.met && her)
        ? `and she is standing in it — ${her.name}, alive`
        : '!! SHE IS NOT AT THE END OF THE TRAIL';
      R.lyreClosed = (threadOf('lyre') && threadOf('lyre').done)
        ? 'and the thread closes behind her'
        : '!! THE SEARCH THREAD NEVER CLOSES';
      R.lyreLegs = 'three legs: three halls, a cairn in the wrong field, a scholar\'s ledger';
    }

    /* ============================================================ 3. SAGA'S READINGS */
    {
      threads.length = 0;
      const me = player()[0];
      me.race = 'hollow';
      startTheDescent(me);
      R.motherOpens = /press q|listen/i.test(stepOf('mother') || '')
        ? `it opens by naming the verb: "${(stepOf('mother') || '').slice(0, 60)}"`
        : `!! THE DESCENT DOES NOT SAY HOW TO LOOK (${stepOf('mother')})`;
      const cv = motherCave();
      if (cv) {
        selected = [me];
        me.x = cv.mouth.x + 60; me.y = cv.mouth.y + 60; me.floor = 0;
        const wasStep = stepOf('mother');
        listenForMother();
        R.motherReads = (stepOf('mother') !== wasStep && /reads|close|near|far|distant/i.test(stepOf('mother') || ''))
          ? `a reading is written down, not just spoken: "${(stepOf('mother') || '').slice(0, 64)}"`
          : `!! A READING LEAVES NOTHING BEHIND (${stepOf('mother')})`;
        /* and a closer reading replaces the older one rather than piling up */
        me.x = cv.mouth.x + 6; me.y = cv.mouth.y;
        const mid = stepOf('mother');
        listenForMother();
        R.motherSharpens = (stepOf('mother') !== mid && threads.filter(t => t.key === 'mother').length === 1)
          ? 'and walking closer replaces it — one thread, the newest reading'
          : `!! READINGS PILE UP OR DO NOT SHARPEN (${threads.filter(t => t.key === 'mother').length} threads)`;
      } else { R.motherReads = '(no cave was rolled for her in this world)'; }
    }

    /* ============================================================ 4. THE CLOSING RITE */
    {
      threads.length = 0;
      closing.on = false; closing.told = false; closing.known = false;
      /* the rite is read by somebody who can hold a formula, and this world's origin may not
         have handed anybody a gift — give one, or the probe measures the roster, not the rite */
      { const r0 = player().find(c => c.state === 'ok'); if(r0 && !r0.gift) r0.gift = 'dark'; }
      /* IT MUST OPEN EARLY. The whole complaint is that the answer arrives after the sky does. */
      R.riteEarly = (FRACTURE_STAGES[1].opens && FRACTURE_STAGES[1].at <= 20)
        ? `it opens at ${FRACTURE_STAGES[1].name} (${FRACTURE_STAGES[1].at}/100), four stages before the sky`
        : '!! THE RITE IS NOT TAUGHT BEFORE THE DOOR OPENS';
      fracture = 0; fractureStage = 0;
      advanceFracture(FRACTURE_DAYS * 0.25);
      R.riteOpens = (closing.on && /scholar/i.test(stepOf('rite') || ''))
        ? `the stillness opens a thread of its own: "${(stepOf('rite') || '').slice(0, 58)}"`
        : `!! THE STILLNESS TEACHES NOTHING (${closing.on}, ${stepOf('rite')})`;
      const sc = makeChar('Probe Scholar 2', 'town', 300, 300, { magic: 30 });
      sc.scholar = true; sc.neutral = true; chars.push(sc);
      R.riteTold = (tellScholarOfTheClosing(sc) && /codex/i.test(stepOf('rite') || ''))
        ? 'a scholar knows the first Fracture was shut by hand, and that the working is in a codex'
        : `!! THE SCHOLAR DOES NOT KNOW (${stepOf('rite')})`;
      /* and reading one has to state the actual cost, in advance */
      closingTick(99);
      R.riteNeedsCodex = !closing.known ? 'and it is not known just for having been told' : '!! THE RITE IS LEARNED WITHOUT THE BOOK';
      stash.codex = (stash.codex || 0) + 1;
      closingTick(99);
      R.riteKnown = closing.known ? 'reading a codex teaches it' : '!! A CODEX IN THE STORES TEACHES NOTHING';
      const step = stepOf('rite') || '';
      const wants = Object.keys(DOOR_SEAL_COST).every(k => step.includes(ITEMS[k].name));
      R.riteCost = wants
        ? `and the step names the whole bill in advance: ${costText(DOOR_SEAL_COST)}`
        : `!! THE COST IS NOT STATED (${step.slice(0, 100)})`;
      R.riteHow = /right-click|door/i.test(step) ? 'and what to do with it when the sky opens' : '!! THE STEP DOES NOT SAY WHAT TO DO';
      /* once the door is standing, the thread turns into a readout */
      openTheDoor();
      theDoor.work = DOOR_WORK * 0.5;
      closingTick(99);
      R.riteReadout = /%/.test(stepOf('rite') || '')
        ? `and with the door open it becomes a progress readout: "${(stepOf('rite') || '').slice(0, 62)}"`
        : `!! NO READOUT AT THE DOOR (${stepOf('rite')})`;
      theDoor = null;
      /* the survivor's version: a save from before any of this must not crash or lie */
      const sv = snapshot();
      closing.on = false; closing.told = false; closing.known = false;
      const j = JSON.parse(JSON.stringify(sv)); delete j.closing;
      restore(j);
      R.riteLegacy = closing.on
        ? 'a save written before the rite existed comes back with the thread open, not lost'
        : '!! A PRE-RITE SAVE LOSES THE MAIN QUEST';
    }

    /* ============================================================ 5. THE CLOCK */
    R.clock = FRACTURE_DAYS >= 180
      ? `${FRACTURE_DAYS} calendar days to the second Fracture, up from 120`
      : `!! THE CLOCK IS STILL SHORT (${FRACTURE_DAYS})`;

    /* ============================================================ 6. THE ESCORT WARD */
    {
      const t = towns[0];
      refreshBoard(t, true);
      let j = t.board.jobs.find(x => x.kind === 'escort');
      if (!j) { j = { kind: 'escort', id: 9001, toTown: 1, gold: 100, rep: 5, expires: day + 30, title: 'probe escort' }; t.board.jobs.push(j); }
      takeContract(t, j);
      const w = chars.find(c => c.id === j.wardId);
      R.wardExists = w ? `${w.name} steps out of ${t.name} as the ward` : '!! NO WARD WAS MADE';
      R.wardMarked = (w && w.vip && w.escortId === j.id)
        ? 'and carries the two fields the overlay reads to draw a standing mark on them'
        : '!! THE WARD IS NOT FLAGGED FOR THE OVERLAY';
      /* THE POINT OF THE MARK IS THAT IT SURVIVES LOSING SIGHT OF THEM. Put them somewhere
         nobody can see and check the overlay would still draw them. */
      w.x = 4; w.y = 4;
      computeVision();
      R.wardOutOfSight = (visAt(w.x, w.y) !== 2)
        ? `they are standing on ground nobody of yours can see (vis ${visAt(w.x, w.y)})`
        : '!! THE PROBE NEVER LOST SIGHT OF THE WARD';
      /* the overlay's own gate, evaluated exactly as the draw loop writes it */
      const drawn = !(w.faction !== 'player' && visAt(w.x, w.y) !== 2 && !(w.vip && w.escortId));
      R.wardStillDrawn = drawn
        ? 'and the overlay still draws them — a name you agreed to keep alive is not fog-gated'
        : '!! A WARD OUT OF SIGHT IS INVISIBLE, WHICH IS THE WHOLE COMPLAINT';
    }

    /* ============================================================ 7. THE DARK CASTER'S POOL */
    {
      const c = makeChar('Probe Mage', 'player', 500, 500, { magic: 40 });
      c.state = 'ok'; c.gift = 'dark'; c.stance = 'ranged'; c.atts = { dark: 3 };
      c.mana = maxMana(c); chars.push(c);
      R.darkReserve = darkReserve(c) > 0
        ? `a dark caster holds ${darkReserve(c)} mana back — the cost of a raise`
        : '!! A DARK CASTER KEEPS NOTHING IN THE BANK';
      const foe = makeChar('Probe Foe', 'bandit', 503, 500, { tough: 40 });
      foe.state = 'ok'; foe.blood = foe.maxBlood = 1e6; chars.push(foe);
      /* THE BUCKET INDEX IS PER-FRAME. `nearestUnmarked` goes through `charsNear`, which reads
         `charGrid` — rebuilt once a frame by the real loop and stale the moment a probe pushes
         a body in by hand. Without this the scan sees an empty world and the 'it skips a marked
         target' assertion passes for the wrong reason, which is worse than failing. */
      rebuildCharGrid();
      /* an unmarked foe in range is a target; the same foe already marked is not */
      R.darkPicksUnmarked = (nearestUnmarked(c) === foe) ? 'an unmarked foe in range is a target' : '!! IT CANNOT SEE AN UNMARKED FOE';
      foe.markT = MARK_TIME;
      R.darkSkipsMarked = (nearestUnmarked(c) === null)
        ? 'and once that foe carries a mark there is nobody left worth a bolt'
        : '!! IT WOULD RE-MARK A TARGET THAT IS ALREADY MARKED';
      /* drive the real ai() and watch the pool: 400 ticks against one marked foe */
      const pool = c.mana;
      c.target = foe; c.targetManual = true;
      for (let i = 0; i < 400; i++) { c.castCd = 0; foe.markT = MARK_TIME; ai(c, 1 / 30); }
      R.darkHoldsFire = c.mana >= pool - 1
        ? `and 400 ticks beside a marked foe spends ${(pool - c.mana).toFixed(1)} mana, not the pool`
        : `!! THE CASTER STILL EMPTIES ITSELF RE-MARKING (${(pool - c.mana).toFixed(1)} of ${pool.toFixed(1)} spent)`;
    }
    return R;
  });

  console.log('\n=== WHAT YOU ARE IN THE MIDDLE OF ===\n');
  for (const [k, v] of Object.entries(out)) console.log('  ' + k.padEnd(18) + v);
  const bad = Object.values(out).filter(v => typeof v === 'string' && v.startsWith('!!'));
  if (errs.length) console.log('\n' + errs.slice(0, 5).join('\n'));
  console.log('\n' + (bad.length || errs.length
    ? `FAIL — ${bad.length} verdict(s), ${errs.length} error(s)`
    : 'EVERY THREAD HAS A NEXT MOVE ON IT'));
  await b.close();
  process.exit(bad.length || errs.length ? 1 : 0);
})();
