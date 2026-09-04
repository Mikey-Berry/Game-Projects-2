#!/usr/bin/env node
/* AN IMPERFECT DRAGON.
 *
 * "New giant enemy: Wyrms. Imperfect dragons with both ranged and sweeping melee attacks.
 * Quite rare to encounter but powerful and known to hoard vast amounts of gold."
 *
 * Four claims, and the last three are the ones that could quietly not be true while the
 * creature still worked perfectly well:
 *
 *   · RANGED. The breath has to reach past melee and hurt people standing in it.
 *   · SWEEPING. This is the one that had to be BUILT rather than configured. The cleave that
 *     catches bystanders is gated `if(wpn && !wpn.range)` — it comes off the WEAPON — so
 *     everything in the game that fights with what it is struck exactly one body per blow
 *     however large it was, and six men could stand shoulder to shoulder in front of a
 *     house-sized animal and take it in turns.
 *   · RARE. A wyrm you meet on the road on day three is a wall, not an encounter.
 *   · A HOARD. Which has to be worth the walk, measured against the richest thing already in
 *     the game rather than against a number somebody liked the look of.
 *
 * And the rig, because a new creature that builds as the grazer in a different colour is not
 * a new creature.
 *
 *   node tools/wyrm.js [game.html]
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

  const R = await p.evaluate(() => {
    const R = {};
    paused = true;
    const DT = 1 / 30;

    /* ---------- 1. THERE ARE WYRMS, AND THERE ARE NOT MANY ---------- */
    const wyrms = chars.filter(c => c.bossKey === 'wyrm');
    R.theyExist = wyrms.length ? `${wyrms.length} in the world, ${wyrms.map(w => 'big ' + w.big).join(' and ')}`
                               : '!! THERE ARE NO WYRMS';
    if (!wyrms.length) return R;

    R.andTheyAreRare = (wyrms.length <= 3)
      ? `and ${wyrms.length} of them is rare — the Baroness, the Grazer and the King are one apiece and this is the same order`
      : `!! ${wyrms.length} WYRMS IS NOT RARE`;

    /* AND A LONG WAY OUT. Rare and adjacent is not rare — a wall on the road out of the
       starting town is worse than no wyrm at all. */
    {
      const nearest = Math.min(...wyrms.map(w => dist(w.x, w.y, startTown.x, startTown.y)));
      const nearTown = Math.min(...wyrms.map(w => Math.min(...towns.map(t => dist(w.x, w.y, t.x, t.y)))));
      R.andTheyAreFarOut = (nearest > 90 && nearTown > 45)
        ? `and the nearest is ${nearest.toFixed(0)} tiles from where you start, ${nearTown.toFixed(0)} from any town — finding one is a decision`
        : `!! A WYRM SITS ${nearest.toFixed(0)} TILES FROM THE START AND ${nearTown.toFixed(0)} FROM A TOWN`;
    }

    /* ---------- 2. THE HOARD, AGAINST THE RICHEST THING ALREADY HERE ---------- */
    {
      const bar = chars.find(c => c.bossKey === 'baroness');
      const gold = Math.min(...wyrms.map(w => w.loot || 0));
      const ref = bar ? (bar.loot || 0) : 3200;
      R.andTheHoardIsVast = gold >= ref * 2.5
        ? `and the leanest of them is lying on ${gold} gold against the Red Baroness's ${ref} — ${(gold / ref).toFixed(1)}x the richest thing in the game`
        : `!! A WYRM HOARD IS ${gold} AGAINST THE BARONESS'S ${ref}`;
    }

    /* ---------- 3. THE BREATH REACHES, AND IT IS A LINE ----------
       Staged rather than waited for: put a rank in front of it, breathe, and count who is
       hurt and who is not. A disc would burn the man standing behind it, and the answer to a
       breath has to be to step out of the way. */
    {
      const w = wyrms[0];
      /* IT IS NEUTRAL AND THAT IS CORRECT. A wyrm is not hunting anybody — it is lying on a
         great deal of gold and it has views about company. `hostile()` therefore says no to
         everything until somebody starts it, and both the breath and the sweep are gated on
         `hostile` on purpose (a breath that burns whatever is in front of it would take your
         own squad every time). So the probe starts it, the way a player would. */
      /* `provoked`, NOT `neutral = false`. `hostile()` reads them as a pair — "a neutral that
         has been started holds the grudge against the player" — so clearing the neutral flag
         takes the body OUT of that rule rather than past it, and a fauna with neither flag is
         hostile to nobody at all. The first draft of this probe did exactly that and reported
         a breath that caught nothing, about a breath that works. */
      w.provoked = true;
      const born = [];
      const mk = (dx, dy) => {
        const c = makeChar('Probe Rank', 'player', w.x + dx, w.y + dy, { atk: 4, def: 4, tough: 12 });
        c.__probe = true; c.state = 'ok'; c.floor = w.floor || 0; c.blood = 200; c.maxBlood = 200;
        chars.push(c); born.push(c); return c;
      };
      const hp = (c) => c.blood + Object.values(c.parts).reduce((s, x) => s + x.hp, 0);
      /* four straight out in front, one well off to the side, one behind */
      const line = [mk(3, 0), mk(5, 0), mk(7, 0), mk(8.5, 0)];
      const aside = mk(4, 5.5);
      const behind = mk(-4, 0);
      rebuildCharGrid();
      const before = new Map([...line, aside, behind].map(c => [c, hp(c)]));
      const hit = breatheAt(w, w.x + 10, w.y);
      const hurt = (c) => before.get(c) - hp(c);
      const burned = line.filter(c => hurt(c) > 0).length;

      R.itBreathes = (hit > 0 && burned >= 3)
        ? `it opens its throat down a bearing and ${burned}/4 of the rank standing in it are burned`
        : `!! THE BREATH CAUGHT ${burned}/4 OF A RANK STANDING DIRECTLY IN IT`;
      R.andItReachesPastMelee = hurt(line[3]) > 0
        ? `and it reaches the one standing eight and a half tiles out — this is not a swing`
        : `!! THE BREATH DID NOT REACH 8.5 TILES (${hurt(line[3]).toFixed(1)} taken)`;
      R.andItIsALineNotADisc = (hurt(aside) === 0 && hurt(behind) === 0)
        ? 'and the two standing out of the bearing took nothing at all — stepping aside is the answer to it'
        : `!! THE BREATH CAUGHT SOMEBODY OUT OF ITS OWN BEARING (aside ${hurt(aside).toFixed(1)}, behind ${hurt(behind).toFixed(1)})`;

      for (let i = chars.length - 1; i >= 0; i--) if (chars[i].__probe) chars.splice(i, 1);
      rebuildCharGrid();
    }

    /* ---------- 4. THE SWEEP TAKES A LINE OF MEN ----------
       Measured as the DIFFERENCE between a wyrm's blow and a wyrm's blow with the sweep
       taken off it, on the same staged rank. An absolute number would pass on any build where
       the thing merely hits hard, which is the failure this whole idea is about: a creature
       that struck one man per swing and hit like a house would look completely fine. */
    {
      const w = wyrms[0];
      w.provoked = true;
      const stage = () => {
        for (let i = chars.length - 1; i >= 0; i--) if (chars[i].__probe) chars.splice(i, 1);
        const rank = [];
        for (const [dx, dy] of [[1.2, 0], [1.4, 1.1], [1.4, -1.1], [2.6, 0.9], [2.6, -0.9]]) {
          const c = makeChar('Probe Rank', 'player', w.x + dx, w.y + dy, { atk: 4, def: 1, tough: 6 });
          c.__probe = true; c.state = 'ok'; c.floor = w.floor || 0;
          c.blood = 4000; c.maxBlood = 4000; c.stats.def = 0;
          for (const k of PARTS) { c.parts[k].max = 4000; c.parts[k].hp = 4000; }
          chars.push(c); rank.push(c);
        }
        rebuildCharGrid();
        return rank;
      };
      const hp = (c) => c.blood + Object.values(c.parts).reduce((s, x) => s + x.hp, 0);
      const run = () => {
        const rank = stage();
        const before = rank.map(hp);
        const r0 = Math.random;
        for (let i = 0; i < 12; i++) { rank.forEach(c => { c.state = 'ok'; }); attack(w, rank[0]); }
        Math.random = r0;
        return { touched: rank.filter((c, i) => before[i] - hp(c) > 0).length,
                 rank: rank.length };
      };
      const withSweep = run();
      const keep = w.sweep; w.sweep = null;
      const without = run();
      w.sweep = keep;

      R.itSweeps = (withSweep.touched >= 4 && without.touched <= 1)
        ? `twelve blows aimed at one man in a rank of five reach ${withSweep.touched} of them, against ${without.touched} with the sweep taken off — the difference is the sweep and nothing else`
        : `!! THE SWEEP CHANGES NOTHING (${withSweep.touched}/${withSweep.rank} with it, ${without.touched} without)`;

      for (let i = chars.length - 1; i >= 0; i--) if (chars[i].__probe) chars.splice(i, 1);
      rebuildCharGrid();
    }

    /* ---------- 5. AND NOTHING ORDINARY QUIETLY GAINED A SWEEP ----------
       `sweepAfter` runs on every landed blow of every body that carries the record, so if this
       spread the whole melee changed and this file is the only place that would say so.
       WRITTEN AS "NOTHING ELSE HAS ONE" AND THAT WAS THE WRONG CLAIM. The Sixfold was given one
       deliberately — its report is this file's own comment about a different creature, "six men
       could stand shoulder to shoulder in front of a house-sized animal and take it in turns" —
       and an exclusivity test turns the second correct use of a mechanism into a red build. The
       claim worth holding is that a sweep stays a NAMED thing: great creatures, by hand, never
       a townsman and never a wolf. */
    {
      const GREAT = ['wyrm', 'sixfold', 'brood'];
      const swept = chars.filter(c => c.sweep);
      const stray = swept.filter(c => !GREAT.includes(c.bossKey));
      R.andNothingElseHasOne = stray.length === 0
        ? `and a sweep is still a named thing — ${swept.length} in the world, every one of them great (${[...new Set(swept.map(c => c.bossKey))].join(', ')})`
        : `!! ${stray.length} ORDINARY BODIES HAVE A SWEEP: ${stray.slice(0, 3).map(c => c.name).join(', ')}`;
    }
    return R;
  });

  /* ---------- 6. AND IT IS NOT THE GRAZER IN A NEW COLOUR ----------
     Two big quadrupeds is one big quadruped unless the rigs disagree. Measured off the built
     mesh, because a SPEC row can look like a different animal in a table and build the same
     box on four legs. */
  const rigs = await p.evaluate(() => {
    const out = {};
    const born = [];
    /* ---------- WHERE THE CAMERA IS LOOKING, NOT WHERE THE PROBE FEELS LIKE ----------
       `syncChars` builds rigs for what is on screen and nothing else. A first draft staged
       these at a fixed 600,600 while the camera sat at 1089,554 and reported "THE RIG DID NOT
       BUILD" about three rigs that were simply never asked for. */
    const mk = (kin, big) => {
      const c = makeChar('R', 'fauna', Math.round(camX) + born.length * 3, Math.round(camY), { atk: 5, def: 5, tough: 5 });
      c.beast = true; c.kin = kin; c.big = big; c.state = 'ok'; c.dir = 0; c.__probe = true;
      chars.push(c); born.push(c); return c;
    };
    /* READ `big` OFF THE ANIMAL THE GAME MADE. It was hard-coded at 2.6 here while the
       spawner sets 2.2, so every number below described a wyrm 18% larger than any wyrm in
       the world — including the length bound, which is the one assertion in the file whose
       whole job is to say the creature has not got absurd. A staged body must be staged the
       way the game stages it or the measurement is of nothing. */
    const real = chars.find(c => c.kin === 'wyrm');
    const w = mk('wyrm', real ? real.big : 2.2), g = mk('grazer', 2.2), h = mk('hound', 1);
    /* ---------- SYNC UNTIL THE RIG IS THERE, NOT A FIXED NUMBER OF TIMES ----------
       `syncChars` builds at most eight rigs a frame and spends that budget on the world
       first. races.js and bound.js both learned this the hard way — a fixed count wins alone
       and loses inside a sixty-harness suite, and reports "BUILT NO BODY" about a rig that was
       one frame behind. */
    for (const c of [w, g, h]) {
      let e = null;
      for (let i = 0; i < 60 && !e; i++) { syncChars(0.05); e = charMeshes.get(c.id); }
    }
    for (const [k, c] of [['wyrm', w], ['grazer', g], ['hound', h]]) {
      const e = charMeshes.get(c.id);
      if (!e || !e.g) { out[k] = null; continue; }
      e.g.updateWorldMatrix(true, true);
      let tris = 0;
      e.g.traverse(m => {
        if (!m.isMesh) return;
        const g2 = m.geometry;
        tris += g2.index ? g2.index.count / 3 : g2.attributes.position.count / 3;
      });
      const bx = new THREE.Box3().setFromObject(e.g);
      /* where the SKULL is, and where the back is. `e.head` and `e.torso` keep real meshes of
         their own (bakeBoxes puts them in `solo`), which is the only reason this is askable. */
      let headY = null, backY = null;
      if(e.head){ const p2 = new THREE.Vector3(); e.head.getWorldPosition(p2); headY = +(p2.y - bx.min.y).toFixed(2); }
      if(e.torso){ backY = +(new THREE.Box3().setFromObject(e.torso).max.y - bx.min.y).toFixed(2); }
      /* AND WHETHER THE TWO SIDES MATCH. Every beast in this file is built in ±sx pairs, so
         the rig is symmetric by construction — until something is built out of a chain of
         Euler angles, where negating two of three does not always mirror and one wing comes
         out in a different pose from the other. Cheap, and it is the failure mode. */
      let asym = 0, sampled = 0;
      {
        /* IN THE BODY'S OWN FRAME, AND EVERY VERTEX. A first draft took every third vertex in
           WORLD space and reported 430 of 576 unmirrored on a body that is symmetric by
           construction — two mistakes with the same shape. Sampling a subset means a vertex's
           partner is usually not in the set to be found; and `x` is only the left-right axis
           once the rig's own rotation is taken back out. */
        const inv = new THREE.Matrix4().copy(e.g.matrixWorld).invert();
        const pts = new Set(), q = (v) => Math.round(v * 24);
        e.g.traverse(m => {
          if(!m.isMesh || !m.geometry || !m.geometry.attributes.position) return;
          const a = m.geometry.attributes.position;
          for(let i = 0; i < a.count; i++){
            const v = new THREE.Vector3().fromBufferAttribute(a, i).applyMatrix4(m.matrixWorld).applyMatrix4(inv);
            pts.add(q(v.x) + ',' + q(v.y) + ',' + q(v.z)); sampled++;
          }
        });
        for(const key of pts){
          const [x, y, z] = key.split(',');
          if(Math.abs(+x) <= 1) continue;                    /* on the centreline, no partner to have */
          if(!pts.has((-(+x)) + ',' + y + ',' + z)) asym++;
        }
      }
      out[k] = { tris, len: +(bx.max.z - bx.min.z).toFixed(2), hgt: +(bx.max.y - bx.min.y).toFixed(2),
                 wid: +(bx.max.x - bx.min.x).toFixed(2), headY, backY, asym, sampled };
    }
    for (let i = chars.length - 1; i >= 0; i--) if (chars[i].__probe) chars.splice(i, 1);
    return out;
  });

  if (rigs.err || !rigs.wyrm || !rigs.grazer) {
    R.andItBuildsABodyOfItsOwn = '!! THE RIG DID NOT BUILD (' + (rigs.err || 'no mesh') + ')';
  } else {
    const w = rigs.wyrm, g = rigs.grazer;
    R._rigs = `wyrm ${w.tris}t ${w.len}L x ${w.hgt}H (head ${w.headY}, back ${w.backY}) · grazer ${g.tris}t ${g.len}L x ${g.hgt}H · hound ${rigs.hound && rigs.hound.tris}t`;
    /* NOT THE GRAZER IN A NEW COLOUR, and the axis that separates them CHANGED.
       "Wyrms should be bigger." The first pass answered that with LENGTH and got a
       crocodile — and this assertion agreed with it, demanding the wyrm be longer relative
       to its height than the grazer is, which is a bound that rewards exactly the silhouette
       that was reported as wrong. (It was also passing by 0.001 at the end, and a bound you
       clear by a thousandth is a coincidence.) The separation now lives where the size does:
       the wyrm STANDS, half again the grazer's height, and CARRIES ITS HEAD ABOVE ITS BACK,
       which nothing else on four legs in this game does. */
    R.andItBuildsABodyOfItsOwn = (w.tris > g.tris * 1.3 && w.hgt > g.hgt * 1.4)
      ? `and it is not the grazer in a new colour — ${w.tris} triangles against ${g.tris}, and it stands ${w.hgt} against the grazer's ${g.hgt}`
      : `!! THE WYRM IS THE GRAZER RIG (${w.tris}t vs ${g.tris}t, ${w.hgt}H vs ${g.hgt}H)`;
    R.andItCarriesItsHeadUp = (w.headY !== null && w.backY !== null && w.headY > w.backY * 1.12)
      ? `and the skull rides at ${w.headY} over a back at ${w.backY} — a raised neck, not a head slung off the shoulders`
      : `!! THE HEAD IS AT ${w.headY} AND THE BACK IS AT ${w.backY}`;
    /* THE WINGS ARE A PICTURE AND THIS FILE CANNOT SEE ONE. bakeBoxes merges every box on the
       animal into one geometry, so there is no wing to isolate and measure, and "the wing
       reads as a wing" was never going to be a number — it is judged on the contact sheet in
       tools/wyrmpix.js, the same way the Mimic faces are judged in tools/mimicpix.js.
       What IS mechanical is the failure the rebuild was for: a wing built as a chain of Euler
       angles that does not mirror. */
    R.andBothSidesMatch = (w.asym === 0)
      ? `and the two sides are the same body — ${w.sampled} vertices, every one off the centreline has its partner`
      : `!! ${w.asym} VERTICES HAVE NO MIRROR (of ${w.sampled})`;
    /* AND GIANT IS NOT THE SAME AS ABSURD, which is a real bound and not a tidy one: `big`
       feeds reach, pick radius and walking speed as well as scale, and the first draft came
       out thirteen and a half tiles nose to tail — longer than most buildings in the game,
       which reads as a bug rather than as a dragon. Twice the Grazer and under a dozen tiles. */
    R.andGiantIsNotAbsurd = (w.len > g.len * 1.6 && w.len < 13)
      ? `and it measures ${w.len} tiles nose to tail against the Grazer's ${g.len} — twice the biggest thing in the game and still smaller than a hall`
      : `!! A WYRM IS ${w.len} TILES LONG (grazer ${g.len})`;
  }

  const bad = Object.values(R).filter(v => typeof v === 'string' && v.startsWith('!!'));
  for (const [k, v] of Object.entries(R)) console.log('  ' + k.padEnd(28) + v);
  for (const e of errs) console.log('  ' + e);
  console.log('');
  console.log(bad.length || errs.length
    ? `IT IS NOT A DRAGON YET (${bad.length + errs.length})`
    : 'SOMETHING VERY LARGE IS LYING ON A GREAT DEAL OF GOLD');
  await b.close();
  process.exit(bad.length || errs.length ? 1 : 0);
})();
