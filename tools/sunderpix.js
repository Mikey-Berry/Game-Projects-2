#!/usr/bin/env node
/* THE THREE SUNDERED MONUMENTS, CLOSE ENOUGH TO JUDGE.
 *
 * "Could we increase their graphical fidelity a bit? Right now they are hard to make out or
 *  just look plain stupid, like the giant 'skull' with its dorky looking eyes and super square
 *  head. Should be a bit more unnerving. (Hands too just look like a weird white thing jutting
 *  out of the ground.)"
 *
 * Not a test — a camera. Whether a thing is unnerving is a judgement about a picture and there
 * is no assertion that stands in for looking at one. `sundered.js` holds the numbers (how many
 * boxes, and whether you can walk through them); this holds the only question that matters here.
 *
 *   node tools/sunderpix.js [outdir] [game.html]
 *
 * writes  sundered.png   all three variants, near and at the camera you actually play at
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const OUTDIR = path.resolve(process.argv[2] || __dirname);
const gamePath = (a) => path.resolve(a ? (path.isAbsolute(a) ? a : path.join(__dirname, a)) : path.join(__dirname, 'game.html'));

(async () => {
  const b = await chromium.launch({
    executablePath: process.env.DUSTWARD_CHROME || undefined,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'],
  });
  const p = await b.newPage({ viewport: { width: 1120, height: 760 }, deviceScaleFactor: 2 });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message.slice(0, 200)));
  await p.goto('file://' + gamePath(process.argv[3]), { waitUntil: 'load' });
  await p.waitForSelector('#btn-start', { state: 'attached', timeout: 60000 });
  await p.evaluate(() => document.getElementById('btn-start').click());
  await p.waitForTimeout(2600);
  await p.evaluate(() => {
    paused = true;
    /* the real ids, checked against the document rather than guessed — the first pass named
       four elements that do not exist and left the whole HUD sitting over the monuments */
    for (const el of ['log', 'squadbar', 'topbar', 'minimap', 'charpanel', 'invpanel', 'ccpanel'])
      { const e = document.getElementById(el); if (e) e.style.display = 'none'; }
  });

  /* one shot per variant per range. The site's own rotation is fixed off its id, so the camera
     has to come round to the FRONT of the thing rather than whichever side it happens to face. */
  const shots = [];
  const info = await p.evaluate(() => corpseSites.map(s => ({ id: s.id, x: s.x, y: s.y, variant: s.id % 3 })));
  const want = [0, 1, 2].map(v => info.find(s => s.variant === v)).filter(Boolean);
  for (const s of want) {
    for (const [label, dist, pitch] of [['close', 26, 0.30], ['at the camera you play at', 46, 0.62]]) {
      await p.evaluate(({ s, dist, pitch }) => {
        /* face the monument's front: its group is turned by id*2.39996, and every variant is
           built looking down -z, so the camera stands off along that axis */
        const face = (s.id * 2.39996) % (Math.PI * 2);
        camX = camSX = s.x; camY = camSY = s.y;
        camDist = camDistTarget = dist;
        camPitch = camPitchT = pitch;
        camYaw = camYawT = face + Math.PI;
        camFollow = false;
      }, { s, dist, pitch });
      await p.waitForTimeout(700);
      const png = path.join(OUTDIR, `_sun_${s.variant}_${dist}.png`);
      await p.screenshot({ path: png });
      shots.push({ png, variant: s.variant, label });
    }
  }

  /* stitch */
  const names = { 0: 'the ribcage', 1: 'the skull', 2: 'the hand' };
  /* AS DATA URIs, NOT file:// — a file:// image taints the canvas and `toDataURL` then throws
     SecurityError, which is the whole reason this reads the bytes back through node. */
  const imgs = shots.map(x => ({ src: 'data:image/png;base64,' + fs.readFileSync(x.png).toString('base64'),
                                 cap: names[x.variant] + ' — ' + x.label }));
  const sheet = await p.evaluate(async (list) => {
    const cols = 2, cw = 560, chh = 380, hh = 30, top = 34;
    const cv = document.createElement('canvas');
    cv.width = cols * cw; cv.height = top + Math.ceil(list.length / cols) * (chh + hh);
    const x = cv.getContext('2d');
    x.fillStyle = '#191712'; x.fillRect(0, 0, cv.width, cv.height);
    x.fillStyle = '#e8dcc4'; x.font = 'bold 15px monospace';
    x.fillText('THE SUNDERED GROUND — three monuments, near and at play distance', 10, 22);
    for (let i = 0; i < list.length; i++) {
      const im = new Image(); im.src = list[i].src;
      await im.decode();
      const cx = (i % cols) * cw, cy = top + Math.floor(i / cols) * (chh + hh);
      x.drawImage(im, cx, cy + hh, cw, chh);
      x.fillStyle = '#0f0d0a'; x.fillRect(cx, cy, cw, hh);
      x.fillStyle = '#c8b998'; x.font = '13px monospace';
      x.fillText(list[i].cap, cx + 8, cy + 20);
    }
    return cv.toDataURL('image/png');
  }, imgs);
  fs.writeFileSync(path.join(OUTDIR, 'sundered.png'), Buffer.from(sheet.split(',')[1], 'base64'));
  for (const s of shots) fs.unlinkSync(s.png);
  for (const e of errs) console.log('  ' + e);
  console.log('sundered.png written to ' + OUTDIR);
  await b.close();
})();
