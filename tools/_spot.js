const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox','--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 400, height: 300 } });
  await p.goto('file://' + path.join(__dirname, process.argv[2]), { waitUntil: 'load' });
  await p.waitForTimeout(2500);
  await p.evaluate(() => document.getElementById('btn-start').click());
  await p.waitForTimeout(4500);
  const r = await p.evaluate(() => {
    const me = player()[0];
    const clear = (x,y,x1,y1,pad) => { const lo=(a,b)=>Math.min(a,b)-pad, hi=(a,b)=>Math.max(a,b)+pad;
      for(let j=lo(y,y1); j<=hi(y,y1); j+=2) for(let i=lo(x,x1); i<=hi(x,x1); i+=2){
        if(i<2||j<2||i>=W-2||j>=H-2) return false;
        if(isBlocked(i+0.5,j+0.5,0) || terr[j*W+i]===3) return false; } return true; };
    let spot=null;
    for(let r2=30; r2<260 && !spot; r2+=5) for(let a=0; a<16 && !spot; a++){
      const x=Math.round(me.x+Math.cos(a/16*6.283)*r2), y=Math.round(me.y+Math.sin(a/16*6.283)*r2);
      if(!clear(x,y,x+12,y+12,4)) continue;
      if(chars.some(c=>c.state!=='dead'&&dist(c.x,c.y,x,y)<26)) continue;
      spot={x,y};
    }
    if(!spot) return {spot:null};
    /* EVERY tile in the box, not every second one */
    let blockedOdd=0; const bad=[];
    for(let j=spot.y-4;j<=spot.y+16;j++) for(let i=spot.x-4;i<=spot.x+16;i++){
      if(isBlocked(i+0.5,j+0.5,0)){ blockedOdd++; if(bad.length<6) bad.push([i,j]); } }
    const near = chars.filter(c=>c.state!=='dead'&&dist(c.x,c.y,spot.x,spot.y)<30).length;
    return { spot, blockedTilesInBox: blockedOdd, firstFew: bad, bodiesWithin30: near };
  });
  console.log(process.argv[2].padEnd(14), JSON.stringify(r));
  await b.close();
})();
