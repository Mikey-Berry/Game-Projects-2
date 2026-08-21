#!/usr/bin/env node
/* CAN A FINGER START THIS GAME?
 *
 * "Mobile view fix — right now I can't even start the game since the character creation screen
 * is too packed." Not cramped. Unreachable: measured on three phone viewports before anything
 * changed, the start panel's content stood 843px tall inside a 640px box, WAKE UP sat at
 * y=799, and a tap on it timed out on every one of them.
 *
 * WHY tools/mobile.js WAS GREEN THROUGH ALL OF IT, which is the part worth keeping. That file
 * is a BUDGET: triangles, draw calls, save size, how many touch targets are under 44px. It
 * never opens the start screen and never taps anything, and its "mobile UI not started" list
 * is deliberately non-failing so an unfinished port does not block every commit. So the one
 * claim that has to hold — you can get INTO the game — had no file that would go red for it.
 * This is that file. It asserts one thing and it fails on it.
 *
 * THREE SEPARATE FAILURES SHARED THE SYMPTOM, and each gets its own assertion, because a fix
 * for any one of them alone still leaves an unstartable game:
 *   1. the panel did not scroll — content taller than the box, `overflow:visible`.
 *   2. `justify-content:center` on a flex column overflows BOTH ENDS, and overflow past the
 *      START edge is outside the scroll range in every browser. Adding `overflow-y:auto` on
 *      its own buys the bottom of the panel and loses the top, which is a different
 *      unreachable screen — so the top is asserted too, and it is the half most likely to be
 *      "simplified" back out.
 *   3. the squad bar (z-index 35, `body.touch` only) sat in front of the button. The panel was
 *      at 20. Scrolling made no difference because the button was never the thing being tapped.
 *
 * THE TAP GOES TO A COORDINATE, NOT THROUGH `locator.tap()`, and this took some finding.
 * `locator.tap()` reports "visible, enabled and stable", says "done scrolling", and then hangs
 * on its own hit-target retry against a page whose canvas is repainting every frame — it never
 * dispatches. Measured: `locator.tap()` and `locator.click()` both fail while a plain
 * `touchscreen.tap()` at the very same coordinate starts the game, and a scripted `.click()`
 * on the element starts it too. So the wrapper was the thing that could not hit the button.
 * Swallowing that as a red would have been a probe blaming the game for its own failure — and
 * asserting on the scripted `.click()` instead would have been worse, because that bypasses
 * layout entirely and passes just as happily on a button parked off the bottom of the screen.
 * What is dispatched here is a real touch at the middle of the button, which is what a finger
 * is, and occlusion is asserted separately by `elementFromPoint` so the coordinate cannot be
 * hitting something else and calling it a pass.
 *
 *   node tools/start.js [game.html]
 */
const { chromium } = require('playwright');
const path = require('path');
const gamePath = (a) => path.resolve(a ? (path.isAbsolute(a) ? a : path.join(__dirname, a)) : path.join(__dirname, 'game.html'));

/* Real handsets, smallest first. The small Android is the one that matters — a 360px-wide
   screen is still the commonest phone width in the world and it is where this broke worst. */
const PHONES = [
  { w: 360, h: 640, n: 'small Android' },
  { w: 375, h: 667, n: 'iPhone SE' },
  { w: 390, h: 844, n: 'iPhone 12' },
  { w: 414, h: 896, n: 'iPhone 11' },
];

