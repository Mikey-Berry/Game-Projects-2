#!/usr/bin/env node
/* HOW LONG DOES A REAL HOST TAKE TO OPEN A STONE WALL?
 *
 * `warwall.js` asserts that a mustered army needs long enough at a town wall for it to read as
 * a siege rather than a door. The first cut of that claim set the bar at twenty seconds because
 * one run happened to take twenty seconds. Then the harness grew a claim ahead of it that turns
 * the world clock, the PRNG moved into a different phase, and the same claim came back at ten
 * seconds and called it a regression. Nothing about the game had changed.
 *
 * A muster is a ROLLED QUANTITY: `spawnArmy` rolls how many march and rolls each one's stats and
 * kit. So the bar has to be set against the spread, not against one draw. This walks the stream
 * and reports what the spread actually is.
 *
 *   node tools/_siegepace.js [game.html]
 */
const { chromium } = require('playwright');
const path = require('path');
const gamePath = (a) => path.resolve(a ? (path.isAbsolute(a) ? a : path.join(__dirname, a)) : path.join(__dirname, 'game.html'));

(async () => {
  const b = await chromium.launch({ executablePath: process.env.DUSTWARD_CHROME || undefined,
    args: ['--use-gl=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox','--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 900, height: 600 } });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message.slice(0, 160)));
  await p.goto('file://' + gamePath(process.argv[2]), { waitUntil: 'load', timeout: 90000 });
  await p.waitForFunction(() => !!document.getElementById('btn-start'), null, { timeout: 60000 });
  await p.evaluate(() => { document.getElementById('btn-start').click(); paused = true; });
  await p.waitForFunction(() => typeof chars !== 'undefined' && chars.length > 0, null, { timeout: 60000 });
  await p.waitForTimeout(2500);

  const out = await p.evaluate(() => {
    const drive = (secs, dt = 0.05) => {
      for (let i = 0; i < secs / dt; i++) {
        rebuildCharGrid();
        for (const c of chars) if (c.state !== 'dead') { ai(c, dt); physics(c, dt); }
      }
    };
    const atk = towns.find(t => t.def.wall && !t.def.undeadFriendly);
    const def = towns.find(t => t !== atk && t.def.wall && !t.def.undeadFriendly);
    atk.warWith = def; def.warWith = atk; atk.warDay = day; def.warDay = day;
    const rows = [];
    const STEP = 2, CAP = 120;
    for (let run = 0; run < 14; run++) {
      const face = def.walls.filter(w => Math.abs(w.y - (def.y - def.def.wall.r)) < 1.5).slice(0, 12);
      for (const w of face) w.hp = w.maxHp;          /* every run starts at a whole face */
      const n0 = def.walls.length;
      const before = chars.length;
      spawnArmy(towns.indexOf(atk), def);
      const host = chars.slice(before);
      host.forEach((c, i) => { const w = face[i % Math.max(1, face.length)]; if (w) { c.x = w.x + 0.5; c.y = w.y - 1.3; } });
      let secs = 0;
      while (secs < CAP && def.walls.length === n0) { drive(STEP); secs += STEP; }
      const fell = def.walls.length < n0;
      /* the strongest arm in the host, because that is what decides the pace of the first tile */
      const atkTop = host.length ? Math.max(...host.map(c => c.stats && c.stats.atk || 0)) : 0;
      rows.push({ run, n: host.length, atkTop, secs, fell });
      /* put the tile back and take the host off the map before the next draw */
      for (const w of face) if (!def.walls.includes(w)) { def.walls.push(w); w.hp = w.maxHp; blocked.add(bkey(w.x, w.y)); }
      for (let i = chars.length - 1; i >= before; i--) chars.splice(i, 1);
      rebuildCharGrid();
    }
    atk.warWith = null; def.warWith = null;
    return { town: def.name, mat: def.def.wall.mat, hp: def.def.wall.hp, rows };
  });

  console.log(`\n=== A MUSTERED HOST AT ${out.town.toUpperCase()}'S ${String(out.mat).toUpperCase()} WALL (${out.hp} hp a tile) ===\n`);
  for (const r of out.rows) {
    console.log(`  run ${String(r.run).padStart(2)}  ${String(r.n).padStart(2)} soldiers  best atk ${String(r.atkTop).padStart(3)}  ` +
      (r.fell ? `first tile at ${String(r.secs).padStart(3)}s` : `NEVER (>${r.secs}s)`));
  }
  const got = out.rows.filter(r => r.fell).map(r => r.secs).sort((a, b) => a - b);
  const ns = out.rows.map(r => r.n).sort((a, b) => a - b);
  console.log(`\n  hosts      ${ns[0]}–${ns[ns.length - 1]} soldiers`);
  console.log(`  time       ${got.length}/${out.rows.length} runs opened a tile: ${got.length ? got[0] + '–' + got[got.length - 1] + 's, median ' + got[Math.floor(got.length / 2)] + 's' : 'none'}`);
  if (errs.length) { console.log('  errs:', errs.length); errs.slice(0, 3).forEach(e => console.log('   ' + e)); }
  await b.close();
})();
