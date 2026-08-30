#!/usr/bin/env node
/* HOW A SQUAD GETS TO A FIGHT.
 *
 * The report: "everyone tries to beeline towards the enemy and gets caught on allies. They
 * should attempt to flank around where possible."
 *
 * Two separate things are packed into that sentence and they want separate probes:
 *
 *   1. THE PILE-ON. Order eight bodies onto one man and every one of them walks at the same
 *      tile — his. They arrive as a column, the ones behind grind against the ones in front,
 *      and the back half of the squad never lands a blow at all. The measurement is not "does
 *      it look bad", it is HOW MANY of the eight ever get inside striking distance and FROM
 *      HOW MANY SIDES.
 *   2. WALKING THROUGH YOUR OWN LINE. `separate()` gives a body pressed against a HOSTILE a
 *      tangential slide so it goes round rather than grinding; against an ALLY it gets only
 *      the head-on push. So a runner sent past his own picket line pushes into it and stalls.
 *      Measured against a control run over the same ground with the line removed — the number
 *      that matters is the ratio, because the absolute walk time depends on the terrain the
 *      staging happened to land on.
 *
 * Both cases are staged on found-open ground and the quarry is PINNED to its tile every tick.
 * That second part is the lesson tools/rites.js learned the hard way: a crowd arriving at one
 * body SHOVES it, and a probe that lets the quarry drift is measuring a moving fight rather
 * than the approach to a standing one.
 *
 *   node tools/flank.js [game.html]
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
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message.slice(0, 220)));
  await p.goto('file://' + gamePath(process.argv[2]), { waitUntil: 'load' });
  await p.waitForTimeout(3000);
  /* ---------- START IT AND STOP IT IN THE SAME BREATH ----------
     THIS FILE WAS NON-DETERMINISTIC AND IT WAS THIS LINE. `click()` and then two and a half
     seconds of `waitForTimeout` lets the world RUN for however many sim steps the machine
     manages in that window, which is not a fixed number and drops sharply when a 51-harness
     suite is loading the box. Every body is somewhere slightly different by the time the probe
     stages anything, and the numbers inherit it.
     Measured on one unchanged build: `worstDetour` came back 1.67, 1.67, 1.09 over three runs,
     and `switches` 1, 1, 0 — the assertion was reporting the machine's load. Pausing in the
     same evaluate as the click leaves no frames between the two, so every run starts from the
     identical world. Same fix, same reason, as the one in guns.js. */
  await p.evaluate(() => { document.getElementById('btn-start').click(); paused = true; });
  await p.waitForTimeout(2500);

  const out = await p.evaluate(() => {
    const R = {};
    const born = [];
    const mk = (f, o, x, y) => { const c = makeChar('X', f, x, y, o); c.state = 'ok'; chars.push(c); born.push(c); return c; };
    const clean = () => { for (const c of born) { const i = chars.indexOf(c); if (i >= 0) chars.splice(i, 1); } born.length = 0; };

    /* A CLEARING BIG ENOUGH TO SURROUND SOMEBODY IN. The pile-on case needs open ground on
       every side of the quarry, not just on the approach — a probe staged with a cliff at the
       quarry's back would report "they only came from three sides" and be measuring the map. */
    const clear = (cx, cy, r) => {
      for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) if (isBlocked(cx + i, cy + j, 0)) return false;
      return true;
    };
    let S = null;
    outer: for (let y = 70; y < H - 70; y += 7) for (let x = 70; x < W - 70; x += 7) {
      if (clear(x, y, 14)) { S = { x, y }; break outer; }
    }
    if (!S) { R.noGround = true; return R; }
    R.ground = { x: S.x, y: S.y };

    /* one tick of the world, for the bodies this probe owns */
    const step = (cast, dt) => {
      rebuildCharGrid();
      for (const c of cast) if (c.state === 'ok') { ai(c, dt); physics(c, dt); }
      rebuildCharGrid();
      separate();
    };

    /* ---------- 1. THE PILE-ON ----------
       Eight of yours, ordered by hand onto one man standing in the open. An explicit order is
       the case that matters: it is the one the Kenshi side-cap deliberately does NOT apply to
       ("right-clicking a particular man means that man"), so nothing but the approach itself
       decides how they arrive. */
    const pileOn = () => {
      const quarry = mk('bandit', { atk: 1, def: 10, tough: 60, ath: 6 }, S.x, S.y);
      quarry.blood = quarry.maxBlood = 1e6;
      const px = quarry.x, py = quarry.y;
      const squad = [];
      for (let i = 0; i < 8; i++) {
        /* a column coming in from the west: three abreast, three ranks deep with the last
           rank short. However they are dropped they must END somewhere sensible, which is
           the whole point. */
        const c = mk('player', { atk: 14, def: 12, tough: 14, ath: 10, blades: 12 },
          S.x - 8 - (i / 3 | 0) * 1.1, S.y - 1.1 + (i % 3) * 1.1);
        c.weapon = 'w_kat';
        c.blood = c.maxBlood = 1e6;
        c.target = quarry; c.targetManual = true;
        squad.push(c);
      }
      rebuildCharGrid();

      const arrival = squad.map(() => -1);
      let stuckTicks = 0, marchTicks = 0, maxSimul = 0;
      for (let t = 0; t < 500; t++) {            /* 25 game-seconds at 20Hz */
        const was = squad.map(c => ({ x: c.x, y: c.y }));
        step([quarry, ...squad], 0.05);
        quarry.x = px; quarry.y = py;            /* PINNED: measure the approach, not the shove */
        quarry.target = null; quarry.moveTarget = null; quarry.path = null;
        let simul = 0;
        for (let i = 0; i < squad.length; i++) {
          const c = squad[i];
          const d = dist(c.x, c.y, px, py);
          if (d <= 1.05) { simul++; if (arrival[i] < 0) arrival[i] = t; continue; }
          /* THE GRIND IS COUNTED ON THE WAY IN AND NOWHERE ELSE. A body that has already been
             in reach once and got shoved back out to 1.2 is jostling in a brawl, which is what
             a brawl looks like; the complaint is about the walk, so only the walk is counted. */
          if (arrival[i] >= 0) continue;
          marchTicks++;
          if (dist(was[i].x, was[i].y, c.x, c.y) < moveSpeed(c) * 0.05 * 0.25) stuckTicks++;
        }
        if (simul > maxSimul) maxSimul = simul;
      }

      /* FROM HOW MANY SIDES. Eight 45-degree sectors around the quarry; count the ones with a
         body of yours standing in them, close enough to be part of the fight. */
      const sectors = new Set();
      let closeBodies = 0;
      for (const c of squad) {
        const d = dist(c.x, c.y, px, py);
        if (d > 1.9) continue;
        closeBodies++;
        sectors.add(Math.floor(((Math.atan2(c.y - py, c.x - px) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 4)));
      }
      const got = arrival.filter(a => a >= 0);
      const last = got.length ? Math.max(...got) : 500;
      return {
        squad: squad.length,
        everReached: got.length,
        maxSimul,
        lastArrival: got.length === squad.length ? last : null,   /* ticks; 20 to the second */
        arrival,
        closeAtEnd: closeBodies,
        sectors: sectors.size,
        grind: marchTicks ? +(stuckTicks / marchTicks).toFixed(3) : 0,
      };
    };
    R.pile = pileOn();
    clean();

    /* ---------- 2. WALKING THROUGH YOUR OWN LINE ----------
       A runner with somewhere to be and six of his own standing in the gap. The control is the
       same walk with nobody in it. Ratio, not seconds: the walk is over whatever ground the
       clearing search found. */
    const walkThrough = (withLine) => {
      const runner = mk('player', { atk: 10, def: 10, tough: 12, ath: 10 }, S.x - 9, S.y);
      runner.blood = runner.maxBlood = 1e6;
      const line = [];
      if (withLine) {
        for (let i = 0; i < 6; i++) {
          const o = mk('player', { atk: 10, def: 10, tough: 12, ath: 8 }, S.x - 3, S.y - 2.5 + i * 1.0);
          o.blood = o.maxBlood = 1e6;
          o.stance = 'hold';                    /* standing where they were put, as a line does */
          line.push(o);
        }
      }
      const gx = S.x + 6, gy = S.y;
      runner.moveTarget = { x: gx, y: gy };
      rebuildCharGrid();
      let ticks = 500;
      for (let t = 0; t < 500; t++) {
        const pins = line.map(o => ({ x: o.x, y: o.y }));
        step([runner, ...line], 0.05);
        /* the line HOLDS. Bodies shoved out of the way are the thing being measured, so a
           line that drifts apart under the runner would quietly hand him the gap. */
        for (let i = 0; i < line.length; i++) { line[i].x = pins[i].x; line[i].y = pins[i].y; }
        if (dist(runner.x, runner.y, gx, gy) < 0.6) { ticks = t; break; }
      }
      return ticks;
    };
    const open = walkThrough(false); clean();
    const blocked = walkThrough(true); clean();
    R.line = { open, blocked, ratio: open ? +(blocked / open).toFixed(2) : 99 };

    /* ---------- 3. TWO LINES MEETING ----------
       The report's own guess is that the jank is a side effect of the walling rule — the one
       that makes a body deal with whoever is on top of it rather than shouldering through to
       the man at the back. A rule like that can only misfire one way: by changing its mind.
       So this counts CHANGES OF MIND, and how far each body walked to reach a fight it could
       have reached by walking straight at it. */
    const scrum = () => {
      const mine = [], theirs = [];
      for (let i = 0; i < 6; i++) {
        /* THREE TILES EITHER SIDE, not five. Auto-acquire reaches seven, so a wider gap is a
           probe where nobody has a quarry and the lines drift together on idle business —
           which is a measurement of the idle system, not of how a fight is joined. */
        const a = mk('player', { atk: 13, def: 12, tough: 14, ath: 10, blades: 12 }, S.x - 3, S.y - 2.5 + i);
        a.weapon = 'w_kat'; a.blood = a.maxBlood = 1e6; a.stance = 'tank';
        const e = mk('bandit', { atk: 13, def: 12, tough: 14, ath: 10, blades: 12 }, S.x + 3, S.y - 2.5 + i);
        e.weapon = 'w_kat'; e.blood = e.maxBlood = 1e6;
        mine.push(a); theirs.push(e);
      }
      const cast = [...mine, ...theirs];
      rebuildCharGrid();
      const seen = cast.map(c => c.target), switches = cast.map(() => 0);
      const walked = cast.map(() => 0), start = cast.map(c => ({ x: c.x, y: c.y }));
      let contactTick = -1;
      for (let t = 0; t < 500; t++) {
        const was = cast.map(c => ({ x: c.x, y: c.y }));
        step(cast, 0.05);
        for (let i = 0; i < cast.length; i++) {
          walked[i] += dist(was[i].x, was[i].y, cast[i].x, cast[i].y);
          if (cast[i].target !== seen[i]) { if (seen[i] && cast[i].target) switches[i]++; seen[i] = cast[i].target; }
        }
        if (contactTick < 0 && mine.every(c => c.target && dist(c.x, c.y, c.target.x, c.target.y) <= 1.05)) contactTick = t;
      }
      /* a body that walked twice as far as it had to has been going round in circles */
      let detour = 0;
      for (let i = 0; i < cast.length; i++) {
        const straight = Math.max(1, dist(start[i].x, start[i].y, cast[i].x, cast[i].y));
        detour = Math.max(detour, walked[i] / (straight + 6));   /* +6: the gap they all had to close */
      }
      return {
        switches: switches.reduce((a, b) => a + b, 0),
        worstSwitches: Math.max(...switches),
        contactTick,
        worstDetour: +detour.toFixed(2),
      };
    };
    R.scrum = scrum();
    clean();

    /* ---------- 4. THE GATE ----------
       Open ground is the easy half and the three probes above say the open-ground approach is
       fine. Where "caught on allies" ought to bite is where the ground gives them one way in:
       a gateway, a breach, a corridor. Eight bodies with one order and one tile to come
       through it — if the approach queues badly anywhere, it queues here.
       The wall is written straight into `blocked0` rather than built through pBuilds, because
       what is being measured is pathing against blocked tiles and a real building would also
       drag in raiders, structure targets and the smash-through rule. Restored after. */
    const gate = () => {
      const wallX = Math.round(S.x + 2), gapY = Math.round(S.y);
      const put = [];
      for (let j = -7; j <= 7; j++) {
        if (j === 0) continue;                       /* the gap */
        const i = (gapY + j) * W + wallX;
        put.push(i); blocked0[i] = 1;
      }
      const quarry = mk('bandit', { atk: 1, def: 10, tough: 60, ath: 6 }, wallX + 3.5, gapY + 0.5);
      quarry.blood = quarry.maxBlood = 1e6;
      const px = quarry.x, py = quarry.y;
      const squad = [];
      for (let i = 0; i < 8; i++) {
        const c = mk('player', { atk: 14, def: 12, tough: 14, ath: 10, blades: 12 },
          wallX - 5 - (i / 4 | 0) * 1.2, gapY - 1.6 + (i % 4) * 1.1);
        c.weapon = 'w_kat'; c.blood = c.maxBlood = 1e6;
        c.target = quarry; c.targetManual = true;
        squad.push(c);
      }
      rebuildCharGrid();
      const arrival = squad.map(() => -1);
      for (let t = 0; t < 800; t++) {                /* 40s: a queue is allowed to take a while */
        step([quarry, ...squad], 0.05);
        quarry.x = px; quarry.y = py;
        quarry.target = null; quarry.moveTarget = null; quarry.path = null;
        for (let i = 0; i < squad.length; i++) {
          if (arrival[i] < 0 && dist(squad[i].x, squad[i].y, px, py) <= 1.05) arrival[i] = t;
        }
      }
      const stillOut = squad.filter((c, i) => arrival[i] < 0).length;
      const behind = squad.filter(c => c.x < wallX).length;   /* never even made the gap */
      for (const i of put) blocked0[i] = 0;
      return { arrival, throughAndFighting: 8 - stillOut, stuckBehindTheWall: behind };
    };
    R.gate = gate();
    clean();

    /* ---------- 5. JOINING A FIGHT SOMEBODY ELSE STARTED ----------
       The second half of the ask — "attempt to flank around where possible" — only means
       anything when the quarry has a front to be flanked, which is to say when he is already
       swinging at somebody. One of yours holds him from the west; three more come up the same
       road. The question is where those three end up: in the queue behind the man already
       fighting, or round on his sides. */
    const flank = () => {
      const quarry = mk('bandit', { atk: 1, def: 10, tough: 60, ath: 6 }, S.x, S.y);
      quarry.blood = quarry.maxBlood = 1e6;
      const px = quarry.x, py = quarry.y;
      const held = mk('player', { atk: 12, def: 12, tough: 14, ath: 8, blades: 10 }, S.x - 0.9, S.y);
      held.weapon = 'w_kat'; held.blood = held.maxBlood = 1e6;
      const hx = held.x, hy = held.y;
      const squad = [];
      for (let i = 0; i < 3; i++) {
        const c = mk('player', { atk: 12, def: 12, tough: 14, ath: 10, blades: 10 }, S.x - 8, S.y - 1.1 + i * 1.1);
        c.weapon = 'w_kat'; c.blood = c.maxBlood = 1e6;
        c.target = quarry; c.targetManual = true;
        squad.push(c);
      }
      /* his front is the direction of the man he is fighting */
      const fx = (hx - px) / Math.max(0.01, dist(hx, hy, px, py));
      const fy = (hy - py) / Math.max(0.01, dist(hx, hy, px, py));
      rebuildCharGrid();
      /* WHERE EACH ONE CHOSE TO FIGHT, which is where it was standing when it first started a
         swing — not where it ended up after twenty seconds of shoving, and not the first
         moment it crossed into reach.
         THE SECOND OF THOSE IS THE ONE THAT FOOLED THIS PROBE ONCE. A body walking round to
         the north side CLIPS the man's reach while it is still west of him, so a bearing taken
         at first-contact reported 0.83 — dead in front — for a body that went on to fight from
         the north. It read as the feature doing nothing on a build where it was working. The
         windup is the honest moment: a body that has begun a stroke has stopped choosing. */
      const bearings = squad.map(() => null);
      for (let t = 0; t < 500; t++) {
        step([...squad], 0.05);
        quarry.x = px; quarry.y = py; quarry.target = held; quarry.state = 'ok';
        held.x = hx; held.y = hy; held.target = quarry;
        for (let i = 0; i < squad.length; i++) {
          if (bearings[i] !== null) continue;
          const c = squad[i], d = dist(c.x, c.y, px, py);
          if (!c.windup || d < 0.01) continue;
          bearings[i] = +(((c.x - px) / d) * fx + ((c.y - py) / d) * fy).toFixed(2);
        }
      }
      const got = bearings.filter(b => b !== null);
      return {
        arrived: got.length,
        offTheFront: got.filter(b => b <= 0.64).length,   /* outside the ninety degrees he faces */
        bearings,
      };
    };
    R.flank = flank();
    clean();

    return R;
  });

  await b.close();

  const fails = [];
  console.log(JSON.stringify(out, null, 1));
  if (out.noGround) fails.push('no clearing big enough to stage a surround — the search, not the game');

  /* ---- THE SURROUND ----
     The two that carry the change: how many SIDES the squad ends up on, and whether they fight
     a busy man from anywhere but his face. The rest are guards on what already worked — the
     three probes below all passed before any of this was written, and the point of keeping
     them is that a flanking rule is exactly the kind of thing that would break them. */
  const P = out.pile || {};
  if (!(P.sectors >= 7)) fails.push(`the squad arrived from ${P.sectors} of 8 sides — a column, not a surround`);
  if (!(P.everReached >= 8)) fails.push(`only ${P.everReached}/8 of the squad ever reached striking distance`);
  if (!(P.lastArrival !== null && P.lastArrival <= 90)) fails.push(`the last of the eight took ${P.lastArrival} ticks to arrive (was 53 before the ring)`);
  if (!(P.grind <= 0.15)) fails.push(`${Math.round(P.grind * 100)}% of marching ticks went nowhere — they are grinding on each other`);

  const F = out.flank || {};
  if (!(F.arrived === 3)) fails.push(`${F.arrived}/3 joined the fight at all`);
  if (!(F.offTheFront >= 2)) fails.push(`${F.offTheFront}/3 came round off his front — bearings ${JSON.stringify(F.bearings)}, where 1 is his face`);

  const L = out.line || {};
  if (!(L.ratio <= 1.6)) fails.push(`a walk past your own line costs ${L.ratio}x the open walk (${L.blocked} vs ${L.open} ticks)`);

  const G = out.gate || {};
  if (!(G.throughAndFighting === 8)) fails.push(`${G.throughAndFighting}/8 got through the gate; ${G.stuckBehindTheWall} never made it past the wall`);

  const C = out.scrum || {};
  if (!(C.contactTick >= 0 && C.contactTick <= 60)) fails.push(`six against six took ${C.contactTick} ticks to all be in contact`);
  if (!(C.worstSwitches <= 2)) fails.push(`somebody changed their mind ${C.worstSwitches} times about who to fight`);
  if (!(C.worstDetour <= 1.6)) fails.push(`somebody walked ${C.worstDetour}x the ground the fight needed`);
  if (errs.length) fails.push(...errs);

  if (fails.length) { console.log('\nFAIL\n · ' + fails.join('\n · ')); process.exit(1); }
  console.log('\nTHE SQUAD SURROUNDS, AND GIVES WAY TO ITS OWN');
})();