(async () => {
  const b = await chromium.launch({
    executablePath: process.env.DUSTWARD_CHROME || undefined,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'],
  });
  const rows = [];
  for (const vp of PHONES) {
    const p = await b.newPage({ viewport: { width: vp.w, height: vp.h }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    const errs = [];
    p.on('pageerror', e => errs.push(String(e.message).slice(0, 140)));
    await p.goto('file://' + gamePath(process.argv[2]), { waitUntil: 'load' });
    await p.waitForTimeout(2500);

    const geom = await p.evaluate(() => {
      const o = document.getElementById('startoverlay'), s = document.getElementById('btn-start');
      if (!o || !s) return { fatal: !o ? 'no #startoverlay' : 'no #btn-start' };
      /* WHERE THE BUTTON SITS IN THE PANEL'S OWN SCROLL SPACE, which is the question — a
         viewport rectangle only says where it is right now. */
      o.scrollTop = 0;
      const top0 = o.getBoundingClientRect().top;
      const first = o.querySelector('h1');
      const firstTopAtScrollZero = first ? Math.round(first.getBoundingClientRect().top - top0) : null;
      s.scrollIntoView({ block: 'center' });
      const r = s.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      let onTop = 'nothing';
      if (hit) { let n = hit, c = []; while (n && n !== document.body && c.length < 4) { c.push(n.id ? '#' + n.id : n.tagName); n = n.parentElement; } onTop = c.join(' < '); }
      return {
        scrollH: o.scrollHeight, clientH: o.clientHeight,
        canScroll: getComputedStyle(o).overflowY,
        firstTopAtScrollZero,
        btnInView: Math.round(r.top) >= 0 && Math.round(r.bottom) <= innerHeight,
        btnRect: `${Math.round(r.top)}..${Math.round(r.bottom)} of ${innerHeight}`,
        isTheButton: hit === s, onTop,
        minHit: Math.min(Math.round(r.width), Math.round(r.height)),
        /* where a finger would land. Only offered when the button is actually on screen — a
           coordinate outside the viewport is not a tap, it is a guess. */
        tapAt: (r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth)
          ? { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) } : null,
      };
    });

    let started = false;
    if (!geom.fatal && geom.tapAt) {
      /* a real touch, at the middle of the button, in the coordinate space the page reported.
         If the button is off-screen this lands on whatever IS there and the game stays put,
         which is the correct answer for an unreachable button. */
      await p.touchscreen.tap(geom.tapAt.x, geom.tapAt.y);
      /* worldgen runs on the main thread under software rendering: give it room, but poll so a
         fast machine is not made to wait for the worst case */
      for (let i = 0; i < 20 && !started; i++) {
        await p.waitForTimeout(1000);
        started = await p.evaluate(() => {
          const o = document.getElementById('startoverlay');
          return !!o && getComputedStyle(o).display === 'none';
        });
      }
    }
    rows.push({ vp, geom, started, errs });
    await p.close();
  }

  const R = {};
  const fatal = rows.filter(r => r.geom.fatal);
  R.theScreensTested = `${PHONES.length} phone viewports, ${PHONES[0].w}px to ${PHONES[PHONES.length - 1].w}px wide`;

  if (fatal.length) {
    R.thePanelExists = `!! ${fatal.map(r => r.vp.n + ': ' + r.geom.fatal).join('; ')}`;
  } else {
    /* 1. it scrolls at all */
    const noScroll = rows.filter(r => !/(auto|scroll)/.test(r.geom.canScroll) && r.geom.scrollH > r.geom.clientH + 4);
    R._howTallItIs = rows.map(r => `${r.vp.n} ${r.geom.scrollH}px in ${r.geom.clientH}px`).join(' · ');
    R.thePanelScrollsWhenItOverflows = noScroll.length === 0
      ? 'the start panel scrolls on every one of them when its content is taller than the screen'
      : `!! ${noScroll.map(r => r.vp.n + ' overflows by ' + (r.geom.scrollH - r.geom.clientH) + 'px WITH overflow-y:' + r.geom.canScroll).join('; ')}`;

    /* 2. the TOP of it is inside the scroll range — the half `overflow-y:auto` does not fix */
    const lostTop = rows.filter(r => r.geom.firstTopAtScrollZero !== null && r.geom.firstTopAtScrollZero < -1);
    R.andTheTopOfItIsReachableToo = lostTop.length === 0
      ? 'and scrolled to the top, the title is on screen — nothing is stranded above the scroll range'
      : `!! ${lostTop.map(r => `${r.vp.n} HAS ${-r.geom.firstTopAtScrollZero}px ABOVE ITS OWN SCROLL RANGE`).join('; ')} — this is centred-flex overflow, not a missing scrollbar`;

    /* 3. nothing is in front of the button */
    const covered = rows.filter(r => !r.geom.isTheButton);
    R.nothingSitsInFrontOfTheButton = covered.length === 0
      ? 'and WAKE UP is the topmost thing at its own centre on every one of them'
      : `!! COVERED ON ${covered.map(r => r.vp.n + ' by ' + r.geom.onTop).join('; ')}`;

    /* and the one that matters */
    const dead = rows.filter(r => !r.started);
    R.aFingerStartsTheGame = dead.length === 0
      ? `and a tap on it starts the game on all ${rows.length} — the panel is gone afterwards`
      : `!! THE GAME CANNOT BE STARTED ON ${dead.map(r => `${r.vp.n} (${r.vp.w}x${r.vp.h}, button at ${r.geom.btnRect}${r.geom.tapAt ? '' : ', NEVER CAME ON SCREEN TO BE TAPPED'})`).join('; ')}`;

    /* a button you can hit. The command menu already sizes for 44px; so should the one door
       into the game. */
    const small = rows.filter(r => r.geom.minHit < 44);
    R.andItIsBigEnoughToHit = small.length === 0
      ? `and it is at least 44px on its short side everywhere (smallest ${Math.min(...rows.map(r => r.geom.minHit))}px)`
      : `!! WAKE UP IS ${small.map(r => r.vp.n + ' ' + r.geom.minHit + 'px').join('; ')} — under the 44px touch target`;
  }

  console.log('=== CAN A FINGER START THIS GAME ===\n');
  for (const [k, v] of Object.entries(R)) console.log('  ' + (k.startsWith('_') ? ('· ' + k.slice(1)).padEnd(32) : k.padEnd(32)) + v);
  const pageErrs = [...new Set(rows.flatMap(r => r.errs))];
  if (pageErrs.length) console.log('\n  ' + 'andItLoadsWithoutThrowing'.padEnd(32) + `!! ${pageErrs.length} PAGE ERROR(S) — ${pageErrs.slice(0, 2).join(' | ')}`);
  const bad = Object.values(R).map(String).filter(v => v.startsWith('!!'));
  console.log('\n' + (bad.length || pageErrs.length
    ? '*** ' + [...bad, ...(pageErrs.length ? ['page errors on load'] : [])].join('\n*** ')
    : 'THE GAME CAN BE STARTED WITH A FINGER'));
  await b.close();
  if (bad.length || pageErrs.length) process.exitCode = 1;
})();
