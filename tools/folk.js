#!/usr/bin/env node
/* People and creatures, side by side, at the same scale.
 *
 * A model is judged against its neighbours, not on its own — a Scaleborn looks fine alone
 * and reads as "a human with slabs on its back" the moment a human stands beside it. This
 * lines up whatever you name and shoots them all from the same camera.
 *
 *   node tools/folk.js out.png human,scaleborn,gaunt,strider,sixfold
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const OUT = path.resolve(process.argv[2] || path.join(__dirname, 'folk.png'));
const WHO = (process.argv[3] || 'human,scaleborn,gaunt,maw,strider,sixfold').split(',');

(async () => {
  const b = await chromium.launch({
    executablePath: process.env.DUSTWARD_CHROME || undefined,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'],
  });
  const p = await b.newPage({ viewport: { width: 560, height: 470 } });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message.slice(0, 220)));
  await p.goto('file://' + path.join(__dirname, 'game.html'), { waitUntil: 'load' });
  await p.waitForTimeout(3000);
  await p.evaluate(() => document.getElementById('btn-start').click());
  await p.waitForTimeout(3000);

  await p.evaluate(() => {
    for (let y = 40; y < H - 40; y += 7) { for (let x = 40; x < W - 40; x += 7) {
      let ok = true;
      for (let j = -4; j <= 4 && ok; j++) for (let i = -4; i <= 4; i++) if (isBlocked(x + i, y + j, 0)) { ok = false; break; }
      if (ok) { window.__S = { x, y }; break; }
    } if (window.__S) break; }
    chars.length = 0;
    camX = window.__S.x; camY = window.__S.y; camSX = camX; camSY = camY;
    camDist = camDistTarget = 8.5; camPitchT = camPitch = 0.30; camYawT = camYaw = 2.95;
    hour = 11; speed = 0;
    /* Non-player characters are skipped by the renderer unless their tile is IN SIGHT, and
       emptying `chars` removes every player unit, so nothing holds the fog open and every
       subject renders as bare ground. Third harness in this project to come back blank for
       a reason that was not the camera; the game has a flag for exactly this. */
    debugSeeAll = true;
    renderer.domElement.id = '__gl';
    const hs = document.createElement('style'); hs.id = '__hide';
    hs.textContent = 'body > *:not(#__gl){display:none !important}';
    document.head.appendChild(hs);
  });

  const shots = [], labels = [];
  for (const who of WHO) {
    const lab = await p.evaluate((w) => {
      const S = window.__S;
      chars.length = 0;
      let c;
      if (w === 'strider') {
        c = makeChar('Silt Strider', 'beast', S.x, S.y, { ath: 10 });
        c.beast = true; c.big = 1.6; c.kin = 'strider';
      } else if (w === 'sixfold') {
        c = makeChar('The Sixfold', 'gaunt', S.x, S.y, { atk: 55, tough: 70 });
        c.beast = true; c.bossKey = 'sixfold'; c.gauntKind = 'sixfold'; c.big = 2.4; c.clawDmg = 26;
      } else if (GAUNTS && GAUNTS[w]) {
        c = spawnGaunt ? null : null;
        c = makeChar(GAUNTS[w].name, 'gaunt', S.x, S.y, { atk: 20 });
        c.beast = true; c.gauntKind = w; c.big = GAUNTS[w].big; c.clawDmg = GAUNTS[w].claw;
      } else {
        c = makeChar('Townsfolk', 'town', S.x, S.y, { atk: 10 });
        c.race = w; c.weapon = 'w_kat';
      }
      c.state = 'ok';
      chars.push(c);
      window.__C = c;
      return c.name + ' [' + (c.race || '-') + ']  big ' + (c.big || 1).toFixed(2) + '  x' + vscaleOf(c).toFixed(2);
    }, who);
    await p.waitForTimeout(2200);
    /* let it walk, so the tail and stride are doing something */
    for (let i = 0; i < 22; i++) {
      await p.evaluate(() => {
        const c = window.__C, S = window.__S;
        c.moveTarget = { x: S.x + 3, y: S.y };
        physics(c, 1 / 30);
        /* Build the rig by hand. syncChars() is driven off the SIM step, and the harness
           freezes the world at speed 0 to hold a pose — so the sim never advances and no
           new rig is ever built. grips.js gets away with it by making one character and
           only swapping its weapon; every subject here is a fresh body, so every subject
           after the first rendered as the previous one's leftover mesh. */
        syncChars(1 / 30);
        if (Math.hypot(c.x - S.x, c.y - S.y) > 1.2) { c.x = S.x; c.y = S.y; }
      });
      await p.waitForTimeout(30);
    }
    const built = await p.evaluate(() => {
      const e = charMeshes.get(window.__C.id);
      return { race: window.__C.race, mesh: !!e, tail: !!(e && e.tail), parts: e ? e.g.children.length : 0,
               id: window.__C.id, meshCount: charMeshes.size, keys: [...charMeshes.keys()].slice(0, 6),
               seeAll: (typeof debugSeeAll !== 'undefined') ? debugSeeAll : 'undef',
               vis: visAt(window.__C.x, window.__C.y), inChars: chars.indexOf(window.__C) };
    });
    shots.push(await p.screenshot({ clip: { x: 140, y: 40, width: 290, height: 400 } }));
    labels.push(lab + '  ' + (built.tail ? 'TAIL' : 'no-tail') + ' n=' + built.parts);
    if (!built.mesh) console.log('  WARNING: no rig built —', JSON.stringify(built));
  }

  const sheet = await p.evaluate(async ({ imgs, labels }) => {
    const L = await Promise.all(imgs.map(d => new Promise(r => {
      const im = new Image(); im.onload = () => r(im); im.src = 'data:image/png;base64,' + d;
    })));
    const w = L[0].width, h = L[0].height, LBL = 30;
    const cv = document.createElement('canvas');
    cv.width = w * L.length; cv.height = h + LBL;
    const g = cv.getContext('2d');
    g.fillStyle = '#12100d'; g.fillRect(0, 0, cv.width, cv.height);
    L.forEach((im, i) => {
      g.drawImage(im, i * w, LBL);
      g.fillStyle = '#ffd479'; g.font = 'bold 15px monospace';
      g.fillText(labels[i], i * w + 8, 20);
      g.strokeStyle = '#3a342a'; g.strokeRect(i * w + 0.5, LBL + 0.5, w - 1, h - 1);
    });
    return cv.toDataURL('image/png').split(',')[1];
  }, { imgs: shots.map(s => s.toString('base64')), labels });

  fs.writeFileSync(OUT, Buffer.from(sheet, 'base64'));
  console.log(`${path.basename(OUT)} — ${shots.length}: ${WHO.join(', ')}`);
  if (errs.length) console.log('errs:', errs.length, errs.slice(0, 4));
  await b.close();
})();
