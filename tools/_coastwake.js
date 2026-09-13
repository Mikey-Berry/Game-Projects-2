#!/usr/bin/env node
/* WHAT THE COAST MOVED, MEASURED ACROSS SEEDS.
 *
 * Five harnesses bisect to the commit that gave the world a coast, and three of them fail on a
 * COUNT rather than on a mechanism — a number that comes out of worldgen and is compared
 * against a bar somebody set once. Drowning a fifth of the map moves every one of those
 * numbers a little, so the question is not "did it change" but "was the bar ever clear of the
 * spread". This prints the spread, per seed, per build.
 *
 *   · mere.js   — raisable bodies within 14 tiles of Hollowmere's square (bar: >= 6, reads 5)
 *   · estate.js — strangers standing inside the Aldercott yard (bar: 0, reads 1)
 *
 *   node tools/_coastwake.js game.html bis_bb900dd.html
 */
const { chromium } = require('playwright');
const path = require('path');
const gamePath = (a) => path.resolve(a ? (path.isAbsolute(a) ? a : path.join(__dirname, a)) : path.join(__dirname, 'game.html'));

(async () => {
  const b = await chromium.launch({
    executablePath: process.env.DUSTWARD_CHROME || undefined,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'],
  });
  for (const f of (process.argv.slice(2).length ? process.argv.slice(2) : ['game.html'])) {
    console.log(f);
    const yard = [], stray = [];
    for (const seed of [0, 7, 91, 404, 1234]) {
      const p = await b.newPage({ viewport: { width: 900, height: 600 } });
      await p.goto('file://' + gamePath(f) + (seed ? '?seed=' + seed : ''));
      await p.waitForSelector('#btn-start', { state: 'attached', timeout: 60000 });
      await p.evaluate(() => { document.getElementById('btn-start').click(); paused = true; });
      await p.waitForTimeout(2800);
      const r = await p.evaluate(() => {
        paused = true;
        const out = {};
        const hm = towns.find(t => t.def.key === 'hollowmere');
        out.yard = hm ? corpses.filter(c => raisableBody(c) && dist(c.x, c.y, hm.x, hm.y) < 14).length : -1;
        /* and how it falls off with the radius, so "5 at 14" can be read as a layout fact */
        out.byR = hm ? [10, 12, 14, 16, 18, 22].map(r2 =>
          r2 + ':' + corpses.filter(c => raisableBody(c) && dist(c.x, c.y, hm.x, hm.y) < r2).length).join(' ') : '';
        if (typeof estate !== 'undefined' && estate) {
          for (let i = 0; i < 900; i++) update(1 / 30);
          const inYard = (c) => Math.abs(c.x - estate.x) <= estate.hw && Math.abs(c.y - estate.y) <= estate.hh;
          const house = (c) => c.orchardKin || c.orchardDame || c.orchardServant;
          const occ = chars.filter(c => c.state !== 'dead' && inYard(c));
          out.stray = occ.filter(c => !house(c)).length;
          out.who = occ.filter(c => !house(c)).map(c => `${c.name}[${c.faction}${c.civ ? ' civ' : ''}${c.vt ? ' vendor' : ''}]`).join(', ');
        } else { out.stray = -1; out.who = 'no estate'; }
        return out;
      });
      yard.push(r.yard); stray.push(r.stray);
      console.log(`  seed ${String(seed).padEnd(5)} hollowmere yard ${String(r.yard).padStart(2)}  (by radius ${r.byR})`);
      console.log(`              aldercott strangers ${r.stray}${r.who ? ' — ' + r.who : ''}`);
      await p.close();
    }
    console.log(`  yard across seeds: ${yard.join(',')}   strangers: ${stray.join(',')}\n`);
  }
  await b.close();
})();
