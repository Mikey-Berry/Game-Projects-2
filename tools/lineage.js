#!/usr/bin/env node
/* A LINE IS CONTINUED ON THE ROAD AND FINISHED UNDER A ROOF.
 *
 * "Maybe like M&B2 style, it can happen anytime while the married couple are TOGETHER. (Low
 *  chance, of course.) Then the woman needs to visit an inn or a homestead to 'deliver' the
 *  baby. That way, a married couple isn't basically out of play for half the game just to
 *  continue the family line."
 *
 * Measured on the build before this (e02c308): a married player couple standing shoulder to
 * shoulder on open waste, rolled over 400 midnights, conceived ZERO times — `homeOf` returned
 * null and the loop `continue`d. The entire cost of a family was paid before anything could
 * happen: finish a homestead, move both of them into it, and then the child appeared wherever
 * they were standing when the clock ran out, road or battlefield.
 *
 * Everything here is driven by rolling the world's own midnight — `hour` past 24 and one
 * `update` — rather than by calling a birth function, because the claim is about what the day
 * block does, and there is no birth function to call.
 *
 *   node tools/lineage.js [game.html]
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
  await p.waitForFunction(() => {
    const bs = document.getElementById('btn-start');
    return bs && typeof chars !== 'undefined' && chars.length > 0;
  }, null, { timeout: 60000 });
  await p.evaluate(() => { document.getElementById('btn-start').click(); paused = true; });
  await p.waitForFunction(() => document.getElementById('startoverlay').style.display === 'none', null, { timeout: 60000 });

  const out = await p.evaluate(() => {
    const R = {};
    paused = true;

    let gx = 0, gy = 0;
    outer:
    for (let y = 60; y < H - 60; y += 6) for (let x = 60; x < W - 60; x += 6) {
      if (isBlocked(x + 0.5, y + 0.5)) continue;
      if (towns.some(t => dist(t.x, t.y, x, y) < 90)) continue;
      let ok = true;
      for (let j = -8; j <= 8 && ok; j += 2) for (let i = -8; i <= 8 && ok; i += 2)
        if (isBlocked(x + i + 0.5, y + j + 0.5)) ok = false;
      if (ok) { gx = x; gy = y; break outer; }
    }
    R.ground = gx ? `staged on open waste at ${gx},${gy}, no town within 90` : '!! NO OPEN GROUND';

    const probes = [];
    const wipe = () => {
      for (let i = chars.length - 1; i >= 0; i--) if (chars[i].__probe) chars.splice(i, 1);
      probes.length = 0;
    };
    const mk = (name, f, x, y, o) => {
      const c = makeChar(name, f, x, y, o || {});
      c.state = 'ok'; c.__probe = true; chars.push(c); probes.push(c); return c;
    };
    /* a wed pair, of an age, fertile, standing on each other's toes */
    const wed = (fac, x, y, tag) => {
      const w = mk('Mara ' + tag, fac, x, y, { atk: 5, def: 5, tough: 20, ath: 8 });
      const h = mk('Corin ' + tag, fac, x + 0.4, y, { atk: 5, def: 5, tough: 20, ath: 8 });
      /* PINNED, AND IT MATTERS. Everything that breathes ages 1/7 of a year per midnight, and
         conception stops at fifty — so a probe that rolls four hundred nights is asking a
         couple in their eighties why they are not having children. `midnight` puts the age
         back every night. */
      for (const c of [w, h]) { c.age = 26; c.__age0 = 26; c.race = 'human'; c.sub = null; }
      w.sex = 'f'; h.sex = 'm';
      w.spouse = h.id; h.spouse = w.id;
      return [w, h];
    };
    /* THE WORLD'S OWN MIDNIGHT. `hour` past 24 inside one `update` is the only way in — the day
       block is written inline in `update` and there is nothing else to call.
       AND THE AUTOSAVE HAD TO GO. The day block ends with `packSaveText(snapshot())`, which
       serialises the entire world and then compresses it; this probe rolls upward of a
       thousand midnights and the first run of it was still going twenty minutes later, almost
       all of it spent writing saves nobody reads. Stubbed for the duration and put back. */
    const _snap = snapshot, _pack = packSaveText;
    snapshot = () => ({});
    packSaveText = () => new Promise(() => {});
    let nights = 0;
    const t0 = Date.now();
    const midnight = () => {
      paused = false; hour = 23.98; update(0.25); paused = true; nights++;
      for (const c of chars) if (c.__age0 !== undefined) c.age = c.__age0;
    };
    /* ---------- COUNT HER CHILD, NOT THE WORLD'S ----------
       `chars.length` is not a birth counter. Every town in the world is raising children on
       the same midnights this probe is rolling, and the first version of this file read a
       delta of 64 over forty nights and called it "she gave birth in the dust". Worse, the
       POSITIVE claims would have passed the same way — a townswoman two hundred tiles off
       delivering while the probe's mother stood barren at an inn. Look for a new `wasChild`
       standing next to the woman being asked about. */
    const seenIds = () => new Set(chars.map(c => c.id));
    const bornNear = (m, was) => chars.filter(c => c.wasChild && !was.has(c.id) && dist(c.x, c.y, m.x, m.y) < 3);

    /* ---------- 1. TOGETHER, ANYWHERE, IS ENOUGH ----------
       Open waste, no homestead, nothing built. On the old build this was a flat zero. */
    {
      const [w, h] = wed('player', gx, gy, 'Field');
      let conceived = 0, firstAt = null;
      for (let d = 0; d < 250 && conceived < 1; d++) {
        midnight();
        if (w.pregnant || h.pregnant) { conceived++; firstAt = d + 1; }
      }
      R.togetherIsEnough = conceived
        ? `a wed pair on open waste with nothing built conceived on night ${firstAt} of 250`
        : '!! TWO HUNDRED AND FIFTY NIGHTS ON THE ROAD AND NOTHING — the homestead is still a gate';
      R.andSheCarriesIt = !conceived ? '!! nothing conceived — see above'
        : w.pregnant && !h.pregnant
          ? `and it is the wife who is carrying, not a coin toss between the two of them`
          : `!! THE HUSBAND IS PREGNANT (Mara ${w.pregnant}, Corin ${h.pregnant})`;
      /* ---------- "LOW CHANCE, OF COURSE" IS HALF THE REQUEST ----------
         Asserting only that a child eventually arrives passes just as well on a build where
         every couple in the world conceives every night, which would fill the map inside a
         season. Clear the pregnancy each time and count how often it comes back over two
         hundred nights of standing together. */
      let hits = 0;
      for (let d = 0; d < 200; d++) {
        midnight();
        if (w.pregnant || h.pregnant) { hits++; w.pregnant = 0; h.pregnant = 0; }
      }
      const rate = hits / 200;
      R.andItIsALowChance = rate > 0 && rate <= 0.06
        ? `and it stays a low chance on the road: ${hits} conceptions over 200 nights together, ${(rate * 100).toFixed(1)}% a night`
        : `!! THE ROAD RATE IS WRONG (${hits}/200 = ${(rate * 100).toFixed(1)}% a night)`;
      wipe();
    }

    /* ---------- 2. AND SHE DOES NOT DELIVER ON A ROAD ---------- */
    let termDays = null;
    {
      const [w] = wed('player', gx, gy, 'Term');
      w.pregnant = 1;                       /* at her term tonight */
      const was = seenIds();
      for (let d = 0; d < 40; d++) midnight();
      const born = bornNear(w, was);
      R.notOnTheRoad = born.length === 0 && w.pregnant > 0 && w.overdue >= 30
        ? `forty nights past her term on open waste and no child: still carrying, ${w.overdue} nights overdue`
        : `!! SHE GAVE BIRTH IN THE DUST (${born.map(c => c.name).join(', ') || 'none'}, pregnant ${w.pregnant}, overdue ${w.overdue})`;
      R.andThePanelSaysSo = (() => {
        selected = [w]; refreshCharPanel();
        const t = (document.getElementById('charpanel') || {}).textContent || '';
        return /DUE/.test(t) ? 'and the panel calls her DUE rather than expecting — it is an errand now, not a wait'
          : `!! THE PANEL STILL READS THE SAME (${(t.match(/·[^·]{0,24}/g) || []).join('').slice(0, 90)})`;
      })();
      wipe();
    }

    /* ---------- 3. AN INN IS A ROOF ----------
       The real thing the world builds: `beds`, pushed by the INN block of `placeTown`. */
    {
      const bed = beds[0];
      R.thereAreInns = bed ? `the world built ${beds.length} inn beds` : '!! NO INN ANYWHERE IN THE WORLD';
      if (bed) {
        const [w] = wed('player', bed.x, bed.y, 'Inn');
        w.pregnant = 1;
        const was = seenIds();
        let d = 0, born = [];
        for (; d < 12 && !born.length; d++) { midnight(); born = bornNear(w, was); }
        R.anInnIsARoof = born.length && !w.pregnant
          ? `carried to an inn bed she delivers on the next night she comes to term — ${born[0].name}, ${d} night${d > 1 ? 's' : ''}`
          : `!! SHE DOES NOT DELIVER AT AN INN EITHER (born ${born.length}, pregnant ${w.pregnant}, overdue ${w.overdue})`;
        wipe();
      }
    }

    /* ---------- 4. AND SO IS A HOMESTEAD, AND IT KEEPS THE TALLY ---------- */
    {
      const home = { type: 'home', x: gx + 20, y: gy + 20, w: 4, h: 4, progress: 1, kids: 0, bornDay: -999 };
      pBuilds.push(home);
      const [w] = wed('player', home.x + 2, home.y + 2, 'Home');
      w.pregnant = 1;
      const was = seenIds();
      let d = 0, born = [];
      for (; d < 12 && !born.length; d++) { midnight(); born = bornNear(w, was); }
      R.aHomesteadIsARoof = born.length && !w.pregnant && home.kids === 1
        ? `and at a homestead she delivers — ${born[0].name} — and the house takes the tally (kids ${home.kids})`
        : `!! THE HOMESTEAD DID NOT SERVE (born ${born.length}, pregnant ${w.pregnant}, house kids ${home.kids})`;
      /* AND THE SEASON RIDES HER NOW, because a couple with no house has no tally to hang it on */
      const lb = w.lastBorn;
      let again = 0;
      for (let i = 0; i < 60; i++) { midnight(); if (w.pregnant) { again++; break; } }
      R.aSeasonBetweenThem = again ? `!! SHE CONCEIVED AGAIN INSIDE THE SEASON (night ${again} of 60, lastBorn ${lb})`
        : (lb === null || lb === undefined) ? '!! NOTHING WAS WRITTEN ON THE MOTHER — the season is still hung on the house, and a couple with no house has no tally at all'
        : 'and a season is kept on the mother herself — sixty nights after the birth she is not carrying again';
      pBuilds.splice(pBuilds.indexOf(home), 1);
      wipe();
    }

    /* ---------- 5. A CHILD IS NOT TWO YEARS' WORK ----------
       End to end, off the clock the player actually reads: conception to a child in arms, at a
       homestead, in game-days — against a year, which is seven. */
    {
      const home = { type: 'home', x: gx + 20, y: gy + 20, w: 4, h: 4, progress: 1, kids: 0, bornDay: -999 };
      pBuilds.push(home);
      const [w] = wed('player', home.x + 2, home.y + 2, 'Span');
      /* THE TERM, MEASURED — from the night she conceives to the night she comes to term, which
         is the wait the player is complaining about. NOT to the birth: `bannerLoad() >= SQUAD_CAP`
         holds a finished pregnancy in three-day stalls, and that rule predates all of this and
         is about the squad being full rather than about a pregnancy being long. It is reported
         underneath rather than folded into the number. */
      let conceivedOn = null, termOn = null, stalls = 0, prev = 0;
      for (let d = 0; d < 250 && termOn === null; d++) {
        midnight();
        if (conceivedOn === null && w.pregnant) { conceivedOn = day; prev = w.pregnant; continue; }
        if (conceivedOn !== null) {
          if (w.pregnant > prev) stalls++;              /* held back for want of room under the banner */
          if (prev === 1) termOn = day;                 /* the clock ran out on this midnight */
          prev = w.pregnant;
        }
      }
      termDays = termOn !== null ? termOn - conceivedOn : null;
      R.aChildIsNotTwoYearsWork = termDays !== null && termDays <= AGE_YEAR_DAYS
        ? `conception to term is ${termDays} game-days — inside one year of ${AGE_YEAR_DAYS}, where it used to be nearly two${stalls ? ` (the banner then held it ${stalls}x for want of room, which is a different rule)` : ''}`
        : `!! A PREGNANCY OUTLASTS A YEAR IN THIS WORLD (${termDays} days against a ${AGE_YEAR_DAYS}-day year)`;
      pBuilds.splice(pBuilds.indexOf(home), 1);
      wipe();
    }

    /* ---------- 6. AND THE WORLD IS NOT FROZEN ----------
       The negative control that matters most: gating BIRTH on a bed would have quietly stopped
       every town and every band from growing, and nothing above would have noticed. */
    {
      const [w] = wed('town', gx, gy, 'Town');
      w.civ = true; w.pregnant = 1;
      const was = seenIds();
      let d = 0, born = [];
      for (; d < 10 && !born.length; d++) { midnight(); born = bornNear(w, was); }
      R.theWorldIsNotFrozen = born.length && !w.pregnant
        ? `a townswoman at her term on the same empty waste still delivers where she stands — ${born[0].name}, ${d} night${d > 1 ? 's' : ''}. The roof is asked of your people only.`
        : `!! THE WHOLE WORLD NOW NEEDS AN INN (born ${born.length}, pregnant ${w.pregnant}, overdue ${w.overdue})`;
      wipe();
    }

    /* ---------- 7. AND TWO PEOPLE ON OPPOSITE SIDES OF THE MAP ARE NOT TOGETHER ---------- */
    {
      const [w, h] = wed('player', gx, gy, 'Apart');
      h.x = gx + 60; h.y = gy + 60;
      let conceived = 0;
      for (let d = 0; d < 200 && !conceived; d++) { midnight(); if (w.pregnant || h.pregnant) conceived = d + 1; }
      R.andApartIsApart = !conceived
        ? 'two hundred nights sixty tiles apart and no child — together is still the one thing that is never optional'
        : `!! A COUPLE CONCEIVED ACROSS SIXTY TILES (night ${conceived})`;
      wipe();
    }

    wipe();
    snapshot = _snap; packSaveText = _pack;
    R.cost = `${nights} midnights rolled in ${((Date.now() - t0) / 1000).toFixed(1)}s`;
    return R;
  });

  console.log('=== A LINE IS CONTINUED ON THE ROAD AND FINISHED UNDER A ROOF ===\n');
  for (const [k, v] of Object.entries(out)) console.log('  ' + k.padEnd(26) + v);
  if (errs.length) console.log('\n' + errs.join('\n'));
  const bad = Object.values(out).map(String).filter(v => v.startsWith('!!')).concat(errs);
  console.log('\n' + (bad.length ? '*** ' + bad.join('\n*** ')
    : 'CONCEIVED WHEREVER THEY ARE, BORN WHERE THERE IS A BED'));
  await b.close();
  process.exit(bad.length ? 1 : 0);
})();
