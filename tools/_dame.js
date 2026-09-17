#!/usr/bin/env node
/* DOES THE DAME DIE, AND WHO KILLS HER. */
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const DAYS = Number(process.argv[2] || 3);
  const b = await chromium.launch({ args: ['--use-gl=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox','--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 500, height: 400 } });
  const errs = []; p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message.slice(0,200)));
  await p.goto('file://' + path.join(__dirname, 'game.html'), { waitUntil: 'load' });
  await p.waitForTimeout(2500);
  await p.evaluate(() => document.getElementById('btn-start').click());
  await p.waitForTimeout(4000);
  const r = await p.evaluate((DAYS) => {
    const d = estate && estate.dame;
    if(!d) return { none: true };
    const log2 = [];
    const rKill = window.kill;
    window.kill = function(c, by){
      if(c === d && c.state !== 'dead')
        log2.push({ what: 'killed', day, by: by ? (by.name + '/' + by.faction) : null,
                    blood: Math.round(c.blood), hunger: Math.round(c.hunger||0) });
      return rKill.apply(this, arguments);
    };
    const track = [];
    const stepsPerDay = Math.round(24 * HOUR_SEC * 30);
    for(let dd = 0; dd < DAYS; dd++){
      for(let i = 0; i < stepsPerDay; i++) update(1/30);
      track.push({ day, state: d.state, blood: Math.round(d.blood), hunger: Math.round(d.hunger||0),
                   age: d.age, inChars: chars.indexOf(d) >= 0,
                   gnawedBy: d.gnawBy || null });
    }
    window.kill = rKill;
    return { track, killEvents: log2, finalState: d.state,
             cannibalsNear: chars.filter(c => c.eater && c.state !== 'dead' &&
                             dist(c.x, c.y, estate.x, estate.y) < 20).length };
  }, DAYS);
  for(const e of errs) console.log(e);
  console.log(JSON.stringify(r, null, 1));
  await b.close();
})();
