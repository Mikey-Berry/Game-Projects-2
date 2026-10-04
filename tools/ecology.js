#!/usr/bin/env node
/* THE WASTE'S OWN BUSINESS (2026-10-02, built 2026-10-04).
 *
 *   "I also like the idea of more ecology and nests players can destroy to prevent respawning.
 *    Dust Hounds should actively hunt the dust elk so that there's a genuine ecosystem going on
 *    here. Striders should play a more active role too."
 *
 *   1. dens: laid in the deep waste, off the roads and well clear of the towns, each with its pack
 *   2. a fed pack leaves the elk alone; a hungry one hunts the herd in its own country, runs one
 *      down and eats at the kill — the carcass keeps its hide and loses its meat — and is fed after
 *   3. an elk bolts from a hunting hound inside ELK_SPOOK_R, and not from a fed one
 *   4. a den whelps its pack back up, a whelp at a time and not while yours are near; dug out
 *      (the order, DEN_WORK seconds) it whelps nothing ever again, and its look changes
 *   4b. a pack that survives its den digs a new one after DEN_REDIG_H, but not past the cap; and
 *      the waste is never emptied of hounds: under HOUND_FLOOR a pack walks in off the edge
 *   5. a herd of two calves back after CALF_H hours; a herd of one does not
 *   6. a strider herd has no home: it walks a leg from wherever it stands, sifts at its end, and
 *      walks the next leg on from there — and it walks slowly
 *   7. striders bear on the move: a young one rides a parent, is put down to walk, starts small
 *      and weak and grows to its parents' size; calves and whelps start small too, and a whelp
 *      does not hunt
 *   8. nothing provokes a strider but a blow: standing beside one turns nobody, striking one turns
 *      its herd on you, it throws at range, and it forgets you once you have gone; hounds leave
 *      striders alone
 *   9. a save keeps the dens, the herds, the packs, who has eaten, and the young
 *
 * Anything starting '!!' fails the build.
 *
 *   node tools/ecology.js [game.html]
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
  await p.goto('file://' + gamePath(process.argv[2]), { waitUntil: 'load', timeout: 90000 });
  await p.waitForSelector('#btn-start', { state: 'attached', timeout: 60000 });
  await p.evaluate(() => { document.getElementById('btn-start').click(); paused = true; });
  await p.waitForTimeout(2600);

  const out = await p.evaluate(() => {
    const R = {};
    paused = true;
    const guard = (keys, fn) => {
      try { fn(); } catch (e) { for (const k of keys) if (R[k] === undefined) R[k] = '!! ' + String(e.message).slice(0, 110).toUpperCase(); }
    };
    if (typeof dens === 'undefined') { R.densStandInTheDeepWaste = '!! THERE ARE NO DENS IN THIS BUILD'; return R; }
    const parkSquad = () => { for (const c of player()) { c.x = 30; c.y = 30; c.floor = 0; c.moveTarget = null; c.target = null; } rebuildCharGrid(); };
    parkSquad();
    const run = (secs) => { for (let i = 0; i < secs * 30; i++) update(1 / 30); };
    /* everything else off a patch of ground, so what is measured is these animals and nothing else */
    const clearAround = (x, y, r, keep) => {
      for (const c of chars) if (c.faction !== 'player' && c.state !== 'dead' && !keep.includes(c) && dist(c.x, c.y, x, y) < r) c.x += 600;
      rebuildCharGrid();
    };

    /* ---------- 1. THE DENS ---------- */
    guard(['densStandInTheDeepWaste'], () => {
      const bad = dens.filter(d => towns.some(t => dist(t.x, t.y, d.x, d.y) < 100) || nearRoad(d.x, d.y, 25) || inHeadland(d.x, d.y));
      const packs = dens.map(d => chars.filter(o => o.denId === d.id && o.state !== 'dead' && o.kin === 'hound' && o.faction === 'wild').length);
      R.densStandInTheDeepWaste = (dens.length >= 3 && !bad.length && packs.every((n, i) => n === dens[i].cap))
        ? `${dens.length} dens in the deep waste, none near a town, a road or the headland, each with its pack of ${packs.join('/')}`
        : `!! ${dens.length} DENS, ${bad.length} MISPLACED, PACKS ${packs.join('/')} AGAINST CAPS ${dens.map(d => d.cap).join('/')}`;
    });

    /* stage a pack and a herd together: the first den, cleared, with one herd brought into its country */
    const dn = dens[0];
    const pack = chars.filter(o => o.denId === dn.id && o.state === 'ok');
    const herdId = chars.find(o => o.kin === 'elk' && o.herd && o.state === 'ok').herd;
    const herd = chars.filter(o => o.herd === herdId && o.state === 'ok');
    clearAround(dn.x, dn.y, 70, [...pack, ...herd]);
    pack.forEach((o, i) => { o.x = dn.x + 2 + i; o.y = dn.y + 2; o.target = null; o.moveTarget = null; });
    herd.forEach((o, i) => { o.x = dn.x + 26 + (i % 3) * 1.5; o.y = dn.y + 4 + Math.floor(i / 3) * 1.5; o.target = null; o.moveTarget = null; });
    rebuildCharGrid();

    /* ---------- 2 and 3. FED, THEN HUNGRY ---------- */
    guard(['aFedPackLeavesTheHerdAlone', 'aHungryPackHuntsEatsAndIsFed', 'theHerdRunsFromAHuntingPack'], () => {
      for (const o of pack) o.fedH = nowH();
      run(8);
      const untouched = herd.every(o => o.state === 'ok') && !pack.some(o => o.hunting) && !hostile(pack[0], herd[0]);
      const spookedFed = herd.some(o => o.fleeT > 0);
      R.aFedPackLeavesTheHerdAlone = (untouched && !spookedFed)
        ? `a pack that has eaten lies up beside a herd twenty-odd tiles off and neither takes any notice of the other`
        : `!! FED PACK: herd untouched ${untouched}, hunting ${pack.some(o => o.hunting)}, hostile ${hostile(pack[0], herd[0])}, herd spooked ${spookedFed}`;
      for (const o of pack) o.fedH = nowH() - PACK_HUNGRY_H - 1;
      let spooked = -1, down = -1, fedAt = -1;
      for (let t = 0; t < 30 * 240; t++) {
        update(1 / 30);
        if (spooked < 0 && herd.some(o => o.fleeT > 0)) spooked = t;
        if (down < 0 && herd.some(o => o.state !== 'ok')) down = t;
        if (pack.some(o => o.state === 'ok' && nowH() - o.fedH < 1)) { fedAt = t; break; }
      }
      const eaten = herd.find(o => o.gnawed);
      R._hunt = `bolted ${(spooked / 30).toFixed(1)}s, one down ${(down / 30).toFixed(1)}s, pack fed ${(fedAt / 30).toFixed(1)}s; carcass ${eaten ? JSON.stringify(eaten.dropItems) : 'none'}`;
      R.aHungryPackHuntsEatsAndIsFed = (down > 0 && fedAt > down && eaten && eaten.state === 'dead' && !eaten.dropItems.meat && eaten.dropItems.hide && !pack.some(o => o.hunting && o.state === 'ok'))
        ? `hungry, the same pack runs one of the herd down (${(down / 30).toFixed(0)}s), eats at the kill, and is fed by ${(fedAt / 30).toFixed(0)}s — and what is left gives hide, the meat went into the pack`
        : `!! ${R._hunt}`;
      R.theHerdRunsFromAHuntingPack = (spooked >= 0 && (down < 0 || spooked <= down))
        ? `and the herd bolted the moment a hunting hound came inside ${ELK_SPOOK_R} tiles, before any of it was caught`
        : `!! THE HERD DID NOT RUN (${R._hunt})`;
    });

    /* ---------- 4. THE DEN ---------- */
    guard(['theDenWhelpsItsPackBack', 'butNotWithYoursStandingThere', 'dugOutItWhelpsNothing'], () => {
      /* one of the pack gone */
      const lost = chars.find(o => o.denId === dn.id && o.state === 'ok');
      lost.state = 'dead'; const ci = chars.indexOf(lost); chars.splice(ci, 1);
      const count = () => chars.filter(o => o.denId === dn.id && o.state === 'ok').length;
      const before = count();
      const adv = (h) => { for (let k = 0; k < h; k++) { hour += 1; while (hour >= 24) { hour -= 24; day++; } ecologyTick(); } };
      /* somebody of yours sitting at the den */
      const me = player()[0];
      me.x = dn.x + 4; me.y = dn.y; rebuildCharGrid();
      _ecoH = null; dn.pupH = nowH() - DEN_PUP_H - 1;
      adv(3);
      const watched = count();
      parkSquad();
      adv(2);
      const whelped = count();
      R.theDenWhelpsItsPackBack = (whelped === before + 1 && whelped <= dn.cap)
        ? `a den one short of its pack whelps one back (${before} → ${whelped} of ${dn.cap})`
        : `!! DEN PACK ${before} → ${whelped} (cap ${dn.cap})`;
      R.butNotWithYoursStandingThere = (watched === before)
        ? 'but not while somebody of yours is standing at it'
        : `!! IT WHELPED WITH YOURS AT THE DOOR (${before} → ${watched})`;
      /* dig it out: the order, as the right-click gives it */
      const hand = player()[0];
      hand.x = dn.x + 3; hand.y = dn.y + 3; hand.state = 'ok';
      clearOrders(hand); hand.denTarget = dn; hand.denT = 0;
      for (const o of chars) if (o.denId === dn.id && o.state === 'ok') o.x += 500;   /* the pack is out, as it would be */
      rebuildCharGrid();
      let tAt = -1;
      for (let t = 0; t < 30 * 30; t++) { update(1 / 30); if (!dn.alive) { tAt = t; break; } }
      const look = dn.live && dn.dead ? (!dn.live.visible && dn.dead.visible) : false;
      for (const o of chars.filter(o => o.denId === dn.id && o.state === 'ok').slice(1)) { const i = chars.indexOf(o); chars.splice(i, 1); }
      const after = count();
      dn.pupH = -1e9; _ecoH = null; parkSquad();
      adv(DEN_PUP_H * 3);
      R.dugOutItWhelpsNothing = (!dn.alive && tAt >= DEN_WORK * 30 - 5 && look && count() === after)
        ? `dug out (${(tAt / 30).toFixed(1)}s of work, the mound gone and the ground fired), it whelps nothing in ${DEN_PUP_H * 3} hours with its pack down to ${after}`
        : `!! DUG ${!dn.alive} AT ${(tAt / 30).toFixed(1)}s, LOOK ${look}, PACK ${after} → ${count()}`;
    });

    /* ---------- 4b. A PACK THAT SURVIVES ITS DEN ---------- */
    guard(['aSurvivingPackDigsAgain', 'butNotPastTheCap', 'andTheyNeverGoExtinct'], () => {
      parkSquad();
      const adv = (h) => { for (let k = 0; k < h; k++) { hour += 1; while (hour >= 24) { hour -= 24; day++; } ecologyTick(); } };
      const live = () => dens.filter(d => d.alive);
      const d2 = live()[0];
      const pk = chars.filter(o => o.denId === d2.id && o.state === 'ok' && o.kin === 'hound').slice(0, 2);
      while (pk.length < 2) pk.push(spawnDenHound(d2));
      pk.forEach((o, i) => { o.young = null; o.x = d2.x + 30 + i; o.y = d2.y + 20; });
      rebuildCharGrid();
      d2.alive = false; denLook(d2);
      const n0 = dens.length;
      _ecoH = null; adv(2);
      const early = dens.length;
      for (const o of pk) o.homelessH = nowH() - DEN_REDIG_H;
      adv(2);
      const nd = dens.length > n0 ? dens[dens.length - 1] : null;
      R.aSurvivingPackDigsAgain = (early === n0 && nd && nd.alive && pk.every(o => o.denId === nd.id && o.squad === nd.squad) && dist(nd.x, nd.y, pk[0].x, pk[0].y) < 80)
        ? `a pack whose den was dug out digs a new one ${DEN_REDIG_H / 24} days later, where it is (${dist(nd.x, nd.y, pk[0].x, pk[0].y).toFixed(0)} tiles off) — not the day it lost the old one`
        : `!! EARLY ${early - n0} NEW, AFTER ${dens.length - n0} NEW, PACK ON ${pk.map(o => o.denId).join('/')}`;
      R._newDen = nd ? { id: nd.id, x: nd.x, y: nd.y } : null;
      /* at the cap: dig out the new one and fill the world to its limit with standing dens */
      const capN = DEN_BASE + DEN_EXTRA;
      const fake = [];
      while (live().length < capN) { const f = makeDen(40 + fake.length * 3, 40, 900 + fake.length); f.alive = true; fake.push(f); }
      const pk2 = chars.filter(o => o.kin === 'hound' && o.state === 'ok' && o.denId === (nd && nd.id)).slice(0, 2);
      if (nd) { nd.alive = false; denLook(nd); const f = makeDen(46 + fake.length * 3, 40, 900 + fake.length); fake.push(f); }
      for (const o of pk2) o.homelessH = nowH() - DEN_REDIG_H - 5;
      const before = dens.length;
      adv(3);
      R.butNotPastTheCap = (dens.length === before)
        ? `but with ${capN} dens standing in the world — ${DEN_EXTRA} more than it began with — a homeless pack does not dig another`
        : `!! IT DUG PAST THE CAP (${before} → ${dens.length})`;
      for (const f of fake) { const i = dens.indexOf(f); if (i >= 0) dens.splice(i, 1); }
      if (nd) { nd.alive = true; denLook(nd); }
      /* the floor: every hound in the world gone, and every den with them (a standing den whelps
         its pack back, which is its own claim above, not this one) */
      const standing = dens.filter(d => d.alive);
      for (const d of standing) d.alive = false;
      for (let i = chars.length - 1; i >= 0; i--) { const o = chars[i]; if (o.kin === 'hound' && o.faction === 'wild') chars.splice(i, 1); }
      rebuildCharGrid();
      ecoState.packIn = undefined;
      _ecoH = null; adv(2);
      const back = chars.filter(o => o.kin === 'hound' && o.faction === 'wild' && o.state === 'ok').length;
      adv(PACK_RETURN_H - 4);
      const notTwice = chars.filter(o => o.kin === 'hound' && o.faction === 'wild' && o.state === 'ok').length;
      for (const d of standing) d.alive = true;
      R.andTheyNeverGoExtinct = (back >= 3 && notTwice === back)
        ? `and with every hound and den in the waste gone, a pack of ${back} walks in off the edge — one, not one an hour — to dig in in its turn`
        : `!! AFTER THE LAST HOUND: ${back} CAME, THEN ${notTwice}`;
    });

    /* ---------- 5. CALVES ---------- */
    guard(['aHerdCalvesBack', 'butAHerdOfOneIsGone'], () => {
      parkSquad();
      const ids = [...new Set(chars.filter(o => o.kin === 'elk' && o.herd && o.state === 'ok').map(o => o.herd))];
      const two = ids[ids.length - 1], one = ids[ids.length - 2];
      const trim = (h, n) => { const m = chars.filter(o => o.herd === h && o.state === 'ok'); for (const o of m.slice(n)) chars.splice(chars.indexOf(o), 1); };
      trim(two, 2); trim(one, 1);
      rebuildCharGrid();
      const n = (h) => chars.filter(o => o.herd === h && o.state === 'ok').length;
      const adv = (h) => { for (let k = 0; k < h; k++) { hour += 1; while (hour >= 24) { hour -= 24; day++; } ecologyTick(); } };
      delete ecoState.calf[two]; delete ecoState.calf[one]; _ecoH = null;
      adv(2);
      const early = n(two);
      adv(CALF_H);
      R.aHerdCalvesBack = (early === 2 && n(two) === 3)
        ? `a herd of two calves one back after ${CALF_H} hours — not the hour its clock starts`
        : `!! HERD OF TWO: ${early} early, ${n(two)} after ${CALF_H}h`;
      R.butAHerdOfOneIsGone = n(one) === 1
        ? 'and a herd hunted down to one stays one'
        : `!! A HERD OF ONE BECAME ${n(one)}`;
    });

    /* ---------- 6. THE MIGRATION ---------- */
    guard(['stridersHaveNoHomeTheyWalkOn', 'andStopToSift', 'andTheyWalkSlowly'], () => {
      parkSquad();
      const h = chars.find(o => o.kin === 'strider' && o.sherd && o.state === 'ok' && o.faction === 'fauna').sherd;
      const mem = chars.filter(o => o.sherd === h && o.state === 'ok');
      clearAround(mem[0].x, mem[0].y, 30, mem);
      delete ecoState.sgz[h]; delete ecoState.sdst[h];
      const p0 = { x: mem[0].x, y: mem[0].y };
      let first = null;
      for (let t = 0; t < 30 * 4 && !first; t++) { update(1 / 30); first = ecoState.sdst[h]; }
      first = first && { ...first };
      const legOut = first ? dist(p0.x, p0.y, first.x, first.y) : -1;
      let arrived = -1;
      for (let t = 0; t < 30 * 300; t++) { update(1 / 30); if ((ecoState.sgz[h] || 0) > nowH()) { arrived = t; break; } }
      const at = { x: mem[0].x, y: mem[0].y };
      /* the next leg starts from where it stopped: skip the sifting and see where it heads */
      ecoState.sgz[h] = 0;
      let second = null;
      for (let t = 0; t < 30 * 4 && !second; t++) { update(1 / 30); second = ecoState.sdst[h]; }
      const leg2 = second ? dist(at.x, at.y, second.x, second.y) : -1;
      const backHome = second ? dist(second.x, second.y, p0.x, p0.y) : -1;
      R._legs = `from ${Math.round(p0.x)},${Math.round(p0.y)}: leg ${legOut.toFixed(0)} tiles, arrived ${(arrived / 30).toFixed(0)}s; next leg ${leg2.toFixed(0)} tiles from where it stopped, ${backHome.toFixed(0)} from where it began`;
      R.stridersHaveNoHomeTheyWalkOn = (legOut >= 95 && legOut <= 165 && arrived > 0 && leg2 >= 95 && leg2 <= 165 && backHome > 60)
        ? `a herd walks a leg of ${legOut.toFixed(0)} tiles from where it stood, and the next one ${leg2.toFixed(0)} on from where it stopped — not back to anywhere it started (${backHome.toFixed(0)} tiles from it)`
        : `!! ${R._legs}`;
      /* sifting: the game's idle milling is not walking on, so the measure is the next point */
      ecoState.sgz[h] = nowH() + 10; ecoState.sdst[h] = null;
      const here = { x: mem[0].x, y: mem[0].y };
      run(26);
      R.andStopToSift = (dist(here.x, here.y, mem[0].x, mem[0].y) < 20 && !ecoState.sdst[h])
        ? `and between legs it stops and sifts — still ${dist(here.x, here.y, mem[0].x, mem[0].y).toFixed(0)} tiles from where it stopped after twenty-six seconds, no next leg chosen`
        : `!! IT WALKED ON WHILE SIFTING: ${dist(here.x, here.y, mem[0].x, mem[0].y).toFixed(1)} tiles, next leg ${JSON.stringify(ecoState.sdst[h])}`;
      const elk = chars.find(o => o.kin === 'elk' && o.state === 'ok' && !o.young);
      const sv = moveSpeed(mem.find(o => !o.young) || mem[0]), ev = moveSpeed(elk);
      R.andTheyWalkSlowly = sv < ev * 0.6
        ? `and they walk slowly — ${sv.toFixed(2)} tiles a second against an elk's ${ev.toFixed(2)}`
        : `!! A STRIDER WALKS ${sv.toFixed(2)} AGAINST AN ELK'S ${ev.toFixed(2)}`;
    });

    /* ---------- 7. THE YOUNG ---------- */
    guard(['stridersBearOnTheMove', 'theYoungIsPutDownSmall', 'andGrowsToItsParents', 'calvesAndWhelpsStartSmall'], () => {
      parkSquad();
      const adv = (h) => { for (let k = 0; k < h; k++) { hour += 1; while (hour >= 24) { hour -= 24; day++; } ecologyTick(); } };
      const h = chars.find(o => o.kin === 'strider' && o.sherd && o.state === 'ok' && o.faction === 'fauna').sherd;
      const mem = () => chars.filter(o => o.sherd === h && o.state === 'ok');
      /* two grown and room */
      for (const o of mem().slice(2)) chars.splice(chars.indexOf(o), 1);
      for (const o of mem()) { o.young = null; o.carrying = null; }
      rebuildCharGrid();
      delete ecoState.sbirth[h]; _ecoH = null;
      adv(2);
      const early = mem().reduce((n, o) => n + ((o.carrying && o.carrying.length) || 0), 0);
      adv(STRIDER_BIRTH_H);
      const parent = mem().find(o => o.carrying && o.carrying.length);
      const key = parent ? colorKeyOf(parent) : '';
      R.stridersBearOnTheMove = (early === 0 && parent && parent.carrying.length === 1 && key.includes('|R1') && mem().length === 2)
        ? `a herd of two bears a young one ${STRIDER_BIRTH_H} hours on, onto a parent's back — carried, drawn there, and not yet a body of its own`
        : `!! EARLY ${early}, CARRIED ${parent ? parent.carrying.length : 0}, KEY ${key.slice(-4)}, BODIES ${mem().length}`;
      const grownOne = mem().find(o => !o.young);
      adv(STRIDER_CARRY_H + 1);
      const kid = mem().find(o => o.young);
      const k0 = kid ? growK(kid) : -1;
      R._kid = kid ? `growth ${k0.toFixed(2)}, atk ${kid.stats.atk} of ${kid.young.st.atk}, blood ${kid.maxBlood} of ${kid.young.bl}` : 'none';
      R.theYoungIsPutDownSmall = (kid && !parent.carrying.length && k0 > 0 && k0 < 0.4 && kid.stats.atk < grownOne.stats.atk * 0.6 && kid.maxBlood < grownOne.maxBlood * 0.6)
        ? `put down after ${STRIDER_CARRY_H} hours, it walks with the herd at a fraction of its parents (${R._kid})`
        : `!! THE YOUNG: ${R._kid}; still carried ${parent ? parent.carrying.length : '?'}`;
      const aim = kid && kid.young ? {atk: kid.young.st.atk, bl: kid.young.bl} : null;
      adv(GROW_H.strider);
      R.andGrowsToItsParents = (kid && aim && !kid.young && kid.stats.atk === aim.atk && kid.maxBlood === aim.bl && Math.abs(kid.maxBlood - grownOne.maxBlood) < 2)
        ? `and in ${GROW_H.strider / 24} days it is grown: the same frame and blood as the ones that carried it`
        : `!! STILL GROWING: ${kid ? JSON.stringify(kid.young) + ' blood ' + kid.maxBlood : 'no young'}`;
      /* a calf, and a whelp */
      const eh = chars.find(o => o.kin === 'elk' && o.herd && o.state === 'ok').herd;
      const calf = spawnElkAt(30, 40, eh, true);
      const dn = dens.find(d => d.alive) || dens[0];
      const whelp = spawnDenHound(dn, true);
      whelp.fedH = nowH() - 100;
      const hunts = houndHunt(whelp, 0.1) || whelp.hunting;
      R.calvesAndWhelpsStartSmall = (calf.young && growK(calf) < 0.05 && calf.maxBlood < 30 && whelp.young && !hunts)
        ? `and a calf comes into the world small (${calf.maxBlood} blood against seventy) as a whelp does, and a hungry whelp tags along rather than hunting`
        : `!! CALF ${calf.maxBlood} ${!!calf.young}, WHELP YOUNG ${!!whelp.young}, HUNTS ${hunts}`;
      for (const o of [calf, whelp]) { const i = chars.indexOf(o); if (i >= 0) chars.splice(i, 1); }
      rebuildCharGrid();
    });

    /* ---------- 8. A STRIDER'S HERD ---------- */
    guard(['standingBesideOneTurnsNobody', 'strikeOneAndTheHerdTurns', 'andItThrowsAtRange', 'andForgetsTheScuffle', 'houndsLeaveStridersAlone'], () => {
      parkSquad();
      const h = chars.find(o => o.kin === 'strider' && o.sherd && o.state === 'ok' && o.faction === 'fauna' && !o.young).sherd;
      const herd = chars.filter(o => o.sherd === h && o.state === 'ok' && !o.young);
      const s = herd[0];
      clearAround(s.x, s.y, 40, herd);
      ecoState.sgz[h] = nowH() + 100; ecoState.sdst[h] = null;
      herd.forEach((o, i) => { o.x = s.x + i * 3; o.y = s.y; o.moveTarget = null; o.target = null; o.provoked = false; o.herdFoe = null; o.herdFoeT = 0; o.fleeT = 0;
        o.blood = o.maxBlood; for (const k in o.parts) o.parts[k].hp = o.parts[k].max; });
      const me = player()[0];
      me.x = s.x - 2.5; me.y = s.y + 0.5; me.state = 'ok'; me.target = null; me.moveTarget = null; rebuildCharGrid();
      run(4);
      R.standingBesideOneTurnsNobody = (!herd.some(o => o.target === me) && !hostile(s, me))
        ? 'one of yours standing two and a half tiles from a strider for four seconds is not turned on: it is a herbivore, and nothing but a blow provokes it'
        : `!! A STRIDER TURNED ON SOMEBODY STANDING BESIDE IT (${herd.filter(o => o.target === me).length})`;
      /* strike one */
      applyDamage(me, s, 'l.leg', 3, 'cut', false, false, true, 0);
      retaliate(s, me);
      const turned = herd.filter(o => o.herdFoe === me && o.target === me).length;
      R.strikeOneAndTheHerdTurns = (turned === herd.length && herd.length >= 2 && hostile(herd[herd.length - 1], me))
        ? `strike one and all ${herd.length} of the herd turn on you`
        : `!! ${turned} OF ${herd.length} TURNED`;
      /* at range: the striker stands back, and the clot comes down on them */
      me.x = s.x - 10; me.y = s.y; rebuildCharGrid();
      projectiles.length = 0;
      let thrown = false, landed = false;
      const hp0 = Object.values(me.parts).reduce((a, q) => a + q.hp, 0);
      for (let t = 0; t < 30 * 5; t++) {
        me.x = s.x - 10; me.y = s.y;
        update(1 / 30);
        if (projectiles.some(q => q.silt && herd.includes(q.caster))) thrown = true;
      }
      landed = Object.values(me.parts).reduce((a, q) => a + q.hp, 0) < hp0;
      R.andItThrowsAtRange = (thrown && landed)
        ? `and slow as it is, at ten tiles it throws: a clot of the silt it sifts, off the feeding tube, and it lands`
        : `!! AT TEN TILES: THROWN ${thrown}, LANDED ${landed}`;
      parkSquad();
      for (const o of herd) o.provoked = true;
      run(25);
      R.andForgetsTheScuffle = herd.every(o => !o.provoked && !(o.herdFoeT > 0) && !hostile(o, me))
        ? 'and a herd forgets the quarrel once the one it was with has gone — it does not cross the map after you'
        : `!! STILL AT IT: provoked ${herd.map(o => o.provoked).join('/')}, foe ${herd.map(o => (o.herdFoeT || 0).toFixed(0)).join('/')}`;
      const hd = chars.find(o => o.kin === 'hound' && o.faction === 'wild' && o.state === 'ok' && !o.young);
      if (hd) { hd.fedH = nowH(); hd.hunting = false; }
      R.houndsLeaveStridersAlone = (hd && !hostile(hd, s))
        ? 'and a pack leaves striders alone: they hunt elk'
        : `!! A HOUND AND A STRIDER ARE ENEMIES ON SIGHT (${hd ? hostile(hd, s) : 'no hound'})`;
    });

    /* ---------- 9. THE SAVE ---------- */
    guard(['andItRidesTheSave'], () => {
      const dug = dens.filter(d => !d.alive).map(d => d.id).join(',');
      const madeId = R._newDen ? R._newDen.id : -1;
      const hd = chars.find(o => o.denId && o.state === 'ok' && o.kin === 'hound');
      hd.fedH = 123.4;
      const eaten = chars.find(o => o.gnawed);
      const elk = chars.find(o => o.kin === 'elk' && o.herd && o.state === 'ok');
      const st = chars.find(o => o.kin === 'strider' && o.sherd && o.state === 'ok');
      const yg = chars.find(o => o.young && o.state === 'ok') || (() => { const c = spawnElkAt(40, 40, 1, true); return c; })();
      const ygB = yg.young.b;
      const ids = { hd: hd.id, ea: eaten ? eaten.id : -1, elk: elk.id, st: st.id, herd: elk.herd, sherd: st.sherd, den: hd.denId, yg: yg.id };
      restore(JSON.parse(JSON.stringify(snapshot())));
      const by = (id) => chars.find(o => o.id === id);
      const h2 = by(ids.hd), e2 = by(ids.elk), s2 = by(ids.st), g2 = by(ids.ea);
      const dug2 = dens.filter(d => !d.alive).map(d => d.id).join(',');
      const made2 = dens.find(d => d.id === madeId);
      const ok = dug2 === dug && dug && h2 && h2.denId === ids.den && h2.squad === dens.find(d => d.id === ids.den).squad && Math.abs(h2.fedH - 123.4) < 0.01
        && e2 && e2.herd === ids.herd && s2 && s2.sherd === ids.sherd && (!eaten || (g2 && g2.gnawed))
        && by(ids.yg) && by(ids.yg).young && by(ids.yg).young.b === ygB
        && (madeId < 0 || (made2 && made2.x === R._newDen.x && made2.alive && made2.mesh));
      R.andItRidesTheSave = ok
        ? `and a save and a load keep it all: den ${dug} still dug out, the pack still its den's and still fed when it was, herds still herds, the eaten carcass still eaten, the young still growing from when it was born, and the den a pack dug in play still standing`
        : `!! AFTER A LOAD: DUG ${dug} → ${dug2}, HOUND ${h2 ? h2.denId + '/' + h2.fedH + '/' + (h2.squad === dens.find(d => d.id === ids.den).squad) : 'missing'}, ELK ${e2 && e2.herd}, STRIDER ${s2 && s2.sherd}, GNAWED ${g2 ? g2.gnawed : 'n/a'}`;
    });

    delete R._newDen;
    return R;
  });

  const bad = Object.values(out).filter(v => typeof v === 'string' && v.startsWith('!!'));
  for (const [k, v] of Object.entries(out)) console.log('  ' + (k.startsWith('_') ? ('· ' + k.slice(1)).padEnd(34) : k.padEnd(34)) + ' ' + v);
  for (const e of errs) console.log('  ' + e);
  console.log('');
  console.log(bad.length || errs.length ? `THE WASTE IS STILL SCENERY (${bad.length + errs.length})`
                                        : 'THE PACKS HUNT, THE HERDS RUN, THE DENS CAN BE DUG OUT, AND THE STRIDERS WALK');
  await b.close();
  process.exit(bad.length || errs.length ? 1 : 0);
})();
