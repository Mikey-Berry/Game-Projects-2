#!/usr/bin/env node
/* WHAT SOMEBODY IS WEARING, AS OPPOSED TO WHOSE SIDE THEY ARE ON.
 *
 * "We don't need everyone in my faction to wear the same 'player blue' colors. In fact, it's
 * more jarring if they change after being recruited as a wanderer. Let's kill that color and
 * use the regular generic palette instead. (Keep red for bandits, that's somewhat helpful.)"
 *
 * The second sentence names the actual fault and it is the one worth a harness: colour was
 * keyed to ALLEGIANCE, so hiring somebody REPAINTED THEM. A drifter met on the road in brown
 * turned blue the moment they signed. Clothes do not do that.
 *
 * So the sharp case here is a BEFORE AND AFTER on one body — read the cloth, change the
 * faction, read it again, and insist nothing moved. Everything else in the file is a control
 * on the things that were supposed to stay: bandit red, a legible map, and a palette that is
 * a palette rather than one drab uniform.
 *
 *   node tools/livery.js [game.html]
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
    const born = [];
    const mk = (fac) => {
      const c = makeChar('Probe', fac, 500, 500, { atk: 5, def: 5, tough: 10 });
      c.__probe = true; c.state = 'ok'; chars.push(c); born.push(c); return c;
    };
    const clean = () => { for (let i = chars.length - 1; i >= 0; i--) if (chars[i].__probe) chars.splice(i, 1); };

    /* ---------- 1. THE ONE THAT WAS REPORTED ----------
       One body, read twice, with nothing changed between the readings except who is paying
       them. This is the whole complaint and it is a two-line test. */
    {
      const w = mk('drifter');
      const before = factionColor(w);
      w.faction = 'player';          /* exactly what hiring a wanderer does */
      const after = factionColor(w);
      R.hiringDoesNotRepaintAnybody = before === after
        ? `a drifter hired into your outfit is still wearing ${after} — the same shirt they had on the road`
        : `!! HIRING REPAINTED THEM ${before} → ${after}`;
    }

    /* ---------- 2. AND THE BLUE IS GONE ----------
       Off the WORLD, not off the function: a table can be edited and a body can still be
       built from a colour somebody hard-coded three thousand lines away. */
    {
      const mine = chars.filter(c => c.faction === 'player' && c.state !== 'dead' && !c.undead);
      const blue = mine.filter(c => factionColor(c).toLowerCase() === '#3f8fe0');
      R.andNobodyOfYoursIsBlue = (mine.length > 0 && blue.length === 0)
        ? `and none of your ${mine.length} wear the old livery`
        : `!! ${blue.length}/${mine.length} OF YOURS ARE STILL PLAYER BLUE`;
    }

    /* ---------- 3. AND IT IS A PALETTE, NOT A NEW UNIFORM ----------
       Replacing one colour with one other colour would pass everything above and would be the
       same complaint in a different shade. */
    {
      const seen = new Set();
      for (let i = 0; i < 40; i++) seen.add(factionColor(mk('player')));
      R.andTheyDoNotAllMatch = seen.size >= 5
        ? `and forty of them came out in ${seen.size} different shades`
        : `!! FORTY BODIES WORE ${seen.size} COLOUR(S)`;
    }

    /* ---------- 4. CONTROLS: WHAT WAS SUPPOSED TO STAY ---------- */
    {
      const bandit = mk('bandit');
      R.andBanditsAreStillRed = factionColor(bandit).toLowerCase() === '#b0402e'
        ? 'and a bandit is still red, which was the one colour asked to stay'
        : `!! A BANDIT IS ${factionColor(bandit)}`;

      const guard = mk('town'); guard.guard = { x: 0, y: 0 };
      const civ = mk('town'); civ.civ = true;
      R.andAUniformIsStillAUniform = (factionColor(guard) !== factionColor(civ) && factionColor(guard) === '#8a8a7a')
        ? 'and a town watchman still wears the watch, while the baker beside him does not'
        : `!! WATCH ${factionColor(guard)} AGAINST CIVILIAN ${factionColor(civ)}`;
    }

    /* ---------- 5. AND THE MAP STILL SAYS WHOSE THEY ARE ----------
       This is the cost of the change and the reason it is affordable. Cloth stopped announcing
       allegiance; a map is a diagram and is allowed to. If both went at once the feature would
       be "you can no longer find your own people", which nobody asked for. */
    if (typeof allegianceColor === 'function') {
      const mine = mk('player'), theirs = mk('bandit'), road = mk('drifter');
      R.butTheMapStillDoes = (allegianceColor(mine) === '#3f8fe0' &&
                              allegianceColor(mine) !== factionColor(mine) &&
                              allegianceColor(theirs) !== allegianceColor(mine) &&
                              allegianceColor(road) !== allegianceColor(mine))
        ? 'but the minimap still paints yours blue and nobody else — the diagram kept the signal the shirt gave up'
        : `!! THE MAP CANNOT TELL THEM APART (mine ${allegianceColor(mine)}, bandit ${allegianceColor(theirs)}, drifter ${allegianceColor(road)})`;
    } else R.butTheMapStillDoes = '!! THERE IS NO allegianceColor';

    /* ---------- 6. AND THE RIG REBUILDS WHEN THE SHIRT CHANGES ----------
       `meshKey` names `factionColor(c)`, so two bodies in two shades must not share a cached
       rig — otherwise the palette exists in the table and nowhere on screen. */
    {
      const a = mk('player'), b2 = mk('player');
      let tries = 0;
      while (factionColor(a) === factionColor(b2) && tries++ < 40) { b2.id = b2.id + 1; }
      R.andTwoShadesAreTwoRigs = factionColor(a) === factionColor(b2) || colorKeyOf(a) !== colorKeyOf(b2)
        ? 'and two bodies in two shades do not share a cached rig'
        : `!! TWO SHADES SHARE ONE MESH KEY (${colorKeyOf(a)})`;
    }

    clean();
    return R;
  });

  const bad = Object.values(out).filter(v => typeof v === 'string' && v.startsWith('!!'));
  for (const [k, v] of Object.entries(out)) console.log('  ' + k.padEnd(32) + v);
  for (const e of errs) console.log('  ' + e);
  console.log('');
  console.log(bad.length || errs.length
    ? `THEY ARE STILL IN UNIFORM (${bad.length + errs.length})`
    : 'A SHIRT IS A SHIRT AND A MAP IS A MAP');
  await b.close();
  process.exit(bad.length || errs.length ? 1 : 0);
})();
