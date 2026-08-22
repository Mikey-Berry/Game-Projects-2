#!/usr/bin/env node
/* MARKS OF YOUR OWN.
 *
 * "Add the ability to mark things on the map for myself personally. (Maybe a mini-icon next to
 * the map itself, then click to add.)"
 *
 * A new feature with no existing surface to fold into, so the risk is not a subtle wrong
 * answer — it is a button that does nothing, or a pin that draws under the fog, or one that
 * does not survive a reload. All three of those look identical to "it works" from inside the
 * code, so every one of them is driven through the real DOM here: the real button, real mouse
 * events at real coordinates on the real minimap canvas, and the real save round trip.
 *
 * The one that matters most is the FOG. Everything else on that map is drawn beneath it, so a
 * pin placed the ordinary way would be invisible on exactly the ground a pin is for.
 *
 *   node tools/pins.js [game.html]
 */
const { chromium } = require('playwright');
const path = require('path');
const gamePath = (a) => path.resolve(a ? (path.isAbsolute(a) ? a : path.join(__dirname, a)) : path.join(__dirname, 'game.html'));

(async () => {
  const b = await chromium.launch({
    executablePath: process.env.DUSTWARD_CHROME || undefined,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'],
  });
  const p = await b.newPage({ viewport: { width: 1000, height: 700 } });
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message.slice(0, 200)));
  await p.goto('file://' + gamePath(process.argv[2]), { waitUntil: 'load' });
  await p.waitForTimeout(3000);
  await p.evaluate(() => { document.getElementById('btn-start').click(); paused = true; });
  await p.waitForTimeout(3000);

  const out = await p.evaluate(() => {
    const R = {};
    paused = true;

    const btn = document.getElementById('mm-mark');
    const mm = document.getElementById('minimap');
    if (!btn || !mm || typeof marks === 'undefined') {
      R.thereIsAPinBesideTheMap = '!! THERE IS NO PIN CONTROL BESIDE THE MAP';
      R.aClickDropsAPin = '!! NOTHING TO CLICK';
      R.andAPinSurvivesAReload = '!! NOTHING TO SAVE';
      R.andAPinDrawsOverTheFog = '!! NOTHING TO DRAW';
      return R;
    }
    R.thereIsAPinBesideTheMap = `a ${btn.textContent} control sits beside the map`;

    /* WHERE THE MAP IS ON SCREEN, so the clicks below are aimed the way a player aims them */
    const r = mm.getBoundingClientRect();
    const atWorld = (wx, wy) => ({ x: r.left + wx / W * r.width, y: r.top + wy / H * r.height });
    const md = (q, button) => mm.dispatchEvent(new MouseEvent('mousedown', {
      clientX: q.x, clientY: q.y, button: button || 0, buttons: button === 2 ? 2 : 1,
      bubbles: true, cancelable: true }));

    /* ---------- THE BUTTON ARMS IT, AND THE MAP STILL JUMPS WHEN IT IS NOT ARMED ----------
       The control has to be a mode, not a hijack: an unarmed click on the map is how you move
       the camera and always has been. */
    marks.length = 0;
    camFollow = true;
    const spot = { x: Math.round(W * 0.62), y: Math.round(H * 0.38) };
    md(atWorld(spot.x, spot.y));
    R.unarmed = `unarmed click: ${marks.length} pins, camera at ${camX.toFixed(0)},${camY.toFixed(0)}`;
    R.anUnarmedClickStillJumps = (marks.length === 0 && Math.abs(camX - spot.x) < W / 40 && Math.abs(camY - spot.y) < H / 40)
      ? 'an unarmed click on the map still jumps the camera there and drops nothing'
      : `!! AN UNARMED CLICK LEFT ${marks.length} PIN(S) AND PUT THE CAMERA AT ${camX.toFixed(0)},${camY.toFixed(0)}`;

    btn.click();
    R.armed = `after clicking the control: markMode ${markMode}, class "${btn.className}"`;
    R.theButtonArmsIt = (markMode && btn.className === 'on')
      ? 'clicking the control arms it, and it says so'
      : `!! THE CONTROL DID NOT ARM (markMode ${markMode}, class "${btn.className}")`;

    /* ---------- A CLICK DROPS A PIN WHERE YOU CLICKED ---------- */
    const camWas = { x: camX, y: camY };
    md(atWorld(spot.x, spot.y));
    const m0 = marks[0];
    R.dropped = marks.length ? `pin at ${m0.x.toFixed(0)},${m0.y.toFixed(0)} for a click at ${spot.x},${spot.y}` : 'nothing dropped';
    R.aClickDropsAPin = (marks.length === 1 && dist(m0.x, m0.y, spot.x, spot.y) < W / 40)
      ? 'an armed click drops a pin where you clicked'
      : `!! AN ARMED CLICK LEFT ${marks.length} PIN(S)${m0 ? ' at ' + m0.x.toFixed(0) + ',' + m0.y.toFixed(0) : ''}`;
    /* and it does NOT also fling the camera across the map */
    R.andDoesNotAlsoJump = (Math.abs(camX - camWas.x) < 0.01 && Math.abs(camY - camWas.y) < 0.01)
      ? 'and does not also throw the camera across the world'
      : '!! DROPPING A PIN ALSO MOVED THE CAMERA';

    /* ---------- AND A CLICK ON A PIN LIFTS IT ---------- */
    md(atWorld(spot.x, spot.y));
    R.aClickOnAPinLiftsIt = marks.length === 0
      ? 'and clicking a pin lifts it again'
      : `!! CLICKING A PIN LEFT ${marks.length} OF THEM`;
    /* right-click lifts one without arming, because that needs no mode */
    marks.push({ x: spot.x, y: spot.y });
    setMarkMode(false);
    md(atWorld(spot.x, spot.y), 2);
    R.andRightClickLiftsWithoutArming = marks.length === 0
      ? 'and a right-click lifts one with the control unarmed — the one action that needs no mode'
      : `!! A RIGHT-CLICK ON A PIN LEFT ${marks.length} OF THEM`;

    /* ---------- IT DRAWS, AND IT DRAWS OVER THE FOG ----------
       The failure this feature is most likely to have. Everything else on that map is drawn
       BENEATH the fog sheet, so a pin added the ordinary way is invisible on unexplored ground
       — which is most of the ground anybody wants to mark. Read the pixels: put a pin on dark
       country and count how much of it survives the fog going down on top. */
    let dark = null;
    for (let y = 40; y < H - 40 && !dark; y += 17)
      for (let x = 40; x < W - 40 && !dark; x += 17)
        if (visAt(x, y) === 0) dark = { x, y };
    R.dark = dark ? `unexplored ground at ${dark.x},${dark.y} (visAt ${visAt(dark.x, dark.y)})` : '!! THE WHOLE MAP IS EXPLORED';
    if (dark) {
      const px = Math.round(dark.x * 128 / W), py = Math.round(dark.y * 128 / H);
      const patch = () => {
        renderMinimap();
        const d = mmcx.getImageData(Math.max(0, px - 5), Math.max(0, py - 5), 10, 10).data;
        let lit = 0;
        for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 150) lit++;
        return lit;
      };
      marks.length = 0;
      const before = patch();
      marks.push({ x: dark.x, y: dark.y });
      const after = patch();
      R.pixels = `on unexplored ground: ${before} lit pixels without a pin, ${after} with one`;
      R.andAPinDrawsOverTheFog = after > before
        ? `and a pin on ground you have never walked is visible through the fog — ${after - before} pixels of it`
        : '!! A PIN ON UNEXPLORED GROUND IS BURIED UNDER THE FOG, WHICH IS THE GROUND A PIN IS FOR';
      marks.length = 0;
    }

    /* ---------- AND IT SURVIVES A RELOAD ----------
       A pin is a note the player wrote. Losing it on a reload is the whole feature failing. */
    marks.push({ x: 111, y: 222 }, { x: 333, y: 444 });
    const snap = JSON.parse(JSON.stringify(snapshot()));
    marks.length = 0;
    restore(snap);
    R.reloaded = `after a save and load: ${marks.length} pins — ${marks.map(m => m.x + ',' + m.y).join(' · ')}`;
    R.andAPinSurvivesAReload = (marks.length === 2 && marks[0].x === 111 && marks[1].y === 444)
      ? 'and pins are still there after a save and a load, because a note you lose is not a note'
      : `!! ${marks.length} PIN(S) SURVIVED THE ROUND TRIP`;
    marks.length = 0;

    return R;
  });

  const bad = Object.values(out).filter(v => typeof v === 'string' && v.startsWith('!!'));
  for (const [k, v] of Object.entries(out)) console.log('  ' + k.padEnd(32) + v);
  for (const e of errs) console.log('  ' + e);
  console.log('');
  console.log(bad.length || errs.length
    ? `YOU STILL CANNOT WRITE ON THE MAP (${bad.length + errs.length})`
    : 'YOU CAN MARK THE MAP, AND THE MARKS STAY');
  await b.close();
  process.exit(bad.length || errs.length ? 1 : 0);
})();
