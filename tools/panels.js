#!/usr/bin/env node
/* THREE PANELS THAT WERE IN THE WAY, AND ONE THAT COULD NOT BE FOUND.
 *
 *   "Hitting I to open up the inventory screen should scroll to the top to show the character.
 *    Actually, the character model should always be visible in that screen, even if it means
 *    reducing the space for the list of items below it."
 *
 *   "The squad stash screen is just always there. Perhaps it can be a toggle so we can reduce
 *    noise when it's not needed."
 *
 *   "Maybe as with craft orders, the research desk can have a separate tab along the top of the
 *    screen to quickly access and see what's in the queue. Along these lines, the split between
 *    researching formula and continuing research is a bit vague as to how it works — could we
 *    make it clearer which one is being prioritized, or if it is indeed split? Sometimes I JUST
 *    want to focus on research, not formula."
 *
 * These are layout claims and they are asked of the LAYOUT — `getBoundingClientRect` and
 * `getComputedStyle` against the real rendered page, not against the strings that produced it.
 * A `position:sticky` that is defeated by an `overflow` on an ancestor computes as sticky and
 * scrolls away anyway, so the figure is checked by scrolling the pack to the bottom and asking
 * where the figure actually IS.
 *
 *   1. `#modalbody` is one element shared by every window, and it opens at the top
 *   2. the paperdoll is pinned: still on screen with the pack scrolled to its end
 *   3. the wagon folds to its title bar, and the title bar is still there to click
 *   4. [T] does it, and the choice is a saved dial rather than a session whim
 *   5. there is a tab, it opens the bench, and it carries the queue count
 *   6. the split is three explicit states and `benchSides` obeys each one
 *   7. and the choice survives a save — including an old save that only has `readFirst`
 *
 * Anything starting '!!' fails the build.
 *
 *   node tools/panels.js [game.html]
 */
const { chromium } = require('playwright');
const path = require('path');
const gamePath = (a) => path.resolve(a ? (path.isAbsolute(a) ? a : path.join(__dirname, a)) : path.join(__dirname, 'game.html'));

