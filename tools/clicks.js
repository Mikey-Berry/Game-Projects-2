#!/usr/bin/env node
/* CAN YOU ACTUALLY CLICK THE THING YOU ARE POINTING AT?
 *
 * "Some creatures (especially gaunts/sixfold/etc) tend to be REALLY hard to right-click,
 * especially after they're knocked unconscious. It's almost a guessing game of where to click
 * because it doesn't seem consistent with the body itself."
 *
 * It was not a guessing game, it was PARALLAX. Every pick in the file compared the cursor
 * against a body's tile, but the cursor is resolved by `screenToWorld`, which follows the ray
 * down to the GROUND — so a click aimed at a creature lands on the dirt behind it, by
 * `height / tan(camPitch)`. At the default camera that is 0.61 tiles for an ordinary person
 * (against a 0.8-tile catchment) and 1.6 for a Sixfold; tilt the camera down to the 0.42 the
 * controls allow and it is 2.0 and 4.9. There was never a spot ON the creature that worked.
 *
 * WHICH IS WHY THE EXISTING RIGHT-CLICK HARNESS NEVER SAW IT. `rightclick.js` aims at
 * `groundY(t.x, t.y) + 0.05` — the body's FEET — and a ray aimed at the ground lands exactly
 * where it was aimed, drift zero. It was testing the menu, correctly, through the one aim
 * point the bug does not touch. This file aims where a player aims: at the middle of the
 * visible mass. That single difference is the whole test.
 *
 *   node tools/clicks.js [game.html]
 */
const { chromium } = require('playwright');
const path = require('path');
const gamePath = (a) => path.resolve(a ? (path.isAbsolute(a) ? a : path.join(__dirname, a)) : path.join(__dirname, 'game.html'));

