const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox','--no-sandbox'] });
  for (const f of process.argv.slice(2)) {
    const p = await b.newPage({ viewport: { width: 1100, height: 700 } });
    await p.goto('file://' + path.join(__dirname, f));
    await p.waitForTimeout(3000);
    await p.evaluate(() => { document.getElementById('btn-start').click(); });
    await p.waitForTimeout(2000);
    await p.waitForTimeout(1500);
    await p.evaluate(() => { paused = true; });
    await p.keyboard.press('F9');
    await p.waitForTimeout(4000);
    /* blow the 128px minimap up to 512 so the coastline is legible */
    const png = await p.evaluate(() => {
      const src = document.getElementById('minimap');
      const c = document.createElement('canvas'); c.width = c.height = 512;
      const x = c.getContext('2d'); x.imageSmoothingEnabled = false;
      x.drawImage(src, 0, 0, 512, 512);
      return c.toDataURL('image/png').split(',')[1];
    });
    require('fs').writeFileSync(path.join(__dirname, '..', 'shot-map-' + f.replace('.html','') + '.png'), Buffer.from(png, 'base64'));
    await p.close();
  }
  await b.close();
  console.log('map shots written');
})();
