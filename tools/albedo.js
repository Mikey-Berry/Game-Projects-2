#!/usr/bin/env node
/* ALBEDO, AND THE POLES AT THE GATE.
 *
 * "I cannot ever seem to get Albedo's quest done. Is it genuinely wired up properly?"
 *
 * It is, and nothing measured that before this file: the chain runs seizure -> gaol -> burn ->
 * pole -> somebody of yours stands at it -> `pyreRead` -> her gate opens -> she joins, and every
 * link of it works. So the first job here is to DRIVE THE WHOLE CHAIN and prove that, because
 * "is it wired" is a question a probe can answer and an eyeball cannot.
 *
 * The second job is the thing that was actually wrong, which is not wiring:
 *
 *   · every pole in the world stood at the BASTION GATE — measured at 777 tiles from where
 *     Albedo was placed, on Paladin ground that hunts necromancers
 *   · and her refusal named that place without ever saying which way it was
 *
 * The Order now burns at whichever of its two grounds is nearer the town it took the suspect
 * from, and its second ground is Saltmere's standing fire — a town fanatically devoted to it,
 * with four Paladins billeted in it, which you can walk into as an ordinary visitor. The pole is
 * still real and the name on it is still somebody who was held for seven days: NOTHING about her
 * gate is relaxed, and the standing fire is still not a pole at worldgen. It is only possible to
 * walk to now.
 *
 * Anything starting '!!' fails the build.
 *
 *   node tools/albedo.js [game.html]
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
    const alb = chars.find(c => c.wanderKey === 'albedo');
    R.sheExists = alb ? `${alb.name} is in the world at ${Math.round(alb.x)},${Math.round(alb.y)}` : '!! ALBEDO IS NOT IN THE WORLD';
    if(!alb) return R;
    /* AND SHE IS STANDING SOMEWHERE YOU CAN REACH — a recruit inside a wall is not a recruit */
    R.sheIsReachable = !isBlocked(alb.x, alb.y) &&
      !buildings.some(b2 => alb.x >= b2.x && alb.x < b2.x + b2.w && alb.y >= b2.y && alb.y < b2.y + b2.h)
      ? 'on open ground, not sealed inside a roof'
      : '!! ALBEDO IS STANDING SOMEWHERE YOU CANNOT GET TO';
    const home = towns.slice().sort((a, b2) => dist(a.x, a.y, alb.x, alb.y) - dist(b2.x, b2.y, alb.x, alb.y))[0];
    R.sheIsInATown = dist(home.x, home.y, alb.x, alb.y) < 12
      ? `among people who have agreed not to notice, at ${home.name}`
      : `!! SHE IS ${Math.round(dist(home.x, home.y, alb.x, alb.y))} TILES FROM THE NEAREST TOWN`;

    /* ---- THE GATE, BEFORE ANYTHING HAS HAPPENED ---- */
    R.shutAtFirst = wandererGate(alb).ok === false
      ? 'and she asks for a name off a pole, which nobody has built yet'
      : '!! HER GATE IS OPEN ON DAY ONE';

    /* ---- THE ORDER HAS TWO GROUNDS NOW, AND USES THE NEARER ---- */
    const bg = bastion && bastion.pyre;
    const sg = (typeof saltmere !== 'undefined' && saltmere) ? saltmere.pyre : null;
    R.twoGrounds = bg && sg
      ? `two burning grounds: the Bastion gate, and ${saltmere.town.name}'s standing fire`
      : `!! ONLY ${[bg, sg].filter(Boolean).length} BURNING GROUND(S)`;
    if(sg){
      /* AND THE SPLIT IS REAL. If every town is still nearer the Bastion, the second ground is
         decoration — so require at least one seat to actually route to Saltmere. */
      /* ---------- ASK THE BURNING, NOT THE MAP ----------
         The first version of this claim compared distances and said "2 seats are nearer the
         fire" — which was TRUE on the build before this work, where `burnHeretic` sent every
         body to the Bastion gate regardless. Geometry is not behaviour. Take somebody out of
         the town the fire is in, burn them, and see where the pole goes up. */
      const toSalt = towns.filter(t => dist(sg.x, sg.y, t.x, t.y) < dist(bg.x, bg.y, t.x, t.y));
      const st = saltmere.town;
      const mark = makeChar('Suspect', 'town', st.x + 2, st.y + 2, {atk:5, def:5, tough:5});
      mark.civ = true; mark.homeTown = st; chars.push(mark);
      const n0 = pyres.length;
      burnHeretic(mark);
      const fresh = pyres[pyres.length - 1];
      R.theSplitIsReal = pyres.length === n0 + 1 && dist(fresh.x, fresh.y, sg.x, sg.y) < 8
        ? `somebody taken out of ${st.name} burns on ${st.name}'s own fire, not ${Math.round(dist(sg.x, sg.y, bg.x, bg.y))} tiles away at the Bastion` +
          ` (${toSalt.length} seat(s) route here: ${toSalt.map(t => t.name).join(', ')})`
        : `!! A SUSPECT FROM ${st.name} WAS STILL BURNED ${Math.round(dist(fresh.x, fresh.y, st.x, st.y))} TILES AWAY`;
      /* and it is a REAL pole with a REAL name, not a decoration */
      R.aRealName = fresh && fresh.name === mark.name && fresh.day === day
        ? `and the pole carries a name and a date, like any other`
        : '!! THE POLE AT THE FIRE IS NOT A PROPER ONE';
      /* clear it back out so the chain below starts from nothing, as it would in a fresh world */
      pyres.length = n0;
      R.stillNotAPoleYet = !pyres.some(q => dist(q.x, q.y, sg.x, sg.y) < 8)
        ? 'and at worldgen the standing fire is still not a pole — she cannot be paid off with a fire nobody burned on'
        : '!! THERE IS A POLE AT SALTMERE BEFORE ANYBODY WAS BURNED';
    }

    /* ---- NOW DRIVE THE WHOLE CHAIN, THROUGH THE REAL DAY TICK ----
       Not by pushing a pole into the array: the entire question is whether the Order does this
       on its own, and every link between "a day passes" and "she joins" is a link that can rot. */
    let seized = 0, burned = 0;
    const log0 = log;
    window.log = (m, k) => { if(/Paladins have taken/.test(m)) seized++; if(/has been burned at/.test(m)) burned++; return log0(m, k); };
    for(let d = 0; d < 200 && !pyres.length; d++){ day++; questionTick(); }
    window.log = log0;
    R.theOrderWorks = pyres.length
      ? `left alone, the Order took ${seized} and burned ${burned} — the first pole by day ${pyres[0].day}`
      : '!! TWO HUNDRED DAYS AND THE ORDER NEVER BURNED ANYBODY';
    if(!pyres.length) return R;

    /* AND HER REFUSAL SAYS WHICH WAY. The original fault this gate was written to fix was that a
       burning went past in the feed and nothing said where to go; "there are three of them" and
       no bearing is the same fault with a bigger number on it. */
    const why = wandererGate(alb).why || '';
    R.sheSaysWhere = /of here/.test(why)
      ? `and she tells you where: "...${why.slice(-58)}"`
      : `!! HER REFUSAL STILL GIVES NO BEARING: "${why}"`;
    /* AND THE JOURNAL HAS A MARK ON IT */
    const th = (typeof threads !== 'undefined') ? threads.find(t => t.key === 'pyre') : null;
    R.aMarkOnTheMap = th && th.mark
      ? `and the journal carries a mark at ${Math.round(th.mark.x)},${Math.round(th.mark.y)}`
      : '!! NOTHING PUT A MARK ON THE MAP';

    /* ---- STAND AT ONE, THROUGH `witnessTick` AND NOT BY HAND ---- */
    const py = pyres[0];
    const me = player().find(c => c.state === 'ok');
    me.x = py.x; me.y = py.y; me.floor = 0;
    rebuildCharGrid();
    witnessTick();
    R.readingItCounts = pyreRead && pyreRead.name === py.name
      ? `standing at the pole reads the name off it: ${pyreRead.name}, day ${pyreRead.day}`
      : '!! STANDING AT A POLE DOES NOT READ IT';
    R.gateOpens = wandererGate(alb).ok
      ? `and her gate opens — "${wandererGate(alb).label}"`
      : `!! THE NAME DID NOT OPEN HER GATE (${wandererGate(alb).why})`;
    const n0 = player().length;
    const joined = recruitWanderer(alb);
    R.sheJoins = joined && alb.faction === 'player' && player().length === n0 + 1
      ? `and she joins: ${n0} of yours becomes ${player().length}`
      : `!! SHE DOES NOT JOIN (returned ${joined}, faction ${alb.faction}, squad ${n0} -> ${player().length})`;
    return R;
  });

  console.log('=== ALBEDO ===\n');
  for (const [k, v] of Object.entries(out)) console.log('  ' + k.padEnd(18) + v);
  const bad = Object.values(out).map(String).filter(v => v.startsWith('!!'));
  console.log('\n' + (bad.length ? '*** ' + bad.join('\n*** ') : 'THEY HAD ONLY DECIDED NOT TO NOTICE YET'));
  if (errs.length) { console.log('errs:', errs.length); errs.slice(0, 4).forEach(e => console.log('  ' + e)); }
  await b.close();
  if (bad.length) process.exitCode = 1;
})();
