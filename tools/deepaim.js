#!/usr/bin/env node
/* DOES AN ORDER GIVEN UNDERGROUND GO WHERE YOU POINTED?
 *
 * "Movement down there can be quite finicky. Perhaps because of zooming out too much to the
 *  overhead world and accidentally clicking up there… not sure, but sometimes movement commands
 *  send people in the opposite direction I want them to go."
 *
 * `cave.js` already asserts that an order aimed at a tile they are STANDING ON lands on it, and
 * it passes. This file is about the other click — the one that misses.
 *
 * THE WHOLE RIGHT-CLICK CHAIN RESOLVES ITS WORLD POINT THROUGH `screenToWorld`, which marches
 * the TERRAIN and stops at the surface. Only the very last branch — the move order — asks
 * `storeyHit(activeFloor)`, and only as a fallback for the point it already has. So underground:
 *   · every body test in the chain (`bodyHit(c, wx, wy, …)`) compares against a point on the
 *     hillside overhead, which is why nothing down there can be right-clicked at all; and
 *   · when `storeyHit` returns null — which it does for any click that lands on uncarved rock,
 *     and the undercroft is 4.5% of the map — the order silently becomes a SURFACE order at
 *     `wx, wy`, on floor 0.
 * And that surface point is not near the cursor. At the undercroft's depth of 22 units and a
 * played camera pitch, the ray crosses the ground about `22 / tan(pitch)` tiles from where it
 * crosses the floor below — roughly THIRTY TILES, toward the camera. Which direction that reads
 * as depends entirely on the yaw, and "the opposite direction" is one of them.
 *
 *   node tools/deepaim.js [game.html]
 */
const { chromium } = require('playwright');
const path = require('path');
const gamePath = (a) => path.resolve(a ? (path.isAbsolute(a) ? a : path.join(__dirname, a)) : path.join(__dirname, 'game.html'));

