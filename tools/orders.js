#!/usr/bin/env node
/* GIVING AN ORDER WITHOUT GOING THROUGH A MENU, AND LETTING GO OF ONE.
 *
 * Three notes:
 *   · "There is currently no job for mining ore, of any kind. I have to manually order for it
 *      to be done. This is a peripheral thought, but I wonder if a shift+right click command
 *      could set that to someone's job? (As in, I shift-right click an ore vein, and that
 *      becomes their primary job.) Would be a lot easier than manually navigating through
 *      menus for it."
 *   · "There doesn't seem to be a way to drop concentration of spells like Shroud the Dead or
 *      Ainzopha'ar's Light. They just kind of become a permanent tax on the caster's mana."
 *   · "Ainzopha'ar's Light is a cool ability — there should be some visual indicator of its
 *      radius to keep allies safe."
 *
 * TWO OF THE THREE WERE HALF-BUILT AND UNREACHABLE, which is this project's most common shape
 * of bug by a distance. `findNode` has taken `'copper'` and `'iron_ore'` since ore was added
 * and NOTHING EVER PASSED THEM: the job list had wood, stone and fish, so two live branches of
 * the world scanner had no caller and ore was the one resource that could only be got by
 * clicking on it. And `toggleConcentrationOff` has been on X the whole time with nothing in
 * the game saying so, which for a player is the same as its not existing.
 *
 * So the assertions here are all about REACHABILITY: not "does the job work" but "can a player
 * switch it on", and not "can concentration end" but "is there anything on screen that says so".
 *
 *   node tools/orders.js [game.html]
 */
const { chromium } = require('playwright');
const path = require('path');
const gamePath = (a) => path.resolve(a ? (path.isAbsolute(a) ? a : path.join(__dirname, a)) : path.join(__dirname, 'game.html'));

