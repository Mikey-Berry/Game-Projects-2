#!/usr/bin/env node
/* ONE ARROW, ONE WOUND — AND A FEED YOU CAN READ.
 *
 * Found while reading the projectile impact branch for something else entirely. There were
 * TWO applyDamage calls in it and both of them ran:
 *
 *     applyDamage(p.caster, p.target, pickPart(), p.dmg, p.wt, loud, false, false, p.ap);
 *     ... the MARKED block, the arrival thud ...
 *     applyDamage(p.caster, p.target, pickPart(), p.dmg, p.wt, loud);
 *
 * The armour pass replaced the original line with an armour-piercing one. The audio pass was
 * authored against a copy of the file from before that, and when it landed it brought the old
 * line back in beside the new one. Eleven lines apart, with a sound cue between them, and a
 * simulation raises no complaint about hitting a man twice — so every arrow, bolt and lance
 * shot in the game had been landing double for as long as both passes had been in the file.
 *
 * Nothing in the suite could see it. Every combat harness asked whether somebody went down,
 * and somebody always did — twice as fast as they should have, which reads as a working bow.
 * So this file counts the WOUNDS AGAINST THE SHOTS, which is the only question that catches
 * it: fire two dozen arrows, count how many landed, count how many times damage was applied,
 * and insist the two numbers match.
 *
 * It also covers the rest of the batch that came out of the same read — the log spam, the
 * stray-shot notices from the far side of the map, the Eyes counting as whole bodies, and how
 * far a squad's attention reaches.
 *
 *   node tools/arrow.js [game.html]
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
  /* start and stop in the same breath — a click followed by a wait lets the world run for
     however many frames the machine manages, and every number below inherits that */
  await p.evaluate(() => { document.getElementById('btn-start').click(); paused = true; });
  await p.waitForTimeout(3000);

  const out = await p.evaluate(() => {
    const R = {};
    paused = true;

    /* open ground, well away from anything that would wander into the experiment */
    let gx = 0, gy = 0;
    outer:
    for (let y = 60; y < H - 60; y += 5) for (let x = 60; x < W - 60; x += 5) {
      if (isBlocked(x + 0.5, y + 0.5)) continue;
      if (towns.some(t => dist(t.x, t.y, x, y) < 70)) continue;
      let ok = true;
      for (let j = -14; j <= 14 && ok; j++) for (let i = -14; i <= 14 && ok; i++)
        if (isBlocked(x + i + 0.5, y + j + 0.5)) ok = false;
      if (ok) { gx = x; gy = y; break outer; }
    }
    R.ground = gx ? `staged on open waste at ${gx},${gy}` : '!! NO OPEN GROUND';

    const drop = (c) => {
      const i = chars.indexOf(c); if (i >= 0) chars.splice(i, 1);
      const j = corpses.indexOf(c); if (j >= 0) corpses.splice(j, 1);
      const k = selected.indexOf(c); if (k >= 0) selected.splice(k, 1);
    };

    /* ============================================================ ONE ARROW, ONE WOUND */
    {
      const shooter = makeChar('Probe Archer', 'player', gx, gy, { atk: 6, def: 4, tough: 8, ranged: 6 });
      const mark    = makeChar('Probe Mark',   'bandit', gx + 3, gy, { atk: 1, def: 0, tough: 40 });
      chars.push(shooter, mark);
      shooter.floor = mark.floor = 0;

      /* WHAT COUNTS AS A LANDING, WITHOUT ASKING THE THING BEING TESTED. A shot resolves one
         of two ways and both of them take it off the board, so "the projectile went away" is
         not an answer. The dodge branch is the one that announces itself — it floats the word
         `miss` over the body — so misses are counted off that, landings are shots minus
         misses, and the wound count is compared against the landings. On a build where the
         impact branch damages twice, that comparison is 2:1 and nothing else in the suite
         would notice, because twice the damage still reads as a working bow. */
      const realApply = applyDamage, realFloat = addFloat;
      let wounds = 0, misses = 0, apSeen = null, apArgs = 0;
      applyDamage = function (src, tgt, part, dmg, wt, loud, a, bb, ap) {
        if (tgt === mark) { wounds++; apSeen = ap; apArgs = arguments.length; }
        return realApply.apply(this, arguments);
      };
      addFloat = function (x, y, text) {
        if (String(text) === 'miss') misses++;
        return realFloat.apply(this, arguments);
      };

      const SHOTS = 24;
      projectiles.length = 0;
      for (let s = 0; s < SHOTS; s++) {
        /* it must survive being shot two dozen times, or the later shots resolve against a
           corpse and the count quietly stops climbing */
        mark.state = 'ok'; mark.blood = mark.maxBlood = 9000;
        for (const k in mark.parts) { mark.parts[k].hp = mark.parts[k].max = 900; mark.parts[k].severed = false; }
        mark.x = gx + 3; mark.y = gy; shooter.x = gx; shooter.y = gy;
        projectiles.push({
          x: gx, y: gy - 0.5, target: mark, speed: 13, floor: 0,
          dmg: 9, caster: shooter, wt: 'pierce', ap: 4, ff: false, arrow: true,
        });
        for (let i = 0; i < 40 && projectiles.length; i++) updateProjectiles(1 / 30);
        projectiles.length = 0;
      }
      applyDamage = realApply; addFloat = realFloat;

      const landed = SHOTS - misses;
      R.shots = `${SHOTS} arrows loosed, ${misses} dodged, ${landed} landed`;
      R.oneArrowOneWound = wounds === landed
        ? `and ${landed} landings did ${wounds} wounds — one arrow, one wound`
        : `!! ${landed} ARROWS LANDED AND DEALT ${wounds} WOUNDS (${(wounds / Math.max(1, landed)).toFixed(2)}x)`;
      /* and the wound that lands is the armour-aware one. The duplicate was the OLD call, the
         one from before armour existed — so a build that keeps the wrong one of the two is
         still one wound per arrow and still wrong. */
      R.andItIsTheArmouredOne = (landed === 0) ? '!! NOTHING LANDED, NOTHING TO CHECK'
        : (apSeen === 4 && apArgs >= 9)
          ? 'and it is the armour-piercing call that lands, ap and all — not the one from before armour existed'
          : `!! THE LANDING WOUND CARRIED ap=${apSeen} IN ${apArgs} ARGS`;

      drop(shooter); drop(mark);
    }

    /* ============================================================ A FEED YOU CAN READ */
    {
      const feed = document.getElementById('log');
      const lines = () => [...feed.children].map(d => d.textContent);
      feed.innerHTML = '';
      const cBefore = chronicle.length;
      for (let i = 0; i < 5; i++) log('The tree is felled.', '');
      const L = lines();
      R.repeatsCount = (L.length === 1 && /×5\s*$/.test(L[0]))
        ? `five identical notices are one line reading "${L[0]}"`
        : `!! FIVE REPEATS MADE ${L.length} LINE(S): ${JSON.stringify(L)}`;
      const grew = chronicle.length - cBefore;
      const lastE = chronicle[chronicle.length - 1];
      R.andTheRecordKeepsTheCount = (grew === 1 && lastE && lastE.n === 5)
        ? 'and the chronicle holds one entry carrying the count, not five copies of the sentence'
        : `!! THE CHRONICLE GREW BY ${grew} AND THE LAST ENTRY COUNTS ${lastE && lastE.n}`;

      /* ORDER IS THE ONE THING A LOG IS FOR. Two notices taking turns are two notices, and
         folding those together would lose which happened when. */
      feed.innerHTML = '';
      log('A.', ''); log('B.', ''); log('A.', ''); log('B.', '');
      R.butOnlyTheBottomLine = lines().length === 4
        ? 'and two notices taking turns stay four lines — only a repeat of the bottom line folds'
        : `!! ALTERNATING NOTICES COLLAPSED TO ${lines().length} LINE(S)`;
      feed.innerHTML = '';
    }

    /* ============================================================ WHOSE AXE IT WAS */
    {
      /* a felled tree somewhere: any node the world has, worked until it runs out */
      /* NOT `pick` — that is the game's own random-choice helper, and a local const of that
         name shadows it for the whole block */
      const findTree = () => {
        for (let y = 40; y < H - 40; y++) for (let x = 40; x < W - 40; x++)
          if (rawDecorAt(x, y) === 'tree' && !nodeDepleted(x, y)) return [x, y];
        return null;
      };
      const mine = makeChar('Mine',      'player', gx, gy, { labor: 4 });
      const their = makeChar('Somebody', 'town',   gx, gy, { labor: 4 });
      const runOut = (who) => {
        const q = findTree(); if (!q) return null;
        const before = chronicle.length;
        for (let i = 0; i < 40 && !nodeDepleted(q[0], q[1]); i++) useNode(q[0], q[1], who);
        return chronicle.length - before;
      };
      const theirs = runOut(their), ours = runOut(mine);
      R.theWorldsWorkIsNotNews = theirs === 0
        ? "a town felling its own tree on the far side of the map says nothing"
        : `!! A STRANGER'S TREE WROTE ${theirs} LINE(S)`;
      R.andMineStillIs = ours === 1
        ? 'and my own labourer felling one still says so'
        : `!! MY OWN TREE WROTE ${ours} LINE(S)`;
      drop(mine); drop(their);
    }

    /* ============================================================ A STRAY SHOT, AND WHOSE */
    {
      const stray = (fa, fb) => {
        const a = makeChar('A', fa, gx, gy, { atk: 2, tough: 20 });
        const c = makeChar('B', fb, gx + 2, gy, { atk: 2, tough: 20 });
        chars.push(a, c); a.floor = c.floor = 0;
        c.blood = c.maxBlood = 9000;
        for (const k in c.parts) { c.parts[k].hp = c.parts[k].max = 900; }
        const before = chronicle.length;
        projectiles.length = 0;
        projectiles.push({ x: gx, y: gy - 0.5, target: c, speed: 13, floor: 0, dmg: 4,
                           caster: a, wt: 'pierce', ap: 0, ff: true, arrow: false });
        for (let i = 0; i < 40 && projectiles.length; i++) updateProjectiles(1 / 30);
        projectiles.length = 0;
        const said = chronicle.slice(before).filter(e => /stray shot/.test(e.m)).length;
        drop(a); drop(c);
        return said;
      };
      const far = stray('town', 'town'), near = stray('player', 'player');
      R.aStrayShotAcrossTheWorld = far === 0
        ? 'two town levies clipping each other on the far side of the map is not news'
        : `!! A STRANGER'S STRAY SHOT WROTE ${far} LINE(S)`;
      R.butMyOwnManStill = near === 1
        ? 'and my own archer putting one into my own line still says so'
        : `!! MY OWN STRAY SHOT WROTE ${near} LINE(S)`;
    }

    /* ============================================================ A QUARTER OF A BODY */
    {
      /* `bodyWorth` is the thing under test and a build without it must go RED here rather
         than throwing a ReferenceError and taking every other assertion in this file down
         with it — a harness that dies before it reports is a harness that proves nothing. */
      const worth = (c) => (typeof bodyWorth === 'function' ? bodyWorth(c) : 1);
      const fodder = () => corpses.reduce((n, c) => n + (cairnFood(c) ? worth(c) : 0), 0);
      const base = fodder();
      const eyes = [];
      for (let i = 0; i < 4; i++) {
        const e = spawnGaunt('eye', gx + 4 + i, gy + 4);
        e.state = 'dead'; e.deadAt = day + hour / 24; e.looted = true;
        corpses.push(e); eyes.push(e);
      }
      R.fourEyesAreOneBody = Math.abs((fodder() - base) - 1) < 1e-6
        ? 'four Eyes on the ground weigh one body to the thing in the fields, not four'
        : `!! FOUR EYES WEIGH ${(fodder() - base).toFixed(2)} BODIES`;

      const remBefore = campHas('remains');
      const fresh = harvestCorpse(eyes[0], true, null);
      R.andAFreshOneRendersDownSmall = (fresh >= 0 && fresh <= 1)
        ? `and rendering a fresh one gives ${fresh} Mortal Remains, not a man's worth`
        : `!! A FRESH EYE RENDERED DOWN TO ${fresh} REMAINS`;
      /* one that has been lying out has nothing in it at all, and the knife says so rather
         than reporting a harvest of zero */
      eyes[1].deadAt = day - 20;
      const old = harvestCorpse(eyes[1], true, null);
      R.andAnOldOneHasNothingInIt = (old === 0 && !corpses.includes(eyes[1]) && !chars.includes(eyes[1]))
        ? 'and one that has been lying in the sun renders down to nothing, and is cleared anyway'
        : `!! AN OLD EYE GAVE ${old} REMAINS (cleared: ${!corpses.includes(eyes[1])})`;
      /* the control: an ordinary body is still an ordinary body */
      const man = makeChar('Probe Dead', 'town', gx + 6, gy + 6, { tough: 6 });
      man.state = 'dead'; man.deadAt = day + hour / 24; man.looted = true;
      chars.push(man); corpses.push(man);
      const manRem = harvestCorpse(man, true, null);
      R.andAManIsStillAMan = manRem >= 1
        ? `and a whole body still renders down to ${manRem} — it is the Eyes that changed, not the knife`
        : `!! AN ORDINARY BODY RENDERED DOWN TO ${manRem}`;
      R.stores = `stores went from ${remBefore} to ${campHas('remains')}`;
      for (const e of eyes) drop(e);
      drop(man);
    }

    /* ============================================================ HOW FAR HELP REACHES */
    {
      const at = (d) => {
        const c = makeChar('Watcher', 'player', gx, gy, { atk: 5, def: 5, tough: 10, ath: 5 });
        const foe = makeChar('Trouble', 'bandit', gx + d, gy, { atk: 5, def: 5, tough: 10 });
        chars.push(c, foe); c.floor = foe.floor = 0;
        c.autoFight = true; c.target = null; c.moveTarget = null;
        /* ---------- A BODY PUSHED INTO `chars` IS NOT YET SOMEWHERE ----------
           Proximity in this game goes through a spatial hash, and the hash is rebuilt by the
           frame loop — which is stopped, because the whole point of the staging is that the
           world holds still. Without this line `charsNear` cannot see either body and BOTH
           assertions below go quiet: the nine-tile one goes red honestly, and the twelve-tile
           control goes GREEN for exactly the wrong reason, reporting "out of range" when the
           truth is "not on the map". A negative control that cannot tell those two apart is
           not a control. */
        rebuildCharGrid();
        for (let i = 0; i < 12 && !c.target; i++) { c.state = 'ok'; physics(c, 1 / 30); }
        const got = c.target === foe;
        drop(c); drop(foe);
        return got;
      };
      const nine = at(9), twelve = at(12);
      R.helpReachesAcrossAFight = nine
        ? 'a scrap nine tiles off is close enough for my own people to notice it'
        : '!! A FIGHT NINE TILES AWAY IS STILL INVISIBLE TO MY OWN LINE';
      /* and it is a radius and not the whole map — a squad that charges everything in sight
         from twelve tiles is a different bug wearing the same fix */
      R.andItIsStillARadius = !twelve
        ? 'and twelve tiles is still somebody else’s business'
        : '!! MY LINE ACQUIRED A FOE TWELVE TILES OFF';
    }

    return R;
  });

  const bad = Object.values(out).filter(v => typeof v === 'string' && v.startsWith('!!'));
  for (const [k, v] of Object.entries(out)) console.log('  ' + k.padEnd(34) + v);
  for (const e of errs) console.log('  ' + e);
  console.log('');
  console.log(bad.length || errs.length
    ? `ARROWS LAND TWICE, OR THE FEED IS FULL OF SOMEBODY ELSE'S TREES (${bad.length + errs.length})`
    : 'ONE ARROW, ONE WOUND — AND A FEED WITH ONLY MY OWN NEWS IN IT');
  await b.close();
  process.exit(bad.length || errs.length ? 1 : 0);
})();
