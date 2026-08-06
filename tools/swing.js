#!/usr/bin/env node
/* A swing, frame by frame, as a contact sheet.
 *
 * Animation is the one thing in this project that cannot be checked with a number. This
 * stages a duel under a close camera, steps the sim by hand at a fixed dt so the frames are
 * evenly spaced in SIM time rather than wall time, and writes every Nth frame to a strip —
 * so the wind, the hang at the top, the commit and the follow-through can actually be seen.
 *
 *   node tools/swing.js w_nod out.png     # one weapon
 *   node tools/swing.js                   # defaults to the nodachi
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const WEPS = (process.argv[2] || 'w_nod,w_kat').split(',');
const OUT = path.resolve(process.argv[3] || path.join(__dirname, 'swing.png'));

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

  /* stage two fighters on clean ground, put the eye on them, and stop the world moving */
  const stage = async (wep) => await p.evaluate((wep) => {
    for (let y = 40; y < H - 40; y += 7) for (let x = 40; x < W - 40; x += 7) {
      let ok = true;
      for (let j = -3; j <= 3 && ok; j++) for (let i = -3; i <= 3; i++) if (isBlocked(x + i, y + j, 0)) { ok = false; break; }
      if (ok) { window.__S = { x, y }; break; }
      if (window.__S) break;
    }
    const S = window.__S || { x: 600, y: 600 };
    chars.length = 0;
    const a = makeChar('Swinger', 'player', S.x, S.y, { atk: 20, blades: 40, blunt: 40, tough: 20 });
    /* a bow refuses to fire inside 1.7 tiles — it guards instead. Standing the target at
       arm's length meant every ranged row came back empty. */
    window.__R = (ITEMS[wep] && ITEMS[wep].range) ? 5 : 0.75;
    const d = makeChar('Post', 'bandit', S.x + window.__R, S.y, { def: 6, tough: 90 });
    a.state = d.state = 'ok'; a.weapon = wep; d.armor = 'a_pla';
    a.target = d; a.targetManual = true;
    chars.push(a, d);
    window.__A = a; window.__D = d;
    camX = S.x + 0.25; camY = S.y; camSX = camX; camSY = camY;
    camDist = camDistTarget = 5.6; camPitchT = camPitch = 0.34; camYawT = camYaw = 1.35;
    hour = 11;                       /* midday: the pose has to be visible to be judged */
    speed = 0;                       /* the world holds still; we step the duel ourselves */
    /* Strip the HUD: the WebGL canvas and nothing else. Hiding the panels one by one with
       inline styles does not hold — the game re-shows them whenever a panel refreshes, and
       the katana row of the first comparison sheet came out buried behind the character
       readout. A stylesheet with !important outranks anything set inline afterwards. */
    renderer.domElement.id = '__gl';
    let hs = document.getElementById('__hide');
    if(!hs){ hs = document.createElement('style'); hs.id = '__hide'; document.head.appendChild(hs); }
    hs.textContent = 'body > *:not(#__gl){display:none !important}';
  }, wep);

  /* step until a swing is actually committed, then capture across the whole beat */
  const DT = 1 / 30;
  const rows = [];
  for (const WEP of WEPS) {
  await stage(WEP);
  await p.waitForTimeout(1200);
  const shots = [];
  let started = false, frames = 0;
  for (let i = 0; i < 260 && shots.length < 8; i++) {
    const st = await p.evaluate((dt) => {
      const a = window.__A, d = window.__D;
      d.x = window.__S.x + window.__R; d.y = window.__S.y; d.state = 'ok'; d.staggerT = 0;
      for (const k in d.parts) d.parts[k].hp = 100;
      d.blood = 100;
      a.target = d; a.targetManual = true;
      a.x = window.__S.x; a.y = window.__S.y;
      physics(a, dt);
      return { wind: a.windup ? a.windup.t / a.windup.dur : -1, rec: a.recoverT, cd: a.atkCd };
    }, DT);
    await p.waitForTimeout(55);   /* let the render loop draw the new pose */
    if (!started && st.wind >= 0) started = true;
    if (started) {
      if (frames % 2 === 0) shots.push(await p.screenshot({ clip: { x: 150, y: 70, width: 270, height: 340 } }));
      frames++;
      if (st.wind < 0 && st.rec <= 0 && frames > 6) break;
    }
  }
  rows.push({ wep: WEP, shots });
  }

  /* one row per weapon, so a light blade and a heavy one can be read against each other */
  /* ITEMS is a browser global. Reaching for it out here threw a ReferenceError every run,
     after the whole capture loop had already been paid for — which looked exactly like a
     hang, because the frames were gathered and then thrown away. */
  const payload = rows.map(r => ({ wep: r.wep, imgs: r.shots.map(s => s.toString('base64')) }));
  const names = await p.evaluate(ws => ws.map(w => ITEMS[w].name), WEPS);
  const sheet = await p.evaluate(async ({ payload, names }) => {
    const all = await Promise.all(payload.map(r => Promise.all(r.imgs.map(d => new Promise(res => {
      const im = new Image(); im.onload = () => res(im); im.src = 'data:image/png;base64,' + d;
    })))));
    const cols = Math.max(...all.map(a => a.length));
    const w = all[0][0].width, h = all[0][0].height, LBL = 34;
    const cv = document.createElement('canvas');
    cv.width = w * cols; cv.height = (h + LBL) * all.length;
    const g = cv.getContext('2d');
    g.fillStyle = '#12100d'; g.fillRect(0, 0, cv.width, cv.height);
    all.forEach((row, r) => {
      const top = r * (h + LBL);
      g.fillStyle = '#e8dcc4'; g.font = 'bold 20px monospace';
      g.fillText(names[r] + '  —  one swing, every 2nd frame at 30fps', 10, top + 23);
      row.forEach((im, i) => {
        const x = i * w, y = top + LBL;
        g.drawImage(im, x, y);
        g.fillStyle = '#c4b896'; g.font = 'bold 15px monospace';
        g.fillText(String(i + 1), x + 8, y + 20);
        g.strokeStyle = '#3a342a'; g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      });
    });
    return cv.toDataURL('image/png').split(',')[1];
  }, { payload, names });

  fs.writeFileSync(OUT, Buffer.from(sheet, 'base64'));
  console.log(`${path.basename(OUT)} — ` + rows.map(r => r.shots.length + ' frames of ' + r.wep).join(', '));
  if (errs.length) console.log('errs:', errs.length, errs.slice(0, 3));
  await b.close();
})();
