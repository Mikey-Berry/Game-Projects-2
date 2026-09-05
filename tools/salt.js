#!/usr/bin/env node
/* SALTMERE, AND WHAT IT KEEPS.
 *
 * "Saltmere fanatically devoted to the Church and the Paladins. Salt is holy. Salted saints
 *  awaiting resurrection. A standing pyre. Walled and picky."
 *
 * The town already said all of this and meant none of it. Its own barks are "The flats give
 * salt, the salt gives everything else", "Outsiders taste of copper — we can tell", and "Cure it
 * in brine and it keeps till judgment" — that last one is a doctrine, and until now it was a
 * pickling tip. Saltmere had the same 19-tile shrine as everywhere else, no Order in it, no pyre,
 * and its dead lay in the street like anybody's.
 *
 * What is measured is what a NECROMANCER runs into, because that is the only way a town's
 * devotion is a mechanic rather than a paragraph:
 *
 *   1. the whole town is consecrated — wider than its own wall, so the rite refuses OUTSIDE the
 *      gate, before anybody has said a word
 *   2. the rite genuinely refuses there, through the real `castRaise`
 *   3. it burns its dead at dawn, so unlike every other seat it is not a supply
 *   4. the salted saints keep — the best bodies on the map, and not one of them answers while
 *      the stone stands. Break it and they do.
 *   5. and the Order lives there rather than passing through
 *   6. AND THE STANDING FIRE IS NOT ONE OF THE ORDER'S POLES, which matters: `pyres` is read by
 *      Albedo's gate, and an always-there pole in a day-one town would hand her a name off a
 *      fire nobody burned on
 *
 * Anything starting '!!' fails the build.
 *
 *   node tools/salt.js [game.html]
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
    /* Every new symbol through `typeof`. The first run of this against the build before the work
       died on a bare `saltmere` and reported NOTHING — a control that throws proves only that
       the symbol is new, which this file has now had to learn twice. */
    const salt = (typeof saltmere !== 'undefined') ? saltmere : null;
    const burn = () => (typeof saltmereBurning === 'function') ? saltmereBurning() : 0;
    const reachOf = s2 => (typeof shrineR === 'function') ? shrineR(s2) : SHRINE_R;
    const t = towns.find(t2 => t2.def.key === 'saltmere');
    const sh = shrines.find(s2 => s2.town === t);
    R.theTown = t ? `${t.name}, walled at ${t.def.wall.r}, sweeping ${t.clearR}` : '!! NO SALTMERE';
    if(!t) return R;

    /* ---- 1. THE GROUND ---- */
    const reach = sh ? reachOf(sh) : 0;
    R.holyGround = sh && reach > t.def.wall.r
      ? `its shrine reaches ${reach} tiles — wider than the ${t.def.wall.r}-tile wall`
      : `!! THE SHRINE REACHES ${reach} AGAINST A ${t.def.wall.r}-TILE WALL`;
    R.otherTowns = shrines.filter(s2 => s2.town && s2.town !== t).every(s2 => reachOf(s2) === SHRINE_R)
      ? `and nobody else's stone reaches further than the usual ${SHRINE_R}`
      : '!! SALTMERE\'S REACH LEAKED INTO EVERY OTHER TOWN';
    R.outsideTheGate = consecratedAt(t.x + t.def.wall.r + 4, t.y)
      ? 'holy ground starts four tiles OUTSIDE the gate, which is where a necromancer finds out'
      : '!! THE GROUND OUTSIDE THE WALL IS ORDINARY';
    R.stoneIsHard = sh && sh.maxHp > SHRINE_HP * 2
      ? `and the stone is ${sh.maxHp} against everywhere else's ${SHRINE_HP} — it is meant to be worth breaking, and hard`
      : `!! THE STONE IS ${sh ? sh.maxHp : 0}`;

    /* ---- 2. AND THE RITE ACTUALLY REFUSES, THROUGH THE REAL PATH ---- */
    const nec = player().find(c => c.state === 'ok' && !c.undead);
    nec.gift = 'dark'; nec.att = {dark: 3, divine: 0, destruction: 0, dust: 0};
    nec.stats.magic = 30; nec.mana = 200; nec.castCd = 0;
    const mk = (x, y) => { const c = makeChar('Body', 'town', x, y, {atk:5,def:5,tough:5});
      c.state='dead'; c.deadAt = day; chars.push(c); corpses.push(c); return c; };
    /* ---------- ASK IT WHERE THE ANSWER IS DIFFERENT ----------
       The first version staged this in the middle of the square, and the build BEFORE this work
       refused there too — of course it did: every town has a shrine and 19 tiles covers a town
       centre. A claim both builds pass is not measuring the change. The whole point of salt
       being holy at Saltmere is the ground OUTSIDE the wall, where an ordinary town's stone does
       not reach and this one's does. */
    const ox = t.x + t.def.wall.r + 4, oy = t.y;
    nec.x = ox; nec.y = oy;
    const outBody = mk(ox + 1, oy);
    R.riteRefuses = castRaise(nec, outBody) === false
      ? 'and it refuses out there, past the wall, before anybody has said a word to you'
      : '!! A BODY WAS RAISED FOUR TILES OUTSIDE SALTMERE\'S GATE';

    /* ---- 3. IT BURNS ITS DEAD ---- */
    const before = corpses.filter(c => !c.salted && dist(c.x, c.y, t.x, t.y) <= t.clearR).length;
    for(let i = 0; i < 6; i++) mk(t.x + ri(-6, 6), t.y + ri(-6, 6));
    const staged = corpses.filter(c => !c.salted && dist(c.x, c.y, t.x, t.y) <= t.clearR).length;
    const burned = burn();
    const left = corpses.filter(c => !c.salted && dist(c.x, c.y, t.x, t.y) <= t.clearR).length;
    R.itBurnsThem = staged > before && burned >= staged && left === 0
      ? `${staged} bodies left lying, ${burned} on the fire by dawn, ${left} still on the flats`
      : `!! THE FIRE TOOK ${burned} OF ${staged} AND LEFT ${left}`;
    R.aDesertNotASupply = left === 0
      ? 'every other seat in this world is somewhere to collect from; this one is the opposite'
      : '!! SALTMERE IS STILL A CORPSE SUPPLY';

    /* ---- 4. THE SAINTS ---- */
    const saints = chars.filter(c => c.salted && c.homeTown === t && /^Saint /.test(c.name));
    R.theSaints = saints.length >= 6 ? `${saints.length} laid up in the salt house` : `!! ONLY ${saints.length} SAINTS`;
    R.theyKeep = saints.length && saints.every(c => c.salted && (c.saltedAt ?? 0) === 0 && corpses.includes(c))
      ? 'cured at their freshest and off the rot clock entirely — the same `salted` the player can do, done four hundred years ago'
      : '!! THE SAINTS ARE NOT PROPERLY CURED';
    /* THE FIRE DOES NOT TAKE THEM — they are why it is lit, not fuel for it */
    R.fireSparesThem = saints.every(c => corpses.includes(c))
      ? 'and the dawn fire does not touch them'
      : '!! THE TOWN BURNED ITS OWN SAINTS';
    /* AND THEY ARE WORTH IT, which is what makes the stone worth breaking */
    if(saints.length < 2){
      for(const k of ['worthBreakingFor','saintsSleep','breakTheStone']) R[k] = '!! THERE ARE NO SAINTS TO ASK ABOUT';
      const order0 = chars.filter(c => c.faction === 'purge' && c.billeted === t && c.state !== 'dead');
      R.theOrder = order0.length >= 4 ? `${order0.length} Paladins billeted` : `!! ONLY ${order0.length} OF THE ORDER LIVE HERE`;
      R.orderIsPosted = '!! NO BILLETED ORDER TO POST';
      R.aFire = salt && salt.pyre ? 'a fire' : '!! THERE IS NO STANDING FIRE';
      R.notAPole = '!! THERE IS NO STANDING FIRE TO KEEP OUT OF `pyres`';
      return R;
    }
    const best = Math.max(...saints.map(c => c.stats.atk + c.stats.def + c.stats.tough));
    const field = corpses.filter(c => !c.salted).map(c => c.stats.atk + c.stats.def + c.stats.tough);
    R.worthBreakingFor = field.length && best > Math.max(...field)
      ? `the best of them is ${best} against the best ordinary corpse in the world at ${Math.max(...field)}`
      : `!! A SAINT IS NO BETTER THAN A BODY IN A DITCH (${best} vs ${field.length ? Math.max(...field) : 0})`;
    /* AND WHILE THE STONE STANDS, NOT ONE OF THEM ANSWERS */
    nec.x = saints[0].x; nec.y = saints[0].y; nec.mana = 200; nec.castCd = 0;
    R.saintsSleep = castRaise(nec, saints[0]) === false
      ? 'and while the stone stands not one of them answers'
      : '!! A SAINT GOT UP WITH THE SHRINE INTACT';
    if(sh) sh.broken = true;
    nec.mana = 200; nec.castCd = 0;
    const got = castRaise(nec, saints[1]);
    R.breakTheStone = got !== false
      ? 'break it, and Saltmere becomes the single richest thing a necromancer can do'
      : '!! BREAKING THE STONE CHANGES NOTHING';
    if(sh) sh.broken = false;

    /* ---- 5. THE ORDER LIVES HERE ---- */
    const order = chars.filter(c => c.faction === 'purge' && c.billeted === t && c.state !== 'dead');
    R.theOrder = order.length >= 4
      ? `${order.length} Paladins billeted in the town, not passing through`
      : `!! ONLY ${order.length} OF THE ORDER LIVE HERE`;
    R.orderIsPosted = order.every(c => c.guard && dist(c.guard.x, c.guard.y, t.x, t.y) < 20)
      ? 'and every one of them has a post inside it'
      : '!! THE BILLETED ORDER IS NOT POSTED IN THE TOWN';

    /* ---- 6. AND THE FIRE IS NOT ONE OF THE ORDER'S POLES ---- */
    R.aFire = salt && salt.pyre ? `the standing fire burns at ${Math.round(salt.pyre.x)},${Math.round(salt.pyre.y)}` : '!! THERE IS NO STANDING FIRE';
    /* ---------- AT WORLDGEN. The word matters and it did not use to. ----------
       The fire is not a pole on day one, which is the thing being protected: Albedo's gate reads
       `pyres`, and a pole standing in a walkable town from the first frame would hand her a name
       off a fire nobody was burned on. It is NOT that a pole can never be here — the Order burns
       people at this fire now, and when it does, a real pole with a real name goes up beside it.
       See `albedo.js`, which drives that whole chain. */
    R.notAPole = salt && salt.pyre && !pyres.some(q => dist(q.x, q.y, salt.pyre.x, salt.pyre.y) < 8)
      ? 'and at worldgen it is not a pole — a fire nobody has been burned on cannot pay off Albedo'
      : '!! THERE IS A POLE AT THE STANDING FIRE BEFORE ANYBODY WAS BURNED';
    /* AND THE ORDER USES IT. A second burning ground that no town is nearer to is decoration. */
    /* MEASURED BY BURNING SOMEBODY, not by comparing distances — the build before this sent
       every body to the Bastion gate no matter which town it came out of, and a geometry check
       passes on that. See the same note in `albedo.js`. */
    const n0 = pyres.length;
    const mk2 = makeChar('Suspect', 'town', t.x + 2, t.y + 2, {atk:5, def:5, tough:5});
    mk2.civ = true; mk2.homeTown = t; chars.push(mk2);
    if(typeof burnHeretic === 'function') burnHeretic(mk2);
    const fresh = pyres[pyres.length - 1];
    R.theOrderBurnsHere = pyres.length === n0 + 1 && salt && salt.pyre && dist(fresh.x, fresh.y, salt.pyre.x, salt.pyre.y) < 8
      ? `and somebody taken out of ${t.name} burns on ${t.name}'s own fire rather than being walked to the Bastion`
      : '!! A SUSPECT FROM SALTMERE IS STILL BURNED AT THE BASTION — THE FIRE IS A PROP';
    pyres.length = n0;
    return R;
  });

  console.log('=== SALTMERE ===\n');
  for (const [k, v] of Object.entries(out)) console.log('  ' + k.padEnd(18) + v);
  const bad = Object.values(out).map(String).filter(v => v.startsWith('!!'));
  console.log('\n' + (bad.length ? '*** ' + bad.join('\n*** ') : 'CURE IT IN BRINE AND IT KEEPS TILL JUDGMENT'));
  if (errs.length) { console.log('errs:', errs.length); errs.slice(0, 4).forEach(e => console.log('  ' + e)); }
  await b.close();
  if (bad.length) process.exitCode = 1;
})();
