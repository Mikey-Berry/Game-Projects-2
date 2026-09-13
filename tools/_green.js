#!/usr/bin/env node
/* WHAT IS ACTUALLY WRONG AT GREENREST.
   Four reports: the population spawns inside the gated yard, the Dame arrives dead, anybody can
   walk in, and buildings sit on top of each other. Counted rather than guessed at. */
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox','--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 600, height: 450 } });
  const errs = []; p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message.slice(0,200)));
  await p.goto('file://' + path.join(__dirname, (process.argv[2]||'game.html')), { waitUntil: 'load' });
  await p.waitForTimeout(2500);
  await p.evaluate(() => document.getElementById('btn-start').click());
  await p.waitForTimeout(4500);
  const r = await p.evaluate(() => {
    if(!estate) return { none: true };
    const inYard = (c) => Math.abs(c.x - estate.x) <= estate.hw && Math.abs(c.y - estate.y) <= estate.hh;
    const snap = () => {
      const occ = chars.filter(c => c.state !== 'dead' && inYard(c));
      return {
        dame: estate.dame ? { state: estate.dame.state, blood: Math.round(estate.dame.blood),
                              x: +estate.dame.x.toFixed(1), y: +estate.dame.y.toFixed(1),
                              inYard: inYard(estate.dame), hunger: Math.round(estate.dame.hunger||0) } : null,
        servant: estate.servant ? estate.servant.state : null,
        inYard: occ.length,
        whoInYard: occ.map(c => c.name + (c.orchardKin?'(kin)':c.orchardDame?'(dame)':c.civ?'(civ)':'')).slice(0, 12),
        kin: chars.filter(c => c.orchardKin && c.state !== 'dead').length,
        doorOpen: estate.doorOpen, admitted: estate.admitted,
      };
    };
    const atBoot = snap();
    /* is the gate a hole? */
    const g = estate.gate[0];
    const gateBlocked = isBlocked(g.x + 0.5, g.y + 0.5, 0);
    /* can a stranger walk from outside the wall to the yard centre? */
    const outside = { x: estate.x, y: estate.y + estate.hh + 4 };
    /* a yard tile that is NOT inside the house footprint — the centre is, and its door is barred */
    const hb = estate.house;
    let yardTile = null;
    for(let j = -estate.hh + 1; j <= estate.hh - 1 && !yardTile; j++)
      for(let i = -estate.hw + 1; i <= estate.hw - 1 && !yardTile; i++){
        const qx = estate.x + i, qy = estate.y + j;
        if(hb && qx >= hb.x && qx < hb.x + hb.w && qy >= hb.y && qy < hb.y + hb.h) continue;
        if(!isBlocked(qx + 0.5, qy + 0.5, 0)) yardTile = { x: qx, y: qy };
      }
    const pathIn = yardTile ? !!findPath(outside.x, outside.y, yardTile.x, yardTile.y, 0) : null;
    /* building overlaps in Greenrest */
    const t = towns.find(t2 => t2.def.key === 'greenrest');
    const bs = buildings.filter(b2 => b2.town === t);
    const overlaps = [];
    for(let i = 0; i < bs.length; i++) for(let j = i+1; j < bs.length; j++){
      const a = bs[i], c = bs[j];
      if(a.x < c.x + c.w && c.x < a.x + a.w && a.y < c.y + c.h && c.y < a.y + a.h)
        overlaps.push([(a.label||a.type||'?'), (c.label||c.type||'?')]);
    }
    for(let i=0;i<600;i++) update(1/30);
    return { atBoot, after: snap(), gateBlocked, gate: g, pathIn, yardTile,
             buildings: bs.length, overlaps: overlaps.slice(0, 10), overlapN: overlaps.length,
             house: estate.house ? {x:estate.house.x,y:estate.house.y,w:estate.house.w,h:estate.house.h} : null };
  });
  for(const e of errs) console.log(e);
  console.log(JSON.stringify(r, null, 1));
  await b.close();
})();
