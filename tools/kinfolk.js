#!/usr/bin/env node
/* WHETHER THE TOWNS CAN CARRY A LINE AT ALL.
 *
 *   "Are they still properly giving birth and carrying on legacies after our changes to the
 *    birthing mechanics?"
 *
 * The audit's answer was no, and not because of the birthing rework. `tools/_census.js` ran the
 * world twenty-four days and found ZERO bodies anywhere with a spouse — measured identical on
 * `base.html`, `pr28.html` and `prebatch.html`, so this is as old as the file. Three walls, no
 * door:
 *
 *   · `courtable` requires BOTH sides be `faction==='player'`
 *   · `courtableNpc` requires the initiator be
 *   · the bond tick filters to player bodies, so no two townsfolk could ever reach the 180 that
 *     `marriageable` wants
 *
 * and the conception loop opens `if(!a.spouse) continue`, so it had never once run for a
 * townsperson. The one other source of children — a spontaneous town spawn — was gated on every
 * `civ` body against `def.civs + 4`, and worldgen seeds four children into every town, so every
 * town on the map began at or above its own ceiling.
 *
 * Meanwhile a year here is SEVEN days and forty-five percent of every child that reaches sixteen
 * leaves for the spear, the road or the camps. Townsfolk went 196 → 189 over twenty-four days
 * with nothing at all replacing them.
 *
 * Nothing here calls a courtship helper by hand. The whole point is that the WORLD does it, so
 * every claim runs the day roll-over — which is inline in `update` rather than a function
 * anything can call, so it is reached by pushing `hour` to 23.999 and taking one unpaused step.
 *
 *   node tools/kinfolk.js [game.html]
 */
const { chromium } = require('playwright');
const path = require('path');
const gamePath = (a) => path.resolve(a ? (path.isAbsolute(a) ? a : path.join(__dirname, a)) : path.join(__dirname, 'game.html'));

