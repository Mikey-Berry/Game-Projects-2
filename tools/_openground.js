#!/usr/bin/env node
/* WHY THE CAMERA BENCHES CANNOT FIND ANYWHERE TO STAND.
 *
 * Eight of them share one copied block that looks for a clear square to pose a body on, and
 * every copy reads `W`. `W` is a top-level `const` (line 596) and a top-level `const` is
 * NOT a property of `window` — so the width is `undefined`, `iy * W + ix` is `NaN`, and
 * `terr[NaN]` is `undefined`. The water test in that block has therefore never once run.
 * This counts what each filter actually rejects, so the fix is aimed rather than guessed.
 *
 *   node tools/_openground.js [game.html ...]
 */
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox','--no-sandbox'] });
  for (const f of (process.argv.slice(2).length ? process.argv.slice(2) : ['game.html'])) {
    const p = await b.newPage();
    await p.goto('file://' + path.join(__dirname, f));
    await p.waitForTimeout(2600);
    await p.evaluate(() => document.getElementById('btn-start').click());
    await p.waitForTimeout(2600);
    const r = await p.evaluate(() => {
      const me = player()[0];
      const out = { start: [Math.round(me.x), Math.round(me.y)], W: (typeof W !== 'undefined' ? W : 'UNREACHABLE'), selfW: self['W'] === undefined ? 'undefined — a top-level const is not a window property' : self['W'] };
      for (const pad of [10, 8, 6, 5, 4, 3, 2]) {
        let tried = 0, offmap = 0, blocked = 0, wet = 0, decor = 0, ok = 0;
        for (let r = 40; r < 240; r += 4) for (let a = 0; a < 24; a++) {
          const x = me.x + Math.cos(a / 24 * 6.283) * r, y = me.y + Math.sin(a / 24 * 6.283) * r;
          tried++;
          if (x < pad + 2 || y < pad + 2 || x >= W - pad - 2 || y >= H - pad - 2) { offmap++; continue; }
          let bad = null;
          for (let dy = -pad; dy <= pad && !bad; dy++) for (let dx = -pad; dx <= pad && !bad; dx++) {
            const ix = Math.floor(x) + dx, iy = Math.floor(y) + dy;
            if (isBlocked(ix + 0.5, iy + 0.5, 0)) bad = 'blocked';
            else if (terr[iy * W + ix] === 3) bad = 'wet';
            else if (decorAt(ix, iy)) bad = 'decor';
          }
          if (bad === 'blocked') blocked++; else if (bad === 'wet') wet++; else if (bad === 'decor') decor++; else ok++;
        }
        out['pad' + pad] = `${tried} rings tried: ${offmap} off-map, ${blocked} blocked, ${wet} wet, ${decor} decor, ${ok} CLEAR`;
      }
      return out;
    });
    console.log(f);
    for (const [k, v] of Object.entries(r)) console.log('  ' + k.padEnd(7) + JSON.stringify(v).replace(/"/g, ''));
    await p.close();
  }
  await b.close();
})();
