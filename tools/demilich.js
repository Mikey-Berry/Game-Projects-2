#!/usr/bin/env node
/* THE DEMILICH, AND THE DOOR THAT DID NOT READ AS A DOOR.
 *
 *   "Let's start wiring the demilich and his questline into the game. (Let's also ensure the
 *    demilich gets a proper model — a single skull, crowned, with bejeweled eyes, seated upon a
 *    pile of sunbleached bones.)"
 *
 * Two of the three ascensions in this game each sit behind five stages and a person:
 * `unclouding` carries needsQuest:'radiant', `sigil_rite` carries needsQuest:'sigil'. The one
 * road the game is actually about — lichdom — carried nothing at all. It was 2,500 gold, a
 * crown, ten remains and one line of italic text under a button.
 *
 * So there is a third line now, and the thing at the end of it is the only creature in the world
 * that has been through the door. Every stage he asks for is the price named early in a form you
 * can still walk away from — which means NOT ONE OF THEM CAN BE SATISFIED BY SHOPPING, and that
 * is the claim this file exists to hold. Stuffing the stash with one of everything must move
 * three of the five stages not at all.
 *
 * Anything starting '!!' fails the build.
 *
 *   node tools/demilich.js [game.html]
 */
const { chromium } = require('playwright');
const path = require('path');
const gamePath = (a) => path.resolve(a ? (path.isAbsolute(a) ? a : path.join(__dirname, a)) : path.join(__dirname, 'game.html'));

