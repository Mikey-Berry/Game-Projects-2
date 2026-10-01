#!/usr/bin/env node
/* THE COIL, WIDENED.
 *
 * Ruled 2026-09-29: name Har'mageddon by layer; an Appetite that makes wars; witness the cult and
 * either report it or stand at the stone with it; at the Second Fracture the cells rise against
 * their own towns (not the crater); Rubido knows more than he says; an Ouroboros Ring and a
 * Serpent in Ash mark; Maren Tollis. (Kami keeping them out of Fallowend was ruled OUT.)
 *
 *   1. naming by layer: the Order names him Har'mageddon, the sixth-born; the Coil says the
 *      Appetite and the Seventh, and never the name
 *   2. Maren Tollis is a Copperhold speaker, and she has a conversation where the rest bark
 *   3. seeing them at the stone leaves the mark on top of it
 *   4. taken to a seat, the mark arrests the town's cell, and the Coil sends knives a night or
 *      three later
 *   5. or stand at the stone with them: they drill you, the third night they give you the ring,
 *      and in a town they hold the watch looks away for you (short of murder)
 *   6. the ring: every kill in a fight adds to the next blow, and a band under whoever wears it
 *      does not break off
 *   7. the Appetite: fed wars, a cell makes one, with the mark left by the burned wagons; shown
 *      to a seat of either town, the mark ends it
 *   8. the rising: at the Door the cells turn on their own towns, not the crater; a friend of the
 *      stone is not in their way, and anyone else is
 *   9. Rubido talks about it, and never names him
 *  10. all of it survives a save
 *
 * Anything starting '!!' fails the build.
 *
 *   node tools/coil.js [game.html]
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
  await p.goto('file://' + gamePath(process.argv[2]), { waitUntil: 'load', timeout: 120000 });
  await p.waitForSelector('#btn-start', { state: 'attached', timeout: 120000 });
  await p.evaluate(() => { document.getElementById('btn-start').click(); paused = true; });
  await p.waitForFunction(() => { try { return player().length > 0; } catch (e) { return false; } }, null, { timeout: 180000, polling: 1000 });
  await p.waitForTimeout(1500);

  const out = await p.evaluate(() => {
    const R = {};
    paused = true;
    const me = player()[0];
    const heard = [];
    const lg = log; log = (...a) => { heard.push(String(a[0])); return lg(...a); };
    const saidNow = (fn) => { const n = heard.length; fn(); return heard.slice(n).join(' | '); };
    const allText = (tree) => JSON.stringify(Object.values(tree).map(n => typeof n.line === 'function' ? n.line({homeTown: towns[0], maren: true}, me) : n.line));
    const reset = () => { coilExposed = false; coilFriend = false; coilEnemy = false; coilVisits = 0; coilVisitNight = -1; coilHitDay = -1; coilRisen = false; };

    /* ---- 1. naming by layer ---- */
    {
      const church = TALK_TREES.purge.devourer && TALK_TREES.purge.devourer.line;
      const coilT = allText(TALK_TREES.coil);
      const barks = String(talkTo);
      R.namedByLayer = /Har'mageddon/.test(church) && /sixth-born/.test(church) && /Appetite/.test(coilT) && /Seventh/.test(coilT) && !/mageddon/i.test(coilT)
        ? 'the Order names him Har\'mageddon, the sixth-born; the Coil says the Appetite and the Seventh, and never the name'
        : `!! THE NAMES ARE NOT LAYERED: church ${String(church).slice(0, 60)}, coil ${coilT.slice(0, 80)}`;
    }

    /* ---- 2. Maren ---- */
    const cop = towns.find(t => t.def.key === 'copperhold');
    const maren = chars.find(c => c.maren);
    {
      const opened = maren ? openDiscourse(maren, 'coil') : false;
      const line = document.getElementById('modalbody') ? document.getElementById('modalbody').textContent : '';
      closeTalk();
      R.maren = maren && maren.name === 'Maren Tollis' && maren.homeTown === cop && maren.coil && maren.coilSpeaker && opened && /Candles/.test(line)
        ? `Maren Tollis is the Copperhold cell's speaker, and she opens a conversation ("${line.slice(1, 60)}…") where the rest of the Coil bark`
        : `!! MAREN: ${maren ? `${maren.name}, ${maren.homeTown && maren.homeTown.name}, coil ${maren.coil}, speaker ${maren.coilSpeaker}` : 'not in the world'}, opened ${opened}`;
    }

    /* ---- 3. the witness finds the mark ---- */
    {
      reset();
      const d0 = drops.length;
      hour = 23; coilMeetNight = true;
      me.x = coilShrine.x + 3; me.y = coilShrine.y; me.floor = 0;
      coilTick();
      const mark = drops.slice(d0).find(d => d.items.coil_mark);
      R.theMark = coilExposed && mark && dist(mark.x, mark.y, coilShrine.x, coilShrine.y) < 3
        ? 'seeing them at the stone exposes the cult and leaves a Serpent in Ash on top of it'
        : `!! THE WITNESS: exposed ${coilExposed}, mark ${!!mark}`;
      hour = 12; coilMeetNight = false;
    }

    /* ---- 4. reported ---- */
    {
      const t = towns.filter(x => x.leader && x.def.key !== 'hollowmere').sort((a, b2) => coilCellOf(b2).length - coilCellOf(a).length)[0];
      const n0 = coilCellOf(t).length;
      stash.coil_mark = 1;
      const L = chars.find(c => c.isLeader === towns.indexOf(t));
      const opt = TALK_TREES.leader.root.opts.find(o => /walk out past the fences/.test(o.say));
      const offered = opt && opt.when(L);
      const said = saidNow(() => opt.fn(L));
      const left = coilCellOf(t).length;
      /* the knives, a night or three later */
      const k0 = chars.filter(c => c.coilKnife).length;
      const dSave = day; day = coilHitDay; hour = 23; coilWiden();
      const knives = chars.filter(c => c.coilKnife && c.state === 'ok');
      const aimed = knives.length === 3 && knives.every(k => k.target && k.target.faction === 'player' && hostile(k, k.target));
      day = dSave; hour = 12;
      R.reported = offered && n0 > 0 && left === 0 && coilEnemy && !campHas('coil_mark') && aimed && k0 === 0
        ? `shown the mark, ${t.name}'s seat takes all ${n0} of its cell ("${said.split(' | ')[0].slice(0, 60)}…"), and a night later three knives come for ${knives[0].target.name}`
        : `!! REPORTED: offered ${offered}, cell ${n0} -> ${left}, enemy ${coilEnemy}, mark left ${campHas('coil_mark')}, knives ${knives.length} aimed ${aimed}`;
      for (const k of knives) { const i = chars.indexOf(k); if (i >= 0) chars.splice(i, 1); }
    }

    /* ---- 5. or stand with them ---- */
    {
      reset(); coilExposed = true;
      const opt = TALK_TREES.coil.root.opts.find(o => /come, next time/.test(o.say));
      const offered = opt.when();
      opt.fn();
      const members = coilCells();
      const at = members.slice(0, 3);
      for (const m of at) { m.x = coilShrine.x + 1; m.y = coilShrine.y + 1; }
      me.x = coilShrine.x + 2; me.y = coilShrine.y; me.floor = 0;
      delete stash.t_ouro; for (const o of player()) if (o.inv) delete o.inv.t_ouro;
      hour = 23;
      for (let n = 0; n < 3; n++) { day++; coilGuests(members); }
      const ring = campHas('t_ouro') > 0;
      /* the watch looks away in a town they hold, short of murder */
      const t = towns.find(x => x.def.key !== 'hollowmere' && !x.playerRuled && !x.def.undeadFriendly);
      t.coilHeld = true;
      /* a witness of the town's own, standing beside you in the square, and nobody to talk it round */
      const wit = makeChar('Witness', 'town', t.x + 1, t.y, { atk: 5, def: 5, tough: 5 }); wit.homeTown = t; chars.push(wit);
      me.x = t.x; me.y = t.y; me.floor = 0; hour = 12;
      const chaW = window.speakerNear; window.speakerNear = () => null;
      rebuildCharGrid();
      const booked = (kind) => { const b0 = t.bounty || 0; crime(kind, me.x, me.y, me); const d = (t.bounty || 0) - b0; t.bounty = b0; t.wanted = false; t._cryKind = null; return d; };
      t.coilHeld = false; const ctrl = booked('theft');                 /* the control: a town the Coil does not hold */
      t.coilHeld = true; const theft = booked('theft'), murder = booked('murder');
      window.speakerNear = chaW;
      t.coilHeld = false; chars.splice(chars.indexOf(wit), 1);
      R.stoodWithThem = offered && coilFriend && ring && coilVisits === 3 && ctrl > 0 && theft === 0 && murder > 0
        ? `stood at the stone three nights, the speaker gives you the Ouroboros Ring; in ${t.name}, once the Coil holds it, theft goes unbooked for a friend of the stone (${ctrl} where it does not) and murder is still booked (${murder})`
        : `!! STOOD WITH THEM: offered ${offered}, friend ${coilFriend}, visits ${coilVisits}, ring ${ring}, theft booked ${ctrl} unheld / ${theft} held, murder ${murder}`;
    }

    /* ---- 6. the ring ---- */
    {
      const w = makeChar('Wearer', 'player', me.x + 2, me.y, { atk: 30, def: 30, tough: 30 }); w.trinket = 't_ouro'; chars.push(w);
      const foe = () => { const f = makeChar('Foe', 'bandit', w.x + 1, w.y, { tough: 30 }); chars.push(f); return f; };
      const blow = () => { const f = foe(); f.parts.chest.hp = 100; applyDamage(w, f, 'chest', 20, 'cut', false, false, true); const d = 100 - f.parts.chest.hp; chars.splice(chars.indexOf(f), 1); return d; };
      const d0 = blow();
      for (let i = 0; i < 3; i++) { const f = foe(); kill(f, w); }
      const d3 = blow();
      w.ouroH = nowH() - OURO_FADE_H - 1;
      const dAfter = blow();
      const eq = EQ_SLOTS.includes('trinket');
      R.theRing = eq && Math.abs(d3 / d0 - (1 + 3 * OURO_PER)) < 0.02 && Math.abs(dAfter - d0) < 0.01
        ? `with the Ouroboros Ring three kills put ${Math.round(3 * OURO_PER * 100)}% on the next blow (${d0.toFixed(1)} -> ${d3.toFixed(1)}), and it is gone once the fight is`
        : `!! THE RING: slot ${eq}, blow ${d0} then ${d3} then ${dAfter}`;
      chars.splice(chars.indexOf(w), 1);
    }

    /* ---- 7. the Appetite ---- */
    {
      reset();
      for (const t of towns) { t.warWith = null; }
      coilAppetite = COIL_SOW_AT[0]; coilSown = 0; coilWars = [];
      const d0 = drops.length;
      _coilWideDay = -1; coilWiden();
      const w = coilWars[0];
      const a = w && towns[w.a], bT = w && towns[w.b];
      const atWar = a && a.warWith === bT && bT.warWith === a;
      const mark = drops.slice(d0).find(d => d.items.coil_mark);
      stash.coil_mark = 1;
      const L = a && chars.find(c => c.isLeader === w.a);
      const opt = TALK_TREES.leader.root.opts.find(o => /war was sown/.test(o.say));
      const offered = L && opt.when(L);
      if (offered) opt.fn(L);
      const peace = a && !a.warWith && !bT.warWith && w.proven;
      R.theAppetite = atWar && mark && offered && peace
        ? `fed, the Appetite makes a war: ${a.name} declares on ${bT.name} over a caravan burned in ${bT.name}'s colours, a mark lies in the ash by the wagons, and shown it, ${a.name}'s seat stands the hosts down`
        : `!! THE APPETITE: war ${atWar}, mark ${!!mark}, offered ${offered}, peace ${peace}`;
    }

    /* ---- 8. the rising ---- */
    {
      reset();
      const members = coilCells();
      const n = members.length;
      coilFriend = true;
      coilRise();
      const risen = chars.filter(c => c.coilRisen && !c.coilKnife && c.state === 'ok');
      const home = risen.every(c => c.guard && c.homeTown && dist(c.guard.x, c.guard.y, c.homeTown.x, c.homeTown.y) < 1);
      const k = risen[0];
      const watch = chars.find(c => c.faction === 'town' && !c.civ && c.homeTown === k.homeTown);
      const vsTown = watch && hostile(k, watch);
      const vsFriend = !hostile(k, me);
      coilFriend = false;
      const vsStranger = hostile(k, me);
      const notCrater = risen.every(c => craterD(c.guard.x, c.guard.y) > 100);
      R.theRising = n > 0 && risen.length === n && home && vsTown && vsFriend && vsStranger && notCrater
        ? `at the Door all ${n} of the quiet people come out against their own towns' watch, not the crater; a friend of the stone is not in their way, and a stranger is`
        : `!! THE RISING: ${risen.length} of ${n} rose, at home ${home}, vs watch ${vsTown}, spare friend ${vsFriend}, hit stranger ${vsStranger}, away from crater ${notCrater}`;
    }

    /* ---- 9. Rubido ---- */
    {
      const lines = [...RUBIDO_TALK.stone, ...RUBIDO_TALK.war, ...RUBIDO_TALK.risen, ...RUBIDO_TALK.any];
      const rub = chars.find(c => c.wanderKey === 'rubido');
      rub.faction = 'player'; rub.state = 'ok';
      const got = new Set(); for (let i = 0; i < 400; i++) { const l = squadBark(rub); if (l && lines.includes(l)) got.add(l); }
      rub.faction = 'drifter';
      R.rubido = got.size >= 3 && !lines.some(l => /mageddon/i.test(l))
        ? `Rubido says ${got.size} different things about it in 400 barks, and never the name: "${[...got][0].slice(0, 60)}…"`
        : `!! RUBIDO: ${got.size} of his lines heard`;
    }

    /* ---- 10. a save ---- */
    {
      coilAppetite = 33; coilSown = 1; coilFriend = true; coilEnemy = false; coilVisits = 2; coilRisen = true;
      const mid = maren && maren.id;
      restore(JSON.parse(JSON.stringify(snapshot())));
      const m2 = chars.find(c => c.id === mid);
      R.itSurvivesASave = coilAppetite === 33 && coilSown === 1 && coilFriend && coilVisits === 2 && coilRisen && coilWars.length === 1 && m2 && m2.maren
        ? 'a save and a reload keep the Appetite, the sown war and its mark, your standing with the stone, the rising, and Maren'
        : `!! AFTER A SAVE: appetite ${coilAppetite}, sown ${coilSown}, friend ${coilFriend}, visits ${coilVisits}, risen ${coilRisen}, wars ${coilWars.length}, Maren ${m2 && m2.maren}`;
    }
    log = lg;
    return R;
  });

  const bad = Object.values(out).filter(v => typeof v === 'string' && v.startsWith('!!'));
  for (const [k, v] of Object.entries(out)) console.log('  ' + k.padEnd(18) + ' ' + v);
  for (const e of errs) console.log('  ' + e);
  console.log('');
  console.log(bad.length || errs.length ? `*** THE COIL IS WRONG (${bad.length + errs.length}) ***` : 'EVERYTHING THAT EATS IS EATEN');
  await b.close();
  process.exit(bad.length || errs.length ? 1 : 0);
})();
