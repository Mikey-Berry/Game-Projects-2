#!/usr/bin/env node
/* Does the game still start?
 *
 * Ten seconds, no assertions, one question: did anything throw on load or on starting a
 * world. It exists because the single-file layout makes one mistake very easy to make and
 * very hard to see — a `const` declared beside the code that uses it, four thousand lines
 * below the worldgen that ALSO uses it, is in its temporal dead zone when the world is
 * built. That kills the whole script, and every other harness then fails somewhere
 * unrelated and confusing ("Cannot access 'uid' before initialization" out of makeChar).
 *
 * Twice in one feature. So now it is a check, and it runs first.
 */
const { chromium } = require('playwright');
const path = require('path');
const gamePath = (a) => path.resolve(a ? (path.isAbsolute(a) ? a : path.join(__dirname, a)) : path.join(__dirname, 'game.html'));

(async () => {
  const b = await chromium.launch({
    executablePath: process.env.DUSTWARD_CHROME || undefined,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'],
  });
  const p = await b.newPage({ viewport: { width: 800, height: 600 } });
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message.slice(0, 240)));
  p.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text().slice(0, 240)); });

  await p.goto('file://' + gamePath(process.argv[2]), { waitUntil: 'load' });
  await p.waitForTimeout(3500);
  const loadErrs = errs.length;
  await p.evaluate(() => document.getElementById('btn-start').click());
  await p.waitForTimeout(4000);

  const alive = await p.evaluate(() => ({
    chars: typeof chars !== 'undefined' ? chars.length : -1,
    towns: typeof towns !== 'undefined' ? towns.length : -1,
    cells: typeof cells !== 'undefined' ? cells.length : -1,
    day: typeof day !== 'undefined' ? day : -1,
  })).catch(e => ({ error: e.message.slice(0, 160) }));

  console.log('boot:', JSON.stringify(alive));
  if (errs.length) {
    console.log('\n*** ' + errs.length + ' ERROR(S) — ' + loadErrs + ' before the world was even started ***');
    for (const e of errs.slice(0, 6)) console.log('  ' + e);
    process.exit(1);
  }
  if (!alive || alive.chars <= 0 || alive.towns <= 0) {
    console.log('\n*** THE WORLD DID NOT COME UP ***');
    process.exit(1);
  }
  console.log('\nIT BOOTS');
  await b.close();
})();
