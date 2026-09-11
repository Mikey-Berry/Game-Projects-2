#!/usr/bin/env node
/* WHY A FORAGE ORDER CLOSES OUT WITH CHESTS STILL SHUT.
   Replicates command.js's forage staging and watches the order's own state each tick:
   what `forageFind` picks, what `m.took` is against `haulCap`, and what phase it ends in. */
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const file = process.argv[2] || 'game.html';
  const b = await chromium.launch({ args: ['--use-gl=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox','--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 900, height: 650 } });
  const errs = []; p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message.slice(0,200)));
  await p.goto('file://' + path.join(__dirname, file), { waitUntil: 'load' });
  await p.waitForTimeout(3000);
  await p.evaluate(() => document.getElementById('btn-start').click());
  await p.waitForTimeout(3500);
  const r = await p.evaluate(() => {
    const step = (n) => { for(let i=0;i<n;i++) update(1/30); };
    const me = player().find(c => c.state === 'ok');
    const HOME = { x: me.x, y: me.y };
    const openNear = (x, y, r) => {
      for(let rad=0; rad<=r; rad++) for(let dy=-rad; dy<=rad; dy++) for(let dx=-rad; dx<=rad; dx++){
        if(!isBlocked(x+dx+0.5, y+dy+0.5, 0)) return { x: x+dx+0.5, y: y+dy+0.5 };
      }
      return { x, y };
    };
    const at = openNear(HOME.x - 30, HOME.y + 18, 8);
    /* five bodies of yours, the way the harness makes them */
    const band = [];
    for(let i=0;i<5;i++){
      const u = makeChar('B'+i, 'player', at.x + i*0.4, at.y, { atk: 20, tough: 20, ath: 20 });
      u.floor = 0; chars.push(u); band.push(u);
    }
    const cdr = band[0];
    const cp = (dx, dy) => { const q = openNear(at.x+dx, at.y+dy, 4); return { x: q.x, y: q.y, opened: false, loot: { cats: 100, items: {} } }; };
    const c1 = cp(9,5), c2 = cp(-7,-9), far = cp(90,0);
    chests.push(c1, c2, far);
    /* what else is on the ground the order will sweep */
    const R = 22;
    const corpsesInRange = corpses.filter(o => !o.looted && (o.floor||0)===0 && dist(o.x,o.y,cdr.x,cdr.y) < R).length;
    giveCommand(cdr, band, 'forage', { x: cdr.x, y: cdr.y }, R);
    const cap = haulCap(cdr);
    const trace = [];
    let sweeps = 0, closedAt = -1;
    for(; sweeps < 240 && !(c1.opened && c2.opened); sweeps++){
      step(6);
      const m = cdr.cmd;
      if(!m){ closedAt = sweeps; break; }
      if(sweeps % 10 === 0 || trace.length < 4)
        trace.push({ s: sweeps, ph: m.phase, took: m.took,
                     ct: cdr.chestTarget ? 'chest' : (cdr.lootTarget ? 'corpse' : null),
                     d1: +dist(cdr.x,cdr.y,c1.x,c1.y).toFixed(1), d2: +dist(cdr.x,cdr.y,c2.x,c2.y).toFixed(1) });
    }
    const out = { corpsesInRange, cap, sweeps, closedAt,
                  c1: c1.opened, c2: c2.opened, far: far.opened,
                  endPhase: cdr.cmd ? cdr.cmd.phase : 'CLOSED OUT',
                  endTook: cdr.cmd ? cdr.cmd.took : null,
                  near1: +Math.min(...band.map(u=>dist(u.x,u.y,c1.x,c1.y))).toFixed(1),
                  near2: +Math.min(...band.map(u=>dist(u.x,u.y,c2.x,c2.y))).toFixed(1),
                  trace: trace.slice(0, 26) };
    [c1,c2,far].forEach(ch => chests.splice(chests.indexOf(ch),1));
    for(const u of band){ const i = chars.indexOf(u); if(i>=0) chars.splice(i,1); }
    return out;
  });
  for(const e of errs) console.log(e);
  console.log(JSON.stringify(r, null, 1));
  await b.close();
})();
