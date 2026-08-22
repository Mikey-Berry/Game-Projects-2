#!/usr/bin/env node
/* ONE WORD FOR TWO TRADES.
 *
 * "The 'flesh' job seems to serve both purposes of shaping quickflesh into corpses for
 * necromancy AND for shaping greenfruit/cloth into quickflesh… We need to decide on one or the
 * other. I opt for creating a new job, 'charnel' for shaping quickflesh into corpses."
 *
 * FLESH was one name for both ends of a production line: the vats that make Quickened Flesh
 * out of greenfruit and cloth, and the Charnel Houses that shape that flesh into bodies. A
 * camp with both could not put a hand on one end without putting them on the other.
 *
 * Splitting a job is easy to do halfway — the menu grows an entry, the tick grows a branch,
 * and one of the four places that map a body to its work keeps the old answer, so the new job
 * exists and quietly does nothing. So this drives BOTH ends through the real day tick and
 * asks what actually came out of each building, and checks the two jobs cannot do each
 * other's work.
 *
 *   node tools/charnel.js [game.html]
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

    let gx = 0, gy = 0;
    outer:
    for (let y = 60; y < H - 60; y += 5) for (let x = 60; x < W - 60; x += 5) {
      if (isBlocked(x + 0.5, y + 0.5)) continue;
      if (towns.some(t => dist(t.x, t.y, x, y) < 70)) continue;
      let ok = true;
      for (let j = -12; j <= 12 && ok; j++) for (let i = -12; i <= 12 && ok; i++)
        if (isBlocked(x + i + 0.5, y + j + 0.5)) ok = false;
      if (ok) { gx = x; gy = y; break outer; }
    }
    R.ground = gx ? `staged on open waste at ${gx},${gy}` : '!! NO OPEN GROUND';

    const wipe = () => {
      for (let i = chars.length - 1; i >= 0; i--) if (chars[i].__probe) chars.splice(i, 1);
      for (let i = corpses.length - 1; i >= 0; i--) if (corpses[i].__probe) corpses.splice(i, 1);
      for (let i = pBuilds.length - 1; i >= 0; i--) if (pBuilds[i].__probe) pBuilds.splice(i, 1);
      rebuildCharGrid();
    };
    const put = (type, x, y) => {
      const bt = BUILD_TYPES[type];
      const bl = { type, x, y, w: bt.w, h: bt.h, floor: 0, hp: 100, maxHp: 100, growth: 0, __probe: true };
      pBuilds.push(bl); return bl;
    };
    const hand = (name, x, y, job) => {
      const c = makeChar(name, 'player', x, y, { atk: 3, def: 3, tough: 8, labor: 5, magic: 30 });
      c.__probe = true; c.gift = 'dark'; c.job = job; c.job2 = null;
      chars.push(c); clearOrders(c); rebuildCharGrid(); return c;
    };
    /* walk the hand to its work the way the game does, then run the day tick that pays out */
    const work = (c, secs) => { for (let i = 0; i < secs * 30; i++) { c.state = 'ok'; physics(c, 1 / 30); } };

    /* ---------- THE MENU OFFERS BOTH ---------- */
    {
      const one = hand('Probe Menu', gx, gy, null);
      selected.length = 0; selected.push(one);
      refreshCharPanel();
      /* THE TRADES ARE NOT IN THE ROW. `#jobrow` holds three buttons — JOB, 2ND and COMMAND —
         and the trades live in the context menu the first of them opens. Reading the row
         itself reports ["JOB: NONE","2ND: NONE","COMMAND…"] and says nothing about whether
         the new trade exists, which is what the first version of this assertion did. Click
         the button the way a player does and read what actually drops down. */
      hideCtxMenu();
      const jobBtn = [...document.querySelectorAll('#jobrow button')].find(x => x.textContent.startsWith('JOB:'));
      if (jobBtn) jobBtn.click();
      const labels = [...document.querySelectorAll('#ctxmenu button')].map(x => x.textContent.trim());
      R.menu = `the JOB button drops ${labels.length} trades`;
      R.bothTradesAreOffered = (labels.includes('FLESH') && labels.includes('CHARNEL'))
        ? 'FLESH and CHARNEL are both offered, as separate trades'
        : `!! THE MENU OFFERS ${JSON.stringify(labels)}`;
      hideCtxMenu();
      wipe(); selected.length = 0;
    }

    /* ---------- A HAND ON FLESH KEEPS THE VAT, AND ONLY THE VAT ---------- */
    {
      /* ---------- THE HOUSE GOES NEARER THAN THE VAT, ON PURPOSE ----------
         The first version of this block put the vat next to the hand and the house six tiles
         off, and `andNotTheHouse` passed on BOTH builds — the old job walked to whichever of
         the two was nearest, which was the vat, so it never had the opportunity to tend the
         house it would happily have tended. Green for a staging reason and not a code reason.
         Put the CHARNEL HOUSE within arm's reach and the vat six tiles past it: the old code
         stops at the house, the new one walks by it. */
      const house = put('charnel', gx, gy);
      const vat = put('vat', gx + 6, gy);
      addItem('fruit', 200); addItem('fabric', 200); addItem('vflesh', 200);
      const c = hand('Probe Vatman', gx + 1, gy + 3, 'flesh');
      R.fleshHasWork = jobHasWork(c, 'flesh') ? 'a vat in the camp is FLESH work' : '!! FLESH SEES NO WORK AT A VAT';
      work(c, 30);
      R.tending = `after thirty seconds: vat tended ${!!vat.tended}, charnel house tended ${!!house.tended}`;
      R.fleshKeepsTheVat = vat.tended
        ? 'a hand on FLESH walks to the vat and keeps it'
        : '!! A HAND ON FLESH NEVER TENDED THE VAT';
      R.andNotTheHouse = !house.tended
        ? 'and walks straight past the Charnel House at its elbow to get there — that is somebody else’s trade now'
        : '!! A HAND ON FLESH IS STILL TENDING THE CHARNEL HOUSE';
      /* and the vat actually pays out, which is the half a flag would not have caught */
      const before = campHas('vflesh');
      runVats();
      R.andTheVatPaysOut = campHas('vflesh') > before
        ? `and the vat yields ${campHas('vflesh') - before} Quickened Flesh on the day tick`
        : '!! THE VAT PRODUCED NOTHING';
      wipe();
    }

    /* ---------- AND A HAND ON CHARNEL KEEPS THE HOUSE ---------- */
    {
      const vat = put('vat', gx, gy);
      const house = put('charnel', gx + 6, gy);
      addItem('vflesh', 200);
      const c = hand('Probe Charnelman', gx + 7, gy + 3, 'charnel');
      R.charnelHasWork = jobHasWork(c, 'charnel')
        ? 'a Charnel House in the camp is CHARNEL work'
        : '!! CHARNEL SEES NO WORK AT A CHARNEL HOUSE';
      work(c, 30);
      R.charnelKeepsTheHouse = house.tended
        ? 'a hand on CHARNEL walks to the house and keeps it'
        : '!! A HAND ON CHARNEL NEVER TENDED THE HOUSE';
      R.andNotTheVat = !vat.tended
        ? 'and leaves the vat to the vatman'
        : '!! A HAND ON CHARNEL IS TENDING THE VAT';
      /* the house paying out is a BODY on the ground, not a number in a store */
      const before = corpses.length;
      harvestFlesh();
      const made = corpses.length - before;
      for (const b2 of corpses) if (b2.grown) b2.__probe = true;
      R.andTheHousePaysOut = made > 0
        ? `and the house yields ${made} ${made === 1 ? 'body' : 'bodies'} on the day tick`
        : '!! THE CHARNEL HOUSE PRODUCED NOTHING';
      wipe();
    }

    /* ---------- NEITHER JOB SEES THE OTHER'S BUILDING AS WORK ----------
       `jobHasWork` decides whether a hand falls through to their SECOND trade instead of
       standing idle. If it still answered yes for the wrong building, a camp with only vats
       would keep a charnel hand standing in the dirt believing they had something to do. */
    {
      put('vat', gx, gy);
      const c = hand('Probe Idle', gx + 1, gy + 3, 'charnel');
      R.charnelIsIdleWithNoHouse = !jobHasWork(c, 'charnel')
        ? 'a camp with vats and no houses gives a CHARNEL hand nothing to do — so they fall through to their second trade'
        : '!! CHARNEL CLAIMS WORK IN A CAMP WITH NO CHARNEL HOUSE';
      wipe();
      put('charnel', gx, gy);
      const c2 = hand('Probe Idle 2', gx + 1, gy + 3, 'flesh');
      R.fleshIsIdleWithNoVat = !jobHasWork(c2, 'flesh')
        ? 'and a camp with houses and no vats gives a FLESH hand nothing to do'
        : '!! FLESH CLAIMS WORK IN A CAMP WITH NO VAT';
      wipe();
    }

    /* ---------- AND RIGHT-CLICKING A BUILDING OFFERS THE TRADE THAT TENDS IT ----------
       The one table where a half-done split hides: a Charnel House offering FLESH would send
       the hand to the vats and leave the house cold, and nothing would log a word. */
    {
      const src = (typeof onCtx === 'function' ? onCtx.toString() : document.documentElement.innerHTML);
      const m = /JOB_OF\s*=\s*\{[^}]*\}/.exec(src);
      R.theBuildingOffersItsOwnTrade = (m && /charnel:\s*'charnel'/.test(m[0]) && /ossuary:\s*'charnel'/.test(m[0]) && /vat:\s*'flesh'/.test(m[0]))
        ? 'and right-clicking a house offers CHARNEL while a vat offers FLESH'
        : `!! THE BUILDING-TO-TRADE TABLE STILL READS ${m ? m[0] : '(not found)'}`;
    }

    return R;
  });

  const bad = Object.values(out).filter(v => typeof v === 'string' && v.startsWith('!!'));
  for (const [k, v] of Object.entries(out)) console.log('  ' + k.padEnd(30) + v);
  for (const e of errs) console.log('  ' + e);
  console.log('');
  console.log(bad.length || errs.length
    ? `ONE WORD IS STILL DOING TWO JOBS (${bad.length + errs.length})`
    : 'TWO TRADES, TWO WORDS, AND EACH KEEPS ITS OWN HOUSE');
  await b.close();
  process.exit(bad.length || errs.length ? 1 : 0);
})();
