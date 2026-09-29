#!/usr/bin/env node
/* THE OLD KING, CHECKED IN PLAY (2026-09-26). Internally the Hanged King; to everybody in the
 * world, only ever the old king.
 *
 *   1. when the sky opens he is hanging in the Door, out of reach: seen, not in `chars`, talking
 *   2. with the Brood down, a finished hold does not close the Door: it brings him down, and the
 *      Door stays open while he stands in it
 *   3. his noose is a warned ring that lifts whoever it catches off their feet, hurt and held
 *   4. what came out of the Door leaves him be, and nothing else in the world is his
 *   5. he survives a save, standing or hanging
 *   6. put him down and the same hold lands; his crown is on the body
 *   7. nothing the player reads calls him the Hanged King
 *
 * Anything starting '!!' fails the build.
 *
 *   node tools/oldking.js [game.html]
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
  await p.goto('file://' + gamePath(process.argv[2]), { waitUntil: 'load', timeout: 90000 });
  await p.waitForSelector('#btn-start', { state: 'attached', timeout: 60000 });
  await p.waitForTimeout(1500);
  await p.evaluate(() => document.getElementById('btn-start').click());
  await p.waitForTimeout(2500);

  const out = await p.evaluate(() => {
    const R = {};
    if (typeof oldKingAlive !== 'function') { R.theOldKingHangsInTheDoor = '!! THERE IS NO OLD KING IN THIS BUILD'; return R; }
    paused = true; hour = 12;
    /* every line the game logs, kept here: the log panel trims itself, so reading it back loses lines */
    const heard = [];
    { const orig = log; log = function (t) { heard.push(String(t)); return orig.apply(this, arguments); }; }
    const said = () => heard.join(' ');
    const saidNow = (fn) => { const a = heard.length; fn(); return heard.slice(a).join(' '); };
    fracture = 100; fractureStage = fractureStageOf(fracture); ruin = false; theDoor = null;
    towns.forEach(t => { t.sacked = 0; t.order = 70; });
    const me = player()[0];
    me.gift = me.gift || 'dark'; me.stats.magic = 25;
    for (const k of Object.keys(DOOR_SEAL_COST)) stash[k] = (stash[k] || 0) + 999;

    /* ---- 1. up there ---- */
    let d = null;
    const opened = saidNow(() => { d = openTheDoor(); });
    for (const c of player()) { c.x = d.x + 8; c.y = d.y + 8; c.floor = 0; c.moveTarget = null; c.target = null; }
    /* nobody of the crater's own in the way of what is being measured */
    for (const c of chars) if (c.faction !== 'player' && !c.brood && c.state !== 'dead' && dist(c.x, c.y, d.x, d.y) < 40) c.x += 400;
    rebuildCharGrid();
    const inChars = !!chars.find(c => c.bossKey === 'oldking');
    if (!debugSeeAll) toggleSeeAll();
    syncHangedKing(performance.now());
    const drawn = hangedKingFx.visible;
    _kingSayT = 0;
    const talk = saidNow(() => oldKingTick(0.1));
    R.theOldKingHangsInTheDoor = (!inChars && drawn && /hanging in the mouth of it/.test(opened) && /crown/.test(opened) && /The old king, from the Door/.test(talk))
      ? `the sky opens with a crowned figure hanging in the Door on a rope of light, drawn and out of reach, and he talks: ${talk.trim().slice(0, 90)}`
      : `!! IN CHARS ${inChars}, DRAWN ${drawn}, OPENED "${opened.slice(0, 60)}", TALK "${talk.slice(0, 60)}"`;

    /* ---- 2. the Brood down, the hold finished: he comes down, and the Door stays open ---- */
    const br = broodAlive();
    if (br) kill(br, me);
    me.x = d.x; me.y = d.y; me.mana = 999;
    theDoor.work = DOOR_WORK;
    const down = saidNow(() => workTheDoor(me, 1 / 30));
    const k = oldKingAlive();
    theDoor.work = DOOR_WORK; workTheDoor(me, 1 / 30);
    const stillOpen = !!theDoor;
    R.theHoldBringsHimDown = (k && theDoor && theDoor.kingDown && stillOpen && /old king stands up in the Door/.test(down)
      && threadOf('rite') && /old king/i.test(threadOf('rite').step || ''))
      ? `with the Brood dead the finished hold does not shut the sky: it brings him down the rope (${k.name}, ${k.maxBlood} blood), the Door stays open while he stands, and the journal says so`
      : `!! KING ${k ? k.name : 'none'}, KINGDOWN ${theDoor && theDoor.kingDown}, OPEN AFTER A SECOND PASS ${stillOpen}, SAID "${down.slice(0, 60)}"`;

    /* ---- 3. the noose ---- */
    if (k) {
      const v = player().find(c => c !== me) || me;
      for (const c of player()) { c.x = k.x + 30; c.y = k.y + 30; }
      v.x = k.x + 5; v.y = k.y; v.floor = 0; v.state = 'ok';
      rebuildCharGrid();
      const b0 = v.blood + Object.values(v.parts).reduce((s, x) => s + x.hp, 0);
      k._nooseT = 0; craterStrikes.length = 0;
      oldKingTick(0.1);
      const ring = craterStrikes.find(st => st.noose);
      const at = ring ? dist(ring.x, ring.y, v.x, v.y) : 99;
      for (let i = 0; i < 70; i++) strikeTick(1 / 30);
      const b1 = v.blood + Object.values(v.parts).reduce((s, x) => s + x.hp, 0);
      R.theNooseLiftsWhatItCatches = (ring && at < 0.1 && v.hangT > 0 && v.staggerT > 0 && b1 < b0)
        ? `a gold ring at a body's feet, warned for ${STRIKE_WARN}s, then it closes: held off the ground ${v.hangT.toFixed(1)}s, reeling, and ${Math.round(b0 - b1)} hurt`
        : `!! RING ${!!ring} AT ${at.toFixed(1)}, HANG ${v.hangT}, STAGGER ${v.staggerT}, HURT ${Math.round(b0 - b1)}`;
      v.hangT = 0; v.staggerT = 0;
    }

    /* ---- 4. whose side ---- */
    if (k) {
      const maw = spawnGaunt('maw', k.x + 3, k.y); maw.doorborn = true; maw.nightborn = false;
      const town = chars.find(c => c.faction === 'town' && c.state === 'ok');
      const col = { x: k.x, y: k.y, t: 0, hit: true };
      const kb = k.blood; craterStrike(col);
      R.hisOwnLeaveHimBe = (!hostile(k, maw) && hostile(k, me) && (!town || hostile(k, town)) && k.blood === kb)
        ? 'what came out of the Door does not turn on him, the crater\'s light does not burn him, and everybody else is his enemy'
        : `!! MAW ${hostile(k, maw)}, PLAYER ${hostile(k, me)}, TOWN ${town && hostile(k, town)}, BURNT ${kb - k.blood}`;
      const i = chars.indexOf(maw); if (i >= 0) chars.splice(i, 1);
    }

    /* ---- 5. through a save ---- */
    {
      restore(JSON.parse(JSON.stringify(snapshot())));
      const k2 = oldKingAlive();
      R.heSurvivesASave = (k2 && theDoor && theDoor.kingDown && k2.head === 'h_oldcrown' && k2.maxBlood === OLDKING_BLOOD)
        ? 'and a save and a reload bring him back standing in the Door, crowned, with the Door still knowing he came down'
        : `!! AFTER A RELOAD: KING ${!!k2}, DOOR ${!!theDoor}, KINGDOWN ${theDoor && theDoor.kingDown}`;
    }

    /* ---- 6. put him down ---- */
    {
      const k3 = oldKingAlive(), me3 = player()[0];
      me3.gift = me3.gift || 'dark'; me3.x = theDoor.x; me3.y = theDoor.y; me3.mana = 999;
      for (const kk of Object.keys(DOOR_SEAL_COST)) stash[kk] = (stash[kk] || 0) + 999;
      const fell = saidNow(() => kill(k3, me3));
      const body = corpses.find(c => c.bossKey === 'oldking');
      /* and the rest of the sky with it: tears open in the waste and the Attention high */
      for (let i = 0; i < 3; i++) {
        const q = findOpenNear(Math.round(W / 2 + (i - 1) * 60), Math.round(H / 2 + 40), 8);
        if (!riftAt(q.x, q.y)) openRift(q.x, q.y);
      }
      const tears0 = rifts.length;
      noticed = 90; noticeTier = noticeTierOf(noticed);
      theDoor.work = DOOR_WORK;
      const shutSaid = saidNow(() => workTheDoor(me3, 1 / 30));
      R.andTheWorldLetsOutItsBreath = (!theDoor && tears0 >= 3 && rifts.length === 0 && noticed === 0 && noticeTier === 0 && /close at once/.test(shutSaid))
        ? `sealing the Door closes all ${tears0} tears in the waste with it and puts the Attention back to nothing ("${(shutSaid.match(/Out in the waste[^|]*/) || [''])[0].slice(0, 70)}…")`
        : `!! AFTER THE DOOR: tears ${tears0} -> ${rifts.length}, Attention ${noticed} (tier ${noticeTier}), said "${shutSaid.slice(0, 80)}"`;
      R.putHimDownAndItLands = (!theDoor && /old king goes down/.test(fell) && body && body.head === 'h_oldcrown' && bossSlain.oldking)
        ? `put him down and the same hold shuts the sky; his crown is on the body ("${ITEMS.h_oldcrown.name}")`
        : `!! DOOR ${theDoor ? 'still open' : 'shut'}, FELL "${fell.slice(0, 50)}", CROWN ${body && body.head}, LEDGER ${bossSlain.oldking}`;
    }

    /* ---- 7. never the Hanged King, out loud ---- */
    {
      const all = [...OLDKING_HANGING, ...OLDKING_STANDING, ITEMS.h_oldcrown.name, ITEMS.h_oldcrown.desc, said(),
        ...threads.map(t => t.title + ' ' + t.step + ' ' + (t.hint || ''))].join(' ');
      R.outwardlyOnlyTheOldKing = !/hanged king/i.test(all)
        ? 'and nothing a player reads calls him anything but the old king'
        : '!! "HANGED KING" IS IN PLAYER-FACING TEXT';
    }
    return R;
  });

  const bad = Object.values(out).filter(v => typeof v === 'string' && v.startsWith('!!'));
  for (const [k, v] of Object.entries(out)) console.log('  ' + k.padEnd(32) + ' ' + v);
  for (const e of errs) console.log('  ' + e);
  console.log('');
  const which = Object.keys(out).filter(k => typeof out[k] === 'string' && out[k].startsWith('!!'));
  console.log(bad.length || errs.length ? `*** THE OLD KING IS WRONG (${bad.length + errs.length}): ${[...which, ...errs.map(() => 'pageerror')].join(', ')} ***`
                                        : 'THE OLD KING HANGS, COMES DOWN, AND GOES DOWN');
  await b.close();
  process.exit(bad.length || errs.length ? 1 : 0);
})();
