#!/usr/bin/env node
/* WHY A FORAGE ORDER CLOSES OUT WITH CHESTS STILL SHUT.
   Replicates command.js's forage staging and watches the order's own state each tick:
   what `forageFind` picks, what `m.took` is against `haulCap`, and what phase it ends in. */
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const file = process.argv[2] || 'game.html';
  const b = await chromium.launch({ args: ['--use-gl=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox','--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 900, height: 650 } });
  const errs = []; p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message.slice(0,200)));
  await p.goto('file://' + path.join(__dirname, file), { waitUntil: 'load' });
  await p.waitForTimeout(3000);
  /* THE HARNESS'S OWN SETUP, VERBATIM — and the two parts of it that matter to this question
     are that the world is PAUSED and that it is stepped at dt = 0.25, not 1/30. A quarter of a
     second is four to eight times the step size the movement code sees in play, which is
     exactly the regime `stepToward`'s bounded stepping was added for. */
  await p.evaluate(() => { document.getElementById('btn-start').click(); paused = true; });
  await p.waitForTimeout(2500);
  const WITH_PATROL = process.argv[3] !== 'nopatrol';
  const r = await p.evaluate((process_patrol) => {
    const step = (secs, dt = 0.25) => { for(let i = 0; i < secs/dt; i++) update(dt); };
    const openNear = (x, y, r) => findOpenNear(x, y, r);
    const HOME = { x: player()[0].x, y: player()[0].y };
    const mk5 = (at) => {
      const made = [];
      for(let i = 0; i < 5; i++){
        const q = openNear(at.x + (i - 2), at.y, 3);
        const c = makeChar('Band ' + i, 'player', q.x, q.y,
          { atk: 16, def: 14, tough: 14, ath: 7, weapon: 'w_kat', armor: 'a_lea' });
        chars.push(c); made.push(c);
      }
      made[0].name = 'Captain';
      return made;
    };
    /* ---------- AND THE PATROL BLOCK RUNS FIRST, BECAUSE IT DOES IN THE HARNESS ----------
       The forage block in isolation opens both chests on EVERY build, passing and failing
       alike. What is different in `command.js` is that block 1 runs ahead of it: a band is
       raised, given a patrol, stepped forty times at six seconds a step, and disbanded — four
       minutes of game time and a second band's worth of state, before the forage band exists.
       So the patrol block is replicated here verbatim. If the difference between the builds
       only shows with it, the failure is in what block 1 leaves behind and not in foraging. */
    if(process_patrol){
      const pat = openNear(HOME.x + 26, HOME.y + 26, 8);
      const pband = mk5(pat);
      const pcdr = pband[0];
      giveCommand(pcdr, pband, 'patrol', { x: pcdr.x, y: pcdr.y }, 30);
      pband[1].job = null; pband[2].job = null;
      pband[3].wasJob = ['wood', 'stone'];
      standDown(pcdr, true);
      giveCommand(pcdr, pband, 'patrol', { x: pcdr.x, y: pcdr.y }, 30);
      for(let i = 0; i < 40; i++) step(6);
      pband.forEach(o => { standDown(o, true); o.under = null; const i = chars.indexOf(o); if(i >= 0) chars.splice(i, 1); });
    }
    const at = openNear(HOME.x - 30, HOME.y + 18, 8);
    const band = mk5(at);
    const cdr = band[0];
    const cp = (dx, dy) => { const q = openNear(at.x+dx, at.y+dy, 4); return { x: q.x, y: q.y, opened: false, loot: { cats: 100, items: {} } }; };
    const c1 = cp(9,5), c2 = cp(-7,-9), far = cp(90,0);
    chests.push(c1, c2, far);
    /* IS THE GROUND THE HARNESS CHOSE ACTUALLY REACHABLE? `findOpenNear` finds an OPEN tile,
       which is not the same as a tile the band can walk to — an open tile inside a sealed
       pocket is open and unreachable, and A* says so. */
    const reach = (ch) => !!findPath(cdr.x, cdr.y, ch.x, ch.y, 0);
    const reachable = { c1: reach(c1), c2: reach(c2), far: reach(far) };
    const R = 22;
    const corpsesInRange = corpses.filter(o => !o.looted && (o.floor||0)===0 && dist(o.x,o.y,cdr.x,cdr.y) < R).length;
    giveCommand(cdr, band, 'forage', { x: cdr.x, y: cdr.y }, R);
    const cap = haulCap(cdr);
    const trace = [];
    let sweeps = 0, closedAt = -1, minD1 = 1e9, minD2 = 1e9, sawChestTgt = 0, stuckDump = null;
    for(; sweeps < 240 && !(c1.opened && c2.opened); sweeps++){
      step(6);
      const m = cdr.cmd;
      minD1 = Math.min(minD1, ...band.map(u=>dist(u.x,u.y,c1.x,c1.y)));
      minD2 = Math.min(minD2, ...band.map(u=>dist(u.x,u.y,c2.x,c2.y)));
      if(cdr.chestTarget) sawChestTgt++;
      if(!m){ closedAt = sweeps; break; }
      /* ---------- AND WHEN IT FREEZES, ASK THE BODY WHY ----------
         A captain that holds a `chestTarget` two and a half tiles away without moving a
         hundredth of a tile for twenty sweeps is not confused about where the chest is. */
      if(sweeps === 20 && !stuckDump && cdr.chestTarget){
        const t = cdr.chestTarget;
        stuckDump = {
          state: cdr.state, blood: Math.round(cdr.blood), maxBlood: cdr.maxBlood,
          speed: +moveSpeed(cdr).toFixed(3), d: +dist(cdr.x,cdr.y,t.x,t.y).toFixed(2),
          pathLen: cdr.path ? cdr.path.length : null,
          pathGoal: cdr.pathGoal ? [+cdr.pathGoal.x.toFixed(1), +cdr.pathGoal.y.toFixed(1)] : null,
          pathFail: !!cdr.pathFail, detour: !!cdr.detour,
          stuckN: cdr.stuckN, stuckD: cdr.stuckD === undefined ? null : +cdr.stuckD.toFixed(2),
          onBlocked: isBlocked(cdr.x, cdr.y, cdr.floor||0),
          chestBlocked: isBlocked(t.x, t.y, cdr.floor||0),
          pinBy: !!cdr._pinBy, pinK: cdr._pinK, staggerT: cdr.staggerT, riting: !!cdr.riting,
          jailed: !!cdr.jailedAt, target: !!cdr.target, windup: !!cdr.windup,
          carry: !!cdr.carry, gnaw: !!cdr.gnaw, drag: !!cdr.drag,
          contacts: cdr._contacts, holders: cdr._holders,
          hunger: cdr.hunger, thirst: cdr.thirst,
          /* and what one call to the movement primitive actually does */
          moved: (() => { const x0 = cdr.x, y0 = cdr.y;
                          const rv = stepToward(cdr, t.x, t.y, 0.25);
                          const dd = +dist(x0,y0,cdr.x,cdr.y).toFixed(4);
                          cdr.x = x0; cdr.y = y0; return { rv, dd }; })(),
          blockedAround: [[0.9,0],[-0.9,0],[0,0.9],[0,-0.9]].map(([dx,dy]) =>
            isBlocked3(cdr, cdr.x+dx, cdr.y+dy)),
          /* THE PRIMITIVE'S OWN ARITHMETIC, RECOMPUTED BY HAND */
          inside: (() => {
            const sp = moveSpeed(cdr) * 0.25;
            const dd = dist(cdr.x, cdr.y, t.x, t.y);
            const left = Math.min(sp, dd);
            const MAX = 0.85, seg = Math.min(left, MAX);
            const ux = t.x - cdr.x, uy = t.y - cdr.y, ud = Math.hypot(ux, uy);
            const nx = cdr.x + ux/ud*seg, ny = cdr.y + uy/ud*seg;
            return { sp, dd, left, seg, ud, nx: +nx.toFixed(2), ny: +ny.toFixed(2),
                     loopRuns: left > 1e-4,
                     bothAxes: isBlocked3(cdr, nx, ny),
                     xOnly: isBlocked3(cdr, nx, cdr.y),
                     yOnly: isBlocked3(cdr, cdr.x, ny),
                     cx: +cdr.x.toFixed(2), cy: +cdr.y.toFixed(2),
                     tx: +t.x.toFixed(2), ty: +t.y.toFixed(2) };
          })(),
        };
      }
      if(sweeps < 8 || sweeps % 20 === 0)
        trace.push({ s: sweeps, ph: m.phase, took: m.took,
                     tgt: cdr.chestTarget ? 'CHEST' : (cdr.lootTarget ? 'corpse' : (cdr.attackMove ? 'moving' : '-')),
                     d1: +dist(cdr.x,cdr.y,c1.x,c1.y).toFixed(1), d2: +dist(cdr.x,cdr.y,c2.x,c2.y).toFixed(1) });
    }
    const out = { reachable, corpsesInRange, cap, sweeps, closedAt,
                  c1: c1.opened, c2: c2.opened, far: far.opened,
                  endPhase: cdr.cmd ? cdr.cmd.phase : 'CLOSED OUT',
                  endTook: cdr.cmd ? cdr.cmd.took : null,
                  sawChestTgt,
                  closest1: +minD1.toFixed(2), closest2: +minD2.toFixed(2), stuckDump,
                  trace };
    [c1,c2,far].forEach(ch => chests.splice(chests.indexOf(ch),1));
    for(const u of band){ standDown(u, true); const i = chars.indexOf(u); if(i>=0) chars.splice(i,1); }
    return out;
  }, WITH_PATROL);
  for(const e of errs) console.log(e);
  console.log(JSON.stringify(r, null, 1));
  await b.close();
})();
