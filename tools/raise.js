#!/usr/bin/env node
/* WHAT THE RITE REFUSES, AND WHAT COMES BACK WEARING WHAT.
 *
 * `castRaise` used to take anything with a `state === 'dead'` on it and hand back the same
 * object every time: a randomly-raced human skeleton with the corpse's numbers clamped onto
 * it. Three things were wrong with that and this measures all three.
 *
 *   1. A WATCHER IS NOT A FRAME. Whatever a gaunt is built along does not run parallel to a
 *      spine, and standing one up as a human skeleton is the rite claiming a body it cannot
 *      actually hold. It renders down for Mortal Remains and that is all.
 *   2. A MACHINE IS NOT DEAD, IT IS BROKEN. There is no marrow in a Redoubt automaton to call
 *      to. It refuses the binding, and — the half that is easy to forget — harvesting it must
 *      yield METAL, because if a stripped walker still stacked up as Mortal Remains the
 *      refusal would be undone in one step and would also quietly launder the remains
 *      quality that `bindCeiling` reads.
 *   3. IT COMES BACK AS WHAT IT WAS. `makeChar` was handed stats and gear and nothing else,
 *      so `beast`, `kin`, `big`, `race`, `sub` and `sex` were all dropped and re-rolled. A
 *      raised dust hound stood up as a man.
 *
 * Every assertion below was checked against the pre-change build and fails there. The shape
 * assertions are measured off the REAL mesh — `buildCharMesh` on the raised body — rather
 * than off the flags, because carrying a flag that no rig reads would pass a flag test and
 * change nothing on screen.
 *
 *   node tools/raise.js [game.html]
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
  await p.evaluate(() => document.getElementById('btn-start').click());
  await p.waitForTimeout(3000);

  const out = await p.evaluate(() => {
    const R = {};
    paused = true;

    /* open ground clear of every town: `castRaise` refuses on consecrated ground and drops
       the player's standing inside a town's reach, and neither is what is under test */
    let gx = 0, gy = 0;
    outer:
    for (let y = 60; y < H - 60; y += 5) for (let x = 60; x < W - 60; x += 5) {
      if (isBlocked(x + 0.5, y + 0.5)) continue;
      if (towns.some(t => dist(t.x, t.y, x, y) < 70)) continue;
      let ok = true;
      for (let j = -4; j <= 4 && ok; j++) for (let i = -4; i <= 4 && ok; i++)
        if (isBlocked(x + i + 0.5, y + j + 0.5)) ok = false;
      if (ok) { gx = x; gy = y; break outer; }
    }
    R.ground = gx ? `staged on open waste at ${gx},${gy}` : '!! NO OPEN GROUND CLEAR OF EVERY TOWN';

    const wipe = () => {
      for (let i = chars.length - 1; i >= 0; i--) if (chars[i].__probe) chars.splice(i, 1);
      corpses.length = 0;
    };
    /* a necromancer good enough that nothing below is limited by the caster */
    const makeNec = () => {
      const n = makeChar('Necromancer', 'player', gx, gy, { atk: 10, def: 10, tough: 12, ath: 6, magic: 60 });
      n.gift = 'dark'; n.att = { dark: 3, divine: 0, destruction: 0, dust: 0 };
      n.mana = 9999; n.__probe = true;
      chars.push(n);
      return n;
    };
    /* drop a body on the ground in front of the caster, fresh, so rot is not the variable */
    const layOut = (c) => {
      c.__probe = true;
      c.state = 'dead'; c.deadAt = day; c.x = gx + 1; c.y = gy;
      if (!chars.includes(c)) chars.push(c);
      corpses.push(c);
      return c;
    };
    /* `castRaise` SPLICES the corpse out of `chars` and PUSHES the risen, so the array length
       is unchanged across a successful raise — the first version of this harness compared
       lengths and reported every raise as a refusal. Take the set difference instead. */
    const raise = (nec, body) => {
      const before = new Set(chars);
      nec.mana = 9999; nec.castCd = 0;
      const ok = castRaise(nec, body);
      const made = chars.filter(c => !before.has(c));
      for (const m of made) m.__probe = true;   /* so `wipe` can clear it between sections */
      return { ok, r: made[0] || null };
    };

    research.done.necromancy = true;
    research.done.rites_binding = true;
    for (const k of ['remains', 'stone', 'fabric', 'copper', 'wood', 'hide', 'iron', 'iron_ore'])
      stash[k] = stash[k] || 0;

    /* ============================== 1. THE WATCHERS ============================== */
    {
      wipe();
      const nec = makeNec();
      /* a REAL one, out of `spawnGaunt`, so `gauntKind` is whatever the game sets and not
         whatever this file guesses it is */
      const g = spawnGaunt('stalker', gx + 3, gy + 3) || null;
      R.aWatcherExists = g ? `spawnGaunt gave a ${g.gauntKind} (${g.name})` : '!! COULD NOT SPAWN A WATCHER';
      if (g) {
        layOut(g);
        const { ok, r } = raise(nec, g);
        R.watcherRefusesTheBinding = (!ok && !r)
          ? 'the rite will not take a Watcher — nothing stands up'
          : `!! A WATCHER WAS RAISED (${r ? r.name : 'no body'}) — IT SHOULD REFUSE`;
        /* and the corpse must survive the refusal: a refusal that eats the body is worse
           than the bug, because you cannot render what is gone */
        R.refusalKeepsTheBody = corpses.includes(g)
          ? 'and the body is still on the ground to be rendered'
          : '!! THE REFUSAL CONSUMED THE CORPSE';
        const had = stash.remains || 0;
        harvestCorpse(g, true, null);
        R.watcherStillRendersDown = (stash.remains || 0) > had
          ? `it harvests for ${(stash.remains || 0) - had} Mortal Remains, which is the whole of its use`
          : '!! A WATCHER GIVES NO REMAINS EITHER — IT IS SIMPLY WASTE';
      }
    }

    /* ============================== 2. THE MACHINES ============================== */
    {
      wipe();
      const nec = makeNec();
      /* Two different machines, because the two are flagged differently and only one of them
         was ever going to be remembered: a Redoubt automaton carries `redoubtId`, a town Bone
         Golem carries `golem`. `construct` is NOT the test — it is also true of the
         Sigil-Bound and of a seamless-knit risen, both of which are somebody's craft. */
      const auto = layOut(makeChar('Automaton', 'redoubt', gx + 1, gy,
        { atk: 14, def: 14, tough: 20, ath: 6, race: 'golem' }));
      auto.redoubtId = 1; auto.construct = true; auto.big = 1.3;
      const bg = layOut(makeChar('Bone Golem', 'town', gx + 1, gy + 1,
        { atk: 12, def: 10, tough: 24, ath: 4, race: 'golem' }));
      bg.golem = true; bg.construct = true;

      const a = raise(nec, auto), c = raise(nec, bg);
      R.automatonRefusesTheBinding = (!a.ok && !a.r)
        ? 'a Redoubt automaton will not take a binding'
        : `!! AN AUTOMATON WAS RAISED (${a.r ? a.r.name : '?'})`;
      R.boneGolemRefusesTheBinding = (!c.ok && !c.r)
        ? 'and neither will a town Bone Golem'
        : `!! A BONE GOLEM WAS RAISED (${c.r ? c.r.name : '?'})`;

      /* the yield, which is the half that makes the refusal mean anything */
      const rem0 = stash.remains || 0, iron0 = stash.iron || 0, ore0 = stash.iron_ore || 0;
      const q0 = remainsQ();
      harvestCorpse(auto, true, null);
      const dIron = (stash.iron || 0) - iron0, dOre = (stash.iron_ore || 0) - ore0;
      R.machinesRenderToMetal = (dIron > 0 || dOre > 0)
        ? `stripping the walker gives ${dIron} iron ingots and ${dOre} ore`
        : `!! STRIPPING A MACHINE GIVES NO METAL (iron +${dIron}, ore +${dOre})`;
      R.machinesGiveNoRemains = (stash.remains || 0) === rem0
        ? 'and not one Mortal Remain — there was never any marrow in it'
        : `!! A STRIPPED MACHINE STILL GIVES ${(stash.remains || 0) - rem0} MORTAL REMAINS`;
      /* the quiet one. `rememberRemains` blends a rendered body's stat line into the pile's
         quality, and `bindCeiling` reads that number to cap every bound body. A machine's
         20 tough going into that pile is a free ceiling raise off a thing that is not bone. */
      R.machinesDoNotLaunderQuality = Math.abs(remainsQ() - q0) < 0.01
        ? `and the remains quality is untouched at ${remainsQ().toFixed(0)} — a machine cannot raise the circle's ceiling`
        : `!! STRIPPING A MACHINE MOVED THE REMAINS QUALITY ${q0.toFixed(1)} -> ${remainsQ().toFixed(1)}`;
    }

    /* ================= 3. AND THE THINGS THAT DO COME BACK, STILL DO ================= */
    {
      wipe();
      const nec = makeNec();
      const man = layOut(makeChar('Bandit', 'bandit', gx + 1, gy, { atk: 9, def: 7, tough: 9, ath: 6 }));
      const { ok, r } = raise(nec, man);
      R.anOrdinaryBodyStillRises = (ok && r && r.undead)
        ? `an ordinary corpse still stands up (${r.name})`
        : '!! THE REFUSALS BROKE THE ORDINARY RAISE';
    }

    /* ============ 4. WHAT COMES BACK LOOKS LIKE WHAT IT CAME OFF ============ */
    /* Measured off the built MESH, not off the flags. A flag no rig reads would pass a flag
       test and change nothing the player can see. `buildCharMesh` is the render path itself;
       counting the joints it produced is the cheapest honest question to ask of it. */
    const rig = (c) => {
      const e = buildCharMesh(c);
      const legs = ['legL', 'legR', 'legL2', 'legR2'].filter(k => e && e[k]).length;
      /* geometry, not meshes: `bakeBoxes` MERGES the obox proxies into a handful of
         vertex-coloured buckets, so counting meshes on a baked rig counts buckets and would
         report a ribcage and a solid slab as the same number. Vertex count is what actually
         grew. */
      let verts = 0, meshes = 0;
      const walk = (o) => {
        if (!o) return;
        if (o.isMesh) { meshes++; const g = o.geometry; if (g && g.attributes && g.attributes.position) verts += g.attributes.position.count; }
        (o.children || []).forEach(walk);
      };
      walk(e && e.g);
      return { legs, quad: legs === 4, tail: !!(e && e.tail && e.tail.length), spine: !!(e && e.spine), meshes, verts };
    };
    {
      wipe();
      const nec = makeNec();
      /* a dust hound, built the way the world builds one */
      const hound = layOut(makeChar('Dust Hound', 'wild', gx + 1, gy, { atk: 8, def: 4, tough: 6, ath: 14 }));
      hound.beast = true; hound.kin = 'hound'; hound.clawDmg = 7; hound.big = 1;
      const { ok, r } = raise(nec, hound);
      R.aHoundRises = ok && r ? `the hound comes up as "${r.name}"` : '!! THE HOUND WOULD NOT RISE';
      if (r) {
        const m = rig(r);
        R.aRaisedHoundIsStillAHound = (r.beast && r.kin === 'hound' && m.quad)
          ? `and it is built on four legs, not two — ${m.verts} vertices on a quadruped rig`
          : `!! A RAISED HOUND STANDS UP AS A BIPED (beast ${!!r.beast}, kin ${r.kin}, legs ${m.legs})`;
        R.aRaisedHoundKeepsItsTeeth = r.clawDmg > 0
          ? `it still bites for ${r.clawDmg.toFixed(1)} — a beast with no claws is a prop`
          : '!! THE RAISED HOUND HAS NO ATTACK AT ALL';
        R.aRaisedHoundIsNamedForIt = /hound/i.test(r.name)
          ? 'and the squad bar calls it what it is'
          : `!! IT IS CALLED "${r.name}" — THE BAR STILL READS AS A LIST OF NUMBERS`;
        /* THE SHAPE HAS TO SURVIVE A SAVE, or it is a hound until you reload and a man
           after. Read out of the REAL snapshot rather than a hand-built object: `sChar` is
           block-scoped inside the save writer and cannot be called from here, and a harness
           that reimplements the thing it is testing is testing itself. */
        const snap = JSON.parse(JSON.stringify(snapshot()));
        const row = (snap.chars || []).find(x => x.id === r.id);
        R.theShapeRidesTheSave = (row && row.beast && row.kin === 'hound' && row.race === r.race)
          ? 'and the shape rides the save — beast, kin and line all written out'
          : `!! THE SHAPE IS NOT SAVED (${row ? 'beast ' + row.beast + ', kin ' + JSON.stringify(row.kin) : 'no row for the risen'})`;
      }
    }
    /* a pack mule has no `kin` at all — the rig falls back to `mule ? 'mule' : 'hound'` at
       BUILD time, which a saved body does not carry. Resolving it at raise time is the only
       version of this that survives a reload. */
    {
      wipe();
      const nec = makeNec();
      const mule = layOut(makeChar('Pack Mule', 'town', gx + 1, gy, { atk: 2, def: 4, tough: 10, ath: 8 }));
      mule.beast = true; mule.mule = true;
      const { r } = raise(nec, mule);
      R.aRaisedMuleStaysAMule = (r && r.beast && r.kin === 'mule')
        ? `a raised mule resolves to kin "${r.kin}" at the rite, so a reload cannot turn it into a hound`
        : `!! A RAISED MULE HAS kin ${r ? JSON.stringify(r.kin) : '(no body)'} — IT WILL RELOAD AS A HOUND`;
    }
    /* and a dead animal must not look like a live one wearing your colours */
    {
      wipe();
      const live = makeChar('Live Hound', 'wild', gx + 1, gy, { atk: 8, def: 4, tough: 6, ath: 14 });
      live.beast = true; live.kin = 'hound'; live.__probe = true; chars.push(live);
      const dead = makeChar('Gravehound', 'player', gx + 2, gy, { atk: 8, def: 4, tough: 6, ath: 14 });
      dead.beast = true; dead.kin = 'hound'; dead.undead = true; dead.__probe = true; chars.push(dead);
      const a = rig(live), c = rig(dead);
      R.deadBeastsReadAsBone = c.verts > a.verts * 1.25
        ? `an undead quadruped is a ribcage, not a tinted hound — ${a.verts} verts alive, ${c.verts} dead`
        : `!! A DEAD BEAST IS THE LIVE RIG IN TEAM COLOURS (${a.verts} verts alive, ${c.verts} dead)`;
      R.deadBeastsAreNotFactionColoured = colorKeyOf(live) !== colorKeyOf(dead)
        ? 'and the two do not share a mesh-cache key'
        : '!! A LIVE AND A DEAD HOUND SHARE A CACHE KEY — WHICHEVER BUILDS FIRST WINS';
    }

    /* ==================== 5. THE CHIMERA LINES KEEP THEIR BONES ==================== */
    {
      const lines = ['houndkin', 'oxbound', 'thinblood', 'scaleborn'];
      const seen = {};
      let plain = null;
      for (const sub of lines) {
        wipe();
        const n2 = makeNec();
        const body = layOut(makeChar('Chimera', 'bandit', gx + 1, gy,
          { atk: 12, def: 8, tough: 12, ath: 8, race: 'chimera', sub }));
        const { r } = raise(n2, body);
        if (!r) { seen[sub] = null; continue; }
        seen[sub] = { r, m: rig(r) };
      }
      {
        wipe();
        const n3 = makeNec();
        const body = layOut(makeChar('Farmhand', 'town', gx + 1, gy, { atk: 12, def: 8, tough: 12, ath: 8 }));
        body.race = 'human'; body.sub = null;
        const { r } = raise(n3, body);
        plain = r ? { r, m: rig(r) } : null;
      }
      R.raisedChimerasKeepTheirLine = lines.every(k => seen[k] && seen[k].r.race === 'chimera' && seen[k].r.sub === k)
        ? `all four lines come back as themselves (${lines.join(', ')})`
        : `!! A RAISED CHIMERA LOSES ITS LINE (${lines.map(k => k + ':' + (seen[k] ? seen[k].r.race + '/' + seen[k].r.sub : 'none')).join(' ')})`;
      if (plain) {
        const bigger = lines.filter(k => seen[k] && seen[k].m.verts > plain.m.verts * 1.04);
        R.chimeraSkeletonsAreTheirOwn = bigger.length === lines.length
          ? `and each has bones a plain risen does not: human ${plain.m.verts} verts vs ` +
            lines.map(k => k + ' ' + seen[k].m.verts).join(', ')
          : `!! ${lines.filter(k => !bigger.includes(k)).join(', ')} RAISE AS AN ANONYMOUS HUMAN SKELETON ` +
            `(human ${plain.m.verts}; ` + lines.map(k => k + ' ' + (seen[k] ? seen[k].m.verts : '?')).join(', ') + ')';
        R.theTailedLinesKeepTheirTails = (seen.houndkin && seen.houndkin.m.tail && seen.scaleborn && seen.scaleborn.m.tail && !plain.m.tail)
          ? 'the tailed lines still have a tail to swing, and a human risen does not'
          : `!! TAILS ARE WRONG (houndkin ${seen.houndkin && seen.houndkin.m.tail}, ` +
            `scaleborn ${seen.scaleborn && seen.scaleborn.m.tail}, human ${plain.m.tail})`;
        /* four lines that all render the same are four names for one body */
        const keys = new Set(lines.map(k => seen[k] && colorKeyOf(seen[k].r)));
        R.theLinesAreToldApart = keys.size === lines.length
          ? 'and no two lines share a mesh-cache key'
          : `!! ONLY ${keys.size} DISTINCT KEYS ACROSS ${lines.length} CHIMERA LINES`;
      }
    }

    /* ============ 6. AND SIZE IS STILL THE RITE'S TO GIVE, NOT THE CORPSE'S ============ */
    {
      wipe();
      const nec = makeNec();
      const maw = layOut(makeChar('Carrion Maw', 'gaunt2', gx + 1, gy, { atk: 30, def: 20, tough: 40, ath: 8 }));
      maw.beast = true; maw.kin = 'hound'; maw.big = 3.2; maw.clawDmg = 34;
      maw.deadAt = day - 12;                 /* scraped off old ground */
      const { r } = raise(nec, maw);
      R.rotShrinksWhatItRaises = (r && r.big > 1 && r.big < maw.big)
        ? `a house-sized corpse raised off old ground comes up at ${r.big.toFixed(2)}x, not ${maw.big}x`
        : `!! SIZE IS WRONG (${r ? r.big : 'no body'} from a ${maw.big} corpse)`;
      /* "a corpse is never stronger dead than it was in life" — and the ceiling has to hold
         AFTER `makeChar` has added the flat bonuses of whatever line it rolled for the risen,
         which is where it used to leak (an Ironscar-bred roll is +3 atk over the clamp). */
      const over = ['atk', 'def', 'tough'].filter(k => r && r.stats[k] > maw.stats[k]);
      R.aRaisedBossIsStillClamped = (r && over.length === 0)
        ? `and no stat beats the corpse's own — atk ${Math.round(r.stats.atk)}/${maw.stats.atk}, ` +
          `def ${Math.round(r.stats.def)}/${maw.stats.def}, tough ${Math.round(r.stats.tough)}/${maw.stats.tough}`
        : `!! A RISEN BEATS THE CORPSE IT CAME OUT OF ON ${over.join(', ').toUpperCase()}`;
    }

    wipe();
    return R;
  });

  console.log('=== WHAT THE RITE REFUSES, AND WHAT COMES BACK ===\n');
  for (const [k, v] of Object.entries(out)) console.log('  ' + k.padEnd(32) + v);
  const bad = Object.values(out).map(String).filter(v => v.startsWith('!!'));
  console.log('\n' + (bad.length ? '*** ' + bad.join('\n*** ')
    : 'THE WATCHERS AND THE MACHINES ARE REFUSED, AND EVERYTHING ELSE COMES BACK AS ITSELF'));
  if (errs.length) { console.log('errs:', errs.length); errs.slice(0, 4).forEach(e => console.log('  ' + e)); }
  await b.close();
  if (bad.length) process.exitCode = 1;
})();
