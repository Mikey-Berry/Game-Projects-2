#!/usr/bin/env node
/* THE STOREY TEST BENCH.
 *
 * "I feel that the storeys system is just broken in general. I'm wondering if we need to build
 *  and test a new one from scratch." (2026-10-03)
 *
 * Every other storey harness stages against something the world happened to generate — the
 * ARK, a town's stairwell, a warren — so when the world moves, the harness measures a different
 * building, and when a building is odd, the harness inherits the oddity. This one builds its
 * own: on an empty stretch of ground it raises a tower, a wide deck, two decks side by side, a
 * corridor with a stair in it, a stair standing in a field and a two-storey cave, out of the
 * same three things every structure in the game is made of (`decks`, `blocked`, `stairs`), and
 * then walks real bodies through them with the game's own `ai` and `physics`.
 *
 * The claims are about OUTCOMES — where a body ends up, which storeys it passed through, what
 * it could see and whom it could hit — never about which function did it, so the same claims
 * hold the old routing and the core that replaces it to one standard.
 *
 *   WALKING
 *    1. up a five-storey tower whose stairs change corner every floor, and back out of it
 *    2. across a deck seventy tiles wide to its far corner
 *    3. past another deck's stair on the way to your own — without taking it
 *    4. from one deck to another on the same storey, which is down and up again
 *    5. along a corridor with a stair in it, staying on the corridor's storey
 *    6. across a field with a stair standing in it, staying on the ground
 *    7. round a partition through its door on an upper storey
 *    8. two storeys down into a cave, and back up to the sky
 *    9. four of you to one room three storeys up, all of you arriving
 *  10-13. a click means the storey it lands on: a roof from the ground, the room you are in,
 *       the ground outside from upstairs, an open deck
 *   SEEING
 *   10. a body underground does not light the surface over its head
 *   11. a room with a ceiling gives no lookout's view; an open roof does
 *   FIGHTING
 *   12. an attack order on somebody one storey up is carried up the stair, and no blow ever
 *       lands through a floor
 *   13. a bow on an open deck reaches the ground in front of it
 *   14. a bow behind a tower's walls does not
 *
 * Anything starting '!!' fails the build.
 *
 *   node tools/stairwell.js [game.html]
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

  /* ---------- THE GROUND, AND THE STRUCTURES ON IT ---------- */
  const site = await p.evaluate(() => {
    paused = true; hour = 11;
    /* ---------- EMPTY ON THE STOREYS THE BENCH USES ----------
       The undercroft runs the width of the world, so "no decks and no stairs anywhere under
       this rectangle" is never true — 1609 of the candidates failed on a shaft and 419 on a
       tunnel the first time this ran. The surface and the storeys above it must be empty over
       the whole site; the two cave storeys need only be empty under the cave's own footprint,
       which is rock between two tunnels. */
    const SW = 160, SH = 125, UP = [1, 2, 3, 4, 5], CAVE = { x0: 114, y0: 64, x1: 146, y1: 98 };
    const clean = (x0, y0) => {
      if (towns.some(t => dist(t.x, t.y, x0 + SW / 2, y0 + SH / 2) < 140)) return false;
      if (stairs.some(st => (st.from >= 0 || st.to >= 0) && st.x >= x0 - 8 && st.x < x0 + SW + 8 && st.y >= y0 - 8 && st.y < y0 + SH + 8)) return false;
      if (stairs.some(st => (st.from < 0 || st.to < 0) && st.x >= x0 + CAVE.x0 && st.x <= x0 + CAVE.x1 && st.y >= y0 + CAVE.y0 && st.y <= y0 + CAVE.y1)) return false;
      if (charsNear(x0 + SW / 2, y0 + SH / 2, Math.hypot(SW, SH) / 2 + 30).length) return false;
      for (let y = y0 - 2; y < y0 + SH + 2; y++) for (let x = x0 - 2; x < x0 + SW + 2; x++) {
        if (isBlocked(x + 0.5, y + 0.5, 0)) return false;
        for (const f of UP) if (decks.has(bkey(x, y, f))) return false;
      }
      for (let y = y0 + CAVE.y0; y <= y0 + CAVE.y1; y++) for (let x = x0 + CAVE.x0; x <= x0 + CAVE.x1; x++)
        for (const f of [-1, -2, -3]) if (decks.has(bkey(x, y, f))) return false;
      return true;
    };
    for (let y0 = 60; y0 < H - SH - 60; y0 += 23) for (let x0 = 60; x0 < W - SW - 60; x0 += 29)
      if (clean(x0, y0)) return { x: x0, y: y0 };
    return null;
  });
  if (!site) { console.log('  !! NO EMPTY GROUND BIG ENOUGH FOR THE BENCH'); await b.close(); process.exit(1); }

  await p.evaluate((S) => {
    const ox = S.x, oy = S.y;
    window.__bench = { ox, oy };
    const B = window.__bench;
    /* the three primitives, and nothing else */
    const deck = (x0, y0, x1, y1, f) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) decks.add(bkey(ox + x, oy + y, f)); };
    const wall = (x, y, f) => { blocked.add(bkey(ox + x, oy + y, f)); if (typeof baseBlocked !== 'undefined') baseBlocked.add(bkey(ox + x, oy + y, f)); };
    const ring = (x0, y0, x1, y1, f, gaps) => {
      for (let x = x0; x <= x1; x++) for (const y of [y0, y1]) if (!(gaps || []).some(g => g[0] === x && g[1] === y)) wall(x, y, f);
      for (let y = y0 + 1; y < y1; y++) for (const x of [x0, x1]) if (!(gaps || []).some(g => g[0] === x && g[1] === y)) wall(x, y, f);
    };
    const stair = (x, y, from, to) => stairs.push({ x: ox + x, y: oy + y, from, to, bench: true });

    /* THE TOWER: 11 x 11, five storeys, a door in the south wall, and the stair changes corner
       every floor so no two flights are above one another. Storey 2 has a partition with one
       doorway in it. Storey 4 is an open roof behind a parapet; storeys 1-3 have a ceiling. */
    /* Raised through the game's own `buildStructure` where there is one, so it is a building the
       way a real one is — cut volume and all — and by hand from the primitives where there is
       not, so the bench still runs against a build from before the core. Everything else on the
       bench stays hand-written on purpose: the core has to carry both. */
    const ROOM = (stair) => ['###########', ...Array.from({ length: 9 }, (_, i) => {
      const r = '#.........#'.split(''); if (stair && stair[1] === i + 1) r[stair[0]] = '^'; return r.join('');
    }), '###########'];
    const plans = {
      0: [...ROOM([1, 9]).slice(0, 10), '#####=#####'],
      1: ROOM([9, 1]),
      2: ROOM([9, 9]).map((r, i) => (i >= 1 && i <= 9 && i !== 5) ? r.slice(0, 5) + '#' + r.slice(6) : r),
      3: ROOM([1, 1]),
      4: ROOM(null),
    };
    if (typeof buildStructure === 'function') {
      B.towerRec = buildStructure({ x: ox + 10, y: oy + 10, name: 'Bench Tower', storeys: plans });
    } else {
      ring(10, 10, 20, 20, 0, [[15, 20]]);
      for (let f = 1; f <= 4; f++) { deck(10, 10, 20, 20, f); ring(10, 10, 20, 20, f); }
      for (let y = 11; y <= 19; y++) if (y !== 15) wall(15, y, 2);
      stair(11, 19, 0, 1); stair(19, 11, 1, 2); stair(19, 19, 2, 3); stair(11, 11, 3, 4);
    }
    B.tower = { door: { x: ox + 15.5, y: oy + 24.5 }, top: { x: ox + 15.5, y: oy + 15.5 },
                behind: { x: ox + 12.5, y: oy + 15.5 }, room3: { x: ox + 15.5, y: oy + 15.5 },
                inside2: { x: ox + 17.5, y: oy + 13.5 } };

    /* THE WIDE DECK: seventy by forty on storey 1, one stair at the middle of its west edge, and
       nothing on it — no walls. The open deck the bows are judged from. */
    deck(40, 10, 109, 49, 1);
    stair(40, 30, 0, 1);
    B.wide = { foot: { x: ox + 36.5, y: oy + 30.5 }, far: { x: ox + 108.5, y: oy + 48.5 },
               edge: { x: ox + 100.5, y: oy + 48.5 }, below: { x: ox + 100.5, y: oy + 54.5 } };

    /* TWO DECKS SIDE BY SIDE on storey 1, each with its own stair, and B's stair standing on the
       straight line from the start to A's. The ARK fault, built on purpose. */
    deck(10, 90, 16, 96, 1); stair(16, 93, 0, 1);
    deck(34, 91, 38, 95, 1); stair(36, 93, 0, 1);
    B.pair = { start: { x: ox + 60.5, y: oy + 93.5 }, onA: { x: ox + 11.5, y: oy + 91.5 },
               onB: { x: ox + 37.5, y: oy + 94.5 } };

    /* A CORRIDOR on storey 1, three wide and thirty long, reached at its west end — with a stair
       to storey 2 standing in the middle of it. */
    deck(60, 69, 90, 73, 1);
    for (let x = 60; x <= 90; x++) { wall(x, 69, 1); wall(x, 73, 1); }
    stair(61, 71, 0, 1);
    deck(73, 68, 77, 74, 2); stair(75, 71, 1, 2);
    B.corr = { west: { x: ox + 62.5, y: oy + 71.5 }, east: { x: ox + 89.5, y: oy + 71.5 } };

    /* A STAIR IN A FIELD: a one-tile lookout platform on storey 1, its stair on the ground. */
    deck(60, 110, 61, 111, 1); stair(60, 110, 0, 1);
    B.field = { a: { x: ox + 50.5, y: oy + 110.5 }, b: { x: ox + 70.5, y: oy + 110.5 } };

    /* A CAVE: a room on -1 entered from the surface, and a room on -2 below part of it. */
    deck(120, 70, 131, 81, -1); stair(121, 75, 0, -1);
    deck(126, 77, 140, 92, -2); stair(129, 79, -1, -2);
    B.cave = { mouth: { x: ox + 116.5, y: oy + 75.5 }, deep: { x: ox + 138.5, y: oy + 90.5 },
               under: { x: ox + 124.5, y: oy + 73.5 } };

  }, site);

  /* ---------- WALKING ---------- */
  const walk = async (label, spec) => p.evaluate(({ label, spec }) => {
    const B = window.__bench;
    const pick = (path) => path.split('.').reduce((o, k) => o[k], B);
    const logs = [];
    const keepLog = log;
    log = (m, k) => { if (k === 'bad') logs.push(String(m).slice(0, 90)); return keepLog(m, k); };
    const made = [];
    try {
      const n = spec.n || 1;
      const from = pick(spec.from), to = pick(spec.to);
      for (let i = 0; i < n; i++) {
        const c = makeChar('Bench ' + (i + 1), 'player', from.x + (i % 2) * 0.6, from.y + Math.floor(i / 2) * 0.6,
                           { atk: 10, def: 10, tough: 30, ath: 10, race: 'human', sub: 'dustborn' });
        c.state = 'ok'; c.floor = spec.fromF || 0; c.hunger = 100; c.__bench = true;
        chars.push(c); made.push(c);
      }
      rebuildCharGrid();
      if (n === 1) { clearOrders(made[0]); routeTo(made[0], to.x, to.y, spec.toF || 0); }
      else orderParty(made, to.x, to.y, spec.toF || 0);
      const seq = made.map(c => [c.floor || 0]);
      const at = made.map(() => null);
      const lim = spec.ticks || 3000;
      let t = 0;
      for (; t < lim; t++) {
        if (t % 5 === 0) rebuildCharGrid();
        for (const c of made) if (c.state === 'ok') { ai(c, 0.05); physics(c, 0.05); }
        made.forEach((c, i) => {
          const f = c.floor || 0;
          if (seq[i][seq[i].length - 1] !== f) seq[i].push(f);
          const there = f === (spec.toF || 0) && dist(c.x, c.y, to.x, to.y) < (n > 1 ? 3 : 1.5) && !c.moveTarget && !c.wantFloor;
          if (there && at[i] === null) at[i] = t;
        });
        if (at.every(v => v !== null)) break;
      }
      return {
        arrived: at.filter(v => v !== null).length, n,
        secs: +(t * 0.05).toFixed(1),
        seq: seq.map(s => s.join('>')),
        end: made.map(c => `${c.x.toFixed(0)},${c.y.toFixed(0)}@${c.floor || 0}`),
        logs: [...new Set(logs)].slice(0, 3),
      };
    } finally {
      log = keepLog;
      for (const c of made) { const i = chars.indexOf(c); if (i >= 0) chars.splice(i, 1); }
      rebuildCharGrid();
    }
  }, { label, spec });

  const R = {};
  const show = (w) => `${w.arrived}/${w.n} in ${w.secs}s via ${w.seq.join(' | ')}, ended ${w.end.join(' ')}${w.logs.length ? ' — "' + w.logs.join('" "') + '"' : ''}`;
  const judge = (key, w, ok, good) => { R[key] = ok ? `${good} (${show(w)})` : `!! ${key.replace(/([A-Z])/g, ' $1').toUpperCase()} FAILED: ${show(w)}`; };

  /* 1 */
  { const w = await walk('up', { from: 'tower.door', to: 'tower.top', toF: 4 });
    judge('upATowerThatTurnsEveryFloor', w, w.arrived === 1 && w.seq[0] === '0>1>2>3>4', 'from the door to the roof, one storey at a time');
    const d = await walk('down', { from: 'tower.top', fromF: 4, to: 'tower.door', toF: 0 });
    judge('andBackOutOfIt', d, d.arrived === 1 && d.seq[0] === '4>3>2>1>0', 'from the roof to the door'); }
  /* 2 */
  { const w = await walk('wide', { from: 'wide.foot', to: 'wide.far', toF: 1, ticks: 4000 });
    judge('acrossAWideDeck', w, w.arrived === 1 && w.seq[0] === '0>1', 'up its one stair and seventy tiles to the far corner'); }
  /* 3 */
  { const w = await walk('pair', { from: 'pair.start', to: 'pair.onA', toF: 1 });
    judge('pastSomebodyElsesStair', w, w.arrived === 1 && w.seq[0] === '0>1', 'walked over the other deck\'s stair and climbed its own'); }
  /* 4 */
  { const w = await walk('d2d', { from: 'pair.onB', fromF: 1, to: 'pair.onA', toF: 1 });
    judge('fromDeckToDeck', w, w.arrived === 1 && w.seq[0] === '1>0>1', 'down off one deck and up the other'); }
  /* 5 */
  { const w = await walk('corr', { from: 'corr.west', fromF: 1, to: 'corr.east', toF: 1 });
    judge('alongACorridorWithAStairInIt', w, w.arrived === 1 && w.seq[0] === '1', 'end to end on its own storey, past the stair'); }
  /* 6 */
  { const w = await walk('field', { from: 'field.a', to: 'field.b', toF: 0 });
    judge('acrossAFieldWithAStairInIt', w, w.arrived === 1 && w.seq[0] === '0', 'across on the ground, past the stair'); }
  /* 7 */
  { const w = await walk('part', { from: 'tower.inside2', fromF: 2, to: 'tower.behind', toF: 2 });
    judge('roundAPartitionUpstairs', w, w.arrived === 1 && w.seq[0] === '2', 'through the partition\'s door on storey 2'); }
  /* 8 */
  { const w = await walk('cave', { from: 'cave.mouth', to: 'cave.deep', toF: -2 });
    judge('downIntoACave', w, w.arrived === 1 && w.seq[0] === '0>-1>-2', 'two storeys down');
    const u = await walk('caveup', { from: 'cave.deep', fromF: -2, to: 'cave.mouth', toF: 0 });
    judge('andUpToTheSky', u, u.arrived === 1 && u.seq[0] === '-2>-1>0', 'and back out'); }
  /* 9 */
  { const w = await walk('squad', { from: 'tower.door', to: 'tower.room3', toF: 3, n: 4, ticks: 4000 });
    judge('fourOfYouToOneRoom', w, w.arrived === 4 && w.seq.every(s => s === '0>1>2>3'), 'all four, three storeys up'); }

  /* ---------- CLICKING ----------
     A route nobody can ask for is not a route. Every walk above was ordered by calling
     `routeTo` with the storey already known; a player has only the cursor. So the real
     right-click is dispatched at the screen point where a tile of a given storey projects, and
     the claim reads which storey the order was given FOR. Asked with no meshes on the bench at
     all, on purpose: the storey a click means is geometry, not whatever happened to be drawn. */
  const click = async (spec) => p.evaluate((spec) => {
    const B = window.__bench;
    const pick = (path) => path.split('.').reduce((o, k) => o[k], B);
    const made = [];
    const keepSel = selected.slice(), keepFloor = activeFloor;
    try {
      const at = pick(spec.body);
      const c = makeChar('Bench Hand', 'player', at.x, at.y, { race: 'human', sub: 'dustborn' });
      c.state = 'ok'; c.floor = spec.bodyF; c.__bench = true; chars.push(c); made.push(c);
      rebuildCharGrid();
      selected = [c]; activeFloor = spec.bodyF;
      const tg = pick(spec.target);
      camX = camSX = tg.x; camY = camSY = tg.y; camFollow = false;
      camDist = camDistTarget = 30; camPitch = camPitchT = 0.85; camYaw = camYawT = 0.4;
      if (typeof camFY !== 'undefined') camFY = floorY(spec.bodyF);
      render();
      const v = new THREE.Vector3(tg.x, groundY(tg.x, tg.y) + floorY(spec.targetF), tg.y).project(camera);
      const rc = renderer.domElement.getBoundingClientRect();
      const cx = rc.left + (v.x * 0.5 + 0.5) * rc.width, cy = rc.top + (-v.y * 0.5 + 0.5) * rc.height;
      clearOrders(c);
      const logs = [];
      const keepLog = log;
      log = (m, k) => { logs.push(String(m).slice(0, 80)); return keepLog(m, k); };
      try {
        renderer.domElement.dispatchEvent(new MouseEvent('mousedown', { button: 2, clientX: cx, clientY: cy, bubbles: true }));
      } finally { log = keepLog; }
      const goal = c.afterStair || c.moveTarget;
      const meant = c.wantFloor !== null && c.wantFloor !== undefined ? c.wantFloor : (c.moveTarget ? (c.floor || 0) : null);
      return { meant, off: goal ? +dist(goal.x, goal.y, tg.x, tg.y).toFixed(1) : null, logs: logs.slice(0, 2) };
    } finally {
      selected = keepSel; activeFloor = keepFloor;
      made.forEach(c => { const i = chars.indexOf(c); if (i >= 0) chars.splice(i, 1); });
      rebuildCharGrid();
    }
  }, spec);
  const clickClaim = async (key, spec, good) => {
    const r = await click(spec);
    R[key] = r.meant === spec.targetF && r.off !== null && r.off < 2.5
      ? `${good} (storey ${r.meant}, ${r.off} tiles from the point)`
      : `!! ${key.replace(/([A-Z])/g, ' $1').toUpperCase()}: a click on storey ${spec.targetF} gave an order for storey ${r.meant}${r.off !== null ? ', ' + r.off + ' tiles off' : ''}${r.logs.length ? ' — "' + r.logs.join('" "') + '"' : ''}`;
  };
  await clickClaim('aClickOnTheRoofMeansTheRoof', { body: 'tower.door', bodyF: 0, target: 'tower.top', targetF: 4 },
    'from the ground, a click on the tower\'s roof orders the climb to the roof');
  await clickClaim('aClickInTheRoomYouAreIn', { body: 'tower.inside2', bodyF: 2, target: 'tower.behind', targetF: 2 },
    'on storey 2, a click on storey 2\'s floor is a walk on storey 2');
  await clickClaim('aClickOnTheGroundOutside', { body: 'tower.inside2', bodyF: 2, target: 'tower.door', targetF: 0 },
    'and from storey 2, a click on the ground outside is the way down and out');
  await clickClaim('aClickOnAnOpenDeck', { body: 'wide.foot', bodyF: 0, target: 'wide.far', targetF: 1 },
    'from the ground, a click on an open deck is the way up onto it');

  /* ---------- SEEING ---------- */
  const sight = await p.evaluate(() => {
    const B = window.__bench;
    const mine = chars.filter(c => c.faction === 'player' && c.state !== 'dead');
    const keep = mine.map(c => c.faction);
    for (const c of mine) c.faction = '_parked';
    const made = [];
    const probe = (pt, f) => {
      const c = makeChar('Bench Eye', 'player', pt.x, pt.y, { race: 'human', sub: 'dustborn' });
      c.state = 'ok'; c.floor = f; c.weapon = 'w_torch'; c.torchH = 99; chars.push(c); made.push(c); return c;
    };
    const radius = (c) => {
      const real = stampVision; let got = -1;
      stampVision = (x, y, r) => { if (Math.abs(x - c.x) < 0.01 && Math.abs(y - c.y) < 0.01 && got < 0) got = r; return real(x, y, r); };
      try { computeVision(); } finally { stampVision = real; }
      return got;
    };
    const out = {};
    try {
      /* 10: underground, with the surface tile over its head asked by storey */
      const u = probe(B.cave.under, -1);
      rebuildCharGrid(); computeVision();
      const ux = Math.floor(u.x), uy = Math.floor(u.y);
      out.surfaceOverCave = visAt.length >= 3 ? visAt(ux + 0.5, uy + 0.5, 0) : visAt(ux + 0.5, uy + 0.5);
      out.caveItself = visAt.length >= 3 ? visAt(ux + 0.5, uy + 0.5, -1) : visAt(ux + 0.5, uy + 0.5);
      made.splice(0).forEach(c => chars.splice(chars.indexOf(c), 1));
      /* 11: the same body on the ground, in a ceilinged room on storey 3, and on the open roof */
      const g = probe(B.tower.door, 0); rebuildCharGrid(); out.ground = radius(g);
      g.x = B.tower.room3.x; g.y = B.tower.room3.y; g.floor = 3; out.room3 = radius(g);
      g.floor = 4; out.roof = radius(g);
    } finally {
      made.forEach(c => { const i = chars.indexOf(c); if (i >= 0) chars.splice(i, 1); });
      mine.forEach((c, i) => c.faction = keep[i]);
      rebuildCharGrid(); computeVision();
    }
    return out;
  });
  R.theSurfaceIsNotSeenFromBelow = sight.surfaceOverCave !== 2 && sight.caveItself === 2
    ? `a body on -1 sees its own storey (${sight.caveItself}) and not the ground over its head (${sight.surfaceOverCave})`
    : `!! THE SURFACE IS SEEN FROM UNDERGROUND: the ground over a body on -1 reads ${sight.surfaceOverCave}, its own storey ${sight.caveItself}`;
  R.aCeilingIsNotALookout = sight.room3 > 0 && Math.abs(sight.room3 - sight.ground) < 0.5 && sight.roof > sight.ground + 4
    ? `${sight.ground.toFixed(0)} tiles on the ground, ${sight.room3.toFixed(0)} in a room with a ceiling three storeys up, ${sight.roof.toFixed(0)} on the open roof`
    : `!! A ROOM WITH A CEILING SEES LIKE A LOOKOUT: ground ${sight.ground.toFixed(1)}, ceilinged room on storey 3 ${sight.room3.toFixed(1)}, open roof ${sight.roof.toFixed(1)}`;

  /* ---------- FIGHTING ---------- */
  const fight = async (spec) => p.evaluate((spec) => {
    const B = window.__bench;
    const pick = (path) => path.split('.').reduce((o, k) => o[k], B);
    const made = [];
    const real = attack, realShot = fireRanged;
    const blows = [];
    /* a blade lands through `attack`; an arrow is loosed through `fireRanged` and lands later,
       as a projectile — so a shot is counted at the loose, which is the decision under test */
    try {
      const a = makeChar('Bench Hand', 'player', pick(spec.a).x, pick(spec.a).y,
                         { atk: 14, def: 10, tough: 40, ath: 10, race: 'human', sub: 'dustborn' });
      a.state = 'ok'; a.floor = spec.aF; a.hunger = 100; a.weapon = spec.weapon; a.__bench = true;
      if (spec.weapon === 'w_bow') a.stance = 'ranged';
      const d = makeChar('Bench Foe', 'bandit', pick(spec.d).x, pick(spec.d).y,
                         { atk: 1, def: 1, tough: 400, ath: 1, race: 'human', sub: 'dustborn' });
      d.state = 'ok'; d.floor = spec.dF; d.hunger = 100; d.weapon = null; d.__bench = true;
      d.guard = { x: d.x, y: d.y }; d.noFight = true;
      chars.push(a, d); made.push(a, d);
      attack = function (x, y) { if (x === a && y === d) blows.push((x.floor || 0) + '>' + (y.floor || 0)); return real.apply(this, arguments); };
      fireRanged = function (x, y) { if (x === a && y === d) blows.push((x.floor || 0) + '>' + (y.floor || 0) + ' shot'); return realShot.apply(this, arguments); };
      rebuildCharGrid();
      if (spec.order) { clearOrders(a); a.target = d; a.targetManual = true; }
      for (let t = 0; t < (spec.ticks || 1200); t++) {
        if (t % 5 === 0) rebuildCharGrid();
        ai(a, 0.05); physics(a, 0.05);
        d.x = pick(spec.d).x; d.y = pick(spec.d).y; d.state = 'ok';
        if (spec.stopAt && blows.length >= spec.stopAt) break;
      }
      return { blows: blows.length, through: blows.filter(s => !s.endsWith('shot') && s.split('>')[0] !== s.split('>')[1]).length,
               first: blows[0] || null, endF: a.floor || 0, end: `${a.x.toFixed(0)},${a.y.toFixed(0)}` };
    } finally {
      attack = real; fireRanged = realShot;
      made.forEach(c => { const i = chars.indexOf(c); if (i >= 0) chars.splice(i, 1); });
      rebuildCharGrid();
    }
  }, spec);

  /* 12: a blade ordered at somebody on storey 1, from the tower door */
  { const r = await fight({ a: 'tower.door', aF: 0, d: 'tower.inside2', dF: 1, weapon: 'w_kat', order: true, ticks: 2400, stopAt: 3 });
    R.anAttackOrderClimbs = r.blows > 0 && !r.through && r.endF === 1
      ? `ordered at a foe one storey up, the hand climbed and struck ${r.blows} times on storey 1, none through the floor`
      : `!! AN ATTACK ORDER ON A FOE UPSTAIRS: ${r.blows} blows, ${r.through} through a floor, the hand ended on storey ${r.endF} at ${r.end}`; }
  /* 13: a bow on the open deck's edge, a foe on the ground six tiles out (a hunting bow reaches seven) */
  { const r = await fight({ a: 'wide.edge', aF: 1, d: 'wide.below', dF: 0, weapon: 'w_bow', order: true, ticks: 600, stopAt: 2 });
    R.aBowOnAnOpenDeckReachesTheGround = r.blows > 0 && r.endF === 1
      ? `${r.blows} shots from the deck's edge into the ground below, without coming down`
      : `!! A BOW ON AN OPEN DECK CANNOT REACH THE GROUND IN FRONT OF IT: ${r.blows} shots, ended on storey ${r.endF} at ${r.end}`; }
  /* 14: a bow behind the tower's walls on storey 2, the same foe outside */
  { const r = await fight({ a: 'tower.inside2', aF: 2, d: 'tower.door', dF: 0, weapon: 'w_bow', order: false, ticks: 400 });
    R.butNotThroughATowersWalls = r.blows === 0
      ? 'and from behind a tower\'s walls on storey 2 it does not fire at all'
      : `!! A BOW SHOT THROUGH THE TOWER'S WALLS: ${r.blows} shots from storey 2 at the ground outside`; }

  const bad = Object.values(R).filter(v => typeof v === 'string' && v.startsWith('!!'));
  console.log(`  bench at ${site.x},${site.y}`);
  for (const [k, v] of Object.entries(R)) console.log('  ' + k.padEnd(36) + ' ' + v);
  for (const e of errs) console.log('  ' + e);
  console.log('');
  console.log(bad.length || errs.length ? `*** THE STOREYS ARE BROKEN (${bad.length + errs.length} of ${Object.keys(R).length}) ***` : 'EVERY STOREY IS A PLACE YOU CAN GO');
  await b.close();
  process.exit(bad.length || errs.length ? 1 : 0);
})();
