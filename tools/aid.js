#!/usr/bin/env node
/* THE ALARM, AND THE BANDAGE.
 *
 * Two reports that turn out to share a shape — the game knew something and had no way to act
 * on it.
 *
 *   1. "Combat or dangerous events that may need manual intervention are hard to spot." A
 *      fight forty tiles off the camera is invisible; the first you hear of it is a body on
 *      the floor. `c.target` is who a body is FIGHTING, which is not the question — the
 *      question is whether anything is fighting IT, and nothing recorded that.
 *   2. "It is impossible to bandage people from other factions." The healing machinery is
 *      faction-blind end to end; only the ORDER was restricted, so an escort you were paid to
 *      deliver alive could not be helped and a beaten enemy could not be kept from bleeding
 *      out before you took them.
 *
 * The medic AUTOMATION must stay allies-only, which was asked for explicitly, so that is
 * asserted too — widening the order without keeping that would swap one bug for another.
 *
 *   node tools/aid.js [game.html]
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

  const frame = () => p.evaluate(() => new Promise(r => requestAnimationFrame(() => r())));

  /* ---------- 1. THE THREAT MARK ---------- */
  const one = await p.evaluate(() => {
    const R = {};
    paused = true;

    let gx = 0, gy = 0;
    outer:
    for (let y = 60; y < H - 60; y += 5) for (let x = 60; x < W - 60; x += 5) {
      if (isBlocked(x + 0.5, y + 0.5)) continue;
      if (towns.some(t => dist(t.x, t.y, x, y) < 70)) continue;
      let ok = true;
      for (let j = -5; j <= 5 && ok; j++) for (let i = -5; i <= 5 && ok; i++)
        if (isBlocked(x + i + 0.5, y + j + 0.5)) ok = false;
      if (ok) { gx = x; gy = y; break outer; }
    }
    R.ground = gx ? `staged on open waste at ${gx},${gy}` : '!! NO OPEN GROUND';

    for (let i = chars.length - 1; i >= 0; i--) if (chars[i].__probe) chars.splice(i, 1);
    const mine = makeChar('Hand', 'player', gx, gy, { atk: 8, def: 8, tough: 20, ath: 6 });
    const also = makeChar('Other', 'player', gx + 1, gy, { atk: 8, def: 8, tough: 20, ath: 6 });
    const foe = makeChar('Raider', 'bandit', gx + 2, gy, { atk: 14, def: 8, tough: 20, ath: 6 });
    for (const c of [mine, also, foe]) { c.__probe = true; chars.push(c); }
    selected = [mine, also];

    R.startsUnmarked = !mine.threatT
      ? 'nobody carries the mark before a blow lands'
      : `!! A BODY IS MARKED BEFORE ANYTHING HAPPENED (${mine.threatT})`;

    /* a real blow through the real path, not a hand-set flag */
    applyDamage(foe, mine, 'chest', 9, 'cut', false);
    R.aBlowMarksTheDefender = mine.threatT > 0
      ? `one blow from a raider marks the body it landed on (${mine.threatT.toFixed(1)}s)`
      : '!! A LANDED BLOW DOES NOT MARK THE BODY IT LANDED ON';
    R.itMarksTheRightOne = !also.threatT
      ? 'and marks only that one — the squadmate beside them is untouched'
      : '!! THE WHOLE SQUAD IS MARKED BY ONE BLOW ON ONE BODY';

    /* the mark is about an ENEMY. Friendly fire and a burn ticking down are not the alarm. */
    mine.threatT = 0;
    applyDamage(also, mine, 'chest', 4, 'cut', false);
    R.friendlyFireIsNotAnAlarm = !mine.threatT
      ? 'a blow from your own line does not raise it'
      : '!! YOUR OWN SQUAD SETS THE ALARM OFF';
    mine.threatT = 0;
    applyDamage(null, mine, 'chest', 4, 'burn', false);
    R.aBurnIsNotAnAlarm = !mine.threatT
      ? 'and neither does a burn ticking down with nobody behind it'
      : '!! A DOT SETS THE ALARM OFF EVERY TICK';

    /* it has to fade on its own, or the bar pulses for the rest of the run */
    applyDamage(foe, mine, 'chest', 9, 'cut', false);
    paused = false;
    for (let i = 0; i < 60 && mine.threatT > 0; i++) { foe.state = 'down'; update(0.1); }
    paused = true;
    R.theMarkFades = !mine.threatT
      ? 'and it fades on its own once nothing is swinging any more'
      : `!! THE MARK NEVER CLEARS (${mine.threatT.toFixed(1)}s left after 6s)`;

    applyDamage(foe, mine, 'chest', 9, 'cut', false);
    return R;
  });

  /* the class itself, off the real DOM after the real rebuild — a flag the bar does not read
     would pass every assertion above and change nothing the player can see */
  await p.evaluate(() => refreshSquadBar());
  await frame();
  const two = await p.evaluate(() => {
    const R = {};
    const ports = [...document.querySelectorAll('#squadbar .port')];
    const marked = ports.filter(d => d.className.includes('threat'));
    R.theBarShowsIt = marked.length === 1
      ? `exactly one port in the bar carries the .threat class (${ports.length} ports)`
      : `!! ${marked.length} OF ${ports.length} PORTS ARE MARKED — THE BAR IS NOT READING threatT`;
    /* and the pulse is CSS, so it costs nothing per frame and honours reduced motion */
    const css = [...document.styleSheets].flatMap(s => { try { return [...s.cssRules].map(r => r.cssText); } catch (e) { return []; } }).join('\n');
    R.thePulseIsCss = /@keyframes\s+threatPulse/.test(css)
      ? 'and the pulse is a CSS animation, not a per-frame JS loop'
      : '!! THERE IS NO CSS ANIMATION — SOMETHING IS DRIVING THIS FROM JS';
    /* Ask for the RULE, not for a substring of the whole sheet: browsers re-serialise
       `animation: none` into the eight-part longhand, so a naive /animation:\s*none/ over the
       concatenated text misses it and reports a bug that is not there. */
    const reduced = [...document.styleSheets].flatMap(s2 => { try { return [...s2.cssRules]; } catch (e) { return []; } })
      .filter(r => r.media && String(r.media.mediaText).includes('prefers-reduced-motion'))
      .flatMap(r => [...r.cssRules].map(x => x.cssText));
    R.reducedMotionIsHonoured = reduced.some(t => t.includes('.port.threat'))
      ? 'and it becomes a steady border under prefers-reduced-motion'
      : '!! THE PULSE IGNORES prefers-reduced-motion';
    return R;
  });

  /* ---------- 2. THE BANDAGE ---------- */
  const three = await p.evaluate(() => {
    const R = {};
    paused = true;
    for (let i = chars.length - 1; i >= 0; i--) if (chars[i].__probe) chars.splice(i, 1);

    let gx = 0, gy = 0;
    outer:
    for (let y = 60; y < H - 60; y += 5) for (let x = 60; x < W - 60; x += 5) {
      if (isBlocked(x + 0.5, y + 0.5)) continue;
      if (towns.some(t => dist(t.x, t.y, x, y) < 70)) continue;
      let ok = true;
      for (let j = -5; j <= 5 && ok; j++) for (let i = -5; i <= 5 && ok; i++)
        if (isBlocked(x + i + 0.5, y + j + 0.5)) ok = false;
      if (ok) { gx = x; gy = y; break outer; }
    }
    stash.bandage = 40;

    const doc = makeChar('Surgeon', 'player', gx, gy, { atk: 4, def: 6, tough: 10, ath: 8, medic: 40 });
    doc.__probe = true; chars.push(doc);
    /* a stranger on the ground: the escort case and the take-them-alive case are the same
       shape, and this is the shape */
    const hurt = makeChar('Escortee', 'town', gx + 2, gy, { atk: 4, def: 4, tough: 8, ath: 6 });
    hurt.__probe = true; chars.push(hurt);
    for (const k of PARTS) hurt.parts[k].hp = 40;
    hurt.parts.chest.bleed = 3; hurt.state = 'down'; hurt.blood = 45;

    R.theMachineryIsFactionBlind = treatable(hurt)
      ? 'the healing machinery already sees a stranger as treatable — only the order was closed'
      : '!! treatable() REFUSES A NON-PLAYER BODY, SO THIS IS A DEEPER CHANGE THAN EXPECTED';

    /* THROUGH THE REAL CLICK, because the restriction lived in the click handler and there is
       no exported entry point to call. Aim at their FEET — the same trap `wanderers.js`
       records: projecting at head height maps back to ground about 0.9 tiles past the body,
       which is just outside the 0.9-tile radius every branch in this chain tests. */
    selected = [doc];
    camX = camSX = hurt.x; camY = camSY = hurt.y;
    camDist = camDistTarget = 16; camPitch = camPitchT = 0.62; camYaw = camYawT = 0.4;
    camFollow = false;
    window.__aidClick = () => {
      const q = w2s(hurt.x, hurt.y, groundY(hurt.x, hurt.y) + 0.05);
      if(!q) return false;
      const mp = screenToWorld(q.x, q.y);
      window.__aidAim = dist(mp.x, mp.y, hurt.x, hurt.y);
      document.getElementById('game').dispatchEvent(new MouseEvent('mousedown', {
        clientX: q.x, clientY: q.y, button: 2, buttons: 2, bubbles: true, cancelable: true,
      }));
      return true;
    };
    R.__stage = {gx, gy};
    return R;
  });

  /* the camera needs real frames before a world point projects to the right pixel */
  await frame(); await frame(); await frame();
  const four = await p.evaluate(() => {
    const R = {};
    const ok = window.__aidClick();
    R.theProbeAimsAtThem = ok && window.__aidAim < 0.5
      ? `the probe clicks ${window.__aidAim.toFixed(2)} tiles from them — dead centre`
      : `!! THE PROBE CANNOT AIM AT THE BODY (${ok ? window.__aidAim.toFixed(2) + ' tiles off' : 'no projection'})`;
    const doc = chars.find(c => c.name === 'Surgeon');
    const hurt = chars.find(c => c.name === 'Escortee');
    R.aStrangerCanBeOrderedTended = doc.healTarget === hurt
      ? `${doc.name} is sent to ${hurt.name} — a body that is not yours and not on your side`
      : `!! RIGHT-CLICKING A DOWNED STRANGER GIVES NO ORDER (healTarget ${doc.healTarget && doc.healTarget.name})`;

    const bl0 = hurt.parts.chest.bleed;
    paused = false;
    for (let i = 0; i < 2000 && doc.healTarget; i++) update(0.1);
    paused = true;
    let gx = 0, gy = 0;
    outer:
    for (let y = 60; y < H - 60; y += 5) for (let x = 60; x < W - 60; x += 5) {
      if (isBlocked(x + 0.5, y + 0.5)) continue;
      if (towns.some(t => dist(t.x, t.y, x, y) < 70)) continue;
      let ok2 = true;
      for (let j = -5; j <= 5 && ok2; j++) for (let i = -5; i <= 5 && ok2; i++)
        if (isBlocked(x + i + 0.5, y + j + 0.5)) ok2 = false;
      if (ok2) { gx = x; gy = y; break outer; }
    }
    R.andTheTreatmentLands = hurt.parts.chest.bleed < bl0
      ? `and the bleeding is actually stopped (${bl0} -> ${hurt.parts.chest.bleed})`
      : `!! THE ORDER IS ACCEPTED AND NOTHING IS TREATED (bleed still ${hurt.parts.chest.bleed})`;

    /* ---- and the AUTOMATION stays allies-only, which was the explicit condition ---- */
    for (let i = chars.length - 1; i >= 0; i--) if (chars[i].__probe) chars.splice(i, 1);
    const med = makeChar('Medic', 'player', gx, gy, { atk: 4, def: 6, tough: 10, ath: 8, medic: 40 });
    med.stance = 'medic'; med.__probe = true; chars.push(med);
    const outsider = makeChar('Stranger', 'town', gx + 2, gy, { atk: 4, def: 4, tough: 8, ath: 6 });
    outsider.__probe = true; chars.push(outsider);
    for (const k of PARTS) outsider.parts[k].hp = 40;
    outsider.parts.chest.bleed = 3;
    paused = false;
    for (let i = 0; i < 300; i++) update(0.1);
    paused = true;
    R.theMedicStanceStaysHome = !med.healTarget
      ? 'a hand on MEDIC stance still walks past a bleeding stranger — it treats its own only'
      : `!! THE MEDIC STANCE ADOPTED A STRANGER (${med.healTarget.name}) — THE JOB IS NO LONGER ALLIES-ONLY`;

    /* and it still picks up one of its own standing in the same spot */
    const ours = makeChar('Ours', 'player', gx + 2, gy + 1, { atk: 4, def: 4, tough: 8, ath: 6 });
    ours.__probe = true; chars.push(ours);
    for (const k of PARTS) ours.parts[k].hp = 40;
    ours.parts.chest.bleed = 3;
    paused = false;
    for (let i = 0; i < 300 && !med.healTarget; i++) update(0.1);
    paused = true;
    R.theMedicStanceStillWorks = med.healTarget === ours
      ? 'and it still picks up one of your own bleeding in the same place'
      : `!! THE MEDIC STANCE NO LONGER TREATS ITS OWN (healTarget ${med.healTarget && med.healTarget.name})`;

    for (let i = chars.length - 1; i >= 0; i--) if (chars[i].__probe) chars.splice(i, 1);
    return R;
  });

  const out = { ...one, ...two, ...three, ...four };
  delete out.__stage;
  console.log('=== THE ALARM, AND THE BANDAGE ===\n');
  for (const [k, v] of Object.entries(out)) console.log('  ' + k.padEnd(28) + v);
  const bad = Object.values(out).map(String).filter(v => v.startsWith('!!'));
  console.log('\n' + (bad.length ? '*** ' + bad.join('\n*** ')
    : 'THE BAR RAISES THE ALARM, AND A STRANGER ON THE GROUND CAN BE HELPED'));
  if (errs.length) { console.log('errs:', errs.length); errs.slice(0, 4).forEach(e => console.log('  ' + e)); }
  await b.close();
  if (bad.length) process.exitCode = 1;
})();
