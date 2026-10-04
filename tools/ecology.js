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
 *   5. a herd of two calves back after CALF_H hours; a herd of one does not
 *   6. a strider herd walks its loop, and stops to sift at each point
 *   7. a strider rounds on whatever comes inside STRIDER_SPACE and stabs at it, lets go when it
 *      leaves, and forgets a scuffle once you have gone; one walked past at eight tiles never turns
 *   8. hounds no longer go for striders on sight
 *   9. a save keeps the dens, the herds, the packs and who has eaten
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
    guard(['strideHerdsWalkTheirLoop', 'andStopToSift'], () => {
      parkSquad();
      const h = chars.find(o => o.kin === 'strider' && o.sherd && o.state === 'ok' && o.faction === 'fauna').sherd;
      const mem = chars.filter(o => o.sherd === h && o.state === 'ok');
      const wps = striderRoute(h);
      clearAround(mem[0].x, mem[0].y, 30, mem);
      delete ecoState.sgz[h]; ecoState.swp[h] = 0;
      const p0 = { x: mem[0].x, y: mem[0].y };
      let arrived = -1;
      for (let t = 0; t < 30 * 240; t++) { update(1 / 30); if ((ecoState.sgz[h] || 0) > nowH()) { arrived = t; break; } }
      const walked = dist(p0.x, p0.y, mem[0].x, mem[0].y);
      R.strideHerdsWalkTheirLoop = (wps.length >= 3 && arrived > 0 && ecoState.swp[h] === 1)
        ? `a strider herd walks its loop of ${wps.length} points — ${walked.toFixed(0)} tiles to the first, in ${(arrived / 30).toFixed(0)}s`
        : `!! ROUTE ${wps.length} POINTS, ARRIVED ${arrived}, NEXT ${ecoState.swp[h]}, WALKED ${walked.toFixed(1)}`;
      /* SIFTING IS NOT STANDING STILL: an animal at its grazing mills about a few tiles, which is
         the game's own idle and is right. What it must not do is set off for the next point. So
         the measure is where it is against where it stopped, and against where it goes next. */
      const next = wps[1 % wps.length], here = wps[0];
      const toNext0 = dist(mem[0].x, mem[0].y, next.x, next.y);
      run(26);
      const fromHere = dist(mem[0].x, mem[0].y, here.x, here.y), toNext = dist(mem[0].x, mem[0].y, next.x, next.y);
      R.andStopToSift = (fromHere < 20 && toNext > toNext0 - 6 && ecoState.swp[h] === 1)
        ? `and at each one it stops to sift — still ${fromHere.toFixed(0)} tiles from where it stopped after twenty-six seconds, ${(ecoState.sgz[h] - nowH()).toFixed(0)} hours of it to go — rather than parading on`
        : `!! IT WALKED ON: ${fromHere.toFixed(1)} FROM THE POINT, ${toNext0.toFixed(0)} → ${toNext.toFixed(0)} TO THE NEXT`;
    });

    /* ---------- 7 and 8. A STRIDER'S SPACE ---------- */
    guard(['aStriderRoundsOnWhateverCrowdsIt', 'andLetsGoWhenItLeaves', 'andForgetsTheScuffle', 'walkedPastItNeverTurns', 'houndsLeaveStridersAlone'], () => {
      parkSquad();
      const s = chars.find(o => o.kin === 'strider' && o.sherd && o.state === 'ok' && o.faction === 'fauna');
      clearAround(s.x, s.y, 40, [s]);
      for (const o of chars) if (o.sherd === s.sherd && o !== s) { o.x += 600; }
      ecoState.sgz[s.sherd] = nowH() + 100;           /* hold the herd still for this */
      /* whole, and calm: whatever the earlier claims put it through, this one starts from nothing
         (a strider under a third of its blood runs rather than stabs, which is right, and is not
         what this claim is about) */
      s.moveTarget = null; s.target = null; s.provoked = false; s.crowdT = 0; s.fleeT = 0;
      s.blood = s.maxBlood; for (const k in s.parts) s.parts[k].hp = s.parts[k].max;
      const me = player()[0];
      /* past it at eight tiles */
      me.x = s.x + 8; me.y = s.y; me.state = 'ok'; me.target = null; rebuildCharGrid();
      run(4);
      const pastTurned = !!s.target || s.crowdT > 0;
      R.walkedPastItNeverTurns = !pastTurned
        ? 'a body of yours eight tiles off is never turned on'
        : `!! IT TURNED ON SOMEBODY EIGHT TILES OFF (target ${s.target && s.target.name})`;
      /* inside its space */
      const hp0 = Object.values(me.parts).reduce((a, q) => a + q.hp, 0);
      me.x = s.x + STRIDER_SPACE - 2; me.y = s.y; rebuildCharGrid();
      run(4);
      const hp1 = Object.values(me.parts).reduce((a, q) => a + q.hp, 0);
      R.aStriderRoundsOnWhateverCrowdsIt = (s.crowdedBy === me && s.target === me && hostile(s, me) && hp1 < hp0)
        ? `step inside ${STRIDER_SPACE} tiles and it rounds on you and stabs (${(hp0 - hp1).toFixed(0)} points off in four seconds)`
        : `!! CROWDED BY ${s.crowdedBy && s.crowdedBy.name}, TARGET ${s.target && s.target.name}, HOSTILE ${hostile(s, me)}, HURT ${(hp0 - hp1).toFixed(0)}, FLEE ${(s.fleeT || 0).toFixed(1)}, BLOOD ${s.blood}/${s.maxBlood}, ${dist(s.x, s.y, me.x, me.y).toFixed(1)} APART`;
      me.x = s.x + 40; me.y = s.y; me.target = null; me.moveTarget = null; rebuildCharGrid();
      run(3);
      const letGo = !(s.crowdT > 0) && !s.crowdedBy;
      R.andLetsGoWhenItLeaves = letGo
        ? 'and out of its space again, it lets go'
        : `!! STILL ROUNDED (crowdT ${(s.crowdT || 0).toFixed(1)})`;
      s.provoked = true;                                  /* as if you had hit back, which you would */
      parkSquad();
      run(25);
      R.andForgetsTheScuffle = (!s.provoked && !hostile(s, me))
        ? 'and a scuffle at the edge of a herd is forgotten twenty seconds after you have gone — it does not cross the map after you'
        : `!! STILL PROVOKED ${s.provoked}, HOSTILE ${hostile(s, me)}`;
      /* a fed one: the hours the claims above skipped have made every pack in the world hungry */
      const hd = chars.find(o => o.kin === 'hound' && o.faction === 'wild' && o.state === 'ok');
      if (hd){ hd.fedH = nowH(); hd.hunting = false; }
      R.houndsLeaveStridersAlone = (hd && !hostile(hd, s))
        ? 'and a pack that is not crowding one leaves a strider alone: they hunt elk'
        : `!! A HOUND AND A STRIDER ARE ENEMIES ON SIGHT (${hd ? hostile(hd, s) : 'no hound'})`;
    });

    /* ---------- 9. THE SAVE ---------- */
    guard(['andItRidesTheSave'], () => {
      const dug = dens.filter(d => !d.alive).map(d => d.id).join(',');
      const hd = chars.find(o => o.denId && o.state === 'ok' && o.kin === 'hound');
      hd.fedH = 123.4;
      const eaten = chars.find(o => o.gnawed);
      const elk = chars.find(o => o.kin === 'elk' && o.herd && o.state === 'ok');
      const st = chars.find(o => o.kin === 'strider' && o.sherd && o.state === 'ok');
      const ids = { hd: hd.id, ea: eaten ? eaten.id : -1, elk: elk.id, st: st.id, herd: elk.herd, sherd: st.sherd, den: hd.denId };
      restore(JSON.parse(JSON.stringify(snapshot())));
      const by = (id) => chars.find(o => o.id === id);
      const h2 = by(ids.hd), e2 = by(ids.elk), s2 = by(ids.st), g2 = by(ids.ea);
      const dug2 = dens.filter(d => !d.alive).map(d => d.id).join(',');
      const ok = dug2 === dug && dug && h2 && h2.denId === ids.den && h2.squad === dens.find(d => d.id === ids.den).squad && Math.abs(h2.fedH - 123.4) < 0.01
        && e2 && e2.herd === ids.herd && s2 && s2.sherd === ids.sherd && (!eaten || (g2 && g2.gnawed));
      R.andItRidesTheSave = ok
        ? `and a save and a load keep it all: den ${dug} still dug out, the pack still its den's and still fed when it was, herds still herds, the eaten carcass still eaten`
        : `!! AFTER A LOAD: DUG ${dug} → ${dug2}, HOUND ${h2 ? h2.denId + '/' + h2.fedH + '/' + (h2.squad === dens.find(d => d.id === ids.den).squad) : 'missing'}, ELK ${e2 && e2.herd}, STRIDER ${s2 && s2.sherd}, GNAWED ${g2 ? g2.gnawed : 'n/a'}`;
    });

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
