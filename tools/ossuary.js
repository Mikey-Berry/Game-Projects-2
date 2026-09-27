#!/usr/bin/env node
/* THE OSSUARY KING, REBUILT (2026-09-27): a registrar, not a king, and nothing to do with the
 * old king in the Door.
 *
 *   1. he is on his throne in his house, with four of his court kneeling in the rows, and he
 *      is neutral until somebody makes him otherwise
 *   2. the cage of bone he wears reads the weapon: a hammer breaks it, a blade skates off it
 *   3. struck, he calls the roll: the rows stand up to answer, never more than six at once
 *   4. four tenths gone, the court rises and he walks; three quarters gone, the cage comes off
 *      and the ward with it
 *   5. he leaves the crown, the Sigil-Bound's and the demilich's errands still read him, and
 *      every shape survives a save
 *   6. nothing he says, and nothing said of him, mentions the old king
 *
 * Anything starting '!!' fails the build.
 *
 *   node tools/ossuary.js [game.html]
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
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message.slice(0, 160)));
  await p.goto('file://' + gamePath(process.argv[2]), { waitUntil: 'load', timeout: 180000 });
  await p.waitForSelector('#btn-start', { state: 'attached', timeout: 120000 });
  await p.waitForTimeout(1500);
  await p.evaluate(() => document.getElementById('btn-start').click());
  await p.waitForTimeout(2500);

  const out = await p.evaluate(() => {
    const R = {};
    if (typeof ossuaryKing !== 'function') { R.heIsOnHisThrone = '!! THE OSSUARY KING HAS NOT BEEN REBUILT IN THIS BUILD'; return R; }
    paused = true; hour = 12;
    const heard = [];
    { const orig = log; log = function (t) { heard.push(String(t)); return orig.apply(this, arguments); }; }
    const saidNow = (fn) => { const a = heard.length; fn(); return heard.slice(a).join(' '); };
    const k = ossuaryKing(), me = player()[0];
    const pets = () => chars.filter(c => c.petitioner && c.state === 'ok');

    /* ---- 1. on his throne ---- */
    const kneeling = pets().filter(c => c.kneel).length;
    R.heIsOnHisThrone = (k && ossuary && dist(k.x, k.y, ossuary.x, ossuary.y) < 0.5 && (k.bossPhase || 0) === 0 && k.boneWard
      && kneeling === 4 && cameThroughKey(k) === 'ossuary' && !hostile(k, me))
      ? `he sits on his throne in a far ruin with ${kneeling} of his court kneeling in the rows, drawn by his own body, and he will not start anything`
      : `!! KING ${!!k}, AT THRONE ${k && ossuary && dist(k.x, k.y, ossuary.x, ossuary.y).toFixed(1)}, PHASE ${k && k.bossPhase}, WARD ${k && k.boneWard}, KNEELING ${kneeling}, HOSTILE ${k && hostile(k, me)}`;

    /* ---- 2. the ward ---- */
    {
      const hit = (wt) => { const b0 = k.blood; const pk = Object.keys(k.parts)[0]; const h0 = k.parts[pk].hp;
        applyDamage(null, k, pk, 40, wt, false, null, false); const lost = (b0 - k.blood) + (h0 - k.parts[pk].hp);
        k.blood = b0; k.parts[pk].hp = h0; k.state = 'ok'; return lost; };
      const blunt = hit('blunt'), cut = hit('cut');
      R.theCageReadsTheWeapon = (blunt > cut * 2)
        ? `the same blow does ${blunt.toFixed(0)} with a hammer and ${cut.toFixed(0)} with a blade: the bone breaks, and a blade skates off it`
        : `!! BLUNT ${blunt.toFixed(1)} AGAINST CUT ${cut.toFixed(1)}`;
    }

    /* ---- 3. the roll ---- */
    for (const c of player()) { c.x = ossuary.x + 1; c.y = ossuary.y + 7; c.floor = 0; c.state = 'ok'; }
    for (const c of chars) if (!c.petitioner && !c.ossuary && c.faction !== 'player' && c.state !== 'dead' && dist(c.x, c.y, ossuary.x, ossuary.y) < 30) c.x += 400;
    rebuildCharGrid();
    k.provoked = true;
    let calledSay = '';
    calledSay = saidNow(() => { for (let i = 0; i < 40 * 4; i++) ossuaryTick(0.25); });
    const up = pets().length;
    R.heCallsTheRoll = (hostile(k, me) && up > 4 && up <= 6 && pets().every(c => !c.kneel && c.provoked) && /reads a name off the inside of his crown/.test(calledSay))
      ? `struck, he reads names off the band and the rows stand to answer: ${up} standing, which is as many as he allows, every kneeler up with them`
      : `!! HOSTILE ${hostile(k, me)}, STANDING ${up}, SAID "${calledSay.slice(0, 50)}"`;

    /* ---- 4. the court rises; the cage comes off ---- */
    {
      k.blood = k.maxBlood * 0.55; const r1 = saidNow(() => ossuaryTick(0.1));
      const rose = k.bossPhase === 1 && /gets up off his throne/.test(r1);
      k.x = ossuary.x + 3; ossuaryTick(0.1);
      const walks = dist(k.x, k.y, ossuary.x, ossuary.y) > 2;
      k.blood = k.maxBlood * 0.2; const r2 = saidNow(() => ossuaryTick(0.1));
      const shed = k.bossPhase === 2 && !k.boneWard && /breaks open and falls off him/.test(r2);
      R.theCourtRisesAndTheCageComesOff = (rose && walks && shed)
        ? 'four tenths gone he gets up off the throne and walks; three quarters gone the cage breaks off him, and the ward goes with it'
        : `!! ROSE ${rose}, WALKS ${walks}, SHED ${shed} (PHASE ${k.bossPhase}, WARD ${k.boneWard})`;
    }

    /* ---- 5. through a save, and what he leaves ---- */
    {
      restore(JSON.parse(JSON.stringify(snapshot())));
      const k2 = ossuaryKing();
      const kept = k2 && k2.bossPhase === 2 && !k2.boneWard && k2.ossuary && ossuary;
      const fell = saidNow(() => kill(k2, player()[0]));
      const body = corpses.find(c => c.ossuary);
      const errands = IMMORTAL_LINES.sigil.stages.some(st => st.kind === 'slay' && st.boss === 'king');
      R.heSurvivesASaveAndLeavesTheCrown = (kept && body && body.dropItems && body.dropItems.crown === 1 && bossSlain.king && errands && /goes down among his petitioners/.test(fell))
        ? 'his last shape survives a save and a reload, and put down he leaves the Sunken Crown the Sigil-Bound and the demilich both send you for'
        : `!! KEPT ${!!kept}, BODY ${!!body}, CROWN ${body && body.dropItems && body.dropItems.crown}, LEDGER ${bossSlain.king}, ERRAND ${errands}, SAID "${fell.slice(0, 40)}"`;
    }

    /* ---- 6. no relation ---- */
    {
      const all = [...OSSUARY_BARKS, heard.join(' '), ...IMMORTAL_LINES.dark.stages.map(st => (st.ask || '') + ' ' + (st.done || ''))].join(' ');
      R.nothingToDoWithTheOldKing = !/old king|hanged/i.test(all)
        ? 'and nothing he says, or anything said about him, reaches for the old king in the Door'
        : '!! THE OSSUARY KING IS TIED TO THE OLD KING IN TEXT';
    }
    return R;
  });

  const bad = Object.values(out).filter(v => typeof v === 'string' && v.startsWith('!!'));
  for (const [k, v] of Object.entries(out)) console.log('  ' + k.padEnd(36) + ' ' + v);
  for (const e of errs) console.log('  ' + e);
  console.log('');
  const which = Object.keys(out).filter(k => typeof out[k] === 'string' && out[k].startsWith('!!'));
  console.log(bad.length || errs.length ? `*** THE OSSUARY KING IS WRONG (${bad.length + errs.length}): ${[...which, ...errs.map(() => 'pageerror')].join(', ')} ***`
                                        : 'THE REGISTRAR SITS, RISES AND SHEDS');
  await b.close();
  process.exit(bad.length || errs.length ? 1 : 0);
})();
