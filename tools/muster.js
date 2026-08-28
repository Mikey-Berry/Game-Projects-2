#!/usr/bin/env node
/* FOUR SMALL THINGS THE WORLD WAS GETTING WRONG ABOUT ITSELF.
 *
 *   · "When unique (named) NPCs join the squad, they boot over the main character from the
 *      leftmost spot on the squad menu. For continuity, they should simply go at the very end."
 *   · "Paladins, despite hating undead, do not attack cairn beasts or Malathuun's Answers.
 *      They simply ignore them — an odd discrepancy."
 *   · "Some small indicator on the mini-map to show which direction (NSEW) the camera is
 *      facing would be helpful."
 *   · "Paladins raised as undead should keep their silly looking little hat."
 *
 * Three of the four are about a body carrying WHAT IT WAS across some boundary — a hire, a
 * raising, a reload — and the fourth is about the map agreeing with the view. None of them is
 * a system; all of them are the kind of thing that reads as sloppiness rather than as a bug,
 * which is exactly why they need a test that will not quietly stop asking.
 *
 *   node tools/muster.js [game.html]
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
  await p.evaluate(() => { document.getElementById('btn-start').click(); paused = true; });
  await p.waitForTimeout(2600);

  const out = await p.evaluate(() => {
    const R = {};
    paused = true;
    const guard = (keys, fn) => {
      try { fn(); } catch (e) { for (const k of keys) if (R[k] === undefined) R[k] = '!! ' + String(e.message).slice(0, 110).toUpperCase(); }
    };

    /* ================== 1. WHO IS THE MAIN CHARACTER ==================
       Staged the way the world stages it: a named body placed at WORLDGEN, which is to say
       earlier in `chars` than the protagonist, who is pushed on the end by `applyCreation`.
       That ordering is the whole bug, and it is invisible to any probe that makes its test
       NPC after the player. */
    guard(['youStayTheMainCharacter', 'andTheNewcomerGoesOnTheEnd', 'andItSurvivesAReload'], () => {
      const me = player()[0];
      me.name = 'THE PROTAGONIST';
      const named = makeChar('Somebody Famous', 'drifter', me.x + 2, me.y, { atk: 9, def: 9 });
      named.state = 'ok';
      chars.unshift(named);                 /* placed at worldgen: ahead of everyone */
      named.faction = 'player'; named.neutral = false;
      R._order = `chars has the newcomer at ${chars.indexOf(named)} and you at ${chars.indexOf(me)}`;
      R.youStayTheMainCharacter = player()[0] === me
        ? `you are still player()[0] with a recruit sitting ahead of you in the array`
        : `!! player()[0] IS NOW ${player()[0].name} — THE RECRUIT IS THE MAIN CHARACTER`;
      /* and the bar, which is what was actually reported */
      refreshSquadBar();
      const names = [...document.querySelectorAll('#squadbar .port .nm')].map(x => x.textContent.trim());
      R._bar = names.slice(0, 4).join(' | ');
      R.andTheNewcomerGoesOnTheEnd = (names.length > 1 && /THE PROTAGONIST/.test(names[0]) &&
        names.findIndex(n => /Somebody Famous/.test(n)) === names.length - 1)
        ? `the bar reads you first and the newcomer last, across ${names.length} of them`
        : `!! THE BAR READS: ${names.join(' | ')}`;
      /* a flag that does not survive a save puts the recruit back in front on the next load */
      restore(JSON.parse(JSON.stringify(snapshot())));
      const back = player()[0];
      R.andItSurvivesAReload = (back && back.name === 'THE PROTAGONIST')
        ? 'and a reload hands you back yourself, not whoever worldgen happened to place first'
        : `!! AFTER A RELOAD player()[0] IS ${back ? back.name : 'NOBODY'}`;
      for (let i = chars.length - 1; i >= 0; i--) if (chars[i].name === 'Somebody Famous') chars.splice(i, 1);
    });

    /* ================== 2. THE PURGE AND THE THINGS MADE OF THE DEAD ==================
       A cairn beast is a heap of corpses that got up; an Answer is the sundered ground itself
       standing. Both are built `fauna`/`beast`/`neutral` rather than `undead`, which is the
       technicality they were hiding behind. Asked through `hostile`, which is the function
       that actually decides, in both directions. */
    guard(['theOrderKnowsAHeapOfTheDead', 'andSoDoesSisterAsh', 'andItStillIgnoresTheLiving'], () => {
      const me = player()[0];
      const mk = (fac, o) => { const c = makeChar('X', fac, me.x + 3, me.y + 3, { atk: 10, def: 10 }); c.state = 'ok'; Object.assign(c, o); chars.push(c); return c; };
      const pal = mk('purge', {});
      const ash = mk('exile', {});
      const beast = mk('fauna', { beast: true, neutral: true, bossKey: 'cairn', kin: 'cairn', big: 1.6 });
      const answer = mk('fauna', { beast: true, neutral: true, bossKey: 'cairn', kin: 'cairn', big: 2.3, cursed: true });
      const deer = mk('fauna', { beast: true, neutral: true, kin: 'grazer' });
      const both = (a, b2) => hostile(a, b2) && hostile(b2, a);
      R.theOrderKnowsAHeapOfTheDead = (both(pal, beast) && both(pal, answer))
        ? 'a Paladin will fight a cairn beast and an Answer, from either side of the question'
        : `!! THE ORDER STILL IGNORES THEM (beast ${hostile(pal, beast)}/${hostile(beast, pal)}, answer ${hostile(pal, answer)}/${hostile(answer, pal)})`;
      R.andSoDoesSisterAsh = both(ash, beast)
        ? 'and so does an exile, whose standing order has always been the dead she can see'
        : `!! AN EXILE STILL IGNORES A CAIRN BEAST (${hostile(ash, beast)}/${hostile(beast, ash)})`;
      /* AND IT IS THE DEAD THEY ARE ANSWERING, NOT EVERY BEAST. A rule written as "the Purge
         fights fauna" would pass everything above and start a war with the deer. */
      R.andItStillIgnoresTheLiving = (!hostile(pal, deer) && !hostile(ash, deer))
        ? 'while an ordinary grazer is still none of their business'
        : `!! THE ORDER HAS DECLARED WAR ON DEER (${hostile(pal, deer)}/${hostile(ash, deer)})`;
      for (const c of [pal, ash, beast, answer, deer]) { const i = chars.indexOf(c); if (i >= 0) chars.splice(i, 1); }
    });

    /* ================== 3. THE HAT ================== */
    guard(['aRaisedPaladinKeepsItsHelm', 'andAPlainCorpseDoesNot', 'andTheHelmRidesTheSave'], () => {
      const me = player()[0];
      const corpse = (fac) => {
        const c = makeChar('Fallen', fac, me.x + 2, me.y + 2, { atk: 8, def: 8 });
        c.state = 'dead'; c.rot = 'fresh'; chars.push(c); return c;
      };
      const pal = corpse('purge'), plain = corpse('town');
      const rp = castRaise(me, pal, { quiet: true }), rq = castRaise(me, plain, { quiet: true });
      R.aRaisedPaladinKeepsItsHelm = (rp && rp.wasOrder)
        ? 'a Paladin comes back up wearing the Order\'s helm'
        : `!! A RAISED PALADIN COMES BACK BARE-HEADED (${rp ? 'wasOrder ' + rp.wasOrder : 'IT DID NOT RISE'})`;
      R.andAPlainCorpseDoesNot = (rq && !rq.wasOrder)
        ? 'and an ordinary corpse does not get one for free'
        : '!! EVERY RISEN IS WEARING THE ORDER\'S HELM';
      /* the exact class of bug this repo has already been bitten by: `kin` was dropped from the
         snapshot and every risen reloaded as the generic rig */
      const id = rp && rp.id;
      restore(JSON.parse(JSON.stringify(snapshot())));
      const back = chars.find(c => c.id === id);
      R.andTheHelmRidesTheSave = (back && back.wasOrder)
        ? 'and it is still on after a reload, which is where `kin` was lost once already'
        : `!! THE HELM IS LOST TO A RELOAD (${back ? 'wasOrder ' + back.wasOrder : 'THE BODY IS GONE'})`;
    });

    /* ================== 4. THE COMPASS ==================
       The minimap is drawn north-up and never rotates; the world turns under the camera. The
       rose has to answer "which way am I looking", so the letter that lands at the top of it
       must change when the camera turns — and must be the right letter. */
    guard(['thereIsACompass', 'andItTurnsWithTheCamera'], () => {
      R.thereIsACompass = typeof drawCompass === 'function' ? 'the minimap draws a rose' : '!! THERE IS NO COMPASS ON THE MINIMAP';
      /* Read the geometry the rose is built from rather than the pixels: which world heading
         is up the screen. `camFwd` is the vector the rose projects onto, so this is the same
         arithmetic the drawing does, asked at four yaws a quarter-turn apart. */
      const was = camYaw;
      const top = (yaw) => {
        camYaw = yaw;
        const [fx, fy] = camFwd();
        return Math.abs(fy) > Math.abs(fx) ? (fy < 0 ? 'N' : 'S') : (fx > 0 ? 'E' : 'W');
      };
      const seen = [top(0), top(Math.PI / 2), top(Math.PI), top(-Math.PI / 2)];
      camYaw = was;
      R._rose = `looking ${seen.join(' then ')} as the camera turns a full circle`;
      R.andItTurnsWithTheCamera = new Set(seen).size === 4
        ? `and a full turn of the camera reads ${seen.join('/')} — four different headings, not a fixed arrow`
        : `!! THE ROSE READS ${seen.join('/')} THROUGH A FULL TURN`;
    });

    return R;
  });

  const bad = Object.values(out).filter(v => typeof v === 'string' && v.startsWith('!!'));
  for (const [k, v] of Object.entries(out)) console.log('  ' + k.padEnd(30) + v);
  for (const e of errs) console.log('  ' + e);
  console.log('');
  console.log(bad.length || errs.length ? `THE WORLD IS MISREMEMBERING ITSELF (${bad.length + errs.length})`
                                        : 'YOU ARE YOU, THE ORDER KNOWS ITS ENEMIES, AND NORTH IS SOMEWHERE');
  await b.close();
  process.exit(bad.length || errs.length ? 1 : 0);
})();
