#!/usr/bin/env node
/* WHAT A TONGUE IS WORTH, AND WHETHER THE GATE IS WATCHED.
 *
 * "Maybe that should be another skill. I know right now we have racial passives for chimeras and
 *  fallen that affect prices - maybe we could actually just adapt that into a charisma stat that
 *  is flat and racial based upon character creation, and trained by buying and selling (or
 *  attempting these kinds of checks.)"
 * "I know we had a system for crime/contraband going and somewhat walked it back. I'd like to
 *  start incorporating that again — but create some dialogue options that could get you out of
 *  it (a charisma roll, bribe, resist, etc...)"
 *
 * THE MEASUREMENT THAT STARTED THE SECOND HALF. Standing in the middle of Dustport for five game
 * days with a proscribed book in hand produced ZERO stops on the old build. The check wanted a
 * town guard within six tiles and the nearest posted guard to that town's centre is 9.7 — so the
 * roll was being made against a condition that is never true there. At the gate the nearest guard
 * is 1.7 tiles. The mechanic already lived at the gate; nothing was arranging for it to happen
 * there. So this file asserts the crossing, not the poll.
 *
 *   node tools/tongue.js [game.html]
 */
const { chromium } = require('playwright');
const path = require('path');
const gamePath = (a) => path.resolve(a ? (path.isAbsolute(a) ? a : path.join(__dirname, a)) : path.join(__dirname, 'game.html'));

