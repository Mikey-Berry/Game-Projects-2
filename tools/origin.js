#!/usr/bin/env node
/* A named origin, end to end.
 *
 * An origin is the one thing in this game that can be completely broken and never noticed:
 * it runs once, at the click of a button, before anybody is watching, and if it throws
 * halfway through you get a half-built life that looks like a design choice.
 *
 *   node tools/origin.js [game.html] [originKey]
 */
const { chromium } = require('playwright');
const path = require('path');
const gamePath = (a) => path.resolve(a ? (path.isAbsolute(a) ? a : path.join(__dirname, a)) : path.join(__dirname, 'game.html'));
const KEY = process.argv[3] || 'lyonart';

(async () => {
  const b = await chromium.launch({
    executablePath: process.env.DUSTWARD_CHROME || undefined,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'],
  });
  const p = await b.newPage({ viewport: { width: 900, height: 600 } });
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message.slice(0, 220)));
  p.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text().slice(0, 220)); });
  const URL = 'file://' + gamePath(process.argv[2]);
  await p.goto(URL, { waitUntil: 'load' });
  await p.waitForTimeout(3000);
  await p.evaluate(() => document.getElementById('btn-start').click());
  await p.waitForTimeout(3000);

  /* `all` sweeps every listed origin. Each one gets a fresh page: applyCreation clears the
     player squad but not the world it just wrote into — a search opened by one origin would
     still be open for the next, and the verdict would be a lie. */
  const keys = KEY === 'all' ? await p.evaluate(() => Object.keys(ORIGINS)) : [KEY];
  const run = (key) => p.evaluate((key) => {
    const R = {};
    R.listed = !!ORIGINS[key] && ORIGINS[key].label;
    const me = applyCreation('human', 'dark', key);

    const mine = chars.filter(c => c.faction === 'player');
    /* every origin, named or not, owes the same three things: somebody to play, a squad
       standing on open ground, and a camera looking at them. The `soldier` branch failed
       all three for months behind a duplicated `else if` head and nobody noticed, because
       nothing else in the suite ever clicks Start with a particular origin selected. */
    R.you = me && me.name ? me.name : 'NOBODY TO PLAY';
    R.standing = mine.length && mine.every(c => Number.isFinite(c.x) && Number.isFinite(c.y) && !isBlocked(c.x | 0, c.y | 0)) ?
      'all on open ground' : 'SOMEBODY IS IN A WALL';
    R.camera = (me && Math.abs(camX - me.x) < 0.01 && Math.abs(camY - me.y) < 0.01) ? 'on them' : 'CAMERA ELSEWHERE';
    if (key !== 'lyonart') { R.squad = mine.length + ' of them'; R.cats = cats; return R; }

    const him = mine.find(c => c.name && c.name.indexOf('Lyonart') === 0);
    R.he = him ? him.name : 'THE PRINCE IS MISSING';
    R.squad = mine.length + ' of them';
    R.household = mine.filter(c => c.undead).length + ' dead following';
    R.allBound = mine.filter(c => c.undead).every(c => c.master === him) ? 'all sworn to him' : 'SOME ANSWER TO NOBODY';
    R.crown = (campHas('crown') >= 1) ? 'has the Sunken Crown' : 'NO CROWN';
    R.cats = cats;
    R.gift = him && him.gift === 'dark' ? 'dark' : 'WRONG GIFT';

    /* the crown must be a key he cannot yet turn: the rite still wants its price */
    R.riteStillGated = (him && him.stats.magic < 25) ? 'MAG ' + Math.floor(him.stats.magic) + ' — not yet' :
      'ALREADY QUALIFIES (should not)';

    /* --- the search --- */
    R.searchOpen = search.on ? 'open' : 'NOT STARTED';
    const ts = towns.slice(0, 4);
    for (const t of ts) askAfterIlsabet(t, t.leader);
    R.afterThree = search.found ? 'they placed her after ' + search.leads : 'NO LEAD AFTER ' + search.leads;
    /* asking the same hall twice must not count */
    const l0 = search.leads;
    askAfterIlsabet(ts[0], ts[0].leader);
    R.noDoubleDipping = search.leads === l0 ? 'a hall tells you once' : 'ASKED TWICE FOR CREDIT';

    /* --- finding her --- */
    const site = corpseSites[search.siteId];
    R.siteChosen = site ? 'a corpse-field' : 'NO SITE';
    if (site && him) {
      him.x = site.x; him.y = site.y;
      for (let i = 0; i < 40 && !search.met; i++) ilsabetTick(4);
    }
    const her = chars.find(c => c.bossKey === 'ilsabet');
    R.sheIsThere = her ? her.name + ', alive' : 'SHE NEVER APPEARED';
    /* Not `her.neutral` — that flag was set and she was still going to shoot. She is faction
       'exile', which carries Sister Ash's standing order to hunt any dead in sight, and he
       arrives with six of them. Ask the function that actually decides. */
    const dead = mine.filter(c => c.undead);
    R.sheIsNeutral = her && her.neutral ? 'not hostile' : 'HOSTILE OR MISSING';
    R.sheHoldsFire = her && him && !hostile(her, him) && dead.every(u => !hostile(her, u) && !hostile(u, her)) ?
      'she does not shoot the household' : 'SHE OPENS FIRE ON HIS DEAD';

    /* --- she reacts to what he became, not to a flag --- */
    if (her) {
      talkTo(her);
      R.plainGreeting = (her.bubble && her.bubble.text || '').slice(0, 46) + '...';
      if (him) him.lich = true;
      her._greeted = false; her.bubble = null;
      talkTo(her);
      R.asALich = (her.bubble && her.bubble.text || '').slice(0, 46) + '...';
      R.sheNoticed = (R.asALich !== R.plainGreeting) ? 'she reads the man' : 'SAME LINE REGARDLESS';
      if (him) him.lich = false;
    }

    /* --- an eleven-year search must survive a save --- */
    restore(JSON.parse(JSON.stringify(snapshot())));
    R.searchKept = (search.on && search.found && search.met) ?
      'search intact (' + search.leads + ' leads)' : 'SEARCH RESET BY LOAD';
    return R;
  }, key);

  let broken = 0;
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    if (i > 0) {
      await p.goto(URL, { waitUntil: 'load' });
      await p.waitForTimeout(2500);
      await p.evaluate(() => document.getElementById('btn-start').click());
      await p.waitForTimeout(2500);
    }
    let out;
    try { out = await run(key); }
    catch (e) { console.log('=== ' + key + ' ===\n\n*** THREW: ' + String(e.message).split('\n')[0] + ' ***\n'); broken++; continue; }
    console.log('=== ' + key + ' ===\n');
    for (const [k, v] of Object.entries(out)) console.log('  ' + k.padEnd(18) + v);
    const bad = Object.values(out).map(String).filter(v => /[A-Z]{3,}\s+[A-Z]{2,}|MISSING|NO CROWN|NO SITE|NO LEAD/.test(v));
    const ok = key === 'lyonart' ? 'THE PRINCE IS WHOLE' : 'THIS LIFE STARTS';
    console.log('\n' + (bad.length ? '*** NOT WIRED: ' + bad.join(' | ') + ' ***' : ok) + '\n');
    if (bad.length) broken++;
  }
  if (errs.length) { console.log('errs:', errs.length); errs.slice(0, 4).forEach(e => console.log('  ' + e)); }
  await b.close();
  if (broken) process.exitCode = 1;
})();
