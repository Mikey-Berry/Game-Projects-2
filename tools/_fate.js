#!/usr/bin/env node
/* WHAT ACTUALLY HAPPENS TO THE UNDERGROUND — killed, or quietly removed?
   414 bodies left the living census in one game-day and only 26 corpses appeared. Those are
   two different mechanisms wanting two different fixes, so they are counted separately. */
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox','--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 500, height: 400 } });
  const errs = []; p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message.slice(0,200)));
  await p.goto('file://' + path.join(__dirname, 'game.html'), { waitUntil: 'load' });
  await p.waitForTimeout(2500);
  await p.evaluate(() => document.getElementById('btn-start').click());
  await p.waitForTimeout(5000);
  const r = await p.evaluate(() => {
    const killed = {}, born = {};
    const rKill = window.kill;
    window.kill = function(c, by){
      if(c && c.state !== 'dead'){ const f = c.floor || 0; killed[f] = (killed[f]||0) + 1; }
      return rKill.apply(this, arguments);
    };
    const rMake = window.makeChar;
    window.makeChar = function(){ const c = rMake.apply(this, arguments);
      if(c){ const f = c.floor || 0; born[f] = (born[f]||0) + 1; } return c; };
    const snap = () => { const o = {}; for(const c of chars){
      if(c.state === 'dead' || c.faction === 'player') continue; const f = c.floor||0; o[f]=(o[f]||0)+1; } return o; };
    const before = snap();
    const ids = new Set(chars.filter(c => c.state !== 'dead' && c.faction !== 'player').map(c => c.id));
    const stepsPerDay = Math.round(24 * HOUR_SEC * 30);
    for(let i = 0; i < stepsPerDay; i++) update(1/30);
    const after = snap();
    /* of the bodies alive at the start, how many are now dead, and how many are simply GONE
       from `chars` altogether without ever having been killed */
    const still = new Map(chars.map(c => [c.id, c]));
    let nowDead = 0, nowGone = 0, stillAlive = 0;
    const goneByFloor = {}, deadByFloor = {};
    for(const id of ids){
      const c = still.get(id);
      if(!c){ nowGone++; continue; }
      if(c.state === 'dead'){ nowDead++; deadByFloor[c.floor||0] = (deadByFloor[c.floor||0]||0)+1; }
      else stillAlive++;
    }
    /* the gone ones cannot report their own floor — reconstruct from the census difference */
    for(const f of Object.keys(before)){
      const lost = (before[f]||0) - (after[f]||0);
      const d = deadByFloor[f] || 0;
      if(lost - d > 0) goneByFloor[f] = lost - d;
    }
    window.kill = rKill; window.makeChar = rMake;
    return { before, after, startedWith: ids.size, nowDead, nowGone, stillAlive,
             killCallsByFloor: killed, bornByFloor: born, deadByFloor, goneByFloorApprox: goneByFloor,
             corpses: corpses.length };
  });
  for(const e of errs) console.log(e);
  console.log(JSON.stringify(r, null, 1));
  await b.close();
})();
