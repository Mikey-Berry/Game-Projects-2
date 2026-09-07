#!/usr/bin/env node
/* TWO TOWNS BUILT AROUND THE THING THEY ARE ABOUT.
 *
 *   "Ironscar's arena looks complete, I guess? Honestly I would rather rebuild the WHOLE town to
 *    be bigger and have the arena INSIDE of it. Right now it looks like a taped-on addition.
 *    Also, there should be a guard/npc of some kind outside you can talk to and arrange a fight.
 *    (Only the person talking can fight in the arena.)"
 *
 *   "I hate that the estate is outside the town — rework the whole town so that it is centered
 *    around the estate. (Expand as needed.) And make it a multi-story building with an NPC
 *    guard/servant out front who doesn't let you into the building until you have met a certain
 *    reputation or requirement."
 *
 * Both were seeded by walking a ring OUTWARD from the wall until they found ground nobody was
 * using — which is how you place a thing that has nothing to do with the town it is next to.
 * They are the town's own centre now, the plan is pushed out around them, and the walls stand
 * back to hold both. What the control prints is the distances: the pit 44 tiles outside
 * Ironscar and the estate 55 outside Greenrest.
 *
 * Anything starting '!!' fails the build.
 *
 *   node tools/seats.js [game.html]
 */
const { chromium } = require('playwright');
const path = require('path');
const gamePath = (a) => path.resolve(a ? (path.isAbsolute(a) ? a : path.join(__dirname, a)) : path.join(__dirname, 'game.html'));

