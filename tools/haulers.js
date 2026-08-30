#!/usr/bin/env node
/* WHAT IT TAKES TO MOVE A SIXFOLD, AND WHAT IS LEFT WHEN YOU CUT ONE UP WHERE IT FELL.
 *
 * "The harvest update is good for looting, but the harvest action for a Sixfold now completely
 *  removes its body, even though the tooltip says that you can get more back from a boneyard.
 *  For one, in the field harvest should not remove the body. And second, for big corpses, it
 *  should take either a bone cart, mule, OR like four regular dudes minimum. Either way, it
 *  should also be a slow drag, not one guy soloing it all."
 *
 * `charnelworks.js` already asks whether the yard is worth the walk. This asks the two things
 * it could not see, because both of them are about what SURVIVES an action rather than what it
 * pays: whether the corpse is still lying there afterwards, and whether one pair of hands can
 * put it over a shoulder.
 *
 * THE THIRD ASSERTION HERE IS THE ONE THAT MATTERS MOST and it is not in the note at all. The
 * HARVEST menu item set `body.looted = true` before ordering the rendering — a harmless
 * shorthand for an ordinary corpse and a silent catastrophe for a great one, because a Sixfold
 * carries two Preserved Formulae, two Worn, three pieces of the Sundered, two tomes and three
 * thousand gold in `dropItems`. Marking it looted threw every bit of that away, so the ONE
 * body in the game worth hauling home was also the one the interface quietly emptied first.
 *
 *   node tools/haulers.js [game.html]
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
  await p.waitForSelector('#btn-start', { state: 'attached', timeout: 60000 });
  await p.evaluate(() => { document.getElementById('btn-start').click(); paused = true; });
  await p.waitForTimeout(2600);

  const out = await p.evaluate(() => {
    const R = {};
    paused = true;
    const guard = (keys, fn) => {
      try { fn(); } catch (e) { for (const k of keys) if (R[k] === undefined) R[k] = '!! ' + String(e.message).slice(0, 120).toUpperCase(); }
    };
    const me = player()[0];

    /* WELL AWAY FROM ANY SEAT — `cartFodder` refuses a body inside somebody else's wall radius
       and `takeBody` books the pick-up as grave-robbery, so a probe staged near the start town
       measures the crime system rather than the haul. Lifted from charnelworks.js, which lost
       a run to exactly this. */
    let gx = 0, gy = 0;
    outer:
    for (let y = 90; y < H - 90; y += 7) for (let x = 90; x < W - 90; x += 7) {
      if (nearestTownDist(x, y) < 140) continue;
      let ok = true;
      for (let dy = -8; dy <= 8 && ok; dy++) for (let dx = -8; dx <= 8; dx++) if (isBlocked(x + dx, y + dy)) { ok = false; break; }
      if (ok) { gx = x; gy = y; break outer; }
    }
    R._where = `staged on open waste at ${gx},${gy}, ${Math.round(nearestTownDist(gx, gy))} tiles from the nearest seat`;
    const at = findOpenNear(gx, gy, 8);
    placeStructure('boneyard', at.x, at.y);
    const YW = BUILD_TYPES.boneyard.w;
    const yardSpot = () => ({ x: at.x + YW / 2, y: at.y + YW / 2 });
    const fieldSpot = () => ({ x: at.x - 30, y: at.y - 30 });

    /* CLEAR THE HANDS TOO, NOT ONLY THE BODIES. The first run of this file left every worker
       it had staged standing in the same clearing, so `haulCrewFor` — which quite correctly
       calls over whoever is nearest — filled the crew with leftovers from the previous test and
       the assertion, which was checking ITS OWN three hands, read that as the crew not being
       held. The game was right and the probe was reading the wrong three people. */
    const made = [];
    const wipe = () => {
      for (let i = corpses.length - 1; i >= 0; i--) {
        const c = corpses[i]; corpses.splice(i, 1);
        const j = chars.indexOf(c); if (j >= 0) chars.splice(j, 1);
      }
      while (made.length) { const c = made.pop(); const j = chars.indexOf(c); if (j >= 0) chars.splice(j, 1); }
    };
    const corpse = (x, y, big) => {
      const c = makeChar('Meat', 'bandit', x, y, { atk: 5, def: 5, tough: 20 });
      c.state = 'dead'; c.rot = 'fresh'; c.deadAt = day; c.big = big || 1;
      c.x = x; c.y = y;
      chars.push(c); corpses.push(c);
      return c;
    };
    /* a hand, placed EXACTLY where asked. findOpenNear scatters, and this file cares about
       distances of three tiles — the reach a call for help carries. */
    const hand = (name, x, y, extra) => {
      const c = makeChar(name, 'player', x, y, { atk: 10, def: 10, tough: 20, ath: 6, labor: 6 });
      c.state = 'ok'; c.x = x; c.y = y;
      Object.assign(c, extra || {});
      chars.push(c); made.push(c);
      return c;
    };

    /* the out-of-page section below drives a REAL right-click through Playwright's mouse,
       so it needs the same staging this block uses */
    window.__H = { fieldSpot, yardSpot, corpse, hand, wipe };

    /* ---------- 1. A FIELD RENDERING LEAVES THE BODY ---------- */
    guard(['theBodyIsStillThere', 'andOnlyGivesItUpOnce'], () => {
      wipe();
      const f = fieldSpot();
      const six = corpse(f.x, f.y, 2.4);
      six.looted = true;
      const first = harvestCorpse(six, true, null) || 0;
      const stillThere = corpses.includes(six);
      R.theBodyIsStillThere = (first > 0 && stillThere)
        ? `a knife in the field takes ${first} Mortal Remains off a Sixfold and the corpse is still lying there`
        : `!! FIELD RENDERING PAID ${first} AND THE BODY IS ${stillThere ? 'THERE' : 'GONE'}`;
      const second = harvestCorpse(six, true, null) || 0;
      R.andOnlyGivesItUpOnce = (second === 0 && corpses.includes(six))
        ? 'and a second pass over the same carcass in the open gets nothing — it is freight now, not work'
        : `!! A SECOND FIELD RENDERING PAID ${second}`;
    });

    /* ---------- 2. AND THE REST OF IT IS WAITING AT THE YARD ----------
       The claim the tooltip makes, measured: field-then-yard must come to the same total as
       hauling it home untouched. Averaged, because `harvestCorpse` rolls the decay draw. */
    guard(['theFieldShareIsAnAdvance'], () => {
      const N = 60;
      let whole = 0, split = 0;
      for (let i = 0; i < N; i++) {
        wipe();
        const y = yardSpot();
        const straight = corpse(y.x, y.y, 2.4); straight.looted = true;
        whole += harvestCorpse(straight, true, null) || 0;
      }
      for (let i = 0; i < N; i++) {
        wipe();
        const f = fieldSpot();
        const c = corpse(f.x, f.y, 2.4); c.looted = true;
        split += harvestCorpse(c, true, null) || 0;
        /* AND IT HAS TO STILL BE THERE TO HAUL. Without this the loop happily renders a corpse
           that was spliced out of the world on the line above and reports a healthy total for
           a body that does not exist — which is precisely the bug, passing its own test. */
        if (!corpses.includes(c)) { split = -1e9; break; }
        const y = yardSpot();
        c.x = y.x; c.y = y.y;             /* the haul, done by hand */
        split += harvestCorpse(c, true, null) || 0;
      }
      whole /= N; split /= N;
      R._totals = `hauled whole ${whole.toFixed(2)} remains, cut in the field then hauled ${split.toFixed(2)}`;
      /* a band, not a target: both sides are Math.max(1, round(...)) of a rolled draw, so the
         split path rounds up twice and comes out a little ahead. What must not happen is the
         field share COSTING you the body, which is what a ratio well under 1 would mean. */
      const r = split / whole;
      R.theFieldShareIsAnAdvance = split < 0
        ? '!! THE FIELD RENDERING DELETED THE BODY — there was nothing left to haul home'
        : (r > 0.9 && r < 1.35)
        ? `cutting it where it fell is an advance against the yard, not a sale: ${(r * 100).toFixed(0)}% of what hauling it whole pays`
        : `!! FIELD-THEN-YARD IS ${(r * 100).toFixed(0)}% OF HAULING IT WHOLE`;
    });

    /* ---------- 3. AND THE HARVEST ORDER DOES NOT EAT WHAT IT WAS CARRYING ----------
       The bug the note did not mention and could not have: HARVEST forged `looted = true`. */
    /* ---------- 4. ONE PAIR OF HANDS CANNOT SHIFT ONE ---------- */
    guard(['oneManCannotSolo', 'fourOfThemCan', 'aCartDoesItAlone', 'andAnOrdinaryBodyIsUnchanged'], () => {
      wipe();
      const f = fieldSpot();
      const six = corpse(f.x, f.y, 2.4);
      const solo = hand('Solo', f.x - 1, f.y);
      const alone = takeBody(solo, six);
      R.oneManCannotSolo = (!alone && !solo.carry)
        ? `one pair of hands is refused a body ${six.big}x the size of a man`
        : `!! ONE MAN PUT A ${six.big}x BODY OVER HIS SHOULDER`;
      /* three more, standing close enough to be called over */
      const crew = [];
      for (let i = 0; i < 3; i++) crew.push(hand('Hand' + i, f.x - 1 - i * 0.6, f.y + 1));
      const together = takeBody(solo, six);
      /* read the crew the GAME assembled, not the three this file happened to create */
      const held = solo.haulCrew || [];
      const allOn = held.length > 0 && held.every(o => o.haulFor === solo);
      R.fourOfThemCan = (together && solo.carry === six && allOn && held.length === GREAT_HANDS - 1)
        ? `${GREAT_HANDS} of them together get it up, and the other three are held on the load rather than counted once and released`
        : `!! took=${together} carry=${!!solo.carry} crewHeld=${allOn} crew=${held.length || 'none'}`;
      /* and a cart does it on its own, which is what a cart is for */
      dropBodies(solo);
      const cart = hand('Gravecart', f.x + 1, f.y, { cart: true, beast: true, undead: true, master: me });
      R.aCartDoesItAlone = (takeBody(cart, six) && cart.carry === six && !cart.haulCrew)
        ? 'and a Gravecart takes the same body on its own — no crew, no calling anybody over'
        : `!! THE CART COULD NOT TAKE IT (carry=${!!cart.carry})`;
      dropBodies(cart);
      /* NEGATIVE CONTROL: nothing above may have made an ordinary corpse harder to pick up */
      const man = corpse(f.x + 4, f.y + 4, 1);
      const porter = hand('Porter', f.x + 3, f.y + 4);
      R.andAnOrdinaryBodyIsUnchanged = (takeBody(porter, man) && porter.carry === man && !porter.haulCrew)
        ? 'while an ordinary body is still one person, one pair of hands, no crew — the old behaviour, untouched'
        : `!! AN ORDINARY CORPSE NOW NEEDS ${porter.haulCrew ? porter.haulCrew.length + 1 : '??'} PEOPLE`;
      dropBodies(porter);
    });

    /* ---------- 5. AND IT IS A SLOW DRAG ---------- */
    guard(['theyDragRatherThanWalk'], () => {
      wipe();
      const f = fieldSpot();
      const six = corpse(f.x, f.y, 2.4);
      const lead = hand('Lead', f.x - 1, f.y);
      const crew = [];
      for (let i = 0; i < 3; i++) crew.push(hand('H' + i, f.x - 1 - i * 0.6, f.y + 1));
      const free = moveSpeed(lead);
      takeBody(lead, six);
      const laden = moveSpeed(lead);
      const helper = moveSpeed((lead.haulCrew || crew)[0]);
      /* against an ORDINARY body over the shoulder, which is the comparison a player feels */
      dropBodies(lead);
      const man = corpse(f.x + 5, f.y, 1);
      takeBody(lead, man);
      const oneBody = moveSpeed(lead);
      R._pace = `free ${free.toFixed(2)}, one body ${oneBody.toFixed(2)}, a Sixfold ${laden.toFixed(2)}, a helper ${helper.toFixed(2)}`;
      R.theyDragRatherThanWalk = (laden < free * 0.5 && laden < oneBody * 0.7 && helper < free * 0.5)
        ? `a team on a Sixfold moves at ${(laden / free * 100).toFixed(0)}% of free pace against ${(oneBody / free * 100).toFixed(0)}% for a corpse over one shoulder — and the crew walks at the load's pace, not their own`
        : `!! laden ${(laden / free).toFixed(2)}x free, one body ${(oneBody / free).toFixed(2)}x, helper ${(helper / free).toFixed(2)}x`;
      dropBodies(lead);
    });

    /* ---------- 6. AND LOSING A HAND PUTS IT DOWN ----------
       The crew is checked every frame rather than once at the pick-up, which is the whole
       difference between a commitment and a toll paid at a gate. */
    guard(['losingAHandDropsIt'], () => {
      wipe();
      const f = fieldSpot();
      const six = corpse(f.x, f.y, 2.4);
      const lead = hand('Lead2', f.x - 1, f.y);
      const crew = [];
      for (let i = 0; i < 3; i++) crew.push(hand('G' + i, f.x - 1 - i * 0.6, f.y + 1));
      takeBody(lead, six);
      const up = lead.carry === six;
      const held = (lead.haulCrew || []).slice();
      /* one of them is killed. Nothing else changes. */
      if (held[0]) held[0].state = 'dead';
      for (let i = 0; i < 4; i++) update(1 / 30);
      R.losingAHandDropsIt = (up && held.length === GREAT_HANDS - 1 && !lead.carry && held.every(o => !o.haulFor))
        ? 'kill one of the four and the load comes down where it stands — and the other two are let go rather than left holding a corpse nobody has'
        : `!! up=${up} crew=${held.length} stillCarrying=${!!lead.carry} stillHeld=${held.filter(o => o.haulFor).length}`;
    });

    /* ---------- 7. AND THERE IS A JOB THAT DOES ALL OF THIS FOR YOU ----------
       DRIVEN THROUGH THE DISPATCHER, not by calling `cartTick` directly. The first version of
       this called the tick by hand and passed on the build before the job existed, because
       `cartTick` has always worked — what was missing was any way to reach it without binding a
       Gravecart. The question is whether setting a hand's JOB makes the body arrive. */
    guard(['boneHaulIsAJob', 'andTheMenuOffersIt'], () => {
      wipe();
      const f = fieldSpot();
      const hauler = hand('Hauler', f.x, f.y, { job: 'bones' });
      const body = corpse(f.x + 4, f.y + 2, 1);
      selected = [hauler];
      paused = false;
      let steps = 0;
      for (; steps < 900 && !inBoneyard(body); steps++) update(0.1);
      paused = true;
      R.boneHaulIsAJob = inBoneyard(body)
        ? `a hand told to BONE HAUL fetches a corpse from the field and sets it down on the racks in ${(steps / 10).toFixed(0)}s — no cart bound, no clicking`
        : `!! THE BODY IS STILL AT ${body.x.toFixed(0)},${body.y.toFixed(0)}, ${dist(body.x, body.y, at.x + YW / 2, at.y + YW / 2).toFixed(0)} TILES FROM THE RACKS, CARRIED BY ${whoCarries(body) ? whoCarries(body).name : 'nobody'}`;
      /* and it is reachable from the menu — the mistake this project has made before is a
         feature that is costed, wired and unlisted. OPEN THE POPUP AND READ IT: asking whether
         the job ROW says BONE HAUL only works once somebody is already on the job. */
      refreshCharPanel();
      const jb = [...document.querySelectorAll('#jobrow button')].find(x => /^JOB:/.test(x.textContent));
      if (jb) jb.onclick();
      const menu = document.getElementById('ctxmenu');
      const listed = !!menu && /BONE HAUL/i.test(menu.textContent);
      R.andTheMenuOffersIt = (jb && listed)
        ? 'and BONE HAUL is in the job popup a player actually opens, beside HARVEST'
        : `!! jobButton=${!!jb} inTheMenu=${listed}`;
      hideCtxMenu();
    });

    return R;
  });

  /* ================= 3. AND THE HARVEST ORDER DOES NOT EAT WHAT IT WAS CARRYING =================
     OUT OF THE PAGE, because this one has to be a real click. A synthetic MouseEvent dispatched
     at `#game` arrives at the element and does nothing — the handler is bound to the canvas the
     renderer owns, and the id resolves to something else — so the whole first version of this
     test read "no menu opened" on a build whose menu works perfectly. Playwright's own mouse
     goes through the browser's hit-testing and lands on whatever is actually under the cursor,
     which is the only way to be sure the thing being tested is the thing a player touches. */
  {
    await p.evaluate(() => {
      const H = window.__H;
      H.wipe();
      const f = H.fieldSpot();
      const six = H.corpse(f.x, f.y, 2.4);
      six.loot = 900; six.dropItems = { formula_p: 2, sunder: 3 };
      window.__six = six;
      /* ten tiles back: `w2s` at ground height maps back about two tiles past a body this
         size, and a hand standing beside it sits under that aim — so the click resolves on the
         PERSON and the corpse branch is never reached. The order walks them over anyway. */
      const digger = H.hand('Digger', f.x - 10, f.y);
      selected = [digger];
      camX = camSX = six.x; camY = camSY = six.y; camDist = camDistTarget = 16;
      camPitch = camPitchT = 0.62; camYaw = camYawT = 0.4; camFollow = false;
      paused = false; for (let i = 0; i < 8; i++) update(0.1); paused = true;
      hideCtxMenu();
    });
    /* ---------- LET THE CAMERA ACTUALLY GET THERE BEFORE ASKING WHERE ANYTHING IS ----------
       `camX`/`camSX` are inputs to the render loop, not the projection itself: nothing moves
       until a frame is drawn, and no frame is drawn inside an `evaluate`. Computing the aim in
       the same breath as the camera move projected the corpse to (-1621,-518) — off the left of
       the window — and `screenToWorld` cheerfully mapped that back onto the body, because a
       ray-plane intersection does not care whether the pixel is on screen. The round trip
       agreed to a hundredth of a tile and the cursor was a thousand pixels outside the glass. */
    await p.waitForTimeout(500);
    const q = await p.evaluate(() => {
      const six = window.__six;
      /* AIM, THEN CORRECT THE AIM. `w2s` and `screenToWorld` are not inverses on a pitched
         camera; one Newton step off the measured error puts the cursor on the body. */
      const aimAt = (tx, ty) => w2s(tx, ty, groundY(tx, ty) + 0.05);
      let s0 = aimAt(six.x, six.y);
      const m1 = screenToWorld(s0.x, s0.y);
      s0 = aimAt(six.x - (m1.x - six.x), six.y - (m1.y - six.y)) || s0;
      const back = screenToWorld(s0.x, s0.y);
      const el = document.elementFromPoint(s0.x, s0.y);
      return { x: s0.x, y: s0.y, off: dist(back.x, back.y, six.x, six.y), hit: el ? (el.id || el.className || el.tagName) : 'none' };
    });
    await p.mouse.move(q.x, q.y);
    await p.mouse.down({ button: 'right' });
    await p.mouse.up({ button: 'right' });
    const menu = await p.evaluate(() => {
      const el = document.getElementById('ctxmenu');
      const shown = !!el && getComputedStyle(el).display !== 'none';
      return shown ? [...el.querySelectorAll('button')].map(x => x.textContent) : [];
    });
    out._aim = `the click landed ${q.off.toFixed(2)} tiles off the body at ${q.x.toFixed(0)},${q.y.toFixed(0)} — topmost element there is ${q.hit}`;
    out.theMenuOffersHarvest = menu.some(x => /HARVEST/.test(x))
      ? `right-clicking a Sixfold's corpse offers ${menu.length} things to do with it, HARVEST among them`
      : `!! NO HARVEST IN THE MENU (${menu.join(' | ') || 'no menu opened'})`;
    if (menu.some(x => /HARVEST/.test(x))) {
      await p.evaluate(() => {
        window.__purse = { gold: cats, form: campHas('formula_p'), sun: campHas('sunder') };
        [...document.querySelectorAll('#ctxmenu button')].find(x => /HARVEST/.test(x.textContent)).click();
      });
      out.harvestDoesNotPickThePocketsFirst = await p.evaluate(() => {
        const six = window.__six, p0 = window.__purse;
        paused = false; for (let i = 0; i < 200 && (selected[0] || {}).lootTarget; i++) update(0.1); paused = true;
        const kept = !six.looted && corpses.includes(six)
          && cats === p0.gold && campHas('formula_p') === p0.form && campHas('sunder') === p0.sun;
        const y = window.__H.yardSpot();
        six.x = y.x; six.y = y.y;
        const got = lootCorpse(six, true, null);
        const paid = cats > p0.gold && campHas('formula_p') > p0.form && campHas('sunder') > p0.sun;
        return (kept && Array.isArray(got) && paid)
          ? `ordering HARVEST in the field renders it without opening its pockets (purse held at ${p0.gold}), and the racks pay out the 2 Preserved Formulae and 3 Sundered afterwards`
          : `!! looted=${six.looted} corpse=${corpses.includes(six)} purse ${p0.gold}->${cats} formulae ${p0.form}->${campHas('formula_p')} sundered ${p0.sun}->${campHas('sunder')}`;
      });
    } else out.harvestDoesNotPickThePocketsFirst = '!! not reached — the menu never opened';
  }

  const bad = Object.values(out).filter(v => typeof v === 'string' && v.startsWith('!!'));
  for (const [k, v] of Object.entries(out)) console.log('  ' + k.padEnd(34) + v);
  for (const e of errs) console.log('  ' + e);
  console.log('');
  console.log(bad.length || errs.length ? `ONE MAN IS STILL CARRYING A SIXFOLD (${bad.length + errs.length})`
                                        : 'THE GREAT DEAD ARE FREIGHT, AND THEY STAY WHERE THEY FELL');
  await b.close();
  process.exit(bad.length || errs.length ? 1 : 0);
})();