(async () => {
  const b = await chromium.launch({
    executablePath: process.env.DUSTWARD_CHROME || undefined,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'],
  });
  const p = await b.newPage({ viewport: { width: 900, height: 620 } });
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message.slice(0, 160)));
  await p.goto('file://' + gamePath(process.argv[2]), { waitUntil: 'load' });
  await p.waitForSelector('#btn-start', { state: 'attached', timeout: 60000 });
  await p.evaluate(() => { document.getElementById('btn-start').click(); paused = true; });
  await p.waitForTimeout(2600);

  const out = await p.evaluate(() => {
    const R = {};
    paused = true;
    /* READ EVERY NEW SYMBOL THROUGH A GUARD. A negative control is run against a build that has
       none of this, and a probe that throws is not a control — it is a crash with an opinion. */
    const guard = (keys, fn) => {
      try { fn(); } catch (e) { for (const k of keys) if (R[k] === undefined) R[k] = '!! ' + String(e.message).slice(0, 120).toUpperCase(); }
    };
    const probes = [];
    const wipe = () => { while (probes.length) { const c = probes.pop(); const i = chars.indexOf(c); if (i >= 0) chars.splice(i, 1); } };
    const mk = (o) => { const c = makeChar('Probe', 'player', player()[0].x, player()[0].y, o); c.state = 'ok'; c.__probe = true; chars.push(c); probes.push(c); return c; };

    /* ---------- 1. THE STAT EXISTS, AND THE RACE STEP SETS IT ---------- */
    guard(['everybodyHasATongue', 'andTheLineYouWereBornIntoSetsIt'], () => {
      const me = player()[0];
      R._cha = `${me.name}: charisma ${me.stats.charisma}`;
      R.everybodyHasATongue = (typeof me.stats.charisma === 'number' && Number.isFinite(me.stats.charisma))
        ? `every body carries a charisma — ${me.name} has ${me.stats.charisma}`
        : `!! THERE IS NO CHARISMA STAT (${me.stats.charisma})`;
      /* THE RACIAL HALF, WHICH IS THE PART THE NOTE ASKS FOR: flat, and decided at creation.
         Read off freshly built bodies of each line rather than off the table, so it is the
         BODIES that are asserted and not the numbers next to them. */
      const of = (race, sub) => { const c = makeChar('T', 'player', 5, 5, { race, sub }); return c.stats.charisma; };
      const fallen = of('mimic', 'fallen'), scale = of('chimera', 'scaleborn'), man = of('human', 'dustborn');
      R._lines = `dustborn human ${man} · scaleborn ${scale} · Fallen ${fallen}`;
      R.andTheLineYouWereBornIntoSetsIt = (fallen > man && man > scale)
        ? `and the line decides where you start: a Fallen opens at ${fallen}, an ordinary human at ${man}, a scaleborn at ${scale} — which is the old price flag said in a currency anybody can earn`
        : `!! FLAT BY LINE FAILED — fallen ${fallen}, human ${man}, scaleborn ${scale}`;
    });

    /* ---------- 2. IT MOVES THE PRICE, BOTH WAYS, AND SATURATES ----------
       The old mechanism was two flags worth a flat 15% and 10% to two races. The claim now is
       that it is a CURVE anybody rides: it costs you money at the bottom, pays at the top, and
       never reaches free — a stat that runs linearly to a 100% discount is an exploit. */
    guard(['itMovesWhatYouPay', 'andItNeverReachesFree'], () => {
      const at = (n) => 1 + hagglePull(n);
      R._curve = [0, 3, 6, 20, 50, 100].map(n => `${n}:${at(n).toFixed(3)}`).join(' ');
      R.itMovesWhatYouPay = (at(0) > 1.05 && at(6) > 0.99 && at(6) < 1.01 && at(50) < 0.92)
        ? `a bad tongue pays ${Math.round((at(0) - 1) * 100)}% over list, an ordinary one pays list, and a trained one pays ${Math.round((1 - at(50)) * 100)}% under`
        : `!! CURVE WRONG — 0:${at(0).toFixed(3)} 6:${at(6).toFixed(3)} 50:${at(50).toFixed(3)}`;
      /* SATURATION IS THE ASSERTION, not the endpoints: the second fifty points must be worth
         much less than the first fifty, or the ceiling is only wherever the skill cap happens
         to sit and the number was picked by accident. */
      const first = at(6) - at(56), second = at(56) - at(106);
      R.andItNeverReachesFree = (at(400) > 0.75 && first > second * 1.6)
        ? `and it saturates — the first fifty points are worth ${(first / second).toFixed(1)}x the next fifty, and nothing is ever free (${at(400).toFixed(2)} at absurd charisma)`
        : `!! first fifty ${first.toFixed(3)}, next fifty ${second.toFixed(3)}, floor ${at(400).toFixed(3)}`;
    });

    /* ---------- 3. AND IT IS TRAINED BY DOING IT, WIN OR LOSE ---------- */
    guard(['tradingTeachesIt', 'andSoDoesACheckYouLOST', 'andItIsNotFarmedByTheCheapestClick'], () => {
      wipe();
      const c = mk({ race: 'human', sub: 'dustborn' });
      const was = c.stats.charisma;
      tradeLearned(c, 400);
      const afterTrade = c.stats.charisma;
      R.tradingTeachesIt = afterTrade > was
        ? `a deal worth 400 gold moves the talker's charisma ${was.toFixed(2)} → ${afterTrade.toFixed(2)}`
        : `!! TRADING TAUGHT NOTHING (${was} → ${afterTrade})`;
      const beforeLoss = c.stats.charisma;
      socialTried(c, false);
      R.andSoDoesACheckYouLOST = c.stats.charisma > beforeLoss
        ? `and a check they FAILED still teaches — ${beforeLoss.toFixed(2)} → ${c.stats.charisma.toFixed(2)} — so a bad run is climbable`
        : `!! A FAILED CHECK TAUGHT NOTHING (${beforeLoss} → ${c.stats.charisma})`;
      /* THE LAW OF THE SHOVEL, WHICH THIS FILE'S NEIGHBOUR ALREADY LEARNED THE HARD WAY. Labour
         paid a flat rate per action and was capped off one woodpile in eleven minutes. Selling
         five hundred rats one at a time must not out-train a season of real commerce. */
      const d = mk({ race: 'human', sub: 'dustborn' }), e = mk({ race: 'human', sub: 'dustborn' });
      const d0 = d.stats.charisma;
      for (let i = 0; i < 200; i++) tradeLearned(d, 2);        /* two hundred worthless deals */
      const cheap = d.stats.charisma - d0;
      const e0 = e.stats.charisma;
      for (let i = 0; i < 4; i++) tradeLearned(e, 900);        /* four real ones, same total gold */
      const dear = e.stats.charisma - e0;
      R._farm = `200 deals of 2g taught ${cheap.toFixed(2)}; 4 deals of 900g taught ${dear.toFixed(2)}`;
      R.andItIsNotFarmedByTheCheapestClick = dear > cheap
        ? `and it rides on gold moved rather than on clicks — four real deals teach ${(dear / Math.max(cheap, 0.001)).toFixed(1)}x what two hundred worthless ones do`
        : `!! THE CHEAPEST CLICK FARMS IT (${cheap.toFixed(2)} vs ${dear.toFixed(2)})`;
      wipe();
    });

    /* ---------- 4. THE GATE IS WATCHED AND THE MIDDLE OF TOWN IS NOT ----------
       This is the measurement the whole second half came out of, made into an assertion. */
    guard(['theGateIsWhereTheWatchStands'], () => {
      const t = towns[0];
      const wr = (t.def.wall ? t.def.wall.r : 20);
      const nearest = (x, y) => chars.filter(o => o.faction === 'town' && !o.civ && o.state === 'ok' && o.homeTown === t)
        .map(o => dist(o.x, o.y, x, y)).sort((a, c) => a - c)[0];
      const mid = nearest(t.x + 1, t.y + 1), gate = nearest(t.x + wr - 1, t.y);
      R._watch = `${t.name}: nearest posted guard is ${mid.toFixed(1)} tiles from the middle, ${gate.toFixed(1)} from the gate`;
      R.theGateIsWhereTheWatchStands = (gate < mid)
        ? `the watch stands at the gate and not in the square — ${gate.toFixed(1)} tiles against ${mid.toFixed(1)} — so a search has to be a crossing rather than a poll of the town`
        : `!! the middle is as watched as the gate (${mid.toFixed(1)} vs ${gate.toFixed(1)})`;
    });

    /* ---------- 5. WALKING IN WITH IT ON YOU IS A STOP ---------- */
    guard(['walkingInWithItIsAStop', 'andStandingAroundOutsideIsNot', 'andTheWallIsWatchedAllTheWayRound'], () => {
      wipe();
      const t = towns[0];
      const wr = (t.def.wall ? t.def.wall.r : 20);
      /* ---------- BUILD THE GRID, OR EVERY `charsNear` IN THE GAME READS EMPTY ----------
         This file pauses on the frame after START, and the char grid is rebuilt by the TICK.
         So nothing had ever put anybody into it: the stop's guard lookup went through
         `charsNear` and found zero guards standing a tile and a half away, and the probe read
         that as "the gate is asleep" for two whole claims. The game is fine — it is never
         paused at boot in play — and the measurement was the thing that was wrong.
         Worth remembering generally: a harness that pauses immediately is running a world in
         which nothing derived from a tick has been computed even once. */
      rebuildCharGrid();
      /* the real function, with the modal swapped for a counter — opening a window per crossing
         would block the loop and measure the UI rather than the rule */
      const realStop = window.theStop;
      let stops = 0;
      window.theStop = () => { stops++; _stopOpen = false; };
      const run = (sx, sy, gx, gy, tries) => {
        stops = 0;
        const c = mk({ race: 'human', sub: 'dustborn' });
        c.inv = { tome: 1 };
        for (let i = 0; i < tries; i++) {
          c.stoppedDay = -9; c._walls = null; c.x = sx; c.y = sy;
          contrabandCheck();                       /* register "outside" */
          c.x = gx; c.y = gy;
          contrabandCheck();                       /* and the crossing */
        }
        const n = stops;
        const i2 = chars.indexOf(c); if (i2 >= 0) chars.splice(i2, 1);
        const i3 = probes.indexOf(c); if (i3 >= 0) probes.splice(i3, 1);
        return n;
      };
      const inGate = run(t.x + wr + 6, t.y, t.x + wr - 2, t.y, 40);
      R._gate = `40 walks in past the gate carrying a forbidden book: ${inGate} stops`;
      R.walkingInWithItIsAStop = inGate >= 12
        ? `walking in past a watched gate with it on you is a real risk — ${inGate} stops in 40 crossings, where the old build managed none at all in five days of standing in the square`
        : `!! ONLY ${inGate} STOPS IN 40 CROSSINGS`;
      /* AND IT IS A CROSSING, NOT A POLL: standing outside must never trigger one, or the
         "gate" reading is a coincidence. */
      stops = 0;
      {
        const c = mk({ race: 'human', sub: 'dustborn' });
        c.inv = { tome: 1 }; c.x = t.x + wr + 30; c.y = t.y; c._walls = null;
        for (let i = 0; i < 200; i++) { c.stoppedDay = -9; contrabandCheck(); }
        R.andStandingAroundOutsideIsNot = stops === 0
          ? 'and two hundred checks made out on the road produce nothing, because a search is a thing that happens at a gate'
          : `!! ${stops} STOPS WHILE STANDING OUTSIDE THE WALLS`;
        const i2 = chars.indexOf(c); if (i2 >= 0) chars.splice(i2, 1);
        const i3 = probes.indexOf(c); if (i3 >= 0) probes.splice(i3, 1);
      }
      /* ---------- AND THERE IS NO QUIET CORNER, WHICH IS NOT WHAT I EXPECTED ----------
         The first version of this claim asserted the opposite: that coming over the wall far
         from the gate would be quieter, because that is the better game. Measured, it is simply
         not this world — Dustport fields eighteen guards standing at radius 19-25 and the
         nearest one to ANY point on its wall is between two and seven tiles. The far corner
         produced 22 stops against the gate's 18, which is the same number twice.
         So the claim is the measurement instead of the hope. It matters because it says what
         the mechanic actually asks of the player: not a route, but what is in the pack and whose
         pack it is — which is the choice the shared stash already offered and which nobody had
         a reason to make until now. */
      const far = run(t.x - wr - 6, t.y - wr - 6, t.x - wr + 2, t.y - wr + 2, 40);
      const gs = chars.filter(o => o.faction === 'town' && !o.civ && o.state === 'ok' && o.homeTown === t);
      let worst = 0;
      for (let a = 0; a < 12; a++) {
        const th = a / 12 * Math.PI * 2;
        const d = gs.map(o => dist(o.x, o.y, t.x + Math.cos(th) * wr, t.y + Math.sin(th) * wr)).sort((x, y) => x - y)[0];
        worst = Math.max(worst, d === undefined ? 999 : d);
      }
      R._far = `${gs.length} guards ring ${t.name}; worst gap at 12 points on the wall is ${worst.toFixed(0)} tiles; 40 crossings at the far corner gave ${far} stops against the gate's ${inGate}`;
      R.andTheWallIsWatchedAllTheWayRound = (worst < 12 && far > 0)
        ? `and there is no quiet corner to slip through — ${gs.length} guards ring the wall and the worst gap in twelve samples is ${worst.toFixed(0)} tiles, so the question the stop asks is what is in the pack rather than which way you came in`
        : `!! there is a ${worst.toFixed(0)}-tile hole in the watch (far corner gave ${far} stops)`;
      window.theStop = realStop;
      wipe();
    });

    /* ---------- 6. AND THE SCENE HAS SOMEWHERE TO GO ----------
       "create some dialogue options that could get you out of it (a charisma roll, bribe,
        resist, etc...)". The buttons are built inside `theStop`, so the only honest way to count
       them is to let the real thing open and read the window it made. */
    guard(['theStopIsAConversation', 'andTheTongueIsWhatTalksYouOut', 'andThereIsAWayOutForTheFrightening'], () => {
      wipe();
      const t = towns[0];
      const c = mk({ race: 'human', sub: 'dustborn' });
      c.inv = { tome: 1 }; c.x = t.x + 2; c.y = t.y;
      const g = chars.find(o => o.faction === 'town' && !o.civ && o.state === 'ok' && o.homeTown === t);
      theStop(c, g, t, ['tome']);
      const labels = [...document.querySelectorAll('#modalbody button')].map(x => x.textContent.trim());
      R._opts = labels.length + ' ways out: ' + labels.map(l => l.split('—')[0].trim()).join(' / ');
      const has = (re) => labels.some(l => re.test(l));
      R.theStopIsAConversation = (labels.length >= 5 && has(/TALK/) && has(/BRIBE/) && has(/HAND IT OVER/) && has(/FIGHT/))
        ? `being stopped opens ${labels.length} ways out rather than a verdict — talk, coin, surrender, steel, and more`
        : `!! ONLY ${labels.length}: ${labels.join(' | ')}`;
      R.andThereIsAWayOutForTheFrightening = has(/SEE WHAT YOU ARE/)
        ? 'and one of them is not talking at all — you can let them see what you are, which works on exactly the notoriety that makes talking impossible'
        : `!! NO WAY OUT THAT IS NOT CHARM OR COIN: ${labels.join(' | ')}`;
      $('modal').style.display = 'none'; modalOpen = false; _stopOpen = false;
      /* AND THE ODDS HAVE TO ANSWER TO THE STAT, or the option is a decoration. Same body, same
         town, same book — only the tongue changes. */
      const dumb = { ...c.stats }; c.stats.charisma = 0;
      const lo = talkOdds(c, t, ['tome']);
      c.stats.charisma = 80;
      const hi = talkOdds(c, t, ['tome']);
      c.stats = dumb;
      R._odds = `talking past the same guard with the same book: ${Math.round(lo * 100)}% at charisma 0, ${Math.round(hi * 100)}% at 80`;
      R.andTheTongueIsWhatTalksYouOut = hi > lo + 0.25
        ? `and the tongue is what does it — ${Math.round(lo * 100)}% at charisma 0 against ${Math.round(hi * 100)}% at 80, off the same guard and the same book`
        : `!! CHARISMA BARELY MOVES THE ODDS (${lo.toFixed(2)} → ${hi.toFixed(2)})`;
      wipe();
    });

    return R;
  });

  const bad = Object.values(out).filter(v => typeof v === 'string' && v.startsWith('!!'));
  for (const [k, v] of Object.entries(out)) console.log('  ' + (k.startsWith('_') ? ('· ' + k.slice(1)).padEnd(36) : k.padEnd(36)) + ' ' + v);
  for (const e of errs) console.log('  ' + e);
  console.log('');
  console.log(bad.length || errs.length ? `THE TONGUE BUYS NOTHING AND THE GATE IS ASLEEP (${bad.length + errs.length})`
                                        : 'A TONGUE IS WORTH SOMETHING, AND THE GATE IS AWAKE');
  await b.close();
  process.exit(bad.length || errs.length ? 1 : 0);
})();
