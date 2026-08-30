#!/usr/bin/env node
/* TWO WAYS TO SHUT A TEAR, AND WHY YOU WOULD EVER CHOOSE THE SLOW ONE.
 *
 * "Perhaps there can be two ways to close tears — the current one, which costs a ton of
 *  materials (and closes it relatively quickly) versus a much longer 'ritual' version, which
 *  is more of a 'protect the caster' event and costs time and military strength as creatures
 *  come through to attempt to stop the ritual. For context, the portals are basically
 *  impossible to close early-mid game right now, so it would be nice to have a way to close
 *  them that doesn't require iron and specifically quickened flesh, as that's far down the
 *  tech tree."
 *
 * THE PREMISE IS CHECKED FIRST, because it is the whole reason for the feature and it is
 * measurable: what the seal costs, and how far down the tree those things sit. If Quickened
 * Flesh turned out to be buyable in a market on day two there would be nothing to fix.
 *
 * Then the three properties that make the rite a different thing rather than a cheaper one:
 * it takes materially longer, it brings things through to stop you, and it BLEEDS AWAY if the
 * caster is driven off. Without the third it is not a protect-the-caster event at all — it is
 * a long errand you can walk away from and come back to, and driving the caster off would
 * cost the attacker nothing.
 *
 *   node tools/tears.js [game.html]
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
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message.slice(0, 200)));
  await p.goto('file://' + gamePath(process.argv[2]), { waitUntil: 'load' });
  await p.waitForSelector('#btn-start', { state: 'attached', timeout: 60000 });
  await p.evaluate(() => { document.getElementById('btn-start').click(); paused = true; });
  await p.waitForTimeout(2600);

  const out = await p.evaluate(() => {
    const R = {};
    paused = true;
    const guard = (keys, fn) => {
      try { fn(); } catch (e) { for (const k of keys) if (R[k] === undefined) R[k] = '!! ' + String(e.message).slice(0, 120).toUpperCase(); }
    };

    let gx = 0, gy = 0;
    outer:
    for (let y = 70; y < H - 70; y += 5) for (let x = 70; x < W - 70; x += 5) {
      if (towns.some(t => dist(t.x, t.y, x, y) < 90)) continue;
      let ok = true;
      for (let j = -9; j <= 9 && ok; j++) for (let i = -9; i <= 9 && ok; i++)
        if (isBlocked(x + i + 0.5, y + j + 0.5) || tileAt(x + i, y + j) === 3) ok = false;
      if (ok) { gx = x; gy = y; break outer; }
    }
    R._where = gx ? `staged on open waste at ${gx},${gy}` : '!! NO OPEN GROUND';

    const made = [];
    const wipe = () => {
      while (made.length) { const c = made.pop(); const i = chars.indexOf(c); if (i >= 0) chars.splice(i, 1); }
      for (let i = chars.length - 1; i >= 0; i--) if (chars[i].__wave) chars.splice(i, 1);
      rifts.length = 0;
    };
    const caster = (x, y, mag) => {
      const c = makeChar('Sealer', 'player', x, y, { atk: 6, def: 6, tough: 14, ath: 6, magic: mag || 10 });
      c.state = 'ok'; c.x = x; c.y = y; c.gift = 'divine'; c.mana = 999; c.maxMana = 999;
      chars.push(c); made.push(c);
      return c;
    };
    const tear = (r) => {
      openRift(gx + 8, gy + 8);
      const rf = rifts[rifts.length - 1];
      if (rf && r) rf.r = r;
      return rf;
    };

    /* ---------- 0. THE PREMISE: WHAT THE SEAL ACTUALLY ASKS FOR ---------- */
    guard(['theSealIsDeepInTheTree'], () => {
      const cost = RIFT_SEAL_COST;
      /* which project each ingredient sits behind, read off the tables rather than remembered */
      const vatTech = BUILD_TYPES.vat && TECHS.quickening ? 'quickening' : null;
      const wants = Object.keys(cost);
      const deep = wants.includes('vflesh') && wants.includes('iron');
      R.theSealIsDeepInTheTree = deep
        ? `the seal wants ${costText(cost)} — Quickened Flesh is a Flesh Vat, which is ${TECHS.quickening.name} at ${TECHS.quickening.cost}g behind ${TECHS[TECHS.quickening.req].name}; iron wants a smelter and a seam. The report is right: there is a stretch of the game where a widening tear is a thing you watch.`
        : `!! THE SEAL COSTS ${costText(cost)} — the premise of this file no longer holds`;
    });

    /* ---------- 1. BOTH WAYS ARE ON OFFER, AND THE RITE WANTS NOTHING ---------- */
    guard(['theRiteNeedsNoMaterials', 'butTheSealStillDoes'], () => {
      wipe();
      const rf = tear(8);
      const c = caster(rf.x + 1, rf.y);
      /* an empty camp: no flesh, no iron, no remains, no Compact */
      const keep = {};
      for (const k of Object.keys(RIFT_SEAL_COST)) { keep[k] = stash[k] || 0; stash[k] = 0; }
      /* the seal, with nothing to pay with: it must stall at the threshold rather than close */
      c.sealTarget = rf;
      let n = 0;
      for (; n < 4000 && rifts.includes(rf); n++) sealTick(c, 0.05);
      R.butTheSealStillDoes = rifts.includes(rf)
        ? `with an empty stores the seal runs up to its threshold and stops — ${Math.round(rf.seal)} of 30 and no closing`
        : '!! THE SEAL CLOSED A TEAR WITH NOTHING IN THE STORES';
      /* the rite, same empty camp */
      c.sealTarget = null;
      c.tearTarget = rf;
      c.mana = 9999;
      let m = 0;
      for (; m < 8000 && rifts.includes(rf); m++) { c.mana = 9999; tearRiteTick(c, 0.05); }
      R.theRiteNeedsNoMaterials = !rifts.includes(rf)
        ? `and the long rite closes the same tear with an empty stores, in ${(m * 0.05).toFixed(0)}s of holding — no iron, no quickened flesh`
        : `!! THE RITE NEVER LANDED (${Math.round(rf.tearWork || 0)} of ${TEAR_WORK} after ${(m * 0.05).toFixed(0)}s)`;
      for (const k of Object.keys(keep)) stash[k] = keep[k];
    });

    /* ---------- 2. AND IT IS THE SLOW ROAD, NOT THE CHEAP ONE ----------
       A rite that were merely free would make the seal pointless. Both timed on the same
       caster, holding continuously, with everything paid for. */
    guard(['theRiteIsTheLongWay'], () => {
      wipe();
      const rf1 = tear(8);
      const c1 = caster(rf1.x + 1, rf1.y, 20);
      for (const k of Object.keys(RIFT_SEAL_COST)) stash[k] = 999;
      c1.sealTarget = rf1;
      let a = 0;
      for (; a < 8000 && rifts.includes(rf1); a++) { c1.mana = 9999; sealTick(c1, 0.05); }
      const sealSecs = a * 0.05;
      wipe();
      const rf2 = tear(8);
      const c2 = caster(rf2.x + 1, rf2.y, 20);
      c2.tearTarget = rf2;
      let b2 = 0;
      for (; b2 < 20000 && rifts.includes(rf2); b2++) { c2.mana = 9999; tearRiteTick(c2, 0.05); }
      const riteSecs = b2 * 0.05;
      R._times = `the seal takes ${sealSecs.toFixed(0)}s of holding, the rite ${riteSecs.toFixed(0)}s`;
      R.theRiteIsTheLongWay = riteSecs > sealSecs * 3
        ? `the rite is ${(riteSecs / sealSecs).toFixed(1)}x the hold the seal is — a different price, not a discount`
        : `!! THE RITE IS ${(riteSecs / sealSecs).toFixed(1)}x THE SEAL — nobody would ever pay the materials`;
    });

    /* ---------- 3. AND THE TEAR SENDS THINGS TO STOP IT ---------- */
    guard(['theTearFightsBack', 'andTheSealDoesNotProvokeIt'], () => {
      wipe();
      const rf = tear(8);
      const c = caster(rf.x + 1, rf.y, 20);
      const born = () => chars.filter(g => g.riftId === rf.id && g.state !== 'dead').length;
      const b0 = born();
      c.tearTarget = rf;
      /* a little over two waves, and stopping well short of the rite landing so nothing is
         cleaned up by `closeRift` before it can be counted */
      for (let i = 0; i < Math.floor(TEAR_WAVE * 2.2 / 0.05) && rifts.includes(rf); i++) { c.mana = 9999; tearRiteTick(c, 0.05); }
      const b1 = born();
      for (const g of chars) if (g.riftId === rf.id) g.__wave = true;
      R.theTearFightsBack = b1 >= b0 + 4
        ? `two waves into the rite the tear has put ${b1 - b0} more through at the caster — the military strength half of the price`
        : `!! ONLY ${b1 - b0} CAME THROUGH IN ${(TEAR_WAVE * 2.2).toFixed(0)}s OF RITE`;
      /* and they are actually coming for the caster rather than milling about */
      const onHim = chars.filter(g => g.riftId === rf.id && g.target === c).length;
      R._aimed = `${onHim} of them are aimed at the one holding it`;
      /* the negative control: the QUICK seal must not summon anything, or the two roads are
         the same road with different arithmetic */
      wipe();
      const rf2 = tear(8);
      const c2 = caster(rf2.x + 1, rf2.y, 20);
      for (const k of Object.keys(RIFT_SEAL_COST)) stash[k] = 999;
      const c0 = chars.filter(g => g.riftId === rf2.id && g.state !== 'dead').length;
      c2.sealTarget = rf2;
      for (let i = 0; i < Math.floor(TEAR_WAVE * 2.2 / 0.05) && rifts.includes(rf2); i++) { c2.mana = 9999; sealTick(c2, 0.05); }
      const c1n = chars.filter(g => g.riftId === rf2.id && g.state !== 'dead').length;
      R.andTheSealDoesNotProvokeIt = c1n === c0
        ? 'while the quick seal brings nothing through at all — the two roads are priced in different currencies'
        : `!! THE SEAL SUMMONED ${c1n - c0} AS WELL`;
    });

    /* ---------- 4. AND IT BLEEDS AWAY IF THE CASTER IS DRIVEN OFF ----------
       This is what makes it an event. Without it the rite is a long errand you can leave and
       come back to, and driving the caster off costs the attacker nothing. */
    guard(['theHoldBleedsAway', 'andHoldingItStopsTheBleed'], () => {
      wipe();
      const rf = tear(8);
      const c = caster(rf.x + 1, rf.y, 20);
      c.tearTarget = rf;
      for (let i = 0; i < 600; i++) { c.mana = 9999; tearRiteTick(c, 0.05); }
      const held = rf.tearWork;
      /* driven off: the order is gone and nobody is on it. Three game hours pass, which is
         twenty-four REAL seconds — the units the rite is actually counted in. */
      c.tearTarget = null;
      for (let i = 0; i < 3; i++) riftTick(1);
      const after = rf.tearWork;
      R.theHoldBleedsAway = (held > 0 && after < held * 0.7)
        ? `drive the caster off and twenty-four seconds takes the hold from ${held.toFixed(0)} back to ${after.toFixed(0)} of ${TEAR_WORK} — ${Math.round((1 - after / held) * 100)}% of the work gone`
        : `!! THE HOLD SAT AT ${after.toFixed(0)} OF ${held.toFixed(0)} WITH NOBODY ON IT`;
      c.tearTarget = rf;
      const before2 = rf.tearWork;
      for (let i = 0; i < 3; i++) riftTick(1);
      R.andHoldingItStopsTheBleed = rf.tearWork >= before2
        ? 'and it stops bleeding the moment somebody is holding it again'
        : `!! IT BLEEDS EVEN WHILE HELD (${before2.toFixed(0)} -> ${rf.tearWork.toFixed(0)})`;
    });

    /* ---------- 5. AND A RITE IN PROGRESS RIDES THE SAVE ---------- */
    guard(['theRiteRidesTheSave'], () => {
      wipe();
      const rf = tear(8);
      const c = caster(rf.x + 1, rf.y, 20);
      c.tearTarget = rf;
      for (let i = 0; i < 400; i++) { c.mana = 9999; tearRiteTick(c, 0.05); }
      const snap = JSON.parse(JSON.stringify(snapshot()));
      const row = snap.rifts.find(x => x.id === rf.id);
      const who = snap.chars.find(x => x.id === c.id);
      R.theRiteRidesTheSave = (row && row.tearWork > 0 && who && who.tearRiftId === rf.id)
        ? `${Math.round(row.tearWork)} of ${TEAR_WORK} rides the save, and so does the order that says who is holding it`
        : `!! rift ${JSON.stringify(row && row.tearWork)}, caster's order ${who && who.tearRiftId}`;
      wipe();
    });

    /* the out-of-page section below needs a tear and somebody selected who can work it */
    window.__R = { gx, gy, wipe, caster, tear };
    return R;
  });

  /* ================= 6. AND BOTH ROADS ARE ON THE MENU =================
     OUT OF THE PAGE, with Playwright's own mouse: a synthetic MouseEvent arrives at `#game`
     and does nothing, and the camera needs a drawn frame before anything can ask where a
     thing is on screen. Both traps are recorded in haulers.js at length.
     This is the reachability half, and it is the half this project keeps getting wrong: a
     rite that works perfectly and cannot be ordered is a rite nobody will ever use. */
  await p.evaluate(() => {
    const O = window.__R;
    O.wipe();
    const rf = O.tear(8);
    const c = O.caster(rf.x + 6, rf.y + 6, 20);
    window.__M = { rid: rf.id, cid: c.id, x: rf.x, y: rf.y };
    selected = [c];
    camX = camSX = rf.x; camY = camSY = rf.y; camDist = camDistTarget = 22;
    camPitch = camPitchT = 0.62; camYaw = camYawT = 0.4; camFollow = false;
    paused = false; for (let i = 0; i < 10; i++) update(0.1); paused = true;
    hideCtxMenu();
  });
  await p.waitForTimeout(450);
  const q = await p.evaluate(() => {
    const m = window.__M;
    const to = (tx, ty) => w2s(tx, ty, groundY(tx, ty) + 0.05);
    let s0 = to(m.x, m.y);
    const b1 = screenToWorld(s0.x, s0.y);
    s0 = to(m.x - (b1.x - m.x), m.y - (b1.y - m.y)) || s0;
    const back = screenToWorld(s0.x, s0.y);
    return { x: s0.x, y: s0.y, off: dist(back.x, back.y, m.x, m.y) };
  });
  await p.mouse.move(q.x, q.y);
  await p.mouse.down({ button: 'right' });
  await p.mouse.up({ button: 'right' });
  const menu = await p.evaluate(() => {
    const el = document.getElementById('ctxmenu');
    const shown = !!el && getComputedStyle(el).display !== 'none';
    return shown ? [...el.querySelectorAll('button')].map(x => x.textContent) : [];
  });
  out._menu = `right-clicking a tear offers: ${menu.join(' | ') || '(nothing)'} — the click landed ${q.off.toFixed(2)} tiles off`;
  out.bothRoadsAreOffered = (menu.some(x => /SEAL IT/.test(x)) && menu.some(x => /LONG RITE/.test(x)))
    ? 'right-clicking a tear offers the seal with its price on it and the long rite beside it — the choice the note is about, made where the player makes it'
    : `!! THE MENU IS ${menu.join(' | ') || 'EMPTY'}`;
  if (menu.some(x => /LONG RITE/.test(x))) {
    out.andTheRiteEntryGivesTheOrder = await p.evaluate(() => {
      [...document.querySelectorAll('#ctxmenu button')].find(x => /LONG RITE/.test(x.textContent)).click();
      const c = chars.find(x => x.id === window.__M.cid);
      return c.tearTarget && c.tearTarget.id === window.__M.rid
        ? 'and pressing it actually sends them — not a dead button'
        : `!! THE ENTRY DID NOTHING (tearTarget ${c.tearTarget ? c.tearTarget.id : 'none'})`;
    });
  } else out.andTheRiteEntryGivesTheOrder = '!! not reached';

  const bad = Object.values(out).filter(v => typeof v === 'string' && v.startsWith('!!'));
  for (const [k, v] of Object.entries(out)) console.log('  ' + k.padEnd(30) + ' ' + v);
  for (const e of errs) console.log('  ' + e);
  console.log('');
  console.log(bad.length || errs.length ? `A TEAR IS STILL SOMETHING YOU WATCH (${bad.length + errs.length})`
                                        : 'A TEAR CAN BE SHUT WITH TIME AND BODIES INSTEAD OF IRON');
  await b.close();
  process.exit(bad.length || errs.length ? 1 : 0);
})();
