#!/usr/bin/env node
/* WHAT A BOUND HOST IS WORTH, IN GARRISONS.
 *
 * "Binding Circle undead are just way too strong" is a real report and an untestable
 * sentence. This turns it into a number: raise a host the way a player actually would, stand
 * it in front of a REAL town garrison — spawned through `spawnGuard`, so the arbalists and
 * the ironfisted bonus and the merc mix are all the ones the game ships — and count what is
 * left standing on each side.
 *
 * The number that matters is the EXCHANGE RATE: garrison dead per body of host lost. One
 * means an even trade. Ten means the host walks through a city without noticing it.
 *
 * It is run at four caster tiers because the problem is a curve, not a value. `craftUndead`
 * pours one scalar into every stat —
 *
 *     m = caster.stats.magic * (research.done.necromancy ? 1.5 : 1)
 *
 * — linear and uncapped, so the interesting question is not "is a host strong" but "how fast
 * does it get strong", and a single measurement cannot answer that.
 *
 * Also checks the UPKEEP rule, which is the balance lever being tried first: a body bound at
 * the circle eats Mortal Remains to stay bound, and a body raised off a battlefield corpse
 * does not. That split is deliberate — early necromancy is a hard enough start without a
 * bill attached, and the trivialization is a midgame problem made of circle-bound bodies.
 *
 *   node tools/host.js [game.html]
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
  await p.evaluate(() => document.getElementById('btn-start').click());
  await p.waitForTimeout(3000);

  const out = await p.evaluate(() => {
    const R = {}, rows = [];
    paused = true;

    /* open ground well clear of every town, so the fight is a fight and not a siege */
    let gx = 0, gy = 0;
    outer:
    for (let y = 60; y < H - 60; y += 5) for (let x = 60; x < W - 60; x += 5) {
      if (isBlocked(x + 0.5, y + 0.5)) continue;
      if (towns.some(t => dist(t.x, t.y, x, y) < 70)) continue;
      let ok = true;
      for (let j = -6; j <= 6 && ok; j++) for (let i = -6; i <= 6 && ok; i++)
        if (isBlocked(x + i + 0.5, y + j + 0.5)) ok = false;
      if (ok) { gx = x; gy = y; break outer; }
    }
    R.ground = gx ? `staged on open waste at ${gx},${gy}` : '!! NO OPEN GROUND CLEAR OF EVERY TOWN';

    const wipe = () => {
      for (let i = chars.length - 1; i >= 0; i--) {
        const c = chars[i];
        if (c.faction === 'player' || c.__probe) chars.splice(i, 1);
      }
      corpses.length = 0;
    };

    /* A REAL GARRISON. `spawnGuard` is what a town actually posts — plate, arbalists, the
       merc mix, the leader's bonus — so the opposition is the game's, not the probe's.
       It pushes to `chars` itself and returns nothing, hence the length bracket. */
    const garrison = (town, n) => {
      const made = [];
      for (let i = 0; i < n; i++) {
        const n0 = chars.length;
        const ang = i / n * Math.PI * 2;
        spawnGuard(town, { x: gx + 16 + Math.cos(ang) * 5, y: gy + Math.sin(ang) * 5 }, i);
        for (let k = n0; k < chars.length; k++) {
          const g = chars[k];
          g.__probe = true;
          g.guard = null;          /* a posted guard holds its post; this one has to come out */
          g.homeTown = null;
          made.push(g);
        }
      }
      return made;
    };

    /* the host a player would actually build: a line to hold, archers behind it, one big
       thing, and a mage. Filled to the caster's own ceiling. */
    const MIX = ['brute', 'brute', 'gravehound', 'archer', 'archer', 'mage', 'colossus'];
    const raiseHost = (nec) => {
      const host = [];
      for (let i = 0; i < 60; i++) {
        if (risenLoad(nec) + 3 > risenCap(nec)) break;
        const kind = MIX[i % MIX.length];
        nec.mana = 9999;
        const n0 = chars.length;
        craftUndead(kind, nec, { x: nec.x, y: nec.y }, null);
        if (chars.length === n0) continue;
        const u = chars[chars.length - 1];
        u.x = gx + (i % 6) - 3; u.y = gy + Math.floor(i / 6) - 2;
        host.push(u);
      }
      return host;
    };

    const makeNec = (magic, lich) => {
      const nec = makeChar('Necromancer', 'player', gx, gy,
        { atk: 10, def: 10, tough: 12, ath: 6, magic });
      nec.gift = 'dark'; nec.att = { dark: 3, divine: 0, destruction: 0, dust: 0 };
      nec.mana = 9999; nec.stats.magic = magic;
      if (lich) { nec.lich = true; nec.undead = true; }
      chars.push(nec);
      return nec;
    };

    const fight = (host, foes) => {
      for (const h of host) { h.autoFight = true; h.noFight = h.noFight || false; }
      let t = 0;
      const alive = l => l.filter(c => c.state === 'ok').length;
      paused = false;
      for (; t < 5000; t++) {
        /* keep both sides pointed at each other; `ai` does the rest */
        for (const h of host) if (h.state === 'ok' && !h.noFight && (!h.target || h.target.state !== 'ok')) {
          h.target = foes.find(f => f.state === 'ok') || null; h.targetManual = true;
        }
        for (const f of foes) if (f.state === 'ok' && (!f.target || f.target.state !== 'ok')) {
          f.target = host.find(h => h.state === 'ok') || null; f.targetManual = true;
        }
        update(0.1);
        if (!alive(host) || !alive(foes)) break;
      }
      paused = true;
      return { t, hostLeft: alive(host), foeLeft: alive(foes) };
    };

    /* research on, because that 1.5 is exactly what is under suspicion */
    research.done.rites_binding = true; research.done.rites_deep = true; research.done.necromancy = true;
    for (const k of ['remains', 'stone', 'fabric', 'copper', 'wood', 'hide', 'vflesh'])
      stash[k] = (stash[k] || 0) + 100000;

    /* an average walled city: Greenrest is the median garrison in the table */
    const town = towns.find(t => t.def.key === 'greenrest') || towns[0];
    const GN = garrisonSize(town);

    /* ---------- WHAT THE CIRCLE WAS FED ----------
       The binding now clamps to the quality of the Mortal Remains it is built from, the way
       `castRaise` has always clamped to the corpse in front of it. So a host's ceiling is a
       function of what the player has been rendering, and a harness that simply writes 100000
       remains into the stash is testing ONE end of that — the pile of rats. Both ends have to
       be measured or the number is meaningless. */
    const feedOn = (atk, count) => {
      remainsQual = 0;                       /* forget the last diet */
      stash.remains = 0;
      for (let i = 0; i < count; i++) {
        const body = makeChar('Rendered', 'bandit', gx + 2, gy + 2,
          { atk, def: atk * 0.8, tough: atk, ath: 6 });
        body.state = 'dead'; body.deadAt = day; body.looted = true; body.__probe = true;
        chars.push(body); corpses.push(body);
        harvestCorpse(body, true, null);
      }
      stash.remains += 100000;               /* plenty of material, of THAT quality */
      return remainsQ();
    };

    /* The magic ladder is measured on a REALISTIC diet, not on the raw stash. Writing 100000
       remains straight into the pile is the "rendered nothing but rats" case — the ceiling
       sits at its floor, every tier is clamped to the same body, and the sweep reports that
       magic buys nothing, which is true only of that one diet. A player at magic 100 has been
       rendering things for a hundred days. Bandits are what the waste actually supplies. */
    for (const [label, magic, lich] of [['early  m20', 20, false], ['mid    m50', 50, false],
                                        ['late   m100', 100, false], ['lich   m150', 150, true]]) {
      wipe();
      feedOn(22, 40);
      const nec = makeNec(magic, lich);
      const host = raiseHost(nec);
      const foes = garrison(town, GN);
      /* one bound body's stat line, so the curve is visible next to its result */
      const sample = host.find(h => h.kin === 'brute');
      const line = sample ? `atk ${Math.round(sample.stats.atk)} def ${Math.round(sample.stats.def)} tough ${Math.round(sample.stats.tough)}` : '?';
      const r = fight(host, foes);
      const hostLost = host.length - r.hostLeft, foeLost = foes.length - r.foeLeft;
      const ex = hostLost === 0 ? Infinity : foeLost / hostLost;
      /* AND AN EVEN FIGHT. The city number conflates two things — how strong a body is, and
         how many of them the cap allows — and at m20 it says "wiped out" mostly because
         three bodies walked at twenty-three guards, which no player would do. Standing the
         host against its OWN NUMBER of guards isolates the per-body question. */
      const n0 = chars.length;
      wipe();
      const nec2 = makeNec(magic, lich);
      const host2 = raiseHost(nec2);
      const even = garrison(town, host2.length);
      const r2 = fight(host2, even);
      const lost2 = host2.length - r2.hostLeft, foeLost2 = even.length - r2.foeLeft;
      const ex2 = lost2 === 0 ? Infinity : foeLost2 / lost2;
      rows.push({ label, cap: risenCap(nec), host: host.length, foes: foes.length,
                  hostLeft: r.hostLeft, foeLeft: r.foeLeft, ex, t: r.t, line,
                  evenN: host2.length, evenLeft: r2.hostLeft, evenFoe: r2.foeLeft, ex2 });
    }

    /* ---------- THE SAME NECROMANCER, THREE DIETS ----------
       This is the whole point of the reference-body rule: magic decides how close you get to
       the ceiling, and what you rendered decides where the ceiling is. */
    for (const [label, atk, n] of [['fed rats   ', 8, 40], ['fed bandits', 22, 40], ['fed guards ', 40, 40]]) {
      wipe();
      const q = feedOn(atk, n);
      const nec = makeNec(100, false);
      const host = raiseHost(nec);
      const foes = garrison(town, host.length);
      const sample = host.find(h => h.kin === 'brute');
      const line = sample ? `atk ${Math.round(sample.stats.atk)} def ${Math.round(sample.stats.def)} tough ${Math.round(sample.stats.tough)}` : '?';
      const r = fight(host, foes);
      const lost = host.length - r.hostLeft, foeLost = foes.length - r.foeLeft;
      const ex = lost === 0 ? Infinity : foeLost / lost;
      R['d_' + label.trim().replace(/\s+/g, '_')] =
        `remains worth ${q.toFixed(0)} · ${host.length}v${host.length} even → ${r.hostLeft}v${r.foeLeft} ` +
        `(${ex === Infinity ? 'FLAWLESS' : ex.toFixed(1) + ':1'}) · knight ${line}`;
      rows.push({ diet: label, q, ex, line });
    }
    /* the rule that makes the whole thing worth having: better corpses, better host */
    {
      const diets = rows.filter(r => r.diet);
      const rats = diets[0], guards = diets[diets.length - 1];
      const f = v => v === Infinity ? 'FLAWLESS' : v.toFixed(1) + ':1';
      R.dietDecidesTheCeiling = (guards.q > rats.q * 2 &&
        parseFloat(guards.line.split(' ')[1]) > parseFloat(rats.line.split(' ')[1]) * 1.5)
        ? `what you render is the ceiling: rats give atk ${rats.line.split(' ')[1]}, guards give ${guards.line.split(' ')[1]}`
        : `!! THE DIET DOES NOT MOVE THE CEILING (rats ${rats.line}, guards ${guards.line})`;
      R.ratsAreNotAnArmy = rats.ex !== Infinity && rats.ex < 2
        ? `and a host built out of nobodies trades at ${f(rats.ex)} — it is not an army`
        : `!! A HOST OF RENDERED RATS TRADES AT ${f(rats.ex)}`;
      /* and the ceiling itself must have a ceiling, or the rule is only slower to break */
      {
        wipe();
        const qBoss = feedOn(200, 60);       /* forty bosses' worth of rendering */
        const nec = makeNec(150, true);
        const host = raiseHost(nec);
        const k = host.find(h => h.kin === 'brute');
        R.qualityIsCapped = k && k.stats.atk < 70
          ? `rendering nothing but bosses tops out at quality ${qBoss.toFixed(0)}, knight atk ${Math.round(k.stats.atk)}`
          : `!! FARMING BOSSES REOPENS THE TOP END (quality ${qBoss.toFixed(0)}, knight atk ${k ? Math.round(k.stats.atk) : '?'})`;
      }
      R.goodCorpsesStillWin = guards.ex >= 1
        ? `while one built out of real soldiers trades at ${f(guards.ex)}`
        : `!! EVEN A WELL-FED HOST IS WORTHLESS AT ${f(guards.ex)} — THE CLAMP IS TOO TIGHT`;
    }

    R.city = `${town.name}: a garrison of ${GN}`;
    for (const r of rows) {
      if (r.diet) continue;
      R['x_' + r.label.trim().replace(/\s+/g, '_')] =
        `cap ${String(r.cap).padStart(2)} · ${String(r.host).padStart(2)}v${r.foes} city → ` +
        `${String(r.hostLeft).padStart(2)}v${String(r.foeLeft).padStart(2)} ` +
        `(${r.ex === Infinity ? 'FLAWLESS' : r.ex.toFixed(1) + ':1'}) · ` +
        `${r.evenN}v${r.evenN} even → ${r.evenLeft}v${r.evenFoe} ` +
        `(${r.ex2 === Infinity ? 'FLAWLESS' : r.ex2.toFixed(1) + ':1'}) · knight ${r.line}`;
    }

    /* ---------- THE BALANCE WATCH ----------
       Reported, NOT asserted, and deliberately so. Upkeep is an economy lever: it decides how
       long a host can be kept and how much corpse throughput it demands, and it does not touch
       what happens when that host meets a garrison. Failing the suite on a number that the
       change being made is not trying to move would make the suite lie.
       These lines exist so the number stays in front of us. When the `m` curve is bent — which
       is the change that actually moves them — they become assertions with thresholds. */
    {
      const tiers = rows.filter(r => r.label);
      const late = tiers[tiers.length - 1], early = tiers[0];
      const f = v => v === Infinity ? 'FLAWLESS' : v.toFixed(1) + ':1';
      R.WATCH_evenFight = `one bound body against one guard: ${tiers.map(r => r.label.trim().split(/\s+/)[0] + ' ' + f(r.ex2)).join(' · ')}`;
      R.WATCH_city = `a full host against a city: ${tiers.map(r => r.label.trim().split(/\s+/)[0] + ' ' + f(r.ex)).join(' · ')}`;
      const climb = (late.ex2 === Infinity || early.ex2 === Infinity) ? Infinity : late.ex2 / Math.max(0.1, early.ex2);
      R.WATCH_curve = `per-body power climbs ${climb === Infinity ? 'without bound' : climb.toFixed(1) + 'x'} from first host to last ` +
        `(knight atk ${rows[0].line.split(' ')[1]} → ${late.line.split(' ')[1]})`;
    }

    /* ---------- THE ARCHER BRINGS ITS OWN BOW, AND ITS DAMAGE IS A CONSTANT ----------
       The Marrow Archer used to cost a whole crafted Hunting Bow — the one recipe on the bench
       that reached outside the dark economy for a component. It grows one now. The important
       half is not the logistics though: this is the best-balanced fighting body on the bench
       precisely BECAUSE its damage comes off a weapon constant instead of the necromancer's
       magic, so a lich's archer hits exactly as hard as a novice's. Tie that number to `m` and
       you have rebuilt the Colossus with a longer reach. */
    {
      wipe();
      feedOn(40, 40);                       /* the best diet, so nothing else is the limit */
      for (const k of Object.keys(stash)) if (k === 'w_bow') stash[k] = 0;
      stash.w_bow = 0;                      /* not one bow anywhere in the world */
      const dmgs = [];
      let a0 = null;
      for (const mag of [20, 50, 100, 150]) {
        const n = makeNec(mag, false);
        const before = chars.length;
        craftUndead('archer', n, { x: n.x, y: n.y }, null);
        const a = chars.length > before ? chars[chars.length - 1] : null;
        if (!a) { dmgs.push(null); continue; }
        a0 = a0 || a;
        dmgs.push(atkPower(a, ITEMS[a.weapon]));
      }
      R.archerNeedsNoBowyer = (a0 && (stash.w_bow || 0) === 0 && a0.weapon === 'w_sinew')
        ? `it binds with no bow in the world and stands up holding ${ITEMS[a0.weapon].name}`
        : `!! THE ARCHER STILL NEEDS A CRAFTED BOW (weapon ${a0 && a0.weapon})`;
      const lo = Math.min(...dmgs.filter(Boolean)), hi = Math.max(...dmgs.filter(Boolean));
      R.archerDamageIsFlat = (hi / lo) < 1.25
        ? `and its damage is a constant across the whole magic ladder — ${lo.toFixed(1)} to ${hi.toFixed(1)}`
        : `!! THE GROWN BOW SCALES WITH MAGIC (${lo.toFixed(1)} -> ${hi.toFixed(1)}) — IT IS A COLOSSUS WITH RANGE`;
      /* and it must still be an ARCHER to the animator, not a crossbowman */
      const wI = a0 && ITEMS[a0.weapon];
      R.archerDrawsABow = (wI && wI.range && !wI.lance && wI.bow && weaponGeo(a0.weapon))
        ? 'it reads as a bow to the animator and has a mesh of its own'
        : '!! THE GROWN BOW IS NOT RECOGNISED AS A BOW — IT WILL USE THE CROSSBOW CROUCH';
      /* grown, so there is nothing to strip off the body */
      if (a0) {
        a0.state = 'dead'; a0.deadAt = day; corpses.push(a0);
        const had = stash.w_sinew || 0;
        lootCorpse(a0, true, null);
        R.grownBowIsNotLoot = (stash.w_sinew || 0) === had
          ? 'and it cannot be looted off the corpse — it was part of the body'
          : '!! A GROWN BOW DROPS AS KIT, WHICH IS A FREE BOW FARM';
      }
    }

    /* ---------- UPKEEP: THE CIRCLE PAYS, THE BATTLEFIELD DOES NOT ---------- */
    wipe();
    if (typeof hostUpkeep !== 'function') {
      R.upkeepExists = '!! THIS BUILD HAS NO UPKEEP RULE AT ALL';
    } else {
      const nec = makeNec(60, false);
      stash.remains = 500;
      const bound = [];
      for (let i = 0; i < 4; i++) {
        nec.mana = 9999;
        const n0 = chars.length;
        craftUndead('brute', nec, { x: nec.x, y: nec.y }, null);
        if (chars.length > n0) bound.push(chars[chars.length - 1]);
      }
      /* and one raised off a corpse, which is the kind that must NOT be billed */
      const body = makeChar('Corpse', 'bandit', gx + 2, gy + 2, { atk: 5, def: 5, tough: 5, ath: 5 });
      body.state = 'dead'; body.deadAt = day; chars.push(body); corpses.push(body);
      nec.mana = 9999;
      /* NOT a length check. `castRaise` SPLICES the corpse out of `chars` and pushes the risen
         in its place, so the array is exactly as long afterwards as before — the first version
         tested `chars.length > n1` and reported a working raise as a failure. Take the set
         difference instead. */
      const seen = new Set(chars);
      castRaise(nec, body);
      const raised = chars.find(c => !seen.has(c)) || null;
      R.raisedOne = raised && raised.undead && !raised.crafted
        ? 'raised one off a corpse for comparison' : '!! COULD NOT RAISE A CORPSE-BORN BODY';

      const before = stash.remains;
      hostUpkeep();
      const after = stash.remains;
      R.upkeepExists = after < before
        ? `${bound.length} circle-bound bodies cost ${(before - after).toFixed(1)} remains a day`
        : '!! A BOUND HOST COSTS NOTHING TO KEEP';
      /* the corpse-raised must be free — that is the whole point of the split */
      if (raised) {
        const soloStash = stash.remains = 500;
        for (const u of bound) u.state = 'dead';
        hostUpkeep();
        R.raisedAreFree = stash.remains === soloStash
          ? 'and a body raised off a battlefield corpse costs nothing, as intended'
          : `!! CORPSE-RAISED BODIES ARE BEING BILLED (${(soloStash - stash.remains).toFixed(1)})`;
      }
      /* early game must not be crushed: a first host is one or two bodies */
      {
        wipe();
        const n2 = makeNec(20, false);
        stash.remains = 40;
        n2.mana = 9999;
        const c0 = chars.length;
        craftUndead('gravehound', n2, { x: n2.x, y: n2.y }, null);
        const one = chars.length > c0 ? chars[chars.length - 1] : null;
        const s0 = stash.remains;
        for (let d = 0; d < 10; d++) hostUpkeep();
        const perDay = (s0 - stash.remains) / 10;
        R.earlyIsAffordable = perDay <= 1.0
          ? `one hound costs ${perDay.toFixed(2)} remains a day — an early necromancer can pay it`
          : `!! ONE HOUND COSTS ${perDay.toFixed(2)} A DAY, WHICH BURIES AN EARLY START`;
      }
    }
    return R;
  });

  console.log('=== THE HOST AGAINST A CITY ===\n');
  for (const [k, v] of Object.entries(out)) console.log('  ' + k.padEnd(20) + v);
  const bad = Object.values(out).map(String).filter(v => v.startsWith('!!'));
  console.log('\n' + (bad.length ? '*** ' + bad.join('\n*** ')
    : 'THE CIRCLE PAYS RENT, THE BATTLEFIELD DOES NOT, AND AN EARLY START CAN AFFORD IT'));
  if (errs.length) { console.log('errs:', errs.length); errs.slice(0, 4).forEach(e => console.log('  ' + e)); }
  await b.close();
  if (bad.length) process.exitCode = 1;
})();
