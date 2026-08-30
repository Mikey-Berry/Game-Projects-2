#!/usr/bin/env node
/* EVERY BOUND THING THE CIRCLE CAN MAKE, DRAWN.
 *
 * Written for "Summoning a wisp crashes the game as of right now", and deliberately not
 * written for the wisp. The wisp was one of THREE rigs that raised the same flag, and the
 * second of them — the Soulbound — crashed in exactly the same place and nobody had reported
 * it yet. A probe that summoned a wisp would have gone green over a live crash.
 *
 * THE CRASH IS IN THE DRAW, NOT IN THE RITE, which is the whole reason this file drives
 * `render()`. `craftUndead` returns true, the body is in `chars`, the materials are spent —
 * every state assertion you could write about the summon passes. The mesh is built and posed
 * on the next FRAME, and that is where `Cannot read properties of undefined` comes out. So
 * the check is: make one of everything, draw it alive, put it on the ground and draw it dead.
 *
 * DEAD AS WELL AS ALIVE, because the two are different branches of the pose machine and the
 * bug existed independently in both. The downed branch drops the jaw of a thing that has
 * stopped; it reached for that jaw with no more justification than the live branch did.
 *
 * THE ERROR HAS TO BE CAUGHT WHERE IT IS THROWN. `render()` is called from the animation loop
 * as well as from here, so an exception raised inside it lands in Playwright's `pageerror`
 * channel and NOT in the return value of the evaluate — a probe that only checks its own
 * `try/catch` will report a clean run while the console fills with the crash. Both are read.
 *
 *   node tools/bound.js [game.html]
 */
const { chromium } = require('playwright');
const path = require('path');
const gamePath = (a) => path.resolve(a ? (path.isAbsolute(a) ? a : path.join(__dirname, a)) : path.join(__dirname, 'game.html'));

