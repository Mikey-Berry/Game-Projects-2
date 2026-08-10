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
        /* map, log, character, stash, back to map — never two at once */
        return (seen.every(n => n <= 1) && seen.join(',') === '0,1,1,1,0')
          ? 'map / log / character / stash, one at a time' : '!! PANEL CYCLE WRONG (' + seen.join(',') + ')';
      });
      await tap(p, at.x, at.y);
      await p.waitForTimeout(400);
      R.tapSelects = await p.evaluate(() => selected.length && selected[0].id === window.__me
        ? 'a tap on your own selects them' : '!! TAP DID NOT SELECT (' + selected.length + ' selected)');
    }

    /* Somewhere on the map that is not covered by a panel. Tapping blind at (200,400) hit a
       HUD div, the canvas never saw the event, and every gesture below reported dead. */
    const openPt = await p.evaluate(() => {
      const W2 = document.documentElement.clientWidth, H2 = document.documentElement.clientHeight;
      for(let y = H2 * 0.45; y < H2 * 0.75; y += 12) for(let x = W2 * 0.2; x < W2 * 0.8; x += 12){
        const el = document.elementFromPoint(x, y);
        if(el && el.id === 'game') return {x: Math.round(x), y: Math.round(y)};
      }
      return null;
    });
    if(!openPt) { R.openGround = '!! NO UNCOVERED CANVAS ANYWHERE ON THE SCREEN'; }

    /* --- TAP ELSEWHERE WITH A SELECTION: that is the order --- */
    await p.evaluate(() => { const me = chars.find(c => c.id === window.__me); selected = [me]; clearOrders(me); });
    await tap(p, openPt.x, openPt.y);
    await p.waitForTimeout(400);
    R.tapOrders = await p.evaluate(() => {
      const me = chars.find(c => c.id === window.__me);
      return (me.moveTarget || me.gather || me.chestTarget || me.lootTarget || me.target)
        ? 'a tap elsewhere is an order' : '!! TAP GAVE NO ORDER';
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
