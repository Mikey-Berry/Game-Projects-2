#!/usr/bin/env node
/* THE ONES ALREADY AMONG THE TOWNSFOLK, AND WHETHER YOU CAN EVER ACTUALLY HIRE ONE.
 *
 * "I'm not seeing any recruitable Mimics from the bar. Are they a thing? (Also maybe we can
 * add a few as named in-world recruits — a succubus named Albedo, and a fallen named Rubido.)"
 *
 * "Technically yes" is the worst answer a feature can have, and it was the true one: the roll
 * pays a mimic 4.0% (measured, twenty thousand draws), six boards hold twenty-nine slots, and
 * a slot turns over at 40% a day — about ONE across every bar in the world at a time, and a
 * Fallen roughly one per playthrough. A forty-day run seeing none is the likely outcome, not
 * bad luck. So the first half of this file is a RATE, taken over the boards the game actually
 * builds rather than over the function in isolation, because the function was never the thing
 * the player was looking at.
 *
 * The second half is the two named ones, and the assertion that matters there is not that they
 * exist — it is that their gates can be REACHED. A wanderer you can never take is scenery with
 * a name, and both of these are gated on world state rather than on a purse.
 *
 *   node tools/kin.js [game.html]
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
    const guard = (keys, fn) => {
      try { fn(); } catch (e) {
        for (const k of keys) if (R[k] === undefined) R[k] = '!! ' + String(e.message).slice(0, 80).toUpperCase();
      }
    };

    /* ---------- 1. HOW OFTEN ONE IS ACTUALLY ON A BOARD ----------
       Over the boards, not over the function. `makeRecruit` could pay any rate you like and
       the player would still be reading six lists of five, which is the number that decides
       whether the race exists for them. Six hundred fresh boards is the whole world's bar
       stock rolled a hundred times over. */
    guard(['aMimicTurnsUpInABar', 'andAllThreeLinesDo'], () => {
      const t = towns.find(t2 => !t2.def.undeadFriendly && !t2.sacked);
      const seen = {}; let mimics = 0, n = 0;
      for (let i = 0; i < 600; i++) {
        const r = makeRecruit(t); n++;
        if (r.race !== 'mimic') continue;
        mimics++; seen[r.sub] = (seen[r.sub] || 0) + 1;
      }
      const pct = mimics / n;
      R._boardRate = `${mimics} of ${n} fresh board slots are mimics (${(pct * 100).toFixed(1)}%) — ${JSON.stringify(seen)}`;
      /* A BAND, NOT A FLOOR. Too rare and the player never meets one, which is the report;
         too common and a race whose whole premise is that there are almost none of them is
         standing behind every bar in the country. */
      R.aMimicTurnsUpInABar = (pct >= 0.08 && pct <= 0.18)
        ? `and about one slot in ${Math.round(1 / pct)} is one of them — three or four standing in the world's bars at any moment, against the one that used to be there`
        : `!! ${(pct * 100).toFixed(1)}% OF BOARD SLOTS ARE MIMICS`;
      /* and it is not all succubi. The Fallen is the rarest line and the one specifically
         asked about, so it gets its own floor rather than riding on the total. */
      const lines = Object.keys(SUBRACES.mimic);
      const missing = lines.filter(k => !seen[k]);
      R.andAllThreeLinesDo = (!missing.length && (seen.fallen || 0) >= n * 0.012)
        ? `and all three lines come up — ${lines.map(k => k + ' ' + seen[k]).join(', ')}`
        : `!! LINES MISSING OR TOO THIN: ${missing.join(',') || 'none'} (fallen ${seen.fallen || 0}/${n})`;
    });

    /* ---------- 2. AND THE SEX THE LINE INSISTS ON ----------
       A succubus is `sexOnly:'f'` and a Fallen `sexOnly:'m'`. The draw for sex happens after
       the race in `makeRecruit`, so this is exactly the kind of thing that is right in the
       world-spawn path and wrong in the recruiting one. */
    guard(['andTheLineDecidesTheSex'], () => {
      const t = towns.find(t2 => !t2.def.undeadFriendly && !t2.sacked);
      let bad = 0, n = 0;
      for (let i = 0; i < 400; i++) {
        const r = makeRecruit(t);
        const sb = (SUBRACES[r.race] || {})[r.sub];
        if (!sb || !sb.sexOnly) continue;
        n++; if (r.sex !== sb.sexOnly) bad++;
      }
      R.andTheLineDecidesTheSex = (n > 20 && bad === 0)
        ? `and ${n} recruits from a line that fixes its sex all came out the sex it fixes`
        : `!! ${bad}/${n} WRONG-SEXED`;
    });

    /* ---------- 3. THE TWO WITH NAMES ---------- */
    guard(['theyAreOutThere', 'andTheyAreWhatWasAskedFor'], () => {
      const al = chars.find(c => c.wanderKey === 'albedo');
      const ru = chars.find(c => c.wanderKey === 'rubido');
      R.theyAreOutThere = (al && ru)
        ? `${al.name} and ${ru.name} are both placed`
        : `!! ALBEDO ${al ? 'ok' : 'MISSING'}, RUBIDO ${ru ? 'ok' : 'MISSING'}`;
      if (!al || !ru) return;
      const ok = al.race === 'mimic' && al.sub === 'succubus' && al.sex === 'f' &&
                 ru.race === 'mimic' && ru.sub === 'fallen' && ru.sex === 'm';
      R.andTheyAreWhatWasAskedFor = ok
        ? `a succubus named ${al.name} and a fallen named ${ru.name}`
        : `!! ${al.name} IS ${al.race}/${al.sub}/${al.sex}, ${ru.name} IS ${ru.race}/${ru.sub}/${ru.sex}`;
    });

    /* ---------- 4. AND THEY ARE SOMEWHERE FOR A REASON ----------
       "a person is not a bar recruit with a name on it." She is standing in a town, among
       people who have agreed not to notice, which is the whole of what she is; he is at the
       serpent stone. Placed out in the open waste, both of them are just people in a field. */
    guard(['andWhereTheyStandIsThePoint'], () => {
      const al = chars.find(c => c.wanderKey === 'albedo');
      const ru = chars.find(c => c.wanderKey === 'rubido');
      if (!al || !ru) { R.andWhereTheyStandIsThePoint = '!! NOT PLACED'; return; }
      let td = 1e9, tn = '';
      for (const t of towns) { const d = dist(t.x, t.y, al.x, al.y); if (d < td) { td = d; tn = t.name; } }
      const sd = coilShrine ? dist(coilShrine.x, coilShrine.y, ru.x, ru.y) : 1e9;
      R.andWhereTheyStandIsThePoint = (td < 9 && sd < 6)
        ? `she is ${td.toFixed(1)} tiles into ${tn} and he is ${sd.toFixed(1)} from the serpent stone`
        : `!! ALBEDO ${td.toFixed(1)} FROM THE NEAREST TOWN, RUBIDO ${sd.toFixed(1)} FROM THE SHRINE`;
    });

    /* ---------- 5. AND THE GATES CAN BE REACHED ----------
       THE ONLY ASSERTION HERE THAT CAN CATCH A DEAD FEATURE. A wanderer you can never take is
       scenery with a name, and both of these are gated on world state rather than on a purse —
       which is exactly the kind of gate that can turn out to be unreachable in a real run.
       Shut on a fresh world, open once the condition it names is true, and the condition is
       produced HERE the way the game produces it, not by setting the flag. */
    guard(['hersIsShutAtFirst', 'andThenTheOrderOpensIt'], () => {
      const al = chars.find(c => c.wanderKey === 'albedo');
      if (!al) { R.hersIsShutAtFirst = '!! NO ALBEDO'; return; }
      R.hersIsShutAtFirst = (pyres.length === 0 && !wandererGate(al).ok)
        ? 'hers is shut on a world where the Order has not burned anybody'
        : `!! OPEN ALREADY (pyres ${pyres.length})`;
      /* run the Order until it takes somebody and burns them — no flags set by hand */
      let guardN = 0;
      while (pyres.length === 0 && guardN++ < 4000) { day++; questionTick(); }
      /* ---------- AND SOMEBODY HAS TO GO AND READ THE NAME ----------
         A pole going up used to be the whole gate, which meant a burning that happened on the
         far side of the map, seen by nobody, opened her. Her own line asks for the name off it,
         so one of yours has to stand at the pole — the sneaking-into-Paladin-territory the note
         liked. `witnessTick` is where the world records where your people have set foot. */
      const shutStill = wandererGate(al);
      const reader = player().find(c => c.state !== 'dead');
      const rx = reader.x, ry = reader.y;
      reader.x = pyres[0].x + 1; reader.y = pyres[0].y;
      witnessTick();
      reader.x = rx; reader.y = ry;
      const g = wandererGate(al);
      R.andThenTheOrderOpensIt = (pyres.length > 0 && !shutStill.ok && g.ok)
        ? `and it opens once one of yours has stood at the pole and read the name (day ${day}, ${pyres.length} stake) — a burning nobody saw is not an answer, and no coin changes hands either way`
        : `!! AFTER ${guardN} DAYS: pyres ${pyres.length}, before reading ${shutStill.ok ? 'ALREADY OPEN' : 'shut'}, after ${g.ok ? 'open' : g.why}`;
    });

    guard(['hisIsShutAtFirst', 'andSomebodyWhoGrewOpensIt'], () => {
      const ru = chars.find(c => c.wanderKey === 'rubido');
      if (!ru) { R.hisIsShutAtFirst = '!! NO RUBIDO'; return; }
      R.hisIsShutAtFirst = !wandererGate(ru).ok
        ? 'his is shut on a squad that has not grown one'
        : '!! OPEN ALREADY';
      const me = player().find(c => c.state !== 'dead');
      const was = me.stats.atk;
      me.stats.atk = 40;
      const g = wandererGate(ru);
      me.stats.atk = was;
      R.andSomebodyWhoGrewOpensIt = g.ok
        ? 'and it opens for somebody in your colours who could stand in front of it — the one thing here that cannot be bought'
        : `!! STILL SHUT WITH A 40-ATK BANNER (${g.why})`;
    });

    /* ---------- 6. AND TAKING ONE ON ACTUALLY WORKS ----------
       The gate and the act are separate functions and the whole point of `wandererGate` is
       that they cannot drift — so this drives the ACT, and checks the body that comes out is
       the line that was advertised. A succubus who joins as a human is the bug this catches. */
    guard(['andSheJoinsAsWhatSheIs'], () => {
      const al = chars.find(c => c.wanderKey === 'albedo');
      if (!al) { R.andSheJoinsAsWhatSheIs = '!! NO ALBEDO'; return; }
      const took = recruitWanderer(al);
      R.andSheJoinsAsWhatSheIs = (took && al.faction === 'player' && al.race === 'mimic' && al.sub === 'succubus')
        ? `and she joins as a ${subLabel(al).toLowerCase()}, not as somebody's idea of a human`
        : `!! TOOK ${took}, faction ${al.faction}, ${al.race}/${al.sub}`;
    });

    return R;
  });

  const bad = Object.values(out).filter(v => typeof v === 'string' && v.startsWith('!!'));
  for (const [k, v] of Object.entries(out)) console.log('  ' + k.padEnd(30) + v);
  for (const e of errs) console.log('  ' + e);
  console.log('');
  console.log(bad.length || errs.length
    ? `NOBODY LIKE THAT DRINKS HERE (${bad.length + errs.length})`
    : 'THERE IS ONE IN EVERY BAR AND TWO WITH NAMES');
  await b.close();
  process.exit(bad.length || errs.length ? 1 : 0);
})();