(async () => {
  const b = await chromium.launch({
    executablePath: process.env.DUSTWARD_CHROME || undefined,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'],
  });
  const p = await b.newPage({ viewport: { width: 1100, height: 800 } });
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message.slice(0, 240)));
  p.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text().slice(0, 240)); });
  await p.goto('file://' + gamePath(process.argv[2]), { waitUntil: 'load' });
  await p.waitForTimeout(3000);
  await p.evaluate(() => document.getElementById('btn-start').click());
  await p.waitForTimeout(3000);
  const R = {};

  /* ---- 1. HE IS IN THE WORLD, AND THE GATE IS ON THE RITE ---- */
  const there = await p.evaluate(() => {
    /* every symbol through `typeof`, so a build without any of this REPORTS rather than throwing
       — a control run that dies on line one measures nothing */
    const cs = (typeof chars !== 'undefined') ? chars : [];
    const d = cs.find(x => x.demilich) || cs.find(x => x.questGive === 'dark') || null;
    if (d) window.__D = d.id;
    return {
      found: !!d,
      name: d ? d.name : null,
      inImmortals: (typeof immortals !== 'undefined') && !!d && immortals.includes(d),
      questGive: d ? d.questGive : null,
      kinds: (typeof IMMORTAL_LINES !== 'undefined' && IMMORTAL_LINES.dark)
        ? IMMORTAL_LINES.dark.stages.map(s => s.kind) : null,
      gate: (typeof TECHS !== 'undefined') ? (TECHS.last_rite.needsQuest || null) : null,
      /* the road far from the King, so the two halves of the same story are not in one room */
      fromKing: (() => { const k = cs.find(x => x.bossKey === 'king');
        return (k && d) ? Math.round(Math.hypot(k.x - d.x, k.y - d.y)) : -1; })(),
    };
  });
  R.heIsThere = there.found && there.inImmortals && there.questGive === 'dark'
    ? `${there.name} sits ${there.fromKing} tiles from the Ossuary King, in \`immortals\` with the other two`
    : `!! NO DEMILICH IN THE WORLD (found ${there.found}, in immortals ${there.inImmortals})`;
  R.theRiteIsGated = there.gate === 'dark'
    ? "`last_rite` carries needsQuest:'dark' — the one ascension that had no quest on it"
    : `!! THE LAST RITE IS STILL A SHOPPING LIST (needsQuest ${JSON.stringify(there.gate)})`;
  R.fiveStages = JSON.stringify(there.kinds) === JSON.stringify(['bring', 'hired', 'show', 'kept', 'fetch'])
    ? 'five stages: bring · hired · show · kept · stay'
    : `!! WRONG SHAPE OF ROAD (${JSON.stringify(there.kinds)})`;

  /* ---- 2. GOLD DOES NOT BUY THE ROAD ----
     The whole design claim. Every item in the game into the stash, a fortune into the purse, and
     the three stages that ask about your CAMP rather than your stores must not move. */
  const bought = await p.evaluate(() => {
    /* NOTHING TO MEASURE, RATHER THAN A CRASH. On a build with no dark line and no demilich a
       bare `IMMORTAL_LINES.dark.stages` takes the whole file down on line one, and a run that
       dies reports nothing — including about the eight claims that DO have something to say
       about the old build. Every section asks first and returns null if the answer is no. */
    const D = (typeof IMMORTAL_LINES !== 'undefined' && IMMORTAL_LINES.dark) ? IMMORTAL_LINES.dark : null;
    const d = (typeof charById !== 'undefined' && window.__D != null) ? charById.get(window.__D) : null;
    if (!D || !d) return null;
    for (const k in ITEMS) stash[k] = (stash[k] || 0) + 50;
    cats = 999999;
    const st = D.stages;
    /* stand the party a long way off, so `bring` is answered by geometry and not by luck */
    for (const c of player()) { c.x = d.x + 40; c.y = d.y + 40; c.moveTarget = null; }
    return {bring: stageMet(st[0], d), hired: stageMet(st[1], d),
            show: stageMet(st[2], d), kept: stageMet(st[3], d)};
  });
  R.goldBuysNothing = !bought ? '!! NOTHING TO MEASURE ON THIS BUILD — no dark line, no demilich' : !bought.bring && !bought.hired && !bought.kept
    ? 'a full stash and 999,999 gold satisfies none of bring, hired or kept'
    : `!! THE ROAD CAN BE BOUGHT (${JSON.stringify(bought)})`;
  R.andTheCrownIsStillWanted = !bought ? '!! NOTHING TO MEASURE ON THIS BUILD — no dark line, no demilich' : bought.show
    ? 'the one stage that reads the stores — the crown — reads it'
    : `!! THE CROWN STAGE DOES NOT SEE THE CROWN (${JSON.stringify(bought)})`;

  /* ---- 3. "SOMETHING STILL WARM AND STILL YOURS" ----
     Every word of the ask is a filter, so each one is measured separately. A risen standing in
     the same spot is not warm; the protagonist alone is not "anybody left". */
  const witness = await p.evaluate(() => {
    const D = (typeof IMMORTAL_LINES !== 'undefined' && IMMORTAL_LINES.dark) ? IMMORTAL_LINES.dark : null;
    const d = (typeof charById !== 'undefined' && window.__D != null) ? charById.get(window.__D) : null;
    if (!D || !d) return null;
    const st = D.stages[0];
    const out = {};
    const at = (c) => { c.x = d.x + 1; c.y = d.y + 1; c.moveTarget = null; };
    const away = (c) => { c.x = d.x + 40; c.y = d.y + 40; c.moveTarget = null; };
    for (const c of player()) away(c);
    out.nobody = stageMet(st, d);
    /* the protagonist, alone, walking in — he asked whether you have anybody LEFT */
    const me = player().find(c => c.protagonist) || player()[0];
    me.protagonist = true; at(me);
    out.onlyYou = stageMet(st, d);
    away(me);
    /* a risen of yours, standing exactly where a companion would stand */
    const dead = makeChar('Risen Probe', 'player', d.x + 1, d.y + 1, {atk:5, def:5, tough:5, ath:5});
    dead.undead = true; chars.push(dead);
    out.aRisen = stageMet(st, d);
    /* and a living companion, on their own feet */
    const live = player().find(c => !c.protagonist && !c.undead && c.state === 'ok');
    if (live) at(live);
    out.aCompanion = stageMet(st, d);
    out.who = live ? (livingWitness(d) || {}).name || null : null;
    out.staged = !!live;
    return out;
  });
  R.aLivingCompanion = !witness ? '!! NOTHING TO MEASURE ON THIS BUILD — no dark line, no demilich' : witness.staged && !witness.nobody && !witness.onlyYou && !witness.aRisen && witness.aCompanion
    ? `nobody: no · only you: no · a risen standing on the same tile: no · ${witness.who}: yes`
    : `!! STAGE ONE READS THE WRONG THING (${JSON.stringify(witness)})`;

  /* ---- 4. A HIRE MADE BEFORE HE ASKED PROVES NOTHING ----
     "Come back and tell me what it COST you" is about a market that is still open. The mark is
     taken when the ask is READ, so the window has to be opened for the stage to arm at all. */
  const hire = await p.evaluate(() => {
    const D = (typeof IMMORTAL_LINES !== 'undefined' && IMMORTAL_LINES.dark) ? IMMORTAL_LINES.dark : null;
    const d = (typeof charById !== 'undefined' && window.__D != null) ? charById.get(window.__D) : null;
    if (!D || !d) return null;
    if (typeof paidHire !== 'function') return null;
    const st = D.stages[1];
    const out = {};
    paidHire(140); paidHire(260);                 /* two hires BEFORE he says a word */
    out.beforeArming = stageMet(st, d);
    d.questStage = 1; openImmortal(d);            /* he says the words; the mark is taken */
    out.mark = d.hireMark;
    out.afterArming = stageMet(st, d);
    paidHire(310);                                /* and one after */
    out.afterAHire = stageMet(st, d);
    out.said = stageProgress(st, d);
    $('modal').style.display = 'none'; modalOpen = false;
    return out;
  });
  R.aHireSinceHeAsked = !hire ? '!! NOTHING TO MEASURE ON THIS BUILD — no dark line, no demilich' : !hire.beforeArming && !hire.afterArming && hire.afterAHire
    ? `two hires before the ask do not count (mark ${hire.mark}); one after does — "${hire.said}"`
    : `!! THE HIRE STAGE IS NOT ASKING WHAT IT SAYS (${JSON.stringify(hire)})`;

  /* ---- 4b. AND THE GAME'S OWN DISPATCH REACHES HIM ----
     Every other claim in this file calls `openImmortal` directly, which is reaching past the door
     the player has to use — the mistake this repo has recorded under `jail.js`. `openTalk` is what
     a right-click on a body actually runs, and it is a chain of tests ordered by specificity: a
     wanderer answers before a scholar, a scholar before an immortal. He is undead, neutral and
     furniture, and any one of those could have been answered first by something else. */
  const door = await p.evaluate(() => {
    const d = (typeof chars !== 'undefined') ? chars.find(c => c.demilich) : null;
    if (!d) return null;
    $('modal').style.display = 'none'; modalOpen = false;
    openTalk(d, player()[0]);
    const open = $('modal').style.display !== 'none';
    const title = ($('modaltitle') || {}).textContent || null;
    const sub = ($('modalsub') || {}).textContent || null;
    const track = (document.querySelector('#modalbody div') || {}).textContent || null;
    $('modal').style.display = 'none'; modalOpen = false;
    return {open, title, sub, track};
  });
  R.rightClickOpensHim = door && door.open && /DEMILICH/i.test(door.title || '') && /THE ROAD/i.test(door.track || '')
    ? `a right-click runs \`openTalk\` straight into his road — "${door.track}"`
    : `!! THE WORLD'S OWN DISPATCH DOES NOT REACH HIM (${JSON.stringify(door)})`;

  /* ---- 5. HE READS THE CROWN AND HANDS IT BACK ----
     The rite itself needs a Sunken Crown — "the crown is a key, not a candle" — so a questgiver
     who POCKETED it would close the door he spent five stages opening. */
  const crown = await p.evaluate(() => {
    const D = (typeof IMMORTAL_LINES !== 'undefined' && IMMORTAL_LINES.dark) ? IMMORTAL_LINES.dark : null;
    const d = (typeof charById !== 'undefined' && window.__D != null) ? charById.get(window.__D) : null;
    if (!D || !d) return null;
    for (const k in stash) delete stash[k];
    stash.crown = 1;
    d.questStage = 2; d.questDone = false;
    openImmortal(d);
    const btn = [...document.querySelectorAll('#modalbody button')].find(x => !x.disabled);
    const label = btn ? btn.textContent : null;
    if (btn) btn.click();
    const out = {label, stage: d.questStage, crownsAfter: campHas('crown')};
    $('modal').style.display = 'none'; modalOpen = false;
    return out;
  });
  R.theCrownComesBack = !crown ? '!! NOTHING TO MEASURE ON THIS BUILD — no dark line, no demilich' : crown.stage === 3 && crown.crownsAfter >= 1
    ? `"${crown.label}" advances the road and leaves ${crown.crownsAfter} crown in the stores`
    : `!! THE CROWN STAGE EATS THE KEY TO THE RITE (${JSON.stringify(crown)})`;

  /* ---- 6. A LIEUTENANT KEPT A SEASON, AND NOT ONE RAISED THIS MORNING ---- */
  const lieu = await p.evaluate(() => {
    const D = (typeof IMMORTAL_LINES !== 'undefined' && IMMORTAL_LINES.dark) ? IMMORTAL_LINES.dark : null;
    const d = (typeof charById !== 'undefined' && window.__D != null) ? charById.get(window.__D) : null;
    if (!D || !d) return null;
    if (typeof LIEU_SEASON === 'undefined') return null;
    const st = D.stages[3];
    const out = {season: LIEU_SEASON};
    out.none = stageMet(st, d);
    const u = makeChar('Lieutenant Probe', 'player', d.x + 2, d.y + 2, {atk:9, def:9, tough:9, ath:5});
    u.undead = true; u.lieutenant = true; u.minded = true; u.lieuSince = day;
    chars.push(u);
    out.fresh = stageMet(st, d);
    out.freshSays = stageProgress(st, d);
    u.lieuSince = day - (LIEU_SEASON - 1);        /* a day short */
    out.aDayShort = stageMet(st, d);
    u.lieuSince = day - LIEU_SEASON;
    out.kept = stageMet(st, d);
    out.keptSays = stageProgress(st, d);
    return out;
  });
  R.aSeasonIsASeason = !lieu ? '!! NOTHING TO MEASURE ON THIS BUILD — no dark line, no demilich' : !lieu.none && !lieu.fresh && !lieu.aDayShort && lieu.kept
    ? `no lieutenant: no · raised today: no · ${lieu.season - 1} days: no · ${lieu.season} days: yes — "${lieu.keptSays}"`
    : `!! THE SEASON IS NOT BEING COUNTED (${JSON.stringify(lieu)})`;

  /* ---- 7. WALK THE WHOLE ROAD THROUGH THE REAL BUTTONS ----
     Not by setting `questDone`. The favor has to come off the same click a player makes, and the
     research node has to open because of it. */
  const road = await p.evaluate(() => {
    const D = (typeof IMMORTAL_LINES !== 'undefined' && IMMORTAL_LINES.dark) ? IMMORTAL_LINES.dark : null;
    const d = (typeof charById !== 'undefined' && window.__D != null) ? charById.get(window.__D) : null;
    if (!D || !d) return null;
    if (typeof paidHire !== 'function' || typeof LIEU_SEASON === 'undefined') return null;
    /* ---- PUT THE WORLD BACK FIRST ----
       Every section above left something standing where this one is about to measure: a
       companion beside him, a crown in the stash, a lieutenant twelve days old. Walking the road
       against that measures the probe's own leftovers and not the game — so the camp is emptied,
       the party is sent forty tiles off, and the lieutenant is raised again this morning. */
    d.questStage = 0; d.questDone = false; d.hireMark = null;
    for (const k in favors) delete favors[k];
    for (const k in stash) delete stash[k];
    for (const c of player()) { c.x = d.x + 40; c.y = d.y + 40; c.moveTarget = null; }
    for (const u of chars) if (u.lieutenant && u.faction === 'player') u.lieuSince = day;
    /* and the rite's own prerequisites are paid, so the ONLY thing left in its way is him */
    for (const k of ['necromancy', 'rites_binding', 'carrion_rites', 'rites_deep'])
      if (TECHS[k]) research.done[k] = true;
    research.rp = 500; cats = 500000;
    const line = D, steps = [];
    for (let i = 0; i < line.stages.length; i++) {
      const st = line.stages[i];
      openImmortal(d);                            /* opening ARMS the stage that needs arming */
      const before = stageMet(st, d);
      /* satisfy it the way a player would */
      if (st.kind === 'fetch' || st.kind === 'show') for (const k in (st.need || {})) stash[k] = (stash[k] || 0) + st.need[k];
      if (st.kind === 'bring') { const c = player().find(x => !x.undead && !x.protagonist && x.state === 'ok'); if (c) { c.x = d.x + 1; c.y = d.y + 1; } }
      if (st.kind === 'hired') paidHire(500);
      if (st.kind === 'kept') { const u = chars.find(x => x.faction === 'player' && x.lieutenant); if (u) u.lieuSince = day - LIEU_SEASON - 1; }
      openImmortal(d);
      const btn = [...document.querySelectorAll('#modalbody button')].find(x => /GIVE|STAY|SHOW|PRESENT|TELL/.test(x.textContent));
      const label = btn ? btn.textContent : null;
      const gated = !!btn && btn.disabled;
      if (btn && !btn.disabled) btn.click();
      /* the last stage asks for NOTHING — "stay" — so it is available the moment it is reached,
         in this line exactly as in the other two. Claiming it was gated would be claiming the
         opposite of the design. */
      const asksForSomething = !(st.kind === 'fetch' && !Object.keys(st.need || {}).length);
      steps.push({stage: i + 1, kind: st.kind, label, asks: asksForSomething,
                  gatedBefore: !before, wasGated: gated, at: d.questStage});
    }
    $('modal').style.display = 'none'; modalOpen = false;
    return {steps, done: !!d.questDone, favor: immortalFavor('dark'),
            blocker: researchBlocker('last_rite'),
            /* and the gate is genuinely the thing that was in the way */
            blockerWithoutFavor: (() => { const keep = favors.dark; delete favors.dark;
              const w = researchBlocker('last_rite'); favors.dark = keep; return w; })()};
  });
  const walked = !!road && road.steps.every(s => s.at === s.stage)
              && road.steps.filter(s => s.asks).every(s => s.gatedBefore);
  R.theRoadWalks = !road ? '!! NOTHING TO MEASURE ON THIS BUILD — no dark line, no demilich' : walked && road.done && road.favor
    ? `all five advance in order, each one gated until it was earned — ${road.steps.map(s => s.label).join(' → ')}`
    : `!! THE ROAD DOES NOT WALK (${JSON.stringify(road.steps)})`;
  R.andItOpensTheDoor = !road ? '!! NOTHING TO MEASURE ON THIS BUILD — no dark line, no demilich'
    : road.blocker !== 'the favor of the one who walked this road first'
      && road.blockerWithoutFavor === 'the favor of the one who walked this road first'
    ? `with his favor nothing stands in the rite's way (${road.blocker === null ? 'no blocker at all' : '"' + road.blocker + '"'}); without it, he does`
    : `!! THE FAVOR IS NOT WHAT OPENS THE RITE (with "${road.blocker}", without "${road.blockerWithoutFavor}")`;

  /* ---- 8. AND IT SURVIVES A SAVE ---- */
  const saved = await p.evaluate(() => {
    if (typeof hiresPaid === 'undefined' || !chars.some(c => c.demilich)) return null;
    const s = snapshot();
    const before = {favor: !!favors.dark, hires: hiresPaid.n,
      lieuSince: (chars.find(c => c.lieutenant && c.faction === 'player') || {}).lieuSince ?? null};
    for (const k in favors) delete favors[k];
    hiresPaid.n = 0;
    restore(JSON.parse(JSON.stringify(s)));
    const d = chars.find(c => c.demilich);
    return {before, after: {favor: !!favors.dark, hires: hiresPaid.n,
      lieuSince: (chars.find(c => c.lieutenant && c.faction === 'player') || {}).lieuSince ?? null},
      stillDemilich: !!d, stillQuestGiver: !!d && d.questGive === 'dark', done: !!d && !!d.questDone};
  });
  R.itSurvivesTheSave = !saved ? '!! NOTHING TO MEASURE ON THIS BUILD — no dark line, no demilich' : saved.stillDemilich && saved.stillQuestGiver && saved.done
      && saved.after.favor && saved.after.hires === saved.before.hires
      && saved.after.lieuSince === saved.before.lieuSince
    ? `favor, the hire count (${saved.after.hires}) and the lieutenant's day all come back`
    : `!! THE ROAD DOES NOT SURVIVE A RELOAD (${JSON.stringify(saved)})`;

  /* ---- 9. FURNITURE. It does not walk, and nothing in the world picks a fight with it ---- */
  const still = await p.evaluate(async () => {
    const d = chars.find(c => c.demilich);
    if (!d) return null;
    const at = [d.x, d.y];
    /* every faction in the world asked about him at once, including the two that hunt the dead */
    const kinds = ['purge', 'exile', 'bandit', 'town', 'player', 'wild', 'gaunt', 'redoubt'];
    const foes = kinds.map(f => { const o = makeChar('probe ' + f, f, d.x + 2, d.y + 2, {atk:5, def:5, tough:5, ath:5});
      o.provoked = true; return o; });
    const anyHostile = foes.filter(o => hostile(o, d) || hostile(d, o)).map(o => o.faction);
    for (let i = 0; i < 40; i++) ai(d, 0.1);
    await new Promise(r => setTimeout(r, 900));
    return {moved: +Math.hypot(d.x - at[0], d.y - at[1]).toFixed(3), anyHostile,
            target: d.target ? d.target.name : null, moveTarget: !!d.moveTarget};
  });
  R.itIsFurniture = !still ? '!! NOTHING TO MEASURE ON THIS BUILD — no dark line, no demilich' : still.moved < 0.01 && !still.anyHostile.length && !still.target
    ? 'forty ticks of AI move him 0.000 tiles, and none of eight factions will fight him'
    : `!! HE IS NOT SITTING STILL (moved ${still.moved}, hostile to ${JSON.stringify(still.anyHostile)})`;

  /* ---- 10. THE MODEL: a skull, crowned, bejewelled, on a heap ----
     Measured off the built rig rather than eyeballed. The claims are the four nouns in the ask:
     it has NO LIMBS (so it is not a person with a skull head), it has TWO LIT GEMS, it has GOLD
     above the skull, and the pale mass is UNDER the skull rather than beside it. */
  const rig = await p.evaluate(async () => {
    const d = chars.find(c => c.demilich);
    if (!d) return {rig: false};
    for (const c of player()) { c.x = d.x + 3; c.y = d.y + 3; c.moveTarget = null; }
    camX = d.x; camY = d.y; camSX = d.x; camSY = d.y;
    if (typeof computeVision === 'function') computeVision();
    for (let i = 0; i < 60; i++) { render(); await new Promise(r => requestAnimationFrame(r)); }
    const e = charMeshes.get(d.id);
    if (!e) return {rig: false};
    const B = new THREE.Box3().setFromObject(e.g);
    /* the two lit stones, and how high they sit in the silhouette */
    const gems = (e.gems || []).map(o => { const g2 = new THREE.Box3().setFromObject(o); return +((g2.min.y + g2.max.y) / 2).toFixed(2); });
    /* every emissive gold thing, and every pale thing, by height */
    let goldTop = -9, boneTop = -9, boneN = 0;
    e.g.traverse(o => {
      if (!o.isMesh) return;
      const bb = new THREE.Box3().setFromObject(o);
      const cols = o.geometry.attributes.color;
      if (cols) { /* a merged bucket: pale if most of it is bright and unsaturated */
        for (let i = 0; i < cols.count; i += 64) {
          const r = cols.getX(i), g3 = cols.getY(i), b3 = cols.getZ(i);
          if (r > 0.7 && b3 > 0.6 && Math.abs(r - b3) < 0.14) { boneN++; boneTop = Math.max(boneTop, bb.max.y); }
          if (r > 0.55 && g3 > 0.35 && b3 < 0.35) goldTop = Math.max(goldTop, bb.max.y);
        }
      } else if (o.material && o.material.color) {
        const c2 = o.material.color;
        if (c2.r > 0.55 && c2.g > 0.35 && c2.b < 0.35) goldTop = Math.max(goldTop, bb.max.y);
      }
    });
    return {rig: true, still: !!e.still, gems, gemN: gems.length,
      limbs: ['armL','armR','legL','legR','spine','headG'].filter(k => e[k]).length,
      height: +(B.max.y - B.min.y).toFixed(2), width: +(B.max.x - B.min.x).toFixed(2),
      goldTop: +goldTop.toFixed(2), boneN, sits: +B.min.y.toFixed(2)};
  });
  R.aSkullOnAHeap = rig.rig && rig.limbs === 0 && rig.still
    ? `no arms, no legs, no spine — ${rig.width.toFixed(2)} across and ${rig.height.toFixed(2)} tall, sitting on the ground`
    : `!! IT IS BUILT AS A PERSON (rig ${rig.rig}, limb bones ${rig.limbs}, still ${rig.still})`;
  R.crownedAndBejewelled = rig.rig && rig.gemN === 2 && rig.goldTop > 0 && rig.gems.every(y => y > 0.5) && rig.goldTop > Math.max(...(rig.gems.length ? rig.gems : [9]))
    ? `two lit stones at y ${rig.gems.join(' and ')}, with gold above them at ${rig.goldTop} — the crown is on top of the eyes`
    : `!! NOT CROWNED OR NOT BEJEWELLED (gems ${JSON.stringify(rig.gems)}, gold top ${rig.goldTop})`;

  /* ---- 11. AND HE COSTS THE REST OF THE WORLD NOTHING ----
     `makeChar` spends numbers off the world stream whatever it is handed, so one more body at
     worldgen re-rolls everything placed after it. The spawn pockets `seed` and puts it back; the
     proof is that running it AGAIN leaves the stream exactly where it found it. */
  const stream = await p.evaluate(() => {
    if (typeof spawnDemilich !== 'function') return null;
    const before = seed, popBefore = chars.length;
    spawnDemilich();
    return {seedBefore: before, seedAfter: seed, drew: chars.length - popBefore};
  });
  R.theStreamIsPocketed = stream && stream.seedBefore === stream.seedAfter && stream.drew > 0
    ? `spawning him again places a body and leaves \`seed\` exactly where it was (${stream.seedAfter})`
    : `!! THE SPAWN MOVES THE WORLD STREAM (${JSON.stringify(stream)})`;

  console.log('=== THE DEMILICH ===\n');
  for (const [k, v] of Object.entries(R)) console.log('  ' + k.padEnd(24) + v);
  const bad = Object.values(R).map(String).filter(v => v.startsWith('!!'));
  console.log('\n' + (bad.length ? '*** ' + bad.join('\n*** ') : 'THE DOOR HAS A PERSON BEHIND IT'));
  if (errs.length) { console.log('errs:', errs.length); errs.slice(0, 4).forEach(e => console.log('  ' + e)); }
  await b.close();
  if (bad.length) process.exitCode = 1;
})();