(async () => {
  const b = await chromium.launch({
    executablePath: process.env.DUSTWARD_CHROME || undefined,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'],
  });
  const p = await b.newPage({ viewport: { width: 1000, height: 720 } });
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message.slice(0, 160)));
  await p.goto('file://' + gamePath(process.argv[2]), { waitUntil: 'load' });
  await p.waitForSelector('#btn-start', { state: 'attached', timeout: 60000 });
  await p.evaluate(() => document.getElementById('btn-start').click());
  await p.waitForTimeout(2600);

  /* ---------- STAGE: a squad standing in an undercroft hall, camera on them ---------- */
  const staged = await p.evaluate(() => {
    const h = undercroft.halls.find(h2 => decks.has(bkey(Math.floor(h2.x), Math.floor(h2.y), UNDER)));
    if (!h) return { ok: false };
    const sx = Math.floor(h.x) + 0.5, sy = Math.floor(h.y) + 0.5;
    const mk = (n, dx) => {
      const c = makeChar(n, 'player', sx + dx, sy, { atk: 5, def: 5, tough: 10, ath: 5 });
      c.__probe = true; c.floor = UNDER; chars.push(c); return c;
    };
    const hand = mk('Delver', 0), mate = mk('Second', 2);
    rebuildCharGrid();
    selected = [hand];
    camX = camSX = sx; camY = camSY = sy; camFollow = false;
    camDist = camDistTarget = 22; camPitch = camPitchT = 0.62; camYaw = camYawT = 0.4;
    window.__D = { hx: sx, hy: sy, handId: hand.id, mateId: mate.id, under: UNDER };
    paused = false;
    return { ok: true, hall: `${sx.toFixed(0)},${sy.toFixed(0)}` };
  });
  if (!staged.ok) { console.log('  !! NO UNDERCROFT HALL TO STAND IN'); await b.close(); process.exit(1); }

  /* the camera anchor lerps; every screen coordinate below is projected through it, so nothing
     means anything until it has STOPPED — cave.js records the same trap in more detail */
  await p.waitForTimeout(2500);
  /* ---------- WAIT FOR IT TO HAVE STOPPED, NOT FOR ONE QUIET FRAME ----------
     The first version broke out of this the moment any single frame moved the anchor by less
     than the threshold — and one slow frame does that while the lerp still has tiles to go. It
     was not obviously wrong, it was INTERMITTENTLY wrong: the same build reported the squadmate
     click working on one run and finding nobody on the next, because the click was aimed
     through one camera and resolved through another. Five consecutive still frames, and a
     budget long enough to actually reach them. cave.js records the same trap at length. */
  await p.evaluate(async () => {
    let last = camFY, still = 0;
    for (let i = 0; i < 400 && still < 5; i++) {
      await new Promise(r => requestAnimationFrame(r));
      still = Math.abs(camFY - last) < 0.0015 ? still + 1 : 0;
      last = camFY;
    }
    paused = true;
  });

  const out = await p.evaluate(() => {
    const R = {};
    const D = window.__D, F = D.under;
    const hand = chars.find(c => c.id === D.handId);
    R._where = `standing in a hall at ${D.hx.toFixed(0)},${D.hy.toFixed(0)} on storey ${F}, activeFloor ${activeFloor}`;
    R.theViewIsUnderground = activeFloor === F
      ? `the view is on storey ${F}, where the squad is`
      : `!! THE VIEW IS ON STOREY ${activeFloor} AND THE SQUAD IS ON ${F}`;

    const click = (q) => {
      hand.moveTarget = null; hand.path = null; hand.target = null; hand.wantFloor = null;
      hideCtxMenu();
      document.getElementById('game').dispatchEvent(new MouseEvent('mousedown', {
        clientX: q.x, clientY: q.y, button: 2, buttons: 2, bubbles: true, cancelable: true }));
      return hand.moveTarget;
    };
    const screenOf = (x, y) => w2s(x, y, groundY(x, y) + floorY(F));

    /* ---------- 1. THE CONTROL: aim at carved floor ---------- */
    /* SCANNED OUTWARD FROM THE HAND, not by walking `decks` — the key packs floor, x and y into
       one integer and cave.js carries its own decoder for it, which is a thing to borrow rather
       than to reinvent slightly differently here. A ring scan also picks the NEAREST carved
       tile, which is what a player aims at. */
    let dest = null;
    for (let r = 4; r <= 8 && !dest; r++)
      for (let a = 0; a < 24 && !dest; a++) {
        const x = Math.round(hand.x + Math.cos(a / 24 * 6.283) * r);
        const y = Math.round(hand.y + Math.sin(a / 24 * 6.283) * r);
        if (x < 2 || y < 2 || x >= W - 2 || y >= H - 2) continue;
        if (decks.has(bkey(x, y, F))) dest = { x: x + 0.5, y: y + 0.5 };
      }
    if (!dest) { R.aimedAtFloorItLands = '(no second carved tile within reach)'; }
    else {
      const t = click(screenOf(dest.x, dest.y));
      R._onFloor = t ? `aimed ${dest.x.toFixed(0)},${dest.y.toFixed(0)} → ordered ${t.x.toFixed(0)},${t.y.toFixed(0)} (${dist(t.x, t.y, dest.x, dest.y).toFixed(1)} off)` : 'no order taken';
      R.aimedAtFloorItLands = (t && dist(t.x, t.y, dest.x, dest.y) < 2)
        ? `an order aimed at carved floor lands on it — ${dist(t.x, t.y, dest.x, dest.y).toFixed(1)} tiles off`
        : `!! AIMED AT CARVED FLOOR AND WENT ${t ? dist(t.x, t.y, dest.x, dest.y).toFixed(0) + ' TILES WIDE' : 'NOWHERE'}`;
    }

    /* ---------- 2. THE MISS: aim a few tiles off the carved floor ----------
       This is the click the report is about. Not a wild click — a near miss, at rock a few
       tiles past the edge of the hall, which is what aiming at a corridor mouth looks like. */
    /* A GENUINE MISS, NOT MERELY A TILE WITH NO FLOOR ON IT. `storeyHit` forgives by one tile in
       each direction before it gives up, so the first version of this aimed three tiles out at
       rock that happened to touch the hall and watched it snap correctly — which proves the
       forgiveness works and says nothing about what happens past it. This wants rock with NO
       carved tile within two in any direction: the click that `storeyHit` really does refuse. */
    const solidAround = (x, y) => {
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++)
        if (decks.has(bkey(x + dx, y + dy, F))) return false;
      return true;
    };
    let rock = null;
    for (let r = 3; r <= 14 && !rock; r++)
      for (let a = 0; a < 32 && !rock; a++) {
        const x = Math.round(hand.x + Math.cos(a / 32 * 6.283) * r);
        const y = Math.round(hand.y + Math.sin(a / 32 * 6.283) * r);
        if (x < 4 || y < 4 || x >= W - 4 || y >= H - 4) continue;
        if (solidAround(x, y)) rock = { x: x + 0.5, y: y + 0.5, r };
      }
    if (!rock) { R.aMissDoesNotBecomeASurfaceOrder = '(every tile within nine is carved — no rock to miss onto)'; }
    else {
      const t = click(screenOf(rock.x, rock.y));
      const gap = t ? dist(t.x, t.y, rock.x, rock.y) : -1;
      R._miss = t
        ? `aimed at rock ${rock.r} tiles out (${rock.x.toFixed(0)},${rock.y.toFixed(0)}) → ordered ${t.x.toFixed(0)},${t.y.toFixed(0)}, ${gap.toFixed(1)} tiles from where the cursor was, wantFloor ${hand.wantFloor}`
        : `aimed at rock ${rock.r} tiles out → no order taken`;
      /* EITHER IS FINE, AND THAT IS THE POINT. Refusing the order is correct and snapping to
         the nearest floor is correct; sending the squad thirty tiles across the surface is not.
         So the bound is on the DISTANCE, not on which of the two happened. */
      /* FOUR, NOT EIGHT. The bound was written at eight and the broken build measured 7.8 —
         a margin of two tenths, which is not an assertion, it is a coincidence with a comparison
         operator in front of it. A snap that is forgiving lands within a few tiles; anything
         further is the surface fallback wearing a disguise. */
      R.aMissDoesNotBecomeASurfaceOrder = (!t || gap < 4)
        ? (t ? `a click that misses the floor snaps to something ${gap.toFixed(1)} tiles away rather than to the surface`
             : 'a click that misses the floor is refused rather than becoming a surface order')
        : `!! A MISS SENT THEM ${gap.toFixed(1)} TILES FROM THE CURSOR, TO ${t.x.toFixed(0)},${t.y.toFixed(0)}`;
      R.andItStaysUnderground = (!t || (hand.wantFloor === undefined || hand.wantFloor === null || hand.wantFloor === F))
        ? 'and it never quietly becomes an order to walk up to the surface'
        : `!! THE ORDER WAS FOR STOREY ${hand.wantFloor}, NOT ${F}`;
    }

    /* ---------- 3. AND A BODY DOWN THERE CAN BE RIGHT-CLICKED ----------
       The same root cause with a different symptom: every body test in the chain compares
       against the surface point, so nothing underground is ever under the cursor. */
    {
      const mate = chars.find(c => c.id === D.mateId);
      hideCtxMenu();
      const q = w2s(mate.x, mate.y, charY(mate) + 0.9);
      hand.moveTarget = null;
      document.getElementById('game').dispatchEvent(new MouseEvent('mousedown', {
        clientX: q.x, clientY: q.y, button: 2, buttons: 2, bubbles: true, cancelable: true }));
      const el = document.getElementById('ctxmenu');
      const open = el && el.style.display !== 'none';
      const labels = open ? [...document.querySelectorAll('#ctxmenu button')].map(x => x.textContent.trim()) : [];
      R._onMate = `right-click on a squadmate underground: menu ${open ? labels.length + ' entries' : 'did not open'}`;
      R.aSquadmateDownThereCanBeClicked = open && labels.length
        ? `right-clicking somebody standing beside you underground offers what you can do to them — ${labels.length} entries`
        : '!! A RIGHT-CLICK ON A BODY UNDERGROUND FINDS NOBODY THERE';
      hideCtxMenu();
    }
    /* ---------- 3b. AND NOT SOMEBODY ON ANOTHER STOREY ----------
       `bodyGap` is a HORIZONTAL distance, so a creature at the same x and y one floor up was
       under the cursor as far as every picking test was concerned. It stayed hidden while the
       chain resolved on the surface — nothing underground matched anything then — and surfaced
       the moment the chain started answering on the right storey: cave.js aimed a move order at
       empty floor and got back an attack on a Carrion Maw one storey above, through the rock.
       AND THIS ONE PASSES ON THE OLD BUILD TOO, vacuously: nothing underground could be picked
       there at all, so the ghost was not targeted either. It is a guard against a defect that
       only becomes REACHABLE once the rest of this file is green, which is worth keeping and
       worth not mistaking for a discriminator. */
    {
      const hand2 = chars.find(c => c.id === D.handId);
      const ghost = makeChar('Upstairs', 'bandit', hand2.x, hand2.y, { atk: 5, def: 5, tough: 8 });
      ghost.state = 'ok'; ghost.__probe = true; ghost.floor = F + 1;
      chars.push(ghost); rebuildCharGrid();
      hand2.target = null; hand2.moveTarget = null; hideCtxMenu();
      const q = w2s(hand2.x, hand2.y, groundY(hand2.x, hand2.y) + floorY(F));
      document.getElementById('game').dispatchEvent(new MouseEvent('mousedown', {
        clientX: q.x, clientY: q.y, button: 2, buttons: 2, bubbles: true, cancelable: true }));
      R._ghost = `an enemy one storey up at the same spot: attack order ${hand2.target ? hand2.target.name : 'none'}`;
      R.nobodyIsClickedThroughTheCeiling = hand2.target !== ghost
        ? 'an enemy standing one storey above, at the same tile, is not under the cursor — there are yards of rock between them'
        : '!! AN ENEMY ONE STOREY UP WAS ORDERED ATTACKED THROUGH THE CEILING';
      const gi = chars.indexOf(ghost); if (gi >= 0) chars.splice(gi, 1);
      rebuildCharGrid(); hand2.target = null; hideCtxMenu();
    }

    /* ---------- 4. AND NOTHING UNDER THE HALLS IS QUARRIABLE ----------
       The same root cause a third time: every gatherable is SURFACE DECOR, read off
       `decorAt(x, y)`, which knows nothing about floors. So a body in the undercroft was being
       offered the boulder sitting on the hill twenty-two units above its head.
       ASSERTED AS A PAIR, because "returns nothing" is also what a function that has been
       broken outright returns. The same tile answered from the surface still names its rock. */
    {
      let under = 0, over = 0, sampled = 0;
      for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) {
        const x = Math.floor(D.hx) + dx, y = Math.floor(D.hy) + dy;
        if (!decks.has(bkey(x, y, F))) continue;
        sampled++;
        if (gatherKindAt(x + 0.5, y + 0.5, F)) under++;
        if (gatherKindAt(x + 0.5, y + 0.5, 0)) over++;
      }
      R._quarry = `${sampled} carved tiles under the hall: ${under} offer something to a body standing on them, ${over} offer something to a body standing on the grass above`;
      R.nothingUnderTheHallsIsQuarriable = under === 0
        ? `none of the ${sampled} tiles under this hall offers a body anything to cut or mine — there is no tree down there to fell`
        : `!! ${under} OF ${sampled} TILES UNDERGROUND STILL OFFER SURFACE DECOR`;
      R.butTheSurfaceAboveStillHasIts = over > 0
        ? `while the same ${over} tiles read from the surface still name their rock and timber, so the answer is about the STOREY and not about the function having stopped working`
        : `!! THE SURFACE ABOVE OFFERS NOTHING EITHER (${over} of ${sampled}) — gathering may be broken outright`;
    }

    for (const c of chars.filter(c => c.__probe)) { const i = chars.indexOf(c); if (i >= 0) chars.splice(i, 1); }
    return R;
  });

  const bad = Object.values(out).filter(v => typeof v === 'string' && v.startsWith('!!'));
  for (const [k, v] of Object.entries(out)) console.log('  ' + (k.startsWith('_') ? ('· ' + k.slice(1)).padEnd(34) : k.padEnd(34)) + ' ' + v);
  for (const e of errs) console.log('  ' + e);
  console.log('');
  console.log(bad.length || errs.length ? `AN ORDER GIVEN UNDERGROUND STILL GOES SOMEWHERE ELSE (${bad.length + errs.length})`
                                        : 'WHAT YOU POINT AT UNDERGROUND IS WHAT THEY GO TO');
  await b.close();
  process.exit(bad.length || errs.length ? 1 : 0);
})();
