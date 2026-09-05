#!/usr/bin/env node
/* COPPERHOLD, AND THE HOLE IT IS BUILT ROUND.
 *
 * "Copperhold with a central mine, and mountainous terrain. May require moving towns —
 *  Fallowend is close."
 *
 * Two facts about the old world made this impossible rather than merely absent. Every massif in
 * the game is FOUND — the biggest regions of rock the noise happened to make — and the loop that
 * finds them refuses any within `r*1.4 + 20` of a town, for the good reason that a range's cliffs
 * would wall people into their own homes. So no town could ever have mountains. And `rawDecorAt`
 * clears everything wild inside a town's `clearR`, which is right for trees in the road and fatal
 * for a working the town exists because of — the note in `seedOre` records both mining towns'
 * ore being deleted by exactly that sweep once already.
 *
 * So:
 *   1. Copperhold is placed FIRST, with a 130-tile exclusion instead of 95, and everybody else
 *      is placed exactly as before in the same order — `towns[i]` must still line up with
 *      `TOWNS[i]`, because town index is what `rebelOf`, `isLeader` and a warband's target are
 *      stored as in the save
 *   2. four massifs are placed by hand at fifty tiles, and there are PASSES between them,
 *      because a seat you cannot walk out of is a prison rather than a valley
 *   3. the pit is dug AFTER the lift, in terraces you can walk down
 *   4. the street sweep exempts it, and the face in it is far richer than any hillside
 *   5. and the bottom of it is the only way into the undercroft you can reach from a street
 *
 * Anything starting '!!' fails the build.
 *
 *   node tools/pit2.js [game.html]
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
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message.slice(0, 240)));
  await p.goto('file://' + gamePath(process.argv[2]), { waitUntil: 'load' });
  await p.waitForTimeout(3000);
  await p.evaluate(() => { document.getElementById('btn-start').click(); paused = true; });
  await p.waitForTimeout(2500);

  const out = await p.evaluate(() => {
    const R = {};
    const t = towns.find(t2 => t2.def.key === 'copperhold');
    const P = (typeof copperPit !== 'undefined') ? copperPit : null;
    R.thePit = P ? `a ${P.r*2+1}-tile working at the heart of ${t.name}` : '!! COPPERHOLD HAS NO PIT';

    /* ---- 1. THE ORDER OF `towns` IS LOAD-BEARING, AND MUST NOT HAVE MOVED ---- */
    R.orderHolds = towns.every((tt, i) => tt.def.key === TOWNS[i].key)
      ? 'and `towns[i]` still lines up with `TOWNS[i]` — town index is what the save stores'
      : '!! THE TOWN ORDER CHANGED, WHICH BREAKS EVERY SAVED TOWN INDEX';
    const others = towns.filter(o => o !== t);
    const near = Math.min(...others.map(o => dist(o.x, o.y, t.x, t.y)));
    R.roomToBreathe = near >= 130
      ? `nearest neighbour ${Math.round(near)} tiles off (the others keep the usual 95)`
      : `!! COPPERHOLD'S NEAREST NEIGHBOUR IS ${Math.round(near)} TILES AWAY`;
    const pairs = [];
    for(let i = 0; i < others.length; i++) for(let j = i+1; j < others.length; j++)
      pairs.push(dist(others[i].x, others[i].y, others[j].x, others[j].y));
    R.othersUnchanged = Math.min(...pairs) >= 95
      ? `and no two other seats are closer than ${Math.round(Math.min(...pairs))}`
      : `!! TWO SEATS ARE ${Math.round(Math.min(...pairs))} APART`;
    if(!P) return R;

    /* ---- 2. THE BOWL, AND THE WAY OUT OF IT ---- */
    const ring = mountains.filter(m => m.cirque);
    R.theBowl = ring.length >= 3
      ? `${ring.length} massifs standing round it at ${Math.round(dist(ring[0].x, ring[0].y, t.x, t.y))} tiles`
      : `!! ONLY ${ring.length} MASSIFS AROUND COPPERHOLD`;
    /* AND THEY ARE NOT ON ANYBODY. The whole reason for the 130-tile exclusion. */
    R.notOnNeighbours = ring.every(m => others.every(o => dist(o.x, o.y, m.x, m.y) > 30))
      ? 'and not one of them is standing on a neighbour'
      : '!! A MASSIF WAS RAISED ON TOP OF ANOTHER TOWN';
    /* THE PASSES. Walk the circle at the massifs' own radius and count how much of it is open —
       a bowl with no way out is a prison, and this is the only claim that can tell them apart. */
    let open = 0, tot = 0;
    for(let a = 0; a < Math.PI * 2; a += Math.PI / 90){
      const x = Math.round(t.x + Math.cos(a) * 50), y = Math.round(t.y + Math.sin(a) * 50);
      if(x < 2 || y < 2 || x >= W-2 || y >= H-2) continue;
      tot++;
      if(!isBlocked(x + 0.5, y + 0.5, 0)) open++;
    }
    /* ---------- A BAND, NOT A FLOOR ----------
       Asserting only "there are passes" would pass on a ring that blocks nothing at all, which
       is the other way this ships wrong: mountains you can see and walk straight through are
       scenery. So the circle at the massifs' radius has to be MOSTLY open and NOT ENTIRELY. */
    const openPc = tot ? open / tot : 1;
    R.thereArePasses = openPc > 0.25 && openPc < 0.985
      ? `${Math.round(openPc * 100)}% of the circle at that radius is walkable — rock you go round, not a wall you cannot`
      : openPc <= 0.25
        ? `!! THE RING IS ${Math.round(100 - openPc * 100)}% SEALED — THAT IS A PRISON`
        : '!! THE RING BLOCKS NOTHING AT ALL — THOSE ARE NOT MOUNTAINS, THEY ARE SCENERY';

    /* ---- 3. THE HOLE IS A HOLE, AND YOU CAN WALK INTO IT ---- */
    const rim = groundY(P.x + P.r + 1.5, P.y), floor = groundY(P.x, P.y);
    R.itIsAHole = rim - floor > 2.5
      ? `the floor sits ${(rim - floor).toFixed(1)} units below the rim`
      : `!! THE "PIT" IS ${(rim - floor).toFixed(1)} UNITS DEEP`;
    /* TERRACED, NOT SHEER. The biggest single step from rim to floor along a straight line in. */
    let worst = 0;
    for(let d = P.r + 1; d > 0; d--)
      worst = Math.max(worst, Math.abs(groundY(P.x + d, P.y) - groundY(P.x + d - 1, P.y)));
    R.walkableIn = worst < 1.8
      ? `and the worst single step down into it is ${worst.toFixed(2)} — a body is 1.8 tall, so you walk in`
      : `!! THERE IS A ${worst.toFixed(2)}-UNIT STEP INTO THE PIT. THAT IS A CLIFF.`;
    let sealed = 0;
    for(let y = P.y - P.r; y <= P.y + P.r; y++) for(let x = P.x - P.r; x <= P.x + P.r; x++)
      if(isBlocked(x + 0.5, y + 0.5, 0)) sealed++;
    R.notSealed = sealed === 0
      ? 'and the cliff rule does not seal a single tile of it'
      : `!! ${sealed} TILES OF THE WORKING WERE WALLED OFF AS CLIFF`;

    /* ---- 4. THE FACE IS EXEMPT FROM THE SWEEP, AND RICH ---- */
    let face = 0, cells = 0;
    for(let y = P.y - P.r; y <= P.y + P.r; y++) for(let x = P.x - P.r; x <= P.x + P.r; x++){
      cells++;
      if(rawDecorAt(x, y) === 'cvein') face++;
    }
    R.theFace = face > 0
      ? `${face} outcropping tiles of copper in ${cells} of pit — the street sweep does not touch it`
      : '!! THE SWEEP DELETED THE WORKING, WHICH IS THE MISTAKE `seedOre` ALREADY HAS A NOTE ABOUT';
    /* AND THE STREETS AROUND IT ARE STILL SWEPT — the exemption must be the pit and not the town */
    let street = 0;
    for(let y = t.y - 12; y <= t.y + 12; y++) for(let x = t.x - 12; x <= t.x + 12; x++){
      if(Math.abs(P.x - x) <= P.r && Math.abs(P.y - y) <= P.r) continue;
      if(rawDecorAt(x, y)) street++;
    }
    R.streetsStillSwept = street === 0
      ? 'while the streets around it are as clear as any other town\'s'
      : `!! ${street} WILD THINGS ARE GROWING IN COPPERHOLD'S STREETS`;

    /* ---- 5. AND THE BOTTOM OF IT GOES SOMEWHERE ---- */
    const sh = stairs.find(s2 => s2.to === UNDER && dist(s2.x, s2.y, t.x, t.y) < (t.clearR || 20));
    R.aWayDown = sh
      ? `a shaft ${Math.round(dist(sh.x, sh.y, t.x, t.y))} tiles from the square${P.shaft && P.shaft.inPit ? ', in the working itself' : ''} — a descent you reach without leaving a street`
      : '!! NO WAY DOWN ANYWHERE INSIDE COPPERHOLD';
    R.andItLands = !sh || decks.has(bkey(sh.x, sh.y, UNDER))
      ? 'and there is floor at the bottom of it'
      : '!! THE PIT SHAFT DROPS INTO SOLID ROCK';
    return R;
  });

  console.log('=== COPPERHOLD ===\n');
  for (const [k, v] of Object.entries(out)) console.log('  ' + k.padEnd(18) + v);
  const bad = Object.values(out).map(String).filter(v => v.startsWith('!!'));
  console.log('\n' + (bad.length ? '*** ' + bad.join('\n*** ') : 'MINE MONEY BUILT THESE WALLS'));
  if (errs.length) { console.log('errs:', errs.length); errs.slice(0, 4).forEach(e => console.log('  ' + e)); }
  await b.close();
  if (bad.length) process.exitCode = 1;
})();
