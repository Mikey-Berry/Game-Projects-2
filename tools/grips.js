#!/usr/bin/env node
/* Every weapon in the game, held, in one sheet.
 *
 * The bow's rest rotation turned out to be authored against a pose that no longer exists,
 * and there is no reason to think it was the only one — the same is true of every `rest`
 * euler in WEAPONS. This holds each weapon in the same committed pose and tiles them, so a
 * grip that has come loose from its stance is obvious at a glance instead of being found
 * one weapon at a time.
 *
 *   node tools/grips.js out.png          # all of them
 *   node tools/grips.js out.png 0.85     # hold the swing at a different point
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const OUT = path.resolve(process.argv[2] || path.join(__dirname, 'grips.png'));
const K = Number(process.argv[3] || 0.5);   /* 0 = start of the wind, 1 = fully committed */
const WEPS = ['w_plank', 'w_club', 'w_rkat', 'w_kat', 'w_nod', 'w_kingsfang',
              'w_pyre', 'w_sever', 'w_bow', 'w_xbow', 'w_lance'];

(async () => {
  const b = await chromium.launch({
    executablePath: process.env.DUSTWARD_CHROME || undefined,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'],
  });
  const p = await b.newPage({ viewport: { width: 560, height: 470 } });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message.slice(0, 200)));
  await p.goto('file://' + path.join(__dirname, 'game.html'), { waitUntil: 'load' });
  await p.waitForTimeout(3000);
  await p.evaluate(() => document.getElementById('btn-start').click());
  await p.waitForTimeout(3000);

  await p.evaluate(() => {
    for (let y = 40; y < H - 40; y += 7) { for (let x = 40; x < W - 40; x += 7) {
      let ok = true;
      for (let j = -3; j <= 3 && ok; j++) for (let i = -3; i <= 3; i++) if (isBlocked(x + i, y + j, 0)) { ok = false; break; }
      if (ok) { window.__S = { x, y }; break; }
    } if (window.__S) break; }
    const S = window.__S || { x: 600, y: 600 };
    chars.length = 0;
    const a = makeChar('Holder', 'player', S.x, S.y, { atk: 20, blades: 40, blunt: 40, ranged: 40 });
    const d = makeChar('Post', 'bandit', S.x + 5, S.y, { def: 6, tough: 90 });
    a.state = d.state = 'ok';
    chars.push(a, d);
    window.__A = a; window.__D = d;
    camX = S.x + 0.25; camY = S.y; camSX = camX; camSY = camY;
    camDist = camDistTarget = 5.6; camPitchT = camPitch = 0.34; camYawT = camYaw = 2.95;
    hour = 11; speed = 0;
    renderer.domElement.id = '__gl';
    const hs = document.createElement('style'); hs.id = '__hide';
    hs.textContent = 'body > *:not(#__gl){display:none !important}';
    document.head.appendChild(hs);
  });

  const shots = [], names = [];
  for (const wep of WEPS) {
    const rng = await p.evaluate((w) => {
      const a = window.__A;
      a.weapon = w;
      const r = !!(ITEMS[w] && ITEMS[w].range);
      a.stance = r ? 'ranged' : 'melee';
      syncChars();
      return r;
    }, wep);
    /* settle the pose, holding the swing open at a fixed point of the beat */
    for (let i = 0; i < 40; i++) {
      await p.evaluate(({ k, rng }) => {
        const a = window.__A, d = window.__D;
        d.x = window.__S.x + (rng ? 5 : 0.75); d.y = window.__S.y; d.state = 'ok';
        a.x = window.__S.x; a.y = window.__S.y; a.target = d; a.targetManual = true;
        const dur = 0.5;
        a.windup = { t: dur * (1 - k), kind: rng ? 'ranged' : 'melee', tgt: d.id, dur };
        physics(a, 1 / 60);
      }, { k: K, rng });
      await p.waitForTimeout(16);
    }
    shots.push(await p.screenshot({ clip: { x: 150, y: 70, width: 270, height: 340 } }));
    names.push(await p.evaluate(w => ITEMS[w].name, wep));
  }

  const sheet = await p.evaluate(async ({ imgs, names, k }) => {
    const L = await Promise.all(imgs.map(d => new Promise(r => {
      const im = new Image(); im.onload = () => r(im); im.src = 'data:image/png;base64,' + d;
    })));
    const cols = 6, rows = Math.ceil(L.length / cols);
    const w = L[0].width, h = L[0].height, LBL = 30;
    const cv = document.createElement('canvas');
    cv.width = w * cols; cv.height = (h + LBL) * rows + 12;
    const g = cv.getContext('2d');
    g.fillStyle = '#12100d'; g.fillRect(0, 0, cv.width, cv.height);
    L.forEach((im, i) => {
      const x = (i % cols) * w, y = ((i / cols) | 0) * (h + LBL) + 12;
      g.drawImage(im, x, y + LBL - 6);
      g.fillStyle = '#ffd479'; g.font = 'bold 17px monospace';
      g.fillText(names[i], x + 8, y + 18);
      g.strokeStyle = '#3a342a'; g.strokeRect(x + 0.5, y + LBL - 6.5, w - 1, h - 1);
    });
    return cv.toDataURL('image/png').split(',')[1];
  }, { imgs: shots.map(s => s.toString('base64')), names, k: K });

  fs.writeFileSync(OUT, Buffer.from(sheet, 'base64'));
  console.log(`${path.basename(OUT)} — ${shots.length} weapons held at k=${K}`);
  if (errs.length) console.log('errs:', errs.length, errs.slice(0, 3));
  await b.close();
})();
