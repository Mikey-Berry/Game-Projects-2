#!/usr/bin/env node
/* WHO THE INTERFACE IS ACTUALLY POINTING AT.
 *
 * Three reports that are one question asked three ways: when you click, who does the game
 * think you meant?
 *
 *   "I can select/talk with people on an entirely different floor/storey than the one I am on
 *    (e.g., talk to a kept priest underground if I happen to right click on the right area.)"
 *
 *   "I love being able to right click and create a group or squad, but right now I have to do
 *    it manually, one at a time. It would be nice to just select a chunk of troops, label them
 *    as a single squad and have them organized as such in the UI."
 *
 *   "(To the point of replacing the goal section, I never use that and it feels a bit OP to
 *    give such an XP bonus for nothing but a few clicks.)"
 *
 * THE FLOOR CLAIM IS ASKED OF `bodyHit`, which is the one predicate every cursor test in the
 * file runs through — thirty-six call sites, spell targeting and talk and selection among them
 * — so proving it there proves it for all of them. The guard was present and written
 * `activeFloor < 0 && ...`, i.e. it only ran while you were UNDERGROUND; on the surface, the
 * ordinary case, the cursor reached through the rock.
 *
 * THE SQUAD CLAIM GOES THROUGH THE BUTTON. Not `assignToGroup` — that already worked, and a
 * claim about it would have been green on the build this was reported against. What was
 * missing was a road from a world selection to the folders, so the road is what is tested:
 * click the panel button and take the menu it builds.
 *
 *   node tools/roster.js [game.html]
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
  const p = await b.newPage({ viewport: { width: 1000, height: 700 } });
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

    /* ---- 1 & 2. THE CURSOR ONLY REACHES ONE STOREY ---- */
    guard(['aCursorDoesNotReachThroughRock', 'andStillReachesTheStoreyYouAreOn'], () => {
      const me = player()[0];
      activeFloor = 0; me.floor = 0;
      /* a body directly beneath the party, on the storey under the world. Same x and y, which
         is the whole of the fault: a plain 2D distance cannot tell four hundred metres of rock
         from nothing at all. */
      const below = makeChar('Probe Below', 'town', me.x, me.y, {atk:5, def:5, tough:10});
      below.floor = -1; chars.push(below);
      const beside = makeChar('Probe Beside', 'town', me.x + 0.2, me.y, {atk:5, def:5, tough:10});
      beside.floor = 0; chars.push(beside);
      rebuildCharGrid();
      const hitBelow = bodyHit(below, me.x, me.y, 0.9);
      const hitBeside = bodyHit(beside, me.x, me.y, 0.9);
      /* and the other way round: standing underground, the one on the surface is out of reach */
      activeFloor = -1; 
      const hitAboveFromBelow = bodyHit(beside, me.x, me.y, 0.9);
      const hitBelowFromBelow = bodyHit(below, me.x, me.y, 0.9);
      activeFloor = 0;
      chars.splice(chars.indexOf(below), 1); chars.splice(chars.indexOf(beside), 1);
      rebuildCharGrid();
      O.aCursorDoesNotReachThroughRock = (!hitBelow && !hitAboveFromBelow)
        ? `a body on the storey below is not under the cursor, and neither is one on the surface `
          + `once you are below it — the click resolves against the deck you are looking at, both ways round`
        : `!! THE CURSOR REACHES THROUGH THE ROCK (from above: ${hitBelow}, from below: ${hitAboveFromBelow})`;
      O.andStillReachesTheStoreyYouAreOn = (hitBeside && hitBelowFromBelow)
        ? `and it still reaches what it should — the body beside you on your own deck, on either storey`
        : `!! THE GUARD EATS THE ORDINARY CASE (beside on surface: ${hitBeside}, below while below: ${hitBelowFromBelow})`;
    });

    /* ---- 3, 4 & 5. A SQUAD OUT OF A SELECTION, FROM THE PANEL ---- */
    guard(['theresASquadButtonWhereTheGoalWas', 'andItTakesTheWholeSelection', 'andYouCanGrabThemBackAgain'], () => {
      const btn = document.getElementById('btn-squad');
      const oldBtn = document.getElementById('btn-goal');
      O.theresASquadButtonWhereTheGoalWas = (btn && !oldBtn)
        ? `the character panel carries SQUAD where GOAL used to be — the panel that is already open `
          + `because you have just selected the people you want to name`
        : `!! NO SQUAD BUTTON (squad: ${!!btn}, goal still there: ${!!oldBtn})`;
      if (!btn) { O.andItTakesTheWholeSelection = '!! NO BUTTON'; O.andYouCanGrabThemBackAgain = '!! NO BUTTON'; return; }

      /* CLICK IT, and take the menu it actually builds — not `assignToGroup`, which already
         worked on the build this was reported against. The road in is the thing under test. */
      const crew = chars.filter(c => c.faction === 'player' && c.state !== 'dead' && !c.undead).slice(0, 4);
      if (crew.length < 2) { O.andItTakesTheWholeSelection = '!! FEWER THAN TWO LIVING TO GROUP'; O.andYouCanGrabThemBackAgain = '!! ditto'; return; }
      selected = [...crew];
      refreshCharPanel();
      const realPrompt = window.prompt;
      window.prompt = () => 'Vanguard';
      btn.click();
      /* `showCtxMenu` builds BUTTONs inside `#ctxmenu` — the first cut of this looked for divs
         and found nothing, and then reported that the button opened nothing */
      const rowsOf = () => [...document.querySelectorAll('#ctxmenu button')];
      const menu = rowsOf().map(d => (d.textContent || '').trim()).filter(Boolean);
      O._menu = menu.length ? `the menu offers: ${menu.slice(0, 6).join(' / ')}` : '!! THE BUTTON OPENED NOTHING';
      const newRow = rowsOf().find(d => /NEW SQUAD/i.test(d.textContent || ''));
      if (newRow) newRow.click();
      window.prompt = realPrompt;

      const named = crew.filter(c => c.grp === 'Vanguard').length;
      O.andItTakesTheWholeSelection = named === crew.length
        ? `one click on it puts all ${crew.length} selected into one named squad — not one at a time, `
          + `and not by hunting for somebody else's folder header to borrow a menu from`
        : `!! THE BUTTON GROUPED ${named} OF ${crew.length}`;

      /* and the other direction: from one of them, get the rest back */
      if (named === crew.length) {
        selected = [crew[0]];
        refreshCharPanel();
        btn.click();
        const back = [...document.querySelectorAll('#ctxmenu button')].find(d => /SELECT ALL OF/i.test(d.textContent || ''));
        if (back) back.click();
        O.andYouCanGrabThemBackAgain = selected.length === crew.length
          ? `and from any one of them the whole squad comes back into the selection — ${selected.length} of ${crew.length}`
          : `!! CANNOT RESELECT THE SQUAD (${selected.length} of ${crew.length})`;
      } else O.andYouCanGrabThemBackAgain = '-- cannot speak: nothing was grouped to reselect';
      for (const c of crew) c.grp = null;
      if (typeof removeSquadGroup === 'function') removeSquadGroup('Vanguard');
      refreshSquadBar();
    });

    /* ---- 6. AND THE GOAL BONUS IS GONE ----
       Asked of `xpGain` itself and not of the menu, because the complaint is about the BONUS:
       a quarter more learning forever, for two clicks, is the thing being removed. Two bodies
       identical but for the field, given identical work. */
    guard(['aGoalBuysNothing'], () => {
      /* ONE BODY, RUN TWICE, because two bodies are not comparable and the first cut of this
         found that out the hard way. `xpGain` opens with `amt *= raceOf(c).xp` and then
         multiplies again by `subOf(c).learn[stat]`, and `makeChar` ROLLS a race and a subrace —
         so two probes built the same way differed by 1.3x before the goal was ever consulted,
         and the claim reported the goal paying NEGATIVE seventeen per cent. The same body with
         the same stats, given the same work, differing only in the one field under test, has no
         room for any of that. */
      const c = makeChar('XP Probe', 'player', 5, 5, {atk:5, def:5, tough:10});
      c.age = 25; c.grief = 0;
      const runIt = (goal) => {
        c.goal = goal;
        for (const k in c.stats) c.stats[k] = 10;
        for (let i = 0; i < 40; i++) xpGain(c, 'blades', 0.5);
        return c.stats.blades;
      };
      const a = runIt('blades'), b2 = runIt(null);
      O._xp = `one ${raceOf(c).name || 'body'}, forty turns each way, from 10 blades`;
      O.aGoalBuysNothing = Math.abs(a - b2) < 1e-9
        ? `and a goal buys nothing: the same body doing the same work reaches ${a.toFixed(3)} blades either way — `
          + `the flat 1.25x on one skill for the rest of a life, for two clicks, is gone with the menu that set it`
        : `!! THE GOAL STILL PAYS (${a.toFixed(3)} with a goal against ${b2.toFixed(3)} without — ${((a / b2 - 1) * 100).toFixed(0)}% more)`;
    });
    return O;
  });

  console.log('=== WHO THE INTERFACE IS POINTING AT ===\n');
  for (const [k, v] of Object.entries(R)) console.log('  ' + k.padEnd(36) + v);
  const bad = Object.values(R).map(String).filter(v => v.startsWith('!!'));
  if (errs.length) { console.log(''); errs.slice(0, 4).forEach(e => console.log('  ' + e)); }
  console.log('\n' + (bad.length || errs.length
    ? '*** ' + [...bad, ...errs].join('\n*** ')
    : 'IT POINTS AT WHO YOU MEANT'));
  await b.close();
  process.exitCode = (bad.length || errs.length) ? 1 : 0;
})();
