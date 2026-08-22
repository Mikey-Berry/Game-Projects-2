#!/usr/bin/env node
/* THE MIMICS: A RACE, THREE LINES, AND WHAT EACH OF THEM IS FOR.
 *
 * "A catch-all term for the mysterious beings who live alongside humans and have learned to be
 * one with them. They are the imperfect mirror to the Messengers."
 *
 * Three lines, and every one of them is a claim the sim has to honour rather than a stat block:
 *   · Succubus, female only — charms like a Duster, and can carry a child by a sterile race.
 *   · Doppelganger — changes form: a fresh skin, no bounty, and nobody who knew them knows them.
 *   · Fallen, male only — no alchemy by choice, charismatic, and permanently dead.
 *
 * WHY EACH IS MEASURED THE WAY IT IS:
 *   · The SEX rules are asked for backwards — the probe builds a succubus asking for a male and
 *     a Fallen asking for a female. A rule that only holds when nobody argues with it is not a
 *     rule, and `makeChar` takes a `sex` from its caller everywhere else in the game.
 *   · The CHARM is measured against a human control standing in the same place with the same
 *     mana. "She can cast it" is worth nothing on its own — the interesting half is that the
 *     art skips the gift, the attunement AND the research, all three of which a Duster needs.
 *   · FERTILITY is measured on the PAIR and against a golem, which is the hardest sterile thing
 *     in the table. The claim is not that she breeds, it is that she breeds with something that
 *     cannot.
 *   · CHANGING FORM is measured by what it COSTS as well as what it clears, because a button
 *     that only deletes consequences is a cheat rather than a line. The town reputation check
 *     is the one that pins the limit: a warrant is out for a face and a new face voids it, but
 *     how a town FEELS about the necromancer in its streets survives a new nose.
 *   · PERMADEATH is measured as an absence — no corpse — with a human killed the same way in
 *     the same breath as the control. There is no "cannot be raised" flag in this game and
 *     there does not need to be one: the rite needs a body and there is not one.
 *
 * AND THE MODELS ARE READ OFF THE BUILT MESH, never off the flags, which is the rule this repo
 * learned from the helms: a rig that carries a flag no builder reads passes a flag test and
 * changes nothing on screen. Each line has to put real boxes on a real body, and the Fallen and
 * the Messenger have to carry the SAME motif — they are the same stuff, and one of them walked
 * out. The Messenger had no model at all before this and came out wearing the generic hunched
 * gaunt, which is the wrong shape for the one Watcher that stands up and talks to you.
 *
 *   node tools/mimics.js [game.html]
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
  p.on('pageerror', e => errs.push(String(e.message).slice(0, 160)));
  await p.goto('file://' + gamePath(process.argv[2]), { waitUntil: 'load' });
  await p.waitForTimeout(3000);

  /* the picker is drawn before the world exists, so it is asked about first */
  const menu = await p.evaluate(() => {
    const opts = [...document.querySelectorAll('#ccreate .ccopt')].map(x => x.textContent.trim());
    return { hasMimic: opts.includes('Mimic'), opts: opts.slice(0, 14).join(' | ') };
  });

  await p.evaluate(() => { document.getElementById('btn-start').click(); paused = true; });
  await p.waitForTimeout(3000);

  const out = await p.evaluate(() => {
    const R = {};
    paused = true;
    for (let i = chars.length - 1; i >= 0; i--) if (chars[i].__probe) chars.splice(i, 1);
    let gx = 0, gy = 0;
    outer:
    for (let y = 60; y < H - 60; y += 5) for (let x = 60; x < W - 60; x += 5) {
      if (isBlocked(x + 0.5, y + 0.5)) continue;
      if (towns.some(t => dist(t.x, t.y, x, y) < 70)) continue;
      let ok = true;
      for (let j = -6; j <= 6 && ok; j++) for (let i = -6; i <= 6 && ok; i++)
        if (isBlocked(x + i + 0.5, y + j + 0.5)) ok = false;
      if (ok) { gx = x; gy = y; break outer; }
    }
    const mk = (sub, o) => {
      const c = makeChar(sub || 'M', 'player', gx, gy, { race: 'mimic', sub, atk: 10, def: 10, tough: 20, ath: 8, ...(o || {}) });
      c.__probe = true; chars.push(c); return c;
    };

    /* ---------- 1. THE RACE AND ITS LINES ---------- */
    R.theRaceExists = RACES.mimic && Object.keys(SUBRACES.mimic || {}).length === 3
      ? `Mimic is a race with three lines: ${Object.keys(SUBRACES.mimic).join(', ')}`
      : '!! THE RACE OR ITS LINES ARE MISSING';

    /* ---------- 2. TWO OF THE LINES ARE ONE SEX ---------- */
    const suc = mk('succubus', { sex: 'm' });     /* asked for the wrong one on purpose */
    const fal = mk('fallen', { sex: 'f' });
    const dop = mk('doppelganger');
    R.theSexRulesHoldAgainstTheCaller = suc.sex === 'f' && fal.sex === 'm'
      ? 'a succubus comes out female and a Fallen male even when the caller asks for the other'
      : `!! A LINE'S SEX CAN BE OVERRULED (succubus ${suc.sex}, fallen ${fal.sex})`;

    /* ---------- 3. THE FALLEN WILL NOT TOUCH ALCHEMY ---------- */
    fal.mana = 999;
    R.theFallenHoldsNoGift = !canHoldGift('mimic', 'fallen') && spellsFor(fal).length === 0
      ? 'the Fallen can hold no gift and knows no formula at all — the fear is in the table, not in a comment'
      : `!! THE FALLEN CAN WORK ALCHEMY (gift ${canHoldGift('mimic','fallen')}, ${spellsFor(fal).length} formulae)`;
    R.andTheOtherLinesStillCan = canHoldGift('mimic', 'succubus')
      ? 'while the other lines are not deaf — the refusal is the Fallen’s, not the race’s'
      : '!! THE WHOLE RACE IS DEAF — that is not what was asked for';

    /* ---------- 4. THE SUCCUBUS CHARMS ---------- */
    suc.mana = 999;
    const human = mk(null, { race: 'human', sub: undefined });
    human.race = 'human'; human.sub = null; human.mana = 999; human.stats.magic = 40;
    R.theSuccubusIsBornCharming = spellsFor(suc).some(([k]) => k === 'charm') && castReady(suc, 'charm')
      ? 'she has the Loyalty of Dust without a gift, an attunement or the research a Duster needs'
      : `!! SHE CANNOT CHARM (knows ${spellsFor(suc).map(([k]) => k).join(',') || 'nothing'}, ready ${castReady(suc, 'charm')})`;
    R.andItIsHersAndNotEverybodys = !castReady(human, 'charm')
      ? 'and a human beside her with more magic and the same mana cannot — it is the line, not the numbers'
      : '!! ANY BODY CAN CHARM — the innate route has been left open to everyone';

    /* ---------- 5. AND SHE BREEDS WITH WHAT CANNOT ---------- */
    const golem = mk(null, { race: 'golem' });
    golem.race = 'golem'; golem.sub = 'rock';
    R.sheCarriesForTheSterile = pairBreeds(suc, golem) && !breeds(golem)
      ? 'a succubus and a golem are a fertile pair, and the golem is as sterile as the table gets'
      : `!! THE STERILE CLAUSE DOES NOT HOLD (pair ${pairBreeds(suc, golem)}, golem breeds ${breeds(golem)})`;
    R.andTheRuleIsNotJustOffForEverybody = !pairBreeds(dop, golem) && pairBreeds(human, mk(null, { race: 'human' }))
      ? 'and it is hers alone — another mimic with the same golem is still nothing, two humans still work'
      : '!! FERTILITY IS NOW OPEN TO ANYBODY — the control failed';

    /* ---------- 6. THE DOPPELGANGER CHANGES FORM ---------- */
    dop.mana = 999;
    const mate = mk(null, { race: 'human' });
    dop.spouse = mate.id; mate.spouse = dop.id;
    towns[0].bounty = 500; towns[0].wanted = true;
    towns[0].rep = -40;
    const wasName = dop.name, wasKey = colorKeyOf(dop), wasRep = towns[0].rep;
    R.itKnowsHowToChange = castReady(dop, 'shift')
      ? 'a doppelganger can change form, with no gift and no research'
      : `!! IT CANNOT CHANGE FORM (knows ${spellsFor(dop).map(([k]) => k).join(',') || 'nothing'})`;
    beginCast(dop, 'shift');
    R.andItComesBackSomebodyElse = dop.name !== wasName && !!dop.skinShift && colorKeyOf(dop) !== wasKey
      ? `${wasName} walks away as ${dop.name}, in a skin the mesh cache can tell apart`
      : `!! THE FACE DID NOT CHANGE (name ${dop.name}, skin ${dop.skinShift}, key moved ${colorKeyOf(dop) !== wasKey})`;
    R.andTheWarrantIsVoid = towns[0].bounty === 0 && !towns[0].wanted
      ? 'and every warrant out for the old face is void'
      : `!! THE BOUNTY SURVIVED THE NEW FACE (${towns[0].bounty}, wanted ${towns[0].wanted})`;
    R.andSoIsEverybodyWhoKnewThem = dop.spouse === 0 && mate.spouse === 0
      ? 'and nobody who knew them knows them — the marriage goes with the face, which is what it costs'
      : `!! IT KEEPS ITS RELATIONSHIPS (spouse ${dop.spouse}, theirs ${mate.spouse})`;
    /* the limit, which is the half that stops this being a delete-consequences button */
    R.butNotHowTheTownFeels = towns[0].rep === wasRep
      ? `but the town still thinks what it thought (rep ${towns[0].rep}) — a warrant is for a face, an opinion is not`
      : `!! CHANGING FACE WIPED THE TOWN'S OPINION TOO (${wasRep} -> ${towns[0].rep}) — that is a cheat, not a line`;

    /* ---------- 7. THE VOID TAKES THE FALLEN BACK ---------- */
    const before = corpses.length;
    kill(fal, null);
    const afterFallen = corpses.length;
    const ctrl = mk(null, { race: 'human' });
    ctrl.faction = 'bandit';
    kill(ctrl, null);
    R.aFallenLeavesNothing = afterFallen === before && corpses.indexOf(fal) < 0
      ? 'a Fallen leaves no body — nothing to raise, nothing to harvest, nothing to loot'
      : `!! A FALLEN LEAVES REMAINS (${before} -> ${afterFallen})`;
    R.andTheControlStillDoes = corpses.length === afterFallen + 1
      ? 'and a human killed in the same breath still leaves one, so it is the line and not the probe'
      : `!! THE CONTROL LEFT NOTHING EITHER (${afterFallen} -> ${corpses.length}) — this case is measuring nothing`;

    /* ---------- 8. AND THE BODIES ---------- */
    R._where = `staged on open waste at ${gx},${gy}`;
    window.__G = { gx, gy };

    /* ============================================================ AND THEY LIVE HERE
       "A catch-all term for the mysterious beings who live alongside humans and have learned
       to be one with them." They existed only as a race the player could choose, so the
       defining fact about them — that they are already among people — was the one thing the
       world did not say. Now a fraction of every town's ordinary residents are mimics.
       Counted off the LIVE POPULATION rather than off the roller, because a band in
       `rollNpcRace` that no worldgen path calls is a band nobody ever meets. */
    {
      const mim = chars.filter(c => c.race === 'mimic' && c.state !== 'dead');
      const inTowns = mim.filter(c => c.civ || c.homeTown);
      const lines = {};
      for (const c of mim) lines[c.sub || '(none)'] = (lines[c.sub || '(none)'] || 0) + 1;
      R._population = `${mim.length} mimics in a world of ${chars.length} — ` +
        Object.entries(lines).map(([k, v]) => `${v} ${k}`).join(', ');
      R.theyLiveAmongPeople = inTowns.length > 0
        ? `${inTowns.length} of them are ordinary residents of a town, which is the whole idea of them`
        : '!! NO MIMIC LIVES IN ANY TOWN — they exist only where the player can pick one';
      /* AND EVERY ONE CARRIES A LINE. A body with `race:'mimic'` and no `sub` is a mimic with
         none of what makes one — no charm, no shift, no permadeath — and nothing would say so. */
      R.andEveryOneIsSomething = mim.length > 0 && !lines['(none)']
        ? 'and every one of them is a succubus, a doppelganger or a Fallen rather than a mimic of no line'
        : `!! ${lines['(none)'] || 0} MIMIC(S) CARRY NO LINE AT ALL`;
      /* RARE ENOUGH TO BE A THING YOU NOTICE, which the ledger asked for by name. A band, not
         a floor: a world with fifty of them is not a secret, and one with none is not a race. */
      const share = mim.length / chars.length;
      R._share = `${(share * 100).toFixed(1)}% of everything walking`;
      R.andRareEnoughToNotice = (mim.length >= 3 && share < 0.06)
        ? `and they are ${(share * 100).toFixed(1)}% of the world — enough to meet, few enough that meeting one is a thing that happened to you`
        : `!! ${mim.length} MIMICS IS ${(share * 100).toFixed(1)}% OF THE WORLD`;
      const fallen = mim.filter(c => c.sub === 'fallen').length;
      R.andTheFallenIsRarest = fallen >= 1 && fallen <= mim.length * 0.55
        ? `and ${fallen} of them are Fallen — the rarest line, and the one that cannot be raised`
        : `!! ${fallen} OF ${mim.length} MIMICS ARE FALLEN`;
    }

    /* ============================================================ AND SEEDING THEM MOVED NOTHING
       This was filed as a rule-2 change — "expect the worldgen fingerprint to change and
       expect harnesses to go red" — and it does not, because three short-circuits were closed
       first. THE INVARIANT IS THE ASSERTION, since a harness cannot diff two builds at
       runtime: `makeChar` must spend the SAME NUMBER OF RANDOM NUMBERS whatever race, line or
       sex it is handed. Where that is not true, naming a line at a call site silently shortens
       the stream and moves every body placed afterwards.
       All three holes were real and all three were found this way. `sex: _sb.sexOnly || o.sex
       || rnd()` skipped the draw for any sex-locked line. `if(SUBRACES[o.race] && !o.sub)`
       skipped it for any caller that named a line — which was already true of every existing
       caller, not just Mimics. And the townsfolk loop's `!mim && ... && rnd() < 0.2` skipped
       it in exactly the two towns that have race overrides. Measured before the fixes: 4
       numbers for a plain townsman against 3 for one handed a line, and eighteen people gone
       from a world of 633. */
    {
      const real = rnd;
      const draws = (fn) => { let n = 0; rnd = function(){ n++; return real(); };
                              try { fn(); } finally { rnd = real; } return n; };
      const base = { atk: 3, def: 4, tough: 5, ath: 6 };
      const at = { x: gx, y: gy };
      const counts = {};
      const made = [];
      const one = (label, extra) => {
        counts[label] = draws(() => { const c = makeChar('Draw Probe', 'town', at.x, at.y, { ...base, ...extra });
                                      c.__probe = true; made.push(c); });
      };
      one('plain', {});
      one('named line', { race: 'human', sub: 'dustborn' });
      one('mimic succubus', { race: 'mimic', sub: 'succubus' });   /* female-only */
      one('mimic fallen', { race: 'mimic', sub: 'fallen' });       /* male-only */
      one('mimic doppelganger', { race: 'mimic', sub: 'doppelganger' });
      one('hollow (no lines)', { race: 'hollow' });
      one('golem', { race: 'golem' });
      const vals = Object.values(counts);
      const same = vals.every(v => v === vals[0]);
      R._draws = Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(' · ');
      R.buildingABodyCostsTheSame = same
        ? `every kind of body costs the same ${vals[0]} numbers to build, so naming a race or a line cannot move the world`
        : `!! MAKING A BODY COSTS A DIFFERENT NUMBER OF DRAWS BY KIND — ${R._draws}`;
      for (const c of made) { const i = chars.indexOf(c); if (i >= 0) chars.splice(i, 1); }
    }


    return R;
  });

  /* the mesh is built by the camera, so it needs real frames — and more than one, because
     `syncChars` builds at most eight rigs a frame and will spend that budget on the world */
  const rigs = {};
  for (const sb of ['succubus', 'doppelganger', 'fallen', '__messenger', '__human', '__woman']) {
    await p.evaluate((sb) => {
      const { gx, gy } = window.__G;
      for (let i = chars.length - 1; i >= 0; i--) if (chars[i].__probe) chars.splice(i, 1);
      let c;
      if (sb === '__messenger') { c = spawnGaunt('messenger', gx, gy); if (c) c.faction = 'player'; }
      else if (sb === '__human') c = makeChar('Plain', 'player', gx, gy, { race: 'human', sub: 'dustborn' });
      else if (sb === '__woman') c = makeChar('Plainer', 'player', gx, gy, { race: 'human', sub: 'dustborn', sex: 'f' });
      else c = makeChar(sb, 'player', gx, gy, { race: 'mimic', sub: sb });
      if (!c) { window.__C = null; return; }
      c.__probe = true;
      if (chars.indexOf(c) < 0) chars.push(c);
      window.__C = c.id;
      camX = camSX = c.x; camY = camSY = c.y; camDist = camDistTarget = 8;
      camPitch = camPitchT = 0.4; camYaw = camYawT = 0; camFollow = false;
      paused = false; for (let i = 0; i < 4; i++) update(0.1); paused = true;
    }, sb);
    for (let i = 0; i < 6; i++) await p.evaluate(() => new Promise(r => requestAnimationFrame(() => r(1))));
    rigs[sb] = await p.evaluate(() => {
      /* ---------- RENDER UNTIL THE RIG IS THERE, NOT A FIXED NUMBER OF TIMES ----------
         `syncChars` builds at most EIGHT rigs a frame and spends that budget on the world
         first, so a fixed count of frames is a bet on how busy the machine is. Alone it won
         every time; inside a 63-harness suite it lost, and this file reported "SHE IS ON THE
         STOCK FRAME" about a body whose mesh simply had not been built yet — the measurement
         read the defaults. `bound.js` had already written this lesson down and this file did
         not use it. Poll, with a bound, and one more frame after it arrives so the pose has
         run on it. */
      const mine = () => (window.__C != null ? charMeshes.get(window.__C) : null);
      let e = null;
      for (let i = 0; i < 40 && !e; i++) {
        try { render(); } catch (er) { return { err: er.message }; }
        e = mine();
      }
      if (e) { try { render(); } catch (er) { return { err: er.message }; } e = mine(); }
      if (!e) return { none: true };
      return { boxes: (e.boxBody || []).length, oldGod: !!e.oldGod, head: !!(e.headG || e.head),
               hide: e.hide || null, sx: +(e.baseSX || 0).toFixed(4), sy: +(e.baseSY || 0).toFixed(4) };
    });
  }

  const R = { ...menu, ...out };
  R.theCreatorOffersIt = menu.hasMimic
    ? 'the character creator lists Mimic beside the other races'
    : `!! MIMIC IS NOT IN THE PICKER (${menu.opts})`;
  const need = ['succubus', 'doppelganger', 'fallen', '__messenger'];
  const missing = need.filter(k => !rigs[k] || rigs[k].err || rigs[k].none);
  R._rigs = need.map(k => `${k.replace('__', '')} ${rigs[k] && rigs[k].boxes != null ? rigs[k].boxes + ' boxes' : JSON.stringify(rigs[k])}`).join(' · ');
  R.everyLineBuildsABody = missing.length === 0
    ? 'every line and the Messenger build a rig without throwing'
    : `!! NO RIG FOR ${missing.join(', ')} — ${missing.map(k => JSON.stringify(rigs[k])).join(' ')}`;
  const plain = (rigs.__human && rigs.__human.boxes) || 0;
  const richer = ['succubus', 'doppelganger', 'fallen'].filter(k => rigs[k] && rigs[k].boxes > plain);
  R.andEachOfThemCarriesItsOwn = richer.length === 3
    ? `and each of the three carries geometry a plain human does not (${plain} boxes against ${['succubus','doppelganger','fallen'].map(k => rigs[k].boxes).join('/')})`
    : `!! A LINE IS WEARING A PLAIN BODY (human ${plain}, ${['succubus','doppelganger','fallen'].map(k => k + ' ' + (rigs[k] && rigs[k].boxes)).join(', ')})`;
  /* ---------- AND HER FACE IS THE POINT OF HER ----------
     Measured against a plain WOMAN and not against the generic human, because `fem` already
     buys a narrower shoulder, a wider hip and thinner limbs — comparing to a man would credit
     the line for the silhouette every woman in the game already has. What is left over is the
     face: lashes on the lid and under the eye, a wing at the corner, a lifted band, a white,
     an iris, a catchlight, a lip with the corners turned up, and cheekbones. */
  const woman = (rigs.__woman && rigs.__woman.boxes) || 0;
  const sucBoxes = (rigs.succubus && rigs.succubus.boxes) || 0;
  R._faces = `a plain woman is ${woman} boxes, a succubus ${sucBoxes}`;
  R.sheHasAFaceAPlainWomanDoesNot = sucBoxes >= woman + 10
    ? `and she carries ${sucBoxes - woman} pieces of face and horn a plain woman does not`
    : `!! HER FACE IS NOT THERE (plain woman ${woman} boxes, succubus ${sucBoxes})`;
  /* ---------- AND THE FRAME UNDER IT ----------
     `fem` already buys every woman a narrower shoulder and a wider pelvis, so a figure of her
     own has to move again ON TOP of that — and it has to move the FRAME rather than add boxes,
     or the arms, legs and clothing stay hung on the old skeleton. Read off the rig's own scale,
     which is what every other box on the body is multiplied by. */
  /* ---------- ONE OF EACH IS NOT A MEASUREMENT ----------
     `baseSX` is `(0.90 + h3 * 0.12) * build.sx`, where `h3` is a per-body hash — so every
     body carries a random spread of up to 0.12, and the succubus's build moves the frame by
     0.08. THE NOISE IS BIGGER THAN THE SIGNAL. Comparing one succubus against one woman
     therefore passes or fails on which two ids they happened to get, which is why this went
     red the moment worldgen shifted and read like a load flake: measured on the failing run,
     woman 0.9255x0.9453 against succubus 1.0116x0.9548, both perfectly correct bodies.
     Average a dozen of each instead. The spread cancels, the build does not. */
  const frames = await p.evaluate(() => {
    const { gx, gy } = window.__G;
    for (let i = chars.length - 1; i >= 0; i--) if (chars[i].__probe) chars.splice(i, 1);
    const made = { woman: [], succubus: [] };
    for (let i = 0; i < 12; i++) {
      const w = makeChar('W' + i, 'player', gx + (i % 4), gy + Math.floor(i / 4), { race: 'human', sub: 'dustborn', sex: 'f' });
      const s2 = makeChar('S' + i, 'player', gx + 6 + (i % 4), gy + Math.floor(i / 4), { race: 'mimic', sub: 'succubus' });
      for (const c of [w, s2]) { c.__probe = true; c.state = 'ok'; if (chars.indexOf(c) < 0) chars.push(c); }
      made.woman.push(w.id); made.succubus.push(s2.id);
    }
    /* render until every one of the twenty-four has a rig — `syncChars` builds eight a frame
       and spends that budget on the world first */
    const all = [...made.woman, ...made.succubus];
    for (let i = 0; i < 80; i++) {
      if (all.every(id => charMeshes.get(id))) break;
      try { render(); } catch (e) { return { err: e.message }; }
    }
    const mean = (ids, k) => {
      const v = ids.map(id => (charMeshes.get(id) || {})[k]).filter(x => typeof x === 'number' && x > 0);
      return v.length ? { n: v.length, m: +(v.reduce((a2, b2) => a2 + b2, 0) / v.length).toFixed(4) } : { n: 0, m: 0 };
    };
    return { wx: mean(made.woman, 'baseSX'), wy: mean(made.woman, 'baseSY'),
             sx: mean(made.succubus, 'baseSX'), sy: mean(made.succubus, 'baseSY') };
  });
  R._frames = frames.err ? '!! ' + frames.err
    : `over ${frames.wx.n} of each: a plain woman ${frames.wx.m}x${frames.wy.m}, a succubus ${frames.sx.m}x${frames.sy.m}`;
  R.herFrameIsHerOwn = (!frames.err && frames.wx.n >= 8 && frames.sx.n >= 8 &&
                        frames.sy.m > frames.wy.m * 1.02 && frames.sx.m < frames.wx.m * 0.99)
    ? `and she is built on a frame of her own — taller and narrower than the women beside her, averaged over ${frames.sx.n} of each`
    : `!! SHE IS ON THE STOCK FRAME (woman ${frames.wx.m}x${frames.wy.m} over ${frames.wx.n}, succubus ${frames.sx.m}x${frames.sy.m} over ${frames.sx.n})`;
  R.theFallenAndTheMessengerAreKin = rigs.fallen && rigs.fallen.oldGod && rigs.__messenger && rigs.__messenger.oldGod
    ? 'and the Fallen and the Messenger wear the same motif, which is the family they share'
    : `!! THEY DO NOT SHARE THE MOTIF (fallen ${rigs.fallen && rigs.fallen.oldGod}, messenger ${rigs.__messenger && rigs.__messenger.oldGod})`;
  R.andAPlainHumanDoesNot = !(rigs.__human && rigs.__human.oldGod)
    ? 'and a plain human does not, so the motif is a mark and not a default'
    : '!! EVERY BODY WEARS THE MOTIF — the marker means nothing';
  delete R.hasMimic; delete R.opts;

  /* ---------- AND SHE IS NOT ALWAYS THE SAME COLOUR ----------
     A line with one `skin` gives every body in it the same hide, which is right for a rock
     golem and wrong for anything meant to read as a person — four succubi standing together
     were four identical pink women. Asked of the RESOLVED colour the model was built from, not
     of the table: a palette nothing reads is a palette that changes nothing on screen. */
  const hides = await p.evaluate(async () => {
    const { gx, gy } = window.__G;
    const seen = [];
    for (let i = 0; i < 10; i++) {
      for (let k = chars.length - 1; k >= 0; k--) if (chars[k].__probe) chars.splice(k, 1);
      const c = makeChar('S' + i, 'player', gx, gy, { race: 'mimic', sub: 'succubus' });
      c.__probe = true; chars.push(c);
      camX = camSX = c.x; camY = camSY = c.y; camDist = camDistTarget = 8;
      camPitch = camPitchT = 0.4; camYaw = camYawT = 0; camFollow = false;
      paused = false; update(0.1); paused = true;
      for (let r = 0; r < 10; r++) { try { render(); } catch (e) { return { err: e.message }; } }
      const e2 = charMeshes.get(c.id);
      if (e2 && e2.hide) seen.push(e2.hide);
    }
    for (let k = chars.length - 1; k >= 0; k--) if (chars[k].__probe) chars.splice(k, 1);
    return { seen };
  });
  const distinct = hides.seen ? [...new Set(hides.seen)] : [];
  R._hides = distinct.length ? `${hides.seen.length} of them wore ${distinct.length} different hides: ${distinct.join(' ')}` : JSON.stringify(hides);
  R.sheComesInMoreThanOneColour = distinct.length >= 3
    ? `and ten of them are not one colour — ${distinct.length} different hides came up, chalk through soot`
    : `!! THEY ARE ALL THE SAME COLOUR (${distinct.length} distinct in ${hides.seen ? hides.seen.length : 0})`;

  console.log('=== THE MIMICS ===\n');
  for (const [k, v] of Object.entries(R)) console.log('  ' + (k.startsWith('_') ? ('· ' + k.slice(1)).padEnd(34) : k.padEnd(34)) + v);
  const bad = Object.values(R).map(String).filter(v => v.startsWith('!!'));
  if (errs.length) console.log('\n  ' + 'andNothingThrew'.padEnd(34) + `!! ${errs.length} PAGE ERROR(S) — ${[...new Set(errs)].slice(0, 2).join(' | ')}`);
  console.log('\n' + (bad.length || errs.length
    ? '*** ' + [...bad, ...(errs.length ? ['page errors'] : [])].join('\n*** ')
    : 'THREE WAYS OF NOT QUITE BEING A PERSON, AND ALL OF THEM WORK'));
  await b.close();
  if (bad.length || errs.length) process.exitCode = 1;
})();
