#!/usr/bin/env node
/* THE SUNDERED GROUND: WHAT LIVES ON IT, WHAT GETS UP OFF IT, AND WHETHER YOU CAN WALK THROUGH IT.
 *
 * Three reports about one place.
 *
 *   "The ecosystems that Malathuun's sundered sites are built around seem to get wiped out
 *    pretty quickly. Those mites or whatever tend to become corpses… and then a Malathuun's
 *    Answer often pops up to eat them."
 *   "Malathuun's Answer events should be much less common than they are now. Corpse Cairns
 *    should spawn as per usual but not necessarily as an event isolated at these locations."
 *   "It's also odd that you can walk inside them — they should act as obstacles and not scenery
 *    you can phase through."
 *
 * THE FIRST TWO ARE ONE LOOP AND IT IS WORTH NAMING. The site's animals die, their carcasses
 * counted toward the fodder pile that calls the ground up, and the thing that got up ate the
 * carcasses — so visiting a site was enough to summon the thing that finished it off. Cutting
 * `siteId` out of `cairnFood` breaks it at the only point that does not touch the ORDINARY
 * Corpse Cairn, which the note explicitly asks to leave alone: `CAIRN_PER_BODY` and `CAIRN_MAX`
 * are untouched, and the assertion below says so rather than trusting it.
 *
 *   node tools/sundered.js [game.html]
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
    const guard = (keys, fn) => {
      try { fn(); } catch (e) { for (const k of keys) if (R[k] === undefined) R[k] = '!! ' + String(e.message).slice(0, 110).toUpperCase(); }
    };

    /* ---------- 1. THE GROUND IS SOLID ---------- */
    guard(['youCannotWalkThroughTheMonument', 'butTheRibsAndFingersStillHaveGapsInThem'], () => {
      const pop = (s) => chars.filter(c => c.siteId === s.id && c.state !== 'dead' && c.gauntKind).length;
      void pop;
      /* the middle of every site, which is the middle of the thing standing on it */
      const solid = corpseSites.filter(s => isBlocked(Math.round(s.x), Math.round(s.y)));
      R.youCannotWalkThroughTheMonument = solid.length === corpseSites.length
        ? `all ${corpseSites.length} monuments stop you at the middle — they are things now, not pictures of things`
        : `!! ONLY ${solid.length} OF ${corpseSites.length} SITES BLOCK AT THEIR CENTRE`;
      /* AND NOT A DISC. A site that blocked its whole radius would be a boulder with a skull
         painted on it — the inside of a ribcage is the best thing about a ribcage. Counted over
         the site's own radius, a monument should stop a fraction of it and leave the rest. */
      let blockedN = 0, total = 0;
      for (const s of corpseSites)
        for (let y = Math.round(s.y) - 12; y <= Math.round(s.y) + 12; y++)
          for (let x = Math.round(s.x) - 12; x <= Math.round(s.x) + 12; x++) {
            if (dist(x, y, s.x, s.y) > 12) continue;
            total++; if (isBlocked(x, y)) blockedN++;
          }
      const frac = blockedN / Math.max(1, total);
      R._footprint = `${blockedN} of ${total} tiles inside the sites are solid — ${(frac * 100).toFixed(1)}%`;
      R.butTheRibsAndFingersStillHaveGapsInThem = (frac > 0.02 && frac < 0.40)
        ? `and it is a shape rather than a disc — ${(frac * 100).toFixed(0)}% of the ground inside a site is solid, so you can still walk in among the ribs and stand in the palm`
        : `!! ${(frac * 100).toFixed(1)}% OF THE SITE IS SOLID`;
    });

    /* ---------- 2. AND NOTHING WAS BURIED UNDER IT ----------
       The cache and the animals are placed by worldgen AFTER the footprint is stamped, which is
       the only order that works — a chest under the jaw is unreachable and unseeable. */
    guard(['theCacheIsNotUnderTheJaw'], () => {
      const buried = corpseSites.filter(s => {
        const ch = s.cacheIdx >= 0 ? chests[s.cacheIdx] : null;
        return ch && isBlocked(Math.round(ch.x), Math.round(ch.y));
      });
      R.theCacheIsNotUnderTheJaw = buried.length === 0
        ? 'and every fragment cache is on ground you can actually stand on — the footprint is stamped before the chest is placed, not after'
        : `!! ${buried.length} CACHES ARE INSIDE THE MONUMENT`;
    });

    /* ---------- 3. THE ECOLOGY IS A POPULATION, NOT A GARRISON ---------- */
    guard(['theSiteCarriesARealPopulation', 'andItGrowsBackAfterYouClearIt'], () => {
      const pops = corpseSites.map(s => chars.filter(c => c.siteId === s.id && c.state !== 'dead' && c.gauntKind).length);
      R._pops = `site populations at worldgen: ${pops.join(', ')} (targets ${corpseSites.map(s => s.pop).join(', ')})`;
      R.theSiteCarriesARealPopulation = pops.every(n => n >= 5)
        ? `every site starts with at least five things living on it — ${pops.join(', ')} — which is a population rather than a garrison of two`
        : `!! SITE POPULATIONS ARE ${pops.join(', ')}`;
      /* CLEAR ONE AND WAIT. This is the report: after a fight the ground stayed empty. */
      const s0 = corpseSites[0];
      for (const c of chars.filter(c => c.siteId === s0.id)) { const i = chars.indexOf(c); if (i >= 0) chars.splice(i, 1); }
      const after0 = chars.filter(c => c.siteId === s0.id && c.state !== 'dead').length;
      let hours = 0;
      for (; hours < 96; hours++) {
        corpseSiteTick(1);
        if (chars.filter(c => c.siteId === s0.id && c.state !== 'dead' && c.gauntKind).length >= s0.pop) break;
      }
      const back = chars.filter(c => c.siteId === s0.id && c.state !== 'dead' && c.gauntKind).length;
      R._regrow = `stripped to ${after0}, back to ${back} of ${s0.pop} after ${hours} game-hours`;
      R.andItGrowsBackAfterYouClearIt = (back >= s0.pop && hours <= 72)
        ? `and a site stripped to nothing refills to its full ${s0.pop} in ${hours} game-hours — it comes back from being visited, which is what makes it an ecology`
        : `!! back to ${back} of ${s0.pop} after ${hours} hours`;
    });

    /* ---------- 4. AND KILLING THEM DOES NOT SUMMON THE THING THAT EATS THEM ---------- */
    guard(['siteDeadDoNotFeedTheGround', 'butEverythingElseStillDoes'], () => {
      const fodder = () => corpses.reduce((n, b2) => n + (cairnFood(b2) ? bodyWorth(b2) : 0), 0);
      const base = fodder();
      const mk = (siteId) => {
        const c = makeChar('Carcass', 'gaunt', 20, 20, { atk: 1, def: 1 });
        c.state = 'dead'; if (siteId) c.siteId = siteId;
        corpses.push(c); return c;
      };
      const a = [], bset = [];
      for (let i = 0; i < 10; i++) a.push(mk(corpseSites[0].id));
      const withSite = fodder();
      for (let i = 0; i < 10; i++) bset.push(mk(null));
      const withPlain = fodder();
      for (const c of [...a, ...bset]) { const i = corpses.indexOf(c); if (i >= 0) corpses.splice(i, 1); }
      R._fodder = `fodder ${base} -> ${withSite} after ten site carcasses -> ${withPlain} after ten ordinary ones`;
      R.siteDeadDoNotFeedTheGround = withSite === base
        ? 'ten dead animals off a sundered site add nothing to the pile that calls a Corpse Cairn up — killing the ecology no longer summons the thing that eats it'
        : `!! TEN SITE CARCASSES ADDED ${withSite - base} TO THE FODDER`;
      R.butEverythingElseStillDoes = withPlain > withSite
        ? `while ten ordinary dead add ${withPlain - withSite} exactly as they always did — the ordinary Corpse Cairn is untouched, which is what the note asked for`
        : `!! ORDINARY DEAD STOPPED COUNTING TOO (${withSite} -> ${withPlain})`;
    });

    /* ---------- 5. AND THE ANSWER IS AN EVENT AGAIN ---------- */
    guard(['theAnswerIsRareNow', 'andTheOrdinaryCairnIsUntouched'], () => {
      R._dials = `Answer: ${CURSE_FODDER} dead, ${CURSE_GAP} days apart, not before day ${CURSE_DAY} · ordinary Cairn: ${CAIRN_PER_BODY} per beast, ${CAIRN_MAX} at once`;
      R.theAnswerIsRareNow = (CURSE_FODDER >= 110 && CURSE_GAP >= 14 && CURSE_DAY >= 28)
        ? `the ground answers at ${CURSE_FODDER} unclaimed dead, no more than once in ${CURSE_GAP} days, and never before day ${CURSE_DAY}`
        : `!! fodder ${CURSE_FODDER}, gap ${CURSE_GAP}, floor ${CURSE_DAY}`;
      /* AND THE ORDINARY ONE IS LEFT ALONE, which is half the note and the half most likely to
         be broken by accident while tuning the other half. */
      R.andTheOrdinaryCairnIsUntouched = (CAIRN_PER_BODY === 26 && CAIRN_MAX === 4)
        ? 'and a Corpse Cairn still forms out of a battlefield at twenty-six bodies apiece, four at a time — "Corpse Cairns should spawn as per usual"'
        : `!! THE ORDINARY CAIRN MOVED: ${CAIRN_PER_BODY} per body, ${CAIRN_MAX} max`;
    });

    return R;
  });

  const bad = Object.values(out).filter(v => typeof v === 'string' && v.startsWith('!!'));
  for (const [k, v] of Object.entries(out)) console.log('  ' + (k.startsWith('_') ? ('· ' + k.slice(1)).padEnd(34) : k.padEnd(34)) + ' ' + v);
  for (const e of errs) console.log('  ' + e);
  console.log('');
  console.log(bad.length || errs.length ? `THE SUNDERED GROUND IS STILL EATING ITSELF (${bad.length + errs.length})`
                                        : 'THE GROUND IS SOLID, WHAT LIVES ON IT COMES BACK, AND IT RARELY STANDS UP');
  await b.close();
  process.exit(bad.length || errs.length ? 1 : 0);
})();
