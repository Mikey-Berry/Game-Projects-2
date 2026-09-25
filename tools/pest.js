#!/usr/bin/env node
/* THE WATCH TURNS YOU AWAY FROM A SICK TOWN.
 *
 * "Perhaps instead of just visuals, we make it more mechanical. Like the guards at gates warn
 *  away incoming people, bark about plague, ring a somber bell when nearby (drawing in some
 *  audio elements)." And, on how often: "it shouldn't be annoying — it should be once or twice
 *  and that's it. No constant repetition."
 *
 * A plague already stopped a town working, sickened its people and coughed on yours. What it
 * never did was TELL you, at the gate, before you walked in. A seam audit found it worth zero
 * pixels and zero lines: you found out a town was plagued by reading a menu.
 *
 * The hard half of this is not making it happen. It is making it happen TWICE. A proximity
 * check is a poll, and a poll fires every four seconds for as long as you stand there — so the
 * claims below spend most of their effort on the negative: how many times it does NOT fire.
 *
 *   node tools/pest.js [game.html]
 */
const { chromium } = require('playwright');
const path = require('path');
const gamePath = (a) => path.resolve(a ? (path.isAbsolute(a) ? a : path.join(__dirname, a)) : path.join(__dirname, 'game.html'));

(async () => {
  const b = await chromium.launch({ executablePath: process.env.DUSTWARD_CHROME || undefined,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 900, height: 600 } });
  const errs = [];
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
    const has = (n) => typeof window[n] === 'function' || typeof eval('typeof ' + n) === 'function';

    /* ---------- STAGING ----------
       The check wants three things in the same place: one of yours, alive and on the surface,
       inside the warning band; a guard of that town within sixteen tiles of them; and the town
       sick. The guard is found FIRST and the body is put next to it, rather than standing the
       body at a gate and hoping — the posts are spread around a ring of twenty-seven and which
       of them is manned at a given moment is not this harness's business. */
    const t = towns.find(q => q.def.wall && chars.some(o => o.faction === 'town' && !o.civ && o.state === 'ok' && o.homeTown === q));
    const g0 = t && chars.find(o => o.faction === 'town' && !o.civ && o.state === 'ok' && o.homeTown === t);
    const me = player().find(o => o.state === 'ok' && !o.undead);
    const home = me ? { x: me.x, y: me.y } : null;
    const bells = { n: 0 };
    const AUbell = AU.bell;
    AU.bell = function (x, y) { bells.n++; return AUbell && AUbell.call(AU, x, y); };
    const WARN = (typeof PLAGUE_WARNINGS !== 'undefined') ? PLAGUE_WARNINGS : [];
    const barked = () => chars.filter(o => o.bubble && WARN.indexOf(o.bubble.text) >= 0).length;
    const clearBubbles = () => { for (const o of chars) if (o.bubble) o.bubble = null; };
    /* ---------- AND THE GRID HAS TO BE REBUILT AFTER MOVING ANYBODY ----------
       `charsNear` reads the spatial grid, which the sim rebuilds once a step — and this harness
       does not step the sim. Moving a body by assignment and then polling the check found no
       guard within sixteen tiles of a body standing a tile and a half from one, and the first
       cut reported the whole feature dead: 0 warnings out of 120 chances. */
    const stand = () => { me.x = g0.x + 1.2; me.y = g0.y + 1.2; me.floor = 0; rebuildCharGrid(); };
    const away = () => { me.x = home.x; me.y = home.y; rebuildCharGrid(); };
    /* one approach: stand at the gate, poll the check as the world polls it, count what came
       out, and walk away again */
    /* HOW MANY TIMES IT FIRED IS THE BELL COUNT, NOT THE TOWN'S OWN COUNTER. `plagueTold` caps
       at two by design, so measuring the cap against itself would be a claim that cannot fail.
       The stubbed bell counts every firing with no ceiling on it, and the bark is checked
       alongside it so a silent bell would still be caught. */
    /* AND THE CONTROL MUST STILL RUN. On the build before this, `plagueGate` does not exist,
       and every claim coming back "!! PLAGUEGATE IS NOT DEFINED" says the function is new and
       nothing about whether a sick town ever warned anybody. Called through a check, the old
       build reports the real pre-change number, which is nothing at any gate, ever. */
    const gate = () => { if (typeof plagueGate === 'function') plagueGate(); };
    const approach = (polls) => {
      clearBubbles(); const b0 = bells.n;
      stand();
      let said = 0;
      for (let i = 0; i < polls; i++) { gate(); said += barked(); clearBubbles(); }
      away();
      return { said: bells.n - b0, barks: said, rang: bells.n - b0 };
    };
    const setPlague = (n) => { t.plague = n; t.plagueTold = 0; t.plagueToldDay = 0; };

    guard(['_premise', 'thereIsAGateAndSomebodyOnIt'], () => {
      O._premise = t ? `${t.name}, ring of ${t.def.wall.r}; ${g0.name} of the watch stands at ${g0.x.toFixed(0)},${g0.y.toFixed(0)}` +
        `; ${chars.filter(o => o.faction === 'town' && !o.civ && o.homeTown === t && o.state === 'ok').length} of the watch alive` : '!! NO WALLED TOWN WITH A WATCH';
      O.thereIsAGateAndSomebodyOnIt = (t && g0 && me)
        ? `${t.name} has a watch to warn you and somebody of yours to warn`
        : `!! NOTHING TO STAGE (town ${!!t}, guard ${!!g0}, body ${!!me})`;
    });

    /* ---------- 1. A SICK TOWN WAVES YOU OFF, AND A WELL ONE DOES NOT ---------- */
    guard(['_warn', 'theWatchWarnsYouOffASickTown', 'andAWellTownSaysNothingAtAll'], () => {
      t.plague = 0; t.plagueTold = 0; t.plagueToldDay = 0;
      const well = approach(20);
      setPlague(5);
      const sick = approach(1);
      O._warn = `twenty polls at a well gate: ${well.said} warnings, ${well.rang} bells. One poll at a sick gate: ${sick.said} warnings, ${sick.rang} bells`;
      O.theWatchWarnsYouOffASickTown = (sick.said === 1 && sick.barks === 1)
        ? 'the first time you come near a sick town the watch waves you off and the bell goes'
        : `!! NO WARNING AT A PLAGUED GATE (${sick.said} barks, ${sick.rang} bells)`;
      O.andAWellTownSaysNothingAtAll = (well.said === 0 && well.rang === 0)
        ? 'and twenty passes at a town with nothing wrong with it produce nothing at all'
        : `!! A HEALTHY TOWN RANG ITS PLAGUE BELL (${well.said} barks, ${well.rang} bells in twenty polls)`;
    });

    /* ---------- 2. AND IT DOES NOT SAY IT AGAIN ----------
       This is the claim the whole thing is for. The check runs every four seconds; standing at
       a plagued gate for a minute is fifteen polls, and a version of this without the day gate
       and the count would bark fifteen times. */
    guard(['_repeat', 'itDoesNotSayItAgainThatDay', 'andNeverMoreThanTwiceAnOutbreak'], () => {
      setPlague(6);
      const first = approach(30);
      const sameDay = approach(30);
      day++;
      const nextDay = approach(30);
      day++;
      const thirdDay = approach(30);
      const total = first.said + sameDay.said + nextDay.said + thirdDay.said;
      O._repeat = `thirty polls a day for four days at the same sick gate: ${first.said}, ${sameDay.said}, ${nextDay.said}, ${thirdDay.said}` +
        ` — ${total} warnings and ${first.rang + sameDay.rang + nextDay.rang + thirdDay.rang} bells out of 120 chances`;
      O.itDoesNotSayItAgainThatDay = (first.said === 1 && sameDay.said === 0)
        ? 'sixty passes at the gate in one day is one warning — it is an event, not a proximity alarm'
        : first.said === 0 ? '!! IT NEVER FIRED AT ALL IN SIXTY PASSES AT A SICK GATE'
          : `!! IT REPEATS WITHIN THE DAY (${first.said} then ${sameDay.said} in sixty polls)`;
      O.andNeverMoreThanTwiceAnOutbreak = (nextDay.said === 1 && thirdDay.said === 0 && total === 2)
        ? 'and coming back the next day is warned once more and never again — twice an outbreak, as asked'
        : `!! WRONG NUMBER OF WARNINGS IN AN OUTBREAK (${total}: ${first.said}/${sameDay.said}/${nextDay.said}/${thirdDay.said})`;
    });

    /* ---------- 3. BUT A NEW SICKNESS IS NEW NEWS ---------- */
    guard(['_fresh', 'aNewOutbreakIsWarnedAfresh'], () => {
      t.plague = 0; t.plagueTold = 0; t.plagueToldDay = 0;
      day++;
      const quiet = approach(10);
      setPlague(5); day++;
      const again = approach(10);
      O._fresh = `after the sickness passed: ${quiet.said} warnings in ten polls; a fresh outbreak: ${again.said}`;
      O.aNewOutbreakIsWarnedAfresh = (quiet.said === 0 && again.said === 1)
        ? 'a town that got better stops warning anybody, and the next outbreak is warned afresh'
        : `!! THE COUNT DOES NOT RESET WITH THE OUTBREAK (${quiet.said} while well, ${again.said} when sick again)`;
    });

    /* ---------- 4. AND IT OWES THE WORLD'S STREAM NOTHING ----------
       Which line a guard says depends on where the player happens to be standing and when they
       got there. Drawn off `rnd()` that would move the seeded stream by an amount decided by
       the player's feet — which is the bug this file has been bitten by four times and the
       reason `vrnd` exists. Measured on the globals rather than argued. */
    guard(['_stream', 'theBarkIsDrawnOffTheVisualStream'], () => {
      setPlague(5); day++;
      const s0 = seed, v0 = vseed;
      const got = approach(50);
      const s1 = seed, v1 = vseed;
      O._stream = `fifty polls and ${got.said} warning(s): world seed ${s0} -> ${s1}, visual seed ${v0} -> ${v1}`;
      O.theBarkIsDrawnOffTheVisualStream = (got.said === 1 && s1 === s0 && v1 !== v0)
        ? 'the warning picks its line off the visual stream and leaves the world\'s seed exactly where it was'
        : s1 !== s0 ? `!! THE GATE WARNING WALKS THE WORLD'S SEED (${s0} -> ${s1}) — where the player stands would change the world`
          : got.said !== 1 ? `!! NOTHING WAS SAID (${got.said}), so the claim is empty`
            : '!! NO LINE WAS DRAWN AT ALL (the visual seed did not move)';
    });

    /* ---------- 5. AND NOBODY CARTS GOODS INTO IT ----------
       "The guards at gates warn away incoming people" applied to everybody who is not you. The
       destination is chosen with one `pick` on either branch, so filtering the list changes
       what comes out and never how many draws it took. */
    guard(['_trade', 'nobodyCartsGoodsIntoASickTown', 'unlessThereIsNowhereElseToGo'], () => {
      for (const q of towns) q.plague = 0;
      const legs = (from) => towns.filter(q => q !== from && routeFor(from, q));
      /* A ROAD WITH ONE DESTINATION ON IT PROVES NOTHING. The first cut took the first town
         that had a road to the sick one — and out of GREENREST the only routed destination IS
         Dustport, so with Dustport shut the filter emptied, the fallback took over as designed,
         and the claim read "400 of 400 carts still roll in". That is the no-alternative branch
         doing its job, not the filter failing. The pair is chosen so there is somewhere else. */
      let from = null, sick = null;
      for (const f of towns) {
        const ds = legs(f);
        if (ds.length < 2) continue;
        from = f; sick = ds[0]; break;
      }
      /* THE GAME'S OWN RULE, NOT A COPY OF IT. The first cut of this re-implemented the
         filter inside the harness — which passes on every build ever made, including the one
         without the rule in it, because it was testing the harness. `nextCaravanDest` exists
         as a named function so the question can be put to the game. */
      /* ON THE OLD BUILD THE FUNCTION DOES NOT EXIST, and a claim that throws there cannot be
         A/B'd. The fallback is the line the caravan tick actually had before this change —
         written out once, here, so the control can answer the question in its own terms rather
         than reporting that a name is missing. */
      const nextDest = (typeof nextCaravanDest === 'function') ? nextCaravanDest : (f) => {
        const conn = towns.filter(q => q !== f && routeFor(f, q));
        return conn.length ? pick(conn) : pick(towns.filter(q => q !== f));
      };
      const dests = (runs) => {
        const seen = {};
        for (let i = 0; i < runs; i++) {
          const d = nextDest(from);
          if (d) seen[d.name] = (seen[d.name] || 0) + 1;
        }
        return seen;
      };
      if (!from) { O._trade = '!! NO TOWN HAS TWO ROADS OUT OF IT'; O.nobodyCartsGoodsIntoASickTown = '!! NO PAIR TO TEST'; O.unlessThereIsNowhereElseToGo = '!! NO PAIR TO TEST'; return; }
      const well = dests(400);
      sick.plague = 5;
      const shut = dests(400);
      /* and the other branch: a road with one destination on it, and that destination shut */
      const only = towns.find(f => legs(f).length === 1 && legs(f)[0] !== f);
      let stranded = { n: 0, of: 0 };
      if (only) {
        const one = legs(only)[0];
        const was = one.plague; one.plague = 5;
        for (let i = 0; i < 100; i++) { stranded.of++; if (nextDest(only) === one) stranded.n++; }
        one.plague = was;
      }
      sick.plague = 0;
      O._trade = `400 legs out of ${from.name} (${legs(from).length} roads): ${sick.name} took ${well[sick.name] || 0} while well and ${shut[sick.name] || 0} while shut` +
        (only ? `; out of ${only.name}, which has one road, its only neighbour took ${stranded.n} of ${stranded.of} with that neighbour shut` : '; no one-road town to test');
      O.nobodyCartsGoodsIntoASickTown = ((well[sick.name] || 0) > 0 && (shut[sick.name] || 0) === 0)
        ? `a caravan that would take ${well[sick.name]} legs of 400 into ${sick.name} takes none at all while it is shut`
        : (well[sick.name] || 0) === 0 ? `!! ${sick.name} WAS NEVER A DESTINATION EVEN WHILE WELL — the claim is vacuous`
          : `!! CARTS STILL ROLL INTO A PLAGUED TOWN (${shut[sick.name]} of 400)`;
      O.unlessThereIsNowhereElseToGo = !only ? 'no town on the map has exactly one road out, so there is nothing to strand'
        : stranded.n === stranded.of
          ? `and a town with one road still sends its carts down it — ${stranded.n} of ${stranded.of} — because a caravan with nowhere to go is a caravan that stops for good`
          : `!! A ONE-ROAD TOWN STRANDED ITS CARAVANS (${stranded.n} of ${stranded.of} still went)`;
    });

    /* ---------- 6. AND A TOWN WITH NOTHING WRONG WITH IT DOES NOT MAKE YOU ILL ----------
       Found while staging the claims above: the sickness tick opens `if(t.plague <= 0)
       continue`, and `plague` was never initialised on a town object. `undefined <= 0` is
       FALSE, so that guard let every healthy town in the world through — within thirteen tiles
       of any town, townsfolk took raw damage and anyone of yours without brine in them caught a
       three-day fever off a plague that did not exist. It is not a new feature's bug; it has
       been in the sickness tick the whole time, and the plague gate only found it because the
       gate made the same mistake and warned at all seven gates at once. */
    guard(['_fever', 'aHealthyTownDoesNotMakeYouIll'], () => {
      /* `delete`, NOT `= 0`. The bug IS the absent field: `undefined <= 0` is false where
         `0 <= 0` is true, so a harness that zeroes the field first has quietly fixed the thing
         it came to measure — the first cut did exactly that and reported the control clean.
         Deleting it puts a town back in the state worldgen used to leave it in. */
      for (const q of towns) { delete q.plague; q.plagueTold = 0; q.plagueToldDay = 0; }
      const squad = player().filter(o => o.state === 'ok' && !o.undead);
      for (const o of squad) { o.sick = 0; o.x = t.x + 2; o.y = t.y + 2; o.floor = 0; }
      rebuildCharGrid();
      const hp0 = chars.filter(o => o.faction === 'town' && o.homeTown === t && o.state === 'ok').length;
      paused = false;
      for (let i = 0; i < 400; i++) update(0.5);
      paused = true;
      const fevered = player().filter(o => o.sick > 0).length;
      const hp1 = chars.filter(o => o.faction === 'town' && o.homeTown === t && o.state === 'ok').length;
      O._fever = `${squad.length} of yours stood two tiles inside a town whose \`plague\` field does not exist, for 200 seconds: ${fevered} caught a fever; the town went from ${hp0} standing to ${hp1}`;
      O.aHealthyTownDoesNotMakeYouIll = fevered === 0
        ? `two hundred seconds inside a well town and none of the ${squad.length} of you caught anything`
        : `!! A TOWN WITH NO PLAGUE IN IT GAVE ${fevered} OF ${squad.length} A FEVER`;
      for (const o of player()) o.sick = 0;
      for (const q of towns) q.plague = 0;
    });

    AU.bell = AUbell;
    if (home) away();
    t.plague = 0; t.plagueTold = 0; t.plagueToldDay = 0;
    return O;
  });

  console.log('\n=== THE WATCH TURNS YOU AWAY FROM A SICK TOWN ===\n');
  const bad = [];
  for (const k of Object.keys(R)) {
    const v = String(R[k]);
    console.log('  ' + k.padEnd(34) + v);
    if (v.startsWith('!!')) bad.push(v);
  }
  console.log('\n' + (bad.length ? '*** ' + bad.join('\n*** ')
    : 'A SICK TOWN SAYS SO ONCE, SAYS IT AGAIN TOMORROW, AND THEN NEVER AGAIN'));
  if (errs.length) { console.log('errs:', errs.length); errs.slice(0, 4).forEach(e => console.log('  ' + e)); }
  await b.close();
  if (bad.length) process.exitCode = 1;
})();
