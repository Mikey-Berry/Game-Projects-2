#!/usr/bin/env node
/* WHO IS RAISING THE ATTENTION — you, or seventeen hundred strangers?
   `noticed` is meant to be the Old Ones noticing YOU. Counts every bump by the faction of the
   body that caused it, over a game day with the player standing still. */
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const file = process.argv[2] || 'game.html';
  const b = await chromium.launch({ args: ['--use-gl=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox','--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 500, height: 400 } });
  const errs = []; p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message.slice(0,200)));
  await p.goto('file://' + path.join(__dirname, file), { waitUntil: 'load' });
  await p.waitForTimeout(2500);
  await p.evaluate(() => document.getElementById('btn-start').click());
  await p.waitForTimeout(5000);
  const r = await p.evaluate(() => {
    const by = {};            /* faction -> total notice contributed */
    const calls = {};         /* source -> count */
    let who = null;
    const tag = (name, fn) => function(c){ const prev = who;
      who = { src: name, fac: (c && c.faction) || '?' };
      try { return fn.apply(this, arguments); } finally { who = prev; } };
    for(const n of ['spendCast','castRaise'])
      if(typeof window[n] === 'function') window[n] = tag(n, window[n]);
    const rBump = window.bumpNotice;
    window.bumpNotice = function(amt){
      if(amt > 0){
        const k = who ? who.fac : '(world)';
        by[k] = +((by[k] || 0) + amt).toFixed(2);
        const s = who ? who.src : '(other)';
        calls[s + ':' + k] = (calls[s + ':' + k] || 0) + 1;
      }
      return rBump.apply(this, arguments);
    };
    /* and count what the feed is being asked to carry */
    const lines = {};
    const rLog = window.log;
    window.log = function(t, k){
      const key = String(t).replace(/^[A-Z][^ ]* /, '~ ').slice(0, 46);
      lines[key] = (lines[key] || 0) + 1;
      return rLog.apply(this, arguments);
    };
    const start = noticed, startTier = noticeTier;
    for(let i = 0, n = Math.round(24 * HOUR_SEC * 30); i < n; i++) update(1/30);
    window.bumpNotice = rBump; window.log = rLog;
    const top = Object.entries(lines).sort((a,b2) => b2[1]-a[1]).slice(0, 14);
    return { start, end: +noticed.toFixed(1), startTier, endTier: noticeTier,
             byFaction: by, calls, topLogLines: top, totalLogLines: Object.values(lines).reduce((a,b2)=>a+b2,0) };
  });
  for(const e of errs) console.log(e);
  console.log(JSON.stringify(r, null, 1));
  await b.close();
})();
