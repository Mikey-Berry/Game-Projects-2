const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox','--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 400, height: 300 } });
  await p.goto('file://' + path.join(__dirname, 'game.html'), { waitUntil: 'load' });
  await p.waitForTimeout(2500);
  await p.evaluate(() => document.getElementById('btn-start').click());
  await p.waitForTimeout(4000);
  console.log(JSON.stringify(await p.evaluate(() => {
    const d = estate && estate.dame, s = estate && estate.servant;
    const info = (c) => !c ? null : ({
      name: c.name, age: +(c.age||0).toFixed(1), race: c.race, sub: c.sub||null,
      deathAge: traitOf(c, 'deathAge', 62),
      exempt: !!(c.undead||c.beast||c.bossKey||c.mobileVendor||c.isLeader>=0||c.immortal),
      perDay: +Math.max(0, ((c.age||0) - traitOf(c,'deathAge',62)) * 0.004).toFixed(4),
    });
    const dd = info(d), ss = info(s);
    const odds = (o, n) => o ? +(1 - Math.pow(1 - o.perDay, n)).toFixed(3) : null;
    /* and everybody else the world leans on */
    const named = chars.filter(c => c.state !== 'ok' ? false : (c.orchardDame||c.orchardServant||c.orchardKin||c.bossKey||c.isLeader>=0))
      .map(c => ({ n: c.name, age: +(c.age||0).toFixed(0), dAge: traitOf(c,'deathAge',62),
                   exempt: !!(c.bossKey||c.isLeader>=0||c.immortal||c.undead) }))
      .filter(x => !x.exempt && x.age > x.dAge);
    return { dame: dd, dameDeadBy30d: odds(dd, 30), dameDeadBy60d: odds(dd, 60),
             servant: ss, servantDeadBy30d: odds(ss, 30),
             otherDoomedNamed: named };
  }), null, 1));
  await b.close();
})();
