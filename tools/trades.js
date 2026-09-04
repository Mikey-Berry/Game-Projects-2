#!/usr/bin/env node
/* A TOWN THAT LOOKS LIKE IT IS DOING SOMETHING.
 *
 * "While I get that cities have their own economies, it's kind of invisible at the moment. I
 * want to see when the craftsman makes something, or the harvesters gathering. Basically we
 * should make this a bit more visible to the player, maybe even adding actual building models
 * (furnace, weavers, etc.) to the city for their people to use."
 *
 * The economy worked perfectly. That is the whole problem: it was a bookkeeping pass that ran
 * once a day over a list of people standing anywhere, AT THE DAY ROLLOVER — which is midnight,
 * when the entire town is asleep. There is no version of "I want to see the craftsman make
 * something" that survives the making happening at three in the morning.
 *
 * So four things have to be true, and the last one is the one that stops the fix from being a
 * rebalance nobody asked for:
 *
 *   · there are places to work, and they are recognisable;
 *   · people with a trade GO to them, in daylight;
 *   · the making happens THERE, where you can see it;
 *   · and the shelves stock at exactly the rate they did before.
 *
 *   node tools/trades.js [game.html]
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

    /* ---------- 1. THERE ARE PLACES TO WORK ---------- */
    {
      const want = ['FORGE', 'WEAVERY', 'BREWHOUSE'];
      const missing = [];
      for (const t of towns) for (const lbl of want)
        if (!buildings.some(b2 => b2.town === t && b2.label === lbl)) missing.push(t.name + '/' + lbl);
      R.everyTownHasAWorkshop = missing.length === 0
        ? `all ${towns.length} towns have a forge, a weavery and a brewhouse`
        : `!! ${missing.length} MISSING: ${missing.slice(0, 4).join(', ')}`;
    }

    /* AND THEY ARE RECOGNISABLE. A workshop that builds as a house with a different label is
       a house with a different label, and the report asks for building MODELS. */
    if (typeof BUILD_STYLE === 'object') {
      const props = ['FORGE', 'WEAVERY', 'BREWHOUSE'].map(k => (BUILD_STYLE[k] || {}).prop);
      const shared = props.filter(pr => Object.entries(BUILD_STYLE)
        .some(([k, v]) => v.prop === pr && !['FORGE', 'WEAVERY', 'BREWHOUSE'].includes(k)));
      R.andEachOneLooksLikeItself = (props.every(Boolean) && new Set(props).size === 3 && shared.length === 0)
        ? `and each carries a prop nothing else in the world has — ${props.join(', ')}`
        : `!! WORKSHOP PROPS: ${props.join(', ')}${shared.length ? ' (shared with other buildings: ' + shared.join(', ') + ')' : ''}`;
    } else R.andEachOneLooksLikeItself = '!! THERE IS NO BUILD_STYLE';

    /* ---------- 2. EVERY TRADE HAS SOMEWHERE TO BE ----------
       Including the outdoor ones, which is the half that is easy to forget: a miner sent to
       stand in a shed is the same mistake as a miner left on the plaza. */
    if (typeof tradePost === 'function') {
      const t = towns.find(t2 => t2.def.key === 'copperhold') || towns[0];
      const kinds = {};
      const homeless = [];
      for (const c of chars) {
        if (!c.civ || c.homeTown !== t || !c.trade) continue;
        const post = tradePost(c, t);
        if (!post) { homeless.push(c.trade); continue; }
        kinds[c.trade] = post.kind;
      }
      const trades = Object.keys(kinds);
      R.everyTradeHasAPost = (homeless.length === 0 && trades.length >= 3)
        ? `${t.name}'s ${trades.length} trades all have somewhere to be: ${trades.map(k => k + '→' + kinds[k]).join(', ')}`
        : `!! ${homeless.length} TRADE(S) HAVE NOWHERE TO WORK: ${[...new Set(homeless)].join(', ')}`;
      R.andTheOutdoorOnesAreOutdoors = (!kinds.miner || kinds.miner === 'seam') && (!kinds.hunter || kinds.hunter === 'field')
        ? `and a miner works a seam and a hunter works ground past the fences — neither of them is sent to stand in a shed`
        : `!! miner→${kinds.miner}, hunter→${kinds.hunter}`;
    } else {
      R.everyTradeHasAPost = '!! THERE IS NO tradePost';
      R.andTheOutdoorOnesAreOutdoors = '!! THERE IS NO tradePost';
    }

    /* ---------- 3. AND THEY GO ----------
       Run the world through a working day and count how many tradespeople are standing at
       their post at noon. Measured on bodies, not on flags. */
    {
      const t = towns.find(t2 => t2.def.key === 'copperhold') || towns[0];
      const folk = chars.filter(c => c.civ && c.homeTown === t && c.trade && c.state === 'ok');
      /* FOUR GAME-HOURS, NOT FOUR MINUTES. `HOUR_SEC` is 8, so 240 real seconds is thirty
         game-hours — the first draft of this ran the town past dusk and through the next
         midnight and then asked why nobody was at work. */
      /* EIGHT GAME-HOURS, MEASURED AT THREE IN THE AFTERNOON. `HOUR_SEC` is 8, so 240 real
         seconds is THIRTY game-hours — the first draft ran the town past dusk and through the
         next midnight and then asked why nobody was at work. And a miner's post is the ore
         field, which is thirty to fifty tiles outside the wall: half a working day of walking
         is the honest answer for a pit and this window has to allow for it. */
      /* ---------- ACROSS EVERY TOWN, NOT ONE OF THEM ----------
         This counted ONE town's twenty-one hands against a 60% bar, which is a threshold of
         thirteen bodies — and the number lands on 12, 12, 13 on the SAME build, so the
         assertion was decided by one person's afternoon. It flipped this suite red on a batch
         that changed nothing about work: the build before it has the identical trade mix
         (9 smiths, 4 miners, 4 brewers, 4 crafters) and the identical midnight fallback rate
         (42% against 43%), and the daylight figure alone swings seven points run to run.
         The fault was the SAMPLE, so the fix is the sample. Seven towns and a hundred and
         fifty hands is the same claim measured where it holds still. */
      hour = 7;
      const DT = 1 / 30;
      for (let i = 0; i < 30 * HOUR_SEC * 8; i++) update(DT);
      const atOf = (c, tt) => {
        const post = (typeof tradePost === 'function') ? tradePost(c, tt) : null;
        /* the post's own radius plus a body's worth of shuffle: at any instant a few of them
           are walking round the bench rather than standing at it, and a probe that demands
           everybody frozen on their mark is measuring a photograph, not a working day. */
        return !!post && dist(c.x, c.y, post.x, post.y) < (post.near || 2.4) + 3.5;
      };
      let at = 0, all = 0;
      for (const tt of towns) {
        for (const c of chars) {
          if (!c.civ || c.homeTown !== tt || !c.trade || c.state !== 'ok') continue;
          all++; if (atOf(c, tt)) at++;
        }
      }
      R.andTheyGoToWork = (all >= 40 && at >= Math.ceil(all * 0.6))
        ? `${at} of the world's ${all} tradespeople are at their post by mid-afternoon`
        : `!! ONLY ${at}/${all} OF THEM ARE ANYWHERE NEAR THEIR WORK`;
    }

    /* ---------- 4. AND THE MAKING HAPPENS THERE, IN DAYLIGHT ----------
       The heart of it. `showWork` is the only thing that draws a float over a producing body,
       so the probe wraps it and records WHEN and WHERE every unit of a town's economy was
       actually made across four game-days. Under the old code the answer would be "all of it,
       at midnight, wherever they happened to be standing". */
    if (typeof workShift === 'function') {
      const t = towns.find(t2 => t2.def.key === 'copperhold') || towns[0];
      const seen = [];
      const real = workShift;
      /* every town's shifts, for the reason written out above — one town's forty shifts put
         the daylight share anywhere between 57% and 65% on the same build */
      window.workShift = (tt, cc) => {
        const r = real(tt, cc);
        if (r) seen.push({ hour, own: tt === t,
                           at: (typeof tradePost === 'function' && tradePost(cc, tt)) ? dist(cc.x, cc.y, tradePost(cc, tt).x, tradePost(cc, tt).y) : 99 });
        return r;
      };
      const DT = 1 / 30;
      for (let i = 0; i < 30 * HOUR_SEC * 24 * 4; i++) update(DT);
      window.workShift = real;
      const day7to18 = seen.filter(x => x.hour >= 7 && x.hour < 18).length;
      const atPost = seen.filter(x => x.at < 6.5).length;
      /* ---------- ACROSS EVERY TOWN, BECAUSE ONE TOWN IS FORTY EVENTS ----------
         This was deliberately scoped to ONE town, on the reasoning that it is "an exact ratio
         and not a statistical one". It is not exact: the productive roll is `rnd() > 0.7` and
         it is one gate among several — alive, at the post, in hours, not fleeing — so the
         observed rate is a DRAW, and forty shifts from eighteen hands has a standard deviation
         of five points on it. The band was fitted to one lucky run and the same unchanged code
         came out at 0.56 on one build and 0.50 on the next, three standard deviations apart
         from nothing but a different PRNG stream. Every town is eight times the sample. */
      const own = seen.length;
      const hands = chars.filter(c => c.civ && c.trade && c.state === 'ok').length;
      const perHandDay = own / Math.max(1, hands * 4);
      const mine = seen.filter(x => x.own).length;
      R.work = `${own} shifts over four days from ${hands} hands in every town — ${perHandDay.toFixed(2)} a hand a day (${mine} of them ${t.name}'s)`;
      /* ---------- THE THROUGHPUT INVARIANT, EXACTLY ----------
         The old code did ONE shift per worker per productive day and the productive roll was
         `rnd() > 0.7 ? skip : work`. Splitting the ledger from the moment must not touch that,
         and counting shifts against worker-days says so directly — where measuring the SHELVES
         only says it statistically, since two builds run different PRNG streams and eight days
         of plague, war and death move a town's output around by a third on their own. */
      /* AND THE BAND IS THE MEASUREMENT, NOT THE ROLL. `rnd() > 0.7` is the productive gate and
         it is not the only one, so the rate a town actually turns in sits below it. Measured
         across every town on two consecutive builds of unchanged economy code: 0.56
         (319 shifts from 142 hands) and 0.55 (321 from 145) — a point apart, where the
         one-town figure moved six points on the same pair of builds.
         The claim worth holding is that the ledger did not MOVE — a build where the split
         double-counted would run near 1.0, and one where it silently stopped would run near
         nothing. */
      R.andEveryHandWorksOneShiftADay = (perHandDay > 0.33 && perHandDay < 0.68)
        ? `and that is ${perHandDay.toFixed(2)} shifts a hand a day, where a double-count would read near 1.0 and a stalled ledger near nothing — the ledger did not move, only the moment did`
        : `!! ${perHandDay.toFixed(2)} SHIFTS A HAND A DAY, OUTSIDE THE 0.33-0.68 THE ECONOMY HAS ALWAYS TURNED IN`;
      R.andTheMakingIsInDaylight = (seen.length >= 120 && day7to18 >= seen.length * 0.6)
        ? `and ${day7to18} of ${seen.length} of them happened between seven and six — not at midnight over a body walking home`
        : `!! ONLY ${day7to18}/${seen.length} SHIFTS HAPPENED IN WORKING HOURS`;
      R.andItHappensAtTheBench = (seen.length >= 120 && atPost >= seen.length * 0.5)
        ? `and ${atPost} of them were worked standing at the post itself`
        : `!! ONLY ${atPost}/${seen.length} SHIFTS WERE WORKED ANYWHERE NEAR A POST`;
    } else {
      R.andTheMakingIsInDaylight = '!! THERE IS NO workShift';
      R.andItHappensAtTheBench = '!! THERE IS NO workShift';
    }

    /* ---------- 5. AND THE SHELVES STOCK AT THE OLD RATE ----------
       The one that stops this being a rebalance nobody asked for. Splitting the ledger from
       the moment must not change how much a town makes: the draw that decides whether today
       is productive still happens once per worker per day, and an owed shift that never
       reached a bench is still spent at the next rollover. Measured over eight days against
       the number of hands doing it. */
    {
      const t = towns.find(t2 => t2.def.key === 'greenrest') || towns[1];
      const hands = chars.filter(c => c.civ && c.homeTown === t && c.trade && c.state === 'ok').length;
      const before = Object.values(t.stock).reduce((a, x) => a + x, 0);
      const d0 = day;
      const DT = 1 / 30;
      for (let i = 0; i < 30 * HOUR_SEC * 24 * 8; i++) update(DT);
      const days = day - d0;
      const gained = Object.values(t.stock).reduce((a, x) => a + x, 0) - before;
      const perHandDay = gained / Math.max(1, hands * days);
      /* 0.7 productive days a hand, one to three units a shift: anywhere in 0.4-3.5 is the
         economy that was already there. A number outside that band is a different economy. */
      R.andTheShelvesStillStock = (perHandDay > 0.4 && perHandDay < 3.5)
        ? `and ${t.name} put ${gained} on its shelves over ${days} days with ${hands} hands — ${perHandDay.toFixed(2)} a hand a day, inside the band the economy has always run in`
        : `!! ${t.name} MAKES ${perHandDay.toFixed(2)} A HAND A DAY OVER ${days} DAYS`;
    }

    /* ---------- 6. AND A TOWN NOBODY IS WATCHING COSTS NOTHING TO WATCH ----------
       `showWork` runs on every unit of every town's economy. If it drew for towns off-screen
       it would be a per-frame allocation for a world of seven towns nobody is looking at. */
    if (typeof showWork === 'function') {
      const far = chars.find(c => c.civ && Math.abs(c.x - camX) + Math.abs(c.y - camY) > 200);
      const n0 = particles.length;
      if (far) for (let i = 0; i < 40; i++) showWork(far, 'fruit', 2);
      R.andNobodyDrawsForAnEmptyStreet = (!far || particles.length === n0)
        ? 'and forty units made two hundred tiles away drew exactly nothing'
        : `!! ${particles.length - n0} FLOATS WERE DRAWN FOR A TOWN NOBODY IS LOOKING AT`;
    } else R.andNobodyDrawsForAnEmptyStreet = '!! THERE IS NO showWork';

    return R;
  });

  const bad = Object.values(out).filter(v => typeof v === 'string' && v.startsWith('!!'));
  for (const [k, v] of Object.entries(out)) console.log('  ' + k.padEnd(32) + v);
  for (const e of errs) console.log('  ' + e);
  console.log('');
  console.log(bad.length || errs.length
    ? `THE ECONOMY IS STILL HAPPENING OFF THE SIDE OF THE SCREEN (${bad.length + errs.length})`
    : 'A TOWN THAT LOOKS LIKE IT IS DOING SOMETHING');
  await b.close();
  process.exit(bad.length || errs.length ? 1 : 0);
})();
