#!/usr/bin/env node
/* ONE ROW PER MOVE, so "I only ever see the overhead" can be looked at instead of argued.
 *
 * tools/swing.js renders one row per WEAPON, which answers a different question — it shows
 * that a nodachi and a katana swing at different speeds, and says nothing about whether the
 * six strokes read as six strokes. This forces each move in turn and captures the same beat,
 * so the arcs can be compared against each other rather than against memory.
 *
 * `pickMove` is a top-level function declaration in a classic script, so it is a property of
 * `window` and can be replaced from here. That is the whole trick.
 *
 *   node tools/moves.js                       # every move, katana
 *   node tools/moves.js w_nod out.png         # every move, nodachi
 *   node tools/moves.js w_kat out.png thrust,cleave
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const WEP = process.argv[2] || 'w_kat';
const OUT = path.resolve(process.argv[3] || path.join(__dirname, 'moves.png'));
const MVS = (process.argv[4] || 'slash,overhead,thrust,cleave,rising,spin').split(',');

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

  const stage = async (wep, mv) => await p.evaluate(({ wep, mv }) => {
    if (!window.__S) {
      for (let y = 40; y < H - 40; y += 7) {
        for (let x = 40; x < W - 40; x += 7) {
          let ok = true;
          for (let j = -3; j <= 3 && ok; j++) for (let i = -3; i <= 3; i++) if (isBlocked(x + i, y + j, 0)) { ok = false; break; }
          if (ok) { window.__S = { x, y }; break; }
        }
        if (window.__S) break;
      }
    }
    const S = window.__S || { x: 600, y: 600 };
    chars.length = 0;
    /* skill 90 so the gated strokes are legal to pick at all — `spin` wants 70 */
    const a = makeChar('Swinger', 'player', S.x, S.y, { atk: 20, blades: 90, blunt: 90, tough: 20 });
    const d = makeChar('Post', 'bandit', S.x + 0.75, S.y, { def: 6, tough: 90 });
    a.state = d.state = 'ok'; a.weapon = wep; d.armor = 'a_pla';
    a.target = d; a.targetManual = true;
    chars.push(a, d);
    window.__A = a; window.__D = d;
    window.pickMove = () => mv;          /* the one line this harness exists for */
    camX = S.x + 0.25; camY = S.y; camSX = camX; camSY = camY;
    camDist = camDistTarget = 5.6; camPitchT = camPitch = 0.34; camYawT = camYaw = 2.95;
    hour = 11; speed = 0;
    renderer.domElement.id = '__gl';
    let hs = document.getElementById('__hide');
    if (!hs) { hs = document.createElement('style'); hs.id = '__hide'; document.head.appendChild(hs); }
    hs.textContent = 'body > *:not(#__gl){display:none !important}';
  }, { wep, mv });

  const DT = 1 / 30;
  const rows = [];
  for (const MV of MVS) {
    await stage(WEP, MV);
    await p.waitForTimeout(1000);
    const shots = [];
    let started = false, frames = 0, sawMv = null;
    for (let i = 0; i < 260 && shots.length < 8; i++) {
      const st = await p.evaluate((dt) => {
        const a = window.__A, d = window.__D;
        d.x = window.__S.x + 0.75; d.y = window.__S.y; d.state = 'ok'; d.staggerT = 0;
        for (const k in d.parts) d.parts[k].hp = 100;
        d.blood = 100;
        a.target = d; a.targetManual = true;
        a.x = window.__S.x; a.y = window.__S.y; a.staggerT = 0;
        physics(a, dt);
        return { wind: a.windup ? a.windup.t / a.windup.dur : -1, mv: a.windup ? a.windup.mv : null, rec: a.recoverT };
      }, DT);
      await p.waitForTimeout(55);
      if (st.mv) sawMv = st.mv;
      if (!started && st.wind >= 0) started = true;
      if (started) {
        if (frames % 2 === 0) shots.push(await p.screenshot({ clip: { x: 150, y: 70, width: 270, height: 340 } }));
        frames++;
        if (st.wind < 0 && st.rec <= 0 && frames > 6) break;
      }
    }
    rows.push({ mv: MV, saw: sawMv, shots });
    console.log(`  ${MV.padEnd(9)} ${shots.length} frames` + (sawMv === MV ? '' : `  !! THE SIM SWUNG "${sawMv}" INSTEAD`));
  }

  const payload = rows.map(r => ({ mv: r.mv, imgs: r.shots.map(s => s.toString('base64')) }));
  const sheet = await p.evaluate(async ({ payload, wep }) => {
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
      g.fillText(`${MOVES[payload[r].mv].label}  (${payload[r].mv})  —  ${ITEMS[wep].name}, every 2nd frame at 30fps`, 10, top + 23);
      row.forEach((im, i) => {
        const x = i * w, y = top + LBL;
        g.drawImage(im, x, y);
        g.fillStyle = '#c4b896'; g.font = 'bold 15px monospace';
        g.fillText(String(i + 1), x + 8, y + 20);
        g.strokeStyle = '#3a342a'; g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      });
    });
    return cv.toDataURL('image/png').split(',')[1];
  }, { payload, wep: WEP });

  fs.writeFileSync(OUT, Buffer.from(sheet, 'base64'));
  console.log(`${path.basename(OUT)} — ${rows.length} moves`);
  if (errs.length) console.log('errs:', errs.length, errs.slice(0, 3));
  await b.close();
})();
