#!/usr/bin/env node
/* THE START SCREEN, AS IT ACTUALLY LOOKS.
 *
 * "The character creation menu — we really need to improve the UI/layout of it. Right now it's
 *  all really jank and crammed together and hard to read the tiny text at the bottom."
 *
 * A layout complaint cannot be answered from the source. This shoots the overlay at the sizes
 * it is actually read at — a desktop window and a phone — before and after, and prints the
 * numbers that back the words: how tall the thing is against the viewport, how small the
 * smallest text is, and whether it needs scrolling to reach the button that starts the game.
 *
 *   node tools/ccpix.js [outdir] [game.html]
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
  const shots = [];
  for (const view of [{ n: 'desktop', w: 1280, h: 800 }, { n: 'laptop', w: 1024, h: 640 }, { n: 'phone', w: 414, h: 760 }]) {
    const p = await b.newPage({ viewport: { width: view.w, height: view.h }, deviceScaleFactor: 2 });
    p.on('pageerror', e => console.log('  PAGEERROR:', e.message.slice(0, 160)));
    await p.goto('file://' + gamePath(process.argv[3]), { waitUntil: 'load' });
    await p.waitForTimeout(2600);
    const m = await p.evaluate(() => {
      const ov = document.getElementById('startoverlay');
      const cc = document.getElementById('ccreate');
      const btn = document.getElementById('btn-start');
      const small = [...document.querySelectorAll('#startoverlay *')]
        .map(el => parseFloat(getComputedStyle(el).fontSize)).filter(n => n > 0);
      const r = cc ? cc.getBoundingClientRect() : null;
      const br = btn ? btn.getBoundingClientRect() : null;
      return {
        overlayScrollH: ov.scrollHeight, viewH: window.innerHeight,
        overflows: ov.scrollHeight > window.innerHeight + 2,
        ccH: r ? Math.round(r.height) : 0,
        buttonBelowFold: br ? br.bottom > window.innerHeight + 2 : false,
        smallestText: Math.min(...small),
        options: document.querySelectorAll('#ccreate .ccopt, #ccreate .ccchoice').length,
      };
    });
    const png = await p.screenshot({ fullPage: false });
    shots.push({ view, png, m });
    console.log(`  ${view.n.padEnd(8)} ${view.w}x${view.h}  overlay ${m.overlayScrollH}px vs ${m.viewH} viewport` +
      `${m.overflows ? ' — OVERFLOWS' : ''}${m.buttonBelowFold ? ', START BUTTON BELOW THE FOLD' : ''}` +
      `  · smallest text ${m.smallestText}px · ${m.options} options on screen`);
    await p.close();
  }
  const out = path.join(OUTDIR, 'creator.png');
  /* stitch side by side */
  const p2 = await b.newPage({ viewport: { width: 400, height: 300 } });
  const data = await p2.evaluate(async (shots) => {
    const imgs = await Promise.all(shots.map(s => new Promise(res => {
      const im = new Image(); im.onload = () => res(im); im.src = 'data:image/png;base64,' + s.b64;
    })));
    const PAD = 12, TOP = 40;
    const w = imgs.reduce((s, im) => s + im.width / 2 + PAD, PAD);
    const h = TOP + Math.max(...imgs.map(im => im.height / 2)) + PAD;
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const g = cv.getContext('2d');
    g.fillStyle = '#12100d'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#c8a86a'; g.font = 'bold 17px monospace';
    g.fillText('THE START SCREEN, AT THE SIZES IT IS READ AT', 12, 25);
    let x = PAD;
    imgs.forEach((im, i) => {
      g.drawImage(im, x, TOP, im.width / 2, im.height / 2);
      g.strokeStyle = '#3a342a'; g.strokeRect(x + 0.5, TOP + 0.5, im.width / 2 - 1, im.height / 2 - 1);
      g.fillStyle = '#e8dcc4'; g.font = 'bold 13px monospace';
      g.fillText(shots[i].label, x + 6, TOP - 8);
      x += im.width / 2 + PAD;
    });
    return cv.toDataURL('image/png').split(',')[1];
  }, shots.map(s => ({ b64: s.png.toString('base64'), label: `${s.view.n} ${s.view.w}x${s.view.h}` })));
  fs.writeFileSync(out, Buffer.from(data, 'base64'));
  console.log('  creator.png written');
  await b.close();
})();
