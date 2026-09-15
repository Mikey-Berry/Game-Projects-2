#!/usr/bin/env node
/* WHAT A TOWN WRITES DOWN ABOUT YOU, AND WHAT IT DOES TO THE PEOPLE IT IS HOLDING.
 *
 *   "Squadmates in gaol may get brutally attacked/murdered for simply being within a town
 *    where I have a high bounty."
 *
 *   "It's somewhat annoying to constantly see alerts of how the bounty gets raised. There
 *    should be a hard cap, or a clear distinction when I'm literally invading a town versus
 *    simply committing crimes in it."
 *
 * THE GAOL ONE IS THE NASTY ONE and it is two correct systems meeting. `jailedAt` pins a body
 * at the cell and returns out of the step function before anything else can happen to it — no
 * orders, no moving, no swinging, no running. And the town clause in `hostile` says any player
 * body is a target once `rep < -50`. Put those together and your sentence is an execution,
 * carried out on somebody who cannot raise a hand, by the people holding them.
 *
 * THE BOUNTY ONE is two faults wearing one coat: a number that only went up (and which
 * everything reading it saturates against long before it, so past about nine hundred it
 * changes nothing and climbs anyway), and a line of log for every offence — which during an
 * assault on a town is one per body.
 *
 *   node tools/ledger.js [game.html]
 */
const { chromium } = require('playwright');
const path = require('path');
const gamePath = (a) => path.resolve(a ? (path.isAbsolute(a) ? a : path.join(__dirname, a)) : path.join(__dirname, 'game.html'));

