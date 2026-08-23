#!/usr/bin/env node
/* WHO IS ALLOWED TO SAY WHAT.
 *
 * "Some undead speak as regular party members. Intelligence should not necessarily have them
 * to that level — at the very least the lines should be double checked and confirmed as
 * realistic when coming from undead. (Liches are an exception — although they should have
 * some unique dialogue too.)"
 *
 * The old gate stopped a nameless skeleton chatting and nothing else. Anything with a mind —
 * a soul-bound risen, a stitched one, a lieutenant, a lich — read the SAME TABLES a living
 * recruit reads, so a corpse would tell you it could not remember the last thing it ate.
 *
 * A harness cannot judge whether a line is in character. What it CAN do is refuse to let one
 * table be read by two kinds of body: every string written for the living is collected up,
 * and then four hundred barks are pulled out of each kind of undead and checked against it.
 * That is a mechanical question with a mechanical answer, and it goes red on the build before
 * for exactly the right reason.
 *
 *   node tools/voices.js [game.html]
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

    /* every line ever written for a living recruit, flattened */
    const living = new Set();
    const eat = (o) => {
      if (typeof o === 'string') { living.add(o); return; }
      if (Array.isArray(o)) { o.forEach(eat); return; }
      if (o && typeof o === 'object') Object.values(o).forEach(eat);
    };
    eat(CONV_TALK); eat(SITU_TALK);
    R.livingLines = `${living.size} lines are written for the living`;

    const born = [];
    const mk = (o) => {
      const c = makeChar('Probe Voice', 'player', 500, 500, { atk: 5, def: 5, tough: 10 });
      Object.assign(c, o);
      c.__probe = true; c.state = 'ok'; c.conviction = c.conviction || 'cold';
      c.regard = c.regard === undefined ? 0 : c.regard;
      chars.push(c); born.push(c); return c;
    };
    /* squadBark can decline (it returns null when a living body has nothing to say), so the
       sample is over DRAWS and the count of nulls is reported rather than retried away */
    const draw = (c, n) => {
      const got = [], nulls = [];
      for (let i = 0; i < n; i++) { c.lastSitu = null; const l = squadBark(c); if (l) got.push(l); else nulls.push(1); }
      return { got, nulls: nulls.length };
    };

    /* ---------- THE REPORT ---------- */
    const soul = mk({ undead: true, minded: true, kin: 'soul' });
    const lieu = mk({ undead: true, lieutenant: true });
    const lich = mk({ undead: true, lich: true });
    const warm = mk({});                       /* the control: somebody alive */

    const dSoul = draw(soul, 400), dLieu = draw(lieu, 400), dLich = draw(lich, 400), dWarm = draw(warm, 400);
    const leak = (d) => d.got.filter(l => living.has(l));

    R.sample = `400 draws apiece: soul-bound ${dSoul.got.length}, lieutenant ${dLieu.got.length}, ` +
               `lich ${dLich.got.length}, living ${dWarm.got.length}`;

    R.theRisenDoNotReadTheLivingsLines = leak(dSoul).length === 0
      ? 'a soul-bound risen never once reached for a line written for a living recruit'
      : `!! A RISEN SAID ${leak(dSoul).length}/${dSoul.got.length} LIVING LINES, e.g. "${leak(dSoul)[0].slice(0, 60)}"`;
    R.norDoLieutenants = leak(dLieu).length === 0
      ? 'and neither does a lieutenant, which remembers being somebody and is not somebody'
      : `!! A LIEUTENANT SAID ${leak(dLieu).length}/${dLieu.got.length} LIVING LINES, e.g. "${leak(dLieu)[0].slice(0, 60)}"`;
    R.andTheLichHasItsOwn = leak(dLich).length === 0 && dLich.got.length > 0
      ? `and the lich — the exception the report asks for — talks out of ${new Set(dLich.got).size} lines of its own`
      : `!! THE LICH SAID ${leak(dLich).length}/${dLich.got.length} LIVING LINES, e.g. "${(leak(dLich)[0] || '').slice(0, 60)}"`;

    /* ---------- AND THEY ARE THREE DIFFERENT THINGS TO BE ----------
       One shared undead pool would pass every assertion above and still be wrong: a lich and a
       stitched cadaver do not sound alike, and the report is explicit that the lich is the
       exception rather than a fourth flavour of the same thing. */
    {
      const sSoul = new Set(dSoul.got), sLieu = new Set(dLieu.got), sLich = new Set(dLich.got);
      const shared = [...sSoul].filter(l => sLieu.has(l) || sLich.has(l)).length
                   + [...sLieu].filter(l => sLich.has(l)).length;
      R.andTheyAreNotOnePool = (shared === 0 && sSoul.size > 4 && sLieu.size > 4 && sLich.size > 4)
        ? `three registers of ${sSoul.size}, ${sLieu.size} and ${sLich.size} lines with nothing in common between them`
        : `!! THE UNDEAD REGISTERS OVERLAP BY ${shared} LINE(S) (${sSoul.size}/${sLieu.size}/${sLich.size})`;
    }

    /* ---------- CONTROL: THE LIVING ARE UNTOUCHED ---------- */
    R.andTheLivingStillTalk = dWarm.got.length > 0 && dWarm.got.every(l => living.has(l))
      ? `and every one of ${dWarm.got.length} lines from a living recruit still comes out of the tables written for them`
      : `!! A LIVING RECRUIT SAID ${dWarm.got.filter(l => !living.has(l)).length} LINES FROM SOMEWHERE ELSE`;

    /* ---------- CONTROL: A HAND WITH NO MIND STILL SAYS NOTHING ----------
       Asked through `mindedDead`, which is the gate the idle loop uses, so this is the real
       door and not a copy of it. */
    {
      const hand = mk({ undead: true });
      R.andAPlainRisenIsStillSilent = !mindedDead(hand)
        ? 'and a risen with nobody in it is still refused the floor entirely'
        : '!! A NAMELESS SKELETON IS ALLOWED TO TALK';
    }

    /* ---------- AND THE TURNING POINT IS IN THE RIGHT VOICE ----------
       `deed` says something out loud when somebody crosses into devotion or into fury, and the
       line it said was 'I am with you.' whoever was saying it. */
    {
      const say0 = say;
      const heard = {};
      window.say = (c, t) => { heard[c.name] = t; say0(c, t); };
      for (const [nm, c] of [['soul', soul], ['lieu', lieu], ['lich', lich], ['warm', warm]]) {
        c.name = nm; c.regard = 55; c.conviction = 'cold';
      }
      deed('gold', 20);
      window.say = say0;
      const uniq = new Set(['soul', 'lieu', 'lich', 'warm'].map(k => heard[k]).filter(Boolean));
      R.andTheTurningPointIsToo = (heard.warm === 'I am with you.' && uniq.size === 4)
        ? `and crossing into devotion says four different things: "${heard.soul}" / "${heard.lich}"`
        : `!! THE TURNING POINT SAID ${uniq.size} DIFFERENT THING(S) ACROSS FOUR KINDS OF BODY`;
    }

    for (let i = chars.length - 1; i >= 0; i--) if (chars[i].__probe) chars.splice(i, 1);
    return R;
  });

  const bad = Object.values(out).filter(v => typeof v === 'string' && v.startsWith('!!'));
  for (const [k, v] of Object.entries(out)) console.log('  ' + k.padEnd(34) + v);
  for (const e of errs) console.log('  ' + e);
  console.log('');
  console.log(bad.length || errs.length
    ? `THE DEAD ARE STILL TALKING LIKE THE LIVING (${bad.length + errs.length})`
    : 'FOUR REGISTERS, AND NOBODY BORROWS ANOTHER ONE');
  await b.close();
  process.exit(bad.length || errs.length ? 1 : 0);
})();
