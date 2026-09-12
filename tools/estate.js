#!/usr/bin/env node
/* GREENREST: A PRIVATE YARD THAT IS PRIVATE, AND A TOWN YOU CAN SHOP IN.
 *
 *   "a lot of the population spawn inside the supposedly exclusive and gated mansion."
 *   "Dame Hessa Aldercott spawns into the world dead as a corpse."
 *   "literally anyone can walk right in to the mansion."
 *   "some of the buildings are overlapping... There is no way to shop at it since another
 *    building is completely overtaking it."
 *
 * Four reports and four separate causes, none of which was where it looked:
 *
 *  · THE POPULATION. Townsfolk scattered within five tiles of the TOWN CENTRE, and at Greenrest
 *    the town centre IS the yard — half-extents seven by six, so a five-tile scatter is inside
 *    the walls by construction. 26 to 36 strangers in every world. Ironscar has the same
 *    reservation and was seeding its people inside the fighting pit.
 *  · THE DAME. Not dead at worldgen in any world tested — she is seeded at SEVENTY-FOUR against
 *    a human `deathAge` of SIXTY-TWO, and the nightly rule is `(age - deathAge) * 0.004`. That
 *    is 4.8% a day, 77% by day thirty, 95% by day sixty. She was the only named body in the
 *    world standing past its death age, and the exemption list had no entry for a quest-giver
 *    who is neither a boss nor a leader.
 *  · THE GATE was a HOLE — the wall loop skipped the tile and nothing was written in its place.
 *  · THE BUILDINGS. The CENTREPIECE reservation pushes every building out of the plaza and never
 *    checks where it lands. Hand-authored plan, deterministic shove: the same 9 collisions of 24
 *    buildings in every world ever generated.
 *
 * Anything starting '!!' fails the build.
 *
 *   node tools/estate.js [game.html]
 */
const { chromium } = require('playwright');
const path = require('path');
const gamePath = (a) => path.resolve(a ? (path.isAbsolute(a) ? a : path.join(__dirname, a)) : path.join(__dirname, 'game.html'));

