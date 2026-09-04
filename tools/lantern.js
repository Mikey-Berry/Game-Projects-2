#!/usr/bin/env node
/* FALLOWEND, AND THE VIOLET LIGHT.
 *
 * "Fallowend as the struggling farm counterpart, with violet lanterns that turn gaunts away,
 *  Good Kami worship, charms with genuine blessings, and pre-Fracture tech refashioned as folk
 *  magic."
 *
 * The town had already asked the question and the game had never answered it. The Doorway Charm
 * has said, since it was written, "Fallowend hangs one on every lintel. Nobody there will tell
 * you whether it works." It did not work: two per cent of a defence number and a joke about
 * itself, in the one town whose entire identity is that its charms are all it has.
 *
 * So the measurement is the light, twice:
 *
 *   1. a LIT post turns a gaunt, through the gaunt AI's own branch — driven by walking a real
 *      gaunt at the town and seeing which way it goes
 *   2. a DARK post does not, which is the same claim with the lamp out and is the only way to
 *      know that (1) was the lamp and not the geography
 *   3. a KEPT charm is that light on a person, and an ordinary one still is not
 *   4. the posts burn down and the town's box of cells is finite — that is what "struggling"
 *      means in a number: a countdown, not a poor harvest
 *   5. a cell from the player relights one
 *   6. and the Good Kami are not the Church, so their stone does not consecrate — which makes
 *      Fallowend the second place on the map where the rite will answer
 *
 * Anything starting '!!' fails the build.
 *
 *   node tools/lantern.js [game.html]
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
    const t = towns.find(t2 => t2.def.key === 'fallowend');
    const lamps = (typeof lanterns !== 'undefined') ? lanterns : [];
    const fe = (typeof fallowend !== 'undefined') ? fallowend : null;
    R.posts = lamps.length >= 6
      ? `${lamps.length} posts on the Fallowend road, ${Math.round(dist(lamps[0].x, lamps[0].y, t.x, t.y))} tiles out`
      : `!! ${lamps.length} LANTERNS`;
    R.theCharm = ITEMS.t_kept && ITEMS.t_kept.ward
      ? `and a ${ITEMS.t_kept.name} that carries the same light`
      : '!! THERE IS NO BLESSED CHARM';
    if(!lamps.length || !ITEMS.t_kept){
      for(const k of ['litTurns','darkDoesNot','charmTurns','plainDoesNot','theyBurnDown','theBoxRunsOut','aCellRelights','kamiIsNotChurch','riteAnswers'])
        R[k] = '!! NOTHING HERE TO MEASURE';
      return R;
    }

    /* ---- 1 and 2. THE LAMP, ON AND OFF, WALKED AT BY A REAL GAUNT ----
       Not `violetNear` asked directly — that would be restating the rule. Stage a gaunt with a
       quarry it wants, outside the light, and see whether it closes. Then put the lamp out and
       stage it identically. The DARK case is the control: without it, "the gaunt did not come"
       could be the geography, the pathing, or anything else. */
    const L = lamps[0];
    const bait = player().find(c => c.state === 'ok');
    bait.x = L.x; bait.y = L.y; bait.floor = 0;
    const walk = (lit) => {
      L.fuel = lit ? 60 : 0;
      for(const o of lamps) if(o !== L) o.fuel = 0;
      const gx = L.x + 7, gy = L.y;
      const g = makeChar('Gaunt', 'gaunt', gx, gy, {atk:14, def:10, tough:14, ath:8});
      g.gauntKind = 'lesser'; g.hunt = true; g.target = bait;
      chars.push(g);
      rebuildCharGrid();
      /* ---------- THE QUESTION IS "DID IT REACH YOU", NOT "WHERE DID IT STOP" ----------
         The first version read the FINAL distance, and against the personal charm that is the
         wrong number: the turn radius is centred on the wearer, so a gaunt sent from nine tiles
         closes to the edge of it and hovers there, correctly, forever. The probe read 9.0 to 7.5
         and called the charm dead about a charm doing exactly its job. What a ward is for is that
         nothing gets to you, so track the CLOSEST it ever came. */
      let dmin = dist(g.x, g.y, bait.x, bait.y);
      const d0 = dmin;
      for(let i = 0; i < 300; i++){ ai(g, 0.1); physics(g, 0.1);
        dmin = Math.min(dmin, dist(g.x, g.y, bait.x, bait.y)); }
      const i2 = chars.indexOf(g); if(i2 >= 0) chars.splice(i2, 1);
      rebuildCharGrid();
      return {d0, dmin};
    };
    const on = walk(true), off = walk(false);
    R.litTurns = on.dmin > 4
      ? `a gaunt sent at somebody standing under a lit post never gets closer than ${on.dmin.toFixed(1)} tiles`
      : `!! A LIT POST DID NOT TURN A GAUNT (it closed to ${on.dmin.toFixed(1)})`;
    R.darkDoesNot = off.dmin < 2
      ? `and with the same post OUT it walks all the way in to ${off.dmin.toFixed(1)} — which is how you know it was the lamp and not the geography`
      : `!! A DARK POST TURNED IT TOO (closest ${off.dmin.toFixed(1)}) — THIS MEASURES THE GEOGRAPHY, NOT THE LIGHT`;

    /* ---- 3. THE CHARM IS THE SAME LIGHT, CARRIED ---- */
    for(const o of lamps) o.fuel = 0;
    bait.x = 40.5; bait.y = 40.5;      /* well away from every post */
    const carry = (trink) => {
      bait.trinket = trink;
      rebuildCharGrid();
      /* NINE TILES, NOT SIX. The first version spawned it at exactly `CHARM_R + 1.5` — on the
         boundary — and the gaunt neither closed nor fled: it sat at 5.7 and the probe reported
         the charm dead. Stage it OUTSIDE the reach so the walk in is what gets turned. */
      const g = makeChar('Gaunt', 'gaunt', bait.x + 9, bait.y, {atk:14, def:10, tough:14, ath:8});
      g.gauntKind = 'lesser'; g.hunt = true; g.target = bait;
      chars.push(g); rebuildCharGrid();
      let dmin = dist(g.x, g.y, bait.x, bait.y);
      const d0 = dmin;
      for(let i = 0; i < 300; i++){ ai(g, 0.1); physics(g, 0.1);
        dmin = Math.min(dmin, dist(g.x, g.y, bait.x, bait.y)); }
      const i2 = chars.indexOf(g); if(i2 >= 0) chars.splice(i2, 1);
      rebuildCharGrid();
      return {d0, dmin};
    };
    const kept = carry('t_kept'), plain = carry('t_charm');
    R.charmTurns = kept.dmin > 4
      ? `a Kept Charm keeps them off its wearer — nothing came closer than ${kept.dmin.toFixed(1)} tiles`
      : `!! THE KEPT CHARM DOES NOTHING (it closed to ${kept.dmin.toFixed(1)})`;
    R.plainDoesNot = plain.dmin < 2
      ? `while the ordinary Doorway Charm still will not tell you whether it works, because it does not — that one closed to ${plain.dmin.toFixed(1)}`
      : `!! AN UNBLESSED CHARM WORKS TOO (closest ${plain.dmin.toFixed(1)})`;
    bait.trinket = null;

    /* ---- 4. THE COUNTDOWN ---- */
    for(const o of lamps) o.fuel = 3;
    t.stock.aether_cell = 0;
    for(let d = 0; d < 5; d++) lanternTick();
    R.theyBurnDown = lamps.every(o => !o.fuel) && fe.dark === lamps.length
      ? `with the box empty, five nights puts all ${lamps.length} of them out`
      : `!! ${lamps.filter(o => o.fuel).length} STILL BURNING WITH NO CELLS LEFT`;
    t.stock.aether_cell = 2;
    for(let d = 0; d < 12; d++) lanternTick();
    R.theBoxRunsOut = (t.stock.aether_cell === 0) && lamps.filter(o => o.fuel).length > 0 && lamps.filter(o => o.fuel).length < lamps.length
      ? `two cells relight two posts and then the box is empty — ${lamps.filter(o => o.fuel).length} of ${lamps.length} burning, and no way to make more`
      : `!! THE BOX DID NOT RUN OUT (${t.stock.aether_cell} left, ${lamps.filter(o => o.fuel).length} lit)`;

    /* ---- 5. AND THE PLAYER CAN DO SOMETHING ABOUT IT ---- */
    for(const o of lamps) o.fuel = 0;
    fe.dark = lamps.length;
    const rep0 = t.rep;
    addItem('aether_cell', 1);
    const fed = lanternFeed();
    R.aCellRelights = fed && lamps.filter(o => o.fuel).length === 1 && t.rep > rep0
      ? `a cell from your own stores puts one back up, and Fallowend notices: standing ${Math.round(rep0)} to ${Math.round(t.rep)}`
      : `!! FEEDING A POST DID NOTHING (fed ${fed}, lit ${lamps.filter(o => o.fuel).length}, rep ${Math.round(rep0)} to ${Math.round(t.rep)})`;
    R.keepsACharm = (addItem('t_charm', 1), keepCharm() && (stash.t_kept || 0) > 0)
      ? 'and the stone keeps a charm you brought it, which is the only way to get one'
      : '!! THE STONE WILL NOT KEEP A CHARM';

    /* ---- 6. THE GOOD KAMI ARE NOT THE CHURCH ---- */
    const sh = shrines.find(s2 => s2.town === t);
    R.kamiIsNotChurch = !sh
      ? 'their stone consecrates nothing — the Kami are not the Order'
      : '!! FALLOWEND\'S SHRINE STILL HALLOWS THE GROUND AGAINST THE DEAD';
    R.stillAShrine = buildings.some(x => x.town === t && x.label === 'SHRINE')
      ? 'and the building still stands on the plaza, because the town is laid out around it'
      : '!! THE SHRINE BUILDING WENT AWAY WITH THE CONSECRATION';
    const nec = player().find(c => c.state === 'ok' && !c.undead);
    nec.gift = 'dark'; nec.att = {dark:3, divine:0, destruction:0, dust:0};
    nec.stats.magic = 30; nec.mana = 200; nec.castCd = 0;
    nec.x = t.x + 2; nec.y = t.y + 2;
    const body = makeChar('Body', 'town', t.x + 3, t.y + 2, {atk:5,def:5,tough:5});
    body.state = 'dead'; body.deadAt = day; chars.push(body); corpses.push(body);
    R.riteAnswers = castRaise(nec, body) !== false
      ? 'so the rite answers in Fallowend — the second place on the map where it will'
      : '!! THE RITE STILL REFUSES AT FALLOWEND';
    return R;
  });

  console.log('=== FALLOWEND ===\n');
  for (const [k, v] of Object.entries(out)) console.log('  ' + k.padEnd(16) + v);
  const bad = Object.values(out).map(String).filter(v => v.startsWith('!!'));
  console.log('\n' + (bad.length ? '*** ' + bad.join('\n*** ') : 'NOTHING GOOD WALKS IN FROM THE DARK'));
  if (errs.length) { console.log('errs:', errs.length); errs.slice(0, 4).forEach(e => console.log('  ' + e)); }
  await b.close();
  if (bad.length) process.exitCode = 1;
})();
