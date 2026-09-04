#!/usr/bin/env node
/* WHAT A CHILD IS BORN WITH.
 *
 * "we should include (tastefully) a chance of losing the baby, or other random happenings (such
 *  as it being born with gifts inherited from parents, dual gifts, or possibly even with high
 *  stats under rare occasions, like being born under a blood moon.)"
 *
 * Before this, every child in the game was identical: atk 1, def 1, tough 2, ath 3, no gift, and
 * — measured — no player child was ever given stats when it came of age either, so two hundred
 * births produced two hundred interchangeable people and nothing about a birth was ever an
 * event.
 *
 * Everything here is a RATE, and every rate is asked against its own control in the same build:
 * a loss rate against the same rate with the mother dragged around at term, an inheritance rate
 * against two ungifted parents, a moonborn rate against the same births with no moon in the sky.
 * A probe that watches one birth and finds a gift has measured a coin landing.
 *
 *   node tools/cradle.js [game.html]
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
    const _snap = snapshot, _pack = packSaveText;
    snapshot = () => ({});
    packSaveText = () => new Promise(() => {});   /* see lineage.js — the day block autosaves the world */

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
    R.ground = gx ? `staged on open waste at ${gx},${gy}` : '!! NO OPEN GROUND';

    /* a roof, so every birth below is one she is entitled to have */
    const home = { type: 'home', x: gx, y: gy, w: 4, h: 4, floor: 0, hp: 200, maxHp: 200, progress: 1, kids: 0, bornDay: -999 };
    pBuilds.push(home);
    const hx = home.x + 2, hy = home.y + 2;

    const probes = [];
    const mk = (name, x, y, o) => {
      const c = makeChar(name, 'player', x, y, o || {});
      c.state = 'ok'; c.__probe = true; chars.push(c); probes.push(c); return c;
    };
    const wipe = () => { for (let i = chars.length - 1; i >= 0; i--) if (chars[i].__probe) chars.splice(i, 1); probes.length = 0; };
    const midnight = () => { paused = false; hour = 23.98; update(0.25); paused = true; };

    /* ---------- THE RIG ----------
       One couple at the homestead, forced to term every night, and the newborn taken out of the
       world again as soon as it is counted. Taking it out matters twice: `bannerLoad() >= SQUAD_CAP`
       holds a finished pregnancy in three-day stalls, so two hundred children left standing there
       would stop the run dead; and the children have to be removed to be counted a second time. */
    const run = (n, opt) => {
      opt = opt || {};
      const res = { births: 0, lost: 0, gifted: 0, dual: 0, moon: 0, strong: 0, kids: [] };
      const w = mk('Mara', hx, hy, { atk: 5, def: 5, tough: 20, ath: 8 });
      const h = mk('Corin', hx + 0.4, hy, { atk: 5, def: 5, tough: 20, ath: 8 });
      for (const c of [w, h]) { c.age = 26; c.race = opt.race || 'human'; c.sub = opt.sub || null; }
      /* the child takes the MOTHER's line (`kid.race = c.race`), so a deaf child needs a deaf
         mother and says nothing about the father */
      if (opt.momRace) { w.race = opt.momRace; w.sub = opt.momSub || null; }
      w.sex = 'f'; h.sex = 'm';
      w.spouse = h.id; h.spouse = w.id;
      if (opt.momGift) w.gift = opt.momGift;
      if (opt.dadGift) h.gift = opt.dadGift;
      for (let i = 0; i < n; i++) {
        const was = new Set(chars.map(c => c.id));
        w.pregnant = 1;
        w.overdue = opt.overdue || 0;
        w.grief = 0; h.grief = 0;
        if (opt.moon) bloodMoon = 1;
        w.x = hx; w.y = hy; h.x = hx + 0.4; h.y = hy; w.age = 26; h.age = 26;
        midnight();
        const kid = chars.find(c => c.wasChild && !was.has(c.id) && dist(c.x, c.y, hx, hy) < 3);
        if (kid) {
          res.births++;
          if (kid.gift) res.gifted++;
          if (kid.giftTwo) res.dual++;
          if (kid.moonborn) res.moon++;
          if (kid.strongborn) res.strong++;
          if (res.kids.length < 400) res.kids.push(kid);
          chars.splice(chars.indexOf(kid), 1);
        } else if (!w.pregnant) res.lost++;      /* came to term, no child, not still carrying */
        home.kids = 0; home.bornDay = -999; w.lastBorn = null; h.lastBorn = null;
      }
      wipe();
      return res;
    };

    /* ---------- 1. THE CONTROL: MOST OF THEM ARRIVE ---------- */
    const plain = run(200);
    R.mostOfThemArrive = plain.births > 150 && plain.births + plain.lost === 200
      ? `two hundred births at a homestead, on the night she came to term: ${plain.births} children, ${plain.lost} lost`
      : `!! THE RIG IS NOT PRODUCING BIRTHS (${plain.births} born, ${plain.lost} lost of 200)`;

    /* ---------- 2. AND SOME DO NOT ---------- */
    const lossFresh = plain.lost / 200;
    R.andSomeDoNot = lossFresh > 0 && lossFresh < 0.15
      ? `and it is a real chance and a small one — ${plain.lost} of 200, ${(lossFresh * 100).toFixed(1)}%`
      : `!! THE LOSS RATE IS WRONG (${plain.lost}/200 = ${(lossFresh * 100).toFixed(1)}%)`;

    /* ---------- 3. AND CARRYING HER AROUND AT TERM IS WHAT MAKES IT WORSE ----------
       The one thing about this the player controls, so it has to be the thing that moves. */
    const dragged = run(200, { overdue: 14 });
    const lossDrag = dragged.lost / 200;
    R.andTheRoadIsWhatCosts = lossDrag > lossFresh * 1.5
      ? `and a fortnight overdue on the road doubles it and more — ${dragged.lost} of 200, ${(lossDrag * 100).toFixed(1)}% against ${(lossFresh * 100).toFixed(1)}% delivered on time`
      : `!! BEING DRAGGED AROUND AT TERM COSTS NOTHING (${(lossDrag * 100).toFixed(1)}% against ${(lossFresh * 100).toFixed(1)}%)`;

    /* ---------- 4. A GIFT PASSES DOWN, AND ONLY FROM SOMEBODY WHO HAS ONE ---------- */
    R.nothingComesFromNothing = plain.gifted === 0
      ? 'two ungifted parents produced two hundred children and not one art between them'
      : `!! ${plain.gifted} GIFTED CHILDREN FROM TWO DEAF PARENTS`;
    const oneGift = run(200, { momGift: 'dark' });
    const rOne = oneGift.gifted / Math.max(1, oneGift.births);
    R.aGiftPassesDown = rOne > 0.15 && rOne < 0.55
      ? `while one gifted parent passes it to ${oneGift.gifted} of ${oneGift.births}, ${(rOne * 100).toFixed(0)}% — and every one of them is the dark, which is the branch she holds`
      : `!! THE INHERITANCE RATE IS WRONG (${oneGift.gifted}/${oneGift.births} = ${(rOne * 100).toFixed(0)}%)`;
    R.andItIsHerArt = oneGift.kids.filter(k => k.gift).every(k => k.gift === 'dark')
      ? 'and not one of them came up holding a branch neither parent had'
      : `!! A CHILD INHERITED AN ART NOBODY IN THE HOUSE HAS (${[...new Set(oneGift.kids.filter(k => k.gift).map(k => k.gift))].join(' ')})`;

    /* ---------- 5. AND A DEAF LINE INHERITS NOTHING ----------
       STAGED, AND WORTH SAYING WHY. Measured in this build: the only race that breeds at all is
       human, and humans hold gifts — so there is no pairing you can meet in play where a fertile
       parent's child is deaf, and the `canHoldGift` guard in the birth block is defence rather
       than a rule anybody will see. It is still the guard that has to be there the day a fertile
       deaf line is added, so the mother is given a deaf line by hand (chimera/houndkin, whose
       race carries `noGift`) and the birth block asked directly. Nothing here touches fertility:
       `run` forces the pregnancy, so only the BIRTH rules are in play.
       The father is the caster, which also makes this the mirror of `aGiftPassesDown`: the same
       gifted parent, the same rate, and a child that cannot take it. */
    const deaf = run(120, { dadGift: 'dark', momRace: 'chimera', momSub: 'houndkin' });
    R.aDeafLineInheritsNothing = deaf.births > 60 && deaf.gifted === 0
      ? `and a child of a line that cannot hold an art does not get one from its father either — ${deaf.births} of them, none gifted (staged: no fertile line in this build is deaf)`
      : `!! A DEAF LINE INHERITED AN ART (${deaf.gifted} of ${deaf.births})`;

    /* ---------- 6. TWO PARENTS, TWO BRANCHES, AND RARELY BOTH ---------- */
    const two = run(300, { momGift: 'dark', dadGift: 'destruction' });
    const rTwo = two.gifted / Math.max(1, two.births), rDual = two.dual / Math.max(1, two.births);
    R.twoParentsAreBetterOdds = rTwo > rOne
      ? `two gifted parents pass it more often than one — ${(rTwo * 100).toFixed(0)}% against ${(rOne * 100).toFixed(0)}%`
      : `!! A SECOND CASTER IN THE HOUSE CHANGES NOTHING (${(rTwo * 100).toFixed(0)}% against ${(rOne * 100).toFixed(0)}%)`;
    R.andRarelyBothOfThem = two.dual > 0 && rDual < 0.12
      ? `and ${two.dual} of ${two.births} came up holding both, ${(rDual * 100).toFixed(1)}% — rare enough to be worth saying out loud`
      : `!! THE DUAL GIFT IS ${two.dual ? 'NOT RARE' : 'UNREACHABLE'} (${two.dual}/${two.births})`;

    /* ---------- 7. A GIFT IS A PROMISE, NOT AN INFANT THROWING FIRE ---------- */
    {
      const babe = two.kids.find(k => k.gift);
      const dualBabe = two.kids.find(k => k.giftTwo);
      R.aNewbornCannotCast = !babe ? '!! NO GIFTED CHILD TO ASK'
        : spellsFor(babe).length === 0 && !attOf(babe, babe.gift)
          ? `a gifted newborn holds the ${babe.gift} art and no attunement, and ${babe.name} can cast nothing`
          : `!! AN INFANT IS A CASTER (att ${attOf(babe, babe.gift)}, spells ${spellsFor(babe).map(e => e[0]).join(' ')})`;
      /* AND SIXTEEN YEARS LATER IT CAN. Driven through the real coming-of-age branch, which is
         the age test in the day block — nothing here writes an attunement. */
      if (babe) {
        chars.push(babe); babe.__probe = true; babe.x = hx; babe.y = hy; babe.age = 16.5;
        midnight();
        R.andAtSixteenItCan = attOf(babe, babe.gift) >= 2 && spellsFor(babe).length > 0
          ? `and at sixteen the branch opens on its own — ${babe.name} comes into the ${babe.gift} art at adept, ${spellsFor(babe).length} formulae and ${Math.round(babe.mana)} mana`
          : `!! IT NEVER COMES INTO THE ART (att ${attOf(babe, babe.gift)}, spells ${spellsFor(babe).length}, wasChild ${babe.wasChild})`;
      } else R.andAtSixteenItCan = '!! NO GIFTED CHILD TO ASK';
      if (dualBabe) {
        chars.push(dualBabe); dualBabe.__probe = true; dualBabe.x = hx; dualBabe.y = hy; dualBabe.age = 16.5;
        midnight();
        R.andADualGiftIsWideNotDeep = attOf(dualBabe, dualBabe.gift) === 3 || attCap(dualBabe, dualBabe.giftTwo) === 2
          ? `and a dual gift is wide rather than deep: ${dualBabe.giftTwo} opens at ${attOf(dualBabe, dualBabe.giftTwo)} and caps at ${attCap(dualBabe, dualBabe.giftTwo)}, against ${attCap(dualBabe, dualBabe.gift)} for the branch it IS`
          : `!! BOTH BRANCHES GO ALL THE WAY UP (${attCap(dualBabe, dualBabe.gift)} / ${attCap(dualBabe, dualBabe.giftTwo)})`;
        R.andItSurvivesASave = JSON.stringify(_snap()).includes('giftTwo')
          ? 'and the second branch is written into the save, so it is still there after a reload'
          : '!! `giftTwo` IS NOT IN THE SNAPSHOT — a dual gift lasts until the first reload';
      } else { R.andADualGiftIsWideNotDeep = '!! NO DUAL CHILD TO ASK'; R.andItSurvivesASave = '!! NO DUAL CHILD TO ASK'; }
      wipe();
    }

    /* ---------- 8. AND THE SKY ---------- */
    {
      bloodMoon = 0;
      const moonless = plain.moon / Math.max(1, plain.births);
      const under = run(120, { moon: true });
      bloodMoon = 0;
      const rMoon = under.moon / Math.max(1, under.births);
      R.andTheSkyMarksSome = rMoon > 0.3 && moonless < 0.12
        ? `${under.moon} of ${under.births} born under a blood moon come up marked, ${(rMoon * 100).toFixed(0)}% — against ${(moonless * 100).toFixed(1)}% of the two hundred born under an ordinary one`
        : `!! THE MOON DOES NOT MARK THEM (${(rMoon * 100).toFixed(0)}% under it, ${(moonless * 100).toFixed(1)}% without)`;
      /* COMPARED INSIDE THE SAME RUN, AND ACROSS THE WHOLE COHORT. A first version picked one
         marked child and one child off the ordinary run and compared them — and the ordinary
         one it happened to pick was one of the rare strong births below, so two identical
         numbers came back and the claim read "the mark is cosmetic". Means, not specimens. */
      const mean = (a, k) => a.length ? a.reduce((t, c) => t + c.stats[k], 0) / a.length : 0;
      const mk2 = under.kids.filter(k => k.moonborn), um = under.kids.filter(k => !k.strongborn);
      R.andAMarkedChildIsStronger = mk2.length > 10 && um.length > 10 && mean(mk2, 'tough') > mean(um, 'tough') * 2 && mean(mk2, 'atk') > mean(um, 'atk') * 2
        ? `and the mark is not cosmetic — ${mk2.length} marked at tough ${mean(mk2, 'tough').toFixed(1)} atk ${mean(mk2, 'atk').toFixed(1)}, against ${um.length} unmarked from the same nights at ${mean(um, 'tough').toFixed(1)}/${mean(um, 'atk').toFixed(1)}`
        : `!! THE MARK IS COSMETIC (marked ${mk2.length} at ${mean(mk2, 'tough').toFixed(1)}/${mean(mk2, 'atk').toFixed(1)}, unmarked ${um.length} at ${mean(um, 'tough').toFixed(1)}/${mean(um, 'atk').toFixed(1)})`;
      /* ---------- AND A FEW WITH NO MOON TO BLAME ----------
         "possibly even with high stats under rare occasions" — the blood moon is the loud
         version and this is the quiet one, and it has to be measured or the loud one is the
         whole feature. A newborn is atk 1 def 1 tough 2 ath 3; anything above that was marked. */
      /* READ THE FLAG, NOT THE NUMBER. A first version counted children with `tough > 2` and
         got 55 of 194 — 28% against a 4% rule — because `makeChar` already spreads a newborn's
         stats: measured on the build before any of this, tough came out 1, 2, 5 or 6. The
         threshold was reading that variance, and a threshold three times higher would only have
         been wrong more quietly. */
      const strongPlain = plain.kids.filter(k => k.strongborn);
      const rStrong = strongPlain.length / Math.max(1, plain.births);
      R.andAFewWithNoMoonToBlame = strongPlain.length > 0 && rStrong < 0.12
        ? `and ${strongPlain.length} of ${plain.births} came up strong under an ordinary sky, ${(rStrong * 100).toFixed(1)}% — rare enough that a player who never sees a blood moon can still be surprised once`
        : `!! THE QUIET ONE IS ${strongPlain.length ? 'NOT RARE' : 'UNREACHABLE'} (${strongPlain.length}/${plain.births})`;
    }

    wipe();
    pBuilds.splice(pBuilds.indexOf(home), 1);
    snapshot = _snap; packSaveText = _pack;
    return R;
  });

  console.log('=== WHAT A CHILD IS BORN WITH ===\n');
  for (const [k, v] of Object.entries(out)) console.log('  ' + k.padEnd(28) + v);
  if (errs.length) console.log('\n' + errs.join('\n'));
  const bad = Object.values(out).map(String).filter(v => v.startsWith('!!')).concat(errs);
  console.log('\n' + (bad.length ? '*** ' + bad.join('\n*** ')
    : 'A BIRTH IS AN EVENT: SOME ARE LOST, SOME INHERIT, AND THE SKY MARKS A FEW'));
  await b.close();
  process.exit(bad.length ? 1 : 0);
})();
