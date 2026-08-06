#!/usr/bin/env node
/* Sweep a weapon's rest rotation against a held pose, and look at the results side by side.
 *
 * The `rest` euler on each weapon was authored against whatever the arms happened to be
 * doing at the time. Change the pose and every one of them is silently wrong — the bow came
 * out held diagonally across the chest, because a rotation that read as "bow forward" with
 * the arm hanging down reads as "bow across the ribs" with the arm extended.
 *
 * Guessing new angles blind is slow: every guess costs a full capture. This holds one pose,
 * then sweeps one axis and screenshots each value, so a whole axis is one browser launch.
 *
 *   node tools/grip.js w_bow y 0:3.2 out.png     # sweep rest.y from 0 to 3.2
 *   node tools/grip.js w_xbow x -1:1 out.png
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const WEP = process.argv[2] || 'w_bow';
const AXIS = process.argv[3] || 'y';
const [LO, HI] = (process.argv[4] || '0:3.2').split(':').map(Number);
const OUT = path.resolve(process.argv[5] || path.join(__dirname, 'grip.png'));
const N = 8;

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

  await p.evaluate((wep) => {
    for (let y = 40; y < H - 40; y += 7) { for (let x = 40; x < W - 40; x += 7) {
      let ok = true;
      for (let j = -3; j <= 3 && ok; j++) for (let i = -3; i <= 3; i++) if (isBlocked(x + i, y + j, 0)) { ok = false; break; }
      if (ok) { window.__S = { x, y }; break; }
    } if (window.__S) break; }
    const S = window.__S || { x: 600, y: 600 };
    chars.length = 0;
    const rng = !!(ITEMS[wep] && ITEMS[wep].range);
    const a = makeChar('Holder', 'player', S.x, S.y, { atk: 20, blades: 40, ranged: 40 });
    const d = makeChar('Post', 'bandit', S.x + (rng ? 5 : 0.75), S.y, { def: 6, tough: 90 });
    a.state = d.state = 'ok'; a.weapon = wep; a.stance = rng ? 'ranged' : 'melee';
    a.target = d; a.targetManual = true;
    chars.push(a, d);
    window.__A = a; window.__D = d; window.__RNG = rng;
    camX = S.x + 0.25; camY = S.y; camSX = camX; camSY = camY;
    /* Profile. A rotation sweep has to be judged from the same angle the defect was spotted
       at — from three-quarters you cannot tell "pointing forward" from "pointing across", and
       both lance sweeps run from there were unreadable. */
    camDist = camDistTarget = 5.4; camPitchT = camPitch = 0.30; camYawT = camYaw = 2.95;
    hour = 11; speed = 0;
    renderer.domElement.id = '__gl';
    const hs = document.createElement('style'); hs.id = '__hide';
    hs.textContent = 'body > *:not(#__gl){display:none !important}';
    document.head.appendChild(hs);
  }, WEP);

  /* hold the pose open: a windup that never resolves, refreshed every step */
  for (let i = 0; i < 55; i++) {
    await p.evaluate(() => {
      const a = window.__A, d = window.__D;
      d.x = window.__S.x + (window.__RNG ? 5 : 0.75); d.y = window.__S.y; d.state = 'ok';
      a.x = window.__S.x; a.y = window.__S.y; a.target = d; a.targetManual = true;
      a.windup = { t: 0.30, kind: window.__RNG ? 'ranged' : 'melee', tgt: d.id, dur: 0.45 };
      physics(a, 1 / 60);
    });
    await p.waitForTimeout(18);
  }

  const shots = [], vals = [];
  for (let i = 0; i < N; i++) {
    const v = LO + (HI - LO) * (i / (N - 1));
    vals.push(v);
    await p.evaluate(({ v, axis }) => {
      const a = window.__A, d = window.__D;
      a.windup = { t: 0.30, kind: window.__RNG ? 'ranged' : 'melee', tgt: d.id, dur: 0.45 };
      const e = charMeshes.get(a.id);
      if (e && e.weapon) e.weapon.rotation[axis] = v;
      window.__OK = !!(e && e.weapon);
    }, { v, axis: AXIS });
    await p.waitForTimeout(140);
    shots.push(await p.screenshot({ clip: { x: 150, y: 70, width: 270, height: 340 } }));
  }

  const sheet = await p.evaluate(async ({ imgs, vals, wep, axis }) => {
    const L = await Promise.all(imgs.map(d => new Promise(r => {
      const im = new Image(); im.onload = () => r(im); im.src = 'data:image/png;base64,' + d;
    })));
    const w = L[0].width, h = L[0].height, LBL = 34;
    const cv = document.createElement('canvas');
    cv.width = w * L.length; cv.height = h + LBL;
    const g = cv.getContext('2d');
    g.fillStyle = '#12100d'; g.fillRect(0, 0, cv.width, cv.height);
    g.fillStyle = '#e8dcc4'; g.font = 'bold 20px monospace';
    g.fillText(wep + '  —  rest.' + axis + ' swept, pose held', 10, 23);
    L.forEach((im, i) => {
      g.drawImage(im, i * w, LBL);
      g.fillStyle = '#ffd479'; g.font = 'bold 16px monospace';
      g.fillText(vals[i].toFixed(2), i * w + 8, LBL + 20);
      g.strokeStyle = '#3a342a'; g.strokeRect(i * w + 0.5, LBL + 0.5, w - 1, h - 1);
    });
    return cv.toDataURL('image/png').split(',')[1];
  }, { imgs: shots.map(s => s.toString('base64')), vals, wep: WEP, axis: AXIS });

  fs.writeFileSync(OUT, Buffer.from(sheet, 'base64'));
  console.log(`${path.basename(OUT)} — ${WEP} rest.${AXIS} ${LO}..${HI}`);
  if (errs.length) console.log('errs:', errs.length, errs.slice(0, 3));
  await b.close();
})();
