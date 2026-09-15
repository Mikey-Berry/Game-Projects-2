const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox','--no-sandbox'] });
  for (const f of process.argv.slice(2)) {
    const p = await b.newPage();
    await p.goto('file://' + path.join(__dirname, f));
    await p.waitForTimeout(2800);
    await p.evaluate(() => document.getElementById('btn-start').click());
    await p.waitForTimeout(2800);
    console.log(f, await p.evaluate(() => {
      paused = true;
      const me = player()[0];
      const sx = me.x + 40, sy = me.y + 40;
      const mk = (x,y,n) => { const c = makeChar(n,'player',x,y,{atk:5,def:5,tough:10,ath:8}); c.state='ok'; chars.push(c); return c; };
      const a = mk(sx, sy, 'A'), b2 = mk(sx+0.5, sy+0.5, 'B');
      rebuildCharGrid();
      clearOrders(a); clearOrders(b2);
      const ta = {x: b2.x+0.2, y: b2.y+0.2}, tb = {x: a.x-0.2, y: a.y-0.2};
      a.moveTarget = {...ta}; b2.moveTarget = {...tb};
      let closestA = 1e9, closestB = 1e9, minGap = 1e9;
      for (let i=0;i<750;i++){ update(1/30);
        closestA = Math.min(closestA, dist(a.x,a.y,ta.x,ta.y));
        closestB = Math.min(closestB, dist(b2.x,b2.y,tb.x,tb.y));
        minGap = Math.min(minGap, dist(a.x,a.y,b2.x,b2.y)); }
      return `arrival radius 0.2 — closest A ever got to its target ${closestA.toFixed(3)}, B ${closestB.toFixed(3)}; ` +
             `closest the two bodies ever came to each other ${minGap.toFixed(3)} tiles. ` +
             `orders still open: ${(a.moveTarget?1:0)+(b2.moveTarget?1:0)}`;
    }));
    await p.close();
  }
  await b.close();
})();
