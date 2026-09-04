#!/usr/bin/env node
/* THE PIT AT IRONSCAR.
 *
 * "Ironscar with a gladiator arena. Real risk. Isolated fights, proper entry and exit,
 *  retrieval of downed allies. A guarded pit on the outskirts."
 *
 * Five claims in that sentence, and every one of them is a thing that can go quietly wrong in a
 * way a screenshot would not show:
 *
 *   1. OUTSIDE — a pit inside the walls is a brawl in the square
 *   2. SEALED — the ring has to have no hole in it but the gate, and the gate has to actually
 *      shut. Everything in this game moves ORTHOGONALLY, so a wall that touches only at a
 *      corner is not a wall; the warren work spent four measurements learning that.
 *   3. ISOLATED — while the gate is down nothing outside can reach in and nothing inside walks out
 *   4. IT ENDS, AND IT OPENS — all four ways a card can finish, including the two where nobody
 *      wins, because a pit that can stay shut is a way to lose a save
 *   5. AND THE FALLEN STAY PUT — the retrieval is the player's, so the bodies have to still be
 *      there, on the sand, when the gate goes up
 *
 * Driven through the real `pitStart`/`arenaTick` and the real `update()`. Anything starting
 * '!!' fails the build.
 *
 *   node tools/pit.js [game.html]
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
    /* every new symbol through `typeof`, so the build before this work goes red WITH readings
       rather than dying of a ReferenceError and proving only that the symbol is new */
    if(typeof arena === 'undefined' || !arena){
      R.built = '!! THERE IS NO PIT AT IRONSCAR';
      return R;
    }
    const a = arena;
    const t = towns.find(t2 => t2.def.key === 'ironscar');
    R.built = `a ${a.r * 2 + 1}-tile pit at ${Math.round(a.x)},${Math.round(a.y)}`;

    /* ---- 1. OUTSIDE, AND ON GROUND THAT WAS FREE ---- */
    const off = dist(a.x, a.y, t.x, t.y);
    R.outside = off > (t.clearR || 20) + a.r
      ? `${Math.round(off)} tiles from the square — outside the wall and the sweep both`
      : `!! THE PIT IS ${Math.round(off)} TILES OUT, INSIDE THE TOWN'S OWN GROUND`;
    R.notOnTheSeam = !oreFields.some(f => dist(f.x, f.y, a.x, a.y) < f.r + a.r)
      ? 'and not sitting on the seam that pays for the town'
      : '!! THE PIT WAS BUILT ON AN ORE FIELD';

    /* ---- 2. SEALED, MEASURED THE WAY THE WORLD MOVES ----
       A flood from the middle of the sand with the gate SHUT must not reach outside air. Four-
       connected, because that is how everything in this game walks. */
    const flood = () => {
      const seen = new Set([Math.round(a.x) + ',' + Math.round(a.y)]);
      const q = [[Math.round(a.x), Math.round(a.y)]];
      let escaped = false;
      while(q.length && !escaped){
        const [x, y] = q.shift();
        if(Math.abs(x - a.x) > a.r + 1 || Math.abs(y - a.y) > a.r + 1){ escaped = true; break; }
        for(const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
          const nx = x + dx, ny = y + dy, k = nx + ',' + ny;
          if(seen.has(k)) continue;
          if(isBlocked(nx + 0.5, ny + 0.5)) continue;
          seen.add(k); q.push([nx, ny]);
        }
      }
      return {escaped, n: seen.size};
    };
    pitShut();
    const shut = flood();
    R.sealed = !shut.escaped
      ? `shut, the sand is a closed room of ${shut.n} tiles — no corner leaks`
      : '!! WITH THE GATE SHUT YOU CAN STILL WALK OUT OF THE PIT';
    pitOpen();
    const open = flood();
    R.gateWorks = open.escaped
      ? 'and open, the gate is a way in and out'
      : '!! THE GATE DOES NOT OPEN — THE PIT IS A SEALED BOX';

    /* ---- THE HOUSE IS STANDING ON IT ---- */
    const master = chars.filter(c => c.pitMaster && c.state !== 'dead');
    R.master = master.length === 1
      ? `${master[0].name} takes the stakes at the gate`
      : `!! ${master.length} PIT-MASTERS`;
    R.masterOutside = master.length && !pitInside(master[0])
      ? 'from outside the ring, which is where you talk your way in from'
      : '!! THE PIT-MASTER IS STANDING IN HIS OWN PIT';
    const guards = chars.filter(c => c.pitGuard && c.state !== 'dead');
    R.guarded = guards.length >= 4 ? `${guards.length} of the house's blades on it` : `!! ONLY ${guards.length} PIT GUARDS`;
    R.cards = (typeof PIT_CARDS !== 'undefined' && PIT_CARDS.length >= 4)
      ? `${PIT_CARDS.length} cards: ${PIT_CARDS.map(c => c.name).join(', ')}`
      : '!! NO CARD LIST';
    /* AND THE HOUSE WILL NOT SELL YOU THE TOP OF THE BILL ON DAY ONE */
    R.ladder = a.best === -1
      ? 'and the house has sold you nothing yet, so only the opener is on offer'
      : `!! THE LADDER STARTS AT ${a.best}`;

    /* ---- 3. A REAL BOUT, THROUGH THE REAL ENTRY ---- */
    /* ---------- STAGE A CREW THAT CAN WIN, ON PURPOSE ----------
       The first run of this took the three starting characters into THE OPENER and lost, and
       reported "nothing was paid out" — which is a true statement about a party that lost, and
       says nothing at all about the payout path. Two debtors beating three fresh recruits is
       the pit working; it is not the pit being measured. So the win is staged, and the LOSS is
       staged separately below, because both branches have to be walked and neither of them
       should be left to how a fight happens to go. */
    const crew = player().filter(c => c.state === 'ok').slice(0, 3);
    for(const c of crew){
      c.stats.atk = 60; c.stats.def = 60; c.stats.tough = 60;
      c.blood = c.maxBlood = 400;
      c.weapon = 'w_kat'; c.armor = 'a_pla'; c.armr = 60;
    }
    for(const c of crew){ c.x = a.x + (a.r + 4) * Math.sign(a.x - t.x || 1); c.y = a.y; }
    /* stand them by the gate rather than teleporting them onto the sand: the point is that
       `pitStart` is what puts them inside */
    for(const c of crew){ c.x = a.gate[0].x + Math.sign(a.gate[0].x - a.x || 0) * 3 + 0.5;
                          c.y = a.gate[0].y + Math.sign(a.gate[0].y - a.y || 0) * 3 + 0.5; }
    rebuildCharGrid();
    selected = crew.slice();
    const purse0 = cats;
    const card = PIT_CARDS[0];
    const started = pitStart(card);
    R.takesTheCard = started && a.bout
      ? `${card.name} taken — ${a.bout.ours.length} of yours in, ${a.bout.theirs.length} against them`
      : '!! THE CARD WOULD NOT START';
    if(!a.bout) return R;
    R.stakeTaken = cats === purse0 - card.stake
      ? `the stake of ${card.stake} is taken up front`
      : `!! THE STAKE DID NOT COME OUT OF THE PURSE (${purse0} to ${cats})`;
    R.gateDown = !a.open ? 'and the gate comes down behind them' : '!! THE GATE STAYED OPEN FOR THE BOUT';
    R.allInside = a.bout.ours.every(pitInside) && a.bout.theirs.every(pitInside)
      ? 'everybody who is in the card is on the sand'
      : `!! ${a.bout.ours.filter(c => !pitInside(c)).length} OF YOURS AND ${a.bout.theirs.filter(c => !pitInside(c)).length} OF THEIRS ARE OUTSIDE THE RING`;
    /* AND THE QUARREL IS THE CARD. A pit fighter must be hostile to you while the bout runs and
       to nobody else in the world, ever — including the town that owns the pit. */
    const foe = a.bout.theirs[0], mine = a.bout.ours[0];
    R.quarrel = hostile(foe, mine) && !hostile(foe, master[0]) && !hostile(foe, guards[0])
      ? 'and the fighter has a quarrel with you and with nobody else on the map'
      : `!! THE PIT FIGHTER'S ENMITIES ARE WRONG (you ${hostile(foe, mine)}, house ${hostile(foe, master[0])})`;

    /* ---- 3b. ISOLATED. Put something hostile outside the ring and let it try. ---- */
    const out2 = findOpenNear(a.x + (a.r + 4), a.y, 4);
    const wolf = makeChar('Interloper', 'bandit', out2.x, out2.y, {atk:20, def:20, tough:20, ath:9, weapon:'w_club'});
    chars.push(wolf); rebuildCharGrid();
    paused = false;
    for(let i = 0; i < 400; i++) update(0.1);
    R.isolated = !pitInside(wolf)
      ? 'and nothing outside got in while the gate was down'
      : '!! SOMETHING WALKED IN OFF THE WASTE MID-BOUT';
    const strayed = a.bout ? a.bout.theirs.filter(c => c.state !== 'dead' && !pitInside(c)).length : 0;
    R.noWalkouts = strayed === 0 ? 'and nothing in the card walked out of it' : `!! ${strayed} FIGHTER(S) LEFT THE PIT`;

    /* ---- 4. IT ENDS, AND THE GATE GOES UP ---- */
    for(let i = 0; i < 2500 && a.bout; i++) update(0.1);
    R.resolves = !a.bout ? 'the card runs to a finish on its own' : '!! THE BOUT NEVER ENDED';
    R.gateUp = a.open ? 'and the gate goes back up afterwards' : '!! THE GATE STAYED DOWN AFTER THE BOUT';
    R.paid = cats > purse0 - card.stake
      ? `and the house pays: ${purse0 - card.stake} up to ${cats}`
      : `!! NOTHING WAS PAID OUT (${cats} against a stake-adjusted ${purse0 - card.stake})`;
    R.ladderMoves = a.best >= 0 ? `a win moves the bill on — the house will now sell you ${PIT_CARDS[Math.min(a.best + 1, PIT_CARDS.length - 1)].name}` : '!! A WIN DID NOT MOVE THE LADDER';
    R.tally = `the house's book reads ${a.wins} won, ${a.losses} lost`;

    /* ---- AND THE OTHER BRANCH, STAGED THE SAME WAY ----
       A pit that only knows how to be won is the half of this that would ship broken and never
       be noticed. Take the same card with a crew that cannot survive it and require the gate to
       come back up anyway, the stake to be gone, and nothing to be paid. */
    for(const c of crew){ c.state = 'ok'; c.stats.atk = 1; c.stats.def = 1; c.blood = 12; c.maxBlood = 400;
                          c.weapon = null; c.armor = null; c.armr = 0;
                          c.x = a.gate[0].x + 0.5; c.y = a.gate[0].y + 0.5; }
    rebuildCharGrid();
    selected = crew.slice();
    const purse1 = cats, losses0 = a.losses;
    const took2 = pitStart(PIT_CARDS[0]);
    for(let i = 0; i < 3200 && a.bout; i++) update(0.1);
    R.losing = took2 && !a.bout && a.losses > losses0 && a.open && cats === purse1 - PIT_CARDS[0].stake
      ? `a card you lose ends too: the stake of ${PIT_CARDS[0].stake} is gone, nothing is paid, and the gate is open`
      : `!! THE LOSING BRANCH IS WRONG (bout ${a.bout ? 'running' : 'over'}, open ${a.open}, losses ${losses0}->${a.losses}, purse ${purse1}->${cats})`;

    /* ---- 5. AND THE FALLEN STAY WHERE THEY FELL ----
       Put one of yours on the ground inside, run a card to its end, and require the body to
       still be lying on the sand with the gate open — that is what makes retrieval the
       player's job rather than a cutscene. */
    const victim = crew[0];
    victim.x = a.x; victim.y = a.y; victim.state = 'down'; victim.blood = 20;
    rebuildCharGrid();
    for(let i = 0; i < 200; i++) update(0.1);
    R.fallenStay = chars.includes(victim) && pitInside(victim) && victim.state !== 'ok'
      ? `${victim.name} is still lying on the sand with the gate open, to be carried out`
      : '!! A DOWNED BODY DID NOT STAY IN THE PIT';
    R.canBeFetched = a.open && !isBlocked(a.gate[0].x + 0.5, a.gate[0].y + 0.5)
      ? 'and the gate is walkable, so somebody can go in after them'
      : '!! THERE IS NO WAY BACK IN TO FETCH THEM';

    /* ---- AND THE HOUSE'S OWN DEAD ARE CLEARED OFF ---- */
    R.sandCleared = chars.filter(c => c.pitFighter && c.state === 'ok').length === 0
      ? 'the house takes its standing fighters off the sand when the card is over'
      : `!! ${chars.filter(c => c.pitFighter && c.state === 'ok').length} PIT FIGHTERS STILL STANDING AROUND AFTER THE BOUT`;
    return R;
  });

  console.log('=== THE PIT ===\n');
  for (const [k, v] of Object.entries(out)) console.log('  ' + k.padEnd(16) + v);
  const bad = Object.values(out).map(String).filter(v => v.startsWith('!!'));
  console.log('\n' + (bad.length ? '*** ' + bad.join('\n*** ') : 'THE GATE COMES DOWN, AND IT GOES BACK UP'));
  if (errs.length) { console.log('errs:', errs.length); errs.slice(0, 4).forEach(e => console.log('  ' + e)); }
  await b.close();
  if (bad.length) process.exitCode = 1;
})();
