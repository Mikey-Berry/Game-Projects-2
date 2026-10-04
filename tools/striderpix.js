#!/usr/bin/env node
/* PICTURES OF THE STRIDER, for iterating on its look (not a suite harness).
 * A strider, an elk and a hound stood side by side on open ground, at two camera distances,
 * walking and standing.
 *   node tools/striderpix.js <outdir> [game.html]
 */
const { chromium } = require('playwright');
const path = require('path');
const gamePath = (a) => path.resolve(a ? (path.isAbsolute(a) ? a : path.join(__dirname, a)) : path.join(__dirname, 'game.html'));
(async () => {
  const OUT = process.argv[2] || '.';
  const b = await chromium.launch({ executablePath: process.env.DUSTWARD_CHROME || undefined, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1000, height: 700 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message.slice(0, 200)));
  await p.goto('file://' + gamePath(process.argv[3]), { waitUntil: 'load', timeout: 90000 });
  await p.waitForSelector('#btn-start', { state: 'attached', timeout: 60000 });
  await p.evaluate(() => document.getElementById('btn-start').click());
  await p.waitForTimeout(2600);
  await p.evaluate(() => {
    for (const el of ['log', 'squadbar', 'topbar', 'minimap', 'charpanel', 'invpanel', 'ccpanel']) { const e = document.getElementById(el); if (e) e.style.display = 'none'; }
    /* open, flat ground well away from anything */
    let S = null;
    for (let y = 300; y < H - 300 && !S; y += 9) for (let x = 300; x < W - 300; x += 9) {
      if (biomeAt(x, y) || inHeadland(x, y, 30) || towns.some(t => dist(t.x, t.y, x, y) < 80)) continue;
      if (towers.some(t => dist(t.x, t.y, x, y) < 70) || (ark && dist(ark.x, ark.y, x, y) < 200) || redoubts.some(r => dist(r.x, r.y, x, y) < 50)
          || corpseSites.some(q => dist(q.x, q.y, x, y) < 60)) continue;
      let ok = true;
      for (let j = -10; j <= 10 && ok; j++) for (let i = -10; i <= 10; i++) if (isBlocked(x + i, y + j) || (Math.abs(i) < 6 && Math.abs(j) < 6 && rawDecorAt(x + i, y + j))) { ok = false; break; }
      if (ok) S = { x, y };
    }
    for (const c of chars) if (c.faction !== 'player' && dist(c.x, c.y, S.x, S.y) < 40) c.x += 300;
    for (const c of player()) { c.x = S.x - 8; c.y = S.y + 6; }
    const mk = (name, f, dx, dy, set) => { const c = makeChar(name, f, S.x + dx, S.y + dy, {}); Object.assign(c, set); c.floor = 0; c.guard = { x: c.x, y: c.y }; chars.push(c); return c; };
    window.__st = mk('Silt Strider', 'fauna', 0, 0, { beast: true, kin: 'strider', big: 1.6, neutral: true });
    window.__st2 = mk('Silt Strider', 'fauna', 4, -3, { beast: true, kin: 'strider', big: 1.6, neutral: true });
    mk('Dust Elk', 'fauna', -4, 1, { beast: true, kin: 'elk', neutral: true });
    mk('Dust Hound', 'fauna', 3.5, 2, { beast: true, kin: 'hound', neutral: true });
    rebuildCharGrid();
    selected = []; if (typeof refreshSquadBar === 'function') refreshSquadBar();
    for (const id of ['selpanel', 'unitpanel', 'charpanel', 'sel', 'panel']) { const e = document.getElementById(id); if (e) e.style.display = 'none'; }
    hour = 13; computeVision();
    camX = camSX = S.x; camY = camSY = S.y; camFollow = false;
    window.__S = S;
  });
  const shots = [['close', 14, 0.32, 0.6], ['play', 34, 0.62, 0.6], ['side', 12, 0.12, 2.2]];
  for (const [nm, d, pitch, yaw] of shots) {
    await p.evaluate(({ d, pitch, yaw }) => { camDist = camDistTarget = d; camPitch = camPitchT = pitch; camYaw = camYawT = yaw; }, { d, pitch, yaw });
    await p.waitForTimeout(900);
    await p.screenshot({ path: path.join(OUT, `strider_${nm}.png`) });
  }
  /* and walking: send the near one off across the camera */
  await p.evaluate(() => { const s = window.__st; s.guard = null; s.moveTarget = { x: window.__S.x + 30, y: window.__S.y }; camDist = camDistTarget = 16; camPitch = camPitchT = 0.3; });
  await p.waitForTimeout(1300);
  await p.screenshot({ path: path.join(OUT, 'strider_walk.png') });
  console.log(errs.join('\n') || 'ok');
  await b.close();
})();
