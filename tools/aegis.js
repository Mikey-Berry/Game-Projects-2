#!/usr/bin/env node
/* AN AEGIS REDOUBT IS A PLACE YOU GO INTO.
 *
 * "Right now it's very hard to navigate and explore these areas, even the redoubts and such. So
 *  making them big enough to explore and actually fit squads in is kind of ideal." (2026-10-03)
 *
 * The regular redoubt was a seventeen-tile square of wall with one door, a deck round the top and
 * its whole garrison standing in a heap in the middle. It is raised from a plan now (AN AEGIS
 * REDOUBT, BIG ENOUGH TO GO INTO in the game), through the same `buildStructure` every storeyed
 * place uses. These claims hold it to that:
 *
 *   1. two or three of them on the map beside the deep redoubt, each a 25-tile square raised from
 *      a plan, on dry ground clear of every way down
 *   2. they are buildings: the outer wall is solid and the gate is open; the hall is floor; the
 *      roof is floor under open sky behind a parapet; the command room on the roof has a ceiling
 *   3. every room holds its own: each of the garrison is posted to a room of its own redoubt and
 *      is standing in it, on its storey — and the post survives a save
 *   4. the vault's chest is in the vault
 *   5. one of yours sent from outside the gate to the command room walks in, through the hall
 *      and up a stair, and gets there
 *   6. and the watch on the roof shoots down over the parapet at somebody hostile in front of
 *      the wall — the plunging shot, which the wardens were seeded to have and never did
 *
 * Anything starting '!!' fails the build.
 *
 *   node tools/aegis.js [game.html]
 */
const { chromium } = require('playwright');
const path = require('path');
const gamePath = (a) => path.resolve(a ? (path.isAbsolute(a) ? a : path.join(__dirname, a)) : path.join(__dirname, 'game.html'));

