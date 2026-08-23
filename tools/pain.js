#!/usr/bin/env node
/* WHAT COMES OUT OF A BODY THAT HAS JUST LOST AN ARM.
 *
 * "Sometimes friendly fire or limb loss produces a general response not really fitting for the
 * character. (Like a gaunt screaming after losing a limb.) Perhaps gaunts could even use
 * accented characters or Unicode-type letters to represent their eldritch noises."
 *
 * `say(d, 'AAAGH!')` sat in the severance branch with no test of any kind on it, so a Watcher
 * losing a limb screamed a human scream, in English, in capitals. Four more lines were the
 * same shape.
 *
 * The report is checked where it happens — a real gaunt, a real cut, a real severed limb, and
 * whatever ends up in the bubble — rather than by reading a table. Then the two things that
 * would make the fix cosmetic:
 *
 *   · the eldritch noise has to RENDER. The bubble is canvas `fillText` at 10px monospace and
 *     a codepoint the fallback font has never met comes out as a box, which is a worse bug
 *     than the one being fixed. Every gaunt line is checked against Latin-1.
 *   · a thing with no words says nothing, rather than falling back to the human line.
 *
 * And one that has nothing to do with the report and everything to do with this file: a
 * speech bubble must not move the simulation.
 *
 *   node tools/pain.js [game.html]
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
    const born = [];
    const clean = () => { for (let i = chars.length - 1; i >= 0; i--) if (chars[i].__probe) chars.splice(i, 1); };

    const keep = (c) => { c.__probe = true; c.state = 'ok'; chars.push(c); born.push(c); return c; };
    const person = () => keep(makeChar('Probe Hand', 'player', 500, 500, { atk: 5, def: 5, tough: 40 }));
    const gaunt = () => { const g = spawnGaunt('stalker', 505, 505) || chars[chars.length - 1]; return keep(g); };

    /* ---------- TAKE AN ARM OFF, FOR REAL ----------
       Through `applyDamage` with a cutting weapon, which is the only path severance has, and
       the roll is forced rather than waited on so the probe is not a coin-flipping loop. */
    const takeAnArm = (c) => {
      c.bubble = null;
      const part = c.parts['l.arm'];
      part.hp = -400; part.severed = false;
      const r0 = Math.random;
      Math.random = () => 0;
      let guard = 0;
      while (!part.severed && guard++ < 400) { part.hp = -400; applyDamage(null, c, 'l.arm', 1, 'cut', false); }
      Math.random = r0;
      return { severed: part.severed, said: c.bubble ? c.bubble.text : null };
    };

    /* ---------- 1. THE REPORT ---------- */
    {
      const g = gaunt();
      g.parts['l.arm'].max = 100;
      const cut = takeAnArm(g);
      R.gauntLimb = cut.severed ? `a gaunt loses an arm and says "${cut.said}"` : '!! COULD NOT TAKE A GAUNT\'S ARM OFF AT ALL';
      const ascii = /^[\x00-\x7F]*$/.test(cut.said || '');
      R.aGauntDoesNotScreamInEnglish = (cut.said && !ascii)
        ? 'and not one letter of it is a word — the noise is the whole of what it is'
        : `!! A GAUNT LOST A LIMB AND SAID "${cut.said}"`;
    }

    /* ---------- 2. AND THE NOISE ACTUALLY RENDERS ----------
       Latin-1 is the whole allowance. The bubble is 10px monospace on a canvas and a codepoint
       outside what the fallback font ships is a box on screen, which is a worse bug than the
       one this file exists for. */
    if (typeof BARK === 'object') {
      const bad = [];
      for (const k of Object.keys(BARK)) for (const line of (BARK[k].gaunt || []))
        for (const ch of line) if (ch.codePointAt(0) > 0xFF) bad.push(k + ': ' + ch);
      const n = Object.keys(BARK).reduce((a, k) => a + (BARK[k].gaunt || []).length, 0);
      R.andItWillRender = bad.length === 0
        ? `and all ${n} gaunt utterances stay inside Latin-1, which every font on earth ships`
        : `!! ${bad.length} GAUNT GLYPH(S) ARE PAST LATIN-1 AND WILL DRAW AS BOXES: ${bad.slice(0, 3).join(', ')}`;
    } else R.andItWillRender = '!! THERE IS NO BARK TABLE';

    /* ---------- 3. A PERSON STILL SCREAMS ----------
       The control. The human line was never the bug. */
    {
      const h = person();
      const cut = takeAnArm(h);
      const pool = (typeof BARK === 'object' && BARK.sever.person) || ['AAAGH!'];
      R.andAPersonStillScreams = (cut.severed && pool.indexOf(cut.said) >= 0)
        ? `and a living hand still screams — "${cut.said}"`
        : `!! A PERSON LOST AN ARM AND SAID "${cut.said}"`;
    }

    /* ---------- 4. AND A THING WITH NO WORDS SAYS NOTHING ----------
       Not the human line, and not a risen man's line either. A wisp is `undead` AND `beast`
       AND `minded` — the mind is there so it can follow an order, which is how it ended up
       reading lines written for people who had one. */
    if (typeof barkFor === 'function') {
      const w = keep(makeChar('Probe Wisp', 'player', 502, 502, { atk: 1, def: 4, tough: 2 }));
      w.undead = true; w.beast = true; w.wisp = true; w.minded = true; w.crafted = true;
      const said = barkFor(w, 'sever'), chat = squadBark(w);
      const human = (BARK.sever.person || []).indexOf(said) >= 0;
      R.andAWispIsNotAManInAJar = (!human && !chat)
        ? `and a wisp answers a lost limb with ${said ? '"' + said + '"' : 'nothing'} and has no view on the larder at all`
        : `!! A WISP SAID "${said}" AND CHATTED: "${(chat || '').slice(0, 50)}"`;
    } else R.andAWispIsNotAManInAJar = '!! THERE IS NO barkFor';

    /* ---------- 5. FIVE PLACES SAID ONE THING TO THE WHOLE WORLD ----------
       Severance, friendly fire, the alarm, a bodyguard stepping in and a seizure. Each of them
       has to answer differently to a person, a lieutenant, a lich and a gaunt, or the fix is
       one line deep. */
    if (typeof barkFor === 'function') {
      const mk = (o) => { const c = keep(makeChar('V', 'player', 503, 503, { atk: 4, def: 4, tough: 9 })); Object.assign(c, o); return c; };
      const cast = { person: mk({}), lieutenant: mk({ undead: true, lieutenant: true }),
                     lich: mk({ undead: true, lich: true }), risen: mk({ undead: true, minded: true }) };
      const flat = [];
      let thin = [];
      for (const k of ['sever', 'ff', 'alarm']) {
        const said = {};
        for (const [nm, c] of Object.entries(cast)) {
          const seen = new Set();
          for (let i = 0; i < 60; i++) { const l = barkFor(c, k); if (l) seen.add(l); }
          said[nm] = seen;
          for (const l of seen) flat.push(k + '|' + nm + '|' + l);
        }
        const names = Object.keys(said);
        for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++)
          if ([...said[names[i]]].some(l => said[names[j]].has(l))) thin.push(`${k}: ${names[i]}/${names[j]}`);
        if (Object.values(said).some(sset => sset.size === 0)) thin.push(k + ': somebody had nothing');
      }
      R.andEveryVoiceAnswersDifferently = thin.length === 0
        ? `and ${flat.length} lines across three moments, with no two kinds of body sharing one`
        : `!! VOICES SHARE LINES: ${thin.slice(0, 4).join(', ')}`;
    } else R.andEveryVoiceAnswersDifferently = '!! THERE IS NO barkFor';

    /* ---------- 6. AND A SPEECH BUBBLE DOES NOT MOVE THE SIMULATION ----------
       Nothing to do with the report and everything to do with this file. `pick` spends the
       world's seeded stream, so which of three lines a body shouted decided what the next
       arrow did — a whole run of combat diverging on a speech bubble. Nothing downstream reads
       which line came out, so nothing downstream should pay for it. */
    if (typeof barkFor === 'function') {
      const c = person();
      const before = seed;
      for (let i = 0; i < 200; i++) barkFor(c, 'sever');
      R.andABubbleCostsTheWorldNothing = seed === before
        ? 'and two hundred barks moved the world\'s seeded stream by exactly nothing'
        : `!! 200 BARKS SPENT ${((seed - before) >>> 0)} OF THE WORLD'S STREAM`;
    } else R.andABubbleCostsTheWorldNothing = '!! THERE IS NO barkFor';

    clean();
    return R;
  });

  const bad = Object.values(out).filter(v => typeof v === 'string' && v.startsWith('!!'));
  for (const [k, v] of Object.entries(out)) console.log('  ' + k.padEnd(32) + v);
  for (const e of errs) console.log('  ' + e);
  console.log('');
  console.log(bad.length || errs.length
    ? `SOMETHING IS STILL SCREAMING IN THE WRONG LANGUAGE (${bad.length + errs.length})`
    : 'EVERY BODY MAKES ITS OWN NOISE');
  await b.close();
  process.exit(bad.length || errs.length ? 1 : 0);
})();
