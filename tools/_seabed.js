const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox','--no-sandbox'] });
  for (const f of process.argv.slice(2)) {
    const p = await b.newPage();
    await p.goto('file://' + path.join(__dirname, f));
    await p.waitForTimeout(2500);
    await p.evaluate(() => document.getElementById('btn-start').click());
    await p.waitForTimeout(2500);
    console.log(f.padEnd(18), await p.evaluate(() => {
      const at = (x, y) => HV[y * (W + 1) + x];
      const rows = [];
      for (const d of [2, 10, 25, 50, 80, 120, 300]) {
        let lo = 9, hi = -9, n = 0, below = 0;
        for (let x = d; x < W - d; x += 17) {
          for (const [px, py] of [[x, d], [x, H - 1 - d], [d, x], [W - 1 - d, x]]) {
            const h = at(px, py); if (h === undefined) continue;
            lo = Math.min(lo, h); hi = Math.max(hi, h); n++; if (h < -0.22) below++;
          }
        }
        rows.push(`${String(d).padStart(3)}: h ${lo.toFixed(2)}..${hi.toFixed(2)}, ${(below/n*100).toFixed(0)}% under the water plane`);
      }
      return '\n    ' + rows.join('\n    ');
    }));
    await p.close();
  }
  await b.close();
})();
