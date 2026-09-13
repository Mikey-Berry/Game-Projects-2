#!/usr/bin/env node
/* TWO BARS SET FLUSH AGAINST ONE MEASUREMENT, MEASURED PROPERLY.
 *
 *   · `sundered.js` wants a stripped site back to full in <= 72 game-hours. It reads 90.
 *   · `wards.js` wants a gaunt more than 1 tile further from the light after one second of
 *     sim. It reads 0.8 — and the other half of that claim, letting go of the quarry, passes.
 *
 * Both are rates. Neither had its spread measured. This prints the distribution.
 *
 *   node tools/_barspread.js [game.html] [repeats]
 */
const { chromium } = require('playwright');
const path = require('path');
const gamePath = (a) => path.resolve(a ? (path.isAbsolute(a) ? a : path.join(__dirname, a)) : path.join(__dirname, 'game.html'));

(async () => {
  const b = await chromium.launch({
    executablePath: process.env.DUSTWARD_CHROME || undefined,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'],
  });
  const reps = Number(process.argv[3] || 5);
  for (const seed of [0, 7, 91, 404]) {
    const p = await b.newPage({ viewport: { width: 900, height: 600 } });
    await p.goto('file://' + gamePath(process.argv[2]) + (seed ? '?seed=' + seed : ''));
    await p.waitForSelector('#btn-start', { state: 'attached', timeout: 60000 });
    await p.evaluate(() => { document.getElementById('btn-start').click(); paused = true; });
    await p.waitForTimeout(2600);
    const r = await p.evaluate((reps) => {
      paused = true;
      const O = {};
      /* ---- REGROWTH: how many game-hours to refill a stripped site ---- */
      O.regrow = [];
      for (const s0 of corpseSites) {
        for (const c of chars.filter(c => c.siteId === s0.id)) { const i = chars.indexOf(c); if (i >= 0) chars.splice(i, 1); }
        let hours = 0;
        for (; hours < 300; hours++) {
          corpseSiteTick(1);
          if (chars.filter(c => c.siteId === s0.id && c.state !== 'dead' && c.gauntKind).length >= s0.pop) break;
        }
        O.regrow.push(hours);
      }
      /* ---- THE GAUNT: how far it gets from the light, second by second ---- */
      O.flee = [];
      let gx = 0, gy = 0;
      outer:
      for (let y = 90; y < H - 90; y += 7) for (let x = 90; x < W - 90; x += 7) {
        let ok = true;
        for (let dy = -12; dy <= 12 && ok; dy++) for (let dx = -12; dx <= 12; dx++) if (isBlocked(x + dx, y + dy)) { ok = false; break; }
        if (ok && !towns.some(t => dist(t.x, t.y, x, y) < 90)) { gx = x; gy = y; break outer; }
      }
      for (let r = 0; r < reps; r++) {
        const c4 = makeChar('Probe Light', 'player', gx, gy, { atk: 5, def: 5, tough: 10, magic: 40 });
        c4.floor = 0; chars.push(c4);
        startConcentration(c4, 'warding', 1, true, true);
        const g = spawnGaunt('gaunt', gx + 4, gy);
        g.target = c4; g.targetManual = true; g.hunt = null;
        rebuildCharGrid();
        const d0 = dist(g.x, g.y, c4.x, c4.y);
        const row = [];
        for (let s = 0; s < 5; s++) {
          for (let i = 0; i < 30; i++) { update(1 / 30); c4.x = gx; c4.y = gy; }
          row.push(Number((dist(g.x, g.y, c4.x, c4.y) - d0).toFixed(2)));
        }
        endConcentration(c4, true);
        c4.state = 'gone'; g.state = 'gone';
        O.flee.push(row);
      }
      return O;
    }, reps);
    console.log('seed', String(seed || 'default').padEnd(8), 'regrow hours per site:', r.regrow.join(', '));
    console.log('         gaunt gained (tiles) after 1s,2s,3s,4s,5s:');
    for (const row of r.flee) console.log('           ', row.join('  '));
    await p.close();
  }
  await b.close();
})();
