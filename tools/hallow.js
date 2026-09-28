#!/usr/bin/env node
/* WHAT A SUNDERED SITE HAS LEFT TO SPEND, AND HALLOWED GROUND.
 *
 * "Having gaunts infinitely spawn around them is tough when the sundered ground is near a town.
 *  Let's try option A for now and see how it feels. I do like option C as well and that would
 *  create more use for the sacred ash."
 *
 *   1. a site's gaunt that dies is one fewer the site grows back to, and never below one
 *   2. driven through the real regrowth: a stripped site refills to what it has left, not to
 *      what it started with — and its Marrow Ticks are untouched and come back in full
 *   3. each stage of the Fracture crossed gives one back, never past the start
 *   4. hallowing, through the real right-click on the monument and the real order: the menu
 *      is there with ash in the stores and not without, one of yours walks in and works it,
 *      one measure is spent, and nothing is grown back there for fifteen days — ticks still are
 *   5. and the days run out
 *   6. both ride the save
 *
 * Anything starting '!!' fails the build.
 *
 *   node tools/hallow.js [game.html]
 */
const { chromium } = require('playwright');
const path = require('path');
const gamePath = (a) => path.resolve(a ? (path.isAbsolute(a) ? a : path.join(__dirname, a)) : path.join(__dirname, 'game.html'));

