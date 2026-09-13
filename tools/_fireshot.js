const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox','--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1000, height: 640 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message.slice(0,200)));
  await p.goto('file://' + path.join(__dirname, process.argv[2] || 'game.html'));
  await p.waitForTimeout(3000);
  await p.evaluate(() => { document.getElementById('btn-start').click(); });
  await p.waitForTimeout(3000);
  await p.evaluate(() => {
    paused = false; camFollow = false;   /* particles only live while `update` runs */
    const me = player()[0];
    /* OPEN WASTE, AWAY FROM THE TOWN. The first clean run had a brawl wander into frame. */
    let gx = 0, gy = 0;
    outer: for (let y = 200; y < H - 200; y += 9) for (let x = 200; x < W - 200; x += 9) {
      if (towns.some(t => dist(t.x, t.y, x, y) < 120)) continue;
      let ok = true;
      for (let j = -5; j <= 5 && ok; j++) for (let i = -5; i <= 5; i++) if (isBlocked(x+i+0.5, y+j+0.5, 0)) ok = false;
      if (ok) { gx = x; gy = y; break outer; }
    }
    me.x = gx; me.y = gy; me.floor = 0;
    window.__at = {x: gx, y: gy};
    camX = gx - 1.4; camY = gy; camDistTarget = camDist = 5; camPitchT = 0.28; camYawT = 0;
    /* a body on fire, a blade on fire, and a fire of its own */
    const foe = makeChar('Burning', 'bandit', gx + 2.4, gy, {atk:4, def:4, tough:40});
    foe.floor = 0; foe.blood = foe.maxBlood = 9000; chars.push(foe);
    foe.dot = {t: 999, tick: 0.4, dps: 0.1, src: null};
    me.weaponFlame = true;
    window.__blaze = () => { const a = window.__at; addFlame(a.x - 2.0, a.y, 2, 1.25); camX = a.x - 1.4; camY = a.y; camFollow = false; };
  });
  for (let i = 0; i < 90; i++) { await p.evaluate(() => window.__blaze()); await p.waitForTimeout(16); }
  await p.evaluate(() => { const a = window.__at; for (let i = 0; i < 6; i++) addFlame(a.x - 2.0 + (i % 3) * 0.8, a.y + (i < 3 ? 0 : 0.8), 4, 1.5); });
  /* AND GET THE HUD OUT OF THE WAY. A third of the first sheet was the character panel and the
     usual `display: none !important` would not shift it, for a reason worth knowing: this bench
     runs UNPAUSED (particles only live while `update` runs), so the HUD keeps refreshing, and
     the refresh does `p.style.display = 'block'` — a whole-declaration assignment, which does
     not LOSE to the inline `!important`, it REPLACES it. Nothing you write on that element
     survives the next refresh. So the selection is cleared first: with nobody selected the
     panel's own code takes the `display = 'none'` branch and puts itself away. */
  await p.evaluate(() => {
    selected.length = 0;
    document.querySelectorAll('.hud,#charpanel,#ccpanel,#invpanel,#minimap,#log,#tip,#squadbar,#buildbar,#touchbar,#topbar')
      .forEach(el => el.style.setProperty('display', 'none', 'important'));
  });
  await p.waitForTimeout(150);
  await p.screenshot({ path: path.join(__dirname, '..', 'shot-fire.png') });
  console.log('particles:', await p.evaluate(() => particles.length), 'errs:', errs.slice(0,3));
  await b.close();
})();