(async () => {
  const b = await chromium.launch({
    executablePath: process.env.DUSTWARD_CHROME || undefined,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'],
  });
  const p = await b.newPage({ viewport: { width: 900, height: 600 } });
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message.slice(0, 200)));
  await p.goto('file://' + gamePath(process.argv[2]), { waitUntil: 'load', timeout: 120000 });
  await p.waitForSelector('#btn-start', { state: 'attached', timeout: 120000 });
  await p.evaluate(() => { document.getElementById('btn-start').click(); paused = true; });
  await p.waitForFunction(() => { try { return player().length > 0; } catch (e) { return false; } }, null, { timeout: 180000, polling: 1000 });
  await p.waitForTimeout(1500);

  const out = await p.evaluate(() => {
    const R = {};
    paused = true; hour = 11;
    const guard = (keys, fn) => {
      try { fn(); } catch (e) { for (const k of keys) if (R[k] === undefined) R[k] = '!! ' + String(e.message).slice(0, 120).toUpperCase(); }
    };
    const planned = redoubts.filter(r => r.structureId);
    const stOf = (r) => structures.find(s => s.id === r.structureId);
    const room = (r, key) => r.rooms.find(rm => rm.key === key);
    const inRoom = (c, rm) => c.x >= rm.x0 - 0.5 && c.x <= rm.x1 + 1.5 && c.y >= rm.y0 - 0.5 && c.y <= rm.y1 + 1.5 && (c.floor || 0) === rm.f;
    /* the gate: the middle of its three tiles, and the way out through it (which wall it is in) */
    const gateOf = (st) => {
      const g = st.doorways.filter(d => d.f === 0 && (d.x === st.x || d.y === st.y || d.x === st.x + st.w - 1 || d.y === st.y + st.h - 1));
      if (!g.length) return null;
      const m = g[Math.floor(g.length / 2)];
      const ox = m.x === st.x ? -1 : m.x === st.x + st.w - 1 ? 1 : 0, oy = m.y === st.y ? -1 : m.y === st.y + st.h - 1 ? 1 : 0;
      return { x: m.x, y: m.y, ox, oy };
    };

    /* ---------- 1. ON THE MAP ---------- */
    guard(['theyStandInTheWaste'], () => {
      const bad = [];
      for (const r of planned) {
        const st = stOf(r);
        if (!st || st.w !== 25 || st.h !== 25) { bad.push(`${r.id} is not a 25-square plan`); continue; }
        for (let j = st.y; j < st.y + st.h; j++) for (let i = st.x; i < st.x + st.w; i++) if (tileAt(i, j) === 3) { bad.push(`${r.id} is in water`); j = 1e9; break; }
        if (stairs.some(s => (s.from === 0 || s.to === 0) && !s.structure && s.x >= st.x - 2 && s.x <= st.x + st.w + 1 && s.y >= st.y - 2 && s.y <= st.y + st.h + 1)) bad.push(`${r.id} stands on a way down`);
      }
      R.theyStandInTheWaste = planned.length >= 2 && redoubts.some(r => r.deep) && !bad.length
        ? `${planned.length} AEGIS redoubts raised from a plan beside the deep one, each 25 across, dry, and off every way down`
        : `!! THE REDOUBTS: ${planned.length} from a plan; ${bad.slice(0, 3).join('; ')}`;
    });

    /* ---------- 2. THEY ARE BUILDINGS ---------- */
    guard(['theyAreBuildings'], () => {
      const bad = [];
      for (const r of planned) {
        const st = stOf(r);
        const gate = gateOf(st);
        if (!gate) { bad.push(`${r.id}: no gate in the outer wall`); continue; }
        if (isBlocked(gate.x + 0.5, gate.y + 0.5, 0)) bad.push(`${r.id}: the gate is shut`);
        /* the outer wall, a few tiles along each side from the corners */
        for (const [x, y] of [[st.x, st.y + 3], [st.x + st.w - 1, st.y + 3], [st.x + 3, st.y], [st.x + 3, st.y + st.h - 1]])
          if (!(x === gate.x && y === gate.y) && !isBlocked(x + 0.5, y + 0.5, 0)) bad.push(`${r.id}: outer wall open at ${x},${y}`);
        const hall = room(r, 'hall'), roof = room(r, 'roof'), cmd = room(r, 'command');
        if (isBlocked(hall.cx + 0.5, hall.cy + 0.5, 0)) bad.push(`${r.id}: the hall is not floor`);
        if (isBlocked(roof.cx + 0.5, roof.cy + 0.5, 1)) bad.push(`${r.id}: the roof is not floor`);
        if (decks.has(bkey(roof.cx, roof.cy, 2))) bad.push(`${r.id}: the roof has a roof`);
        if (!decks.has(bkey(cmd.cx, cmd.cy, 2))) bad.push(`${r.id}: the command room is open to the sky`);
        if (!isBlocked(st.x + 0.5, st.y + st.h - 3 + 0.5, 1)) bad.push(`${r.id}: no parapet`);
      }
      R.theyAreBuildings = planned.length && !bad.length
        ? 'each has a solid outer wall with an open gate in it, a hall of floor, a roof of floor under open sky behind a parapet, and a command room with a ceiling'
        : `!! NOT BUILDINGS: ${bad.slice(0, 4).join('; ')}`;
    });

    /* ---------- 3. EVERY ROOM HOLDS ITS OWN ---------- */
    guard(['everyRoomHoldsItsOwn', 'andTheirPostsSurviveASave'], () => {
      const tally = (rs) => rs.map(r => {
        const g = chars.filter(c => c.redoubtDeep === r.id && c.state !== 'dead');
        const posted = g.filter(c => c.homeRoom && r.rooms.some(rm => rm.id === c.homeRoom.id) && inRoom(c, c.homeRoom));
        return { id: r.id, n: g.length, posted: posted.length, rooms: new Set(posted.map(c => c.homeRoom.key)).size };
      });
      const before = tally(planned);
      R.everyRoomHoldsItsOwn = before.length && before.every(t => t.n >= 8 && t.posted === t.n && t.rooms >= 6)
        ? `each garrison is posted room by room and standing in its room: ${before.map(t => `${t.n} across ${t.rooms} rooms`).join(', ')}`
        : `!! THE GARRISONS ARE NOT POSTED: ${JSON.stringify(before)}`;
      restore(JSON.parse(JSON.stringify(snapshot())));
      const after = tally(redoubts.filter(r => r.structureId));
      R.andTheirPostsSurviveASave = JSON.stringify(after) === JSON.stringify(before)
        ? 'and after a save and reload every one of them is still posted to the same room'
        : `!! A RELOAD LOST THE POSTS: ${JSON.stringify(after)} against ${JSON.stringify(before)}`;
    });

    /* ---------- 4. THE VAULT ---------- */
    guard(['theVaultIsInTheVault'], () => {
      const rs = redoubts.filter(r => r.structureId);
      const bad = rs.filter(r => { const v = room(r, 'vault'); return !chests.some(ch => ch.vault && !(ch.floor) && ch.x >= v.x0 && ch.x <= v.x1 + 1 && ch.y >= v.y0 && ch.y <= v.y1 + 1); });
      R.theVaultIsInTheVault = rs.length && !bad.length
        ? 'and what each was protecting is in its vault, behind the wall across the end of the hall'
        : `!! NO VAULT CHEST IN THE VAULT: ${bad.map(r => r.id).join(', ')}`;
    });

    /* ---------- 5. IN AND UP ---------- */
    guard(['youCanWalkInAndUpToTheCommandRoom'], () => {
      const r = redoubts.find(q => q.structureId), st = stOf(r);
      const gate = gateOf(st);
      for (const c of chars) if (c.faction !== 'player' && c.state !== 'dead' && dist(c.x, c.y, r.x, r.y) < 60) { c.x = 12; c.y = 12; c.floor = 0; c.homeRoom = null; c.guard = { x: 12, y: 12 }; c.target = null; }
      const me = player().find(c => !c.undead && c.state === 'ok') || player()[0];
      for (const c of player()) if (c !== me) { c.x = r.x + 60; c.y = r.y + 60; c.floor = 0; }
      const ox = gate.ox, oy = gate.oy;
      me.x = gate.x + 0.5 + ox * 4; me.y = gate.y + 0.5 + oy * 4; me.floor = 0; me.target = null; me.state = 'ok';
      const cmd = room(r, 'command');
      rebuildCharGrid(); clearOrders(me);
      const ok = routeTo(me, cmd.cx + 0.5, cmd.cy + 0.5, 1);
      const seq = [0]; let t = 0;
      for (; t < 3000; t++) {
        if (t % 5 === 0) rebuildCharGrid();
        ai(me, 0.05); physics(me, 0.05);
        if (seq[seq.length - 1] !== (me.floor || 0)) seq.push(me.floor || 0);
        if ((me.floor || 0) === 1 && dist(me.x, me.y, cmd.cx + 0.5, cmd.cy + 0.5) < 1.5 && !me.moveTarget) break;
      }
      const there = (me.floor || 0) === 1 && dist(me.x, me.y, cmd.cx + 0.5, cmd.cy + 0.5) < 1.5;
      R.youCanWalkInAndUpToTheCommandRoom = ok && there
        ? `one of yours sent from outside the gate to the command room walks in through the hall and up (${seq.join('>')}) in ${(t * 0.05).toFixed(0)}s`
        : `!! THE WALK IN FAILED: ${ok ? 'ordered' : 'refused'}, went ${seq.join('>')}, ended ${me.x.toFixed(0)},${me.y.toFixed(0)} on ${me.floor || 0}`;
    });

    /* ---------- 6. THE WATCH ON THE ROOF ---------- */
    guard(['theRoofWatchShootsDown'], () => {
      const r = redoubts.filter(q => q.structureId)[1] || redoubts.find(q => q.structureId), st = stOf(r);
      const roof = room(r, 'roof');
      /* a warden at the parapet over the gate, and somebody hostile to it in front of the wall */
      const gate = gateOf(st);
      const ox = gate.ox, oy = gate.oy;
      for (const c of chars) if (c.state !== 'dead' && dist(c.x, c.y, r.x, r.y) < 60) { c.x = 12; c.y = 12; c.floor = 0; c.homeRoom = null; c.guard = { x: 12, y: 12 }; c.target = null; }
      const w = spawnCrazedHomunculus(gate.x + 0.5 - ox * 2, gate.y + 0.5 - oy * 2, r);
      w.x = gate.x + 0.5 - ox * 2; w.y = gate.y + 0.5 - oy * 2; w.floor = 1; w.weapon = 'w_lance';
      w.homeRoom = roof; w.roomId = roof.id; w.redoubtDeep = r.id; w.guard = { x: w.x, y: w.y };
      const foe = makeChar('Bench Raider', 'player', gate.x + 0.5 + ox * 5, gate.y + 0.5 + oy * 5, { atk: 1, def: 1, tough: 400, race: 'human', sub: 'dustborn' });
      foe.state = 'ok'; foe.floor = 0; foe.noFight = true; chars.push(foe);
      const real = fireRanged; let shots = 0;
      fireRanged = function (a, t) { if (a === w && t === foe) shots++; return real.apply(this, arguments); };
      try {
        rebuildCharGrid();
        for (let t = 0; t < 600 && shots < 2; t++) {
          if (t % 5 === 0) rebuildCharGrid();
          ai(w, 0.05); physics(w, 0.05);
          foe.x = gate.x + 0.5 + ox * 5; foe.y = gate.y + 0.5 + oy * 5; foe.state = 'ok';
        }
      } finally {
        fireRanged = real;
        for (const c of [w, foe]) { const i = chars.indexOf(c); if (i >= 0) chars.splice(i, 1); }
        rebuildCharGrid();
      }
      R.theRoofWatchShootsDown = shots > 0 && (w.floor || 0) === 1
        ? `a warden on the roof over the gate looses ${shots} times over the parapet at somebody five tiles out, without leaving the roof`
        : `!! THE ROOF WATCH DOES NOT SHOOT DOWN: ${shots} shots, the warden ended on storey ${w.floor || 0}`;
    });
    return R;
  });

  const bad = Object.values(out).filter(v => typeof v === 'string' && v.startsWith('!!'));
  for (const [k, v] of Object.entries(out)) console.log('  ' + k.padEnd(36) + ' ' + v);
  for (const e of errs) console.log('  ' + e);
  console.log('');
  console.log(bad.length || errs.length ? `*** THE REDOUBTS ARE NOT PLACES (${bad.length + errs.length}) ***` : 'AN AEGIS REDOUBT IS A PLACE YOU GO INTO');
  await b.close();
  process.exit(bad.length || errs.length ? 1 : 0);
})();
