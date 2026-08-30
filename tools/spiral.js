#!/usr/bin/env node
/* DO THEY ARRIVE?
 *
 * "Pathfinding is wonky now. Sometimes allies start 'rotating' around each other in a glitchy
 *  spiral circle, and never reach their destination."
 *
 * The separation pass gives a body with somewhere to be a SIDESTEP so it goes round an
 * obstacle rather than grinding into it. It picked a fixed perpendicular: `a` was pushed along
 * (-uy, ux) and `b` along exactly the opposite. Two bodies pushed in opposite tangential
 * directions are a COUPLE, and a couple is a rotation — so any pair of allies who both had a
 * destination and happened to touch went into orbit around their midpoint and stayed there.
 *
 * So this measures the two things the report is about and nothing else: do they ARRIVE, and
 * how far around each other did they travel getting there. Angle is the discriminator — a
 * squad that shuffles for position racks up a fraction of a turn, a squad in orbit racks up
 * several, and "did they arrive" alone cannot tell a slow crossing from a spiral.
 *
 *   node tools/spiral.js [game.html]
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
  await p.goto('file://' + gamePath(process.argv[2]), { waitUntil: 'load' });
  await p.waitForTimeout(3000);
  /* pause in the same evaluate as the click — see the note in wanderers.js */
  await p.evaluate(() => { document.getElementById('btn-start').click(); paused = true; });
  await p.waitForTimeout(2500);

  const out = await p.evaluate(() => {
    const R = {};
    paused = true;
    const guard = (keys, fn) => {
      try { fn(); } catch (e) { for (const k of keys) if (R[k] === undefined) R[k] = '!! ' + String(e.message).slice(0, 80).toUpperCase(); }
    };

    /* ---------- open ground, and nobody else on it ----------
       Twenty seconds of simulation is long enough for a wanderer to walk into the measurement,
       and a body that joins in is the difference between "they orbited" and "something got in
       the way" — the same fault guns.js carries a note about. */
    const me = player()[0];
    let spot = null;
    for (let r = 30; r < 200 && !spot; r += 5) for (let a = 0; a < 16 && !spot; a++) {
      const x = Math.round(me.x + Math.cos(a / 16 * 6.283) * r), y = Math.round(me.y + Math.sin(a / 16 * 6.283) * r);
      if (x < 40 || y < 40 || x > W - 40 || y > H - 40) continue;
      let ok = true;
      for (let j = -14; j <= 14 && ok; j += 2) for (let i = -14; i <= 14 && ok; i += 2)
        if (isBlocked(x + i + 0.5, y + j + 0.5, 0) || terr[(y + j) * W + (x + i)] === 3) ok = false;
      if (ok) spot = { x, y };
    }
    if (!spot) { R.ground = '!! NO OPEN GROUND'; return R; }
    let cleared = 0;
    for (let i = chars.length - 1; i >= 0; i--) {
      const c = chars[i];
      if (c.faction === 'player') continue;
      if (dist(c.x, c.y, spot.x, spot.y) < 60) { chars.splice(i, 1); cleared++; }
    }
    R.ground = `open ground at ${spot.x},${spot.y}; ${cleared} bodies moved off it`;

    /* ---------- a squad, shoulder to shoulder, told to cross a field ----------
       Shoulder to shoulder is the point: the slide only fires on bodies inside the separation
       radius, so a squad that starts spread out never reaches the code being measured. */
    const born = [];
    const mk = (x, y) => {
      const c = makeChar('Walker', 'player', x, y, { atk: 10, def: 10, tough: 12, ath: 8, race: 'human', sub: 'dustborn' });
      c.state = 'ok'; c.__probe = true; chars.push(c); born.push(c); return c;
    };
    const squad = [];
    for (let i = 0; i < 4; i++) squad.push(mk(spot.x + (i % 2) * 0.45, spot.y + Math.floor(i / 2) * 0.45));

    const goal = { x: spot.x + 26, y: spot.y };
    for (const c of squad) { clearOrders(c); c.moveTarget = { x: goal.x, y: goal.y }; }

    /* how far each body travelled AROUND the group's centre, in turns. A shuffle for position
       is a fraction of one; an orbit is several and keeps climbing. */
    const ang = squad.map(() => 0);
    let prev = squad.map(c => {
      const cx = squad.reduce((s, o) => s + o.x, 0) / squad.length, cy = squad.reduce((s, o) => s + o.y, 0) / squad.length;
      return Math.atan2(c.y - cy, c.x - cx);
    });
    const DT = 1 / 30;
    let steps = 0;
    for (; steps < 30 * 40; steps++) {
      update(DT);
      const cx = squad.reduce((s, o) => s + o.x, 0) / squad.length, cy = squad.reduce((s, o) => s + o.y, 0) / squad.length;
      squad.forEach((c, i) => {
        const a2 = Math.atan2(c.y - cy, c.x - cx);
        let d = a2 - prev[i];
        while (d > Math.PI) d -= 2 * Math.PI;
        while (d < -Math.PI) d += 2 * Math.PI;
        ang[i] += Math.abs(d); prev[i] = a2;
      });
      if (squad.every(c => dist(c.x, c.y, goal.x, goal.y) < 3.5)) break;
    }
    const secs = (steps * DT).toFixed(1);
    const arrived = squad.filter(c => dist(c.x, c.y, goal.x, goal.y) < 3.5).length;
    const turns = ang.map(a2 => a2 / (2 * Math.PI));
    const worst = Math.max(...turns);
    R._walk = `${arrived}/${squad.length} arrived in ${secs}s; worst body went ${worst.toFixed(2)} turns around the group`;
    R.theyArrive = arrived === squad.length
      ? `all ${squad.length} cross twenty-six tiles of open ground in ${secs}s`
      : `!! ONLY ${arrived}/${squad.length} ARRIVED IN ${secs}s`;
    /* THE ASSERTION THAT NAMES THE BUG. Arrival alone cannot tell a slow crossing from a
       spiral, and the spiral is what was reported. */
    R.andTheyDoNotOrbit = worst < 0.75
      ? `and the worst of them turned ${worst.toFixed(2)} of a circle round the others doing it — they walked, they did not orbit`
      : `!! A BODY WENT ${worst.toFixed(2)} TURNS AROUND THE GROUP — THEY ARE ORBITING, NOT WALKING`;
    /* kept as a second opinion on the open-field case, where every body stays well off the
       group's centre and the angle is meaningful */

    /* ---------- AND THE TWO SHAPES THAT ACTUALLY MAKE A COUPLE ----------
       Crossing a field in loose order barely touches the sidestep. The cases that do are the
       ones a player creates constantly: everybody sent to the SAME tile, and two bodies whose
       goals point through each other.
       MEASURED AS PATH AGAINST PROGRESS, not as angle. A first version accumulated each body's
       angle about the group's centroid and reported a settled heap as 4.56 "turns" — because a
       body sitting a tenth of a tile from the centre swings through large angles on sub-tile
       jitter, so the metric exploded exactly where the bodies were most still. Path over net
       displacement has no such singularity: a straight walk is about 1, a body going round in
       circles climbs without bound, and a body standing still contributes nothing to either. */
    const runCase = (label, place, aim, secsCap) => {
      for (const c of born) { const i = chars.indexOf(c); if (i >= 0) chars.splice(i, 1); }
      born.length = 0;
      const grp = place();
      aim(grp);
      const from = grp.map(c => ({ x: c.x, y: c.y }));
      const path = grp.map(() => 0);
      let last = grp.map(c => ({ x: c.x, y: c.y }));
      let st = 0;
      for (; st < 30 * secsCap; st++) {
        update(DT);
        grp.forEach((c, i) => { path[i] += dist(c.x, c.y, last[i].x, last[i].y); last[i] = { x: c.x, y: c.y }; });
      }
      const ratio = grp.map((c, i) => path[i] / Math.max(0.6, dist(c.x, c.y, from[i].x, from[i].y)));
      return { label, wander: Math.max(...ratio), still: grp.filter(c => c.moveTarget).length, n: grp.length,
               walked: Math.max(...path).toFixed(0) };
    };

    const pileUp = runCase('one tile',
      () => { const g2 = []; for (let i = 0; i < 5; i++) g2.push(mk(spot.x + (i % 3) * 0.5, spot.y + Math.floor(i / 3) * 0.5)); return g2; },
      (g2) => { for (const c of g2) { clearOrders(c); c.moveTarget = { x: spot.x + 12, y: spot.y + 12 }; } }, 25);

    const swap = runCase('swapping places',
      () => [mk(spot.x, spot.y), mk(spot.x + 0.5, spot.y + 0.5)],
      (g2) => {
        clearOrders(g2[0]); clearOrders(g2[1]);
        g2[0].moveTarget = { x: g2[1].x + 0.2, y: g2[1].y + 0.2 };
        g2[1].moveTarget = { x: g2[0].x - 0.2, y: g2[0].y - 0.2 };
      }, 25);

    /* ---------- AND THE ONE THAT KEEPS THEM PRESSED TOGETHER ----------
       The two cases above resolve in a second or two, and a couple needs bodies to STAY inside
       the separation radius to wind up. Allies converging on the same enemy do exactly that,
       indefinitely — which is the shape the report describes, and the one where a fixed
       perpendicular counter-rotates two bodies for as long as the fight lasts. The quarry is
       unkillable and unmoving so the measurement is of the approach and nothing else. */
    const chase = runCase('three onto one enemy',
      () => {
        const foe = makeChar('Quarry', 'bandit', spot.x + 10, spot.y, { atk: 1, def: 40, tough: 60, ath: 0, race: 'human', sub: 'dustborn' });
        foe.state = 'ok'; foe.blood = foe.maxBlood = 1e6; foe.noFight = true; foe.__probe = true;
        for (const k of PARTS) foe.parts[k].max = foe.parts[k].hp = 1e5;
        chars.push(foe); born.push(foe);
        const g2 = [];
        for (let i = 0; i < 3; i++) g2.push(mk(spot.x + i * 0.4, spot.y + i * 0.4));
        for (const c of g2) { clearOrders(c); c.target = foe; c.targetManual = true; c.weapon = null; }
        return g2;
      }, () => {}, 25);

    R._chase = `three onto one: worst walked ${chase.walked} for a wander of ${chase.wander.toFixed(1)}`;
    R.andAChaseDoesNotSpin = chase.wander < 6
      ? `and three closing on one enemy walk ${chase.wander.toFixed(1)}x the ground they cover — they crowd it, they do not circle it`
      : `!! THREE ONTO ONE WANDER ${chase.wander.toFixed(1)}x — they are orbiting each other instead of closing`;

    R._pressed = `one tile: walked ${pileUp.walked} for a wander of ${pileUp.wander.toFixed(1)}, ${pileUp.still}/${pileUp.n} still under orders · ` +
                 `swap: wander ${swap.wander.toFixed(1)}, ${swap.still}/${swap.n} still ordered`;
    const wors = Math.max(pileUp.wander, swap.wander);
    R.andACrowdSettles = (wors < 4 && pileUp.still === 0 && swap.still === 0)
      ? `and a crowd sent to one tile settles — worst body walked ${wors.toFixed(1)}x the distance it actually covered, and every order finished`
      : `!! WANDER ${wors.toFixed(1)}x, ORDERS LEFT OPEN ${pileUp.still + swap.still} — they are circling, not arriving`;

    for (const c of born) { const i = chars.indexOf(c); if (i >= 0) chars.splice(i, 1); }
    return R;
  });

  const bad = Object.values(out).filter(v => typeof v === 'string' && v.startsWith('!!'));
  for (const [k, v] of Object.entries(out)) console.log('  ' + k.padEnd(24) + v);
  for (const e of errs) console.log('  ' + e);
  console.log('');
  console.log(bad.length || errs.length ? `THEY ARE STILL GOING ROUND IN CIRCLES (${bad.length + errs.length})`
                                        : 'THEY WALK THERE AND THEY ARRIVE');
  await b.close();
  process.exit(bad.length || errs.length ? 1 : 0);
})();