(async () => {
  const b = await chromium.launch({
    executablePath: process.env.DUSTWARD_CHROME || undefined,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'],
  });
  const p = await b.newPage({ viewport: { width: 1100, height: 720 } });
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message.slice(0, 200)));
  await p.goto('file://' + gamePath(process.argv[2]), { waitUntil: 'load' });
  await p.waitForTimeout(3000);
  await p.evaluate(() => { document.getElementById('btn-start').click(); paused = true; });
  await p.waitForTimeout(3000);

  const out = await p.evaluate(async () => {
    const R = {};
    paused = true;
    const raf = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const me = player()[0];

    /* A PACK LONG ENOUGH TO SCROLL. The whole complaint is about a list pushing the figure off
       the top, so the list has to actually be longer than the panel. */
    const keys = Object.keys(ITEMS).slice(0, 40);
    for (const k of keys) me.inv[k] = 3;
    for (const k of keys) stash[k] = (stash[k] || 0) + 3;

    /* ---- 1. IT OPENS AT THE TOP ---- */
    openInventory(me);
    await raf();
    const mb = document.getElementById('modalbody');
    mb.scrollTop = mb.scrollHeight;                      /* leave it where a previous window would */
    const wasScrolled = mb.scrollTop;
    document.getElementById('modalclose').click();
    openInventory(me);
    await raf();
    R.itOpensAtTheTop = (wasScrolled > 20 && mb.scrollTop === 0)
      ? `the kit screen opens at the top, on a scroller a previous window had left ${wasScrolled}px down`
      : `!! IT OPENS WHERE THE LAST WINDOW LEFT IT (${mb.scrollTop}px of a ${wasScrolled}px offset)`;

    /* ---- 2. AND THE FIGURE STAYS ---- */
    {
      const doll = mb.querySelector('.doll');
      if (!doll) { R.theFigureStays = '!! NO PAPERDOLL IN THE KIT SCREEN'; }
      else {
        const pos = getComputedStyle(doll).position;
        mb.scrollTop = mb.scrollHeight;
        await raf();
        const dr = doll.getBoundingClientRect(), sr = mb.getBoundingClientRect();
        const visible = dr.bottom > sr.top + 4 && dr.top < sr.bottom - 4;
        const room = sr.height - dr.height;
        R.theFigureStays = (visible && pos === 'sticky')
          ? `the figure is pinned (position:${pos}) and is still on screen with the pack scrolled ${mb.scrollTop}px to its end, leaving ${room.toFixed(0)}px for the list`
          : `!! THE FIGURE SCROLLS AWAY (position:${pos}, on screen ${visible})`;
      }
      mb.scrollTop = 0;
      document.getElementById('modalclose').click();
    }

    /* ---- 3 & 4. THE WAGON FOLDS ---- */
    {
      const panel = document.getElementById('invpanel');
      const title = document.getElementById('invtitle');
      const bodyEl = document.getElementById('invbody');
      if (typeof toggleStash !== 'function' || !title) {
        R.theWagonFolds = '!! THE WAGON PANEL HAS NO TOGGLE AT ALL';
        R.andTheChoiceIsADial = '!! NOTHING TO REMEMBER';
      } else {
        opts.stash = true; applyStashFold(); refreshInv(); await raf();
        const openH = panel.getBoundingClientRect().height;
        title.click(); await raf();
        const shutH = panel.getBoundingClientRect().height;
        const bodyGone = getComputedStyle(bodyEl).display === 'none';
        const titleThere = title.getBoundingClientRect().height > 4;
        R.theWagonFolds = (bodyGone && titleThere && shutH < openH * 0.5)
          ? `clicking the title folds the wagon from ${openH.toFixed(0)}px to ${shutH.toFixed(0)}px, and the ${shutH.toFixed(0)}px that is left is the line you click to bring it back`
          : `!! THE FOLD DOES NOT FOLD (${openH.toFixed(0)}px to ${shutH.toFixed(0)}px, body hidden ${bodyGone}, title left ${titleThere})`;

        /* the key, and the dial */
        dispatchEvent(new KeyboardEvent('keydown', { key: 't' }));
        await raf();
        const backOpen = opts.stash === true && getComputedStyle(bodyEl).display !== 'none';
        let saved = null;
        try { saved = JSON.parse(localStorage.getItem('dustward_opts') || '{}').stash; } catch (e) {}
        dispatchEvent(new KeyboardEvent('keydown', { key: 't' }));
        await raf();
        let savedShut = null;
        try { savedShut = JSON.parse(localStorage.getItem('dustward_opts') || '{}').stash; } catch (e) {}
        R.andTheChoiceIsADial = (backOpen && saved === true && savedShut === false)
          ? '[T] works both ways and the choice is written to the options, so a new world opens the way you left it'
          : `!! THE FOLD IS NOT REMEMBERED (key reopened ${backOpen}, stored open ${saved}, stored shut ${savedShut})`;
        opts.stash = true; saveOpts(); applyStashFold(); refreshInv();
      }
    }

    /* ---- 5. THE TAB ---- */
    {
      const btn = document.getElementById('btn-study');
      if (!btn) { R.thereIsATab = '!! NO RESEARCH TAB ON THE TOP BAR'; R.andItCarriesTheQueue = '!! NO TAB'; }
      else {
        /* a bench, or the tab is correctly dead */
        const bench = { type: 'r_bench', x: Math.round(me.x) + 3, y: Math.round(me.y) + 3, w: 2, h: 2,
                        floor: 0, hp: 90, maxHp: 90, progress: 1, __probe: true };
        pBuilds.push(bench);
        research.active = null; research.queue.length = 0;
        refreshStudyBtn();
        const bare = btn.textContent;
        research.active = 'construction'; research.queue.push('smithing', 'smelting');
        refreshStudyBtn();
        const loaded = btn.textContent;
        btn.click();
        const opened = document.getElementById('modaltitle').textContent;
        document.getElementById('modalclose').click();
        R.thereIsATab = /RESEARCH/i.test(opened) || /BENCH/i.test(opened)
          ? `a RESEARCH tab on the top bar opens "${opened}" from anywhere`
          : `!! THE TAB OPENED "${opened}"`;
        R.andItCarriesTheQueue = (!/·/.test(bare) && /·3/.test(loaded))
          ? `and it says what is in hand: "${bare.trim()}" empty, "${loaded.trim()}" with a project and two behind it`
          : `!! THE TAB DOES NOT SHOW THE QUEUE ("${bare.trim()}" then "${loaded.trim()}")`;
        research.active = null; research.queue.length = 0;
        for (let i = pBuilds.length - 1; i >= 0; i--) if (pBuilds[i].__probe) pBuilds.splice(i, 1);
      }
    }

    /* ---- 6. AND THE SPLIT IS THREE THINGS, NOT TWO ----
       Asked at `benchSides`, which is the function the rates are computed from, so this is the
       behaviour and not the label. Four scholars at two benches: with both a project and a
       reading running, each setting has to move them somewhere different. */
    {
      const bench2 = [];
      const crew = [];
      for (let n = 0; n < 2; n++) {
        const bl = { type: 'r_bench', x: Math.round(me.x) + 8 + n * 14, y: Math.round(me.y) + 8,
                     w: 2, h: 2, floor: 0, hp: 90, maxHp: 90, progress: 1, __probe: true };
        pBuilds.push(bl); bench2.push(bl);
        for (let k = 0; k < 2; k++) {
          const c = makeChar('Probe Scholar ' + n + k, 'player', bl.x + 1 + k * 0.5, bl.y + 1,
                             { atk: 3, def: 3, tough: 8, magic: 20, study: 20 });
          c.__probe = true; c.floor = 0; c.job = 'research'; chars.push(c); crew.push(c);
        }
      }
      rebuildCharGrid();
      research.active = 'construction'; research.left = 40;
      research.study = beginReading([Object.keys(ITEMS).find(k => ITEMS[k].rp) || 'f_ashen']);
      const seated = benchSeated().length;
      const read = {};
      for (const f of ['split', 'desk', 'tree']) {
        research.focus = f; research.readFirst = (f === 'desk');
        const s = benchSides();
        read[f] = s.read.length + '/' + s.tree.length;
      }
      const threeWay = typeof research.focus === 'string'
        && read.desk === seated + '/0' && read.tree === '0/' + seated
        && read.split !== read.desk && read.split !== read.tree;
      R.theSplitIsThreeThings = threeWay
        ? `${seated} seated scholars, and the dial moves them: SPLIT ${read.split}, FORMULAE ONLY ${read.desk}, RESEARCH ONLY ${read.tree} (desk/tree)`
        : `!! THE DIAL CANNOT SAY "RESEARCH ONLY" — split ${read.split}, desk ${read.desk}, tree ${read.tree} of ${seated} seated`;

      /* ---- 7. AND IT SURVIVES A SAVE ---- */
      research.focus = 'tree'; research.readFirst = false;
      const snap = snapshot();
      research.focus = 'split';
      restore(snap);
      const kept = research.focus === 'tree';
      /* and the shape an older save has: only the two-state flag */
      const old = snapshot();
      delete old.research.focus; old.research.readFirst = true;
      restore(old);
      const upgraded = research.focus === 'desk';
      R.andTheChoiceSurvivesASave = (kept && upgraded)
        ? 'the focus is saved and reloaded, and an older save carrying only `readFirst` comes back as FORMULAE ONLY'
        : `!! THE FOCUS DOES NOT SURVIVE (round trip ${kept}, old save ${research.focus})`;

      research.focus = 'split'; research.readFirst = false;
      research.active = null; research.study = null;
      for (let i = chars.length - 1; i >= 0; i--) if (chars[i].__probe) chars.splice(i, 1);
      for (let i = pBuilds.length - 1; i >= 0; i--) if (pBuilds[i].__probe) pBuilds.splice(i, 1);
      rebuildCharGrid();
    }
    return R;
  });

  console.log('=== THREE PANELS THAT WERE IN THE WAY ===\n');
  for (const [k, v] of Object.entries(out)) console.log('  ' + k.padEnd(28) + v);
  const bad = Object.values(out).map(String).filter(v => v.startsWith('!!'));
  if (errs.length) { console.log(''); errs.slice(0, 4).forEach(e => console.log('  ' + e)); }
  console.log('\n' + (bad.length || errs.length
    ? '*** ' + [...bad, ...errs].join('\n*** ')
    : 'THE FIGURE STAYS, THE WAGON FOLDS, AND THE DESK HAS A DOOR'));
  await b.close();
  process.exit(bad.length || errs.length ? 1 : 0);
})();
