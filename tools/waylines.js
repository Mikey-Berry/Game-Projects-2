#!/usr/bin/env node
/* A ROAD THAT IS NOT WALKED, AND WHAT THE RITES WANT NOW.
 *
 * Two notes, and they meet at one material:
 *
 *   "Sundered Marrow should have some research use outside of just to sell to scholars. Only
 *    makes sense that some necromancy rites would require the bones of a dead god."
 *
 *   "Teleportation — the map is big enough that it would warrant some means to transport from
 *    one place to another. Maybe a teleportation circle that you can draw up at high expense.
 *    (Similar in shape to the binding circle, but we'll need to find a way to make it distinct.
 *    And maybe tiers for it, solo vs group transportation.)"
 *
 * The marrow had three uses and every one of them was somebody else's: a price at a counter,
 * regard with the Vigil, and two pieces for a scholar's favour. It is a research material now
 * on the deep end of the necromantic road AND the thing a wayline is cut with, which is why
 * both halves are asked in one file.
 *
 * THE CROSSING IS FREE AND THE STONE IS NOT — that was the call, and it makes the rules around
 * it the whole design. Who may work one is the interesting half: not a necromancer. "Anyone
 * with alchemical training should be able to work it", so the test is `hasArts`, and a divine
 * or dust squad gets waylines on the same terms as a dark one.
 *
 *   1. four rites want marrow, and the bench actually SPENDS it
 *   2. and refuses to start without it, which is what makes it a cost rather than a label
 *   3. the circle is offered in the BUILD BAR, locked until The Waylines
 *   4. a stone with nobody on it refuses, and says why
 *   5. a DIVINE caster works it — the whole point of hanging this off Transmutation
 *   6. a mindless risen does not
 *   7. tier I crosses one body; THE HOST ROAD crosses the selection
 *   8. what they are carrying crosses with them
 *   9. a body in a fight is refused, by name — a wayline is not an escape hatch
 *  10. it crosses storeys
 *  11. and the whole thing rides a save
 *  12. and it does not look like a binding circle
 *
 * Anything starting '!!' fails the build.
 *
 *   node tools/waylines.js [game.html]
 */
const { chromium } = require('playwright');
const path = require('path');
const gamePath = (a) => path.resolve(a ? (path.isAbsolute(a) ? a : path.join(__dirname, a)) : path.join(__dirname, 'game.html'));

