#!/usr/bin/env node
/* Every attack arc, one per row.
 *
 * pickMove() chooses by situation and dice, so a plain capture shows whichever stroke the
 * roll happened to land on. This forces each one in turn and captures the whole beat, so
 * the six arcs can be compared — and so an arc that is subtly the same as another, which is
 * the real failure mode here, is visible rather than assumed.
 *
 *   node tools/moves.js out.png [weapon]
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const OUT = path.resolve(process.argv[2] || path.join(__dirname, 'moves.png'));
const WEP = process.argv[3] || 'w_kat';
const KEYS = ['slash', 'overhead', 'thrust', 'cleave', 'rising', 'spin'];

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
    const a = makeChar('Swinger', 'player', S.x, S.y, { atk: 20, blades: 90, blunt: 90 });
    const d = makeChar('Post', 'bandit', S.x + 0.75, S.y, { def: 6, tough: 90 });
    a.state = d.state = 'ok'; a.weapon = wep;
    a.target = d; a.targetManual = true;
    chars.push(a, d);
    window.__A = a; window.__D = d;
    camX = S.x + 0.25; camY = S.y; camSX = camX; camSY = camY;
    camDist = camDistTarget = 5.6; camPitchT = camPitch = 0.34; camYawT = camYaw = 2.95;
    hour = 11; speed = 0;
    renderer.domElement.id = '__gl';
    const hs = document.createElement('style'); hs.id = '__hide';
    hs.textContent = 'body > *:not(#__gl){display:none !important}';
    document.head.appendChild(hs);
    /* top-level functions are window properties here, so the chooser can be pinned */
    window.__realPick = pickMove;   /* put back after the sweep — see below */
  }, WEP);

  const DT = 1 / 30, rows = [];
  for (const key of KEYS) {
    await p.evaluate((k) => {
      window.pickMove = () => k;
      const a = window.__A;
      a.windup = null; a.recoverT = 0; a.atkCd = 0; a.swingMove = null;
    }, key);
    const shots = [];
    let started = false, frames = 0;
    for (let i = 0; i < 200 && shots.length < 8; i++) {
      const st = await p.evaluate((dt) => {
        const a = window.__A, d = window.__D;
        d.x = window.__S.x + 0.75; d.y = window.__S.y; d.state = 'ok'; d.staggerT = 0;
        for (const kk in d.parts) d.parts[kk].hp = 100;
        d.blood = 100;
        a.x = window.__S.x; a.y = window.__S.y; a.target = d; a.targetManual = true;
        physics(a, dt);
        return { wind: a.windup ? a.windup.t / a.windup.dur : -1, rec: a.recoverT };
      }, DT);
      await p.waitForTimeout(55);
      if (!started && st.wind >= 0) started = true;
      if (started) {
        if (frames % 2 === 0) shots.push(await p.screenshot({ clip: { x: 150, y: 70, width: 270, height: 340 } }));
        frames++;
        if (st.wind < 0 && st.rec <= 0 && frames > 6) break;
      }
    }
    rows.push({ key, shots });
  }

  /* unpin the chooser: anything added after this loop would otherwise silently run with
     whichever move the last row happened to force */
  await p.evaluate(() => { if (window.__realPick) window.pickMove = window.__realPick; });

  const labels = await p.evaluate(ks => ks.map(k => {
    const m = MOVES[k];
    return m.label + '   x' + m.dmg.toFixed(2) + ' dmg, ' + (m.extra + 1) + ' bodies, arc ' +
      m.arc.toFixed(2) + (m.skill ? ', skill ' + m.skill : '');
  }), KEYS);

  const sheet = await p.evaluate(async ({ payload, labels }) => {
    const all = await Promise.all(payload.map(r => Promise.all(r.map(d => new Promise(res => {
      const im = new Image(); im.onload = () => res(im); im.src = 'data:image/png;base64,' + d;
    })))));
    const cols = Math.max(...all.map(a => a.length));
    const w = all[0][0].width, h = all[0][0].height, LBL = 30;
    const cv = document.createElement('canvas');
    cv.width = w * cols; cv.height = (h + LBL) * all.length;
    const g = cv.getContext('2d');
    g.fillStyle = '#12100d'; g.fillRect(0, 0, cv.width, cv.height);
    all.forEach((row, r) => {
      const top = r * (h + LBL);
      g.fillStyle = '#ffd479'; g.font = 'bold 18px monospace';
      g.fillText(labels[r], 10, top + 21);
      row.forEach((im, i) => {
        g.drawImage(im, i * w, top + LBL);
        g.strokeStyle = '#3a342a'; g.strokeRect(i * w + 0.5, top + LBL + 0.5, w - 1, h - 1);
      });
    });
    return cv.toDataURL('image/png').split(',')[1];
  }, { payload: rows.map(r => r.shots.map(s => s.toString('base64'))), labels });

  fs.writeFileSync(OUT, Buffer.from(sheet, 'base64'));
  console.log(`${path.basename(OUT)} — ` + rows.map(r => r.key + ':' + r.shots.length).join(' '));
  if (errs.length) console.log('errs:', errs.length, errs.slice(0, 3));
  await b.close();
})();
