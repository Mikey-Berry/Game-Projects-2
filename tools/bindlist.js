#!/usr/bin/env node
/* THE BINDING CIRCLE'S LIST, AND HOW LONG IT TAKES TO READ.
 *
 * "In the binding circle UI, the descriptions for all of these undead are getting a bit too
 *  long. Perhaps we can have an abbreviated description (ranged bow unit; ranged alchemist;
 *  etc...) and then leave the extended version for a mouseover. Or perhaps an
 *  expandable/collapsable 'description' button."
 *
 * The row is one line: name, then the whole of `ut.desc`, then the cost, the mana and the
 * slots. The description is a sentence or two of flavour and the four things a player actually
 * chooses on are behind it, so picking a binding means reading past the prose thirteen times.
 *
 * This is a length problem, so it is measured as one — the visible text of each row, against a
 * bar taken off the control rather than out of the air. The other half is the part that would
 * be easy to get wrong: the long text has to still be THERE, and reachable without a mouse,
 * because a hover tooltip is not an interface on a touchscreen.
 *
 *   node tools/bindlist.js [game.html]
 */
const { chromium } = require('playwright');
const path = require('path');
const gamePath = (a) => path.resolve(a ? (path.isAbsolute(a) ? a : path.join(__dirname, a)) : path.join(__dirname, 'game.html'));

