#!/usr/bin/env node
/* THE SAME FOUR QUESTIONS ACROSS MANY WORLDS. `?seed=N` is how a probe asks whether a thing is
   a fault or a coincidence — one world is an anecdote. */
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const N = Number(process.argv[2] || 8);
  const b = await chromium.launch({ args: ['--use-gl=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox','--no-sandbox'] });
  const rows = [];
  for(let s = 1; s <= N; s++){
    const p = await b.newPage({ viewport: { width: 500, height: 400 } });
    try {
      await p.goto('file://' + path.join(__dirname, 'game.html') + '?seed=' + s, { waitUntil: 'load' });
      await p.waitForTimeout(2200);
      await p.evaluate(() => document.getElementById('btn-start').click());
      await p.waitForTimeout(3500);
      const r = await p.evaluate(() => {
        if(!estate) return { none: true };
        const inYard = (c) => Math.abs(c.x - estate.x) <= estate.hw && Math.abs(c.y - estate.y) <= estate.hh;
        const t = towns.find(t2 => t2.def.key === 'greenrest');
        const bs = buildings.filter(b2 => b2.town === t);
        let ov = 0;
        for(let i=0;i<bs.length;i++) for(let j=i+1;j<bs.length;j++){
          const a=bs[i], c=bs[j];
          if(a.x < c.x+c.w && c.x < a.x+a.w && a.y < c.y+c.h && c.y < a.y+a.h) ov++;
        }
        const d = estate.dame;
        return {
          dame: d ? d.state : 'MISSING',
          dameInWall: d ? isBlocked(d.x, d.y, d.floor || 0) : null,
          servant: estate.servant ? estate.servant.state : 'MISSING',
          yard: chars.filter(c => c.state !== 'dead' && inYard(c)).length,
          strangersInYard: chars.filter(c => c.state !== 'dead' && inYard(c) && !c.orchardKin && !c.orchardDame && !c.orchardServant).length,
          overlaps: ov, builds: bs.length,
          gateOpen: !isBlocked(estate.gate[0].x + 0.5, estate.gate[0].y + 0.5, 0),
        };
      });
      rows.push({ seed: s, ...r });
    } catch(e){ rows.push({ seed: s, err: String(e).slice(0,60) }); }
    await p.close();
  }
  await b.close();
  console.log('seed | dame    inWall | servant | yard strangers | overlaps/builds | gateOpen');
  for(const r of rows) console.log(
    String(r.seed).padStart(4) + ' | ' + String(r.dame).padEnd(7) + ' ' + String(r.dameInWall).padEnd(6) +
    ' | ' + String(r.servant).padEnd(7) + ' | ' + String(r.yard).padStart(4) + ' ' + String(r.strangersInYard).padStart(9) +
    ' | ' + String(r.overlaps).padStart(8) + '/' + String(r.builds).padEnd(6) + ' | ' + r.gateOpen);
  const dead = rows.filter(r => r.dame && r.dame !== 'ok').length;
  console.log(`\n*** dame not ok in ${dead}/${rows.length} worlds; overlaps in ${rows.filter(r=>r.overlaps>0).length}; gate open in ${rows.filter(r=>r.gateOpen).length}`);
})();
