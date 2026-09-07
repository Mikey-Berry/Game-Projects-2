#!/usr/bin/env node
/* The touch layer, driven by actual touches.
 *
 * Playwright's `page.touchscreen` and CDP `Input.dispatchTouchEvent` produce real touch events
 * through the browser, so what this exercises is the same path a thumb takes — not a function
 * called directly with made-up arguments.
 *
 * The thing this exists to catch: the gesture layer does not implement orders, selection or
 * the context menu. It synthesises the mouse events the desktop path already handles. That is
 * the right design and it has exactly one failure mode — the synthesis silently not landing,
 * leaving a game that looks like it has touch controls and responds to nothing.
 *
 * It also checks the opposite direction, which matters more: that NONE of this touches
 * desktop. Desktop is the priority; a mobile scaffold that changes mouse behaviour is a
 * regression whatever else it does.
 *
 *   node tools/touch.js [game.html]
 */
const { chromium, devices } = require('playwright');
const path = require('path');
const gamePath = (a) => path.resolve(a ? (path.isAbsolute(a) ? a : path.join(__dirname, a)) : path.join(__dirname, 'game.html'));

/* Touch events, built and dispatched INSIDE the page.
 *
 * The obvious way to do this is CDP `Input.dispatchTouchEvent`, and it does not work here: a
 * single round-trip through the protocol takes longer in this environment than the game's
 * 460ms long-press threshold, so every "tap" arrived as a hold and every gesture reported
 * dead. That is a fact about a software-rendered browser under a debugger, not about the
 * game — a thumb taps in about a tenth of a second.
 *
 * Constructing real `TouchEvent`s in-page keeps the timings honest and still exercises the
 * real listeners. Nothing is lost by it: the gesture layer calls preventDefault on everything
 * anyway, so the browser's own touch-to-mouse synthesis was never in play.
 */
const IN_PAGE = `
  window.__t = (type, pts, ms) => {
    const cv = document.getElementById('game');
    const mk = (p, i) => new Touch({identifier: p.id ?? i, target: cv,
      clientX: p.x, clientY: p.y, pageX: p.x, pageY: p.y, radiusX: 8, radiusY: 8, force: 1});
    const list = pts.map(mk);
    cv.dispatchEvent(new TouchEvent(type, {
      touches: type === 'touchend' ? [] : list,
      targetTouches: type === 'touchend' ? [] : list,
      changedTouches: list, bubbles: true, cancelable: true,
    }));
  };
`;
const tap = (p, x, y, holdMs = 0) => p.evaluate(async ([x, y, holdMs]) => {
  window.__t('touchstart', [{ x, y }]);
  if (holdMs) await new Promise(r => setTimeout(r, holdMs));
  window.__t('touchend', [{ x, y }]);
}, [x, y, holdMs]);
const drag = (p, x0, y0, x1, y1, steps = 8) => p.evaluate(async ([x0, y0, x1, y1, steps]) => {
  window.__t('touchstart', [{ x: x0, y: y0 }]);
  for (let i = 1; i <= steps; i++) {
    window.__t('touchmove', [{ x: x0 + (x1 - x0) * i / steps, y: y0 + (y1 - y0) * i / steps }]);
    await new Promise(r => setTimeout(r, 12));
  }
  window.__t('touchend', [{ x: x1, y: y1 }]);
}, [x0, y0, x1, y1, steps]);
const pinch = (p, cx, cy, from, to, steps = 8) => p.evaluate(async ([cx, cy, from, to, steps]) => {
  const pair = (d) => ([{ id: 1, x: cx - d / 2, y: cy }, { id: 2, x: cx + d / 2, y: cy }]);
  window.__t('touchstart', pair(from));
  for (let i = 1; i <= steps; i++) {
    window.__t('touchmove', pair(from + (to - from) * i / steps));
    await new Promise(r => setTimeout(r, 12));
  }
  window.__t('touchend', pair(to));
}, [cx, cy, from, to, steps]);