(async () => {
  const b = await chromium.launch({
    executablePath: process.env.DUSTWARD_CHROME || undefined,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'],
  });
  const p = await b.newPage({ viewport: { width: 900, height: 650 } });
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message.slice(0, 240)));
  await p.goto('file://' + gamePath(process.argv[2]), { waitUntil: 'load' });
  await p.waitForTimeout(3000);
  await p.evaluate(() => document.getElementById('btn-start').click());
  await p.waitForTimeout(3500);
  const R = {};
  const NO = '!! NOTHING TO MEASURE — no Aldercott estate in this build';

  const st = await p.evaluate(() => {
    if (typeof estate === 'undefined' || !estate) return null;
    const inYard = (c) => Math.abs(c.x - estate.x) <= estate.hw && Math.abs(c.y - estate.y) <= estate.hh;
    const house = (c) => c.orchardKin || c.orchardDame || c.orchardServant;
    for (let i = 0; i < 900; i++) update(1 / 30);       /* let the town walk about */
    const occ = chars.filter(c => c.state !== 'dead' && inYard(c));
    /* the gate, and whether a stranger can get through it */
    const g = estate.gate[0];
    const outside = { x: estate.x, y: estate.y + estate.hh + 5 };
    let yardTile = null;
    const hb = estate.house;
    for (let j = -estate.hh + 1; j <= estate.hh - 1 && !yardTile; j++)
      for (let i = -estate.hw + 1; i <= estate.hw - 1 && !yardTile; i++) {
        const qx = estate.x + i, qy = estate.y + j;
        if (hb && qx >= hb.x && qx < hb.x + hb.w && qy >= hb.y && qy < hb.y + hb.h) continue;
        if (!isBlocked(qx + 0.5, qy + 0.5, 0)) yardTile = { x: qx, y: qy };
      }
    const t = towns.find(t2 => t2.def.key === 'greenrest');
    const bs = buildings.filter(b2 => b2.town === t);
    const pairs = [];
    for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) {
      const a = bs[i], c = bs[j];
      if (a.x < c.x + c.w && c.x < a.x + a.w && a.y < c.y + c.h && c.y < a.y + a.h)
        pairs.push((a.label || '?') + '×' + (c.label || '?'));
    }
    /* and every other town, because the shove is not Greenrest's alone */
    let allPairs = 0, allB = 0;
    for (const t2 of towns) {
      const bb = buildings.filter(x => x.town === t2); allB += bb.length;
      for (let i = 0; i < bb.length; i++) for (let j = i + 1; j < bb.length; j++) {
        const a = bb[i], c = bb[j];
        if (a.x < c.x + c.w && c.x < a.x + a.w && a.y < c.y + c.h && c.y < a.y + a.h) allPairs++;
      }
    }
    const d = estate.dame;
    return {
      inYard: occ.length, strangers: occ.filter(c => !house(c)).length,
      who: occ.map(c => c.name).slice(0, 8),
      gateBlocked: isBlocked(g.x + 0.5, g.y + 0.5, 0),
      pathIn: yardTile ? !!findPath(outside.x, outside.y, yardTile.x, yardTile.y, 0) : null,
      admitted: !!estate.doorOpen,
      dame: d ? { state: d.state, storied: !!d.storied, age: Math.round(d.age),
                  dAge: traitOf(d, 'deathAge', 62),
                  perDay: +Math.max(0, ((d.age || 0) - traitOf(d, 'deathAge', 62)) * 0.004).toFixed(3) } : null,
      servantStoried: estate.servant ? !!estate.servant.storied : null,
      greenrestPairs: pairs, greenrestBuilds: bs.length, allPairs, allB,
    };
  });

  R.nobodyLivesInTheYardButTheAldercotts = !st ? NO
    : (st.strangers === 0 && st.inYard >= 2)
    ? `after thirty seconds of the town going about its business the walled yard holds ${st.inYard} people and every one of them is an Aldercott — ${st.who.join(', ')} (it was 26 to 36 strangers)`
    : `!! ${st.strangers} STRANGERS ARE STANDING IN THE PRIVATE YARD (${JSON.stringify(st.who)})`;

  R.andTheGateIsActuallyShut = !st ? NO
    : (st.gateBlocked && st.pathIn === false && !st.admitted)
    ? `the gate is a shut gate rather than a gap in a wall — the tile is blocked and A* cannot find a way from the high street into the yard`
    : `!! ANYBODY CAN STILL WALK IN (blocked ${st.gateBlocked}, path ${st.pathIn}, admitted ${st.admitted})`;

  R.andTheDameOutlivesHerOwnQuestline = !st ? NO
    : !st.dame ? '!! THERE IS NO DAME'
    : (st.dame.state === 'ok' && st.dame.storied && st.servantStoried)
    ? `Dame Hessa is ${st.dame.age} against a death age of ${st.dame.dAge} — ${(st.dame.perDay * 100).toFixed(1)}% a night, which took her 77% of the time by day thirty — and she and Bellowes are now off the calendar the way bosses and town leaders already were`
    : `!! THE QUEST-GIVER IS STILL ON THE NIGHTLY DEATH ROLL (${JSON.stringify(st.dame)}, servant ${st.servantStoried})`;

  R.andNoShopHasAHouseOnTopOfIt = !st ? NO
    : (st.greenrestPairs.length === 0 && st.allPairs === 0)
    ? `no building in any town overlaps another — 0 pairs across ${st.allB} buildings, ${st.greenrestBuilds} of them at Greenrest, where there were 9`
    : `!! ${st.allPairs} OVERLAPPING PAIRS (greenrest: ${JSON.stringify(st.greenrestPairs)})`;

  await b.close();
  console.log('=== THE ALDERCOTT YARD ===\n');
  for (const [k, v] of Object.entries(R)) console.log('  ' + k.padEnd(38) + v);
  const bad = Object.values(R).map(String).filter(v => v.startsWith('!!'));
  console.log('\n' + (bad.length ? '*** ' + bad.join('\n*** ') : 'THE GATE IS KEPT, AND THE TOWN HAS ROOM FOR ITS OWN SHOPS'));
  if (errs.length) { console.log('errs:', errs.length); errs.slice(0, 4).forEach(e => console.log('  ' + e)); }
  if (bad.length) process.exitCode = 1;
})();