(async () => {
  const b = await chromium.launch({
    executablePath: process.env.DUSTWARD_CHROME || undefined,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'],
  });
  const p = await b.newPage({ viewport: { width: 1100, height: 700 } });
  const errs = [];
  p.on('pageerror', e => errs.push(String(e.message).slice(0, 200)));
  await p.goto('file://' + gamePath(process.argv[2]), { waitUntil: 'load' });
  await p.waitForTimeout(3000);
  /* START AND STOP IN THE SAME BREATH. A click followed by a wait lets the world run for
     however many frames the machine manages, which is not a fixed number and drops when a
     sixty-harness suite is loading the box — so every body is somewhere slightly different
     by the time this probe stages anything, and the numbers below inherit it. Measured on
     one unchanged build before this was applied here: flank.js gave 1.67 / 1.67 / 1.09 over
     three runs, and guns.js split three-to-two on an md5 that had not moved. Pausing inside
     the same evaluate leaves no frames at all between the two. Every file below sets
     `paused` for itself anyway; this only removes the window before its first statement. */
  await p.evaluate(() => { document.getElementById('btn-start').click(); paused = true; });
  await p.waitForTimeout(3000);

  const out = await p.evaluate(() => {
    const R = {};
    paused = true;
    const caster = chars.find(c => c.faction === 'player') || chars[0];
    /* enough of everything that nothing refuses for a reason that is not the point here */
    caster.stats.magic = 40; caster.mana = 9999; caster.maxMana = 9999;
    for (const k of Object.keys(ITEMS)) stash[k] = 999;
    for (const k of Object.keys(TECHS)) research.done[k] = true;
    const kinds = Object.keys(UNDEAD_TYPES);
    R.kinds = `${kinds.length} kinds in the circle: ${kinds.join(', ')}`;

    const made = [], refused = [], threw = [];
    for (const kind of kinds) {
      /* the binding fills up, and a full binding is a refusal that has nothing to do with the
         rig — clear it between summons so every kind gets its turn */
      for (let i = chars.length - 1; i >= 0; i--) if (chars[i].__probe) chars.splice(i, 1);
      caster.mana = 9999;
      const before = chars.length;
      try {
        const ok = craftUndead(kind, caster, { x: caster.x, y: caster.y }, null);
        const u = chars.length > before ? chars[chars.length - 1] : null;
        if (!ok || !u) { refused.push(kind); continue; }
        u.__probe = true;
        made.push({ kind, u });
      } catch (e) { threw.push(`${kind}: ${e.message}`.slice(0, 120)); }
    }
    R.theCircleMakesThem = threw.length === 0 && refused.length === 0
      ? `all ${made.length} of them are bound without complaint`
      : `!! ${threw.length ? 'THE RITE THREW — ' + threw.join('; ') : ''}${refused.length ? 'REFUSED: ' + refused.join(', ') : ''}`;

    /* ---------- AND NOW THE PART THAT ACTUALLY CRASHED ----------
       One at a time, because a throw out of `render` abandons the whole frame: everything
       after the offender in `chars` goes undrawn, so a batch would report one name and hide
       the rest. Named individually for the same reason.

       A FRAME THAT DID NOT BUILD THE RIG IS NOT A PASS, and this nearly went in as one.
       `syncChars` builds at most EIGHT rigs per frame — "a body one frame late is a body
       nobody noticed" — so a single `render()` can easily spend its whole budget on the
       townsfolk and never touch the thing under test. The pose machine is what crashes, the
       pose machine only runs on a rig that exists, and so a probe that renders once and sees
       no exception has proved nothing whatever. Render until the mesh is actually there, and
       fail loudly if it never arrives. */
    const rigNow = (u) => charMeshes.get(u.id) || null;
    const drawUntilBuilt = (u, tries = 12) => {
      let err = null;
      for (let i = 0; i < tries; i++) {
        try { render(); } catch (e) { err = e.message; break; }
        if (rigNow(u)) { try { render(); } catch (e) { err = e.message; } break; }
      }
      return { err, built: !!rigNow(u) };
    };
    const drawAlive = [], drawDead = [], neverBuilt = [];
    const rigs = {};
    for (const { kind, u } of made) {
      /* ONE AT A TIME MEANS PUTTING THIS ONE BACK. The loop above clears the previous summon
         out of `chars` before each rite so the binding does not fill up, which leaves every
         body in `made` except the last one OUT of the world — and `syncChars` walks `chars`,
         so a body that is not in it never gets a rig and never gets posed. That is exactly the
         empty frame `everyRigIsActuallyBuilt` exists to catch, and it caught this. */
      for (let i = chars.length - 1; i >= 0; i--) if (chars[i].__probe && chars[i] !== u) chars.splice(i, 1);
      if (chars.indexOf(u) < 0) chars.push(u);
      u.state = 'ok';
      selected = [u];
      const a = drawUntilBuilt(u);
      if (a.err) drawAlive.push(`${kind}: ${a.err}`.slice(0, 110));
      else if (!a.built) neverBuilt.push(kind);
      else rigs[kind] = rigNow(u);
      /* and on the ground. `down` and `dead` share the branch; `down` is the one a player
         sees most, because a bound thing that falls over is usually still yours. */
      u.state = 'down';
      const d = drawUntilBuilt(u);
      if (d.err) drawDead.push(`${kind}: ${d.err}`.slice(0, 110));
      u.state = 'ok';
    }
    R.everyRigIsActuallyBuilt = neverBuilt.length === 0
      ? `and the rig for every one of them is built and on screen, which is what makes the two lines below mean anything`
      : `!! ${neverBuilt.length} NEVER BUILT A RIG AT ALL (${neverBuilt.join(', ')}) — THE DRAW CHECKS BELOW ARE MEASURING AN EMPTY FRAME`;
    R.everyOneOfThemDrawsStanding = drawAlive.length === 0
      ? `every one of the ${made.length} draws standing up`
      : `!! ${drawAlive.length} OF ${made.length} CRASH THE FRAME WHEN DRAWN — ${drawAlive.join(' | ')}`;
    R.andEveryOneOfThemDrawsDowned = drawDead.length === 0
      ? 'and every one of them draws again lying on the ground'
      : `!! ${drawDead.length} OF ${made.length} CRASH THE FRAME WHEN DOWNED — ${drawDead.join(' | ')}`;

    /* ---------- AND THE RULE UNDERNEATH THE CRASH ----------
       Naming the two rigs that broke would pin the symptom and miss the bug. What went wrong
       is that one branch of the pose machine serves every rig that hangs on a float group, and
       it helped itself to a part only one of those rigs builds. So the invariant is about the
       CONTRACT, not about the wisp: anything flagged to be posed by the float rule must carry
       everything that rule touches without asking first — `float`, `sigil` and `spineBits` are
       all dereferenced unconditionally in both of its branches. A rig that raises the flag
       without one of them is the same crash under a new name.
       Read off the BUILT MESH and not off the character flags, because a flag no rig honours
       would pass a flag test and change nothing on screen. */
    /* ---------- AND THE RIG A LINE DESCRIBES IS THE RIG IT GETS ----------
       The float rule is a contract about what a floating rig must carry. This is the question
       one level up: does a summon whose mesh branch describes something float AT ALL. The
       Soulbound's branch draws a small blank wax figure hung in the air inside three turning
       rings — and the branch sits inside `if(c.beast)`, which its summon never set. The Wisp
       set it, the Servitor set it, the Soulbound did not, so it wore the ordinary skeleton and
       the authored figure had never been drawn. Nothing logs, because nothing is missing:
       there is simply a condition that cannot be true.
       Read off the BUILT MESH, like everything else here — `floats` is stamped by the rig, so
       a summon that sets the flag and builds nothing still fails. */
    const WANT_FLOAT = ['wisp', 'servitor', 'soulbound'];
    const notFloating = WANT_FLOAT.filter(k => rigs[k] && !rigs[k].floats);
    R._floatWanted = `meant to hang in the air: ${WANT_FLOAT.join(', ')}`;
    R.everyFigureThatShouldHangInTheAirDoes = notFloating.length === 0
      ? 'and each of the three summons whose mesh describes a floating figure actually builds one'
      : `!! ${notFloating.join(', ')} BUILDS A HUMANOID RIG — ITS AUTHORED MESH IS BEHIND A CONDITION THAT IS NEVER TRUE`;

    const NEEDED = ['float', 'sigil', 'spineBits'];
    const floaters = Object.entries(rigs).filter(([, e]) => e && e.floats);
    const missing = floaters.filter(([, e]) => NEEDED.some(k => !e[k])).map(([k, e]) => `${k} lacks ${NEEDED.filter(n => !e[n]).join('+')}`);
    R._whatFloats = `posed by the float rule: ${floaters.map(([k]) => k).join(', ') || 'nothing'}`;
    R.everyFloaterCarriesWhatThePoseTouches = floaters.length > 0 && missing.length === 0
      ? `every rig posed by the float rule carries what that rule reaches for (${NEEDED.join(', ')}) — ${floaters.length} of them`
      : floaters.length === 0
        ? '!! NOTHING IS POSED BY THE FLOAT RULE AT ALL — this check has stopped measuring anything'
        : `!! ${missing.join('; ')} — THE FLOAT POSE WILL THROW ON IT`;
    /* the jaw is the part that was assumed, so it gets its own line: it belongs to the rig
       with a skull on it and to no other, and the pose has to ask before it moves one */
    const jawed = Object.entries(rigs).filter(([, e]) => e && e.jaw).map(([k]) => k);
    R.andTheJawBelongsToTheSkull = jawed.length === 1 && jawed[0] === 'servitor'
      ? 'and the jaw belongs to the Bound Servitor alone — the rig that has a skull to hang one on'
      : `!! THE JAWS ARE NOT WHERE THEY SHOULD BE (${jawed.join(', ') || 'nothing has one'})`;

    for (let i = chars.length - 1; i >= 0; i--) if (chars[i].__probe) chars.splice(i, 1);
    return R;
  });

  console.log('=== EVERY BOUND THING, DRAWN ===\n');
  for (const [k, v] of Object.entries(out)) console.log('  ' + k.padEnd(38) + v);
  const bad = Object.values(out).map(String).filter(v => v.startsWith('!!'));
  /* THE FRAME THROWS INTO A CHANNEL OF ITS OWN. See the note at the top. */
  if (errs.length) console.log('\n  ' + 'uncaughtInTheFrame'.padEnd(30) + `!! ${errs.length} EXCEPTION(S) ESCAPED THE RENDER LOOP — ${[...new Set(errs)].slice(0, 3).join(' | ')}`);
  console.log('\n' + (bad.length || errs.length
    ? '*** ' + [...bad, ...(errs.length ? ['exceptions escaped the render loop'] : [])].join('\n*** ')
    : 'EVERY BOUND THING THE CIRCLE MAKES CAN ALSO BE DRAWN'));
  await b.close();
  if (bad.length || errs.length) process.exitCode = 1;
})();
