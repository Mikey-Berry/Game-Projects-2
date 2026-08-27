#!/usr/bin/env node
/* WHAT THE BAR PROMISES, AND WHAT WALKS OUT OF IT.
 *
 * "Sometimes the displayed conviction an NPC has at the bar changes after they get hired."
 *
 * The hiring row is the only place in this game where you are shown a person's character
 * before you pay for them, and it is the whole reason to pay more for one than another —
 * a Compassionate hand and a Cruel one are two different runs. So the row is a CONTRACT, and
 * every field on it has to survive the transaction.
 *
 * This reads the rendered row out of the DOM and compares it against the body that appears in
 * the squad, rather than comparing the recruit object against the char: the bug is precisely
 * a difference between what is displayed and what is delivered, so the display is the side
 * that has to be read.
 *
 *   node tools/hire.js [game.html]
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
      try { fn(); } catch (e) { for (const k of keys) if (R[k] === undefined) R[k] = '!! ' + String(e.message).slice(0, 100).toUpperCase(); }
    };

    /* ---------- HIRE EVERY RECRUIT IN THE WORLD ----------
       One hire proves nothing about a re-roll: a re-rolled conviction lands on the advertised
       one about one time in eight by chance, so a single-sample probe is a coin that comes up
       green 12% of the time. Every board in the world, every row on it. */
    const hired = [];
    let rows = 0, convMatched = 0, giftMatched = 0, statMatched = 0, nameMatched = 0, raceMatched = 0;
    const convMisses = [], statMisses = [];
    guard(['everyRowIsATrade'], () => {
      cats = 9e6;
      for (const t of towns) {
        while (t.recruits.length < 4) t.recruits.push(makeRecruit(t));
        const v = { town: t, name: 'probe', x: t.x, y: t.y };
        while (t.recruits.length) {
          openBar(v);
          const row = document.querySelector('#modalbody [data-hire]');
          if (!row) break;
          const line = row.closest('.trow').textContent;
          const r = t.recruits[+row.dataset.hire];
          const before = new Set(chars.filter(c => c.faction === 'player'));
          row.click();
          const c = chars.filter(x => x.faction === 'player').find(x => !before.has(x));
          if (!c) break;
          hired.push(c);
          rows++;
          /* THE SQUAD CAP IS NOT THE SUBJECT. `bannerLoad() >= SQUAD_CAP` refuses the tenth
             hire, and nine rows is a sample small enough that a re-roll landing on the
             advertised conviction by luck is a real risk. Each body is measured and then
             stood down out of the banner so the next row can be bought. */
          c.faction = 'drifter'; c.__probe = true;
          /* THE ROW IS THE CONTRACT. Read the words that were on the screen, not the object
             behind them — `CONVICTIONS[k].label` is what the player was shown. */
          const shownConv = (CONVICTIONS[r.conviction] || CONVICTIONS.cold).label;
          const gotConv = (CONVICTIONS[c.conviction] || CONVICTIONS.cold).label;
          if (!line.includes(shownConv)) { rows--; hired.pop(); continue; }   /* the row did not say it: not a trial */
          if (shownConv === gotConv) convMatched++;
          else if (convMisses.length < 4) convMisses.push(`${r.name}: bar said ${shownConv}, squad has ${gotConv}`);
          if ((r.gift || null) === (c.gift || null)) giftMatched++;
          if (r.name === c.name) nameMatched++;
          if ((r.race || 'human') === (c.race || 'human') && (r.sub || null) === (c.sub || null)) raceMatched++;
          /* ---------- THE NUMBERS ON THE ROW, NOT THE NUMBERS BEHIND IT ----------
             The first version of this compared `r.stats` against `c.stats` and found 22 of 29
             "lying" — which was true of the DISPLAY and not of the object: `makeChar` adds the
             line's flat gifts on top of the roll, so the raw recruit was never going to equal
             the body and never should have. What the player is owed is that the four numbers
             PRINTED ON THE ROW are the four numbers on the body, so those are what is read. */
          const shown = {};
          for (const [, k, v] of line.matchAll(/\b(atk|def|tough|med|mag)\s+([\d.]+)/g)) shown[k === 'med' ? 'medic' : k === 'mag' ? 'magic' : k] = +v;
          const keys = Object.keys(shown);
          const off = keys.filter(k => Math.abs(shown[k] - (c.stats[k] || 0)) >= 0.05);
          if (keys.length >= 4 && !off.length) statMatched++;
          else if (statMisses.length < 5) statMisses.push(keys.length < 4 ? `${r.name}: the row printed no stats at all`
            : `${r.name} ${off.map(k => `${k} shown ${shown[k]}, got ${(c.stats[k] || 0).toFixed(1)}`).join(', ')}`);
        }
      }
      R.everyRowIsATrade = rows >= 20 ? `${rows} rows read off the bar and hired, across ${towns.length} towns`
        : `!! ONLY ${rows} ROWS COULD BE HIRED — nothing was measured`;
    });

    guard(['theConvictionIsTheOneShown'], () => {
      R.theConvictionIsTheOneShown = convMatched === rows
        ? `all ${rows} of them keep the conviction the bar advertised`
        : `!! ${rows - convMatched} OF ${rows} CHANGED CONVICTION ON HIRE — ${convMisses.join(' | ')}`;
    });
    guard(['andSoDoesEverythingElseOnTheRow'], () => {
      const bad = [];
      if (nameMatched !== rows) bad.push(`name ${nameMatched}/${rows}`);
      if (giftMatched !== rows) bad.push(`gift ${giftMatched}/${rows}`);
      if (raceMatched !== rows) bad.push(`race/line ${raceMatched}/${rows}`);
      if (statMatched !== rows) bad.push(`the printed stats ${statMatched}/${rows} — ${statMisses.join(' | ')}`);
      R.andSoDoesEverythingElseOnTheRow = bad.length === 0
        ? 'and the name, the gift, the line and every stat printed on the row come through unchanged'
        : `!! THE ROW LIED ABOUT: ${bad.join(', ')}`;
    });

    /* ---------- AND IT IS THE ADVERTISED ONE, NOT MERELY A STABLE ONE ----------
       A fix that pinned every hire to `cold` would pass the test above. So: the convictions
       that came out have to be spread the way the roll is, and they have to be reachable. */
    guard(['andItIsNotJustOneConviction'], () => {
      const seen = new Set(hired.map(c => c.conviction));
      R.andItIsNotJustOneConviction = seen.size >= 4
        ? `and ${seen.size} different convictions came through, so it is the advertised one and not a constant`
        : `!! EVERY HIRE CAME OUT ${[...seen].join('/')} — THAT IS A CONSTANT, NOT A CONTRACT`;
    });

    /* ---------- A DARK GIFT STILL FORECLOSES DEVOUT ----------
       `convictionOpen` is the one rule the bar must not be able to advertise past, and a fix
       that copies the recruit's conviction straight across would carry a bad one if the roll
       could ever produce it. Ask both ends. */
    guard(['andTheGiftStillRulesOneOut'], () => {
      let dark = 0, devoutDark = 0;
      for (const c of hired) { if (c.gift === 'dark') { dark++; if (c.conviction === 'devout') devoutDark++; } }
      for (const t of towns) for (let i = 0; i < 400; i++) {
        const r = makeRecruit(t);
        if (r.gift === 'dark') { dark++; if (r.conviction === 'devout') devoutDark++; }
      }
      R.andTheGiftStillRulesOneOut = (dark >= 50 && devoutDark === 0)
        ? `and across ${dark} dark-gifted hands not one is Devout, which is the rule the roll already had`
        : dark < 50 ? `!! ONLY ${dark} DARK-GIFTED HANDS — nothing was tested`
        : `!! ${devoutDark} DEVOUT DARK ALCHEMISTS CAME OFF THE BAR`;
    });

    /* ---------- AND IT SURVIVES THE SAVE ----------
       A conviction that is right until you reload is the same bug one layer down: `restore`
       re-rolls anything `convictionOpen` refuses, and it is the obvious place for this to
       come undone a second time. */
    guard(['andItRidesTheSave'], () => {
      for (const c of hired) if (chars.includes(c)) c.faction = 'player';
      const want = hired.filter(c => chars.includes(c)).map(c => [c.name, c.conviction]);
      restore(JSON.parse(JSON.stringify(snapshot())));
      let kept = 0, found = 0;
      for (const [n, k] of want) {
        const c = chars.find(x => x.name === n && x.faction === 'player');
        if (c) { found++; if (c.conviction === k) kept++; }
      }
      R.andItRidesTheSave = (found >= 20 && kept === found)
        ? `and all ${kept} of them still have it after a reload`
        : found < 20 ? `!! ONLY ${found} OF ${want.length} CAME BACK FROM THE SAVE AT ALL`
        : `!! ${found - kept} OF ${found} LOST THEIR CONVICTION TO A RELOAD`;
    });

    return R;
  });

  const bad = Object.values(out).filter(v => typeof v === 'string' && v.startsWith('!!'));
  for (const [k, v] of Object.entries(out)) console.log('  ' + k.padEnd(32) + v);
  for (const e of errs) console.log('  ' + e);
  console.log('');
  console.log(bad.length || errs.length ? `THE BAR IS SELLING SOMEBODY ELSE (${bad.length + errs.length})`
                                        : 'WHAT THE BAR ADVERTISES IS WHAT WALKS OUT OF IT');
  await b.close();
  process.exit(bad.length || errs.length ? 1 : 0);
})();
