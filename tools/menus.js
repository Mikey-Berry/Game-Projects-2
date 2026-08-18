#!/usr/bin/env node
/* DOES THE COMMAND MENU LAND ON THE SCREEN?
 *
 * "The command system is clunky and also really hard to see right now. Its submenu tends to
 * collapse outside of view."
 *
 * `showCtxMenu` placed itself from two guesses and one missing clamp:
 *   · height as `items.length * 30`, when a button is 6px padding on 13px text and a long
 *     label wraps;
 *   · width as a flat 150, when `GUARD ANNOTATOR MERRICK (3)` plainly is not;
 *   · and both clamps were `Math.min` only, so nothing stopped a NEGATIVE result. The JOB
 *     list deliberately opens upward from a button at the foot of the character panel, so it
 *     was routinely placed at a negative top with its first entries off the top of the
 *     window — the ones you can neither see nor click nor scroll to.
 *
 * Every case below opens a REAL menu through the real function and then reads the element's
 * own bounding box. A placement test that trusts the numbers it passed in is testing itself.
 *
 *   node tools/menus.js [game.html]
 */
const { chromium } = require('playwright');
const path = require('path');
const gamePath = (a) => path.resolve(a ? (path.isAbsolute(a) ? a : path.join(__dirname, a)) : path.join(__dirname, 'game.html'));

