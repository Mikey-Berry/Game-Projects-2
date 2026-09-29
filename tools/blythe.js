#!/usr/bin/env node
/* BROTHER BLYTHE, AND HIS HANDS.
 *
 * "I like the Hospitaller angle. However it's not that they didn't throw him out -- more that they
 *  simply never hunted him down and hope he will rejoin. He is not in their camps. He spends his
 *  days drinking now and is sort of the 'drunken priest' archetype. (This could play well with him
 *  as a medic -- imagine a drunk surgeon, love it.)"
 *
 *   1. he is in a taproom, in a town, in Paladin plate and no helm, with the blessed gift
 *   2. he wants three bottles of rum, any kind, and joining spends them
 *   3. the drunk surgeon: on a day he has had his bottle he tends a quarter faster than his skill
 *      alone; on a dry day, a little better than half
 *   4. he takes the bottle himself, one a day, out of the stores, and says so when there is none
 *   5. the Order has not forgotten him: a Paladin close enough says his bed is still made, and
 *      the Order's own talk has a word about him
 *
 * Anything starting '!!' fails the build.
 *
 *   node tools/blythe.js [game.html]
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
    const bl = chars.find(c => c.wanderKey === 'blythe');
    const heard = []; const lg = window.log; window.log = (m, c2) => { heard.push(String(m)); return lg(m, c2); };
    const drinks = () => BLYTHE_DRINKS.reduce((a, k) => a + campHas(k), 0);
    const dry = () => { for (const k of BLYTHE_DRINKS) { delete stash[k]; for (const bn of bins()) if (bn.store) delete bn.store[k]; for (const o of chars) if (o.faction === 'player' && o.inv) delete o.inv[k]; } };

    /* ---- 1. where he is ---- */
    {
      const bar = bl && vendors.find(v => v.vt === 'bar' && dist(v.x, v.y, bl.x, bl.y) < 6);
      const t = bl && townAt(bl.x, bl.y);
      R.inATaproom = bl && bar && t && !t.def.undeadFriendly && bl.armor === 'a_pla' && !bl.head && bl.gift === 'divine' && bl.conviction === 'devout'
        ? `${bl.name} is at the bar in ${t.name}, in the plate and no helm, with the blessed gift`
        : `!! WHERE IS HE: ${bl ? `at ${Math.round(bl.x)},${Math.round(bl.y)}, bar ${!!bar}, town ${t && t.name}, armour ${bl.armor}, head ${bl.head}, gift ${bl.gift}` : 'not in the world'}`;
    }

    /* ---- 2. three bottles ---- */
    {
      dry();
      stash.rum = 2;
      const g0 = wandererGate(bl);
      stash.rum_cask = 1;
      const g1 = wandererGate(bl);
      const joined = recruitWanderer(bl);
      R.threeBottles = !g0.ok && /3 bottles/.test(g0.why) && g1.ok && joined && drinks() === 0 && bl.faction === 'player'
        ? `two bottles will not do it ("${g0.why}"); three, of any rum, will, and they are gone from the stores when he stands up`
        : `!! THE BOTTLES: gate ${g0.ok}/${g0.why} then ${g1.ok}, joined ${joined}, left ${drinks()}`;
    }

    /* ---- 3. the drunk surgeon ---- */
    {
      bl.blytheWet = day; const wet = blytheHands(bl);
      bl.blytheWet = day - 1; const dryH = blytheHands(bl);
      const other = player().find(c => c !== bl);
      R.theDrunkSurgeon = wet === BLYTHE_STEADY && dryH === BLYTHE_SHAKY && blytheHands(other) === 1 && wet > 1 && dryH < 1
        ? `on a day he has had his bottle he tends at ${wet}x; on a dry day his hands shake and he tends at ${dryH}x; nobody else's hands care`
        : `!! HIS HANDS: wet ${wet}, dry ${dryH}, anybody else ${blytheHands(other)}`;
    }

    /* ---- 4. he takes it himself ---- */
    {
      dry(); stash.rum_black = 2;
      day++; bl.blytheWet = undefined; bl.blytheDry = undefined;
      blytheDay();
      const took = drinks() === 1 && bl.blytheWet === day;
      dry(); day++;
      const n = heard.length;
      blytheDay();
      const said = heard.slice(n).some(m => /shaking/.test(m));
      R.aBottleADay = took && said && bl.blytheDry === day
        ? 'at the turn of the day he takes one bottle out of the stores, and when there is none the log says his hands are shaking'
        : `!! THE DAILY BOTTLE: took ${took}, dry day said ${said}`;
    }

    /* ---- 5. the Order ---- */
    {
      const pal = makeChar('Brother Hale', 'purge', bl.x + 2, bl.y, {}); chars.push(pal);
      bl.blytheOrderSaid = false;
      const vis0 = visAt; visAt = () => 2;
      const n = heard.length;
      try { blytheMeets(); } finally { visAt = vis0; }
      const said = heard.slice(n).some(m => /bed in the infirmary is still made/.test(m));
      const node = TALK_TREES.purge.blythe;
      const opt = TALK_TREES.purge.root.opts.find(o => /Brother Blythe/.test(o.say));
      R.theOrderRemembers = said && node && /door is open/.test(node.line) && opt && opt.when()
        ? 'a Paladin who comes close says his bed in the infirmary is still made, and the Order\'s own talk says the door is open'
        : `!! THE ORDER: said ${said}, node ${!!node}, asked ${opt && opt.when()}`;
      chars.splice(chars.indexOf(pal), 1);
    }
    window.log = lg;
    return R;
  });

  const bad = Object.values(out).filter(v => typeof v === 'string' && v.startsWith('!!'));
  for (const [k, v] of Object.entries(out)) console.log('  ' + k.padEnd(20) + ' ' + v);
  for (const e of errs) console.log('  ' + e);
  console.log('');
  console.log(bad.length || errs.length ? `*** BLYTHE IS WRONG (${bad.length + errs.length}) ***` : 'SHOW HIM WHO IS BLEEDING');
  await b.close();
  process.exit(bad.length || errs.length ? 1 : 0);
})();