(async () => {
  const b = await chromium.launch({ executablePath: process.env.DUSTWARD_CHROME || undefined,
    args: ['--use-gl=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox','--no-sandbox'] });
  const errs = [];
  const p = await b.newPage({ viewport: { width: 1200, height: 800 } });
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message.slice(0, 200)));
  await p.goto('file://' + gamePath(process.argv[2]), { waitUntil: 'load', timeout: 90000 });
  await p.waitForFunction(() => !!document.getElementById('btn-start'), null, { timeout: 60000 });
  await p.evaluate(() => { document.getElementById('btn-start').click(); paused = true; });
  await p.waitForFunction(() => typeof chars !== 'undefined' && chars.length > 0, null, { timeout: 60000 });
  await p.waitForTimeout(2000);

  /* a ritualist, a circle under them, and every rite researched so the whole list is on show */
  await p.evaluate(() => {
    paused = true;
    const me = player()[0];
    me.gift = 'dark'; me.state = 'ok'; me.stats.magic = 60; me.mana = 200;
    for (const t of ['rites_binding', 'rites_deep', 'rites_anchor']) research.done[t] = true;
    const c = { x: Math.round(me.x), y: Math.round(me.y), shape: null };
    window.__circle = c;
    openBinding(c);
  });
  await p.waitForTimeout(600);

  const R = await p.evaluate(() => {
    const O = {};
    const guard = (keys, fn) => {
      try { fn(); } catch (e) { for (const k of keys) if (O[k] === undefined) O[k] = '!! ' + String(e.message).slice(0, 150).toUpperCase(); }
    };
    const rows = () => Array.from(document.querySelectorAll('#modalbody .trow'))
      .filter(r => r.querySelector('[data-bind]'));

    guard(['_premise', 'theWholeListIsOnShow'], () => {
      const n = rows().length, want = Object.keys(UNDEAD_TYPES).length;
      O._premise = `${n} bindable rows drawn of ${want} in the table`;
      O.theWholeListIsOnShow = n === want
        ? `all ${n} bindings are on the page, so the list is the thing being measured`
        : `!! ONLY ${n} OF ${want} BINDINGS ARE DRAWN — THE PAGE IS NOT THE LIST`;
    });

    /* ---------- HOW LONG A ROW IS ----------
       The visible text of the row, which is what a player reads to choose. Measured in
       characters because that is what "too long" means here, and the bar is the control's own
       median rather than a number picked to be passed. */
    guard(['_len', 'aRowIsShortEnoughToScan'], () => {
      const lens = rows().map(r => r.querySelector('.tn').innerText.replace(/\s+/g, ' ').trim().length).sort((a, c) => a - c);
      const med = lens[Math.floor(lens.length / 2)], max = lens[lens.length - 1];
      O._len = `row length in characters: min ${lens[0]}, median ${med}, longest ${max}`;
      /* A ROW HAS FOUR NUMBERS AND A NAME IN IT BEFORE ANY PROSE — cost, mana, slots and the
         name run to about seventy characters on their own, so the bar is what is left once a
         description has stopped being a paragraph: a short role line and no more. */
      O.aRowIsShortEnoughToScan = (med <= 110 && max <= 150)
        ? `the median row is ${med} characters and the longest ${max} — a line, not a paragraph`
        : `!! ROWS ARE TOO LONG TO SCAN — MEDIAN ${med} CHARACTERS, LONGEST ${max}`;
    });

    /* ---------- AND IT STILL SAYS WHAT THE THING IS ----------
       "an abbreviated description (ranged bow unit; ranged alchemist; etc...)". Cutting the
       prose is easy; cutting it and leaving the row saying only a name is the failure. Every
       binding needs a role, and it has to be its own — a table where four things say
       "undead" has been shortened without being abbreviated. */
    guard(['_roles', 'andEveryBindingStillSaysWhatItIs'], () => {
      const ks = Object.keys(UNDEAD_TYPES);
      const roles = ks.map(k => (UNDEAD_TYPES[k].role || '').trim());
      const missing = ks.filter((k, i) => !roles[i]);
      const dupes = roles.filter((r, i) => r && roles.indexOf(r) !== i);
      const sameAsName = ks.filter((k, i) => roles[i] && roles[i].toLowerCase() === UNDEAD_TYPES[k].name.toLowerCase());
      O._roles = ks.map((k, i) => `${UNDEAD_TYPES[k].name}: ${roles[i] || '—'}`).join(' | ');
      O.andEveryBindingStillSaysWhatItIs = (!missing.length && !dupes.length && !sameAsName.length)
        ? `all ${ks.length} bindings carry a role of their own — ${roles.slice(0, 3).join('; ')}; and so on`
        : `!! ${missing.length} BINDINGS HAVE NO ROLE LINE${dupes.length ? `, ${dupes.length} SHARE ONE` : ''}${sameAsName.length ? `, ${sameAsName.length} JUST REPEAT THE NAME` : ''}`;
    });

    /* ---------- AND THE NUMBERS YOU CHOOSE ON ARE STILL ON THE ROW ----------
       The negative. A shorter row that dropped the cost or the slot weight would read better
       and be worse: those are the four things the decision is actually made on. */
    guard(['andTheNumbersAreStillOnTheRow'], () => {
      let bad = 0;
      for (const r of rows()) {
        const t = r.querySelector('.tn').innerText;
        if (!/mana/.test(t) || !/slot/.test(t) || !/\d/.test(t)) bad++;
      }
      O.andTheNumbersAreStillOnTheRow = bad === 0
        ? `every row still carries its cost, its mana and its slot weight`
        : `!! ${bad} ROWS LOST THE NUMBERS THE CHOICE IS MADE ON`;
    });

    /* ---------- AND THE LONG TEXT IS STILL REACHABLE, WITHOUT A MOUSE ----------
       "leave the extended version for a mouseover. Or perhaps an expandable/collapsable
       'description' button."
       A hover title is not an interface on a touchscreen, so both: the row carries the full
       text as a `title`, AND there is something to press that puts it on the page. The press
       is the one that is checked by pressing it. */
    guard(['_long', 'theLongTextIsAHoverAwayAndATapAway'], () => {
      const rs = rows();
      let titled = 0, toggles = 0;
      /* THE TITLE HAS TO BE THE TEXT, not merely a long one. A first cut asked for more than
         sixty characters and marked two rows missing because their descriptions are short —
         "Fast bone hound — runs down stragglers" is the whole of the Gravehound's and is
         thirty-eight. What is being claimed is that nothing was lost, so it is compared. */
      for (const r of rs) {
        const k = r.querySelector('[data-bind]').dataset.bind;
        const host = r.querySelector('[title]');
        if (host && host.getAttribute('title') === UNDEAD_TYPES[k].desc) titled++;
        if (r.querySelector('[data-desc]')) toggles++;
      }
      O._long = `${titled} of ${rs.length} rows carry the full text on hover, ${toggles} have something to press`;
      if (titled < rs.length || toggles < rs.length) {
        O.theLongTextIsAHoverAwayAndATapAway =
          `!! THE LONG TEXT IS NOT BOTH: ${titled} OF ${rs.length} ROWS HOVER, ${toggles} OF ${rs.length} CAN BE OPENED BY HAND`;
        return;
      }
      /* press one and see the prose arrive, press it again and see it go */
      const r0 = rs[0];
      const key = r0.querySelector('[data-bind]').dataset.bind;
      const full = UNDEAD_TYPES[key].desc;
      const btn = r0.querySelector('[data-desc]');
      btn.click();
      const openTxt = document.querySelector('#modalbody [data-descfor="' + key + '"]');
      const shown = !!(openTxt && openTxt.innerText.indexOf(full.slice(0, 40)) >= 0);
      const btn2 = rows().find(r => r.querySelector('[data-bind]') && r.querySelector('[data-bind]').dataset.bind === key).querySelector('[data-desc]');
      btn2.click();
      const gone = !document.querySelector('#modalbody [data-descfor="' + key + '"]');
      O.theLongTextIsAHoverAwayAndATapAway = (shown && gone)
        ? `all ${rs.length} rows hold the full text on hover and open it on a press — and it closes again`
        : `!! THE PRESS DOES NOT WORK (opened ${shown}, closed ${gone})`;
    });

    /* ---------- AND IT STILL BINDS ----------
       The row's markup is what carries the BIND button, and rewriting a row is exactly how a
       button stops being wired up. */
    guard(['andTheCircleStillBinds'], () => {
      const before = chars.filter(c => c.undead && c.crafted).length;
      /* stocked and then REOPENED. The list is drawn once when the circle opens and the BIND
         buttons are disabled off what the stores held at that moment, so adding the materials
         without redrawing leaves twelve dead buttons and a claim that fails for the harness's
         own reason. */
      for (const k of ['remains', 'hide', 'stone', 'fabric', 'wood', 'copper', 'vflesh']) addItem(k, 40);
      openBinding(window.__circle);
      const rs = rows();
      const btn = rs.map(r => r.querySelector('[data-bind]')).find(x => x && !x.disabled);
      if (!btn) { O.andTheCircleStillBinds = '!! NOTHING ON THE LIST COULD BE AFFORDED — NOTHING TO PRESS'; return; }
      const key = btn.dataset.bind;
      btn.click();
      const after = chars.filter(c => c.undead && c.crafted).length;
      O.andTheCircleStillBinds = after > before
        ? `pressing BIND on ${UNDEAD_TYPES[key].name} still raises one — ${before} to ${after}`
        : `!! BIND DID NOTHING — ${before} CRAFTED BEFORE AND ${after} AFTER`;
    });

    return O;
  });

  console.log('\n=== THE BINDING CIRCLE\'S LIST ===\n');
  const bad = [];
  for (const k of Object.keys(R)) {
    const v = String(R[k]);
    console.log('  ' + k.padEnd(44) + v.slice(0, 400));
    if (v.startsWith('!!')) bad.push(v);
  }
  for (const e of errs) bad.push(e);
  console.log('');
  for (const v of bad) console.log('*** ' + v);
  await b.close();
  process.exit(bad.length ? 1 : 0);
})();
