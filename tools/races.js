#!/usr/bin/env node
/* RACES AND THE LINES INSIDE THEM.
 *
 * A subrace is four separate mechanisms wearing one name — starting stats, a per-skill
 * learning rate, a damage-type vulnerability, and a handful of overrides for speed, lifespan
 * and skill ceiling — and every one of them is the kind of thing that can be declared in a
 * table, look completely correct, and never once reach the sim. So each is driven here
 * against the real functions rather than read off the table it came from.
 *
 *   node tools/races.js [game.html]
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
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message.slice(0, 220)));
  await p.goto('file://' + gamePath(process.argv[2]), { waitUntil: 'load' });
  await p.waitForTimeout(3000);
  await p.evaluate(() => document.getElementById('btn-start').click());
  await p.waitForTimeout(2500);

  const out = await p.evaluate(() => {
    const R = {};
    const born = [];
    const mk = (o) => { const c = makeChar('X', 'player', 600, 600, o); c.state = 'ok'; chars.push(c); born.push(c); return c; };
    const clean = () => { for (const c of born) { const i = chars.indexOf(c); if (i >= 0) chars.splice(i, 1); } born.length = 0; };

    /* ---------- 1. THE CATALOGUE ---------- */
    R.races = Object.keys(RACES).join(', ');
    R.scalebornGone = !RACES.scaleborn ? 'scaleborn is no longer a race of its own'
      : '!! SCALEBORN IS STILL A TOP-LEVEL RACE';
    R.scalebornIsALine = (SUBRACES.chimera && SUBRACES.chimera.scaleborn)
      ? 'it is a line of chimera' : '!! SCALEBORN IS NOT A CHIMERA LINE';
    R.golemExists = RACES.golem && SUBRACES.golem
      ? `golems, in ${Object.keys(SUBRACES.golem).length} kinds: ${Object.keys(SUBRACES.golem).join(', ')}`
      : '!! NO GOLEMS';
    R.humanLines = SUBRACES.human && Object.keys(SUBRACES.human).length >= 4
      ? `${Object.keys(SUBRACES.human).length} human lines: ${Object.keys(SUBRACES.human).join(', ')}`
      : '!! HUMANS HAVE NO LINES';
    /* every line must name itself and say what it is, or the picker shows blanks */
    {
      const bad = [];
      for (const [race, t] of Object.entries(SUBRACES))
        for (const [k, v] of Object.entries(t)) if (!v.label || !v.blurb) bad.push(race + '/' + k);
      R.allDescribed = bad.length ? '!! UNDESCRIBED LINES: ' + bad.join(', ') : 'every line has a name and a blurb';
    }

    /* ---------- 2. STARTING STATS ACTUALLY LAND ---------- */
    {
      const plain = mk({ race: 'human', sub: 'dustborn' });
      const pit = mk({ race: 'human', sub: 'pitborn' });
      const orch = mk({ race: 'human', sub: 'orchardbred' });
      R.statsLand = (pit.stats.tough > plain.stats.tough && pit.stats.labor > plain.stats.labor
        && orch.stats.farming > plain.stats.farming && orch.stats.atk <= plain.stats.atk)
        ? `pitborn ${pit.stats.tough} tough / ${pit.stats.labor} labor against dustborn ${plain.stats.tough}/${plain.stats.labor}`
        : '!! THE LINE\'S STARTING STATS NEVER REACHED THE BODY';
      /* a caller that asks for a number still gets it, plus what the line is worth */
      const asked = mk({ race: 'human', sub: 'pitborn', tough: 20 });
      R.statsAdd = asked.stats.tough > 20
        ? `an explicit tough:20 pitborn comes out at ${asked.stats.tough}, not 20`
        : `!! THE LINE'S BONUS WAS OVERWRITTEN BY THE CALLER (${asked.stats.tough})`;
      /* and nothing lands at zero or below */
      let floorBad = 0;
      for (const [race, t] of Object.entries(SUBRACES)) for (const k of Object.keys(t)) {
        const c = mk({ race, sub: k });
        for (const [sk, v] of Object.entries(c.stats)) if (!(v >= 0) || (sk !== 'magic' && sk !== 'armr' && v < 1)) floorBad++;
      }
      R.statFloor = floorBad === 0 ? 'no line starts anybody at zero'
        : `!! ${floorBad} STATS LANDED BELOW THE FLOOR`;
      clean();
    }

    /* ---------- 3. THE LEARNING RATE, WHICH IS THE WHOLE POINT ----------
       Not read off the table: run real experience through `xpGain` and see where two bodies
       of the same race end up. */
    {
      const run = (race, sub, stat) => {
        const c = mk({ race, sub, age: 25 });
        const was = c.stats[stat];
        for (let i = 0; i < 400; i++) xpGain(c, stat, 0.1);
        const got = c.stats[stat] - was;
        return got;
      };
      const orchMed = run('human', 'orchardbred', 'medic'), dustMed = run('human', 'dustborn', 'medic');
      const ironBl = run('human', 'ironscar', 'blades'), dustBl = run('human', 'dustborn', 'blades');
      const orchBl = run('human', 'orchardbred', 'blades');
      R.learnFast = orchMed > dustMed * 1.15
        ? `orchard-bred learn medicine ${(orchMed / dustMed).toFixed(2)}x what a dustborn does`
        : `!! THE LEARNING RATE DOES NOT BITE (${orchMed.toFixed(1)} vs ${dustMed.toFixed(1)})`;
      R.learnSlow = orchBl < dustBl * 0.9
        ? `and blades at ${(orchBl / dustBl).toFixed(2)}x — the trade cuts both ways`
        : '!! A LINE WITH A PENALTY LEARNS AT FULL SPEED ANYWAY';
      R.learnPerSkill = (ironBl > dustBl * 1.15 && Math.abs(run('human', 'ironscar', 'medic') - dustMed) < dustMed * 0.2)
        ? 'and it is PER SKILL: ironscar are quick with a blade and ordinary with medicine'
        : '!! THE MULTIPLIER IS GLOBAL, NOT PER SKILL';
      /* the rock golem's refusal to learn the art has to be near-absolute */
      const rockMag = run('golem', 'rock', 'magic'), paperMag = run('golem', 'paper', 'magic');
      R.golemSplit = (paperMag > rockMag * 5)
        ? `paper learns the art ${Math.round(paperMag / Math.max(0.01, rockMag))}x what rock does`
        : `!! PAPER AND ROCK LEARN THE ART AT THE SAME RATE (${paperMag.toFixed(1)} vs ${rockMag.toFixed(1)})`;
      clean();
    }

    /* ---------- 4. WHAT A THING IS MADE OF ---------- */
    {
      const hit = (race, sub, wt) => {
        const c = mk({ race, sub, tough: 10 });
        const was = 40;
        const got = mitigate(c, was, wt, 0, null);
        return got;
      };
      const paperBurn = hit('golem', 'paper', 'burn'), clayBurn = hit('golem', 'clay', 'burn');
      const rockCut = hit('golem', 'rock', 'cut'), clayCut = hit('golem', 'clay', 'cut');
      const glassBlunt = hit('golem', 'glass', 'blunt'), clayBlunt = hit('golem', 'clay', 'blunt');
      R.paperBurns = paperBurn > clayBurn * 1.5 ? `paper takes ${(paperBurn / clayBurn).toFixed(1)}x from fire`
        : `!! PAPER DOES NOT BURN (${paperBurn.toFixed(1)} vs ${clayBurn.toFixed(1)})`;
      R.rockShrugs = rockCut < clayCut * 0.85 ? `rock sheds an edge (${(rockCut / clayCut).toFixed(2)}x)`
        : '!! ROCK TAKES A BLADE LIKE ANYTHING ELSE';
      R.glassShatters = glassBlunt > clayBlunt * 1.3 ? `and glass minds a hammer (${(glassBlunt / clayBlunt).toFixed(1)}x)`
        : '!! GLASS DOES NOT SHATTER';
      clean();
    }

    /* ---------- 5. THE OVERRIDES ---------- */
    {
      const hound = mk({ race: 'chimera', sub: 'houndkin' });
      const ox = mk({ race: 'chimera', sub: 'oxbound' });
      R.speedLine = moveSpeed(hound) > moveSpeed(ox) * 1.25
        ? `a houndkin outruns an ox-bound ${(moveSpeed(hound) / moveSpeed(ox)).toFixed(2)}x — same race, different line`
        : `!! THE LINE DOES NOT CHANGE SPEED (${moveSpeed(hound).toFixed(2)} vs ${moveSpeed(ox).toFixed(2)})`;
      const scale = mk({ race: 'chimera', sub: 'scaleborn' });
      R.lifeLine = traitOf(scale, 'deathAge', 0) > traitOf(hound, 'deathAge', 0)
        ? `scaleborn outlive houndkin by ${Math.round(traitOf(scale, 'deathAge', 0) - traitOf(hound, 'deathAge', 0))} years`
        : '!! LIFESPAN IS NOT PER LINE';
      const rock = mk({ race: 'golem', sub: 'rock' }), glass = mk({ race: 'golem', sub: 'glass' });
      R.capLine = skillCap(rock) > skillCap(glass)
        ? `a rock's ceiling is ${skillCap(rock)} against a glass's ${skillCap(glass)}`
        : '!! THE SKILL CEILING IS NOT PER LINE';
      /* the chimera's deafness to alchemy, and the one line that kept the art */
      const gifted = mk({ race: 'chimera', sub: 'scaleborn', gift: 'dark' });
      const deaf = mk({ race: 'chimera', sub: 'houndkin', gift: 'dark' });
      R.giftLine = (gifted.gift === 'dark' && attCap(gifted, 'dark') > 0 && !deaf.gift && attCap(deaf, 'dark') === 0)
        ? 'scaleborn kept the art that made them; the rest of the chimera did not'
        : `!! THE GIFT GATE IS WRONG (scaleborn ${gifted.gift}, houndkin ${deaf.gift})`;
      /* a golem does not bleed */
      const clay = mk({ race: 'golem', sub: 'clay' });
      R.golemConstruct = clay.construct ? 'a golem is a construct: nothing in it to spill'
        : '!! GOLEMS BLEED';
      clean();
    }

    /* ---------- 6. THE WORLD ROLLS THEM ---------- */
    {
      const tally = {}, subTally = {};
      for (let i = 0; i < 4000; i++) {
        const r = rollNpcRaceSub();
        tally[r.race] = (tally[r.race] || 0) + 1;
        if (r.sub) subTally[r.race + '/' + r.sub] = (subTally[r.race + '/' + r.sub] || 0) + 1;
      }
      R.worldRolls = Object.entries(tally).sort((a, b) => b[1] - a[1])
        .map(([k, v]) => `${k} ${(v / 40).toFixed(0)}%`).join(', ');
      R.noScaleborn = !tally.scaleborn ? 'nothing rolls up as a scaleborn race any more'
        : '!! THE WORLD IS STILL SPAWNING SCALEBORN AS A RACE';
      R.golemsRare = (tally.golem || 0) > 0 && (tally.golem || 0) < 4000 * 0.05
        ? `golems are ${(100 * (tally.golem || 0) / 4000).toFixed(1)}% of what walks — rare, but they exist`
        : `!! GOLEMS ARE ${(100 * (tally.golem || 0) / 4000).toFixed(1)}% OF THE POPULATION`;
      const humanLines = Object.keys(subTally).filter(k => k.startsWith('human/')).length;
      R.linesSpread = humanLines >= 5 ? `${humanLines} human lines came up across 4,000 rolls`
        : `!! ONLY ${humanLines} HUMAN LINES EVER ROLL`;
    }

    /* ---------- 7. AND AN OLD SAVE DOES NOT TURN A SCALEBORN INTO A HUMAN ---------- */
    {
      const c = mk({ race: 'human', sub: 'ironscar' });
      const snap = JSON.parse(JSON.stringify(snapshot()));
      /* forge a pre-rework body into the save the way one would actually appear */
      const row = snap.chars.find(x => x.id === c.id);
      row.race = 'scaleborn'; delete row.sub;
      restore(snap);
      const back = chars.find(x => x.id === c.id);
      R.oldSaves = back && back.race === 'chimera' && back.sub === 'scaleborn'
        ? 'a scaleborn out of an old save loads as a chimera of the scaleborn line'
        : `!! AN OLD SCALEBORN LOADED AS ${back ? back.race + '/' + back.sub : 'NOTHING'}`;
      const kept = chars.find(x => x.sub === 'ironscar');
      R.subSurvives = kept || (back && back.sub) ? 'and a line survives a save' : '!! THE LINE IS LOST ON LOAD';
      clean();
    }

    /* ---------- 8. AND EVERY LINE IS A DIFFERENT BODY ----------
       A subrace can be given a skin colour in one line of a table and look, in that table,
       like a finished piece of work — and this is exactly what had happened. Four golems
       stood side by side as one man in one blue shirt, because the line's colour only ever
       reached the head and hands while the torso took the FACTION colour, and the geometry
       was the same rig every time. So: build one of each and compare the bodies, not the
       table. Two lines of a race that come out with the same triangle count and the same
       bounding box are the same character with two names. */
    {
      const sig = (o) => {
        const c = makeChar('X', 'player', 600, 600, Object.assign({ sex: 'm' }, o));
        c.state = 'ok'; c.dir = 0; chars.push(c); born.push(c);
        /* ---------- SYNC UNTIL THE RIG IS THERE, NOT TWICE ----------
           `syncChars` builds at most EIGHT rigs a frame and spends that budget on the world
           first, so two calls is a bet on how busy the machine is. Alone it won every time;
           inside a 63-harness suite it lost and this file reported "golem/clay BUILT NO BODY"
           about a body that was simply one frame behind. `run.js` names races.js as one of
           the four that go red under concurrency, and this is why. `bound.js` wrote the
           lesson down first. */
        let e = null;
        for (let i = 0; i < 40 && !e; i++) { syncChars(0.05); e = charMeshes.get(c.id); }
        if (!e) return null;
        syncChars(0.05);
        e.g.updateWorldMatrix(true, true);
        let tris = 0, lo = 1e9, hi = -1e9, wide = 0, col = 0, shape = 0;
        e.g.traverse(m => {
          if (!m.isMesh) return;
          let v = m.visible, q = m.parent; while (q && v) { v = q.visible; q = q.parent; }
          if (!v) return;
          const g2 = m.geometry;
          tris += g2.index ? g2.index.count / 3 : g2.attributes.position.count / 3;
          /* A HASH OF WHERE THE GEOMETRY ACTUALLY IS. The first version of this rule compared
             TRIANGLE COUNTS, which worked by luck on golems and chimeras and is not the
             property being tested: an apron, a set of crossed webbing and a shoulder satchel
             are three obviously different bodies made of the same number of boxes, and the
             rule would have called them identical. Positions in the body's own space, rounded
             to a centimetre so floating-point noise does not make everything unique. */
          const pa = g2.attributes.position;
          for (let i = 0; i < pa.count; i += 3)
            shape = (shape * 31 + Math.round(pa.getX(i) * 100) * 7
                                + Math.round(pa.getY(i) * 100) * 13
                                + Math.round(pa.getZ(i) * 100) * 17) % 1000000007;
          const bb = new THREE.Box3().setFromObject(m);
          lo = Math.min(lo, bb.min.y); hi = Math.max(hi, bb.max.y);
          wide = Math.max(wide, bb.max.x - bb.min.x);
          /* colour matters as much as shape: this is what caught the blue shirts */
          const ca = g2.attributes.color;
          if (ca) for (let i = 0; i < ca.count; i += 7) col += ca.getX(i) * 3 + ca.getY(i) * 5 + ca.getZ(i) * 11;
        });
        return { tris: Math.round(tris), h: +(hi - lo).toFixed(2), w: +wide.toFixed(2),
                 col: Math.round(col), shape };
      };
      const clash = [], sameShape = [];
      const shapes = {};
      /* HUMANS ARE EXEMT ON PURPOSE. A pitborn and an orchard-bred are the same animal and
         differ by weathering; giving them silhouettes would say otherwise. The made races are
         the ones whose lines were built to a purpose, and a purpose shows. */
      for (const race of ['golem', 'chimera', 'homunculus']) {
        const seen = {}, byTris = {};
        for (const key of Object.keys(SUBRACES[race])) {
          const s = sig({ race, sub: key });
          if (!s) { clash.push(race + '/' + key + ' BUILT NO BODY'); continue; }
          const stamp = `${s.tris}|${s.h}|${s.w}|${s.col}`;
          if (seen[stamp]) clash.push(`${race}: ${seen[stamp]} and ${key} are the same body`);
          seen[stamp] = key;
          /* SHAPE ON ITS OWN, because colour hides the very bug this is here for. The first
             version of this check stamped shape AND colour together and passed cheerfully on
             four golems built from one identical rig — their per-line SKIN differed, so the
             stamps differed, while the silhouettes were the same man four times. At the
             distance the camera sits at, a tint is not a character. */
          if (byTris[s.shape]) sameShape.push(`${race}: ${byTris[s.shape]} and ${key}`);
          byTris[s.shape] = key;
          shapes[race + '/' + key] = s;
        }
      }
      R.everyLineDiffers = clash.length ? '!! ' + clash.join('; ')
        : 'each line of the made races builds a body of its own';
      R.everyLineHasAShape = sameShape.length
        ? '!! THESE LINES ARE THE SAME SILHOUETTE IN DIFFERENT PAINT: ' + sameShape.join('; ')
        : 'and its own silhouette, not the same rig in a different colour';
      /* and specifically: a golem is not wearing the faction's shirt. Two golems of the same
         line in different companies must come out the same colour, because the material is
         the line's, not the banner's. */
      {
        const a = sig({ race: 'golem', sub: 'rock', fac: 'player' });
        const b2 = makeChar('X', 'raider', 600, 600, { race: 'golem', sub: 'rock', sex: 'm' });
        b2.state = 'ok'; b2.dir = 0; chars.push(b2); born.push(b2);
        syncChars(0.05); syncChars(0.05);
        const e2 = charMeshes.get(b2.id);
        let col2 = 0;
        if (e2) e2.g.traverse(m => {
          if (!m.isMesh) return;
          let v = m.visible, q = m.parent; while (q && v) { v = q.visible; q = q.parent; }
          if (!v) return;
          const ca = m.geometry.attributes.color;
          if (ca) for (let i = 0; i < ca.count; i += 7) col2 += ca.getX(i) * 3 + ca.getY(i) * 5 + ca.getZ(i) * 11;
        });
        R.golemWearsItsOwn = (a && Math.abs(col2 - a.col) < Math.max(6, Math.abs(a.col) * 0.02))
          ? 'a golem is the colour of what it is made of, not of whoever it marches for'
          : `!! A GOLEM IS STILL WEARING ITS FACTION'S COLOUR (${a && a.col} against ${Math.round(col2)})`;
      }
      /* ---------- WHAT THE VAT LINES WERE ADDED FOR ----------
         Both of these are the reason the homunculus lines exist at all, and both are the kind
         of thing that can be written in a table and never reach the sim. */
      {
        /* `def` was the ONE skill of seventeen that no line in the game was built around.
           Driven through the real `xpGain` rather than read off the table. */
        /* FROM THE SAME PLACE ON THE CURVE. Skill growth has diminishing returns, and the
           Wardline starts eight points of `def` up — so measuring raw gain compares a body
           high on the curve against one low on it and reports 1.20x for a line whose learning
           rate is 1.45. Level the starting stat by hand first; the rate is what is under test,
           and the head start is asserted separately above. */
        const runDef = (race, sub) => {
          const c = mk({ race, sub, age: 25 });
          /* AND SHORT OF THE CEILING. A homunculus caps at 75 — the lowest in the game — so
             400 ticks of experience walked the Wardline into the roof and stopped it there,
             and the measurement came back 1.20x for a rate of 1.45 because the last third of
             it was thrown away. Start low, stop early, measure the slope and not the wall. */
          c.stats.def = 5;
          for (let i = 0; i < 120; i++) xpGain(c, 'def', 0.1);
          return c.stats.def - 5;
        };
        const ward = runDef('homunculus', 'wardline'), plainH = runDef('homunculus', 'vatborn');
        R.somebodyLearnsDef = ward > plainH * 1.25
          ? `the Wardline learns to hold a line ${(ward / plainH).toFixed(2)}x what a plain vat-born does`
          : `!! NOTHING IN THE GAME IS BUILT AROUND def (${ward.toFixed(1)} vs ${plainH.toFixed(1)})`;
        /* and the Nullborn's deafness, which is a cost with one thing bought by it */
        const nb = mk({ race: 'homunculus', sub: 'nullborn', gift: 'dark' });
        const vb = mk({ race: 'homunculus', sub: 'vatborn', gift: 'dark' });
        R.nullbornIsDeaf = (!nb.gift && attCap(nb, 'dark') === 0 && vb.gift === 'dark')
          ? 'a Nullborn cannot hold an art, and its own line-mates still can'
          : `!! THE DEAFNESS DID NOT TAKE (nullborn ${nb.gift}, vatborn ${vb.gift})`;
        /* the lance is `nullOnly`; that deafness has to be what buys it */
        R.nullbornTakesTheLance = (!nb.gift && ITEMS.w_lance && ITEMS.w_lance.nullOnly)
          ? 'and the one thing a gifted hand can never pick up is open to it'
          : '!! THE LANCE IS NOT GATED ON DEAFNESS ANY MORE';
        clean();
      }
      /* the shapes, for the record — a regression here is easier to read than to re-derive */
      R.lineShapes = Object.entries(shapes)
        .map(([k, s]) => `${k.split('/')[1]} ${s.tris}t`).join(' ');
      clean();
    }
    return R;
  });

  console.log('=== RACES AND THEIR LINES ===\n');
  for (const [k, v] of Object.entries(out)) console.log('  ' + k.padEnd(16) + v);
  const bad = Object.values(out).map(String).filter(v => v.startsWith('!!'));
  console.log('\n' + (bad.length ? '*** ' + bad.join('\n*** ') : 'THE LINES ARE REAL, AND THEY LEARN DIFFERENTLY'));
  if (errs.length) { console.log('errs:', errs.length); errs.slice(0, 4).forEach(e => console.log('  ' + e)); }
  await b.close();
  if (bad.length) process.exitCode = 1;
})();
