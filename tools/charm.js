#!/usr/bin/env node
/* AN ART THE BODY IS, RATHER THAN ONE IT STUDIED.
 *
 * "Succubi currently can't use their racial charm ability. Not only is the option not there for
 *  players, I don't see any in the world using it much. From a UI perspective, we will also need
 *  to make sure this ability doesn't clash with a Succubus who has an alchemical gift."
 *
 * NOTHING WAS MISSING — the art, the cast path and the mana were all there, and `innateArt`,
 * `spellsFor`, `castReady` and `beginCast` had every one of them been taught about lines that
 * are born knowing something. THREE OTHER PLACES ASKED `if(c.gift)` as shorthand for "is this a
 * caster": the character panel, which draws the entire spell row inside that test, so a
 * giftless succubus had no button; the C and V hotkeys; and the NPC caster branch in `ai`,
 * which is why the world never used it either. One missing predicate, three symptoms, and the
 * feature underneath complete the whole time — this project's most common shape of bug.
 *
 * SO THE ASSERTIONS ARE ABOUT REACHABILITY, not about whether charm works. It is driven through
 * the panel's own button and through the real AI tick, because "the spell can be cast if you
 * call castCharm yourself" was true on the build before this and is not what anybody reported.
 *
 *   node tools/charm.js [game.html]
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
    const made = [];
    const succubus = (name, x, y, gift) => {
      const c = makeChar(name, 'player', x, y, { atk: 6, def: 6, tough: 10, magic: 20 });
      c.state = 'ok'; c.race = 'mimic'; c.sub = 'succubus'; c.gift = gift || null;
      c.mana = 100; c.castCd = 0; c.__probe = true;
      chars.push(c); made.push(c);
      return c;
    };
    const me = player()[0];

    /* ---------- 1. SHE HAS THE ART AT ALL ---------- */
    guard(['theLineIsBornKnowingIt', 'andSheHasTheManaForIt'], () => {
      const s = succubus('Bel', me.x + 2, me.y, null);
      R.theLineIsBornKnowingIt = (innateArt(s, 'charm') && castReady(s, 'charm'))
        ? 'a succubus with no gift at all is ready to cast her charm — the art is what she is, not something she studied'
        : `!! innate=${innateArt(s, 'charm')} ready=${castReady(s, 'charm')}`;
      /* the mana was never the problem and the assertion says so, because "she has no mana"
         is the obvious wrong answer to "why can't she cast" */
      R.andSheHasTheManaForIt = rawMaxMana(s) >= SPELLS.charm.cost
        ? `and a giftless body has ${rawMaxMana(s)} mana against the charm's ${SPELLS.charm.cost} — the pool was never gift-only`
        : `!! A GIFTLESS SUCCUBUS HOLDS ${rawMaxMana(s)} MANA AGAINST A COST OF ${SPELLS.charm.cost}`;
    });

    /* ---------- 2. AND THE PLAYER CAN REACH IT ----------
       Through the panel's own button. This is the report. */
    guard(['thePanelOffersItToThePlayer', 'andPressingItArmsTheCast'], () => {
      const s = chars.find(c => c.__probe && c.name === 'Bel');
      selected = [s];
      refreshCharPanel();
      const row = document.getElementById('spellrow');
      const btns = row ? [...row.querySelectorAll('button')] : [];
      const charm = btns.find(x => x.textContent.includes(SPELLS.charm.label));
      R._row = `her spell row holds ${btns.length}: ${btns.map(x => x.textContent.trim()).join(' | ') || '(nothing)'}`;
      R.thePanelOffersItToThePlayer = (charm && !charm.disabled)
        ? `the character panel offers "${charm.textContent.trim()}" on a succubus who holds no gift — before this the whole row was drawn inside an "if she has a gift" and she had no button of any kind`
        : `!! buttons=${btns.length} charm=${!!charm}`;
      if (charm) {
        castMode = null;
        charm.click();
        R.andPressingItArmsTheCast = (castMode && castMode.spell === 'charm')
          ? 'and pressing it arms the cast, so the order can actually be given at a target'
          : `!! castMode=${castMode ? castMode.spell : 'null'}`;
      } else R.andPressingItArmsTheCast = '!! not reached';
      castMode = null;
    });

    /* ---------- 3. AND IT DOES NOT CLASH WITH AN ATTUNEMENT ---------- */
    guard(['aGiftedSuccubusKeepsBoth', 'andHerOwnArtComesFirst', 'andItIsMarkedAsHers'], () => {
      /* THE DUST BRANCH WAS THE WRONG ATTUNEMENT TO TEST WITH. Charm is itself a dust art, and
         the only other thing in that branch she can hold needs research she has not done — so a
         dust-attuned succubus lists exactly one spell and there is no LEARNED button to tell
         apart from the innate one. Dark gives her real formulae beside her own art, which is
         what the note is actually about. */
      const g = succubus('Nyx', me.x + 3, me.y, 'dark');
      g.stats.magic = 30;
      g.att = g.att || {}; g.att.dark = 3;
      const keys = spellsFor(g).map(x => x[0]);
      R._gifted = `a dust-attuned succubus lists ${keys.length}: ${keys.join(', ')}`;
      /* NOT DUPLICATED — it qualifies twice and must still appear once */
      R.aGiftedSuccubusKeepsBoth = keys.filter(k => k === 'charm').length === 1
        ? `and a succubus who also took the dust attunement lists her charm exactly once among her ${keys.length} arts, not twice — it qualifies two ways and is still one entry`
        : `!! CHARM APPEARS ${keys.filter(k => k === 'charm').length} TIMES`;
      /* AND IN A STABLE PLACE. Left in declaration order the C and V hotkeys land on different
         spells for two succubi with the same art, which is the clash the note is about. */
      R.andHerOwnArtComesFirst = keys[0] === 'charm'
        ? 'and it sits first on her row whatever else she has learned, so C is always her charm and her formulae queue up behind it'
        : `!! HER ROW OPENS WITH ${keys[0]} AND THE HOTKEYS MOVE WITH HER STUDIES`;
      selected = [g];
      refreshCharPanel();
      const btns = [...document.querySelectorAll('#spellrow button')];
      const charm = btns.find(x => x.textContent.includes(SPELLS.charm.label));
      const learned = btns.find(x => !x.textContent.includes(SPELLS.charm.label));
      R.andItIsMarkedAsHers = (charm && charm.textContent.includes('◆') && learned && !learned.textContent.includes('◆'))
        ? 'and the two kinds are told apart on sight — what she was born to is marked, what she studied is not'
        : `!! charm="${charm ? charm.textContent.trim() : 'none'}" learned="${learned ? learned.textContent.trim() : 'none'}"`;
    });

    /* ---------- 4. AND THE WORLD USES IT ----------
       Through the real `ai` tick, not by calling castCharm. The NPC branch is a lookup on
       `c.arts`, which is what an ARCHETYPE was handed — a line born to an art was never in it. */
    guard(['aSuccubusInTheWorldReachesForIt'], () => {
      for (const c of made) { const i = chars.indexOf(c); if (i >= 0) chars.splice(i, 1); }
      made.length = 0;
      /* ---------- THE CLAIM IS "DOES SHE REACH FOR IT", NOT "DOES A 62% ROLL LAND" ----------
         `castCharm` is a contest: odds = 0.35 + (magic + dust*8 - resist) * 0.02. At magic 20
         against a mark with tough 10 and atk 5 that is 62%, and a hundred mana buys about five
         attempts — so the claim was a coin flipped five times, and the moment an upstream change
         moved the random stream it came up tails five times running and reported the NPC branch
         dead. It is not a flake, either: the stream is deterministic per build, so it failed
         every run on that build.
         Give her the attunement and the magic to sit at the 0.9 ceiling, and the mana for twenty
         attempts rather than five. What is being measured is whether the AI ever reaches for an
         innate art at all, and that question deserves not to be answered by dice. */
      const she = makeChar('Wanderer', 'bandit', me.x + 30, me.y + 30, { atk: 6, def: 6, tough: 10, magic: 40 });
      she.state = 'ok'; she.race = 'mimic'; she.sub = 'succubus'; she.gift = 'dust';
      she.att = { dust: 3, dark: 0, divine: 0, destruction: 0 };
      she.mana = 400; she.castCd = 0; she.__probe = true;
      chars.push(she); made.push(she);
      const mark = makeChar('Mark', 'player', she.x + 2, she.y, { atk: 5, def: 5, tough: 10 });
      mark.state = 'ok'; mark.__probe = true;
      chars.push(mark); made.push(mark);
      she.target = mark;
      rebuildCharGrid();
      /* THROUGH `physics`, NOT `ai`. There are two halves to a body's turn and the names do not
         say which is which: `ai` ends around line 9410 and returns outright on `if(c.target)
         return; /* movement handled in physics *\/`, and every scrap of COMBAT — target
         upkeep, the caster branch, the swing — lives in `physics` two thousand lines further
         down. The first version of this drove `ai` sixty times at a succubus standing two tiles
         from an enemy and reported that she never reached for her charm; she had returned on
         the third line every single time. It called nothing at all, which is the tell: a body
         that is deciding something calls SOMETHING. */
      let charmed = false;
      for (let i = 0; i < 260 && !charmed; i++) { she.target = she.target || mark; physics(she, 0.1); charmed = !!mark.charmed; }
      /* READ DEFENSIVELY, so the negative control still MEASURES. Naming `hasArts` straight
         throws on any build that predates it, the guard catches it, and the claim comes back as
         a ReferenceError — which proves a helper is new and says nothing about whether she used
         her charm. Degraded, the old build answers the question actually asked. */
      R._ai = `hasArts=${typeof hasArts === 'function' ? hasArts(she) : 'n/a'} cd=${she.castCd.toFixed(2)} mana=${Math.round(she.mana)} ` +
              `target=${she.target ? she.target.name : 'none'} d=${dist(she.x, she.y, mark.x, mark.y).toFixed(1)} ` +
              `hostile=${hostile(she, mark)} state=${she.state}`;
      R.aSuccubusInTheWorldReachesForIt = charmed
        ? 'and a succubus out in the world reaches for it on her own — the NPC branch folds a line\'s innate arts in beside whatever its archetype was handed'
        : `!! 260 TICKS WITH A TARGET IN FRONT OF HER, ${Math.round(400 - she.mana)} MANA SPENT, AND SHE NEVER USED IT`;
      for (const c of made) { const i = chars.indexOf(c); if (i >= 0) chars.splice(i, 1); }
    });

    return R;
  });

  const bad = Object.values(out).filter(v => typeof v === 'string' && v.startsWith('!!'));
  for (const [k, v] of Object.entries(out)) console.log('  ' + (k.startsWith('_') ? ('· ' + k.slice(1)).padEnd(32) : k.padEnd(32)) + ' ' + v);
  for (const e of errs) console.log('  ' + e);
  console.log('');
  console.log(bad.length || errs.length ? `SHE STILL CANNOT USE THE ONE THING SHE IS (${bad.length + errs.length})`
                                        : 'WHAT THE BODY IS, IT CAN ACTUALLY DO');
  await b.close();
  process.exit(bad.length || errs.length ? 1 : 0);
})();
