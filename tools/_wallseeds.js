const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox','--no-sandbox'] });
  for (const file of ['game.html','prev.html']) {
    for (const seed of [7, 91, 404]) {
      const p = await b.newPage();
      await p.goto('file://' + path.join(__dirname, file) + '?seed=' + seed);
      await p.waitForTimeout(2500);
      await p.evaluate(() => { document.getElementById('btn-start').click(); paused = true; });
      await p.waitForTimeout(2500);
      const r = await p.evaluate(() => {
        const holes = [];
        for (const t of towns) for (const w of (t.walls || []))
          if (!isBlocked(w.x + 0.5, w.y + 0.5, 0)) holes.push(t.name);
        const tally = {};
        for (const h of holes) tally[h] = (tally[h] || 0) + 1;
        return JSON.stringify(tally);
      });
      console.log(file.padEnd(10), 'seed', String(seed).padEnd(4), r);
      await p.close();
    }
  }
  await b.close();
})();
