#!/usr/bin/env node
/* Does the world itself survive a save — the parts of it that are not people.
 *
 * tools/save.js proves the save format round-trips and tools/roundtrip.js proves the squad
 * comes back. Neither touches the STRUCTURES, and two bugs lived in that gap for a long time:
 *
 *   1. Loading could only ever DELETE town walls. `restore` resets `blocked` to the world as
 *      generated — every wall solid again — but it never rebuilt the ring arrays, and the
 *      apply step only spliced. So a load into a session that had already seen a breach left
 *      that segment gone from the ring (no mesh, no hp, the town reads wide open) while it was
 *      still standing in `blocked` (nothing can walk through the gap). Load an intact save
 *      after a siege and the walls simply did not come back.
 *   2. The guard against a foreign save razing a town it doesn't recognise was measured
 *      against the LIVE ring rather than the saved one, so a town that had genuinely lost more
 *      than half its wall got read as a mismatch and had the whole ring handed back to it.
 *
 * And the same class of bug on bodies: `restore` read `s.kin` but `snapshot` never wrote it,
 * so every risen came back as the generic rig — which is what "the skeleton mage's cape does
 * not always persist" actually was.
 *
 *   node tools/walls.js [game.html]
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
    const ti = towns.findIndex(t => t.walls && t.walls.length > 20);
    if (ti < 0) return { town: '!! NO WALLED TOWN TO TEST' };
    const town = towns[ti];
    const FULL = town.walls.length;
    R.town = `${town.name} was generated with ${FULL} wall segments`;

    /* the ring as the world made it, read once so every assertion below has a fixed truth to
       measure against rather than whatever the last step left behind */
    const ringCoords = town.walls.map(w => w.x + ',' + w.y);
    const at = (w) => w.x + ',' + w.y;
    const count = () => town.walls.length;
    const solid = (k) => { const [x, y] = k.split(',').map(Number); return blocked.has(bkey(x, y)); };
    /* a wall is coherent when the ring and the collision map agree about it. The whole first
       bug was these two disagreeing, and neither one alone would have caught it. */
    const incoherent = () => {
      const inRing = new Set(town.walls.map(at));
      return ringCoords.filter(k => inRing.has(k) !== solid(k));
    };
    /* knock segments down through the real path the game uses, not by splicing the array */
    const breach = (n) => {
      let done = 0;
      for (const w of [...town.walls]) {
        if (done >= n) break;
        const st = structAt(w.x + 0.5, w.y + 0.5);
        if (!st || st.kind !== 'twall') continue;
        destroyStructure(st); done++;
      }
      return done;
    };

    /* --- 1. AN INTACT WORLD COMES BACK INTACT --- */
    const intact = JSON.parse(JSON.stringify(snapshot()));
    restore(JSON.parse(JSON.stringify(intact)));
    R.intactRoundTrip = count() === FULL
      ? `an undamaged ring round-trips at ${FULL}` : `!! ${FULL} SEGMENTS WENT IN, ${count()} CAME BACK`;
    R.intactCoherent = incoherent().length === 0
      ? 'and every segment agrees with the collision map'
      : `!! ${incoherent().length} SEGMENTS DISAGREE WITH \`blocked\` AFTER A CLEAN LOAD`;

    /* --- 2. DAMAGE SURVIVES --- */
    const hit = breach(5);
    const breached = ringCoords.filter(k => !town.walls.some(w => at(w) === k));
    const damaged = JSON.parse(JSON.stringify(snapshot()));
    restore(JSON.parse(JSON.stringify(damaged)));
    R.breached = hit === 5 ? `five segments taken down through destroyStructure` : `!! ONLY BREACHED ${hit}`;
    R.damageSurvives = count() === FULL - 5
      ? `a breached ring saves and loads at ${FULL - 5}` : `!! DAMAGED RING CAME BACK AT ${count()}, WANTED ${FULL - 5}`;
    R.gapsStayOpen = breached.every(k => !solid(k))
      ? 'and the gaps are still walkable after the load'
      : `!! ${breached.filter(solid).length} BREACHED TILES CAME BACK SOLID BUT INVISIBLE`;

    /* --- 3. THE BUG: LOADING COULD ONLY EVER REMOVE WALLS ---
       This is the one people actually hit. Play, lose a wall, load an earlier save — and the
       wall stayed down, because the apply step had no way to put one back. */
    restore(JSON.parse(JSON.stringify(intact)));
    R.wallsComeBack = count() === FULL
      ? `loading an intact save after a siege rebuilds all ${FULL}`
      : `!! THE WALLS DID NOT COME BACK — ${count()} of ${FULL} AFTER LOADING AN INTACT SAVE`;
    R.rebuiltSolid = incoherent().length === 0
      ? 'and the rebuilt segments are solid again'
      : `!! ${incoherent().length} REBUILT SEGMENTS ARE NOT IN \`blocked\``;

    /* --- 4. LOADING TWICE IS LOADING ONCE --- */
    restore(JSON.parse(JSON.stringify(damaged)));
    const once = count();
    restore(JSON.parse(JSON.stringify(damaged)));
    R.loadIsIdempotent = count() === once && once === FULL - 5
      ? `the same save loaded twice lands on ${once} both times`
      : `!! DAMAGE ACCUMULATED ACROSS LOADS: ${once} then ${count()}`;

    /* --- 5. A REAL SIEGE IS NOT A MISMATCH ---
       More than half the ring gone is a town that got taken apart, not a save from another
       world. The old guard could not tell the difference and handed the whole ring back. */
    restore(JSON.parse(JSON.stringify(intact)));
    const razed = breach(Math.floor(FULL * 0.7));
    const left = count();
    const sieged = JSON.parse(JSON.stringify(snapshot()));
    restore(JSON.parse(JSON.stringify(sieged)));
    R.siegeSurvives = count() === left
      ? `${razed} of ${FULL} down, and it loads back at ${left}`
      : `!! A HEAVY SIEGE WAS READ AS A BAD SAVE — ${left} SURVIVORS BECAME ${count()}`;

    /* --- 6. BUT A FOREIGN SAVE STILL CANNOT RAZE A TOWN ---
       The guard has to keep working. A save whose wall coordinates belong to a differently
       generated world must leave this world's ring standing. */
    restore(JSON.parse(JSON.stringify(intact)));
    const foreign = JSON.parse(JSON.stringify(intact));
    foreign.townWalls = foreign.townWalls.map(ws => ws.map(w => ({ x: w.x + 997, y: w.y + 997, hp: w.hp })));
    restore(foreign);
    R.foreignSaveIgnored = count() === FULL
      ? 'a save from another worldgen leaves the ring standing'
      : `!! A FOREIGN SAVE UNBUILT THE TOWN — ${count()} of ${FULL}`;

    /* --- 7. AND AN EMPTY RECORD IS STILL HONOURED ---
       "no wall data at all" (an old save) and "this town was recorded flat" are different
       things and must not collapse into each other. */
    restore(JSON.parse(JSON.stringify(intact)));
    const flat = JSON.parse(JSON.stringify(intact));
    flat.townWalls[ti] = [];
    restore(flat);
    const flatN = count();
    restore(JSON.parse(JSON.stringify(intact)));
    const noField = JSON.parse(JSON.stringify(intact));
    delete noField.townWalls;
    restore(noField);
    R.flatVsAbsent = (flatN === 0 && count() === FULL)
      ? 'a flattened ring stays flat; a save with no wall field keeps the generated ring'
      : `!! FLAT GAVE ${flatN} (wanted 0), ABSENT GAVE ${count()} (wanted ${FULL})`;

    /* --- 8. THE SKELETON MAGE'S BODY --- */
    restore(JSON.parse(JSON.stringify(intact)));
    const ritualist = player().find(o => o.state === 'ok');
    ritualist.gift = 'dark'; ritualist.stats.magic = 60; ritualist.mana = 999;
    ritualist.att = { dark: 3, divine: 0, destruction: 0, dust: 0 };
    research.done.rites_binding = true; research.done.rites_deep = true; research.done.necromancy = true;
    for (const k of ['remains', 'stone', 'fabric', 'copper', 'wood', 'hide', 'vflesh']) stash[k] = (stash[k] || 0) + 400;
    const circle = { x: ritualist.x, y: ritualist.y };
    const n0 = chars.length;
    craftUndead('mage', ritualist, circle, null);
    const mage = chars.length > n0 ? chars[chars.length - 1] : null;
    R.mageBinds = mage ? `bound ${mage.name}, kin "${mage.kin}"` : '!! THE SKELETON MAGE WOULD NOT BIND';
    if (mage) {
      /* the rig is chosen by kin, and the mesh CACHE is keyed by colorKeyOf. A mage that
         shares a key with a plain risen gets handed the plain risen's body out of the cache,
         which is the "sometimes it has a cape, sometimes it doesn't" half of the report. */
      const plain = { ...mage, kin: null };
      R.mageKeyDistinct = colorKeyOf(mage) !== colorKeyOf(plain)
        ? 'a mage and a plain risen no longer share a mesh key'
        : '!! A SKELETON MAGE AND A PLAIN RISEN HAVE THE SAME MESH KEY';

      const withMage = JSON.parse(JSON.stringify(snapshot()));
      const savedMage = withMage.chars.find(s => s.id === mage.id);
      R.kinIsWritten = savedMage && savedMage.kin === 'mage'
        ? 'the save records what the body was bound for'
        : `!! snapshot() DOES NOT WRITE kin (got ${savedMage ? JSON.stringify(savedMage.kin) : 'no such body'})`;

      restore(JSON.parse(JSON.stringify(withMage)));
      const back = chars.find(c => c.id === mage.id);
      R.kinSurvives = back && back.kin === 'mage'
        ? `it comes back a ${back.name} and still knows it`
        : `!! THE MAGE CAME BACK WITH kin ${back ? JSON.stringify(back.kin) : '(gone entirely)'}`;
      R.mageRigAfterLoad = back && colorKeyOf(back) === colorKeyOf(mage)
        ? 'and rebuilds to the same body it had before the save'
        : '!! THE LOADED MAGE ASKS FOR A DIFFERENT BODY THAN THE ONE THAT WAS SAVED';
    }
    return R;
  });

  console.log('=== THE WALLS AND THE BODIES ===\n');
  for (const [k, v] of Object.entries(out)) console.log('  ' + k.padEnd(20) + v);
  const bad = Object.values(out).map(String).filter(v => v.startsWith('!!'));
  console.log('\n' + (bad.length ? '*** ' + bad.join('\n*** ')
    : 'WALLS COME BACK, DAMAGE STICKS, AND A MAGE IS STILL A MAGE'));
  if (errs.length) { console.log('errs:', errs.length); errs.slice(0, 4).forEach(e => console.log('  ' + e)); }
  await b.close();
  if (bad.length) process.exitCode = 1;
})();
