#!/usr/bin/env node
/* THE LAST ORCHARD.
 *
 * "Greenrest with a dark secret. A mansion or estate, a servant answers the door, you need high
 *  reputation to get in, reclusive."
 *
 * The secret was already written into the town and nobody had noticed. Greenrest brags about
 * exactly two things in its own civilian barks — "Harvest looks kind this season" and "Never seen
 * a bandit inside these walls. Never will." — which is one fact said twice. The orchard crops
 * because of what is under it, and no bandit has ever been inside those walls because none of
 * them got that far.
 *
 * What is measured here is the SHAPE of it, because every part of that can ship broken invisibly:
 *
 *   1. the estate exists, outside the wall, walled itself, with a household in it
 *   2. the rows are NOT in the world until somebody opens the ground — twenty bodies in `chars`
 *      from worldgen would be twenty bodies in every save and every scan of a thing the player
 *      may never find
 *   3. the door is shut at low standing and opens at high, and the talk check is a real third way
 *   4. the gift feels the ground without being told — driven through the real world tick
 *   5. and once it is open the bodies are ORDINARY DEAD, raisable with every tool that already
 *      exists, because the whole point of putting it at the start town is that it is a
 *      necromancer's jackpot rather than a cutscene
 *
 * Anything starting '!!' fails the build.
 *
 *   node tools/orchard.js [game.html]
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
    if(typeof estate === 'undefined' || !estate){
      R.built = '!! THERE IS NO ESTATE AT GREENREST';
      return R;
    }
    const e = estate, t = e.town;
    R.built = `the Aldercott yard, ${e.hw*2+1}x${e.hh*2+1}, ${Math.round(dist(e.x, e.y, t.x, t.y))} tiles out from ${t.name}`;
    R.itIsTheStart = towns.indexOf(t) === towns.indexOf(startTown)
      ? 'and it is the START TOWN, which is the whole reason it is there'
      : '!! THE SECRET IS NOT AT THE TOWN THE PLAYER BEGINS BESIDE';
    R.outside = dist(e.x, e.y, t.x, t.y) > (t.clearR || 20)
      ? 'outside the wall — reclusive, as asked'
      : '!! THE ESTATE IS INSIDE THE TOWN';
    R.walled = e.walls.length > 20 && e.gate.length
      ? `${e.walls.length} tiles of yard wall with one gate in it`
      : `!! THE YARD IS ${e.walls.length} TILES OF WALL AND ${e.gate.length} GATE(S)`;
    R.aHouse = e.house && buildings.includes(e.house)
      ? `${e.house.label} stands inside it`
      : '!! THERE IS NO HOUSE IN THE YARD';

    /* ---- THE HOUSEHOLD, AND WHERE EACH OF THEM STANDS ---- */
    const serv = chars.find(c => c.orchardServant && c.state !== 'dead');
    const dame = chars.find(c => c.orchardDame && c.state !== 'dead');
    const kin = chars.filter(c => c.orchardKin && c.state !== 'dead');
    R.household = serv && dame && kin.length >= 2
      ? `${serv.name} at the gate, ${dame.name} and ${kin.length} of the family inside`
      : `!! THE HOUSEHOLD IS INCOMPLETE (servant ${!!serv}, dame ${!!dame}, kin ${kin.length})`;
    const inYard = c => Math.abs(c.x - e.x) <= e.hw && Math.abs(c.y - e.y) <= e.hh;
    R.servantAtDoor = serv && !inYard(serv)
      ? 'and the servant is OUTSIDE the wall, which is the scene: you are turned away by somebody who is not allowed to decide'
      : '!! THE SERVANT IS INSIDE THE YARD HE IS SUPPOSED TO BE GUARDING';
    R.dameInside = dame && inYard(dame)
      ? 'while the woman who could decide does not come out to you'
      : '!! THE DAME IS STANDING IN THE ROAD';
    /* AND THEY TALK. A tree that is written and never routed is the commonest way a
       conversation ships dead — this file has a note about exactly that for the necromancers. */
    R.theyTalk = (TALK_TREES.servant && TALK_TREES.dame && !isWatch(serv) && !isWatch(dame))
      ? 'both have their own tree, and neither falls through to the watch conversation'
      : `!! A HOUSEHOLD CONVERSATION IS UNREACHABLE (servant tree ${!!TALK_TREES.servant}, watch ${isWatch(serv)})`;

    /* ---- 2. THE ROWS ARE NOT IN THE WORLD YET ---- */
    R.rowsPlanned = e.graves.length >= 15
      ? `${e.graves.length} places under the trees, and not one of them is a body yet`
      : `!! ONLY ${e.graves.length} GRAVES PLANNED`;
    R.notYetReal = chars.filter(c => c.orchardDead).length === 0 && !e.opened
      ? 'nothing in `chars`, nothing in the save, nothing for any scan in the game to walk'
      : `!! ${chars.filter(c => c.orchardDead).length} ORCHARD BODIES EXIST BEFORE ANYBODY LOOKED`;

    /* ---- 3. THE DOOR ---- */
    t.rep = 0;
    R.shutAtLow = !estateAdmits() ? `shut at standing 0 (the house wants ${ORCHARD_REP})` : '!! THE DOOR IS OPEN TO A STRANGER';
    t.rep = ORCHARD_REP + 5;
    R.opensAtHigh = estateAdmits() ? `and open at ${Math.round(t.rep)}` : '!! STANDING BUYS NOTHING AT THAT DOOR';
    t.rep = 0;
    /* the third way in is a check on the tree rather than a flag, so assert the OPTION exists
       and that it is a check — an ungated "please let me in" would make the standing pointless */
    const forced = (TALK_TREES.servant.root.opts || []).find(o => o.check);
    R.talkYourWayIn = forced && forced.check.dc >= 18
      ? `and a hard talk check (dc ${forced.check.dc}) is the other way past him`
      : '!! THERE IS NO THIRD WAY IN, OR IT IS TOO CHEAP';

    /* ---- 4. THE GIFT FEELS IT, THROUGH THE REAL TICK ---- */
    const me = player().find(c => c.state === 'ok' && !c.undead);
    const wasGift = me.gift;
    me.gift = 'dark';
    me.x = e.gx; me.y = e.gy;
    rebuildCharGrid();
    paused = false;
    for(let i = 0; i < 60 && !e.opened; i++) update(0.1);
    R.theGiftKnows = e.opened
      ? 'a necromancer standing between the rows simply knows, without being told'
      : '!! THE GIFT WALKED OVER TWENTY BODIES AND FELT NOTHING';
    me.gift = wasGift;

    /* ---- 5. AND THEN THEY ARE ORDINARY DEAD ---- */
    const dead = chars.filter(c => c.orchardDead);
    R.theyAreReal = dead.length === e.graves.length && dead.every(c => c.state === 'dead' && corpses.includes(c))
      ? `${dead.length} bodies in \`corpses\`, in rows, under the fruit trees`
      : `!! ${dead.length}/${e.graves.length} CAME UP, ${dead.filter(c => corpses.includes(c)).length} OF THEM IN corpses`;
    R.theyRaise = dead.length && dead.every(raisableBody)
      ? 'and every one of them takes a binding like any other corpse — no special case, no cutscene'
      : '!! SOME OF THE ORCHARD DEAD WILL NOT TAKE A BINDING';
    /* AND THEY ARE OLD. A row four generations deep should not read as this morning's dead. */
    const ages = dead.map(c => day - c.deadAt);
    R.theyAreOld = ages.length && Math.min(...ages) > 5
      /* NOT "four generations", which is what the Dame says and what the ground holds. These are
         the ones still worth counting — "more that are not" is her own next line, and a corpse
         older than the rot allows is a corpse the world would have taken away already. */
      ? `dead between ${Math.round(Math.min(...ages))} and ${Math.round(Math.max(...ages))} days — the ones still worth counting`
      : `!! THE ROWS READ AS THIS MORNING'S DEAD (oldest ${Math.round(Math.max(...ages))} days)`;
    /* AND IT ONLY HAPPENS ONCE */
    const n0 = chars.filter(c => c.orchardDead).length;
    orchardOpen('again');
    R.onlyOnce = chars.filter(c => c.orchardDead).length === n0
      ? 'and the ground can only be opened once'
      : `!! OPENING IT TWICE DOUBLED THE DEAD (${n0} to ${chars.filter(c => c.orchardDead).length})`;

    /* ---- AND THE THREE ENDINGS ARE THREE DIFFERENT THINGS ---- */
    const ends = ['ally', 'expose', 'bargain'].filter(k => TALK_TREES.dame[k]);
    R.threeWays = ends.length === 3
      ? `three ways out of the long room: ${ends.join(', ')}`
      : `!! ONLY ${ends.length} ENDINGS`;
    const rep0 = t.rep;
    TALK_TREES.dame.expose.opts[0].fn();
    R.exposureCosts = t.rep < rep0 && e.deal === 'told'
      ? `telling the town costs the house everything and Greenrest's standing ${Math.round(rep0)} to ${Math.round(t.rep)}`
      : `!! EXPOSING THEM CHANGED NOTHING (${Math.round(rep0)} to ${Math.round(t.rep)}, deal ${e.deal})`;
    e.deal = null;
    const rep1 = t.rep;
    TALK_TREES.dame.ally.opts[0].fn();
    R.silenceBuys = t.rep > rep1 && e.deal === 'kept'
      ? `and keeping it lifts them: ${Math.round(rep1)} to ${Math.round(t.rep)}`
      : `!! SILENCE BUYS NOTHING (${Math.round(rep1)} to ${Math.round(t.rep)})`;
    return R;
  });

  console.log('=== THE LAST ORCHARD ===\n');
  for (const [k, v] of Object.entries(out)) console.log('  ' + k.padEnd(16) + v);
  const bad = Object.values(out).map(String).filter(v => v.startsWith('!!'));
  console.log('\n' + (bad.length ? '*** ' + bad.join('\n*** ') : 'THE OLDEST TREES ARE THE BEST CROPPERS'));
  if (errs.length) { console.log('errs:', errs.length); errs.slice(0, 4).forEach(e => console.log('  ' + e)); }
  await b.close();
  if (bad.length) process.exitCode = 1;
})();