(async () => {
  const b = await chromium.launch({
    executablePath: process.env.DUSTWARD_CHROME || undefined,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'],
  });
  const errs = [];
  const p = await b.newPage({ viewport: { width: 1000, height: 700 } });
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message.slice(0, 200)));
  await p.goto('file://' + gamePath(process.argv[2]), { waitUntil: 'load' });
  await p.waitForTimeout(3000);
  await p.evaluate(() => { document.getElementById('btn-start').click(); paused = true; });
  await p.waitForTimeout(3000);

  const R = await p.evaluate(() => {
    const O = {};
    paused = true;
    const guard = (keys, fn) => {
      try { fn(); } catch (e) { for (const k of keys) if (O[k] === undefined) O[k] = '!! ' + String(e.message).slice(0, 130).toUpperCase(); }
    };
    const rollDay = () => { const was = paused; paused = false; hour = 23.999; update(1 / 30); paused = was; };
    const civsOf = (t) => chars.filter(c => c.civ && c.homeTown === t && c.state !== 'dead');

    /* ---- 0. THE PREMISE, COUNTED FIRST ----
       Every claim below counts something that starts at zero, and a count of zero is only
       evidence if the thing could have happened. So: how many unwed grown townsfolk are there
       to pair off at all? If the answer were small, "nobody wed" would say nothing. */
    let pool = 0, civ0 = 0;
    guard(['thereArePeopleToPairOff'], () => {
      civ0 = chars.filter(c => c.civ && c.state !== 'dead').length;
      pool = chars.filter(c => c.civ && c.state === 'ok' && !c.spouse && (c.age || 0) >= 18 && (c.age || 0) <= 55).length;
      O.thereArePeopleToPairOff = pool >= 40
        ? `${pool} unwed grown townsfolk across ${towns.length} towns before anything runs — `
          + `enough that a count of zero weddings below means a shut door rather than a small town`
        : `!! ONLY ${pool} UNWED ADULTS IN THE WORLD — THE CLAIMS BELOW WOULD PROVE NOTHING`;
    });

    /* ---- 1. THE TOWNS PAIR OFF ----
       Thirty days of roll-overs and nothing else. Bond accrues at 6-20 a night per pair against
       a courting threshold of 70 and `marriageable`'s 180, so a pair that keeps meeting gets
       there in under a fortnight — which is the shape wanted: courtship takes real time and a
       town is not a mass wedding on day two. */
    guard(['townsfolkTakeUpWithEachOther', 'andSomeOfThemWed'], () => {
      for (let i = 0; i < 30; i++) rollDay();
      const courting = chars.filter(c => c.civ && c.partner && !c.spouse && c.state !== 'dead').length;
      const wed = chars.filter(c => c.civ && c.spouse && c.state !== 'dead').length;
      O._pairs = `after 30 days: ${courting} courting, ${wed} wed, from a starting pool of ${pool}`;
      O.townsfolkTakeUpWithEachOther = courting + wed > 0
        ? `${courting + wed} townsfolk have found somebody in thirty days without a single player standing there — `
          + `the bond tick reaches past your own squad now, which is the wire that was missing`
        : '!! NOT ONE TOWNSPERSON IS COURTING OR WED AFTER THIRTY DAYS';
      O.andSomeOfThemWed = wed > 0
        ? `${wed} of them are married, so the conception loop — which opens \`if(!a.spouse) continue\` — `
          + `has something to iterate over for the first time`
        : '!! COURTSHIP NEVER REACHES A WEDDING';
    });

    /* ---- 2. AND A TOWN WEDDING DOES NOT CONSCRIPT ANYBODY ----
       `marry`'s outsider block moves a non-player spouse into your squad. It is guarded on one
       side being a player body, and that guard is load-bearing now that the towns marry on their
       own — an unguarded one would quietly hand you two hundred townsfolk. */
    guard(['aTownWeddingLeavesThemInTheirTown'], () => {
      const wedCivs = chars.filter(c => c.civ && c.spouse && c.state !== 'dead');
      const stolen = wedCivs.filter(c => c.faction === 'player' || !c.homeTown);
      O.aTownWeddingLeavesThemInTheirTown = (wedCivs.length > 0 && stolen.length === 0)
        ? `all ${wedCivs.length} married townsfolk are still townsfolk with a home town — `
          + `the outsider clause in \`marry\` still needs one of the two to be yours`
        : wedCivs.length === 0 ? '!! NO TOWN MARRIAGES TO CHECK'
          : `!! ${stolen.length} TOWNSFOLK WERE PULLED OUT OF THEIR TOWN BY THEIR OWN WEDDING`;
    });

    /* ---- 3. THEY CONCEIVE, AND THE CHILD HAS PARENTS ----
       Conception is a 0.02 daily roll on a pair, so this needs days rather than an assertion.
       The CAP is the other half of it: the old gate counted children too and every town began
       over it, so a pass here is also a statement that the ceiling counts grown people now. */
    guard(['townCouplesConceive', 'aNewbornKnowsItsParents'], () => {
      for (let i = 0; i < 60; i++) rollDay();
      const carrying = chars.filter(c => c.civ && (c.pregnant || 0) > 0 && c.state !== 'dead').length;
      const kin = chars.filter(c => (c.mother || c.father) && c.state !== 'dead');
      const kinBoth = kin.filter(c => c.mother && c.father);
      O._kin = `after 90 days: ${carrying} carrying, ${kin.length} bodies with a recorded parent`;
      O.townCouplesConceive = carrying + kin.length > 0
        ? `the towns are carrying and delivering on their own — ${carrying} expecting, ${kin.length} born with a line`
        : '!! NINETY DAYS AND NOT ONE TOWN PREGNANCY OR BIRTH';
      /* AND THE PARENTS ARE REAL BODIES, not a string copied off a stranger. This is the whole
         of "carrying on legacies": the old spontaneous spawn took a `legacyTrade` off a randomly
         picked civ who was never linked to the child in any way.
         ---------- AND AN ANCESTOR IS NOT A BROKEN LINK ----------
         The first version of this demanded that every recorded mother still resolve, and it went
         red at 1 of 36 — correctly, and for the wrong reason. `kill` ends with
         `chars.splice(ci, 1)`: a body that dies does not become a dead entry, it stops existing.
         Over ninety days on a seven-day calendar that is thirteen years, and mothers die. So an
         unresolvable id is an ANCESTOR, and the claim has to say which of the two it is looking
         at instead of counting one as the other.
         The bar that is left is not arbitrary and it is not a percentage pulled out of the air:
         measured, 35 of 36 parents were still standing after ninety years of dust, so a code path
         writing junk ids would put `resolved` at or near ZERO rather than at a nick under all of
         them. Half is a floor a bug cannot clear and mortality cannot reach. */
      const resolved = kin.filter(c => chars.some(o => o.id === c.mother));
      const ancestors = kin.length - resolved.length;
      O._ancestors = `${resolved.length} of ${kin.length} recorded mothers are still standing; ${ancestors} have died and been removed`;
      O.aNewbornKnowsItsParents = (kin.length > 0 && resolved.length >= kin.length * 0.5 && kinBoth.length > 0)
        ? `${resolved.length} of ${kin.length} children name a mother who is still alive to be found `
          + `(${kinBoth.length} carry both parents); the other ${ancestors} name someone the dust has taken, `
          + `which is a line you can follow rather than a copied string`
        : kin.length === 0 ? '!! NO CHILD WAS BORN TO NAMED PARENTS IN NINETY DAYS'
          : `!! ONLY ${resolved.length} OF ${kin.length} RECORDED MOTHERS WERE EVER REAL BODIES`;
    });

    /* ---- 4. AND A LINE IS INHERITED ----
       `legacyTrade` is what the coming-of-age branch reads at 0.7 to decide whether a child takes
       up the bench its parent stood at. It was written in exactly one place before this and never
       off a real parent. */
    guard(['aChildInheritsItsParentsTrade'], () => {
      /* SAME CORRECTION AS ABOVE, and it is the same one body: a child whose mother has died is
         compared against whichever parent is left, which is not the parent the legacy was taken
         from. Only children whose MOTHER is still findable can be asked this question at all —
         everyone else is being asked about a record the world no longer holds the other half of. */
      const kin = chars.filter(c => c.mother && c.state !== 'dead' && chars.some(o => o.id === c.mother));
      if (!kin.length) { O.aChildInheritsItsParentsTrade = '!! NO CHILDREN WITH A LIVING MOTHER TO CHECK'; return; }
      let matched = 0, askable = 0;
      for (const c of kin) {
        const mum = chars.find(o => o.id === c.mother);
        const dad = c.father ? chars.find(o => o.id === c.father) : null;
        const parentTrade = (mum && mum.trade) || (dad && dad.trade) || null;
        if (!parentTrade) continue;
        askable++;
        if (c.legacyTrade === parentTrade) matched++;
      }
      O._legacy = `${askable} children born to a parent who has a trade; ${matched} carry it`;
      O.aChildInheritsItsParentsTrade = (askable > 0 && matched === askable)
        ? `all ${askable} children born to a working parent carry that parent's trade as their legacy — `
          + `which is what the coming-of-age branch has always read and never once been given honestly`
        : askable === 0 ? '!! NO CHILD WAS BORN TO A PARENT WITH A TRADE'
          : `!! ONLY ${matched} OF ${askable} CHILDREN INHERITED THE TRADE THEY WERE BORN TO`;
    });

    /* ---- 5. AND THE TOWNS DO NOT EMPTY ----
       The target the whole item is measured against. Not "grows" — forty-five percent of every
       child that reaches sixteen still leaves for the spear, the road or the camps, and that is
       good world texture that stays. The claim is that the towns can now REPLACE them. */
    guard(['theTownsHoldTheirNumbers'], () => {
      const now = chars.filter(c => c.civ && c.state !== 'dead').length;
      /* ---------- MEASURED AGAINST WHERE IT STARTED, NOT AGAINST THE PLAN ----------
         The first version of this read the count against `def.civs` summed over the towns, and
         it went GREEN ON THE CONTROL — 178 against a designed 156 — which makes it no claim at
         all. Worldgen lays a town out with more bodies than its `civs` number (children, the
         leader, the seats), so "above the designed size" is where a world STARTS, and a world
         that has been draining for ninety days is still above it on the way down.
         The thing the whole item is measured by is the DIRECTION. Control: 196 → 178 over ninety
         days, falling, with nothing replacing anybody. So the bar is the count this same world
         had before a single day was rolled. Held, not planned. */
      O._hold = `${civ0} townsfolk at dawn on day one, ${now} after ninety days`;
      O.theTownsHoldTheirNumbers = (civ0 > 0 && now >= civ0 * 0.97)
        ? `${civ0} townsfolk went to ${now} over ninety days — the towns replace what the spear, `
          + `the road and the camps take off them, with the forty-five percent attrition at sixteen left exactly where it was`
        : `!! TOWNS DRAINED FROM ${civ0} TO ${now} OVER NINETY DAYS`;
    });

    /* ---- 6. AND A FULL TOWN IS A BRAKE, NOT A WALL ----
       Stated as a live claim rather than trusted: no town should be sitting far over its own
       ceiling, and none should be empty either. */
    guard(['noTownRunsAwayAndNoneEmpties'], () => {
      const bad = [];
      for (const t of towns) {
        const grown = civsOf(t).filter(c => (c.age || 0) >= 16).length;
        const room = (t.def.civs || 4) + 4;
        if (grown > room * 1.6) bad.push(`${t.name} ${grown}/${room} OVER`);
        if (grown < 2) bad.push(`${t.name} ${grown}/${room} EMPTY`);
      }
      O._rooms = towns.map(t => `${t.name}:${civsOf(t).filter(c => (c.age || 0) >= 16).length}/${(t.def.civs || 4) + 4}`).join(' ');
      O.noTownRunsAwayAndNoneEmpties = bad.length === 0
        ? `every town sits inside a sane band of its own designed size — the ceiling slows a crowded `
          + `town's conceptions rather than sterilising it, and no town has emptied out`
        : `!! ${bad.join(', ')}`;
    });
    return O;
  });

  console.log('=== WHETHER THE TOWNS CAN CARRY A LINE ===\n');
  for (const [k, v] of Object.entries(R)) console.log('  ' + k.padEnd(34) + v);
  const bad = Object.values(R).map(String).filter(v => v.startsWith('!!'));
  if (errs.length) { console.log(''); errs.slice(0, 4).forEach(e => console.log('  ' + e)); }
  console.log('\n' + (bad.length || errs.length
    ? '*** ' + [...bad, ...errs].join('\n*** ')
    : 'THE TOWNS COURT, WED, CONCEIVE AND HOLD THEIR NUMBERS'));
  await b.close();
  process.exitCode = (bad.length || errs.length) ? 1 : 0;
})();