(async () => {
  const b = await chromium.launch({
    executablePath: process.env.DUSTWARD_CHROME || undefined,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'],
  });
  const p = await b.newPage({ viewport: { width: 900, height: 620 } });
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message.slice(0, 200)));
  await p.goto('file://' + gamePath(process.argv[2]), { waitUntil: 'load' });
  await p.waitForSelector('#btn-start', { state: 'attached', timeout: 60000 });
  await p.evaluate(() => { document.getElementById('btn-start').click(); paused = true; });
  await p.waitForTimeout(2600);

  const out = await p.evaluate(() => {
    const R = {};
    paused = true;
    const guard = (keys, fn) => {
      try { fn(); } catch (e) { for (const k of keys) if (R[k] === undefined) R[k] = '!! ' + String(e.message).slice(0, 120).toUpperCase(); }
    };

    /* open waste, well clear of any town — `rawDecorAt` returns nothing inside a town's clear
       radius, so a seam staged near one is a seam that does not exist */
    let gx = 0, gy = 0;
    outer:
    for (let y = 70; y < H - 70; y += 5) for (let x = 70; x < W - 70; x += 5) {
      if (towns.some(t => dist(t.x, t.y, x, y) < 90)) continue;
      let ok = true;
      for (let j = -9; j <= 9 && ok; j++) for (let i = -9; i <= 9 && ok; i++)
        if (isBlocked(x + i + 0.5, y + j + 0.5) || tileAt(x + i, y + j) === 3) ok = false;
      if (ok) { gx = x; gy = y; break outer; }
    }
    R._where = gx ? `staged on open dry waste at ${gx},${gy}` : '!! NO OPEN GROUND';

    const made = [];
    const wipe = () => {
      while (made.length) { const c = made.pop(); const i = chars.indexOf(c); if (i >= 0) chars.splice(i, 1); }
      for (let i = pBuilds.length - 1; i >= 0; i--) if (pBuilds[i].__probe) pBuilds.splice(i, 1);
      for (let i = oreFields.length - 1; i >= 0; i--) if (oreFields[i].__probe) oreFields.splice(i, 1);
    };
    const put = (name, x, y, o) => {
      const c = makeChar(name, 'player', x, y, Object.assign({ atk: 6, def: 6, tough: 12, ath: 7, labor: 8, magic: 20 }, o || {}));
      c.state = 'ok'; c.x = x; c.y = y;
      chars.push(c); made.push(c);
      return c;
    };
    /* a seam, and the tile it actually outcrops on. `rawDecorAt` only returns ore where the
       terrain hash clears 0.90, so pushing a field is not the same as having a vein. */
    const seam = (kind, cx, cy, r) => {
      const f = { x: cx, y: cy, r: r || 5, kind, __probe: true };
      oreFields.push(f);
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        const tx = Math.floor(cx) + dx, ty = Math.floor(cy) + dy;
        if (decorAt(tx, ty) === kind && !isBlocked(tx + 0.5, ty + 0.5)) return { f, x: tx, y: ty };
      }
      return { f, x: null, y: null };
    };

    /* ---------- 1. THERE IS A JOB FOR ORE ---------- */
    guard(['mineIsAJob', 'andItFindsASeam', 'andNoSeamMeansNoWork'], () => {
      wipe();
      const u = put('Miner', gx, gy);
      /* no ore anywhere near: the job must report NO WORK, or a miner with nothing to mine
         never falls through to a second trade and stands in a field for the rest of the run */
      u._mineLook = undefined;
      R.andNoSeamMeansNoWork = !jobHasWork(u, 'mine')
        ? 'with no seam within reach MINE reports no work, so a second trade takes over'
        : '!! MINE CLAIMS WORK ON GROUND WITH NO ORE IN IT';
      const s = seam('ivein', gx + 6, gy + 6, 6);
      R._seam = s.x === null ? '!! NO OUTCROP IN THE STAGED FIELD' : `an iron seam outcrops at ${s.x},${s.y}`;
      const node = findNode(u, 'mine');
      R.andItFindsASeam = node && (node.kind === 'iron_ore' || node.kind === 'copper')
        ? `and the scanner hands a miner a ${node.kind} node at ${node.sx.toFixed(0)},${node.sy.toFixed(0)} — the branch that had no caller for as long as ore has existed`
        : `!! findNode(mine) RETURNED ${JSON.stringify(node)}`;
      u._mineLook = undefined;
      R.mineIsAJob = jobHasWork(u, 'mine')
        ? 'MINE is work when there is a seam to work'
        : '!! MINE REPORTS NO WORK WITH A SEAM SIX TILES AWAY';
    });

    /* ---------- 2. AND A HAND ON IT ACTUALLY BRINGS ORE BACK ----------
       The job existing is not the claim. The claim is that setting it and walking away
       produces ore, which is what "I have to manually order for it to be done" is about. */
    guard(['aMinerMines'], () => {
      wipe();
      const s = seam('ivein', gx + 6, gy + 6, 6);
      const u = put('Miner', gx, gy, { labor: 30 });
      u.job = 'mine';
      const ore0 = campHas('iron_ore') + campHas('copper');
      paused = false;
      let n = 0;
      for (; n < 1400 && campHas('iron_ore') + campHas('copper') === ore0; n++) update(0.1);
      paused = true;
      R.aMinerMines = campHas('iron_ore') + campHas('copper') > ore0
        ? `a hand set to MINE walks to the seam and brings ore back in ${(n / 10).toFixed(0)}s, with nobody clicking anything`
        : `!! ${(n / 10).toFixed(0)}s ON THE JOB AND NO ORE (gather ${JSON.stringify(u.gather)}, at ${u.x.toFixed(0)},${u.y.toFixed(0)}, seam at ${s.x},${s.y})`;
    });

    /* ---------- 3. LETTING GO OF A CONCENTRATION IS VISIBLE ----------
       The hotkey has always worked. Nothing said so, and a control nobody can find is not a
       control — so this reads the PANEL, and then presses what it finds there. */
    guard(['thePanelSaysWhatIsHeld', 'andTheButtonDropsIt', 'andTheHotkeyStillWorks'], () => {
      wipe();
      const u = put('Bearer', gx, gy, { magic: 30 });
      u.gift = 'divine';
      startConcentration(u, 'warding', 1, true, true);
      selected = [u];
      refreshCharPanel();
      const row = document.getElementById('jobrow');
      const btn = [...row.querySelectorAll('button')].find(x => /AINZOPHA/i.test(x.textContent));
      R.thePanelSaysWhatIsHeld = btn
        ? `the character panel shows what they are holding open and what it costs: "${btn.textContent.trim()}"`
        : `!! NOTHING IN THE PANEL MENTIONS THE HELD SPELL (${row.textContent.trim().slice(0, 80)})`;
      if (btn) {
        btn.click();
        R.andTheButtonDropsIt = !u.concentrating
          ? 'and pressing it lets the light go — the mana comes back without the player having to know a hotkey'
          : '!! THE BUTTON IS A DEAD CONTROL';
      } else R.andTheButtonDropsIt = '!! not reached';
      /* and the hotkey it was hiding behind still does the same thing */
      startConcentration(u, 'warding', 1, true, true);
      selected = [u];
      toggleConcentrationOff();
      R.andTheHotkeyStillWorks = !u.concentrating
        ? 'and X on the selection still drops it, for anyone who learned that first'
        : '!! THE HOTKEY STOPPED WORKING';
    });

    /* ---------- 4. AND THE WARD DRAWS ITS OWN EDGE ----------
       Nine tiles, with nothing on screen saying so, makes the one decision the spell asks of
       you — who is inside it — a guess. */
    guard(['theWardDrawsItsRadius', 'andItGoesWhenTheLightGoes'], () => {
      wipe();
      const u = put('Bearer', gx, gy, { magic: 30 });
      u.gift = 'divine';
      startConcentration(u, 'warding', 1, true, true);
      for (let i = 0; i < 40; i++) syncChars(0.05);
      const e = charMeshes.get(u.id);
      const ring = e && e.wardRing;
      /* MEASURED IN THE WORLD, not in the mesh's own units — the caster's group is scaled by
         `big`, so a ring that looked right on a man would be a different ward on a colossus. */
      let worldR = 0;
      if (ring) {
        ring.updateWorldMatrix(true, false);
        const bb = new THREE.Box3().setFromObject(ring);
        worldR = (bb.max.x - bb.min.x) / 2;
      }
      R.theWardDrawsItsRadius = (ring && ring.visible && Math.abs(worldR - WARD_RADIUS) < 0.6)
        ? `the light draws a ring on the ground at ${worldR.toFixed(1)} tiles against a WARD_RADIUS of ${WARD_RADIUS}`
        : `!! ring=${!!ring} visible=${ring && ring.visible} radius=${worldR.toFixed(2)} wanted ${WARD_RADIUS}`;
      /* and a big caster carries the same ward, not a bigger one */
      u.big = 2.2;
      for (let i = 0; i < 6; i++) syncChars(0.05);
      let bigR = 0;
      if (ring) { ring.updateWorldMatrix(true, false); const bb2 = new THREE.Box3().setFromObject(ring); bigR = (bb2.max.x - bb2.min.x) / 2; }
      R._bigCaster = Math.abs(bigR - WARD_RADIUS) < 0.6
        ? `and a caster ${u.big}x the size of a man still carries a ${bigR.toFixed(1)}-tile ward`
        : `!! A BIG CASTER'S WARD DRAWS AT ${bigR.toFixed(1)} TILES`;
      u.big = 1;
      endConcentration(u, true);
      for (let i = 0; i < 6; i++) syncChars(0.05);
      R.andItGoesWhenTheLightGoes = !(e.wardRing && e.wardRing.visible)
        ? 'and it goes out with the light rather than being left painted on the ground'
        : '!! THE RING OUTLIVES THE SPELL';
    });

    /* helpers for the out-of-page section, which needs a real modified click */
    window.__O = { gx, gy, put, wipe, seam };
    return R;
  });

  /* ================= 5. SHIFT+RIGHT-CLICK =================
     OUT OF THE PAGE. A synthetic MouseEvent arrives at `#game` and does nothing — the handler
     is bound to the canvas the renderer owns — so this has to be Playwright's own mouse, with
     a real Shift held down. And the camera has to be given a frame to actually get where it
     was told before anything asks where a tile is on screen: `camX` is an input to the render
     loop, and no frame is drawn inside an `evaluate`. */
  const aimAt = async (what) => {
    await p.evaluate((w) => {
      const t = w === 'seam' ? window.__T.seamTile : w === 'tree' ? window.__T.tree : window.__T.bench;
      camX = camSX = t.x; camY = camSY = t.y; camDist = camDistTarget = 15;
      camPitch = camPitchT = 0.62; camYaw = camYawT = 0.4; camFollow = false;
    }, what);
    await p.waitForTimeout(400);
    return await p.evaluate((w) => {
      const t = w === 'seam' ? window.__T.seamTile : w === 'tree' ? window.__T.tree : window.__T.bench;
      const to = (tx, ty) => w2s(tx, ty, groundY(tx, ty) + 0.05);
      let s0 = to(t.x, t.y);
      const m1 = screenToWorld(s0.x, s0.y);
      s0 = to(t.x - (m1.x - t.x), t.y - (m1.y - t.y)) || s0;
      const back = screenToWorld(s0.x, s0.y);
      return { x: s0.x, y: s0.y, off: dist(back.x, back.y, t.x, t.y) };
    }, what);
  };
  const shiftRight = async (q) => {
    await p.keyboard.down('Shift');
    await p.mouse.move(q.x, q.y);
    await p.mouse.down({ button: 'right' });
    await p.mouse.up({ button: 'right' });
    await p.keyboard.up('Shift');
  };

  const staged = await p.evaluate(() => {
    const O = window.__O;
    O.wipe();
    const s = O.seam('ivein', O.gx + 6, O.gy + 6, 6);
    /* a tree and a bench, so the modifier can be shown to mean the same thing on three
       different kinds of target rather than one special case */
    let tree = null;
    for (let r = 2; r < 40 && !tree; r++)
      for (let a = 0; a < r * 8 && !tree; a++) {
        const tx = Math.floor(O.gx + Math.cos(a / (r * 8) * 6.283) * r), ty = Math.floor(O.gy + Math.sin(a / (r * 8) * 6.283) * r);
        if (decorAt(tx, ty) === 'tree' && !isBlocked(tx + 0.5, ty + 0.5)) tree = { x: tx + 0.5, y: ty + 0.5 };
      }
    const bench = { type: 'r_bench', x: O.gx - 6, y: O.gy - 6, w: 2, h: 2, floor: 0, hp: 90, maxHp: 90, progress: 1, __probe: true };
    pBuilds.push(bench);
    const u = O.put('Hand', O.gx, O.gy);
    const dumb = O.put('Husk', O.gx + 0.8, O.gy);
    dumb.undead = true; dumb.lich = false;
    window.__T = {
      seamTile: { x: s.x + 0.5, y: s.y + 0.5 }, tree,
      bench: { x: bench.x + 1, y: bench.y + 1 },
      uid: u.id, dumbId: dumb.id,
    };
    selected = [u];
    /* the fog: a tile nobody has looked at cannot be clicked */
    paused = false; for (let i = 0; i < 10; i++) update(0.1); paused = true;
    return { seam: s.x !== null, tree: !!tree };
  });
  out._staged = `seam ${staged.seam ? 'placed' : 'MISSING'}, tree ${staged.tree ? 'found' : 'MISSING'}`;

  {
    const q = await aimAt('seam');
    await shiftRight(q);
    out.shiftRightOnASeamSetsMine = await p.evaluate((off) => {
      const u = chars.find(c => c.id === window.__T.uid);
      return u.job === 'mine'
        ? `shift+right-clicking an iron seam makes MINE that unit's standing job (the click landed ${off.toFixed(2)} tiles off)`
        : `!! THE JOB IS ${u.job || 'NONE'} AFTER SHIFT+RIGHT-CLICKING A SEAM (click ${off.toFixed(2)} tiles off)`;
    }, q.off);
  }
  if (staged.tree) {
    await p.evaluate(() => { chars.find(c => c.id === window.__T.uid).job = null; });
    const q = await aimAt('tree');
    await shiftRight(q);
    out.andOnATreeSetsWood = await p.evaluate(() => {
      const u = chars.find(c => c.id === window.__T.uid);
      return u.job === 'wood' ? 'and on a tree it means WOOD — the modifier reads the thing, not a special case for ore'
                              : `!! THE JOB IS ${u.job || 'NONE'} AFTER SHIFT+RIGHT-CLICKING A TREE`;
    });
  } else out.andOnATreeSetsWood = '!! no tree staged';
  {
    await p.evaluate(() => {
      const u = chars.find(c => c.id === window.__T.uid);
      const d = chars.find(c => c.id === window.__T.dumbId);
      u.job = null; d.job = null;
      selected = [u, d];
    });
    const q = await aimAt('bench');
    await shiftRight(q);
    out.andOnABenchSetsStudy = await p.evaluate(() => {
      const u = chars.find(c => c.id === window.__T.uid);
      const d = chars.find(c => c.id === window.__T.dumbId);
      /* AND THE MINDLESS ARE SKIPPED. The job menu has always refused a hollow risen the
         STUDY job; a shortcut that quietly bypassed that rule would be a second, looser way
         of assigning jobs — which is exactly what a shared table exists to prevent. */
      return (u.job === 'research' && !d.job)
        ? 'and on a Research Bench it means STUDY — for the one with somebody home, and not for the hollow risen standing beside them'
        : `!! living=${u.job || 'NONE'} risen=${d.job || 'NONE'}`;
    });
  }

  const bad = Object.values(out).filter(v => typeof v === 'string' && v.startsWith('!!'));
  for (const [k, v] of Object.entries(out)) console.log('  ' + k.padEnd(32) + v);
  for (const e of errs) console.log('  ' + e);
  console.log('');
  console.log(bad.length || errs.length ? `HALF-BUILT AND STILL UNREACHABLE (${bad.length + errs.length})`
                                        : 'ORE HAS A JOB, THE MODIFIER GIVES IT, AND THE LIGHT CAN BE PUT DOWN');
  await b.close();
  process.exit(bad.length || errs.length ? 1 : 0);
})();
