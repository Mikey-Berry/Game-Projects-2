#!/usr/bin/env node
/* The four things a player does to a town that is not a fight.
 *
 * Every one of these was reported from play rather than found by reading, and every one of
 * them is a system that looks implemented from the code and does not happen at the mouse:
 *
 *   1. Talking to a leader. The conquest flag stands at the hall door and the ruler stands a
 *      stride behind it, so the flag's click radius ate every right-click on the one person
 *      in the game who has politics. The only thing the game could say was THE SEAT STILL
 *      STANDS — an instruction to murder somebody you were trying to greet.
 *   2. Putting a body down. There was a panel button and no right-click, so a corpse over a
 *      shoulder stayed there until it was raised or rendered.
 *   3. Getting arrested. A guard hauling a prisoner still scanned for quarry, and the combat
 *      code leashes a guard home when the chase runs long — so the watch walked you to a
 *      corner of the wall and stood there. The trip to the gaol lives past a branch the
 *      guard never reached.
 *   4. Paying a bounty. It cleared arrestTarget on the arresting guards and nothing else:
 *      not `provoked`, not your own standing order on them, and not the rep floor that makes
 *      a town hostile on sight whatever the ledger says.
 *
 *   node tools/civics.js [game.html]
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
  p.on('pageerror', e => errs.push(e.message.slice(0, 220)));
  await p.goto('file://' + gamePath(process.argv[2]), { waitUntil: 'load' });
  await p.waitForTimeout(3000);
  await p.evaluate(() => document.getElementById('btn-start').click());
  await p.waitForTimeout(3000);

  /* ---------------- 1. THE SEAT HAS A PERSON IN IT ---------------- */
  const rule = await p.evaluate(() => {
    const R = {};
    const t = towns.find(tt => !tt.playerRuled && seatHolder(tt)) || towns[0];
    const L = seatHolder(t), f = townFlagPos(t);
    R.town = t.name;
    R.rulerFound = !!L;
    if (!L) return R;
    R.flagToRuler = +dist(L.x, L.y, f.x, f.y).toFixed(2);
    /* click exactly on the ruler: the flag must yield */
    R.flagYieldsToRuler = flagAt(L.x, L.y, L) === null ? 'person wins' : 'FLAG STILL WINS';
    /* click on the flag with nobody standing in it: the flag must still work */
    R.flagStillClickable = flagAt(f.x, f.y, null) === t ? 'flag wins' : 'FLAG UNREACHABLE';
    /* and a person standing further off does not steal the flag click */
    const far = { x: f.x + 1.4, y: f.y };
    R.farPersonNoSteal = flagAt(f.x, f.y, far) === t ? 'flag wins' : 'PERSON STOLE IT';
    /* the audience door itself */
    R.leaderIndex = L.isLeader;
    R.titled = t.leader.title + ' ' + L.name;
    let opened = false;
    const realShow = showCtxMenu;
    showCtxMenu = (x, y, items) => { opened = items.map(i => i.label); };
    try { openAudience(10, 10, L); } finally { showCtxMenu = realShow; }
    R.audienceItems = opened || 'NO MENU';
    R.claimableWhileHeld = claimable(t) ? 'CLAIMABLE (should not be)' : 'held';
    return R;
  });

  /* ---------------- 2. PUTTING A BODY DOWN ---------------- */
  const carry = await p.evaluate(() => {
    const R = {};
    const hand = player().find(c => c.state === 'ok');
    const victim = makeChar('Test Body', 'bandit', hand.x + 2, hand.y);
    chars.push(victim);
    kill(victim, null);
    const body = corpses.find(b2 => b2.name === 'Test Body');
    R.corpseMade = !!body;
    if (!body) return R;
    hand.x = body.x; hand.y = body.y;
    R.tookIt = takeBody(hand, body) ? 'carried' : 'REFUSED';
    R.bearerFound = whoCarries(body) === hand ? 'found the bearer' : 'BEARER NOT FOUND';
    /* set it down two tiles away — must clamp to arm's reach, must actually leave the hands */
    const put = dropOneBody(hand, body, { x: hand.x + 6, y: hand.y });
    R.putDown = put ? 'set down' : 'REFUSED';
    R.stillCarried = carried(hand);
    R.withinReach = +dist(hand.x, hand.y, body.x, body.y).toFixed(2);
    R.canRetake = takeBody(hand, body) ? 'can pick it up again' : 'STUCK ON THE GROUND';
    /* a mule with three: one down, two left */
    const mule = makeChar('Test Mule', 'player', hand.x, hand.y, {});
    mule.mule = true; chars.push(mule);
    const three = [];
    for (let i = 0; i < 3; i++) {
      const v = makeChar('Load ' + i, 'bandit', mule.x + 1 + i, mule.y);
      chars.push(v); kill(v, null);
      const bd = corpses.find(x => x.name === 'Load ' + i);
      three.push(bd); takeBody(mule, bd);
    }
    R.muleLoaded = carried(mule);
    dropOneBody(mule, three[1]);
    R.muleAfterOne = carried(mule);
    R.rightOneLeft = (carried(mule) === 2 && !bodiesOf(mule).includes(three[1])) ? 'the named body left' : 'WRONG BODY DROPPED';
    return R;
  });

  /* ---------------- 3. THE WATCH WALKS YOU TO THE GAOL ---------------- */
  const arrest = await p.evaluate(async () => {
    const R = {};
    const t = towns.find(tt => !tt.def.undeadFriendly && !tt.playerRuled && tt.gaolPost) || towns[0];
    const cell = freeCell(t);
    R.cellFound = !!cell;
    if (!cell) return R;
    /* a guard standing at their post, out at the wall, with a downed player at their feet —
       exactly the shape of an arrest that happened away from the gaol */
    const g = chars.find(o => o.faction === 'town' && !o.civ && o.guard && o.homeTown === t && o.state === 'ok');
    R.guardFound = !!g;
    if (!g) return R;
    R.postToGaol = +dist(g.guard.x, g.guard.y, cell.x, cell.y).toFixed(1);

    const perp = makeChar('Test Perp', 'player', g.x + 0.5, g.y + 0.5, { tough: 60 });
    chars.push(perp);
    perp.state = 'down'; perp.downT = 1;
    t.bounty = 300; t.wanted = true;
    /* and something hostile in the road, which is what used to steal the guard's attention */
    const heckler = makeChar('Test Heckler', 'player', g.x + 4, g.y + 1, { tough: 40 });
    chars.push(heckler);

    /* hand-run the tick rather than waiting on wall-clock: 20Hz for four sim minutes */
    for (let i = 0; i < 4800; i++) {
      for (const c of chars) { if (c.state !== 'dead') { ai(c, 0.05); physics(c, 0.05); } }
      if (perp.jailedAt) break;
    }
    R.grabbedOrJailed = perp.jailedAt ? 'jailed' : (chars.some(o => o.drag === perp) ? 'STILL BEING CARRIED' : 'NEITHER');
    R.endedInACell = perp.jailedAt ? 'in a cell' : 'NOT IN A CELL';
    R.distToCell = +dist(perp.x, perp.y, cell.x, cell.y).toFixed(2);
    R.sentence = perp.jailT;
    R.guardStayedOnTask = g.drag ? 'STILL HAULING' : 'delivered';
    R.notDumpedAtThePost = perp.jailedAt ? 'gaol, not the wall'
      : (dist(perp.x, perp.y, g.guard.x, g.guard.y) < 3 ? 'DUMPED AT THE POST' : 'somewhere else');
    return R;
  });

  /* ---------------- 4. A PAID BOUNTY IS A PAID BOUNTY ---------------- */
  const paid = await p.evaluate(() => {
    const R = {};
    const t = towns.find(tt => !tt.playerRuled) || towns[0];
    const hand = player().find(c => c.state === 'ok');
    /* the state a real fight leaves behind: a big bounty, rep in the floor, guards swinging,
       and one of your own with a standing order on a guard */
    t.bounty = 600; t.wanted = true; t.rep = -80; t.warnedHostile = true;
    const guards = chars.filter(o => o.faction === 'town' && o.homeTown === t && o.state === 'ok').slice(0, 4);
    R.guardsSet = guards.length;
    for (const g of guards) { g.provoked = true; g.target = hand; }
    guards[0].arrestTarget = hand;
    hand.target = guards[1]; hand.targetManual = true; hand.orderTarget = guards[1];
    R.hostileBefore = hostile(guards[2], hand) ? 'hostile' : 'not hostile';

    cats = 5000;
    R.settled = settleBounty(t, 900, 'The Leader') ? 'paid' : 'REFUSED';
    R.bountyAfter = t.bounty;
    R.repAfter = t.rep;
    R.guardsStillProvoked = guards.filter(g => g.provoked).length;
    R.guardsStillSwinging = guards.filter(g => g.target === hand).length;
    R.arrestCleared = guards.some(g => g.arrestTarget) ? 'STILL WANTED' : 'called off';
    R.yourOrderCleared = (hand.target || hand.orderTarget) ? 'STILL ATTACKING THEM' : 'stood down';
    R.hostileAfter = guards.filter(g => hostile(g, hand)).length;
    return R;
  });

  const show = (title, o) => {
    console.log('\n' + title);
    for (const k in o) console.log('  ' + k.padEnd(22), Array.isArray(o[k]) ? o[k].join(' | ') : o[k]);
  };
  show('1. THE SEAT', rule);
  show('2. SETTING A BODY DOWN', carry);
  show('3. THE ARREST', arrest);
  show('4. SETTLING UP', paid);

  const bad = [];
  if (rule.flagYieldsToRuler !== 'person wins') bad.push('the flag still eats the ruler');
  if (rule.flagStillClickable !== 'flag wins') bad.push('the flag is no longer clickable');
  if (rule.farPersonNoSteal !== 'flag wins') bad.push('a bystander steals the flag click');
  if (!Array.isArray(rule.audienceItems) || !rule.audienceItems.some(l => l === 'TALK')) bad.push('no audience');
  if (carry.putDown !== 'set down' || carry.stillCarried !== 0) bad.push('a body cannot be set down');
  if (carry.withinReach > 1.7) bad.push('a body can be thrown');
  if (carry.rightOneLeft !== 'the named body left') bad.push('a mule drops the wrong body');
  if (arrest.endedInACell !== 'in a cell') bad.push('the watch does not reach the gaol');
  if (paid.guardsStillProvoked || paid.guardsStillSwinging) bad.push('paid guards keep swinging');
  if (paid.yourOrderCleared !== 'stood down') bad.push('your own order outlives the payment');
  if (paid.hostileAfter) bad.push('the town is hostile on rep after paying');
  if (errs.length) bad.push('page errors: ' + errs.join(' / '));

  console.log('\n' + (bad.length ? 'BROKEN: ' + bad.join('; ') : 'CIVICS HOLD'));
  await b.close();
  process.exit(bad.length ? 1 : 0);
})();
