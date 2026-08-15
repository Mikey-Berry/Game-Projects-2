#!/usr/bin/env node
/* WALL RUNS, THE HARVEST ROUNDS, AND PAYING OFF A PRICE ON YOUR HEAD.
 *
 * Three notes, all of the same shape: the mechanic existed but the only way to use it was
 * to do it a hundred times by hand, or there was no door to it at all.
 *
 *   1. one gesture stakes out a straight RUN of walls, and each tile is still an ordinary
 *      1x1 wall — because eleven other pieces of logic look a wall up by its exact tile
 *   2. a hand on HARVEST walks to bodies, loots them, then renders them down — and does NOT
 *      touch townsfolk, your own fallen, or anything somebody else has a claim on
 *   3. a bounty can always be paid: at the Leader's desk, at the bar in the same town, or
 *      through the bar in any other town at a courier's premium
 *
 * Every block ends in a verdict. Anything starting '!!' fails the build.
 *
 *   node tools/chores.js [game.html]
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
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message.slice(0, 220)));
  p.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text().slice(0, 220)); });
  await p.goto('file://' + gamePath(process.argv[2]), { waitUntil: 'load' });
  await p.waitForTimeout(3000);
  await p.evaluate(() => document.getElementById('btn-start').click());
  await p.waitForTimeout(3000);

  const out = await p.evaluate(() => {
    const R = {};

    /* ============================================================ 1. WALL RUNS */

    /* A run is axis-locked: the longer delta wins, so a rough drag still gives a clean line.
       Measured against the code under test, not a reimplementation of it. */
    {
      const east = runTiles(10, 10, 19, 12);
      const north = runTiles(10, 10, 12, 22);
      R.runAxis = (east.length === 10 && east.every(([, y]) => y === 10) &&
                   north.length === 13 && north.every(([x]) => x === 10))
        ? `10 east stays on row 10, 13 north stays on column 10`
        : `!! RUN IS NOT AXIS-LOCKED (${east.length} east, ${north.length} north)`;
      const back = runTiles(30, 30, 26, 30);
      R.runBack = (back.length === 5 && back[0][0] === 30 && back[4][0] === 26)
        ? 'a run drawn backwards still runs from the anchor'
        : `!! BACKWARDS RUN IS WRONG (${JSON.stringify(back)})`;
      const huge = runTiles(0, 0, 500, 0);
      R.runCap = huge.length === RUN_CAP
        ? `a 500-tile drag is capped at ${RUN_CAP}`
        : `!! RUN CAP NOT ENFORCED (${huge.length} tiles)`;
      const dot = runTiles(7, 7, 7, 7);
      R.runOne = dot.length === 1 ? 'anchor and release on one tile lays exactly one wall'
                                  : `!! SINGLE-TILE RUN LAID ${dot.length}`;
    }

    /* Each tile of a run must be a genuine 1x1 wall blueprint — the whole reason for keeping
       the footprint is that decks, emplacement mounts, siege damage and the upkeep tally all
       look a wall up by its exact tile. A wider footprint would break every one of them. */
    {
      blueprints.length = 0;
      /* somewhere flat and empty, well clear of any town */
      let ax = 0, ay = 0;
      outer:
      for (let y = 40; y < 220; y += 3) for (let x = 40; x < 220; x += 3) {
        let clear = true;
        for (let i = 0; i < 8; i++) if (isBlocked(x + i + 0.5, y + 0.5)) { clear = false; break; }
        if (clear && !towns.some(t => Math.abs(t.x - x) < 40 && Math.abs(t.y - y) < 40)) { ax = x; ay = y; break outer; }
      }
      R.runGround = ax ? `open ground found at ${ax},${ay}` : '!! NO OPEN GROUND TO TEST ON';
      const laid = buildRun('wall', ax, ay, ax + 7, ay);
      const staked = blueprints.filter(o => o.type === 'wall');
      R.runLaid = laid === 8 && staked.length === 8
        ? `one gesture staked out ${laid} walls`
        : `!! ONE GESTURE LAID ${laid} (${staked.length} blueprints)`;
      R.runShape = staked.every(o => o.w === 1 && o.h === 1)
        ? 'every tile is still a 1x1 wall'
        : '!! A RUN TILE IS NOT 1x1';
      const xs = staked.map(o => o.x).sort((a, b) => a - b);
      R.runContiguous = (new Set(staked.map(o => o.y)).size === 1 &&
                         xs.every((x, i) => i === 0 || x === xs[i - 1] + 1))
        ? 'and they are contiguous, with no gaps to walk through'
        : '!! THE RUN HAS GAPS';
      /* the cost is per tile — a run is a convenience, not a discount */
      const per = buildCost('wall');
      const need = staked.reduce((n, o) => n + (o.need[Object.keys(per)[0]] || 0), 0);
      R.runCost = need === per[Object.keys(per)[0]] * staked.length
        ? `and it costs ${need} — full price, ${staked.length} times over`
        : `!! A RUN IS DISCOUNTED (${need})`;
      /* Blocked tiles are skipped quietly rather than shouting once per tile. Counted off the
         CHRONICLE, not the on-screen log — the visible log keeps only the last seven lines,
         so reading the DOM here would report 'quiet' no matter how loud the run actually was. */
      blueprints.length = 0;
      const before = chronicle.length;
      buildRun('wall', ax, ay, ax + 5, ay);
      const lines = chronicle.length - before;
      R.runQuiet = lines === 1 ? 'a six-tile run says one thing, not six'
                              : `!! A RUN SPAMS THE LOG (${lines} lines)`;
      /* and a run into a mountainside says exactly one thing too, rather than six refusals */
      blueprints.length = 0;
      let bx = 0, by = 0;
      for (let y = 4; y < 250 && !bx; y++) for (let x = 4; x < 250; x++)
        if (isBlocked(x + 0.5, y + 0.5) && isBlocked(x + 1.5, y + 0.5) &&
            isBlocked(x + 2.5, y + 0.5) && isBlocked(x + 3.5, y + 0.5)) { bx = x; by = y; break; }
      if (bx) {
        const b2 = chronicle.length;
        buildRun('wall', bx, by, bx + 3, by);
        const l2 = chronicle.length - b2;
        R.runBlocked = (l2 === 1 && !blueprints.length)
          ? 'a run straight into solid rock refuses once and stakes out nothing'
          : `!! A BLOCKED RUN SAID ${l2} THING(S) AND STAKED ${blueprints.length}`;
      } else R.runBlocked = '(no four-tile block of solid ground found)';
      blueprints.length = 0;
    }

    /* ============================================================ 2. THE HARVEST ROUNDS */

    /* WHAT IS FODDER AND WHAT IS NOT. This is the whole safety story of the job: an
       auto-assigned worker must never rob a neighbour (that is a bounty you did not choose)
       and must never render down your own fallen. */
    {
      const mk = (over) => Object.assign(makeChar('Test Body', 'raider', 100, 100, {}), { state: 'dead' }, over);
      const cases = [
        ['a nameless raider', mk({}), true],
        ['a townsman', mk({ faction: 'town' }), false],
        ['somebody with a home town', mk({ homeTown: towns[0] }), false],
        ['your own fallen', mk({ faction: 'player' }), false],
        ['a grown cadaver', mk({ faction: 'player', grown: true }), true],
        ['a risen thing put down again', mk({ faction: 'player', undead: true }), true],
        ['a named lieutenant', mk({ bossKey: 'sigil' }), false],
        ['a contracted VIP', mk({ vip: true }), false],
        ['one already raised', mk({ raised: true }), false],
      ];
      const wrong = cases.filter(([, body, want]) => carrionFodder(body) !== want).map(([lbl]) => lbl);
      R.fodder = wrong.length ? `!! HARVEST MISJUDGES: ${wrong.join(', ')}`
        : `the job takes ${cases.filter(c => c[2]).length} kinds of body and refuses ${cases.filter(c => !c[2]).length}`;
      /* a corpse somebody is already carrying, or that a necromancer has picked to raise,
         is spoken for — two jobs must not fight over the same body */
      const claimed = mk({});
      chars.push(claimed);
      const hauler = player()[0];
      hauler.carry = claimed;
      R.fodderCarried = !carrionFodder(claimed) ? 'and it leaves alone a body somebody is already carrying'
                                                : '!! HARVEST TAKES A BODY OUT OF SOMEONE\'S ARMS';
      hauler.carry = null; hauler.raiseBody = claimed;
      R.fodderClaimed = !carrionFodder(claimed) ? 'and one the necromancer has already picked'
                                                : '!! HARVEST STEALS THE NECROMANCER\'S CORPSE';
      hauler.raiseBody = null;
      const ci = chars.indexOf(claimed); if (ci >= 0) chars.splice(ci, 1);
    }

    /* The job must be selectable in the panel that sets jobs — a tick that nobody can reach
       is not a feature. Drive the real button, not a list that resembles it. */
    {
      const c0 = player().find(o => o.state === 'ok');
      selected = [c0];
      refreshCharPanel();
      const jb = [...document.querySelectorAll('#jobrow button')].find(b => b.textContent.startsWith('JOB:'));
      if (jb) jb.onclick();
      const opts = [...document.querySelectorAll('#ctxmenu button')].map(b => b.textContent.trim());
      R.harvInMenu = opts.includes('HARVEST')
        ? `HARVEST sits in the JOB menu beside ${opts.length - 1} other trades`
        : `!! HARVEST IS NOT IN THE JOB MENU (${opts.join(',')})`;
      const hb = [...document.querySelectorAll('#ctxmenu button')].find(b => b.textContent.trim() === 'HARVEST');
      if (hb) hb.click();
      R.harvSettable = c0.job === 'carrion' ? 'and choosing it actually sets the job'
                                            : `!! CHOOSING HARVEST SET job=${c0.job}`;
      hideCtxMenu();
    }

    /* The job must know when it has work, and must actually clear a field. */
    {
      corpses.length = 0;
      const c = player().find(o => o.state === 'ok');
      R.harvSubject = c ? `${c.name} takes the HARVEST job` : '!! NOBODY TO ASSIGN';
      R.harvNoWork = !jobHasWork(c, 'carrion') ? 'an empty field offers no harvest work'
                                               : '!! HARVEST CLAIMS WORK WITH NO BODIES';
      /* lay out four raider bodies at arm's reach, with something in their pockets */
      const bodies = [];
      for (let i = 0; i < 4; i++) {
        const body = makeChar('Dead Raider', 'raider', c.x + 1 + i * 0.6, c.y + 1, { atk: 5, def: 5, tough: 5 });
        body.state = 'dead';
        body.deadAt = day + hour / 24;
        body.loot = 12;
        chars.push(body); corpses.push(body); bodies.push(body);
      }
      R.harvWork = jobHasWork(c, 'carrion') ? 'four bodies on the ground is work'
                                            : '!! HARVEST DOES NOT SEE FOUR BODIES';
      const goldBefore = cats, remainsBefore = campHas('remains'), chronLine = chronicle.length;
      c.job = 'carrion'; c.job2 = null;
      clearOrders(c);
      /* run the sim forward by hand — 60s of job ticks is plenty for four bodies at 1.6s a beat */
      for (let i = 0; i < 1800; i++) { c.state = 'ok'; physics(c, 1 / 30); }
      const left = bodies.filter(o => corpses.includes(o)).length;
      R.harvCleared = left === 0 ? 'and the field is clear'
                                 : `!! ${left} OF 4 BODIES STILL LYING THERE`;
      R.harvRemains = campHas('remains') > remainsBefore
        ? `the stores gained ${campHas('remains') - remainsBefore} Mortal Remains`
        : '!! NO REMAINS CAME OUT OF IT';
      R.harvLooted = cats > goldBefore
        ? `and ${cats - goldBefore} gold out of their pockets — looted first, then rendered`
        : '!! THE BODIES WERE RENDERED WITHOUT BEING LOOTED';
      /* and it must not have left them in `chars` as invisible ghosts */
      R.harvGone = bodies.every(o => !chars.includes(o))
        ? 'and nothing is left in the roster'
        : '!! A HARVESTED BODY IS STILL IN chars';
      /* one line per pass, not one per beat — a job that narrates every 1.6s is unreadable */
      const said = chronicle.length - chronLine;
      R.harvQuiet = said <= 9 ? `clearing four bodies wrote ${said} lines, not one a beat`
                              : `!! THE HARVEST JOB FLOODED THE LOG (${said} lines)`;
      c.job = null;
    }

    /* A townsman's body on the same ground must survive the same rounds untouched, and must
       cost you no bounty — this is the difference between a chore and a robbery. */
    {
      const c = player().find(o => o.state === 'ok');
      const t = towns[0];
      t.bounty = 0; t.wanted = false;
      const vic = makeChar('Dead Townsman', 'town', c.x + 1, c.y + 1, { atk: 3, def: 3, tough: 3 });
      vic.state = 'dead'; vic.deadAt = day + hour / 24; vic.homeTown = t; vic.loot = 40;
      chars.push(vic); corpses.push(vic);
      c.job = 'carrion'; clearOrders(c);
      for (let i = 0; i < 600; i++) { c.state = 'ok'; physics(c, 1 / 30); }
      R.harvSpares = corpses.includes(vic) && !vic.looted
        ? 'a townsman lies untouched through the same rounds'
        : '!! THE HARVEST JOB ROBBED A TOWNSMAN';
      R.harvNoCrime = !t.bounty ? 'and it earned you no bounty you did not choose'
                                : `!! THE JOB EARNED A BOUNTY OF ${t.bounty}`;
      c.job = null;
      const vi = corpses.indexOf(vic); if (vi >= 0) corpses.splice(vi, 1);
      const vc = chars.indexOf(vic); if (vc >= 0) chars.splice(vc, 1);
    }

    /* A BODY IT CANNOT REACH MUST NOT EAT THE JOB. Stranded on the far side of the map, the
       nearest-corpse scan re-picks it every two seconds and the hand walks at it forever —
       which in play reads as HARVEST simply doing nothing. */
    {
      const c = player().find(o => o.state === 'ok');
      corpses.length = 0;
      /* the UNREACHABLE one is deliberately the NEARER of the two, so the scan picks it first
         every time and the only thing that can free the hand is the give-up timer */
      const far = makeChar('Unreachable', 'raider', c.x + 2, c.y + 2, { atk: 3, def: 3, tough: 3 });
      far.state = 'dead'; far.deadAt = day + hour / 24;
      chars.push(far); corpses.push(far);
      const near = makeChar('Reachable', 'raider', c.x + 5, c.y + 5, { atk: 3, def: 3, tough: 3 });
      near.state = 'dead'; near.deadAt = day + hour / 24;
      chars.push(near); corpses.push(near);
      const realTravel = window.travel;
      window.travel = function(who, tx, ty, dt2, tol){
        if (Math.abs(tx - far.x) < 1e-6 && Math.abs(ty - far.y) < 1e-6) return false;   /* never arrives */
        return realTravel.apply(this, arguments);
      };
      c.job = 'carrion'; clearOrders(c);
      for (let i = 0; i < 3000; i++) { c.state = 'ok'; physics(c, 1 / 30); }
      window.travel = realTravel;
      R.harvGivesUp = (!corpses.includes(near) && corpses.includes(far))
        ? 'the nearer body it cannot walk to is set aside, and the further one it can reach still gets cleared'
        : `!! AN UNREACHABLE BODY STALLED THE JOB (reachable left: ${corpses.includes(near)})`;
      c.job = null;
      corpses.length = 0;
      for (const o of [far, near]) { const i = chars.indexOf(o); if (i >= 0) chars.splice(i, 1); }
    }

    /* ============================================================ 3. THE LEDGER */

    {
      const t = towns[0], other = towns.find(o => o !== t && !o.playerRuled);
      /* the watch is out and somebody is being walked to a cell */
      t.bounty = 400; t.wanted = true;
      const g = chars.find(o => o.faction === 'town' && o.homeTown === t && !o.civ)
        || Object.assign(makeChar('Watchman', 'town', t.x, t.y, {}), { homeTown: t });
      if (!chars.includes(g)) chars.push(g);
      const victim = player()[0];
      g.arrestTarget = victim; g.drag = victim; victim.captured = true;

      cats = 100;
      const poor = settleBounty(t, Math.round(t.bounty * 1.8), 'Barkeep');
      R.ledgerPoor = (!poor && t.bounty === 400)
        ? 'a purse of 100 does not close a ledger of 400'
        : '!! A BOUNTY WAS CLEARED WITHOUT PAYING FOR IT';

      cats = 5000;
      const price = Math.round(t.bounty * 1.8);
      const paid = settleBounty(t, price, 'Barkeep');
      R.ledgerPaid = (paid && t.bounty === 0 && !t.wanted && cats === 5000 - price)
        ? `settling at the bar cost ${price} and closed the books`
        : `!! SETTLEMENT FAILED (paid ${paid}, bounty ${t.bounty}, purse ${cats})`;
      R.ledgerWatch = (!g.arrestTarget && !g.drag && !victim.captured)
        ? 'the watch stood down mid-arrest and let go of the man they were walking off'
        : '!! THE WATCH KEPT COMING AFTER THE BOUNTY WAS PAID';

      /* THREE DOORS, THREE PRICES. The Leader is cheapest and hardest to reach; the bar in
         the same town costs a cut; any other town's bar costs a courier. */
      const bounty = 1000;
      const leader = Math.round(bounty * 1.5), here = Math.round(bounty * 1.8), away = Math.round(bounty * 2.5);
      R.ledgerPrices = (leader < here && here < away)
        ? `Leader ${leader} < same-town bar ${here} < courier ${away}`
        : '!! THE THREE DOORS ARE NOT PRICED IN ORDER';

      /* and the far door must actually exist: a bar in a town that does NOT want you has to
         offer to send the coin on, or a bounty in a town you cannot enter is still a wall */
      if (other) {
        other.bounty = 600; other.wanted = true;
        const bar = { vt: 'bar', name: 'Barkeep', town: t, x: t.x, y: t.y };
        openBar(bar);
        const rows = [...document.querySelectorAll('#modalbody [data-bounty]')];
        const labels = rows.map(r => r.closest('.trow').textContent);
        R.ledgerFar = labels.some(s => s.includes(other.name))
          ? `the bar in ${t.name} will send the coin on to ${other.name}`
          : `!! NO WAY TO PAY OFF A TOWN YOU CANNOT WALK INTO (rows: ${labels.length})`;
        /* pressing it must actually clear the far town */
        const idx = rows.findIndex(r => r.closest('.trow').textContent.includes(other.name));
        cats = 9000;
        if (idx >= 0) rows[idx].click();
        R.ledgerFarPays = (other.bounty === 0 && !other.wanted)
          ? `and pressing it clears ${other.name} from a hundred tiles away`
          : `!! THE COURIER TOOK THE COIN AND THE BOUNTY STAYED (${other.bounty})`;
        document.getElementById('modal').style.display = 'none';
      } else R.ledgerFar = '(only one town in this world — courier row not exercised)';

      /* a town with no bounty must not clutter the bar with a row for it */
      for (const o of towns) { o.bounty = 0; o.wanted = false; }
      openBar({ vt: 'bar', name: 'Barkeep', town: t, x: t.x, y: t.y });
      R.ledgerClean = document.querySelectorAll('#modalbody [data-bounty]').length === 0
        ? 'and with a clean record the bar says nothing about ledgers at all'
        : '!! THE BAR OFFERS TO SETTLE A BOUNTY THAT DOES NOT EXIST';
      document.getElementById('modal').style.display = 'none';
    }

    return R;
  });

  console.log('\n=== WALL RUNS, THE HARVEST, AND THE LEDGER ===\n');
  for (const [k, v] of Object.entries(out)) if (v) console.log(`  ${k.padEnd(16)} ${v}`);
  const bad = Object.values(out).filter(v => typeof v === 'string' && v.startsWith('!!'));
  if (errs.length) { console.log('\n' + errs.slice(0, 6).join('\n')); }
  console.log('\n' + (bad.length || errs.length ? `FAIL — ${bad.length} verdict(s), ${errs.length} error(s)` : 'PASS'));
  await b.close();
  process.exit(bad.length || errs.length ? 1 : 0);
})();