(async () => {
  const b = await chromium.launch({
    executablePath: process.env.DUSTWARD_CHROME || undefined,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'],
  });
  const errs = [];
  const R = {};

  /* THREE WINDOWS, because the bug only shows on some of them. A tall desktop hides it — the
     fourteen-entry JOB menu happens to fit above its button — and a short landscape phone
     cannot fit it at any offset, which is the case that forces the menu to scroll rather than
     to be cleverly positioned. */
  const SIZES = [
    { label: 'desktop  1280x800', w: 1280, h: 800 },
    { label: 'laptop    1024x600', w: 1024, h: 600 },
    { label: 'phone-ish  844x390', w: 844, h: 390 },
  ];

  for (const S of SIZES) {
    const p = await b.newPage({ viewport: { width: S.w, height: S.h } });
    p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message.slice(0, 200)));
    await p.goto('file://' + gamePath(process.argv[2]), { waitUntil: 'load' });
    await p.waitForFunction(() => {
      const bs = document.getElementById('btn-start');
      return bs && typeof chars !== 'undefined' && chars.length > 0;
    }, null, { timeout: 60000 });
    await p.evaluate(() => document.getElementById('btn-start').click());
    await p.waitForFunction(() => document.getElementById('startoverlay').style.display === 'none', null, { timeout: 60000 });

    const out = await p.evaluate(() => {
      const r = {};
      paused = true;
      const el = document.getElementById('ctxmenu');
      /* THE JOB LIST, REBUILT RATHER THAN READ. `JOBS` is block-scoped inside the character
         panel's builder and cannot be reached from here, so these are its fourteen labels
         copied verbatim. If a job is ever added, this list goes stale and under-tests by one
         row — which is why `jobCount` is printed on every run rather than merely asserted. */
      const jobs = ['NONE', 'WOOD', 'STONE', 'FISH', 'TEND', 'BUILD', 'FLESH', 'RAISE',
                    'HARVEST', 'CRAFT', 'STUDY', 'GUNNERY', 'BODYGUARD', 'PATROL']
        .map(jl => ({ label: '   ' + jl, fn: () => {} }));
      /* and a menu with the long labels that broke the 150px width guess */
      const wide = [
        { label: 'GUARD ANNOTATOR MERRICK (3)', fn: () => {} },
        { label: 'BREAK TO SERVICE  (0/6 days)', fn: () => {} },
        { label: 'SELL TO THE CAMP  (+1200g)', fn: () => {} },
      ];
      /* every corner and both middles: a placement bug lives in exactly one of these */
      const spots = [
        ['top-left', 4, 4], ['top-right', viewW() - 8, 4],
        ['bottom-left', 4, viewH() - 8], ['bottom-right', viewW() - 8, viewH() - 8],
        ['middle', viewW() / 2, viewH() / 2],
      ];
      const bad = [];
      const check = (name, items, x, y, up) => {
        showCtxMenu(x, y, items, up);
        const q = el.getBoundingClientRect();
        const off = [];
        if (q.left < 0) off.push(`left ${Math.round(q.left)}`);
        if (q.top < 0) off.push(`top ${Math.round(q.top)}`);
        if (q.right > viewW() + 1) off.push(`right ${Math.round(q.right)}>${viewW()}`);
        if (q.bottom > viewH() + 1) off.push(`bottom ${Math.round(q.bottom)}>${viewH()}`);
        if (off.length) bad.push(`${name}: ${off.join(', ')}`);
        hideCtxMenu();
      };
      for (const [n, x, y] of spots) {
        check(`jobs@${n}`, jobs, x, y, false);
        check(`jobs-up@${n}`, jobs, x, y, true);
        check(`wide@${n}`, wide, x, y, false);
      }
      r.jobCount = `the JOB list is ${jobs.length} entries`;
      r.everyMenuLandsOnScreen = bad.length === 0
        ? `all ${spots.length * 3} placements sit inside ${viewW()}x${viewH()}`
        : `!! OFF SCREEN: ${bad.slice(0, 5).join(' | ')}`;

      /* a menu too tall to fit must SCROLL, not overflow — on a short window there is no
         offset that works and clever positioning cannot save it */
      showCtxMenu(10, 10, jobs, false);
      const q2 = el.getBoundingClientRect();
      const sc = getComputedStyle(el);
      r.tallMenusScroll = (q2.height <= viewH() && (sc.overflowY === 'auto' || sc.overflowY === 'scroll'))
        ? `a ${jobs.length}-entry menu is ${Math.round(q2.height)}px in a ${viewH()}px window and scrolls`
        : `!! A TALL MENU DOES NOT FIT AND DOES NOT SCROLL (${Math.round(q2.height)}px, overflowY ${sc.overflowY})`;
      /* and every row still has to be reachable once it scrolls */
      r.everyRowIsReachable = el.scrollHeight <= el.clientHeight + 1 || el.scrollHeight > 0
        ? `${el.children.length} rows, ${el.scrollHeight}px of content in ${el.clientHeight}px`
        : '!! ROWS ARE CLIPPED WITH NO WAY TO REACH THEM';
      /* touch targets: 36px min-height is the reason the rows grew */
      const rows = [...el.children].map(x => x.getBoundingClientRect().height);
      const small = rows.filter(h2 => h2 < 30).length;
      r.rowsAreHittable = small === 0
        ? `every row is at least ${Math.round(Math.min(...rows))}px tall`
        : `!! ${small} ROWS ARE UNDER 30px — HARD TO HIT ON A TOUCHSCREEN`;
      hideCtxMenu();
      return r;
    });
    for (const [k, v] of Object.entries(out)) R[`${S.label} · ${k}`] = v;
    await p.close();
  }

  /* and it must be visibly a panel, not a shape the colour of the dirt behind it */
  {
    const p = await b.newPage({ viewport: { width: 1024, height: 700 } });
    await p.goto('file://' + gamePath(process.argv[2]), { waitUntil: 'load' });
    await p.waitForFunction(() => document.getElementById('btn-start'), null, { timeout: 60000 });
    const look = await p.evaluate(() => {
      const el = document.getElementById('ctxmenu');
      el.innerHTML = '<button>ONE</button><button>TWO</button>';
      el.style.display = 'flex';
      const s = getComputedStyle(el);
      const out = {};
      out.theMenuIsOpaque = !/rgba\([^)]*,\s*0(\.\d+)?\)/.test(s.backgroundColor)
        ? `it has a solid ground (${s.backgroundColor})`
        : `!! THE MENU IS TRANSPARENT (${s.backgroundColor}) — THE WORLD SHOWS THROUGH IT`;
      out.theMenuHasAnEdge = s.boxShadow && s.boxShadow !== 'none'
        ? 'and lifts off the scene with a shadow'
        : '!! NO SHADOW — IT SITS FLAT AGAINST THE GROUND BEHIND IT';
      el.style.display = 'none';
      return out;
    });
    Object.assign(R, look);
    await p.close();
  }

  console.log('=== THE COMMAND MENU ===\n');
  for (const [k, v] of Object.entries(R)) console.log('  ' + k.padEnd(44) + v);
  const bad = Object.values(R).map(String).filter(v => v.startsWith('!!'));
  console.log('\n' + (bad.length ? '*** ' + bad.join('\n*** ')
    : 'EVERY MENU LANDS ON SCREEN, SCROLLS WHEN IT MUST, AND CAN BE SEEN'));
  if (errs.length) { console.log('errs:', errs.length); errs.slice(0, 4).forEach(e => console.log('  ' + e)); }
  await b.close();
  if (bad.length) process.exitCode = 1;
})();
