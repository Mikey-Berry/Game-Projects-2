const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox','--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 400, height: 300 } });
  await p.goto('file://' + path.join(__dirname, process.argv[2]), { waitUntil: 'load' });
  await p.waitForTimeout(2500);
  await p.evaluate(() => document.getElementById('btn-start').click());
  await p.waitForTimeout(4500);
  const r = await p.evaluate(() => ({
    chars: chars.length, corpses: corpses.length, chests: chests.length,
    rooms: caves.reduce((a,c)=>a+(c.rooms||[]).length,0),
    towns: towns.map(t => t.x + ',' + t.y).join('|').slice(0, 60),
    firstChar: chars[0] ? chars[0].name + '@' + Math.round(chars[0].x) + ',' + Math.round(chars[0].y) : null,
    cairns: typeof liveCairns === 'function' ? liveCairns().length : null,
    day, noticed: +noticed.toFixed(2),
  }));
  console.log(process.argv[2].padEnd(16), JSON.stringify(r));
  await b.close();
})();
