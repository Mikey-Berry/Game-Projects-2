#!/usr/bin/env node
/* DOES THE UNDERGROUND EAT ITSELF BEFORE YOU GET THERE?
 *   "all the underground fights resolve well before I ever go there. So I usually just find
 *    bloody aftermaths and that's it."
 * Runs the world forward whole game-days with nobody underground, and counts what is left.
 *   node tools/_attrition.js [game.html] [days] */
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const file = process.argv[2] || 'game.html';
  const DAYS = Number(process.argv[3] || 3);
  const b = await chromium.launch({ args: ['--use-gl=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox','--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 500, height: 400 } });
  const errs = []; p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message.slice(0,200)));
  await p.goto('file://' + path.join(__dirname, file), { waitUntil: 'load' });
  await p.waitForTimeout(2500);
  await p.evaluate(() => document.getElementById('btn-start').click());
  await p.waitForTimeout(5000);
  const rows = await p.evaluate((DAYS) => {
    const census = () => {
      const o = { day, byFloor: {}, corpsesByFloor: {}, fighting: {} };
      for(const c of chars){
        if(c.state === 'dead' || c.faction === 'player') continue;
        const f = c.floor || 0;
        o.byFloor[f] = (o.byFloor[f] || 0) + 1;
        if(c.target || c.windup) o.fighting[f] = (o.fighting[f] || 0) + 1;
      }
      for(const b2 of corpses){ const f = b2.floor || 0; o.corpsesByFloor[f] = (o.corpsesByFloor[f] || 0) + 1; }
      return o;
    };
    const out = [census()];
    /* one game day = 24 hours x HOUR_SEC seconds, driven at the sim's own step */
    const stepsPerDay = Math.round(24 * HOUR_SEC * 30);
    for(let d = 0; d < DAYS; d++){
      for(let i = 0; i < stepsPerDay; i++) update(1/30);
      out.push(census());
    }
    return out;
  }, DAYS);
  for(const e of errs) console.log(e);
  const floors = [0, -1, -2, -3];
  console.log('day |' + floors.map(f => ('  f' + f).padStart(8)).join('') + '  |' + floors.map(f => ('c' + f).padStart(7)).join(''));
  for(const r of rows){
    console.log(String(r.day).padStart(3) + ' |' +
      floors.map(f => String((r.byFloor[f]||0) + (r.fighting[f] ? '*' + r.fighting[f] : '')).padStart(8)).join('') +
      '  |' + floors.map(f => String(r.corpsesByFloor[f]||0).padStart(7)).join(''));
  }
  console.log('\n(f = living bodies on that floor, *n = how many mid-fight; c = corpses)');
  await b.close();
})();
