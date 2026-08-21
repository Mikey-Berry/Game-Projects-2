#!/usr/bin/env node
/* A LIEUTENANT IS SOMEBODY YOU CAN SPEND.
 *
 * "Undead lieutenants leave a corpse behind the first few times they die, but every time you
 *  rez them after that, they degrade in quality. A fully rotten corpse finally just
 *  dissipates. But this at least gives lieutenants a chance to contribute and come back if
 *  they get smacked around in combat."
 *
 * Driven through the REAL death path (`kill`) and the REAL rite (`castRaise`) rather than by
 * setting flags, because the whole claim is about what those two do to each other over four
 * cycles — a probe that stamps `lieuWear` by hand has tested arithmetic it wrote itself.
 *
 * The cycle is run to EXHAUSTION and one step past it. A test that stops at "it came back"
 * passes on a build where it comes back forever, which is the version of this feature that
 * would be worth nothing.
 *
 * Also covers the `raised`/`alarmed` fix, which is not this feature but is the corpse bug
 * this feature was standing next to: a town guard who saw an enemy before dying used to leave
 * a body the whole corpse economy refused to touch.
 *
 *   node tools/lieu.js [game.html]
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
  await p.waitForFunction(() => {
    const bs = document.getElementById('btn-start');
    return bs && typeof chars !== 'undefined' && chars.length > 0;
  }, null, { timeout: 60000 });
  await p.evaluate(() => document.getElementById('btn-start').click());
  await p.waitForFunction(() => document.getElementById('startoverlay').style.display === 'none', null, { timeout: 60000 });

  const out = await p.evaluate(() => {
    const R = {};
    paused = true;

    let gx = 0, gy = 0;
    outer:
    for (let y = 60; y < H - 60; y += 6) for (let x = 60; x < W - 60; x += 6) {
      if (isBlocked(x + 0.5, y + 0.5)) continue;
      if (towns.some(t => dist(t.x, t.y, x, y) < 80)) continue;
      let ok = true;
      for (let j = -6; j <= 6 && ok; j += 2) for (let i = -6; i <= 6 && ok; i += 2)
        if (isBlocked(x + i + 0.5, y + j + 0.5)) ok = false;
      if (ok) { gx = x; gy = y; break outer; }
    }
    R.ground = gx ? `staged on open waste at ${gx},${gy}` : '!! NO OPEN GROUND';

    const wipe = () => { for (let i = chars.length - 1; i >= 0; i--) if (chars[i].__probe) chars.splice(i, 1); };
    const mk = (name, f, x, y, o) => {
      const c = makeChar(name, f, x, y, o || {});
      c.state = 'ok'; c.__probe = true; chars.push(c); return c;
    };

    /* a necromancer strong enough that nothing below is limited by the caster */
    const necro = mk('Adept', 'player', gx, gy, { atk: 8, def: 8, tough: 40, ath: 8, magic: 60 });
    necro.gift = 'dark'; necro.lich = true;
    stash.remains = 999; stash.stone = 999; stash.fabric = 999; necro.mana = 999;

    /* ---------- THE CYCLE ---------- */
    /* one living companion, promoted the honest way: killed, then raised as a lieutenant */
    let lt = mk('Ordell Vane', 'player', gx + 1, gy, { atk: 40, def: 30, tough: 50, ath: 10, medic: 20 });
    lt.conviction = 'loyal';
    const bornAtk = lt.stats.atk;
    kill(lt, necro);
    R.aBodyToRaise = corpses.includes(lt)
      ? 'a living companion who fell leaves a body, as it always did'
      : '!! THE CONTROL NEVER LEFT A BODY — nothing below means anything';

    const raiseIt = (body) => {
      necro.mana = 999; necro.castCd = 0;
      const before = chars.length;
      const ok = castRaise(necro, body);
      const made = chars.slice(before).find(x => x.lieutenant) ||
                   chars.find(x => x.lieutenant && x.state === 'ok' && x.name.includes('Ordell'));
      if (made) made.__probe = true;
      return ok === false ? null : made;
    };

    let cur = raiseIt(lt);
    R.itRisesAsSomebody = cur && cur.lieutenant && cur.name.includes('Ordell')
      ? `raised as a lieutenant, still ${cur.name}, wear ${cur.lieuWear}`
      : `!! THE FIRST RAISING DID NOT PRODUCE A LIEUTENANT (${cur && cur.name})`;
    const firstAtk = cur ? cur.stats.atk : 0;

    /* now kill and raise it as many times as the ladder has rungs, and one past */
    const cycle = [];
    let dissipated = false, guard = 0;
    while (cur && guard++ < 8) {
      kill(cur, necro);
      const left = corpses.includes(cur);
      cycle.push({ wear: cur.lieuWear || 0, body: left, stage: left ? decayStage(cur).k : null, atk: Math.round(cur.stats.atk) });
      if (!left) { dissipated = true; break; }
      const next = raiseIt(cur);
      if (!next) break;
      cur = next;
    }

    R.itKeepsComingBack = cycle.filter(e => e.body).length >= 3
      ? `it comes back off the ground ${cycle.filter(e => e.body).length} times`
      : `!! IT ONLY LEFT A BODY ${cycle.filter(e => e.body).length} TIME(S) — ${JSON.stringify(cycle)}`;
    /* THE LADDER, and it must actually descend rather than merely differ */
    const stages = cycle.filter(e => e.body).map(e => e.stage);
    const idx = stages.map(k => DECAY.findIndex(d => d.k === k));
    const descends = idx.every((v, i) => i === 0 || v > idx[i - 1]);
    R.eachDeathCostsARung = idx.length >= 3 && descends
      ? `and each death costs it a rung: ${stages.join(' -> ')}`
      : `!! IT DOES NOT WALK DOWN THE LADDER (${stages.join(' -> ') || 'never left a body'})`;
    /* degradation has to show in the BODY, not only in the label */
    const atks = cycle.filter(e => e.body).map(e => e.atk);
    R.itComesBackWorse = atks.length >= 3 && atks[atks.length - 1] < atks[0] * 0.75
      ? `and it comes back weaker every time — atk ${bornAtk} alive, then ${atks.join(' -> ')}`
      : `!! IT COMES BACK JUST AS STRONG (atk ${atks.join(' -> ')})`;
    /* THIS HAS TO ASK FOR BOTH HALVES. On the build before this one a lieutenant left no body
       at all, so `dissipated` was true on the very first death and this assertion passed —
       green on exactly the bug it was written for. It must see the ladder run out, not merely
       end. */
    R.andThenItIsGone = dissipated && cycle.filter(e => e.body).length >= 3
      ? `and after ${cycle.filter(e => e.body).length} of them there is nothing left to call to`
      : dissipated
        ? `!! IT WAS GONE AFTER ${cycle.filter(e => e.body).length} — that is not a ladder running out, that is the old bug`
        : '!! IT NEVER RUNS OUT — a lieutenant that returns forever is not a cost';

    /* ---------- AND THE CORPSE BUG IT WAS STANDING NEXT TO ----------
       `raised` was written by exactly one place — the watch raising the ALARM — and read by
       four that all meant "already raised from the dead". Testing this through a real patrol
       needs a patrol centre and a hostile and proves less than it costs, and asserting that a
       town guard is carrion is wrong anyway: `carrionFodder` excludes `faction === 'town'`
       outright and always did, on purpose ("that is a theft, not a chore"). So the two halves
       are asserted where they actually live — the writer, and a body the economy will judge on
       its merits. */
    {
      const src = patrolTick.toString();
      R.theAlarmHasItsOwnFlag = /\.alarmed\s*=/.test(src) && !/\.raised\s*=/.test(src)
        ? 'raising the alarm sets `alarmed` and no longer scribbles on `raised`'
        : '!! THE WATCH STILL WRITES `raised` — the flag the corpse economy reads';
      const g = mk('Outrider', 'bandit', gx + 4, gy + 4, { atk: 10, def: 10, tough: 20, ath: 8 });
      g.alarmed = true;                 /* what a body that has seen somebody now carries */
      kill(g, necro);
      /* A GUARD, NOT A PROOF, and worth saying so: this passes on the old build too, because
         the probe sets the NEW flag and the old code never read it. `theAlarmHasItsOwnFlag`
         above is what actually fails before the fix. This one is here to catch somebody
         re-coupling the two later, which is the failure that would be silent. */
      R.seeingSomebodyCostsNothing = carrionFodder(g) && cairnFood(g) && cartFodder(g)
        ? 'and a body that saw somebody before it died is still meat to the carrion job, the cart and the beast'
        : `!! SPOTTING AN ENEMY EXEMPTS YOUR CORPSE FROM THE ECONOMY (carrion ${carrionFodder(g)}, cairn ${cairnFood(g)}, cart ${cartFodder(g)})`;
    }

    wipe();
    return R;
  });

  console.log('=== A LIEUTENANT IS SOMEBODY YOU CAN SPEND ===\n');
  for (const [k, v] of Object.entries(out)) console.log('  ' + k.padEnd(27) + v);
  const bad = Object.values(out).map(String).filter(v => v.startsWith('!!'));
  console.log('\n' + (bad.length ? '*** ' + bad.join('\n*** ')
    : 'A LIEUTENANT COMES BACK UNTIL THE LADDER RUNS OUT, AND IS WORSE EVERY TIME'));
  if (errs.length) { console.log('errs:', errs.length); errs.slice(0, 4).forEach(e => console.log('  ' + e)); }
  await b.close();
  if (bad.length) process.exitCode = 1;
})();
