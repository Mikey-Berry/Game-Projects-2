const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox','--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1000, height: 700 } });
  const errs = []; p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message.slice(0,240)));
  await p.goto('file://' + path.join(__dirname, 'game.html'), { waitUntil: 'load' });
  await p.waitForTimeout(3000);
  await p.evaluate(() => document.getElementById('btn-start').click());
  await p.waitForTimeout(4000);
  const r = await p.evaluate(() => {
    const grab = (F) => { renderMinimap(); const d = mmcx.getImageData(0,0,128,128).data;
      const t = (F !== undefined && DEPTH_TINT[String(F)]) || '#000000';
      const tr = parseInt(t.slice(1,3),16), tg = parseInt(t.slice(3,5),16), tb = parseInt(t.slice(5,7),16);
      let rock=0, open=0, unknown=0, other=0;
      for(let i=0;i<d.length;i+=4){
        const r=d[i],g=d[i+1],b=d[i+2];
        if(r===18&&g===16&&b===22) rock++;
        else if(Math.abs(r-tr)<3&&Math.abs(g-tg)<3&&Math.abs(b-tb)<3) open++;
        else if(r===9&&g===8&&b===11) unknown++;
        else other++;
      }
      return { rock, open, unknown, other }; };
    activeFloor = 0;
    const surface = grab();
    const F = DEPTHS[1];
    const h = undercroft.halls.find(H => H.f === F);
    const me = player().find(c => c.state === 'ok');
    me.x = h.x; me.y = h.y; me.floor = F;
    for(let i=0;i<40;i++) update(1/30);
    activeFloor = F;
    const under = grab(F);
    const seen = underSeen.get(F);
    /* and a storey you have never walked shows nothing */
    activeFloor = DEPTHS[2];
    const unvisited = grab(DEPTHS[2]);
    activeFloor = 0; 
    return { surface, under, unvisited, seenTiles: seen ? seen.size : 0,
             bannerFloor: F, tint: DEPTH_TINT[String(F)] };
  });
  for(const e of errs) console.log(e);
  console.log(JSON.stringify(r, null, 1));
  await b.close();
})();