(async () => {
  const b = await chromium.launch({
    executablePath: process.env.DUSTWARD_CHROME || undefined,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'],
  });
  const errs = [];
  const p = await b.newPage({ viewport: { width: 900, height: 600 } });
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message.slice(0, 200)));
  await p.goto('file://' + gamePath(process.argv[2]), { waitUntil: 'load' });
  await p.waitForTimeout(3000);
  await p.evaluate(() => { document.getElementById('btn-start').click(); paused = true; });
  await p.waitForTimeout(3000);

  const R = await p.evaluate(() => {
    const O = {};
    paused = true;
    const guard = (keys, fn) => {
      try { fn(); } catch (e) { for (const k of keys) if (O[k] === undefined) O[k] = '!! ' + String(e.message).slice(0, 120).toUpperCase(); }
    };
    const t = towns.find(t2 => !t2.playerRuled && !t2.def.undeadFriendly) || towns[0];
    O._town = `${t.name}, rep ${Math.round(t.rep)}, bounty ${t.bounty || 0}`;

    /* ---- 1 & 2. A PRISONER IS NOT A TARGET ---- */
    guard(['aPrisonerIsNotHunted', 'butTheWatchStillWantsYouOutside'], () => {
      /* the exact condition in the report: a town that has decided you are an enemy */
      t.rep = -120;
      const guardOf = chars.find(c => c.faction === 'town' && !c.civ && c.homeTown === t && c.state === 'ok')
        || (() => { const g = makeChar('Probe Watch', 'town', t.x + 1, t.y, {atk:10, def:10, tough:20});
                    g.homeTown = t; g.civ = false; chars.push(g); return g; })();
      const mate = makeChar('Probe Mate', 'player', t.x, t.y, {atk:5, def:5, tough:10});
      mate.floor = 0; chars.push(mate); rebuildCharGrid();
      /* free on the street: the town wants them, and that has not changed */
      const freeHunted = hostile(guardOf, mate);
      /* and in the cell */
      mate.jailedAt = {x: t.x, y: t.y, town: t};
      const jailedHunted = hostile(guardOf, mate) || hostile(mate, guardOf);
      mate.jailedAt = null;
      chars.splice(chars.indexOf(mate), 1); rebuildCharGrid();
      O.aPrisonerIsNotHunted = !jailedHunted
        ? `one of yours sitting in ${t.name}'s own cell is not the watch's business, either way round — `
          + `they cannot move, fight or flee in there, so a cell that gets them killed is not a sentence`
        : `!! THE GAOLERS MURDER THEIR OWN PRISONER (town rep ${Math.round(t.rep)})`;
      /* THE GUARD ON THE GUARD: this must not have quietly made you safe everywhere. */
      O.butTheWatchStillWantsYouOutside = freeHunted
        ? `and the same body standing free in the same street IS hunted — what changed is custody, not the quarrel`
        : `!! THE TOWN NO LONGER HUNTS YOU AT ALL (rep ${Math.round(t.rep)}) — the fix has eaten the rule`;
    });

    /* ---- 3. THE BOUNTY HAS A CEILING ----
       Driven through `crime()` rather than by adding numbers, because the cap has to be on the
       path the world actually uses. A witness is staged for the same reason: `crime` returns
       null with nobody looking, and a claim about an offence nobody saw is a claim about
       nothing. */
    guard(['theBountyHasACeiling'], () => {
      t.rep = -120; t.bounty = 0; t.wanted = false; t.assaultH = 0;
      const saw = makeChar('Probe Witness', 'town', t.x, t.y, {atk:5, def:5, tough:10});
      saw.homeTown = t; saw.civ = true; saw.floor = 0; chars.push(saw);
      const doer = makeChar('Probe Doer', 'player', t.x, t.y, {atk:5, def:5, tough:10});
      doer.floor = 0; chars.push(doer); rebuildCharGrid();
      const seen = [];
      for (let i = 0; i < 30; i++) { crime('murder', t.x, t.y, doer, 0); seen.push(t.bounty || 0); }
      const top = t.bounty || 0;
      const cap = (typeof BOUNTY_CAP !== 'undefined') ? BOUNTY_CAP : null;
      chars.splice(chars.indexOf(saw), 1); chars.splice(chars.indexOf(doer), 1); rebuildCharGrid();
      O._climb = `thirty murders in front of a witness: ${seen[0]} → ${seen[4]} → ${seen[14]} → ${top}`;
      O.theBountyHasACeiling = (cap && top <= cap)
        ? `thirty murders in front of a witness stop the price at ${top}, the ceiling — which matters `
          + `because settling costs 1.5x to 2.5x of it, so a bounty with no top is one that cannot be paid`
        : `!! THE BOUNTY CLIMBS FOREVER (${top} after thirty offences${cap ? `, cap ${cap}` : ', no cap declared'})`;
    });

    /* ---- 4 & 5. AND AN ASSAULT IS NOT A LEDGER ---- */
    guard(['stormingATownIsNotNarrated', 'andTheDebtIsStillRunning'], () => {
      t.rep = -120; t.bounty = 0; t.wanted = false; t.assaultH = 0;
      t._assaultBlows = 0; t._assaultSeenH = -99;
      const saw = makeChar('Probe Witness2', 'town', t.x, t.y, {atk:5, def:5, tough:10});
      saw.homeTown = t; saw.civ = true; saw.floor = 0; chars.push(saw);
      const doer = makeChar('Probe Doer2', 'player', t.x, t.y, {atk:5, def:5, tough:10});
      doer.floor = 0; chars.push(doer); rebuildCharGrid();

      /* ---------- THE SAME OFFENCES, TWICE, WITH ONLY THE ASSAULT BETWEEN THEM ----------
         THREE THINGS HAD TO BE CLEARED OFF THE STAGE and the first cut of this cleared none of
         them, which made both claims below vacuous in the same direction — silence, reported as
         success. `crime` suppresses an ECHO (the same offence twice inside half a game-hour),
         and the ceiling claim above had just left `_cryKind = 'murder'` stamped at this very
         hour, so every line was eaten before the assault was ever consulted. It also suppresses
         a bounty that has not MOVED, and the same claim had left the town pinned at the cap. And
         a run of identical murders is itself an echo of itself.
         So: the cry state is reset, the bounty is reset on BOTH sides of the line, and the
         offences are three DIFFERENT kinds, which is a thing the feed has to speak about. */
      t._cryKind = null; t._cryH = -99;
      const kinds = ['murder', 'theft', 'desecrate'];
      const logs = [];
      const realLog = window.log;
      window.log = (txt, k) => { logs.push(String(txt)); return realLog(txt, k); };
      /* the ordinary case, which still speaks — and is the control for the claim below */
      t.bounty = 0;
      for (const k of kinds) crime(k, t.x, t.y, doer, 0);
      const quietBefore = logs.filter(l => /wants you for/i.test(l)).length;
      /* now the fighting starts, and the same three offences happen again */
      t._cryKind = null; t._cryH = -99;
      t.bounty = 0;
      if (typeof markAssault === 'function') markAssault(t, doer);
      const openedWith = logs.length;
      const bBefore = t.bounty || 0;
      for (const k of kinds) crime(k, t.x, t.y, doer, 0);
      const duringLines = logs.slice(openedWith).filter(l => /wants you for/i.test(l)).length;
      window.log = realLog;
      const bAfter = t.bounty || 0;
      chars.splice(chars.indexOf(saw), 1); chars.splice(chars.indexOf(doer), 1); rebuildCharGrid();

      O._lines = `the same three offences: ${quietBefore} lines in peacetime, ${duringLines} once the fighting starts`;
      /* THE PREMISE IS COUNTED BEFORE THE CLAIM IS MADE. "Nothing was printed" is only evidence
         if something would have been. */
      O.stormingATownIsNotNarrated = quietBefore === 0
        ? `-- cannot speak: nothing was printed for the same offences in peacetime either`
        : duringLines === 0
          ? `the same three offences that printed ${quietBefore} lines in peacetime print NONE once the `
            + `fighting starts — a town being stormed does not read out a receipt, and one line announced the battle`
          : `!! IT STILL NARRATES DURING AN ASSAULT (${duringLines} lines, against ${quietBefore} in peacetime)`;
      /* AND THE PRICE IS STILL REAL. Quiet is not free — the whole point is that what you owe
         is still there when the smoke clears, which is a different claim from the noise. */
      /* THE GUARD ON THE QUIET, and it says only what it measures. It is green on a build with
         no quiet at all, which is correct for a guard — its job is to stop the feed being
         silenced by simply not charging you — so the sentence must not also assert the silence.
         That is the claim above, and one claim's evidence is not another's. */
      O.andTheDebtIsStillRunning = (bAfter > bBefore || bAfter >= (typeof BOUNTY_CAP !== 'undefined' ? BOUNTY_CAP : 1e9))
        ? `and the price goes on being added up through the fighting — ${bBefore} to ${bAfter} — so what `
          + `you owe the place is still there when the smoke clears`
        : `!! THE LEDGER STOPS RUNNING DURING A FIGHT (${bBefore} → ${bAfter})`;
    });
    return O;
  });

  console.log('=== WHAT THE TOWN WRITES DOWN ===\n');
  for (const [k, v] of Object.entries(R)) console.log('  ' + k.padEnd(32) + v);
  const bad = Object.values(R).map(String).filter(v => v.startsWith('!!'));
  if (errs.length) { console.log(''); errs.slice(0, 4).forEach(e => console.log('  ' + e)); }
  console.log('\n' + (bad.length || errs.length
    ? '*** ' + [...bad, ...errs].join('\n*** ')
    : 'THE LEDGER HAS A BOTTOM LINE, AND THE CELL IS A CELL'));
  await b.close();
  process.exitCode = (bad.length || errs.length) ? 1 : 0;
})();
