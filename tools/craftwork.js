#!/usr/bin/env node
/* DOES THE CRAFT SHARPEN FROM WORK, OR FROM WAITING?
 *
 * "Magic skill grows fairly quickly. I think this is an old call of mine that simply having
 * undead followers should train magic, but I'm realizing this makes it far too easy to train
 * the skill without really doing anything."
 *
 * A reversal by the hand that asked for it, so the ledger's warning is the design constraint:
 * a caster who never trains BY CASTING is the opposite failure, and deleting the tick without
 * replacing it walks straight into it. So this file measures both ends of that, over the same
 * stretch of game time:
 *
 *   · an IDLE necromancer with a host of eight standing around him must learn almost nothing;
 *   · a WORKING one — casting, and with risen that actually kill — must still learn.
 *
 * Neither number means anything on its own. It is the ratio between them that says whether
 * the skill is paid for by doing something.
 *
 *   node tools/craftwork.js [game.html]
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
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message.slice(0, 200)));
  await p.goto('file://' + gamePath(process.argv[2]), { waitUntil: 'load' });
  await p.waitForTimeout(3000);
  await p.evaluate(() => { document.getElementById('btn-start').click(); paused = true; });
  await p.waitForTimeout(3000);

  const out = await p.evaluate(() => {
    const R = {};
    paused = true;

    let gx = 0, gy = 0;
    outer:
    for (let y = 60; y < H - 60; y += 5) for (let x = 60; x < W - 60; x += 5) {
      if (isBlocked(x + 0.5, y + 0.5)) continue;
      if (towns.some(t => dist(t.x, t.y, x, y) < 70)) continue;
      let ok = true;
      for (let j = -10; j <= 10 && ok; j++) for (let i = -10; i <= 10 && ok; i++)
        if (isBlocked(x + i + 0.5, y + j + 0.5)) ok = false;
      if (ok) { gx = x; gy = y; break outer; }
    }
    R.ground = gx ? `staged on open waste at ${gx},${gy}` : '!! NO OPEN GROUND';

    const wipe = () => {
      for (let i = chars.length - 1; i >= 0; i--) if (chars[i].__probe) chars.splice(i, 1);
      for (let i = corpses.length - 1; i >= 0; i--) if (corpses[i].__probe) corpses.splice(i, 1);
      rebuildCharGrid();
    };
    const necro = (x, y) => {
      const c = makeChar('Probe Necromancer', 'player', x, y, { atk: 3, def: 3, tough: 10, magic: 20 });
      c.__probe = true; c.gift = 'dark'; c.floor = 0; chars.push(c);
      c.mana = rawMaxMana(c); return c;
    };
    const risen = (m, x, y) => {
      const u = makeChar('Probe Risen', 'player', x, y, { atk: 8, def: 6, tough: 12 });
      u.__probe = true; u.undead = true; u.crafted = true; u.master = m; u.floor = 0;
      chars.push(u); return u;
    };

    /* ---------- EIGHT DAYS OF STANDING ABOUT ----------
       The old tick paid `dh * 0.012 * min(risenCount, 8)` — with a full host that is about 2.3
       magic a GAME DAY for existing, so a month in your own camp was seventy points of the
       hardest skill in the school. Eight days, nobody moving, nothing dying. */
    const DAYS = 8;
    let idleGain = 0, idleDays = 0;
    {
      const n = necro(gx, gy);
      for (let i = 0; i < 8; i++) risen(n, gx + (i % 4) - 1.5, gy + 2 + Math.floor(i / 4));
      rebuildCharGrid();
      const before = n.stats.magic, d0 = day;
      let guard = 0;
      while (day - d0 < DAYS && guard++ < 20000) update(4);
      idleGain = n.stats.magic - before;
      idleDays = day - d0;
      R.idle = `a necromancer with eight risen, idle for ${idleDays} game-days: MAG +${idleGain.toFixed(2)}`;
      wipe();
    }

    /* ---------- AND THE SAME STRETCH SPENT CASTING ----------
       THE BINDING CAP BIT THIS FILE. The first version gave the working necromancer the same
       host of eight as the idle one, and `castRaise` refuses at `risenLoad + 1 > risenCap` —
       which at MAG 20 is five. So every raise in the working run was declined, and the whole
       of its gain came from the kills. It read healthy (+16.80) while measuring exactly one of
       the two things it claims to measure, and the CASTING half — the thing the ledger warned
       about — was never exercised at all. This one carries no host, so the rite goes through. */
    let castGain = 0;
    {
      const n = necro(gx, gy);
      rebuildCharGrid();
      const before = n.stats.magic;
      let raised = 0;
      for (let d = 0; d < DAYS; d++) {
        const body = makeChar('Probe Fallen', 'town', gx + 5, gy, { atk: 4, def: 4, tough: 8 });
        body.__probe = true; body.state = 'dead'; body.deadAt = day; body.floor = 0;
        chars.push(body); corpses.push(body); rebuildCharGrid();
        n.mana = 9999; n.castCd = 0;
        const seen = new Set(chars);
        castRaise(n, body);
        const made = chars.filter(x => !seen.has(x));
        for (const m of made) { m.__probe = true; m.master = null; }   /* keep him under his cap */
        if (made.length) raised++;
      }
      castGain = n.stats.magic - before;
      R.casting = `${raised} of ${DAYS} raises went through, for MAG +${castGain.toFixed(2)}`;
      R.castingStillTeaches = (raised >= DAYS - 1 && castGain > 2)
        ? 'a necromancer who actually works the rite still learns from it — the opposite failure is not the fix'
        : `!! ${raised} RAISES PAID MAG +${castGain.toFixed(2)} — CASTING DOES NOT TRAIN THE CASTER`;
      wipe();
    }

    /* ---------- AND THE SAME STRETCH WITH A HOST THAT FIGHTS ---------- */
    let workGain = 0;
    {
      const n = necro(gx, gy);
      const host = [];
      for (let i = 0; i < 8; i++) host.push(risen(n, gx + (i % 4) - 1.5, gy + 2 + Math.floor(i / 4)));
      rebuildCharGrid();
      const before = n.stats.magic;
      for (let d = 0; d < DAYS; d++) for (let k = 0; k < 6; k++) {
        const foe = makeChar('Probe Foe', 'bandit', gx + 6, gy + 2, { atk: 2, def: 1, tough: 2 });
        foe.__probe = true; foe.floor = 0; chars.push(foe);
        kill(foe, host[k % host.length]);
      }
      workGain = n.stats.magic - before;
      R.working = `and a host taking six kills a day for ${DAYS} days: MAG +${workGain.toFixed(2)}`;
      wipe();
    }

    /* ---------- STANDING STILL MUST NOT PAY ---------- */
    R.idlingTeachesNothing = idleGain < 0.6
      ? `eight days of a full host standing in the yard is worth MAG +${idleGain.toFixed(2)} — near enough to nothing`
      : `!! IDLING WITH A HOST PAID MAG +${idleGain.toFixed(2)} OVER ${idleDays} DAYS`;
    /* ---------- AND WORKING MUST ---------- */
    R.butWorkingStillDoes = workGain > 2
      ? `while raising and commanding pays MAG +${workGain.toFixed(2)} over the same stretch`
      : `!! A WORKING NECROMANCER LEARNED ALMOST NOTHING (MAG +${workGain.toFixed(2)}) — THE OPPOSITE FAILURE`;
    R.ratio = `working is worth ${(workGain / Math.max(0.01, idleGain)).toFixed(0)}x idling`;
    R.andItIsTheWorkThatPays = workGain > idleGain * 4
      ? 'and the craft is paid for by doing something, not by waiting'
      : `!! WAITING IS STILL COMPETITIVE WITH WORKING (${idleGain.toFixed(2)} against ${workGain.toFixed(2)})`;

    /* ---------- AND A HOST THAT KILLS IS WHY, NOT A HOST THAT EXISTS ----------
       The specific replacement: the same words as the old tick — commanding the dead sharpens
       the craft — moved to the moment they are commanded. */
    {
      const n = necro(gx, gy);
      const u = risen(n, gx + 1, gy);
      rebuildCharGrid();
      const before = n.stats.magic;
      const foe = makeChar('Probe Foe', 'bandit', gx + 2, gy, { atk: 1, def: 1, tough: 1 });
      foe.__probe = true; foe.floor = 0; chars.push(foe);
      kill(foe, u);
      R.aKillByTheHostTeaches = n.stats.magic > before
        ? `a kill taken by one of your risen sharpens the binder — MAG +${(n.stats.magic - before).toFixed(2)}`
        : '!! YOUR RISEN KILLING SOMETHING TEACHES ITS MASTER NOTHING';
      /* and it is the MASTER's craft, not everyone's — a stray body with no binder pays nobody */
      const loose = makeChar('Probe Stray', 'player', gx + 3, gy, { atk: 6, def: 4, tough: 8 });
      loose.__probe = true; loose.undead = true; loose.master = null; loose.floor = 0;
      chars.push(loose);
      const before2 = n.stats.magic;
      const foe2 = makeChar('Probe Foe', 'bandit', gx + 4, gy, { atk: 1, def: 1, tough: 1 });
      foe2.__probe = true; foe2.floor = 0; chars.push(foe2);
      kill(foe2, loose);
      R.andOnlyItsOwnBinder = n.stats.magic === before2
        ? 'and a risen nobody is holding teaches nobody — it is the binding that learns, not the corpse'
        : '!! AN UNBOUND RISEN\'S KILL TAUGHT A NECROMANCER WHO HAD NOTHING TO DO WITH IT';
      wipe();
    }

    return R;
  });

  const bad = Object.values(out).filter(v => typeof v === 'string' && v.startsWith('!!'));
  for (const [k, v] of Object.entries(out)) console.log('  ' + k.padEnd(26) + v);
  for (const e of errs) console.log('  ' + e);
  console.log('');
  console.log(bad.length || errs.length
    ? `THE CRAFT STILL SHARPENS ITSELF (${bad.length + errs.length})`
    : 'THE CRAFT IS PAID FOR BY DOING SOMETHING');
  await b.close();
  process.exit(bad.length || errs.length ? 1 : 0);
})();
