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
    return R;
  });

  /* the mesh is built by the camera, so it needs real frames — and more than one, because
     `syncChars` builds at most eight rigs a frame and will spend that budget on the world */
  const rigs = {};
  for (const sb of ['succubus', 'doppelganger', 'fallen', '__messenger', '__human']) {
    await p.evaluate((sb) => {
      const { gx, gy } = window.__G;
      for (let i = chars.length - 1; i >= 0; i--) if (chars[i].__probe) chars.splice(i, 1);
      let c;
      if (sb === '__messenger') { c = spawnGaunt('messenger', gx, gy); if (c) c.faction = 'player'; }
      else if (sb === '__human') c = makeChar('Plain', 'player', gx, gy, { race: 'human', sub: 'dustborn' });
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
      for (let i = 0; i < 8; i++) { try { render(); } catch (e) { return { err: e.message }; } }
      const e = window.__C != null ? charMeshes.get(window.__C) : null;
      if (!e) return { none: true };
      return { boxes: (e.boxBody || []).length, oldGod: !!e.oldGod, head: !!(e.headG || e.head) };
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
  R.theFallenAndTheMessengerAreKin = rigs.fallen && rigs.fallen.oldGod && rigs.__messenger && rigs.__messenger.oldGod
    ? 'and the Fallen and the Messenger wear the same motif, which is the family they share'
    : `!! THEY DO NOT SHARE THE MOTIF (fallen ${rigs.fallen && rigs.fallen.oldGod}, messenger ${rigs.__messenger && rigs.__messenger.oldGod})`;
  R.andAPlainHumanDoesNot = !(rigs.__human && rigs.__human.oldGod)
    ? 'and a plain human does not, so the motif is a mark and not a default'
    : '!! EVERY BODY WEARS THE MOTIF — the marker means nothing';
  delete R.hasMimic; delete R.opts;

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