(async () => {
  const b = await chromium.launch({
    executablePath: process.env.DUSTWARD_CHROME || undefined,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'],
  });
  const p = await b.newPage({ viewport: { width: 1100, height: 760 } });
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message.slice(0, 200)));
  await p.goto('file://' + gamePath(process.argv[2]), { waitUntil: 'load' });
  await p.waitForTimeout(3000);
  await p.evaluate(() => { document.getElementById('btn-start').click(); paused = true; });
  await p.waitForTimeout(3000);

  const out = await p.evaluate(async () => {
    const R = {};
    paused = true;

    let gx = 0, gy = 0;
    outer:
    for (let y = 60; y < H - 60; y += 5) for (let x = 60; x < W - 60; x += 5) {
      if (isBlocked(x + 0.5, y + 0.5)) continue;
      if (towns.some(t => dist(t.x, t.y, x, y) < 70)) continue;
      let ok = true;
      for (let j = -10; j <= 10 && ok; j++) for (let i = -10; i <= 10 && ok; i++)
        if (isBlocked(x + i + 0.5, y + j + 0.5)) ok = false;
      if (ok) { gx = x; gy = y; break outer; }
    }
    R.ground = gx ? `staged on open waste at ${gx},${gy}` : '!! NO OPEN GROUND';

    /* put the camera on them and let it settle, or every screen coordinate below is measured
       against a camera still gliding toward the staging ground */
    camX = camSX = gx; camY = camSY = gy;
    camFollow = false;
    camDist = camDistTarget = 26; camPitch = camPitchT = 0.95; camYaw = camYawT = 0;
    paused = false; await new Promise(r => setTimeout(r, 400)); paused = true;

    const wipe = () => { for (let i = chars.length - 1; i >= 0; i--) if (chars[i].__probe) chars.splice(i, 1);
                         for (let i = corpses.length - 1; i >= 0; i--) if (corpses[i].__probe) corpses.splice(i, 1);
                         rebuildCharGrid(); };
    const mk = (name, faction, x, y, big, o) => {
      const c = makeChar(name, faction, x, y, o || { atk: 4, def: 4, tough: 12 });
      c.__probe = true; c.big = big; c.floor = 0; chars.push(c); rebuildCharGrid(); return c;
    };
    /* AIM WHERE A PLAYER AIMS: at the middle of the visible mass, not at the feet. */
    const aimAt = (t) => w2s(t.x, t.y, groundY(t.x, t.y) + (t.state === 'down' ? 0.22 : 0.85) * (t.big || 1));
    const rclick = (q) => {
      hideCtxMenu();
      document.getElementById('game').dispatchEvent(new MouseEvent('mousedown', {
        clientX: q.x, clientY: q.y, button: 2, buttons: 2, bubbles: true, cancelable: true }));
    };
    /* ---------- THE TILE HAS TO BE SEEN, AND SEEING TAKES TICKS ----------
       Several of the branches under test open with `visAt(c.x, c.y) === 2`. A body pushed
       into `chars` on a paused world stands on a tile the fog has never been told about, so
       every one of those branches declines the click and the file goes red for a reason that
       has nothing to do with picking. Run the sim a few beats and let sight catch up. */
    const settle = () => { paused = false; for (let i = 0; i < 8; i++) update(0.1); paused = true; };

    const shown = () => { const el = document.getElementById('ctxmenu');
                          return !!el && getComputedStyle(el).display !== 'none'; };
    const menu = () => shown() ? [...document.querySelectorAll('#ctxmenu button')].map(x => x.textContent) : [];

    /* somebody of your own to give the orders, standing well clear of every mark */
    /* CLOSE ENOUGH TO SEE, NOT CLOSE ENOUGH TO SWING. The hostile branch under test opens
       with `visAt(c.x, c.y) === 2` — in sight NOW, not merely explored — and a hand parked
       ten tiles off at night reads 1, which sends the click through to a move order and looks
       exactly like a missed pick. Four tiles is inside sight in any weather and outside the
       1.4-tile reach that would start a fight during the settle. */
    const me = mk('Probe Hand', 'player', gx - 4, gy - 4, 1, { atk: 8, def: 6, tough: 14, ath: 6 });
    me.job = null; me.autoFight = false; me.stance = 'hold';
    /* ---------- AND THE TEARDOWN MUST NOT EAT THE PROBE'S OWN HAND ----------
       `wipe()` clears everything carrying `__probe`, and this body was made by the same
       helper, so the first teardown took the player's own unit out of `chars` with the marks.
       It stayed in `selected`, so `movers` still read 1 and the click handler ran normally —
       but `computeVision` walks `chars`, so nothing stamped sight any more and every branch
       gated on `visAt(...) === 2` quietly declined. Two cases went red reporting "the order
       went to nobody" while the picking they were testing was working perfectly.
       Un-flag it: it is staging, not a mark. */
    me.__probe = false;
    selected.length = 0; selected.push(me);

    /* ---------- HOW FAR THE AIM ACTUALLY DRIFTS, IN TILES ---------- */
    {
      const drift = (big) => {
        const t = { x: gx, y: gy, big, state: 'ok' };
        const q = w2s(t.x, t.y, groundY(gx, gy) + 0.85 * big);
        if (!q) return -1;
        const mp = screenToWorld(q.x, q.y);
        return dist(mp.x, mp.y, gx, gy);
      };
      const d1 = drift(1), d24 = drift(2.4);
      R.drift = `at pitch ${camPitch.toFixed(2)}, aiming at the middle lands ${d1.toFixed(2)} tiles behind a person and ${d24.toFixed(2)} behind a Sixfold`;
      R.theAimReallyDoesDrift = (d1 > 0.4 && d24 > d1)
        ? 'and it drifts further the taller the body — which is the whole complaint, in one number'
        : `!! NO DRIFT MEASURED (${d1.toFixed(2)} / ${d24.toFixed(2)}) — THE STAGING IS WRONG, NOT THE GAME`;
    }

    /* ---------- A BIG THING, KNOCKED DOWN, CLICKED ON ITS MASS ---------- */
    {
      const g = mk('Probe Sixfold', 'gaunt', gx, gy, 2.4);
      g.beast = true; g.blood = 20; g.maxBlood = 200;
      settle();
      /* knocked down AFTER the settle: `updateState` stands a body back up the moment its
         blood says it can, so a `state` set before the ticks does not survive them */
      g.state = 'down';
      /* ---------- NOT THE CENTRE OF IT. THE REST OF IT. ----------
         A body on the ground has almost no height, so the drift half of this bug barely
         touches it — aim at the dead centre of a downed Sixfold and even the old build finds
         it, which is why the first version of this case passed on both builds and proved
         nothing. What is wrong with a downed creature is SPRAWL: a body at 2.4x lies across
         better than two tiles, and the catchment was nine tenths of one, at its middle. So
         aim a tile off centre — still plainly ON the animal, and still somewhere a player
         would put the cursor — which is outside every radius the old build had. */
      const off = 1.0;
      const q = w2s(g.x + off, g.y, groundY(g.x, g.y) + 0.22 * g.big);
      R.aimPix = q ? `aimed ${off} tile off its centre, at ${Math.round(q.x)},${Math.round(q.y)} on a ${viewW()}x${viewH()} view` : '!! OFF SCREEN';
      rclick(q);
      const m = menu();
      R.aDownedBeastIsClickable = (m.length && m.some(x => /FINISH|EXECUTE|SEIZE|TAKE IT ALIVE|TEND|PICK UP/i.test(x)))
        ? `a click a tile off the middle of a sprawled Sixfold opens its menu (${m.length} entries)`
        : `!! CLICKING A DOWNED SIXFOLD ON ITS BODY OPENED ${JSON.stringify(m)}`;
      /* and the feet still work — the fix ACCEPTS BOTH points, so nobody who learned to aim
         low under the old behaviour is punished for it */
      hideCtxMenu();
      rclick(w2s(g.x, g.y, groundY(g.x, g.y) + 0.05));
      const m2 = menu();
      R.andSoDoItsFeet = m2.length
        ? 'and aiming at its feet still opens the same menu — the old habit is not punished'
        : '!! AIMING AT THE FEET NOW MISSES';
      hideCtxMenu(); wipe();
    }

    /* ---------- A BIG THING, ON ITS FEET, ORDERED ATTACKED ---------- */
    {
      const g = mk('Probe Gaunt', 'gaunt', gx, gy, 2.4);
      g.beast = true;
      settle();
      me.target = null; me.targetManual = false;
      rclick(aimAt(g));
      R.aBigThingCanBeOrderedAttacked = me.target === g
        ? 'a click on the mass of a standing Sixfold sends your hand at it'
        : `!! THE ORDER WENT TO ${me.target ? me.target.name : 'NOBODY'}`;
      hideCtxMenu(); wipe();
    }

    /* ---------- AND AN ORDINARY PERSON IS UNCHANGED ---------- */
    {
      const man = mk('Probe Raider', 'bandit', gx, gy, 1);
      settle();
      me.target = null; me.targetManual = false;
      rclick(aimAt(man));
      R.andAnOrdinaryPersonToo = me.target === man
        ? 'and a plain raider clicked on the chest still takes the order'
        : `!! A PLAIN RAIDER CLICKED ON THE CHEST WENT TO ${me.target ? me.target.name : 'NOBODY'}`;
      hideCtxMenu(); wipe();
    }

    /* ---------- AND EMPTY GROUND IS STILL EMPTY GROUND ----------
       The fix widens a catchment, and a widened catchment that swallows everything is a worse
       bug than the one it replaced. Nine tiles from the nearest body must still be a move
       order and nothing else. */
    {
      const g = mk('Probe Bystander', 'gaunt', gx, gy, 2.4);
      g.beast = true;
      settle();
      me.target = null; me.targetManual = false;
      hideCtxMenu();
      rclick(w2s(gx + 9, gy + 9, groundY(gx + 9, gy + 9) + 0.05));
      R.andBareGroundIsStillBareGround = (me.target === null && !shown())
        ? 'and nine tiles of open dirt away from it is still open dirt — no menu, no target'
        : `!! A CLICK ON BARE GROUND HIT ${me.target ? me.target.name : 'nothing'}, menu=${shown()}`;
      hideCtxMenu(); wipe();
    }

    return R;
  });

  const bad = Object.values(out).filter(v => typeof v === 'string' && v.startsWith('!!'));
  for (const [k, v] of Object.entries(out)) console.log('  ' + k.padEnd(32) + v);
  for (const e of errs) console.log('  ' + e);
  console.log('');
  console.log(bad.length || errs.length
    ? `STILL A GUESSING GAME (${bad.length + errs.length})`
    : 'YOU CAN CLICK THE THING YOU ARE POINTING AT');
  await b.close();
  process.exit(bad.length || errs.length ? 1 : 0);
})();