(async () => {
  const b = await chromium.launch({
    executablePath: process.env.DUSTWARD_CHROME || undefined,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'],
  });
  const p = await b.newPage({ viewport: { width: 1000, height: 700 } });
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message.slice(0, 200)));
  await p.goto('file://' + gamePath(process.argv[2]), { waitUntil: 'load' });
  await p.waitForTimeout(3000);
  await p.evaluate(() => { document.getElementById('btn-start').click(); paused = true; });
  await p.waitForTimeout(3000);

  const out = await p.evaluate(() => {
    const R = {};
    paused = true;
    const guard = (keys, fn) => {
      try { fn(); } catch (e) { for (const k of keys) if (R[k] === undefined) R[k] = '!! ' + String(e.message).slice(0, 120).toUpperCase(); }
    };

    /* ================== THE MARROW ================== */
    guard(['theRitesWantMarrow', 'andTheBenchSpendsIt', 'andRefusesWithoutIt'], () => {
      const want = {};
      for (const k in TECHS) if (TECHS[k].mats && TECHS[k].mats.sunder) want[k] = TECHS[k].mats.sunder;
      const keys = Object.keys(want);
      const total = keys.reduce((a, k) => a + want[k], 0);
      R.theRitesWantMarrow = keys.length >= 3
        ? `${keys.length} rites want ${total} pieces of Sundered Marrow between them — ${keys.map(k => TECHS[k].name + ' ' + want[k]).join(', ')}`
        : `!! ONLY ${keys.length} TECH(S) SPEND MARROW`;

      /* THE BENCH HAS TO ACTUALLY SPEND IT. A cost written into a table and never drawn from
         the stores is a label. Asked through `researchBegin`, which is the door.
         AND NOT THROUGH A QUEST-GATED ONE. The first cut picked the heaviest marrow cost, which
         is The Last Rite — and that rite is gated on the demilich's favour, so `researchBegin`
         refused on the quest and the claim read "the marrow is a label" about a build where it
         is nothing of the kind. A claim about materials has to be staged on a tech whose only
         obstacle is materials. */
      const key = keys.filter(k => !TECHS[k].needsQuest).sort((a, b2) => want[b2] - want[a])[0];
      const t = TECHS[key];
      research.done = {...research.done};
      if (t.req) { let r = t.req; while (r) { research.done[r] = true; r = TECHS[r] && TECHS[r].req; } }
      cats = 99999; research.rp = 9999;
      for (const m in (t.mats || {})) stash[m] = (stash[m] || 0) + t.mats[m] * 3;
      if (t.needs) pBuilds.push({type: t.needs, x: 4, y: 4, w: 2, h: 2, floor: 0, progress: 1, __probe: true});
      const before = campHas('sunder');
      research.active = null; research.queue.length = 0;
      const began = researchBegin(key);
      const after = campHas('sunder');
      R.andTheBenchSpendsIt = (began && before - after === want[key])
        ? `taking up ${t.name} takes ${want[key]} marrow out of the stores (${before} -> ${after})`
        : `!! THE MARROW IS A LABEL, NOT A COST (began ${began}, ${before} -> ${after}, wanted ${want[key]})`;

      /* and with the marrow gone it will not start at all */
      research.active = null; research.done[key] = false;
      const held = campHas('sunder');
      if (held) campSpend({sunder: held});
      const blocked = researchBlocker(key);
      R.andRefusesWithoutIt = (blocked && /marrow|material|stores|sundered/i.test(blocked))
        ? `and with the stores empty the bench will not take it up — "${blocked}"`
        : `!! IT STARTS WITH NO MARROW AT ALL (blocker: ${blocked || 'none'})`;
      research.active = null;
      for (let i = pBuilds.length - 1; i >= 0; i--) if (pBuilds[i].__probe) pBuilds.splice(i, 1);
    });

    /* ================== THE WAYLINES ================== */
    /* open waste to stand two circles on */
    let gx = 0, gy = 0;
    outer:
    for (let y = 120; y < H - 120; y += 7) for (let x = 120; x < W - 120; x += 7) {
      if (towns.some(t => dist(t.x, t.y, x, y) < 70)) continue;
      let ok = true;
      for (let j = -6; j <= 6 && ok; j++) for (let i = -6; i <= 6; i++) if (isBlocked(x + i + 0.5, y + j + 0.5, 0)) { ok = false; break; }
      if (ok) { gx = x; gy = y; break outer; }
    }
    R._ground = gx ? `staged at ${gx},${gy}` : '!! NO OPEN GROUND';

    guard(['itIsInTheBuildBar'], () => {
      /* ASKED OF THE BAR, NOT THE TABLE. A costed BUILD_TYPES entry that never appears in
         BUILD_CATS cannot be put up by a player, and this file has recorded that exact miss
         twice under other names (the cell, the homestead). */
      const listed = BUILD_CATS.some(([, keys]) => keys.includes('way'));
      research.done.waylines = false;
      const lockedTxt = buildLock('way');
      research.done.waylines = true;
      const openTxt = buildLock('way');
      R.itIsInTheBuildBar = (listed && lockedTxt === 'The Waylines' && !openTxt)
        ? `the Wayline Circle is offered in the build bar, locked behind "${lockedTxt}" until it is researched`
        : `!! NOT REACHABLE FROM THE BUILD BAR (listed ${listed}, locked "${lockedTxt}", after research "${openTxt}")`;
    });

    /* two stones, thirty tiles apart */
    const mkWay = (x, y, fl) => {
      const w = {type: 'way', x, y, w: 2, h: 2, floor: fl || 0, progress: 1, __probe: true};
      pBuilds.push(w); return w;
    };
    const A = mkWay(gx, gy, 0), B = mkWay(gx + 30, gy, 0);
    const mk = (name, gift, o) => {
      const c = makeChar(name, 'player', A.x + 1, A.y + 1, {atk: 5, def: 5, tough: 10, magic: 25});
      c.__probe = true; c.floor = 0; c.gift = gift; Object.assign(c, o || {});
      chars.push(c); return c;
    };
    /* nobody of yours already standing at the stone should count toward the party */
    const away = [];
    for (const c of player()) if (dist(c.x, c.y, A.x, A.y) < 40) { away.push([c, c.x, c.y]); c.x += 400; }
    rebuildCharGrid();

    guard(['anEmptyStoneRefuses', 'aDivineCasterWorksIt', 'aMindlessRisenDoesNot'], () => {
      R.anEmptyStoneRefuses = (() => {
        const no = waylineRefusal(A, B, waylineParty(A));
        return (no && /art/.test(no)) ? `a stone with nobody on it will not answer — "${no}"`
                                      : `!! AN EMPTY STONE ANSWERED (${no || 'no refusal at all'})`;
      })();
      const div = mk('Probe Verity', 'divine');
      rebuildCharGrid();
      R.aDivineCasterWorksIt = waylineWorker(A) === div
        ? 'a DIVINE caster works the stone — the waylines are golden-age engineering, not a necromancer\'s perk'
        : `!! A DIVINE CASTER CANNOT WORK IT (${waylineWorker(A) ? waylineWorker(A).name : 'nobody'})`;
      div.x += 400; rebuildCharGrid();
      const husk = mk('Probe Husk', 'dark', {undead: true, lich: false, lieutenant: false, minded: false});
      rebuildCharGrid();
      R.aMindlessRisenDoesNot = waylineWorker(A) !== husk
        ? 'and a mindless risen standing on it is not staffing anything'
        : '!! A MINDLESS RISEN WORKS THE STONE';
      husk.x += 400; rebuildCharGrid();
    });

    guard(['tierOneCrossesOne', 'theHostRoadCrossesTheSquad', 'whatTheyCarryCrosses'], () => {
      const worker = mk('Probe Adept', 'dust');
      const mate1 = mk('Probe Hand A', null);
      const mate2 = mk('Probe Hand B', null);
      for (const c of [worker, mate1, mate2]) { c.x = A.x + 1; c.y = A.y + 1; }
      rebuildCharGrid();
      selected = [worker, mate1, mate2];

      research.done.wayline_host = false;
      const n1 = waylineParty(A).length;
      waylineCross(A, B);
      const moved1 = [worker, mate1, mate2].filter(c => dist(c.x, c.y, B.x, B.y) < 8).length;
      R.tierOneCrossesOne = (n1 === 1 && moved1 === 1)
        ? 'without THE HOST ROAD a wayline takes one body at a time, whatever is selected'
        : `!! TIER ONE MOVED ${moved1} (party ${n1})`;

      /* put them all back and widen the road */
      for (const c of [worker, mate1, mate2]) { c.x = A.x + 1; c.y = A.y + 1; c.floor = 0; }
      rebuildCharGrid();
      research.done.wayline_host = true;
      /* one of them is hauling something heavy, which is the chore this is meant to answer */
      const load = makeChar('Probe Burden', 'bandit', A.x + 1, A.y + 1, {atk: 1, def: 1, tough: 5});
      load.__probe = true; load.state = 'dead'; load.floor = 0; chars.push(load);
      mate1.carry = load;
      selected = [worker, mate1, mate2];
      waylineCross(A, B);
      const moved2 = [worker, mate1, mate2].filter(c => dist(c.x, c.y, B.x, B.y) < 8).length;
      R.theHostRoadCrossesTheSquad = moved2 === 3
        ? 'and with it the whole selection crosses at once — three of three'
        : `!! THE HOST ROAD MOVED ${moved2} OF 3`;
      R.whatTheyCarryCrosses = dist(load.x, load.y, B.x, B.y) < 8
        ? 'and the body one of them was hauling arrives with them, which is a morning of walking a Sixfold does not have to cost any more'
        : `!! THE LOAD WAS LEFT BEHIND (${Math.round(dist(load.x, load.y, B.x, B.y))} tiles from the far stone)`;
      mate1.carry = null;
    });

    guard(['aFightIsNotCrossedOutOf'], () => {
      const worker = mk('Probe Adept 2', 'destruction');
      worker.x = A.x + 1; worker.y = A.y + 1;
      const scared = mk('Probe Hunted', null);
      scared.x = A.x + 1; scared.y = A.y + 1;
      const foe = makeChar('Probe Raider', 'bandit', A.x + 3, A.y + 1, {atk: 8, def: 5, tough: 12});
      foe.__probe = true; foe.floor = 0; chars.push(foe);
      rebuildCharGrid();
      applyDamage(foe, scared, 'chest', 2, 'slash', false, false, true, 0);
      selected = [worker, scared];
      const no = waylineRefusal(A, B, waylineParty(A));
      const crossed = waylineCross(A, B);
      R.aFightIsNotCrossedOutOf = (!crossed && no && /fight/.test(no))
        ? `a body that has just been hit cannot be crossed — "${no}" — so a losing fight is not a button`
        : `!! A WAYLINE IS AN ESCAPE HATCH (crossed ${crossed}, refusal ${no || 'none'})`;
      for (const c of [worker, scared]) { c.x += 400; c.threatT = 0; }
      foe.x += 400; rebuildCharGrid();
    });

    guard(['itCrossesStoreys'], () => {
      const down = mkWay(gx, gy, -1);
      const worker = mk('Probe Delver', 'dark');
      worker.x = A.x + 1; worker.y = A.y + 1; worker.floor = 0;
      rebuildCharGrid();
      selected = [worker];
      research.done.wayline_host = true;
      const ok = waylineCross(A, down);
      R.itCrossesStoreys = (ok && (worker.floor || 0) === -1)
        ? 'a wayline laid underground is a wayline: the crossing carries the storey, not just the tile'
        : `!! IT DOES NOT CROSS STOREYS (crossed ${ok}, floor ${worker.floor})`;
      worker.x += 400; worker.floor = 0; rebuildCharGrid();
    });

    guard(['itRidesTheSave'], () => {
      const before = waylines().length;
      const snap = snapshot();
      restore(snap);
      const after = waylines().length;
      R.itRidesTheSave = after === before
        ? `${after} wayline circles survive a save and a load, and still answer each other`
        : `!! THE WAYLINES DO NOT SURVIVE A SAVE (${before} -> ${after})`;
    });

    guard(['itIsNotABindingCircle'], () => {
      /* THE NOTE ASKS FOR THIS IN SO MANY WORDS — "similar in shape to the binding circle, but
         we'll need to find a way to make it distinct". Asked of the built geometry: how many
         objects each puts on the ground, and whether they share a colour. */
      const rig = (type) => {
        const bl = {type, x: gx + 60, y: gy + 60, w: 2, h: 2, floor: 0, progress: 1};
        const before = scene.children.length;
        rebuildBuildings();
        const cols = new Set();
        let n = 0;
        scene.traverse(o => { if (o.material && o.material.color) { cols.add(o.material.color.getHexString()); n++; } });
        return {cols, n};
      };
      /* simpler and more honest: compare the authored colours the two branches use */
      const src = document.documentElement.innerHTML;
      const way = /b\.type==='way'\)\{([\s\S]{0,1200}?)\n      \}/.exec(src);
      const circ = /b\.type==='circle'\)\{([\s\S]{0,600}?)\n      \}/.exec(src);
      const hex = (t) => new Set((t || '').match(/0x[0-9a-f]{6}|#[0-9a-f]{6}/gi) || []);
      const wc = hex(way && way[1]), cc = hex(circ && circ[1]);
      const shared = [...wc].filter(h => cc.has(h));
      R.itIsNotABindingCircle = (wc.size >= 3 && cc.size && shared.length === 0)
        ? `the two circles share no colour at all — the wayline is ${wc.size} tones of cut stone and cold light, the binding circle ${cc.size} of chalk and violet`
        : `!! THEY LOOK ALIKE (wayline ${wc.size} colours, circle ${cc.size}, ${shared.length} shared)`;
    });

    for (const [c, x, y] of away) { c.x = x; c.y = y; }
    for (let i = chars.length - 1; i >= 0; i--) if (chars[i].__probe) chars.splice(i, 1);
    for (let i = pBuilds.length - 1; i >= 0; i--) if (pBuilds[i].__probe) pBuilds.splice(i, 1);
    rebuildCharGrid();
    return R;
  });

  console.log('=== THE BONES OF A DEAD GOD, AND A ROAD NOBODY WALKS ===\n');
  for (const [k, v] of Object.entries(out)) console.log('  ' + k.padEnd(28) + v);
  const bad = Object.values(out).map(String).filter(v => v.startsWith('!!'));
  if (errs.length) { console.log(''); errs.slice(0, 4).forEach(e => console.log('  ' + e)); }
  console.log('\n' + (bad.length || errs.length
    ? '*** ' + [...bad, ...errs].join('\n*** ')
    : 'THE MARROW IS SPENT AND THE ROAD ANSWERS'));
  await b.close();
  process.exit(bad.length || errs.length ? 1 : 0);
})();
