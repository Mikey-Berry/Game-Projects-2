const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox','--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 900, height: 600 } });
  p.on('pageerror', e => console.log('PAGEERROR:', e.message.slice(0,300)));
  await p.goto('file:///home/user/Game-Projects-2/tools/game.html', { waitUntil: 'load' });
  await p.waitForTimeout(2600);
  await p.evaluate(() => { document.getElementById('btn-start').click(); paused = true; });
  await p.waitForTimeout(3000);
  const out = await p.evaluate(() => {
    paused = true;
    const R = {};
    const me = player()[0];
    // stage a wed couple in the squad, prime ages, standing together
    const mk = (sex) => { const c = makeChar('X','player', me.x+0.5, me.y+0.5,
      {race:'human', sub:'dustborn', sex, age:26, atk:5,def:5,tough:5,ath:5}); c.state='ok'; chars.push(c); return c; };
    const w = mk('f'), h = mk('m');
    marry(w, h);
    R.wed = `${w.name}(${w.sex},${w.age}) + ${h.name}(${h.sex},${h.age}) spouse=${w.spouse===h.id&&h.spouse===w.id}`;
    R.pairBreeds = pairBreeds(w, h);
    R.bannerLoad = bannerLoad(); R.SQUAD_CAP = SQUAD_CAP;
    R.blockedByCap = bannerLoad() >= SQUAD_CAP;
    R.dist = +dist(w.x,w.y,h.x,h.y).toFixed(2);
    // run 200 game-days of the rollover and count births
    const before = chars.length;
    let pregnancies = 0, births = 0;
    const realLog = log;
    window.log = (m,k) => { if(/child is born/i.test(String(m))) births++; return realLog(m,k); };
    /* the rollover is `if(hour >= 24)` inside `update`, so push the clock to the boundary and
       take one step — one whole game-day of bookkeeping per iteration, without simulating the
       192 real seconds a day actually takes */
    for(let d=0; d<200; d++){
      const wasP = (w.pregnant||0) + (h.pregnant||0);
      hour = 23.999; update(1/30);
      if(((w.pregnant||0)+(h.pregnant||0)) > wasP) pregnancies++;
      w.x = me.x+0.5; w.y = me.y+0.5; h.x = me.x+0.6; h.y = me.y+0.6;   /* keep them together */
    }
    window.log = realLog;
    R.over200days = {pregnancies, births, chars: chars.length - before};
    return R;
  });
  console.log(JSON.stringify(out, null, 1));
  await b.close();
})();