(async () => {
  const b = await chromium.launch({
    executablePath: process.env.DUSTWARD_CHROME || undefined,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'],
  });
  const p = await b.newPage({ viewport: { width: 1200, height: 820 } });
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message.slice(0, 240)));
  p.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text().slice(0, 240)); });
  await p.goto('file://' + gamePath(process.argv[2]), { waitUntil: 'load' });
  await p.waitForTimeout(3000);
  await p.evaluate(() => document.getElementById('btn-start').click());
  await p.waitForTimeout(3000);
  const R = {};

  /* ---- 1. BOTH ARE IN THE MIDDLE OF THEIR OWN TOWN ---- */
  const seat = await p.evaluate(() => {
    const iron = towns.find(t => t.def.key === 'ironscar');
    const green = towns.find(t => t.def.key === 'greenrest');
    const A = (typeof arena !== 'undefined') ? arena : null;
    const E = (typeof estate !== 'undefined') ? estate : null;
    /* which buildings, if any, are standing in the square the centrepiece needs */
    const inPlaza = (t, keep) => buildings.filter(bl => bl.town === t &&
      bl.x + bl.w - 1 >= t.x - keep && bl.x <= t.x + keep &&
      bl.y + bl.h - 1 >= t.y - keep && bl.y <= t.y + keep &&
      bl.label !== 'ALDERCOTT HOUSE').map(bl => bl.label);
    return {
      pit: A ? {d: +dist(A.x, A.y, iron.x, iron.y).toFixed(1), wall: iron.def.wall.r,
                inside: dist(A.x, A.y, iron.x, iron.y) + A.r < iron.def.wall.r} : null,
      house: E ? {d: +dist(E.x, E.y, green.x, green.y).toFixed(1), wall: green.def.wall.r,
                  inside: dist(E.x, E.y, green.x, green.y) + E.hw < green.def.wall.r} : null,
      ironPlaza: inPlaza(iron, 11), greenPlaza: inPlaza(green, 10),
      ironBuildings: buildings.filter(bl => bl.town === iron).length,
      greenBuildings: buildings.filter(bl => bl.town === green).length,
      /* the well must not be standing in the sand */
      ironWell: iron.wellX != null ? +dist(iron.wellX, iron.wellY, iron.x, iron.y).toFixed(1) : -1,
    };
  });
  R.thePitIsTheTown = seat.pit && seat.pit.d === 0 && seat.pit.inside
    ? `the pit is on Ironscar's own centre, inside a wall of ${seat.pit.wall}`
    : `!! THE PIT IS STILL OUTSIDE THE TOWN (${JSON.stringify(seat.pit)})`;
  R.theHouseIsTheTown = seat.house && seat.house.d === 0 && seat.house.inside
    ? `the Aldercott yard is on Greenrest's own centre, inside a wall of ${seat.house.wall}`
    : `!! THE ESTATE IS STILL OUTSIDE THE TOWN (${JSON.stringify(seat.house)})`;
  R.andTheStreetsMovedForThem = !seat.ironPlaza.length && !seat.greenPlaza.length
    ? `not one of ${seat.ironBuildings + seat.greenBuildings} buildings is standing in either plaza, and Ironscar's well is ${seat.ironWell} tiles off centre`
    : `!! SOMETHING IS BUILT ON THE PLAZA (${JSON.stringify(seat.ironPlaza)} / ${JSON.stringify(seat.greenPlaza)})`;

  /* ---- 2. THE HOUSE HAS AN UPSTAIRS, AND A DOOR THAT IS SHUT ----
     The floors are asserted as WALKABLE DECK and real stairs, not as a taller box: a renderer
     can draw three storeys over a building nobody can go up in. */
  const house = await p.evaluate(() => {
    /* THROUGH `typeof`, so a build with no upstairs and no door REPORTS rather than throwing —
       a control that dies on line one measures nothing about the seven other claims. */
    const E = (typeof estate !== 'undefined') ? estate : null;
    if (!E || !E.house || typeof estateAdmit !== 'function' || !E.doorTiles) return null;
    const h = E.house;
    const deckN = f => { let n = 0;
      for (let j = h.y; j < h.y + h.h; j++) for (let i = h.x; i < h.x + h.w; i++)
        if (decks.has(bkey(i, j, f)) && !blocked.has(bkey(i, j, f))) n++;
      return n; };
    /* CAN YOU GET IN? Flooded from the yard rather than asked of the dialogue — the whole
       report is about a door, and a door that only a conversation respects is not a door. */
    const inside = (x, y) => x > h.x && x < h.x + h.w - 1 && y > h.y && y < h.y + h.h - 1;
    const flood = () => {
      const seen = new Set(); const q = [[E.x, E.y + E.hh - 1]];
      for (let n = 0; q.length && n < 9000; n++) {
        const [x, y] = q.shift(), k = y * W + x;
        if (seen.has(k)) continue; seen.add(k);
        if (inside(x, y)) return true;
        for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
          const nx = x + dx, ny = y + dy;
          if (Math.abs(nx - E.x) > E.hw + 2 || Math.abs(ny - E.y) > E.hh + 2) continue;
          if (isBlocked(nx + 0.5, ny + 0.5, 0)) continue;
          q.push([nx, ny]);
        }
      }
      return false;
    };
    const shut = flood();
    const rep0 = E.town.rep;
    E.town.rep = ORCHARD_REP - 1;
    const refusesBelow = !estateAdmits();
    E.town.rep = ORCHARD_REP;
    const admitsAt = estateAdmits();
    E.town.rep = rep0;
    estateAdmit(null);
    const open = flood();
    return {floors: E.floors, f1: deckN(1), f2: deckN(2),
      stairs: stairs.filter(s2 => s2.x >= h.x && s2.x < h.x + h.w && s2.y >= h.y && s2.y < h.y + h.h)
                    .map(s2 => s2.from + '->' + s2.to).sort(),
      shut, open, refusesBelow, admitsAt, rep: ORCHARD_REP,
      servant: E.servant ? E.servant.name : null};
  });
  const NOTHING = '!! NOTHING TO MEASURE — this build has no upstairs and no kept door';
  R.threeStoreys = !house ? NOTHING : house.floors === 3 && house.f1 > 20 && house.f2 > 20
      && JSON.stringify(house.stairs) === JSON.stringify(['0->1', '1->2'])
    ? `three storeys of walkable deck (${house.f1} and ${house.f2} tiles up) with a real stair on each`
    : `!! THE HOUSE HAS NO UPSTAIRS (${JSON.stringify(house)})`;
  R.andTheDoorIsKept = !house ? NOTHING : !house.shut && house.open
    ? `${house.servant} keeps the door: sealed against a flood from the yard, and open once he stands aside`
    : `!! THE DOOR IS NOT A DOOR (reachable before ${house && house.shut}, after ${house && house.open})`;
  R.andItTakesStanding = !house ? NOTHING : house.refusesBelow && house.admitsAt
    ? `refused at ${house.rep - 1} reputation and admitted at ${house.rep}`
    : `!! THE REQUIREMENT DOES NOT BITE (${house && house.refusesBelow} / ${house && house.admitsAt})`;

  /* ---- 3. THE HOUSE IS STILL EATING ----
     Not "there are twenty bodies under the trees" — that is a fact about worldgen. The claim is
     that it is HAPPENING: the town's own roster goes down, the names are kept, and the rows fill. */
  const invites = await p.evaluate(() => {
    const E = (typeof estate !== 'undefined') ? estate : null;
    if (!E || typeof estateInviteTick !== 'function') return null;
    const t = E.town;
    const civs = () => chars.filter(c => c.civ && c.homeTown === t && c.state === 'ok').length;
    const pop0 = civs(), graves0 = E.graves.length;
    for (let d = 0; d < 60; d++) { day += 1; estateInviteTick(); }
    return {pop0, pop1: civs(), graves0, graves1: E.graves.length,
            taken: E.taken, names: E.invites.map(i => i.name)};
  });
  R.theInvitationsAreReal = !invites ? NOTHING : invites.taken >= 3
      && invites.pop1 === invites.pop0 - invites.taken
      && invites.graves1 === invites.graves0 + invites.taken
      && invites.names.length === invites.taken
    ? `sixty days took ${invites.taken} of Greenrest's own — ${invites.names.slice(0, 3).join(', ')} — ` +
      `population ${invites.pop0} to ${invites.pop1}, rows ${invites.graves0} to ${invites.graves1}`
    : `!! NOBODY IS GOING UP TO DINNER (${JSON.stringify(invites)})`;

  /* ---- 4. AND SAYING SO CHANGES ONE THING ONLY ----
     "though no one is powerful enough to truly oppose them" — so the expose branch must NOT
     finish them. What it buys is that the invitations stop while you are standing there. */
  const told = await p.evaluate(() => {
    const E = (typeof estate !== 'undefined') ? estate : null;
    if (!E) return null;
    if (typeof estateInviteTick !== 'function') return null;
    E.watched = true; E.pending = null; E.nextInvite = 1;
    for (const c of player()) { c.x = E.x + 4; c.y = E.y + 4; }
    const before = E.taken;
    for (let d = 0; d < 40; d++) { day += 1; estateInviteTick(); }
    const near = E.taken;
    for (const c of player()) { c.x = 20; c.y = 20; }
    for (let d = 0; d < 40; d++) { day += 1; estateInviteTick(); }
    return {before, near, away: E.taken, alive: !!E.dame && E.dame.state !== 'dead'};
  });
  R.nobodyCanOpposeThem = !told ? NOTHING : told.near === told.before && told.away > told.near && told.alive
    ? `with you in the square nobody is asked to dinner (${told.before}); walk away and it resumes (${told.away}) — and the Dame is still there`
    : `!! TELLING THE TOWN DOES THE WRONG THING (${JSON.stringify(told)})`;

  /* ---- 5. THE PIT SELLS A BOUT TO A PERSON ----
     Driven through `openTalk`, which is what a right-click on the master actually runs — the
     window is the door the player has to use. */
  const pit = await p.evaluate(() => {
    const A = (typeof arena !== 'undefined') ? arena : null;
    if (!A || !A.master) return null;
    if (typeof pitSpeaker !== 'function') { /* the old build takes the whole selection */ }
    const crew = player().filter(c => c.state === 'ok').slice(0, 4);
    let k = 0;
    for (const c of crew) { c.x = A.x + 1 + (k % 3); c.y = A.y + A.r + 3; c.floor = 0; c.moveTarget = null; k++; }
    selected = crew.slice();
    const all = (typeof pitEntrants === 'function') ? pitEntrants().length : -1;
    const named = (typeof pitEntrants === 'function') ? pitEntrants(crew[2]).map(c => c.name) : null;
    $('modal').style.display = 'none'; modalOpen = false;
    openTalk(A.master, crew[2]);
    const open = $('modal').style.display !== 'none';
    const title = ($('modaltitle') || {}).textContent || '';
    const said = ($('modalbody').textContent || '');
    $('modal').style.display = 'none'; modalOpen = false;
    return {selectedN: crew.length, all, named, open, title, mentions: said.includes(crew[2].name),
            alone: /alone/.test(said)};
  });
  /* THE PARTY IS WHATEVER THE ORIGIN GAVE YOU — three, or five, and asserting a number is
     asserting a fact about character creation. What matters is that MORE THAN ONE is selected
     and standing there and exactly one is sold a bout. */
  R.oneFighterOnly = pit && pit.selectedN >= 2 && pit.all === 1 && pit.named && pit.named.length === 1
    ? `${pit.selectedN} selected and standing at the rail, and the house sells the bout to one of them (${pit.named[0]})`
    : `!! THE WHOLE PARTY STILL GOES IN (${JSON.stringify(pit)})`;
  R.andTheMasterArrangesIt = pit && pit.open && /PIT/.test(pit.title) && pit.mentions && pit.alone
    ? `a right-click on ${'the Pit-Master'} opens the card list, naming the speaker, and says they go in alone`
    : `!! THE MASTER DOES NOT ARRANGE THE FIGHT (${JSON.stringify(pit && {open: pit.open, title: pit.title, mentions: pit.mentions})})`;

  console.log('=== TWO SEATS ===\n');
  for (const [k, v] of Object.entries(R)) console.log('  ' + k.padEnd(26) + v);
  const bad = Object.values(R).map(String).filter(v => v.startsWith('!!'));
  console.log('\n' + (bad.length ? '*** ' + bad.join('\n*** ') : 'THE TOWN IS BUILT ROUND THE THING IT IS ABOUT'));
  if (errs.length) { console.log('errs:', errs.length); errs.slice(0, 4).forEach(e => console.log('  ' + e)); }
  await b.close();
  if (bad.length) process.exitCode = 1;
})();