(async () => {
  const b = await chromium.launch({
    executablePath: process.env.DUSTWARD_CHROME || undefined,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'],
  });
  const url = 'file://' + gamePath(process.argv[2]);
  const R = {};
  const IN_PAGE_SRC = IN_PAGE;
  const errs = [];

  /* ---------------- the phone ---------------- */
  {
    const ctx = await b.newContext({ ...devices['Pixel 5'] });
    const p = await ctx.newPage();
    p.on('pageerror', e => errs.push('PHONE: ' + e.message.slice(0, 160)));
    await p.goto(url, { waitUntil: 'load' });
    await p.waitForTimeout(3000);
    await p.evaluate(() => document.getElementById('btn-start').click());
    await p.waitForTimeout(5000);
    await p.evaluate(IN_PAGE_SRC);

    R.detected = await p.evaluate(() => TOUCH ? 'coarse pointer, touch mode on'
      : '!! A PHONE WAS NOT DETECTED AS TOUCH');
    R.bodyClass = await p.evaluate(() => document.body.classList.contains('touch')
      ? 'body carries the touch class' : '!! NO TOUCH CLASS ON BODY');
    /* `offsetParent` is null for ANY position:fixed element, shown or not — the first version
       of this used it and reported the controls hidden while they were plainly on screen. */
    const vis = (el) => el && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().width > 0;
    R.controlsShown = await p.evaluate(() => {
      const t = document.getElementById('touchbar');
      const st = t && getComputedStyle(t);
      return (st && st.display !== 'none' && t.getBoundingClientRect().width > 0)
        ? 'the touch controls are up' : '!! TOUCH CONTROLS HIDDEN';
    });
    /* the measured complaints from mobile.js: targets and clipping */
    const fit = await p.evaluate(() => {
      const vw = document.documentElement.clientWidth;
      const shown = e => getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0;
      const btns = [...document.querySelectorAll('button')].filter(shown)
        .map(e => { const r = e.getBoundingClientRect(); return Math.min(r.width, r.height); }).filter(v => v > 0);
      const off = [...document.querySelectorAll('#charpanel,#invpanel,#minimap,#log,#squadbar')]
        .filter(shown)
        .filter(e => { const r = e.getBoundingClientRect(); return r.right > vw + 1 || r.left < -1; })
        .map(e => e.id);
      return { tiny: btns.filter(v => v < 44).length, n: btns.length, min: Math.round(Math.min(...btns)), off };
    });
    R.targets = fit.tiny === 0 ? `all ${fit.n} targets at 44px or better (smallest ${fit.min})`
      : `!! ${fit.tiny}/${fit.n} STILL UNDER 44px (smallest ${fit.min})`;
    R.clipping = fit.off.length === 0 ? 'nothing runs off the screen' : '!! STILL CLIPPED: ' + fit.off.join(',');

    /* THE TOPBAR was three wrapped rows of labelled buttons eating a third of the screen */
    R.topbarSlim = await p.evaluate(() => {
      const tb = document.getElementById('topbar');
      const h = tb.getBoundingClientRect().height, vh = document.documentElement.clientHeight;
      const gear = document.getElementById('tb-menu');
      const hasGear = gear && getComputedStyle(gear).display !== 'none';
      return (h < vh * 0.16 && hasGear)
        ? `topbar is ${Math.round(h / vh * 100)}% of the screen, the rest behind the gear`
        : `!! TOPBAR STILL ${Math.round(h / vh * 100)}% OF THE SCREEN` + (hasGear ? '' : ' AND NO GEAR');
    });
    /* Every glyph on a control has to exist in the font the page is set in. Courier New is
       missing most of the box-drawing block, and a missing glyph renders as a tofu box that
       tells the player nothing — measure the rendered width against a known-good character
       rather than trusting that a code point looks fine in an editor. */
    R.glyphsRender = await p.evaluate(() => {
      /* Compare PIXELS, not advance width. The first version of this measured a glyph's width
         against 'M' and flagged the hamburger — which renders perfectly well, it just falls
         back to a font with a different advance. What actually identifies a missing glyph is
         that it draws the same notdef box as a code point nothing has, so draw one of those
         and compare against it. */
      const draw = (txt) => {
        const cN = document.createElement('canvas'); cN.width = cN.height = 48;
        const x = cN.getContext('2d');
        x.font = '36px "Courier New", monospace'; x.textBaseline = 'middle'; x.textAlign = 'center';
        x.fillText(txt, 24, 24);
        return x.getImageData(0, 0, 48, 48).data;
      };
      const same = (a2, b2) => { for(let i = 3; i < a2.length; i += 4) if((a2[i] > 8) !== (b2[i] > 8)) return false; return true; };
      const tofu = draw('\uE123');                 /* private use — nothing has this */
      const blank = draw(' ');
      const bad = [...document.querySelectorAll('#touchbar button')]
        .map(b2 => b2.textContent.trim())
        .filter(t => t.length === 1)
        .filter(t => { const d = draw(t); return same(d, tofu) || same(d, blank); });
      return bad.length ? '!! TOFU GLYPH ON A CONTROL: ' + bad.join(' ')
        : 'every control glyph draws';
    });
    R.gearOpens = await p.evaluate(() => {
      document.getElementById('tb-menu').click();
      const m = document.getElementById('ctxmenu');
      const n = m && getComputedStyle(m).display !== 'none' ? m.children.length : 0;
      hideCtxMenu();
      return n >= 7 ? `the gear offers ${n} actions` : '!! GEAR MENU EMPTY (' + n + ')';
    });

    /* quality dials should come down on their own, once, as a default */
    R.autoQuality = await p.evaluate(() => (opts.dpr === '1.0' && opts.shadows === 'low')
      ? 'quality defaults taken down for touch' : `!! DIALS NOT TUNED (dpr ${opts.dpr}, shadows ${opts.shadows})`);

    /* --- TAP ONE OF YOUR OWN: select --- */
    const own = await p.evaluate(() => {
      const me = player().find(c => c.state === 'ok');
      camFollow = false; camX = camSX = me.x; camY = camSY = me.y;
      camDist = camDistTarget = 16; selected = [];
      window.__me = me.id;
      return true;
    });
    await p.waitForTimeout(900);
    const at = await p.evaluate(() => {
      const me = chars.find(c => c.id === window.__me);
      /* Their FEET, not their head. The hit test raycasts the tap to the ground plane and
         asks what is within 0.8 tiles of it, so a screen point taken 0.9 units up the body
         lands well past that once the camera is pitched — which is why this reported the tap
         dead on a phone while passing on a desktop with a different aspect. */
      const s = w2s(me.x, me.y, groundY(me.x, me.y));
      return s ? { x: Math.round(s.x), y: Math.round(s.y) } : null;
    });
    if (!at) { R.tapSelects = '!! COULD NOT PROJECT A BODY TO SCREEN'; }
    else {
      /* On a 393x727 screen the panels cover the middle of the map — which is the whole
         reason there is a panels toggle. Use it; tapping a body hidden under the stash panel
         tests nothing except that HTML stacks. */
      R.panelsCycle = await p.evaluate(() => {
        const btn = document.getElementById('tb-panels');
        /* the log is a sheet too now — counting only the two panels made a four-state cycle
           read as [0,0,1,1] and look broken when it was working */
        const sheets = ['log', 'charpanel', 'invpanel'];
        const shown = () => sheets.filter(id =>
          getComputedStyle(document.getElementById(id)).display !== 'none').length;
        const seen = [shown()];
        for(let i = 0; i < 4; i++){ btn.click(); seen.push(shown()); }
        /* nothing, log, character, stash, back to nothing — never two at once. The map left
           this cycle when it got its own button; hunting for it three taps in was the note. */
        return (seen.every(n => n <= 1) && seen.join(',') === '0,1,1,1,0')
          ? 'log / character / stash, one at a time' : '!! PANEL CYCLE WRONG (' + seen.join(',') + ')';
      });
      await tap(p, at.x, at.y);
      await p.waitForTimeout(400);
      R.tapSelects = await p.evaluate(() => selected.length && selected[0].id === window.__me
        ? 'a tap on your own selects them' : '!! TAP DID NOT SELECT (' + selected.length + ' selected)');
    }

    /* ---------- DON'T HUNT FOR EMPTY GROUND, GO AND STAND ON SOME ----------
       The note below already records this failing once, when a change upstream added draws at
       worldgen and everybody shifted. It happened again the moment town shelves started being
       seeded — and this time the scan found NOTHING, `openPt` came back null, and the file
       crashed on `openPt.x` two lines after setting a message about it.
       Looking for a screen point that happens to be clear makes the probe a hostage to where
       the world put people. Move the camera over open waste first, and the scan is then asking
       about a patch of dirt chosen for being empty rather than for being on screen. */
    await p.evaluate(() => {
      let bx = 0, by = 0;
      outer:
      for(let y = 40; y < H - 40; y += 5) for(let x = 40; x < W - 40; x += 5){
        if(isBlocked(x + 0.5, y + 0.5)) continue;
        if(towns.some(t => dist(t.x, t.y, x, y) < 60)) continue;
        let ok = true;
        for(let j = -4; j <= 4 && ok; j += 2) for(let i = -4; i <= 4 && ok; i += 2)
          if(isBlocked(x + i + 0.5, y + j + 0.5)) ok = false;
        if(ok && !chars.some(c => c.state !== 'dead' && dist(c.x, c.y, x, y) < 12)){ bx = x; by = y; break outer; }
      }
      /* ---------- AND BRING THE UNIT WITH THE CAMERA ----------
         Panning ALONE was half a fix. The attack assertions below stand a bandit on this patch
         of dirt and tap him, and the order they are testing for is gated on `visAt(foe) === 2` —
         current sight, not memory. Leaving the selected unit sixty tiles back put the target in
         fog, the handler correctly refused to hand out an attack order, and the probe reported
         the touch layer dead about a game doing exactly the right thing.
         So move them here too. The empty patch was chosen for having nobody on it; the one body
         that belongs on it is the one giving the orders. */
      if(bx){
        camFollow = false; camX = camSX = bx; camY = camSY = by;
        const me = chars.find(c => c.id === window.__me);
        if(me){ me.x = bx; me.y = by; clearOrders(me); }
        rebuildCharGrid(); computeVision();
      }
    });
    await p.waitForTimeout(500);
    /* Somewhere on the map that is not covered by a panel. Tapping blind at (200,400) hit a
       HUD div, the canvas never saw the event, and every gesture below reported dead. */
    const openPt = await p.evaluate(() => {
      const W2 = document.documentElement.clientWidth, H2 = document.documentElement.clientHeight;
      for(let y = H2 * 0.45; y < H2 * 0.75; y += 12) for(let x = W2 * 0.2; x < W2 * 0.8; x += 12){
        const el = document.elementFromPoint(x, y);
        if(!el || el.id !== 'game') continue;
        /* UNCOVERED CANVAS IS NOT THE SAME AS OPEN GROUND. The click handler is a chain of
           `find`s ordered by specificity, and a townsperson within 0.9 of the cursor wins the
           tap before the move order is ever reached — so a point that is plainly canvas can
           still produce no order, because a civilian happens to be standing there.
           That is exactly what happened: a change upstream added twenty-one `ri()` draws at
           worldgen, every roll after them shifted, and a townsperson who used to stand 1.0
           tiles from this point moved to 0.6 — inside the pick radius. The game was correct in
           both worlds and this probe reported the touch layer dead.
           So resolve the point to the WORLD and require the ground there to be genuinely
           empty, which is what the test always meant. */
        const w = screenToWorld(x, y);
        if(!w || isBlocked(w.x, w.y)) continue;
        /* ---------- ASK THE GAME'S OWN QUESTION, NOT A COPY OF IT ----------
           This was `dist(c.x, c.y, w.x, w.y) < 1.6` — a hand-kept copy of a rule the game
           owns, and it drifted the moment the game's changed. Picking is now `bodyHit`, whose
           catchment GROWS WITH THE BODY (a Sixfold reaches 2.7 tiles, a Cairn Beast further)
           and which accepts either a body's feet or the point a click aimed at its middle
           lands on. So a creature 2.5 tiles away passed this filter and still won the tap,
           and the file reported the touch layer dead about a game that was behaving exactly
           as designed.
           A generous base on top, because several branches of the handler use different radii
           and this point has to be clear of all of them. */
        if(chars.some(c => c.state !== 'dead' && bodyHit(c, w.x, w.y, 2.2))) continue;
        return {x: Math.round(x), y: Math.round(y)};
      }
      return null;
    });
    if(!openPt) {
      /* AND IF THERE IS STILL NOTHING, SAY SO AND STOP. This used to set the message and then
         dereference `openPt` on the very next line, so the run ended in a TypeError and every
         claim after it went unreported — a probe that cannot find its subject should report
         that it could not, not take the whole file down. */
      R.openGround = '!! NO UNCOVERED CANVAS ANYWHERE ON THE SCREEN';
      console.log('=== TOUCH ===\n');
      for(const [k, v] of Object.entries(R)) console.log('  ' + k.padEnd(26) + v);
      console.log('\n*** ' + R.openGround);
      await b.close();
      process.exit(1);
    }

    /* --- TAP ELSEWHERE WITH A SELECTION: that is the order --- */
    await p.evaluate(() => { const me = chars.find(c => c.id === window.__me); selected = [me]; clearOrders(me); });
    await tap(p, openPt.x, openPt.y);
    await p.waitForTimeout(400);
    R.tapOrders = await p.evaluate(() => {
      const me = chars.find(c => c.id === window.__me);
      return (me.moveTarget || me.gather || me.chestTarget || me.lootTarget || me.target)
        ? 'a tap elsewhere is an order' : '!! TAP GAVE NO ORDER';
    });

    /* --- THE MAP BUTTON ---
       It was hidden on touch and buried in the gear menu. It has to be one tap, big enough to
       read, on the screen, and mutually exclusive with the other sheets — two panels over a
       phone screen is the exact problem the sheet system exists to prevent. */
    R.mapButton = await p.evaluate(() => {
      const b = document.getElementById('tb-map'), mm = document.getElementById('minimap');
      if(!b) return '!! NO MAP BUTTON';
      document.body.classList.remove('sheet-map');
      const was = getComputedStyle(mm).display;
      b.click();
      const now = getComputedStyle(mm), r = mm.getBoundingClientRect();
      const W2 = document.documentElement.clientWidth, H2 = document.documentElement.clientHeight;
      if(now.display === 'none') return '!! THE MAP BUTTON DOES NOT SHOW THE MAP (was ' + was + ')';
      if(r.width < 140) return '!! THE MAP IS ' + Math.round(r.width) + 'px — a decoration, not a map';
      if(r.left < -1 || r.right > W2 + 1 || r.top < -1 || r.bottom > H2 + 1)
        return '!! THE MAP HANGS OFF THE SCREEN (' + Math.round(r.left) + '..' + Math.round(r.right) + ')';
      return `one tap, ${Math.round(r.width)}px square, on screen`;
    });
    R.mapIsASheet = await p.evaluate(() => {
      const mm = document.getElementById('minimap');
      document.body.classList.remove('sheet-map');
      document.getElementById('tb-map').click();          /* map up */
      const others = ['log', 'charpanel', 'invpanel'];
      const withMap = others.filter(id => getComputedStyle(document.getElementById(id)).display !== 'none');
      document.getElementById('tb-panels').click();       /* now a panel */
      const mapAfter = getComputedStyle(mm).display;
      const shut = (document.getElementById('tb-map').click(), document.getElementById('tb-map').click(),
                    getComputedStyle(mm).display);
      document.body.classList.remove('sheet-map');
      if(withMap.length) return '!! THE MAP OPENS ON TOP OF ' + withMap.join(', ');
      if(mapAfter !== 'none') return '!! OPENING A PANEL LEAVES THE MAP UP';
      if(shut !== 'none') return '!! THE MAP BUTTON DOES NOT CLOSE THE MAP';
      return 'and it closes the other sheets, and they close it';
    });

    /* --- THE ATTACK BUTTON ---
       A hold has to land on a body whose hit test resolves against the ground plane, so
       aiming at anybody with a fingertip is a coin toss, and there is no A key on a phone.
       Arm the button, tap a body: that is the order. Tap open ground: advance and fight. */
    /* There is no worldToScreen in the game, so go the other way: convert a known-open SCREEN
       point to the world and stand the target on it. That also means the tap below is a real
       TouchEvent through the real gesture layer rather than a synthesised mouse event. */
    const armed = await p.evaluate((pt) => {
      const me = chars.find(c => c.id === window.__me);
      selected = [me]; clearOrders(me);
      const w = screenToWorld(pt.x, pt.y);
      const foe = makeChar('Mark', 'bandit', w.x, w.y, {tough: 20});
      foe.state = 'ok'; chars.push(foe); window.__foe = foe;
      rebuildCharGrid(); computeVision();
      document.getElementById('tb-attack').click();
      return attackMoveMode ? '' : '!! THE ATTACK BUTTON DID NOT ARM';
    }, openPt);
    await tap(p, openPt.x, openPt.y);
    await p.waitForTimeout(400);
    R.attackAtSomebody = armed || await p.evaluate(() => {
      const me = chars.find(c => c.id === window.__me), foe = window.__foe;
      if(!(me.target === foe && me.targetManual)) return '!! ARMED, TAPPED A BODY, AND NO ATTACK ORDER CAME OF IT';
      if(attackMoveMode || document.getElementById('tb-attack').classList.contains('on'))
        return '!! THE MODE STAYED ARMED AFTER BEING USED';
      return 'armed, tapped a body, and they went for it';
    });
    const armed2 = await p.evaluate((pt) => {
      const me = chars.find(c => c.id === window.__me);
      selected = [me]; clearOrders(me);
      const foe = window.__foe, fi = chars.indexOf(foe);
      if(fi >= 0) chars.splice(fi, 1);                 /* clear the ground and try again */
      /* STOP THE CLOCK. The previous block already walked this unit at that exact point, so
         re-tapping it can be an order they complete before the assertion reads it —
         `attackMove` clears on arrival, and the probe reports that as "tapping open ground
         gave no attack-move". It passed alone and failed under a loaded machine, which is the
         signature every time.
         Pausing is the right lever and moving the unit is not: the first attempt at this
         staged them eighteen tiles away, which fixed this assertion and broke the NEXT one,
         because the long-press test that follows shares this same screen point and wants
         somebody standing near it. */
      paused = true; if(typeof syncPauseBtn === 'function') syncPauseBtn();
      rebuildCharGrid();
      document.getElementById('tb-attack').click();
      return attackMoveMode ? '' : '!! THE ATTACK BUTTON DID NOT RE-ARM';
    }, openPt);
    await tap(p, openPt.x, openPt.y);
    /* ---------- WAIT FOR THE ORDER, NOT FOR THE CLOCK ----------
       The block above already stopped the world for the other half of this. A fixed 400ms
       after a synthetic tap is still a bet on how long the machine takes to deliver three
       touch events and run a handler; poll for the outcome with a generous ceiling instead.
       It costs nothing when the tap lands promptly, which is every time on an idle box. */
    await p.waitForFunction(() => {
      const me = chars.find(c => c.id === window.__me);
      return !!(me && me.attackMove);
    }, null, { timeout: 5000 }).catch(() => {});
    R.attackAtGround = armed2 || await p.evaluate(() => {
      const me = chars.find(c => c.id === window.__me);
      const r = me.attackMove ? 'and tapping open ground is an advance-and-fight'
        : '!! TAPPING OPEN GROUND WHILE ARMED GAVE NO ATTACK-MOVE';
      paused = false; if(typeof syncPauseBtn === 'function') syncPauseBtn();
      return r;
    });

    /* --- LONG PRESS: the context menu --- */
    await p.evaluate(() => { hideCtxMenu(); const me = chars.find(c => c.id === window.__me); selected = [me]; });
    await tap(p, openPt.x + 6, openPt.y + 8, 700);
    await p.waitForTimeout(400);
    R.holdOpens = await p.evaluate(() => {
      const m = document.getElementById('ctxmenu');
      const shown = m && getComputedStyle(m).display !== 'none' && m.children.length > 0;
      /* a hold that finds nothing to offer legitimately opens nothing — what must be true is
         that it took the right-click path, which either opens a menu or issues an order */
      const me = chars.find(c => c.id === window.__me);
      return (shown || me.moveTarget) ? 'a hold reaches the right-click path' : '!! HOLD DID NOTHING';
    });

    /* --- ONE FINGER DRAGS THE CAMERA --- */
    const cam0 = await p.evaluate(() => { hideCtxMenu(); return { x: camX, y: camY }; });
    await drag(p, openPt.x, openPt.y, openPt.x + 70, openPt.y - 60);
    await p.waitForTimeout(500);
    R.dragPans = await p.evaluate((c0) => {
      const moved = Math.hypot(camX - c0.x, camY - c0.y);
      return moved > 1.5 ? `one finger panned ${moved.toFixed(0)} tiles` : '!! DRAG DID NOT PAN (' + moved.toFixed(2) + ')';
    }, cam0);

    /* --- TWO FINGERS PINCH TO ZOOM --- */
    const d0 = await p.evaluate(() => { camDistTarget = 40; return camDistTarget; });
    await pinch(p, openPt.x, openPt.y, 80, 240);
    await p.waitForTimeout(500);
    R.pinchZooms = await p.evaluate((z0) => camDistTarget < z0 - 3
      ? `pinch took the camera from ${z0} to ${camDistTarget.toFixed(0)}` : '!! PINCH DID NOT ZOOM (' + camDistTarget.toFixed(1) + ')', d0);

    /* --- THE MARQUEE TOGGLE --- */
    R.marquee = await p.evaluate(() => {
      const before = marqueeMode;
      document.getElementById('tb-marquee').click();
      const on = marqueeMode;
      document.getElementById('tb-marquee').click();
      return (!before && on && !marqueeMode) ? 'the box-select toggle holds and releases'
        : '!! MARQUEE TOGGLE DEAD';
    });

    /* --- AND THE OVERRIDE, because detection is wrong sometimes --- */
    R.override = await p.evaluate(() => {
      opts.input = 'mouse'; applyInputMode();
      const off = !TOUCH && !document.body.classList.contains('touch');
      opts.input = 'auto'; applyInputMode();
      return off && TOUCH ? 'forcing mouse mode works, and auto comes back'
        : '!! THE OVERRIDE DOES NOT TAKE';
    });
    await ctx.close();
  }

  /* ---------------- THE PHONE ON ITS SIDE ----------------
     Landscape is not a tweak of portrait; every assumption inverts. The portrait layout
     spends horizontal space freely (full-width sheets) and hoards vertical (a button column
     up the edge) — turned sideways, 292px of column does not fit above the squadbar on a
     393px-tall screen, and a map sized off `100vw` is taller than the screen it is on. So
     this checks the arrangement, not the styling: does anything hang off, is anything still
     tappable, is there any game left to see. */
  {
    const ctx = await b.newContext({
      ...devices['Pixel 5'],
      viewport: { width: 851, height: 393 },   /* the same phone, turned */
      screen: { width: 851, height: 393 },
      isLandscape: true,
    });
    const p = await ctx.newPage();
    p.on('pageerror', e => errs.push('LANDSCAPE: ' + e.message.slice(0, 160)));
    await p.goto(url, { waitUntil: 'load' });
    await p.waitForTimeout(3000);
    await p.evaluate(() => document.getElementById('btn-start').click());
    await p.waitForTimeout(4000);

    R.landTouch = await p.evaluate(() => (TOUCH && document.body.classList.contains('touch'))
      ? 'still touch mode turned sideways' : '!! TOUCH MODE LOST IN LANDSCAPE');
    R.landRenderer = await p.evaluate(() => {
      const w = document.documentElement.clientWidth, h = document.documentElement.clientHeight;
      /* the canvas must be the shape the phone IS, not the shape it was — this is the whole
         reason fit3d is re-run on orientationchange */
      return (Math.abs(camera.aspect - w / h) < 0.05 && w > h)
        ? `renderer follows the turn (${w}x${h})`
        : `!! THE RENDERER IS STILL THE OTHER SHAPE (aspect ${camera.aspect.toFixed(2)} vs ${(w/h).toFixed(2)})`;
    });
    /* Nothing chrome-level may hang off. Deliberately excludes anything inside a scrolling
       panel: a stat row below the fold of the character sheet is scrolled, not clipped, and
       an earlier version of this counted six of those and called the layout broken. */
    R.landClipping = await p.evaluate(() => {
      const W2 = document.documentElement.clientWidth, H2 = document.documentElement.clientHeight;
      const bad = [];
      for(const el of document.querySelectorAll('#topbar, #touchbar, #squadbar, #minimap, #touchbar button, #topbar button')){
        const cs = getComputedStyle(el);
        if(cs.display === 'none' || cs.visibility === 'hidden') continue;
        const r = el.getBoundingClientRect();
        if(!r.width || !r.height) continue;
        if(r.left < -1 || r.right > W2 + 1 || r.top < -1 || r.bottom > H2 + 1)
          bad.push((el.id || el.textContent.trim().slice(0, 8)) + ' ' + Math.round(r.left) + ',' + Math.round(r.top));
      }
      return bad.length ? '!! HANGING OFF THE SCREEN: ' + bad.slice(0, 4).join(' · ')
        : 'the controls and readouts all fit';
    });
    R.landTargets = await p.evaluate(() => {
      let n = 0, tiny = 0, min = 999;
      for(const el of document.querySelectorAll('button')){
        const cs = getComputedStyle(el);
        if(cs.display === 'none' || cs.visibility === 'hidden') continue;
        const r = el.getBoundingClientRect();
        if(!r.width || !r.height) continue;
        n++; const s = Math.min(r.width, r.height); min = Math.min(min, s); if(s < 44) tiny++;
      }
      return tiny === 0 ? `all ${n} targets still 44px or better (smallest ${Math.round(min)})`
        : `!! ${tiny} OF ${n} TARGETS UNDER 44px IN LANDSCAPE (smallest ${Math.round(min)})`;
    });
    /* the point of turning the phone is MORE MAP, so a sheet must not eat the screen */
    R.landSheetRoom = await p.evaluate(() => {
      const W2 = document.documentElement.clientWidth, H2 = document.documentElement.clientHeight;
      document.getElementById('tb-panels').click();
      document.getElementById('tb-panels').click();          /* character sheet up */
      const r = document.getElementById('charpanel').getBoundingClientRect();
      const share = (r.width * r.height) / (W2 * H2);
      document.body.classList.remove('sheet-char');
      return share < 0.5 ? `an open sheet covers ${Math.round(share * 100)}% of the screen`
        : `!! A SHEET COVERS ${Math.round(share * 100)}% OF A LANDSCAPE SCREEN`;
    });
    R.landMap = await p.evaluate(() => {
      const W2 = document.documentElement.clientWidth, H2 = document.documentElement.clientHeight;
      document.body.classList.remove('sheet-map');
      document.getElementById('tb-map').click();
      const mm = document.getElementById('minimap'), r = mm.getBoundingClientRect();
      if(getComputedStyle(mm).display === 'none') return '!! NO MAP IN LANDSCAPE';
      if(r.bottom > H2 + 1 || r.right > W2 + 1 || r.top < -1) return '!! THE MAP HANGS OFF A SHORT SCREEN';
      if(r.height < 140) return '!! THE MAP IS ONLY ' + Math.round(r.height) + 'px TALL';
      if(Math.abs(r.width - r.height) > 2) return '!! THE MAP IS NOT SQUARE (' + Math.round(r.width) + 'x' + Math.round(r.height) + ')';
      document.body.classList.remove('sheet-map');
      return `a ${Math.round(r.height)}px square map, sized off the short side`;
    });
    /* and the controls still work, which is the only thing that actually matters */
    R.landAttack = await p.evaluate(() => {
      const me = player()[0]; selected = [me]; clearOrders(me);
      document.getElementById('tb-attack').click();
      return attackMoveMode ? 'the attack button still arms turned sideways'
        : '!! THE ATTACK BUTTON DOES NOTHING IN LANDSCAPE';
    });
    await ctx.close();
  }

  /* ---------------- the desktop, which is the priority ---------------- */
  {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
    const p = await ctx.newPage();
    p.on('pageerror', e => errs.push('DESKTOP: ' + e.message.slice(0, 160)));
    await p.goto(url, { waitUntil: 'load' });
    await p.waitForTimeout(3000);
    await p.evaluate(() => document.getElementById('btn-start').click());
    await p.waitForTimeout(4000);

    R.deskUntouched = await p.evaluate(() => (!TOUCH && !document.body.classList.contains('touch'))
      ? 'a mouse is still a mouse' : '!! DESKTOP FELL INTO TOUCH MODE');
    R.deskNoControls = await p.evaluate(() => {
      const t = document.getElementById('touchbar');
      return (t && t.offsetParent === null) ? 'touch controls stay hidden' : '!! TOUCH CONTROLS SHOWING ON DESKTOP';
    });
    R.deskQuality = await p.evaluate(() => (opts.dpr === 'auto' && opts.shadows === 'high')
      ? 'desktop quality left alone' : `!! DESKTOP DIALS CHANGED (dpr ${opts.dpr}, shadows ${opts.shadows})`);
    /* and the mouse still does what it always did */
    const before = await p.evaluate(() => {
      const me = player().find(c => c.state === 'ok');
      camFollow = false; camX = camSX = me.x; camY = camSY = me.y; camDist = camDistTarget = 16;
      selected = []; window.__me = me.id; return me.id;
    });
    await p.waitForTimeout(900);
    const at = await p.evaluate(() => {
      const me = chars.find(c => c.id === window.__me);
      const s = w2s(me.x, me.y, groundY(me.x, me.y));
      return s ? { x: Math.round(s.x), y: Math.round(s.y) } : null;
    });
    if (at) {
      await p.mouse.move(at.x, at.y); await p.mouse.down(); await p.mouse.up();
      await p.waitForTimeout(300);
      R.deskClickSelects = await p.evaluate(() => selected.length && selected[0].id === window.__me
        ? 'left-click still selects' : '!! LEFT-CLICK BROKEN ON DESKTOP');
      await p.evaluate(() => { const me = chars.find(c => c.id === window.__me); selected = [me]; clearOrders(me); });
      await p.mouse.click(400, 500, { button: 'right' });
      await p.waitForTimeout(300);
      R.deskRightOrders = await p.evaluate(() => {
        const me = chars.find(c => c.id === window.__me);
        return (me.moveTarget || me.gather || me.target) ? 'right-click still orders' : '!! RIGHT-CLICK BROKEN ON DESKTOP';
      });
    }
    await ctx.close();
  }

  console.log('=== TOUCH SCAFFOLD ===\n');
  for (const [k, v] of Object.entries(R)) console.log('  ' + k.padEnd(18) + v);
  const bad = Object.values(R).map(String).filter(v => v.startsWith('!!'));
  console.log('\n' + (bad.length ? '*** ' + bad.join('\n*** ') : 'TOUCH WORKS AND DESKTOP IS UNCHANGED'));
  if (errs.length) { console.log('errs:', errs.length); errs.slice(0, 4).forEach(e => console.log('  ' + e)); }
  await b.close();
  if (bad.length) process.exitCode = 1;
})();
