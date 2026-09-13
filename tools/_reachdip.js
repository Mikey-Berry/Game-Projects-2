#!/usr/bin/env node
/* HOW MUCH DOES ONE THIRTY-SECOND FIGHT VARY?
 *
 * `standoff.js`'s size sweep stages ONE fight per size and compares two single samples:
 * `landed[1.3] >= landed[1] / 2`. Hit chance and damage are rolls, so before anything is
 * called a dip in the reach at size 1.3, the spread of the measurement itself has to be known.
 * Eight repeats a size, on one build.
 *
 *   node tools/_reachdip.js [game.html] [repeats]
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
  await p.goto('file://' + gamePath(process.argv[2]), { waitUntil: 'load' });
  await p.waitForSelector('#btn-start', { state: 'attached', timeout: 60000 });
  await p.evaluate(() => { document.getElementById('btn-start').click(); paused = true; });
  await p.waitForTimeout(2600);

  const reps = Number(process.argv[3] || 8);
  const out = await p.evaluate((reps) => {
    paused = true;
    const step = (secs, dt = 1 / 30) => { for (let i = 0; i < secs / dt; i++) update(dt); };
    let gx = 0, gy = 0;
    outer:
    for (let y = 90; y < H - 90; y += 7) for (let x = 90; x < W - 90; x += 7) {
      if (nearestTownDist(x, y) < 90) continue;
      let ok = true;
      for (let dy = -10; dy <= 10 && ok; dy++) for (let dx = -10; dx <= 10; dx++) if (isBlocked(x + dx, y + dy)) { ok = false; break; }
      if (ok) { gx = x; gy = y; break outer; }
    }
    const wipe = () => { for (let i = chars.length - 1; i >= 0; i--) if (dist(chars[i].x, chars[i].y, gx, gy) < 70) chars.splice(i, 1); };
    const putAt = (fac, x, y, o) => {
      const c = makeChar(o.name || fac, fac, x, y, { atk: 20, def: 12, tough: 16, ath: 8, ...o });
      c.state = 'ok'; c.x = x; c.y = y; chars.push(c); return c;
    };
    const res = {};
    for (const big of [1, 1.15, 1.3, 1.6, 2.2]) {
      res[big] = { blood: [], settled: [] };
      for (let r = 0; r < reps; r++) {
        wipe();
        const foe = putAt('wild', gx + 2, gy, { name: 'Big' + big, tough: 60, def: 6, weapon: null });
        foe.big = big; foe.blood = foe.maxBlood = 4000; foe.noFight = true;
        const me = putAt('player', gx, gy, { name: 'Me', weapon: 'w_kat', armor: 'a_lea' });
        me.blood = me.maxBlood = 4000;
        me.target = foe; me.targetManual = true;
        const b0 = foe.blood;
        step(30);
        res[big].blood.push(Math.round(b0 - foe.blood));
        res[big].settled.push(Number(dist(me.x, me.y, foe.x, foe.y).toFixed(2)));
      }
    }
    return res;
  }, reps);

  console.log('size   reach   blood off a 30s fight (per repeat)                 min  med  max');
  const med = (a) => { const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };
  const base = med(out['1'].blood);
  for (const k of Object.keys(out)) {
    const bl = out[k].blood, st = out[k].settled;
    const reach = Math.min(1.65, 1.0 + Math.max(0, Number(k) - 1) * 0.5);
    console.log(
      String(k).padEnd(6),
      reach.toFixed(2).padEnd(7),
      bl.join(' ').padEnd(50),
      String(Math.min(...bl)).padStart(4),
      String(med(bl)).padStart(4),
      String(Math.max(...bl)).padStart(4),
      ' settled ' + Math.min(...st).toFixed(2) + '-' + Math.max(...st).toFixed(2),
      ' median/base ' + (med(bl) / base).toFixed(2));
  }
  await b.close();
})();
