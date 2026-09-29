#!/usr/bin/env node
/* THE PUREBLOOD LINE, IN SALTMERE.
 *
 * "Saltmere's line of Salt-cured humans should be implied to be the pureblood descendants... I like
 *  the lean-in with the pureblood line/Saltmere. Incorporate it." Never said, only shown:
 *
 *   1. easy in the dark: half the penalty to pace, to a blow and to a working below ground, and a
 *      little further seen without a lamp
 *   2. shy of the noon flats: a touch slower on the surface from ten until three, and not otherwise
 *   3. the Kept know one of their own: an offering laid with a Salt-cured at the stone buys half
 *      again the regard, and the first time the congregation comes in close to look
 *   4. and Saltmere talks the way people talk who have always done it this way
 *
 * Anything starting '!!' fails the build.
 *
 *   node tools/saltcured.js [game.html]
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
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message.slice(0, 200)));
  await p.goto('file://' + gamePath(process.argv[2]), { waitUntil: 'load', timeout: 120000 });
  await p.waitForSelector('#btn-start', { state: 'attached', timeout: 120000 });
  await p.evaluate(() => { document.getElementById('btn-start').click(); paused = true; });
  await p.waitForFunction(() => { try { return player().length > 0; } catch (e) { return false; } }, null, { timeout: 180000, polling: 1000 });
  await p.waitForTimeout(1500);

  const out = await p.evaluate(() => {
    const R = {};
    paused = true;
    const me = player()[0];
    const body = (sub) => {
      const c = makeChar('Walker', 'player', me.x + 2, me.y, { atk: 20, def: 20, tough: 20, ath: 10 });
      c.race = 'human'; c.sub = sub; fitLine(c); c.sub = sub;
      chars.push(c); return c;
    };
    const salt = body('saltcured'), plain = body(null);
    plain.sub = null;

    /* ---- 1. the dark ---- */
    {
      const ease = darkEase(salt), easePlain = darkEase(plain);
      const moveK = (c) => 1 - (1 - DARK_MOVE_K) * darkEase(c);
      R.easyInTheDark = ease === 0.5 && easePlain === 1 && moveK(salt) > moveK(plain)
        ? `below ground a Salt-cured pays half the dark's price: pace ${moveK(salt).toFixed(2)} of full against ${moveK(plain).toFixed(2)}, and half the blind penalty on a blow and a working`
        : `!! THE DARK: ease ${ease} against ${easePlain}`;
    }

    /* ---- 2. the noon flats ---- */
    {
      const at = (c, h) => { hour = h; return moveSpeed(c); };
      const rNoon = at(salt, 12) / at(plain, 12), rEve = at(salt, 20) / at(plain, 20);
      hour = 12;
      R.shyOfTheNoonFlats = Math.abs(rNoon - 0.95) < 0.02 && Math.abs(rEve - 1) < 0.02
        ? `on the surface at noon a Salt-cured walks at ${rNoon.toFixed(2)} of a plain human's pace, and at evening at ${rEve.toFixed(2)}`
        : `!! THE NOON FLATS: noon ${rNoon.toFixed(3)}, evening ${rEve.toFixed(3)}`;
    }

    /* ---- 3. the Kept ---- */
    {
      const a = deepAltars[0];
      if (!a) R.theKeptKnowThem = '!! NO ALTAR IN THE WORLD';
      else {
        const heard = []; const lg = window.log; window.log = (m, c2) => { heard.push(String(m)); return lg(m, c2); };
        const rowR = {cat: 'probe', need: {}, regard: 20, say: 'probe', give: null};
        const plainR = (() => { a.regard = 0; a.sawKin = false; a.kin = true; salt.x = a.x + 400; altarOffer(a, rowR); return a.regard; })();
        const kinR = (() => { a.regard = 0; a.sawKin = false; salt.x = a.x + 2; salt.y = a.y; salt.floor = a.floor || 0; altarOffer(a, rowR); return a.regard; })();
        window.log = lg;
        const looked = heard.some(m => /comes in out of the dark to look at/.test(m));
        R.theKeptKnowThem = Math.abs(kinR - plainR * 1.5) < 0.01 && looked && a.sawKin
          ? `an offering worth ${plainR} to the vigil is worth ${kinR} with a Salt-cured at the stone, and the first time the congregation comes in close to look`
          : `!! THE KEPT: plain ${plainR}, with kin ${kinR}, looked ${looked}`;
      }
    }

    /* ---- 4. what Saltmere says ---- */
    {
      const sm = towns.find(t => t.def.key === 'saltmere');
      const src = JSON.stringify((sm && sm.def.civBarks) || []);
      const lines = ['keep off the flats at noon', 'find the cellar steps without a lamp', 'bury deep here', 'why we marry in'];
      const got = lines.filter(l => src.toLowerCase().includes(l.toLowerCase()));
      R.saltmereTalks = got.length === lines.length
        ? `Saltmere's people say it without saying it: ${got.map(l => `"${l}"`).join(', ')}`
        : `!! SALTMERE'S LINES: ${got.length} of ${lines.length} found`;
    }
    return R;
  });

  const bad = Object.values(out).filter(v => typeof v === 'string' && v.startsWith('!!'));
  for (const [k, v] of Object.entries(out)) console.log('  ' + k.padEnd(20) + ' ' + v);
  for (const e of errs) console.log('  ' + e);
  console.log('');
  console.log(bad.length || errs.length ? `*** THE OLD BLOOD IS WRONG (${bad.length + errs.length}) ***` : 'THE OLD BLOOD KEEPS TO THE CELLARS');
  await b.close();
  process.exit(bad.length || errs.length ? 1 : 0);
})();
