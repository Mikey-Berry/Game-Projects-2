#!/usr/bin/env node
/* HOW MANY BOWS FALL, AND HOW MUCH THAT NUMBER MOVES.
 *
 * `focus.js`'s last claim asks that a line of six, ordered into a fight with an unkillable
 * brute in front and five crossbows behind it, answers the ROW rather than the wall — measured
 * as bodies: survivors of mine, and bows of theirs down, averaged over fourteen fights. The
 * bar is `avg >= 2.5 && kills >= 2`.
 *
 * It went red at 1.64 bows after a change that removed three `rnd()` calls per bolt per step
 * from the seeded stream. That is a stream shift, not a targeting change, so the question is
 * whether 2 was ever a bar the measurement clears with room — a fourteen-fight average of a
 * seeded battle is a rolled quantity and the ledger's rule is to know its spread first.
 *
 * Prints the two numbers per seed, per build, so the bar can be set off the distribution
 * rather than off the one run that happened to be in front of somebody.
 *
 *   node tools/_mowspread.js game.html prefire.html
 */
const { chromium } = require('playwright');
const path = require('path');
const gamePath = (a) => path.resolve(a ? (path.isAbsolute(a) ? a : path.join(__dirname, a)) : path.join(__dirname, 'game.html'));

(async () => {
  const b = await chromium.launch({
    executablePath: process.env.DUSTWARD_CHROME || undefined,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'],
  });
  const files = process.argv.slice(2).length ? process.argv.slice(2) : ['game.html'];
  for (const f of files) {
    const rows = [];
    for (const seed of [0, 7, 91, 404, 1234]) {
      const p = await b.newPage({ viewport: { width: 900, height: 600 } });
      await p.goto('file://' + gamePath(f) + (seed ? '?seed=' + seed : ''));
      await p.waitForSelector('#btn-start', { state: 'attached', timeout: 60000 });
      await p.evaluate(() => { document.getElementById('btn-start').click(); paused = true; });
      await p.waitForTimeout(2600);
      rows.push(await p.evaluate(() => {
        paused = true;
        const step = (secs, dt = 1 / 30) => { for (let i = 0; i < secs / dt; i++) update(dt); };
        let gx = 0, gy = 0;
        outer:
        for (let y = 80; y < H - 80; y += 7) for (let x = 80; x < W - 80; x += 7) {
          if (nearestTownDist(x, y) < 90) continue;
          let ok = true;
          for (let j = -7; j <= 7 && ok; j++) for (let i = -7; i <= 7; i++) if (isBlocked(x + i + 0.5, y + j + 0.5, 0)) ok = false;
          if (ok) { gx = x; gy = y; break outer; }
        }
        const probes = [];
        const wipe = () => { for (let i = chars.length - 1; i >= 0; i--) if (chars[i].__probe || dist(chars[i].x, chars[i].y, gx, gy) < 60) chars.splice(i, 1); probes.length = 0; };
        const put = (fac, x, y, o) => { const q = findOpenNear(Math.round(x), Math.round(y), 5) || { x, y };
          const c = makeChar(o.name || fac, fac, q.x, q.y, { atk: 14, def: 12, tough: 14, ath: 8, ...o });
          c.__probe = true; c.state = 'ok'; chars.push(c); probes.push(c); return c; };
        const putAt = (fac, x, y, o) => { const c = makeChar(o.name || fac, fac, x, y, { atk: 14, def: 12, tough: 14, ath: 8, ...o });
          c.__probe = true; c.state = 'ok'; c.x = x; c.y = y; chars.push(c); probes.push(c); return c; };
        const mine = (n) => { const a = []; for (let i = 0; i < n; i++) a.push(putAt('player', gx - 6, gy - 3 + i * 0.9, { name: 'Mine' + i, weapon: 'w_kat', armor: 'a_lea' })); return a; };
        let standing = 0, bows = 0, fights = 0;
        const per = [];
        for (let t = 0; t < 14; t++) {
          wipe();
          const us = mine(6);
          const wall = put('bandit', gx - 2, gy, { name: 'Wall', tough: 90, def: 38, atk: 10, weapon: 'w_club', armor: 'a_pla' });
          wall.blood = wall.maxBlood = 900;
          const rank = [];
          for (let i = 0; i < 5; i++) rank.push(put('bandit', gx + 4, gy - 4 + i * 1.9, { name: 'Bow' + i, atk: 26, weapon: 'w_xbow', armor: 'a_lea' }));
          for (const e of rank) e.stance = 'ranged';
          for (const u of us) { u.attackMove = { x: gx + 9, y: gy }; u.scanT = 0; }
          step(60);
          standing += us.filter(u => u.state === 'ok').length;
          const k = rank.filter(e => e.state !== 'ok').length;
          bows += k; per.push(k); fights++;
        }
        return { avg: standing / fights, kills: bows / fights, per: per.join(',') };
      }));
      await p.close();
    }
    console.log(f);
    const ks = rows.map(r => r.kills);
    for (let i = 0; i < rows.length; i++)
      console.log(`  seed ${[0, 7, 91, 404, 1234][i].toString().padEnd(5)} survivors ${rows[i].avg.toFixed(2)}  bows ${rows[i].kills.toFixed(2)}   per fight [${rows[i].per}]`);
    console.log(`  bows across seeds: min ${Math.min(...ks).toFixed(2)}  max ${Math.max(...ks).toFixed(2)}  mean ${(ks.reduce((a, c) => a + c, 0) / ks.length).toFixed(2)}\n`);
  }
  await b.close();
})();
