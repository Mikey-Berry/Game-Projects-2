#!/usr/bin/env node
/* THE NEW SLOTS HAVE TO BE REACHABLE, NOT MERELY DEFINED.
 *
 * "Could you simply ensure that all new equipment slots function properly? I.e., there are a
 *  few options available with actual models, and you can purchase them from the armory or loot
 *  them or craft them etc etc."
 *
 * The slots shipped and every one of those four paths was broken or missing, and the first one
 * is a mistake this file has already recorded once: `aether_cell` was on a vendor's LIST while
 * no town anywhere held one, so an occult dealer stood in front of an empty shelf for a whole
 * run. Adding head, cloak and trinket to `VENDOR_STOCK` did exactly the same thing — the
 * shelves show what a town has SEEDED, and nothing seeded any of them. Measured before this
 * change: 3 of 3 new types on a vendor's list, 0 of 7 towns holding a single one, and 0 recipes
 * anywhere in the game that produce one.
 *
 * So this file asks the four questions a player would: can I buy one, can I make one, can I
 * take one off a body, and does it look like anything.
 *
 *   node tools/kitted.js [game.html]
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
    const G = (keys, fn) => { try { fn(); } catch (e) { for (const k of keys) if (R[k] === undefined) R[k] = '!! ' + String(e.message).slice(0, 100).toUpperCase(); } };
    const NEW = ['head', 'cloak', 'trinket'];
    const baseOf = k => (ITEMS[k] && ITEMS[k].tierOf) || k;
    const isNew = k => ITEMS[k] && NEW.includes(ITEMS[k].type);

    /* ---------- 1. THERE ARE OPTIONS, AND THEY ARE DISTINCT ---------- */
    G(['thereAreOptions'], () => {
      const byType = {};
      for (const k of Object.keys(ITEMS)) {
        const it = ITEMS[k];
        if (!NEW.includes(it.type)) continue;
        if (it.tierOf && it.tierOf !== k) continue;    /* count the bases, not the four grades */
        (byType[it.type] = byType[it.type] || []).push(k);
      }
      R._options = NEW.map(t => `${t} ${(byType[t] || []).length}: ${(byType[t] || []).join(' ')}`).join(' · ');
      R.thereAreOptions = NEW.every(t => (byType[t] || []).length >= 3)
        ? `three or more of each: ${R._options}`
        : `!! A SLOT HAS ALMOST NOTHING TO PUT IN IT (${R._options})`;
    });

    /* ---------- 2. AND THEY HAVE MODELS, AND THE MODELS DIFFER ----------
       Built through the real `buildCharMesh`. Getting the measurement right took four goes and
       every one of them is a way a render probe can lie:
         · `buildCharMesh` hands back the ENTRY (`{g, mats, ...}`), not the group, so
           `.traverse` on the return threw and every reading came back -2 — the bare control
           included. When the control is impossible too, the probe is broken, not the subject.
         · `isMesh` was the wrong thing to count: a helm is `obox(...)` hung off `e.headG` and
           those MERGE into the body's own meshes, so geared and bare both read 13 meshes and
           26 objects and the claim said "renders as nothing" about geometry plainly there.
         · vertices move — but a crested helm and a bone wreath both happen to add 168 of them,
           so a count is not an identity.
         · and a position hash across DIFFERENT bodies proves nothing at all, because face and
           hair are drawn off `c.id`: every doll would differ whether it wore anything or not.
       So: ONE body, its gear mutated between builds, measured by a hash of every vertex
       position. The only thing that changes between readings is the item. */
    G(['andEveryOneHasAModel', 'andNoTwoLookAlike'], () => {
      const me = player()[0];
      const sigOf = (e) => {
        let n = 0, h = 0;
        e.g.traverse(o => {
          const g2 = o.isMesh && o.geometry;
          if (!g2 || !g2.attributes || !g2.attributes.position) return;
          const a = g2.attributes.position;
          n += a.count;
          for (let i = 0; i < a.count; i++) h = (h + Math.round((a.getX(i) * 31 + a.getY(i) * 77 + a.getZ(i) * 113) * 1000)) % 1e9;
        });
        return { n, h };
      };
      const c = makeChar('Doll', 'player', me.x + 2, me.y + 2, { atk: 5, def: 5, tough: 9 });
      c.state = 'ok'; chars.push(c);
      const read = (o) => {
        c.head = null; c.cloak = null; c.pack = null;
        Object.assign(c, o);
        try { return sigOf(buildCharMesh(c)); } catch (e) { return { n: -2, h: -2 }; }
      };
      const bare = read({});
      const control = read({ pack: 'pack_l' });    /* geometry we KNOW is drawn, in the same block */
      const heads = ['h_cap', 'h_kettle', 'h_armet', 'h_crest', 'h_wreath'];
      const cloaks = ['k_road', 'k_pelt', 'k_grave'];
      const sig = {};
      for (const h of heads) sig[h] = read({ head: h });
      for (const k of cloaks) sig[k] = read({ cloak: k });
      chars.splice(chars.indexOf(c), 1);
      R._models = `bare ${bare.n} verts, a large pack ${control.n}; ` + Object.entries(sig).map(([k, v]) => `${k} ${v.n}`).join(' ');
      const controlMoves = control.n > bare.n && control.h !== bare.h;
      const drawn = Object.entries(sig).filter(([, v]) => v.n > bare.n && v.h !== bare.h);
      R.andEveryOneHasAModel = controlMoves && drawn.length === heads.length + cloaks.length
        ? `all ${drawn.length} helms and cloaks put real geometry on one and the same body — bare is ${bare.n} vertices, the heaviest of them ${Math.max(...Object.values(sig).map(v => v.n))}`
        : !controlMoves ? `!! THE METRIC DOES NOT MOVE EVEN FOR A PACK — this probe is broken, not the models (${R._models})`
        : `!! SOMETHING RENDERS AS NOTHING (${R._models})`;
      const hashes = [...heads, ...cloaks].map(k => sig[k].h);
      R.andNoTwoLookAlike = new Set(hashes).size === hashes.length
        ? `and all ${hashes.length} are geometrically distinct — the crested helm and the bone wreath happen to add the same 168 vertices and are not remotely the same object`
        : `!! TWO PIECES ARE THE SAME GEOMETRY (${[...heads, ...cloaks].map(k => k + ':' + sig[k].h).join(' ')})`;
    });

    /* ---------- 3. YOU CAN BUY ONE ----------
       THE MISTAKE THIS ASKS ABOUT: a vendor's LIST is not a shelf. Both halves are asked —
       listed, and actually held by a town — because the first without the second is the
       aether-cell bug and it looks identical from the code. */
    G(['aVendorListsThem', 'andATownActuallyHasOne', 'andTheCounterOffersIt'], () => {
      const listed = NEW.filter(t => Object.values(VENDOR_STOCK).some(list => list.some(k => ITEMS[k] && ITEMS[k].type === t)));
      R.aVendorListsThem = listed.length === 3
        ? `all three types are on somebody's list: ${listed.join(', ')}`
        : `!! A TYPE IS ON NO VENDOR'S LIST (${listed.join(',') || 'none'})`;
      const held = {};
      for (const t of towns) for (const k of Object.keys(t.stock || {})) {
        if (isNew(k) && (t.stock[k] || 0) > 0) (held[ITEMS[k].type] = held[ITEMS[k].type] || new Set()).add(t.name);
      }
      R._shelves = NEW.map(t => `${t} in ${(held[t] || new Set()).size}/${towns.length} towns`).join(' · ');
      R.andATownActuallyHasOne = NEW.every(t => (held[t] || new Set()).size >= 1)
        ? `and the shelves are not empty: ${R._shelves}`
        : `!! LISTED AND NOT STOCKED — the aether-cell bug, again (${R._shelves})`;
      /* and the counter itself has to draw the row, which is the third thing that can be wrong */
      const v = vendors.find(v2 => v2.vt === 'weapons') || vendors[0];
      if (!v) { R.andTheCounterOffersIt = '!! NO VENDOR IN THE WORLD'; return; }
      /* stock the town it belongs to so the test is about the COUNTER, not about the dice */
      v.town.stock.h_kettle = (v.town.stock.h_kettle || 0) + 2;
      v.town.stock.k_road = (v.town.stock.k_road || 0) + 2;
      openVendor(v);
      const txt = document.getElementById('modalbody').textContent;
      document.getElementById('modal').style.display = 'none'; modalOpen = false;
      R.andTheCounterOffersIt = /Kettle Helm/.test(txt) && /Road Cloak/.test(txt)
        ? `and ${v.name} in ${v.town.name} puts them on the counter where you can buy them`
        : `!! THE COUNTER WILL NOT SELL THEM (${txt.slice(0, 120)})`;
    });

    /* ---------- 4. YOU CAN MAKE ONE ----------
       Driven through the real craft tick at a real bench, because a row in RECIPES is not a
       feature until something comes out of it. */
    G(['everySlotIsCraftable', 'andTheBenchActuallyMakesOne'], () => {
      const made = {};
      for (const kind of Object.keys(RECIPES)) for (const r of RECIPES[kind]) {
        if (isNew(r.out)) (made[ITEMS[r.out].type] = made[ITEMS[r.out].type] || []).push(`${r.out}@${kind}`);
      }
      R._recipes = NEW.map(t => `${t}: ${(made[t] || []).join(' ') || 'NONE'}`).join(' · ');
      R.everySlotIsCraftable = NEW.every(t => (made[t] || []).length)
        ? `every slot has a recipe: ${R._recipes}`
        : `!! A SLOT CANNOT BE MADE AT ALL (${R._recipes})`;
      /* and one of them, made for real */
      const me = player()[0];
      research.done.smithing = true; research.done.construction = true;
      const bt = BUILD_TYPES.forge;
      const forge = { type: 'forge', x: Math.round(me.x) + 6, y: Math.round(me.y), w: bt.w, h: bt.h, floor: 0, progress: 1, growth: 0, __probe: true };
      pBuilds.push(forge);
      const smith = makeChar('Probe Smith', 'player', forge.x + 1, forge.y + 1, { atk: 3, def: 3, tough: 8, smithing: 30 });
      smith.state = 'ok'; smith.__probe = true; chars.push(smith); rebuildCharGrid();
      stash.copper = (stash.copper || 0) + 30; stash.fabric = (stash.fabric || 0) + 20;
      const before = Object.keys(stash).filter(k => baseOf(k) === 'h_kettle').reduce((n, k) => n + stash[k], 0);
      smith.craftJob = { kind: 'forge', out: 'h_kettle', want: 4, done: 0, ruined: 0, made: {}, t: 0,
                         dur: craftDur(smith, 'forge'), bx: forge.x + 1, by: forge.y + 1 };
      for (let i = 0; i < 60 * 200 && smith.craftJob; i++) { smith.state = 'ok'; craftTick(smith, 1 / 30); }
      const after = Object.keys(stash).filter(k => baseOf(k) === 'h_kettle').reduce((n, k) => n + stash[k], 0);
      R.andTheBenchActuallyMakesOne = after > before
        ? `and a smith at a forge with copper and cloth turns out ${after - before} Kettle Helm${after - before === 1 ? '' : 's'}`
        : `!! THE FORGE MADE NO HELMET (${before} -> ${after})`;
      for (let i = pBuilds.length - 1; i >= 0; i--) if (pBuilds[i].__probe) pBuilds.splice(i, 1);
      for (let i = chars.length - 1; i >= 0; i--) if (chars[i].__probe) chars.splice(i, 1);
    });

    /* ---------- 5. AND THEY GRADE AND WEATHER LIKE EVERYTHING ELSE WORN ---------- */
    G(['aHelmHasGrades'], () => {
      const fine = ITEMS.h_kettle_f, crude = ITEMS.h_kettle_c;
      const worn = typeof weathered === 'function' ? weathered('h_kettle_f', 1) : null;
      R.aHelmHasGrades = fine && crude && fine.def > ITEMS.h_kettle.def && crude.def < ITEMS.h_kettle.def && worn && worn !== 'h_kettle_f'
        ? `helms and cloaks ride the same four grades as a sword — ${crude.name} ${(crude.def * 100).toFixed(0)}%, plain ${(ITEMS.h_kettle.def * 100).toFixed(0)}%, ${fine.name} ${(fine.def * 100).toFixed(0)}% — and a body lying out walks one down to ${ITEMS[worn] ? ITEMS[worn].name : worn}`
        : `!! NO GRADES ON THE NEW SLOTS (fine ${!!fine}, crude ${!!crude}, weathered ${worn})`;
    });

    /* ---------- 6. YOU CAN TAKE ONE OFF A BODY ----------
       Counted across the whole world rather than off one staged corpse: the question is whether
       the population is WEARING them, not whether `lootCorpse` copies a field. */
    G(['theWorldIsWearingThem', 'andItComesOffABody'], () => {
      const worn = {};
      for (const c of chars) for (const sl of NEW) if (c[sl]) (worn[sl] = worn[sl] || 0, worn[sl]++);
      R._worn = NEW.map(sl => `${sl} on ${worn[sl] || 0} bodies`).join(' · ');
      R.theWorldIsWearingThem = NEW.every(sl => (worn[sl] || 0) > 0)
        ? `the world is dressed in them: ${R._worn}`
        : `!! NOBODY IN THE WORLD WEARS ONE (${R._worn})`;
      const victim = chars.find(c => c.head && c.faction !== 'player' && c.state !== 'dead');
      if (!victim) { R.andItComesOffABody = '!! NOBODY WEARING A HELM TO ROB'; return; }
      const key = victim.head, had = campHas(key);
      kill(victim, player()[0]);
      let got = false;
      for (let i = 0; i < 40 && !got; i++) { victim.looted = false; lootCorpse(victim, true, null); got = campHas(key) > had; }
      R.andItComesOffABody = got
        ? `and going through ${victim.name}'s pockets turns up the ${ITEMS[key].name} they were wearing`
        : `!! THE HELM DOES NOT COME OFF (${key})`;
    });

    /* ---------- 7. AND YOU CAN FIND ONE IN A RUIN ---------- */
    G(['andRuinsHoldThem'], () => {
      const seen = new Set();
      for (let i = 0; i < 400; i++) {
        const l = rollChestLoot();
        for (const k of Object.keys(l.items)) if (isNew(k)) seen.add(ITEMS[k].type);
      }
      R._chests = `four hundred chest rolls turned up ${[...seen].join(', ') || 'nothing'}`;
      R.andRuinsHoldThem = seen.size === 3
        ? `and a ruin chest can hold any of the three — ${R._chests}`
        : `!! A SLOT NEVER APPEARS IN LOOT (${R._chests})`;
    });

    return R;
  });

  console.log('=== THE NEW SLOTS, AND FOUR WAYS TO FILL THEM ===\n');
  for (const [k, v] of Object.entries(out)) console.log('  ' + k.padEnd(28) + v);
  if (errs.length) console.log('\n' + errs.join('\n'));
  const bad = Object.values(out).map(String).filter(v => v.startsWith('!!')).concat(errs);
  console.log('\n' + (bad.length ? '*** ' + bad.join('\n*** ')
    : 'BUY ONE, MAKE ONE, TAKE ONE OFF A BODY, OR FIND ONE IN A RUIN'));
  await b.close();
  process.exit(bad.length ? 1 : 0);
})();
