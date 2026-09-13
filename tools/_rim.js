const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox','--no-sandbox'] });
  const p = await b.newPage();
  await p.goto('file://' + path.join(__dirname, process.argv[2] || 'game.html'));
  await p.waitForTimeout(3000);
  await p.evaluate(() => { document.getElementById('btn-start').click(); paused = true; });
  await p.waitForTimeout(3000);
  console.log(await p.evaluate(() => {
    const rows = [];
    for (const d of [0,2,5,10,15,20,25,30,35,40,45,50,60,70,80,100,120]) {
      let wet = 0, n = 0, blocked = 0;
      for (let x = d; x < W - d; x += 3) {
        for (const [px, py] of [[x, d], [x, H-1-d], [d, x], [W-1-d, x]]) {
          if (px < 0 || py < 0 || px >= W || py >= H) continue;
          n++; if (tileAt(px, py) === 3) wet++;
          if (isBlocked(px + 0.5, py + 0.5, 0)) blocked++;
        }
      }
      rows.push(`  ${String(d).padStart(3)} tiles in: ${(wet/n*100).toFixed(0)}% water, ${(blocked/n*100).toFixed(0)}% blocked`);
    }
    /* how far in does the land actually start, ray by ray from the middle of each edge */
    const reach = [];
    for (const [sx, sy, dx, dy] of [[W/2,0,0,1],[W/2,H-1,0,-1],[0,H/2,1,0],[W-1,H/2,-1,0]]) {
      let i = 0;
      while (i < 300 && tileAt(sx + dx*i, sy + dy*i) === 3) i++;
      reach.push(i);
    }
    /* anything alive or built out near the rim? */
    let nearRim = 0;
    for (const c of chars) if (Math.min(c.x, c.y, W-c.x, H-c.y) < 40) nearRim++;
    const townEdge = towns.map(t => Math.round(Math.min(t.x, t.y, W-t.x, H-t.y)));
    return rows.join('\n')
      + `\n  land starts (N,S,W,E from the edge midpoints): ${reach.join(', ')} tiles in`
      + `\n  bodies within 40 tiles of the rim: ${nearRim} of ${chars.length}`
      + `\n  each town's distance to the nearest map edge: ${townEdge.join(', ')}`
      + `\n  camera: camX ${typeof camX} ${camX.toFixed(0)},${camY.toFixed(0)}`
      + (() => { let dry=0,n=0; for(let y=0;y<H;y+=4) for(let x=0;x<W;x+=4){ n++; if(tileAt(x,y)!==3) dry++; }
                 return `\n  dry land: ${(dry/n*100).toFixed(1)}% of the map (${Math.round(dry/n*W*H/1000)}k tiles)`; })()
      + (() => { if(typeof brim === 'undefined') return '\n  bands: none (old build)';
                 const t=[0,0,0,0]; let n=0; for(let y=0;y<H;y+=4) for(let x=0;x<W;x+=4){ t[brim[y*W+x]]++; n++; }
                 return `\n  bands: inland ${(t[0]/n*100).toFixed(1)}%, brine ${(t[1]/n*100).toFixed(1)}%, crust ${(t[2]/n*100).toFixed(1)}%, dead ${(t[3]/n*100).toFixed(1)}%`; })();
  }));
  await b.close();
})();
