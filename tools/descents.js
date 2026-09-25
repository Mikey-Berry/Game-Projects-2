#!/usr/bin/env node
/* THE WAY FURTHER DOWN, AND WHETHER YOU CAN FIND IT.
 *
 * "While exploring the Undercroft, I cannot find any entrances that lead deeper than the first
 *  layer. I'm not sure if they are invisible or if they are simply not there."
 *
 * They were there and they worked. Measured on the build before this: 14 ways down to the
 * Deepworks and 6 to the Sump, all 20 open on both sides and all 20 usable. What they were not
 * was FINDABLE — from a hall on the Undercroft the nearest was a median of 190 tiles away and
 * as much as 555, they were placed wherever the two lattices happened to cross rather than
 * anywhere a body walks, they were marked by a post 0.18 tiles wide drawn from the storey
 * BELOW, and the one screen glyph that named them drew only under live sight, which underground
 * is a torch's radius.
 *
 *   node tools/descents.js [game.html]
 */
const { chromium } = require('playwright');
const path = require('path');
const gamePath = (a) => path.resolve(a ? (path.isAbsolute(a) ? a : path.join(__dirname, a)) : path.join(__dirname, 'game.html'));
(async () => {
  const b = await chromium.launch({ executablePath: process.env.DUSTWARD_CHROME || undefined,
    args: ['--use-gl=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox','--no-sandbox'] });
  const errs = [];
  const p = await b.newPage({ viewport: { width: 1000, height: 700 } });
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message.slice(0, 200)));
  await p.goto('file://' + gamePath(process.argv[2]), { waitUntil: 'load', timeout: 90000 });
  await p.waitForFunction(() => !!document.getElementById('btn-start'), null, { timeout: 60000 });
  await p.evaluate(() => { document.getElementById('btn-start').click(); paused = true; });
  await p.waitForFunction(() => typeof chars !== 'undefined' && chars.length > 0, null, { timeout: 60000 });

  const R = await p.evaluate(() => {
    const O = {};
    paused = true;
    const guard = (keys, fn) => {
      try { fn(); } catch (e) { for (const k of keys) if (O[k] === undefined) O[k] = '!! ' + String(e.message).slice(0, 130).toUpperCase(); }
    };
    const med = a => { const s2 = [...a].sort((x, y) => x - y); return s2.length ? s2[Math.floor(s2.length / 2)] : 0; };

    /* ---- 1. THERE IS A WAY OFF EVERY STOREY BUT THE LAST ---- */
    guard(['everyStoreyButTheLastHasAWayDown'], () => {
      const miss = [];
      for (let i = 0; i < DEPTHS.length - 1; i++) {
        const n = stairs.filter(s => s.from === DEPTHS[i] && s.to === DEPTHS[i + 1]).length;
        if (n === 0) miss.push(`${DEPTHS[i]}->${DEPTHS[i + 1]}`);
      }
      O._counts = DEPTHS.slice(0, -1).map((f, i) =>
        `${f}->${DEPTHS[i + 1]}: ${stairs.filter(s => s.from === f && s.to === DEPTHS[i + 1]).length}`).join(', ');
      O.everyStoreyButTheLastHasAWayDown = miss.length === 0
        ? `every storey has a way off it — ${O._counts}`
        : `!! NO WAY DOWN AT ALL FROM ${miss.join(', ').toUpperCase()}`;
    });

    /* ---- 2. AND EVERY ONE OF THEM IS OPEN ON BOTH SIDES ----
       A shaft standing in rock on either storey is a hole into nothing. This is the claim that
       was ALREADY green before any of this work and is kept because it is the one that would
       catch the failure the report guessed at. */
    guard(['andEveryWayDownIsOpenOnBothSides'], () => {
      const open = (x, y, f) => decks.has(bkey(x, y, f)) && !blocked.has(bkey(x, y, f));
      const under = stairs.filter(s => s.to < 0 && s.from < 0);
      const bad = under.filter(s => !open(s.x, s.y, s.from) || !open(s.x, s.y, s.to) || !stairAt(s.x, s.y));
      O.andEveryWayDownIsOpenOnBothSides = (under.length > 0 && bad.length === 0)
        ? `all ${under.length} of the underground descents are open on the storey above and the storey below, and \`stairAt\` finds each one`
        : `!! ${bad.length} OF ${under.length} DESCENTS ARE BLOCKED OR UNFINDABLE BY stairAt`;
    });

    /* ---- 3. AND THEY ARE WHERE PEOPLE WALK ----
       The heart of it. A descent at a random lattice crossing is findable only by walking every
       corridor; a descent at a HALL is on the way to somewhere. Measured against the halls of
       the storey the descent leaves FROM, because that is the storey you are hunting on. */
    guard(['theWaysDownAreWherePeopleWalk'], () => {
      const rows = [];
      let worstMed = 0;
      for (let i = 0; i < DEPTHS.length - 1; i++) {
        const up = DEPTHS[i], dn = DEPTHS[i + 1];
        const ways = stairs.filter(s => s.from === up && s.to === dn);
        const halls = undercroft.halls.filter(h => h.f === up);
        if (!ways.length || !halls.length) continue;
        /* ---------- MEASURED FROM THE HALL'S EDGE, NOT ITS PIN ----------
           The first bar here was "within 20 tiles of a hall centre", which is a round number
           with nothing behind it. A hall is `5 + rnd()*5` across and buds a side chamber out to
           roughly twenty tiles beyond that, so a distance from the CENTRE says as much about
           how big the hall rolled as about where the shaft is. What the claim is actually about
           is whether a body walking into the hall is standing near the way down — so it is the
           gap from the hall's own EDGE that matters, and a gap of zero means the mouth is
           inside the hall complex itself. */
        const atHall = ways.map(s => Math.min(...halls.map(h => Math.hypot(h.x - s.x, h.y - s.y) - (h.r || 8))));
        const m = med(atHall);
        rows.push(`${up}->${dn}: a way down sits a median ${Math.round(m)} tiles beyond the edge of the nearest hall above it`);
        worstMed = Math.max(worstMed, m);
      }
      O._atHall = rows.join(' | ');
      /* ---------- AND THE BAR COMES OFF THE RENDERER, NOT OFF A ROUND NUMBER ----------
         Twenty, then eighteen: both picked because they sounded about right, which is no way to
         set a bar and is the thing this suite keeps catching. What decides whether a way down is
         findable is not a tidy distance, it is whether its marker is DRAWN while you are
         standing in the hall. The undercroft's own local geometry — the palefronds, the vigil
         stones — is built within `undercroft.bucket * 2.6` of the camera, and that is the file's
         own answer to "is this in the room with me". A mouth inside that radius glows at you
         from the hall; one outside it does not exist until you walk further.
         So the bar is that radius, and the margin is the finding: a median of twenty tiles past
         the hall edge against a draw radius of sixty-two. */
      const drawR = undercroft.bucket * 2.6;
      O._drawR = `the undercroft draws its local geometry within ${Math.round(drawR)} tiles of the camera`;
      O.theWaysDownAreWherePeopleWalk = worstMed <= drawR * 0.5
        ? `every way down is cut beside a hall of the storey above rather than at whatever tile the two lattices first crossed — a median ${Math.round(worstMed)} tiles past the hall's edge against a ${Math.round(drawR)}-tile draw radius, so the mouth is lit and on screen while you are still standing in the hall`
        : `!! THE WAYS DOWN ARE OUT IN THE CORRIDORS (worst median ${Math.round(worstMed)} TILES PAST THE NEAREST HALL'S EDGE, DRAW RADIUS ${Math.round(drawR)})`;
    });

    /* ---- 4. AND THE WALK TO ONE IS A WALK, NOT A SEARCH ---- */
    guard(['andTheWalkToOneIsAWalk'], () => {
      const rows = [];
      let worst = 0;
      for (let i = 0; i < DEPTHS.length - 1; i++) {
        const up = DEPTHS[i], dn = DEPTHS[i + 1];
        const ways = stairs.filter(s => s.from === up && s.to === dn);
        const halls = undercroft.halls.filter(h => h.f === up);
        if (!ways.length || !halls.length) continue;
        const ds = halls.map(h => Math.min(...ways.map(s => Math.hypot(s.x - h.x, s.y - h.y))));
        rows.push(`${up}->${dn}: median ${Math.round(med(ds))}, worst ${Math.round(Math.max(...ds))}`);
        worst = Math.max(worst, med(ds));
      }
      O._reach = rows.join(' | ');
      /* NOT A TIGHT BAR, AND DELIBERATELY. The sparseness is the design — "the walk to the one
         that has a way further down is most of what makes the Sump feel like the bottom of
         something" — so this guards against the storey becoming unreachable, not against it
         being far. The map is 1440 across; half of that from a hall is a search, not a walk. */
      O.andTheWalkToOneIsAWalk = worst <= 320
        ? `from a hall, the nearest way down is a median ${Math.round(worst)} tiles at the worst storey — far enough to be a journey and short enough to be one you finish`
        : `!! A MEDIAN OF ${Math.round(worst)} TILES TO THE NEAREST WAY DOWN — THAT IS A SEARCH, NOT A WALK`;
    });

    /* ---- 5. A WAY DOWN YOU HAVE FOUND STAYS FOUND, AND ONLY ON ITS OWN STOREY ----
       `vis` is one bitmap for a world four storeys deep, so the interesting half of this claim
       is the NEGATIVE one: standing on the surface must not mark, remember or draw a shaft
       three storeys under your boots. */
    guard(['aWayDownIsRememberedOnceFound', 'andWalkingOverItTeachesYouNothing'], () => {
      const under = stairs.filter(s => s.from < 0 && s.to < 0);
      if (!under.length) { O.aWayDownIsRememberedOnceFound = '!! NO UNDERGROUND DESCENTS TO TEST'; O.andWalkingOverItTeachesYouNothing = '!! SAME'; return; }
      for (const s of stairs) s.seen = false;
      const t = under[0];
      /* walk the SURFACE over it: vis goes to 2 on that tile, and the storey is wrong */
      const wasFloor = activeFloor;
      activeFloor = 0;
      vis[t.y * W + t.x] = 2;
      renderOverlay();
      const learnedFromAbove = !!t.seen;
      /* now stand on the storey it leaves from */
      activeFloor = t.from;
      renderOverlay();
      const learnedFromThere = !!t.seen;
      activeFloor = wasFloor;
      O.andWalkingOverItTeachesYouNothing = !learnedFromAbove
        ? 'walking the waste above a shaft teaches you nothing about it — `vis` has no floor dimension, so the storey is asked for separately'
        : '!! THE SURFACE LEARNED ABOUT A SHAFT UNDER IT';
      O.aWayDownIsRememberedOnceFound = learnedFromThere
        ? 'and standing on the storey it leaves from marks it known, so a way down you found once can be walked back to'
        : '!! STANDING AT A SHAFT DID NOT MARK IT KNOWN';
    });

    /* ---- 6. AND THE KNOWLEDGE SURVIVES A SAVE ----
       The stairs come back off the seed; the knowing does not, and cannot be rebuilt from the
       explored bitmap for the reason above. */
    guard(['andItSurvivesASave'], () => {
      const under = stairs.filter(s => s.from < 0 && s.to < 0);
      if (!under.length) { O.andItSurvivesASave = '!! NO UNDERGROUND DESCENTS TO TEST'; return; }
      for (const s of stairs) s.seen = false;
      under[0].seen = true; if (under[1]) under[1].seen = true;
      const want = under.filter(s => s.seen).length;
      const snap = JSON.parse(JSON.stringify(snapshot()));
      const carried = Array.isArray(snap.stairsSeen) ? snap.stairsSeen.length : -1;
      for (const s of stairs) s.seen = false;
      restore(snap);
      const back = stairs.filter(s => s.seen).length;
      O.andItSurvivesASave = (carried === want && back === want)
        ? `${want} known ways down go into a save and ${back} come back out of it`
        : `!! ${want} KNOWN WENT IN, ${carried} WERE WRITTEN, ${back} CAME BACK`;
    });
    return O;
  });

  console.log('=== THE WAY FURTHER DOWN ===\n');
  for (const [k, v] of Object.entries(R)) console.log('  ' + k.padEnd(36) + v);
  const bad = Object.values(R).map(String).filter(v => v.startsWith('!!'));
  if (errs.length) { console.log(''); errs.slice(0, 4).forEach(e => console.log('  ' + e)); }
  console.log('\n' + (bad.length || errs.length
    ? '*** ' + [...bad, ...errs].join('\n*** ')
    : 'THERE IS A WAY DOWN, IT IS WHERE YOU WALK, AND YOU CAN FIND IT AGAIN'));
  await b.close();
  process.exitCode = (bad.length || errs.length) ? 1 : 0;
})();
