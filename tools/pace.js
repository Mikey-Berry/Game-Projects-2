#!/usr/bin/env node
/* A PARTY ARRIVES TOGETHER, OR IT ARRIVES ONE AT A TIME AND DIES THAT WAY.
 *
 * "Patrols should have all members walk at the same speed — the slowest of their party.
 * Sometimes one super fast squad member completely outpaces the rest, and gets destroyed when
 * they encounter an enemy."
 *
 * The failure is not that the fast one is fast. It is that a single order handed to five
 * bodies is five independent walks, so a houndkin at 1.18x speed and an ox-bound at 0.80x
 * pull apart over the length of the march — and the houndkin meets whatever is at the far end
 * alone. Nothing in the suite could see that, because every unit involved is doing exactly
 * what it was told.
 *
 * What this measures is the SPREAD: give one order to a mixed party and watch the distance
 * between the leader and the tail. Two things have to be true and they pull against each
 * other, so both are asserted:
 *
 *   · the party holds together on the march (the report);
 *   · and it still gets there in a reasonable time, at the slowest member's pace and not at
 *     some crawl (the obvious way to pass the first assertion by breaking the game).
 *
 * Then three controls, because a pace band that never lets go is worse than none:
 *   · a body fighting is not paced — you cannot pull a man out of a melee at ox speed;
 *   · a single unit under its own order is never slowed;
 *   · a body given a NEW order of its own leaves the band.
 *
 *   node tools/pace.js [game.html]
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
    const DT = 1 / 30;

    /* open ground with room for a long straight march and nothing to path around */
    let gx = 0, gy = 0;
    outer:
    for (let y = 60; y < H - 90; y += 6) for (let x = 60; x < W - 90; x += 6) {
      if (isBlocked(x + 0.5, y + 0.5)) continue;
      if (towns.some(t => dist(t.x, t.y, x, y) < 90)) continue;
      let ok = true;
      for (let j = -4; j <= 44 && ok; j += 2) for (let i = -6; i <= 6 && ok; i += 2)
        if (isBlocked(x + i + 0.5, y + j + 0.5)) ok = false;
      if (ok) { gx = x; gy = y; break outer; }
    }
    R.ground = gx ? `staged on open waste at ${gx},${gy}` : '!! NO OPEN GROUND';

    /* ---------- A MIXED PARTY ----------
       Speed is set with `speedMult`, which `moveSpeed` reads directly, rather than by rolling
       subraces until a houndkin turns up: the point is the SPREAD between fast and slow, and
       a probe that depends on the subrace table is a probe that breaks when the table moves. */
    const made = [];
    const mk = (nm, mult, dx) => {
      const c = makeChar(nm, 'player', gx + dx, gy, { atk: 6, def: 6, tough: 12, ath: 6 });
      c.__probe = true; c.speedMult = mult; c.floor = 0; c.autoFight = false;
      chars.push(c); made.push(c); return c;
    };
    const teardown = () => {
      for (let i = chars.length - 1; i >= 0; i--) if (chars[i].__probe) chars.splice(i, 1);
      selected = selected.filter(c => !c.__probe);
      rebuildCharGrid();
    };

    /* ---------- HOW AN ORDER IS ISSUED ----------
       `orderParty` is the game's own one-order-several-bodies call, and it is used here rather
       than hand-rolling clearOrders + routeTo so the probe cannot pass by issuing an order in
       a shape the game never issues. It does not exist on the build before the fix, so the
       fallback is exactly what that build did — which is the point of running this there. */
    const issue = (party, tx, ty) => {
      if (typeof orderParty === 'function') return orderParty(party, tx, ty, 0);
      party.forEach((c, i) => { clearOrders(c); routeTo(c, tx + (i % 3 - 1) * 0.7, ty + Math.floor(i / 3) * 0.7, 0); });
      return party.length;
    };
    /* This drives `physics` directly, the way patrol.js does, so it has to drive the per-tick
       pass `update` would have run — otherwise nothing stamps the pace and the probe measures
       the unfixed build on both sides. */
    const tick = (party) => {
      if (typeof paceBands === 'function') paceBands();
      for (const c of party) { c.state = 'ok'; physics(c, DT); }
    };

    /* the march, run as one order to the whole party and sampled the whole way */
    const march = (party, tiles) => {
      for (const c of party) { clearOrders(c); c.state = 'ok'; }
      rebuildCharGrid();
      const ty = gy + tiles;
      issue(party, gx, ty);
      let worst = 0, sum = 0, n = 0, ticks = 0, arrived = 0;
      const MAX = 30 * 300;
      while (ticks < MAX) {
        ticks++;
        tick(party);
        if (ticks % 15 === 0) {
          let lo = 1e9, hi = -1e9;
          for (const c of party) { lo = Math.min(lo, c.y); hi = Math.max(hi, c.y); }
          worst = Math.max(worst, hi - lo); sum += hi - lo; n++;
        }
        arrived = party.filter(c => Math.abs(c.y - ty) < 2.5).length;
        if (arrived === party.length) break;
      }
      return { worst, mean: sum / Math.max(1, n), secs: ticks * DT, arrived };
    };

    /* ---------- THE REPORT ---------- */
    const party = [mk('Probe Hound', 1.18, -2), mk('Probe Plain', 1.0, 0),
                   mk('Probe Ox', 0.80, 2), mk('Probe Plain II', 1.0, 4)];
    rebuildCharGrid();
    const m = march(party, 40);
    R.march = `four bodies, one order, forty tiles: they finished ${m.arrived}/4 in ${m.secs.toFixed(0)}s, ` +
              `spread ${m.mean.toFixed(1)} tiles on average and ${m.worst.toFixed(1)} at the worst of it`;

    R.thePartyHoldsTogether = m.worst < 6
      ? `the party never got more than ${m.worst.toFixed(1)} tiles long — it arrives as a party`
      : `!! THE PARTY STRUNG OUT TO ${m.worst.toFixed(1)} TILES ON A FORTY-TILE MARCH`;

    /* AND IT STILL WALKS. The cheap way to pass the assertion above is to pace everybody to
       something near zero. Forty tiles at the ox's 0.80 is about the honest figure; anything
       much past that is a fix that broke walking. */
    {
      const ox = party.find(c => c.speedMult === 0.80);
      const ref = 40 / Math.max(0.01, moveSpeed(ox));
      R.andItStillGetsThere = (m.arrived === 4 && m.secs < ref * 2.2)
        ? `and it walked it in ${m.secs.toFixed(0)}s against ${ref.toFixed(0)}s for the slowest member alone — the pace is the ox's, not a crawl`
        : `!! ${m.arrived}/4 ARRIVED IN ${m.secs.toFixed(0)}s AGAINST ${ref.toFixed(0)}s FOR THE SLOWEST ALONE`;
    }

    /* ---------- CONTROL: ONE BODY IS NEVER SLOWED ---------- */
    {
      const solo = party[0];
      for (const c of party) clearOrders(c);
      issue([solo], solo.x, solo.y + 20);
      tick([solo]);
      const free = moveSpeed(solo);
      R.andAloneIsAlwaysFullSpeed = Math.abs(free - 3.4 * (1 + solo.stats.ath * 0.012) * 1.18 * (1 - armorPen(solo))) < 0.6
        ? `and a body walking on its own makes ${free.toFixed(2)} tiles a second — nothing is holding it back`
        : `!! A LONE BODY WALKS AT ${free.toFixed(2)}`;
    }

    /* ---------- CONTROL: A FIGHT IS NOT A MARCH ----------
       A pace band that survives contact is a body being dragged out of a melee at somebody
       else's speed. The moment a member has a target it walks at its own. */
    {
      const hound = party[0], ox = party.find(c => c.speedMult === 0.80);
      for (const c of party) { clearOrders(c); c.state = 'ok'; }
      issue(party, gx, gy + 60);
      for (let i = 0; i < 30; i++) tick(party);
      const paced = moveSpeed(hound);
      const foe = makeChar('Probe Trouble', 'bandit', hound.x + 1.2, hound.y, { atk: 6, def: 5, tough: 10 });
      foe.__probe = true; foe.floor = 0; chars.push(foe); rebuildCharGrid();
      hound.target = foe; hound.targetManual = true;
      if (typeof paceBands === 'function') paceBands();
      const fighting = moveSpeed(hound);
      R.andAFightIsNotAMarch = fighting > paced * 1.05 || paced >= moveSpeed(ox) * 1.4
        ? `and a body in contact walks at ${fighting.toFixed(2)} against ${paced.toFixed(2)} on the march — the band lets go when the blades do`
        : `!! A BODY IN A FIGHT IS STILL PACED TO THE PARTY (${fighting.toFixed(2)} vs ${paced.toFixed(2)})`;
      hound.target = null; hound.targetManual = false;
    }

    /* ---------- CONTROL: A NEW ORDER OF YOUR OWN LEAVES THE BAND ---------- */
    {
      const hound = party[0], ox = party.find(c => c.speedMult === 0.80);
      for (const c of party) { clearOrders(c); c.state = 'ok'; }
      issue(party, gx, gy + 60);
      for (let i = 0; i < 30; i++) tick(party);
      const paced = moveSpeed(hound);
      issue([hound], hound.x + 12, hound.y);
      for (let i = 0; i < 30; i++) tick([hound]);
      const alone = moveSpeed(hound);
      R.andASeparateOrderLeavesTheBand = alone > paced * 1.05 || paced >= moveSpeed(ox) * 1.4
        ? `and a body sent somewhere on its own goes back to ${alone.toFixed(2)} from ${paced.toFixed(2)} — the band is the order, not the roster`
        : `!! A BODY SENT OFF ALONE IS STILL WALKING AT THE PARTY'S PACE (${alone.toFixed(2)} vs ${paced.toFixed(2)})`;
    }

    teardown();
    return R;
  });

  const bad = Object.values(out).filter(v => typeof v === 'string' && v.startsWith('!!'));
  for (const [k, v] of Object.entries(out)) console.log('  ' + k.padEnd(32) + v);
  for (const e of errs) console.log('  ' + e);
  console.log('');
  console.log(bad.length || errs.length
    ? `THE FAST ONE STILL ARRIVES ALONE (${bad.length + errs.length})`
    : 'A PARTY THAT MARCHES AT ONE PACE');
  await b.close();
  process.exit(bad.length || errs.length ? 1 : 0);
})();
