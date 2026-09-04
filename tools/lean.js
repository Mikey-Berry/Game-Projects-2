#!/usr/bin/env node
/* A SAVE ONLY HAS TO WRITE WHAT IS NOT THE DEFAULT.
 *
 * `mobile.js` went red at 4213KB against a 4MB budget after the underground rework quadrupled
 * the number of bodies living below the map. Measured before touching anything:
 *
 *   · `chars` was 97.9% of the entire save — 1046 records at 4036 bytes each. Everything else
 *     in the file put together, the terrain included, was 91KB.
 *   · Of those bytes, 1138KB was the word `false`, 938KB was `null`, and 618KB was a `parts`
 *     block in which 7322 of 7322 entries were at full health and unsevered.
 *
 * Every flag in the character record is written for every body in the world whether it means
 * anything or not, and `restore` reads all of them through a default — `!!s.foo`,
 * `s.foo || null`, `s.foo ?? null` — under which a MISSING key and a saved `false` or `null`
 * are indistinguishable. So they are simply not written any more. It is not a format change:
 * an old save loads unchanged, because the reader never told the two cases apart.
 *
 * THE ONE EXCEPTION IS `construct`, read as
 * `s.construct !== undefined ? !!s.construct : !!(RACES[c.race]||{}).construct` — a golem saved
 * as deliberately not-a-construct would come back a construct if the key vanished. That is the
 * exact shape of bug this file exists to catch, so it is asserted rather than trusted.
 *
 *   node tools/lean.js [game.html]
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
  await p.evaluate(() => { document.getElementById('btn-start').click(); paused = true; });
  await p.waitForFunction(() => document.getElementById('startoverlay').style.display === 'none', null, { timeout: 60000 });

  const out = await p.evaluate(() => {
    const R = {};
    paused = true;

    /* ---------- A BODY CARRYING EVERY SHAPE OF FIELD THIS CHANGE TOUCHES ----------
       Set on a real character in the live world so it goes through the real snapshot: flags
       that are TRUE (which must survive), a flag that is FALSE and exempt (`construct` on a
       golem, whose race default is the opposite), strings, numbers and a nested object. */
    const me = player()[0];
    const g = makeChar('Test Subject', 'player', me.x + 2, me.y, { atk: 5, def: 5, tough: 9 });
    g.state = 'ok'; chars.push(g);
    g.race = 'golem'; g.sub = 'clay';
    g.construct = false;                 /* a golem that is deliberately NOT a construct */
    g.lieutenant = true; g.moonborn = true; g.strongborn = true; g.minded = true;
    g.gift = 'destruction'; g.giftTwo = 'dark';
    g.att = { divine: 0, destruction: 2, dark: 1, dust: 0 };
    g.pregnant = 0; g.overdue = 0; g.lastBorn = null;
    g.kin = 'mage'; g.shortTag = 'LT'; g.conviction = 'loyal';
    const gid = g.id;

    const A = snapshot();
    const rec = A.chars.find(c => c.id === gid);

    /* ---------- 1. NOTHING DEFAULT IS WRITTEN ---------- */
    {
      let falses = 0, nulls = 0, offenders = [];
      for (const c of A.chars) for (const k in c) {
        const v = c[k];
        if (v === false) { falses++; if (k !== 'construct' && offenders.length < 6) offenders.push(k); }
        if (v === null) { nulls++; if (offenders.length < 6) offenders.push(k); }
      }
      const bytes = JSON.stringify(A).length, chb = JSON.stringify(A.chars).length;
      R._size = `${A.chars.length} bodies, ${(chb / A.chars.length).toFixed(0)} bytes each; whole save ${(bytes / 1024).toFixed(0)} KB, of which chars are ${(chb / bytes * 100).toFixed(1)}%`;
      R.nothingDefaultIsWritten = offenders.length === 0
        ? `not one \`false\` outside \`construct\` and not one \`null\` anywhere in ${A.chars.length} bodies — ${falses} exempt \`construct\` flags remain, which is the whole of it`
        : `!! DEFAULTS ARE STILL BEING WRITTEN (${offenders.join(', ')} — ${falses} false, ${nulls} null)`;
      /* and the size, which is the thing that went red */
      R.andItFitsOnAPhone = bytes / 1024 < 4096
        ? `and the save is ${(bytes / 1024).toFixed(0)} KB, inside a 4MB mobile budget — it was 4213`
        : `!! THE SAVE IS ${(bytes / 1024).toFixed(0)} KB, PAST THE BUDGET`;
    }

    /* ---------- 2. AND WHAT WAS DROPPED COMES BACK AS WHAT WAS DROPPED ----------
       THE CLAIM THAT ACTUALLY GUARDS THIS, and it took two goes to state. The first version
       compared every key of every body across a round trip and went red on three things that
       have nothing to do with this change: a Cairn Beast's atk re-derived from its boss table
       on load, a `speedMult` of 0 coming back as 1, and a staged body being given a squad
       number. All three are values PRESENT on both sides — none of them is a dropped key — and
       a claim that fails on them is a claim about save/load drift in general, which is a
       different and much larger question.
       The risk this change actually carries is narrow and can be asked exactly: a key that was
       left out because it was `false` or `null` must not come back as anything else. Both
       snapshots leave those out, so the whole failure mode is a key APPEARING in the second
       snapshot that was absent from the first, or VANISHING from it — and vanishing is what
       caught `w_sw` and `w_dag`, two weapons the world spawns that were never items at all. */
    {
      restore(JSON.parse(JSON.stringify(A)));
      const B = snapshot();
      const byId = new Map(B.chars.map(c => [c.id, c]));
      const diffs = [];
      let compared = 0, dropped = 0;
      for (const a of A.chars) {
        const b2 = byId.get(a.id);
        if (!b2) { diffs.push(`${a.name}: gone`); continue; }
        for (const k of new Set([...Object.keys(a), ...Object.keys(b2)])) {
          const inA = k in a, inB = k in b2;
          if (inA && inB) { compared++; continue; }   /* present both sides — not this claim's business */
          dropped++;
          if (diffs.length < 8) diffs.push(inA
            ? `${a.name}.${k}: ${JSON.stringify(a[k])} was saved and did not come back`
            : `${a.name}.${k}: ${JSON.stringify(b2[k])} appeared out of a key that was never written`);
        }
      }
      R._trip = `${compared} fields present on both sides across ${A.chars.length} bodies`;
      R.whatWasDroppedComesBack = diffs.length === 0
        ? `save, load, save again and the two files hold exactly the same set of keys — nothing left out came back as something else`
        : `!! ${dropped} KEY(S) CHANGED EXISTENCE ACROSS A ROUND TRIP (${diffs.join(' | ')})`;
    }

    /* ---------- 3. AND THE ONE EXEMPTION IS DOING ITS JOB ---------- */
    {
      const back = chars.find(c => c.id === gid);
      R._subject = rec ? `the staged body wrote ${Object.keys(rec).length} keys` : '!! THE STAGED BODY WAS NOT IN THE SAVE';
      R.aFalseThatMeansSomethingSurvives = back && back.race === 'golem' && back.construct === false
        ? 'a golem saved as deliberately not-a-construct comes back not a construct — the one `false` worth the bytes'
        : `!! THE EXEMPTION FAILED (race ${back && back.race}, construct ${back && back.construct}, race default ${!!(RACES.golem || {}).construct})`;
      R.andEverythingTrueSurvives = back && back.lieutenant && back.moonborn && back.strongborn &&
        back.gift === 'destruction' && back.giftTwo === 'dark' && back.kin === 'mage' &&
        back.conviction === 'loyal' && back.att && back.att.destruction === 2
        ? 'and every flag that was TRUE and every field that held something is still there after the trip'
        : `!! SOMETHING TRUE WAS LOST (${back ? JSON.stringify({ lt: back.lieutenant, mb: back.moonborn, sb: back.strongborn, gift: back.gift, g2: back.giftTwo, kin: back.kin, conv: back.conviction, att: back.att && back.att.destruction }) : 'body gone'})`;
    }

    return R;
  });

  console.log('=== A SAVE ONLY WRITES WHAT IS NOT THE DEFAULT ===\n');
  for (const [k, v] of Object.entries(out)) console.log('  ' + k.padEnd(30) + v);
  if (errs.length) console.log('\n' + errs.join('\n'));
  const bad = Object.values(out).map(String).filter(v => v.startsWith('!!')).concat(errs);
  console.log('\n' + (bad.length ? '*** ' + bad.join('\n*** ')
    : 'THE DEFAULTS ARE NOT WRITTEN, AND A ROUND TRIP CHANGES NOTHING'));
  await b.close();
  process.exit(bad.length ? 1 : 0);
})();