(async () => {
  const b = await chromium.launch({
    executablePath: process.env.DUSTWARD_CHROME || undefined,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'],
  });
  const p = await b.newPage({ viewport: { width: 1100, height: 760 } });
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message.slice(0, 200)));
  await p.goto('file://' + gamePath(process.argv[2]), { waitUntil: 'load', timeout: 90000 });
  await p.waitForSelector('#btn-start', { state: 'attached', timeout: 60000 });
  await p.evaluate(() => document.getElementById('btn-start').click());
  await p.waitForTimeout(2600);

  const out = await p.evaluate(() => {
    paused = true;
    const L = [], bad = (m) => L.push('!! ' + m), ok = (m) => L.push('   ' + m);
    if (typeof siteCap !== 'function') { bad('no siteCap: a site grows back to its full count however often it is cleared'); return L; }
    const s = corpseSites.slice().sort((a, b2) => b2.pop - a.pop)[0];
    const own = () => chars.filter(c => c.siteId === s.id && c.state !== 'dead');
    const gaunts = () => own().filter(c => c.kin !== 'tick');
    const ticks = () => own().filter(c => c.kin === 'tick');
    const regrow = (hours) => { for (let i = 0; i < hours; i++) { rebuildCharGrid(); corpseSiteTick(1); } };
    const pop0 = s.pop, mites0 = s.mites;

    /* 1 */
    const g0 = gaunts();
    const kills = Math.min(g0.length, pop0 + 2);
    const caps = [];
    for (let i = 0; i < g0.length; i++) { kill(g0[i], null); caps.push(siteCap(s)); }
    if (caps[0] !== pop0 - 1) bad(`1. one gaunt down took the cap from ${pop0} to ${caps[0]}`);
    else if (Math.min(...caps) !== SITE_FLOOR) bad(`1. the cap bottomed out at ${Math.min(...caps)}, want ${SITE_FLOOR}`);
    else ok(`1. ${g0.length} gaunts down: cap ${pop0} → ${caps.join(', ')} (never below ${SITE_FLOOR})`);

    /* 2 */
    for (const t of ticks()) kill(t, null);
    regrow(240);
    if (gaunts().length !== SITE_FLOOR) bad(`2. ten days on the stripped site grew back ${gaunts().length} gaunts against a cap of ${siteCap(s)}`);
    else if (ticks().length !== mites0) bad(`2. the ticks came back ${ticks().length} of ${mites0}`);
    else ok(`2. ten days on: ${gaunts().length} gaunt (it had ${pop0}) and ${ticks().length}/${mites0} ticks`);

    /* 3 */
    const f0 = fracture, st0 = fractureStage;
    const capA = siteCap(s);
    pushFracture(FRACTURE_STAGES[st0 + 1].at - fracture + 0.1);
    const capB = siteCap(s);
    pushFracture(FRACTURE_STAGES[st0 + 3].at - fracture + 0.1);
    const capC = siteCap(s);
    if (capB !== capA + 1 || capC !== Math.min(pop0, capA + 3)) bad(`3. the Fracture fed it ${capA} → ${capB} → ${capC} over one stage then two more`);
    else ok(`3. the Fracture feeds it: ${capA} → ${capB} (a stage) → ${capC} (two more)`);
    fracture = f0; fractureStage = st0;
    s.cap = SITE_FLOOR;

    /* 4, the real click and the real order */
    const me = player().find(c => c.state === 'ok' && !c.undead);
    for (const o of player()) if (o !== me) { o.x = me.x + 60; o.y = me.y + 60; }
    const q = findOpenNear(s.x + 7, s.y, 2);
    me.x = q.x; me.y = q.y; me.floor = 0;
    selected = [me];
    camX = camSX = s.x; camY = camSY = s.y; camDist = camDistTarget = 30; camFollow = false;
    for (const g of gaunts()) chars.splice(chars.indexOf(g), 1);
    rebuildCharGrid(); render();
    const click = () => {
      hideCtxMenu();
      const sp = w2s(s.x, s.y, groundY(s.x, s.y) + 0.05);
      document.getElementById('game').dispatchEvent(new MouseEvent('mousedown', { clientX: sp.x, clientY: sp.y, button: 2, buttons: 2, bubbles: true, cancelable: true }));
      const el = document.getElementById('ctxmenu');
      return getComputedStyle(el).display !== 'none' ? [...el.querySelectorAll('button')] : [];
    };
    delete stash.s_ash;
    const noAsh = click().some(x => /HALLOW/.test(x.textContent));
    stash.s_ash = 2;
    const menu = click();
    const hb = menu.find(x => /HALLOW/.test(x.textContent));
    if (noAsh) bad('4. the monument offers HALLOW with no ash in the stores');
    if (!hb) bad(`4. right-clicking the monument with ash offered: ${menu.map(x => x.textContent).join(' | ') || 'nothing'}`);
    else {
      hb.click();
      if (me.hallowTarget !== s) bad('4. HALLOW gave nobody the order');
      paused = false;
      for (let i = 0; i < 30 * 40 && me.hallowTarget; i++) update(1 / 30);
      paused = true;
      const d0 = day;
      if (me.hallowTarget) bad(`4. forty seconds on, ${me.name} is still at it (${dist(me.x, me.y, s.x, s.y).toFixed(1)} tiles off, ${(me.hallowT || 0).toFixed(1)}s worked)`);
      else if ((stash.s_ash || 0) !== 1) bad(`4. ash left ${stash.s_ash || 0}, want 1`);
      else if (!siteHallowed(s) || Math.abs(s.hallowUntil - d0 - HALLOW_DAYS) > 0.1) bad(`4. hallowed until ${s.hallowUntil} on day ${d0}`);
      else {
        for (const t of ticks()) kill(t, null);
        regrow(72);
        if (gaunts().length) bad(`4. the hallowed ground grew ${gaunts().length} gaunts in three days`);
        else if (ticks().length !== mites0) bad(`4. the hallowed ground grew back ${ticks().length}/${mites0} ticks`);
        else ok(`4. the menu is there only with ash; ${me.name} walked in and worked it; ash 2 → 1; hallowed ${HALLOW_DAYS} days; three days on: no gaunts, ${ticks().length} ticks`);
      }
    }
    hideCtxMenu();

    /* 6, before the days run out */
    const snap = snapshot();
    const want = { cap: siteCap(s), until: s.hallowUntil || 0 };
    s.cap = s.pop; s.hallowUntil = 0;
    restore(JSON.parse(JSON.stringify(snap)));
    const s2 = corpseSites.find(x => x.id === s.id);
    if (siteCap(s2) !== want.cap || Math.abs((s2.hallowUntil || 0) - want.until) > 1e-6) bad(`6. after a reload: cap ${siteCap(s2)} (want ${want.cap}), hallowed until ${s2.hallowUntil} (want ${want.until})`);
    else ok(`6. a reload keeps cap ${want.cap} and the hallowing to day ${want.until.toFixed(2)}`);

    /* 5 */
    day = s2.hallowUntil + 0.01;
    const back = siteHallowed(s2);
    for (let i = 0; i < 240; i++) { rebuildCharGrid(); corpseSiteTick(1); }
    const n5 = chars.filter(c => c.siteId === s2.id && c.state !== 'dead' && c.kin !== 'tick').length;
    if (back || n5 !== siteCap(s2)) bad(`5. with the days run out: hallowed ${back}, ${n5} gaunts against a cap of ${siteCap(s2)}`);
    else ok(`5. the days run out and it grows back to what it has left: ${n5}`);
    return L;
  });
  for (const l of out) console.log(l);
  for (const e of errs) console.log('!! ' + e);
  const failed = out.some(l => l.startsWith('!!')) || errs.length;
  console.log(failed ? 'FAIL' : 'PASS');
  await b.close();
  process.exit(failed ? 1 : 0);
})();
